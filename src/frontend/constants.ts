import { parseAbi } from 'viem';
import { MarketInfo } from './types.js';

export const SOMNIA_HIDEKI_CHAIN_ID = 50383;
export const SOMNIA_HIDEKI_CHAIN_HEX = '0xc4cf';
export const SOMNIA_RPC_URL = 'https://api.hideki2.infra.testnet.somnia.network';
export const SOMNIA_WS_URL = 'wss://api.hideki2.infra.testnet.somnia.network/ws';
export const SOMNIA_INDEXER_URL = 'https://hideki-dev.smk.somnia.host/v1/graphql';
export const SOMNIA_EXPLORER_URL = 'https://hideki.somniascan.org';

export const MARGIN_BANK_ADDRESS: `0x${string}` = '0x478769E1177C0773c43A593DCCc4Ad15F15F1394';
export const PERP_POOL_FACTORY_ADDRESS: `0x${string}` = '0xE631fAEE547baeE07353E290f0562ea67d856560';
export const FACTORY_ADDRESS = PERP_POOL_FACTORY_ADDRESS;
export const ETH_PERP_POOL: `0x${string}` = '0xd6cb1dd58580b84d76068ac21594219ce03aeddf';

// Authoritative USDso (18 decimals) on Hideki v2 testnet
export const USDSO_TOKEN_ADDRESS: `0x${string}` = '0xed7993A74dAe1e6656B704A424DcD8711aAf4F72';
// Native gas token sentinel or label
export const NATIVE_GAS_TOKEN_SYMBOL = 'STT';

// Canonical read ABIs
export const ERC20_READ_ABI = parseAbi([
  'function balanceOf(address account) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
]);

export const MARGIN_BANK_READ_ABI = parseAbi([
  'function getAccountState(address account) view returns ((int256 unlockedCollateralBalance, uint256 lockedCollateral, address[] activePerpPools))',
  'function getAccountHealth(address account) view returns (int256 equity, uint256 imReq, uint256 mmReq, uint256 cmReq)',
  'function getMarginStatus(address account) view returns (uint8)',
  'function getWithdrawableCollateral(address account) view returns (uint256)',
]);

export const PERP_POOL_READ_ABI = parseAbi([
  'function tryGetHealthSnapshot() view returns (bool ok, (uint256 oneBase, uint256 markPrice, int256 projectedCumulativeFunding, uint256 effectiveIMFBps, uint256 maintenanceMarginBps, uint256 closeOutMarginBps) snapshot)',
  'function getBookLevels(bool isBid, uint64 numLevels) view returns ((uint256 price, uint256 quantity)[])',
  'function getOrderBookParameters() view returns ((uint256 tickSize, uint256 minQuantity, uint256 lotSize))',
  'function getPerpPoolParameters() view returns ((uint256 initialMarginBps, uint256 maintenanceMarginBps, uint256 closeOutMarginBps, uint256 maxOpenInterest, uint256 maxPositionSize, uint256 takerFeeBpsTimes1k, int256 makerFeeBpsTimes1k, uint256 insuranceFundShareBps))',
]);

export const MARGIN_BANK_POSITION_READ_ABI = parseAbi([
  'function getPosition(address account, address perpPool) view returns ((int128 size, uint128 avgEntryPrice, int256 entryFundingIndex, uint64 lastUpdatedTimestampNs))',
]);

export const POOL_ORDERS_ABI = parseAbi([
  'function getOwnOpenOrders() view returns (uint128[])',
  'function getOrder(uint128 orderId) view returns ((uint128 orderId, bool isBid, address owner, uint64 userData, uint256 price, uint256 fullQuantity, uint256 quantityRemaining, uint64 expireTimestampNs))',
]);

// Keep backwards-compatibility alias for health abi
export const PERP_POOL_HEALTH_ABI = PERP_POOL_READ_ABI;

// Risk hard-caps for MVP safety
export const MAX_SINGLE_ORDER_NOTIONAL_USD = 20.00;
export const MAX_LEVERAGE = 20;
export const DEFAULT_LEVERAGE = 2; // 2x conservative leverage (50% target margin)
export const MAX_DAILY_RISK_BUDGET_USD = 100.00;
export const BASE_IMF_BPS = 500; // 5.0% -> 20x max leverage
export const MAINTENANCE_MARGIN_BPS = 250; // 2.5%

