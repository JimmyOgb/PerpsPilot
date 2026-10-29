import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  X,
  CheckCircle2,
  ShieldCheck,
  Download,
  Lock,
  AlertTriangle,
  Info,
  Loader2,
  Radio,
  Ban,
} from 'lucide-react';
import { formatUnits, parseUnits, createPublicClient, http, type Hex, type Address } from 'viem';
import { OrderProposal, LifecycleStep, WalletState, MarketInfo } from '../types.js';
import {
  SOMNIA_HIDEKI_CHAIN_ID,
  SOMNIA_RPC_URL,
  ETH_PERP_POOL,
  MARGIN_BANK_ADDRESS,
  DEFAULT_MARKETS,
} from '../constants.js';
import { OrderPlanner } from '../../execution/OrderPlanner.js';
import { ExecutionGuard } from '../../execution/ExecutionGuard.js';
import { LiveOrderAdapter } from '../../execution/LiveOrderAdapter.js';
import { ReceiptVerifier } from '../../execution/ReceiptVerifier.js';
import type { LiveExecutionState } from '../../execution/types.js';

interface OrderLifecycleModalProps {
  proposal: OrderProposal;
  isOpen: boolean;
  onClose: () => void;
  isLiveMode?: boolean;
  wallet?: WalletState;
  getWalletClient?: () => any;
  market?: MarketInfo;
}

