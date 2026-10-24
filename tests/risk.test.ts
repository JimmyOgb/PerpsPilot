import { describe, it, expect, vi } from "vitest";
import {
  explainLimitingConstraint,
  checkMarketHealth,
  queryAuthoritativeMaxOrderSize,
} from "../src/risk/validation.js";
import type { PerpMarketInfo } from "../src/markets/types.js";
import type { SomniaMarkets } from "@somnia-chain/markets-sdk";
import type { PublicClient } from "viem";

describe("Risk & Pre-Flight Validation (Unit Tests)", () => {
  const mockMarket: PerpMarketInfo = {
    id: "0xd6cb1dd58580b84d76068ac21594219ce03aeddf",
    poolAddress: "0xd6cb1dd58580b84d76068ac21594219ce03aeddf",
    symbol: "ETH:USDso",
    display: "ETH-PERP",
    baseSymbol: "ETH",
    quoteSymbol: "USDso",
    baseToken: "0x1516ccebca301d0651bc27dcdf9b1c2f18c3b4cd",
    quoteToken: "0xed7993a74dae1e6656b704a424dcd8711aaf4f72",
    baseDecimals: 18,
    quoteDecimals: 18,
    tickSize: 10000000000000000n,
    lotSize: 100000000000000n,
    minQuantity: 4000000000000000n,
    initialMarginBps: 500,
    maxLeverage: 20,
    marginBank: "0x478769e1177c0773c43a593dccc4ad15f15f1394",
    perpStatus: null,
  };

  it("explains all authoritative SDK limiting constraints clearly", () => {
    expect(explainLimitingConstraint("voucherBlocked")).toContain("competition voucher credit");
    expect(explainLimitingConstraint("restricted")).toContain("ReduceOnly mode");
    expect(explainLimitingConstraint("isolated")).toContain("Isolated margin constraint");
    expect(explainLimitingConstraint("walletBalance")).toContain("Insufficient USDso in wallet");
    expect(explainLimitingConstraint("walletAllowance")).toContain("allowance to MarginBank is insufficient");
    expect(explainLimitingConstraint("insufficientMargin")).toContain("collateral in MarginBank cannot support");
    expect(explainLimitingConstraint("unknownCode")).toContain("Order rejected by risk engine");
  });

  it("fails closed when tryGetHealthSnapshot returns ok=false (stale price)", async () => {
    const mockClient = {
      getBlockNumber: vi.fn().mockResolvedValue(1000000n),
      readContract: vi.fn().mockResolvedValue([false, { markPrice: 0n }]),
    } as unknown as PublicClient;

    const health = await checkMarketHealth(mockMarket.poolAddress, mockClient);
    expect(health.priceable).toBe(false);
    expect(health.reason).toContain("Oracle mark price is stale or unpriceable");
  });

  it("passes when tryGetHealthSnapshot returns ok=true with valid mark price", async () => {
    const mockClient = {
      getBlockNumber: vi.fn().mockResolvedValue(1000000n),
      readContract: vi.fn().mockResolvedValue([
        true,
        {
          oneBase: 1000000000000000000n,
          markPrice: 2400000000000000000000n,
          projectedCumulativeFunding: 0n,
          effectiveIMFBps: 500n,
        },
      ]),
    } as unknown as PublicClient;

    const health = await checkMarketHealth(mockMarket.poolAddress, mockClient);
    expect(health.priceable).toBe(true);
    expect(health.markPrice).toBe(2400000000000000000000n);
  });

  it("queryAuthoritativeMaxOrderSize rejects non-positive price", async () => {
    const mockExchange = {} as SomniaMarkets;
    const res = await queryAuthoritativeMaxOrderSize(mockExchange, {
      market: mockMarket,
      account: "0x1111111111111111111111111111111111111111",
      isBid: true,
      price: 0n,
      requestedQuantity: 100000000000000000n,
    });
    expect(res.allowed).toBe(false);
    expect(res.reason).toContain("Price must be strictly positive");
  });

  it("queryAuthoritativeMaxOrderSize clamps to maxQuantity and respects placeable flag", async () => {
    const mockExchange = {
      client: {
        getMaxPerpOrderSize: vi.fn().mockResolvedValue({
          priceable: true,
          placeable: true,
          maxQuantity: 10000000000000000n, // 0.01 ETH max
          limitedBy: undefined,
          effectiveImfBps: 500n,
        }),
      },
    } as unknown as SomniaMarkets;

    // Request 0.05 ETH (exceeds 0.01 ETH ceiling)
    const res = await queryAuthoritativeMaxOrderSize(mockExchange, {
      market: mockMarket,
      account: "0x1111111111111111111111111111111111111111",
      isBid: true,
      price: 2400000000000000000000n,
      requestedQuantity: 50000000000000000n,
    });

    expect(res.allowed).toBe(true);
    expect(res.maxQuantity).toBe(10000000000000000n);
    expect(res.effectiveQuantity).toBe(10000000000000000n); // clamped to max
  });
});
