import React from 'react';
import { MarketInfo } from '../types.js';
import { ExternalLink, CheckCircle2, TrendingUp, TrendingDown } from 'lucide-react';
import { SOMNIA_EXPLORER_URL, PERP_POOL_FACTORY_ADDRESS } from '../constants.js';

interface MarketsViewProps {
  markets: MarketInfo[];
  onSelectMarket: (symbol: string) => void;
}

export const MarketsView: React.FC<MarketsViewProps> = ({
  markets,
  onSelectMarket,
}) => {
  return (
    <div className="space-y-4">
      {/* Header Banner */}
      <div className="bg-surface rounded-xl border border-surface-border p-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <span>dreamDEX Perpetual Markets</span>
            <span className="text-xs px-2 py-0.5 rounded bg-purple-500/20 text-purple-400 font-mono font-medium">
              {markets.length} Pools Discovered
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Dynamic on-chain discovery from Hideki Factory:{' '}
            <span className="font-mono text-cyan-400">
              {PERP_POOL_FACTORY_ADDRESS.slice(0, 10)}...
            </span>
          </p>
        </div>

        <a
          href={`${SOMNIA_EXPLORER_URL}/address/${PERP_POOL_FACTORY_ADDRESS}`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-subtle hover:bg-surface-hover text-slate-300 text-xs font-medium border border-surface-border transition-colors"
        >
          <span>View Factory on Explorer</span>
          <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
        </a>
      </div>

      {/* Markets Table */}
      <div className="bg-surface rounded-xl border border-surface-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs">
            <thead className="bg-[#0b0e14] text-[10px] text-slate-500 uppercase border-b border-surface-border">
              <tr>
                <th className="px-4 py-3 font-sans">Market</th>
                <th className="px-4 py-3 text-right font-sans">Mark Price</th>
                <th className="px-4 py-3 text-right font-sans">24h Change</th>
                <th className="px-4 py-3 text-right font-sans">Tick Size</th>
                <th className="px-4 py-3 text-right font-sans">Lot Size</th>
                <th className="px-4 py-3 text-right font-sans">Min Qty</th>
                <th className="px-4 py-3 text-right font-sans">Max Leverage</th>
                <th className="px-4 py-3 text-center font-sans">Oracle Health</th>
                <th className="px-4 py-3 text-center font-sans">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border/50">
              {markets.map((m) => {
                const isPositive = m.change24h >= 0;
                return (
                  <tr key={m.symbol} className="hover:bg-surface-subtle/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-bold text-white text-sm">{m.display || m.symbol}</div>
                      <div className="text-[10px] text-slate-400 font-sans">
                        {m.name} • {m.baseSymbol}/{m.quoteSymbol}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-slate-100">
                      ${m.markPrice > 0 ? m.markPrice.toLocaleString(undefined, { minimumFractionDigits: 2 }) : 'Loading...'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {m.change24h !== 0 ? (
                        <span
                          className={`inline-flex items-center gap-1 font-semibold ${
                            isPositive ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                          {isPositive ? '+' : ''}
                          {m.change24h.toFixed(2)}%
                        </span>
                      ) : (
                        <span className="text-slate-400 font-mono">0.00%</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-400">
                      ${m.tickSize.toFixed(4)}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-400">
                      {m.lotSize} {m.baseSymbol}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-400">
                      {m.minOrderQty} {m.baseSymbol}
                    </td>
                    <td className="px-4 py-3 text-right text-cyan-400 font-bold">
                      {m.maxLeverage}x
                    </td>
                    <td className="px-4 py-3 text-center">
                      {m.isPriceable ? (
                        <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 font-sans">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Priceable</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 font-sans">
                          <span>Unpriceable</span>
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center font-sans">
                      <button
                        onClick={() => onSelectMarket(m.symbol)}
                        className="px-3 py-1 rounded bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-xs transition-colors"
                      >
                        Trade
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
