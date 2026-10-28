import React from 'react';
import { ChevronDown, CheckCircle2, TrendingUp, TrendingDown, Clock, AlertTriangle } from 'lucide-react';
import { MarketInfo } from '../types.js';

interface MarketBarProps {
  markets: MarketInfo[];
  selectedMarket: MarketInfo;
  onSelectMarket: (symbol: string) => void;
  isOracleFresh: boolean;
}

export const MarketBar: React.FC<MarketBarProps> = ({
  markets,
  selectedMarket,
  onSelectMarket,
  isOracleFresh,
}) => {
  const isPositive = selectedMarket.change24h >= 0;
  const isLive = selectedMarket.markPriceStatus === 'LIVE';
  const isLoading = selectedMarket.markPriceStatus === 'LOADING';
  const isStale = selectedMarket.markPriceStatus === 'STALE';
  const isError = selectedMarket.markPriceStatus === 'ERROR';

  return (
    <div className="bg-surface border-b border-surface-border px-4 py-2 flex flex-wrap items-center justify-between gap-4 text-xs">
      {/* Market Selector & Live Mark */}
      <div className="flex items-center gap-4">
        {/* Market Dropdown */}
        <div className="relative group">
          <button className="flex items-center gap-2 bg-[#0b0e14] hover:bg-surface-subtle px-3 py-1.5 rounded-lg border border-surface-border font-bold text-sm text-white transition-colors">
            <span>{selectedMarket.display || selectedMarket.symbol}</span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>

          <div className="absolute left-0 mt-1 w-56 max-h-72 overflow-y-auto bg-surface border border-surface-border rounded-lg shadow-xl py-1 hidden group-hover:block z-40">
            <div className="px-3 py-1 text-[10px] text-slate-500 uppercase font-semibold border-b border-surface-border">
              Discovered Perps ({markets.length})
            </div>
            {markets.map((m) => (
              <button
                key={m.symbol}
                onClick={() => onSelectMarket(m.symbol)}
                className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-surface-subtle transition-colors ${
                  m.symbol === selectedMarket.symbol
                    ? 'text-cyan-400 font-semibold bg-surface-subtle/50'
                    : 'text-slate-300'
                }`}
              >
                <div>
                  <div className="font-semibold">{m.display || m.symbol}</div>
                  <div className="text-[10px] text-slate-500 font-mono">
                    Lot: {m.lotSize} | Min: {m.minOrderQty}
                  </div>
                </div>
                <div className="text-right font-mono">
                  <div>{m.markPrice > 0 ? `$${m.markPrice.toFixed(2)}` : 'Querying...'}</div>
                  <div className="text-[10px] text-slate-500">
                    {m.maxLeverage}x
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Mark Price Big Stat */}
        <div className="border-l border-surface-border pl-4">
          <div className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider flex items-center gap-1.5">
            <span>Mark Price</span>
            {isLive && <span className="text-[9px] text-emerald-400 font-mono">(LIVE RPC)</span>}
            {isLoading && <span className="text-[9px] text-cyan-400 font-mono animate-pulse">(LOADING)</span>}
            {isStale && <span className="text-[9px] text-amber-400 font-mono">(STALE)</span>}
            {isError && <span className="text-[9px] text-rose-400 font-mono">(ERROR)</span>}
          </div>
          <div
            className={`text-base font-bold font-mono tracking-tight ${
              isLive ? 'text-emerald-400' : isLoading ? 'text-cyan-400' : isStale ? 'text-amber-400' : 'text-rose-400'
            }`}
          >
            {isLive ? (
              `$${selectedMarket.markPrice.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}`
            ) : isLoading ? (
              'Querying Hideki...'
            ) : isStale ? (
              selectedMarket.markPrice > 0 ? `$${selectedMarket.markPrice.toFixed(2)} (Stale)` : 'Mark Stale'
            ) : (
              'Mark Unavailable'
            )}
          </div>
        </div>

        {/* Index Price */}
        <div className="hidden sm:block">
          <div className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider">
            Index Price <span className="text-[9px] text-slate-500">(Oracle Ref)</span>
          </div>
          <div className="text-sm font-semibold font-mono text-slate-200">
            {selectedMarket.indexPrice > 0
              ? `$${selectedMarket.indexPrice.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}`
              : 'Syncing...'}
          </div>
        </div>
      </div>

      {/* 24h Market Stats Strip */}
      <div className="hidden lg:flex items-center gap-6 text-slate-300 font-mono">
        <div>
          <div className="text-[10px] uppercase font-semibold text-slate-400">24h Change</div>
          <div
            className={`font-semibold flex items-center gap-1 ${
              selectedMarket.change24h !== 0
                ? isPositive
                  ? 'text-emerald-400'
                  : 'text-rose-400'
                : 'text-slate-400'
            }`}
          >
            {selectedMarket.change24h !== 0 && (
              isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />
            )}
            <span>
              {selectedMarket.change24h !== 0
                ? `${isPositive ? '+' : ''}${selectedMarket.change24h.toFixed(2)}%`
                : '0.00%'}
            </span>
          </div>
        </div>

        <div>
          <div className="text-[10px] uppercase font-semibold text-slate-400">24h Volume</div>
          <div>
            {selectedMarket.volume24h > 0
              ? `$${(selectedMarket.volume24h / 1_000_000).toFixed(2)}M`
              : 'N/A (Indexer)'}
          </div>
        </div>

        <div>
          <div className="text-[10px] uppercase font-semibold text-slate-400">Funding Rate / 8h</div>
          <div className="text-cyan-400 font-medium">
            {selectedMarket.fundingRate !== undefined
              ? `+${(selectedMarket.fundingRate * 100).toFixed(4)}%`
              : '0.0100%'}
          </div>
        </div>

        <div>
          <div className="text-[10px] uppercase font-semibold text-slate-400">Max Leverage</div>
          <div className="text-slate-200 font-medium">{selectedMarket.maxLeverage}x</div>
        </div>
      </div>

      {/* Oracle Health & Source Pill */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#0b0e14] border border-surface-border text-xs">
          {isLive && isOracleFresh ? (
            <>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-slate-300 text-[11px] font-medium">
                Oracle Live (tryGetHealthSnapshot OK)
              </span>
            </>
          ) : isLoading ? (
            <>
              <Clock className="w-3.5 h-3.5 text-cyan-400 animate-spin" />
              <span className="text-cyan-400 text-[11px] font-medium">Connecting Oracle...</span>
            </>
          ) : (
            <>
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-amber-400 text-[11px] font-medium">
                Oracle Unpriceable / Stale
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