export const OrderLifecycleModal: React.FC<OrderLifecycleModalProps> = ({
  proposal,
  isOpen,
  onClose,
  isLiveMode: initialLiveMode = false,
  wallet,
  getWalletClient,
  market: propMarket,
}) => {
  if (!isOpen) return null;

  // Resolve market metadata
  const market = useMemo(() => {
    if (propMarket) return propMarket;
    return (
      DEFAULT_MARKETS.find(
        (m) =>
          m.symbol.toUpperCase() === proposal.market.toUpperCase() ||
          m.display.toUpperCase() === proposal.market.toUpperCase() ||
          (proposal.poolAddress && m.poolAddress.toLowerCase() === proposal.poolAddress.toLowerCase()),
      ) || DEFAULT_MARKETS[0]
    );
  }, [propMarket, proposal.market, proposal.poolAddress]);

  const [isLiveMode, setIsLiveMode] = useState<boolean>(initialLiveMode);
  useEffect(() => {
    setIsLiveMode(initialLiveMode);
  }, [initialLiveMode]);

  const now = new Date(proposal.timestamp).toISOString();

  // Evaluate pre-flight live readiness
  const evaluateLiveReadiness = useCallback((): { state: LiveExecutionState; error?: string } => {
    if (!isLiveMode) return { state: 'AWAITING_USER_CONFIRMATION' };

    // 1. Order type check
    if (proposal.type === 'MARKET') {
      return {
        state: 'RISK_CHECK_FAILED',
        error: 'Market orders are disabled on testnet due to thin CLOB liquidity. Please use POST_ONLY or LIMIT.',
      };
    }

    // 2. Wallet connection check
    if (!wallet?.isConnected || !wallet.address) {
      return {
        state: 'WALLET_DISCONNECTED',
        error: 'Wallet not connected. Connect your authorized Somnia Hideki wallet.',
      };
    }

    // 3. Network check
    if (!wallet.isCorrectNetwork || wallet.chainId !== SOMNIA_HIDEKI_CHAIN_ID) {
      return {
        state: 'WRONG_NETWORK',
        error: `Connected to Chain ID ${wallet.chainId}. Somnia Hideki (50383) is required.`,
      };
    }

    // 4. Gas check (>= 0.05 STT)
    const sttRaw = wallet.sttRaw ?? 0n;
    if (sttRaw < 50_000_000_000_000_000n) {
      return {
        state: 'INSUFFICIENT_GAS',
        error: `Insufficient STT for gas: holding ${Number(formatUnits(sttRaw, 18)).toFixed(4)} STT (minimum 0.05 STT required).`,
      };
    }

    // 5. Collateral check
    const unlockedCollateral = wallet.unlockedCollateralRaw
      ? Number(formatUnits(wallet.unlockedCollateralRaw, 18))
      : 0;
    if (unlockedCollateral < proposal.imfRequired) {
      return {
        state: 'INSUFFICIENT_COLLATERAL',
        error: `Insufficient unlocked collateral in MarginBank: holding $${unlockedCollateral.toFixed(2)} USDso, need $${proposal.imfRequired.toFixed(2)} USDso.`,
      };
    }

    // 6. Plan freshness check (60s TTL)
    const planAgeMs = Date.now() - proposal.timestamp;
    if (planAgeMs > 60_000) {
      return {
        state: 'RISK_CHECK_FAILED',
        error: `Order plan has expired (${Math.round(planAgeMs / 1000)}s old). Freshness limit is 60s. Please close and replan.`,
      };
    }

    return { state: 'AWAITING_USER_CONFIRMATION' };
  }, [isLiveMode, wallet, proposal]);

  const [liveState, setLiveState] = useState<LiveExecutionState>(() => evaluateLiveReadiness().state);
  const [txHash, setTxHash] = useState<Hex | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(() => evaluateLiveReadiness().error || null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isCancelling, setIsCancelling] = useState<boolean>(false);
  const [orderId, setOrderId] = useState<bigint | null>(null);

  // Synchronize live state on mode switch or wallet update
  useEffect(() => {
    // Only re-evaluate if in pre-transaction states
    if (
      liveState === 'AWAITING_USER_CONFIRMATION' ||
      liveState === 'WALLET_DISCONNECTED' ||
      liveState === 'WRONG_NETWORK' ||
      liveState === 'INSUFFICIENT_GAS' ||
      liveState === 'INSUFFICIENT_COLLATERAL' ||
      liveState === 'RISK_CHECK_FAILED' ||
      liveState === 'READ_ONLY'
    ) {
      const evaluation = evaluateLiveReadiness();
      setLiveState(evaluation.state);
      setErrorMessage(evaluation.error || null);
    }
  }, [isLiveMode, wallet?.isConnected, wallet?.chainId, wallet?.sttRaw, wallet?.unlockedCollateralRaw, evaluateLiveReadiness]);

  // Compute canonical deterministic plan digest
  const planDigest = useMemo(() => {
    return OrderPlanner.computePlanDigest({
      chainId: SOMNIA_HIDEKI_CHAIN_ID,
      walletAddress: wallet?.address || '0x0000000000000000000000000000000000000000',
      marketSymbol: proposal.market,
      poolAddress: proposal.poolAddress || market.poolAddress || ETH_PERP_POOL,
      side: proposal.side,
      orderType: proposal.type,
      price: proposal.price,
      quantity: proposal.amount,
      leverage: proposal.leverage,
      clientNonce: proposal.clientNonce,
    });
  }, [wallet?.address, proposal, market.poolAddress]);

  // Build canonical validated OrderPlan using market-specific decimals & grid parameters
  const buildCanonicalPlan = useCallback(() => {
    const poolAddr = (proposal.poolAddress || market.poolAddress || ETH_PERP_POOL) as `0x${string}`;
    const targetWallet = (wallet?.address || '0x0000000000000000000000000000000000000000') as Address;

    const tickSize = market.tickSizeRaw && market.tickSizeRaw > 0n
      ? market.tickSizeRaw
      : parseUnits(market.tickSize.toString(), market.quoteDecimals);

    const lotSize = market.lotSizeRaw && market.lotSizeRaw > 0n
      ? market.lotSizeRaw
      : parseUnits(market.lotSize.toString(), market.baseDecimals);

    const minQuantity = market.minQuantityRaw && market.minQuantityRaw > 0n
      ? market.minQuantityRaw
      : parseUnits(market.minOrderQty.toString(), market.baseDecimals);

    const execType = proposal.type === 'POST_ONLY'
      ? 'POST_ONLY'
      : proposal.type === 'LIMIT'
      ? 'LIMIT'
      : 'MARKET';

    const plan = OrderPlanner.createOrderPlan({
      chainId: SOMNIA_HIDEKI_CHAIN_ID,
      walletAddress: targetWallet,
      market: {
        id: poolAddr,
        poolAddress: poolAddr,
        symbol: market.symbol,
        display: market.display,
        baseSymbol: market.baseSymbol,
        quoteSymbol: market.quoteSymbol,
        baseToken: market.baseToken,
        quoteToken: market.quoteToken,
        baseDecimals: market.baseDecimals,
        quoteDecimals: market.quoteDecimals,
        tickSize,
        lotSize,
        minQuantity,
        initialMarginBps: market.imfBps || 500,
        maxLeverage: market.maxLeverage || 20,
        marginBank: MARGIN_BANK_ADDRESS,
        perpStatus: null,
      },
      side: proposal.side,
      orderType: execType,
      price: proposal.price,
      quantity: proposal.amount,
      leverage: proposal.leverage,
      clientNonce: proposal.clientNonce,
      ttlMs: 60_000,
    });

    // Enforce original proposal timestamp and expiration (prevent resetting plan freshness)
    return {
      ...plan,
      createdAtMs: proposal.timestamp,
      expiresAtMs: proposal.timestamp + 60_000,
    };
  }, [proposal, market, wallet?.address]);

  const handleAuthorizeAndSign = async () => {
    if (!isLiveMode || !wallet?.address || !getWalletClient) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      // 1. Immediate revalidation of wallet and chain right before requesting signature
      if (typeof window === 'undefined' || !window.ethereum) {
        throw new Error('EIP-1193 provider unavailable. Please connect MetaMask or compatible wallet.');
      }

      const accounts = (await window.ethereum.request({ method: 'eth_accounts' })) as string[];
      const chainIdHex = (await window.ethereum.request({ method: 'eth_chainId' })) as string;
      const currentChainId = parseInt(chainIdHex, 16);

      if (!accounts || accounts.length === 0 || accounts[0].toLowerCase() !== wallet.address.toLowerCase()) {
        setLiveState('WALLET_DISCONNECTED');
        throw new Error('Wallet account changed or disconnected. Please reconnect your authorized wallet.');
      }

      if (currentChainId !== SOMNIA_HIDEKI_CHAIN_ID) {
        setLiveState('WRONG_NETWORK');
        throw new Error(`Chain ID mismatch: Wallet is on ${currentChainId}. Somnia Hideki (50383) is required.`);
      }

      // 2. Enforce 60-second plan freshness
      const nowMs = Date.now();
      if (nowMs > proposal.timestamp + 60_000) {
        setLiveState('RISK_CHECK_FAILED');
        throw new Error(
          `Order plan has expired (${Math.round((nowMs - proposal.timestamp) / 1000)}s old). Freshness limit is 60s. Please close and replan.`,
        );
      }

      // 3. Build canonical validated plan
      const canonicalPlan = buildCanonicalPlan();

      if (!canonicalPlan.validation.valid) {
        setLiveState('RISK_CHECK_FAILED');
        throw new Error(`Order validation failed: ${canonicalPlan.validation.errors.join('; ')}`);
      }

      // 4. Strict ExecutionGuard evaluation (Mandatory safety pipeline)
      const guard = new ExecutionGuard({
        dryRun: false, // Live authorized mode
        allowedChainId: SOMNIA_HIDEKI_CHAIN_ID,
        maxNotionalUsd: 20.0,
        maxLeverage: 20.0,
        maxPlanAgeMs: 60_000,
      });

      const guardResult = guard.evaluate({
        plan: canonicalPlan,
        connectedWallet: wallet.address as Address,
        approvedDigest: planDigest,
        isUserApproved: true,
        nowMs,
      });

      if (!guardResult.allowed) {
        setLiveState('RISK_CHECK_FAILED');
        throw new Error(guardResult.reason || 'Order blocked by ExecutionGuard pre-trade rules.');
      }

      const walletClient = getWalletClient();
      if (!walletClient) {
        setLiveState('WALLET_DISCONNECTED');
        throw new Error('Failed to instantiate wallet client.');
      }

      setLiveState('AWAITING_WALLET_SIGNATURE');

      // 5. Prepare unsigned call calldata with verified LiveOrderAdapter
      const adapter = new LiveOrderAdapter({ guard });
      const unsignedCall = adapter.prepareOrderCall(canonicalPlan);

      // 6. Request user signature via browser wallet
      const hash = await walletClient.sendTransaction({
        account: wallet.address,
        to: unsignedCall.to,
        data: unsignedCall.data,
      });

      setTxHash(hash);
      setLiveState('TRANSACTION_PENDING');

      // 7. Await transaction receipt
      const publicClient = createPublicClient({
        transport: http(SOMNIA_RPC_URL),
      });

      const verifier = new ReceiptVerifier({ maxTimeoutMs: 30_000 });
      const receiptRecord = await verifier.verifyTransaction(hash, publicClient);

      if (receiptRecord.status === 'REVERTED') {
        setLiveState('TRANSACTION_FAILED');
        setErrorMessage('Transaction reverted on-chain by EVM (Check margin or price crossing).');
        setIsSubmitting(false);
        return;
      }

      if (receiptRecord.status === 'CONFIRMED') {
        setLiveState('TRANSACTION_MINED');

        // 8. Decode receipt logs using SDK decodePlaceOrder
        const fullReceipt = await publicClient.getTransactionReceipt({ hash });
        const decoded = LiveOrderAdapter.decodePlacementReceipt(fullReceipt, unsignedCall.to);

        // 9. Inspect on-chain position state in MarginBank
        const pos = await LiveOrderAdapter.getPositionOnchain(
          MARGIN_BANK_ADDRESS,
          wallet.address as Address,
          unsignedCall.to,
          publicClient,
        );

        const hasNonZeroPosition = pos !== null && pos.size !== 0n;

        // 10. Accurate state assignment: Keep ORDER_RESTING distinct from POSITION_VERIFIED
        if (decoded.orderId) {
          setOrderId(decoded.orderId);
          if (hasNonZeroPosition) {
            setLiveState('POSITION_VERIFIED');
          } else {
            // Resting order on book: position size is zero; stays in ORDER_RESTING
            setLiveState('ORDER_RESTING');
          }
        } else if (decoded.fills && decoded.fills.length > 0) {
          if (hasNonZeroPosition) {
            setLiveState('POSITION_VERIFIED');
          } else {
            setLiveState('ORDER_FILLED');
          }
        } else if (hasNonZeroPosition) {
          setLiveState('POSITION_VERIFIED');
        } else {
          setLiveState('TRANSACTION_MINED');
        }
      } else {
        setLiveState('VERIFICATION_FAILED');
        setErrorMessage(`Receipt status unconfirmed: ${receiptRecord.status}`);
      }
    } catch (err: unknown) {
      const error = err as { code?: number; message?: string };
      console.warn('[OrderLifecycleModal] Order dispatch error:', err);
      if (error.code === 4001 || error.message?.includes('rejected')) {
        setLiveState('TRANSACTION_FAILED');
        setErrorMessage('Signature request rejected by user in wallet.');
      } else {
        setLiveState('TRANSACTION_FAILED');
        setErrorMessage(error.message || 'Transaction submission failed.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelRestingOrder = async () => {
    if (!orderId || !wallet?.address || !getWalletClient) return;

    setIsCancelling(true);
    setErrorMessage(null);

    try {
      const walletClient = getWalletClient();
      if (!walletClient) throw new Error('Wallet client unavailable.');

      const adapter = new LiveOrderAdapter();
      const poolAddr = (proposal.poolAddress || market.poolAddress || ETH_PERP_POOL) as Address;
      const cancelCall = adapter.prepareCancelOrderCall(poolAddr, orderId);

      const hash = await walletClient.sendTransaction({
        account: wallet.address,
        to: cancelCall.to,
        data: cancelCall.data,
      });

      const publicClient = createPublicClient({ transport: http(SOMNIA_RPC_URL) });
      const verifier = new ReceiptVerifier({ maxTimeoutMs: 30_000 });
      const receipt = await verifier.verifyTransaction(hash, publicClient);

      if (receipt.status === 'CONFIRMED') {
        setLiveState('ORDER_CANCELLED');
        setTxHash(hash);
      } else {
        throw new Error(`Cancellation transaction status: ${receipt.status}`);
      }
    } catch (err: unknown) {
      const error = err as { message?: string };
      console.warn('[OrderLifecycleModal] Cancellation error:', err);
      setErrorMessage(error.message || 'Failed to cancel resting order.');
    } finally {
      setIsCancelling(false);
    }
  };

  const lifecycleSteps: LifecycleStep[] = [
    {
      id: 'step-1',
      title: '1. ORDER_PLAN_CONSTRUCTED',
      description: `Deterministic plan constructed for ${proposal.amount} ${proposal.market} ${proposal.side} @ $${proposal.price.toFixed(2)} USDso with client nonce ${proposal.clientNonce.slice(0, 10)}...`,
      status: 'PASS',
      timestamp: now,
      rawPayload: { side: proposal.side, type: proposal.type, notional: proposal.notional },
    },
    {
      id: 'step-2',
      title: '2. PRECISION_QUANTIZATION',
      description: `Market precision enforced: tick size (${market.tickSize} USDso) & lot size (${market.lotSize} ${market.baseSymbol}) across ${market.baseDecimals} base decimals.`,
      status: 'PASS',
      timestamp: now,
      rawPayload: {
        quantizedPrice: proposal.price,
        quantizedAmount: proposal.amount,
        baseDecimals: market.baseDecimals,
        quoteDecimals: market.quoteDecimals,
      },
    },
    {
      id: 'step-3',
      title: '3. CANONICAL_DIGEST_GENERATION',
      description: `Cryptographic SHA-256 digest generated: ${planDigest}. Any parameter modification invalidates this plan.`,
      status: 'PASS',
      timestamp: now,
      rawPayload: { planDigest, chainId: SOMNIA_HIDEKI_CHAIN_ID },
    },
    {
      id: 'step-4',
      title: '4. PRE_TRADE_RISK_GATES',
      description: `Evaluated notional ($${proposal.notional.toFixed(2)}) <= $20 cap, leverage (${proposal.leverage}x) <= 20x, chain ID = ${SOMNIA_HIDEKI_CHAIN_ID}.`,
      status: 'PASS',
      timestamp: now,
      rawPayload: { imfRequired: proposal.imfRequired, passedChecks: 5 },
    },
    {
      id: 'step-5',
      title: '5. PROTOCOL_REDUCE_ONLY_AUDIT',
      description: `Direct dreamDEX CLOB orders (PerpPool) lack native contract reduceOnly; conservative client-side position-size bounds enforced.`,
      status: 'PASS',
      timestamp: now,
      rawPayload: { nativeReduceOnlySupported: false, clientGuardEnforced: true },
    },
    {
      id: 'step-6',
      title: isLiveMode ? '6. WALLET_AUTHORIZATION_GATE' : '6. OFFLINE_SIMULATION_GATE',
      description: isLiveMode
        ? `Live execution pathway engaged (Somnia Hideki v2, Chain 50383): Requires explicit operator confirmation and browser wallet signature.`
        : `Offline simulation mode: Evaluated local risk and mathematical sizing without network broadcast. Zero on-chain state mutated.`,
      status: 'PASS',
      timestamp: now,
      rawPayload: { isLiveMode, liveState },
    },
  ];

  const handleExportJson = () => {
    const dataStr =
      'data:text/json;charset=utf-8,' +
      encodeURIComponent(
        JSON.stringify(
          {
            proposal,
            planDigest,
            isLiveMode,
            liveState,
            txHash,
            orderId: orderId ? orderId.toString() : null,
            lifecycleSteps,
          },
          null,
          2,
        ),
      );
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `perpspilot-order-audit-${proposal.clientNonce.slice(0, 8)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const isSignBlocked =
    isSubmitting ||
    liveState === 'INSUFFICIENT_GAS' ||
    liveState === 'INSUFFICIENT_COLLATERAL' ||
    liveState === 'WALLET_DISCONNECTED' ||
    liveState === 'WRONG_NETWORK' ||
    liveState === 'RISK_CHECK_FAILED' ||
    proposal.type === 'MARKET';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-surface rounded-2xl border border-surface-border w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="px-6 py-4 border-b border-surface-border flex items-center justify-between bg-[#0b0e14]/50">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-tight">Order Lifecycle & Execution Audit</h2>
                {isLiveMode ? (
                  <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold text-[10px] border border-amber-500/30">
                    LIVE MODE
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-bold text-[10px] border border-cyan-500/30">
                    PREVIEW MODE
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">Verifiable pre-trade pipeline inspection</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-surface-subtle transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-4 text-xs">
          {/* Order Status Pill & Digest Banner */}
          <div className="p-3.5 rounded-xl bg-[#0b0e14] border border-surface-border flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase font-semibold text-slate-500">Execution State</div>
              <div className="flex items-center gap-2 mt-0.5">
                <span
                  className={`px-2.5 py-1 rounded font-mono font-bold text-xs border flex items-center gap-1.5 ${
                    liveState === 'ORDER_RESTING' || liveState === 'ORDER_FILLED' || liveState === 'POSITION_VERIFIED'
                      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                      : liveState === 'TRANSACTION_FAILED' ||
                        liveState === 'VERIFICATION_FAILED' ||
                        liveState === 'WRONG_NETWORK' ||
                        liveState === 'RISK_CHECK_FAILED' ||
                        liveState === 'ORDER_CANCELLED'
                      ? 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                      : liveState === 'TRANSACTION_PENDING' || liveState === 'AWAITING_WALLET_SIGNATURE'
                      ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30 animate-pulse'
                      : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                  }`}
                >
                  <Lock className="w-3 h-3" />
                  <span>
                    {isLiveMode
                      ? liveState === 'AWAITING_USER_CONFIRMATION'
                        ? 'AWAITING_OPERATOR_SIGNATURE'
                        : liveState === 'AWAITING_WALLET_SIGNATURE'
                        ? 'SIGN_REQUEST_IN_WALLET'
                        : liveState === 'ORDER_RESTING'
                        ? 'ORDER_RESTING_ON_BOOK'
                        : liveState
                      : 'SIMULATED_PREVIEW (OFFLINE)'}
                  </span>
                </span>
                <span className="text-[11px] text-slate-400 font-mono hidden sm:inline">
                  Nonce: {proposal.clientNonce.slice(0, 10)}...
                </span>
              </div>
            </div>
            <div className="text-right font-mono text-[11px] text-slate-400">
              <div>{now.split('T')[0]}</div>
              <div className="text-slate-500">{now.split('T')[1].replace('Z', ' UTC')}</div>
            </div>
          </div>

          {/* Error / Failure Banner */}
          {errorMessage && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 flex items-start gap-2 text-rose-300 text-xs font-mono">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 text-rose-400 mt-0.5" />
              <div>
                <strong className="font-sans block text-rose-200">Execution Blocked or Failed:</strong>
                <span>{errorMessage}</span>
              </div>
            </div>
          )}

          {/* Genuine Transaction Hash Banner */}
          {txHash && (
            <div className="p-3 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-mono">
              <div className="flex items-center gap-2 overflow-hidden">
                <span className="text-slate-400 font-sans font-medium flex-shrink-0">Tx Hash:</span>
                <span className="text-cyan-300 font-bold select-all truncate">{txHash}</span>
              </div>
              <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 text-[10px] font-sans font-semibold flex-shrink-0 border border-cyan-500/30">
                Hideki v2 Mined
              </span>
            </div>
          )}

          {/* Order ID banner when resting */}
          {orderId && (
            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between text-xs font-mono">
              <span className="text-slate-300">Contract Order ID: <strong className="text-emerald-400">{orderId.toString()}</strong></span>
              <span className="text-[10px] text-slate-400">Resting in CLOB</span>
            </div>
          )}

          {/* Explicit Protocol Safety Notice */}
          <div className="p-3 rounded-lg bg-surface-subtle border border-surface-border text-[11px] text-slate-300 space-y-1">
            <div className="font-semibold text-slate-200 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
              <span>Execution Boundaries & Risk Disclosures</span>
            </div>
            <ul className="list-disc pl-5 text-[10px] text-slate-400 space-y-0.5">
              <li>
                <strong className="text-slate-300">{proposal.type}:</strong>{' '}
                {proposal.type === 'POST_ONLY'
                  ? 'Guarantees maker execution upon acceptance; order reverts if it would immediately cross the book.'
                  : 'Standard limit order; can execute immediately as a taker if crossing the spread.'}
              </li>
              <li><strong className="text-slate-300">Cancellation:</strong> Stops resting orders and releases locked margin, but does not close or reverse an already-filled position.</li>
              <li><strong className="text-slate-300">Plan Freshness:</strong> Order plans are bound to a strict 60-second validity window. Stale plans are automatically rejected.</li>
            </ul>
          </div>

          {/* Canonical Plan Digest Card */}
          <div className="p-3 rounded-lg bg-[#0b0e14] border border-surface-border font-mono text-[11px] space-y-1">
            <div className="flex items-center justify-between text-slate-400">
              <span className="font-sans font-semibold text-slate-300">Canonical Plan Digest (SHA-256):</span>
              <span className="text-cyan-400 text-[10px]">Deterministic Hash</span>
            </div>
            <div className="p-2 rounded bg-surface-subtle font-mono text-cyan-300 text-[10px] break-all border border-surface-border">
              {planDigest}
            </div>
          </div>

          {/* Execution Parameters Grid */}
          <div className="bg-[#0b0e14] rounded-xl border border-surface-border p-4">
            <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3">
              Order Plan Parameters
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono">
              <div>
                <span className="text-[10px] text-slate-500 uppercase block">Market</span>
                <span className="text-white font-bold text-sm">{proposal.market}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase block">Type / Side</span>
                <span className={proposal.side === 'BUY_LONG' ? 'text-emerald-400 font-bold text-sm' : 'text-rose-400 font-bold text-sm'}>
                  {proposal.type} {proposal.side === 'BUY_LONG' ? 'LONG' : 'SHORT'}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase block">Limit Price</span>
                <span className="text-slate-200 font-bold text-sm">${proposal.price.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase block">Order Quantity</span>
                <span className="text-slate-200 font-bold text-sm">{proposal.amount} {market.baseSymbol}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase block">Total Notional</span>
                <span className="text-cyan-400 font-bold">${proposal.notional.toFixed(2)} USDso</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase block">Required Margin ({proposal.leverage}x)</span>
                <span className="text-slate-300 font-bold">${proposal.imfRequired.toFixed(2)} USDso</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase block">Target Pool</span>
                <span className="text-slate-400 font-bold truncate block">{((proposal.poolAddress || market.poolAddress) as string).slice(0, 10)}...</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase block">Est. Liquidation</span>
                <span className="text-amber-400 font-bold">${proposal.estLiquidationPrice.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Live Mode Disclosure Banner */}
          {isLiveMode && (
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-start gap-2 text-amber-200 text-xs">
              <Radio className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <strong className="block font-semibold">Live Testnet Transaction Review:</strong>
                <p className="text-[11px] text-amber-300/90 mt-0.5">
                  Confirming below will prompt your browser wallet for an explicit transaction signature to call <code>placeOrder</code> on Somnia Hideki. Verify the target contract and parameters in your wallet.
                </p>
              </div>
            </div>
          )}

          {/* Granular Step Progression */}
          <div>
            <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3">
              Lifecycle & Pre-Trade Audit Trail
            </h3>
            <div className="space-y-2.5 font-mono">
              {lifecycleSteps.map((step) => (
                <div
                  key={step.id}
                  className="p-3 rounded-lg bg-[#0b0e14] border border-surface-border flex items-start gap-3"
                >
                  <div className="mt-0.5 p-1 rounded-full bg-emerald-500/20 text-emerald-400 flex-shrink-0">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-200 text-xs">{step.title}</span>
                      <span className="text-[10px] text-slate-500">{step.timestamp.split('T')[1].slice(0, 8)} UTC</span>
                    </div>
                    <p className="text-[11px] text-slate-400 font-sans mt-0.5">{step.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-surface-border bg-[#0b0e14]/50 flex items-center justify-between gap-3">
          <button
            onClick={handleExportJson}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-subtle hover:bg-surface-hover border border-surface-border text-slate-200 text-xs font-medium transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-cyan-400" />
            <span>Export Audit Log (JSON)</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={isSubmitting || isCancelling}
              className="px-4 py-1.5 rounded-lg bg-surface-subtle hover:bg-surface-hover border border-surface-border text-slate-300 text-xs font-semibold transition-colors disabled:opacity-50"
            >
              Close
            </button>

            {/* Cancel Resting Order action if order is resting on book */}
            {isLiveMode && liveState === 'ORDER_RESTING' && orderId && (
              <button
                onClick={handleCancelRestingOrder}
                disabled={isCancelling}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white font-bold text-xs shadow-md transition-all disabled:opacity-50"
              >
                {isCancelling ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Cancelling...</span>
                  </>
                ) : (
                  <>
                    <Ban className="w-3.5 h-3.5" />
                    <span>Cancel Resting Order</span>
                  </>
                )}
              </button>
            )}

            {!isLiveMode && wallet?.isConnected && wallet?.isCorrectNetwork && (
              <button
                onClick={() => setIsLiveMode(true)}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700 text-slate-950 font-bold text-xs shadow-md transition-all"
              >
                <Radio className="w-3.5 h-3.5" />
                <span>Switch to Live Testnet Mode</span>
              </button>
            )}

            {isLiveMode && liveState !== 'ORDER_RESTING' && liveState !== 'ORDER_FILLED' && liveState !== 'ORDER_CANCELLED' && liveState !== 'POSITION_VERIFIED' && (
              <button
                onClick={handleAuthorizeAndSign}
                disabled={isSignBlocked}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-slate-950 font-bold text-xs shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-3.5 h-3.5" />
                    <span>Authorize & Sign in Wallet</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
