# PerpsPilot Stage F.35 — Judge-Focused README Upgrade & Readiness Report

**Audit & Execution Timestamp:** 2026-10-30T07:20:00+01:00  
**Workspace Path:** `<workspace>/perpspilot`  
**Public Repository:** [https://github.com/JimmyOgb/PerpsPilot](https://github.com/JimmyOgb/PerpsPilot)  
**Live Application:** [https://perpspilot.vercel.app](https://perpspilot.vercel.app)  
**Target Event:** dreamDEX Perps Builder Bounty (Somnia Hideki Testnet Tokyo v2, Chain ID `50383`)  

---

## 1. Workspace and Repository Identity

- **Workspace Root:** `<workspace>/perpspilot`
- **Canonical GitHub Repository:** `https://github.com/JimmyOgb/PerpsPilot`
- **Canonical Production Deployment:** `https://perpspilot.vercel.app`
- **Target Network:** Somnia Hideki Testnet (Tokyo v2, Chain ID `50383` / `0xc4cf`, `net_version: 50000259`, RPC: `https://api.hideki2.infra.testnet.somnia.network`)

---

## 2. Git Branch and Starting Commit

- **Current Branch:** `main` (tracking `origin/main`)
- **Starting & Current `HEAD` Commit:** [`aff7470`](https://github.com/JimmyOgb/PerpsPilot/commit/aff7470) (`aff7470ccae59fb23deb1006074a8f7dd0226f25`)
- **Commit Message:** `fix(trading): repair order lifecycle, execution guard, multi-market decimals, and position verification (F.29)`
- **Git Execution Boundary:** In strict compliance with Phase 4 instructions, all changes remain uncommitted in the local working tree for operator review. Zero commits, pushes, deployments, wallet connections, or blockchain transactions were executed during Stage F.35.

---

## 3. Read-Only Audit Findings in Previous `README.md`

During the Phase 1 audit of the previous `README.md` (589 lines), we identified and eliminated several stale or contradictory sections left over from earlier development stages:
1. **Stale "Planned (Stage D)" Matrix Rows:** Lines 103–104 of the previous README still listed `Live Order Dispatch` and `Receipt & Fill Verification` as *"Planned (Stage D) — Blocked pending user private key & approval"*, contradicting both the implemented `LiveOrderAdapter` / `OrderReconciler` codebase and the real Stage F.24 testnet transactions recorded later in the same file.
2. **Stale "Unexecuted Live Mutations" Limitation:** Line 516 previously claimed *"no live state-changing transactions (deposits, orders, cancels) have been broadcast to Somnia Hideki. Transaction hashes in documentation remain placeholders"*, directly contradicting the verified Stage F.24 evidence section at lines 431–450.
3. **Outdated Test Counts:** Lines 356 and 499 referenced `105 automated tests across 8 suites` and `119+ tests`, whereas the repository at commit `aff7470` contains **139 automated tests across 10 suites**.
4. **Placeholder Video & X Post Links:** Line 464 contained `[DEMO VIDEO URL - PLACEHOLDER]` and lines 536–576 contained draft unposted social copy (`[POST 1 LINK - PLACEHOLDER]`), whereas the public YouTube demo video and all three X build updates are now live.
5. **Misleading Transaction Hash Links:** Lines 448–449 linked transaction hashes directly to `https://api.hideki2.infra.testnet.somnia.network`, which is a POST-only JSON-RPC endpoint rather than a browser-viewable explorer page.

---

## 4. `README.md` Sections Created and Improved

The upgraded [`README.md`](README.md) (356 lines) is structured specifically for bounty judges in priority order:

1. **Opening (`# PerpsPilot` — *A risk-aware copilot for dreamDEX perpetuals on Somnia*):**
   - Explains why 10ms block-time perpetual markets require visibility into market parameters, order types, collateral tiers, and execution constraints.
   - Positions PerpsPilot around **risk-aware, user-confirmed execution** rather than autonomous AI trading or exaggerated profit claims.
2. **Quick Navigation for Judges:**
   - Compact top-of-page index linking to the live application, GitHub repository, commit `aff7470`, public YouTube demo video, all three X build updates, `EVIDENCE.md`, `DEMO_SCRIPT.md`, and `feedback/`.
3. **What PerpsPilot Does:**
   - 12-row capability matrix mapping every implemented feature to its data source (live chain/indexer vs. local deterministic math) and exact source files (`discovery.ts`, `OrderPlanner.ts`, `ExecutionGuard.ts`, `LiveOrderAdapter.ts`, `OrderReconciler.ts`, `TradeTicket.tsx`, `OrderLifecycleModal.tsx`, `useWallet.ts`, `DiagnosticsView.tsx`).
   - Explicitly explains that a mined `placeOrder` receipt (`status: 1`) confirms order acceptance by the contract, not a trade fill, and that `POST_ONLY` orders rest as maker orders and may remain unfilled.
4. **Built for Safer, More Transparent Execution:**
   - Details the 8 core engineering decisions: centralized `OrderPlanner` & `ExecutionGuard`, 60-second proposal freshness (`maxPlanAgeMs: 60_000`), immediate pre-sign wallet/network revalidation, exact order-type enum mapping (`POST_ONLY=3`, `LIMIT=0`, and deliberately disabled `MARKET` orders), multi-market decimal scaling (`ETH` 18dp, `BTC` 8dp, `SOL` 9dp, `USDso` 18dp), three-tier collateral isolation (`STT` gas vs. wallet `USDso` vs. `MarginBank`), zero-size position struct filtering (`pos.size !== 0n`), and the fail-closed `PositionCloser` boundary (`reduceOnly` TOCTOU protection).
5. **Verified Testnet Order Lifecycle:**
   - Prominently labeled as **historical testnet evidence** from Stages F.21 and F.24 on Somnia Hideki v2 (`50383`), walking through the 6-step sequence (approval -> deposit -> `POST_ONLY` order placement -> resting verification with 0 fills and `0.44 USDso` locked margin -> cancellation -> margin release and `0 ETH` final position).
   - Explains why there is no web explorer link (citing `@somnia-chain/markets-sdk` `hidekiTestnet.js`: *"No public block explorer is known for Hideki"*), links hashes to [`EVIDENCE.md`](EVIDENCE.md), and provides copy-pasteable `curl` JSON-RPC verification commands.
6. **Engineering and Verification:**
   - Links to commit [`aff7470`](https://github.com/JimmyOgb/PerpsPilot/commit/aff7470), breaks down all 10 test files totaling `139 / 139` passing tests (`136` deterministic unit tests + `3` live read-only Somnia Hideki v2 RPC/indexer tests), and keeps automated tests, production checks, historical transactions, and out-of-scope features distinct.
7. **Architecture and Technology Stack:**
   - Includes a clean Mermaid execution flow (`Market Data -> Order Planning -> Risk & Freshness Gate -> User Confirmation -> On-Chain Execution -> State Verification`), dependency versions from `package.json`, and the verified Somnia Hideki v2 contract registry.
8. **Demo Video:**
   - Links directly to the public YouTube demo video ([`https://youtu.be/fgC5cAnD7Ow?si=uszAcyz1tAp-sYTm`](https://youtu.be/fgC5cAnD7Ow?si=uszAcyz1tAp-sYTm)), outlines the 7 scenes (`2m 54s`, `1080p`), and explicitly discloses that no new transactions were broadcast during recording.
9. **Public Build Journey:**
   - Links all three supplied X posts with descriptive titles derived from their live verified post text.
10. **Feedback Track Contributions:**
    - Summarizes the 3 reproducible SDK/contract reports in [`feedback/`](feedback).
11. **Installation and Usage:**
    - Clear instructions for `npm ci`, wallet-free exploration vs. wallet-connected testnet usage, optional `.env` setup, and all `package.json` scripts.
12. **Limitations and Responsible Use & Bounty Alignment:**
    - Candid disclosure of perpetuals risk, testnet scope, unfilled `POST_ONLY` orders, disabled `MARKET` orders, lack of native `reduceOnly`, and remaining external submission steps.

---

## 5. Public X Build Update Links Included & Verified

All three supplied X URLs were verified via HTTP (`200 OK`) and inspected via `publish.twitter.com/oembed`, and are included in both the top navigation and the dedicated `## Public Build Journey` section:

1. [**PerpsPilot — Demo Video & Verifiable Order Lifecycle Launch (Oct 30, 2026)**](https://x.com/JimmyOgb12/status/2116049016722960552)
   - *Verified Post Excerpt:* `"Meet PerpsPilot — a risk-aware copilot for @dreamDEXSomnia perpetuals on Somnia. Built to make perps trading more transparent with: Market visibility, Pre-trade risk checks, Order freshness controls, Verifiable order lifecycle. Demo video: ..."`
2. [**PerpsPilot — Building the Risk-Aware Trading Cockpit & Traceable Market Integration (Oct 28, 2026)**](https://x.com/JimmyOgb12/status/2115411561497976873)
   - *Verified Post Excerpt:* `"Building PerpsPilot — A risk-aware trading cockpit for @dreamDEXSomnia Perps on @Somnia_Network. I'm working on real market integration, wallet-aware risk checks, and transparent order validation with a focus on making every trading status traceable to actual data."`
3. [**PerpsPilot — Shipping the Live PerpsPilot Trading Companion on Vercel (Oct 28, 2026)**](https://x.com/JimmyOgb12/status/2115537547887587665)
   - *Verified Post Excerpt:* `"Meet PerpsPilot https://perpspilot.vercel.app @dreamDEXSomnia Trading crypto futures can be confusing, especially when you're trying to manage risk while watching the market move. Shipping a smarter trading companion designed to help traders understand the market, plan their trades..."`

---

## 6. Verified Historical Transaction Evidence & Explorer Finding

We independently re-verified all historical transactions against the live Somnia Hideki v2 JSON-RPC endpoint (`https://api.hideki2.infra.testnet.somnia.network`):

| Transaction Role | Transaction Hash | Block | Status | Gas Used | Target Contract |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **USDso Approval (F.21)** | `0xac0372a90a9bad33ba02397aa1e94023d1e1da08b09a56ab3b3cc605351c24ae` | `36205098` | `1` (`success`) | `260,601` | `0xed7993A74dAe1e6656B704A424DcD8711aAf4F72` (`USDso`) |
| **MarginBank Deposit (F.21)** | `0x7078b2223046465b6ba59339c6f566b0d11783024a0c11a3a19db194358db11a` | `36207476` | `1` (`success`) | `521,297` | `0x478769E1177C0773c43A593DCCc4Ad15F15F1394` (`MarginBank`) |
| **Order Placement (F.24)** | `0xdea7fc0070e42b632ebe90fe57509abdf9cb464a98f73277b1c6cc85b92777e7` | `36237119` | `1` (`success`) | `1,674,788` | `0xd6cb1dd58580b84d76068ac21594219ce03aeddf` (`ETH-PERP`) |
| **Order Cancellation (F.24)** | `0x6c2661e69bf8593e117e9d7fafeb1f125640db5c4841243c648d22fe917ffea7` | `36237214` | `1` (`success`) | `136,005` | `0xd6cb1dd58580b84d76068ac21594219ce03aeddf` (`ETH-PERP`) |

- **Explorer Investigation:** DNS resolution checks on `hideki.somniascan.org`, `hideki-testnet.somniascan.org`, and `hideki-explorer.somnia.network` confirmed that none of those hostnames resolve (`getaddrinfo failed`), matching the official comment in `@somnia-chain/markets-sdk@0.32.1` (`dist/chains/definitions/hidekiTestnet.js#L37`): *"No public block explorer is known for Hideki, so that field stays unset."*
- **Remaining Uncertainty:** None regarding on-chain execution—all receipts are live-verified on the Hideki v2 RPC node and linked to [`EVIDENCE.md`](EVIDENCE.md) with reproducible `curl` commands.

---

## 7. Test Results and External Link Verification

### 7.1 Automated Tests & Typecheck Run During Stage F.35
- **`npm run typecheck` (`tsc --noEmit`):** **PASS** (Exit code `0`, 0 errors).
- **`npx vitest run` (`npm test`):** **PASS** (`10 / 10` test suites passed, **`139 / 139` tests passed**, including `3 / 3` live read-only Somnia Hideki v2 RPC and oracle integration tests in `tests/network.test.ts`).

### 7.2 Public Demo Video, Production Site, and Repository Checks
- **Production Application (`https://perpspilot.vercel.app`):** Verified `HTTP 200 OK`; serves `/assets/index-DmPHRQ92.js` and `/assets/index-fe_t2JEW.css`, matching the Stage F.32 deployment of commit `aff7470`.
- **Public GitHub Repository (`https://github.com/JimmyOgb/PerpsPilot`):** Verified `HTTP 200 OK`; commit [`aff7470`](https://github.com/JimmyOgb/PerpsPilot/commit/aff7470) verified `HTTP 200 OK`.
- **Public Demo Video (`https://youtu.be/fgC5cAnD7Ow?si=uszAcyz1tAp-sYTm`):** Verified public and active via YouTube oEmbed API (`HTTP 200 OK`, title: `"PerpsPilot"`, author: `"FOOD FACTS 🥝"`).

---

## 8. Unresolved Eligibility, Whitelist, Publication, or Submission Requirements

To ensure complete transparency, the following items remain outside local file edits and require operator action or organizer confirmation:
1. **Git Commit & Push of Upgraded `README.md`:** Per Phase 4 instructions (*"Do not commit or push without separate authorization"*), the upgraded `README.md` is saved locally in the working tree. Once reviewed and approved by the operator, it must be committed and pushed to `origin/main` so judges viewing GitHub see the updated README.
2. **DoraHacks Whitelist & Portal Submission:** Confirm that the operator's DoraHacks account is whitelisted by the bounty organizers and submit the final BUIDL package on DoraHacks before the bounty deadline.
3. **Scope of On-Chain Proof:** Our historical on-chain evidence proves collateral deposit, `POST_ONLY` maker order placement, resting orderbook verification (`0` fills), and cancellation with collateral release. It does not include a filled trade or open position.

---

## 9. Files Changed, Validation Performed, and Git Diff Summary

### Tracked Files Modified
- [`README.md`](README.md) (`1 file changed, 257 insertions(+), 490 deletions(-)`)

### Untracked Audit Report Created
- [`PERPSPILOT_STAGE_F35_README_JUDGE_READINESS_REPORT.md`](PERPSPILOT_STAGE_F35_README_JUDGE_READINESS_REPORT.md)

### Automated Validation Performed on `README.md`
1. **Secret & Local Path Scan:** Verified `0` occurrences of local paths, Vercel project/deployment tokens, or private keys.
2. **Relative Link Check:** Programmatically verified all `68` relative links in `README.md` (`38` unique file/directory targets) resolve to existing files or directories in the repository.
3. **Mandatory External URL & Hash Check:** Programmatically verified exact presence of the live Vercel URL, GitHub URL, commit `aff7470` URL, YouTube video URL, all 3 X post URLs, and both F.24 transaction hashes.

---

## 10. Final Readiness Verdict

```text
READY FOR FINAL REVIEW
```
*(All local `README.md` improvements, link checks, on-chain receipt verifications, and test checks are complete. Awaiting operator review and separate authorization before committing/pushing to GitHub or submitting to DoraHacks.)*
