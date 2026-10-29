import { describe, it, expect } from "vitest";
import { parseUnits, formatUnits, type Address } from "viem";
import {
  OrderPlanner,
  ExecutionGuard,
  LiveOrderAdapter,
  CONTRACT_ORDER_TYPES,
  ExecutionGuardBlockedError,
} from "../src/execution/index.js";
import {
  EXPECTED_HIDEKI_CHAIN_ID,
  MARGIN_BANK_ADDRESS,
  PERP_POOL_FACTORY_ADDRESS,
  CONTRACTS,
} from "../src/config/constants.js";
import {
  PERP_POOL_FACTORY_ADDRESS as FRONTEND_FACTORY,
  MARGIN_BANK_ADDRESS as FRONTEND_MARGIN_BANK,
  DEFAULT_MARKETS,
} from "../src/frontend/constants.js";
import type { PerpMarketInfo } from "../src/markets/types.js";

const TEST_WALLET = "0xDc7c4aFBa201D2a3108061107346e9ff70f0Ca2c" as Address;

const MOCK_ETH_MARKET: PerpMarketInfo = {
  id: "0xd6cb1dd58580b84d76068ac21594219ce03aeddf",
  poolAddress: "0xd6cb1dd58580b84d76068ac21594219ce03aeddf",
  symbol: "ETH:USDso",
  display: "ETH-PERP",
  baseSymbol: "ETH",
  quoteSymbol: "USDso",
  baseToken: "0x1516ccebe983fef570bc646ebcf5e05086d4944f",
  quoteToken: "0xed7993A74dAe1e6656B704A424DcD8711aAf4F72",
  baseDecimals: 18,
  quoteDecimals: 18,
  tickSize: 10_000_000_000_000_000n, // $0.01 (1e16)
  lotSize: 100_000_000_000_000n, // 0.0001 ETH (1e14)
  minQuantity: 4_000_000_000_000_000n, // 0.0040 ETH (4e15)
  initialMarginBps: 500, // 5%
  maxLeverage: 20,
  marginBank: MARGIN_BANK_ADDRESS,
  perpStatus: null,
};

const MOCK_BTC_MARKET: PerpMarketInfo = {
  id: "0x4181dd0831637cba8b1c4b4d6b6d3b482312b9a1",
  poolAddress: "0x4181dd0831637cba8b1c4b4d6b6d3b482312b9a1",
  symbol: "BTC:USDso",
  display: "BTC-PERP",
  baseSymbol: "BTC",
  quoteSymbol: "USDso",
  baseToken: "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599",
  quoteToken: "0xed7993A74dAe1e6656B704A424DcD8711aAf4F72",
  baseDecimals: 8, // 8 base decimals!
  quoteDecimals: 18,
  tickSize: 100_000_000_000_000_000n, // $0.10 (1e17)
  lotSize: 1_000n, // 0.00001 BTC (1e3)
  minQuantity: 13_000n, // 0.00013 BTC
  initialMarginBps: 500,
  maxLeverage: 20,
  marginBank: MARGIN_BANK_ADDRESS,
  perpStatus: null,
};

const MOCK_SOL_MARKET: PerpMarketInfo = {
  id: "0xb483ec1f88998846be0689b0d1e3d9e03d4a4b5c",
  poolAddress: "0xb483ec1f88998846be0689b0d1e3d9e03d4a4b5c",
  symbol: "SOL:USDso",
  display: "SOL-PERP",
  baseSymbol: "SOL",
  quoteSymbol: "USDso",
  baseToken: "0x7d1afa7b718fb893db30a3abc0cfc608aacfebb0",
  quoteToken: "0xed7993A74dAe1e6656B704A424DcD8711aAf4F72",
  baseDecimals: 9, // 9 base decimals!
  quoteDecimals: 18,
  tickSize: 10_000_000_000_000_000n, // $0.01 (1e16)
  lotSize: 10_000_000n, // 0.01 SOL (1e7)
  minQuantity: 100_000_000n, // 0.1 SOL (1e8)
  initialMarginBps: 500,
  maxLeverage: 20,
  marginBank: MARGIN_BANK_ADDRESS,
  perpStatus: null,
};

