import type { Address } from "viem";
import { ExecutionGuard } from "./ExecutionGuard.js";
import { OrderPlanner } from "./OrderPlanner.js";
import { ExecutionAuditLog } from "./ExecutionAuditLog.js";
import { OrderReconciler, type ExchangeOrderSnapshot } from "./OrderReconciler.js";
import { ReceiptVerifier } from "./ReceiptVerifier.js";
import { LiveOrderAdapter, type UnsignedOrderCall } from "./LiveOrderAdapter.js";
import type {
  OrderPlan,
  LifecycleState,
  GuardEvaluationResult,
  ReconciliationRecord,
  TransactionReceiptRecord,
} from "./types.js";

export class ExecutionGuardBlockedError extends Error {
  public evaluation: GuardEvaluationResult;
  constructor(message: string, evaluation: GuardEvaluationResult) {
    super(`[ExecutionGuardBlockedError] ${message}`);
    this.name = "ExecutionGuardBlockedError";
    this.evaluation = evaluation;
  }
}

export class DuplicateSubmissionError extends Error {
  constructor(clientNonce: string) {
    super(`[DuplicateSubmissionError] Order with clientNonce ${clientNonce} has already been submitted`);
    this.name = "DuplicateSubmissionError";
  }
}

export interface ExecutionOptions {
  connectedWallet: Address;
  isUserApproved: boolean;
  approvedDigest?: string;
  mockTransport?: boolean;
  fixtureReceipt?: Partial<TransactionReceiptRecord>;
  fixtureExchangeOrder?: ExchangeOrderSnapshot;
}

export interface OrderExecutionResult {
  correlationId: string;
  planDigest: string;
  state: LifecycleState;
  preparedCall?: UnsignedOrderCall;
  reconciliation?: ReconciliationRecord;
  receipt?: TransactionReceiptRecord;
  error?: string;
}

export class OrderExecutor {
  private guard: ExecutionGuard;
  private auditLog: ExecutionAuditLog;
  private liveAdapter: LiveOrderAdapter;
  private submittedNonces = new Set<string>();

  constructor(guard?: ExecutionGuard, auditLog?: ExecutionAuditLog, liveAdapter?: LiveOrderAdapter) {
    this.guard = guard || new ExecutionGuard({ dryRun: true });
    this.auditLog = auditLog || ExecutionAuditLog.getInstance();
    this.liveAdapter = liveAdapter || new LiveOrderAdapter({ guard: this.guard });
  }

  /**
   * The core order submission pipeline.
   * Strictly evaluates the ExecutionGuard at the service layer.
   * If DRY_RUN=true is active or if any guard check fails, state-changing writes are completely blocked.
   */
  public async submitOrder(
    plan: OrderPlan,
    options: ExecutionOptions,
  ): Promise<OrderExecutionResult> {
    const correlationId = plan.clientNonce;

    // 1. Audit initial planning
    this.auditLog.record(correlationId, "PLANNED", `Order plan constructed for ${plan.marketSymbol}`, {
      price: plan.price,
      quantity: plan.quantity,
      notional: plan.notionalUsd,
    });

    // 2. Validate plan freshness and integrity
    if (!OrderPlanner.verifyPlanDigest(plan, plan.planDigest)) {
      this.auditLog.record(correlationId, "REJECTED", "Plan parameters modified; digest mismatch");
      return {
        correlationId,
        planDigest: plan.planDigest,
        state: "REJECTED",
        error: "Plan integrity violation: parameter digest does not match",
      };
    }

    if (Date.now() > plan.expiresAtMs) {
      this.auditLog.record(correlationId, "EXPIRED", "Order plan expired before submission");
      return {
        correlationId,
        planDigest: plan.planDigest,
        state: "EXPIRED",
        error: "Order plan expired before submission",
      };
    }

    // 3. Duplicate submission prevention
    if (this.submittedNonces.has(plan.clientNonce)) {
      this.auditLog.record(correlationId, "REJECTED", `Duplicate submission blocked for nonce ${plan.clientNonce}`);
      throw new DuplicateSubmissionError(plan.clientNonce);
    }

    // 4. Validate Call Preparation against Contract ABI (Non-signing preparation)
    const preparedCall = this.liveAdapter.prepareOrderCall(plan);

    // 5. Evaluate Mandatory Execution Guard
    const guardResult = this.guard.evaluate({
      plan,
      connectedWallet: options.connectedWallet,
      approvedDigest: options.approvedDigest,
      isUserApproved: options.isUserApproved,
    });

    if (!guardResult.allowed) {
      this.auditLog.record(
        correlationId,
        this.guard.isDryRun() ? "AWAITING_AUTH" : "REJECTED",
        `Execution halted by ExecutionGuard: ${guardResult.reason}`,
        { checks: guardResult.checks },
      );

      // In DRY_RUN mode, we fail closed and throw, ensuring zero possibility of broadcast
      throw new ExecutionGuardBlockedError(
        guardResult.reason || "Execution guard blocked order dispatch",
        guardResult,
      );
    }

    // If guard was mocked to allow, record that live write is still guarded in Stage F.3
    this.submittedNonces.add(plan.clientNonce);

    // 6. Mock / Test Transport Simulation (For dry-run verification only)
    if (options.mockTransport) {
      this.auditLog.record(correlationId, "SUBMITTED", "Order submitted via mock transport", {
        planDigest: plan.planDigest,
        preparedCall,
      });

      const verifier = new ReceiptVerifier();
      const mockHash = `0x${"a".repeat(64)}` as `0x${string}`;
      const receipt = await verifier.verifyTransaction(mockHash, undefined, options.fixtureReceipt);

      this.auditLog.record(
        correlationId,
        receipt.status === "CONFIRMED" ? "TX_CONFIRMED" : "TX_REVERTED",
        `Transaction receipt status: ${receipt.status}`,
      );

      const reconciliation = OrderReconciler.reconcile({
        correlationId,
        plan,
        receipt,
        exchangeOrder: options.fixtureExchangeOrder,
      });

      const finalState = OrderReconciler.mapToLifecycleState(reconciliation);
      this.auditLog.record(correlationId, finalState, `Order lifecycle settled in state: ${finalState}`, {
        reconciliation,
      });

      return {
        correlationId,
        planDigest: plan.planDigest,
        state: finalState,
        preparedCall,
        receipt,
        reconciliation,
      };
    }

    // Live broadcast path is gated behind LiveOrderAdapter and permanently blocked under DRY_RUN=true
    throw new Error("[OrderExecutor] Live network broadcast is disabled by DRY_RUN=true.");
  }

  public getGuard(): ExecutionGuard {
    return this.guard;
  }

  public getLiveAdapter(): LiveOrderAdapter {
    return this.liveAdapter;
  }
}
