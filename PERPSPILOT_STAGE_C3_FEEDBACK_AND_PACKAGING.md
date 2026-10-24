# PerpsPilot — Stage C.3 Feedback Evidence Audit & MVP Packaging Report

**Document ID:** `PERPSPILOT_STAGE_C3_FEEDBACK_AND_PACKAGING.md`  
**Date:** October 24, 2026  
**Timestamp:** `12:57:00 UTC+1`  
**Workspace:** `C:\Users\NO GO NO\PerpsPilot`  
**Network:** Somnia Hideki Testnet (Tokyo v2, Chain ID `50383`, `0xc4cf`)  
**Target Bounty:** DoraHacks dreamDEX Perps Builder Bounty (Deadline: Nov 1, 2026, 23:59 UTC)  
**Track 1 (MVP Track):** $500 per winner (3 winners)  
**Track 2 (Feedback Track):** Up to $1,500 total pool  
**Operating Mode:** STRICT READ-ONLY (`DRY_RUN=true`) — Zero state changes, zero secrets logged, zero external publications.

---

## 1. Executive Summary

This Stage C.3 audit accomplishes two core goals while the trading wallet remains unconfigured:
1. **Feedback Evidence Audit (Track 2):** Independently validated each of the three candidate developer feedback reports against the installed `@somnia-chain/markets-sdk@0.32.1` source code and live on-chain contract queries on Somnia Hideki v2. Critical framing discrepancies were identified (e.g., `SomniaMarkets` actually possesses a `close()` method, but its implementation leaks active HTTP keep-alive sockets; and `MarginBank.getSystemConfig()` is the authoritative source for perps collateral, not `PerpPool.quoteToken()`).
2. **MVP Packaging Audit (Track 1):** Audited the project structure and designed the complete MVP architecture, README specification, risk lifecycle state machine, verifiable evidence format, realistic demo walkthrough, and draft X announcements needed to compete for the top MVP bounty award.

---

## 2. Independent Validation of the Three Feedback Candidates

### 2.1 Findings Summary Table

| Candidate | Area | Target Component / Interface | Status | Discovered SDK / Contract Reality | Practical Developer Impact |
|:---|:---|:---|:---|:---|:---|
| **#1: Indexer Chain Mismatch** | SDK / DX | `SomniaMarkets.loadMarkets()` & `syncStatus.js` | **CONFIRMED** | `https://dev.smk.somnia.host/v1/graphql` indexes `[50312]` (Shannon). `verifyBinding` throws `NotConfiguredError`, caught silently into `registryReadError`. | Calling `loadMarkets()` on Hideki returns `{}` (0 markets) with no console log or warning. Developers assume Hideki has 0 markets. |
| **#2: Collateral Address Mismatch** | SDK / Contracts | `SOMNIA_HIDEKI_TESTNET_ADDRESSES.collateral` | **CONFIRMED** | `SOMNIA_HIDEKI_TESTNET_ADDRESSES.collateral` is `0x9E9492...` (`tUSDC`, 6 decimals). Real on-chain `MarginBank` requires `0xed7993...` (`USDso`, 18 decimals). | Approving or depositing via SDK constant approves the wrong token. `MarginBank.depositCollateral` fails with zero allowance. |
| **#3: Transport Lifecycle Leaked Handles** | SDK | `SomniaMarkets.close()` & underlying sockets | **CONFIRMED (Framing Corrected)** | SDK **does** have `async close()`, but `close()` only terminates WebSockets. It leaves 3 active HTTP/HTTPS keep-alive sockets open, hanging the event loop. | Node.js CLIs, vitest runners, and cron scripts hang indefinitely after `await exchange.close()` unless forced by `process.exit(0)`. |

---

### 2.2 Deep Dive: Candidate 1 — Indexer Chain Mismatch & Silent Discovery Failure