// Known Hideki markets seeded from verified registry (dynamic discovery enriches these live)
export const DEFAULT_MARKETS: MarketInfo[] = [
  {
    symbol: 'ETH-PERP',
    display: 'ETH-PERP',
    name: 'Ethereum Perpetual',
    poolAddress: ETH_PERP_POOL,
    marginBank: MARGIN_BANK_ADDRESS,
    baseToken: '0x1516ccebe983fef570bc646ebcf5e05086d4944f',
    quoteToken: USDSO_TOKEN_ADDRESS,
    baseSymbol: 'ETH',
    quoteSymbol: 'USDso',
    baseDecimals: 18,
    quoteDecimals: 18,
    markPrice: 0,
    markPriceStatus: 'LOADING',
    indexPrice: 0,
    tickSize: 0.01,
    tickSizeRaw: 10000000000000000n,
    lotSize: 0.0001,
    lotSizeRaw: 100000000000000n,
    minOrderQty: 0.0040,
    minQuantityRaw: 4000000000000000n,
    imfBps: 500,
    maxLeverage: 20,
    openInterest: 0,
    volume24h: 0,
    high24h: 0,
    low24h: 0,
    change24h: 0,
    fundingRate: 0,
    isPriceable: true,
    isSyntheticDepth: true,
    isSyntheticChart: true,
    source: 'Hideki v2 Seed Registry',
    lastUpdated: 0,
  },
  {
    symbol: 'BTC-PERP',
    display: 'BTC-PERP',
    name: 'Bitcoin Perpetual',
    poolAddress: '0x4181dd0831637cba8b1c4b4d6b6d3b482312b9a1',
    marginBank: MARGIN_BANK_ADDRESS,
    baseToken: '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599',
    quoteToken: USDSO_TOKEN_ADDRESS,
    baseSymbol: 'BTC',
    quoteSymbol: 'USDso',
    baseDecimals: 8,
    quoteDecimals: 18,
    markPrice: 0,
    markPriceStatus: 'LOADING',
    indexPrice: 0,
    tickSize: 0.10,
    tickSizeRaw: 100000000000000000n,
    lotSize: 0.00001,
    lotSizeRaw: 1000n,
    minOrderQty: 0.00013,
    minQuantityRaw: 13000n,
    imfBps: 500,
    maxLeverage: 20,
    openInterest: 0,
    volume24h: 0,
    high24h: 0,
    low24h: 0,
    change24h: 0,
    fundingRate: 0,
    isPriceable: true,
    isSyntheticDepth: true,
    isSyntheticChart: true,
    source: 'Hideki v2 Seed Registry',
    lastUpdated: 0,
  },
  {
    symbol: 'SOL-PERP',
    display: 'SOL-PERP',
    name: 'Solana Perpetual',
    poolAddress: '0xb483ec1f88998846be0689b0d1e3d9e03d4a4b5c',
    marginBank: MARGIN_BANK_ADDRESS,
    baseToken: '0x7d1afa7b718fb893db30a3abc0cfc608aacfebb0',
    quoteToken: USDSO_TOKEN_ADDRESS,
    baseSymbol: 'SOL',
    quoteSymbol: 'USDso',
    baseDecimals: 9,
    quoteDecimals: 18,
    markPrice: 0,
    markPriceStatus: 'LOADING',
    indexPrice: 0,
    tickSize: 0.01,
    tickSizeRaw: 10000000000000000n,
    lotSize: 0.01,
    lotSizeRaw: 10000000n,
    minOrderQty: 0.1,
    minQuantityRaw: 100000000n,
    imfBps: 500,
    maxLeverage: 20,
    openInterest: 0,
    volume24h: 0,
    high24h: 0,
    low24h: 0,
    change24h: 0,
    fundingRate: 0,
    isPriceable: true,
    isSyntheticDepth: true,
    isSyntheticChart: true,
    source: 'Hideki v2 Seed Registry',
    lastUpdated: 0,
  },
];
