import {
  OrderProposal,
  RiskCheckResult,
  RiskEvaluation,
  WalletState
} from '../types.js';
import {
  MAX_SINGLE_ORDER_NOTIONAL_USD,
  MAX_LEVERAGE,
  SOMNIA_HIDEKI_CHAIN_ID,
  BASE_IMF_BPS,
  MAINTENANCE_MARGIN_BPS
} from '../constants.js';

export function quantizePriceToTick(price: number, tickSize: number, isAsk: boolean): number {
  if (tickSize <= 0 || isNaN(price) || price <= 0) return price;
  const factor = 1 / tickSize;
  const steps = isAsk ? Math.ceil(price * factor) : Math.floor(price * factor);
  return Number((steps / factor).toFixed(8));
}

export function quantizeAmountToLot(amount: number, lotSize: number): number {
  if (lotSize <= 0 || isNaN(amount) || amount <= 0) return amount;
  const factor = 1 / lotSize;
  const steps = Math.floor(amount * factor);
  return Number((steps / factor).toFixed(8));
}

export function calculateNotional(price: number, amount: number): number {
  return Number((price * amount).toFixed(4));
}

export function calculateProtocolFloorMargin(notional: number, imfBps: number = BASE_IMF_BPS): number {
  return Number(((notional * imfBps) / 10000).toFixed(4));
}

export function calculateConfiguredMargin(notional: number, leverage: number): number {
  if (leverage <= 0) return notional;
  return Number((notional / leverage).toFixed(4));
}

export function calculateLeverageSurcharge(notional: number, leverage: number, imfBps: number = BASE_IMF_BPS): number {
  const target = calculateConfiguredMargin(notional, leverage);
  const floor = calculateProtocolFloorMargin(notional, imfBps);
  return target > floor ? Number((target - floor).toFixed(4)) : 0;
}

export function calculateRequiredMargin(notional: number, leverage: number, imfBps: number = BASE_IMF_BPS): number {
  const target = calculateConfiguredMargin(notional, leverage);
  const floor = calculateProtocolFloorMargin(notional, imfBps);
  return Math.max(target, floor);
}

// Preserve backward-compatible alias calculateIMF (returns protocol floor)
export function calculateIMF(notional: number, imfBps: number = BASE_IMF_BPS): number {
  return calculateProtocolFloorMargin(notional, imfBps);
}

export function calculateLiquidationPrice(
  entryPrice: number,
  leverage: number,
  isLong: boolean,
  maintenanceMarginBps: number = MAINTENANCE_MARGIN_BPS
): number {
  if (leverage <= 0 || entryPrice <= 0) return 0;
  const mmFraction = maintenanceMarginBps / 10000;
  const initialMarginFraction = 1 / leverage;

  if (isLong) {
    const dropAllowed = initialMarginFraction - mmFraction;
    return Number((entryPrice * (1 - dropAllowed)).toFixed(2));
  } else {
    const riseAllowed = initialMarginFraction - mmFraction;
    return Number((entryPrice * (1 + riseAllowed)).toFixed(2));
  }
}

