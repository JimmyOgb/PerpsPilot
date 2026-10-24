# PerpsPilot — Stage C.1 Independent Verification & Stage D Gate Report

**Date of Audit:** October 24, 2026  
**Auditor / Engine:** Antigravity (Google DeepMind Advanced Agentic Coding)  
**Target Environment:** Somnia Hideki Testnet (Tokyo Low-Latency v2, Chain ID `50383` / `0xc4cf`)  
**Bounty Program:** dreamDEX Perps Builder Bounty (DoraHacks, Ends November 1, 2026, 23:59 UTC)  
**Dual-Track Focus:** MVP Track ($500) + Feedback Track (up to $1,500)  
**Baseline Workspace:** `C:\Users\NO GO NO\PerpsPilot`  
**Execution Mode:** STRICTLY READ-ONLY (`DRY_RUN=true`). Zero state modification, zero funds moved, zero orders signed.

---

## 1. Executive Summary & Gate Decision

### Gate Decision: **CONDITIONAL NO-GO FOR IMMEDIATE SIGNING | GO FOR PREPARATION**
- **Read-Only Infrastructure:** **100% OPERATIONAL**. All baseline commands (`typecheck`, `build`, `test`, `doctor`, `preflight`) execute with zero errors.
- **On-Chain Perps Connectivity:** Live RPC and Indexer connections are healthy; 21 active perpetual pools discovered from the Hideki v2 factory (`0xE631fAEE547baeE07353E290f0562ea67d856560`).
- **Target Market ETH-PERP:** Pool `0xd6cb1dd58580b84d76068ac21594219ce03aeddf` is priceable with fresh oracle mark at ~$2,365.06 USDso.
- **Account Signer Gate:** **BLOCKED BY DESIGN**. No local `.env` exists with private credentials. In accordance with strict security rules, Antigravity has not requested secrets, fabricated test accounts, or simulated signatures.
- **Safety Boundary:** `DRY_RUN=true` is strictly maintained across configuration.

---

## 2. Actual Baseline Command Results

All baseline commands were independently re-run and logged with exact timestamps and exit codes:

| Command | Script Definition | Exit Code | Timestamp (UTC+1) | Actual Execution Output & Characteristics |
| :--- | :--- | :---: | :---: | :--- |
| **`npm run typecheck`** | `tsc --noEmit` | **0** | `11:49:26` | 100% clean typecheck; 0 TypeScript errors. |
| **`npm run build`** | `tsc` | **0** | `11:49:56` | Clean compilation into `dist/`. |
| **`npm test`** | `vitest run` | **0** | `11:51:16` | **26 passed across 5 test suites (duration: 60.07s)**.<br/>- 4 deterministic unit suites (no network, 23 tests, ~200ms): `config.test.ts` (7), `precision.test.ts` (9), `risk.test.ts` (5), `preflight.test.ts` (2).<br/>- 1 live integration suite (network dependent, 3 tests, ~55s): `network.test.ts` querying live Hideki v2 RPC & indexer. |
| **`npm run doctor`** | `tsx src/diagnostics/runDiagnostics.ts` | **0** | `11:52:46` | **7/8 PASS \| 0 FAIL \| 1 BLOCKED**.<br/>Chain ID: 50383, Latest Block: `#31870382`, 21 active perp markets discovered, ETH-PERP Mark: `$2,365.01 USDso`. |
| **`npm run preflight`** | `tsx src/diagnostics/runAccountPreflight.ts` | **0** | `11:53:43` | **3/8 PASS \| 0 FAIL \| 5 BLOCKED**.<br/>Chain ID: 50383, Latest Block: `#31871037`, ETH-PERP Mark: `$2,365.06 USDso`. Safely halts at unconfigured signer. |

---

## 3. Current Market & Account Readiness

### 3.1 Fresh ETH-PERP Live Metadata
Independently verified from the factory contract and on-chain oracle:
- **Pool Contract:** `0xd6cb1dd58580b84d76068ac21594219ce03aeddf`
- **Base Token:** `0x1516ccebca301d0651bc27dcdf9b1c2f18c3b4cd` (ETH, 18 decimals)
- **Quote Token:** `0xed7993a74dae1e6656b704a424dcd8711aaf4f72` (USDso, 18 decimals)
- **MarginBank:** `0x478769e1177c0773c43a593dccc4ad15f15f1394`
- **Stop Registry:** `0x44bfa5b28684e8d2156d15b85902da18f02b3a34`
- **Oracle Health:** `priceable: true` via `tryGetHealthSnapshot` (Mark: **$2,365.06 USDso**)
- **Tick Size:** `10000000000000000` (**$0.01 USDso**)
- **Lot Size:** `100000000000000` (**0.0001 ETH**)
- **Minimum Quantity:** `4000000000000000` (**0.0040 ETH**, ~$9.46 USDso)
- **Maximum Position Size:** `399561200000000000000` (**399.5612 ETH**, ~$945,000 USDso)
- **Market Open Interest Cap:** `7991225000000000000000` (**7,991.2250 ETH**)
- **Initial Margin Fraction (IMF):** **500 bps (5.0% = 20x max leverage)**
- **Maintenance Margin (MM):** **250 bps (2.5%)**
- **Close-Out Margin:** **125 bps (1.25%)**

