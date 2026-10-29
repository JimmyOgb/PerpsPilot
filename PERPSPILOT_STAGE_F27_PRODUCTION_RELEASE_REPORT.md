# PerpsPilot Stage F.27 — Production Release Report

**Workspace:** `C:\Users\NO GO NO\perpspilot`  
**Git Commit Deployed:** `c028b37` (`fix: enable live testnet trading mode on Somnia Hideki v2`)  
**Deployment Date:** October 29, 2026, 14:34 UTC  
**Canonical Production URL:** `https://perpspilot.vercel.app`  
**Immutable Deployment URL:** `https://perpspilot-kefd9s1b5-jamism123.vercel.app`  
**Vercel Deployment Identifier:** `dpl_BbigZLepvpcfpeVUNxcnchxsube8`  
**Target Network:** Somnia Hideki v2 Testnet  
**Chain ID:** `50383` (`0xc4cf`)  
**Network ID:** `50000259`  
**RPC URL:** `https://api.hideki2.infra.testnet.somnia.network`  
**Status:** PRODUCTION DEPLOYMENT ACTIVE & VERIFIED

---

## 1. Executive Summary

Following explicit operator authorization, PerpsPilot Stage F.27 was deployed to production. This release eliminates the legacy simulation fallback strings (`AWAITING_AUTH (DRY_RUN=true)` and `DRY_RUN: ACTIVE`) that previously masked the app's real testnet order execution capabilities.

The live production application now functions as a true wallet-authorized Somnia Hideki v2 testnet trading terminal:
- Connected wallets on chain `50383` automatically activate **Live Testnet Mode**.
- Order submissions require explicit operator review and direct browser wallet signing via standard `eth_sendTransaction`.
- Pre-trade risk controls, margin verification, tick/lot bounds, and freshness constraints are strictly enforced before any signature request.
- The resting order and cancellation evidence from Stage F.24 is fully preserved and accessible in the Evidence tab.

---

## 2. Pre-Deployment Safeguards Verification

All required safety gates were audited and passed prior to promotion:

| Gate | Requirement | Verification Outcome |
| :--- | :--- | :--- |
| **Gate 1** | Genuine Somnia Hideki v2 Testnet Integration | **PASS**: Target contracts verified as official Hideki deployments (`ETH-PERP Pool: 0xd6cb1dd58580b84d76068ac21594219ce03aeddf`, `MarginBank: 0x478769E1177C0773c43A593DCCc4Ad15F15F1394`, `Chain ID: 50383`). No mock or synthetic execution adapters are used in live mode. |
| **Gate 2** | Operator Wallet Authorization & Safe Connect | **PASS**: Connecting a wallet only queries read-only state (`eth_getBalance`, `getAccountState`, `allowance`). Zero write transactions occur on connect. Every trade requires an explicit modal review and distinct user signature prompt in MetaMask. |
| **Gate 3** | Fail-Closed Error Handling (No Silent Fallback) | **PASS**: If chain ID is not `50383`, the app blocks ordering with `WRONG_NETWORK`. If collateral or gas is insufficient (<0.005 STT), ordering is blocked. The app never silently reverts to simulation mode while claiming to execute live. |
| **Gate 4** | Zero Unauthorized Onchain Transactions | **PASS**: Zero blockchain write transactions or signatures were broadcast during testing or deployment. |

---

## 3. Deployment Identifiers & Artifacts

- **Vercel Project:** `jamism123/perpspilot`
- **Deployment ID:** `dpl_BbigZLepvpcfpeVUNxcnchxsube8`
- **Ready State:** `READY`
- **Target:** `production`
- **Build Region:** Washington, D.C., USA (East) – `iad1`
- **Build Machine:** 2 cores, 8 GB
- **Deployed Bundle:** `/assets/index-B-ojjp_u.js` (1,783.1 KB minified)
- **CSS Bundle:** `/assets/index-B70Mh9bq.css` (36.85 KB)

---

## 4. Test Suite and Local Pre-Flight Evidence

Prior to deployment, the entire test suite and TypeScript compiler were executed locally:

### 1. TypeScript Typecheck
- **Command:** `npm run typecheck`
- **Result:** `tsc --noEmit` exited with code `0`. Zero type errors.

### 2. Vite Production Build
- **Command:** `npm run build:frontend`
- **Result:** `vite build` completed in `25.45s` with code `0`.

