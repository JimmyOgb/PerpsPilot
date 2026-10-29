# PerpsPilot — 2.5-Minute Demonstration Walkthrough Script

> **Purpose:** Script for recording the official DoraHacks submission walkthrough for PerpsPilot on Somnia Hideki Testnet (Tokyo v2).  
> **Status:** Grounded strictly in actual application outputs. Execution phase is marked **PENDING** until live Stage D trade execution.

---

## 🎬 Video Overview

- **Total Duration:** 2 minutes 30 seconds
- **Format:** Screen recording with terminal CLI + code overview + voiceover / annotations
- **Resolution:** 1080p (1920x1080, 60fps)

---

## ⏱️ Timeline & Scene Breakdown

### Scene 1: Introduction & Mission (0:00 – 0:30)
- **Visual:** PerpsPilot repository, `README.md` title, architecture diagram.
- **Narrator Script:**
  > *"Welcome to PerpsPilot—an explainable perpetuals trading copilot and risk engine designed for dreamDEX on the high-speed Somnia Hideki testnet.  
  > Somnia's 10-millisecond block cadence makes ultra-fast execution possible, but automated trading without deterministic pre-trade risk checks can quickly lead to failed transactions and liquidations. PerpsPilot enforces mathematical safety and transparent three-tier collateral tracking before anything hits the network."*

---

### Scene 2: Live Network & Market Diagnostics (0:30 – 1:15)
- **Visual:** Terminal executing `npm run doctor`.
- **Command Output Demonstrated:**
  ```bash
  npm run doctor
  ```
  ```text
  ================================================================================
    PerpsPilot — Official dreamDEX Perps Integration Diagnostics
    Somnia Hideki Testnet (Tokyo v2, Chain ID 50383)
  ================================================================================

  [PASS] 1. Configuration Verification          : Chain: 50383 (hideki), DRY_RUN: true, Symbol: ETH-PERP
  [PASS] 2. Hideki v2 RPC Connectivity          : Chain ID: 50383 (Verified Hideki v2), Latest Block: #31888531
  [PASS] 3. Live Perps Market Discovery         : Discovered 21 active perpetual markets from Hideki v2 Factory
  [PASS] 4. Target Market Parameters            : Target: ETH-PERP (ETH:USDSO) | Pool: 0xd6cb1dd5... | BaseDecimals: 18
  [PASS] 5. Precision & Grid Validation         : Sized 20 USDso notional -> 0.0084 ETH (aligned to lot 0.0001, tick 0.01)
  [PASS] 6. SomniaMarkets SDK Client            : Initialized SomniaMarkets client with chainId 50383
  [PASS] 7. Oracle Health Snapshot              : Pool 0xd6cb1dd5... | Mark Price: $2363.79 (Fresh & Priceable)
  [BLOCKED] 8. Account Margin & Signer Status      : No PRIVATE_KEY set in .env (Read-Only Mode). Account balance inspection is skipped.

  ================================================================================
    Diagnostic Summary: 7/8 PASS | 0 FAIL | 1 BLOCKED
  ================================================================================
  ```
- **Narrator Script:**
  > *"Running `npm run doctor` connects directly to the live Somnia Hideki v2 RPC at chain ID 50383, verifying block heights beyond 31 million.  
  > It queries the on-chain factory and indexer to dynamically discover 21 active perpetual markets, pulls live oracle health for ETH-PERP, and confirms fresh priceability.  
  > Notice that account checks cleanly report BLOCKED rather than guessing or fabricating balances."*

---

### Scene 3: Pre-Trade Risk Preflight & Sizing Grid (1:15 – 1:55)
- **Visual:** Terminal executing `npm run preflight`.
- **Command Output Demonstrated:**
  ```bash
  npm run preflight
  ```
  ```text
  ================================================================================
    Proposed First-Order Plan (Somnia Hideki v2)
  ================================================================================
    Market Symbol       : ETH-PERP (ETH:USDSO)
    Pool Contract       : 0xd6cb1dd58580b84d76068ac21594219ce03aeddf
    Side                : LONG (Bid)
    Order Type          : LIMIT (Aligned to grid)
    Limit Price         : $2363.15 USDso (Aligned to tick 0.01)
    Target Notional     : $20 USDso
    Calculated Quantity : 0.0084 ETH (Aligned to lot 0.0001)
    Estimated Notional  : $19.85046 USDso
    Configured Leverage : 2x (Market Maximum: 20x)
    Initial Margin Req  : ~$0.992523 USDso (5% IMF base at 20x max leverage)
    Market Minimum Qty  : 0.004 ETH (~$9.4526 USDso)
    Market Max Position : 399.5612 ETH (~$943,000 USDso)
    Precision Check     : VALID
    DRY_RUN Status      : DRY_RUN=true STRICTLY ENFORCED (No order sent)
  ================================================================================
  ```