### 3.2 Account Readiness Reconciliation (The Three Fund Tiers)
Perps trading on Somnia Hideki v2 requires reconciling three distinct balance tiers:

```
[ Tier 1: STT Gas ]      -> Native STT in wallet (pays EVM execution gas fees)
[ Tier 2: USDso Wallet ]  -> ERC-20 token (0xed7993...); CANNOT back perps directly
[ Tier 3: MarginBank ]   -> Unlocked USDso deposited in MarginBank (0x478769...); BACKS PERPS ORDERS
```

| Check Item | Status | Technical Details |
| :--- | :---: | :--- |
| **Signer Configuration** | `BLOCKED` | No `.env` configured with `PRIVATE_KEY`. Safe read-only mode active. |
| **Native STT Gas** | `BLOCKED` | Cannot query wallet without derived address. Recommended min: 0.05 STT. |
| **USDso Wallet Balance** | `BLOCKED` | Cannot query ERC-20 balance without derived address. |
| **MarginBank Collateral** | `BLOCKED` | Cannot query `MarginBank.getAccountState` without derived address. |
| **Max Permitted Size** | `BLOCKED` | Authoritative `getMaxPerpOrderSize` requires account address. |

---

## 4. Order-Path & Risk-Control Review

### 4.1 Exact SDK Method & Parameter Encoding
The authoritative order submission call on `@somnia-chain/markets-sdk` is:
```ts
trader.placePerpOrder({
  pool: "0xd6cb1dd58580b84d76068ac21594219ce03aeddf",
  isBid: true,                     // true = LONG (Buy), false = SHORT (Sell)
  price: 2365060000000000000000n,  // $2,365.06 in 18dp quote units (aligned to tick 0.01)
  quantity: 8400000000000000n,     // 0.0084 ETH in 18dp base units (aligned to lot 0.0001)
  orderType: 0,                    // 0 = LIMIT (NormalOrder), 3 = POST_ONLY
  expireTimestampNs: 0n,           // Defaults to far future (~100 years)
  selfMatchingOption: 0,           // 0 = Cancel Taker on self-cross
  builder: "0x0000000000000000000000000000000000000000",
  builderFeeBpsTimes1k: 0n,
})
```
Under the hood, this encodes a direct EVM call to `PerpPool.placeOrder(bool, uint64, uint256, uint256, uint64, uint8, uint8, address, uint96)`.

### 4.2 Key Protocol Findings on Leverage, Sizing & Execution
1. **Leverage is NOT an order parameter**: The smart contract does not accept a `leverage` argument. Position leverage is an emergent mathematical ratio: `positionNotional / accountEquity`. Account-level caps can be set via `trader.setPerpLeverage({ pool, leverageX })`. If unset, the market's 500 bps IMF (20x) governs.
2. **Order Execution Dynamics at Mark Price**:
   - If submitted as `orderType: 0` (LIMIT) at the mark price: if resting asks exist at or below $2,365.06, the order will execute immediately as a **taker** (`OrderFilled` emitted in receipt). If best ask is above $2,365.06, it will rest on the orderbook as a **maker** (`OrderPlaced` emitted).
   - If submitted as `orderType: 3` (POST_ONLY): the contract strictly prevents taking liquidity. If the price would cross the spread, it reverts without charging margin.
3. **Receipt & Event Decoding**:
   The SDK decodes execution via `decodePlaceOrder(receipt, pool)`:
   - **Rested / Open:** `orderId` is present; `fills` array is empty (`fills.length === 0`).
   - **Partially Filled:** `orderId` present; `fills.length > 0`; sum of fill quantities < order quantity.
   - **Fully Filled:** `fills.length > 0`; sum of fill quantities === order quantity.
   - **Reverted:** EVM transaction reverts (`status === 0` or thrown `ContractRevertError` with protocol error name such as `InsufficientBalance`, `MarketRestricted`, `InitialMarginRequirementNotMet`).
4. **Idempotency & Timeout Protection**:
   - `clientOrderId` (uint64 `userData`) can be supplied to track orders uniquely.
   - On RPC network timeout, PerpsPilot queries `eth_getTransactionReceipt` or `client.listPerpPositions(account)` at the latest block number before retrying to eliminate duplicate fills.

