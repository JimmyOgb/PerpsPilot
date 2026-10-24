# PerpsPilot — Stage C.5 Official Feedback Submission Preflight Report

**Document ID:** `PERPSPILOT_STAGE_C5_FEEDBACK_SUBMISSION_PREFLIGHT.md`  
**Date:** October 24, 2026  
**Timestamp:** `13:18:00 UTC+1`  
**Workspace:** `C:\Users\NO GO NO\PerpsPilot`  
**Target Program:** dreamDEX Perps Builder Bounty (DoraHacks)  
**Deadline:** November 1, 2026, 23:59 UTC (~8 days remaining)  
**Operating Mode:** STRICT READ-ONLY (`DRY_RUN=true`) — Zero state changes, zero secrets logged, zero external publications.

---

## 1. Official Bounty Requirements & Submission Procedure

The official rules and submission procedures for the **dreamDEX Perps Builder Bounty** were verified via authoritative DoraHacks organizer publications on October 24, 2026.

### 1.1 Program Parameters & Authoritative Source URLs
- **Host Platform:** DoraHacks (`https://dorahacks.io`)
- **Event Name:** dreamDEX Perps Builder Bounty (Somnia Tokyo / Hideki Testnet)
- **Official Bounty Period:** October 19, 2026 – November 1, 2026, 23:59 UTC
- **Total Prize Pool:** $3,000 USD
  - **Track 1: MVP Track ($1,500 pool):** 3 winning projects awarded $500 each ($300 upon evaluation + $200 conditional on mainnet launch performance).
  - **Track 2: Feedback Track ($1,500 pool):** Bounty payouts awarded per accepted, reproducible issue ($40 for `critical` or `major` issues, $15 for `normal` issues).
- **Access Date:** October 24, 2026

### 1.2 Submission Mechanism & Channel
- **BUIDL Submission Method:** Submissions are registered on DoraHacks via a project BUIDL entry linking to a public GitHub repository.
- **Feedback Track Location:** Each bug report or DX friction report must be placed in its own individual Markdown file inside the root `/feedback/` directory of the repository (one file per distinct finding).
- **Whitelist Registration:** Participants must complete whitelist registration through the dreamDEX Discord or the official SomniaHacks Telegram group before final bounty distribution.

### 1.3 Mandatory Markdown Report Structure
Organizer guidelines mandate the following schema for all Feedback Track submissions:
```markdown
# Short title

Severity: critical | major | normal
Area: API | SDK | docs | app | contracts

## Steps to reproduce
1. ...
2. ...

## Expected
[Expected behavior]

## Actual
[Observed behavior]

## Evidence
[Payloads, logs, stack traces, contract reads, active handles]

## Environment
[SDK version, Node/runtime version, OS, chain ID, contract addresses]
```

### 1.4 Adjudication Rules & Confidentiality Boundary
1. **First-Valid-Report Rule:** Only the first valid, reproducible report of an issue is eligible for bounty payout. Duplicates are closed without payment.
2. **Reproducibility Standard:** The dreamDEX engineering team must be able to independently reproduce the reported behavior using the provided reproduction steps.
3. **Responsible Disclosure Boundary:** Security vulnerabilities and critical exploit vectors must **never** be posted publicly on GitHub or DoraHacks; they must be reported privately to `security@dreamdex.io`.  
   *Audit Finding:* None of PerpsPilot's three candidate findings represent security vulnerabilities or smart contract exploit vectors. All three are non-security developer experience, configuration mapping, and transport lifecycle issues suitable for public Feedback Track submission.

---

## 2. Final Report-by-Report Review

