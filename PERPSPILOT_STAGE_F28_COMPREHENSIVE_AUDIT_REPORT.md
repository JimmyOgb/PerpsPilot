# PerpsPilot Stage F.28 — Comprehensive Production, Security, Trading & Bounty Readiness Audit Report

**Audit Date:** 2026-10-29  
**Target Release Audited:** Stage F.27 (`c028b37b009702264c8c73d550910777c5e21b14` / local `HEAD` `783fa8a91b2c384ab7452552fbe24aac24ce4c31`)  
**Workspace:** `C:\Users\NO GO NO\perpspilot`  
**Canonical Production URL:** `https://perpspilot.vercel.app`  
**Immutable F.27 Deployment URL:** `https://perpspilot-kefd9s1b5-jamism123.vercel.app`  
**Target Network:** Somnia Hideki v2 Testnet (`Chain ID: 50383`, `Network ID: 50000259`)  
**Audit Mode:** Strictly Read-Only (Zero code edits, zero Git mutations, zero wallet/blockchain writes, zero external submissions)

---

## 1. Executive Summary

This Stage F.28 audit conducted an independent, forensic, evidence-driven examination of the PerpsPilot repository, Git provenance, live Vercel deployments, Somnia Hideki v2 RPC/indexer connectivity, on-chain smart contracts, historical Stage F.24 transaction evidence, risk-control implementation, test suites, security posture, and dreamDEX Perps Builder Bounty deliverables.

### Key Strengths Independently Verified
1. **Live Production Deployment & Parity:** Both `https://perpspilot.vercel.app` and `https://perpspilot-kefd9s1b5-jamism123.vercel.app` return HTTP `200`, serve identical HTML (`ETag: "099f295d4b5248a442c6146e6631b045"`), and serve the exact same 1,825,918-byte JavaScript bundle (`/assets/index-B-ojjp_u.js`) corresponding to the Stage F.27 release (`c028b37`). SPA routing (`/`, `/markets`, `/diagnostics`) works cleanly with HTTP `200`.
2. **Real Somnia Hideki v2 Testnet & Contract Integration:** The live RPC (`https://api.hideki2.infra.testnet.somnia.network`) responds with `chainId = 50383` and `net_version = 50000259` (verified at block `36,338,080`). On-chain bytecode is verified for `ETH-PERP` (`0xd6cb1dd58580b84d76068ac21594219ce03aeddf`), `MarginBank` (`0x478769E1177C0773c43A593DCCc4Ad15F15F1394`), `USDso` (`0xed7993A74dAe1e6656B704A424DcD8711aAf4F72`, verified `symbol() = "USDso"`, `decimals() = 18`), and `PerpPoolFactory` (`0xE631fAEE547baeE07353E290f0562ea67d856560`).
3. **Authentic Stage F.24 On-Chain Evidence:** Both historical transactions displayed in the UI (`placeOrder` tx `0xdea7fc0070e42b632ebe90fe57509abdf9cb464a98f73277b1c6cc85b92777e7` at block `36,237,119` and `cancelOrder` tx `0x6c2661e69bf8593e117e9d7fafeb1f125640db5c4841243c648d22fe917ffea7` at block `36,237,214`) were independently fetched and decoded from the Somnia Hideki v2 RPC. Historical state at block `36,237,119` confirms Order ID `5460236245818038181306` rested on the book (`0.004 ETH` BUY @ `2,200 USDso`, `POST_ONLY`, `CANCEL_TAKER`, `0.44 USDso` margin locked) and was cleanly cancelled 10 seconds later with full margin release (`0` fills, `0` net position).
4. **Type Safety & Automated Test Suite:** `npm run typecheck` (`tsc --noEmit`) passed with zero errors, and `npm test` (`vitest run`) passed **119/119 tests across 9 suites**, including live read-only RPC and GraphQL indexer tests (`tests/network.test.ts`).
5. **Secret Hygiene:** No private keys or secret tokens are committed in source or Git history. `.env` and `.env.local` are properly ignored by `.gitignore` and `.vercelignore`.

### Critical & High-Severity Blockers Discovered
Despite earlier Stage F.26/F.27 reports claiming full readiness, deep source-code inspection of the browser execution path uncovered **1 CRITICAL** and **6 HIGH** findings that prevent an unconditional `READY` verdict:
- **`[CRITICAL-01]` Browser Live Execution (`OrderLifecycleModal.tsx`) Bypasses `OrderPlanner`, `ExecutionGuard`, and Tick/Lot Quantization, and Mis-Maps Order Types & Decimals:**
  - `OrderLifecycleModal.tsx:121-154` never invokes `OrderPlanner.createOrderPlan()` or `ExecutionGuard.evaluate()`. Instead, it constructs an ad-hoc inline object literal, calls `adapter.prepareOrderCall(...)` directly, and dispatches `walletClient.sendTransaction(...)`.
  - **60-Second Plan Freshness Bypassed:** `OrderLifecycleModal.tsx:140-141` sets `createdAtMs: Date.now(), expiresAtMs: Date.now() + 60_000` at the moment the user clicks `"Authorize & Sign"` rather than using `proposal.timestamp`, allowing an order preview left open indefinitely to execute at stale prices.
  - **Broken `orderType` Mapping (`MARKET` Silently Converted to `POST_ONLY`):** `OrderLifecycleModal.tsx:129` maps `orderType: proposal.type === 'LIMIT' ? 'LIMIT' : 'POST_ONLY'`. Selecting `LIMIT` in `TradeTicket` dispatches contract `orderType = 0` (`LIMIT`, which can cross the spread as a taker), contradicting the UI's claim that `POST_ONLY` guarantees maker execution (`TradeTicket.tsx:453`, `OrderLifecycleModal.tsx:398`). Selecting `MARKET` in `TradeTicket` hides the price input (`TradeTicket.tsx:259`) and silently converts the order into a `POST_ONLY` (`3`) limit order at whatever cached string was left in `priceInput`!
  - **Unquantized Free-Text Inputs & Hardcoded 18-Decimal Quantity Scaling:** `TradeTicket.tsx:281,311` does not quantize typed text inputs to `tickSize` / `lotSize`, and `OrderLifecycleModal.tsx:131-133` scales `quantityRaw` by a hardcoded $10^{18}$ (`BigInt(Math.round(proposal.amount * 1e8)) * 10n ** 10n`), which is $10^{10}\times$ too large for `BTC-PERP` (`baseDecimals: 8`) and $10^9\times$ too large for `SOL-PERP` (`baseDecimals: 9`).
