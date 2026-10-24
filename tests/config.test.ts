import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadConfig, getSanitizedConfig, ConfigValidationError, EXPECTED_HIDEKI_CHAIN_ID } from "../src/config/index.js";

describe("Configuration Module (Unit Tests)", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("loads valid default configuration for Somnia Hideki Testnet", () => {
    delete process.env.CHAIN_ID;
    delete process.env.RPC_URL;
    delete process.env.WS_RPC_URL;

    const config = loadConfig();
    expect(config.chainId).toBe(EXPECTED_HIDEKI_CHAIN_ID);
    expect(config.network).toBe("hideki");
    expect(config.dryRun).toBe(true);
    expect(config.symbol).toBe("ETH-PERP");
    expect(config.perpSide).toBe("long");
  });

  it("fails closed on mismatched CHAIN_ID", () => {
    process.env.CHAIN_ID = "1"; // Mainnet Ethereum ID
    expect(() => loadConfig()).toThrow(ConfigValidationError);
    expect(() => loadConfig()).toThrow(/Invalid CHAIN_ID/);
  });

  it("fails closed on non-numeric CHAIN_ID", () => {
    process.env.CHAIN_ID = "somnia-hideki";
    expect(() => loadConfig()).toThrow(ConfigValidationError);
  });

  it("fails closed on malformed RPC_URL", () => {
    process.env.RPC_URL = "ftp://invalid-rpc-host";
    expect(() => loadConfig()).toThrow(ConfigValidationError);
    expect(() => loadConfig()).toThrow(/Invalid RPC_URL/);
  });

  it("fails closed on malformed WS_RPC_URL", () => {
    process.env.WS_RPC_URL = "http://invalid-ws-host";
    expect(() => loadConfig()).toThrow(ConfigValidationError);
    expect(() => loadConfig()).toThrow(/Invalid WS_RPC_URL/);
  });

  it("fails closed on invalid PERP_SIDE", () => {
    process.env.PERP_SIDE = "sideways";
    expect(() => loadConfig()).toThrow(ConfigValidationError);
    expect(() => loadConfig()).toThrow(/Invalid PERP_SIDE/);
  });

  it("sanitized config never exposes private keys or raw secrets", () => {
    process.env.PRIVATE_KEY = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
    const config = loadConfig();
    const sanitized = getSanitizedConfig(config);

    expect(sanitized).not.toHaveProperty("privateKey");
    expect(sanitized).not.toHaveProperty("PRIVATE_KEY");
    expect(sanitized.hasPrivateKey).toBe(true);
    expect(JSON.stringify(sanitized)).not.toContain("1234567890abcdef");
  });
});
