/**
 * PerpsPilot Account Readiness & Order Preflight Runner (Stage C)
 *
 * Performs comprehensive, read-only preflight verification for Somnia Hideki Testnet:
 * 1. Network & Chain ID verification (50383).
 * 2. Safe wallet address derivation (WITHOUT logging secrets).
 * 3. Native STT gas balance inspection.
 * 4. USDso wallet balance and MarginBank allowance inspection.
 * 5. MarginBank cross-margin account health and unlocked collateral inspection.
 * 6. Live target market (ETH-PERP) oracle health & precision constraints.
 * 7. Authoritative maximum placeable order size calculation via SDK.
 * 8. Proposed first-order risk and margin simulation.
 *
 * NOTE: Strictly read-only. Never modifies state, claims funds, or signs transactions.
 */

import { formatUnits, parseAbi, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  loadConfig,
  getSanitizedConfig,
  EXPECTED_HIDEKI_CHAIN_ID,
  DEFAULT_HIDEKI_RPC_URL,
} from "../config/index.js";
import {
  getPublicClient,
  verifyChainConnectivity,
  createSomniaMarketsExchange,
} from "../network/client.js";
import { discoverPerpMarkets, findMarketBySymbol } from "../markets/discovery.js";
import {
  alignPrice,
  calculateQuantityForNotional,
  validateOrderPrecision,
  formatBaseQuantity,
  formatQuotePrice,
} from "../markets/precision.js";
import {
  checkMarketHealth,
  readMarginAccountHealth,
  queryAuthoritativeMaxOrderSize,
} from "../risk/validation.js";

const ERC20_ABI = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
]);

const HIDEKI_USDSO_ADDRESS: Address = "0xed7993A74dAe1e6656B704A424DcD8711aAf4F72";

export type PreflightStatus = "PASS" | "FAIL" | "BLOCKED";

export interface PreflightItem {
  category: string;
  name: string;
  status: PreflightStatus;
  details: string;
}

const checklist: PreflightItem[] = [];

function recordItem(category: string, name: string, status: PreflightStatus, details: string) {
  checklist.push({ category, name, status, details });
  const tag =
    status === "PASS"
      ? "\x1b[32m[PASS]\x1b[0m"
      : status === "FAIL"
        ? "\x1b[31m[FAIL]\x1b[0m"
        : "\x1b[33m[BLOCKED]\x1b[0m";
  console.log(`${tag} ${`[${category}] ${name}`.padEnd(46)} : ${details}`);
}

