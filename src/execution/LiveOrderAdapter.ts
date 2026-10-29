import {
  parseAbi,
  encodeFunctionData,
  toFunctionSelector,
  type Address,
  type Hex,
  type WalletClient,
  type PublicClient,
} from "viem";
import { decodePlaceOrder, type DecodedPlacement } from "@somnia-chain/markets-sdk";
import { EXPECTED_HIDEKI_CHAIN_ID } from "../config/constants.js";
import { ExecutionGuard } from "./ExecutionGuard.js";
import { OrderPlanner } from "./OrderPlanner.js";
import { ExecutionGuardBlockedError } from "./OrderExecutor.js";
import type {
  OrderPlan,
  OrderExecutionType,
  TransactionReceiptRecord,
  ReconciliationRecord,
  OnchainOrderDetails,
  OnchainPositionDetails,
} from "./types.js";
import { ReceiptVerifier } from "./ReceiptVerifier.js";
import { OrderReconciler, type ExchangeOrderSnapshot } from "./OrderReconciler.js";

/**
 * Official verified write ABI for PerpPool on Somnia Hideki Testnet.
 * Sourced directly from @somnia-chain/markets-sdk TradeAbi.perpPoolWriteAbi.
 * Notice: userData is strictly uint64 and builderFeeBpsTimes1k is strictly uint96.
 */
export const PERP_POOL_PLACE_ORDER_ABI = parseAbi([
  "function placeOrder(bool isBid, uint64 userData, uint256 price, uint256 quantity, uint64 expireTimestampNs, uint8 orderType, uint8 selfMatchingOption, address builder, uint96 builderFeeBpsTimes1k)",
  "function cancelOrder(uint128 orderId)",
  "function updateFunding()",
  "function marginBank() view returns (address)",
]);

export const POOL_ORDER_READ_ABI = parseAbi([
  "function getOrder(uint128 orderId) view returns ((uint128 orderId, bool isBid, address owner, uint64 userData, uint256 price, uint256 fullQuantity, uint256 quantityRemaining, uint64 expireTimestampNs))",
]);

export const MARGIN_BANK_POSITION_READ_ABI = parseAbi([
  "function getPosition(address account, address perpPool) view returns ((int128 size, uint128 avgEntryPrice, int256 entryFundingIndex, uint64 lastUpdatedTimestampNs))",
]);

/**
 * Verified OrderBook OrderType enum matching SDK Trade.ORDER_TYPE.
 */
export const CONTRACT_ORDER_TYPES = {
  LIMIT: 0,
  FILL_OR_KILL: 1,
  MARKET: 2,
  POST_ONLY: 3,
} as const;

export const CONTRACT_SELF_MATCHING = {
  CANCEL_TAKER: 0,
  CANCEL_MAKER: 1,
} as const;

/** 50 years in seconds: matches DreamDEX SDK writer.js farFutureNs() */
export const DEFAULT_GTC_OFFSET_SECONDS = 50 * 365 * 24 * 3600;
export const MAX_UINT64 = (1n << 64n) - 1n; // 18446744073709551615n

/**
 * Calculates a verified Good 'Til Cancelled (GTC) expiry timestamp in nanoseconds,
 * matching the canonical implementation in @somnia-chain/markets-sdk Writer.farFutureNs().
 *
 * Note on DreamDEX Matching Engine:
 * Passing expireTimestampNs = 0n is rejected by the matcher at placement (store.js:142).
 * Valid GTC orders require an explicit future timestamp in nanoseconds.
 */
export function calculateGtcExpiryNs(
  nowMs: number = Date.now(),
  offsetSeconds: number = DEFAULT_GTC_OFFSET_SECONDS,
): bigint {
  if (nowMs <= 0) {
    throw new Error("[calculateGtcExpiryNs] nowMs must be a positive unix timestamp in milliseconds");
  }
  const nowSec = Math.floor(nowMs / 1000);
  const expirySec = BigInt(nowSec + offsetSeconds);
  const expiryNs = expirySec * 1_000_000_000n;

  if (expiryNs > MAX_UINT64) {
    throw new Error(`[calculateGtcExpiryNs] Expiry timestamp ${expiryNs} overflows uint64 range`);
  }
  return expiryNs;
}

/**
 * Validates that an expiry timestamp conforms to dreamDEX matching engine rules:
 * - Must not be zero (zero is rejected by matcher at placement)
 * - Must not be negative
 * - Must not exceed uint64 range
 * - Must be strictly in the future relative to current wall-clock / chain time
 */
export function validateExpiryTimestampNs(
  expiryNs: bigint,
  nowMs: number = Date.now(),
): { valid: boolean; reason?: string } {
  if (expiryNs === 0n) {
    return {
      valid: false,
      reason: "Zero expiry (0n) is rejected by dreamDEX matcher at placement; GTC requires a future expiry",
    };
  }
  if (expiryNs < 0n) {
    return { valid: false, reason: "Expiry timestamp cannot be negative" };
  }
  if (expiryNs > MAX_UINT64) {
    return { valid: false, reason: `Expiry timestamp exceeds uint64 max (${MAX_UINT64})` };
  }
  const nowNs = BigInt(nowMs) * 1_000_000n;
  if (expiryNs <= nowNs) {
    return {
      valid: false,
      reason: `Expiry timestamp (${expiryNs}) is in the past (current time: ${nowNs} ns)`,
    };
  }
  return { valid: true };
}