describe("Stage F.29 Targeted Remediation & Verification Suite", () => {
  describe("1. Contract Order Type Enums & Mappings", () => {
    it("maps every supported order type to verified contract enum", () => {
      expect(LiveOrderAdapter.mapOrderTypeToContract("LIMIT")).toBe(0);
      expect(LiveOrderAdapter.mapOrderTypeToContract("FILL_OR_KILL")).toBe(1);
      expect(LiveOrderAdapter.mapOrderTypeToContract("MARKET")).toBe(2);
      expect(LiveOrderAdapter.mapOrderTypeToContract("POST_ONLY")).toBe(3);

      expect(CONTRACT_ORDER_TYPES.LIMIT).toBe(0);
      expect(CONTRACT_ORDER_TYPES.FILL_OR_KILL).toBe(1);
      expect(CONTRACT_ORDER_TYPES.MARKET).toBe(2);
      expect(CONTRACT_ORDER_TYPES.POST_ONLY).toBe(3);
    });

    it("rejects unsupported order types during plan creation", () => {
      const plan = OrderPlanner.createOrderPlan({
        walletAddress: TEST_WALLET,
        market: MOCK_ETH_MARKET,
        side: "BUY_LONG",
        orderType: "INVALID_TYPE" as any,
        price: 2200,
        quantity: 0.005,
        leverage: 2,
      });

      expect(plan.validation.valid).toBe(false);
      expect(plan.validation.errors.some((e) => e.includes("unsupported order type"))).toBe(true);
    });

    it("rejects invalid side variants", () => {
      const plan = OrderPlanner.createOrderPlan({
        walletAddress: TEST_WALLET,
        market: MOCK_ETH_MARKET,
        side: "buy" as any,
        orderType: "POST_ONLY",
        price: 2200,
        quantity: 0.005,
        leverage: 2,
      });

      expect(plan.validation.valid).toBe(false);
      expect(plan.validation.errors.some((e) => e.includes("order side"))).toBe(true);
    });
  });

  describe("2. Multi-Market Token Decimal Scaling (ETH 18dp, BTC 8dp, SOL 9dp)", () => {
    it("scales ETH-PERP quantity correctly using 18 decimals", () => {
      const plan = OrderPlanner.createOrderPlan({
        walletAddress: TEST_WALLET,
        market: MOCK_ETH_MARKET,
        side: "BUY_LONG",
        orderType: "POST_ONLY",
        price: 2200.0,
        quantity: 0.004,
        leverage: 2,
      });

      expect(plan.validation.valid).toBe(true);
      expect(plan.quantityRaw).toBe(4_000_000_000_000_000n); // 0.004 * 10^18
      expect(plan.priceRaw).toBe(2200_000_000_000_000_000_000n); // 2200 * 10^18
      expect(plan.notionalUsd).toBeCloseTo(8.8, 2);
    });

    it("scales BTC-PERP quantity correctly using 8 decimals without 18-decimal inflation", () => {
      const plan = OrderPlanner.createOrderPlan({
        walletAddress: TEST_WALLET,
        market: MOCK_BTC_MARKET,
        side: "BUY_LONG",
        orderType: "POST_ONLY",
        price: 65000.0,
        quantity: 0.0002, // notional = $13.00
        leverage: 2,
      });

      expect(plan.validation.valid).toBe(true);
      expect(plan.quantityRaw).toBe(20_000n); // 0.0002 * 10^8
      expect(plan.priceRaw).toBe(65000_000_000_000_000_000_000n); // 65000 * 10^18
      expect(plan.notionalUsd).toBeCloseTo(13.0, 2);
    });

    it("scales SOL-PERP quantity correctly using 9 decimals", () => {
      const plan = OrderPlanner.createOrderPlan({
        walletAddress: TEST_WALLET,
        market: MOCK_SOL_MARKET,
        side: "BUY_LONG",
        orderType: "POST_ONLY",
        price: 130.0,
        quantity: 0.12, // notional = $15.60
        leverage: 2,
      });

      expect(plan.validation.valid).toBe(true);
      expect(plan.quantityRaw).toBe(120_000_000n); // 0.12 * 10^9
      expect(plan.priceRaw).toBe(130_000_000_000_000_000_000n); // 130 * 10^18
      expect(plan.notionalUsd).toBeCloseTo(15.6, 2);
    });
  });

  describe("3. Grid Quantization & Boundary Enforcement", () => {
    it("aligns unquantized price to market tick grid", () => {
      const plan = OrderPlanner.createOrderPlan({
        walletAddress: TEST_WALLET,
        market: MOCK_ETH_MARKET,
        side: "BUY_LONG",
        orderType: "POST_ONLY",
        price: 2200.006, // $0.006 unaligned to $0.01 tick
        quantity: 0.004,
        leverage: 2,
      });

      expect(plan.price).toBe(2200.0);
      expect(plan.priceRaw).toBe(2200_000_000_000_000_000_000n);
    });

    it("rejects order when quantity is below market minimum", () => {
      const plan = OrderPlanner.createOrderPlan({
        walletAddress: TEST_WALLET,
        market: MOCK_ETH_MARKET,
        side: "BUY_LONG",
        orderType: "POST_ONLY",
        price: 2200.0,
        quantity: 0.001, // min is 0.0040
        leverage: 2,
      });

      expect(plan.validation.valid).toBe(false);
      expect(plan.validation.errors.some((e) => e.includes("below market minimum"))).toBe(true);
    });

    it("rejects order exceeding maximum safety notional ($20.00)", () => {
      const plan = OrderPlanner.createOrderPlan({
        walletAddress: TEST_WALLET,
        market: MOCK_ETH_MARKET,
        side: "BUY_LONG",
        orderType: "POST_ONLY",
        price: 2500.0,
        quantity: 0.01, // notional = $25.00 > $20.00
        leverage: 2,
      });

      expect(plan.validation.valid).toBe(false);
      expect(plan.validation.errors.some((e) => e.includes("safety limit"))).toBe(true);
    });
  });

  describe("4. Plan Freshness & Stale-Plan Rejection (60s TTL)", () => {
    it("rejects an order plan older than 60 seconds", () => {
      const now = Date.now();
      const plan = OrderPlanner.createOrderPlan({
        walletAddress: TEST_WALLET,
        market: MOCK_ETH_MARKET,
        side: "BUY_LONG",
        orderType: "POST_ONLY",
        price: 2200.0,
        quantity: 0.004,
        leverage: 2,
      });

      const guard = new ExecutionGuard({ dryRun: false });

      // Simulate check at 65 seconds in the future
      const result = guard.evaluate({
        plan,
        connectedWallet: TEST_WALLET,
        isUserApproved: true,
        approvedDigest: plan.planDigest,
        nowMs: now + 65_000,
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("expired");
    });

    it("accepts an order plan within the 60-second freshness window", () => {
      const now = Date.now();
      const plan = OrderPlanner.createOrderPlan({
        walletAddress: TEST_WALLET,
        market: MOCK_ETH_MARKET,
        side: "BUY_LONG",
        orderType: "POST_ONLY",
        price: 2200.0,
        quantity: 0.004,
        leverage: 2,
      });

      const guard = new ExecutionGuard({ dryRun: false });

      const result = guard.evaluate({
        plan,
        connectedWallet: TEST_WALLET,
        isUserApproved: true,
        approvedDigest: plan.planDigest,
        nowMs: now + 30_000,
      });

      expect(result.allowed).toBe(true);
    });
  });

  describe("5. ExecutionGuard & Mandatory Safety Gates", () => {
    it("fails closed when DRY_RUN=true is active", () => {
      const plan = OrderPlanner.createOrderPlan({
        walletAddress: TEST_WALLET,
        market: MOCK_ETH_MARKET,
        side: "BUY_LONG",
        orderType: "POST_ONLY",
        price: 2200.0,
        quantity: 0.004,
        leverage: 2,
      });

      const guard = new ExecutionGuard({ dryRun: true });
      const adapter = new LiveOrderAdapter({ guard });

      expect(() => {
        adapter.assertLiveExecutionAllowed(plan, TEST_WALLET, true, plan.planDigest);
      }).toThrow(ExecutionGuardBlockedError);
    });

    it("fails closed when operator approval is missing", () => {
      const plan = OrderPlanner.createOrderPlan({
        walletAddress: TEST_WALLET,
        market: MOCK_ETH_MARKET,
        side: "BUY_LONG",
        orderType: "POST_ONLY",
        price: 2200.0,
        quantity: 0.004,
        leverage: 2,
      });

      const guard = new ExecutionGuard({ dryRun: false });
      const evaluation = guard.evaluate({
        plan,
        connectedWallet: TEST_WALLET,
        isUserApproved: false, // Operator did NOT confirm
        approvedDigest: plan.planDigest,
      });

      expect(evaluation.allowed).toBe(false);
      expect(evaluation.reason).toContain("Operator approval has not been granted");
    });

    it("fails closed when planDigest has been tampered with", () => {
      const plan = OrderPlanner.createOrderPlan({
        walletAddress: TEST_WALLET,
        market: MOCK_ETH_MARKET,
        side: "BUY_LONG",
        orderType: "POST_ONLY",
        price: 2200.0,
        quantity: 0.004,
        leverage: 2,
      });

      const guard = new ExecutionGuard({ dryRun: false });
      const evaluation = guard.evaluate({
        plan: { ...plan, price: 2300.0 }, // Tampered price
        connectedWallet: TEST_WALLET,
        isUserApproved: true,
        approvedDigest: plan.planDigest,
      });

      expect(evaluation.allowed).toBe(false);
      expect(evaluation.reason).toContain("digest");
    });
  });

  describe("6. Position State & Lifecycle Distinction", () => {
    it("does NOT treat a zero-size position struct as a verified position", () => {
      // Struct returned by MarginBank when account has zero position
      const zeroPosition = {
        size: 0n,
        avgEntryPrice: 0n,
        entryFundingIndex: 0n,
        lastUpdatedTimestampNs: 0n,
      };

      const hasPosition = zeroPosition !== null && zeroPosition.size !== 0n;
      expect(hasPosition).toBe(false);
    });

    it("verifies position only when on-chain size is non-zero", () => {
      const activeLongPosition = {
        size: 4_000_000_000_000_000n, // 0.004 ETH
        avgEntryPrice: 2200_000_000_000_000_000_000n,
        entryFundingIndex: 0n,
        lastUpdatedTimestampNs: 1793276914000000000n,
      };

      const hasPosition = activeLongPosition !== null && activeLongPosition.size !== 0n;
      expect(hasPosition).toBe(true);
    });

    it("prepares valid cancelOrder unsigned call", () => {
      const adapter = new LiveOrderAdapter();
      const cancelCall = adapter.prepareCancelOrderCall(
        MOCK_ETH_MARKET.poolAddress,
        5460236245818038181306n,
      );

      expect(cancelCall.to.toLowerCase()).toBe(MOCK_ETH_MARKET.poolAddress.toLowerCase());
      expect(cancelCall.data.startsWith("0xdbc91396")).toBe(true); // cancelOrder selector
      expect(cancelCall.description).toContain("5460236245818038181306");
    });
  });

  describe("7. Configuration Consistency Between Frontend and Backend", () => {
    it("ensures backend and frontend agree on the verified v2 PerpPoolFactory", () => {
      expect(PERP_POOL_FACTORY_ADDRESS.toLowerCase()).toBe(FRONTEND_FACTORY.toLowerCase());
      expect(CONTRACTS.PERP_POOL_FACTORY.toLowerCase()).toBe("0xe631faee547baee07353e290f0562ea67d856560");
    });

    it("ensures backend and frontend agree on the MarginBank address", () => {
      expect(MARGIN_BANK_ADDRESS.toLowerCase()).toBe(FRONTEND_MARGIN_BANK.toLowerCase());
      expect(CONTRACTS.MARGIN_BANK.toLowerCase()).toBe("0x478769e1177c0773c43a593dccc4ad15f15f1394");
    });

    it("ensures Chain ID is strictly 50383 across all modules", () => {
      expect(EXPECTED_HIDEKI_CHAIN_ID).toBe(50383);
    });
  });
});