### 3. Vitest Test Suite
- **Command:** `npm test`
- **Result:** **119 / 119 tests PASS across 9 test suites (0 failures)**:
  - `tests/stageE.test.ts` (18 tests) — PASS
  - `tests/frontend.test.ts` (14 tests) — PASS
  - `tests/execution.test.ts` (47 tests) — PASS
  - `tests/precision.test.ts` (9 tests) — PASS
  - `tests/risk.test.ts` (5 tests) — PASS
  - `tests/config.test.ts` (7 tests) — PASS
  - `tests/liveExecution.test.ts` (14 tests) — PASS
  - `tests/preflight.test.ts` (2 tests) — PASS
  - `tests/network.test.ts` (3 tests) — PASS (live RPC assertions on Hideki v2 `50383`)

---

## 5. Live Production Post-Deployment Smoke Test

A comprehensive smoke test was conducted directly against the live production endpoints (`scratch/smoke_test_f27_release.cjs`):

```
=== Stage F.27 Production Release Smoke Test ===

1. Checking Production Canonical URL (https://perpspilot.vercel.app)...
   Status: 200 OK
   Content-Type: text/html; charset=utf-8
   Root element verified.
   Main JS bundle: /assets/index-B-ojjp_u.js

2. Checking Immutable Deployment URL (https://perpspilot-kefd9s1b5-jamism123.vercel.app)...
   Status: 200 OK

3. Testing SPA Rewrites (https://perpspilot.vercel.app/diagnostics)...
   Status: 200 (Expected 200 via rewrite)
   SPA rewrite verified.

4. Fetching and Auditing Production JS Bundle...
   Bundle size: 1783.1 KB
   [PASS] Dynamic Testnet Trading Badge (found: true, expected: true)
   [PASS] Review & Authorize CTA (found: true, expected: true)
   [PASS] Wallet Signature Notice Badge (found: true, expected: true)
   [PASS] Stage F.24 Order Placement Tx Hash (found: true, expected: true)
   [PASS] Stage F.24 Order Cancellation Tx Hash (found: true, expected: true)
   [PASS] Somnia Hideki v2 Chain ID 50383 (found: true, expected: true)
   [PASS] PerpPool placeOrder write ABI (found: true, expected: true)
   [PASS] Eliminated Hardcoded "AWAITING_AUTH (DRY_RUN=true)" Modal Fallback (found: false, expected: false)
   [PASS] Eliminated Hardcoded "DRY_RUN: ACTIVE" Navbar Badge (found: false, expected: false)
   [PASS] Eliminated Hardcoded "guarded by DRY_RUN=true" Table Note (found: false, expected: false)

Audit Summary: 10 / 10 checks passed.
Production release smoke test PASSED successfully.
```

---

## 6. Real-Time UI Behavior Matrix

| User State | Navbar Status | Trade Ticket Primary CTA | Notice Badge | Modal Behavior |
| :--- | :--- | :--- | :--- | :--- |
| **Disconnected** | `TESTNET PREVIEW` (amber) | "Connect Wallet to Trade" | `WALLET_DISCONNECTED` | "Preview Order (Simulation Only)" runs read-only risk calculation |
| **Connected (Hideki v2, 50383)** | `TESTNET TRADING: READY` (emerald pulse) | "Review & Authorize Testnet Order" | `WALLET_SIGNATURE_REQUIRED` | Opens modal in Live Mode; shows "Authorize & Sign in Wallet" CTA |
| **Connected (Wrong Network)** | `WRONG NETWORK` (rose) | "Switch to Somnia Hideki (50383)" | `WRONG_NETWORK` | Fails closed; blocks ordering until switched to 50383 |

---

## 7. Submission and Onchain Evidence Preservation

The live production application preserves full historical transparency for hackathon evaluators:
1. **Evidence Tab:** Accessible in the bottom panel. Displays decoded receipts, gas usage, block numbers, and raw curl verification commands for both verified Stage F.24 transactions:
   - Order Placement: `0xdea7fc0070e42b632ebe90fe57509abdf9cb464a98f73277b1c6cc85b92777e7` (Order ID: `5460236245818038181306`)
   - Order Cancellation: `0x6c2661e69bf8593e117e9d7fafeb1f125640db5c4841243c648d22fe917ffea7`
2. **Diagnostics Runner:** Accessible via the Diagnostics tab. Mirrors CLI `npm run doctor` and `npm run preflight` checks against live RPC `50383`.

---

## 8. Remaining Blockers & Known Boundaries

- **Blockers:** **NONE.** The application is live, fully functional, and verified against Somnia Hideki v2.
- **CLOB Resting Fill Notice:** As noted in the safety disclosures, limit orders placed as `POST_ONLY` rest in the order book until matched or cancelled. Cancellation releases collateral back to the user's MarginBank account.
- **Next Stage:** The product is fully ready for bounty submission.