export function evaluateOrderRisk(
  proposal: OrderProposal,
  wallet: WalletState,
  minOrderQty: number,
  isPriceable: boolean = true,
): RiskEvaluation {
  const checks: RiskCheckResult[] = [];

  // Check 0: Oracle Priceability (ORC_001)
  const isOracleValid = isPriceable && proposal.price > 0;
  checks.push({
    code: 'ORC_001',
    name: 'Oracle Mark Price Freshness',
    passed: isOracleValid,
    status: isOracleValid ? 'PASS' : 'BLOCKED',
    severity: isOracleValid ? 'INFO' : 'CRITICAL',
    message: isOracleValid
      ? `Oracle mark price ($${proposal.price.toFixed(2)}) is live and priceable.`
      : `Oracle mark price is unpriceable or stale. Order placement blocked to prevent adverse execution.`,
  });

  // Check 1: Network Integrity (Chain 50383)
  if (!wallet.isConnected) {
    checks.push({
      code: 'NET_001',
      name: 'Somnia Hideki Network Integrity',
      passed: false,
      status: 'DISCONNECTED',
      severity: 'WARN',
      message: 'Wallet disconnected. Network chain ID unverified (Demo Simulation Mode).',
    });
  } else if (!wallet.isCorrectNetwork) {
    checks.push({
      code: 'NET_001',
      name: 'Somnia Hideki Network Integrity',
      passed: false,
      status: 'BLOCKED',
      severity: 'CRITICAL',
      message: `Wrong chain detected (Chain ID ${wallet.chainId ?? 'unknown'}). Expected Somnia Hideki (50383).`,
    });
  } else {
    checks.push({
      code: 'NET_001',
      name: 'Somnia Hideki Network Integrity',
      passed: true,
      status: 'PASS',
      severity: 'INFO',
      message: `Connected to Somnia Hideki Testnet (Chain ID ${SOMNIA_HIDEKI_CHAIN_ID}).`,
    });
  }

  // Check 2: Minimum Order Quantity
  const meetsMinQty = proposal.amount >= minOrderQty;
  checks.push({
    code: 'ORD_001',
    name: 'Minimum Lot Threshold',
    passed: meetsMinQty,
    status: meetsMinQty ? 'PASS' : 'BLOCKED',
    severity: meetsMinQty ? 'INFO' : 'CRITICAL',
    message: meetsMinQty
      ? `Order quantity (${proposal.amount}) meets market minimum lot size (${minOrderQty}).`
      : `Order quantity (${proposal.amount}) is below required minimum lot (${minOrderQty}). Order will revert on-chain.`,
  });

  // Check 3: Maximum Single Order Notional ($20 MVP Cap)
  const isWithinNotionalCap = proposal.notional <= MAX_SINGLE_ORDER_NOTIONAL_USD && proposal.notional > 0;
  checks.push({
    code: 'RISK_001',
    name: 'Single Order Notional Limit',
    passed: isWithinNotionalCap,
    status: isWithinNotionalCap ? 'PASS' : 'BLOCKED',
    severity: isWithinNotionalCap ? 'INFO' : 'CRITICAL',
    message: isWithinNotionalCap
      ? `Order notional ($${proposal.notional.toFixed(2)}) is within the safety cap ($${MAX_SINGLE_ORDER_NOTIONAL_USD.toFixed(2)}).`
      : `Order notional ($${proposal.notional.toFixed(2)}) exceeds maximum testnet safety cap ($${MAX_SINGLE_ORDER_NOTIONAL_USD.toFixed(2)}).`,
  });

  // Check 4: Leverage Bounds
  const isWithinLeverage = proposal.leverage <= MAX_LEVERAGE && proposal.leverage >= 1;
  checks.push({
    code: 'RISK_002',
    name: 'Maximum Account Leverage',
    passed: isWithinLeverage,
    status: isWithinLeverage ? 'PASS' : 'BLOCKED',
    severity: isWithinLeverage ? 'INFO' : 'CRITICAL',
    message: isWithinLeverage
      ? `Leverage (${proposal.leverage}x) is within dreamDEX 500 bps IMF ceiling (${MAX_LEVERAGE}x).`
      : `Requested leverage (${proposal.leverage}x) exceeds the maximum allowed ${MAX_LEVERAGE}x limit.`,
  });

  // Check 5: Collateral & Margin Verification (ACC_001) - Truthful on-chain evaluation
  let accountVerified = false;
  if (!wallet.isConnected) {
    checks.push({
      code: 'ACC_001',
      name: 'Account & MarginBank Readiness',
      passed: false,
      status: 'DISCONNECTED',
      severity: 'WARN',
      message: 'Wallet disconnected. Account readiness and MarginBank deposit unverified.',
    });
  } else if (!wallet.isCorrectNetwork) {
    checks.push({
      code: 'ACC_001',
      name: 'Account & MarginBank Readiness',
      passed: false,
      status: 'BLOCKED',
      severity: 'CRITICAL',
      message: 'Cannot verify MarginBank collateral while connected to a foreign network.',
    });
  } else if (wallet.balanceStatus === 'LOADING') {
    checks.push({
      code: 'ACC_001',
      name: 'Account & MarginBank Readiness',
      passed: false,
      status: 'LOADING',
      severity: 'INFO',
      message: 'Querying MarginBank contract on Somnia Hideki for unlocked collateral...',
    });
  } else if (wallet.balanceStatus === 'ERROR') {
    checks.push({
      code: 'ACC_001',
      name: 'Account & MarginBank Readiness',
      passed: false,
      status: 'BLOCKED',
      severity: 'CRITICAL',
      message: `Failed to inspect MarginBank: ${wallet.balanceError || 'RPC error'}.`,
    });
  } else {
    // Balance is FETCHED
    accountVerified = true;
    const unlockedUsd = parseFloat(wallet.marginBankBalance || '0');
    const hasEnoughMargin = unlockedUsd >= proposal.imfRequired;

    if (unlockedUsd <= 0) {
      checks.push({
        code: 'ACC_001',
        name: 'Account & MarginBank Readiness',
        passed: false,
        status: 'BLOCKED',
        severity: 'CRITICAL',
        message: `MarginBank collateral is $0.00 USDso. Deposit collateral to MarginBank (0x478769E1...) before executing real trades.`,
      });
    } else if (!hasEnoughMargin) {
      checks.push({
        code: 'ACC_001',
        name: 'Account & MarginBank Readiness',
        passed: false,
        status: 'BLOCKED',
        severity: 'CRITICAL',
        message: `MarginBank collateral ($${unlockedUsd.toFixed(2)} USDso) is insufficient for required initial margin ($${proposal.imfRequired.toFixed(2)} USDso).`,
      });
    } else {
      checks.push({
        code: 'ACC_001',
        name: 'Account & MarginBank Readiness',
        passed: true,
        status: 'PASS',
        severity: 'INFO',
        message: `MarginBank unlocked collateral ($${unlockedUsd.toFixed(2)} USDso) covers required initial margin ($${proposal.imfRequired.toFixed(2)} USDso).`,
      });
    }
  }

  // Determine banner title, subtitle, and severity
  let statusBannerTitle = 'All Pre-Trade Checks Passing';
  let statusBannerSubtitle = 'Real-time risk engine enforcing hard caps on Somnia Hideki (50383) • Live Testnet Ready';
  let statusBannerType: 'PASS' | 'WARN' | 'BLOCKED' | 'DISCONNECTED' | 'LOADING' = 'PASS';

  const criticalFails = checks.filter(c => !c.passed && c.severity === 'CRITICAL');
  const blockedCount = criticalFails.length;

  if (!wallet.isConnected) {
    statusBannerTitle = 'Read-Only Mode — Simulation Active';
    statusBannerSubtitle = 'Connect wallet to verify account readiness and MarginBank collateral • Zero on-chain state mutated';
    statusBannerType = 'DISCONNECTED';
  } else if (!wallet.isCorrectNetwork) {
    statusBannerTitle = 'Trading Blocked — Wrong Network';
    statusBannerSubtitle = `Connected to Chain ID ${wallet.chainId}. Switch to Somnia Hideki (50383) to inspect collateral and trade.`;
    statusBannerType = 'BLOCKED';
  } else if (wallet.balanceStatus === 'LOADING') {
    statusBannerTitle = 'Querying Somnia Hideki Account State';
    statusBannerSubtitle = 'Inspecting native STT gas, USDso token balance, and MarginBank collateral...';
    statusBannerType = 'LOADING';
  } else if (blockedCount > 0) {
    statusBannerTitle = 'Trading Blocked — Limit Breaches Detected';
    statusBannerSubtitle = `${blockedCount} check(s) flagged violations. Pre-trade risk gate active • Fail-closed policy enforced.`;
    statusBannerType = 'BLOCKED';
  } else {
    statusBannerTitle = 'All Pre-Trade Checks Passing';
    statusBannerSubtitle = 'Account collateral and market parameters verified on Somnia Hideki v2 • Live Testnet Ready';
    statusBannerType = 'PASS';
  }

  // When disconnected in demo mode, simulation preview is allowed if offline parameters (sizing, minQty, oracle) pass
  const isSafeToSimulate = meetsMinQty && isWithinNotionalCap && isWithinLeverage && isOracleValid;

  return {
    isSafeToSimulate,
    accountVerified,
    statusBannerTitle,
    statusBannerSubtitle,
    statusBannerType,
    netExposureUsd: proposal.notional,
    maxAllowedExposureUsd: MAX_SINGLE_ORDER_NOTIONAL_USD,
    marginHealthRatio: accountVerified ? 100.0 : 0.0,
    blockedOrdersCount: blockedCount,
    dailyRiskBudgetUsedUsd: 0.00,
    dailyRiskBudgetCapUsd: 100.00,
    checks,
  };
}