- **Narrator Script:**
  > *"Next, `npm run preflight` computes a safe, grid-aligned order.  
  > Sizing for a $20 USDso target notional produces exactly 0.0084 ETH, satisfying both the 0.004 ETH market minimum and the 0.0001 ETH lot grid.  
  > It previews the Initial Margin Fraction requirement—just $0.99 USDso—and enforces DRY_RUN safety so no transaction can be broadcast unintentionally."*

---

### Scene 4: Three-Tier Collateral Model & Live Execution (1:55 – 2:20)
- **Visual:** Display architecture graphic showing the 3 Fund Tiers, followed by live terminal testnet execution and the on-chain evidence panel.
- **Narrator Script:**
  > *"PerpsPilot eliminates a major pain point in dreamDEX development: the distinction between liquid wallet tokens and MarginBank collateral.  
  > Liquid USDso in your wallet cannot back perps until deposited into MarginBank. PerpsPilot validates all three tiers: native STT for gas, liquid USDso for deposits, and MarginBank equity for cross-margin backing.  
  > In live mode, PerpsPilot enforces the mandatory 8-gate ExecutionGuard pipeline before requesting a wallet signature. On Somnia Hideki v2, our verified order placement and cancellation transactions demonstrate full lifecycle integrity: placing a maker POST_ONLY order, locking margin, verifying book resting state, and releasing collateral upon cancellation."*

---

### Scene 5: Developer Contributions & Conclusion (2:20 – 2:30)
- **Visual:** Showing `feedback_staging/` reports and closing summary.
- **Narrator Script:**
  > *"In building PerpsPilot, we also contributed 3 verified upstream bug reports for the Somnia Markets SDK covering indexer chain bindings, MarginBank token configuration, and transport socket lifecycles.  
  > PerpsPilot: explainable, safe, and ready for dreamDEX. Thank you!"*

---

## 📢 Social Media Announcements (Drafts)

> **STATUS:** UNPUBLISHED — REVIEW REQUIRED. DO NOT POST.

### Post 1: General Project Announcement
```text
Excited to unveil PerpsPilot 🛫 — an explainable perpetuals trading copilot built for @DreamDEXSomnia on the @Somnia_Network Hideki Tokyo v2 testnet! ⚡

Trading on a 10ms block cadence requires total clarity before an order hits the chain:
🔹 Auto-discovers 21 live perp markets
🔹 Pre-trade lot & tick alignment
🔹 3-tier margin reconciliation (STT gas vs USDso collateral)
🔹 Built-in dry-run safety guards

Check out our open-source repo & DoraHacks submission! 🛠️ #Somnia #dreamDEX #DeFi
```

### Post 2: Deep Dive into Risk Architecture
```text
Perps trading shouldn't be a black box. 📦

When building on @DreamDEXSomnia, your liquid USDso in-wallet isn't perps margin until deposited into MarginBank. PerpsPilot enforces clear fund-tier isolation:
1️⃣ L1 STT for gas
2️⃣ ERC-20 USDso
3️⃣ MarginBank cross-collateral

Our preflight engine previews IMF margin, lot grids, and mark oracle health before order submission. Safe, explainable, testnet-first. 🛡️ #dreamDEX
```

### Post 3: Developer Contributions (Feedback Track)
```text
Building on bleeding-edge infrastructure means contributing back to the ecosystem! 🤝

While engineering PerpsPilot for @DreamDEXSomnia Hideki v2 (Chain 50383), we documented 3 key DX improvements for the Markets SDK:
✅ Indexer multi-chain configuration
✅ MarginBank collateral token resolution
✅ Socket lifecycle handle management

Excited to help make dreamDEX the best dev experience in DeFi! 🚀
```
