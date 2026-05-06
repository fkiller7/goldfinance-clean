import { ethers } from "ethers";
import { getProvider } from "./blockchain";

/**
 * ✅ Haalt de signer (geconnecteerde wallet) op
 */
async function getSigner() {
  if (!window.ethereum) throw new Error("MetaMask niet gevonden");
  const provider = new ethers.BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  return signer;
}

/**
 * ✅ Goedkeuren van tokens (voor LP of ERC20)
 */
export async function handleApprove(
  tokenAddress: string,
  spenderAddress: string,
  abi: any
) {
  try {
    const signer = await getSigner();
    const token = new ethers.Contract(tokenAddress, abi, signer);

    const tx = await token.approve(spenderAddress, ethers.MaxUint256);
    await tx.wait();

    alert("✅ Token goedgekeurd!");
    console.log("✅ Approve TX:", tx.hash);
  } catch (error) {
    console.error("❌ Fout bij het goedkeuren van tokens:", error);
    alert("❌ Approve mislukt — zie console voor details");
  }
}

/**
 * ✅ Stake tokens in RewardPool (deposit)
 */
export async function handleStake(
  farmAddress: string,
  amount: string,
  abi: any
) {
  try {
    const signer = await getSigner();
    const contract = new ethers.Contract(farmAddress, abi, signer);

    const parsedAmount = ethers.parseUnits(amount, 18);
    const tx = await contract.deposit(parsedAmount);
    await tx.wait();

    alert(`✅ Je hebt ${amount} LP gestaked!`);
    console.log("✅ Stake TX:", tx.hash);
  } catch (error) {
    console.error("❌ Fout bij stake:", error);
    alert("❌ Stake mislukt — zie console voor details");
  }
}

/**
 * ✅ Unstake tokens
 */
export async function handleUnstake(
  farmAddress: string,
  amount: string,
  abi: any
) {
  try {
    const signer = await getSigner();
    const contract = new ethers.Contract(farmAddress, abi, signer);

    const parsedAmount = ethers.parseUnits(amount, 18);
    const tx = await contract.withdraw(parsedAmount);
    await tx.wait();

    alert(`✅ Je hebt ${amount} LP unstaked!`);
    console.log("✅ Unstake TX:", tx.hash);
  } catch (error) {
    console.error("❌ Fout bij unstake:", error);
    alert("❌ Unstake mislukt — zie console voor details");
  }
}

/**
 * ✅ Claim rewards
 */
export async function handleClaim(farmAddress: string, abi: any) {
  try {
    const signer = await getSigner();
    const contract = new ethers.Contract(farmAddress, abi, signer);

    const tx = await contract.claimRewards();
    await tx.wait();

    alert("✅ Rewards succesvol geclaimd!");
    console.log("✅ Claim TX:", tx.hash);
  } catch (error) {
    console.error("❌ Fout bij claimen van rewards:", error);
    alert("❌ Claim mislukt — zie console voor details");
  }
}
