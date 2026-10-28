import type { Address } from "viem";
import type { OrderPlan, TransactionReceiptRecord, ReconciliationRecord, LifecycleState } from "./types.js";

export interface ExchangeOrderSnapshot {
  id: string;
  symbol: string;
  status: "open" | "closed" | "canceled" | "rejected" | "unknown";
  price: number;
  amount: number;
  filled: number;
  remaining: number;
  averageFillPrice?: number;
}

export interface PositionSnapshot {
  size: number;
  side: "long" | "short";
  avgEntryPrice: number;
  unrealizedPnl?: number;
}

export class OrderReconciler {
  /**
   * Compares the planned order, EVM transaction receipt, and authoritative exchange state
   * to determine true lifecycle status and detect any discrepancies.
   */
  public static reconcile(params: {
    correlationId: string;
    plan: OrderPlan;
    receipt?: TransactionReceiptRecord | null;
    exchangeOrder?: ExchangeOrderSnapshot | null;
    positionSnapshot?: PositionSnapshot | null;
  }): ReconciliationRecord {
    const { correlationId, plan, receipt, exchangeOrder, positionSnapshot } = params;
    const now = Date.now();

    // 1. If no receipt exists yet
    if (!receipt) {
      return {
        correlationId,
        planDigest: plan.planDigest,
        receiptStatus: "PENDING",
        exchangeStatus: "unknown",
        plannedQuantity: plan.quantity,
        filledQuantity: 0,
        remainingQuantity: plan.quantity,
        isDiscrepancy: false,
        timestampMs: now,
      };
    }

    // 2. If EVM transaction reverted
    if (receipt.status === "REVERTED") {
      return {
        correlationId,
        planDigest: plan.planDigest,
        transactionHash: receipt.transactionHash,
        receiptStatus: "REVERTED",
        exchangeStatus: "rejected",
        plannedQuantity: plan.quantity,
        filledQuantity: 0,
        remainingQuantity: 0,
        isDiscrepancy: false,
        discrepancyDetails: receipt.revertReason || "Transaction reverted on chain",
        timestampMs: now,
      };
    }

    // 3. If receipt is confirmed but exchange order is missing from indexer/state
    if (receipt.status === "CONFIRMED" && !exchangeOrder) {
      return {
        correlationId,
        planDigest: plan.planDigest,
        transactionHash: receipt.transactionHash,
        receiptStatus: "CONFIRMED",
        exchangeStatus: "unknown",
        plannedQuantity: plan.quantity,
        filledQuantity: 0,
        remainingQuantity: plan.quantity,
        isDiscrepancy: true,
        discrepancyDetails: "Transaction confirmed on-chain but order not yet indexed by dreamDEX. Reconciliation required.",
        timestampMs: now,
      };
    }

    // 4. Exchange order present
    if (exchangeOrder) {
      const filled = exchangeOrder.filled;
      const remaining = exchangeOrder.remaining;
      const exStatus = exchangeOrder.status;

      let isDiscrepancy = false;
      let details: string | undefined;

      // Discrepancy checks:
      // a) Filled quantity exceeds planned quantity
      if (filled > plan.quantity + 1e-6) {
        isDiscrepancy = true;
        details = `Filled quantity (${filled}) exceeds planned order quantity (${plan.quantity})`;
      }

      // b) Order marked closed but 0 filled and not canceled
      if (exStatus === "closed" && filled === 0 && remaining > 0) {
        isDiscrepancy = true;
        details = "Order marked closed without any filled quantity and with remaining balance";
      }

      return {
        correlationId,
        planDigest: plan.planDigest,
        orderId: exchangeOrder.id,
        transactionHash: receipt?.transactionHash,
        receiptStatus: receipt?.status ?? "CONFIRMED",
        exchangeStatus: exStatus,
        plannedQuantity: plan.quantity,
        filledQuantity: filled,
        remainingQuantity: remaining,
        averageFillPrice: exchangeOrder.averageFillPrice ?? exchangeOrder.price,
        positionSizeAfter: positionSnapshot?.size,
        isDiscrepancy,
        discrepancyDetails: details,
        timestampMs: now,
      };
    }

    return {
      correlationId,
      planDigest: plan.planDigest,
      receiptStatus: receipt.status,
      exchangeStatus: "unknown",
      plannedQuantity: plan.quantity,
      filledQuantity: 0,
      remainingQuantity: plan.quantity,
      isDiscrepancy: true,
      discrepancyDetails: "Unresolved lifecycle state across provider and indexer",
      timestampMs: now,
    };
  }

  /**
   * Translates a reconciliation record into the authoritative user-facing LifecycleState.
   */
  public static mapToLifecycleState(record: ReconciliationRecord): LifecycleState {
    if (record.isDiscrepancy) {
      return "RECONCILIATION_REQUIRED";
    }

    if (record.receiptStatus === "REVERTED") {
      return "TX_REVERTED";
    }

    if (record.receiptStatus === "PENDING" || record.receiptStatus === "TIMEOUT") {
      return "TX_PENDING";
    }

    switch (record.exchangeStatus) {
      case "open":
        return record.filledQuantity > 0 ? "PARTIALLY_FILLED" : "RESTING";
      case "closed":
        return "FILLED";
      case "canceled":
        return "CANCELLED";
      case "rejected":
        return "REJECTED";
      default:
        return "UNKNOWN";
    }
  }
}
