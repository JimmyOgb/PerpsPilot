/**
 * PerpsPilot Network Interface
 * Handles Viem public clients, connectivity verification, and SomniaMarkets SDK initialization
 * targeting the Somnia Hideki Testnet (Tokyo v2, Chain ID 50383).
 */

import { createPublicClient, http, type Hex, type PublicClient } from "viem";
import { hidekiTestnet } from "@somnia-chain/markets-sdk/chains";
import { SomniaMarkets, SOMNIA_HIDEKI_TESTNET_ADDRESSES } from "@somnia-chain/markets-sdk";
import { EXPECTED_HIDEKI_CHAIN_ID, DEFAULT_HIDEKI_RPC_URL, DEFAULT_HIDEKI_WS_RPC_URL, DEFAULT_SOMNIA_INDEXER_URL } from "../config/index.js";

export interface NetworkStatus {
  connected: boolean;
  chainId: number;
  blockNumber: bigint;
  rpcUrl: string;
}

export class NetworkMismatchError extends Error {
  constructor(expected: number, actual: number) {
    super(`[NetworkMismatchError] Connected chain ID ${actual} does not match expected chain ID ${expected}`);
    this.name = "NetworkMismatchError";
  }
}

/**
 * Creates a viem PublicClient bound to the official Hideki testnet chain definition.
 */
export function getPublicClient(rpcUrl: string = DEFAULT_HIDEKI_RPC_URL): PublicClient {
  return createPublicClient({
    chain: hidekiTestnet,
    transport: http(rpcUrl),
  }) as PublicClient;
}

/**
 * Verifies live RPC connectivity and asserts that the remote node's chainId equals 50383.
 * Fails closed if the node reports an incorrect chain ID.
 */
export async function verifyChainConnectivity(
  client: PublicClient,
  rpcUrl: string = DEFAULT_HIDEKI_RPC_URL,
): Promise<NetworkStatus> {
  const chainId = await client.getChainId();

  if (chainId !== EXPECTED_HIDEKI_CHAIN_ID) {
    throw new NetworkMismatchError(EXPECTED_HIDEKI_CHAIN_ID, chainId);
  }

  const blockNumber = await client.getBlockNumber();

  return {
    connected: true,
    chainId,
    blockNumber,
    rpcUrl,
  };
}

export interface SomniaExchangeOptions {
  rpcUrl?: string;
  wsRpcUrl?: string;
  indexerUrl?: string;
  privateKey?: Hex;
}

/**
 * Initializes the official SomniaMarkets SDK exchange client configured with
 * verified Hideki testnet addresses and chain definitions.
 */
export function createSomniaMarketsExchange(options: SomniaExchangeOptions = {}): SomniaMarkets {
  const wsRpcUrl = options.wsRpcUrl || DEFAULT_HIDEKI_WS_RPC_URL;
  const indexerUrl = options.indexerUrl || DEFAULT_SOMNIA_INDEXER_URL;

  return new SomniaMarkets({
    chain: hidekiTestnet,
    wsRpcUrl,
    indexerUrl,
    addresses: SOMNIA_HIDEKI_TESTNET_ADDRESSES,
    privateKey: options.privateKey,
  });
}
