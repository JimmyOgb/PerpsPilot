import { useState, useEffect, useCallback, useRef } from 'react';
import { createPublicClient, createWalletClient, custom, http, formatUnits, type WalletClient } from 'viem';
import { hidekiTestnet } from '@somnia-chain/markets-sdk/chains';
import {
  SOMNIA_HIDEKI_CHAIN_ID,
  SOMNIA_HIDEKI_CHAIN_HEX,
  SOMNIA_RPC_URL,
  SOMNIA_EXPLORER_URL,
  USDSO_TOKEN_ADDRESS,
  MARGIN_BANK_ADDRESS,
  ERC20_READ_ABI,
  MARGIN_BANK_READ_ABI,
} from '../constants.js';
import { WalletState, PositionRecord, OpenOrderRecord } from '../types.js';

export interface UseWalletReturn {
  wallet: WalletState;
  connect: () => Promise<void>;
  disconnect: () => void;
  switchToHideki: () => Promise<void>;
  getWalletClient: () => WalletClient | null;
}

interface EthereumProvider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener: (event: string, handler: (...args: unknown[]) => void) => void;
}

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

const MARGIN_STATUS_LABELS: Record<number, string> = {
  0: 'Healthy',
  1: 'MarginCall',
  2: 'PartialLiquidation',
  3: 'CloseOut',
};

