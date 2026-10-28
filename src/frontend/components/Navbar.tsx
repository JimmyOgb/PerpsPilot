import React from 'react';
import {
  ShieldCheck,
  Wifi,
  AlertTriangle,
  Wallet,
  ExternalLink,
  Layers,
  Activity,
  BarChart2,
  Terminal
} from 'lucide-react';
import { WalletState } from '../types.js';
import { SOMNIA_HIDEKI_CHAIN_ID, SOMNIA_EXPLORER_URL } from '../constants.js';

interface NavbarProps {
  wallet: WalletState;
  onConnect: () => void;
  onDisconnect: () => void;
  onSwitchNetwork: () => void;
  currentBlock: bigint | null;
  activeTab: 'terminal' | 'cockpit' | 'markets' | 'diagnostics';
  setActiveTab: (tab: 'terminal' | 'cockpit' | 'markets' | 'diagnostics') => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  wallet,
  onConnect,
  onDisconnect,
  onSwitchNetwork,
  currentBlock,
  activeTab,
  setActiveTab,
}) => {
  const isWrongChain = wallet.isConnected && wallet.chainId !== SOMNIA_HIDEKI_CHAIN_ID;

  return (
    <header className="border-b border-surface-border bg-surface px-4 py-2.5 flex items-center justify-between sticky top-0 z-30">
      {/* Brand & Left Navigation */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-lg shadow-[0_0_15px_rgba(0,194,255,0.2)]">
            🛫
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-base text-white tracking-tight">PerpsPilot</span>
              <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                Hideki v2
              </span>
            </div>
            <p className="text-[10px] text-slate-400 leading-none">dreamDEX Pre-Trade Copilot</p>
          </div>
        </div>

        {/* View Switcher Tabs */}
        <nav className="hidden md:flex items-center gap-1 bg-[#0b0e14] p-1 rounded-lg border border-surface-border">
          <button
            onClick={() => setActiveTab('terminal')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              activeTab === 'terminal'
                ? 'bg-surface-subtle text-white border border-surface-border shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Terminal className="w-3.5 h-3.5 text-cyan-400" />
            Terminal
          </button>
          <button
            onClick={() => setActiveTab('cockpit')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              activeTab === 'cockpit'
                ? 'bg-surface-subtle text-white border border-surface-border shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            Risk Cockpit
          </button>
          <button
            onClick={() => setActiveTab('markets')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              activeTab === 'markets'
                ? 'bg-surface-subtle text-white border border-surface-border shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <BarChart2 className="w-3.5 h-3.5 text-purple-400" />
            Markets (21)
          </button>
          <button
            onClick={() => setActiveTab('diagnostics')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              activeTab === 'diagnostics'
                ? 'bg-surface-subtle text-white border border-surface-border shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Activity className="w-3.5 h-3.5 text-amber-400" />
            Preflight Health
          </button>
        </nav>
      </div>

      {/* Right Controls: Network status, Dry-Run badge, Block height, Wallet */}
      <div className="flex items-center gap-3">
        {/* Block Height Monitor */}
        <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#0b0e14] border border-surface-border text-xs font-mono text-slate-300">
          <Layers className="w-3.5 h-3.5 text-slate-500" />
          <span>Block:</span>
          <span className="text-cyan-400 font-semibold">
            {currentBlock ? `#${currentBlock.toString()}` : 'Syncing...'}
          </span>
        </div>

        {/* Strict Dry Run Guard Badge */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-amber-500/10 border border-amber-500/30 text-[11px] font-semibold text-amber-300">
          <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
          <span>DRY_RUN: ACTIVE</span>
        </div>

        {/* Network Badge */}
        {isWrongChain ? (
          <button
            onClick={onSwitchNetwork}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-rose-500/20 border border-rose-500/40 text-xs font-medium text-rose-300 hover:bg-rose-500/30 transition-colors animate-pulse"
          >
            <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
            <span>Wrong Chain ({wallet.chainId}) — Switch to 50383</span>
          </button>
        ) : (
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#0b0e14] border border-surface-border text-xs font-medium text-slate-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block" />
            <span>Somnia Hideki (50383)</span>
          </div>
        )}

        {/* Wallet Connection */}
        {wallet.isConnected && wallet.address ? (
          <div className="flex items-center gap-2 bg-[#0b0e14] border border-surface-border rounded-lg p-1">
            <div className="px-2 py-0.5 text-right hidden sm:block">
              <div className="text-[10px] text-slate-400 font-mono">
                {wallet.sttBalance ? `${wallet.sttBalance} STT` : 'Syncing STT...'}
              </div>
            </div>
            <a
              href={`${SOMNIA_EXPLORER_URL}/address/${wallet.address}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 bg-surface-subtle hover:bg-surface-hover text-white px-2.5 py-1 rounded text-xs font-mono font-medium border border-surface-border transition-colors"
            >
              <span>{wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}</span>
              <ExternalLink className="w-3 h-3 text-slate-400" />
            </a>
            <button
              onClick={onDisconnect}
              title="Disconnect"
              className="text-slate-400 hover:text-rose-400 px-1.5 py-1 text-xs transition-colors"
            >
              ✕
            </button>
          </div>
        ) : (
          <button
            onClick={onConnect}
            disabled={wallet.isConnecting}
            className="flex items-center gap-1.5 bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700 text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold shadow-[0_0_15px_rgba(0,194,255,0.25)] transition-all"
          >
            <Wallet className="w-3.5 h-3.5" />
            <span>{wallet.isConnecting ? 'Connecting...' : 'Connect Wallet'}</span>
          </button>
        )}
      </div>
    </header>
  );
};
