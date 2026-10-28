import type { PublicClient, Hash } from "viem";
import type { TransactionReceiptRecord, ReceiptStatus } from "./types.js";

export interface VerificationPolicy {
  requiredConfirmations: number;
  maxRetries: number;
  initialBackoffMs: number;
  maxTimeoutMs: number;
}

export const DEFAULT_RECEIPT_POLICY: VerificationPolicy = {
  requiredConfirmations: 1, // On Somnia 10ms block time, 1 confirmation is immediate
  maxRetries: 5,
  initialBackoffMs: 50,
  maxTimeoutMs: 15_000,
};

export class ReceiptVerifier {
  private policy: VerificationPolicy;

  constructor(policy: Partial<VerificationPolicy> = {}) {
    this.policy = { ...DEFAULT_RECEIPT_POLICY, ...policy };
  }

  /**
   * Verifies an EVM transaction receipt from a live Viem client or mock transport.
   * Never reports success for reverted, missing, or timed-out transactions.
   */
  public async verifyTransaction(
    txHash: Hash,
    client?: PublicClient,
    mockReceiptFixture?: Partial<TransactionReceiptRecord>,
  ): Promise<TransactionReceiptRecord> {
    const startTime = Date.now();

    // 1. If fixture provided for testing
    if (mockReceiptFixture) {
      const status = mockReceiptFixture.status ?? "CONFIRMED";
      return {
        transactionHash: txHash,
        blockNumber: mockReceiptFixture.blockNumber ?? 35_000_000n,
        status,
        confirmations: mockReceiptFixture.confirmations ?? 1,
        gasUsed: mockReceiptFixture.gasUsed ?? 150_000n,
        effectiveGasPrice: mockReceiptFixture.effectiveGasPrice ?? 1_000_000_000n,
        revertReason: status === "REVERTED" ? mockReceiptFixture.revertReason || "Execution reverted on-chain" : undefined,
        timestampMs: Date.now(),
      };
    }

    if (!client) {
      return {
        transactionHash: txHash,
        status: "UNKNOWN",
        confirmations: 0,
        revertReason: "No RPC client available for verification",
        timestampMs: Date.now(),
      };
    }

    let retries = 0;
    let backoff = this.policy.initialBackoffMs;

    while (Date.now() - startTime < this.policy.maxTimeoutMs && retries < this.policy.maxRetries) {
      try {
        const receipt = await client.getTransactionReceipt({ hash: txHash }).catch(() => null);

        if (!receipt) {
          retries++;
          await new Promise((r) => setTimeout(r, backoff));
          backoff = Math.min(backoff * 2, 1000);
          continue;
        }

        const latestBlock = await client.getBlockNumber().catch(() => receipt.blockNumber);
        const confirmations = Number(latestBlock - receipt.blockNumber + 1n);

        if (confirmations < this.policy.requiredConfirmations) {
          return {
            transactionHash: txHash,
            blockNumber: receipt.blockNumber,
            status: "PENDING",
            confirmations,
            gasUsed: receipt.gasUsed,
            effectiveGasPrice: receipt.effectiveGasPrice,
            timestampMs: Date.now(),
          };
        }

        if (receipt.status === "reverted") {
          return {
            transactionHash: txHash,
            blockNumber: receipt.blockNumber,
            status: "REVERTED",
            confirmations,
            gasUsed: receipt.gasUsed,
            effectiveGasPrice: receipt.effectiveGasPrice,
            revertReason: "Transaction reverted by EVM on Somnia Hideki",
            timestampMs: Date.now(),
          };
        }

        return {
          transactionHash: txHash,
          blockNumber: receipt.blockNumber,
          status: "CONFIRMED",
          confirmations,
          gasUsed: receipt.gasUsed,
          effectiveGasPrice: receipt.effectiveGasPrice,
          timestampMs: Date.now(),
        };
      } catch (err) {
        retries++;
        await new Promise((r) => setTimeout(r, backoff));
        backoff = Math.min(backoff * 2, 1000);
      }
    }

    // Timeout reached
    return {
      transactionHash: txHash,
      status: "TIMEOUT",
      confirmations: 0,
      revertReason: `Verification timed out after ${this.policy.maxTimeoutMs}ms (${retries} retries)`,
      timestampMs: Date.now(),
    };
  }
}
