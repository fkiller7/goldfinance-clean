import { ethers } from "ethers";

const RPC = "https://data-seed-prebsc-2-s1.binance.org:8545";

export const getProvider = () => {
  return new ethers.JsonRpcProvider(RPC);
};

export const getSignerProvider = () => {
  if (window.ethereum) {
    return new ethers.BrowserProvider(window.ethereum);
  }
  return new ethers.JsonRpcProvider(RPC);
};

export const getWalletAddress = async (): Promise<string> => {
  if (window.ethereum) {
    const provider = new ethers.BrowserProvider(window.ethereum);
    const accounts = await provider.send("eth_accounts", []);
    return accounts[0] || "";
  }
  return "";
};