import type { Address } from "viem";

export type OrderSide = "BUY_LONG" | "SELL_SHORT";
export type OrderExecutionType = "LIMIT" | "MARKET" | "POST_ONLY" | "FILL_OR_KILL";

/**
 * 17-State Finite State Machine for Live Execution and Preflight Safety
 */
export type LiveExecutionState =
  | "READ_ONLY"
  | "WALLET_DISCONNECTED"
  | "WRONG_NETWORK"
  | "INSUFFICIENT_GAS"
  | "INSUFFICIENT_COLLATERAL"
  | "RISK_CHECK_FAILED"
  | "AWAITING_USER_CONFIRMATION"
  | "AWAITING_WALLET_SIGNATURE"
  | "TRANSACTION_PENDING"
  | "TRANSACTION_MINED"
  | "ORDER_RESTING"
  | "ORDER_PARTIALLY_FILLED"
  | "ORDER_FILLED"
  | "ORDER_CANCELLED"
  | "POSITION_VERIFIED"
  | "TRANSACTION_FAILED"
  | "VERIFICATION_FAILED";

export interface OnchainOrderDetails {
  orderId: bigint;
  isBid: boolean;
  owner: Address;
  userData: bigint;
  price: bigint;
  fullQuantity: bigint;
  quantityRemaining: bigint;
  expireTimestampNs: bigint;
}

export interface OnchainPositionDetails {
  size: bigint;
  avgEntryPrice: bigint;
  entryFundingIndex: bigint;
  lastUpdatedTimestampNs: bigint;
}

export type LifecycleState =
  | "PLANNED"
  | "VALIDATED"
  | "AWAITING_AUTH"
  | "SUBMITTED"
  | "TX_PENDING"
  | "TX_CONFIRMED"
  | "TX_REVERTED"
  | "ORDER_ACCEPTED"
  | "RESTING"
  | "PARTIALLY_FILLED"
  | "FILLED"
  | "REJECTED"
  | "CANCEL_REQUESTED"
  | "CANCELLED"
  | "CLOSED"
  | "EXPIRED"
  | "UNKNOWN"
  | "RECONCILIATION_REQUIRED";

export interface PlanValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface OrderPlan {
  chainId: number;
  walletAddress: Address;
  marketSymbol: string;
  poolAddress: Address;
  side: OrderSide;
  orderType: OrderExecutionType;
  price: number;
  priceRaw: bigint;
  quantity: number;
  quantityRaw: bigint;
  leverage: number;
  notionalUsd: number;
  marginRequiredUsd: number;
  protocolMinMarginUsd?: number;
  leverageSurchargeUsd?: number;
  estimatedFeeUsd: number;
  estimatedGasStt: number;
  clientNonce: string;
  expireTimestampNs?: bigint;
  createdAtMs: number;
  expiresAtMs: number;
  reduceOnly: boolean;
  nativeReduceOnlySupported: boolean;
  validation: PlanValidationResult;
  planDigest: string;
}

export interface ExecutionGuardConfig {
  dryRun: boolean;
  allowedChainId: number;
  maxNotionalUsd: number;
  maxLeverage: number;
  maxPlanAgeMs: number;
}

export interface GuardCheckItem {
  name: string;
  passed: boolean;
  details: string;
}

export interface GuardEvaluationResult {
  allowed: boolean;
  reason?: string;
  checks: GuardCheckItem[];
}

export type ReceiptStatus =
  | "CONFIRMED"
  | "REVERTED"
  | "PENDING"
  | "MISSING"
  | "TIMEOUT"
  | "UNKNOWN";

export interface TransactionReceiptRecord {
  transactionHash: `0x${string}`;
  blockNumber?: bigint;
  status: ReceiptStatus;
  confirmations: number;
  gasUsed?: bigint;
  effectiveGasPrice?: bigint;
  revertReason?: string;
  timestampMs: number;
}

export interface ReconciliationRecord {
  correlationId: string;
  planDigest: string;
  orderId?: string;
  transactionHash?: `0x${string}`;
  receiptStatus: ReceiptStatus;
  exchangeStatus: "open" | "closed" | "canceled" | "rejected" | "unknown";
  plannedQuantity: number;
  filledQuantity: number;
  remainingQuantity: number;
  averageFillPrice?: number;
  positionSizeAfter?: number;
  isDiscrepancy: boolean;
  discrepancyDetails?: string;
  timestampMs: number;
}

export type CancellationStatus =
  | "CANCEL_REQUESTED"
  | "CANCELLED"
  | "ALREADY_FILLED"
  | "ALREADY_CANCELLED"
  | "REJECTED"
  | "RACE_FILLED"
  | "UNKNOWN";

export interface CancellationRecord {
  orderId: string;
  poolAddress: Address;
  account: Address;
  status: CancellationStatus;
  transactionHash?: `0x${string}`;
  reason?: string;
  timestampMs: number;
}

export interface PositionClosePlan {
  marketSymbol: string;
  poolAddress: Address;
  currentPositionSize: number;
  currentSide: "long" | "short";
  closeSide: OrderSide;
  closeQuantity: number;
  isNativeReduceOnlySupported: boolean;
  clientGuardEnforced: boolean;
  valid: boolean;
  reason?: string;
  createdAtMs: number;
}

export interface AuditEvent {
  id: string;
  correlationId: string;
  timestamp: number;
  state: LifecycleState;
  message: string;
  data?: Record<string, unknown>;
}
