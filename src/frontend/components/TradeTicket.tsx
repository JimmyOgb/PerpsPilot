import React, { useState, useEffect } from 'react';
import { formatUnits } from 'viem';
import {
  ShieldCheck,
  AlertCircle,
  Sliders,
  HelpCircle,
  ArrowRight,
  Info,
  Radio,
  Lock,
} from 'lucide-react';
import { MarketInfo, OrderSide, OrderType, OrderProposal, WalletState } from '../types.js';
import {
  quantizePriceToTick,
  quantizeAmountToLot,
  calculateNotional,
  calculateIMF,
  calculateConfiguredMargin,
  calculateProtocolFloorMargin,
  calculateRequiredMargin,
  calculateLiquidationPrice,
  evaluateOrderRisk,
} from '../utils/riskEngine.js';
import { MAX_SINGLE_ORDER_NOTIONAL_USD, MAX_LEVERAGE, DEFAULT_LEVERAGE } from '../constants.js';

interface TradeTicketProps {
  market: MarketInfo;
  wallet: WalletState;
  onSimulateOrder: (proposal: OrderProposal, isLiveMode?: boolean) => void;
  selectedPrice?: number;
}

export const TradeTicket: React.FC<TradeTicketProps> = ({
  market,
  wallet,
  onSimulateOrder,
  selectedPrice,
}) => {
  const [side, setSide] = useState<OrderSide>('BUY_LONG');
  const [orderType, setOrderType] = useState<OrderType>('LIMIT');
  const [priceInput, setPriceInput] = useState<string>('0');
  const [amountInput, setAmountInput] = useState<string>('0');
  const [leverage, setLeverage] = useState<number>(DEFAULT_LEVERAGE);
  const [slippage, setSlippage] = useState<number>(0.5);
  const [executionMode, setExecutionMode] = useState<'preview' | 'live'>('preview');

  // Automatically select live testnet execution when wallet connects on Somnia Hideki v2
  useEffect(() => {
    if (wallet.isConnected && wallet.isCorrectNetwork) {
      setExecutionMode('live');
    }
  }, [wallet.isConnected, wallet.isCorrectNetwork]);

  // Sync price if live mark arrives and input is still zero
  useEffect(() => {
    if (market.markPrice > 0 && (priceInput === '0' || priceInput === '')) {
      setPriceInput(market.markPrice.toFixed(market.quoteDecimals > 6 ? 2 : 4));
    }
  }, [market.markPrice, market.quoteDecimals]);

  // Set default amount to exceed minimum order quantity safely (e.g., 2x minOrderQty)
  useEffect(() => {
    if (amountInput === '0' || amountInput === '') {
      const defaultAmount = market.minOrderQty > 0 ? (market.minOrderQty * 2) : 0.0084;
      setAmountInput(defaultAmount.toString());
    }
  }, [market.minOrderQty]);

  // Sync selected price from order book if clicked
  useEffect(() => {
    if (selectedPrice && selectedPrice > 0) {
      setPriceInput(selectedPrice.toFixed(market.quoteDecimals > 6 ? 2 : 4));
    }
  }, [selectedPrice, market.quoteDecimals]);

  // Derived calculations
  const parsedPrice = parseFloat(priceInput) || (market.markPrice > 0 ? market.markPrice : 1);
  const parsedAmount = parseFloat(amountInput) || 0;
  const notional = calculateNotional(parsedPrice, parsedAmount);
  const configuredMargin = calculateConfiguredMargin(notional, leverage);
  const protocolFloor = calculateProtocolFloorMargin(notional, market.imfBps);
  const imf = calculateRequiredMargin(notional, leverage, market.imfBps);
  const estFee = Number((notional * 0.0005).toFixed(4));
  const liqPrice = calculateLiquidationPrice(parsedPrice, leverage, side === 'BUY_LONG');

  const proposal: OrderProposal = {
    market: market.display || market.symbol,
    poolAddress: market.poolAddress,
    side,
    type: orderType,
    price: parsedPrice,
    amount: parsedAmount,
    notional,
    leverage,
    imfRequired: imf,
    estFee,
    estLiquidationPrice: liqPrice,
    slippageTolerance: slippage,
    timestamp: Date.now(),
    clientNonce: `0x${Math.random().toString(16).slice(2, 10)}${Date.now().toString(16)}`,
  };

  const riskEval = evaluateOrderRisk(proposal, wallet, market.minOrderQty, market.isPriceable);

  // Live execution readiness checks
  const isWalletConnected = wallet.isConnected && !!wallet.address;
  const isCorrectNetwork = wallet.isCorrectNetwork;
  const hasGasBalance = (wallet.sttRaw ?? 0n) >= 50_000_000_000_000_000n; // >= 0.05 STT minimum
  const unlockedCollateralUsd = wallet.unlockedCollateralRaw
    ? Number(formatUnits(wallet.unlockedCollateralRaw, 18))
    : 0;
  const hasCollateral = unlockedCollateralUsd >= imf;
  const isLiveReady =
    executionMode === 'live'
      ? isWalletConnected && isCorrectNetwork && hasGasBalance && hasCollateral && riskEval.isSafeToSimulate
      : riskEval.isSafeToSimulate;

  const handlePriceStep = (delta: number) => {
    const newPrice = Math.max(market.tickSize, parsedPrice + delta * market.tickSize);
    const quantized = quantizePriceToTick(newPrice, market.tickSize, side === 'SELL_SHORT');
    setPriceInput(quantized.toFixed(market.quoteDecimals > 6 ? 2 : 4));
  };

  const handleSetLastPrice = () => {
    if (market.markPrice > 0) {
      setPriceInput(market.markPrice.toFixed(market.quoteDecimals > 6 ? 2 : 4));
    }
  };

  const handlePercentageClick = (pct: number) => {
    // Sized relative to $20 safety cap or MarginBank balance
    const availableCollateral = wallet.unlockedCollateralRaw
      ? parseFloat(wallet.marginBankBalance || '0')
      : MAX_SINGLE_ORDER_NOTIONAL_USD;
    const baseNotional = Math.min(availableCollateral * (leverage / 2), MAX_SINGLE_ORDER_NOTIONAL_USD);
    const targetNotional = Math.max((baseNotional * pct) / 100, parsedPrice * market.minOrderQty);
    const rawAmount = targetNotional / parsedPrice;
    const quantized = quantizeAmountToLot(rawAmount, market.lotSize);
    setAmountInput(quantized.toString());
  };

  return (
    <div className="bg-surface rounded-lg border border-surface-border p-3.5 flex flex-col gap-3 text-xs">
      {/* Execution Mode Selector (Preview vs Live) */}
      <div className="grid grid-cols-2 p-1 bg-[#0b0e14] rounded-lg border border-surface-border text-xs font-semibold">
        <button
          type="button"
          onClick={() => setExecutionMode('preview')}
          className={`py-1.5 rounded-md flex items-center justify-center gap-1.5 transition-all ${
            executionMode === 'preview'
              ? 'bg-surface-subtle text-cyan-400 border border-cyan-500/30 shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Info className="w-3.5 h-3.5" />
          <span>Preview Mode</span>
        </button>
        <button
          type="button"
          onClick={() => setExecutionMode('live')}
          className={`py-1.5 rounded-md flex items-center justify-center gap-1.5 transition-all ${
            executionMode === 'live'
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
          <span>Live Mode (Wallet)</span>
        </button>
      </div>

      {/* Side Toggle: Long vs Short */}
      <div className="grid grid-cols-2 gap-2 bg-[#0b0e14] p-1 rounded-lg border border-surface-border">
        <button
          onClick={() => setSide('BUY_LONG')}
          className={`py-2 rounded-md font-bold transition-all flex items-center justify-center gap-1.5 ${
            side === 'BUY_LONG'
              ? 'bg-emerald-500 text-slate-950 shadow-[0_0_12px_rgba(0,229,153,0.35)]'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <span>Buy / Long</span>
        </button>
        <button
          onClick={() => setSide('SELL_SHORT')}
          className={`py-2 rounded-md font-bold transition-all flex items-center justify-center gap-1.5 ${
            side === 'SELL_SHORT'
              ? 'bg-rose-500 text-white shadow-[0_0_12px_rgba(255,77,106,0.35)]'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <span>Sell / Short</span>
        </button>
      </div>

      {/* Order Type Selector */}
      <div className="flex items-center justify-between border-b border-surface-border pb-2">
        <div className="flex items-center gap-2">
          {(['LIMIT', 'MARKET'] as OrderType[]).map((t) => (
            <button
              key={t}
              onClick={() => setOrderType(t)}
              className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors ${
                orderType === t
                  ? 'bg-surface-subtle text-cyan-400 border border-surface-border'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {t === 'LIMIT' ? 'Limit Order' : 'Market Order'}
            </button>
          ))}
        </div>

        <div className="text-[10px] text-slate-400 flex items-center gap-1">
          <span>Slippage:</span>
          <span className="font-mono text-slate-300 font-semibold">{slippage}%</span>
        </div>
      </div>

      {/* Collateral Breakdown Banner (Truthful on-chain query) */}
      <div className="bg-[#0b0e14] p-2.5 rounded-lg border border-surface-border/80 flex flex-col gap-1">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-slate-400 flex items-center gap-1">
            <span>MarginBank Collateral</span>
            <span title="Deposited USDso backing perpetual positions on Hideki MarginBank (0x478769E1...)">
              <HelpCircle className="w-3 h-3 text-slate-500" />
            </span>
          </span>
          <span className="font-mono font-bold">
            {!wallet.isConnected ? (
              <span className="text-amber-400/80">Unconnected</span>
            ) : wallet.balanceStatus === 'LOADING' ? (
              <span className="text-cyan-400 animate-pulse">Querying RPC...</span>
            ) : wallet.marginBankBalance !== null ? (
              <span className="text-slate-200">${wallet.marginBankBalance} USDso</span>
            ) : (
              <span className="text-rose-400">Read Error</span>
            )}
          </span>
        </div>
        <div className="flex items-center justify-between text-[10px] text-slate-500">
          <span>Liquid Wallet Balance</span>
          <span className="font-mono">
            {!wallet.isConnected ? (
              'Unconnected'
            ) : wallet.balanceStatus === 'LOADING' ? (
              'Querying...'
            ) : wallet.usdsoWalletBalance !== null ? (
              `$${wallet.usdsoWalletBalance} USDso`
            ) : (
              <span className="text-rose-400">Read Error</span>
            )}
          </span>
        </div>
      </div>

      {/* Price Input (Tick Quantized) */}
      {orderType === 'LIMIT' && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>Limit Price</span>
            <button
              onClick={handleSetLastPrice}
              className="text-[10px] text-cyan-400 hover:underline"
            >
              Use Last (${market.markPrice > 0 ? market.markPrice.toFixed(2) : '0.00'})
            </button>
          </div>
          <div className="flex items-center bg-[#0b0e14] border border-surface-border rounded-lg overflow-hidden focus-within:border-cyan-500/60 transition-colors">
            <button
              onClick={() => handlePriceStep(-1)}
              className="px-3 py-2 text-slate-400 hover:text-slate-100 hover:bg-surface-subtle"
            >
              -
            </button>
            <input
              type="number"
              step={market.tickSize}
              value={priceInput}
              onChange={(e) => setPriceInput(e.target.value)}
              className="flex-1 bg-transparent text-center font-mono font-bold text-slate-100 text-sm outline-none py-1.5"
            />
            <button
              onClick={() => handlePriceStep(1)}
              className="px-3 py-2 text-slate-400 hover:text-slate-100 hover:bg-surface-subtle"
            >
              +
            </button>
          </div>
          <div className="text-[10px] text-slate-500 font-mono flex justify-between px-1">
            <span>Tick size: ${market.tickSize}</span>
            <span>Quote: {market.quoteSymbol}</span>
          </div>
        </div>
      )}

      {/* Amount Input (Lot Quantized) */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-[11px] text-slate-400">
          <span>Order Size</span>
          <span className="text-[10px] font-mono text-slate-500">
            Min: {market.minOrderQty} {market.baseSymbol}
          </span>
        </div>
        <div className="flex items-center bg-[#0b0e14] border border-surface-border rounded-lg overflow-hidden focus-within:border-cyan-500/60 transition-colors px-3 py-1.5">
          <input
            type="number"
            step={market.lotSize}
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
            className="flex-1 bg-transparent font-mono font-bold text-slate-100 text-sm outline-none"
            placeholder="0.0000"
          />
          <span className="text-slate-400 font-semibold font-mono text-xs">
            {market.baseSymbol}
          </span>
        </div>
        <div className="text-[10px] text-slate-500 font-mono flex justify-between px-1">
          <span>Lot size: {market.lotSize}</span>
          <span>Decimals: {market.baseDecimals}</span>
        </div>

        {/* Quick Sizing Chips */}
        <div className="grid grid-cols-4 gap-1.5 pt-1">
          {[25, 50, 75, 100].map((pct) => (
            <button
              key={pct}
              onClick={() => handlePercentageClick(pct)}
              className="py-1 rounded bg-[#0b0e14] hover:bg-surface-subtle border border-surface-border text-[10px] font-mono font-medium text-slate-300 transition-colors"
            >
              {pct}%
            </button>
          ))}
        </div>
      </div>

      {/* Leverage Slider */}
      <div className="flex flex-col gap-1.5 pt-1">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-slate-400 flex items-center gap-1">
            <Sliders className="w-3 h-3 text-slate-500" />
            <span>Leverage</span>
          </span>
          <span className="font-mono font-bold text-cyan-400">
            {leverage}x (Max {market.maxLeverage || MAX_LEVERAGE}x)
          </span>
        </div>
        <input
          type="range"
          min={1}
          max={market.maxLeverage || MAX_LEVERAGE}
          value={leverage}
          onChange={(e) => setLeverage(Number(e.target.value))}
          className="w-full accent-cyan-400 h-1 bg-[#0b0e14] rounded cursor-pointer"
        />
      </div>

      {/* Real-time Order Summary Breakdown */}
      <div className="border-t border-surface-border pt-2.5 space-y-1.5 text-[11px] font-mono">
        <div className="flex items-center justify-between">
          <span className="text-slate-400 font-sans">Order Notional:</span>
          <span
            className={`font-bold ${
              notional > MAX_SINGLE_ORDER_NOTIONAL_USD ? 'text-rose-400' : 'text-slate-200'
            }`}
          >
            ${notional.toFixed(2)} USDso
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-400 font-sans">Target Margin ({leverage}x / {(100 / leverage).toFixed(1)}%):</span>
          <span className="text-slate-300 font-medium">${configuredMargin.toFixed(2)} USDso</span>
        </div>
        <div className="flex items-center justify-between text-[10px] text-slate-500">
          <span className="font-sans">Protocol Floor ({market.imfBps / 100}% IMF / {Math.round(10000 / market.imfBps)}x max):</span>
          <span>${protocolFloor.toFixed(2)} USDso</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-400 font-sans">Est. Execution Fee:</span>
          <span className="text-slate-400">${estFee.toFixed(4)} USDso</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-400 font-sans">Est. Liquidation:</span>
          <span className="text-amber-400">${liqPrice.toFixed(2)} USDso</span>
        </div>
      </div>

      {/* Risk Gate Warning Banners */}
      {notional > MAX_SINGLE_ORDER_NOTIONAL_USD && (
        <div className="p-2 rounded bg-rose-500/10 border border-rose-500/30 flex items-start gap-1.5 text-rose-300 text-[10px]">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>
            Notional (${notional.toFixed(2)}) exceeds testnet safety cap ($
            {MAX_SINGLE_ORDER_NOTIONAL_USD.toFixed(2)}). Resize before proceeding.
          </span>
        </div>
      )}

      {parsedAmount < market.minOrderQty && parsedAmount > 0 && (
        <div className="p-2 rounded bg-rose-500/10 border border-rose-500/30 flex items-start gap-1.5 text-rose-300 text-[10px]">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>
            Order size ({parsedAmount} {market.baseSymbol}) is below market minimum ({market.minOrderQty} {market.baseSymbol}).
          </span>
        </div>
      )}

      {/* Live Mode Explicit Alert Banner */}
      {executionMode === 'live' && (
        <div className="p-2.5 rounded-lg bg-amber-500/15 border border-amber-500/30 flex flex-col gap-1.5 text-amber-200 text-[11px]">
          <div className="flex items-center gap-1.5 font-bold">
            <Radio className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
            <span>LIVE TESTNET TRADING MODE (Chain ID 50383)</span>
          </div>
          {!isWalletConnected && (
            <p className="text-amber-300/80 text-[10px]">
              ⚠️ Wallet not connected. Please connect a Web3 wallet configured for Somnia Hideki.
            </p>
          )}
          {isWalletConnected && !isCorrectNetwork && (
            <p className="text-rose-300 text-[10px]">
              ⚠️ Wrong network (Chain ID {wallet.chainId}). Please switch your wallet to Somnia Hideki (50383).
            </p>
          )}
          {isWalletConnected && isCorrectNetwork && !hasGasBalance && (
            <p className="text-rose-300 text-[10px]">
              ⚠️ Insufficient STT for gas: holding {wallet.sttBalance ?? '0'} STT. Minimum recommended is 0.05 STT. Bridge STT from Shannon or request in Somnia Discord #dev-chat.
            </p>
          )}
          {isWalletConnected && isCorrectNetwork && !hasCollateral && (
            <p className="text-rose-300 text-[10px]">
              ⚠️ Insufficient unlocked collateral in MarginBank: holding ${unlockedCollateralUsd.toFixed(2)} USDso. Required margin is ${imf.toFixed(2)} USDso. Bridge USDso from Shannon and deposit into MarginBank.
            </p>
          )}
          {isWalletConnected && isCorrectNetwork && hasGasBalance && hasCollateral && (
            <p className="text-emerald-300 text-[10px]">
              ✓ Account funded & pre-flight checks passed. Orders require explicit wallet signature confirmation.
            </p>
          )}
        </div>
      )}

      {/* Passing preview disclaimer note */}
      <div className="p-2.5 rounded bg-surface-subtle border border-surface-border flex flex-col gap-1 text-[10px] text-slate-400 leading-tight">
        <div className="flex items-start gap-1.5">
          <Info className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0 mt-0.5" />
          <span className="text-slate-300 font-medium">
            A passing preview is not a guarantee of fill.
          </span>
        </div>
        <p className="text-slate-400 pl-5">
          • <strong className="text-slate-300">POST_ONLY</strong> guarantees maker execution upon acceptance, but resting orders remain subject to subsequent market fill risk until cancelled.
        </p>
        <p className="text-slate-400 pl-5">
          • <strong className="text-slate-300">Cancellation</strong> stops resting orders, but does not close or reverse a position if the order has already matched.
        </p>
      </div>

      {/* Execution Mode Notice */}
      <div className={`p-2 rounded border flex items-center justify-between text-[10px] ${
        executionMode === 'live'
          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
          : 'bg-cyan-500/10 border-cyan-500/30 text-cyan-300'
      }`}>
        <span className="flex items-center gap-1">
          <ShieldCheck className={`w-3 h-3 ${executionMode === 'live' ? 'text-emerald-400' : 'text-cyan-400'}`} />
          <span>{executionMode === 'live' ? 'Live Testnet Execution' : 'Pre-Trade Simulation'}</span>
        </span>
        <span className="font-mono text-[9px] uppercase tracking-wider font-bold">
          {executionMode === 'live' ? 'WALLET_SIGNATURE_REQUIRED' : 'SIMULATION_ONLY (NO_BROADCAST)'}
        </span>
      </div>

      {/* Primary Action Button */}
      {executionMode === 'live' ? (
        <button
          onClick={() => onSimulateOrder(proposal, true)}
          disabled={!isLiveReady}
          className={`w-full py-2.5 rounded-lg font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md ${
            !isLiveReady
              ? 'bg-surface-subtle text-slate-500 border border-surface-border cursor-not-allowed'
              : side === 'BUY_LONG'
              ? 'bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-slate-950 shadow-[0_0_15px_rgba(0,229,153,0.35)]'
              : 'bg-rose-500 hover:bg-rose-400 active:bg-rose-600 text-white shadow-[0_0_15px_rgba(255,77,106,0.35)]'
          }`}
        >
          <Lock className="w-3.5 h-3.5" />
          <span>Review & Authorize Testnet Order</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      ) : (
        <button
          onClick={() => onSimulateOrder(proposal, false)}
          disabled={!riskEval.isSafeToSimulate}
          className={`w-full py-2.5 rounded-lg font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md ${
            !riskEval.isSafeToSimulate
              ? 'bg-surface-subtle text-slate-500 border border-surface-border cursor-not-allowed'
              : side === 'BUY_LONG'
              ? 'bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-slate-950 shadow-[0_0_15px_rgba(0,229,153,0.25)]'
              : 'bg-rose-500 hover:bg-rose-400 active:bg-rose-600 text-white shadow-[0_0_15px_rgba(255,77,106,0.25)]'
          }`}
        >
          <span>Preview Order (Simulation Only)</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};
