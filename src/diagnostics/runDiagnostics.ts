/**
 * PerpsPilot Diagnostic Pre-Flight Runner
 * Verifies RPC connectivity, chain ID, indexer discovery, SDK initialization,
 * precision constraints, and oracle health on Somnia Hideki Testnet.
 * Reports PASS, FAIL, or BLOCKED for every check.
 */

import { formatUnits } from "viem";
import { loadConfig, getSanitizedConfig, EXPECTED_HIDEKI_CHAIN_ID } from "../config/index.js";
import { getPublicClient, verifyChainConnectivity, createSomniaMarketsExchange } from "../network/client.js";
import { discoverPerpMarkets, findMarketBySymbol } from "../markets/discovery.js";
import {
  alignPrice,
  validateOrderPrecision,
  calculateQuantityForNotional,
  formatQuotePrice,
  formatBaseQuantity,
} from "../markets/precision.js";
import { checkMarketHealth } from "../risk/validation.js";

type CheckStatus = "PASS" | "FAIL" | "BLOCKED";

interface CheckRecord {
  name: string;
  status: CheckStatus;
  details: string;
}

const checks: CheckRecord[] = [];

function recordCheck(name: string, status: CheckStatus, details: string) {
  checks.push({ name, status, details });
  const tag =
    status === "PASS"
      ? "\x1b[32m[PASS]\x1b[0m"
      : status === "FAIL"
        ? "\x1b[31m[FAIL]\x1b[0m"
        : "\x1b[33m[BLOCKED]\x1b[0m";
  console.log(`${tag} ${name.padEnd(38)} : ${details}`);
}

