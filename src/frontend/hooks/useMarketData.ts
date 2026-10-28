import { useState, useEffect, useRef, useMemo } from 'react';
import { createPublicClient, http, formatUnits } from 'viem';
import {
  DEFAULT_MARKETS,
  SOMNIA_RPC_URL,
  PERP_POOL_READ_ABI,
  USDSO_TOKEN_ADDRESS,
} from '../constants.js';
import {
  MarketInfo,
  OrderBookData,
  OrderBookLevel,
  ChartDataState,
  TradesDataState,
  TradeRecord,
} from '../types.js';
import { discoverPerpMarkets } from '../../markets/discovery.js';
import { createSomniaMarketsExchange } from '../../network/client.js';

const STALE_THRESHOLD_MS = 30_000;

function resolveSdkMarketKey(
  market: MarketInfo,
  exchange: ReturnType<typeof createSomniaMarketsExchange> | null,
): string | null {
  if (!exchange || !exchange.markets) return null;
  const markets = exchange.markets;
  if (markets[market.symbol]) return market.symbol;
  const candidate = `${market.baseSymbol}/${market.quoteSymbol}:${market.quoteSymbol}`;
  if (markets[candidate]) return candidate;
  const candidateUpper = `${market.baseSymbol}/USDso:USDso`;
  if (markets[candidateUpper]) return candidateUpper;
  for (const [key, m] of Object.entries(markets)) {
    const raw = m as unknown as { info?: { poolAddress?: string }; contract?: string; id?: string };
    const pool = raw.info?.poolAddress || (typeof raw.contract === 'string' ? raw.contract : undefined) || raw.id;
    if (pool && pool.toLowerCase() === market.poolAddress.toLowerCase()) {
      return key;
    }
  }
  return null;
}

