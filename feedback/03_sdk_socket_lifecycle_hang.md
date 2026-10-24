# SomniaMarkets.close() Leaves Active HTTP Keep-Alive Socket Handles, Delaying Node.js Process Exit
Severity: normal
Area: SDK

## Steps to reproduce
1. Create a script targeting Somnia Hideki Testnet that initializes `SomniaMarkets`, loads markets, calls `await exchange.close()`, and inspects Node.js active handles:
   ```ts
   import { SomniaMarkets, SOMNIA_HIDEKI_TESTNET_ADDRESSES } from "@somnia-chain/markets-sdk";
   import { hidekiTestnet } from "@somnia-chain/markets-sdk/chains";

   async function main() {
     const exchange = new SomniaMarkets({
       chain: hidekiTestnet,
       wsRpcUrl: "wss://api.hideki2.infra.testnet.somnia.network/ws",
       indexerUrl: "https://hideki-dev.smk.somnia.host/v1/graphql",
       addresses: SOMNIA_HIDEKI_TESTNET_ADDRESSES,
     });

     await exchange.loadMarkets();
     console.log("Calling exchange.close()...");
     await exchange.close();
     console.log("exchange.close() resolved.");

     const handles = (process as any)._getActiveHandles();
     console.log("Active handles count immediately after close():", handles.length);
     for (const h of handles) {
       console.log(" - Handle type:", h.constructor?.name, "destroyed:", h.destroyed);
     }
   }
   main();
   ```
2. Run the script with `tsx` or `node`.
3. Observe process behavior and handle state immediately following the resolution of `exchange.close()`.

## Expected
Per the SDK's internal JSDoc documentation at `node_modules/@somnia-chain/markets-sdk/dist/unified/exchange.js:5337`:
> *"This includes the chain WebSocket, so a Node process that has touched the chain exits on its own once this resolves."*

Calling `await exchange.close()` should release or destroy all transport resources (both WebSocket connections and HTTP connection pools), allowing standalone CLI tools, diagnostic runners, and automated tests to exit cleanly without external intervention.

## Actual
`await exchange.close()` successfully closes the WebSocket connection, but leaves active HTTP keep-alive socket handles open in Node's internal transport pool.

Measuring with `process._getActiveHandles()` immediately after `exchange.close()` resolves reveals:
- 2 active `Socket` handles (`destroyed: false`).
- 1 `TLSSocket` handle (`destroyed: true`, awaiting garbage collection).

These active keep-alive sockets keep the Node.js event loop active for their standard keep-alive window (typically ~15 to 20 seconds) after work has completed, preventing immediate process termination unless the caller explicitly invokes `process.exit(0)`.

## Evidence
Measured runtime observation:
```text
Calling exchange.close()...
exchange.close() resolved.
Active handles count immediately after close(): 3
 - Handle type: Socket destroyed: false
 - Handle type: Socket destroyed: false
 - Handle type: TLSSocket destroyed: true
```

Distinction between network layers:
- The WebSocket stream is cleanly terminated by `exchange.close()`.
- The residual handles originate from HTTP keep-alive connections instantiated during GraphQL indexer queries and JSON-RPC calls.

Recommended remediation:
1. In `exchange.close()`, ensure underlying HTTP connection pools or agent dispatchers are cleanly destroyed or closed in addition to the WebSocket teardown.
2. Alternatively, document that CLI scripts should call `process.exit(0)` or disable keep-alive on short-lived one-shot instances.

## Environment
- SDK Version: `@somnia-chain/markets-sdk@0.32.1`
- Network: Somnia Hideki Testnet (Tokyo v2, Chain ID `50383`)
- Runtime: Node.js v24.15.0 / TypeScript 5.5.4
- Operating System: Windows 11 (PowerShell)
- External Duplicate Check: Not confirmed against private issue trackers. Issue affects standard Node.js event-loop lifecycle in short-lived CLI tools.
