/**
 * PerpsPilot Configuration Module
 * Validates network, RPC, execution modes, and trading parameters at startup.
 * Fail-closed policy: invalid or missing critical configuration aborts execution.
 */

import dotenv from "dotenv";
import {
  EXPECTED_HIDEKI_CHAIN_ID,
  DEFAULT_HIDEKI_RPC_URL,
  DEFAULT_HIDEKI_WS_RPC_URL,
  DEFAULT_SOMNIA_INDEXER_URL,
} from "./constants.js";

export * from "./constants.js";

// Load environment variables from .env if present in Node environment
if (typeof process !== "undefined" && typeof process.cwd === "function") {
  dotenv.config();
}

export interface PerpsPilotConfig {
  network: string;
  chainId: number;
  rpcUrl: string;
  wsRpcUrl: string;
  indexerUrl: string;
  dryRun: boolean;
  symbol: string;
  perpSide: "long" | "short";
  perpLeverage: number;
  perpNotionalUsdso: number;
  perpTakeProfitPct: number;
  perpStopLossPct: number;
  perpSlippageBps: number;
  ownerAddress?: `0x${string}`;
  hasPrivateKey: boolean;
}

export class ConfigValidationError extends Error {
  constructor(message: string) {
    super(`[ConfigValidationError] ${message}`);
    this.name = "ConfigValidationError";
  }
}

/**
 * Loads, normalizes, and strictly validates application configuration.
 * Fails closed if chain ID does not match 50383 or endpoints are malformed.
 */
export function loadConfig(): PerpsPilotConfig {
  const network = (process.env.NETWORK || "hideki").toLowerCase().trim();
  const rawChainId = process.env.CHAIN_ID ? parseInt(process.env.CHAIN_ID, 10) : EXPECTED_HIDEKI_CHAIN_ID;

  if (isNaN(rawChainId) || rawChainId !== EXPECTED_HIDEKI_CHAIN_ID) {
    throw new ConfigValidationError(
      `Invalid CHAIN_ID: expected ${EXPECTED_HIDEKI_CHAIN_ID} for Somnia Hideki Testnet, received ${process.env.CHAIN_ID}`,
    );
  }

  const rpcUrl = (process.env.RPC_URL || DEFAULT_HIDEKI_RPC_URL).trim();
  if (!rpcUrl.startsWith("http://") && !rpcUrl.startsWith("https://")) {
    throw new ConfigValidationError(`Invalid RPC_URL: must start with http:// or https://. Received: ${rpcUrl}`);
  }

  const wsRpcUrl = (process.env.WS_RPC_URL || DEFAULT_HIDEKI_WS_RPC_URL).trim();
  if (!wsRpcUrl.startsWith("ws://") && !wsRpcUrl.startsWith("wss://")) {
    throw new ConfigValidationError(`Invalid WS_RPC_URL: must start with ws:// or wss://. Received: ${wsRpcUrl}`);
  }

  const indexerUrl = (process.env.INDEXER_URL || DEFAULT_SOMNIA_INDEXER_URL).trim();
  if (!indexerUrl.startsWith("http://") && !indexerUrl.startsWith("https://")) {
    throw new ConfigValidationError(`Invalid INDEXER_URL: must start with http:// or https://. Received: ${indexerUrl}`);
  }

  // DRY_RUN defaults to true for total safety
  const dryRun = process.env.DRY_RUN !== "false";

  const symbol = (process.env.SYMBOL || "ETH-PERP").trim();
  const rawSide = (process.env.PERP_SIDE || "long").toLowerCase().trim();
  if (rawSide !== "long" && rawSide !== "short") {
    throw new ConfigValidationError(`Invalid PERP_SIDE: expected 'long' or 'short', received '${rawSide}'`);
  }
  const perpSide = rawSide as "long" | "short";

  const perpLeverage = parseFloat(process.env.PERP_LEVERAGE || "2");
  if (isNaN(perpLeverage) || perpLeverage <= 0 || perpLeverage > 50) {
    throw new ConfigValidationError(`Invalid PERP_LEVERAGE: expected 1 to 50, received ${process.env.PERP_LEVERAGE}`);
  }

  const perpNotionalUsdso = parseFloat(process.env.PERP_NOTIONAL_USDSO || "20");
  if (isNaN(perpNotionalUsdso) || perpNotionalUsdso <= 0) {
    throw new ConfigValidationError(
      `Invalid PERP_NOTIONAL_USDSO: expected positive number, received ${process.env.PERP_NOTIONAL_USDSO}`,
    );
  }

  const perpTakeProfitPct = parseFloat(process.env.PERP_TAKE_PROFIT_PCT || "2");
  const perpStopLossPct = parseFloat(process.env.PERP_STOP_LOSS_PCT || "1");
  const perpSlippageBps = parseInt(process.env.PERP_SLIPPAGE_BPS || "30", 10);

  const rawOwner = process.env.OWNER_ADDRESS?.trim();
  let ownerAddress: `0x${string}` | undefined = undefined;
  if (rawOwner && rawOwner.length > 0) {
    if (!rawOwner.startsWith("0x") || rawOwner.length !== 42) {
      throw new ConfigValidationError(`Invalid OWNER_ADDRESS: must be a 42-character 0x-prefixed address`);
    }
    ownerAddress = rawOwner as `0x${string}`;
  }

  const hasPrivateKey = Boolean(process.env.PRIVATE_KEY && process.env.PRIVATE_KEY.trim().length > 0);

  return {
    network,
    chainId: rawChainId,
    rpcUrl,
    wsRpcUrl,
    indexerUrl,
    dryRun,
    symbol,
    perpSide,
    perpLeverage,
    perpNotionalUsdso,
    perpTakeProfitPct,
    perpStopLossPct,
    perpSlippageBps,
    ownerAddress,
    hasPrivateKey,
  };
}

/**
 * Returns a sanitized view of configuration suitable for console output or reports.
 * Under NO circumstances prints private keys or full credentials.
 */
export function getSanitizedConfig(config: PerpsPilotConfig): Record<string, unknown> {
  return {
    network: config.network,
    chainId: config.chainId,
    rpcUrl: config.rpcUrl,
    wsRpcUrl: config.wsRpcUrl,
    indexerUrl: config.indexerUrl,
    dryRun: config.dryRun,
    symbol: config.symbol,
    perpSide: config.perpSide,
    perpLeverage: `${config.perpLeverage}x`,
    perpNotionalUsdso: `${config.perpNotionalUsdso} USDso`,
    perpTakeProfitPct: `${config.perpTakeProfitPct}%`,
    perpStopLossPct: `${config.perpStopLossPct}%`,
    perpSlippageBps: `${config.perpSlippageBps} bps`,
    ownerAddress: config.ownerAddress ?? "(none - direct mode)",
    hasPrivateKey: config.hasPrivateKey,
  };
}