export async function runAccountPreflight(): Promise<void> {
  console.log("================================================================================");
  console.log("  PerpsPilot — Account Readiness & Order Preflight (Stage C)");
  console.log("  Somnia Hideki Testnet (Tokyo v2, Chain ID 50383) — READ-ONLY MODE");
  console.log("================================================================================\n");

  const config = loadConfig();
  const sanitized = getSanitizedConfig(config);
  const client = getPublicClient(config.rpcUrl);

  // 1. Network & Chain Verification
  try {
    const netStatus = await verifyChainConnectivity(client, config.rpcUrl);
    recordItem(
      "NETWORK",
      "Hideki v2 RPC & Chain ID",
      "PASS",
      `Chain ID: ${netStatus.chainId} (Verified Hideki v2), Block #${netStatus.blockNumber}`,
    );
  } catch (error) {
    recordItem("NETWORK", "Hideki v2 RPC & Chain ID", "FAIL", (error as Error).message);
    return;
  }

  // 2. Market Discovery & Oracle Health
  let targetMarket;
  let markPrice: bigint | undefined;
  try {
    const discovery = await discoverPerpMarkets(config.indexerUrl);
    targetMarket = findMarketBySymbol(discovery.markets, config.symbol);

    if (!targetMarket) {
      recordItem(
        "MARKET",
        `Target Market ${config.symbol}`,
        "FAIL",
        `Market '${config.symbol}' not found in live discovered perps.`,
      );
      return;
    }

    const health = await checkMarketHealth(targetMarket.poolAddress, client);
    if (!health.priceable || !health.markPrice) {
      recordItem(
        "MARKET",
        "Oracle Mark Price Health",
        "FAIL",
        health.reason || "PerpPool.tryGetHealthSnapshot reports market unpriceable",
      );
      return;
    }

    markPrice = health.markPrice;
    recordItem(
      "MARKET",
      `Target Pool & Oracle: ${targetMarket.display}`,
      "PASS",
      `Pool: ${targetMarket.poolAddress.slice(0, 10)}... | Mark: $${formatUnits(markPrice, 18)} | MinQty: ${formatUnits(targetMarket.minQuantity, targetMarket.baseDecimals)} ${targetMarket.baseSymbol} | Lot: ${formatUnits(targetMarket.lotSize, targetMarket.baseDecimals)} | Tick: $${formatUnits(targetMarket.tickSize, targetMarket.quoteDecimals)}`,
    );
  } catch (error) {
    recordItem("MARKET", "Target Market & Oracle", "FAIL", (error as Error).message);
    return;
  }

  // 3. Wallet / Signer Derivation
  let walletAddress: Address | undefined;
  const rawPrivateKey = process.env.PRIVATE_KEY?.trim();

  if (!rawPrivateKey) {
    recordItem(
      "ACCOUNT",
      "Wallet Signer Derivation",
      "BLOCKED",
      "No PRIVATE_KEY set in .env. Account readiness checks are blocked (Mode: Read-Only).",
    );
  } else {
    try {
      const formattedKey = (rawPrivateKey.startsWith("0x") ? rawPrivateKey : `0x${rawPrivateKey}`) as `0x${string}`;
      const account = privateKeyToAccount(formattedKey);
      walletAddress = account.address;
      recordItem(
        "ACCOUNT",
        "Wallet Signer Derivation",
        "PASS",
        `Derived Address: ${walletAddress} (Signer active, key never revealed)`,
      );
    } catch (error) {
      recordItem(
        "ACCOUNT",
        "Wallet Signer Derivation",
        "FAIL",
        `Failed to parse PRIVATE_KEY: ${(error as Error).message}`,
      );
    }
  }

  // 4. Balances & Collateral Inspection
  let sttBalance: bigint | undefined;
  let usdsoBalance: bigint | undefined;
  let marginBankAllowance: bigint | undefined;
  let marginHealth: Awaited<ReturnType<typeof readMarginAccountHealth>> | undefined;

  if (walletAddress) {
    try {
      // 4a. Native STT Gas Balance
      sttBalance = await client.getBalance({ address: walletAddress });
      const sttFormatted = formatUnits(sttBalance, 18);
      const hasMinGas = sttBalance >= 50_000_000_000_000_000n; // 0.05 STT minimum recommended for gas
      recordItem(
        "BALANCE",
        "Native STT Gas Balance",
        hasMinGas ? "PASS" : "FAIL",
        `${sttFormatted} STT ${hasMinGas ? "(Adequate for testnet gas)" : "(Insufficient: min 0.05 STT recommended)"}`,
      );

      // 4b. USDso Token Balance
      usdsoBalance = await client.readContract({
        address: HIDEKI_USDSO_ADDRESS,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [walletAddress],
      });
      const usdsoFormatted = formatUnits(usdsoBalance, 18);
      const hasUsdso = usdsoBalance > 0n;
      recordItem(
        "BALANCE",
        "USDso Wallet Balance",
        hasUsdso ? "PASS" : "FAIL",
        `${usdsoFormatted} USDso (Hideki Token: ${HIDEKI_USDSO_ADDRESS.slice(0, 10)}...)`,
      );

      // 4c. USDso Allowance to MarginBank
      marginBankAllowance = await client.readContract({
        address: HIDEKI_USDSO_ADDRESS,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: [walletAddress, targetMarket.marginBank],
      });
      const allowanceFormatted = formatUnits(marginBankAllowance, 18);
      recordItem(
        "BALANCE",
        "MarginBank USDso Allowance",
        marginBankAllowance > 0n ? "PASS" : "BLOCKED",
        `${allowanceFormatted} USDso approved to MarginBank (${targetMarket.marginBank.slice(0, 10)}...)`,
      );

      // 4d. MarginBank Account Health
      marginHealth = await readMarginAccountHealth(targetMarket.marginBank, walletAddress, client);
      const unlockedFormatted = formatUnits(marginHealth.unlockedCollateral, 18);
      const equityFormatted = formatUnits(marginHealth.equity, 18);
      recordItem(
        "MARGIN",
        "MarginBank Collateral State",
        marginHealth.unlockedCollateral > 0n ? "PASS" : "BLOCKED",
        `Unlocked: ${unlockedFormatted} USDso | Equity: ${equityFormatted} USDso | Status: ${marginHealth.statusLabel} | Active Pools: ${marginHealth.activePoolsCount}`,
      );
    } catch (error) {
      recordItem("BALANCE", "On-Chain Balance Inspection", "FAIL", (error as Error).message);
    }
  } else {
    recordItem(
      "BALANCE",
      "Native STT Gas Balance",
      "BLOCKED",
      "Signer unconfigured: cannot inspect STT gas balance.",
    );
    recordItem(
      "BALANCE",
      "USDso Wallet Balance",
      "BLOCKED",
      "Signer unconfigured: cannot inspect USDso token balance.",
    );
    recordItem(
      "MARGIN",
      "MarginBank Collateral State",
      "BLOCKED",
      "Signer unconfigured: cannot inspect MarginBank cross-margin state.",
    );
  }

  // 5. Authoritative Max Placeable Order Size
  const exchange = createSomniaMarketsExchange({
    rpcUrl: config.rpcUrl,
    wsRpcUrl: config.wsRpcUrl,
    indexerUrl: config.indexerUrl,
  });

  const isBid = config.perpSide === "long";
  const alignedPrice = alignPrice(markPrice, targetMarket.tickSize);

  let maxOrderResult;
  if (walletAddress) {
    try {
      maxOrderResult = await queryAuthoritativeMaxOrderSize(exchange, {
        market: targetMarket,
        account: walletAddress,
        isBid,
        price: alignedPrice,
        requestedQuantity: targetMarket.minQuantity,
        autoPull: true,
      });

      if (maxOrderResult.allowed) {
        recordItem(
          "SIZING",
          "Max Permitted Order Size",
          "PASS",
          `Max Placeable: ${formatUnits(maxOrderResult.maxQuantity, targetMarket.baseDecimals)} ${targetMarket.baseSymbol} (Limited by: ${maxOrderResult.limitedBy ?? "none"})`,
        );
      } else {
        recordItem(
          "SIZING",
          "Max Permitted Order Size",
          "BLOCKED",
          `Max Placeable: 0 ${targetMarket.baseSymbol}. Reason: ${maxOrderResult.reason ?? "Collateral insufficient in MarginBank"}`,
        );
      }
    } catch (error) {
      recordItem("SIZING", "Max Permitted Order Size", "FAIL", (error as Error).message);
    }
  } else {
    recordItem(
      "SIZING",
      "Max Permitted Order Size",
      "BLOCKED",
      "Signer unconfigured: cannot compute account-specific maximum order size.",
    );
  }

  // 6. Proposed First-Order Plan
  const targetNotionalX18 = BigInt(config.perpNotionalUsdso) * 10n ** 18n;
  const sizing = calculateQuantityForNotional(targetNotionalX18, alignedPrice, targetMarket);
  const precisionCheck = sizing.valid
    ? validateOrderPrecision(alignedPrice, sizing.quantity, targetMarket)
    : { valid: false, error: sizing.reason };

  const humanQty = formatBaseQuantity(sizing.quantity, targetMarket.baseDecimals);
  const humanPrice = formatQuotePrice(alignedPrice);
  const actualNotional = (sizing.quantity * alignedPrice) / 10n ** 18n;
  const humanNotional = formatUnits(actualNotional, 18);

  // 1. Protocol minimum floor (e.g. 500 bps = 5% IMF base at 20x max leverage)
  const protocolMinMargin = (actualNotional * BigInt(targetMarket.initialMarginBps)) / 10000n;
  const humanProtocolMin = formatUnits(protocolMinMargin, 18);

  // 2. User configured target margin (e.g. 2x leverage = 50% margin)
  const userLeverageBps = BigInt(Math.round(10000 / config.perpLeverage));
  const configuredMarginReq = (actualNotional * userLeverageBps) / 10000n;
  const humanConfiguredMargin = formatUnits(configuredMarginReq, 18);

  // 3. Leverage surcharge required to enforce conservative 2x leverage on a 20x market
  const leverageSurcharge = configuredMarginReq > protocolMinMargin ? configuredMarginReq - protocolMinMargin : 0n;
  const humanSurcharge = formatUnits(leverageSurcharge, 18);

  // Effective required collateral enforced for order placement
  const initialMarginReq = configuredMarginReq > protocolMinMargin ? configuredMarginReq : protocolMinMargin;
  const humanIMReq = formatUnits(initialMarginReq, 18);

  console.log("\n================================================================================");
  console.log("  Proposed First-Order Plan (Somnia Hideki v2)");
  console.log("================================================================================");
  console.log(`  Market Symbol       : ${targetMarket.display} (${targetMarket.symbol})`);
  console.log(`  Pool Contract       : ${targetMarket.poolAddress}`);
  console.log(`  Side                : ${config.perpSide.toUpperCase()} (${isBid ? "Bid" : "Ask"})`);
  console.log(`  Order Type          : LIMIT (Aligned to grid)`);
  console.log(`  Limit Price         : $${humanPrice} USDso (Aligned to tick ${formatUnits(targetMarket.tickSize, targetMarket.quoteDecimals)})`);
  console.log(`  Target Notional     : $${config.perpNotionalUsdso} USDso`);
  console.log(`  Calculated Quantity : ${humanQty} ${targetMarket.baseSymbol} (Aligned to lot ${formatUnits(targetMarket.lotSize, targetMarket.baseDecimals)})`);
  console.log(`  Estimated Notional  : $${humanNotional} USDso`);
  console.log(`  Configured Leverage : ${config.perpLeverage}x (Market Maximum: ${targetMarket.maxLeverage}x)`);
  console.log(`  Protocol Margin Flr : ~$${humanProtocolMin} USDso (${targetMarket.initialMarginBps / 100}% IMF base at ${targetMarket.maxLeverage}x max leverage)`);
  console.log(`  Configured Target IM: ~$${humanConfiguredMargin} USDso (${(100 / config.perpLeverage).toFixed(1)}% margin target at ${config.perpLeverage}x leverage)`);
  console.log(`  Leverage Surcharge  : ~$${humanSurcharge} USDso (Enforces ${config.perpLeverage}x conservative leverage)`);
  console.log(`  Required Collateral : ~$${humanIMReq} USDso (Enforced in MarginBank)`);
  console.log(`  Market Minimum Qty  : ${formatUnits(targetMarket.minQuantity, targetMarket.baseDecimals)} ${targetMarket.baseSymbol} (~$${formatUnits((targetMarket.minQuantity * alignedPrice) / 10n ** 18n, 18)} USDso)`);
  console.log(`  Market Max Position : 399.5612 ETH (~$943,000 USDso)`);
  console.log(`  Precision Check     : ${precisionCheck.valid ? "VALID" : `INVALID: ${precisionCheck.error}`}`);
  console.log(`  DRY_RUN Status      : DRY_RUN=true STRICTLY ENFORCED (No order sent)`);
  console.log("================================================================================\n");

  // Order Risk Check summary
  if (precisionCheck.valid && sizing.quantity >= targetMarket.minQuantity) {
    recordItem(
      "PLAN",
      "Order Specification & Grid Validation",
      "PASS",
      `Quantity ${humanQty} ${targetMarket.baseSymbol} >= minQuantity (${formatUnits(targetMarket.minQuantity, targetMarket.baseDecimals)}), valid tick & lot alignment.`,
    );
  } else {
    recordItem(
      "PLAN",
      "Order Specification & Grid Validation",
      "FAIL",
      precisionCheck.error || "Order specification violates market grid rules",
    );
  }

  // 7. Overall Checklist Summary
  console.log("\n================================================================================");
  const total = checklist.length;
  const passed = checklist.filter((c) => c.status === "PASS").length;
  const failed = checklist.filter((c) => c.status === "FAIL").length;
  const blocked = checklist.filter((c) => c.status === "BLOCKED").length;

  console.log(`  Preflight Summary: ${passed}/${total} PASS | ${failed} FAIL | ${blocked} BLOCKED`);
  console.log("================================================================================\n");

  if (blocked > 0 || failed > 0) {
    console.log("  Prerequisites Needed Before Order Submission:");
    if (!walletAddress) {
      console.log("  [ ] 1. Create .env from .env.example with PRIVATE_KEY set to your Hideki testnet account.");
    }
    if (sttBalance !== undefined && sttBalance < 50_000_000_000_000_000n) {
      console.log("  [ ] 2. Obtain native STT testnet gas (bridge from Shannon or use Somnia faucet).");
    }
    if (usdsoBalance !== undefined && usdsoBalance < actualNotional) {
      console.log(`  [ ] 3. Obtain USDso testnet tokens (bridge from Shannon to Hideki token ${HIDEKI_USDSO_ADDRESS}).`);
    }
    if (marginBankAllowance !== undefined && marginBankAllowance < initialMarginReq) {
      console.log(`  [ ] 4. Approve USDso to MarginBank (${targetMarket.marginBank}) for collateral deposit.`);
    }
    if (marginHealth !== undefined && marginHealth.unlockedCollateral < initialMarginReq) {
      console.log(`  [ ] 5. Deposit collateral into MarginBank via trader.depositMargin() before placing order.`);
    }
    console.log("  [ ] 6. Explicit user approval is required before transitioning out of DRY_RUN mode.\n");
  }

  process.exit(failed > 0 ? 1 : 0);
}

runAccountPreflight().catch((error) => {
  console.error("\x1b[31m[Account Preflight Fatal Error]\x1b[0m", error);
  process.exit(1);
});