### 4.3 Recalculated Proposed First Order (Fresh Live Snapshot)
- **Market:** `ETH-PERP` (`0xd6cb1dd58580b84d76068ac21594219ce03aeddf`)
- **Side:** `LONG` (isBid: true)
- **Order Type:** `LIMIT` (orderType: 0)
- **Fresh Mark Price:** **$2,365.06 USDso**
- **Calculated Quantity:** **0.0084 ETH** (Aligned to 0.0001 ETH lot)
- **Estimated Notional:** **$19.8665 USDso**
- **Configured Leverage:** **2.0x**
- **Initial Margin Requirement:** **~$0.9933 USDso** (5% base IMF)
- **Minimum Quantity Check:** `0.0084 ETH >= 0.0040 ETH` (**PASS**)
- **Maximum Position Check:** `0.0084 ETH <= 399.5612 ETH` (**PASS**)

---

## 5. Independent Validation of the Three Feedback Candidates

### Candidate 1: Indexer Chain Mismatch
- **Status:** **CONFIRMED (Defect in Default Indexer Binding / DX)**
- **SDK Version:** `@somnia-chain/markets-sdk@0.32.1`
- **Reproduction:** Called `new SomniaMarkets({ chain: hidekiTestnet, indexerUrl: "https://dev.smk.somnia.host/v1/graphql" }).loadMarkets()`.
- **Expected:** Discovers Hideki perpetual markets or surfaces a clear configuration error.
- **Actual:** Fails silently with internal error:
  `NotConfiguredError: indexer reads on chain 50383 — needs an indexerUrl for chain 50383 (https://dev.smk.somnia.host/v1/graphql indexes chains [50312])`
  stored in `registryReadFailures` Map, returning 0 markets with no console log.
- **Supported Workaround:** Explicitly pass `indexerUrl: "https://hideki-dev.smk.somnia.host/v1/graphql"`.
- **Practical Impact & Severity:** **Major**. Any developer following testnet tutorials targeting Hideki gets 0 perpetual markets and assumes testnet CLOB is down.
- **Safety:** Safe for public disclosure.

### Candidate 2: Collateral Token Address Constant Ambiguity
- **Status:** **CONFIRMED (Misleading Address Constant Definition)**
- **SDK Version:** `@somnia-chain/markets-sdk@0.32.1`
- **Reproduction:** Inspected `SOMNIA_HIDEKI_TESTNET_ADDRESSES.collateral` (`0x9E9492cC533E8696A3b6afC7df730800DF75148f`) vs `PerpPool(0xd6cb1dd5...).quoteToken()` (`0xed7993A74dAe1e6656B704A424DcD8711aAf4F72`).
- **Expected:** Constant named `collateral` in a set containing `marginBank` and `perpPoolFactory` should represent perps collateral or be distinguished from binary collateral.
- **Actual:** It points to `tUSDC` (6 decimals, binary markets). Approving it to `MarginBank` approves the wrong token; `MarginBank.deposit` attempts to pull `USDso` (18 decimals), failing with zero allowance.
- **Supported Workaround:** Manually override collateral address with Hideki USDso (`0xed7993A74dAe1e6656B704A424DcD8711aAf4F72`).
- **Practical Impact & Severity:** **Major**. Breaks automated deposits and bot approvals for all new perps developers.
- **Safety:** Safe for public disclosure.

### Candidate 3: Transport Socket Lifecycle & Event-Loop Hang
- **Status:** **CONFIRMED WITH UPSTREAM NUANCE (Persistent Handles Delay Exit)**
- **SDK Version:** `@somnia-chain/markets-sdk@0.32.1`
- **Reproduction:** Ran minimal script calling `exchange.loadMarkets()` followed by `await exchange.close()`.
- **Expected:** Script terminates promptly upon completion.
- **Actual:** `exchange.close()` resolves in ~5ms, but 3 active handles (`Socket`, `Socket`, `TLSSocket`) remain open in the Node.js event loop from underlying HTTP/HTTPS keep-alive connection pools, delaying process termination by ~20 seconds unless `process.exit()` is invoked.
- **Supported Workaround:** Invoke `process.exit(0)` at the end of standalone CLI commands.
- **Practical Impact & Severity:** **Normal**. Affects automated testing scripts, CLI runners, and cron jobs.
- **Safety:** Safe for public disclosure.

---

## 6. Ranked Candidate Improvements for Winning

