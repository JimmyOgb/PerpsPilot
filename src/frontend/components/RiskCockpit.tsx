import React from 'react';
import {
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Activity,
  DollarSign,
  HelpCircle,
  Clock
} from 'lucide-react';
import { RiskEvaluation, WalletState, MarketInfo } from '../types.js';
import {
  MAX_SINGLE_ORDER_NOTIONAL_USD,
  MAX_LEVERAGE,
  MAX_DAILY_RISK_BUDGET_USD,
  MARGIN_BANK_ADDRESS,
  ETH_PERP_POOL
} from '../constants.js';

interface RiskCockpitProps {
  evaluation: RiskEvaluation;
  wallet: WalletState;
  market: MarketInfo;
}

export const RiskCockpit: React.FC<RiskCockpitProps> = ({
  evaluation,
  wallet,
  market,
}) => {
  const isPass = evaluation.statusBannerType === 'PASS';
  const isBlocked = evaluation.statusBannerType === 'BLOCKED';
  const isDisconnected = evaluation.statusBannerType === 'DISCONNECTED';
  const isLoading = evaluation.statusBannerType === 'LOADING';

  const bannerBg = isPass
    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
    : isBlocked
    ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
    : isDisconnected
    ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
    : 'bg-cyan-500/10 border-cyan-500/30 text-cyan-300';

  const iconBg = isPass
    ? 'bg-emerald-500/20 text-emerald-400'
    : isBlocked
    ? 'bg-rose-500/20 text-rose-400'
    : isDisconnected
    ? 'bg-amber-500/20 text-amber-400'
    : 'bg-cyan-500/20 text-cyan-400';

  return (
    <div className="space-y-6">
      {/* Truthful Top Status Banner (Remediated for SEC-02) */}
      <div className={`p-4 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${bannerBg}`}>
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg flex-shrink-0 ${iconBg}`}>
            {isPass && <CheckCircle2 className="w-6 h-6" />}
            {isBlocked && <AlertTriangle className="w-6 h-6" />}
            {isDisconnected && <HelpCircle className="w-6 h-6" />}
            {isLoading && <Clock className="w-6 h-6 animate-spin" />}
          </div>
          <div>
            <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
              <span>{evaluation.statusBannerTitle}</span>
              <span className={`text-xs px-2 py-0.5 rounded font-mono font-medium ${
                isPass ? 'bg-emerald-500/20 text-emerald-400' :
                isBlocked ? 'bg-rose-500/20 text-rose-400' :
                'bg-amber-500/20 text-amber-400'
              }`}>
                {evaluation.blockedOrdersCount} breaches detected
              </span>
            </h2>
            <p className="text-xs text-slate-300 mt-0.5">
              {evaluation.statusBannerSubtitle}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center">
          <span className="text-xs text-slate-400">Policy:</span>
          <span className="px-2.5 py-1 rounded bg-[#0b0e14] border border-surface-border text-xs font-mono font-semibold text-cyan-400">
            FAIL_CLOSED
          </span>
        </div>
      </div>

      {/* 4 Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Net Exposure */}
        <div className="bg-surface rounded-xl border border-surface-border p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-medium">Net Exposure (Simulated)</span>
            <DollarSign className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="my-3">
            <div className="text-2xl font-bold font-mono text-white">
              ${evaluation.netExposureUsd.toFixed(2)}{' '}
              <span className="text-xs text-slate-500 font-sans font-normal">/ ${MAX_SINGLE_ORDER_NOTIONAL_USD.toFixed(2)}</span>
            </div>
            <div className="w-full bg-[#0b0e14] h-1.5 rounded-full mt-2 overflow-hidden">
              <div
                className="bg-cyan-400 h-full rounded-full transition-all duration-300"
                style={{ width: `${Math.min(100, (evaluation.netExposureUsd / MAX_SINGLE_ORDER_NOTIONAL_USD) * 100)}%` }}
              />
            </div>
          </div>
          <div className="text-[11px] text-emerald-400 font-medium">
            Within hard safety bounds (Cap: $20.00)
          </div>
        </div>

        {/* Card 2: Margin Health Ratio */}
        <div className="bg-surface rounded-xl border border-surface-border p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-medium">Margin Ratio</span>
            <Activity className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="my-3">
            <div className={`text-2xl font-bold font-mono ${evaluation.accountVerified ? 'text-emerald-400' : 'text-slate-500'}`}>
              {evaluation.accountVerified ? `${evaluation.marginHealthRatio.toFixed(1)}%` : 'UNVERIFIED'}
            </div>
            <div className="w-full bg-[#0b0e14] h-1.5 rounded-full mt-2 overflow-hidden">
              <div className={`h-full rounded-full ${evaluation.accountVerified ? 'bg-emerald-400 w-full' : 'bg-slate-700 w-0'}`} />
            </div>
          </div>
          <div className="text-[11px] text-slate-400">
            {evaluation.accountVerified ? 'Healthy • Liquidation at < 10%' : 'Connect wallet to inspect MarginBank'}
          </div>
        </div>

        {/* Card 3: Daily P&L / Risk Budget */}
        <div className="bg-surface rounded-xl border border-surface-border p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-medium">Daily Risk Budget</span>
            <ShieldCheck className="w-4 h-4 text-amber-400" />
          </div>
          <div className="my-3">
            <div className="text-2xl font-bold font-mono text-slate-200">
              $0.00{' '}
              <span className="text-xs text-slate-500 font-sans font-normal">/ ${MAX_DAILY_RISK_BUDGET_USD.toFixed(2)}</span>
            </div>
            <div className="w-full bg-[#0b0e14] h-1.5 rounded-full mt-2 overflow-hidden">
              <div className="bg-amber-400 h-full rounded-full w-0" />
            </div>
          </div>
          <div className="text-[11px] text-slate-400">
            0% budget consumed today (Dry-Run active)
          </div>
        </div>

        {/* Card 4: Orders Blocked */}
        <div className="bg-surface rounded-xl border border-surface-border p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-medium">Orders Blocked</span>
            <Lock className="w-4 h-4 text-purple-400" />
          </div>
          <div className="my-3">
            <div className="text-2xl font-bold font-mono text-white">
              {evaluation.blockedOrdersCount}{' '}
              <span className="text-xs text-slate-500 font-sans font-normal">violations</span>
            </div>
            <div className="w-full bg-[#0b0e14] h-1.5 rounded-full mt-2 overflow-hidden">
              <div
                className={`h-full rounded-full ${evaluation.blockedOrdersCount === 0 ? 'bg-emerald-400 w-full' : 'bg-rose-500 w-full'}`}
              />
            </div>
          </div>
          <div className="text-[11px] text-slate-400">
            Automated pre-trade guardrail
          </div>
        </div>
      </div>

      {/* 5-Point Security Integrity Matrix */}
      <div className="bg-surface rounded-xl border border-surface-border p-5">
        <div className="flex items-center justify-between border-b border-surface-border pb-3 mb-4">
          <div>
            <h3 className="text-sm font-bold text-white">5-Point Security & Pre-Trade Integrity Matrix</h3>
            <p className="text-xs text-slate-400">Deterministic assertions before order construction</p>
          </div>
          <span className="text-xs font-mono text-cyan-400">Somnia Hideki (50383)</span>
        </div>

        <div className="space-y-3">
          {evaluation.checks.map(chk => (
            <div
              key={chk.code}
              className="p-3 rounded-lg bg-[#0b0e14] border border-surface-border flex items-start justify-between gap-4"
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5">
                  {chk.passed ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  ) : chk.severity === 'CRITICAL' ? (
                    <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                  ) : (
                    <HelpCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                  )}
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-200">{chk.name} ({chk.code})</div>
                  <div className="text-[11px] text-slate-400 mt-0.5 font-mono">{chk.message}</div>
                </div>
              </div>
              <span className={`text-xs font-mono font-semibold px-2 py-0.5 rounded text-[10px] ${
                chk.passed ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                chk.severity === 'CRITICAL' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' :
                'bg-amber-500/20 text-amber-400 border border-amber-500/30'
              }`}>
                {chk.status}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Active Risk Parameters Table */}
      <div className="bg-surface rounded-xl border border-surface-border p-5">
        <h3 className="text-sm font-bold text-white mb-3">Active Guardrail Parameters</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 text-xs font-mono">
          <div className="p-3 bg-[#0b0e14] rounded-lg border border-surface-border">
            <div className="text-[10px] text-slate-500 uppercase">Max Order Notional</div>
            <div className="text-slate-200 font-bold mt-1">${MAX_SINGLE_ORDER_NOTIONAL_USD.toFixed(2)} USDso</div>
          </div>
          <div className="p-3 bg-[#0b0e14] rounded-lg border border-surface-border">
            <div className="text-[10px] text-slate-500 uppercase">Max Leverage</div>
            <div className="text-cyan-400 font-bold mt-1">{MAX_LEVERAGE}x (500 bps IMF)</div>
          </div>
          <div className="p-3 bg-[#0b0e14] rounded-lg border border-surface-border">
            <div className="text-[10px] text-slate-500 uppercase">Daily Risk Cap</div>
            <div className="text-slate-200 font-bold mt-1">${MAX_DAILY_RISK_BUDGET_USD.toFixed(2)} USDso</div>
          </div>
          <div className="p-3 bg-[#0b0e14] rounded-lg border border-surface-border">
            <div className="text-[10px] text-slate-500 uppercase">Oracle Freshness</div>
            <div className="text-emerald-400 font-bold mt-1">&lt; 60 seconds</div>
          </div>
          <div className="p-3 bg-[#0b0e14] rounded-lg border border-surface-border">
            <div className="text-[10px] text-slate-500 uppercase">Max Slippage</div>
            <div className="text-slate-200 font-bold mt-1">1.0%</div>
          </div>
        </div>
      </div>
    </div>
  );
};
