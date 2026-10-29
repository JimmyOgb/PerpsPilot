# PerpsPilot — Authoritative On-Chain Execution Evidence Log

> **Network:** Somnia Hideki Testnet (Tokyo v2, Chain ID `50383`, Network ID `50000259`)  
> **Status:** Stage F.24 Live On-Chain Order Lifecycle Verified (Placement, Resting CLOB Verification & Cancellation)  
> **Integrity Notice:** All transactions, receipts, and order parameters below were executed on Somnia Hideki v2, mined in blocks, and independently reconciled via JSON-RPC calls to `https://api.hideki2.infra.testnet.somnia.network`.

---

## 1. On-Chain Execution Overview

| Metric | Transaction 1 (Placement) | Transaction 2 (Cancellation) |
|:---|:---|:---|
| **Action** | `placeOrder` (Resting Maker Order) | `cancelOrder` (Collateral Release) |
| **Transaction Hash** | `0xdea7fc0070e42b632ebe90fe57509abdf9cb464a98f73277b1c6cc85b92777e7` | `0x6c2661e69bf8593e117e9d7fafeb1f125640db5c4841243c648d22fe917ffea7` |
| **Block Number** | `36,237,119` | `36,237,214` (+95 blocks / +10 seconds) |
| **Block Timestamp** | `2026-10-29T12:28:34.000Z` (`1793276914`) | `2026-10-29T12:28:44.000Z` (`1793276924`) |
| **Transaction Index** | `1` | `0` |
| **Sender Account** | `0xDc7c4aFBa201D2a3108061107346e9ff70f0Ca2c` | `0xDc7c4aFBa201D2a3108061107346e9ff70f0Ca2c` |
| **Sender Nonce** | `2` | `3` |
| **Target Contract** | `0xd6cb1dd58580b84d76068ac21594219ce03aeddf` (`ETH-PERP`) | `0xd6cb1dd58580b84d76068ac21594219ce03aeddf` (`ETH-PERP`) |
| **EVM Gas Used** | `1,674,788` | `136,005` |
| **Effective Gas Price** | `6,000,000,000` wei (`6 Gwei`) | `6,000,000,000` wei (`6 Gwei`) |
| **Transaction Status** | `1` (`success`) | `1` (`success`) |

---

## 2. Order Specification & Decoded Parameters

| Parameter | Value | Notes |
|:---|:---|:---|
| **Market** | `ETH-PERP` | Target pool: `0xd6cb1dd58580b84d76068ac21594219ce03aeddf` |
| **MarginBank Contract** | `0x478769E1177C0773c43A593DCCc4Ad15F15F1394` | Cross-margin backing contract |
| **Order Side** | `BUY` / `LONG` (`isBid = true`) | Bid placed on ETH-PERP book |
| **Order Type** | `POST_ONLY` (`3`) | Guarantees maker execution; reverts if immediately matching |
| **Self-Matching Option** | `CANCEL_TAKER` (`0`) | Protocol safety prevention |
| **Limit Price** | `2,200.00 USDso` (`2200000000000000000000` wei) | Aligned to `$0.01` tick size (`18dp`) |
| **Order Quantity** | `0.004 ETH` (`4000000000000000` wei) | Aligned to `0.0001 ETH` lot size (`18dp`) |
| **Effective Notional** | `$8.80 USDso` | Within `$20.00` safety cap |
| **Initial Margin Locked** | `$0.44 USDso` (`440000000000000000` wei) | Exactly `5.0%` protocol floor (`BASE_IMF_BPS = 500`) |
| **Expiry Timestamp** | `3338540000000000000` ns | Valid future GTC expiry timestamp in nanoseconds |
| **Contract Order ID** | **`5460236245818038181306`** (`0x1280000000000a65dba`) | Decoded via `@somnia-chain/markets-sdk` |

---

## 3. Fill Verification & Order Lifecycle

| Lifecycle Stage | On-Chain Result | Evidence / Logs |
|:---|:---|:---|
| **Placement** | Mined in block `36237119` | Tx `0xdea7fc...` status `success` |
| **Orderbook State** | **Resting in CLOB** (Zero fills) | Archival call `getOrder(5460236245818038181306)` at block `36237119` returned: `quantityRemaining: 0.004 ETH`, `fullQuantity: 0.004 ETH`, `fills: []`. |
| **Margin Lock** | `0.44 USDso` locked in MarginBank | `Log[0]` from MarginBank (`0x4787...1394`): locked `0x061b31ab352c0000` wei. |
| **Cancellation** | Mined in block `36237214` | Tx `0x6c2661...` called `cancelOrder(5460236245818038181306)`. |
| **Margin Release** | `0.44 USDso` collateral unlocked | `Log[0]` from MarginBank (`0x4787...1394`): unlocked `0x061b31ab352c0000` wei. |
| **Final Order State** | Removed from active CLOB | Subsequent call `getOrder(5460236245818038181306)` reverts with `0x8080c2ed` (Order no longer active). |
| **Final Position State** | `size = 0` (Zero position) | `MarginBank.getPosition(operator, pool)` returns `(size: 0, avgEntryPrice: 0)`. |

---

## 4. Post-Trade Account Health State

Authoritatively verified from on-chain state at latest block:

| Account Metric | Authoritative On-Chain Value | Unit / Formatting |
|:---|:---|:---|
| **STT Gas Balance** | `99.9844` STT | 18 decimals native token |
| **Wallet Liquid USDso** | `180.00` USDso | 18 decimals ERC-20 (`0xed7993...`) |
| **MarginBank Unlocked Collateral** | `20.00` USDso | Cross-margin equity ready for trading |
| **MarginBank Locked Collateral** | `0.00` USDso | Zero collateral encumbered (resting order cancelled) |
| **Net Active Position Size** | `0.0000` ETH | No open position or directional exposure |
| **Account Margin Status** | `0` (`Healthy`) | Fully unencumbered |

---

## 5. Independent Verification Guide for Judges

Any auditor or hackathon judge can independently verify these transactions directly against Somnia Hideki v2 using standard JSON-RPC:

### Query Placement Transaction:
```bash
curl -s -X POST https://api.hideki2.infra.testnet.somnia.network \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_getTransactionReceipt","params":["0xdea7fc0070e42b632ebe90fe57509abdf9cb464a98f73277b1c6cc85b92777e7"],"id":1}'
```

### Query Cancellation Transaction:
```bash
curl -s -X POST https://api.hideki2.infra.testnet.somnia.network \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_getTransactionReceipt","params":["0x6c2661e69bf8593e117e9d7fafeb1f125640db5c4841243c648d22fe917ffea7"],"id":1}'
```
