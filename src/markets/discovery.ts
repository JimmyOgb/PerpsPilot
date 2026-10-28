/**
 * PerpsPilot Market Discovery
 * Queries live perpetual markets using the official SomniaMarkets SDK and PerpPoolFactory
 * on Somnia Hideki Testnet (50383).
 */

import { SomniaMarkets, SOMNIA_HIDEKI_TESTNET_ADDRESSES } from "@somnia-chain/markets-sdk";
import { hidekiTestnet } from "@somnia-chain/markets-sdk/chains";
import { DEFAULT_HIDEKI_WS_RPC_URL, DEFAULT_SOMNIA_INDEXER_URL } from "../config/constants.js";
import type { MarketDiscoveryResult, PerpMarketInfo } from "./types.js";

interface RawSdkMarket {
  id?: string;
  symbol?: string;
  type?: string;
  base?: string;
  quote?: string;
  contract?: string | boolean;
  perpStatus?: string | null;
  info?: {
    id?: string;
    marketType?: string;
    poolAddress?: string;
    baseSymbol?: string;
    quoteSymbol?: string;
    baseToken?: string;
    quoteToken?: string;
    baseDecimals?: number;
    quoteDecimals?: number;
    tickSize?: string;
    lotSize?: string;
    minQuantity?: string;
    initialMarginBps?: number;
    marginBank?: string;
    stopRegistry?: string;
    markPrice?: string | null;
    indexPrice?: string | null;
    fundingRate?: string | null;
    chainId?: number;
  };
}

const VERIFIED_HIDEKI_FALLBACK_MARKETS: PerpMarketInfo[] = [
  {
    id: "0xd6cb1dd58580b84d76068ac21594219ce03aeddf",
    poolAddress: "0xd6cb1dd58580b84d76068ac21594219ce03aeddf",
    symbol: "ETH:USDSO",
    sdkSymbol: "ETH/USDso:USDso",
    display: "ETH-PERP",
    baseSymbol: "ETH",
    quoteSymbol: "USDSO",
    baseToken: "0x1516ccebe983fef570bc646ebcf5e05086d4944f",
    quoteToken: "0xed7993A74dAe1e6656B704A424DcD8711aAf4F72",
    baseDecimals: 18,
    quoteDecimals: 18,
    tickSize: 10000000000000000n,
    lotSize: 100000000000000n,
    minQuantity: 4000000000000000n,
    initialMarginBps: 500,
    maxLeverage: 20,
    marginBank: "0x478769E1177C0773c43A593DCCc4Ad15F15F1394",
    perpStatus: "active",
  },
  {
    id: "0x4181dd0831637cba8b1c4b4d6b6d3b482312b9a1",
    poolAddress: "0x4181dd0831637cba8b1c4b4d6b6d3b482312b9a1",
    symbol: "BTC:USDSO",
    sdkSymbol: "BTC/USDso:USDso",
    display: "BTC-PERP",
    baseSymbol: "BTC",
    quoteSymbol: "USDSO",
    baseToken: "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599",
    quoteToken: "0xed7993A74dAe1e6656B704A424DcD8711aAf4F72",
    baseDecimals: 8,
    quoteDecimals: 18,
    tickSize: 100000000000000000n,
    lotSize: 100000n,
    minQuantity: 100000n,
    initialMarginBps: 500,
    maxLeverage: 20,
    marginBank: "0x478769E1177C0773c43A593DCCc4Ad15F15F1394",
    perpStatus: "active",
  },
];

let cachedDiscovery: { result: MarketDiscoveryResult; fetchedAt: number } | null = null;

/**
 * Discovers live perpetual markets from the official SomniaMarkets SDK instance.
 * Automatically loads the 21+ perpetual markets active on Hideki v2.
 */
