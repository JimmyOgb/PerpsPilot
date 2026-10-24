/**
 * PerpsPilot Market Data Models
 * Types for perpetual markets metadata, order book parameters, and pricing grids.
 */

export interface PerpMarketInfo {
  /** Market identifier / pool address */
  id: string;
  poolAddress: `0x${string}`;
  /** Canonical symbol string, e.g. "ETH:USDso" */
  symbol: string;
  /** Trader-friendly display name, e.g. "ETH-PERP" */
  display: string;
  baseSymbol: string;
  quoteSymbol: string;
  baseToken: `0x${string}`;
  quoteToken: `0x${string}`;
  /** Base asset native decimals (e.g., 18 for ETH, 9 for SOL, 8 for BTC, 6 for XRP) */
  baseDecimals: number;
  /** Quote asset decimals (always 18 for USDso) */
  quoteDecimals: number;
  /** Tick size in 18-decimal quote currency units */
  tickSize: bigint;
  /** Lot size in base decimals units */
  lotSize: bigint;
  /** Minimum order quantity in base decimals units */
  minQuantity: bigint;
  /** Initial margin requirement in basis points (e.g., 500 = 5% = 20x max leverage) */
  initialMarginBps: number;
  /** Maximum allowable leverage (10,000 / initialMarginBps) */
  maxLeverage: number;
  /** Cross-margin MarginBank address */
  marginBank: `0x${string}`;
  /** Current on-chain mark price in 18dp quote units */
  markPrice?: bigint;
  /** Current index price in 18dp quote units */
  indexPrice?: bigint;
  /** Current funding rate (per unit) */
  fundingRate?: bigint;
  /** Operational status: null (Active), "ReduceOnly", "Delisted" */
  perpStatus: string | null;
}

export interface MarketDiscoveryResult {
  markets: PerpMarketInfo[];
  timestamp: number;
  source: "indexer" | "onchain_fallback";
}
