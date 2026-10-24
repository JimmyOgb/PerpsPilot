# PerpsPilot — Stage C.6 Final Feedback Track Readiness & Duplicate-Risk Audit

**Document ID:** `PERPSPILOT_STAGE_C6_FINAL_FEEDBACK_READINESS.md`  
**Date:** October 24, 2026  
**Timestamp:** `13:25:00 UTC+1`  
**Workspace:** `C:\Users\NO GO NO\PerpsPilot`  
**Target Program:** dreamDEX Perps Builder Bounty (DoraHacks)  
**Closing Deadline:** November 1, 2026, 23:59 UTC (~8 days remaining)  
**Operating Mode:** STRICT READ-ONLY (`DRY_RUN=true`) — Zero state changes, zero secrets logged, zero external publications.

---

## 1. Executive Verdict

### **Verdict:** `READY WITH CAVEATS`

- **Technical Quality:** **READY.** All three reports in [`feedback/`](file:///C:/Users/NO%20GO%20NO/PerpsPilot/feedback) are 100% compliant with the official DoraHacks submission schema (`# Short title`, `Severity`, `Area`, `Steps to reproduce`, `Expected`, `Actual`, `Evidence`, `Environment`). All technical claims, reproductions, and contract addresses have been independently tested against `@somnia-chain/markets-sdk@0.32.1` and the live Somnia Hideki Testnet (Tokyo v2, Chain ID `50383`).
- **Duplicate Risk:** **READY (High Public Uniqueness).** Thorough public audits across GitHub, npm, and ecosystem repositories found zero public duplicate issues or PRs for any of the three findings.
- **Prerequisite Caveats:**
  1. *Discord / Telegram Whitelist Requirement:* Official rules mandate that the submitting team/developer be whitelisted via the dreamDEX Discord or SomniaHacks Telegram group prior to bounty distribution.
  2. *Private Issue Tracker Invisibility:* While public GitHub repositories and documentation show no duplicate reports, organizer-private issue trackers (Linear/Jira) or concurrent unindexed DoraHacks submissions cannot be audited externally. First-to-submit status is determined solely upon organizer review.
  3. *Repository Publication Prerequisite:* The reports must be delivered within a public GitHub repository under a root-level `/feedback/` directory when creating the DoraHacks BUIDL submission.

---

## 2. Official Submission Mechanics & Authoritative Sources

| Requirement | Official Specification | Verification Status | Source & Access Date |
|:---|:---|:---:|:---|
| **Bounty Program** | dreamDEX Perps Builder Bounty | **VERIFIED** | DoraHacks (`https://dorahacks.io/bounty`), accessed 2026-10-24 |
| **Closing Timestamp** | November 1, 2026, 23:59 UTC | **VERIFIED** | Official DoraHacks bounty schedule, accessed 2026-10-24 |
| **Delivery Mechanism** | Public GitHub repository containing root-level `/feedback/` folder | **VERIFIED** | Official DoraHacks BUIDL guidelines, accessed 2026-10-24 |
| **Independent Evaluation** | One Markdown file per distinct issue; evaluated individually | **VERIFIED** | Feedback Track Submission Template, accessed 2026-10-24 |
| **Allowed Severity Values**| `critical`, `major`, `normal` | **VERIFIED** | Feedback Track Submission Template, accessed 2026-10-24 |
| **Allowed Area Values** | `API`, `SDK`, `docs`, `app`, `contracts` | **VERIFIED** | Feedback Track Submission Template, accessed 2026-10-24 |
| **Payout Structure** | $40 per accepted `critical`/`major` issue; $15 per `normal` issue (Pool: $1,500) | **VERIFIED** | Official Bounty Rules, accessed 2026-10-24 |
| **Whitelist Requirement**| Mandatory registration via dreamDEX Discord or SomniaHacks Telegram | **VERIFIED** | Official Participation Requirements, accessed 2026-10-24 |
| **First-Valid-Report Rule**| Only the first reproducible report is eligible; duplicates closed | **VERIFIED** | Official Evaluation Rules, accessed 2026-10-24 |
| **Responsible Disclosure** | Critical exploits must be reported privately to `security@dreamdex.io` | **VERIFIED** | Security Guidelines, accessed 2026-10-24 |

---

## 3. Public Duplicate-Risk Audit

A comprehensive search of public GitHub repositories, npm releases, official documentation, and issue trackers was conducted on October 24, 2026:

### 3.1 Finding 1: Hideki Indexer Chain Mismatch
- **Report File:** [`feedback/01_hideki_indexer_endpoint_mismatch.md`](file:///C:/Users/NO%20GO%20NO/PerpsPilot/feedback/01_hideki_indexer_endpoint_mismatch.md)
- **Closest Matching Public Reference:** None found. Public SDK samples and npm readmes reference `https://dev.smk.somnia.host/v1/graphql` without documenting that it is restricted to Shannon (`50312`). The Hideki-specific indexer `https://hideki-dev.smk.somnia.host/v1/graphql` is unreferenced in public GitHub repos.
- **Overlap & Differences:** Zero public overlap.
- **Duplicate Assessment:** **No public duplicate found.**
- **Confidence Level:** **High** (Public surface).

### 3.2 Finding 2: Hideki Collateral Token Constant Mismatch
- **Report File:** [`feedback/02_hideki_collateral_token_mismatch.md`](file:///C:/Users/NO%20GO%20NO/PerpsPilot/feedback/02_hideki_collateral_token_mismatch.md)
- **Closest Matching Public Reference:** None found. Public GitHub searches for `0x9E9492cC533E8696A3b6afC7df730800DF75148f` (`tUSDC`, 6 decimals) and `0xed7993A74dAe1e6656B704A424DcD8711aAf4F72` (`USDso`, 18 decimals) yielded zero public issue discussions or pull requests.
- **Overlap & Differences:** Zero public overlap. The SDK constant `SOMNIA_HIDEKI_TESTNET_ADDRESSES.collateral` remains hardcoded to `0x9E9492...` across all published distributions.
- **Duplicate Assessment:** **No public duplicate found.**
- **Confidence Level:** **High** (Public surface).

### 3.3 Finding 3: SDK Transport Socket Lifecycle
- **Report File:** [`feedback/03_sdk_socket_lifecycle_hang.md`](file:///C:/Users/NO%20GO%20NO/PerpsPilot/feedback/03_sdk_socket_lifecycle_hang.md)
- **Closest Matching Public Reference:** None found. No public issues mention `SomniaMarkets.close()` or lingering socket handles in Node's event loop.
- **Overlap & Differences:** Zero public overlap. The issue specifically targets HTTP keep-alive connection pooling in the SDK's fetch/GraphQL client rather than WebSocket streams.
- **Duplicate Assessment:** **No public duplicate found.**
- **Confidence Level:** **High** (Public surface).

---

## 4. Per-Report Evidence Quality & Technical Assessment

### Report 1: `01_hideki_indexer_endpoint_mismatch.md`
- **Title:** `SDK Captures Chain Mismatch Error Silently on Hideki (50383) When Configured With Common Testnet Indexer (50312), Returning Zero Markets`
- **Severity & Area:** `Severity: major` | `Area: SDK | docs`
- **Reproduction Quality:** Self-contained, minimal TypeScript script importing `SomniaMarkets` and `hidekiTestnet`.
- **Evidence Precision:**
  - Cites exact throw location: `node_modules/@somnia-chain/markets-sdk/dist/syncStatus.js:97:11` inside `verifyBinding()`.
  - Cites exact error handling location: `dist/unified/exchange.js:1215-1226` inside `loadEngineMarkets()`.
  - Cites exact public getter: `exchange.registryReadError`.
  - Demonstrates verified workaround: `https://hideki-dev.smk.somnia.host/v1/graphql`.
- **Integrity Check:** Zero credentials, zero private keys, zero speculative claims.

### Report 2: `02_hideki_collateral_token_mismatch.md`
- **Title:** `SOMNIA_HIDEKI_TESTNET_ADDRESSES.collateral Points to Binary Market tUSDC (6 Decimals) Instead of MarginBank Perps Collateral USDso (18 Decimals)`
- **Severity & Area:** `Severity: major` | `Area: SDK | contracts`
- **Reproduction Quality:** Complete RPC script querying ERC-20 metadata and `MarginBank.getSystemConfig()`.
- **Evidence Precision:**
  - Compares SDK constant `addresses.collateral` (`0x9E9492cC533E8696A3b6afC7df730800DF75148f`, `tUSDC`, 6 decimals).
  - Documents authoritative on-chain contract read: `MarginBank(0x478769E1177C0773c43A593DCCc4Ad15F15F1394).getSystemConfig()` returning `collateralToken: 0xed7993A74dAe1e6656B704A424DcD8711aAf4F72` (`USDso`, 18 decimals).
  - Clearly explains the practical failure: approving `addresses.collateral` leaves `USDso` allowance at zero, causing `MarginBank.depositCollateral` to revert with zero allowance. Avoids speculative claims of lost funds.
- **Integrity Check:** Zero credentials, zero private keys, zero mock hashes.

### Report 3: `03_sdk_socket_lifecycle_hang.md`
- **Title:** `SomniaMarkets.close() Leaves Active HTTP Keep-Alive Socket Handles, Delaying Node.js Process Exit`
- **Severity & Area:** `Severity: normal` | `Area: SDK`
- **Reproduction Quality:** Minimal Node.js script using `process._getActiveHandles()` immediately after `await exchange.close()` resolves.
- **Evidence Precision:**
  - Correctly acknowledges that `exchange.close()` exists and quotes line 5337 of `exchange.js` promising clean exit.
  - Documents observed output: 2 active `Socket` handles (`destroyed: false`) and 1 `TLSSocket` handle (`destroyed: true`).
  - Distinguishes keep-alive timeout delay (~15–20s) from an indefinite hang, and isolates the residual handles to HTTP transport connection pooling.
  - Strictly adheres to evidence standards without claiming sockets are "unref'd" unless proven.
- **Integrity Check:** Zero credentials, zero private keys.

---

## 5. Local Corrections & Canonical Packaging Audit

### 5.1 Local Corrections Applied in Stage C.6
1. **Wording Precision in `03_sdk_socket_lifecycle_hang.md`:**
   - Replaced speculative references to "unref'd keep-alive sockets" with:  
     `"These active keep-alive sockets keep the Node.js event loop active for their standard keep-alive window (typically ~15 to 20 seconds) after work has completed..."`
   - Replaced remediation guidance to emphasize cleanly destroying or closing underlying HTTP connection pools.
2. **Directory Synchronization:**
   - Synchronized all files between [`feedback/`](file:///C:/Users/NO%20GO%20NO/PerpsPilot/feedback) and [`feedback_staging/`](file:///C:/Users/NO%20GO%20NO/PerpsPilot/feedback_staging). SHA-256 hashes confirm byte-for-byte identity across both directories:
     - `01_hideki_indexer_endpoint_mismatch.md`: `31229D0D187AE7B0AC9D91D73E9B35773814115BFA1108CBFBB0A98D745D6CCB`
     - `02_hideki_collateral_token_mismatch.md`: `53B48C93F1B96D515F6DFCF1315D6BFAF22297BFD286A0BD2A928B9CA2FE6F85`
     - `03_sdk_socket_lifecycle_hang.md`: `5A13B2A44B46096510868D82F0930D59187547A61081C0085FF9B0CE6DF2C916`

### 5.2 Canonical Packaging Verification
- [`README.md`](file:///C:/Users/NO%20GO%20NO/PerpsPilot/README.md): Accurate, production-grade project documentation.
- [`EVIDENCE.md`](file:///C:/Users/NO%20GO%20NO/PerpsPilot/EVIDENCE.md): Unpopulated execution template with zero mock hashes; execution fields marked `PENDING_STAGE_D`.
- [`DEMO_SCRIPT.md`](file:///C:/Users/NO%20GO%20NO/PerpsPilot/DEMO_SCRIPT.md): 2.5-minute walkthrough grounded in real diagnostic runs, with trade execution marked pending. Social drafts marked `UNPUBLISHED — REVIEW REQUIRED`.

---

## 6. Whitelist & Submission Prerequisites

To prepare for external publication and bounty submission, the following sequence must be completed:

```
[Phase 1: Local Prep]  ==> COMPLETE (Reports validated, schema aligned, tests passing)
        │
        ▼
[Phase 2: Account Prep] ==> Operator populates PRIVATE_KEY in .env & funds testnet wallet
        │
        ▼
[Phase 3: Stage D Trade] ==> Controlled 0.0084 ETH limit order placed; EVIDENCE.md populated
        │
        ▼
[Phase 4: Git Push]     ==> git init, git remote add origin, git push (includes /feedback/)
        │
        ▼
[Phase 5: Whitelist]    ==> Operator requests whitelist in dreamDEX Discord or SomniaHacks Telegram
        │
        ▼
[Phase 6: DoraHacks]    ==> Submit BUIDL link on DoraHacks under Perps Builder Bounty
```

---

## 7. Actions Intentionally NOT Taken & Hard Stop

In strict adherence to safety directives:
- **Zero External Transmissions:** No DoraHacks BUIDL created; no GitHub repository pushed; no Discord messages or Telegram requests sent; no emails sent.
- **Zero On-Chain Transactions:** No private keys loaded; no STT or USDso spent; no orders broadcast; no tokens approved.
- **Zero Secret Exposure:** `.env` remains completely unread, unprinted, and ignored by `.gitignore`.
- **Dry-Run Preserved:** `DRY_RUN=true` remains enforced.
- **Git State:** Git remains uninitialized (`fatal: not a git repository`).

*PerpsPilot stands fully prepared and verified locally. Awaiting explicit operator authorization before initiating any external action.*
