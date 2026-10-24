/**
 * PerpsPilot Risk Validation & SDK Pre-Flight Checks
 * Implements safe, read-only pre-flight checks against the official SomniaMarkets SDK:
 * 1. tryGetHealthSnapshot (Oracle freshness & priceability)
 * 2. getMaxPerpOrderSize (Authoritative monotone binary search margin & cap constraints)
 * 3. MarginBank cross-margin account health inspection
 *
 * NOTE: Never substitutes local approximations for authoritative SDK on-chain margin rules!
 */

import { parseAbi, type Address, type PublicClient } from "viem";
import type { SomniaMarkets } from "@somnia-chain/markets-sdk";
import type { PerpMarketInfo } from "../markets/types.js";

// Canonical ABI matching @somnia-chain/markets-sdk readsAbi
const PERP_POOL_HEALTH_ABI = parseAbi([
  "function tryGetHealthSnapshot() view returns (bool ok, (uint256 oneBase, uint256 markPrice, int256 projectedCumulativeFunding, uint256 effectiveIMFBps, uint256 maintenanceMarginBps, uint256 closeOutMarginBps) snapshot)",
  "function getOrderBookParameters() view returns ((uint256 tickSize, uint256 minQuantity, uint256 lotSize))",
  "function getPerpPoolParameters() view returns ((uint256 initialMarginBps, uint256 maintenanceMarginBps, uint256 closeOutMarginBps, uint256 maxOpenInterest, uint256 maxPositionSize, uint256 takerFeeBpsTimes1k, int256 makerFeeBpsTimes1k, uint256 insuranceFundShareBps))",
]);

const MARGIN_BANK_READ_ABI = parseAbi([
  "function getAccountState(address account) view returns ((int256 unlockedCollateralBalance, uint256 lockedCollateral, address[] activePerpPools))",
  "function getAccountHealth(address account) view returns (int256 equity, uint256 imReq, uint256 mmReq, uint256 cmReq)",
  "function getMarginStatus(address account) view returns (uint8)",
  "function getWithdrawableCollateral(address account) view returns (uint256)",
]);

export interface MarketHealthSnapshot {
  priceable: boolean;
  markPrice?: bigint;
  projectedFunding?: bigint;
  effectiveIMFBps?: bigint;
  blockNumber: bigint;
  reason?: string;
}

/**
 * Checks oracle health and priceability for a given perp pool.
 * If tryGetHealthSnapshot returns ok=false, the market has a stale mark or oracle outage.
 */
export async function checkMarketHealth(poolAddress: Address, client: PublicClient): Promise<MarketHealthSnapshot> {
  const blockNumber = await client.getBlockNumber();

  try {
    const [ok, snapshot] = (await client.readContract({
      address: poolAddress,
      abi: PERP_POOL_HEALTH_ABI,
      functionName: "tryGetHealthSnapshot",
      blockNumber,
    })) as unknown as [boolean, { oneBase: bigint; markPrice: bigint; projectedCumulativeFunding: bigint; effectiveIMFBps: bigint }];

    if (!ok) {
      return {
        priceable: false,
        blockNumber,
        reason: "PerpPool.tryGetHealthSnapshot returned ok=false: Oracle mark price is stale or unpriceable",
      };
    }

    return {
      priceable: true,
      markPrice: snapshot.markPrice,
      projectedFunding: snapshot.projectedCumulativeFunding,
      effectiveIMFBps: snapshot.effectiveIMFBps,
      blockNumber,
    };
  } catch (error) {
    return {
      priceable: false,
      blockNumber,
      reason: `Failed to read PerpPool health snapshot: ${(error as Error).message}`,
    };
  }
}

export interface RiskSizingResult {
  allowed: boolean;
  maxQuantity: bigint;
  requestedQuantity: bigint;
  effectiveQuantity: bigint;
  limitedBy?: string;
  reason?: string;
  effectiveImfBps?: bigint;
}

export interface SizingQuery {
  market: PerpMarketInfo;
  account: Address;
  isBid: boolean;
  price: bigint;
  requestedQuantity: bigint;
  autoPull?: boolean;
}

/**
 * Uses the official SDK client.getMaxPerpOrderSize to determine the maximum
 * allowable order size adhering to position caps, adverse mark gaps, and IM gates.
 */
