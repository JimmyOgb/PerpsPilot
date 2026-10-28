import { describe, it, expect } from 'vitest';
import {
  quantizePriceToTick,
  quantizeAmountToLot,
  calculateNotional,
  calculateIMF,
  calculateLiquidationPrice,
  evaluateOrderRisk
} from '../src/frontend/utils/riskEngine.js';
import { OrderProposal, WalletState } from '../src/frontend/types.js';
import { SOMNIA_HIDEKI_CHAIN_ID, DEFAULT_MARKETS } from '../src/frontend/constants.js';

describe('Frontend Risk Engine & Precision Unit Tests', () => {
  it('correctly quantizes limit prices according to tick size and order side', () => {
    const tick = 0.01;
    // Bids round down
    expect(quantizePriceToTick(2366.405, tick, false)).toBe(2366.40);
    // Asks round up
    expect(quantizePriceToTick(2366.401, tick, true)).toBe(2366.41);
    // Exact ticks stay exact
    expect(quantizePriceToTick(2366.40, tick, false)).toBe(2366.40);
  });

  it('correctly quantizes order size to discrete lot increments', () => {
    const lot = 0.0001;
    expect(quantizeAmountToLot(0.008499, lot)).toBe(0.0084);
    expect(quantizeAmountToLot(0.00401, lot)).toBe(0.0040);
  });

  it('calculates notional value and IMF requirement with 500 bps leverage limit', () => {
    const price = 2366.40;
    const amount = 0.0084;
    const notional = calculateNotional(price, amount);
    expect(notional).toBe(19.8778);

    const imf = calculateIMF(notional, 500); // 5%
    expect(imf).toBe(0.9939); // ~$0.99 for $19.88 position
  });

  it('calculates liquidation prices accurately for both longs and shorts', () => {
    const entry = 2000;
    const leverage = 20; // 5% initial margin, 2.5% maintenance margin
    // Long liquidation: 2000 * (1 - (0.05 - 0.025)) = 2000 * 0.975 = 1950
    const longLiq = calculateLiquidationPrice(entry, leverage, true, 250);
    expect(longLiq).toBe(1950);

    // Short liquidation: 2000 * (1 + (0.05 - 0.025)) = 2000 * 1.025 = 2050
    const shortLiq = calculateLiquidationPrice(entry, leverage, false, 250);
    expect(shortLiq).toBe(2050);
  });

  it('evaluates pre-trade risk and rejects orders below minimum lot quantity', () => {
    const minQty = 0.0040;
    const proposal: OrderProposal = {
      market: 'ETH-PERP',
      side: 'BUY_LONG',
      type: 'LIMIT',
      price: 2366.40,
      amount: 0.0039, // Below minQty 0.0040
      notional: 9.23,
      leverage: 20,
      imfRequired: 0.46,
      estFee: 0.005,
      estLiquidationPrice: 2307.24,
      slippageTolerance: 0.5,
      timestamp: Date.now(),
      clientNonce: '0x123',
    };

    const wallet: WalletState = {
      address: '0x1111111111111111111111111111111111111111',
      chainId: SOMNIA_HIDEKI_CHAIN_ID,
      isConnected: true,
      isConnecting: false,
      isCorrectNetwork: true,
      sttBalance: '1.0000',
      sttRaw: 1000000000000000000n,
      usdsoWalletBalance: '50.00',
      usdsoRaw: 50000000000000000000n,
      marginBankBalance: '25.00',
      unlockedCollateralRaw: 25000000000000000000n,
      balanceStatus: 'FETCHED',
    };

    const evalResult = evaluateOrderRisk(proposal, wallet, minQty);
    expect(evalResult.isSafeToSimulate).toBe(false);
    expect(evalResult.blockedOrdersCount).toBe(1);
    const minCheck = evalResult.checks.find(c => c.code === 'ORD_001');
    expect(minCheck?.passed).toBe(false);
  });

  it('blocks order evaluation when connected to an unsupported chain', () => {
    const proposal: OrderProposal = {
      market: 'ETH-PERP',
      side: 'BUY_LONG',
      type: 'LIMIT',
      price: 2366.40,
      amount: 0.0084,
      notional: 19.88,
      leverage: 20,
      imfRequired: 0.99,
      estFee: 0.01,
      estLiquidationPrice: 2307.24,
      slippageTolerance: 0.5,
      timestamp: Date.now(),
      clientNonce: '0x123',
    };

    const wrongChainWallet: WalletState = {
      address: '0x1111111111111111111111111111111111111111',
      chainId: 1, // Ethereum Mainnet (wrong!)
      isConnected: true,
      isConnecting: false,
      isCorrectNetwork: false,
      sttBalance: null,
      sttRaw: null,
      usdsoWalletBalance: null,
      usdsoRaw: null,
      marginBankBalance: null,
      unlockedCollateralRaw: null,
      balanceStatus: 'IDLE',
    };

    const evalResult = evaluateOrderRisk(proposal, wrongChainWallet, 0.0040);
    expect(evalResult.isSafeToSimulate).toBe(true); // Sizing is valid for demo simulation
    expect(evalResult.statusBannerType).toBe('BLOCKED');
    expect(evalResult.statusBannerTitle).toContain('Wrong Network');
    const netCheck = evalResult.checks.find(c => c.code === 'NET_001');
    expect(netCheck?.passed).toBe(false);
    expect(netCheck?.severity).toBe('CRITICAL');
  });

  it('blocks order evaluation when notional exceeds the $20 safety cap', () => {
    const proposal: OrderProposal = {
      market: 'ETH-PERP',
      side: 'BUY_LONG',
      type: 'LIMIT',
      price: 2366.40,
      amount: 0.02, // ~$47 notional
      notional: 47.33,
      leverage: 20,
      imfRequired: 2.36,
      estFee: 0.02,
      estLiquidationPrice: 2307.24,
      slippageTolerance: 0.5,
      timestamp: Date.now(),
      clientNonce: '0x123',
    };

    const wallet: WalletState = {
      address: '0x1111111111111111111111111111111111111111',
      chainId: SOMNIA_HIDEKI_CHAIN_ID,
      isConnected: true,
      isConnecting: false,
      isCorrectNetwork: true,
      sttBalance: '1.0000',
      sttRaw: 1000000000000000000n,
      usdsoWalletBalance: '50.00',
      usdsoRaw: 50000000000000000000n,
      marginBankBalance: '25.00',
      unlockedCollateralRaw: 25000000000000000000n,
      balanceStatus: 'FETCHED',
    };

    const evalResult = evaluateOrderRisk(proposal, wallet, 0.0040);
    expect(evalResult.isSafeToSimulate).toBe(false);
    const notionalCheck = evalResult.checks.find(c => c.code === 'RISK_001');
    expect(notionalCheck?.passed).toBe(false);
    expect(notionalCheck?.severity).toBe('CRITICAL');
  });

  // --- STAGE D.3 REGRESSION TESTS ---

  it('remediates SEC-01 & SEC-02: disconnected wallet balances remain null and ACC_001 is DISCONNECTED', () => {
    const proposal: OrderProposal = {
      market: 'ETH-PERP',
      side: 'BUY_LONG',
      type: 'LIMIT',
      price: 2366.40,
      amount: 0.0084,
      notional: 19.88,
      leverage: 20,
      imfRequired: 0.99,
      estFee: 0.01,
      estLiquidationPrice: 2254.10,
      slippageTolerance: 0.5,
      timestamp: Date.now(),
      clientNonce: '0x123',
    };

    const disconnectedWallet: WalletState = {
      address: null,
      chainId: null,
      isConnected: false,
      isConnecting: false,
      isCorrectNetwork: false,
      sttBalance: null,
      sttRaw: null,
      usdsoWalletBalance: null,
      usdsoRaw: null,
      marginBankBalance: null,
      unlockedCollateralRaw: null,
      balanceStatus: 'IDLE',
    };

    const evalResult = evaluateOrderRisk(proposal, disconnectedWallet, 0.0040);
    expect(evalResult.accountVerified).toBe(false);
    expect(evalResult.statusBannerType).toBe('DISCONNECTED');
    expect(evalResult.statusBannerTitle).toContain('Read-Only Mode');

    const accCheck = evalResult.checks.find(c => c.code === 'ACC_001');
    expect(accCheck?.passed).toBe(false);
    expect(accCheck?.status).toBe('DISCONNECTED');
    expect(accCheck?.message).toContain('Wallet disconnected');
  });

  it('remediates SEC-02: ACC_001 fails when connected wallet has zero MarginBank deposit', () => {
    const proposal: OrderProposal = {
      market: 'ETH-PERP',
      side: 'BUY_LONG',
      type: 'LIMIT',
      price: 2366.40,
      amount: 0.0084,
      notional: 19.88,
      leverage: 20,
      imfRequired: 0.99,
      estFee: 0.01,
      estLiquidationPrice: 2254.10,
      slippageTolerance: 0.5,
      timestamp: Date.now(),
      clientNonce: '0x123',
    };

    const zeroMarginWallet: WalletState = {
      address: '0x2222222222222222222222222222222222222222',
      chainId: SOMNIA_HIDEKI_CHAIN_ID,
      isConnected: true,
      isConnecting: false,
      isCorrectNetwork: true,
      sttBalance: '0.5000',
      sttRaw: 500000000000000000n,
      usdsoWalletBalance: '10.00',
      usdsoRaw: 10000000000000000000n,
      marginBankBalance: '0.00', // Zero deposit!
      unlockedCollateralRaw: 0n,
      balanceStatus: 'FETCHED',
    };

    const evalResult = evaluateOrderRisk(proposal, zeroMarginWallet, 0.0040);
    expect(evalResult.accountVerified).toBe(true);
    expect(evalResult.statusBannerType).toBe('BLOCKED');
    expect(evalResult.statusBannerTitle).toContain('Trading Blocked');

    const accCheck = evalResult.checks.find(c => c.code === 'ACC_001');
    expect(accCheck?.passed).toBe(false);
    expect(accCheck?.status).toBe('BLOCKED');
    expect(accCheck?.message).toContain('MarginBank collateral is $0.00 USDso');
  });

  it('remediates SEC-02: ACC_001 blocks when RPC fails to inspect balances', () => {
    const proposal: OrderProposal = {
      market: 'ETH-PERP',
      side: 'BUY_LONG',
      type: 'LIMIT',
      price: 2366.40,
      amount: 0.0084,
      notional: 19.88,
      leverage: 20,
      imfRequired: 0.99,
      estFee: 0.01,
      estLiquidationPrice: 2254.10,
      slippageTolerance: 0.5,
      timestamp: Date.now(),
      clientNonce: '0x123',
    };

    const rpcErrorWallet: WalletState = {
      address: '0x2222222222222222222222222222222222222222',
      chainId: SOMNIA_HIDEKI_CHAIN_ID,
      isConnected: true,
      isConnecting: false,
      isCorrectNetwork: true,
      sttBalance: null,
      sttRaw: null,
      usdsoWalletBalance: null,
      usdsoRaw: null,
      marginBankBalance: null,
      unlockedCollateralRaw: null,
      balanceStatus: 'ERROR',
      balanceError: 'Network timeout',
    };

    const evalResult = evaluateOrderRisk(proposal, rpcErrorWallet, 0.0040);
    expect(evalResult.accountVerified).toBe(false);
    expect(evalResult.statusBannerType).toBe('BLOCKED');
    const accCheck = evalResult.checks.find(c => c.code === 'ACC_001');
    expect(accCheck?.passed).toBe(false);
    expect(accCheck?.status).toBe('BLOCKED');
    expect(accCheck?.message).toContain('Failed to inspect MarginBank');
  });

  it('remediates SEC-02: ACC_001 passes when verified MarginBank collateral covers IMF requirement', () => {
    const proposal: OrderProposal = {
      market: 'ETH-PERP',
      side: 'BUY_LONG',
      type: 'LIMIT',
      price: 2366.40,
      amount: 0.0084,
      notional: 19.88,
      leverage: 20,
      imfRequired: 0.99,
      estFee: 0.01,
      estLiquidationPrice: 2254.10,
      slippageTolerance: 0.5,
      timestamp: Date.now(),
      clientNonce: '0x123',
    };

    const fundedWallet: WalletState = {
      address: '0x3333333333333333333333333333333333333333',
      chainId: SOMNIA_HIDEKI_CHAIN_ID,
      isConnected: true,
      isConnecting: false,
      isCorrectNetwork: true,
      sttBalance: '1.0000',
      sttRaw: 1000000000000000000n,
      usdsoWalletBalance: '50.00',
      usdsoRaw: 50000000000000000000n,
      marginBankBalance: '25.00', // $25 covers $0.99 IMF
      unlockedCollateralRaw: 25000000000000000000n,
      balanceStatus: 'FETCHED',
    };

    const evalResult = evaluateOrderRisk(proposal, fundedWallet, 0.0040);
    expect(evalResult.accountVerified).toBe(true);
    expect(evalResult.statusBannerType).toBe('PASS');
    expect(evalResult.statusBannerTitle).toContain('All Pre-Trade Checks Passing');
    expect(evalResult.blockedOrdersCount).toBe(0);

    const accCheck = evalResult.checks.find(c => c.code === 'ACC_001');
    expect(accCheck?.passed).toBe(true);
    expect(accCheck?.status).toBe('PASS');
    expect(accCheck?.message).toContain('MarginBank unlocked collateral ($25.00 USDso) covers');
  });

  it('remediates SEC-03: default markets carry explicit synthetic depth and chart flags', () => {
    const ethMarket = DEFAULT_MARKETS.find(m => m.symbol === 'ETH-PERP');
    expect(ethMarket).toBeDefined();
    expect(ethMarket?.isSyntheticDepth).toBe(true);
    expect(ethMarket?.isSyntheticChart).toBe(true);
  });

  // --- STAGE F.10 PRODUCTION HEALTH & REPAIR REGRESSION TESTS ---

  it('remediates PROD-01: pure constants module is decoupled from dotenv and process globals', async () => {
    const constants = await import('../src/config/constants.js');
    expect(constants.EXPECTED_HIDEKI_CHAIN_ID).toBe(50383);
    expect(constants.DEFAULT_HIDEKI_RPC_URL).toContain('hideki2.infra.testnet.somnia.network');
    expect(constants.DEFAULT_HIDEKI_WS_RPC_URL).toContain('wss://');
    expect(constants.DEFAULT_SOMNIA_INDEXER_URL).toContain('graphql');
  });

  it('remediates PROD-02: OrderProposal supports poolAddress for deterministic canonical digest generation', async () => {
    const { OrderPlanner } = await import('../src/execution/OrderPlanner.js');
    const ethDigest = OrderPlanner.computePlanDigest({
      chainId: SOMNIA_HIDEKI_CHAIN_ID,
      walletAddress: '0x0000000000000000000000000000000000000000',
      marketSymbol: 'ETH-PERP',
      poolAddress: '0xd6cb1dd58580b84d76068ac21594219ce03aeddf',
      side: 'BUY_LONG',
      orderType: 'LIMIT',
      price: 2366.40,
      quantity: 0.0084,
      leverage: 20,
      clientNonce: '0x123',
    });

    const btcDigest = OrderPlanner.computePlanDigest({
      chainId: SOMNIA_HIDEKI_CHAIN_ID,
      walletAddress: '0x0000000000000000000000000000000000000000',
      marketSymbol: 'BTC-PERP',
      poolAddress: '0x4181dd0831637cba8b1c4b4d6b6d3b482312b9a1',
      side: 'BUY_LONG',
      orderType: 'LIMIT',
      price: 65000.00,
      quantity: 0.0003,
      leverage: 20,
      clientNonce: '0x123',
    });

    expect(ethDigest).toBeDefined();
    expect(btcDigest).toBeDefined();
    expect(ethDigest).not.toBe(btcDigest);
    expect(ethDigest).toMatch(/^0x[a-f0-9]{64}$/);
    expect(btcDigest).toMatch(/^0x[a-f0-9]{64}$/);
  });
});
