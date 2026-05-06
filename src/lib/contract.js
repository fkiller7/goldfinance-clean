import { ethers } from "ethers";

const CONTRACT_ADDRESS = "0xF0e10D20e2b8E6D798FF8047D7082be8DA9dDeca"; // ← vervang met jouw echte adres
const CONTRACT_ABI = [
  {
    "inputs": [],
    "name": "inc",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "uint256", "name": "by", "type": "uint256"}],
    "name": "incBy",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "x",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "anonymous": false,
    "inputs": [{"indexed": false, "internalType": "uint256", "name": "by", "type": "uint256"}],
    "name": "Increment",
    "type": "event"
  }
];

export async function getContract() {
  if (!window.ethereum) throw new Error("MetaMask not found");
  await window.ethereum.request({ method: "eth_requestAccounts" });
  const provider = new ethers.BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  return new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
}