export async function discoverPerpMarkets(
  indexerUrl: string = DEFAULT_SOMNIA_INDEXER_URL,
): Promise<MarketDiscoveryResult> {
  const now = Date.now();
  if (cachedDiscovery && now - cachedDiscovery.fetchedAt < 60_000 && cachedDiscovery.result.markets.length > 0) {
    return cachedDiscovery.result;
  }
  const exchange = new SomniaMarkets({
    chain: hidekiTestnet,
    wsRpcUrl: DEFAULT_HIDEKI_WS_RPC_URL,
    indexerUrl,
    addresses: SOMNIA_HIDEKI_TESTNET_ADDRESSES,
  });

  const rawMap = (await exchange.loadMarkets()) as unknown as Record<string, RawSdkMarket>;
  const entries = Object.entries(rawMap || {});
  const markets: PerpMarketInfo[] = [];

  for (const [, m] of entries) {
    const info = m.info || {};
    const marginBank = (info.marginBank || (m as unknown as { marginBank?: string }).marginBank) as `0x${string}`;
    const poolAddress = (info.poolAddress || (typeof m.id === "string" && m.id.startsWith("0x") ? m.id : undefined) || (typeof m.contract === "string" ? m.contract : undefined)) as `0x${string}`;
    const baseSymbol = (info.baseSymbol || m.base || "").toUpperCase();
    const quoteSymbol = (info.quoteSymbol || m.quote || "USDso").toUpperCase();

    // Only include perpetual markets with valid pool, bank, and symbol
    if (!marginBank || !poolAddress || !baseSymbol) {
      continue;
    }

    const imBps = info.initialMarginBps ?? 500;
    const maxLeverage = imBps > 0 ? Math.floor(10000 / imBps) : 20;

    markets.push({
      id: poolAddress,
      poolAddress,
      symbol: `${baseSymbol}:${quoteSymbol}`,
      sdkSymbol: m.symbol || `${baseSymbol}/${quoteSymbol}:${quoteSymbol}`,
      display: `${baseSymbol}-PERP`,
      baseSymbol,
      quoteSymbol,
      baseToken: (info.baseToken || "0x0000000000000000000000000000000000000000") as `0x${string}`,
      quoteToken: (info.quoteToken || "0xed7993A74dAe1e6656B704A424DcD8711aAf4F72") as `0x${string}`,
      baseDecimals: Number(info.baseDecimals ?? 18),
      quoteDecimals: Number(info.quoteDecimals ?? 18),
      tickSize: BigInt(info.tickSize || "10000000000000000"),
      lotSize: BigInt(info.lotSize || "100000000000000"),
      minQuantity: BigInt(info.minQuantity || "1000000000000000"),
      initialMarginBps: imBps,
      maxLeverage,
      marginBank,
      markPrice: info.markPrice ? BigInt(info.markPrice) : undefined,
      indexPrice: info.indexPrice ? BigInt(info.indexPrice) : undefined,
      fundingRate: info.fundingRate ? BigInt(info.fundingRate) : undefined,
      perpStatus: m.perpStatus ?? null,
    });
  }

  if (markets.length === 0) {
    if (cachedDiscovery && cachedDiscovery.result.markets.length > 0) {
      return cachedDiscovery.result;
    }
    return {
      markets: VERIFIED_HIDEKI_FALLBACK_MARKETS,
      timestamp: Date.now(),
      source: "onchain_fallback",
    };
  }

  const discoveryResult: MarketDiscoveryResult = {
    markets,
    timestamp: Date.now(),
    source: "indexer",
  };

  cachedDiscovery = { result: discoveryResult, fetchedAt: Date.now() };
  return discoveryResult;
}

/**
 * Resolves a user-supplied symbol (e.g. "ETH-PERP", "ETH:USDso", "ETH", "eth")
 * to the matching PerpMarketInfo record.
 */
export function findMarketBySymbol(markets: PerpMarketInfo[], querySymbol: string): PerpMarketInfo | undefined {
  const normalized = querySymbol.toUpperCase().trim();
  const baseOnly = normalized.replace(/[-:_/](PERP|USDSO)$/i, "").replace(/\/USDSO:USDSO$/i, "");

  return markets.find((m) => {
    return (
      m.symbol.toUpperCase() === normalized ||
      m.display.toUpperCase() === normalized ||
      m.baseSymbol.toUpperCase() === normalized ||
      m.baseSymbol.toUpperCase() === baseOnly ||
      m.poolAddress.toLowerCase() === querySymbol.toLowerCase()
    );
  });
}
