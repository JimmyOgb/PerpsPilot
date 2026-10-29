import { describe, it, expect, vi } from "vitest";
import { decodeFunctionData, type Address, type Hash, type TransactionReceipt } from "viem";
import {
  LiveOrderAdapter,
  PERP_POOL_PLACE_ORDER_ABI,
  CONTRACT_ORDER_TYPES,
  CONTRACT_SELF_MATCHING,
} from "../src/execution/LiveOrderAdapter.js";
import { OrderPlanner } from "../src/execution/OrderPlanner.js";
import { ExecutionGuard, DEFAULT_GUARD_CONFIG } from "../src/execution/ExecutionGuard.js";
import { ExecutionGuardBlockedError } from "../src/execution/OrderExecutor.js";
import { ReceiptVerifier } from "../src/execution/ReceiptVerifier.js";
import { PositionCloser } from "../src/execution/PositionCloser.js";
import { EXPECTED_HIDEKI_CHAIN_ID } from "../src/config/constants.js";
import type { OrderSide, OrderPlan, LiveExecutionState } from "../src/execution/types.js";
import type { PerpMarketInfo } from "../src/markets/types.js";

const MOCK_ETH_MARKET: PerpMarketInfo = {
  id: "0xd6cb1dd58580b84d76068ac21594219ce03aeddf",
  symbol: "ETH:USDSO",
  display: "ETH-PERP",
  poolAddress: "0xd6cb1dd58580b84d76068ac21594219ce03aeddf",
  marginBank: "0x478769E1177C0773c43A593DCCc4Ad15F15F1394",
  baseToken: "0x4200000000000000000000000000000000000006",
  quoteToken: "0xed7993A74dAe1e6656B704A424DcD8711aAf4F72",
  baseSymbol: "ETH",
  quoteSymbol: "USDSO",
  baseDecimals: 18,
  quoteDecimals: 18,
  tickSize: 10_000_000_000_000_000n, // $0.01
  lotSize: 100_000_000_000_000n, // 0.0001 ETH
  minQuantity: 4_000_000_000_000_000n, // 0.004 ETH
  initialMarginBps: 500, // 5% IMF (20x)
  maxLeverage: 20,
  perpStatus: null,
};

const TEST_WALLET: Address = "0xdf271A2B6De82cabED87cA117C29058fcE4Af0CC";