export interface UnsignedOrderCall {
  chainId: number;
  to: Address;
  data: Hex;
  functionSelector: Hex;
  description: string;
  args: [
    boolean, // isBid
    bigint,  // userData (uint64)
    bigint,  // price (uint256)
    bigint,  // quantity (uint256)
    bigint,  // expireTimestampNs (uint64)
    number,  // orderType (uint8)
    number,  // selfMatchingOption (uint8)
    Address, // builder (address)
    bigint,  // builderFeeBpsTimes1k (uint96)
  ];
}

export interface LiveAdapterOptions {
  guard?: ExecutionGuard;
  receiptVerifier?: ReceiptVerifier;
}

export class LiveOrderAdapter {
  private guard: ExecutionGuard;
  private receiptVerifier: ReceiptVerifier;

  constructor(options: LiveAdapterOptions = {}) {
    this.guard = options.guard || new ExecutionGuard({ dryRun: true });
    this.receiptVerifier = options.receiptVerifier || new ReceiptVerifier();
  }

  /**
   * Translates application order type string to contract enum.
   */
  public static mapOrderTypeToContract(orderType: OrderExecutionType): number {
    switch (orderType) {
      case "LIMIT":
        return CONTRACT_ORDER_TYPES.LIMIT;
      case "POST_ONLY":
        return CONTRACT_ORDER_TYPES.POST_ONLY;
      case "MARKET":
        return CONTRACT_ORDER_TYPES.MARKET;
      case "FILL_OR_KILL":
        return CONTRACT_ORDER_TYPES.FILL_OR_KILL;
      default:
        return CONTRACT_ORDER_TYPES.LIMIT;
    }
  }

  /**
   * Phase 1: Preparation & Call Construction.
   * Constructs and validates the exact EVM calldata for PerpPool.placeOrder without signing or broadcasting.
   */
  public prepareOrderCall(plan: OrderPlan): UnsignedOrderCall {
    // 1. Validate chain
    if (plan.chainId !== EXPECTED_HIDEKI_CHAIN_ID) {
      throw new Error(`[LiveOrderAdapter] Invalid chain ID ${plan.chainId}. Expected Hideki ${EXPECTED_HIDEKI_CHAIN_ID}.`);
    }

    // 2. Validate parameters
    if (plan.priceRaw <= 0n || plan.quantityRaw <= 0n) {
      throw new Error("[LiveOrderAdapter] Price and quantity must be strictly greater than 0");
    }

    // Strict side-encoding validation: reject all unsupported or lowercase variants
    let isBid: boolean;
    if (plan.side === "BUY_LONG") {
      isBid = true;
    } else if (plan.side === "SELL_SHORT") {
      isBid = false;
    } else {
      throw new Error(
        `[LiveOrderAdapter] Invalid or unsupported order side: '${plan.side}'. Side must strictly be 'BUY_LONG' or 'SELL_SHORT'.`,
      );
    }
    const userData = 0n; // uint64: default MM bookkeeping
    const price = plan.priceRaw; // uint256: 18 decimals USDso quote
    const quantity = plan.quantityRaw; // uint256: base decimals

    // Validate or compute non-zero GTC expiry timestamp in nanoseconds
    let expireTimestampNs: bigint;
    if (plan.expireTimestampNs !== undefined) {
      if (plan.expireTimestampNs === 0n) {
        throw new Error("[LiveOrderAdapter] Zero expiry (0n) is rejected by dreamDEX matcher at placement; GTC requires a future expiry");
      }
      const validation = validateExpiryTimestampNs(plan.expireTimestampNs, plan.createdAtMs);
      if (!validation.valid) {
        throw new Error(`[LiveOrderAdapter] Invalid expiry timestamp: ${validation.reason}`);
      }
      expireTimestampNs = plan.expireTimestampNs;
    } else {
      // Default GTC: 50 years in future in nanoseconds matching SDK Writer.farFutureNs()
      expireTimestampNs = calculateGtcExpiryNs(plan.createdAtMs || Date.now());
    }

    const orderType = LiveOrderAdapter.mapOrderTypeToContract(plan.orderType);
    const selfMatchingOption = CONTRACT_SELF_MATCHING.CANCEL_TAKER;
    const builder = "0x0000000000000000000000000000000000000000" as Address;
    const builderFeeBpsTimes1k = 0n; // uint96

    const args: UnsignedOrderCall["args"] = [
      isBid,
      userData,
      price,
      quantity,
      expireTimestampNs,
      orderType,
      selfMatchingOption,
      builder,
      builderFeeBpsTimes1k,
    ];

    const data = encodeFunctionData({
      abi: PERP_POOL_PLACE_ORDER_ABI,
      functionName: "placeOrder",
      args,
    });

    const functionSelector = toFunctionSelector(PERP_POOL_PLACE_ORDER_ABI[0]) as Hex;

    return {
      chainId: plan.chainId,
      to: plan.poolAddress,
      data,
      functionSelector,
      description: `Place perp ${isBid ? "long" : "short"} order on pool ${plan.poolAddress}`,
      args,
    };
  }

