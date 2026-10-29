import { sha256, toHex, type Address } from "viem";
import type { PerpMarketInfo } from "../markets/types.js";
import { EXPECTED_HIDEKI_CHAIN_ID } from "../config/constants.js";
import { calculateGtcExpiryNs } from "./LiveOrderAdapter.js";
import {
  alignPrice,
  alignQuantity,
  formatQuotePrice,
  formatBaseQuantity,
  validateOrderPrecision,
} from "../markets/precision.js";
import type {
  OrderPlan,
  OrderSide,
  OrderExecutionType,
  PlanValidationResult,
} from "./types.js";

export interface CreateOrderPlanParams {
  chainId?: number;
  walletAddress: Address;
  market: PerpMarketInfo;
  side: OrderSide;
  orderType: OrderExecutionType;
  price: number;
  quantity: number;
  leverage: number;
  clientNonce?: string;
  ttlMs?: number;
}

export class OrderPlanner {
  /**
   * Generates a deterministic SHA-256 digest of the canonical order plan parameters.
   * Any change to price, size, market, side, address, or nonce invalidates the digest.
   */
  public static computePlanDigest(params: {
    chainId: number;
    walletAddress: string;
    marketSymbol: string;
    poolAddress: string;
    side: string;
    orderType: string;
    price: number;
    quantity: number;
    leverage: number;
    clientNonce: string;
  }): string {
    const canonical = JSON.stringify({
      chainId: params.chainId,
      walletAddress: params.walletAddress.toLowerCase(),
      marketSymbol: params.marketSymbol.toUpperCase(),
      poolAddress: params.poolAddress.toLowerCase(),
      side: params.side,
      orderType: params.orderType,
      price: Number(params.price.toFixed(6)),
      quantity: Number(params.quantity.toFixed(8)),
      leverage: Number(params.leverage.toFixed(2)),
      clientNonce: params.clientNonce,
    });

    return sha256(toHex(canonical));
  }

  /**
   * Verifies whether an order plan matches its cryptographic digest.
   */
  public static verifyPlanDigest(plan: OrderPlan, expectedDigest: string): boolean {
    const computed = OrderPlanner.computePlanDigest({
      chainId: plan.chainId,
      walletAddress: plan.walletAddress,
      marketSymbol: plan.marketSymbol,
      poolAddress: plan.poolAddress,
      side: plan.side,
      orderType: plan.orderType,
      price: plan.price,
      quantity: plan.quantity,
      leverage: plan.leverage,
      clientNonce: plan.clientNonce,
    });

    return computed.toLowerCase() === expectedDigest.toLowerCase();
  }

