import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { ethers } from "ethers";

const BSC_TESTNET_CHAIN_ID = 97;
const BSC_TESTNET_PARAMS = {
  chainId: "0x61",
  chainName: "BSC Testnet",
  nativeCurrency: { name: "tBNB", symbol: "tBNB", decimals: 18 },
  rpcUrls: ["https://data-seed-prebsc-1-s1.binance.org:8545/"],
  blockExplorerUrls: ["https://testnet.bscscan.com/"],
};

interface WalletContextType {
  account: string | null;
  chainId: number | null;
  isConnecting: boolean;
  isCorrectNetwork: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  switchToTestnet: () => Promise<void>;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const initialized = useRef(false);

  const isCorrectNetwork = chainId === BSC_TESTNET_CHAIN_ID;

  /**
   * Read current state from window.ethereum and set into React.
   * Used both for initial load and as polling fallback.
   */
  const refreshState = useCallback(async () => {
    const eth = (window as any).ethereum;
    if (!eth) return;
    try {
      const accounts: string[] = await eth.request({ method: "eth_accounts" });
      const newAccount = accounts && accounts[0] ? accounts[0] : null;
      setAccount((prev) => (prev !== newAccount ? newAccount : prev));

      const cid: string = await eth.request({ method: "eth_chainId" });
      const newChainId = parseInt(cid, 16);
      setChainId((prev) => (prev !== newChainId ? newChainId : prev));
    } catch (e) {
      console.error("[Wallet] refresh failed:", e);
    }
  }, []);

  /**
   * Initial load + register MetaMask event listeners.
   * StrictMode-safe: uses ref guard to prevent double-registration.
   */
  useEffect(() => {
    const eth = (window as any).ethereum;
    if (!eth) {
      console.log("[Wallet] No window.ethereum found");
      return;
    }

    // StrictMode guard
    if (initialized.current) return;
    initialized.current = true;

    refreshState();

    const handleAccountsChanged = (accounts: string[]) => {
      console.log("[Wallet] accountsChanged:", accounts);
      setAccount(accounts && accounts[0] ? accounts[0] : null);
    };

    const handleChainChanged = (cid: string) => {
      const cidNum = parseInt(cid, 16);
      console.log("[Wallet] chainChanged:", cidNum);
      setChainId(cidNum);
    };

    if (typeof eth.on === "function") {
      eth.on("accountsChanged", handleAccountsChanged);
      eth.on("chainChanged", handleChainChanged);
    }

    // Polling fallback every 2s for reliability
    const pollInterval = setInterval(refreshState, 2000);

    return () => {
      clearInterval(pollInterval);
      if (typeof eth.removeListener === "function") {
        eth.removeListener("accountsChanged", handleAccountsChanged);
        eth.removeListener("chainChanged", handleChainChanged);
      }
    };
  }, [refreshState]);

  const connect = useCallback(async () => {
    const eth = (window as any).ethereum;
    if (!eth) {
      alert("MetaMask not found. Install MetaMask to continue.");
      return;
    }
    setIsConnecting(true);
    try {
      const accounts: string[] = await eth.request({ method: "eth_requestAccounts" });
      if (accounts[0]) setAccount(accounts[0]);
      const cid: string = await eth.request({ method: "eth_chainId" });
      setChainId(parseInt(cid, 16));
    } catch (e: any) {
      if (e?.code !== 4001) {
        console.error("[Wallet] connect failed:", e);
        alert("Connection failed: " + (e?.message ?? "Unknown error"));
      }
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setAccount(null);
    console.log("[Wallet] Disconnected (UI state only — MetaMask remains connected)");
  }, []);

  const switchToTestnet = useCallback(async () => {
    const eth = (window as any).ethereum;
    if (!eth) return;
    try {
      await eth.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: BSC_TESTNET_PARAMS.chainId }],
      });
    } catch (switchError: any) {
      if (switchError.code === 4902) {
        try {
          await eth.request({
            method: "wallet_addEthereumChain",
            params: [BSC_TESTNET_PARAMS],
          });
        } catch (addError) {
          console.error("[Wallet] add network failed:", addError);
        }
      } else {
        console.error("[Wallet] switch failed:", switchError);
      }
    }
  }, []);

  return (
    <WalletContext.Provider
      value={{
        account,
        chainId,
        isConnecting,
        isCorrectNetwork,
        connect,
        disconnect,
        switchToTestnet,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
}

/**
 * Helper: get a Signer from the connected wallet.
 * Use this when you need to send a transaction.
 */
export async function getSigner(): Promise<ethers.JsonRpcSigner> {
  const eth = (window as any).ethereum;
  if (!eth) throw new Error("No wallet detected");
  const provider = new ethers.BrowserProvider(eth);
  return provider.getSigner();
}