describe("Stage F.19 — Live Wallet-Signed Trading & Execution Engine Tests", () => {
  const adapter = new LiveOrderAdapter();

  // --------------------------------------------------------------------------
  // 1. Mandatory Side-Encoding Hazard Regression Tests
  // --------------------------------------------------------------------------
  describe("1. Side Encoding & Strict Typed Validation", () => {
    it("strictly encodes BUY_LONG as isBid = true", () => {
      const plan = OrderPlanner.createOrderPlan({
        walletAddress: TEST_WALLET,
        market: MOCK_ETH_MARKET,
        side: "BUY_LONG",
        orderType: "POST_ONLY",
        price: 2200.0,
        quantity: 0.004,
        leverage: 2,
      });

      const call = adapter.prepareOrderCall(plan);
      expect(call.args[0]).toBe(true); // isBid strictly true

      const decoded = decodeFunctionData({
        abi: PERP_POOL_PLACE_ORDER_ABI,
        data: call.data,
      });
      expect(decoded.functionName).toBe("placeOrder");
      expect(decoded.args[0]).toBe(true);
    });

    it("strictly encodes SELL_SHORT as isBid = false", () => {
      const plan = OrderPlanner.createOrderPlan({
        walletAddress: TEST_WALLET,
        market: MOCK_ETH_MARKET,
        side: "SELL_SHORT",
        orderType: "POST_ONLY",
        price: 2400.0,
        quantity: 0.004,
        leverage: 2,
      });

      const call = adapter.prepareOrderCall(plan);
      expect(call.args[0]).toBe(false); // isBid strictly false

      const decoded = decodeFunctionData({
        abi: PERP_POOL_PLACE_ORDER_ABI,
        data: call.data,
      });
      expect(decoded.functionName).toBe("placeOrder");
      expect(decoded.args[0]).toBe(false);
    });

    it("rejects malformed, lowercase, or unsupported side strings in OrderPlanner", () => {
      const invalidSides = ["long", "short", "LONG", "SHORT", "BUY", "SELL", "bid", "ask", "BUY_LONg", ""];
      for (const inv of invalidSides) {
        const plan = OrderPlanner.createOrderPlan({
          walletAddress: TEST_WALLET,
          market: MOCK_ETH_MARKET,
          side: inv as any,
          orderType: "POST_ONLY",
          price: 2200.0,
          quantity: 0.004,
          leverage: 2,
        });

        expect(plan.validation.valid).toBe(false);
        expect(
          plan.validation.errors.some((e) => e.includes("Invalid or unsupported order side")),
        ).toBe(true);
      }
    });

    it("throws explicit error in LiveOrderAdapter if malformed side bypasses planner", () => {
      const invalidPlan: any = {
        chainId: EXPECTED_HIDEKI_CHAIN_ID,
        walletAddress: TEST_WALLET,
        poolAddress: MOCK_ETH_MARKET.poolAddress,
        side: "long", // Malformed
        orderType: "POST_ONLY",
        priceRaw: 2200n * 10n ** 18n,
        quantityRaw: 4n * 10n ** 15n,
      };

      expect(() => adapter.prepareOrderCall(invalidPlan)).toThrow(
        "[LiveOrderAdapter] Invalid or unsupported order side: 'long'",
      );
    });
  });

  // --------------------------------------------------------------------------
  // 2. Chain ID, Pool Target, and Precision Alignment Tests
  // --------------------------------------------------------------------------
  describe("2. Chain ID & Grid Parameter Validation", () => {
    it("asserts Somnia Hideki Chain ID 50383 and rejects foreign chains", () => {
      expect(() =>
        adapter.prepareOrderCall({
          chainId: 1, // Ethereum Mainnet
          walletAddress: TEST_WALLET,
          poolAddress: MOCK_ETH_MARKET.poolAddress,
          side: "BUY_LONG",
          orderType: "POST_ONLY",
          priceRaw: 2200n * 10n ** 18n,
          quantityRaw: 4n * 10n ** 15n,
        } as any),
      ).toThrow(`Invalid chain ID 1. Expected Hideki ${EXPECTED_HIDEKI_CHAIN_ID}`);
    });

    it("enforces minimum quantity of 0.004 ETH", () => {
      const plan = OrderPlanner.createOrderPlan({
        walletAddress: TEST_WALLET,
        market: MOCK_ETH_MARKET,
        side: "BUY_LONG",
        orderType: "POST_ONLY",
        price: 2200.0,
        quantity: 0.002, // Below 0.004 min
        leverage: 2,
      });

      expect(plan.validation.valid).toBe(false);
      expect(plan.validation.errors.some((e) => e.includes("below market minimum"))).toBe(true);
    });

    it("quantizes limit price to 0.01 USDso tick grid and lot to 0.0001 ETH", () => {
      const plan = OrderPlanner.createOrderPlan({
        walletAddress: TEST_WALLET,
        market: MOCK_ETH_MARKET,
        side: "BUY_LONG",
        orderType: "POST_ONLY",
        price: 2200.0078, // Unaligned tick
        quantity: 0.004089, // Unaligned lot
        leverage: 2,
      });

      expect(plan.price).toBe(2200.0);
      expect(plan.quantity).toBe(0.004);
      expect(plan.validation.valid).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // 3. Execution Guard & Preview vs Live Separation Tests
  // --------------------------------------------------------------------------
  describe("3. ExecutionGuard Isolation & Live Gating", () => {
    it("strictly blocks live execution when DRY_RUN=true (Gate 1)", () => {
      const guard = new ExecutionGuard({ dryRun: true });
      const plan = OrderPlanner.createOrderPlan({
        walletAddress: TEST_WALLET,
        market: MOCK_ETH_MARKET,
        side: "BUY_LONG",
        orderType: "POST_ONLY",
        price: 2200.0,
        quantity: 0.004,
        leverage: 2,
      });

      const evalResult = guard.evaluate({
        plan,
        connectedWallet: TEST_WALLET,
        isUserApproved: true,
      });

      expect(evalResult.allowed).toBe(false);
      expect(evalResult.reason).toContain("BLOCKED: DRY_RUN=true is active");
    });

    it("fails closed if user approval is missing even if dryRun is false (Gate 8)", () => {
      const guard = new ExecutionGuard({ dryRun: false });
      const plan = OrderPlanner.createOrderPlan({
        walletAddress: TEST_WALLET,
        market: MOCK_ETH_MARKET,
        side: "BUY_LONG",
        orderType: "POST_ONLY",
        price: 2200.0,
        quantity: 0.004,
        leverage: 2,
      });

      const evalResult = guard.evaluate({
        plan,
        connectedWallet: TEST_WALLET,
        isUserApproved: false, // User has not confirmed
      });

      expect(evalResult.allowed).toBe(false);
      expect(evalResult.reason).toContain("Operator approval has not been granted");
    });

    it("broadcastOrder throws error when DRY_RUN is active", async () => {
      const plan = OrderPlanner.createOrderPlan({
        walletAddress: TEST_WALLET,
        market: MOCK_ETH_MARKET,
        side: "BUY_LONG",
        orderType: "POST_ONLY",
        price: 2200.0,
        quantity: 0.004,
        leverage: 2,
      });

      await expect(
        adapter.broadcastOrder(plan, TEST_WALLET, true, plan.planDigest),
      ).rejects.toThrow(ExecutionGuardBlockedError);
    });
  });

  // --------------------------------------------------------------------------
  // 4. Receipt Verification, Event Decoding, & Position Verification (Mocked)
  // --------------------------------------------------------------------------
  describe("4. Receipt Verification & Event Decoding (Mocked Tests)", () => {
    it("[MOCKED] decodes resting order placement logs using decodePlacementReceipt", () => {
      // Mocked receipt fixture containing OrderPlaced and OrderRested event topics
      const mockReceipt: any = {
        status: "success",
        blockNumber: 36_000_000n,
        logs: [
          {
            address: MOCK_ETH_MARKET.poolAddress,
            topics: [
              "0x5774a3f1ff4d01b6727284b3d11516e84860000b0e5ee50c59296e83d8eb2c1d", // OrderPlaced event topic
              "0x000000000000000000000000000000000000000000000000000000000000002a", // orderId = 42
            ],
            data: "0x",
          },
        ],
      };

      const decoded = LiveOrderAdapter.decodePlacementReceipt(mockReceipt, MOCK_ETH_MARKET.poolAddress);
      expect(decoded).toBeDefined();
      expect(Array.isArray(decoded.fills)).toBe(true);
    });

    it("[MOCKED] distinguishes reverted receipts from confirmed receipts", async () => {
      const verifier = new ReceiptVerifier();
      const mockReverted = await verifier.verifyTransaction("0x1234567890abcdef" as Hash, undefined, {
        status: "REVERTED",
        revertReason: "PostOnlyWouldCross",
      });

      expect(mockReverted.status).toBe("REVERTED");
      expect(mockReverted.revertReason).toBe("PostOnlyWouldCross");

      const mockConfirmed = await verifier.verifyTransaction("0xabcdef1234567890" as Hash, undefined, {
        status: "CONFIRMED",
        confirmations: 1,
      });
      expect(mockConfirmed.status).toBe("CONFIRMED");
    });
  });

  // --------------------------------------------------------------------------
  // 5. Position Reduction Limitation Tests
  // --------------------------------------------------------------------------
  describe("5. Position Reduction Safeguards", () => {
    it("acknowledges that PerpPool lacks contract-level reduceOnly and caps close quantity", () => {
      const closePlan = PositionCloser.createClosePlan({
        marketSymbol: "ETH-PERP",
        poolAddress: MOCK_ETH_MARKET.poolAddress,
        position: {
          side: "long",
          size: 0.004,
          avgEntryPrice: 2200.0,
          unrealizedPnl: 0.40,
        },
        requestedCloseQuantity: 0.010, // Exceeds holding of 0.004
      });

      expect(closePlan.isNativeReduceOnlySupported).toBe(false);
      expect(closePlan.clientGuardEnforced).toBe(true);
      expect(closePlan.closeQuantity).toBe(0.004); // Strictly capped to prevent reversal into short
      expect(closePlan.closeSide).toBe("SELL_SHORT");
    });
  });

  // --------------------------------------------------------------------------
  // 6. Security & Secrets Protection
  // --------------------------------------------------------------------------
  describe("6. Secrets & Zero-Key Exposure Audit", () => {
    it("ensures no private keys exist in default guard or planner outputs", () => {
      const plan = OrderPlanner.createOrderPlan({
        walletAddress: TEST_WALLET,
        market: MOCK_ETH_MARKET,
        side: "BUY_LONG",
        orderType: "POST_ONLY",
        price: 2200.0,
        quantity: 0.004,
        leverage: 2,
      });

      const serialized = JSON.stringify(plan, (_, v) => (typeof v === "bigint" ? v.toString() : v));
      expect(serialized).not.toMatch(/private/i);
      expect(serialized).not.toMatch(/secret/i);
      expect(serialized).not.toMatch(/mnemonic/i);
    });
  });
});
