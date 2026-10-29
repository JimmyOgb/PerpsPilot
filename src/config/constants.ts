/**
 * PerpsPilot Network & Protocol Constants
 * Pure constants module safe for both Node.js runtimes and browser environments.
 * Free of Node.js-only dependencies like dotenv, fs, or path.
 */

/** Verified Somnia Hideki Testnet Chain ID */
export const EXPECTED_HIDEKI_CHAIN_ID = 50383;

/** Default Official Hideki v2 Endpoints */
export const DEFAULT_HIDEKI_RPC_URL = "https://api.hideki2.infra.testnet.somnia.network";
export const DEFAULT_HIDEKI_WS_RPC_URL = "wss://api.hideki2.infra.testnet.somnia.network/ws";
export const DEFAULT_SOMNIA_INDEXER_URL = "https://hideki-dev.smk.somnia.host/v1/graphql";

/** Authoritative On-Chain Contract Addresses on Somnia Hideki v2 Testnet */
export const MARGIN_BANK_ADDRESS: `0x${string}` = "0x478769E1177C0773c43A593DCCc4Ad15F15F1394";
export const PERP_POOL_FACTORY_ADDRESS: `0x${string}` = "0xE631fAEE547baeE07353E290f0562ea67d856560";
export const ETH_PERP_POOL: `0x${string}` = "0xd6cb1dd58580b84d76068ac21594219ce03aeddf";
export const USDSO_TOKEN_ADDRESS: `0x${string}` = "0xed7993A74dAe1e6656B704A424DcD8711aAf4F72";

export const CONTRACTS = {
  MARGIN_BANK: MARGIN_BANK_ADDRESS,
  PERP_POOL_FACTORY: PERP_POOL_FACTORY_ADDRESS,
  ETH_PERP_POOL: "0xd6cb1dd58580b84d76068ac21594219ce03aeddf" as `0x${string}`,
  USDSO_TOKEN: USDSO_TOKEN_ADDRESS,
} as const;
