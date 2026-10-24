import { describe, it, expect } from "vitest";
import {
  alignPrice,
  alignQuantity,
  validateOrderPrecision,
  calculateNotionalUsdso,
  calculateQuantityForNotional,
  parseBaseQuantity,
  formatBaseQuantity,
  parseQuotePrice,
  formatQuotePrice,
} from "../src/markets/precision.js";
import type { PerpMarketInfo } from "../src/markets/types.js";

describe("Precision & Decimal Calculations (Unit Tests)", () => {
  const mockEthMarket: PerpMarketInfo = {
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
    tickSize: 10000000000000000n, // 0.01 USDso
    lotSize: 100000000000000n, // 0.0001 ETH
    minQuantity: 4000000000000000n, // 0.004 ETH
    initialMarginBps: 500,
    maxLeverage: 20,
    marginBank: "0x478769e1177c0773c43a593dccc4ad15f15f1394",
    perpStatus: null,
  };

  const mockSolMarket: PerpMarketInfo = {
    id: "0xb483ec1fb34996638677c20ab087b16f1896fa53",
    poolAddress: "0xb483ec1fb34996638677c20ab087b16f1896fa53",
    symbol: "SOL:USDso",
    display: "SOL-PERP",
    baseSymbol: "SOL",
    quoteSymbol: "USDso",
    baseToken: "0x2f0a4ec77767a18acdffb91e6f148e9f75090edd",
    quoteToken: "0xed7993a74dae1e6656b704a424dcd8711aaf4f72",
    baseDecimals: 9, // SOL is 9 decimals!
    quoteDecimals: 18,
    tickSize: 10000000000000000n, // 0.01 USDso
    lotSize: 10000000n, // 0.01 SOL (in 9 decimals)
    minQuantity: 100000000n, // 0.1 SOL (in 9 decimals)
    initialMarginBps: 500,
    maxLeverage: 20,
    marginBank: "0x478769e1177c0773c43a593dccc4ad15f15f1394",
    perpStatus: null,
  };

  const mockBtcMarket: PerpMarketInfo = {
    id: "0x4181dd08e73bbcdd1ba3e615a18f6abd941b94c0",
    poolAddress: "0x4181dd08e73bbcdd1ba3e615a18f6abd941b94c0",
    symbol: "BTC:USDso",
    display: "BTC-PERP",
    baseSymbol: "BTC",
    quoteSymbol: "USDso",
    baseToken: "0x96502b917e86e5b65bfb3456b73b8e10e7e8fe8a",
    quoteToken: "0xed7993a74dae1e6656b704a424dcd8711aaf4f72",
    baseDecimals: 8, // BTC is 8 decimals!
    quoteDecimals: 18,
    tickSize: 100000000000000000n, // 0.1 USDso
    lotSize: 1000n, // 0.00001 BTC (8 decimals)
    minQuantity: 13000n, // 0.00013 BTC (8 decimals)
    initialMarginBps: 500,
    maxLeverage: 20,
    marginBank: "0x478769e1177c0773c43a593dccc4ad15f15f1394",
    perpStatus: null,
  };

  it("aligns price to tick size correctly", () => {
    const rawPrice = 2450_555_000_000_000_000_000n; // 2450.555 USDso
    const aligned = alignPrice(rawPrice, mockEthMarket.tickSize);
    expect(aligned).toBe(2450_550_000_000_000_000_000n); // 2450.55 USDso
  });

  it("aligns quantity to lot size correctly across different decimals", () => {
    // ETH (18 decimals): wanted 0.00456 ETH -> aligned to 0.0045 ETH
    const wantedEth = parseBaseQuantity("0.00456", 18);
    const alignedEth = alignQuantity(wantedEth, mockEthMarket.lotSize);
    expect(formatBaseQuantity(alignedEth, 18)).toBe("0.0045");

    // SOL (9 decimals): wanted 0.125 SOL -> aligned to 0.12 SOL (lot: 0.01)
    const wantedSol = parseBaseQuantity("0.125", 9);
    const alignedSol = alignQuantity(wantedSol, mockSolMarket.lotSize);
    expect(formatBaseQuantity(alignedSol, 9)).toBe("0.12");
  });

  it("validates compliant price and quantity", () => {
    const price = parseQuotePrice("2400.50"); // aligned to 0.01 tick
    const quantity = parseBaseQuantity("0.01", 18); // 0.01 ETH > 0.004 min
    const res = validateOrderPrecision(price, quantity, mockEthMarket);
    expect(res.valid).toBe(true);
  });

  it("rejects non-positive price and quantity", () => {
    expect(validateOrderPrecision(0n, 1000n, mockEthMarket).valid).toBe(false);
    expect(validateOrderPrecision(1000n, 0n, mockEthMarket).valid).toBe(false);
    expect(validateOrderPrecision(-10n, 1000n, mockEthMarket).valid).toBe(false);
  });

  it("rejects unaligned tick size", () => {
    const unalignedPrice = 2400_505_000_000_000_000_000n; // 2400.505 USDso
    const quantity = parseBaseQuantity("0.01", 18);
    const res = validateOrderPrecision(unalignedPrice, quantity, mockEthMarket);
    expect(res.valid).toBe(false);
    expect(res.error).toContain("not aligned to tick size");
    expect(res.alignedPrice).toBe(2400_500_000_000_000_000_000n);
  });

  it("rejects unaligned lot size", () => {
    const price = parseQuotePrice("2400.50");
    const unalignedQty = 4000000000000050n; // not a multiple of 0.0001 (100000000000000n)
    const res = validateOrderPrecision(price, unalignedQty, mockEthMarket);
    expect(res.valid).toBe(false);
    expect(res.error).toContain("not aligned to lot size");
  });

  it("rejects quantity below minQuantity", () => {
    const price = parseQuotePrice("2400.50");
    const tinyQty = parseBaseQuantity("0.002", 18); // min is 0.004 ETH
    const res = validateOrderPrecision(price, tinyQty, mockEthMarket);
    expect(res.valid).toBe(false);
    expect(res.error).toContain("below minimum allowed order size");
  });

  it("correctly calculates USDso notional across decimal scales", () => {
    // ETH (18 decimals): 0.5 ETH at $2,000 = $1,000 USDso
    const ethPrice = parseQuotePrice("2000");
    const ethQty = parseBaseQuantity("0.5", 18);
    const ethNotional = calculateNotionalUsdso(ethPrice, ethQty, 18);
    expect(formatQuotePrice(ethNotional)).toBe("1000");

    // SOL (9 decimals): 10 SOL at $100 = $1,000 USDso
    const solPrice = parseQuotePrice("100");
    const solQty = parseBaseQuantity("10", 9);
    const solNotional = calculateNotionalUsdso(solPrice, solQty, 9);
    expect(formatQuotePrice(solNotional)).toBe("1000");

    // BTC (8 decimals): 0.1 BTC at $80,000 = $8,000 USDso
    const btcPrice = parseQuotePrice("80000");
    const btcQty = parseBaseQuantity("0.1", 8);
    const btcNotional = calculateNotionalUsdso(btcPrice, btcQty, 8);
    expect(formatQuotePrice(btcNotional)).toBe("8000");
  });

  it("calculates quantity for target notional and respects minimums", () => {
    const targetNotionalX18 = parseQuotePrice("50"); // 50 USDso
    const ethPrice = parseQuotePrice("2500"); // $2,500
    // Expected: 50 / 2500 = 0.02 ETH
    const sizing = calculateQuantityForNotional(targetNotionalX18, ethPrice, mockEthMarket);
    expect(sizing.valid).toBe(true);
    expect(formatBaseQuantity(sizing.quantity, 18)).toBe("0.02");

    // Below minimum test: 1 USDso notional at $2500 -> 0.0004 ETH < 0.004 minQuantity
    const tinyNotional = parseQuotePrice("1");
    const tinySizing = calculateQuantityForNotional(tinyNotional, ethPrice, mockEthMarket);
    expect(tinySizing.valid).toBe(false);
    expect(tinySizing.reason).toContain("below minQuantity");
  });
});