export async function queryAuthoritativeMaxOrderSize(
  exchange: SomniaMarkets,
  query: SizingQuery,
): Promise<RiskSizingResult> {
  const { market, account, isBid, price, requestedQuantity } = query;

  if (price <= 0n) {
    return {
      allowed: false,
      maxQuantity: 0n,
      requestedQuantity,
      effectiveQuantity: 0n,
      reason: "Price must be strictly positive",
    };
  }

  // Authoritative SDK call
  const maxResult = await exchange.client.getMaxPerpOrderSize({
    pool: market.poolAddress,
    marginBank: market.marginBank,
    account,
    isBid,
    price,
    autoPull: query.autoPull ?? false,
  });

  if (!maxResult.priceable) {
    return {
      allowed: false,
      maxQuantity: 0n,
      requestedQuantity,
      effectiveQuantity: 0n,
      reason: "Market is unpriceable right now (stale mark price from oracle)",
    };
  }

  if (!maxResult.placeable || !maxResult.maxQuantity || maxResult.maxQuantity === 0n) {
    return {
      allowed: false,
      maxQuantity: 0n,
      requestedQuantity,
      effectiveQuantity: 0n,
      limitedBy: maxResult.limitedBy,
      reason: explainLimitingConstraint(maxResult.limitedBy),
    };
  }

  const maxQty = maxResult.maxQuantity;
  const effectiveQuantity = requestedQuantity <= maxQty ? requestedQuantity : maxQty;
  const allowed = effectiveQuantity >= market.minQuantity;

  return {
    allowed,
    maxQuantity: maxQty,
    requestedQuantity,
    effectiveQuantity,
    limitedBy: maxResult.limitedBy,
    effectiveImfBps: maxResult.effectiveImfBps,
    reason: allowed
      ? undefined
      : `Allowed size (${effectiveQuantity}) is below market minQuantity (${market.minQuantity})`,
  };
}

/**
 * Translates SDK constraint codes into human-actionable explanations.
 */
export function explainLimitingConstraint(limitedBy?: string): string {
  switch (limitedBy) {
    case "voucherBlocked":
      return "Account is using a competition voucher credit that does not cover this market.";
    case "restricted":
      return "Market is in ReduceOnly mode; position increases are restricted on-chain.";
    case "isolated":
      return "Isolated margin constraint: account holds a position in a different market.";
    case "walletBalance":
      return "Insufficient USDso in wallet to cover required auto-pull margin deposit.";
    case "walletAllowance":
      return "USDso wallet allowance to MarginBank is insufficient for auto-pull top-up.";
    case "mainFundingBlocked":
      return "Linked wallet funding from main account is blocked by outstanding claims.";
    case "insufficientMargin":
      return "Account unlocked collateral in MarginBank cannot support requested initial margin.";
    default:
      return `Order rejected by risk engine: ${limitedBy ?? "exceeds account margin or position cap"}`;
  }
}

export interface MarginAccountHealth {
  unlockedCollateral: bigint;
  lockedCollateral: bigint;
  equity: bigint;
  withdrawableCollateral: bigint;
  imReq: bigint;
  mmReq: bigint;
  cmReq: bigint;
  marginStatus: number;
  statusLabel: "Healthy" | "MarginCall" | "PartialLiquidation" | "CloseOut";
  activePoolsCount: number;
  blockNumber: bigint;
}

const STATUS_LABELS: ("Healthy" | "MarginCall" | "PartialLiquidation" | "CloseOut")[] = [
  "Healthy",
  "MarginCall",
  "PartialLiquidation",
  "CloseOut",
];

/**
 * Reads an account's cross-margin state directly from MarginBank.
 */
export async function readMarginAccountHealth(
  marginBank: Address,
  account: Address,
  client: PublicClient,
): Promise<MarginAccountHealth> {
  const blockNumber = await client.getBlockNumber();

  const [state, health, statusRaw, withdrawable] = await Promise.all([
    client.readContract({
      address: marginBank,
      abi: MARGIN_BANK_READ_ABI,
      functionName: "getAccountState",
      args: [account],
      blockNumber,
    }) as Promise<{ unlockedCollateralBalance: bigint; lockedCollateral: bigint; activePerpPools: readonly Address[] }>,
    client.readContract({
      address: marginBank,
      abi: MARGIN_BANK_READ_ABI,
      functionName: "getAccountHealth",
      args: [account],
      blockNumber,
    }) as Promise<[bigint, bigint, bigint, bigint]>,
    client.readContract({
      address: marginBank,
      abi: MARGIN_BANK_READ_ABI,
      functionName: "getMarginStatus",
      args: [account],
      blockNumber,
    }) as Promise<number>,
    client.readContract({
      address: marginBank,
      abi: MARGIN_BANK_READ_ABI,
      functionName: "getWithdrawableCollateral",
      args: [account],
      blockNumber,
    }) as Promise<bigint>,
  ]);

  const [unlocked, locked, activePools] = [
    state.unlockedCollateralBalance,
    state.lockedCollateral,
    state.activePerpPools,
  ];
  const [equity, imReq, mmReq, cmReq] = health;
  const statusIdx = Number(statusRaw);

  return {
    unlockedCollateral: unlocked,
    lockedCollateral: locked,
    equity,
    withdrawableCollateral: withdrawable,
    imReq,
    mmReq,
    cmReq,
    marginStatus: statusIdx,
    statusLabel: STATUS_LABELS[statusIdx] ?? "Healthy",
    activePoolsCount: activePools.length,
    blockNumber,
  };
}
