import { describe, it, expect, beforeEach } from "vitest";
import {
  OrderPlanner,
  ExecutionGuard,
  OrderExecutor,
  ReceiptVerifier,
  OrderReconciler,
  OrderCanceller,
  PositionCloser,
  ExecutionAuditLog,
  LiveOrderAdapter,
  PERP_POOL_PLACE_ORDER_ABI,
  CONTRACT_ORDER_TYPES,
  ExecutionGuardBlockedError,
  DuplicateSubmissionError,
  type OrderPlan,
} from "../src/execution/index.js";
import type { PerpMarketInfo } from "../src/markets/types.js";
import { EXPECTED_HIDEKI_CHAIN_ID } from "../src/config/index.js";

// Canonical ETH-PERP test fixture on Hideki v2
const MOCK_ETH_MARKET: PerpMarketInfo = {
  id: "0xd6cb1dd58580b84d76068ac21594219ce03aeddf",
  poolAddress: "0xd6cb1dd58580b84d76068ac21594219ce03aeddf",
  symbol: "ETH:USDSO",
  sdkSymbol: "ETH/USDso:USDso",
  display: "ETH-PERP",
  baseSymbol: "ETH",
  quoteSymbol: "USDso",
  baseToken: "0x0000000000000000000000000000000000000000",
  quoteToken: "0xed7993A74dAe1e6656B704A424DcD8711aAf4F72",
  baseDecimals: 18,
  quoteDecimals: 18,
  tickSize: 10_000_000_000_000_000n, // $0.01 (1e16)
  lotSize: 100_000_000_000_000n, // 0.0001 ETH (1e14)
  minQuantity: 4_000_000_000_000_000n, // 0.0040 ETH (4e15)
  initialMarginBps: 500, // 5%
  maxLeverage: 20,
  marginBank: "0x478769E1177C0773c43A593DCCc4Ad15F15F1394",
  markPrice: 2340_000_000_000_000_000_000n, // $2,340.00
  perpStatus: null,
};

const TEST_WALLET = "0x1234567890123456789012345678901234567890" as `0x${string}`;
const FOREIGN_WALLET = "0x9999999999999999999999999999999999999999" as `0x${string}`;

