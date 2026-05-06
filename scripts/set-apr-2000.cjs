const hre = require("hardhat");

async function main() {
  const [signer] = await hre.ethers.getSigners();
  const BOARDROOM = "0x261C0409ac23AFDc43a455Ae35041EDF83eB26ad";
  const boardroom = await hre.ethers.getContractAt("Boardroom", BOARDROOM);
  
  const NEW_RATE = "68493150684931501103"; // = 2000% APR
  
  const oldRate = await boardroom.rewardPerEpochPerShare();
  console.log("Old rate:", oldRate.toString());
  console.log("New rate:", NEW_RATE);
  
  console.log("\nSetting new rate...");
  const tx = await boardroom.setRewardPerEpochPerShare(NEW_RATE);
  await tx.wait();
  console.log("✅ Done! TX:", tx.hash);
  
  const updatedRate = await boardroom.rewardPerEpochPerShare();
  console.log("Verified new rate:", updatedRate.toString());
}

main().catch(console.error);
