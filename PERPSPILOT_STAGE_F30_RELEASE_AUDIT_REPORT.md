# PerpsPilot Stage F.30 — Final Read-Only Release Audit Report

**Audit Timestamp:** 2026-10-29T17:31:00+01:00  
**Workspace:** `C:\Users\NO GO NO\perpspilot`  
**Repository:** `https://github.com/JimmyOgb/PerpsPilot`  
**Canonical Production:** `https://perpspilot.vercel.app`  
**Immutable F.27 Deployment:** `https://perpspilot-kefd9s1b5-jamism123.vercel.app`  
**Network:** Somnia Hideki v2 Testnet (Chain ID: `50383`, Network ID: `50000259`, RPC: `https://api.hideki2.infra.testnet.somnia.network`)  
**Audit Mode:** Strictly Read-Only (0 commits created, 0 Git pushes, 0 deployments, 0 transactions broadcast, 0 secrets exposed)  

---

## 1. Executive Summary & Verdict

### Final Verdict: `GO — RELEASE REVIEW PASSED`

> **Scope Note:** A `GO` verdict confirms that the local implementation, risk safeguards, contract bindings, multi-market scaling, and test suites have passed a rigorous, independent read-only audit and are fully verified for release. It does **not** authorize or perform automated commits, pushes, deployments, transactions, or submissions.

The critical and high-severity defects identified in the Stage F.28 audit have been thoroughly remediated in the local working tree:
1. **Mandatory Planning & Guard Pipeline Restored:** Live order signing now strictly evaluates `OrderPlanner.createOrderPlan()` and `ExecutionGuard.evaluate({ dryRun: false })` before any wallet prompt.
2. **Order Type Semantics Fixed:** Contract enum mapping matches `@somnia-chain/markets-sdk` (`LIMIT: 0`, `POST_ONLY: 3`); `MARKET` is cleanly disabled with explanatory disclosures.
3. **Multi-Market Precision & Decimal Scaling Repaired:** Eliminated hardcoded 18-decimal scaling; fully supports ETH (18dp), BTC (8dp), and SOL (9dp) with rigorous BigInt grid quantization.
4. **On-Chain Position Struct Truthiness Corrected:** Zero-size positions returned by `MarginBank.getPosition()` are no longer falsely reported as active; resting orders and filled positions have distinct lifecycle states.
5. **Resting Order Cancellation Implemented:** `PerpPool.cancelOrder(uint128)` calldata generation (`0xdbc91396`) verified against SDK.
6. **Dead Explorer URLs & Stale Badges Cleaned:** Dead domain `hideki.somniascan.org` eliminated; misleading dry-run badges removed.
7. **Complete Test Suite Green:** 139 / 139 automated tests passed across 10 suites (including 20 targeted remediation tests and 3 live testnet integration tests); TypeScript typecheck and Vite frontend build succeed with zero errors.

---

## 2. Local Baseline & Provenance

### Git Status & Working Tree
- **Current Branch:** `main`
- **Local HEAD:** `783fa8a91b2c384ab7452552fbe24aac24ce4c31` (`docs: add Stage F.27 production release report and vercel ignore optimization`)
- **Upstream Divergence:** Local `main` is ahead of `origin/main` by 2 commits:
  - `c028b37` — `fix: enable live testnet trading mode on Somnia Hideki v2`
  - `783fa8a` — `docs: add Stage F.27 production release report and vercel ignore optimization`
- **Modified Tracked Files (17):**
  - `DEMO_SCRIPT.md`
  - `EVIDENCE.md`
  - `README.md`
  - `src/config/constants.ts`
  - `src/execution/LiveOrderAdapter.ts`
  - `src/execution/OrderPlanner.ts`
  - `src/frontend/App.tsx`
  - `src/frontend/components/BottomTables.tsx`
  - `src/frontend/components/DiagnosticsView.tsx`
  - `src/frontend/components/MarketsView.tsx`
  - `src/frontend/components/Navbar.tsx`
  - `src/frontend/components/OrderLifecycleModal.tsx`
  - `src/frontend/components/RiskCockpit.tsx`
  - `src/frontend/components/TradeTicket.tsx`
  - `src/frontend/constants.ts`
  - `src/frontend/hooks/useWallet.ts`
  - `src/frontend/types.ts`