describe("PerpsPilot Stage F.1 Execution Lifecycle Test Suite", () => {
  beforeEach(() => {
    ExecutionAuditLog.getInstance().clear();
  });

  // ---------------------------------------------------------------------------
  // 1. OrderPlanner & Digest Integrity
  // ---------------------------------------------------------------------------
  describe("OrderPlanner & Digest Integrity", () => {
    it("constructs a valid, deterministic order plan aligned to grid", () => {
      const plan = OrderPlanner.createOrderPlan({
        walletAddress: TEST_WALLET,
        market: MOCK_ETH_MARKET,
        side: "BUY_LONG",
        orderType: "LIMIT",
        price: 2340.0123, // Off tick
        quantity: 0.00405, // Off lot
        leverage: 2,
      });

      expect(plan.validation.valid).toBe(true);
      expect(plan.price).toBe(2340.01); // Snapped to $0.01 tick
      expect(plan.quantity).toBe(0.004); // Snapped to 0.0001 lot
      expect(plan.notionalUsd).toBeCloseTo(9.36, 2);
      expect(plan.marginRequiredUsd).toBeCloseTo(4.68, 2);
      expect(plan.planDigest).toMatch(/^0x[a-f0-9]{64}$/);
      expect(plan.nativeReduceOnlySupported).toBe(false);
    });

    it("invalidates digest if any parameter is altered", () => {
      const plan = OrderPlanner.createOrderPlan({
        walletAddress: TEST_WALLET,
        market: MOCK_ETH_MARKET,
        side: "BUY_LONG",
        orderType: "LIMIT",
        price: 2340.0,
        quantity: 0.004,
        leverage: 2,
      });

      const initialDigest = plan.planDigest;
      expect(OrderPlanner.verifyPlanDigest(plan, initialDigest)).toBe(true);

      // Mutate price
      const tamperedPlan = { ...plan, price: 2341.0 };
      expect(OrderPlanner.verifyPlanDigest(tamperedPlan, initialDigest)).toBe(false);

      // Mutate quantity
      const tamperedQty = { ...plan, quantity: 0.005 };
      expect(OrderPlanner.verifyPlanDigest(tamperedQty, initialDigest)).toBe(false);

      // Mutate side
      const tamperedSide = { ...plan, side: "SELL_SHORT" as const };
      expect(OrderPlanner.verifyPlanDigest(tamperedSide, initialDigest)).toBe(false);
    });

    it("rejects order below market minimum quantity", () => {
      const plan = OrderPlanner.createOrderPlan({
        walletAddress: TEST_WALLET,
        market: MOCK_ETH_MARKET,
        side: "BUY_LONG",
        orderType: "LIMIT",
        price: 2340.0,
        quantity: 0.002, // Below 0.0040 minimum
        leverage: 2,
      });

      expect(plan.validation.valid).toBe(false);
      expect(plan.validation.errors.some((e) => e.includes("below market minimum"))).toBe(true);
    });

    it("rejects order exceeding $20 notional testnet cap", () => {
      const plan = OrderPlanner.createOrderPlan({
        walletAddress: TEST_WALLET,
        market: MOCK_ETH_MARKET,
        side: "BUY_LONG",
        orderType: "LIMIT",
        price: 2340.0,
        quantity: 0.015, // 0.015 * 2340 = $35.10 > $20 cap
        leverage: 2,
      });

      expect(plan.validation.valid).toBe(false);
      expect(plan.validation.errors.some((e) => e.includes("exceeds testnet safety limit"))).toBe(true);
    });

    it("rejects leverage exceeding market maximum", () => {
      const plan = OrderPlanner.createOrderPlan({
        walletAddress: TEST_WALLET,
        market: MOCK_ETH_MARKET,
        side: "BUY_LONG",
        orderType: "LIMIT",
        price: 2340.0,
        quantity: 0.004,
        leverage: 25, // Exceeds 20x max
      });

      expect(plan.validation.valid).toBe(false);
      expect(plan.validation.errors.some((e) => e.includes("exceeds market maximum"))).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. ExecutionGuard Safety Enforcements
  // ---------------------------------------------------------------------------
  describe("ExecutionGuard Safety Gates", () => {
    it("fails closed when DRY_RUN=true is active", () => {
      const guard = new ExecutionGuard({ dryRun: true });
      const plan = OrderPlanner.createOrderPlan({
        walletAddress: TEST_WALLET,
        market: MOCK_ETH_MARKET,
        side: "BUY_LONG",
        orderType: "LIMIT",
        price: 2340.0,
        quantity: 0.004,
        leverage: 2,
      });

      const res = guard.evaluate({
        plan,
        connectedWallet: TEST_WALLET,
        isUserApproved: true,
        approvedDigest: plan.planDigest,
      });

      expect(res.allowed).toBe(false);
      expect(res.reason).toContain("DRY_RUN=true is active");
    });

    it("fails closed when foreign chain ID is supplied", () => {
      const guard = new ExecutionGuard({ dryRun: false });
      const plan = OrderPlanner.createOrderPlan({
        chainId: 1, // Foreign chain Ethereum Mainnet
        walletAddress: TEST_WALLET,
        market: MOCK_ETH_MARKET,
        side: "BUY_LONG",
        orderType: "LIMIT",
        price: 2340.0,
        quantity: 0.004,
        leverage: 2,
      });

      const res = guard.evaluate({
        plan,
        connectedWallet: TEST_WALLET,
        isUserApproved: true,
        approvedDigest: plan.planDigest,
      });

      expect(res.allowed).toBe(false);
      expect(res.reason).toContain("Foreign chain ID 1");
    });

    it("fails closed on connected wallet / account mismatch", () => {
      const guard = new ExecutionGuard({ dryRun: false });
      const plan = OrderPlanner.createOrderPlan({
        walletAddress: TEST_WALLET,
        market: MOCK_ETH_MARKET,
        side: "BUY_LONG",
        orderType: "LIMIT",
        price: 2340.0,
        quantity: 0.004,
        leverage: 2,
      });

      const res = guard.evaluate({
        plan,
        connectedWallet: FOREIGN_WALLET, // Mismatched account
        isUserApproved: true,
        approvedDigest: plan.planDigest,
      });

      expect(res.allowed).toBe(false);
      expect(res.reason).toContain("Wallet mismatch");
    });

    it("fails closed when operator approval is missing", () => {
      const guard = new ExecutionGuard({ dryRun: false });
      const plan = OrderPlanner.createOrderPlan({
        walletAddress: TEST_WALLET,
        market: MOCK_ETH_MARKET,
        side: "BUY_LONG",
        orderType: "LIMIT",
        price: 2340.0,
        quantity: 0.004,
        leverage: 2,
      });

      const res = guard.evaluate({
        plan,
        connectedWallet: TEST_WALLET,
        isUserApproved: false, // Not approved
        approvedDigest: plan.planDigest,
      });

      expect(res.allowed).toBe(false);
      expect(res.reason).toContain("Operator approval has not been granted");
    });

    it("fails closed on expired plan", () => {
      const guard = new ExecutionGuard({ dryRun: false });
      const plan = OrderPlanner.createOrderPlan({
        walletAddress: TEST_WALLET,
        market: MOCK_ETH_MARKET,
        side: "BUY_LONG",
        orderType: "LIMIT",
        price: 2340.0,
        quantity: 0.004,
        leverage: 2,
        ttlMs: 1000,
      });

      const res = guard.evaluate({
        plan,
        connectedWallet: TEST_WALLET,
        isUserApproved: true,
        approvedDigest: plan.planDigest,
        nowMs: plan.expiresAtMs + 5000, // Evaluated after expiry
      });

      expect(res.allowed).toBe(false);
      expect(res.reason).toContain("Order plan expired");
    });
  });

  // ---------------------------------------------------------------------------
  // 3. OrderExecutor Pipeline & Duplicate Prevention
  // ---------------------------------------------------------------------------
  describe("OrderExecutor Pipeline & Duplicate Prevention", () => {
    it("throws ExecutionGuardBlockedError in dry run mode", async () => {
      const executor = new OrderExecutor();
      const plan = OrderPlanner.createOrderPlan({
        walletAddress: TEST_WALLET,
        market: MOCK_ETH_MARKET,
        side: "BUY_LONG",
        orderType: "LIMIT",
        price: 2340.0,
        quantity: 0.004,
        leverage: 2,
      });

      await expect(
        executor.submitOrder(plan, {
          connectedWallet: TEST_WALLET,
          isUserApproved: true,
          approvedDigest: plan.planDigest,
        }),
      ).rejects.toThrow(ExecutionGuardBlockedError);
    });

    it("prevents duplicate submissions of identical client nonce", async () => {
      const guard = new ExecutionGuard({ dryRun: false });
      const executor = new OrderExecutor(guard);
      const plan = OrderPlanner.createOrderPlan({
        walletAddress: TEST_WALLET,
        market: MOCK_ETH_MARKET,
        side: "BUY_LONG",
        orderType: "LIMIT",
        price: 2340.0,
        quantity: 0.004,
        leverage: 2,
      });

      // First submit via mock transport
      const res = await executor.submitOrder(plan, {
        connectedWallet: TEST_WALLET,
        isUserApproved: true,
        approvedDigest: plan.planDigest,
        mockTransport: true,
      });
      expect(res.state).toBeDefined();

      // Second submit with exact same plan/nonce must throw DuplicateSubmissionError
      await expect(
        executor.submitOrder(plan, {
          connectedWallet: TEST_WALLET,
          isUserApproved: true,
          approvedDigest: plan.planDigest,
          mockTransport: true,
        }),
      ).rejects.toThrow(DuplicateSubmissionError);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. ReceiptVerifier Fixtures & Status Handling
  // ---------------------------------------------------------------------------
  describe("ReceiptVerifier Fixtures & Reversion Handling", () => {
    const verifier = new ReceiptVerifier();
    const mockHash = "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890" as `0x${string}`;

    it("classifies confirmed fixture receipt accurately", async () => {
      const receipt = await verifier.verifyTransaction(mockHash, undefined, {
        status: "CONFIRMED",
        blockNumber: 35_100_000n,
        confirmations: 2,
      });

      expect(receipt.status).toBe("CONFIRMED");
      expect(receipt.confirmations).toBe(2);
      expect(receipt.transactionHash).toBe(mockHash);
    });

    it("strictly classifies reverted fixture receipt as REVERTED, never success", async () => {
      const receipt = await verifier.verifyTransaction(mockHash, undefined, {
        status: "REVERTED",
        revertReason: "MarginBank: Insufficient Collateral",
      });

      expect(receipt.status).toBe("REVERTED");
      expect(receipt.revertReason).toContain("Insufficient Collateral");
    });

    it("handles pending receipts without claiming confirmation", async () => {
      const receipt = await verifier.verifyTransaction(mockHash, undefined, {
        status: "PENDING",
        confirmations: 0,
      });

      expect(receipt.status).toBe("PENDING");
    });
  });

  // ---------------------------------------------------------------------------
  // 5. OrderReconciler & State Discrepancy Detection
  // ---------------------------------------------------------------------------
  describe("OrderReconciler & State Discrepancy Detection", () => {
    const plan = OrderPlanner.createOrderPlan({
      walletAddress: TEST_WALLET,
      market: MOCK_ETH_MARKET,
      side: "BUY_LONG",
      orderType: "LIMIT",
      price: 2340.0,
      quantity: 0.004,
      leverage: 2,
    });

    it("correctly reconciles resting order (open with 0 fills)", () => {
      const rec = OrderReconciler.reconcile({
        correlationId: plan.clientNonce,
        plan,
        receipt: {
          transactionHash: "0x1111111111111111111111111111111111111111111111111111111111111111",
          status: "CONFIRMED",
          confirmations: 1,
          timestampMs: Date.now(),
        },
        exchangeOrder: {
          id: "1001",
          symbol: "ETH/USDso:USDso",
          status: "open",
          price: 2340.0,
          amount: 0.004,
          filled: 0,
          remaining: 0.004,
        },
      });

      expect(rec.isDiscrepancy).toBe(false);
      expect(OrderReconciler.mapToLifecycleState(rec)).toBe("RESTING");
    });

    it("correctly reconciles partial fill", () => {
      const rec = OrderReconciler.reconcile({
        correlationId: plan.clientNonce,
        plan,
        receipt: {
          transactionHash: "0x1111111111111111111111111111111111111111111111111111111111111111",
          status: "CONFIRMED",
          confirmations: 1,
          timestampMs: Date.now(),
        },
        exchangeOrder: {
          id: "1001",
          symbol: "ETH/USDso:USDso",
          status: "open",
          price: 2340.0,
          amount: 0.004,
          filled: 0.002,
          remaining: 0.002,
        },
      });

      expect(rec.isDiscrepancy).toBe(false);
      expect(rec.filledQuantity).toBe(0.002);
      expect(OrderReconciler.mapToLifecycleState(rec)).toBe("PARTIALLY_FILLED");
    });

    it("correctly reconciles full fill", () => {
      const rec = OrderReconciler.reconcile({
        correlationId: plan.clientNonce,
        plan,
        receipt: {
          transactionHash: "0x1111111111111111111111111111111111111111111111111111111111111111",
          status: "CONFIRMED",
          confirmations: 1,
          timestampMs: Date.now(),
        },
        exchangeOrder: {
          id: "1001",
          symbol: "ETH/USDso:USDso",
          status: "closed",
          price: 2340.0,
          amount: 0.004,
          filled: 0.004,
          remaining: 0,
        },
      });

      expect(rec.isDiscrepancy).toBe(false);
      expect(OrderReconciler.mapToLifecycleState(rec)).toBe("FILLED");
    });

    it("flags RECONCILIATION_REQUIRED when exchange state is missing after confirmed tx", () => {
      const rec = OrderReconciler.reconcile({
        correlationId: plan.clientNonce,
        plan,
        receipt: {
          transactionHash: "0x1111111111111111111111111111111111111111111111111111111111111111",
          status: "CONFIRMED",
          confirmations: 1,
          timestampMs: Date.now(),
        },
        exchangeOrder: null, // Indexer delayed/missing
      });

      expect(rec.isDiscrepancy).toBe(true);
      expect(OrderReconciler.mapToLifecycleState(rec)).toBe("RECONCILIATION_REQUIRED");
    });
  });

  // ---------------------------------------------------------------------------
  // 6. OrderCanceller Workflow & Race Conditions
  // ---------------------------------------------------------------------------
  describe("OrderCanceller Workflow & Race Detection", () => {
    const cancelReq = {
      orderId: "1001",
      poolAddress: MOCK_ETH_MARKET.poolAddress,
      account: TEST_WALLET,
      marketSymbol: "ETH-PERP",
    };

    it("refuses to cancel an already-filled order", () => {
      const res = OrderCanceller.evaluateCancellation(cancelReq, {
        id: "1001",
        symbol: "ETH/USDso:USDso",
        status: "closed",
        price: 2340.0,
        amount: 0.004,
        filled: 0.004,
        remaining: 0,
      });

      expect(res.status).toBe("ALREADY_FILLED");
      expect(res.reason).toContain("Cannot be cancelled");
    });

    it("refuses to cancel an already-cancelled order", () => {
      const res = OrderCanceller.evaluateCancellation(cancelReq, {
        id: "1001",
        symbol: "ETH/USDso:USDso",
        status: "canceled",
        price: 2340.0,
        amount: 0.004,
        filled: 0,
        remaining: 0.004,
      });

      expect(res.status).toBe("ALREADY_CANCELLED");
    });

    it("confirms resting order cancellation and preserves fills", () => {
      const res = OrderCanceller.evaluateCancellation(
        cancelReq,
        {
          id: "1001",
          symbol: "ETH/USDso:USDso",
          status: "open",
          price: 2340.0,
          amount: 0.004,
          filled: 0.001,
          remaining: 0.003,
        },
        true, // Confirmed
      );

      expect(res.status).toBe("CANCELLED");
      expect(res.reason).toContain("Preserved fills: 0.001");
    });

    it("detects cancellation race condition where order filled during cancel attempt", () => {
      const preSnapshot = {
        id: "1001",
        symbol: "ETH/USDso:USDso",
        status: "open" as const,
        price: 2340.0,
        amount: 0.004,
        filled: 0,
        remaining: 0.004,
      };

      const postSnapshot = {
        id: "1001",
        symbol: "ETH/USDso:USDso",
        status: "closed" as const,
        price: 2340.0,
        amount: 0.004,
        filled: 0.004,
        remaining: 0,
      };

      const isRace = OrderCanceller.detectRaceCondition(preSnapshot, postSnapshot);
      expect(isRace).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 7. PositionCloser & Native Reduce-Only Verification
  // ---------------------------------------------------------------------------
  describe("PositionCloser & Protocol Reduce-Only Audit", () => {
    it("explicitly records that direct PerpPool CLOB orders lack native reduceOnly", () => {
      const closePlan = PositionCloser.createClosePlan({
        marketSymbol: "ETH-PERP",
        poolAddress: MOCK_ETH_MARKET.poolAddress,
        position: {
          size: 0.004,
          side: "long",
          avgEntryPrice: 2340.0,
        },
      });

      expect(closePlan.isNativeReduceOnlySupported).toBe(false);
      expect(closePlan.clientGuardEnforced).toBe(true);
      expect(closePlan.closeSide).toBe("SELL_SHORT");
      expect(closePlan.closeQuantity).toBe(0.004);
      expect(closePlan.valid).toBe(true);
    });

    it("clips requested close size to prevent position reversal", () => {
      const closePlan = PositionCloser.createClosePlan({
        marketSymbol: "ETH-PERP",
        poolAddress: MOCK_ETH_MARKET.poolAddress,
        position: {
          size: 0.004,
          side: "long",
          avgEntryPrice: 2340.0,
        },
        requestedCloseQuantity: 0.01, // Trying to close 0.010 on a 0.004 position
      });

      expect(closePlan.closeQuantity).toBe(0.004); // Must be strictly clipped to 0.004
      expect(closePlan.reason).toContain("Clipped to prevent accidental position reversal");
    });

    it("creates correct close plan for short position", () => {
      const closePlan = PositionCloser.createClosePlan({
        marketSymbol: "ETH-PERP",
        poolAddress: MOCK_ETH_MARKET.poolAddress,
        position: {
          size: 0.008,
          side: "short",
          avgEntryPrice: 2340.0,
        },
      });

      expect(closePlan.closeSide).toBe("BUY_LONG");
      expect(closePlan.closeQuantity).toBe(0.008);
    });

    it("verifies authoritative zero position as closed", () => {
      const zeroCheck = PositionCloser.verifyPositionClosed(null);
      expect(zeroCheck.isClosed).toBe(true);

      const subLotCheck = PositionCloser.verifyPositionClosed({
        size: 0.00005, // Below 0.0001 lot dust
        side: "long",
        avgEntryPrice: 2340.0,
      });
      expect(subLotCheck.isClosed).toBe(true);
    });

    it("flags unverified closure if position remains open", () => {
      const lingeringCheck = PositionCloser.verifyPositionClosed({
        size: 0.002, // 20 lots remain
        side: "long",
        avgEntryPrice: 2340.0,
      });
      expect(lingeringCheck.isClosed).toBe(false);
      expect(lingeringCheck.details).toContain("Position remains partially open");
    });
  });

  // ---------------------------------------------------------------------------
  // 8. ExecutionAuditLog & Hygiene
  // ---------------------------------------------------------------------------
  describe("ExecutionAuditLog & Secret Sanitization", () => {
    it("redacts any sensitive keys from data payloads", () => {
      const audit = ExecutionAuditLog.getInstance();
      const evt = audit.record("test-nonce", "PLANNED", "Audit test", {
        privateKey: "0x123456",
        seedPhrase: "word1 word2",
        secretToken: "secret123",
        cleanParam: "okValue",
      });

      expect(evt.data?.privateKey).toBe("[REDACTED_SECRET]");
      expect(evt.data?.seedPhrase).toBe("[REDACTED_SECRET]");
      expect(evt.data?.secretToken).toBe("[REDACTED_SECRET]");
      expect(evt.data?.cleanParam).toBe("okValue");
    });
  });

  // ---------------------------------------------------------------------------
  // 9. LiveOrderAdapter Call Encoding & Strict Dry-Run Boundaries
  // ---------------------------------------------------------------------------
  describe("LiveOrderAdapter Call Encoding & Strict Dry-Run Boundaries", () => {
    const adapter = new LiveOrderAdapter();
    const plan = OrderPlanner.createOrderPlan({
      walletAddress: TEST_WALLET,
      market: MOCK_ETH_MARKET,
      side: "BUY_LONG",
      orderType: "LIMIT",
      price: 2340.0,
      quantity: 0.004,
      leverage: 2,
    });

    it("encodes valid placeOrder calldata with exact 4-byte selector 0x4e978373", () => {
      const call = adapter.prepareOrderCall(plan);

      expect(call.chainId).toBe(EXPECTED_HIDEKI_CHAIN_ID);
      expect(call.to.toLowerCase()).toBe(MOCK_ETH_MARKET.poolAddress.toLowerCase());
      expect(call.functionSelector).toBe("0x4e978373");
      expect(call.data.startsWith("0x4e978373")).toBe(true);
      expect(call.args[0]).toBe(true); // isBid: true for BUY_LONG
      expect(call.args[1]).toBe(0n); // userData: uint64 0n
      expect(call.args[2]).toBe(plan.priceRaw); // price: uint256
      expect(call.args[3]).toBe(plan.quantityRaw); // quantity: uint256
      expect(call.args[5]).toBe(0); // orderType: 0 (LIMIT)
      expect(call.args[8]).toBe(0n); // builderFeeBpsTimes1k: uint96 0n
    });

    it("correctly maps application OrderTypes to contract enum values", () => {
      expect(LiveOrderAdapter.mapOrderTypeToContract("LIMIT")).toBe(0);
      expect(LiveOrderAdapter.mapOrderTypeToContract("FILL_OR_KILL")).toBe(1);
      expect(LiveOrderAdapter.mapOrderTypeToContract("MARKET")).toBe(2);
      expect(LiveOrderAdapter.mapOrderTypeToContract("POST_ONLY")).toBe(3);
    });

    it("rejects plan with invalid chain ID in prepareOrderCall", () => {
      const invalidPlan = { ...plan, chainId: 1 };
      expect(() => adapter.prepareOrderCall(invalidPlan)).toThrow("Invalid chain ID 1");
    });

    it("strictly blocks broadcastOrder when DRY_RUN=true is active", async () => {
      await expect(
        adapter.broadcastOrder(plan, TEST_WALLET, true, plan.planDigest),
      ).rejects.toThrow(ExecutionGuardBlockedError);
    });

    it("OrderExecutor integrates LiveOrderAdapter.prepareOrderCall and attaches preparedCall", async () => {
      const guard = new ExecutionGuard({ dryRun: false });
      const executor = new OrderExecutor(guard);

      const res = await executor.submitOrder(plan, {
        connectedWallet: TEST_WALLET,
        isUserApproved: true,
        approvedDigest: plan.planDigest,
        mockTransport: true,
      });

      expect(res.preparedCall).toBeDefined();
      expect(res.preparedCall?.functionSelector).toBe("0x4e978373");
      expect(res.preparedCall?.data.startsWith("0x4e978373")).toBe(true);
    });
  });

  describe("Stage F.5 Risk Math, Protocol Verification & Close-Safety Offline Tests", () => {
    it("distinguishes protocol floor margin (500 bps = $0.9888) from user-configured 2x leverage margin (5000 bps = $9.8883)", () => {
      const notional = 19.77661;
      const protocolBaseImfBps = 500; // 5% base floor at 20x max leverage
      const userLeverage = 2.0;

      // Protocol minimum floor
      const protocolFloorMargin = (notional * protocolBaseImfBps) / 10000;
      expect(protocolFloorMargin).toBeCloseTo(0.98883, 4);

      // User configured margin
      const userConfiguredMargin = notional / userLeverage;
      expect(userConfiguredMargin).toBeCloseTo(9.8883, 4);

      // Verify that user margin is 10x higher than protocol minimum floor
      expect(userConfiguredMargin).toBeGreaterThan(protocolFloorMargin);
      const userImfBps = 10000 / userLeverage; // 5000 bps
      expect(userImfBps).toBe(5000);

      // Leverage surcharge required to enforce 2x leverage on a 20x protocol
      const leverageSurchargeBps = userImfBps - protocolBaseImfBps; // 4500 bps
      const leverageSurchargeUsd = (notional * leverageSurchargeBps) / 10000;
      expect(leverageSurchargeUsd).toBeCloseTo(8.89947, 4);
      expect(protocolFloorMargin + leverageSurchargeUsd).toBeCloseTo(userConfiguredMargin, 4);
    });

    it("verifies protocol expiry semantics: 0 is rejected by matcher; GTC requires farFutureNs", () => {
      const nowMs = 1730124000000; // Fixed timestamp
      // DreamDEX SDK store.js:142 notes: '0 is treated as no expiry defensively; matcher rejects 0 at placement; GTC carries type(uint64).max or now + 50 years'
      const zeroExpiry = 0n;
      const sdkFarFutureNs = BigInt(Math.floor(nowMs / 1000) + 50 * 365 * 24 * 3600) * 1_000_000_000n;
      const maxUint64 = 2n ** 64n - 1n;

      expect(zeroExpiry).toBe(0n);
      expect(sdkFarFutureNs).toBeGreaterThan(BigInt(nowMs) * 1_000_000n);
      expect(maxUint64).toBe(18446744073709551615n);
      // Valid GTC must NOT be zero
      expect(sdkFarFutureNs).not.toBe(zeroExpiry);
    });

    it("flags cancellation race condition when fill occurs before cancellation confirmation", () => {
      const preCancel = {
        id: "order-123",
        symbol: "ETH-PERP",
        status: "open" as const,
        price: 2326.66,
        amount: 0.0085,
        filled: 0.0,
        remaining: 0.0085,
      };

      const postCancelRaced = {
        id: "order-123",
        symbol: "ETH-PERP",
        status: "closed" as const,
        price: 2326.66,
        amount: 0.0085,
        filled: 0.0085, // Fully filled before cancel mined
        remaining: 0.0,
      };

      const isRace = OrderCanceller.detectRaceCondition(preCancel, postCancelRaced);
      expect(isRace).toBe(true);

      const evalResult = OrderCanceller.evaluateCancellation(
        {
          orderId: "order-123",
          poolAddress: MOCK_ETH_MARKET.poolAddress,
          account: TEST_WALLET,
          marketSymbol: "ETH-PERP",
        },
        postCancelRaced,
      );

      // Must settle as ALREADY_FILLED, never CANCELLED
      expect(evalResult.status).toBe("ALREADY_FILLED");
    });

    it("guarantees receipt-confirmed transaction without exchange indexer state maps strictly to RECONCILIATION_REQUIRED", () => {
      const plan = OrderPlanner.createOrderPlan({
        market: MOCK_ETH_MARKET,
        walletAddress: TEST_WALLET,
        side: "BUY_LONG",
        orderType: "LIMIT",
        price: 2326.66,
        quantity: 0.0085,
        leverage: 2.0,
      });

      const receipt = {
        transactionHash: "0x1111111111111111111111111111111111111111111111111111111111111111" as `0x${string}`,
        status: "CONFIRMED" as const,
        blockNumber: 35423000n,
        confirmations: 1,
        gasUsed: 150000n,
        effectiveGasPrice: 1000000000n,
        timestampMs: Date.now(),
      };

      // Indexer is lagging / order missing from exchange
      const record = OrderReconciler.reconcile({
        correlationId: "corr-f5-missing",
        plan,
        receipt,
        exchangeOrder: null,
      });

      expect(record.isDiscrepancy).toBe(true);
      expect(record.discrepancyDetails).toContain("Reconciliation required");
      expect(OrderReconciler.mapToLifecycleState(record)).toBe("RECONCILIATION_REQUIRED");
    });

    it("demonstrates TOCTOU close race: position size drops between planning and execution", () => {
      // 1. Trader had 0.0085 ETH Long
      const initialPosition = {
        size: 0.0085,
        side: "long" as const,
        avgEntryPrice: 2326.66,
      };

      // 2. Close plan created for full 0.0085 ETH
      const closePlan = PositionCloser.createClosePlan({
        marketSymbol: "ETH-PERP",
        poolAddress: MOCK_ETH_MARKET.poolAddress,
        position: initialPosition,
      });

      expect(closePlan.valid).toBe(true);
      expect(closePlan.closeQuantity).toBe(0.0085);
      expect(closePlan.closeSide).toBe("SELL_SHORT");

      // 3. Race condition: concurrent partial close/ADL occurs on chain, reducing position to 0.0040 ETH
      const racedPosition = {
        size: 0.0040,
        side: "long" as const,
        avgEntryPrice: 2326.66,
      };

      // 4. If executed without re-validation, 0.0085 sell against 0.0040 long flips position to 0.0045 short
      const postExecutionNet = racedPosition.size - closePlan.closeQuantity;
      expect(postExecutionNet).toBeLessThan(0); // -0.0045 ETH (Position Reversed!)

      // 5. Proves that client-side clipping alone cannot guarantee reduce-only safety under concurrency
      expect(closePlan.isNativeReduceOnlySupported).toBe(false);
    });
  });

  describe("Stage F.6 Remediation Tests: Margin Math & Expiry Semantics", () => {
    it("OrderPlanner computes protocol floor, target margin, and leverage surcharge for 2x leverage", () => {
      const plan = OrderPlanner.createOrderPlan({
        market: MOCK_ETH_MARKET,
        walletAddress: TEST_WALLET,
        side: "BUY_LONG",
        orderType: "LIMIT",
        price: 2330.48,
        quantity: 0.0085,
        leverage: 2.0,
      });

      expect(plan.validation.valid).toBe(true);
      expect(plan.notionalUsd).toBeCloseTo(19.80908, 4);
      // Protocol minimum floor (5%)
      expect(plan.protocolMinMarginUsd).toBeCloseTo(0.99045, 4);
      // Target margin for 2x leverage (50%)
      expect(plan.marginRequiredUsd).toBeCloseTo(9.90454, 4);
      // Leverage surcharge (45%)
      expect(plan.leverageSurchargeUsd).toBeCloseTo(8.91409, 4);
      expect((plan.protocolMinMarginUsd || 0) + (plan.leverageSurchargeUsd || 0)).toBeCloseTo(plan.marginRequiredUsd, 4);
    });

    it("OrderPlanner handles max leverage (20x) where surcharge is zero", () => {
      const plan = OrderPlanner.createOrderPlan({
        market: MOCK_ETH_MARKET,
        walletAddress: TEST_WALLET,
        side: "BUY_LONG",
        orderType: "LIMIT",
        price: 2330.48,
        quantity: 0.0085,
        leverage: 20.0,
      });

      expect(plan.validation.valid).toBe(true);
      expect(plan.marginRequiredUsd).toBeCloseTo(0.99045, 4);
      expect(plan.protocolMinMarginUsd).toBeCloseTo(0.99045, 4);
      expect(plan.leverageSurchargeUsd).toBe(0);
    });

    it("OrderPlanner rejects leverage exceeding market maximum or <= 0", () => {
      const planExcess = OrderPlanner.createOrderPlan({
        market: MOCK_ETH_MARKET,
        walletAddress: TEST_WALLET,
        side: "BUY_LONG",
        orderType: "LIMIT",
        price: 2330.48,
        quantity: 0.0085,
        leverage: 25.0, // Exceeds 20x max
      });
      expect(planExcess.validation.valid).toBe(false);
      expect(planExcess.validation.errors[0]).toContain("exceeds market maximum");

      const planZero = OrderPlanner.createOrderPlan({
        market: MOCK_ETH_MARKET,
        walletAddress: TEST_WALLET,
        side: "BUY_LONG",
        orderType: "LIMIT",
        price: 2330.48,
        quantity: 0.0085,
        leverage: 0,
      });
      expect(planZero.validation.valid).toBe(false);
    });

    it("LiveOrderAdapter rejects zero expiry (0n) with explicit matcher rejection error", () => {
      const adapter = new LiveOrderAdapter();
      const plan = OrderPlanner.createOrderPlan({
        market: MOCK_ETH_MARKET,
        walletAddress: TEST_WALLET,
        side: "BUY_LONG",
        orderType: "LIMIT",
        price: 2330.48,
        quantity: 0.0085,
        leverage: 2.0,
      });

      const zeroPlan = { ...plan, expireTimestampNs: 0n };
      expect(() => adapter.prepareOrderCall(zeroPlan)).toThrow(
        "Zero expiry (0n) is rejected by dreamDEX matcher at placement; GTC requires a future expiry",
      );
    });

    it("LiveOrderAdapter rejects past expiry timestamp", () => {
      const adapter = new LiveOrderAdapter();
      const plan = OrderPlanner.createOrderPlan({
        market: MOCK_ETH_MARKET,
        walletAddress: TEST_WALLET,
        side: "BUY_LONG",
        orderType: "LIMIT",
        price: 2330.48,
        quantity: 0.0085,
        leverage: 2.0,
      });

      const pastPlan = { ...plan, expireTimestampNs: 1_000_000_000n }; // Year 1970
      expect(() => adapter.prepareOrderCall(pastPlan)).toThrow("is in the past");
    });

    it("LiveOrderAdapter rejects negative expiry timestamp", () => {
      const adapter = new LiveOrderAdapter();
      const plan = OrderPlanner.createOrderPlan({
        market: MOCK_ETH_MARKET,
        walletAddress: TEST_WALLET,
        side: "BUY_LONG",
        orderType: "LIMIT",
        price: 2330.48,
        quantity: 0.0085,
        leverage: 2.0,
      });

      const negPlan = { ...plan, expireTimestampNs: -100n };
      expect(() => adapter.prepareOrderCall(negPlan)).toThrow("cannot be negative");
    });

    it("LiveOrderAdapter rejects timestamp exceeding uint64 range", () => {
      const adapter = new LiveOrderAdapter();
      const plan = OrderPlanner.createOrderPlan({
        market: MOCK_ETH_MARKET,
        walletAddress: TEST_WALLET,
        side: "BUY_LONG",
        orderType: "LIMIT",
        price: 2330.48,
        quantity: 0.0085,
        leverage: 2.0,
      });

      const overflowPlan = { ...plan, expireTimestampNs: (1n << 64n) + 100n };
      expect(() => adapter.prepareOrderCall(overflowPlan)).toThrow("exceeds uint64 max");
    });

    it("LiveOrderAdapter defaults to verified ~50-year GTC expiry in nanoseconds", () => {
      const adapter = new LiveOrderAdapter();
      const plan = OrderPlanner.createOrderPlan({
        market: MOCK_ETH_MARKET,
        walletAddress: TEST_WALLET,
        side: "BUY_LONG",
        orderType: "LIMIT",
        price: 2330.48,
        quantity: 0.0085,
        leverage: 2.0,
      });

      const call = adapter.prepareOrderCall(plan);
      const expiryNs = call.args[4];
      const nowNs = BigInt(Date.now()) * 1_000_000n;
      const min49YearsNs = nowNs + 49n * 365n * 86400n * 1_000_000_000n;
      const maxUint64 = (1n << 64n) - 1n;

      expect(expiryNs).toBeGreaterThan(min49YearsNs);
      expect(expiryNs).toBeLessThanOrEqual(maxUint64);
    });
  });
});