  /**
   * Phase 2: Authorization & Execution Guard Assertion.
   * Fails closed if DRY_RUN=true, plan is expired, or digest mismatch occurs.
   */
  public assertLiveExecutionAllowed(
    plan: OrderPlan,
    connectedWallet: Address,
    isUserApproved: boolean,
    approvedDigest?: string,
  ): void {
    const evaluation = this.guard.evaluate({
      plan,
      connectedWallet,
      isUserApproved,
      approvedDigest,
    });

    if (!evaluation.allowed) {
      throw new ExecutionGuardBlockedError(
        evaluation.reason || "Execution guard rejected live order dispatch",
        evaluation,
      );
    }
  }

  /**
   * Phase 3: Transaction Broadcast.
   * Gated behind assertLiveExecutionAllowed.
   * Under DRY_RUN=true (Stage F.3), execution is permanently blocked.
   */
  public async broadcastOrder(
    plan: OrderPlan,
    connectedWallet: Address,
    isUserApproved: boolean,
    approvedDigest?: string,
    walletClient?: WalletClient,
  ): Promise<`0x${string}`> {
    // 1. Strict guard evaluation
    this.assertLiveExecutionAllowed(plan, connectedWallet, isUserApproved, approvedDigest);

    // 2. Strict guard check: fail closed if dry-run guard is active
    if (this.guard.isDryRun()) {
      throw new Error("[LiveOrderAdapter] Live transaction broadcast is blocked by DRY_RUN=true.");
    }

    if (!walletClient) {
      throw new Error("[LiveOrderAdapter] No authorized WalletClient provided for transaction broadcast.");
    }

    const unsignedCall = this.prepareOrderCall(plan);

    // Live broadcast entry point for future authorized stage
    const hash = await walletClient.sendTransaction({
      account: connectedWallet,
      to: unsignedCall.to,
      data: unsignedCall.data,
      chain: undefined,
    });

    return hash;
  }

  /**
   * Phase 4: Receipt Waiting & Settlement Reconciliation.
   */
  public async reconcileSubmittedOrder(
    correlationId: string,
    plan: OrderPlan,
    txHash: `0x${string}`,
    client?: PublicClient,
    mockExchangeOrder?: ExchangeOrderSnapshot,
  ): Promise<{ receipt: TransactionReceiptRecord; reconciliation: ReconciliationRecord }> {
    const receipt = await this.receiptVerifier.verifyTransaction(txHash, client);
    const reconciliation = OrderReconciler.reconcile({
      correlationId,
      plan,
      receipt,
      exchangeOrder: mockExchangeOrder,
    });

    return { receipt, reconciliation };
  }

  public getGuard(): ExecutionGuard {
    return this.guard;
  }

  /**
   * Decodes order placement receipt logs using the official SDK decodePlaceOrder.
   * Extracts resting orderId and all OrderFilled logs.
   */
  public static decodePlacementReceipt(receipt: any, poolAddress?: Address): DecodedPlacement {
    return decodePlaceOrder(receipt, poolAddress);
  }

  /**
   * Authoritatively queries the active order record from the live CLOB pool contract.
   * Returns null if the order does not exist, has been filled, or was cancelled.
   */
  public static async getOrderOnchain(
    poolAddress: Address,
    orderId: bigint,
    client: PublicClient,
  ): Promise<OnchainOrderDetails | null> {
    try {
      const order = await client.readContract({
        address: poolAddress,
        abi: POOL_ORDER_READ_ABI,
        functionName: "getOrder",
        args: [orderId],
      });
      return {
        orderId: order.orderId,
        isBid: order.isBid,
        owner: order.owner,
        userData: order.userData,
        price: order.price,
        fullQuantity: order.fullQuantity,
        quantityRemaining: order.quantityRemaining,
        expireTimestampNs: order.expireTimestampNs,
      };
    } catch {
      return null;
    }
  }

  /**
   * Authoritatively queries an account's perpetual position directly from MarginBank.
   */
  public static async getPositionOnchain(
    marginBankAddress: Address,
    account: Address,
    poolAddress: Address,
    client: PublicClient,
  ): Promise<OnchainPositionDetails | null> {
    try {
      const pos = await client.readContract({
        address: marginBankAddress,
        abi: MARGIN_BANK_POSITION_READ_ABI,
        functionName: "getPosition",
        args: [account, poolAddress],
      });
      return {
        size: BigInt(pos.size),
        avgEntryPrice: BigInt(pos.avgEntryPrice),
        entryFundingIndex: BigInt(pos.entryFundingIndex),
        lastUpdatedTimestampNs: BigInt(pos.lastUpdatedTimestampNs),
      };
    } catch {
      return null;
    }
  }
}
