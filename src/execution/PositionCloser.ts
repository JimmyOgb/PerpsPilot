import type { Address } from "viem";
import type { PositionClosePlan, OrderSide } from "./types.js";
import type { PositionSnapshot } from "./OrderReconciler.js";

export class PositionCloser {
  /**
   * Constructs a conservative, verified position-close plan.
   * Explicitly documents that direct dreamDEX CLOB orders lack a contract-level reduceOnly flag,
   * enforcing strict client-side bounds to prevent position reversal.
   */
  public static createClosePlan(params: {
    marketSymbol: string;
    poolAddress: Address;
    position?: PositionSnapshot | null;
    requestedCloseQuantity?: number;
  }): PositionClosePlan {
    const now = Date.now();
    const isNativeReduceOnlySupported = false; // Directly verified: PerpPool ABI lacks reduceOnly parameter

    if (!params.position || params.position.size <= 0) {
      return {
        marketSymbol: params.marketSymbol,
        poolAddress: params.poolAddress,
        currentPositionSize: 0,
        currentSide: "long",
        closeSide: "SELL_SHORT",
        closeQuantity: 0,
        isNativeReduceOnlySupported,
        clientGuardEnforced: true,
        valid: false,
        reason: "No active position found to close for this market",
        createdAtMs: now,
      };
    }

    const currentSide = params.position.side;
    // Opposite side is required to close
    const closeSide: OrderSide = currentSide === "long" ? "SELL_SHORT" : "BUY_LONG";

    // Max close quantity is bounded strictly by current holding
    const currentSize = params.position.size;
    const requested = params.requestedCloseQuantity ?? currentSize;

    if (requested <= 0) {
      return {
        marketSymbol: params.marketSymbol,
        poolAddress: params.poolAddress,
        currentPositionSize: currentSize,
        currentSide,
        closeSide,
        closeQuantity: 0,
        isNativeReduceOnlySupported,
        clientGuardEnforced: true,
        valid: false,
        reason: "Close quantity must be greater than zero",
        createdAtMs: now,
      };
    }

    // Safety constraint: requested close quantity must NEVER exceed current position size
    // to prevent accidental reverse-position opening.
    if (requested > currentSize + 1e-7) {
      return {
        marketSymbol: params.marketSymbol,
        poolAddress: params.poolAddress,
        currentPositionSize: currentSize,
        currentSide,
        closeSide,
        closeQuantity: currentSize, // Cap to exact current position
        isNativeReduceOnlySupported,
        clientGuardEnforced: true,
        valid: false,
        reason: `Requested close size (${requested}) exceeds active position (${currentSize}). Clipped to prevent accidental position reversal.`,
        createdAtMs: now,
      };
    }

    const finalCloseQty = Math.min(requested, currentSize);

    return {
      marketSymbol: params.marketSymbol,
      poolAddress: params.poolAddress,
      currentPositionSize: currentSize,
      currentSide,
      closeSide,
      closeQuantity: finalCloseQty,
      isNativeReduceOnlySupported,
      clientGuardEnforced: true,
      valid: true,
      createdAtMs: now,
    };
  }

  /**
   * Verifies whether an authoritative post-trade position confirms that the position is genuinely closed.
   */
  public static verifyPositionClosed(
    postTradePosition?: PositionSnapshot | null,
    lotSize = 0.0001,
  ): { isClosed: boolean; residualSize: number; details: string } {
    if (!postTradePosition || postTradePosition.size === 0) {
      return {
        isClosed: true,
        residualSize: 0,
        details: "Authoritative verification confirms 0 residual position on dreamDEX.",
      };
    }

    if (postTradePosition.size < lotSize) {
      return {
        isClosed: true,
        residualSize: postTradePosition.size,
        details: `Sub-lot dust position (${postTradePosition.size} < lot ${lotSize}). Effectively closed within protocol precision.`,
      };
    }

    return {
      isClosed: false,
      residualSize: postTradePosition.size,
      details: `Position remains partially open with residual exposure of ${postTradePosition.size} ${postTradePosition.side}. Full closure unverified.`,
    };
  }
}
