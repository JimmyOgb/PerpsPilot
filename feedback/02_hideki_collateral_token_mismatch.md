# SOMNIA_HIDEKI_TESTNET_ADDRESSES.collateral Points to Binary Market tUSDC (6 Decimals) Instead of MarginBank Perps Collateral USDso (18 Decimals)
Severity: major
Area: SDK | contracts

## Steps to reproduce
1. Inspect `SOMNIA_HIDEKI_TESTNET_ADDRESSES` in `@somnia-chain/markets-sdk/dist/addresses.js`:
   ```ts
   export const SOMNIA_HIDEKI_TESTNET_ADDRESSES = {
     binaryModule: "0x3ecC694Cef705358864a646142ac17A90E29e388",
     // ...
     collateral: "0x9E9492cC533E8696A3b6afC7df730800DF75148f",
     marginBank: "0x478769E1177C0773c43A593DCCc4Ad15F15F1394",
     testUsdc: "0x9E9492cC533E8696A3b6afC7df730800DF75148f",
     // ...
   };
   ```
2. Query the token contracts on Somnia Hideki Testnet (Tokyo v2, Chain ID `50383`):
   - Address `0x9E9492cC533E8696A3b6afC7df730800DF75148f`: ERC-20 `symbol()` returns `"tUSDC"`, `decimals()` returns `6`.
3. Query the authoritative `MarginBank` contract on Hideki (`0x478769E1177C0773c43A593DCCc4Ad15F15F1394`) using `getSystemConfig()`:
   ```ts
   const config = await client.readContract({
     address: "0x478769E1177C0773c43A593DCCc4Ad15F15F1394",
     abi: marginBankAbi,
     functionName: "getSystemConfig",
   });
   console.log("collateralToken:", config.collateralToken);
   ```
4. Query token metadata for `config.collateralToken` (`0xed7993A74dAe1e6656B704A424DcD8711aAf4F72`):
   - ERC-20 `symbol()` returns `"USDso"`, `decimals()` returns `18`.

## Expected
`SOMNIA_HIDEKI_TESTNET_ADDRESSES` should either:
a) Provide clear, distinct keys for prediction/binary market collateral (`binaryCollateral: "0x9E94...tUSDC"`) and perpetuals margin collateral (`perpCollateral` or `usdso: "0xed79...USDso"`), OR
b) Clearly document that `addresses.collateral` is reserved exclusively for binary outcome markets, and specify the `MarginBank` collateral address for perpetuals developers.

## Actual
The single `collateral` field in `SOMNIA_HIDEKI_TESTNET_ADDRESSES` points to `0x9E9492cC533E8696A3b6afC7df730800DF75148f` (`tUSDC`, 6 decimals).

If an automated trading script or developer follows common patterns and approves `addresses.collateral` to `addresses.marginBank`, approval is granted for `tUSDC`. When the developer subsequently calls `MarginBank.depositCollateral(amount)`, `MarginBank` attempts to transfer `USDso` (`0xed7993A74dAe1e6656B704A424DcD8711aAf4F72`). Because `USDso` has not been approved, the deposit fails with an ERC-20 allowance or transfer error. Additionally, developers sizing collateral using 6 decimals encounter scaling mismatches against the 18-decimal `USDso` contract.

## Evidence
Authoritative on-chain contract read via RPC (`https://api.hideki2.infra.testnet.somnia.network`):
```text
SDK SOMNIA_HIDEKI_TESTNET_ADDRESSES.collateral: 0x9E9492cC533E8696A3b6afC7df730800DF75148f
Token Metadata: Symbol: tUSDC | Decimals: 6

MarginBank Address: 0x478769E1177C0773c43A593DCCc4Ad15F15F1394
MarginBank.getSystemConfig():
  marginBank:        0x478769E1177C0773c43A593DCCc4Ad15F15F1394
  collateralToken:   0xed7993A74dAe1e6656B704A424DcD8711aAf4F72
  perpPoolFactory:   0xE631fAEE547baeE07353E290f0562ea67d856560
  liquidationEngine: 0xA66d3C24Ad4a389d863846905D8173e1017e9F4D
  insuranceFund:     0x50826894D47C6D4f3BeA38BFDC7Dc5c5be171b80
  feeRecipient:      0xd58596620Ee6951B2958a931949e4ff7ce6222be
  maxLeverageLimit:  20
  fullyWired:        true

Authoritative MarginBank Token Metadata (0xed7993A74dAe1e6656B704A424DcD8711aAf4F72):
  Symbol: USDso | Decimals: 18
```

Verified workaround:
Applications interacting with perpetuals margin must bypass `SOMNIA_HIDEKI_TESTNET_ADDRESSES.collateral` and explicitly use `0xed7993A74dAe1e6656B704A424DcD8711aAf4F72` (`USDso`, 18 decimals) for approvals, deposits, and collateral queries.

## Environment
- SDK Version: `@somnia-chain/markets-sdk@0.32.1`
- Network: Somnia Hideki Testnet (Tokyo v2, Chain ID `50383`)
- Contracts:
  - MarginBank: `0x478769E1177C0773c43A593DCCc4Ad15F15F1394`
  - Perps Collateral (`USDso`): `0xed7993A74dAe1e6656B704A424DcD8711aAf4F72`
  - SDK Constant (`tUSDC`): `0x9E9492cC533E8696A3b6afC7df730800DF75148f`
- External Duplicate Check: Not confirmed against private issue trackers. Public SDK manifests currently define single `collateral` property.
