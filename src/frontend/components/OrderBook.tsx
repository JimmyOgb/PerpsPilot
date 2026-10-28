import React from 'react';
import { OrderBookData } from '../types.js';
import { MarketInfo } from '../types.js';

interface OrderBookProps {
  orderBook: OrderBookData;
  market: MarketInfo;
  onPriceSelect?: (price: number) => void;
}

export const OrderBook: React.FC<OrderBookProps> = ({
  orderBook,
  market,
  onPriceSelect,
}) => {
  const maxAskTotal = orderBook.asks[orderBook.asks.length - 1]?.total || 1;
  const maxBidTotal = orderBook.bids[orderBook.bids.length - 1]?.total || 1;
  const maxTotal = Math.max(maxAskTotal, maxBidTotal, 0.0001);

  const isLive = orderBook.status === 'LIVE' && (orderBook.asks.length > 0 || orderBook.bids.length > 0);
  const isLoading = orderBook.status === 'LOADING';
  const isUnavailable = orderBook.status === 'UNAVAILABLE' || (!isLoading && !isLive);

  return (
    <div className="bg-surface rounded-lg border border-surface-border flex flex-col h-full overflow-hidden text-xs font-mono">
      {/* Header with Verified Data Status & Source */}
      <div className="px-3 py-2 border-b border-surface-border flex items-center justify-between text-slate-400 text-[11px] font-sans font-medium bg-[#0b0e14]/50">
        <div className="flex items-center gap-2">
          <span>Order Book</span>
          {isLive ? (
            <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[9px] font-bold tracking-wider uppercase font-mono">
              LIVE DEPTH
            </span>
          ) : isLoading ? (
            <span className="px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[9px] font-bold tracking-wider uppercase font-mono animate-pulse">
              LOADING
            </span>
          ) : (
            <span className="px-1.5 py-0.5 rounded bg-slate-500/20 text-slate-300 border border-slate-500/30 text-[9px] font-bold tracking-wider uppercase font-mono">
              UNAVAILABLE
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono">
          <span>Tick: ${market.tickSize > 0 ? market.tickSize.toFixed(market.quoteDecimals > 6 ? 2 : 4) : '0.01'}</span>
        </div>
      </div>

      {/* Source & Freshness Metadata Banner */}
      <div className="px-3 py-1 bg-[#0b0e14]/70 border-b border-surface-border/50 text-[10px] text-slate-400 font-sans flex items-center justify-between">
        <span className="truncate">Source: {orderBook.source}</span>
        {orderBook.lastUpdated > 0 && (
          <span className="text-slate-500 text-[9px] font-mono shrink-0">
            {new Date(orderBook.lastUpdated).toLocaleTimeString()}
          </span>
        )}
      </div>

      {/* Columns Label */}
      <div className="px-3 py-1 grid grid-cols-3 text-[10px] text-slate-500 uppercase border-b border-surface-border/50">
        <span className="text-left">Price ({market.quoteSymbol || 'USDso'})</span>
        <span className="text-right">Size ({market.baseSymbol || 'ETH'})</span>
        <span className="text-right">Total</span>
      </div>

      {/* Book Content / Empty States */}
      {isUnavailable ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-slate-400 font-sans">
          <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400 mb-2">
            📊
          </div>
          <div className="font-semibold text-slate-300 text-xs mb-1">
            Order Book Liquidity Unavailable
          </div>
          <div className="text-[11px] text-slate-500 max-w-[240px] leading-relaxed">
            {orderBook.errorMessage || 'No resting orders currently active in this dreamDEX pool on Hideki.'}
          </div>
          <div className="mt-3 text-[10px] px-2 py-0.5 rounded bg-surface-subtle text-slate-400 border border-surface-border font-mono">
            Direct on-chain read: getBookLevels()
          </div>
        </div>
      ) : (
        <>
          {/* Asks (Sells) - ordered high to low visually, ending at best ask */}
          <div className="flex-1 flex flex-col justify-end overflow-hidden py-1 space-y-0.5">
            {orderBook.asks.slice(0, 8).reverse().map((ask, i) => {
              const depthPercent = Math.min((ask.total / maxTotal) * 100, 100);
              return (
                <div
                  key={`ask-${i}`}
                  onClick={() => onPriceSelect && onPriceSelect(ask.price)}
                  className="relative px-3 py-0.5 grid grid-cols-3 hover:bg-surface-subtle cursor-pointer transition-colors group"
                >
                  {/* Depth Background Bar */}
                  <div
                    className="absolute right-0 top-0 bottom-0 bg-rose-500/10 pointer-events-none group-hover:bg-rose-500/20"
                    style={{ width: `${depthPercent}%` }}
                  />
                  <span className="text-rose-400 font-semibold relative z-10">
                    ${ask.price.toFixed(2)}
                  </span>
                  <span className="text-right text-slate-300 relative z-10">
                    {ask.size.toFixed(4)}
                  </span>
                  <span className="text-right text-slate-400 relative z-10">
                    {ask.total.toFixed(4)}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Spread & Mark Price Divider */}
          <div className="px-3 py-1.5 bg-[#0b0e14] border-y border-surface-border flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-2">
              <span className="text-emerald-400 font-bold text-sm">
                {market.markPrice > 0 ? `$${market.markPrice.toFixed(2)}` : 'Syncing...'}
              </span>
              <span className="text-[10px] text-slate-500 uppercase">Mark</span>
            </div>
            <div className="text-[10px] text-slate-400 font-mono">
              Spread:{' '}
              <span className="text-slate-300">
                ${orderBook.spread.toFixed(2)}
              </span>{' '}
              <span className="text-slate-500">
                ({orderBook.spreadPercent.toFixed(4)}%)
              </span>
            </div>
          </div>

          {/* Bids (Buys) - ordered from best bid downward */}
          <div className="flex-1 overflow-hidden py-1 space-y-0.5">
            {orderBook.bids.slice(0, 8).map((bid, i) => {
              const depthPercent = Math.min((bid.total / maxTotal) * 100, 100);
              return (
                <div
                  key={`bid-${i}`}
                  onClick={() => onPriceSelect && onPriceSelect(bid.price)}
                  className="relative px-3 py-0.5 grid grid-cols-3 hover:bg-surface-subtle cursor-pointer transition-colors group"
                >
                  {/* Depth Background Bar */}
                  <div
                    className="absolute right-0 top-0 bottom-0 bg-emerald-500/10 pointer-events-none group-hover:bg-emerald-500/20"
                    style={{ width: `${depthPercent}%` }}
                  />
                  <span className="text-emerald-400 font-semibold relative z-10">
                    ${bid.price.toFixed(2)}
                  </span>
                  <span className="text-right text-slate-300 relative z-10">
                    {bid.size.toFixed(4)}
                  </span>
                  <span className="text-right text-slate-400 relative z-10">
                    {bid.total.toFixed(4)}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};
