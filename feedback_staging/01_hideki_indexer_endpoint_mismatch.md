# SDK Captures Chain Mismatch Error Silently on Hideki (50383) When Configured With Common Testnet Indexer (50312), Returning Zero Markets
Severity: major
Area: SDK | docs

## Steps to reproduce
1. Target Somnia Hideki Testnet (Tokyo v2, Chain ID `50383`) using `@somnia-chain/markets-sdk@0.32.1`.
2. Initialize `SomniaMarkets` using the general testnet indexer URL commonly referenced in starter guides (`https://dev.smk.somnia.host/v1/graphql`):
   ```ts
   import { SomniaMarkets, SOMNIA_HIDEKI_TESTNET_ADDRESSES } from "@somnia-chain/markets-sdk";
   import { hidekiTestnet } from "@somnia-chain/markets-sdk/chains";

   async function main() {
     const exchange = new SomniaMarkets({
       chain: hidekiTestnet,
       wsRpcUrl: "wss://api.hideki2.infra.testnet.somnia.network/ws",
       indexerUrl: "https://dev.smk.somnia.host/v1/graphql",
       addresses: SOMNIA_HIDEKI_TESTNET_ADDRESSES,
     });

     const markets = await exchange.loadMarkets();
     console.log("Markets count:", Object.keys(markets).length);
     console.log("registryReadError:", exchange.registryReadError);
   }
   main();
   ```
3. Run the script with `tsx` or `node`.
4. Inspect console output and the internal error properties on `exchange`.

## Expected
Either:
a) `exchange.loadMarkets()` should surface a visible warning or throw a descriptive error explaining that `https://dev.smk.somnia.host/v1/graphql` indexes chain `50312` (Shannon) and not `50383` (Hideki), prompting the caller to provide `https://hideki-dev.smk.somnia.host/v1/graphql`; OR
b) The SDK should automatically route to the chain-appropriate default indexer based on `config.chain.id` when targeting Hideki (`50383`).

## Actual
`exchange.loadMarkets()` resolves without throwing or logging any warning, returning an empty dictionary (`{}`) with 0 perpetual markets.

The underlying failure occurs in `node_modules/@somnia-chain/markets-sdk/dist/syncStatus.js:97:11` inside `verifyBinding()`, which checks the indexer's supported chains and throws:
`NotConfiguredError: @somnia-chain/markets-sdk: indexer reads on chain 50383 — needs an indexerUrl for chain 50383 (https://dev.smk.somnia.host/v1/graphql indexes chains [50312])`

In `dist/unified/exchange.js:1215-1226`, `loadEngineMarkets()` catches this rejection into `this.registryReadFailures` (accessible via the public getter `exchange.registryReadError`) and returns an empty market array. Because this happens silently, developers often assume Hideki has no active perpetual markets or that RPC node connectivity is failing.

## Evidence
Sanitized runtime output from reproduction:
```text
Markets count: 0
registryReadError: NotConfiguredError: @somnia-chain/markets-sdk: indexer reads on chain 50383 — needs an indexerUrl for chain 50383 (https://dev.smk.somnia.host/v1/graphql indexes chains [50312])
    at verifyBinding (node_modules/@somnia-chain/markets-sdk/dist/syncStatus.js:97:11)
    at async sendGraphql (node_modules/@somnia-chain/markets-sdk/dist/indexerRead.js:124:22)
    at async listRegistryMarketsChecked (node_modules/@somnia-chain/markets-sdk/dist/markets.js:467:22)
    at async Object.listRegistryMarkets (node_modules/@somnia-chain/markets-sdk/dist/markets.js:442:13)
    at async SomniaMarkets.loadEngineMarkets (node_modules/@somnia-chain/markets-sdk/dist/unified/exchange.js:1215:33) {
  what: 'an indexerUrl for chain 50383 (https://dev.smk.somnia.host/v1/graphql indexes chains [50312])'
}
```

Verified workaround:
Supplying `indexerUrl: "https://hideki-dev.smk.somnia.host/v1/graphql"` immediately discovers 21+ active perpetual markets on Hideki v2.

Distinction between root causes:
1. Endpoint mismatch: `https://dev.smk.somnia.host/v1/graphql` genuinely indexes Shannon (`50312`).
2. SDK error surfacing: The SDK detects the mismatch accurately via `verifyBinding`, but swallowing the error without a `console.warn` or fail-fast exception makes diagnosis difficult for new developers.

## Environment
- SDK Version: `@somnia-chain/markets-sdk@0.32.1`
- Network: Somnia Hideki Testnet (Tokyo v2, Chain ID `50383`)
- Runtime: Node.js v24.15.0 / TypeScript 5.5.4
- External Duplicate Check: Not confirmed against private issue trackers. Public documentation and starter samples currently reference `dev.smk.somnia.host`.