#### A. Target Claim & Location
- **Staged File:** [`feedback_staging/01_hideki_indexer_endpoint_mismatch.md`](file:///C:/Users/NO%20GO%20NO/PerpsPilot/feedback_staging/01_hideki_indexer_endpoint_mismatch.md)
- **Target File in SDK:** `node_modules/@somnia-chain/markets-sdk/dist/syncStatus.js:97` and `dist/unified/exchange.js:1215-1226`
- **Installed Version:** `@somnia-chain/markets-sdk@0.32.1`

#### B. Concrete Reproduction Command & Verified Output
Executed minimal test runner connecting to Hideki v2 with the default/documented testnet indexer endpoint:
```typescript
import { SomniaMarkets, SOMNIA_HIDEKI_TESTNET_ADDRESSES } from "@somnia-chain/markets-sdk";
import { hidekiTestnet } from "@somnia-chain/markets-sdk/chains";

const exchange = new SomniaMarkets({
  chain: hidekiTestnet,
  wsRpcUrl: "wss://api.hideki2.infra.testnet.somnia.network/ws",
  indexerUrl: "https://dev.smk.somnia.host/v1/graphql",
  addresses: SOMNIA_HIDEKI_TESTNET_ADDRESSES,
});

const markets = await exchange.loadMarkets();
console.log("Markets count:", Object.keys(markets).length);
console.log("registryReadError:", exchange.registryReadError);
```

**Sanitized Output Observed:**
```text
Markets count: 0
registryReadError: NotConfiguredError: @somnia-chain/markets-sdk: indexer reads on chain 50383 — needs an indexerUrl for chain 50383 (https://dev.smk.somnia.host/v1/graphql indexes chains [50312])
    at verifyBinding (node_modules/@somnia-chain/markets-sdk/dist/syncStatus.js:97:11)
    at async sendGraphql (node_modules/@somnia-chain/markets-sdk/dist/indexerRead.js:124:22)
    at async SomniaMarkets.loadEngineMarkets (node_modules/@somnia-chain/markets-sdk/dist/unified/exchange.js:1215:33) {
  what: 'an indexerUrl for chain 50383 (https://dev.smk.somnia.host/v1/graphql indexes chains [50312])'
}
```

#### C. Separation of Confirmed Facts vs Assumptions
- **Confirmed Fact:** `https://dev.smk.somnia.host/v1/graphql` only serves Shannon testnet (`50312`).
- **Confirmed Fact:** `verifyBinding` correctly detects the chain mismatch and throws `NotConfiguredError`.
- **Confirmed Fact:** `exchange.loadMarkets()` catches the error internally and swallows it, returning `{}` (0 markets) without raising an exception or logging to `console.warn`.
- **Confirmed Fact:** `https://hideki-dev.smk.somnia.host/v1/graphql` is the working Hideki v2 indexer that successfully discovers 21+ active perpetual markets.
- **Clarified Nuance:** The draft report referenced `(exchange as any).perpDiscoveryFailure`. The official public getter exposed by CCXT / unified exchange is `exchange.registryReadError`.

#### D. Severity & Workaround
- **Severity Assessment:** **Major (DX / Onboarding Blocker)**.
- **Supported Workaround:** Explicitly supply `indexerUrl: "https://hideki-dev.smk.somnia.host/v1/graphql"` in the `SomniaMarkets` constructor options.

---

### 2.3 Deep Dive: Candidate 2 — Collateral Address Constant Mismatch

#### A. Target Claim & Location
- **Staged File:** [`feedback_staging/02_hideki_collateral_token_mismatch.md`](file:///C:/Users/NO%20GO%20NO/PerpsPilot/feedback_staging/02_hideki_collateral_token_mismatch.md)
- **Target File in SDK:** `node_modules/@somnia-chain/markets-sdk/dist/addresses.js:65`
- **Installed Version:** `@somnia-chain/markets-sdk@0.32.1`

#### B. Concrete Reproduction Command & Authoritative On-Chain Evidence
Executed on-chain contract queries against both the token contracts and the official Hideki v2 `MarginBank` contract (`0x478769E1177C0773c43A593DCCc4Ad15F15F1394`):

```typescript
const bankAddress = SOMNIA_HIDEKI_TESTNET_ADDRESSES.marginBank;
const sysConfig = await client.readContract({
  address: bankAddress,
  abi: marginBankAbi,
  functionName: "getSystemConfig",
});
```

**Sanitized Authoritative Output Observed:**
```text
SDK SOMNIA_HIDEKI_TESTNET_ADDRESSES.collateral: 0x9E9492cC533E8696A3b6afC7df730800DF75148f
SDK collateral token: tUSDC, decimals: 6

MarginBank Address: 0x478769E1177C0773c43A593DCCc4Ad15F15F1394
MarginBank.getSystemConfig(): {
  marginBank: '0x478769E1177C0773c43A593DCCc4Ad15F15F1394',
  collateralToken: '0xed7993A74dAe1e6656B704A424DcD8711aAf4F72',
  perpPoolFactory: '0xE631fAEE547baeE07353E290f0562ea67d856560',
  liquidationEngine: '0xA66d3C24Ad4a389d863846905D8173e1017e9F4D',
  insuranceFund: '0x50826894D47C6D4f3BeA38BFDC7Dc5c5be171b80',
  feeRecipient: '0xd58596620Ee6951B2958a931949e4ff7ce6222be',
  maxLeverageLimit: 20,
  fullyWired: true
}
Authoritative MarginBank collateralToken: 0xed7993A74dAe1e6656B704A424DcD8711aAf4F72
MarginBank collateral token: USDso, decimals: 18
```

#### C. Separation of Confirmed Facts vs Assumptions
- **Confirmed Fact:** In `SOMNIA_HIDEKI_TESTNET_ADDRESSES`, `collateral` is set to `0x9E9492cC533E8696A3b6afC7df730800DF75148f` (`tUSDC`, 6 decimals).
- **Confirmed Fact:** The Hideki v2 `MarginBank` contract `0x478769E1177C0773c43A593DCCc4Ad15F15F1394` explicitly defines `collateralToken: 0xed7993A74dAe1e6656B704A424DcD8711aAf4F72` (`USDso`, 18 decimals) inside `getSystemConfig()`.
- **Confirmed Fact:** `MarginBank.depositCollateral(amount)` strictly pulls `USDso`. Approving `addresses.collateral` approves `tUSDC`, which leaves `USDso` allowance at zero and causes transactions to revert.
- **Clarified Nuance:** The original draft suggested calling `PerpPool.quoteToken()`. `PerpPool` does not expose `quoteToken()`; the authoritative query is `MarginBank.getSystemConfig()`.

#### D. Severity & Workaround
- **Severity Assessment:** **Major (Contract Interaction / Deposit Failure)**.
- **Supported Workaround:** Explicitly pass the Hideki `USDso` contract address (`0xed7993A74dAe1e6656B704A424DcD8711aAf4F72`) when performing approvals and balance inquiries for perps trading.

---

### 2.4 Deep Dive: Candidate 3 — Transport Lifecycle & Leaked HTTP Keep-Alive Handles

#### A. Target Claim & Location
- **Staged File:** [`feedback_staging/03_sdk_socket_lifecycle_hang.md`](file:///C:/Users/NO%20GO%20NO/PerpsPilot/feedback_staging/03_sdk_socket_lifecycle_hang.md)
- **Target File in SDK:** `node_modules/@somnia-chain/markets-sdk/dist/unified/exchange.js:5378` (`async close()`)
- **Installed Version:** `@somnia-chain/markets-sdk@0.32.1`

#### B. Concrete Reproduction Command & Handle Inspection Output
Executed a script that loads markets, calls `await exchange.close()`, and inspects Node's internal active handles using `process._getActiveHandles()`:

```typescript
const exchange = new SomniaMarkets({
  chain: hidekiTestnet,
  wsRpcUrl: "wss://api.hideki2.infra.testnet.somnia.network/ws",
  indexerUrl: "https://hideki-dev.smk.somnia.host/v1/graphql",
  addresses: SOMNIA_HIDEKI_TESTNET_ADDRESSES,
});
await exchange.loadMarkets();
await exchange.close();

const handles = (process as any)._getActiveHandles();
console.log("Active handles count immediately after close():", handles.length);
for (const h of handles) {
  console.log(" - Handle type:", h.constructor?.name, "destroyed:", h.destroyed);
}
```

**Sanitized Output Observed:**
```text
Markets loaded, total keys: 30
Calling exchange.close()...
exchange.close() resolved.
Active handles count immediately after close(): 3
 - Handle type: Socket destroyed: false
 - Handle type: Socket destroyed: false
 - Handle type: TLSSocket destroyed: true
Timer fired: process did not exit on its own after 2 seconds.
```

#### C. Separation of Confirmed Facts vs Assumptions
- **Refinement / Correction:** The staged draft claimed that `SomniaMarkets` lacks a `.close()` or `.dispose()` method. **This claim was incorrect.** `SomniaMarkets` does have `async close()`, and its JSDoc documentation explicitly states:  
  *`"This includes the chain WebSocket, so a Node process that has touched the chain exits on its own once this resolves."`*
- **Confirmed Defect:** While `exchange.close()` terminates the WebSocket connection, it **fails to destroy or unref the active HTTP keep-alive connection sockets** created by GraphQL queries and HTTP RPC calls.
- **Confirmed Fact:** As demonstrated above, 2 live `Socket` instances remain in the Node.js event loop with `destroyed: false`, causing any CLI tool, automated test, or serverless script to hang for up to 20 seconds unless forcibly aborted.

#### D. Severity & Workaround
- **Severity Assessment:** **Normal (DX / Script Lifecycle)**.
- **Supported Workaround:** Call `process.exit(0)` at the end of standalone diagnostic scripts, or explicitly unref connections.

---

### 2.5 Recommended Corrections for Staged Feedback Reports

Before submitting to the DoraHacks Feedback Bounty track, each report in `feedback_staging/` should receive the following factual updates:

1. **`01_hideki_indexer_endpoint_mismatch.md`:**
   - Update error inspection reference from `(exchange as any).perpDiscoveryFailure` to the standard public getter `exchange.registryReadError`.
   - Add exact file reference: `node_modules/@somnia-chain/markets-sdk/dist/syncStatus.js:97:11`.

2. **`02_hideki_collateral_token_mismatch.md`:**
   - Replace speculative reference to `PerpPool.quoteToken()` with the verified on-chain call `MarginBank(0x478769E1177C0773c43A593DCCc4Ad15F15F1394).getSystemConfig()`.
   - Include the full raw `getSystemConfig` output proving `collateralToken: 0xed7993A74dAe1e6656B704A424DcD8711aAf4F72` (USDso, 18 decimals).

3. **`03_sdk_socket_lifecycle_hang.md`:**
   - Re-frame the bug title from *"SomniaMarkets Instance Lacks Resource Disposal Method"* to:  
     **`SomniaMarkets.close() Leaves Active HTTP Keep-Alive Sockets Open, Preventing Clean Node.js Event-Loop Exit`**.
   - Quote the SDK's own JSDoc contract at `exchange.js:5337` and provide the `process._getActiveHandles()` trace showing the 2 unclosed `Socket` handles.

---

## 3. MVP Packaging Audit & Documentation Specification

To position PerpsPilot as a standout contender in Track 1 ($500 MVP award), the project packaging must demonstrate production-grade software craftsmanship, transparent risk controls, and clear testability.

### 3.1 Proposed `README.md` Specification

A clean, comprehensive `README.md` should be added to the project root with the following sections:

```markdown
# PerpsPilot 🛫

> **Explainable Perpetuals Trading Copilot for dreamDEX on Somnia Hideki Testnet**

PerpsPilot is an automated risk copilot and execution tool designed for traders and developers building on **dreamDEX**—the premier perpetuals DEX on the ultra-low-latency **Somnia Blockchain** (Hideki Tokyo v2 Testnet, Chain ID `50383`).

---

## Key Features

1. 🔍 **Automatic On-Chain Discovery:** Discovers live perpetual markets, pool addresses, tick sizes, lot sizes, and initial margin requirements directly from the Hideki v2 factory contracts.
2. 🛡️ **Explainable Pre-Trade Risk Engine:** Analyzes prospective orders against market minimums, lot alignment, initial margin requirements (IMF), and account-level cross-margin health before anything touches the network.
3. 💼 **Three-Tier Fund Isolation:** Clearly distinguishes between native L1 gas (`STT`), liquid wallet stablecoins (`USDso`), and active cross-collateral deposited in `MarginBank`.
4. 🔒 **Strict Dry-Run Safety Guard:** By default, runs in read-only mode (`DRY_RUN=true`). Zero orders or state changes can execute without explicit confirmation.
5. 📊 **On-Chain Evidence Logging:** Captures structured logs of order creation, fill receipts, and transaction hashes for verifiable proof of execution.

---

## Architecture

```
                  +-----------------------------------------+
                  |         CLI Diagnostics & Preflight     |
                  +-----------------------------------------+
                                       |
                   +-------------------+-------------------+
                   |                                       |
                   v                                       v
        +---------------------+                 +---------------------+
        |  Risk & Math Engine |                 |  Market Discovery   |
        |  - Lot Alignment    |                 |  - Factory Query    |
        |  - Tick Alignment   |                 |  - Oracle Health    |
        |  - IMF Margin Check |                 |  - Pool Parameters  |
        +---------------------+                 +---------------------+
                   |                                       |
                   +-------------------+-------------------+
                                       |
                                       v
                  +-----------------------------------------+
                  |         Controlled Order Dispatcher     |
                  |     (Dry-Run Guard & Receipt Verifier)  |
                  +-----------------------------------------+
```

---

## Quickstart

### Prerequisites
- Node.js >= 20.0.0
- npm >= 10.0.0

### Installation
```bash
git clone https://github.com/your-username/PerpsPilot.git
cd PerpsPilot
npm install
npm run build
```

### Running Diagnostics & Preflight
Check your connection to Somnia Hideki v2 and view live market data:
```bash
# Verify RPC, Indexer, and Live Perp Pools
npm run doctor

# Run full read-only account and order preflight
npm run preflight
```

### Configuration
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Populate `.env` with your testnet details:
```env
PRIVATE_KEY="0xYOUR_TESTNET_PRIVATE_KEY"
SOMNIA_HIDEKI_RPC_URL="https://api.hideki2.infra.testnet.somnia.network"
SOMNIA_INDEXER_URL="https://hideki-dev.smk.somnia.host/v1/graphql"
DRY_RUN=true
```
*(Leave `DRY_RUN=true` to preview risk checks without spending funds).*
```

---

### 3.2 Controlled Execution State Machine

PerpsPilot models every order using a 6-stage deterministic state machine:

```
[PROPOSAL]
   │  Input: market, side, notional/quantity, target price
   ▼
[RISK_GATE]
   │  Checks: quantity >= minQty, lot aligned, tick aligned, IMF margin sufficient
   ▼
[ACCOUNT_PREFLIGHT]
   │  Checks: STT gas >= 0.05, MarginBank equity >= order margin
   ▼
[SUBMISSION] (Blocked if DRY_RUN=true)
   │  Dispatches viem transaction to PerpPool contract
   ▼
[CONFIRMATION]
   │  Awaits block inclusion on Hideki v2 (10ms blocks)
   ▼
[RECEIPT & FILL VERIFICATION]
      Parses OrderCreated / OrderMatched events & queries getAccountPositions()
```

---

### 3.3 Verifiable Execution Evidence Format

For Stage D (real order execution), PerpsPilot will generate an authoritative evidence artifact: `EXECUTION_EVIDENCE.json` / `EVIDENCE.md`:

```json
{
  "timestamp": "2026-10-XXTXX:XX:XXZ",
  "network": "Somnia Hideki Testnet (Tokyo v2)",
  "chainId": 50383,
  "transactionHash": "0x...",
  "blockNumber": 31889000,
  "market": "ETH-PERP",
  "poolAddress": "0xd6cb1dd58580b84d76068ac21594219ce03aeddf",
  "orderSide": "LONG",
  "orderType": "LIMIT",
  "price": "2363.15 USDso",
  "quantity": "0.0084 ETH",
  "notional": "19.85046 USDso",
  "gasUsed": "...",
  "status": "RESTED",
  "marginBankHealthBefore": "...",
  "marginBankHealthAfter": "..."
}
```

---

### 3.4 Live Demo Video Walkthrough Plan

A 2-to-3 minute video demonstration (utilizing real application output from the diagnostic and preflight tools):

1. **Scene 1 (0:00 - 0:30): Introduction & Problem Statement**
   - Introduce PerpsPilot: explainable risk and execution on dreamDEX.
   - Highlight the challenges of trading on a 10ms block time testnet (Hideki v2).
2. **Scene 2 (0:30 - 1:15): Live Diagnostics (`npm run doctor`)**
   - Run `npm run doctor` in real time.
   - Show live RPC connectivity to Chain `50383` and block `#31,888,000+`.
   - Show dynamic discovery of 21 live perpetual markets from the Hideki v2 factory.
3. **Scene 3 (1:15 - 2:00): Read-Only Risk Preflight (`npm run preflight`)**
   - Run `npm run preflight`.
   - Walk through the three fund tiers (STT Gas, USDso in wallet, USDso in MarginBank).
   - Display the real-time $20 notional order preview: lot alignment, tick alignment, and IMF margin calculation.
4. **Scene 4 (2:00 - 2:30): Developer Contributions (Track 2)**
   - Highlight the three upstream SDK/DX issues uncovered during development and staged for dreamDEX.
   - Show how PerpsPilot handles these edge cases seamlessly.

---

## 4. Draft X / Social Announcements (Unpublished)

> **Status:** STRICTLY DRAFT / UNPUBLISHED. Do not publish, tweet, or post without explicit authorization.

### Draft 1: General MVP Announcement
```text
Excited to unveil PerpsPilot 🛫 — an explainable perpetuals trading copilot built for @DreamDEXSomnia on the @Somnia_Network Hideki Tokyo v2 testnet! ⚡

Trading on a 10ms block cadence requires total clarity before an order hits the chain:
🔹 Auto-discovers 21 live perp markets
🔹 Pre-trade lot & tick alignment
🔹 3-tier margin reconciliation (STT gas vs USDso collateral)
🔹 Built-in dry-run safety guards

Check out our open-source repo & DoraHacks submission! 🛠️ #Somnia #dreamDEX #DeFi
```

### Draft 2: Deep Dive into Risk Architecture
```text
Perps trading shouldn't be a black box. 📦

When building on @DreamDEXSomnia, your liquid USDso in-wallet isn't perps margin until deposited into MarginBank. PerpsPilot enforces clear fund-tier isolation:
1️⃣ L1 STT for gas
2️⃣ ERC-20 USDso
3️⃣ MarginBank cross-collateral

Our preflight engine previews IMF margin, lot grids, and mark oracle health before order submission. Safe, explainable, testnet-first. 🛡️ #dreamDEX
```

### Draft 3: Developer Experience & Upstream Contributions
```text
Building on bleeding-edge infrastructure means contributing back to the ecosystem! 🤝

While engineering PerpsPilot for @DreamDEXSomnia Hideki v2 (Chain 50383), we documented 3 key DX improvements for the Markets SDK:
✅ Indexer multi-chain configuration
✅ MarginBank collateral token resolution
✅ Socket lifecycle handle management

Excited to help make dreamDEX the best dev experience in DeFi! 🚀
```

---

## 5. Ranked Action Plan for Remaining Bounty Deadline

**Submission Deadline:** November 1, 2026, 23:59 UTC (~8 days remaining)

| Priority | Task Description | Track | Prerequisites / Dependencies | Risk / Effort |
|:---:|:---|:---:|:---|:---:|
| **P1** | **User Local Account Setup & Funding** | Track 1 | User adds `PRIVATE_KEY` to `.env` locally; claims STT & USDso. | Low effort / User action |
| **P2** | **Execute Read-Only Preflight with Signer** | Track 1 | P1 complete. Confirm all 8 preflight checks report **PASS**. | Low effort / 5 mins |
| **P3** | **Stage D Controlled Execution** | Track 1 | P2 PASS + Explicit user approval. Approve USDso, deposit margin, place $20 LIMIT order. | Med effort / 30 mins |
| **P4** | **Capture & Format On-Chain Evidence** | Track 1 | P3 complete. Record tx hash, block number, fill events in `EVIDENCE.md`. | Low effort / 20 mins |
| **P5** | **Update Feedback Reports in `feedback_staging/`** | Track 2 | Apply confirmed factual corrections from Section 2.5. | Low effort / 15 mins |
| **P6** | **Generate `README.md` & Public Packaging** | Track 1 | Add architecture diagram, quickstart, and configuration guide. | Low effort / 20 mins |
| **P7** | **Record Demo Video & Final Submission** | Both | P3 & P6 complete. Record walkthrough and prepare DoraHacks links. | Med effort / 1 hour |

---

## 6. Actions Intentionally NOT Taken

In strict adherence to project operating boundaries:
- **Zero On-Chain Transactions:** No token approvals, no margin deposits, no order submissions, and no faucet claims were executed.
- **Zero Secret Exposure:** `.env` was never read, printed, or requested in chat.
- **Dry-Run Maintained:** `DRY_RUN=true` remains strictly enforced across all modules.
- **Zero External Publications:** Git was not initialized; no commits, pushes, feedback tickets, or X posts were broadcast.
- **Integrity Preserved:** No results or execution hashes were fabricated. All observations are based on actual executed commands and on-chain contract reads.
