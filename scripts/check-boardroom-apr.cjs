const hre = require("hardhat");

async function main() {
  const BOARDROOM = "0x261C0409ac23AFDc43a455Ae35041EDF83eB26ad";
  const boardroom = await hre.ethers.getContractAt("Boardroom", BOARDROOM);
  
  const rate = await boardroom.rewardPerEpochPerShare();
  const totalStaked = await boardroom.totalStaked();
  const epochDuration = await boardroom.EPOCH_DURATION();
  
  console.log("=== Boardroom Config ===");
  console.log("rewardPerEpochPerShare:", rate.toString());
  console.log("Total staked:", hre.ethers.formatEther(totalStaked), "GSHARE");
  console.log("Epoch duration:", epochDuration.toString(), "seconds");
  
  const epochsPerYear = (365n * 24n * 60n * 60n) / epochDuration;
  console.log("Epochs per year:", epochsPerYear.toString());
  
  // rate represents GOLD per GSHARE per epoch (in 1e18 terms)
  const yieldPerYearPerShare = rate * epochsPerYear;
  const yieldGold = parseFloat(hre.ethers.formatEther(yieldPerYearPerShare));
  
  const goldPrice = 0.001;
  const gsharePrice = 5;
  const yieldUSD = yieldGold * goldPrice;
  const apr = (yieldUSD / gsharePrice) * 100;
  
  console.log("\n=== APR Calculation ===");
  console.log(`Yield: ${yieldGold.toFixed(4)} GOLD per GSHARE per year`);
  console.log(`At GOLD=$${goldPrice}, GSHARE=$${gsharePrice}:`);
  console.log(`  Yield USD per GSHARE/year: $${yieldUSD.toFixed(4)}`);
  console.log(`  APR: ${apr.toFixed(2)}%`);
  
  console.log("\n=== Target: 2000% APR ===");
  const targetApr = 2000;
  const targetUsdPerGshare = (gsharePrice * targetApr) / 100;
  const targetGoldPerGshare = targetUsdPerGshare / goldPrice;
  const targetYieldPerYear = BigInt(Math.floor(targetGoldPerGshare * 1e18));
  const targetRate = targetYieldPerYear / epochsPerYear;
  
  console.log(`Need yield of ${targetGoldPerGshare.toFixed(0)} GOLD per GSHARE per year`);
  console.log(`That's ${(targetGoldPerGshare / Number(epochsPerYear)).toFixed(2)} GOLD per GSHARE per epoch`);
  console.log(`\nrewardPerEpochPerShare should be: ${targetRate.toString()}`);
  console.log(`(That is ${hre.ethers.formatEther(targetRate)} in human-readable)`);
}

main().catch(console.error);
