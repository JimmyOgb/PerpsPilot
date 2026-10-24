# PerpsPilot — README & Public Publication Audit Report

**Document ID:** `PERPSPILOT_README_AND_PUBLICATION_AUDIT.md`  
**Date:** October 24, 2026  
**Timestamp:** `13:38:00 UTC+1`  
**Target Repository:** [`https://github.com/JimmyOgb/PerpsPilot`](https://github.com/JimmyOgb/PerpsPilot)  
**Target Branch:** `main`  
**Commit Hash:** `7cbe2dd863b0e5150e05b7a76b2a5f9f9c07e744`  
**Public README URL:** [`https://github.com/JimmyOgb/PerpsPilot/blob/main/README.md`](https://github.com/JimmyOgb/PerpsPilot/blob/main/README.md)  
**Host Hackathon:** dreamDEX Perps Builder Bounty (DoraHacks)  
**Operating Mode:** STRICT READ-ONLY (`DRY_RUN=true`) — Zero state changes, zero secrets logged.

---

## 1. Executive Summary & Publication Outcome

PerpsPilot has completed full hackathon requirements auditing, authored a judge-ready `README.md`, verified local security and repository hygiene, and successfully published the codebase to GitHub:

- **Target Repository:** `https://github.com/JimmyOgb/PerpsPilot`
- **Pushed Commit:** `7cbe2dd` (`feat: initialize PerpsPilot judge-ready repository for dreamDEX Perps Builder Bounty`)
- **Staged Files:** Exactly 37 reviewed, audited project files.
- **Excluded Files:** `.env`, `node_modules/`, `dist/`, and `package/` strictly excluded by `.gitignore`.
- **Secret Scan:** Verified zero private keys, credentials, or secrets in git tree.
- **Track 1 (MVP Track) Assets:** Complete risk engine, precision math, diagnostics, `README.md`, `EVIDENCE.md` (unpopulated schema), and `DEMO_SCRIPT.md`.
- **Track 2 (Feedback Track) Assets:** 3 verified reports staged in root [`/feedback/`](https://github.com/JimmyOgb/PerpsPilot/tree/main/feedback) following DoraHacks schema.

---

## 2. Official Requirements Verification

Verified against primary sources on October 24, 2026:

| Requirement Area | Specification / Finding | Verification Status | Primary Source |
|:---|:---|:---:|:---|
| **Event Name & Host** | dreamDEX Perps Builder Bounty on DoraHacks | **VERIFIED** | DoraHacks (`https://dorahacks.io/hackathon/dreamdex-perps-bounty/detail`) |
| **Bounty Closing Time** | November 1, 2026, 23:59 UTC (~8 days remaining) | **VERIFIED** | DoraHacks Official Schedule |
| **Total Prize Pool** | $3,000 USD ($1,500 MVP Track, $1,500 Feedback Track) | **VERIFIED** | Official Event Announcement |
| **MVP Track Structure** | 3 winners x $500 ($300 upfront + $200 mainnet launch) | **VERIFIED** | Official Track Guidelines |
| **Feedback Track Structure**| $40 per critical/major report, $15 per normal report (Pool: $1,500) | **VERIFIED** | Official Track Guidelines |
| **Feedback Delivery Channel**| Individual Markdown files in root `/feedback/` directory | **VERIFIED** | DoraHacks Feedback Submission Guidelines |
| **Feedback Schema** | `# Title`, `Severity`, `Area`, `Steps`, `Expected`, `Actual`, `Evidence`, `Env` | **VERIFIED** | DoraHacks Submission Template |
| **Whitelist Requirement**| Mandatory registration via dreamDEX Discord or SomniaHacks Telegram | **VERIFIED** | Official Participation Rules |
| **First-Valid-Report Rule**| First reproducible report wins; subsequent duplicates closed | **VERIFIED** | Evaluation Guidelines |
| **Responsible Disclosure** | Critical security vulnerabilities sent to `security@dreamdex.io` | **VERIFIED** | Security Guidelines |

---

## 3. README Sections Added & Implemented

The root [`README.md`](file:///C:/Users/NO%20GO%20NO/PerpsPilot/README.md) was created with 18 comprehensive, judge-ready sections:

1. **Project Identity:** Name, risk-aware tagline, mission paragraph, DoraHacks track participation, testnet disclosure, and implementation status table.
2. **The Problem:** Explains 10ms block cadence challenges, lot/tick precision reverts, stale oracle fills, the "liquid wallet vs margin" trap, and silent SDK indexer misconfigurations.
3. **The Solution & Intended Users:** Pre-trade validation copilot, live chain truth, explicit authorization, and target personas.
4. **Why This Approach is Useful:** Prevents invalid orders, solves token decimal mismatches (`tUSDC` 6dp vs `USDso` 18dp), and prevents mempool gas waste.
5. **Comprehensive Feature Matrix:** Detailed table specifying what each feature does, implementation file, test coverage, and limitations.
6. **Architecture & Order Lifecycle:** Mermaid data flow diagram and 6-stage lifecycle (`PROPOSAL` -> `RISK_GATE` -> `PREFLIGHT` -> `SUBMISSION` -> `CONFIRMATION` -> `FILL_VERIFICATION`).
7. **Network & Protocol Integration:** Official Hideki v2 parameters (Chain ID `50383`, RPC, WebSocket, Indexer `hideki-dev`, STT gas, USDso collateral).
8. **Risk Controls & Execution Safety:** Detail on priceability filters, tick/lot grid math, minimum order quantity, IMF leverage bounds, and fail-closed architecture.
9. **Technology Stack:** Node.js, TypeScript 5.5, Viem 2.21, `@somnia-chain/markets-sdk@0.32.1`, Vitest 2.1.
10. **Prerequisites & Quick Start:** PowerShell copy/paste commands (`npm ci`, `typecheck`, `build`, `test`, `doctor`, `preflight`).
11. **Safe Local Configuration:** Explains `.env.example` to `.env` setup, `DRY_RUN=true` default, and secret hygiene.
12. **Testing & Verification Results:** Exact command results from test suites.
13. **Real Testnet Execution & Evidence Status:** Transparent disclosure: **Live order evidence: Pending.** Planned $20 order card on `ETH-PERP` and reference to `EVIDENCE.md`.
14. **Demonstration & Video Script:** Overview of `DEMO_SCRIPT.md` (2.5-minute walkthrough grounded in real CLI outputs).
15. **Feedback Track Contributions:** Links to the three audited reports in [`/feedback/`](file:///C:/Users/NO%20GO%20NO/PerpsPilot/feedback).
16. **Roadmap & Known Limitations:** Completed items vs planned Stage D trade vs future terminal UI.
17. **Bounty Alignment:** Explicit mapping to official MVP criteria.
18. **Social Announcements & License:** 2 draft X posts marked `DRAFT — NOT POSTED`, MIT license, and educational disclaimer.

---

## 4. Test Verification Breakdown

All tests executed with **exit code 0** on Somnia Hideki Testnet:

| Category | Suite / Command | Tests | Status | Description |
|:---|:---|:---:|:---:|:---|
| **Deterministic Unit Tests** | `tests/config.test.ts` | 7 | **PASS** | Validates config defaults, chain ID `50383`, indexer URL overrides. |
| **Deterministic Unit Tests** | `tests/precision.test.ts` | 9 | **PASS** | Validates BigInt tick alignment (`1e16`) and lot alignment (`1e14`). |
| **Deterministic Unit Tests** | `tests/risk.test.ts` | 5 | **PASS** | Validates 500 bps IMF (20x max), min qty (`0.0040 ETH`), position caps. |
| **Deterministic Unit Tests** | `tests/preflight.test.ts` | 2 | **PASS** | Validates safe `BLOCKED` status when signer credentials are absent. |
| **Live Network Integration** | `tests/network.test.ts` | 3 | **PASS** | Live RPC chain ID assertion, factory discovery of 21 perp pools, ETH-PERP mark oracle priceability. |
| **System Diagnostics** | `npm run doctor` | 8 checks | **7 PASS / 1 BLOCKED** | Environment, RPC, Indexer, Target Pool, Sizing, Oracle Health. |
| **Pre-Trade Preflight** | `npm run preflight` | 8 checks | **3 PASS / 5 BLOCKED** | Sizes $20 notional order; reports 3-tier margin state safely in read-only mode. |

---

## 5. Security & Secret-Scanning Audit

Prior to Git staging and remote push:
1. **`.env` Exclusion:** Verified `.gitignore` contains `.env` and `.env.*`. Running `git status --ignored` confirmed `.env` was recognized as ignored.
2. **Secret Scan:** Scanned all committed files for private key patterns (`0x[a-fA-F0-9]{64}`). Zero secrets or private keys were found.
3. **Artifact Integrity:** Verified that [`EVIDENCE.md`](file:///C:/Users/NO%20GO%20NO/PerpsPilot/EVIDENCE.md) contains zero mock or fabricated transaction hashes. Verified that [`DEMO_SCRIPT.md`](file:///C:/Users/NO%20GO%20NO/PerpsPilot/DEMO_SCRIPT.md) marks live execution as pending.
4. **Safety Defaults:** `DRY_RUN=true` remains active in code and `.env.example`.

---

## 6. Git Publication Details

- **Local Git Initialized:** `git init` on branch `main`.
- **Configured Remote:** `origin -> https://github.com/JimmyOgb/PerpsPilot`
- **Pre-Push Check:** `git ls-remote https://github.com/JimmyOgb/PerpsPilot` confirmed the remote repository existed and was completely empty (zero pre-existing commits).
- **Files Staged & Committed (37 files):**
  - Config & Core: `.gitignore`, `.env.example`, `package.json`, `package-lock.json`, `tsconfig.json`, `LICENSE`
  - Documentation: `README.md`, `EVIDENCE.md`, `DEMO_SCRIPT.md`, `PERPSPILOT_HACKATHON_REQUIREMENTS_AUDIT.md`
  - Audit Reports: `PerpsPilot_UPGRADE_AUDIT.md`, `PerpsPilot_STAGE_C_BOUNTY_AUDIT.md`, `PERPSPILOT_STAGE_C1_VERIFICATION.md`, `PERPSPILOT_STAGE_C2_PREFLIGHT.md`, `PERPSPILOT_STAGE_C3_FEEDBACK_AND_PACKAGING.md`, `PERPSPILOT_STAGE_C4_SUBMISSION_PACKAGE.md`, `PERPSPILOT_STAGE_C5_FEEDBACK_SUBMISSION_PREFLIGHT.md`, `PERPSPILOT_STAGE_C6_FINAL_FEEDBACK_READINESS.md`
  - Source Code: `src/config/`, `src/network/`, `src/markets/`, `src/risk/`, `src/diagnostics/`
  - Test Suites: `tests/` (5 test suites)
  - Feedback Track: `feedback/` (3 markdown reports) and `feedback_staging/`
- **Files Excluded (Per `.gitignore`):**
  - `.env` (Private local credentials)
  - `dist/` (Build output)
  - `node_modules/` (Third-party dependencies)
  - `package/` (Unpacked local reference package)
- **Commit Hash:** `7cbe2dd863b0e5150e05b7a76b2a5f9f9c07e744`
- **Push Output:**
  ```text
  To https://github.com/JimmyOgb/PerpsPilot
   * [new branch]      main -> main
  branch 'main' set up to track 'origin/main'.
  ```
- **Remote Verification:** `git ls-remote origin` confirmed `HEAD` and `refs/heads/main` at `7cbe2dd`.

---

## 7. Remaining Submission Blockers & Action Plan

To finalize entry for the DoraHacks bounty before the November 1, 2026 deadline:

1. **Whitelist Registration (User Step):**
   Join the official dreamDEX Discord or SomniaHacks Telegram group and register your handle/wallet for bounty eligibility.
2. **Live Testnet Order Execution (Stage D — User Key Required):**
   - Populate `PRIVATE_KEY` in local `.env` with a funded testnet account (`>= 0.05 STT` and `>= 10.00 USDso`).
   - Run `npm run preflight` to confirm all 8 checks report `PASS`.
   - With explicit authorization, deposit margin to `MarginBank` and submit the $20 LIMIT order (`0.0084 ETH` at mark).
   - Record the real transaction hash, receipt, and fill status into [`EVIDENCE.md`](file:///C:/Users/NO%20GO%20NO/PerpsPilot/EVIDENCE.md), commit, and push.
3. **Demo Video Recording:**
   Record a 2-to-3 minute terminal video following [`DEMO_SCRIPT.md`](file:///C:/Users/NO%20GO%20NO/PerpsPilot/DEMO_SCRIPT.md) demonstrating live `doctor`, `preflight`, and the verified on-chain order.
4. **DoraHacks BUIDL Submission:**
   Create the project submission on DoraHacks under the dreamDEX Perps Builder Bounty, linking to `https://github.com/JimmyOgb/PerpsPilot` and the demo video.
