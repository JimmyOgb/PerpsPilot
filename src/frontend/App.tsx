import React, { useState } from 'react';
import { Navbar } from './components/Navbar.js';
import { MarketBar } from './components/MarketBar.js';
import { TradingChart } from './components/TradingChart.js';
import { OrderBook } from './components/OrderBook.js';
import { TradeTicket } from './components/TradeTicket.js';
import { RiskCockpit } from './components/RiskCockpit.js';
import { MarketsView } from './components/MarketsView.js';
import { DiagnosticsView } from './components/DiagnosticsView.js';
import { BottomTables } from './components/BottomTables.js';
import { OrderLifecycleModal } from './components/OrderLifecycleModal.js';
import { useWallet } from './hooks/useWallet.js';
import { useMarketData } from './hooks/useMarketData.js';
import { OrderProposal } from './types.js';
import { evaluateOrderRisk } from './utils/riskEngine.js';

export const App: React.FC = () => {
  const { wallet, connect, disconnect, switchToHideki, getWalletClient } = useWallet();
  const {
    markets,
    selectedMarket,
    setSelectedMarketSymbol,
    currentBlock,
    isOracleFresh,
    orderBook,
    chartData,
    tradesData,
    setTimeframe,
  } = useMarketData();

  const [activeTab, setActiveTab] = useState<'terminal' | 'cockpit' | 'markets' | 'diagnostics'>('terminal');
  const [selectedBookPrice, setSelectedBookPrice] = useState<number | undefined>(undefined);
  const [selectedProposalForModal, setSelectedProposalForModal] = useState<OrderProposal | null>(null);
  const [isLiveModeForModal, setIsLiveModeForModal] = useState<boolean>(false);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [recentSimulations, setRecentSimulations] = useState<OrderProposal[]>([]);

  // Default initial simulated order for visual fidelity matching demo
  const initialProposal: OrderProposal = {
    market: selectedMarket.display || selectedMarket.symbol,
    side: 'BUY_LONG',
    type: 'LIMIT',
    price: selectedMarket.markPrice > 0 ? selectedMarket.markPrice : 2364.19,
    amount: selectedMarket.minOrderQty > 0 ? selectedMarket.minOrderQty * 2 : 0.0084,
    notional: 19.86,
    leverage: 20,
    imfRequired: 0.99,
    estFee: 0.01,
    estLiquidationPrice: 2254.10,
    slippageTolerance: 0.5,
    timestamp: Date.now() - 30000,
    clientNonce: '0x7a89b4f2c001889a',
  };

  const currentRiskEvaluation = evaluateOrderRisk(
    recentSimulations[0] || initialProposal,
    wallet,
    selectedMarket.minOrderQty,
  );

  const handleSimulateOrder = (proposal: OrderProposal, isLiveMode?: boolean) => {
    setRecentSimulations((prev) => [proposal, ...prev.slice(0, 19)]);
    setSelectedProposalForModal(proposal);
    setIsLiveModeForModal(!!isLiveMode);
    setIsModalOpen(true);
  };

  const handleInspectSimulation = (proposal: OrderProposal) => {
    setSelectedProposalForModal(proposal);
    setIsLiveModeForModal(false);
    setIsModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-background text-slate-100 flex flex-col font-sans">
      {/* Top Navigation */}
      <Navbar
        wallet={wallet}
        onConnect={connect}
        onDisconnect={disconnect}
        onSwitchNetwork={switchToHideki}
        currentBlock={currentBlock}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />

      {/* Main Body */}
      <main className="flex-1 flex flex-col p-3 max-w-[1680px] w-full mx-auto gap-3">
        {/* Market Stats Bar (Always visible in Terminal & Cockpit) */}
        {(activeTab === 'terminal' || activeTab === 'cockpit') && (
          <MarketBar
            markets={markets}
            selectedMarket={selectedMarket}
            onSelectMarket={setSelectedMarketSymbol}
            isOracleFresh={isOracleFresh}
          />
        )}

        {/* View 1: Trading Terminal */}
        {activeTab === 'terminal' && (
          <div className="flex-1 flex flex-col gap-3">
            {/* Top Grid: Chart, OrderBook, and Ticket */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 min-h-[500px]">
              {/* Candlestick / Price Chart */}
              <div className="lg:col-span-6 xl:col-span-6 flex flex-col">
                <TradingChart
                  market={selectedMarket}
                  chartData={chartData}
                  onTimeframeChange={setTimeframe}
                />
              </div>

              {/* Order Book & Depth Visualizer */}
              <div className="lg:col-span-3 xl:col-span-3 flex flex-col">
                <OrderBook
                  orderBook={orderBook}
                  market={selectedMarket}
                  onPriceSelect={setSelectedBookPrice}
                />
              </div>

              {/* Trade Ticket */}
              <div className="lg:col-span-3 xl:col-span-3 flex flex-col">
                <TradeTicket
                  market={selectedMarket}
                  wallet={wallet}
                  onSimulateOrder={handleSimulateOrder}
                  selectedPrice={selectedBookPrice}
                />
              </div>
            </div>

            {/* Bottom Tables */}
            <div className="mt-auto">
              <BottomTables
                recentSimulations={recentSimulations}
                onInspectSimulation={handleInspectSimulation}
                tradesData={tradesData}
                wallet={wallet}
              />
            </div>
          </div>
        )}

        {/* View 2: Risk & Safety Cockpit */}
        {activeTab === 'cockpit' && (
          <div className="flex-1">
            <RiskCockpit
              evaluation={currentRiskEvaluation}
              wallet={wallet}
              market={selectedMarket}
            />
          </div>
        )}

        {/* View 3: Markets Overview */}
        {activeTab === 'markets' && (
          <div className="flex-1">
            <MarketsView
              markets={markets}
              onSelectMarket={(sym) => {
                setSelectedMarketSymbol(sym);
                setActiveTab('terminal');
              }}
            />
          </div>
        )}

        {/* View 4: Diagnostics / Preflight */}
        {activeTab === 'diagnostics' && (
          <div className="flex-1">
            <DiagnosticsView
              wallet={wallet}
              currentBlock={currentBlock}
              market={selectedMarket}
            />
          </div>
        )}
      </main>

      {/* Order Lifecycle Modal */}
      {selectedProposalForModal && (
        <OrderLifecycleModal
          proposal={selectedProposalForModal}
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          isLiveMode={isLiveModeForModal}
          wallet={wallet}
          getWalletClient={getWalletClient}
          market={selectedMarket}
        />
      )}
    </div>
  );
};
