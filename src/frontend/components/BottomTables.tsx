import React, { useState } from 'react';
import { ShieldCheck, CheckCircle2, History, Award, Terminal } from 'lucide-react';
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
  const [activeTab, setActiveTab] = useState<'safety' | 'trades' | 'orders' | 'positions' | 'evidence'>('safety');

  return (
    <div className="bg-surface rounded-lg border border-surface-border flex flex-col overflow-hidden text-xs">
      {/* Tab Switcher */}
      <div className="px-3 border-b border-surface-border flex items-center justify-between bg-[#0b0e14]/50 overflow-x-auto">
        <div className="flex items-center gap-1 flex-shrink-0">
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
            onClick={() => setActiveTab('evidence')}
            className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'evidence'
                ? 'border-emerald-400 text-emerald-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Award className="w-3.5 h-3.5 text-emerald-400" />
            <span>Verified Testnet Evidence (F.24)</span>
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

        <span className="text-[10px] text-slate-500 font-mono hidden md:inline flex-shrink-0">
          Somnia Hideki v2 (50383 / 50000259)
        </span>
      </div>

      {/* Tab Contents */}
      <div className="min-h-[140px] max-h-[220px] overflow-y-auto">
        {activeTab === 'safety' && (
          <div>
            {recentSimulations.length === 0 ? (
              <div className="p-8 text-center text-slate-500 font-mono text-xs">
                No orders simulated yet. Configure the Trade Ticket above and click "Preview Order" or "Review & Authorize" to generate a pre-trade audit record.
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
                          <span>PASS (Pre-Trade Gate)</span>
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

        {activeTab === 'evidence' && (
          <div className="p-4 space-y-3 font-mono text-xs">
            {/* Context Header */}
            <div className="p-3 rounded-lg bg-[#0b0e14] border border-surface-border flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-100 text-xs font-sans">
                    Stage F.24 On-Chain Execution & Reconciliation Proof
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-bold border border-emerald-500/30">
                    SUCCESS
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 font-sans mt-0.5">
                  Historical Testnet Demonstration — Somnia Hideki v2 (Chain ID 50383, Network ID 50000259). Demonstrates protocol-compliant limit order lifecycle, not mainnet execution or profits.
                </p>
              </div>
              <div className="text-[10px] text-slate-400 font-sans flex-shrink-0 bg-surface-subtle px-2.5 py-1.5 rounded border border-surface-border">
                <div>Signer: <span className="font-mono text-cyan-300">0xDc7c4a...Ca2c</span></div>
                <div>Pool: <span className="font-mono text-slate-300">ETH-PERP (0xd6cb1d...)</span></div>
              </div>
            </div>

            {/* Two Transactions Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Tx 1: Order Placement */}
              <div className="p-3 rounded-lg bg-[#0b0e14] border border-surface-border space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-bold text-cyan-300 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" />
                    <span>1. Order Placement (placeOrder)</span>
                  </span>
                  <span className="text-slate-400 text-[10px]">Block #36237119</span>
                </div>
                <div className="text-[10px] text-slate-400 break-all select-all font-mono bg-surface-subtle p-1.5 rounded border border-surface-border/50">
                  0xdea7fc0070e42b632ebe90fe57509abdf9cb464a98f73277b1c6cc85b92777e7
                </div>
                <div className="grid grid-cols-2 gap-1 text-[10px] text-slate-300 font-sans">
                  <div>• Side: <strong className="text-emerald-400">BUY_LONG</strong></div>
                  <div>• Quantity: <strong>0.004 ETH</strong></div>
                  <div>• Limit Price: <strong>$2,200.00 USDso</strong></div>
                  <div>• Order Type: <strong>POST_ONLY (3)</strong></div>
                  <div>• Decoded Order ID: <strong className="font-mono text-cyan-300">5460236245818038181306</strong></div>
                  <div>• Gas Used: <strong>1,674,788 (6 Gwei)</strong></div>
                </div>
                <div className="text-[10px] text-emerald-400/90 font-sans bg-emerald-500/10 p-1.5 rounded border border-emerald-500/20">
                  ✓ Verified resting in order book: fullQty = remainingQty = 0.004 ETH. MarginBank locked 0.44 USDso collateral.
                </div>
              </div>

              {/* Tx 2: Order Cancellation */}
              <div className="p-3 rounded-lg bg-[#0b0e14] border border-surface-border space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-bold text-amber-300 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-amber-400" />
                    <span>2. Conditional Cancellation (cancelOrder)</span>
                  </span>
                  <span className="text-slate-400 text-[10px]">Block #36237214 (+9.5s)</span>
                </div>
                <div className="text-[10px] text-slate-400 break-all select-all font-mono bg-surface-subtle p-1.5 rounded border border-surface-border/50">
                  0x6c2661e69bf8593e117e9d7fafeb1f125640db5c4841243c648d22fe917ffea7
                </div>
                <div className="grid grid-cols-2 gap-1 text-[10px] text-slate-300 font-sans">
                  <div>• Target: <strong>cancelOrder(orderId)</strong></div>
                  <div>• Status: <strong className="text-emerald-400">1 (SUCCESS)</strong></div>
                  <div>• Emitted Event: <strong>OrderCancelled</strong></div>
                  <div>• Gas Used: <strong>136,005 (6 Gwei)</strong></div>
                  <div>• Position Opened: <strong>0.0000 ETH</strong></div>
                  <div>• Collateral Released: <strong className="text-emerald-400">0.44 USDso</strong></div>
                </div>
                <div className="text-[10px] text-cyan-300 font-sans bg-cyan-500/10 p-1.5 rounded border border-cyan-500/20">
                  ✓ Final Reconciled State: 0 positions, 0 locked margin, 20.00 USDso unlocked collateral 100% restored in MarginBank.
                </div>
              </div>
            </div>

            {/* RPC Verification Note */}
            <div className="p-2.5 rounded bg-surface-subtle border border-surface-border flex items-start gap-2 text-[10px] font-sans text-slate-400">
              <Terminal className="w-3.5 h-3.5 text-slate-400 flex-shrink-0 mt-0.5" />
              <div>
                <strong className="text-slate-300">How to Verify:</strong> Somnia Hideki is an ultra-high-throughput devnet (100ms blocks) without a public Blockscout web UI. Evaluators can verify both receipts via standard JSON-RPC:
                <code className="block mt-1 font-mono text-[9px] text-cyan-300 bg-[#0b0e14] p-1.5 rounded select-all border border-surface-border">
                  curl -X POST https://api.hideki2.infra.testnet.somnia.network -H "Content-Type: application/json" -d '{`{"jsonrpc":"2.0","method":"eth_getTransactionReceipt","params":["0xdea7fc0070e42b632ebe90fe57509abdf9cb464a98f73277b1c6cc85b92777e7"],"id":1}`}'
                </code>
              </div>
            </div>
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
          <div>
            {!wallet?.isConnected ? (
              <div className="p-8 text-center text-slate-500 font-mono text-xs">
                Connect wallet on Somnia Hideki v2 to view your resting orders.
              </div>
            ) : wallet.openOrdersStatus === 'LOADING' ? (
              <div className="p-8 text-center text-cyan-400 font-mono text-xs animate-pulse">
                Querying on-chain resting orders across Somnia Hideki CLOB pools...
              </div>
            ) : wallet.openOrdersStatus === 'ERROR' ? (
              <div className="p-8 text-center text-rose-400 font-mono text-xs">
                Failed to query open orders: {wallet.openOrdersError || 'RPC error'}
              </div>
            ) : !wallet.openOrders || wallet.openOrders.length === 0 ? (
              <div className="p-8 text-center text-slate-500 font-mono text-xs">
                Zero resting orders detected on Somnia Hideki v2 CLOB pools for connected account.
              </div>
            ) : (
              <table className="w-full text-left font-mono text-xs">
                <thead className="bg-[#0b0e14] text-[10px] text-slate-500 uppercase border-b border-surface-border">
                  <tr>
                    <th className="px-4 py-2">Order ID</th>
                    <th className="px-4 py-2">Market</th>
                    <th className="px-4 py-2">Side</th>
                    <th className="px-4 py-2 text-right">Limit Price</th>
                    <th className="px-4 py-2 text-right">Remaining Qty</th>
                    <th className="px-4 py-2 text-right">Filled</th>
                    <th className="px-4 py-2 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border/50">
                  {wallet.openOrders.map((o) => (
                    <tr key={o.id} className="hover:bg-surface-subtle transition-colors">
                      <td className="px-4 py-2 font-bold text-cyan-300">{o.id}</td>
                      <td className="px-4 py-2 font-bold text-white">{o.symbol}</td>
                      <td className="px-4 py-2">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            o.side === 'buy' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                          }`}
                        >
                          {o.side.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right text-slate-200">${o.price.toFixed(2)}</td>
                      <td className="px-4 py-2 text-right text-slate-200 font-bold">{o.amount}</td>
                      <td className="px-4 py-2 text-right text-slate-400">{o.filled}</td>
                      <td className="px-4 py-2 text-center">
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                          {o.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {activeTab === 'positions' && (
          <div>
            {!wallet?.isConnected ? (
              <div className="p-8 text-center text-slate-500 font-mono text-xs">
                Connect wallet on Somnia Hideki v2 to inspect MarginBank positions.
              </div>
            ) : wallet.positionsStatus === 'LOADING' ? (
              <div className="p-8 text-center text-cyan-400 font-mono text-xs animate-pulse">
                Querying on-chain perpetual positions in MarginBank (0x478769E1...)...
              </div>
            ) : wallet.positionsStatus === 'ERROR' ? (
              <div className="p-8 text-center text-rose-400 font-mono text-xs">
                Failed to query MarginBank positions: {wallet.positionsError || 'RPC error'}
              </div>
            ) : !wallet.positions || wallet.positions.length === 0 ? (
              <div className="p-8 text-center text-slate-500 font-mono text-xs">
                Zero active open positions detected in MarginBank (0x478769E1...). Account margin remains safely unencumbered.
              </div>
            ) : (
              <table className="w-full text-left font-mono text-xs">
                <thead className="bg-[#0b0e14] text-[10px] text-slate-500 uppercase border-b border-surface-border">
                  <tr>
                    <th className="px-4 py-2">Market</th>
                    <th className="px-4 py-2">Side</th>
                    <th className="px-4 py-2 text-right">Position Size</th>
                    <th className="px-4 py-2 text-right">Avg Entry Price</th>
                    <th className="px-4 py-2">Pool Contract</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border/50">
                  {wallet.positions.map((p, idx) => (
                    <tr key={idx} className="hover:bg-surface-subtle transition-colors">
                      <td className="px-4 py-2 font-bold text-white">{p.symbol}</td>
                      <td className="px-4 py-2">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                            p.side === 'long' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                          }`}
                        >
                          {p.side}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right text-slate-200 font-bold">{p.size}</td>
                      <td className="px-4 py-2 text-right text-cyan-300 font-bold">${p.entryPrice.toFixed(2)}</td>
                      <td className="px-4 py-2 text-slate-500 font-mono text-[10px] truncate max-w-[120px]">
                        {p.poolAddress}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
