import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { privateKeyToAccount } from "viem/accounts";

describe("Account Preflight Logic (Unit Tests)", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("safely derives public address from private key without exposing raw key", () => {
    const dummyKey = "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef" as const;
    process.env.PRIVATE_KEY = dummyKey;

    const account = privateKeyToAccount(dummyKey);
    expect(account.address).toBeDefined();
    expect(account.address.startsWith("0x")).toBe(true);
    expect(account.address.length).toBe(42);
    // Ensure the derived address does not equal the private key
    expect(account.address).not.toBe(dummyKey);
  });

  it("correctly identifies unconfigured signer state", () => {
    delete process.env.PRIVATE_KEY;
    const envObj = process.env as Record<string, string | undefined>;
    const keyVal = envObj.PRIVATE_KEY;
    const hasKey = typeof keyVal === "string" && keyVal.trim().length > 0;
    expect(hasKey).toBe(false);
  });
});