- **`[HIGH-01]` False `POSITION_VERIFIED` Status on Zero-Size Resting Orders:** `OrderLifecycleModal.tsx:188-197` checks `if (pos) { setLiveState('POSITION_VERIFIED'); }` after calling `LiveOrderAdapter.getPositionOnchain()`. Because `MarginBank.getPosition` always returns a struct tuple (with `size: 0n` when no position exists), `pos` is always truthy, immediately overwriting `'ORDER_RESTING'` with `'POSITION_VERIFIED'` even when the order never filled (`size === 0n`).
- **`[HIGH-02]` No UI Mechanism to View or Cancel Resting Orders or Close Positions:** `useWallet.ts:63-64,181-200` leaves `positions: []` and `openOrders: []` permanently empty, and `BottomTables.tsx:296-310` renders static `"Zero resting orders"` / `"Zero active open positions"` text with no `cancelOrder` button anywhere in the UI.
- **`[HIGH-03]` Pre-Trade Gas & Collateral Readiness Bypass via Modal Mode Switch:** Opening the modal in `"Preview Mode"` and clicking `"Switch to Live Testnet Mode"` (`OrderLifecycleModal.tsx:517-525`) sets `isLiveMode = true` without recomputing `liveState`, leaving `"Authorize & Sign in Wallet"` enabled even when the wallet has `0 STT` gas or `0 USDso` collateral.
- **`[HIGH-04]` Public GitHub Repository (`origin/main`) Is 2 Commits Behind Production & Core Docs (`README.md`, `EVIDENCE.md`, `DEMO_SCRIPT.md`) Are Stale:** GitHub `origin/main` is still at `a14e9355c2f0ef8d9581e8718ca831826296637a` (pre-F.27). Furthermore, `README.md`, `EVIDENCE.md`, and `DEMO_SCRIPT.md` still claim the app is in `"Strict Dry-Run Read-Only Mode"` with `PENDING_STAGE_D` placeholders instead of the verified Stage F.24 transactions.
- **`[HIGH-05]` Missing Mandatory DoraHacks Bounty Deliverables:** The demo video (`[DEMO VIDEO URL - PLACEHOLDER]`), the 2–3 public X posts tagging `@DreamDEXSomnia`, DoraHacks wallet whitelist confirmation, and final DoraHacks submission are not yet completed.
- **`[HIGH-06]` Stale Factory Address in Backend Config (`src/config/constants.ts`):** While the frontend (`src/frontend/constants.ts:12`) uses the live v2 factory `0xE631fAEE547baeE07353E290f0562ea67d856560` (`176 bytes` of bytecode), backend [`src/config/constants.ts:6`](file:///C:/Users/NO%20GO%20NO/perpspilot/src/config/constants.ts#L6) still points `CONTRACTS.PERP_POOL_FACTORY` to `0x86676287143A0A5bd2c9DFb0bef31adA99c1B8cC`, which has **0 bytes of bytecode (`0x`)** on Somnia Hideki v2.

---

## 2. Overall Verdict

### **OVERALL VERDICT: `NOT READY` (Requires Code Remediation, Git Sync, Documentation Sync & Bounty Deliverables Before Submission)**

*(Note: Under the three permitted labels — `READY`, `READY WITH BLOCKERS`, `NOT READY` — PerpsPilot's infrastructure, read-only market discovery, and historical CLI execution evidence are real and verified, but the browser-based live trading flow in `OrderLifecycleModal.tsx` contains critical order-construction and state-reporting bugs (`[CRITICAL-01]`, `[HIGH-01]`, `[HIGH-02]`, `[HIGH-03]`), the public GitHub repo (`origin/main`) does not yet contain the F.27 release (`[HIGH-04]`), and the mandatory bounty submission artifacts are incomplete (`[HIGH-05]`). Therefore, the strict evidence-driven verdict is **`NOT READY`** until the critical/high blockers in Section 16 are resolved.)*

| Audit Dimension | Status | Summary |
| :--- | :---: | :--- |
| **Vercel Production & Immutable Parity** | `PASS` | Canonical and immutable URLs serve identical F.27 bundle (`index-B-ojjp_u.js`). |
| **Somnia Hideki v2 RPC & Contracts** | `PASS` | Chain `50383` / Net `50000259` live; `ETH-PERP`, `MarginBank`, `USDso`, and frontend `Factory` verified on-chain. |
| **Historical Stage F.24 On-Chain Evidence** | `PASS` | Both tx receipts (`0xdea7fc...`, `0x6c2661...`) and Order ID `5460236245818038181306` independently verified on-chain. |
| **TypeScript & Automated Test Suite** | `PASS` | `tsc --noEmit` (0 errors) and `vitest run` (119/119 passed across 9 files). |
| **Secret & Credential Hygiene** | `PASS` | No leaked keys in code or Git; `.env` and `.env.local` properly gitignored. |
| **Browser Live Order Construction & Guard** | `FAIL` | `OrderLifecycleModal.tsx` bypasses `OrderPlanner`/`ExecutionGuard`, mis-maps `MARKET`/`LIMIT`/`POST_ONLY`, and hardcodes 18dp. |
| **Browser Position & Order Lifecycle UI** | `FAIL` | `if (pos)` falsely reports `POSITION_VERIFIED` when `size === 0n`; no UI to view/cancel open orders. |
| **GitHub `origin/main` & Documentation Sync** | `FAIL` | Local `HEAD` is 2 commits ahead of `origin/main`; `README.md` & `EVIDENCE.md` still show `DRY_RUN` / `PENDING_STAGE_D`. |
| **Bounty Submission Deliverables** | `BLOCKED` | Demo video, 2–3 X posts (`@DreamDEXSomnia`), and DoraHacks whitelist/submission not yet completed. |

---

## 3. Workspace, Git and Deployment Provenance (Phase A)

### 3.1 Independently Verified Git State
All Git inspections were performed using read-only commands (`git rev-parse`, `git status`, `git log`, `git branch -vv`, `git ls-remote`, `git show --stat`).

| Property | Verified Value | Evidence / Command Output |
| :--- | :--- | :--- |
| **Current Branch** | `main` | `git branch -vv` -> `* main 783fa8a [origin/main: ahead 2]` |
| **Local `HEAD` Commit** | `783fa8a91b2c384ab7452552fbe24aac24ce4c31` | `docs: add Stage F.27 production release report and vercel ignore optimization` (2026-10-29 14:38:08 +0100) |
| **Local `HEAD~1` (F.27 Code Commit)** | `c028b37b009702264c8c73d550910777c5e21b14` | `fix: enable live testnet trading mode on Somnia Hideki v2` (2026-10-29 14:21:55 +0100) |
| **Local `HEAD~2` / Remote `origin/main`** | `a14e9355c2f0ef8d9581e8718ca831826296637a` | `git ls-remote origin main` -> `a14e9355c2f0ef8d9581e8718ca831826296637a refs/heads/main` |
| **Tracked File Modifications** | `0` staged, `0` unstaged | `git status --porcelain` shows zero `M`/`A`/`D` entries. |
| **Untracked Files in Workspace** | `58` untracked paths | `.agents/`, `scratch/smoke_test_f27_release.cjs`, and 56 historical `.md` stage reports (`PERPSPILOT_STAGE_*.md`, `STAGE_*.md`, `SOMNIA_HIDEKI_*.md`, `VERCEL_*.md`). |

### 3.2 Commit History (`git log -n 5 --oneline`)
```text
783fa8a (HEAD -> main) docs: add Stage F.27 production release report and vercel ignore optimization
c028b37 fix: enable live testnet trading mode on Somnia Hideki v2
a14e935 (origin/main, origin/HEAD) feat: publish PerpsPilot trading interface and risk-aware execution modules
6bd7bd9 Initial commit: PerpsPilot CLI & SDK integration for DreamDEX
```

### 3.3 Provenance Reconciliation: Local `HEAD` vs. GitHub `main` vs. Vercel Production
1. **Commit `c028b37b009702264c8c73d550910777c5e21b14`** modified 5 frontend files (`src/frontend/App.tsx`, `src/frontend/components/Navbar.tsx`, `src/frontend/components/OrderLifecycleModal.tsx`, `src/frontend/components/TradeTicket.tsx`, `src/frontend/hooks/useWallet.ts`) and added `PERPSPILOT_STAGE_F26_READINESS_AUDIT_REPORT.md`.
2. **Commit `783fa8a91b2c384ab7452552fbe24aac24ce4c31`** modified only `.vercelignore` and added `PERPSPILOT_STAGE_F27_PRODUCTION_RELEASE_REPORT.md` — it modified **zero** source (`src/`) or build files.
3. **Production Bundle Match:** Both `https://perpspilot.vercel.app` and `https://perpspilot-kefd9s1b5-jamism123.vercel.app` serve `/assets/index-B-ojjp_u.js` (1,825,918 bytes), which contains the exact strings introduced in `c028b37` (`"Live Testnet Mode"`, `"Preview Mode"`, `"Authorize & Sign in Wallet"`).
4. **GitHub Desynchronization (`[HIGH-04]`):** Because `c028b37` and `783fa8a` were committed locally and deployed to Vercel via the Vercel CLI without running `git push origin main`, the public GitHub repository (`https://github.com/JimmyOgb/PerpsPilot`) is still at `a14e9355c2f0ef8d9581e8718ca831826296637a` (the pre-F.27 dry-run UI). Any bounty judge inspecting GitHub right now will see outdated source code that does not match the live Vercel app.

---

## 4. Production Behavior and Smoke-Test Evidence (Phase B)

### 4.1 Read-Only HTTP & Asset Verification
*(Note: No interactive headless browser was launched in order to strictly respect read-only boundaries and avoid any unintended wallet/extension interaction; all checks below were performed via read-only HTTPS requests in `f28_verify.mjs` combined with direct inspection of the served HTML/JS/CSS bundles and React component tree.)*

| Endpoint Inspected | HTTP Status | HTML ETag | Referenced JS Bundle | Referenced CSS Bundle |
| :--- | :---: | :---: | :---: | :---: |
| `https://perpspilot.vercel.app` | `200` | `"099f295d4b5248a442c6146e6631b045"` | `/assets/index-B-ojjp_u.js` | `/assets/index-DWRq0uON.css` |
| `https://perpspilot.vercel.app/markets` | `200` | `"099f295d4b5248a442c6146e6631b045"` | `/assets/index-B-ojjp_u.js` | `/assets/index-DWRq0uON.css` |
| `https://perpspilot.vercel.app/diagnostics` | `200` | `"099f295d4b5248a442c6146e6631b045"` | `/assets/index-B-ojjp_u.js` | `/assets/index-DWRq0uON.css` |
| `https://perpspilot-kefd9s1b5-jamism123.vercel.app` | `200` | `"099f295d4b5248a442c6146e6631b045"` | `/assets/index-B-ojjp_u.js` | `/assets/index-DWRq0uON.css` |
| `https://perpspilot-kefd9s1b5-jamism123.vercel.app/markets` | `200` | `"099f295d4b5248a442c6146e6631b045"` | `/assets/index-B-ojjp_u.js` | `/assets/index-DWRq0uON.css` |
| `https://perpspilot-kefd9s1b5-jamism123.vercel.app/diagnostics` | `200` | `"099f295d4b5248a442c6146e6631b045"` | `/assets/index-B-ojjp_u.js` | `/assets/index-DWRq0uON.css` |

- **Byte-for-Byte Bundle Identity:** `/assets/index-B-ojjp_u.js` (`1,825,918` bytes) on `perpspilot.vercel.app` is **100% byte-for-byte identical** (`immAsset.body === canAsset.body` = `true`) to `/assets/index-B-ojjp_u.js` on `perpspilot-kefd9s1b5-jamism123.vercel.app`.
- **Note on Minified JSX Strings:** In the F.27 smoke test (`scratch/smoke_test_f27_release.cjs`), checks for `"TESTNET LIVE"` and `"Submit Live Order (Testnet)"` returned `false` only because JSX expressions like `TESTNET { wallet.isConnected ? 'LIVE' : 'READY' }` (`Navbar.tsx:100`) and `'Submit Live Order (Testnet)'` (not present verbatim; `TradeTicket.tsx:504` uses `'Review & Sign Live Order (Testnet)'`) compile into separate string literals in the Rollup bundle.

### 4.2 Residual Contradictory Dry-Run Indicators in Production Bundle (`[MEDIUM-02]`)
Both the production JS bundle (`/assets/index-B-ojjp_u.js`) and local source files still contain contradictory dry-run strings:
1. **`PASS (Dry-Run)` in Pre-Trade Safety Audits Table:** [`src/frontend/components/BottomTables.tsx:137`](file:///C:/Users/NO%20GO%20NO/perpspilot/src/frontend/components/BottomTables.tsx#L137) hardcodes the status badge `PASS (Dry-Run)` for every order added to `recentSimulations`, even when the user initiates the order in **Live Testnet Mode**.
2. **`0% budget consumed today (Dry-Run active)` in Risk Cockpit:** [`src/frontend/components/RiskCockpit.tsx:149`](file:///C:/Users/NO%20GO%20NO/perpspilot/src/frontend/components/RiskCockpit.tsx#L149) hardcodes `"0% budget consumed today (Dry-Run active)"`.
3. **`click "Preview Order (Read-Only Simulation)"` in Empty State:** [`src/frontend/components/BottomTables.tsx:95`](file:///C:/Users/NO%20GO%20NO/perpspilot/src/frontend/components/BottomTables.tsx#L95) references the old button label.

---

## 5. Architecture and Codebase Findings (Phase C)

### 5.1 Dual-Stack Codebase Architecture
The repository is split into two distinct layers that do **not** fully share execution logic:
1. **Backend / CLI Layer (`src/config/`, `src/execution/`, `src/risk/`, `src/market/`, `src/sdk/`, `src/cli/`):**
   - Contains well-tested, modular classes: [`OrderPlanner`](file:///C:/Users/NO%20GO%20NO/perpspilot/src/execution/OrderPlanner.ts#L19-L263), [`ExecutionGuard`](file:///C:/Users/NO%20GO%20NO/perpspilot/src/execution/ExecutionGuard.ts#L16-L135), [`LiveOrderAdapter`](file:///C:/Users/NO%20GO%20NO/perpspilot/src/execution/LiveOrderAdapter.ts#L147-L407), [`OrderExecutor`](file:///C:/Users/NO%20GO%20NO/perpspilot/src/execution/OrderExecutor.ts#L50-L194), [`ReceiptVerifier`](file:///C:/Users/NO%20GO%20NO/perpspilot/src/execution/ReceiptVerifier.ts#L22-L120), [`OrderReconciler`](file:///C:/Users/NO%20GO%20NO/perpspilot/src/execution/OrderReconciler.ts#L23-L135), and [`quantization.ts`](file:///C:/Users/NO%20GO%20NO/perpspilot/src/risk/quantization.ts#L1-L148).
2. **Frontend SPA Layer (`src/frontend/`):**
   - Uses its own [`src/frontend/constants.ts`](file:///C:/Users/NO%20GO%20NO/perpspilot/src/frontend/constants.ts#L1-L161) and [`src/frontend/riskEngine.ts`](file:///C:/Users/NO%20GO%20NO/perpspilot/src/frontend/riskEngine.ts#L1-L266), while importing `LiveOrderAdapter` directly into [`OrderLifecycleModal.tsx`](file:///C:/Users/NO%20GO%20NO/perpspilot/src/frontend/components/OrderLifecycleModal.tsx#L3).

### 5.2 Architectural Split & Stale Constants (`[HIGH-06]`, `[MEDIUM-01]`, `[MEDIUM-02]`)
- **Divergent Factory Address (`[HIGH-06]`):**
  - Frontend [`src/frontend/constants.ts:12`](file:///C:/Users/NO%20GO%20NO/perpspilot/src/frontend/constants.ts#L12) defines `PERP_POOL_FACTORY_ADDRESS = '0xE631fAEE547baeE07353E290f0562ea67d856560'` (verified on-chain: `176 bytes` bytecode).
  - Backend [`src/config/constants.ts:6`](file:///C:/Users/NO%20GO%20NO/perpspilot/src/config/constants.ts#L6) defines `CONTRACTS.PERP_POOL_FACTORY = '0x86676287143A0A5bd2c9DFb0bef31adA99c1B8cC'` (verified on-chain: **0 bytes (`0x`)** — a decommissioned Hideki v1 address).
- **Dead Explorer Domain Linked in UI (`[MEDIUM-01]`):**
  - [`src/frontend/constants.ts:9`](file:///C:/Users/NO%20GO%20NO/perpspilot/src/frontend/constants.ts#L9) sets `SOMNIA_EXPLORER_URL = 'https://hideki.somniascan.org'`.
  - While [`BottomTables.tsx:236`](file:///C:/Users/NO%20GO%20NO/perpspilot/src/frontend/components/BottomTables.tsx#L236) explicitly warns judges that Somnia Hideki has no public Blockscout web explorer, [`Navbar.tsx:164`](file:///C:/Users/NO%20GO%20NO/perpspilot/src/frontend/components/Navbar.tsx#L164) and [`MarketsView.tsx:35`](file:///C:/Users/NO%20GO%20NO/perpspilot/src/frontend/components/MarketsView.tsx#L35) still render external `<a href="https://hideki.somniascan.org/...">` links that fail DNS resolution (`ENOTFOUND`), and [`useWallet.ts:445`](file:///C:/Users/NO%20GO%20NO/perpspilot/src/frontend/hooks/useWallet.ts#L445) registers `https://hideki.somniascan.org` in `blockExplorerUrls` when adding the chain to MetaMask.
- **Hardcoded Static Diagnostics (`[MEDIUM-02]`):**
  - [`src/frontend/components/DiagnosticsView.tsx:22-65,75`](file:///C:/Users/NO%20GO%20NO/perpspilot/src/frontend/components/DiagnosticsView.tsx#L22-L65) hardcodes Checks 1–7 (`"Mark price ~ $2,366.40 USDso"`, `"Discovered 21 perp pools"`, `"7/8 PASS • 0 FAIL"`) rather than binding to the live `markets` state from `useMarkets()`.

---

## 6. Live Testnet Integration and Order-Lifecycle Findings (Phase D.1 & D.2)

### 6.1 Network & Smart Contract Verification on Somnia Hideki v2
Independently verified via live JSON-RPC calls to `https://api.hideki2.infra.testnet.somnia.network` at block `36,338,080`:

| Resource | Configured Value | On-Chain RPC Verification Result | Status |
| :--- | :--- | :--- | :---: |
| **RPC Endpoint** | `https://api.hideki2.infra.testnet.somnia.network` | Responsive (`eth_blockNumber = 36338080`) | `PASS` |
| **Chain ID (`eth_chainId`)** | `50383` (`0xc4cf`) | `50383` | `PASS` |
| **Network ID (`net_version`)** | `50000259` | `"50000259"` | `PASS` |
| **ETH-PERP Pool** | `0xd6cb1dd58580b84d76068ac21594219ce03aeddf` | Bytecode exists (`321 bytes`, proxy) | `PASS` |
| **MarginBank** | `0x478769E1177C0773c43A593DCCc4Ad15F15F1394` | Bytecode exists (`176 bytes`, proxy) | `PASS` |
| **USDso Collateral Token** | `0xed7993A74dAe1e6656B704A424DcD8711aAf4F72` | Bytecode exists (`2,840 bytes`); `symbol() = "USDso"`, `decimals() = 18` | `PASS` |
| **PerpPoolFactory (Frontend)** | `0xE631fAEE547baeE07353E290f0562ea67d856560` | Bytecode exists (`176 bytes`, proxy) | `PASS` |
| **PerpPoolFactory (Backend)** | `0x86676287143A0A5bd2c9DFb0bef31adA99c1B8cC` | **No bytecode (`0x`, 0 bytes)** in `src/config/constants.ts:6` | `FAIL` |

### 6.2 End-to-End Browser Order Lifecycle Trace & Flaws
Tracing the browser order path from [`useMarkets.ts`](file:///C:/Users/NO%20GO%20NO/perpspilot/src/frontend/hooks/useMarkets.ts) -> [`TradeTicket.tsx`](file:///C:/Users/NO%20GO%20NO/perpspilot/src/frontend/components/TradeTicket.tsx) -> [`OrderLifecycleModal.tsx`](file:///C:/Users/NO%20GO%20NO/perpspilot/src/frontend/components/OrderLifecycleModal.tsx) -> [`LiveOrderAdapter.ts`](file:///C:/Users/NO%20GO%20NO/perpspilot/src/execution/LiveOrderAdapter.ts):

1. **Market Data Retrieval (`useMarkets.ts`):**
   - Queries GraphQL indexer (`https://hideki-dev.smk.somnia.host/v1/graphql`) and on-chain `tryGetHealthSnapshot()`, `getOrderBookParameters()`, and `getBookLevels()`.
   - Safely rejects placeholder oracle prices (`>= 1,000,000`) and marks unpriceable markets as `UNPRICEABLE` (`useMarkets.ts:154-169`).
2. **Wallet Connection (`useWallet.ts`):**
   - Uses `eth_accounts` on load (read-only) and `eth_requestAccounts` only when the user clicks `"Connect Wallet"`.
   - Never auto-submits or replays transactions on page load.
   - Correctly checks `chainId === 50383` and queries native `STT` balance, `USDso` wallet balance/allowance, and `MarginBank.getAccountState()` / `getAccountHealth()` / `getMarginStatus()`.
3. **Order Preparation & Calldata Construction (`OrderLifecycleModal.tsx:121-154`) — `[CRITICAL-01]`:**
   - When the user clicks `"Authorize & Sign in Wallet"`, `handleAuthorizeAndSign` executes:
     ```ts
     const adapter = new LiveOrderAdapter();
     const expiryNs = calculateGtcExpiryNs();
     const call = adapter.prepareOrderCall({
       planId: `live-${proposal.clientNonce}`,
       marketSymbol: proposal.market,
       poolAddress: market.poolAddress as Address,
       side: proposal.side,
       orderType: proposal.type === 'LIMIT' ? 'LIMIT' : 'POST_ONLY',
       selfMatching: 'CANCEL_TAKER',
       priceRaw: BigInt(Math.round(proposal.price * 1e6)) * 10n ** 12n,
       quantityRaw: BigInt(Math.round(proposal.amount * 1e8)) * 10n ** 10n,
       ...
       createdAtMs: Date.now(),
       expiresAtMs: Date.now() + 60_000,
       ...
     });
     ```
   - **Defect A (Guard & Planner Bypass):** `new LiveOrderAdapter()` defaults its internal `ExecutionGuard` to `dryRun: true` (`LiveOrderAdapter.ts:152`), and `prepareOrderCall` does **not** run `this.guard.evaluate(...)` — only `assertLiveExecutionAllowed` / `broadcastOrder` do (`LiveOrderAdapter.ts:251-283`), neither of which is called by `OrderLifecycleModal.tsx`!
   - **Defect B (`orderType` Corruption):** `TradeTicket.tsx:200` offers two tabs: `'LIMIT'` and `'MARKET'`. In `OrderLifecycleModal.tsx:129`, `'LIMIT'` maps to `'LIMIT'` (`0` in contract — which can execute immediately as a taker if marketable, contradicting `TradeTicket.tsx:453` and `OrderLifecycleModal.tsx:398` which state `POST_ONLY` maker-only execution is enforced), while selecting `'MARKET'` hides the Limit Price input (`TradeTicket.tsx:259`) and maps to `'POST_ONLY'` (`3` in contract) using the hidden, stale `priceInput` value!
   - **Defect C (18-Decimal Hardcoding Breaks `BTC-PERP` & `SOL-PERP`):** `quantityRaw` is computed as `BigInt(Math.round(proposal.amount * 1e8)) * 10n ** 10n` ($10^{18}$ scaling). However, `BTC-PERP` has `baseDecimals: 8` (`constants.ts:102`) and `SOL-PERP` has `baseDecimals: 9` (`constants.ts:135`). Submitting a `BTC-PERP` order in the UI would inflate `quantityRaw` by $10^{10}\times$!
4. **Post-Receipt State Verification (`OrderLifecycleModal.tsx:177-197`) — `[HIGH-01]`:**
   - After `verifyTransactionReceipt` succeeds and `decodePlacementFromReceipt` decodes `orderId`, if `decoded.fills.length === 0`, line 182 sets `setLiveState('ORDER_RESTING')`.
   - Immediately after (lines 188-196), it calls `const pos = await LiveOrderAdapter.getPositionOnchain(publicClient, MARGIN_BANK_ADDRESS, wallet.address, market.poolAddress)` and checks `if (pos) { setLiveState('POSITION_VERIFIED'); }`.
   - Because `LiveOrderAdapter.getPositionOnchain` (`LiveOrderAdapter.ts:386-406`) always returns `{ size: raw.size, avgEntryPrice: raw.avgEntryPrice, ... }` (an object, never `null` unless the RPC call throws), `if (pos)` is **always true** even when `pos.size === 0n`! Thus, a resting order with zero fills and zero position is immediately mislabeled as `'POSITION_VERIFIED'` (`"Position State Verified"`).

---

## 7. Risk-Control Findings (Phase D.3)

| Risk Control | Reported Rule | Actual Implementation & Audit Finding | Verdict |
| :--- | :--- | :--- | :---: |
| **Max Order Notional ($20)** | `<= $20.00 USDso` | Enforced in frontend [`riskEngine.ts:122-128`](file:///C:/Users/NO%20GO%20NO/perpspilot/src/frontend/riskEngine.ts#L122-L128) (`MAX_SINGLE_ORDER_NOTIONAL_USD = 20`). Not enforced on-chain; `ExecutionGuard` not called by `OrderLifecycleModal.tsx`. | `PARTIAL` (Frontend only) |
| **Max Leverage (20x)** | `<= 20x` | Enforced in [`riskEngine.ts:131-137`](file:///C:/Users/NO%20GO%20NO/perpspilot/src/frontend/riskEngine.ts#L131-L137) and slider max (`TradeTicket.tsx:365`). On-chain `MarginBank` enforces initial margin (`imfBps = 500` = 20x). | `PASS` |
| **Plan Freshness (60s TTL)** | Rejects plans older than 60s | **BROKEN IN UI (`[CRITICAL-01]`):** `TradeTicket.tsx:99` regenerates `timestamp: Date.now()` on every render, and `OrderLifecycleModal.tsx:140-141` sets `createdAtMs: Date.now(), expiresAtMs: Date.now() + 60_000` at click-time without calling `ExecutionGuard.evaluate()`. | `FAIL` |
| **Tick & Lot Quantization** | Zero rounding remainder | **BROKEN FOR TYPED INPUTS (`[CRITICAL-01]`):** `TradeTicket.tsx:281,311` only quantizes when clicking `-`/`+` or `%` buttons, not when typing into the `<input>`. `OrderLifecycleModal.tsx:131-133,227` never checks or aligns ticks/lots, yet hardcodes `"2. PRECISION_QUANTIZATION: PASS"`. | `FAIL` |
| **Collateral & Gas Checks** | Block live order if `STT == 0` or `Unlocked USDso < Required Margin` | Checked in `TradeTicket.tsx:468-474`, **but bypassable (`[HIGH-03]`)** by opening the modal in `"Preview Mode"` and clicking `"Switch to Live Testnet Mode"` (`OrderLifecycleModal.tsx:517-525`), which does not recompute `liveState`. | `FAIL` |
| **Position & Open-Order Awareness** | Track active orders & positions | **ABSENT IN UI (`[HIGH-02]`):** `useWallet.ts:63-64` never populates `positions` or `openOrders` (always `[]`). `BottomTables.tsx:296-310` hardcodes `"Zero resting orders"` / `"Zero active open positions"`. | `FAIL` |
| **`POST_ONLY` Semantics** | Maker-only execution | **MIS-MAPPED IN UI (`[CRITICAL-01]`):** Selecting `LIMIT` in `TradeTicket` sends `orderType = 0` (`LIMIT`), NOT `3` (`POST_ONLY`). Selecting `MARKET` sends `3` (`POST_ONLY`). Also, resting `POST_ONLY` orders **can fill later** when another trader crosses the book. | `FAIL` |
| **Cancellation & Position Closing** | Cancel resting orders; never imply cancel closes position | UI text in `BottomTables.tsx:249` and `OrderLifecycleModal.tsx:403` accurately states cancelling a resting order releases locked margin and does not close an open position. However, **there is no UI button to cancel a resting order (`[HIGH-02]`)**, and a cancellation request can always race with a counterparty fill on-chain. | `PARTIAL` |

---

## 8. Historical Blockchain Evidence Reconciliation (Phase E)

All Stage F.24 evidence displayed in [`BottomTables.tsx:157-269`](file:///C:/Users/NO%20GO%20NO/perpspilot/src/frontend/components/BottomTables.tsx#L157-L269) was independently reconciled against `https://api.hideki2.infra.testnet.somnia.network` using `f28_verify.mjs` and `f28_decode.mjs`:

### 8.1 Transaction 1 — Live Order Placement (`placeOrder`)
- **Transaction Hash:** `0xdea7fc0070e42b632ebe90fe57509abdf9cb464a98f73277b1c6cc85b92777e7`
- **Receipt Existence & Status:** Verified on-chain -> `status: "success"` (`1`)
- **Block & Ordering:** Block `36237119`, Transaction Index `1`, Block Timestamp `1793276914` (`2026-10-29T12:28:34.000Z`)
- **Sender (`from`):** `0xDc7c4aFBa201D2a3108061107346e9ff70f0Ca2c` (Nonce `2`)
- **Destination (`to`):** `0xd6cb1dd58580b84d76068ac21594219ce03aeddf` (`ETH-PERP` PerpPool)
- **Gas Used / Effective Price:** `1,674,788` gas @ `6,000,000,000` wei (`6 Gwei`)
- **Decoded Calldata (`PERP_POOL_PLACE_ORDER_ABI`):**
  - `functionName`: `placeOrder`
  - `isBid`: `true` (`BUY`)
  - `userData`: `0`
  - `price`: `2200000000000000000000` (`2,200.00 USDso` @ 18 decimals)
  - `quantity`: `4000000000000000` (`0.004 ETH` @ 18 decimals; notional = `8.80 USDso`)
  - `expireTimestampNs`: `3338540000000000000` (valid future GTC timestamp in nanoseconds)
  - `orderType`: `3` (`POST_ONLY`)
  - `selfMatchingOption`: `0` (`CANCEL_TAKER`)
  - `builder`: `0x0000000000000000000000000000000000000000`
  - `builderFeeBpsTimes1k`: `0`
- **Emitted Logs & Decoded Order ID (`@somnia-chain/markets-sdk` `decodePlaceOrder`):**
  - `Log[0]` (`MarginBank` `0x4787...1394`): Locked `0x061b31ab352c0000` = `440,000,000,000,000,000` wei = **`0.44 USDso`** initial margin (`5%` IMF on `8.80 USDso` notional).
  - `Log[1]` & `Log[2]` (`ETH-PERP` `0xd6cb...eddf`): Decoded via `decodePlaceOrder(receipt)` -> **`orderId: "5460236245818038181306"`** (`0x1280000000000a65dba`), **`fills: []`** (0 fills).
- **Historical On-Chain Order State at Block `36237119` (`getOrder(5460236245818038181306)`):**
  - Independently verified via archival `eth_call` at block `36237119`:
    `{ orderId: "5460236245818038181306", isBid: true, owner: "0xDc7c4aFBa201D2a3108061107346e9ff70f0Ca2c", price: "2200000000000000000000", fullQuantity: "4000000000000000", quantityRemaining: "4000000000000000", expireTimestampNs: "3338540000000000000" }`.
  - **Proof Order Rested:** `quantityRemaining === fullQuantity` (`0.004 ETH`) and `fills.length === 0`.

### 8.2 Transaction 2 — Live Order Cancellation (`cancelOrder`)
- **Transaction Hash:** `0x6c2661e69bf8593e117e9d7fafeb1f125640db5c4841243c648d22fe917ffea7`
- **Receipt Existence & Status:** Verified on-chain -> `status: "success"` (`1`)
- **Block & Ordering:** Block `36237214` (95 blocks / 10 seconds after placement), Transaction Index `0`, Block Timestamp `1793276924` (`2026-10-29T12:28:44.000Z`)
- **Sender (`from`):** `0xDc7c4aFBa201D2a3108061107346e9ff70f0Ca2c` (Nonce `3`)
- **Destination (`to`):** `0xd6cb1dd58580b84d76068ac21594219ce03aeddf` (`ETH-PERP` PerpPool)
- **Gas Used / Effective Price:** `136,005` gas @ `6,000,000,000` wei (`6 Gwei`)
- **Decoded Calldata:** `cancelOrder(5460236245818038181306)`
- **Emitted Logs:**
  - `Log[0]` (`MarginBank` `0x4787...1394`): Unlocked `0x061b31ab352c0000` = **`0.44 USDso`** collateral back to the operator's unlocked MarginBank balance.
  - `Log[1]` (`ETH-PERP` `0xd6cb...eddf`): OrderCancelled event for topic `0x0000000000000000000000000000000000000000000001280000000000a65dba` (`5460236245818038181306`).
- **Final Order, Position, and Collateral State at Latest Block:**
  - `ETH-PERP.getOrder(5460236245818038181306)` at `latest`: Reverts with `0x8080c2ed` (order removed from active orderbook storage upon cancellation).
  - `MarginBank.getPosition(operator, ETH-PERP)`: `{ size: "0", avgEntryPrice: "0", entryFundingIndex: "0", lastUpdatedTimestampNs: "0" }`.
  - `MarginBank.getAccountState(operator)`: `{ unlockedCollateralBalance: "20000000000000000000" (20.00 USDso), lockedCollateral: "0" (0.00 USDso), activePerpPools: [] }`.
  - Operator Wallet Balances: `99.984443854 STT`, `180.00 USDso` in wallet (`200.00 USDso` total across wallet + MarginBank).
- **Forensic Classification:** The Stage F.24 evidence in `BottomTables.tsx` is **100% authentic and accurately described as a placed-and-cancelled resting maker limit order** (not a filled trade or realized profit).

---

## 9. Test and Build Results (Phase F)

### 9.1 TypeScript Typecheck (`npm run typecheck`)
- **Command Executed:** `npm run typecheck` (`tsc --noEmit`)
- **Result:** **PASS** (Exit code `0`, 0 errors, 0 warnings).

### 9.2 Automated Test Suite (`npm test`)
- **Command Executed:** `npm test` (`vitest run`)
- **Result:** **PASS** (`9 passed` test files, `119 passed` tests, `0 failed`, duration `73.53s`).

| Test File | Tests Passed | Nature of Tests |
| :--- | :---: | :--- |
| `tests/config.test.ts` | `8 / 8` | Unit tests for config schema and environment parsing (`DRY_RUN` default `true`). |
| `tests/risk.test.ts` | `15 / 15` | Unit tests for leverage/notional bounds and TP/SL validation. |
| `tests/quantization.test.ts` | `17 / 17` | Unit tests for `alignPrice`, `alignQuantity`, `checkOrderQuantization`. |
| `tests/frontend-risk.test.ts` | `13 / 13` | Unit tests for frontend `evaluatePreTradeRisk`, `formatPrice`, `quantizePrice`. |
| `tests/f19-audit-fixes.test.ts` | `15 / 15` | Unit tests for placeholder price filtering (`>= 1,000,000`) and 18-decimal USDso formatting. |
| `tests/execution.test.ts` | `16 / 16` | Unit tests for `OrderPlanner`, `ExecutionGuard`, and simulated `OrderExecutor`. |
| `tests/live-adapter.test.ts` | `20 / 20` | Unit tests for `LiveOrderAdapter` ABI encoding, GTC nanosecond expiry, and `ExecutionGuard` blocking. |
| `tests/reconciliation.test.ts` | `12 / 12` | Unit tests for `ReceiptVerifier` and `OrderReconciler`. |
| `tests/network.test.ts` | `3 / 3` | **Live Testnet Integration Tests** against Somnia Hideki v2 RPC (`50383`) & GraphQL indexer. |

### 9.3 Test Coverage Gaps Identified
- **Zero React Component / DOM Tests:** There are no tests rendering `TradeTicket.tsx`, `OrderLifecycleModal.tsx`, `BottomTables.tsx`, `Navbar.tsx`, or `DiagnosticsView.tsx`. Because `OrderLifecycleModal.tsx` bypassed `OrderPlanner` and `ExecutionGuard` and implemented its own inline `prepareOrderCall` parameters (`[CRITICAL-01]`) and `if (pos)` check (`[HIGH-01]`), the 119 unit/integration tests passed while the browser modal contained critical bugs.

---

## 10. Security and Dependency Findings (Phase G)

1. **Secret & Private Key Hygiene (`PASS`):**
   - Safe inspection of key names only (values never printed) confirmed:
     - `.env` defines only non-secret configuration keys: `["NETWORK","CHAIN_ID","RPC_URL","WS_RPC_URL","INDEXER_URL","DRY_RUN","SYMBOL","PERP_SIDE","PERP_LEVERAGE","PERP_NOTIONAL_USDSO","PERP_TAKE_PROFIT_PCT","PERP_STOP_LOSS_PCT","PERP_SLIPPAGE_BPS"]`.
     - `.env.local` defines `["VERCEL_OIDC_TOKEN"]` and is ignored by both `.gitignore` (line 5) and `.vercelignore` (line 36).
   - No private keys, mnemonics, or API tokens exist anywhere in `src/`, `tests/`, or Git commit history.
2. **Client-Side Bundle Exposure (`PASS` with `LOW-01` Note):**
   - Vite only bundles `VITE_*` variables into the client bundle; no `VITE_*` secrets exist.
   - [`vite.config.ts:15`](file:///C:/Users/NO%20GO%20NO/perpspilot/vite.config.ts#L15) enables `sourcemap: true` in production builds (`[LOW-01]`). While `.vercelignore` excludes local `**/*.map` files, remote Vercel builds run `npm run build:frontend` with `sourcemap: true`.
3. **Wallet & Signing Security (`PASS` for Authorization Boundary, `FAIL` for Calldata Accuracy):**
   - The app never requests `eth_sign` or arbitrary off-chain signatures; it only invokes `walletClient.sendTransaction` (`OrderLifecycleModal.tsx:157`) to `market.poolAddress` with `value: 0` (no native STT transfer) after an explicit button click in the modal.
   - However, because of `[CRITICAL-01]`, the calldata sent to `walletClient.sendTransaction` for `MARKET` orders or non-18-decimal markets (`BTC-PERP`, `SOL-PERP`) does not match user intent.
4. **Dependency Audit (`npm audit`):**
   - Running read-only `npm audit --json` failed with transient network error `read ECONNRESET` against `https://registry.npmjs.org/-/npm/v1/security/advisories/bulk`. Direct inspection of `package.json` shows a minimal dependency footprint (`@somnia-chain/markets-sdk@^0.2.6`, `viem@^2.23.5`, `react@^19.2.4`, `react-dom@^19.2.4`, `lucide-react@^1.16.0`, `dotenv@^16.4.7`, `zod@^3.24.2`).

---

## 11. README, Demo, Social, Whitelist, and Submission Checklist (Phase H)

Each item is graded strictly as `PASS`, `FAIL`, `BLOCKED`, or `NOT VERIFIED` based on verified workspace and remote evidence:

| # | Bounty / Readiness Requirement | Status | Forensic Evidence & Notes |
| :-: | :--- | :---: | :--- |
| 1 | **Live Vercel Production Deployment (`perpspilot.vercel.app`)** | `PASS` | HTTP `200`, serves F.27 bundle `index-B-ojjp_u.js` (`1,825,918` bytes). |
| 2 | **Immutable F.27 Deployment Parity** | `PASS` | `perpspilot-kefd9s1b5-jamism123.vercel.app` serves identical HTML ETag & JS bundle. |
| 3 | **Public GitHub Repository Synced with Production (`origin/main`)** | `FAIL` | `origin/main` is at `a14e935` (2 commits behind local `HEAD` `783fa8a`; missing `c028b37` F.27 release). |
| 4 | **`README.md` Accuracy & Agreement with Production** | `FAIL` | `README.md:14,18,103,423-453,502-519` still claims `"Strict Dry-Run Read-Only Mode Active"`, shows `[TESTNET TRANSACTION HASH - PLACEHOLDER: 0x...]`, and cites `105 tests across 8 suites` instead of `119 tests across 9 suites`. |
| 5 | **`EVIDENCE.md` Populated with Verified On-Chain Hashes** | `FAIL` | `EVIDENCE.md:1-71` still contains `PENDING_STAGE_D` placeholders instead of `0xdea7fc...` and `0x6c2661...`. |
| 6 | **`DEMO_SCRIPT.md` Updated for Live Testnet Mode** | `FAIL` | `DEMO_SCRIPT.md:96` still contains `[STAGE D NOTE: ... Execution marked pending]`. |
| 7 | **Authentic On-Chain Lifecycle Evidence on Somnia Hideki v2** | `PASS` | `placeOrder` (`0xdea7fc...`), Order ID `5460236245818038181306`, and `cancelOrder` (`0x6c2661...`) verified on-chain. |
| 8 | **Browser Live Order Execution Path (`OrderLifecycleModal.tsx`)** | `FAIL` | Bypasses `OrderPlanner`/`ExecutionGuard`, mis-maps `MARKET`/`LIMIT`/`POST_ONLY`, hardcodes 18dp (`[CRITICAL-01]`), and falsely displays `POSITION_VERIFIED` when `size === 0n` (`[HIGH-01]`). |
| 9 | **Recorded Demo Video URL in `README.md`** | `BLOCKED` | `README.md:467` still has `[DEMO VIDEO URL - PLACEHOLDER: Insert YouTube / Loom / MP4 link here]`. |
| 10 | **2–3 Public X Posts Tagging `@DreamDEXSomnia`** | `BLOCKED` | Only draft templates exist in `README.md:539-579`; no published `https://x.com/...` URLs exist. |
| 11 | **DoraHacks Wallet Whitelist Approval Confirmation** | `NOT VERIFIED` | Cannot be verified from local repo; requires manual operator confirmation on DoraHacks/Discord. |
| 12 | **Final DoraHacks Bounty Submission** | `BLOCKED` | Blocked by items 3, 4, 5, 8, 9, 10, and 11 (Deadline: Nov 1, 2026). |

---

## 12. UX and Evaluator-Experience Findings

1. **Clear Disconnected / Wrong-Network States (`PASS`):** When no wallet is connected, `Navbar.tsx` clearly shows `"TESTNET READY"` and `"Connect Wallet"`, and `TradeTicket.tsx:457` disables `"Review & Sign Live Order"` with `"Connect your wallet on Somnia Hideki Testnet (50383) to submit a live order."`
2. **Honest Stage F.24 On-Chain Evidence Panel (`PASS`):** The `"On-Chain Evidence (F.24)"` tab (`BottomTables.tsx:157-269`) is immediately visible by default (`activeTab = 'evidence'`), provides one-click copy buttons for both transaction hashes and Order ID `5460236245818038181306`, explains why `hideki.somniascan.org` has no public web UI, and includes a copyable `curl` JSON-RPC command for judges.
3. **Confusing `MARKET` vs `LIMIT` vs `POST_ONLY` UX (`FAIL` — `[CRITICAL-01]`):** A judge testing the Trade Ticket who selects `MARKET` sees the Limit Price box disappear (`TradeTicket.tsx:259`), yet the modal submits a `POST_ONLY` limit order at the hidden price. Conversely, a judge who leaves `LIMIT` selected is told in the ticket footer (`TradeTicket.tsx:453`) and modal (`OrderLifecycleModal.tsx:398`) that `POST_ONLY` maker-only execution is enforced, yet the modal encodes `orderType = 0` (`LIMIT`).
4. **Inability to See or Cancel Newly Placed Live Orders (`FAIL` — `[HIGH-01]`, `[HIGH-02]`):** If a judge connects a funded Hideki v2 wallet and places a live resting order through the UI:
   - The modal immediately jumps from `ORDER_RESTING` to `POSITION_VERIFIED` (`OrderLifecycleModal.tsx:193`) even though no fill occurred and position size is `0`.
   - When the judge closes the modal and clicks `"Open Orders (0)"` or `"Positions (0)"` in `BottomTables.tsx`, both tabs still say `"Zero resting orders"` / `"Zero active open positions"`, and there is **no button in the UI to cancel the resting order**, leaving their collateral locked in `MarginBank` unless they use a CLI script!

---

## 13. Ranked Findings (`CRITICAL`, `HIGH`, `MEDIUM`, `LOW`)

| ID | Severity | Title | Primary Location |
| :--- | :---: | :--- | :--- |
| **`CRITICAL-01`** | **CRITICAL** | `OrderLifecycleModal.tsx` bypasses `OrderPlanner`, `ExecutionGuard`, and quantization, corrupts `LIMIT` vs `MARKET` vs `POST_ONLY` order types, ignores 60s plan freshness, and hardcodes 18-decimal `quantityRaw` scaling. | `src/frontend/components/OrderLifecycleModal.tsx:121-154`, `src/frontend/components/TradeTicket.tsx:200,259,281,311` |
| **`HIGH-01`** | **HIGH** | `OrderLifecycleModal.tsx` falsely sets `POSITION_VERIFIED` when `MarginBank.getPosition` returns `{ size: 0n }` after a resting order with zero fills. | `src/frontend/components/OrderLifecycleModal.tsx:188-197`, `src/execution/LiveOrderAdapter.ts:386-406` |
| **`HIGH-02`** | **HIGH** | `useWallet.ts` and `BottomTables.tsx` never fetch or render live open orders or positions (`positions: []`, `openOrders: []`) and provide no UI to cancel a resting order. | `src/frontend/hooks/useWallet.ts:63-64,181-200`, `src/frontend/components/BottomTables.tsx:296-310` |
| **`HIGH-03`** | **HIGH** | Switching from `"Preview Mode"` to `"Live Testnet Mode"` inside `OrderLifecycleModal.tsx` bypasses `INSUFFICIENT_GAS` and `INSUFFICIENT_COLLATERAL` button locks. | `src/frontend/components/OrderLifecycleModal.tsx:41-67,517-535` |
| **`HIGH-04`** | **HIGH** | Public GitHub `origin/main` is 2 commits behind local `HEAD`/production (`a14e935` vs `c028b37`/`783fa8a`), and `README.md`, `EVIDENCE.md`, and `DEMO_SCRIPT.md` still state `DRY_RUN=true` / `PENDING_STAGE_D`. | `README.md:14,18,103,423-453`, `EVIDENCE.md:1-71`, `DEMO_SCRIPT.md:96` |
| **`HIGH-05`** | **HIGH** | Missing mandatory DoraHacks bounty deliverables: unrecorded demo video, unpublished 2–3 X posts (`@DreamDEXSomnia`), unverified whitelist status, and unsubmitted DoraHacks form. | `README.md:467,539-579` |
| **`HIGH-06`** | **HIGH** | Backend `src/config/constants.ts` still points `PERP_POOL_FACTORY` to dead v1 address `0x86676287143A0A5bd2c9DFb0bef31adA99c1B8cC` (`0` bytes bytecode on Hideki v2). | `src/config/constants.ts:6` |
| **`MEDIUM-01`** | **MEDIUM** | Dead block explorer URL (`https://hideki.somniascan.org`) linked in `Navbar.tsx`, `MarketsView.tsx`, and MetaMask chain config (`useWallet.ts`). | `src/frontend/constants.ts:9`, `src/frontend/components/Navbar.tsx:164`, `src/frontend/components/MarketsView.tsx:35`, `src/frontend/hooks/useWallet.ts:445` |
| **`MEDIUM-02`** | **MEDIUM** | Stale dry-run labels (`PASS (Dry-Run)`, `0% budget consumed today (Dry-Run active)`) and hardcoded static numbers in `DiagnosticsView.tsx`. | `src/frontend/components/BottomTables.tsx:95,137`, `src/frontend/components/RiskCockpit.tsx:149`, `src/frontend/components/DiagnosticsView.tsx:22-65,75` |
| **`LOW-01`** | **LOW** | `Math.random()` used for `clientNonce` (`TradeTicket.tsx` recreates `proposal` every render) and `sourcemap: true` enabled in `vite.config.ts`. | `src/frontend/components/TradeTicket.tsx:87-102`, `src/execution/OrderPlanner.ts:94`, `vite.config.ts:15` |

---

## 14. Evidence and File/Line References for Every Code Finding

1. **`CRITICAL-01` — Browser Live Order Construction & Guard Bypass:**
   - [`src/frontend/components/OrderLifecycleModal.tsx:121-154`](file:///C:/Users/NO%20GO%20NO/perpspilot/src/frontend/components/OrderLifecycleModal.tsx#L121-L154): Instantiates `new LiveOrderAdapter()`, calls `adapter.prepareOrderCall({...})` directly without calling `OrderPlanner.createOrderPlan()` or `ExecutionGuard.evaluate()`.
   - [`src/frontend/components/OrderLifecycleModal.tsx:129`](file:///C:/Users/NO%20GO%20NO/perpspilot/src/frontend/components/OrderLifecycleModal.tsx#L129): `orderType: proposal.type === 'LIMIT' ? 'LIMIT' : 'POST_ONLY'` (sends `LIMIT` (`0`) when `LIMIT` is selected; sends `POST_ONLY` (`3`) when `MARKET` is selected).
   - [`src/frontend/components/OrderLifecycleModal.tsx:131-133`](file:///C:/Users/NO%20GO%20NO/perpspilot/src/frontend/components/OrderLifecycleModal.tsx#L131-L133): Hardcodes `priceRaw: BigInt(Math.round(proposal.price * 1e6)) * 10n ** 12n` and `quantityRaw: BigInt(Math.round(proposal.amount * 1e8)) * 10n ** 10n` instead of using `market.baseDecimals` / `market.quoteDecimals` and `alignPrice` / `alignQuantity`.
   - [`src/frontend/components/OrderLifecycleModal.tsx:140-141`](file:///C:/Users/NO%20GO%20NO/perpspilot/src/frontend/components/OrderLifecycleModal.tsx#L140-L141): Sets `createdAtMs: Date.now(), expiresAtMs: Date.now() + 60_000` at signing time instead of checking `proposal.timestamp`.
   - [`src/frontend/components/OrderLifecycleModal.tsx:227-233`](file:///C:/Users/NO%20GO%20NO/perpspilot/src/frontend/components/OrderLifecycleModal.tsx#L227-L233): Hardcodes `"2. PRECISION_QUANTIZATION: PASS — Zero floating-point rounding remainder"`.
   - [`src/frontend/components/TradeTicket.tsx:281,311`](file:///C:/Users/NO%20GO%20NO/perpspilot/src/frontend/components/TradeTicket.tsx#L281): `onChange={(e) => setPriceInput(e.target.value)}` and `onChange={(e) => setAmountInput(e.target.value)}` accept unquantized text input.
2. **`HIGH-01` — False `POSITION_VERIFIED` Status on Zero-Size Position:**
   - [`src/frontend/components/OrderLifecycleModal.tsx:188-197`](file:///C:/Users/NO%20GO%20NO/perpspilot/src/frontend/components/OrderLifecycleModal.tsx#L188-L197): `const pos = await LiveOrderAdapter.getPositionOnchain(...); if (pos) { setLivePosition(pos); setLiveState('POSITION_VERIFIED'); }` without checking `pos.size !== 0n`.
   - [`src/execution/LiveOrderAdapter.ts:386-406`](file:///C:/Users/NO%20GO%20NO/perpspilot/src/execution/LiveOrderAdapter.ts#L386-L406): `getPositionOnchain` returns `{ size: raw.size, ... }` (always truthy when RPC succeeds).
3. **`HIGH-02` — Empty Open Orders & Positions in UI and Missing Cancel Action:**
   - [`src/frontend/hooks/useWallet.ts:63-64,181-200`](file:///C:/Users/NO%20GO%20NO/perpspilot/src/frontend/hooks/useWallet.ts#L63-L64): Initializes `positions: []`, `openOrders: []` and never updates them in `updateBalances`.
   - [`src/frontend/components/BottomTables.tsx:296-310`](file:///C:/Users/NO%20GO%20NO/perpspilot/src/frontend/components/BottomTables.tsx#L296-L310): Renders static empty-state text for `orders` and `positions` tabs.
4. **`HIGH-03` — Modal Mode-Switch Readiness Bypass:**
   - [`src/frontend/components/OrderLifecycleModal.tsx:41-67,517-535`](file:///C:/Users/NO%20GO%20NO/perpspilot/src/frontend/components/OrderLifecycleModal.tsx#L41-L67): `liveState` is initialized once via `useState(getInitialLiveState)` when `initialLiveMode` is `false` (`'AWAITING_USER_CONFIRMATION'`); clicking `"Switch to Live Testnet Mode"` at line 520 calls `setIsLiveMode(true)` without re-evaluating `getInitialLiveState()`.
5. **`HIGH-04` — Unpushed Git Commits & Stale Documentation:**
   - [`README.md:14,18,103-104,356,423,429-453,502,506-510,519`](file:///C:/Users/NO%20GO%20NO/perpspilot/README.md#L14-L18)
   - [`EVIDENCE.md:1-71`](file:///C:/Users/NO%20GO%20NO/perpspilot/EVIDENCE.md#L1-L71)
   - [`DEMO_SCRIPT.md:96`](file:///C:/Users/NO%20GO%20NO/perpspilot/DEMO_SCRIPT.md#L96)
6. **`HIGH-06` — Dead v1 Factory Address in Backend Config:**
   - [`src/config/constants.ts:6`](file:///C:/Users/NO%20GO%20NO/perpspilot/src/config/constants.ts#L6): `PERP_POOL_FACTORY: "0x86676287143A0A5bd2c9DFb0bef31adA99c1B8cC"` vs [`src/frontend/constants.ts:12`](file:///C:/Users/NO%20GO%20NO/perpspilot/src/frontend/constants.ts#L12): `'0xE631fAEE547baeE07353E290f0562ea67d856560'`.
7. **`MEDIUM-01` — Dead Explorer Links:**
   - [`src/frontend/constants.ts:9`](file:///C:/Users/NO%20GO%20NO/perpspilot/src/frontend/constants.ts#L9), [`src/frontend/components/Navbar.tsx:164`](file:///C:/Users/NO%20GO%20NO/perpspilot/src/frontend/components/Navbar.tsx#L164), [`src/frontend/components/MarketsView.tsx:35`](file:///C:/Users/NO%20GO%20NO/perpspilot/src/frontend/components/MarketsView.tsx#L35), [`src/frontend/hooks/useWallet.ts:445`](file:///C:/Users/NO%20GO%20NO/perpspilot/src/frontend/hooks/useWallet.ts#L445).
8. **`MEDIUM-02` — Residual Dry-Run & Hardcoded UI Strings:**
   - [`src/frontend/components/BottomTables.tsx:95,137`](file:///C:/Users/NO%20GO%20NO/perpspilot/src/frontend/components/BottomTables.tsx#L95), [`src/frontend/components/RiskCockpit.tsx:149`](file:///C:/Users/NO%20GO%20NO/perpspilot/src/frontend/components/RiskCockpit.tsx#L149), [`src/frontend/components/DiagnosticsView.tsx:22-65,75`](file:///C:/Users/NO%20GO%20NO/perpspilot/src/frontend/components/DiagnosticsView.tsx#L22-L65).
9. **`LOW-01` — Nonce Generation & Sourcemaps:**
   - [`src/frontend/components/TradeTicket.tsx:87-102`](file:///C:/Users/NO%20GO%20NO/perpspilot/src/frontend/components/TradeTicket.tsx#L87-L102), [`src/execution/OrderPlanner.ts:94`](file:///C:/Users/NO%20GO%20NO/perpspilot/src/execution/OrderPlanner.ts#L94), [`vite.config.ts:15`](file:///C:/Users/NO%20GO%20NO/perpspilot/vite.config.ts#L15).

---

## 15. Distinction Between Verification Categories

| Category | Items Included |
| :--- | :--- |
| **1. Independently Verified (Live Network / HTTP / CLI Execution in F.28)** | • HTTP `200` status, HTML ETag (`"099f295d4b5248a442c6146e6631b045"`), SPA routes (`/`, `/markets`, `/diagnostics`), and byte-for-byte bundle parity (`index-B-ojjp_u.js`, `1,825,918` bytes) across `perpspilot.vercel.app` and `perpspilot-kefd9s1b5-jamism123.vercel.app`.<br>• Somnia Hideki v2 RPC (`chainId = 50383`, `net_version = 50000259`, block `36,338,080`) and GraphQL indexer (`21` pools discovered).<br>• On-chain bytecode existence for `ETH-PERP`, `MarginBank`, `USDso` (`symbol() = "USDso"`, `decimals() = 18`), and `PerpPoolFactory` (`0xE631...6560` = `176 bytes`; `0x8667...8cC` = `0 bytes`).<br>• Full on-chain transaction receipts, calldata, emitted logs, archival order state at block `36237119`, and current operator (`0xDc7c...Ca2c`) balances/position for Stage F.24 tx `0xdea7fc...`, tx `0x6c2661...`, and Order ID `5460236245818038181306`.<br>• Local vs. remote Git commit hashes (`HEAD = 783fa8a`, `HEAD~1 = c028b37`, `origin/main = a14e935`).<br>• `npm run typecheck` (`0` errors) and `npm test` (`119/119` passed).<br>• Key-name-only inspection of `.env`, `.env.local`, and `.env.example`. |
| **2. Source-Inspected (Static Code & Bundle Analysis in F.28)** | • All 38 TypeScript/React source files in `src/` and 9 test files in `tests/`.<br>• Identification of `[CRITICAL-01]`, `[HIGH-01]`, `[HIGH-02]`, `[HIGH-03]`, `[HIGH-04]`, `[HIGH-06]`, `[MEDIUM-01]`, `[MEDIUM-02]`, and `[LOW-01]`. |
| **3. Previously Reported (In Earlier Stage F.22–F.27 Reports)** | • Vercel Deployment ID `dpl_BbigZLepvpcfpeVUNxcnchxsube8` (reported in `PERPSPILOT_STAGE_F27_PRODUCTION_RELEASE_REPORT.md`; deployment URL `perpspilot-kefd9s1b5-jamism123.vercel.app` was independently verified via HTTPS).<br>• Earlier F.26/F.27 claims that browser live execution and risk guards were fully wired end-to-end (**refuted** by source inspection in `[CRITICAL-01]`, `[HIGH-01]`, `[HIGH-02]`, `[HIGH-03]`). |
| **4. Not Verified (Requires External Access or Prohibited Actions)** | • Interactive browser wallet signing and live order submission from the browser UI (prohibited by read-only safety rules).<br>• `npm audit` remote advisory query (failed due to `ECONNRESET` from `registry.npmjs.org`).<br>• Operator's DoraHacks whitelist approval status (requires external DoraHacks/Discord check).<br>• Demo video, X posts (`@DreamDEXSomnia`), and DoraHacks submission (not yet created/published). |

---

## 16. Prioritized Remediation Plan with Exact Next Actions

Do **not** execute these steps until explicitly authorized by the operator:

### Priority 1 — Fix Critical & High Browser Trading Bugs (Code Remediation)
1. **Fix `OrderLifecycleModal.tsx` Order Construction & Guard Integration (`[CRITICAL-01]`):**
   - Route live order preparation through `OrderPlanner.createOrderPlan(...)` and `ExecutionGuard.evaluate(...)` (with `dryRun: false` in Live Mode) so tick/lot quantization (`alignPrice`, `alignQuantity`), `$20` notional cap, `20x` leverage cap, `planDigest`, and the 60-second plan freshness TTL (measured from when the user opened the modal, not when they clicked sign) are strictly enforced.
   - Use `market.baseDecimals` and `market.quoteDecimals` ( via `parseUnits`) instead of hardcoded `10n ** 12n` / `10n ** 10n` so `BTC-PERP` (8dp) and `SOL-PERP` (9dp) scale accurately.
   - Align `TradeTicket.tsx` and `OrderLifecycleModal.tsx` order types: make the maker-safe mode explicitly `'POST_ONLY'` (`orderType = 3`), or properly support `'LIMIT'` (`0`) and `'POST_ONLY'` (`3`) without silently converting `'MARKET'` into `'POST_ONLY'` at a hidden price.
   - Enforce tick/lot quantization in `TradeTicket.tsx` (or block unquantized inputs in `riskEngine.ts` using `checkOrderQuantization`).
2. **Fix Post-Trade Position Status & Order Cancellation UI (`[HIGH-01]`, `[HIGH-02]`):**
   - In `OrderLifecycleModal.tsx:191`, change `if (pos)` to `if (pos && pos.size !== 0n)` so resting orders with `0` fills remain in state `'ORDER_RESTING'` (`"Order Resting on Book"`).
   - Add an explicit `"Cancel Resting Order"` button inside `OrderLifecycleModal.tsx` (when `liveState === 'ORDER_RESTING'` and `liveOrderId` is known) and in `BottomTables.tsx` (`Open Orders` tab) wired to `adapter.prepareCancelOrderCall(poolAddress, orderId)` + `walletClient.sendTransaction`, and populate `wallet.positions` / `wallet.openOrders`.
3. **Fix Modal Mode-Switch Readiness Re-Evaluation (`[HIGH-03]`):**
   - In `OrderLifecycleModal.tsx`, add a `useEffect` that recomputes `liveState` via `getInitialLiveState()` whenever `isLiveMode`, `wallet.sttRaw`, or `wallet.unlockedCollateralRaw` changes.
4. **Update Stale Constants & UI Labels (`[HIGH-06]`, `[MEDIUM-01]`, `[MEDIUM-02]`):**
   - Update `src/config/constants.ts:6` `PERP_POOL_FACTORY` to `'0xE631fAEE547baeE07353E290f0562ea67d856560'`.
   - Remove dead `https://hideki.somniascan.org` links from `Navbar.tsx` and `MarketsView.tsx`.
   - Replace hardcoded `PASS (Dry-Run)` in `BottomTables.tsx:137`, `Dry-Run active` in `RiskCockpit.tsx:149`, and static numbers in `DiagnosticsView.tsx`.

### Priority 2 — Synchronize Documentation, GitHub `origin/main`, and Vercel Production
5. **Update `README.md`, `EVIDENCE.md`, and `DEMO_SCRIPT.md` (`[HIGH-04]`):**
   - Replace all `DRY_RUN=true` / `PENDING_STAGE_D` placeholders in `README.md`, `EVIDENCE.md`, and `DEMO_SCRIPT.md` with the verified Stage F.24 on-chain transaction hashes (`0xdea7fc...`, `0x6c2661...`), Order ID `5460236245818038181306`, and current test count (`119+ tests across 9 suites`).
6. **Commit, Push to GitHub `origin/main`, and Redeploy to Vercel (`[HIGH-04]`):**
   - Clean up untracked scratch stage reports as desired, commit the code and documentation fixes, push `main` to `https://github.com/JimmyOgb/PerpsPilot`, and deploy the updated release to `https://perpspilot.vercel.app`.

### Priority 3 — Complete Mandatory External Bounty Deliverables (`[HIGH-05]`)
7. **Record Demo Video:** Record the 2–3 minute walkthrough of `https://perpspilot.vercel.app` following `DEMO_SCRIPT.md`, upload it, and add the live URL to `README.md`.
8. **Publish 2–3 X Posts Tagging `@DreamDEXSomnia`:** Publish the builder journey posts with screenshots/video and links to `https://perpspilot.vercel.app` and `https://github.com/JimmyOgb/PerpsPilot`, and record the post URLs in `README.md`.
9. **Verify DoraHacks Whitelist & Submit:** Confirm DoraHacks wallet whitelist status and submit the completed package before the November 1, 2026 deadline.

---

## 17. Explicit Statement of All Operations Not Performed

In strict compliance with the Stage F.28 Non-Negotiable Safety Rules:
1. **No Repository Source or Configuration Files Were Edited:** Zero tracked files in `C:\Users\NO GO NO\perpspilot` were modified, staged, or deleted (`git status` verified clean before and after the audit).
2. **No Git History or Remote Operations Were Mutated:** No `git commit`, `git push`, `git reset`, `git stash`, `git checkout`, or branch modifications were performed.
3. **No Dependencies Were Installed, Upgraded, or Removed:** No `npm install`, `npm update`, or package modifications were executed.
4. **No Vercel Deployments or Settings Were Changed:** Only read-only HTTPS `GET` requests were made to `https://perpspilot.vercel.app` and `https://perpspilot-kefd9s1b5-jamism123.vercel.app`.
5. **No Wallet Connections, Signatures, or Blockchain Transactions Were Broadcast:** Only read-only JSON-RPC calls (`eth_chainId`, `net_version`, `eth_blockNumber`, `eth_getCode`, `eth_getBalance`, `eth_getTransactionByHash`, `eth_getTransactionReceipt`, `eth_getBlockByNumber`, `eth_call`) and read-only GraphQL queries were executed. No orders were placed, modified, or cancelled, and no token approvals, deposits, or withdrawals were performed.
6. **No Secrets Were Printed or Exposed:** Private keys, seed phrases, authentication tokens, cookies, and `.env` / `.env.local` values were never read into output or printed.
7. **No External Social or Bounty Actions Were Taken:** No X posts were published, no pull requests were opened, and no DoraHacks submission or registration forms were submitted.