Each candidate report in [`feedback/`](file:///C:/Users/NO%20GO%20NO/PerpsPilot/feedback) (and [`feedback_staging/`](file:///C:/Users/NO%20GO%20NO/PerpsPilot/feedback_staging)) was audited against official schema and verified for strict technical precision:

### 2.1 Finding 1: `01_hideki_indexer_endpoint_mismatch.md`
- **Title:** `SDK Captures Chain Mismatch Error Silently on Hideki (50383) When Configured With Common Testnet Indexer (50312), Returning Zero Markets`
- **Severity:** `major` (Eligible for $40 tier)
- **Area:** `SDK | docs`
- **Schema Compliance:** 100% compliant (`# Title`, `Severity`, `Area`, `## Steps`, `## Expected`, `## Actual`, `## Evidence`, `## Environment`).
- **Precision Distinction:**
  - *Endpoint Mismatch:* `https://dev.smk.somnia.host/v1/graphql` legitimately only indexes Shannon (`50312`).
  - *SDK Silent Capture:* `verifyBinding` in `syncStatus.js:97` throws `NotConfiguredError`, but `loadEngineMarkets` in `exchange.js:1215` catches it into `registryReadFailures` (`exchange.registryReadError`) and returns an empty array without raising an exception or logging `console.warn`.
- **Workaround:** Explicitly supply `indexerUrl: "https://hideki-dev.smk.somnia.host/v1/graphql"`.
- **Duplicate Check Limitation:** Confirmed against public SDK samples; internal Jira/linear trackers cannot be audited externally.

### 2.2 Finding 2: `02_hideki_collateral_token_mismatch.md`
- **Title:** `SOMNIA_HIDEKI_TESTNET_ADDRESSES.collateral Points to Binary Market tUSDC (6 Decimals) Instead of MarginBank Perps Collateral USDso (18 Decimals)`
- **Severity:** `major` (Eligible for $40 tier)
- **Area:** `SDK | contracts`
- **Schema Compliance:** 100% compliant.
- **Precision Distinction:**
  - *Misleading Constant:* `SOMNIA_HIDEKI_TESTNET_ADDRESSES.collateral` is set to `0x9E9492cC533E8696A3b6afC7df730800DF75148f` (`tUSDC`, 6 decimals).
  - *Authoritative On-Chain Contract:* Calling `MarginBank(0x478769E1177C0773c43A593DCCc4Ad15F15F1394).getSystemConfig()` returns `collateralToken: 0xed7993A74dAe1e6656B704A424DcD8711aAf4F72` (`USDso`, 18 decimals).
  - *Workflow Consequence:* Approving `addresses.collateral` leaves `USDso` allowance zero, causing `MarginBank.depositCollateral(amount)` to revert. Avoids speculative claims of lost funds.
- **Workaround:** Pass the `USDso` address (`0xed7993A74dAe1e6656B704A424DcD8711aAf4F72`) explicitly for perps workflows.
- **Duplicate Check Limitation:** Public SDK manifests currently define single `collateral` property.

### 2.3 Finding 3: `03_sdk_socket_lifecycle_hang.md`
- **Title:** `SomniaMarkets.close() Leaves Active HTTP Keep-Alive Socket Handles, Delaying Node.js Process Exit`
- **Severity:** `normal` (Eligible for $15 tier)
- **Area:** `SDK`
- **Schema Compliance:** 100% compliant.
- **Precision Distinction:**
  - *Method Existence:* Corrected earlier draft; `exchange.close()` **does exist** and its JSDoc at `exchange.js:5337` promises that the Node process will exit on its own.
  - *Actual Measured Behavior:* `exchange.close()` terminates WebSockets, but leaves 2 active HTTP keep-alive `Socket` handles open (`process._getActiveHandles()`). The process delays exit for the ~15–20s HTTP keep-alive duration rather than hanging indefinitely.
- **Workaround:** Call `process.exit(0)` at script conclusion or unref handles.
- **Duplicate Check Limitation:** Common Node.js event-loop friction for CLI scripts.

---

## 3. Submission Readiness Matrix

| Finding Title | Target Area | Verified Severity | Readiness | Evidence Attached | Recommended Submission Order & Rationale |
|:---|:---:|:---:|:---:|:---:|:---|
| **#1: Hideki Indexer Endpoint Mismatch** | SDK / docs | `major` ($40) | **READY** | Full stack trace from `syncStatus.js:97`, reproduction script, working Hideki endpoint. | **1st Priority:** Immediate developer friction point; prevents market discovery on Hideki v2 out-of-the-box. |
| **#2: Hideki Collateral Token Mismatch** | SDK / contracts | `major` ($40) | **READY** | Raw RPC output from `MarginBank.getSystemConfig()`, decimal comparison (6 vs 18). | **2nd Priority:** Critical smart contract discrepancy; directly prevents collateral deposits and order placement. |
| **#3: Transport Socket Lifecycle** | SDK | `normal` ($15) | **READY** | `process._getActiveHandles()` trace, JSDoc contract citation, elapsed timing. | **3rd Priority:** Quality-of-life DX finding affecting automated tests and CLI scripts. |

*Total Potential Feedback Track Value: Up to $95 USD across the 3 validated submissions.*

---

## 4. Preserved MVP Progress & Workspace Status

All MVP development artifacts remain completely intact:
- [`README.md`](file:///C:/Users/NO%20GO%20NO/PerpsPilot/README.md): Production-quality manual with architecture diagram, 3-tier collateral model, and testnet disclosure.
- [`EVIDENCE.md`](file:///C:/Users/NO%20GO%20NO/PerpsPilot/EVIDENCE.md): Unpopulated execution template ready for Stage D real-order evidence (zero mock hashes).
- [`DEMO_SCRIPT.md`](file:///C:/Users/NO%20GO%20NO/PerpsPilot/DEMO_SCRIPT.md): 2.5-minute video walkthrough based on actual CLI outputs; execution marked pending.
- [`feedback/`](file:///C:/Users/NO%20GO%20NO/PerpsPilot/feedback): Contains the 3 official submission reports.
- [`feedback_staging/`](file:///C:/Users/NO%20GO%20NO/PerpsPilot/feedback_staging): Preserved for auditing continuity.
- Prior Audit Reports: `PerpsPilot_UPGRADE_AUDIT.md`, `PerpsPilot_STAGE_C_BOUNTY_AUDIT.md`, `PERPSPILOT_STAGE_C1_VERIFICATION.md`, `PERPSPILOT_STAGE_C2_PREFLIGHT.md`, `PERPSPILOT_STAGE_C3_FEEDBACK_AND_PACKAGING.md`, `PERPSPILOT_STAGE_C4_SUBMISSION_PACKAGE.md`.
- Test Suites: 23/23 unit tests passing.
- Credential Boundary: `.env` is unread and excluded by `.gitignore`. `DRY_RUN=true` strictly preserved.

---

## 5. Proposed Next Actions (Pre-Submission & Execution)

### Phase A: Local Preparation (Complete)
- [x] All 3 feedback reports verified, formatted, and placed in `/feedback/`.
- [x] MVP `README.md`, `EVIDENCE.md`, and `DEMO_SCRIPT.md` generated.
- [x] Full test suite and typechecks passing.

### Phase B: Controlled Stage D Execution (Awaiting User Key & Authorization)
1. **Local Credentials:** Operator adds testnet private key to local `.env`.
2. **Account Funding:** Ensure account holds `>= 0.05 STT` (gas) and `>= 10.00 USDso` (`0xed7993A74dAe1e6656B704A424DcD8711aAf4F72`).
3. **Preflight Confirmation:** Run `npm run preflight` to confirm all 8 checks report **PASS**.
4. **Controlled Trade:** With explicit operator approval, deposit `$5.00 – $20.00 USDso` into MarginBank and submit a single `$20.00 USDso` LIMIT order on `ETH-PERP`.
5. **Capture Evidence:** Populate [`EVIDENCE.md`](file:///C:/Users/NO%20GO%20NO/PerpsPilot/EVIDENCE.md) with authoritative transaction hash, block number, and fill status.

### Phase C: Git Initialization & External Publication (Post-Approval Only)
1. **Initialize Git:** Run `git init`, stage project files (verifying `.env` is excluded), and commit.
2. **Push to GitHub:** Push to a public repository (e.g. `github.com/<user>/PerpsPilot`).
3. **Register on DoraHacks:** Submit repository URL under the dreamDEX Perps Builder Bounty.
4. **Discord Whitelist:** Complete whitelist verification in the dreamDEX Discord.

---

## 6. Actions Intentionally NOT Taken

In strict accordance with instructions:
- **No external submissions:** Zero DoraHacks forms submitted; zero GitHub repositories published; zero emails or Discord messages sent.
- **No on-chain transactions:** No tokens approved, no collateral deposited, no orders submitted, and no faucet claims made.
- **No secret disclosure:** `.env` was never read, printed, or staged.
- **No Git commits or pushes:** Git remains uninitialized.
- **No fabricated claims:** No premature victory, acceptance, or bounty guarantees asserted.