| Priority | Improvement | User Value & Differentiation | Scope & Dependencies | Risk & Effort |
| :---: | :--- | :--- | :--- | :---: |
| **P1** | **Pre-Trade Risk & Margin Explainer** | Explains order margin, adverse gap, liquidation price, and lot grid before placing. | Uses existing `previewPerpOrderMargin` and `validateOrderPrecision`. | Low risk / 3 hours |
| **P2** | **Deterministic Execution State Machine** | Prevents blind submissions: PROPOSAL -> RISK_GATE -> SUBMISSION -> RECEIPT -> CONFIRMED -> FILLED. | Core state machine with viem receipt & log parsing. | Low risk / 3 hours |
| **P3** | **Authoritative Position & Fill History** | Provides undeniable proof of testnet orders and fills for judges. | Queries `listPerpPositions` & `getPerpPositionAnalytics`. | Low risk / 2 hours |
| **P4** | **Verifiable Evidence & Demo Pack** | DoraHacks requirement: real tx hashes on Hideki v2, video walkthrough, and screenshots. | Automated Playwright script + markdown evidence log. | Low risk / 2 hours |
| **P5** | **Mainnet Adaptation Blueprint** | Clear path to mainnet deployment post-testnet ($200 conditional award). | Documentation in README comparing testnet vs mainnet contract addresses. | Low risk / 1 hour |

---

## 7. Exact Stage D Execution Proposal

### 7.1 Proposed Transaction Plan (Frozen until User Approval)
- **Network:** Somnia Hideki Testnet (Chain ID `50383`, RPC: `https://api.hideki2.infra.testnet.somnia.network`)
- **Target Market:** `ETH-PERP` (`0xd6cb1dd58580b84d76068ac21594219ce03aeddf`)
- **MarginBank:** `0x478769E1177C0773c43A593DCCc4Ad15F15F1394`
- **Collateral Token:** USDso (`0xed7993A74dAe1e6656B704A424DcD8711aAf4F72`)
- **Side & Order Type:** `LONG` (Bid), `LIMIT` (orderType: 0)
- **Limit Price:** Fresh mark price (e.g., ~$2,365.06 USDso)
- **Order Quantity:** `0.0084 ETH` (estimated notional ~$19.87 USDso)
- **Initial Margin Required:** ~$0.9933 USDso
- **Recommended Deposit:** `$5.00 USDso` deposited into MarginBank (sufficient buffer for 5 orders)
- **Gas Reserve:** `>= 0.05 STT` native gas in wallet

### 7.2 Execution Sequence
1. **Approval Step (One-Time):** `USDso.approve(MarginBank, 5_000_000_000_000_000_000n)` (5 USDso).
2. **Deposit Step:** `trader.depositMargin({ marginBank, amount: 5_000_000_000_000_000_000n })`.
3. **Placement Step:** `trader.placePerpOrder({ pool, isBid: true, price, quantity: 8400000000000000n, orderType: 0 })`.
4. **Verification Step:** Capture transaction hash, parse `OrderPlaced` / `OrderFilled` events, query `client.listPerpPositions(account)`.

### 7.3 Containment & Rollback Plan (On-Chain Realities)
- **Unfilled (Resting) Orders:** Can be cancelled on-chain via `trader.cancelPerpOrder({ pool, orderId })` to release locked margin back to `unlockedCollateralBalance`.
- **Filled Positions:** Cannot be "rolled back" on-chain. Containment requires submitting an opposing order (`isBid: false`, same quantity) to flatten the position and realize PnL.
- **Collateral Withdrawal:** Unlocked collateral can be withdrawn back to the wallet at any time via `trader.withdrawMargin({ marginBank, amount })`.

---

## 8. MVP Submission Preparation Checklist

- [x] TypeScript build and typecheck with zero errors.
- [x] Read-only doctor and diagnostic preflight passing.
- [x] 26 comprehensive tests verifying precision, risk, config, and live network.
- [x] Authoritative market metadata and precision constraints validated.
- [x] Fail-closed risk gates implemented.
- [ ] Wallet configured with Hideki v2 testnet STT and USDso (`.env`).
- [ ] One real testnet order submitted and confirmed on-chain with tx hash.
- [ ] Demo video generated and recorded.
- [ ] Public GitHub repository initialized with clean commit history.
- [ ] 2-3 genuine X posts drafted tagging `@DreamDEXSomnia`.

---

## 9. Evidence Paths & Limitations

- **Evidence Paths:** Transaction receipts, block numbers, emitted event logs, and `getPerpPosition` query responses will be captured in a dedicated markdown evidence log (`EVIDENCE_STAGE_D.md`).
- **Limitations:**
  - Testing is strictly confined to Somnia Hideki Testnet (50383).
  - Mainnet perps are not yet deployed by the protocol.
  - Faucet claims and token minting require manual user acquisition via the official dreamDEX testnet faucet / bridge.

---

## 10. Actions Intentionally Not Taken

In accordance with safety and audit instructions, Antigravity has **NOT**:
1. Requested or stored any private keys or credentials.
2. Initialized Git, created commits, pushed to GitHub, or deployed anything.
3. Created, signed, or submitted any on-chain transaction.
4. Approved tokens, deposited collateral, or placed orders.
5. Published feedback reports or posted on social media.
6. Changed `DRY_RUN=true` in configuration.
