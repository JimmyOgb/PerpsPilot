import type { Address } from "viem";
import { EXPECTED_HIDEKI_CHAIN_ID } from "../config/constants.js";
import { OrderPlanner } from "./OrderPlanner.js";
import type {
  OrderPlan,
  ExecutionGuardConfig,
  GuardEvaluationResult,
  GuardCheckItem,
} from "./types.js";

export const DEFAULT_GUARD_CONFIG: ExecutionGuardConfig = {
  dryRun: true, // Always fail-closed by default
  allowedChainId: EXPECTED_HIDEKI_CHAIN_ID,
  maxNotionalUsd: 20.0,
  maxLeverage: 20.0,
  maxPlanAgeMs: 60_000,
};

export class ExecutionGuard {
  private config: ExecutionGuardConfig;

  constructor(config: Partial<ExecutionGuardConfig> = {}) {
    this.config = { ...DEFAULT_GUARD_CONFIG, ...config };
  }

  /**
   * Evaluates the 8 mandatory safety gates before any transaction path could be entered.
   * If any single check fails or if DRY_RUN=true, execution is strictly blocked.
   */
  public evaluate(params: {
    plan: OrderPlan;
    connectedWallet?: Address | null;
    approvedDigest?: string | null;
    isUserApproved?: boolean;
    nowMs?: number;
  }): GuardEvaluationResult {
    const checks: GuardCheckItem[] = [];
    const now = params.nowMs ?? Date.now();

    // 1. Live execution authorization mode
    const isLiveAuthorized = !this.config.dryRun;
    checks.push({
      name: "1. LIVE_EXECUTION_MODE",
      passed: isLiveAuthorized,
      details: isLiveAuthorized
        ? "Live execution mode explicitly enabled"
        : "BLOCKED: DRY_RUN=true is active. Zero write transactions permitted.",
    });

    // 2. Network / Chain ID verification
    const isCorrectChain = params.plan.chainId === this.config.allowedChainId;
    checks.push({
      name: "2. CHAIN_ID_VERIFIED",
      passed: isCorrectChain,
      details: isCorrectChain
        ? `Verified Somnia Hideki Testnet (Chain ID ${params.plan.chainId})`
        : `BLOCKED: Foreign chain ID ${params.plan.chainId}. Expected ${this.config.allowedChainId}.`,
    });

    // 3. Wallet agreement
    const walletAgrees =
      !!params.connectedWallet &&
      params.connectedWallet.toLowerCase() === params.plan.walletAddress.toLowerCase();
    checks.push({
      name: "3. WALLET_IDENTITY_MATCH",
      passed: walletAgrees,
      details: walletAgrees
        ? `Connected account ${params.connectedWallet} matches order plan`
        : `BLOCKED: Wallet mismatch or disconnected (Plan: ${params.plan.walletAddress}, Connected: ${params.connectedWallet || "NONE"})`,
    });

    // 4. Pre-trade validation gate
    const validationPassed = params.plan.validation.valid;
    checks.push({
      name: "4. PRE_TRADE_VALIDATION",
      passed: validationPassed,
      details: validationPassed
        ? "All local tick, lot, and pool parameter checks passed"
        : `BLOCKED: Validation errors: ${params.plan.validation.errors.join("; ")}`,
    });

    // 5. Plan freshness (not expired)
    const isFresh = now <= params.plan.expiresAtMs;
    checks.push({
      name: "5. PLAN_FRESHNESS",
      passed: isFresh,
      details: isFresh
        ? `Plan current (expires in ${Math.round((params.plan.expiresAtMs - now) / 1000)}s)`
        : `BLOCKED: Order plan expired ${Math.round((now - params.plan.expiresAtMs) / 1000)}s ago`,
    });

    // 6. Cryptographic plan digest integrity
    const isDigestValid =
      OrderPlanner.verifyPlanDigest(params.plan, params.plan.planDigest) &&
      (!params.approvedDigest || params.approvedDigest.toLowerCase() === params.plan.planDigest.toLowerCase());
    checks.push({
      name: "6. PLAN_DIGEST_INTEGRITY",
      passed: isDigestValid,
      details: isDigestValid
        ? `Canonical SHA-256 digest verified: ${params.plan.planDigest.slice(0, 14)}...`
        : "BLOCKED: Plan parameters have changed since approval or digest is invalid",
    });

    // 7. Configured safety caps
    const withinCaps =
      params.plan.notionalUsd <= this.config.maxNotionalUsd &&
      params.plan.leverage <= this.config.maxLeverage;
    checks.push({
      name: "7. SAFETY_BOUNDS",
      passed: withinCaps,
      details: withinCaps
        ? `Notional ($${params.plan.notionalUsd.toFixed(2)}) <= $${this.config.maxNotionalUsd}, Leverage (${params.plan.leverage}x) <= ${this.config.maxLeverage}x`
        : `BLOCKED: Order exceeds safety caps (Max notional $${this.config.maxNotionalUsd}, Max leverage ${this.config.maxLeverage}x)`,
    });

    // 8. Explicit operator approval
    const userApproved = params.isUserApproved === true;
    checks.push({
      name: "8. USER_APPROVAL",
      passed: userApproved,
      details: userApproved
        ? "Operator provided explicit confirmation for this exact plan"
        : "BLOCKED: Operator approval has not been granted",
    });

    const allPassed = checks.every((c) => c.passed);
    const failureReasons = checks.filter((c) => !c.passed).map((c) => c.details);

    return {
      allowed: allPassed,
      reason: allPassed ? undefined : failureReasons[0],
      checks,
    };
  }

  public isDryRun(): boolean {
    return this.config.dryRun;
  }
}
