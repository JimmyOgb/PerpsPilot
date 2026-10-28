import type { Address } from "viem";
import type { CancellationRecord, CancellationStatus } from "./types.js";
import type { ExchangeOrderSnapshot } from "./OrderReconciler.js";

export interface CancelRequest {
  poolAddress: Address;
  orderId: string;
  account: Address;
  marketSymbol: string;
}

export class OrderCanceller {
  /**
   * Evaluates and simulates an order cancellation workflow against current authoritative state.
   * Prevents canceling already-filled orders and detects fill races.
   */
  public static evaluateCancellation(
    request: CancelRequest,
    currentOrder?: ExchangeOrderSnapshot | null,
    mockTxConfirmed?: boolean,
  ): CancellationRecord {
    const now = Date.now();

    // 1. Order missing from state
    if (!currentOrder) {
      return {
        orderId: request.orderId,
        poolAddress: request.poolAddress,
        account: request.account,
        status: "UNKNOWN",
        reason: `Order ${request.orderId} not found in authoritative order book or indexer`,
        timestampMs: now,
      };
    }

    // 2. Check if already filled
    if (currentOrder.status === "closed" && currentOrder.remaining === 0) {
      return {
        orderId: request.orderId,
        poolAddress: request.poolAddress,
        account: request.account,
        status: "ALREADY_FILLED",
        reason: `Order ${request.orderId} is already fully filled (${currentOrder.filled}/${currentOrder.amount}). Cannot be cancelled.`,
        timestampMs: now,
      };
    }

    // 3. Check if already cancelled
    if (currentOrder.status === "canceled") {
      return {
        orderId: request.orderId,
        poolAddress: request.poolAddress,
        account: request.account,
        status: "ALREADY_CANCELLED",
        reason: `Order ${request.orderId} was already cancelled previously.`,
        timestampMs: now,
      };
    }

    // 4. Order is resting or partially filled
    if (currentOrder.status === "open") {
      if (mockTxConfirmed) {
        return {
          orderId: request.orderId,
          poolAddress: request.poolAddress,
          account: request.account,
          status: "CANCELLED",
          reason: `Order ${request.orderId} successfully cancelled. Remaining: ${currentOrder.remaining}, Preserved fills: ${currentOrder.filled}.`,
          timestampMs: now,
        };
      }

      return {
        orderId: request.orderId,
        poolAddress: request.poolAddress,
        account: request.account,
        status: "CANCEL_REQUESTED",
        reason: `Cancellation requested for resting order ${request.orderId} on pool ${request.poolAddress}.`,
        timestampMs: now,
      };
    }

    return {
      orderId: request.orderId,
      poolAddress: request.poolAddress,
      account: request.account,
      status: "UNKNOWN",
      reason: `Order in unhandled state: ${currentOrder.status}`,
      timestampMs: now,
    };
  }

  /**
   * Detects a cancellation race condition where an order filled while cancellation was pending.
   */
  public static detectRaceCondition(
    preCancelSnapshot: ExchangeOrderSnapshot,
    postCancelSnapshot: ExchangeOrderSnapshot,
  ): boolean {
    // If it was open when cancellation was submitted, but settled as filled
    return (
      preCancelSnapshot.status === "open" &&
      postCancelSnapshot.status === "closed" &&
      postCancelSnapshot.filled > preCancelSnapshot.filled
    );
  }
}