export function useMarketData() {
  const [markets, setMarkets] = useState<MarketInfo[]>(DEFAULT_MARKETS);
  const [selectedMarketSymbol, setSelectedMarketSymbol] = useState<string>('ETH-PERP');
  const [currentBlock, setCurrentBlock] = useState<bigint | null>(null);
  const [lastBlockTime, setLastBlockTime] = useState<number>(Date.now());
  const [isOracleFresh, setIsOracleFresh] = useState<boolean>(false);
  const [isSdkLoaded, setIsSdkLoaded] = useState<boolean>(false);
  const [timeframe, setTimeframe] = useState<string>('15m');

  const [orderBook, setOrderBook] = useState<OrderBookData>({
    asks: [],
    bids: [],
    spread: 0,
    spreadPercent: 0,
    status: 'LOADING',
    source: 'Hideki PerpPool (getBookLevels)',
    lastUpdated: 0,
  });

  const [chartData, setChartData] = useState<ChartDataState>({
    candles: [],
    status: 'LOADING',
    source: 'Somnia Indexer (OHLCV)',
    lastUpdated: 0,
    timeframe: '15m',
  });

  const [tradesData, setTradesData] = useState<TradesDataState>({
    trades: [],
    status: 'LOADING',
    source: 'Somnia Indexer (Trades)',
    lastUpdated: 0,
  });

  const publicClient = useMemo(() => {
    return createPublicClient({
      transport: http(SOMNIA_RPC_URL),
    });
  }, []);

  const exchangeRef = useRef<ReturnType<typeof createSomniaMarketsExchange> | null>(null);
  if (!exchangeRef.current) {
    exchangeRef.current = createSomniaMarketsExchange();
  }

  // Selected market resolution
  const selectedMarket = useMemo(() => {
    const found = markets.find(
      (m) =>
        m.symbol === selectedMarketSymbol ||
        m.display === selectedMarketSymbol ||
        m.baseSymbol === selectedMarketSymbol ||
        m.poolAddress.toLowerCase() === selectedMarketSymbol.toLowerCase(),
    );
    return found || markets[0];
  }, [markets, selectedMarketSymbol]);

  // 1. Dynamic Market Discovery on Mount
  useEffect(() => {
    let isMounted = true;

    async function loadDynamicMarkets() {
      // Initialize SDK markets in background
      if (exchangeRef.current) {
        try {
          await exchangeRef.current.loadMarkets();
          if (isMounted) setIsSdkLoaded(true);
        } catch (e) {
          console.warn('[useMarketData] SDK loadMarkets warning:', e);
        }
      }

      try {
        const discResult = await discoverPerpMarkets();
        if (!isMounted || !discResult.markets || discResult.markets.length === 0) return;

        const discoveredMarkets: MarketInfo[] = discResult.markets.map((m) => {
          const tickFormatted = Number(formatUnits(m.tickSize, m.quoteDecimals));
          const lotFormatted = Number(formatUnits(m.lotSize, m.baseDecimals));
          const minQtyFormatted = Number(formatUnits(m.minQuantity, m.baseDecimals));
          const markFormatted = m.markPrice ? Number(formatUnits(m.markPrice, m.quoteDecimals)) : 0;
          const indexFormatted = m.indexPrice ? Number(formatUnits(m.indexPrice, m.quoteDecimals)) : 0;
          const fundingFormatted = m.fundingRate ? Number(formatUnits(m.fundingRate, 18)) : 0;

          return {
            symbol: m.sdkSymbol || m.symbol,
            display: m.display,
            name: `${m.baseSymbol} Perpetual`,
            poolAddress: m.poolAddress,
            marginBank: m.marginBank,
            baseToken: m.baseToken,
            quoteToken: m.quoteToken || USDSO_TOKEN_ADDRESS,
            baseSymbol: m.baseSymbol,
            quoteSymbol: m.quoteSymbol,
            baseDecimals: m.baseDecimals,
            quoteDecimals: m.quoteDecimals,
            markPrice: markFormatted,
            markPriceRaw: m.markPrice,
            markPriceStatus: m.markPrice && m.markPrice > 0n ? 'LIVE' : 'LOADING',
            markPriceUpdatedAt: m.markPrice ? Date.now() : undefined,
            indexPrice: indexFormatted,
            tickSize: tickFormatted,
            tickSizeRaw: m.tickSize,
            lotSize: lotFormatted,
            lotSizeRaw: m.lotSize,
            minOrderQty: minQtyFormatted,
            minQuantityRaw: m.minQuantity,
            imfBps: m.initialMarginBps,
            maxLeverage: m.maxLeverage,
            openInterest: 0,
            volume24h: 0,
            high24h: 0,
            low24h: 0,
            change24h: 0,
            fundingRate: fundingFormatted,
            isPriceable: true,
            isSyntheticDepth: false,
            isSyntheticChart: false,
            source: 'Somnia Hideki v2 Registry',
            lastUpdated: Date.now(),
          };
        });

        if (isMounted && discoveredMarkets.length > 0) {
          setMarkets(discoveredMarkets);
        }
      } catch (err) {
        if (!isMounted) return;
        console.warn('[useMarketData] Failed to dynamically discover markets:', err);
      }
    }

    loadDynamicMarkets();
    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Poll block number, live mark price & health snapshot from PerpPool contract
  useEffect(() => {
    let isMounted = true;

    async function pollLiveHealth() {
      try {
        const blockNum = await publicClient.getBlockNumber();
        if (!isMounted) return;
        setCurrentBlock(blockNum);
        setLastBlockTime(Date.now());

        try {
          const result = await publicClient.readContract({
            address: selectedMarket.poolAddress,
            abi: PERP_POOL_READ_ABI,
            functionName: 'tryGetHealthSnapshot',
            blockNumber: blockNum,
          });

          if (!isMounted) return;

          const [ok, snapshot] = result as unknown as [
            boolean,
            {
              oneBase: bigint;
              markPrice: bigint;
              projectedCumulativeFunding: bigint;
              effectiveIMFBps: bigint;
            },
          ];

          if (ok && snapshot.markPrice > 0n) {
            const markFormatted = Number(formatUnits(snapshot.markPrice, selectedMarket.quoteDecimals));
            setIsOracleFresh(true);
            setMarkets((prev) =>
              prev.map((m) => {
                if (m.poolAddress.toLowerCase() === selectedMarket.poolAddress.toLowerCase()) {
                  return {
                    ...m,
                    markPrice: markFormatted,
                    markPriceRaw: snapshot.markPrice,
                    markPriceStatus: 'LIVE',
                    markPriceUpdatedAt: Date.now(),
                    isPriceable: true,
                    lastUpdated: Date.now(),
                  };
                }
                return m;
              }),
            );
          } else {
            setIsOracleFresh(false);
            setMarkets((prev) =>
              prev.map((m) => {
                if (m.poolAddress.toLowerCase() === selectedMarket.poolAddress.toLowerCase()) {
                  return {
                    ...m,
                    markPriceStatus: 'STALE',
                    isPriceable: false,
                  };
                }
                return m;
              }),
            );
          }
        } catch (healthErr) {
          if (!isMounted) return;
          console.warn('[useMarketData] tryGetHealthSnapshot read error:', healthErr);
          setIsOracleFresh(false);
          setMarkets((prev) =>
            prev.map((m) => {
              if (m.poolAddress.toLowerCase() === selectedMarket.poolAddress.toLowerCase()) {
                return {
                  ...m,
                  markPriceStatus: 'ERROR',
                  isPriceable: false,
                };
              }
              return m;
            }),
          );
        }

        // Secondary read: fetch funding rate and ticker through SDK if loaded
        if (isSdkLoaded && exchangeRef.current && selectedMarket.symbol) {
          const sdkKey = resolveSdkMarketKey(selectedMarket, exchangeRef.current);
          if (sdkKey) {
            try {
              const funding = await exchangeRef.current.fetchFundingRate(sdkKey);
              if (!isMounted) return;
              setMarkets((prev) =>
                prev.map((m) => {
                  if (m.poolAddress.toLowerCase() === selectedMarket.poolAddress.toLowerCase()) {
                    return {
                      ...m,
                      indexPrice: funding.indexPrice ?? m.indexPrice,
                      fundingRate: funding.fundingRate ?? m.fundingRate,
                      openInterest: (funding.info as unknown as { openInterest?: bigint })?.openInterest
                        ? Number(formatUnits((funding.info as unknown as { openInterest?: bigint }).openInterest!, m.baseDecimals))
                        : m.openInterest,
                      fundingRateTimestamp: funding.timestamp,
                    };
                  }
                  return m;
                }),
              );
            } catch {
              // Contained failure: ticker/funding non-blocking
            }

            try {
              const ticker = await exchangeRef.current.fetchTicker(sdkKey);
              if (!isMounted) return;
              if (ticker.statsState === 'ok') {
                setMarkets((prev) =>
                  prev.map((m) => {
                    if (m.poolAddress.toLowerCase() === selectedMarket.poolAddress.toLowerCase()) {
                      return {
                        ...m,
                        volume24h: ticker.quoteVolume ?? m.volume24h,
                        high24h: ticker.high ?? m.high24h,
                        low24h: ticker.low ?? m.low24h,
                        change24h: ticker.percentage ?? m.change24h,
                      };
                    }
                    return m;
                  }),
                );
              }
            } catch {
              // Contained ticker failure
            }
          }
        }
      } catch (err) {
        if (!isMounted) return;
        console.warn('[useMarketData] Block poll failed:', err);
      }
    }

    pollLiveHealth();
    const interval = setInterval(pollLiveHealth, 6000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [selectedMarket.poolAddress, selectedMarket.symbol, selectedMarket.quoteDecimals, publicClient, isSdkLoaded]);

  // 3. Fetch Real Order Book Depth from On-Chain PerpPool.getBookLevels
  useEffect(() => {
    let isMounted = true;

    async function fetchOnchainOrderBook() {
      try {
        setOrderBook((prev) => ({
          ...prev,
          status: prev.lastUpdated === 0 ? 'LOADING' : prev.status,
        }));

        const pool = selectedMarket.poolAddress;
        const [rawBids, rawAsks] = await Promise.all([
          publicClient.readContract({
            address: pool,
            abi: PERP_POOL_READ_ABI,
            functionName: 'getBookLevels',
            args: [true, 10n],
          }) as Promise<Array<{ price: bigint; quantity: bigint }>>,
          publicClient.readContract({
            address: pool,
            abi: PERP_POOL_READ_ABI,
            functionName: 'getBookLevels',
            args: [false, 10n],
          }) as Promise<Array<{ price: bigint; quantity: bigint }>>,
        ]);

        if (!isMounted) return;

        // Process asks (sells): ascending price
        let askTotal = 0;
        const asks: OrderBookLevel[] = rawAsks.map((level) => {
          const price = Number(formatUnits(level.price, selectedMarket.quoteDecimals));
          const size = Number(formatUnits(level.quantity, selectedMarket.baseDecimals));
          askTotal += size;
          return {
            price: Number(price.toFixed(4)),
            size: Number(size.toFixed(4)),
            total: Number(askTotal.toFixed(4)),
          };
        });

        // Process bids (buys): descending price
        let bidTotal = 0;
        const bids: OrderBookLevel[] = rawBids.map((level) => {
          const price = Number(formatUnits(level.price, selectedMarket.quoteDecimals));
          const size = Number(formatUnits(level.quantity, selectedMarket.baseDecimals));
          bidTotal += size;
          return {
            price: Number(price.toFixed(4)),
            size: Number(size.toFixed(4)),
            total: Number(bidTotal.toFixed(4)),
          };
        });

        // Calculate actual spread from best ask and best bid
        let spread = 0;
        let spreadPercent = 0;
        if (asks.length > 0 && bids.length > 0) {
          spread = Number((asks[0].price - bids[0].price).toFixed(4));
          const mid = (asks[0].price + bids[0].price) / 2;
          if (mid > 0) {
            spreadPercent = Number(((spread / mid) * 100).toFixed(4));
          }
        }

        const hasDepth = asks.length > 0 || bids.length > 0;
        setOrderBook({
          asks,
          bids,
          spread: spread > 0 ? spread : 0,
          spreadPercent: spreadPercent > 0 ? spreadPercent : 0,
          status: hasDepth ? 'LIVE' : 'UNAVAILABLE',
          source: 'Hideki PerpPool (getBookLevels)',
          lastUpdated: Date.now(),
          errorMessage: hasDepth ? undefined : 'No active resting liquidity in this pool',
        });
      } catch (err) {
        if (!isMounted) return;
        console.warn('[useMarketData] getBookLevels on-chain read failed:', err);
        setOrderBook((prev) => ({
          ...prev,
          status: 'UNAVAILABLE',
          errorMessage: (err as Error).message || 'Failed to read order book levels from on-chain pool',
          lastUpdated: Date.now(),
        }));
      }
    }

    fetchOnchainOrderBook();
    const interval = setInterval(fetchOnchainOrderBook, 8000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [selectedMarket.poolAddress, selectedMarket.quoteDecimals, selectedMarket.baseDecimals, publicClient]);

  // 4. Fetch Real Historical OHLCV Candles via Indexer SDK
  useEffect(() => {
    let isMounted = true;

    async function fetchRealCandles() {
      try {
        setChartData((prev) => ({
          ...prev,
          status: prev.lastUpdated === 0 ? 'LOADING' : prev.status,
          timeframe,
        }));

        if (!exchangeRef.current || !selectedMarket.symbol) {
          if (!isMounted) return;
          setChartData((prev) => ({
            ...prev,
            status: 'UNAVAILABLE',
            errorMessage: 'Somnia indexer exchange client not ready',
          }));
          return;
        }

        if (!isSdkLoaded) {
          return; // Awaiting SDK loadMarkets
        }

        const sdkKey = resolveSdkMarketKey(selectedMarket, exchangeRef.current);
        if (!sdkKey) {
          if (!isMounted) return;
          setChartData({
            candles: [],
            status: 'UNAVAILABLE',
            source: 'Somnia Indexer (OHLCV)',
            lastUpdated: Date.now(),
            timeframe,
            errorMessage: 'Market symbol not indexed in SDK',
          });
          return;
        }

        const rawCandles = await exchangeRef.current.fetchOHLCV(
          sdkKey,
          timeframe,
          undefined,
          48,
        );

        if (!isMounted) return;

        if (rawCandles && rawCandles.length > 0) {
          const parsedCandles = rawCandles.map(([time, open, high, low, close, volume]) => ({
            time,
            open: Number(open.toFixed(2)),
            high: Number(high.toFixed(2)),
            low: Number(low.toFixed(2)),
            close: Number(close.toFixed(2)),
            volume: Number(volume.toFixed(4)),
          }));

          setChartData({
            candles: parsedCandles,
            status: 'LIVE',
            source: 'Somnia Indexer (OHLCV)',
            lastUpdated: Date.now(),
            timeframe,
          });
        } else {
          setChartData({
            candles: [],
            status: 'UNAVAILABLE',
            source: 'Somnia Indexer (OHLCV)',
            lastUpdated: Date.now(),
            timeframe,
            errorMessage: 'No historical trades indexed yet for this market',
          });
        }
      } catch (err) {
        if (!isMounted) return;
        console.warn('[useMarketData] fetchOHLCV failed:', err);
        setChartData((prev) => ({
          ...prev,
          status: 'UNAVAILABLE',
          source: 'Somnia Indexer (OHLCV)',
          lastUpdated: Date.now(),
          errorMessage: 'Live candle feed unavailable (indexer query failed)',
        }));
      }
    }

    fetchRealCandles();
    const interval = setInterval(fetchRealCandles, 15000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [selectedMarket.symbol, timeframe, isSdkLoaded]);

  // 5. Fetch Real Recent Trades via Indexer SDK
  useEffect(() => {
    let isMounted = true;

    async function fetchRealTrades() {
      try {
        if (!isSdkLoaded || !exchangeRef.current || !selectedMarket.symbol) return;
        const sdkKey = resolveSdkMarketKey(selectedMarket, exchangeRef.current);
        if (!sdkKey) return;

        const rawTrades = await exchangeRef.current.fetchTrades(sdkKey, undefined, 20);
        if (!isMounted) return;

        if (rawTrades && rawTrades.length > 0) {
          const parsed: TradeRecord[] = rawTrades.map((t) => ({
            id: t.id,
            price: t.price,
            amount: t.amount,
            cost: t.cost,
            side: (t.side === 'sell' ? 'sell' : 'buy') as 'buy' | 'sell',
            timestamp: t.timestamp,
            txHash: t.txHash || '',
          }));

          setTradesData({
            trades: parsed,
            status: 'LIVE',
            source: 'Somnia Indexer (Trades)',
            lastUpdated: Date.now(),
          });
        } else {
          setTradesData({
            trades: [],
            status: 'UNAVAILABLE',
            source: 'Somnia Indexer (Trades)',
            lastUpdated: Date.now(),
            errorMessage: 'No indexed trades recorded yet',
          });
        }
      } catch (err) {
        if (!isMounted) return;
        setTradesData((prev) => ({
          ...prev,
          status: 'UNAVAILABLE',
          source: 'Somnia Indexer (Trades)',
          lastUpdated: Date.now(),
          errorMessage: (err as Error).message || 'Trade history unavailable',
        }));
      }
    }

    fetchRealTrades();
    const interval = setInterval(fetchRealTrades, 12000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [selectedMarket.symbol, isSdkLoaded]);

  return {
    markets,
    selectedMarket,
    setSelectedMarketSymbol,
    currentBlock,
    lastBlockTime,
    isOracleFresh,
    orderBook,
    chartData,
    tradesData,
    timeframe,
    setTimeframe,
  };
}