export function useWallet(): UseWalletReturn {
  const [wallet, setWallet] = useState<WalletState>({
    address: null,
    chainId: null,
    isConnected: false,
    isConnecting: false,
    isCorrectNetwork: false,
    sttBalance: null,
    sttRaw: null,
    usdsoWalletBalance: null,
    usdsoRaw: null,
    usdsoAllowance: null,
    usdsoAllowanceRaw: null,
    marginBankBalance: null,
    unlockedCollateralRaw: null,
    lockedCollateralRaw: null,
    equityRaw: null,
    imReqRaw: null,
    marginStatus: null,
    marginStatusLabel: null,
    positions: [],
    openOrders: [],
    balanceStatus: 'IDLE',
    balanceSource: 'Somnia Hideki On-Chain',
    lastUpdated: 0,
  });

  // Keep track of latest active query address to prevent race conditions on account switch
  const activeAddressRef = useRef<string | null>(null);

  const publicClient = createPublicClient({
    transport: http(SOMNIA_RPC_URL),
  });

  const updateBalances = useCallback(async (address: `0x${string}`) => {
    activeAddressRef.current = address.toLowerCase();
    const queryAddress = address.toLowerCase();

    setWallet((prev) => ({
      ...prev,
      balanceStatus: 'LOADING',
      balanceError: undefined,
    }));

    try {
      // 1. Live Native STT Gas Balance (18 decimals)
      const sttRaw = await publicClient.getBalance({ address });

      // 2. Live USDso Token Balance & MarginBank Allowance (18 decimals)
      let usdsoRaw: bigint | null = null;
      let allowanceRaw: bigint | null = null;
      let usdsoErr: string | undefined;
      try {
        const [tokenBal, tokenAllowance] = await Promise.all([
          publicClient.readContract({
            address: USDSO_TOKEN_ADDRESS,
            abi: ERC20_READ_ABI,
            functionName: 'balanceOf',
            args: [address],
          }),
          publicClient.readContract({
            address: USDSO_TOKEN_ADDRESS,
            abi: ERC20_READ_ABI,
            functionName: 'allowance',
            args: [address, MARGIN_BANK_ADDRESS],
          }),
        ]);
        usdsoRaw = tokenBal;
        allowanceRaw = tokenAllowance;
      } catch (tokenErr) {
        usdsoErr = (tokenErr as Error).message || 'Failed to read USDso balance or allowance';
        console.warn('[useWallet] USDso balance query failed:', tokenErr);
      }

      // 3. Live MarginBank Account State & Health
      let unlockedRaw: bigint | null = null;
      let lockedRaw: bigint | null = null;
      let equityRaw: bigint | null = null;
      let imReqRaw: bigint | null = null;
      let marginStatusNum: number | null = null;
      let marginErrStr: string | undefined;

      try {
        const [state, health, status] = await Promise.all([
          publicClient.readContract({
            address: MARGIN_BANK_ADDRESS,
            abi: MARGIN_BANK_READ_ABI,
            functionName: 'getAccountState',
            args: [address],
          }),
          publicClient.readContract({
            address: MARGIN_BANK_ADDRESS,
            abi: MARGIN_BANK_READ_ABI,
            functionName: 'getAccountHealth',
            args: [address],
          }).catch(() => null),
          publicClient.readContract({
            address: MARGIN_BANK_ADDRESS,
            abi: MARGIN_BANK_READ_ABI,
            functionName: 'getMarginStatus',
            args: [address],
          }).catch(() => null),
        ]);

        const typedState = state as unknown as {
          unlockedCollateralBalance: bigint;
          lockedCollateral: bigint;
          activePerpPools: `0x${string}`[];
        };

        unlockedRaw = typedState.unlockedCollateralBalance;
        lockedRaw = typedState.lockedCollateral;

        if (health) {
          const typedHealth = health as unknown as [bigint, bigint, bigint, bigint];
          equityRaw = typedHealth[0];
          imReqRaw = typedHealth[1];
        }

        if (status !== null && status !== undefined) {
          marginStatusNum = Number(status);
        }
      } catch (mErr) {
        marginErrStr = (mErr as Error).message || 'MarginBank state read failed';
        console.warn('[useWallet] MarginBank account state query failed:', mErr);
      }

      // Discard stale response if active account changed during async queries
      if (activeAddressRef.current !== queryAddress) return;

      const sttFormatted = Number(formatUnits(sttRaw, 18)).toFixed(4);
      // NEVER treat read error as zero: format only if raw value was actually read
      const usdsoFormatted = usdsoRaw !== null ? Number(formatUnits(usdsoRaw, 18)).toFixed(2) : null;
      const allowanceFormatted = allowanceRaw !== null ? Number(formatUnits(allowanceRaw, 18)).toFixed(2) : null;
      const marginFormatted = unlockedRaw !== null ? Number(formatUnits(unlockedRaw, 18)).toFixed(2) : null;

      const hasReadError = usdsoRaw === null || unlockedRaw === null;

      setWallet((prev) => ({
        ...prev,
        sttBalance: sttFormatted,
        sttRaw,
        usdsoWalletBalance: usdsoFormatted,
        usdsoRaw,
        usdsoAllowance: allowanceFormatted,
        usdsoAllowanceRaw: allowanceRaw,
        marginBankBalance: marginFormatted,
        unlockedCollateralRaw: unlockedRaw,
        lockedCollateralRaw: lockedRaw,
        equityRaw,
        imReqRaw,
        marginStatus: marginStatusNum,
        marginStatusLabel: marginStatusNum !== null ? MARGIN_STATUS_LABELS[marginStatusNum] ?? 'Unknown' : null,
        balanceStatus: hasReadError ? 'ERROR' : 'FETCHED',
        balanceError: hasReadError ? usdsoErr || marginErrStr || 'Some account balances could not be verified' : undefined,
        balanceSource: 'Somnia Hideki On-Chain (Viem + MarginBank)',
        lastUpdated: Date.now(),
      }));
    } catch (err) {
      if (activeAddressRef.current !== queryAddress) return;
      console.warn('[useWallet] Failed to query on-chain balances for account:', err);
      setWallet((prev) => ({
        ...prev,
        sttBalance: null,
        sttRaw: null,
        usdsoWalletBalance: null,
        usdsoRaw: null,
        marginBankBalance: null,
        unlockedCollateralRaw: null,
        lockedCollateralRaw: null,
        equityRaw: null,
        imReqRaw: null,
        marginStatus: null,
        marginStatusLabel: null,
        balanceStatus: 'ERROR',
        balanceError: (err as Error).message || 'Failed to fetch on-chain balances.',
        lastUpdated: Date.now(),
      }));
    }
  }, [publicClient]);

  const checkConnection = useCallback(async () => {
    if (typeof window === 'undefined' || !window.ethereum) return;

    try {
      const accounts = (await window.ethereum.request({ method: 'eth_accounts' })) as string[];
      const chainIdHex = (await window.ethereum.request({ method: 'eth_chainId' })) as string;
      const chainId = parseInt(chainIdHex, 16);

      if (accounts && accounts.length > 0) {
        const addr = accounts[0] as `0x${string}`;
        const isCorrect = chainId === SOMNIA_HIDEKI_CHAIN_ID;
        setWallet((prev) => ({
          ...prev,
          address: addr,
          chainId,
          isConnected: true,
          isCorrectNetwork: isCorrect,
          error: isCorrect
            ? undefined
            : `Wrong network: Connected to Chain ID ${chainId}. Please switch to Somnia Hideki (50383).`,
        }));
        if (isCorrect) {
          updateBalances(addr);
        } else {
          setWallet((prev) => ({
            ...prev,
            sttBalance: null,
            sttRaw: null,
            usdsoWalletBalance: null,
            usdsoRaw: null,
            usdsoAllowance: null,
            usdsoAllowanceRaw: null,
            marginBankBalance: null,
            unlockedCollateralRaw: null,
            balanceStatus: 'IDLE',
          }));
        }
      }
    } catch (err) {
      console.warn('[useWallet] Silent preflight wallet check:', err);
    }
  }, [updateBalances]);

  useEffect(() => {
    checkConnection();

    if (typeof window !== 'undefined' && window.ethereum) {
      const handleAccountsChanged = (accounts: unknown) => {
        const accs = accounts as string[];
        if (accs.length === 0) {
          activeAddressRef.current = null;
          setWallet({
            address: null,
            chainId: null,
            isConnected: false,
            isConnecting: false,
            isCorrectNetwork: false,
            sttBalance: null,
            sttRaw: null,
            usdsoWalletBalance: null,
            usdsoRaw: null,
            usdsoAllowance: null,
            usdsoAllowanceRaw: null,
            marginBankBalance: null,
            unlockedCollateralRaw: null,
            lockedCollateralRaw: null,
            equityRaw: null,
            imReqRaw: null,
            marginStatus: null,
            marginStatusLabel: null,
            positions: [],
            openOrders: [],
            balanceStatus: 'IDLE',
            balanceSource: 'Somnia Hideki On-Chain',
            lastUpdated: 0,
          });
        } else {
          const addr = accs[0] as `0x${string}`;
          activeAddressRef.current = addr.toLowerCase();
          // Reset balances immediately on account change to prevent stale display
          setWallet((prev) => ({
            ...prev,
            address: addr,
            isConnected: true,
            sttBalance: null,
            sttRaw: null,
            usdsoWalletBalance: null,
            usdsoRaw: null,
            usdsoAllowance: null,
            usdsoAllowanceRaw: null,
            marginBankBalance: null,
            unlockedCollateralRaw: null,
            balanceStatus: 'LOADING',
          }));
          updateBalances(addr);
        }
      };

      const handleChainChanged = (chainIdHex: unknown) => {
        const chainId = parseInt(chainIdHex as string, 16);
        const isCorrect = chainId === SOMNIA_HIDEKI_CHAIN_ID;
        setWallet((prev) => ({
          ...prev,
          chainId,
          isCorrectNetwork: isCorrect,
          sttBalance: isCorrect ? prev.sttBalance : null,
          usdsoWalletBalance: isCorrect ? prev.usdsoWalletBalance : null,
          marginBankBalance: isCorrect ? prev.marginBankBalance : null,
          balanceStatus: isCorrect ? prev.balanceStatus : 'IDLE',
          error: isCorrect
            ? undefined
            : `Wrong network: Connected to Chain ID ${chainId}. Please switch to Somnia Hideki (50383).`,
        }));
        if (isCorrect && wallet.address) {
          updateBalances(wallet.address);
        }
      };

      window.ethereum.on('accountsChanged', handleAccountsChanged);
      window.ethereum.on('chainChanged', handleChainChanged);

      return () => {
        window.ethereum?.removeListener('accountsChanged', handleAccountsChanged);
        window.ethereum?.removeListener('chainChanged', handleChainChanged);
      };
    }
  }, [checkConnection, updateBalances, wallet.address]);

  const connect = async () => {
    if (typeof window === 'undefined' || !window.ethereum) {
      alert('No Web3 wallet detected. Please install MetaMask or another EIP-1193 compatible wallet to connect.');
      return;
    }

    setWallet((prev) => ({ ...prev, isConnecting: true, error: undefined }));

    try {
      const accounts = (await window.ethereum.request({ method: 'eth_requestAccounts' })) as string[];
      const chainIdHex = (await window.ethereum.request({ method: 'eth_chainId' })) as string;
      const chainId = parseInt(chainIdHex, 16);
      const isCorrect = chainId === SOMNIA_HIDEKI_CHAIN_ID;

      const addr = accounts[0] as `0x${string}`;
      activeAddressRef.current = addr.toLowerCase();

      setWallet((prev) => ({
        ...prev,
        address: addr,
        chainId,
        isConnected: true,
        isConnecting: false,
        isCorrectNetwork: isCorrect,
        sttBalance: null,
        usdsoWalletBalance: null,
        marginBankBalance: null,
        balanceStatus: isCorrect ? 'LOADING' : 'IDLE',
        error: isCorrect
          ? undefined
          : `Wrong network: Connected to Chain ID ${chainId}. Please switch to Somnia Hideki (50383).`,
      }));

      if (isCorrect) {
        updateBalances(addr);
      }
    } catch (err) {
      setWallet((prev) => ({
        ...prev,
        isConnecting: false,
        error: (err as Error).message || 'Failed to connect wallet.',
      }));
    }
  };

  const disconnect = () => {
    activeAddressRef.current = null;
    setWallet({
      address: null,
      chainId: null,
      isConnected: false,
      isConnecting: false,
      isCorrectNetwork: false,
      sttBalance: null,
      sttRaw: null,
      usdsoWalletBalance: null,
      usdsoRaw: null,
      usdsoAllowance: null,
      usdsoAllowanceRaw: null,
      marginBankBalance: null,
      unlockedCollateralRaw: null,
      lockedCollateralRaw: null,
      equityRaw: null,
      imReqRaw: null,
      marginStatus: null,
      marginStatusLabel: null,
      positions: [],
      openOrders: [],
      balanceStatus: 'IDLE',
      balanceSource: 'Somnia Hideki On-Chain',
      lastUpdated: 0,
    });
  };

  const switchToHideki = async () => {
    if (!window.ethereum) return;
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: SOMNIA_HIDEKI_CHAIN_HEX }],
      });
    } catch (switchError: unknown) {
      const err = switchError as { code?: number };
      if (err.code === 4902) {
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [
              {
                chainId: SOMNIA_HIDEKI_CHAIN_HEX,
                chainName: 'Somnia Hideki Testnet',
                nativeCurrency: { name: 'STT', symbol: 'STT', decimals: 18 },
                rpcUrls: [SOMNIA_RPC_URL],
                blockExplorerUrls: [SOMNIA_EXPLORER_URL],
              },
            ],
          });
        } catch (addError) {
          console.error('[useWallet] Failed to add Somnia Hideki chain:', addError);
        }
      }
    }
  };

  const getWalletClient = useCallback((): WalletClient | null => {
    if (typeof window === 'undefined' || !window.ethereum || !wallet.address) {
      return null;
    }
    return createWalletClient({
      account: wallet.address,
      chain: hidekiTestnet,
      transport: custom(window.ethereum),
    }) as WalletClient;
  }, [wallet.address]);

  return {
    wallet,
    connect,
    disconnect,
    switchToHideki,
    getWalletClient,
  };
}
