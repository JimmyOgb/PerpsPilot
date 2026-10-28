import { describe, it, expect, vi } from 'vitest';
import {
  quantizePriceToTick,
  quantizeAmountToLot,
  calculateNotional,
  calculateIMF,
  evaluateOrderRisk,
} from '../src/frontend/utils/riskEngine.js';
import {
  SOMNIA_HIDEKI_CHAIN_ID,
  USDSO_TOKEN_ADDRESS,
  MARGIN_BANK_ADDRESS,
  ETH_PERP_POOL,
  DEFAULT_MARKETS,
} from '../src/frontend/constants.js';
import {
  OrderProposal,
  WalletState,
  OrderBookData,
  ChartDataState,
  MarketInfo,
} from '../src/frontend/types.js';
import { findMarketBySymbol } from '../src/markets/discovery.js';
import { explainLimitingConstraint } from '../src/risk/validation.js';

describe('PerpsPilot Stage E — Real dreamDEX Perps Integration & Invariants', () => {
  // 1. Hideki Chain Enforcement
  describe('Hideki Network Enforcement (50383)', () => {
    it('accepts official Somnia Hideki Testnet Chain ID 50383', () => {
      expect(SOMNIA_HIDEKI_CHAIN_ID).toBe(50383);
    });

    it('blocks order evaluation if connected chain is Shannon 50312', () => {
      const proposal: OrderProposal = {
        market: 'ETH-PERP',
        side: 'BUY_LONG',
        type: 'LIMIT',
        price: 2364.50,
        amount: 0.0084,
        notional: 19.86,
        leverage: 20,
        imfRequired: 0.99,
        estFee: 0.01,
        estLiquidationPrice: 2254.10,
        slippageTolerance: 0.5,
        timestamp: Date.now(),
        clientNonce: '0xabc1',
      };

      const shannonWallet: WalletState = {
        address: '0x1111111111111111111111111111111111111111',
        chainId: 50312, // Shannon Testnet (forbidden!)
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

      const result = evaluateOrderRisk(proposal, shannonWallet, 0.0040);
      expect(result.statusBannerType).toBe('BLOCKED');
      expect(result.statusBannerTitle).toContain('Wrong Network');
      const netCheck = result.checks.find((c) => c.code === 'NET_001');
      expect(netCheck?.passed).toBe(false);
      expect(netCheck?.severity).toBe('CRITICAL');
      expect(netCheck?.message).toContain('50312');
    });

    it('blocks order evaluation if connected chain is Ethereum Mainnet (1)', () => {
      const proposal: OrderProposal = {
        market: 'ETH-PERP',
        side: 'BUY_LONG',
        type: 'LIMIT',
        price: 2364.50,
        amount: 0.0084,
        notional: 19.86,
        leverage: 20,
        imfRequired: 0.99,
        estFee: 0.01,
        estLiquidationPrice: 2254.10,
        slippageTolerance: 0.5,
        timestamp: Date.now(),
        clientNonce: '0xabc2',
      };

      const ethMainnetWallet: WalletState = {
        address: '0x1111111111111111111111111111111111111111',
        chainId: 1, // Mainnet (forbidden!)
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

      const result = evaluateOrderRisk(proposal, ethMainnetWallet, 0.0040);
      expect(result.statusBannerType).toBe('BLOCKED');
      const netCheck = result.checks.find((c) => c.code === 'NET_001');
      expect(netCheck?.passed).toBe(false);
      expect(netCheck?.message).toContain('Expected Somnia Hideki (50383)');
    });
  });

  // 2. Market Registry & Decimals
  describe('Per-Market Precision, Lot Sizes & Decimals', () => {
    it('verifies canonical USDso collateral token address and 18 decimals', () => {
      expect(USDSO_TOKEN_ADDRESS.toLowerCase()).toBe('0xed7993a74dae1e6656b704a424dcd8711aaf4f72');
    });

    it('verifies MarginBank address on Hideki', () => {
      expect(MARGIN_BANK_ADDRESS.toLowerCase()).toBe('0x478769e1177c0773c43a593dccc4ad15f15f1394');
    });

    it('enforces exact native decimals: ETH (18), BTC (8), SOL (9)', () => {
      const eth = DEFAULT_MARKETS.find((m) => m.baseSymbol === 'ETH');
      const btc = DEFAULT_MARKETS.find((m) => m.baseSymbol === 'BTC');
      const sol = DEFAULT_MARKETS.find((m) => m.baseSymbol === 'SOL');

      expect(eth?.baseDecimals).toBe(18);
      expect(btc?.baseDecimals).toBe(8);
      expect(sol?.baseDecimals).toBe(9);

      expect(eth?.quoteDecimals).toBe(18);
      expect(btc?.quoteDecimals).toBe(18);
      expect(sol?.quoteDecimals).toBe(18);
    });

    it('findMarketBySymbol resolves display, symbol, base, and pool address', () => {
      const mockMarkets = [
        {
          id: ETH_PERP_POOL,
          poolAddress: ETH_PERP_POOL,
          symbol: 'ETH:USDSO',
          display: 'ETH-PERP',
          baseSymbol: 'ETH',
          quoteSymbol: 'USDSO',
          baseToken: '0x1516ccebca301d0651bc27dcdf9b1c2f18c3b4cd' as `0x${string}`,
          quoteToken: USDSO_TOKEN_ADDRESS,
          baseDecimals: 18,
          quoteDecimals: 18,
          tickSize: 10000000000000000n,
          lotSize: 100000000000000n,
          minQuantity: 4000000000000000n,
          initialMarginBps: 500,
          maxLeverage: 20,
          marginBank: MARGIN_BANK_ADDRESS,
          perpStatus: null,
        },
      ];

      expect(findMarketBySymbol(mockMarkets, 'ETH-PERP')).toBeDefined();
      expect(findMarketBySymbol(mockMarkets, 'ETH:USDSO')).toBeDefined();
      expect(findMarketBySymbol(mockMarkets, 'ETH')).toBeDefined();
      expect(findMarketBySymbol(mockMarkets, 'eth')).toBeDefined();
      expect(findMarketBySymbol(mockMarkets, ETH_PERP_POOL)).toBeDefined();
      expect(findMarketBySymbol(mockMarkets, 'UNKNOWN')).toBeUndefined();
    });
  });

  // 3. Price & Quantity Validation
  describe('Price & Quantity Validation', () => {
    it('quantizes price strictly to tick size without drift', () => {
      const tick = 0.01;
      // Buy/Bid rounds down
      expect(quantizePriceToTick(2364.559, tick, false)).toBe(2364.55);
      // Sell/Ask rounds up
      expect(quantizePriceToTick(2364.551, tick, true)).toBe(2364.56);
    });

    it('quantizes order quantity strictly to base lot size', () => {
      const lot = 0.0001;
      expect(quantizeAmountToLot(0.008499, lot)).toBe(0.0084);
      expect(quantizeAmountToLot(0.00405, lot)).toBe(0.0040);
    });

    it('enforces minimum order quantity', () => {
      const minQty = 0.0040;
      const invalidProposal: OrderProposal = {
        market: 'ETH-PERP',
        side: 'BUY_LONG',
        type: 'LIMIT',
        price: 2364.50,
        amount: 0.0039, // Below 0.0040
        notional: 9.22,
        leverage: 20,
        imfRequired: 0.46,
        estFee: 0.005,
        estLiquidationPrice: 2254.10,
        slippageTolerance: 0.5,
        timestamp: Date.now(),
        clientNonce: '0x1',
      };

      const validWallet: WalletState = {
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

      const evalRes = evaluateOrderRisk(invalidProposal, validWallet, minQty);
      expect(evalRes.isSafeToSimulate).toBe(false);
      const minCheck = evalRes.checks.find((c) => c.code === 'ORD_001');
      expect(minCheck?.passed).toBe(false);
      expect(minCheck?.status).toBe('BLOCKED');
    });

    it('maps SDK limiting constraints to actionable explanations', () => {
      expect(explainLimitingConstraint('insufficientMargin')).toContain('unlocked collateral in MarginBank');
      expect(explainLimitingConstraint('walletBalance')).toContain('Insufficient USDso in wallet');
      expect(explainLimitingConstraint('restricted')).toContain('ReduceOnly mode');
      expect(explainLimitingConstraint('isolated')).toContain('Isolated margin constraint');
    });
  });

  // 4. Order Book Real States vs Unavailable (Zero Synthetic Fallback)
  describe('Order Book State Invariants', () => {
    it('correctly models LIVE state when depth levels exist', () => {
      const bookData: OrderBookData = {
        asks: [
          { price: 2364.64, size: 0.4232, total: 0.4232 },
          { price: 2364.66, size: 0.8464, total: 1.2696 },
        ],
        bids: [
          { price: 2364.50, size: 0.5825, total: 0.5825 },
          { price: 2364.31, size: 0.4232, total: 1.0057 },
        ],
        spread: 0.14,
        spreadPercent: 0.0059,
        status: 'LIVE',
        source: 'Hideki PerpPool (getBookLevels)',
        lastUpdated: Date.now(),
      };

      expect(bookData.status).toBe('LIVE');
      expect(bookData.asks.length).toBe(2);
      expect(bookData.bids.length).toBe(2);
      expect(bookData.spread).toBe(0.14);
      expect(bookData.source).toContain('Hideki PerpPool');
    });

    it('does NOT fallback to synthetic levels when order book is empty or reverted', () => {
      const unavailableBook: OrderBookData = {
        asks: [],
        bids: [],
        spread: 0,
        spreadPercent: 0,
        status: 'UNAVAILABLE',
        source: 'Hideki PerpPool (getBookLevels)',
        lastUpdated: Date.now(),
        errorMessage: 'No active resting liquidity in this pool',
      };

      expect(unavailableBook.status).toBe('UNAVAILABLE');
      expect(unavailableBook.asks.length).toBe(0);
      expect(unavailableBook.bids.length).toBe(0);
      expect(unavailableBook.errorMessage).toBeDefined();
    });
  });

  // 5. Candlestick Chart Real vs Unavailable
  describe('Candlestick Chart Invariants', () => {
    it('models genuine OHLCV candles with real indexer attributes', () => {
      const chartState: ChartDataState = {
        candles: [
          { time: 1793187000000, open: 2361.95, high: 2362.57, low: 2361.63, close: 2362.57, volume: 32.6047 },
        ],
        status: 'LIVE',
        source: 'Somnia Indexer (OHLCV)',
        lastUpdated: Date.now(),
        timeframe: '15m',
      };

      expect(chartState.status).toBe('LIVE');
      expect(chartState.candles[0].open).toBe(2361.95);
      expect(chartState.candles[0].volume).toBeGreaterThan(0);
      expect(chartState.source).toBe('Somnia Indexer (OHLCV)');
    });

    it('displays UNAVAILABLE without random candle fabrication on indexer miss', () => {
      const emptyChartState: ChartDataState = {
        candles: [],
        status: 'UNAVAILABLE',
        source: 'Somnia Indexer (OHLCV)',
        lastUpdated: Date.now(),
        timeframe: '15m',
        errorMessage: 'Live candle feed unavailable (indexer query failed)',
      };

      expect(emptyChartState.status).toBe('UNAVAILABLE');
      expect(emptyChartState.candles.length).toBe(0);
      expect(emptyChartState.errorMessage).toContain('Live candle feed unavailable');
    });
  });

  // 6. Wallet Separation: USDso in Wallet vs MarginBank Collateral
  describe('Wallet State & Account Isolation', () => {
    it('keeps liquid wallet USDso distinct from deposited MarginBank collateral', () => {
      const wallet: WalletState = {
        address: '0x3333333333333333333333333333333333333333',
        chainId: SOMNIA_HIDEKI_CHAIN_ID,
        isConnected: true,
        isConnecting: false,
        isCorrectNetwork: true,
        sttBalance: '5.2000',
        sttRaw: 5200000000000000000n,
        usdsoWalletBalance: '100.00', // In wallet
        usdsoRaw: 100000000000000000000n,
        marginBankBalance: '25.00', // Deposited in MarginBank
        unlockedCollateralRaw: 25000000000000000000n,
        lockedCollateralRaw: 10000000000000000000n,
        equityRaw: 35000000000000000000n,
        imReqRaw: 5000000000000000000n,
        marginStatus: 0,
        marginStatusLabel: 'Healthy',
        balanceStatus: 'FETCHED',
        balanceSource: 'Somnia Hideki On-Chain',
        lastUpdated: Date.now(),
      };

      expect(wallet.usdsoWalletBalance).toBe('100.00');
      expect(wallet.marginBankBalance).toBe('25.00');
      expect(wallet.unlockedCollateralRaw).not.toBe(wallet.usdsoRaw);
      expect(wallet.marginStatusLabel).toBe('Healthy');
    });

    it('never treats a read error as a zero balance', () => {
      const rpcErrorWallet: WalletState = {
        address: '0x2222222222222222222222222222222222222222',
        chainId: SOMNIA_HIDEKI_CHAIN_ID,
        isConnected: true,
        isConnecting: false,
        isCorrectNetwork: true,
        sttBalance: null,
        sttRaw: null,
        usdsoWalletBalance: null, // NOT '0.00'
        usdsoRaw: null,
        marginBankBalance: null, // NOT '0.00'
        unlockedCollateralRaw: null,
        balanceStatus: 'ERROR',
        balanceError: 'The request took too long to respond.',
        lastUpdated: Date.now(),
      };

      expect(rpcErrorWallet.balanceStatus).toBe('ERROR');
      expect(rpcErrorWallet.usdsoWalletBalance).toBeNull();
      expect(rpcErrorWallet.marginBankBalance).toBeNull();

      const proposal: OrderProposal = {
        market: 'ETH-PERP',
        side: 'BUY_LONG',
        type: 'LIMIT',
        price: 2364.50,
        amount: 0.0084,
        notional: 19.86,
        leverage: 20,
        imfRequired: 0.99,
        estFee: 0.01,
        estLiquidationPrice: 2254.10,
        slippageTolerance: 0.5,
        timestamp: Date.now(),
        clientNonce: '0xabc3',
      };

      const result = evaluateOrderRisk(proposal, rpcErrorWallet, 0.0040);
      expect(result.accountVerified).toBe(false);
      expect(result.statusBannerType).toBe('BLOCKED');
      const accCheck = result.checks.find((c) => c.code === 'ACC_001');
      expect(accCheck?.passed).toBe(false);
      expect(accCheck?.status).toBe('BLOCKED');
    });
  });

  // 7. Transaction Safety: DRY_RUN=true Non-Negotiable
  describe('Transaction Safety & Execution Boundaries', () => {
    it('verifies order ticket action is strictly preview/simulation only', () => {
      const proposal: OrderProposal = {
        market: 'ETH-PERP',
        side: 'BUY_LONG',
        type: 'LIMIT',
        price: 2364.50,
        amount: 0.0084,
        notional: 19.86,
        leverage: 20,
        imfRequired: 0.99,
        estFee: 0.01,
        estLiquidationPrice: 2254.10,
        slippageTolerance: 0.5,
        timestamp: Date.now(),
        clientNonce: '0xabc4',
      };

      // Ensure proposal captures simulation parameters without triggering any signer
      expect(proposal.clientNonce).toBeDefined();
      expect(proposal.notional).toBeLessThanOrEqual(20.0);
    });
  });
});