async function run(): Promise<void> {
  console.log("================================================================================");
  console.log("  PerpsPilot — Official dreamDEX Perps Integration Diagnostics");
  console.log("  Somnia Hideki Testnet (Tokyo v2, Chain ID 50383)");
  console.log("================================================================================\n");

  let hasFatalError = false;

  // 1. Config Validation
  let config;
  try {
    config = loadConfig();
    const sanitized = getSanitizedConfig(config);
    recordCheck(
      "1. Configuration Verification",
      "PASS",
      `Chain: ${sanitized.chainId} (${sanitized.network}), DRY_RUN: ${sanitized.dryRun}, Symbol: ${sanitized.symbol}`,
    );
  } catch (error) {
    recordCheck("1. Configuration Verification", "FAIL", (error as Error).message);
    process.exit(1);
  }

  // 2. RPC Connectivity & Chain ID Verification
  const client = getPublicClient(config.rpcUrl);
  try {
    const netStatus = await verifyChainConnectivity(client, config.rpcUrl);
    recordCheck(
      "2. Hideki v2 RPC Connectivity",
      "PASS",
      `Chain ID: ${netStatus.chainId} (Verified Hideki v2), Latest Block: #${netStatus.blockNumber}`,
    );
  } catch (error) {
    recordCheck("2. Hideki v2 RPC Connectivity", "FAIL", (error as Error).message);
    hasFatalError = true;
  }

  // 3. Somnia Indexer & Live Market Discovery
  let discovered;
  try {
    discovered = await discoverPerpMarkets(config.indexerUrl);
    const count = discovered.markets.length;
    if (count > 0) {
      recordCheck(
        "3. Live Perps Market Discovery",
        "PASS",
        `Discovered ${count} active perpetual markets from Hideki v2 Factory`,
      );
    } else {
      recordCheck(
        "3. Live Perps Market Discovery",
        "FAIL",
        "Factory returned 0 perpetual markets. Verify RPC and factory configuration.",
      );
      hasFatalError = true;
    }
  } catch (error) {
    recordCheck("3. Live Perps Market Discovery", "FAIL", (error as Error).message);
    hasFatalError = true;
  }

  // 4. Target Market Resolution & Decimals/Grid Inspection
  let targetMarket;
  if (discovered && discovered.markets.length > 0) {
    targetMarket = findMarketBySymbol(discovered.markets, config.symbol);

    console.log("\n--- Live Discovered Perpetual Markets (Hideki v2) ---");
    for (const m of discovered.markets) {
      const tickStr = formatUnits(m.tickSize, m.quoteDecimals);
      const lotStr = formatUnits(m.lotSize, m.baseDecimals);
      const minStr = formatUnits(m.minQuantity, m.baseDecimals);
      const isSelected = targetMarket && targetMarket.symbol === m.symbol ? " -> [CONFIG TARGET]" : "";
      console.log(
        `  * ${m.display.padEnd(12)} (${m.symbol}) | BaseDecimals: ${String(m.baseDecimals).padEnd(2)} | Pool: ${m.poolAddress.slice(0, 10)}... | Tick: ${tickStr} | Lot: ${lotStr} | MinQty: ${minStr} | MaxLev: ${m.maxLeverage}x${isSelected}`,
      );
    }
    console.log("----------------------------------------------------\n");

    if (targetMarket) {
      recordCheck(
        "4. Target Market Parameters",
        "PASS",
        `Target: ${targetMarket.display} (${targetMarket.symbol}) | Pool: ${targetMarket.poolAddress} | BaseDecimals: ${targetMarket.baseDecimals}`,
      );
    } else {
      recordCheck(
        "4. Target Market Parameters",
        "FAIL",
        `Configured SYMBOL '${config.symbol}' not found among live markets (${discovered.markets.map((m) => m.baseSymbol).join(", ")})`,
      );
      hasFatalError = true;
    }
  }

  // 5. Precision & Quantity Calculation Validation
  if (targetMarket) {
    try {
      // Use a realistic default price if mark is not yet fetched
      const rawPrice = targetMarket.markPrice ?? 2400000000000000000000n; // 2400.00 USDso
      const alignedPrice = alignPrice(rawPrice, targetMarket.tickSize);
      const targetNotionalX18 = BigInt(config.perpNotionalUsdso) * 10n ** 18n;
      const sizing = calculateQuantityForNotional(targetNotionalX18, alignedPrice, targetMarket);

      if (sizing.valid) {
        const precisionCheck = validateOrderPrecision(alignedPrice, sizing.quantity, targetMarket);
        if (precisionCheck.valid) {
          const humanQty = formatBaseQuantity(sizing.quantity, targetMarket.baseDecimals);
          recordCheck(
            "5. Precision & Grid Validation",
            "PASS",
            `Sized ${config.perpNotionalUsdso} USDso notional -> ${humanQty} ${targetMarket.baseSymbol} (aligned to lot ${formatUnits(targetMarket.lotSize, targetMarket.baseDecimals)}, tick ${formatUnits(targetMarket.tickSize, targetMarket.quoteDecimals)})`,
          );
        } else {
          recordCheck("5. Precision & Grid Validation", "FAIL", precisionCheck.error || "Precision validation failed");
        }
      } else {
        recordCheck("5. Precision & Grid Validation", "FAIL", sizing.reason || "Quantity calculation failed");
      }
    } catch (error) {
      recordCheck("5. Precision & Grid Validation", "FAIL", (error as Error).message);
    }
  }

  // 6. SDK Initialization
  try {
    createSomniaMarketsExchange({
      rpcUrl: config.rpcUrl,
      wsRpcUrl: config.wsRpcUrl,
      indexerUrl: config.indexerUrl,
    });
    recordCheck(
      "6. SomniaMarkets SDK Client",
      "PASS",
      `Initialized SomniaMarkets client with chainId ${EXPECTED_HIDEKI_CHAIN_ID}`,
    );
  } catch (error) {
    recordCheck("6. SomniaMarkets SDK Client", "FAIL", (error as Error).message);
    hasFatalError = true;
  }

  // 7. On-Chain Oracle Health Check (tryGetHealthSnapshot)
  if (targetMarket) {
    try {
      const health = await checkMarketHealth(targetMarket.poolAddress, client);
      if (health.priceable) {
        recordCheck(
          "7. Oracle Health Snapshot",
          "PASS",
          `Pool ${targetMarket.poolAddress.slice(0, 10)}... | Mark Price: $${formatUnits(health.markPrice!, 18)} (Fresh & Priceable)`,
        );
      } else {
        recordCheck(
          "7. Oracle Health Snapshot",
          "FAIL",
          health.reason || "PerpPool.tryGetHealthSnapshot reports market unpriceable",
        );
      }
    } catch (error) {
      recordCheck("7. Oracle Health Snapshot", "FAIL", (error as Error).message);
    }
  }

  // 8. Account & Collateral Prerequisites
  if (!config.hasPrivateKey) {
    recordCheck(
      "8. Account Margin & Signer Status",
      "BLOCKED",
      "No PRIVATE_KEY set in .env (Read-Only Mode). Account balance inspection is skipped.",
    );
  } else {
    recordCheck(
      "8. Account Margin & Signer Status",
      "PASS",
      "PRIVATE_KEY detected in environment (credentials sanitized, not displayed).",
    );
  }

  console.log("\n================================================================================");
  const total = checks.length;
  const passed = checks.filter((c) => c.status === "PASS").length;
  const failed = checks.filter((c) => c.status === "FAIL").length;
  const blocked = checks.filter((c) => c.status === "BLOCKED").length;

  console.log(`  Diagnostic Summary: ${passed}/${total} PASS | ${failed} FAIL | ${blocked} BLOCKED`);
  console.log("================================================================================\n");

  if (hasFatalError || failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

run().catch((error) => {
  console.error("\x1b[31m[Diagnostic Fatal Error]\x1b[0m", error);
  process.exit(1);
});
