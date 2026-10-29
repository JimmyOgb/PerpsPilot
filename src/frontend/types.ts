import type { LiveExecutionState } from '../execution/types.js';
export type { LiveExecutionState };

export type OrderSide = 'BUY_LONG' | 'SELL_SHORT';
export type OrderType = 'LIMIT' | 'POST_ONLY' | 'MARKET';
export type OrderStatus = 'SIMULATED_PREFLIGHT_PASS' | 'RESTED' | 'FILLED' | 'BLOCKED' | 'CANCELLED';

export type DataStatus = 'LIVE' | 'STALE' | 'LOADING' | 'UNAVAILABLE' | 'BLOCKED' | 'UNKNOWN' | 'SIMULATED' | 'ERROR';
export type MarkPriceStatus = 'LOADING' | 'LIVE' | 'STALE' | 'UNAVAILABLE' | 'ERROR';
export type BalanceStatus = 'IDLE' | 'LOADING' | 'FETCHED' | 'ERROR';

export interface OrderBookLevel {
  price: number;
  size: number;
  total: number;
}

export interface OrderBookData {
  asks: OrderBookLevel[];
  bids: OrderBookLevel[];
  spread: number;
  spreadPercent: number;
  status: DataStatus;
  source: string;
  lastUpdated: number;
  errorMessage?: string;
}

export interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ChartDataState {
  candles: CandleData[];
  status: DataStatus;
  source: string;
  lastUpdated: number;
  timeframe: string;
  errorMessage?: string;
}

export interface TradeRecord {
  id: string;
  price: number;
  amount: number;
  cost: number;
  side: 'buy' | 'sell';
  timestamp: number;
  txHash: string;
}

export interface TradesDataState {
  trades: TradeRecord[];
  status: DataStatus;
  source: string;
  lastUpdated: number;
  errorMessage?: string;
}

export interface MarketInfo {
  symbol: string;
  display: string;
  name: string;
  poolAddress: `0x${string}`;
  marginBank: `0x${string}`;
  baseToken: `0x${string}`;
  quoteToken: `0x${string}`;
  baseSymbol: string;
  quoteSymbol: string;
  baseDecimals: number;
  quoteDecimals: number;
  markPrice: number;
  markPriceRaw?: bigint;
  markPriceStatus: MarkPriceStatus;
  markPriceUpdatedAt?: number;
  indexPrice: number;
  tickSize: number;
  tickSizeRaw: bigint;
  lotSize: number;
  lotSizeRaw: bigint;
  minOrderQty: number;
  minQuantityRaw: bigint;
  imfBps: number;
  maxLeverage: number;
  openInterest: number;
  volume24h: number;
  high24h: number;
  low24h: number;
  change24h: number;
  fundingRate: number;
  fundingRateTimestamp?: number;
  isPriceable: boolean;
  isSyntheticDepth: boolean;
  isSyntheticChart: boolean;
  source: string;
  lastUpdated: number;
}

export interface PositionRecord {
  symbol: string;
  poolAddress: `0x${string}`;
  side: 'long' | 'short';
  size: number;
  entryPrice: number;
  markPrice: number;
  unrealizedPnl: number;
  liquidationPrice: number;
}

export interface OpenOrderRecord {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  price: number;
  amount: number;
  filled: number;
  status: string;
  timestamp: number;
}

export interface OrderProposal {
  market: string;
  poolAddress?: `0x${string}`;
  side: OrderSide;
  type: OrderType;
  price: number;
  amount: number;
  notional: number;
  leverage: number;
  imfRequired: number;
  estFee: number;
  estLiquidationPrice: number;
  slippageTolerance: number;
  timestamp: number;
  clientNonce: string;
}

export interface LifecycleStep {
  id: string;
  title: string;
  description: string;
  status: 'PENDING' | 'PASS' | 'WARN' | 'BLOCKED';
  timestamp: string;
  rawPayload?: Record<string, unknown>;
}

export interface RiskCheckResult {
  code: string;
  name: string;
  passed: boolean;
  status: 'PASS' | 'WARN' | 'BLOCKED' | 'UNKNOWN' | 'LOADING' | 'DISCONNECTED';
  severity: 'INFO' | 'WARN' | 'CRITICAL';
  message: string;
}

export interface RiskEvaluation {
  isSafeToSimulate: boolean;
  accountVerified: boolean;
  statusBannerTitle: string;
  statusBannerSubtitle: string;
  statusBannerType: 'PASS' | 'WARN' | 'BLOCKED' | 'DISCONNECTED' | 'LOADING';
  netExposureUsd: number;
  maxAllowedExposureUsd: number;
  marginHealthRatio: number;
  blockedOrdersCount: number;
  dailyRiskBudgetUsedUsd: number;
  dailyRiskBudgetCapUsd: number;
  checks: RiskCheckResult[];
}

export interface WalletState {
  address: `0x${string}` | null;
  chainId: number | null;
  isConnected: boolean;
  isConnecting: boolean;
  isCorrectNetwork: boolean;
  sttBalance: string | null;
  sttRaw: bigint | null;
  usdsoWalletBalance: string | null;
  usdsoRaw: bigint | null;
  usdsoAllowance?: string | null;
  usdsoAllowanceRaw?: bigint | null;
  marginBankBalance: string | null;
  unlockedCollateralRaw: bigint | null;
  lockedCollateralRaw?: bigint | null;
  equityRaw?: bigint | null;
  imReqRaw?: bigint | null;
  marginStatus?: number | null;
  marginStatusLabel?: string | null;
  positions?: PositionRecord[];
  openOrders?: OpenOrderRecord[];
  positionsStatus?: DataStatus;
  openOrdersStatus?: DataStatus;
  positionsError?: string;
  openOrdersError?: string;
  balanceStatus: BalanceStatus;
  balanceSource?: string;
  lastUpdated?: number;
  balanceError?: string;
  error?: string;
}
