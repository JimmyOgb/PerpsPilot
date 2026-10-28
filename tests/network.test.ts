import { describe, it, expect } from "vitest";
import { getPublicClient, verifyChainConnectivity } from "../src/network/client.js";
import { discoverPerpMarkets, findMarketBySymbol } from "../src/markets/discovery.js";
import { checkMarketHealth } from "../src/risk/validation.js";
import { EXPECTED_HIDEKI_CHAIN_ID, DEFAULT_HIDEKI_RPC_URL } from "../src/config/index.js";

/**
 * LIVE READ-ONLY NETWORK INTEGRATION TESTS
 * These tests connect directly to the Somnia Hideki Testnet (Tokyo v2)
 * to verify actual live RPC responsiveness, chainId confirmation, and on-chain oracle data.
 * Under NO circumstances do these tests submit transactions, spend funds, or modify state.
 */
describe("Live Read-Only Network & Market Integration Tests", () => {
  const client = getPublicClient(DEFAULT_HIDEKI_RPC_URL);

  it("verifies live RPC connection and asserts chain ID 50383", async () => {
    const netStatus = await verifyChainConnectivity(client, DEFAULT_HIDEKI_RPC_URL);
    expect(netStatus.connected).toBe(true);
    expect(netStatus.chainId).toBe(EXPECTED_HIDEKI_CHAIN_ID);
    expect(netStatus.blockNumber).toBeGreaterThan(30_000_000n);
  }, 60000);

  it("discovers live perpetual markets from Hideki v2 factory", async () => {
    const result = await discoverPerpMarkets();
    expect(result.markets.length).toBeGreaterThan(0);

    const ethMarket = findMarketBySymbol(result.markets, "ETH");
    expect(ethMarket).toBeDefined();
    expect(ethMarket?.baseSymbol).toBe("ETH");
    expect(ethMarket?.quoteSymbol).toBe("USDSO");
    expect(ethMarket?.baseDecimals).toBe(18);
    expect(ethMarket?.quoteDecimals).toBe(18);

    const btcMarket = findMarketBySymbol(result.markets, "BTC");
    expect(btcMarket).toBeDefined();
    expect(btcMarket?.baseSymbol).toBe("BTC");
    expect(btcMarket?.baseDecimals).toBe(8);
  }, 45000);

  it("verifies oracle health snapshot is priceable for live ETH-PERP pool", async () => {
    const result = await discoverPerpMarkets();
    const ethMarket = findMarketBySymbol(result.markets, "ETH");
    expect(ethMarket).toBeDefined();

    const health = await checkMarketHealth(ethMarket!.poolAddress, client);
    expect(health.priceable).toBe(true);
    expect(health.markPrice).toBeDefined();
    expect(health.markPrice!).toBeGreaterThan(0n);
  }, 45000);
});