- **Key Untracked Files:**
  - `tests/f29-remediation.test.ts` (Targeted verification test suite)
  - `PERPSPILOT_STAGE_F28_COMPREHENSIVE_AUDIT_REPORT.md` (Specification)
  - `PERPSPILOT_STAGE_F29_REMEDIATION_REPORT.md` (Implementation report)
  - `PERPSPILOT_STAGE_F30_RELEASE_AUDIT_REPORT.md` (This document)

---

## 3. Finding-by-Finding Resolution Matrix

| Finding ID | Severity | Description | File & Line Reference | Resolution Status | Verified By |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **F28-CRIT-01** | CRITICAL | Live signing in modal bypassed `OrderPlanner` & `ExecutionGuard` | [`OrderLifecycleModal.tsx#L269-L297`](file:///C:/Users/NO%20GO%20NO/perpspilot/src/frontend/components/OrderLifecycleModal.tsx#L269-L297) | **RESOLVED** | Pre-flight validation calls `buildCanonicalPlan()` and `guard.evaluate({ dryRun: false })` |
| **F28-CRIT-02** | CRITICAL | Plan freshness reset at signing; no TTL rejection | [`OrderLifecycleModal.tsx#L225-L230`](file:///C:/Users/NO%20GO%20NO/perpspilot/src/frontend/components/OrderLifecycleModal.tsx#L225-L230), [`OrderLifecycleModal.tsx#L260-L266`](file:///C:/Users/NO%20GO%20NO/perpspilot/src/frontend/components/OrderLifecycleModal.tsx#L260-L266) | **RESOLVED** | Retains original `proposal.timestamp`; rejects plans older than 60s |
| **F28-CRIT-03** | CRITICAL | Order type enum misaligned; MARKET became POST_ONLY | [`TradeTicket.tsx#L202-L235`](file:///C:/Users/NO%20GO%20NO/perpspilot/src/frontend/components/TradeTicket.tsx#L202-L235), [`LiveOrderAdapter.ts#L49-L55`](file:///C:/Users/NO%20GO%20NO/perpspilot/src/execution/LiveOrderAdapter.ts#L49-L55) | **RESOLVED** | `POST_ONLY` maps to `3`, `LIMIT` to `0`; `MARKET` disabled with disclosure |
| **F28-CRIT-04** | CRITICAL | Base token decimals hardcoded to 18; brittle math | [`OrderPlanner.ts#L120-L150`](file:///C:/Users/NO%20GO%20NO/perpspilot/src/execution/OrderPlanner.ts#L120-L150) | **RESOLVED** | Uses market-specific `baseDecimals`/`quoteDecimals` via `parseUnits`/`formatUnits` |
| **F28-HIGH-01** | HIGH | `MarginBank.getPosition` struct truthiness false-positive | [`OrderLifecycleModal.tsx#L350-L360`](file:///C:/Users/NO%20GO%20NO/perpspilot/src/frontend/components/OrderLifecycleModal.tsx#L350-L360), [`useWallet.ts#L254-L266`](file:///C:/Users/NO%20GO%20NO/perpspilot/src/frontend/hooks/useWallet.ts#L254-L266) | **RESOLVED** | Checks `pos !== null && pos.size !== 0n`; separates resting order from position |
| **F28-HIGH-02** | HIGH | No in-app cancellation mechanism for resting orders | [`LiveOrderAdapter.ts#L258-L276`](file:///C:/Users/NO%20GO%20NO/perpspilot/src/execution/LiveOrderAdapter.ts#L258-L276), [`OrderLifecycleModal.tsx#L391-L428`](file:///C:/Users/NO%20GO%20NO/perpspilot/src/frontend/components/OrderLifecycleModal.tsx#L391-L428) | **RESOLVED** | Implemented `prepareCancelOrderCall(pool, orderId)` & modal "Cancel Resting Order" button |
| **F28-MED-01** | MEDIUM | Dead explorer URL `hideki.somniascan.org` in UI | [`MarketsView.tsx#L70-L80`](file:///C:/Users/NO%20GO%20NO/perpspilot/src/frontend/components/MarketsView.tsx#L70-L80), [`Navbar.tsx#L45-L55`](file:///C:/Users/NO%20GO%20NO/perpspilot/src/frontend/components/Navbar.tsx#L45-L55), [`useWallet.ts#L70-L85`](file:///C:/Users/NO%20GO%20NO/perpspilot/src/frontend/hooks/useWallet.ts#L70-L85) | **RESOLVED** | Removed broken links; set `blockExplorerUrls: []` |
| **F28-MED-02** | MEDIUM | Factory address divergence between frontend & backend | [`src/config/constants.ts#L8-L25`](file:///C:/Users/NO%20GO%20NO/perpspilot/src/config/constants.ts#L8-L25), [`src/frontend/constants.ts#L6-L12`](file:///C:/Users/NO%20GO%20NO/perpspilot/src/frontend/constants.ts#L6-L12) | **RESOLVED** | Exported verified v2 `0xE631fAEE547baeE07353E290f0562ea67d856560` across both modules |
| **F28-MED-03** | MEDIUM | Residual Dry-Run badges in RiskCockpit & BottomTables | [`RiskCockpit.tsx#L85`](file:///C:/Users/NO%20GO%20NO/perpspilot/src/frontend/components/RiskCockpit.tsx#L85), [`BottomTables.tsx#L75-L85`](file:///C:/Users/NO%20GO%20NO/perpspilot/src/frontend/components/BottomTables.tsx#L75-L85) | **RESOLVED** | Cleaned labels to "(Risk Budget Safe)" and "PASS (Pre-Trade Gate)" |
| **F28-DOC-01** | LOW | Placeholder `PENDING_STAGE_D` tokens in `EVIDENCE.md` | [`EVIDENCE.md#L12-L95`](file:///C:/Users/NO%20GO%20NO/perpspilot/EVIDENCE.md#L12-L95) | **RESOLVED** | Populated with verified Stage F.24 on-chain transaction hashes & order IDs |

---

## 4. Deep-Dive Code Tracing

### A. Order Planning & Execution Guard Pipeline
- **Planning Verification:** [`OrderPlanner.createOrderPlan`](file:///C:/Users/NO%20GO%20NO/perpspilot/src/execution/OrderPlanner.ts#L86) validates side (`BUY_LONG` / `SELL_SHORT`), order execution type (`LIMIT`, `POST_ONLY`), chain ID (`50383`), positive finite numbers for price/quantity, lot and tick alignments, and maximum testnet safety notional ($20.00).
- **Execution Guard Assertion:** [`ExecutionGuard.evaluate`](file:///C:/Users/NO%20GO%20NO/perpspilot/src/risk/ExecutionGuard.ts#L52) asserts that `dryRun` is explicitly authorized (`false`), connected wallet matches authorized signer, plan age is $\le 60\text{ s}$ (`maxPlanAgeMs: 60_000`), notional $\le \$20.00$, and cryptographic `planDigest` matches canonical parameters.
- **Immediate Pre-Sign Revalidation:** Lines 240–257 in `OrderLifecycleModal.tsx` perform live `eth_accounts` and `eth_chainId` RPC requests against the browser window provider immediately before calling `walletClient.sendTransaction`. Any disconnect or network switch immediately throws and transitions state to `WALLET_DISCONNECTED` or `WRONG_NETWORK`.

### B. SDK & Contract Compatibility
- **Installed Package:** `@somnia-chain/markets-sdk` version `0.32.1` in `package.json`.
- **Contract Order Enums (SDK `dist/trade.js`):**
  - `LIMIT = 0` (Normal order: fill what crosses, rest remainder on book)
  - `FILL_OR_KILL = 1` (Fill full quantity immediately or cancel)
  - `MARKET = 2` (ImmediateOrCancel)
  - `POST_ONLY = 3` (PostOnly: rest only, never takes liquidity)
  - `SELF_MATCHING_OPTION.CANCEL_TAKER = 0`
- **Contract Cancellation ABI:**
  - `PerpPool.cancelOrder(uint128)` has 4-byte selector `0xdbc91396`.
  - In [`LiveOrderAdapter.ts#L258-L276`](file:///C:/Users/NO%20GO%20NO/perpspilot/src/execution/LiveOrderAdapter.ts#L258-L276), `prepareCancelOrderCall` encodes `orderId` directly as `uint128` without integer overflow or string truncations.
- **Resting Orders Discovery ABI:**
  - `PerpPool.getOwnOpenOrders() view returns (uint128[])` called with `account: address` matches SDK `getOwnOpenOrdersOnchain`.
  - Implemented in [`useWallet.ts#L170-L200`](file:///C:/Users/NO%20GO%20NO/perpspilot/src/frontend/hooks/useWallet.ts#L170-L200) to retrieve active open orders directly from pool contracts.

### C. Multi-Market Decimal Scaling
- **ETH-PERP:** Base decimals: 18, Quote decimals: 18, Min Order: 0.0040 ETH, Tick Size: $0.01.
- **BTC-PERP:** Base decimals: 8, Quote decimals: 18, Min Order: 0.00013 BTC, Tick Size: $0.10.
- **SOL-PERP:** Base decimals: 9, Quote decimals: 18, Min Order: 0.1 SOL, Tick Size: $0.01.
- **Mathematical Safety:** Inputs are converted with `parseUnits(qtyStr, baseDecimals)` and formatted back with `formatUnits`. All intermediate units use EVM BigInts.

### D. Zero-Size Struct Bug Elimination
- `MarginBank.getPosition` on Somnia Hideki returns a 4-element tuple `(size, avgEntryPrice, entryFundingIndex, lastUpdatedTimestampNs)`.
- When an account has zero position, EVM returns `(0n, 0n, 0n, 0n)`.
- In JavaScript, a returned object `{ size: 0n, ... }` evaluates to truthy (`Boolean(obj) === true`).
- [`OrderLifecycleModal.tsx#L350`](file:///C:/Users/NO%20GO%20NO/perpspilot/src/frontend/components/OrderLifecycleModal.tsx#L350) and [`useWallet.ts#L254`](file:///C:/Users/NO%20GO%20NO/perpspilot/src/frontend/hooks/useWallet.ts#L254) strictly check `pos !== null && pos.size !== 0n`. Empty positions are never promoted to `POSITION_VERIFIED`.

---

## 5. Verification Commands Actually Executed

All commands were executed in workspace `C:\Users\NO GO NO\perpspilot`.

| Command | Working Dir | Exit Code | Wall Time | Actual Execution Result |
| :--- | :--- | :--- | :--- | :--- |
| `npm run typecheck` | Workspace root | **0** | ~18s | `tsc --noEmit` passed with 0 errors |
| `npm run build` | Workspace root | **0** | ~17s | `tsc` compiled to `dist/` with 0 errors |
| `npm test` | Workspace root | **0** | **53.26s** | **10 test files passed (10/10), 139 tests passed (139/139)** |
| `npm run build:frontend` | Workspace root | **0** | **23.74s** | `vite build` completed; created production bundle `dist-frontend/assets/index-DZbSUfm2.js` (1,839 kB / 479 kB gzip) |

### Test Suite Breakdown
```
 ✓ tests/stageE.test.ts (18 tests)
 ✓ tests/frontend.test.ts (14 tests)
 ✓ tests/execution.test.ts (47 tests)
 ✓ tests/precision.test.ts (9 tests)
 ✓ tests/f29-remediation.test.ts (20 tests)
 ✓ tests/liveExecution.test.ts (14 tests)
 ✓ tests/config.test.ts (7 tests)
 ✓ tests/risk.test.ts (5 tests)
 ✓ tests/preflight.test.ts (2 tests)
 ✓ tests/network.test.ts (3 tests) [Live Read-Only Hideki v2 Testnet RPC Queries]
```

---

## 6. Production Deployment vs. Local Build Comparison

Read-only HTTP queries were performed against both the canonical production URL and the immutable F.27 URL:

| Endpoint | Target URL | HTTP Status | Script Asset Hash | Bundle Status |
| :--- | :--- | :--- | :--- | :--- |
| **Canonical Production** | `https://perpspilot.vercel.app` | `200 OK` | `/assets/index-B-ojjp_u.js` | Serves F.27 release (`c028b37`) |
| **Immutable Deployment** | `https://perpspilot-kefd9s1b5-jamism123.vercel.app` | `200 OK` | `/assets/index-B-ojjp_u.js` | Serves F.27 release (`c028b37`) |
| **Local Fresh Build** | `dist-frontend/` | N/A | `/assets/index-DZbSUfm2.js` | Contains all Stage F.29 remediations |

**Key Finding:** Production currently serves the older F.27 release bundle (`index-B-ojjp_u.js`). It does **not** yet contain the F.29 fixes. A production deployment (`vercel --prod`) is required after operator approval and Git push to publish the new bundle (`index-DZbSUfm2.js`).

---

## 7. Remaining External Tasks & Release Checklist

The code remediation is complete and verified. The following sequential actions must be executed with operator approval:

- [ ] **Step 1: Git Commit**
  Stage the 17 modified files, `tests/f29-remediation.test.ts`, and reports.
  Commit message:
  `fix(trading): repair order lifecycle, execution guard, multi-market decimals, and on-chain position verification (Stage F.29)`
- [ ] **Step 2: Git Push**
  Push local `main` to `https://github.com/JimmyOgb/PerpsPilot`.
  (This publishes commits `c028b37`, `783fa8a`, and the Stage F.29 commit).
- [ ] **Step 3: Vercel Production Deployment**
  Deploy the new build to Vercel production (`vercel --prod`).
  Verify that `https://perpspilot.vercel.app` serves `/assets/index-DZbSUfm2.js`.
- [ ] **Step 4: Demo Video Recording (Human Operator)**
  Follow [`DEMO_SCRIPT.md`](file:///C:/Users/NO%20GO%20NO/perpspilot/DEMO_SCRIPT.md) to record a 2–3 minute live video showing:
  - Wallet connection on Somnia Hideki v2 (50383).
  - RiskCockpit budget check ($20 testnet safety limit).
  - TradeTicket order placement (`POST_ONLY` or `LIMIT`).
  - Pre-trade ExecutionGuard check.
  - On-chain resting order and cancellation.
  - Insert video URL into `README.md`.
- [ ] **Step 5: Social Media Announcements (Human Operator)**
  Post 2–3 update threads on X tagging `@DreamDEXSomnia` and `#Somnia`.
  Insert links into `README.md`.
- [ ] **Step 6: DoraHacks Bounty Submission (Human Operator)**
  Confirm DoraHacks whitelist approval and submit the project before the November 1, 2026 deadline.

---

## 8. Final Release Recommendation

All internal software engineering, security, and protocol integration requirements have been completely fulfilled. The code is safe, truthful, and adheres strictly to the dreamDEX CLOB and Somnia Hideki v2 rules.

**Recommendation:** **PROCEED TO OPERATOR REVIEW AND CONTROLLED RELEASE EXECUTION.**
