/**
 * PerpsPilot Market Precision & Decimal Handling
 * Enforces tick sizes, lot grids, minimum quantities, and base/quote decimal conversions.
 * Prices on dreamDEX perps are ALWAYS 18 decimals (USDso quote currency).
 * Quantities are ALWAYS in the base asset's native decimals.
 */

import { formatUnits, parseUnits } from "viem";
import type { PerpMarketInfo } from "./types.js";

export interface PrecisionValidationResult {
  valid: boolean;
  error?: string;
  alignedPrice?: bigint;
  alignedQuantity?: bigint;
}

/**
 * Aligns a raw price down to the nearest multiple of tickSize.
 */
export function alignPrice(price: bigint, tickSize: bigint): bigint {
  if (tickSize <= 0n) return price;
  return (price / tickSize) * tickSize;
}

/**
 * Aligns a raw quantity down to the nearest multiple of lotSize.
 */
export function alignQuantity(quantity: bigint, lotSize: bigint): bigint {
  if (lotSize <= 0n) return quantity;
  return (quantity / lotSize) * lotSize;
}

/**
 * Validates price, quantity, and minimum constraints against market parameters.
 * Fails closed if any parameter violates grid precision or minimum order requirements.
 */
export function validateOrderPrecision(
  price: bigint,
  quantity: bigint,
  market: PerpMarketInfo,
): PrecisionValidationResult {
  if (price <= 0n) {
    return { valid: false, error: "Price must be strictly greater than 0" };
  }

  if (quantity <= 0n) {
    return { valid: false, error: "Quantity must be strictly greater than 0" };
  }

  if (market.tickSize > 0n && price % market.tickSize !== 0n) {
    const expectedTick = formatUnits(market.tickSize, market.quoteDecimals);
    return {
      valid: false,
      error: `Price ${price.toString()} is not aligned to tick size ${market.tickSize.toString()} (${expectedTick} USDso)`,
      alignedPrice: alignPrice(price, market.tickSize),
    };
  }

  if (market.lotSize > 0n && quantity % market.lotSize !== 0n) {
    const expectedLot = formatUnits(market.lotSize, market.baseDecimals);
    return {
      valid: false,
      error: `Quantity ${quantity.toString()} is not aligned to lot size ${market.lotSize.toString()} (${expectedLot} ${market.baseSymbol})`,
      alignedQuantity: alignQuantity(quantity, market.lotSize),
    };
  }

  if (quantity < market.minQuantity) {
    const minHuman = formatUnits(market.minQuantity, market.baseDecimals);
    const qtyHuman = formatUnits(quantity, market.baseDecimals);
    return {
      valid: false,
      error: `Quantity ${qtyHuman} ${market.baseSymbol} is below minimum allowed order size ${minHuman} ${market.baseSymbol}`,
    };
  }

  return { valid: true };
}

/**
 * Calculates order notional in USDso (18 decimals):
 * Notional = (Price_18dp * Quantity_baseDecimals) / 10^baseDecimals
 */
export function calculateNotionalUsdso(priceX18: bigint, quantityBase: bigint, baseDecimals: number): bigint {
  if (priceX18 <= 0n || quantityBase <= 0n) return 0n;
  const scale = 10n ** BigInt(baseDecimals);
  return (priceX18 * quantityBase) / scale;
}

/**
 * Computes raw base quantity for a target USDso notional, aligned to lotSize:
 * Quantity_baseDecimals = (Notional_18dp * 10^baseDecimals) / Price_18dp
 */
export function calculateQuantityForNotional(
  notionalUsdsoX18: bigint,
  priceX18: bigint,
  market: PerpMarketInfo,
): { quantity: bigint; valid: boolean; reason?: string } {
  if (notionalUsdsoX18 <= 0n || priceX18 <= 0n) {
    return { quantity: 0n, valid: false, reason: "Notional and price must be greater than zero" };
  }

  const scale = 10n ** BigInt(market.baseDecimals);
  const rawWanted = (notionalUsdsoX18 * scale) / priceX18;
  const aligned = alignQuantity(rawWanted, market.lotSize);

  if (aligned === 0n) {
    const minReq = formatUnits(market.minQuantity, market.baseDecimals);
    return {
      quantity: 0n,
      valid: false,
      reason: `Calculated quantity rounds down to 0 lots. Market minimum is ${minReq} ${market.baseSymbol}`,
    };
  }

  if (aligned < market.minQuantity) {
    const minReq = formatUnits(market.minQuantity, market.baseDecimals);
    const got = formatUnits(aligned, market.baseDecimals);
    return {
      quantity: aligned,
      valid: false,
      reason: `Calculated quantity (${got} ${market.baseSymbol}) is below minQuantity (${minReq} ${market.baseSymbol})`,
    };
  }

  return { quantity: aligned, valid: true };
}

/**
 * Converts human readable base quantity (e.g. "0.05" ETH) to raw base units.
 */
export function parseBaseQuantity(amountStr: string, baseDecimals: number): bigint {
  return parseUnits(amountStr, baseDecimals);
}

/**
 * Formats raw base units to human readable decimal string.
 */
export function formatBaseQuantity(amount: bigint, baseDecimals: number): string {
  return formatUnits(amount, baseDecimals);
}

/**
 * Converts human readable price (e.g. "2450.50" USD) to raw 18dp quote units.
 */
export function parseQuotePrice(priceStr: string): bigint {
  return parseUnits(priceStr, 18);
}

/**
 * Formats raw quote price (18dp) to human readable string.
 */
export function formatQuotePrice(price: bigint): string {
  return formatUnits(price, 18);
}
