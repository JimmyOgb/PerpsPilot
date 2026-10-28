import React, { useState, useEffect, useRef } from 'react';
import { MarketInfo, ChartDataState } from '../types.js';

interface TradingChartProps {
  market: MarketInfo;
  chartData: ChartDataState;
  onTimeframeChange?: (tf: string) => void;
}

export const TradingChart: React.FC<TradingChartProps> = ({
  market,
  chartData,
  onTimeframeChange,
}) => {
  const [activeTab, setActiveTab] = useState<'chart' | 'inspect'>('chart');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const isLive = chartData.status === 'LIVE' && chartData.candles.length > 0;
  const isLoading = chartData.status === 'LOADING';
  const isUnavailable = !isLoading && !isLive;

  // Render chart on canvas when candles are available
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !isLive || chartData.candles.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    // Chart dimensions
    const priceAreaHeight = height * 0.78;
    const volumeAreaHeight = height * 0.18;

    // Find min and max price
    let minPrice = Infinity;
    let maxPrice = -Infinity;
    let maxVolume = 0;

    chartData.candles.forEach((c) => {
      if (c.low < minPrice) minPrice = c.low;
      if (c.high > maxPrice) maxPrice = c.high;
      if (c.volume > maxVolume) maxVolume = c.volume;
    });

    const priceRange = (maxPrice - minPrice) * 1.1 || 1;
    minPrice -= (maxPrice - minPrice) * 0.05;

    // Draw horizontal grid lines
    ctx.strokeStyle = '#1a2332';
    ctx.lineWidth = 1;
    const gridLines = 5;
    for (let i = 0; i < gridLines; i++) {
      const y = (priceAreaHeight / gridLines) * i + 10;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width - 65, y);
      ctx.stroke();

      const priceVal = maxPrice - (i / gridLines) * (maxPrice - minPrice);
      ctx.fillStyle = '#64748b';
      ctx.font = '10px JetBrains Mono, monospace';
      ctx.fillText(`$${priceVal.toFixed(2)}`, width - 60, y + 3);
    }

    const candleWidth = (width - 70) / chartData.candles.length;
    const candleBarWidth = Math.max(candleWidth * 0.7, 3);

    // Draw candles
    chartData.candles.forEach((c, idx) => {
      const x = idx * candleWidth + 10;
      const isGreen = c.close >= c.open;
      const candleColor = isGreen ? '#00e599' : '#ff4d6a';

      // Wick
      const highY = priceAreaHeight - ((c.high - minPrice) / priceRange) * priceAreaHeight;
      const lowY = priceAreaHeight - ((c.low - minPrice) / priceRange) * priceAreaHeight;
      const wickX = x + candleBarWidth / 2;

      ctx.strokeStyle = candleColor;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(wickX, highY);
      ctx.lineTo(wickX, lowY);
      ctx.stroke();

      // Body
      const openY = priceAreaHeight - ((c.open - minPrice) / priceRange) * priceAreaHeight;
      const closeY = priceAreaHeight - ((c.close - minPrice) / priceRange) * priceAreaHeight;
      const bodyTop = Math.min(openY, closeY);
      const bodyHeight = Math.max(Math.abs(closeY - openY), 2);

      ctx.fillStyle = candleColor;
      ctx.fillRect(x, bodyTop, candleBarWidth, bodyHeight);

      // Volume bar
      const volHeight = (c.volume / (maxVolume || 1)) * volumeAreaHeight;
      const volTop = height - volHeight;
      ctx.fillStyle = isGreen ? 'rgba(0, 229, 153, 0.25)' : 'rgba(255, 77, 106, 0.25)';
      ctx.fillRect(x, volTop, candleBarWidth, volHeight);
    });

    // Draw latest mark price dashed line if valid
    if (market.markPrice > 0) {
      const markY = priceAreaHeight - ((market.markPrice - minPrice) / priceRange) * priceAreaHeight;
      ctx.strokeStyle = '#00e599';
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, markY);
      ctx.lineTo(width - 65, markY);
      ctx.stroke();
      ctx.setLineDash([]);

      // Price tag pill on right
      ctx.fillStyle = '#00e599';
      ctx.fillRect(width - 65, markY - 9, 62, 18);
      ctx.fillStyle = '#0b0e14';
      ctx.font = 'bold 10px JetBrains Mono, monospace';
      ctx.fillText(`$${market.markPrice.toFixed(2)}`, width - 62, markY + 4);
    }
  }, [chartData.candles, isLive, market.markPrice]);

  const latestCandle = chartData.candles[chartData.candles.length - 1];

  return (
    <div className="bg-surface rounded-lg border border-surface-border flex flex-col h-full overflow-hidden">
      {/* Chart Header */}
      <div className="px-3 py-2 border-b border-surface-border flex items-center justify-between bg-[#0b0e14]/50">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-slate-300">
            {market.display || market.symbol}
          </span>
          {isLive ? (
            <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[9px] font-bold tracking-wider uppercase font-mono">
              LIVE OHLCV FEED
            </span>
          ) : isLoading ? (
            <span className="px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[9px] font-bold tracking-wider uppercase font-mono animate-pulse">
              LOADING
            </span>
          ) : (
            <span className="px-1.5 py-0.5 rounded bg-slate-500/20 text-slate-300 border border-slate-500/30 text-[9px] font-bold tracking-wider uppercase font-mono">
              FEED UNAVAILABLE
            </span>
          )}

          {/* Timeframe Buttons */}
          <div className="hidden sm:flex items-center gap-1 bg-surface-subtle p-0.5 rounded border border-surface-border text-[11px] font-mono">
            {['1m', '5m', '15m', '1h', '4h', '1d'].map((tf) => (
              <button
                key={tf}
                onClick={() => onTimeframeChange && onTimeframeChange(tf)}
                className={`px-2 py-0.5 rounded ${
                  chartData.timeframe === tf
                    ? 'bg-cyan-500/20 text-cyan-400 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>

        {/* OHLC Stats Header */}
        {isLive && latestCandle && (
          <div className="hidden sm:flex items-center gap-3 text-[11px] font-mono text-slate-400">
            <span>
              O: <span className="text-slate-200">${latestCandle.open}</span>
            </span>
            <span>
              H: <span className="text-emerald-400">${latestCandle.high}</span>
            </span>
            <span>
              L: <span className="text-rose-400">${latestCandle.low}</span>
            </span>
            <span>
              C: <span className="text-emerald-400">${latestCandle.close}</span>
            </span>
            <span>
              Vol: <span className="text-slate-300">{latestCandle.volume}</span>
            </span>
          </div>
        )}
      </div>

      {/* Source & Freshness Metadata Banner */}
      <div className="px-3 py-1 bg-[#0b0e14]/70 border-b border-surface-border/50 text-[10px] text-slate-400 font-sans flex items-center justify-between">
        <span className="truncate">Source: {chartData.source}</span>
        {chartData.lastUpdated > 0 && (
          <span className="text-slate-500 text-[9px] font-mono shrink-0">
            {new Date(chartData.lastUpdated).toLocaleTimeString()}
          </span>
        )}
      </div>

      {/* Main Content Area */}
      {isUnavailable ? (
        <div className="relative flex-1 p-6 flex flex-col items-center justify-center text-center font-sans">
          <div className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 mb-3">
            📈
          </div>
          <div className="font-semibold text-slate-200 text-sm mb-1">
            Live Candle Feed Unavailable
          </div>
          <div className="text-xs text-slate-400 max-w-md leading-relaxed mb-4">
            {chartData.errorMessage ||
              'Historical trade buckets for this market are currently unavailable from the Somnia indexer.'}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setActiveTab(activeTab === 'inspect' ? 'chart' : 'inspect')}
              className="px-3 py-1.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-xs font-medium hover:bg-cyan-500/30 transition-colors"
            >
              {activeTab === 'inspect' ? 'Back to Chart Area' : 'Inspect Market & Price Data Instead'}
            </button>
          </div>

          {activeTab === 'inspect' && (
            <div className="mt-5 w-full max-w-md bg-surface-subtle p-3 rounded border border-surface-border text-left font-mono text-xs space-y-1.5">
              <div className="text-slate-400 text-[11px] font-sans font-semibold border-b border-surface-border pb-1">
                Verified Market Snapshot
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Mark Price:</span>
                <span className="text-emerald-400 font-bold">
                  ${market.markPrice > 0 ? market.markPrice.toFixed(2) : 'Loading...'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Index Price:</span>
                <span className="text-slate-300">
                  ${market.indexPrice > 0 ? market.indexPrice.toFixed(2) : 'N/A'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Funding Rate (8h):</span>
                <span className="text-cyan-400">
                  {market.fundingRate ? `${(market.fundingRate * 100).toFixed(4)}%` : '0.0100%'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Tick Size:</span>
                <span className="text-slate-300">${market.tickSize.toFixed(4)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Lot Size:</span>
                <span className="text-slate-300">{market.lotSize} {market.baseSymbol}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Min Quantity:</span>
                <span className="text-slate-300">{market.minOrderQty} {market.baseSymbol}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Pool Address:</span>
                <span className="text-slate-400 text-[10px] truncate max-w-[200px]">
                  {market.poolAddress}
                </span>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="relative flex-1 p-2 min-h-[320px]">
          <canvas
            ref={canvasRef}
            width={720}
            height={340}
            className="w-full h-full block"
          />
        </div>
      )}
    </div>
  );
};
