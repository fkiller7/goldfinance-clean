import { ethers } from "ethers";

export async function getProvider() {
  if (!window.ethereum) throw new Error("MetaMask niet gevonden");
  return new ethers.BrowserProvider(window.ethereum);
}

export async function getSigner() {
  if (!window.ethereum) throw new Error("MetaMask niet gevonden");
  const provider = new ethers.BrowserProvider(window.ethereum);
  await provider.send("eth_requestAccounts", []);
  return await provider.getSigner();
}