  /**
   * Constructs a fully quantized, validated, and signed deterministic OrderPlan.
   */
  public static createOrderPlan(params: CreateOrderPlanParams): OrderPlan {
    const chainId = params.chainId ?? EXPECTED_HIDEKI_CHAIN_ID;
    const now = Date.now();
    const ttlMs = params.ttlMs ?? 60_000; // 60s expiration window
    const clientNonce =
      params.clientNonce ||
      `0x${sha256(toHex(`${params.walletAddress}-${now}-${Math.random()}`)).slice(2, 18)}`;

    const errors: string[] = [];
    const warnings: string[] = [];

    // 0. Strict side validation (eliminate silent short hazard)
    if (params.side !== "BUY_LONG" && params.side !== "SELL_SHORT") {
      errors.push(
        `Invalid or unsupported order side '${params.side}'. Side must strictly be 'BUY_LONG' or 'SELL_SHORT'.`,
      );
    }

    // 1. Chain validation
    if (chainId !== EXPECTED_HIDEKI_CHAIN_ID) {
      errors.push(`Chain ID mismatch: expected ${EXPECTED_HIDEKI_CHAIN_ID}, got ${chainId}`);
    }

    // 2. Quantization to market grid
    const priceScale = 10n ** BigInt(params.market.quoteDecimals);
    const baseScale = 10n ** BigInt(params.market.baseDecimals);

    const priceRaw = BigInt(Math.round(params.price * 1e6)) * (priceScale / 1_000_000n);
    const alignedPriceRaw = alignPrice(priceRaw, params.market.tickSize);
    const alignedPriceHuman = parseFloat(formatQuotePrice(alignedPriceRaw));

    const qtyRaw = BigInt(Math.round(params.quantity * 1e8)) * (baseScale / 100_000_000n);
    const snappedQtyRaw = alignQuantity(qtyRaw, params.market.lotSize);
    const snappedQtyHuman = parseFloat(formatBaseQuantity(snappedQtyRaw, params.market.baseDecimals));

    // 3. Precision validation
    const precisionCheck = validateOrderPrecision(alignedPriceRaw, snappedQtyRaw, params.market);
    if (!precisionCheck.valid) {
      errors.push(precisionCheck.error || "Order violates tick/lot grid rules");
    }

    // 4. Minimum quantity check
    if (snappedQtyRaw < params.market.minQuantity) {
      errors.push(
        `Quantity (${snappedQtyHuman} ${params.market.baseSymbol}) is below market minimum (${formatBaseQuantity(params.market.minQuantity, params.market.baseDecimals)})`,
      );
    }

    // 5. Leverage limits
    const maxLev = params.market.maxLeverage > 0 ? params.market.maxLeverage : 20;
    if (params.leverage <= 0 || params.leverage > maxLev) {
      errors.push(`Leverage ${params.leverage}x exceeds market maximum of ${maxLev}x`);
    }

    // 6. Notional & Margin calculation
    const notionalUsd = alignedPriceHuman * snappedQtyHuman;
    if (notionalUsd > 20.0) {
      errors.push(`Order notional ($${notionalUsd.toFixed(2)}) exceeds testnet safety limit ($20.00 USDso)`);
    }

    // Protocol minimum floor (e.g. 500 bps = 5% for 20x max leverage)
    const protocolFloorBps = params.market.initialMarginBps > 0 ? params.market.initialMarginBps : 500;
    const protocolMinMarginUsd = Number(((notionalUsd * protocolFloorBps) / 10000).toFixed(6));

    // User configured target margin (e.g. 2x leverage = 50% margin)
    const targetMarginUsd = params.leverage > 0 ? Number((notionalUsd / params.leverage).toFixed(6)) : notionalUsd;

    // Conservative required margin is the configured target (or protocol floor if stricter)
    const marginRequiredUsd = Math.max(targetMarginUsd, protocolMinMarginUsd);
    const leverageSurchargeUsd = marginRequiredUsd > protocolMinMarginUsd ? Number((marginRequiredUsd - protocolMinMarginUsd).toFixed(6)) : 0;
    const estimatedFeeUsd = notionalUsd * 0.0005; // 5 bps taker fee
    const estimatedGasStt = 0.002; // Standard gas reserve on Somnia Hideki
    const expireTimestampNs = calculateGtcExpiryNs(now);

    // 7. Reduce-Only protocol status documentation
    // Direct PerpPool limit orders do NOT support native on-chain reduceOnly in the smart contract ABI.
    const nativeReduceOnlySupported = false;
    const reduceOnly = false; // By default an open-order plan is opening

    const validation: PlanValidationResult = {
      valid: errors.length === 0,
      errors,
      warnings,
    };

    const planDigest = OrderPlanner.computePlanDigest({
      chainId,
      walletAddress: params.walletAddress,
      marketSymbol: params.market.display || params.market.symbol,
      poolAddress: params.market.poolAddress,
      side: params.side,
      orderType: params.orderType,
      price: alignedPriceHuman,
      quantity: snappedQtyHuman,
      leverage: params.leverage,
      clientNonce,
    });

    return {
      chainId,
      walletAddress: params.walletAddress,
      marketSymbol: params.market.display || params.market.symbol,
      poolAddress: params.market.poolAddress,
      side: params.side,
      orderType: params.orderType,
      price: alignedPriceHuman,
      priceRaw: alignedPriceRaw,
      quantity: snappedQtyHuman,
      quantityRaw: snappedQtyRaw,
      leverage: params.leverage,
      notionalUsd,
      marginRequiredUsd,
      protocolMinMarginUsd,
      leverageSurchargeUsd,
      estimatedFeeUsd,
      estimatedGasStt,
      clientNonce,
      expireTimestampNs,
      createdAtMs: now,
      expiresAtMs: now + ttlMs,
      reduceOnly,
      nativeReduceOnlySupported,
      validation,
      planDigest,
    };
  }
}
