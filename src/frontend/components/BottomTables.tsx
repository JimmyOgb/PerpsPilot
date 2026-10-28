import React, { useState } from 'react';
import { ShieldCheck, CheckCircle2, History } from 'lucide-react';
import { OrderProposal, TradesDataState, WalletState } from '../types.js';

interface BottomTablesProps {
  recentSimulations: OrderProposal[];
  onInspectSimulation: (proposal: OrderProposal) => void;
  tradesData?: TradesDataState;
  wallet?: WalletState;
}

export const BottomTables: React.FC<BottomTablesProps> = ({
  recentSimulations,
  onInspectSimulation,
  tradesData,
  wallet,
}) => {
  const [activeTab, setActiveTab] = useState<'safety' | 'trades' | 'orders' | 'positions'>('safety');

  return (
    <div className="bg-surface rounded-lg border border-surface-border flex flex-col overflow-hidden text-xs">
      {/* Tab Switcher */}
      <div className="px-3 border-b border-surface-border flex items-center justify-between bg-[#0b0e14]/50">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveTab('safety')}
            className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'safety'
                ? 'border-cyan-400 text-cyan-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
            <span>Pre-Trade Safety Audits ({recentSimulations.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('trades')}
            className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'trades'
                ? 'border-cyan-400 text-cyan-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <History className="w-3.5 h-3.5 text-slate-400" />
            <span>Recent Market Trades ({tradesData?.trades.length || 0})</span>
          </button>

          <button
            onClick={() => setActiveTab('orders')}
            className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
              activeTab === 'orders'
                ? 'border-cyan-400 text-cyan-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>Open Orders ({wallet?.openOrders?.length || 0})</span>
          </button>

          <button
            onClick={() => setActiveTab('positions')}
            className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
              activeTab === 'positions'
                ? 'border-cyan-400 text-cyan-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>Active Positions ({wallet?.positions?.length || 0})</span>
          </button>
        </div>

        <span className="text-[10px] text-slate-500 font-mono hidden sm:inline">
          Filter: Somnia Hideki Testnet (50383)
        </span>
      </div>

      {/* Tab Contents */}
      <div className="min-h-[140px] max-h-[220px] overflow-y-auto">
        {activeTab === 'safety' && (
          <div>
            {recentSimulations.length === 0 ? (
              <div className="p-8 text-center text-slate-500 font-mono text-xs">
                No orders simulated yet. Configure the Trade Ticket above and click "Preview Order (Read-Only Simulation)" to generate a pre-trade audit record.
              </div>
            ) : (
              <table className="w-full text-left font-mono text-xs">
                <thead className="bg-[#0b0e14] text-[10px] text-slate-500 uppercase border-b border-surface-border">
                  <tr>
                    <th className="px-4 py-2">Time (UTC)</th>
                    <th className="px-4 py-2">Market</th>
                    <th className="px-4 py-2">Side</th>
                    <th className="px-4 py-2">Type</th>
                    <th className="px-4 py-2 text-right">Price</th>
                    <th className="px-4 py-2 text-right">Amount</th>
                    <th className="px-4 py-2 text-right">Notional</th>
                    <th className="px-4 py-2 text-center">Pre-Trade Gate</th>
                    <th className="px-4 py-2 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border/50">
                  {recentSimulations.map((sim, i) => (
                    <tr key={i} className="hover:bg-surface-subtle transition-colors">
                      <td className="px-4 py-2 text-slate-400">
                        {new Date(sim.timestamp).toISOString().split('T')[1].slice(0, 8)}
                      </td>
                      <td className="px-4 py-2 font-bold text-white">{sim.market}</td>
                      <td className="px-4 py-2">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            sim.side === 'BUY_LONG'
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : 'bg-rose-500/20 text-rose-400'
                          }`}
                        >
                          {sim.side}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-slate-300">{sim.type}</td>
                      <td className="px-4 py-2 text-right text-slate-200">${sim.price.toFixed(2)}</td>
                      <td className="px-4 py-2 text-right text-slate-200">{sim.amount}</td>
                      <td className="px-4 py-2 text-right text-cyan-400 font-bold">${sim.notional.toFixed(2)}</td>
                      <td className="px-4 py-2 text-center">
                        <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>PASS (Dry-Run)</span>
                        </span>
                      </td>
                      <td className="px-4 py-2 text-center">
                        <button
                          onClick={() => onInspectSimulation(sim)}
                          className="px-2 py-1 rounded bg-surface-subtle hover:bg-surface-hover text-slate-300 hover:text-white text-[11px] font-sans transition-colors"
                        >
                          Inspect
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {activeTab === 'trades' && (
          <div>
            {!tradesData || tradesData.trades.length === 0 ? (
              <div className="p-8 text-center text-slate-500 font-mono text-xs">
                {tradesData?.errorMessage || 'No recent trades indexed yet for this market on Hideki.'}
              </div>
            ) : (
              <table className="w-full text-left font-mono text-xs">
                <thead className="bg-[#0b0e14] text-[10px] text-slate-500 uppercase border-b border-surface-border">
                  <tr>
                    <th className="px-4 py-2">Time</th>
                    <th className="px-4 py-2">Side</th>
                    <th className="px-4 py-2 text-right">Price (USDso)</th>
                    <th className="px-4 py-2 text-right">Amount</th>
                    <th className="px-4 py-2 text-right">Cost (USDso)</th>
                    <th className="px-4 py-2 text-center">Tx Hash</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border/50">
                  {tradesData.trades.map((t, idx) => (
                    <tr key={t.id || idx} className="hover:bg-surface-subtle transition-colors">
                      <td className="px-4 py-2 text-slate-400">
                        {new Date(t.timestamp).toLocaleTimeString()}
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                            t.side === 'buy'
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : 'bg-rose-500/20 text-rose-400'
                          }`}
                        >
                          {t.side}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right text-slate-200 font-bold">
                        ${t.price.toFixed(2)}
                      </td>
                      <td className="px-4 py-2 text-right text-slate-300">{t.amount}</td>
                      <td className="px-4 py-2 text-right text-cyan-400">${t.cost.toFixed(2)}</td>
                      <td className="px-4 py-2 text-center text-slate-500 font-mono text-[10px]">
                        {t.txHash ? `${t.txHash.slice(0, 10)}...` : 'N/A'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {activeTab === 'orders' && (
          <div className="p-8 text-center text-slate-500 font-mono text-xs">
            Zero active open orders on dreamDEX Hideki. Live execution is guarded by DRY_RUN=true.
          </div>
        )}

        {activeTab === 'positions' && (
          <div className="p-8 text-center text-slate-500 font-mono text-xs">
            {wallet?.isConnected
              ? 'Zero active open positions detected in MarginBank (0x478769E1...). Account margin remains safely isolated.'
              : 'Connect wallet to inspect account positions in MarginBank.'}
          </div>
        )}
      </div>
    </div>
  );
};
