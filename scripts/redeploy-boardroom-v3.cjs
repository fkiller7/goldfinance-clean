const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("Balance:", hre.ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address)), "BNB");
  
  const GOLD = "0x3C9c4C6C308904fC8A6BbAfFb132F04C6FdD11fc";
  const GSHARE = "0x82092356fA73008E0B9A5305e7da8F930De143a3";
  const BUYBACK = "0xCDD5cbE6999377eeF1ec647415239eef45857FAe";
  const OLD_BOARDROOM = "0x261C0409ac23AFDc43a455Ae35041EDF83eB26ad";
  const ADMIN = deployer.address;
  
  // 2000% APR target rate (68.49 GOLD per GSHARE per epoch)
  const INITIAL_REWARD = hre.ethers.parseEther("68.49");
  
  // Use same epochStart as old boardroom for continuity
  const oldBoardroom = await hre.ethers.getContractAt("Boardroom", OLD_BOARDROOM);
  const EPOCH_START = await oldBoardroom.epochStart();
  console.log("Using epochStart:", EPOCH_START.toString());

  // === Step 1: Try to withdraw from old boardroom ===
  console.log("\n=== Step 1: Cleanup old boardroom ===");
  try {
    const userInfo = await oldBoardroom.users(deployer.address);
    const stakedAmount = userInfo[0]; // first field of struct
    console.log("Old stake amount:", hre.ethers.formatEther(stakedAmount));
    
    if (stakedAmount > 0n) {
      console.log("⚠️  You have stake in old boardroom. Try withdrawing manually if lock is over.");
      console.log("⚠️  Continuing with new deploy. Old stake stays orphaned (testnet).");
    }
  } catch (e) {
    console.log("Old stake check skipped:", e.message);
  }

  // === Step 2: Deploy new Boardroom ===
  console.log("\n=== Step 2: Deploy Boardroom v3 ===");
  const Boardroom = await hre.ethers.getContractFactory("Boardroom");
  
  // Constructor: (admin, gshare, gold, epochStart, initialRewardPerEpoch)
  const boardroom = await Boardroom.deploy(
    ADMIN,
    GSHARE,
    GOLD,
    EPOCH_START,
    INITIAL_REWARD
  );
  await boardroom.waitForDeployment();
  const NEW_BOARDROOM = await boardroom.getAddress();
  console.log("✅ Boardroom v3 deployed:", NEW_BOARDROOM);

  // === Step 3: Set rewardInjector to BuybackController ===
  console.log("\n=== Step 3: Set rewardInjector ===");
  try {
    const tx = await boardroom.setRewardInjector(BUYBACK);
    await tx.wait();
    console.log("✅ rewardInjector set to:", BUYBACK);
  } catch (e) {
    console.log("⚠️  setRewardInjector failed:", e.message);
  }

  // === Step 4: Update BuybackController ===
  console.log("\n=== Step 4: Update BuybackController ===");
  const buyback = await hre.ethers.getContractAt("BuybackController", BUYBACK);
  
  try {
    const tx = await buyback.setBoardroom(NEW_BOARDROOM);
    await tx.wait();
    console.log("✅ BuybackController boardroom updated");
  } catch (e) {
    console.log("⚠️  setBoardroom failed:", e.message);
    console.log("   Will need manual call: buyback.setBoardroom('" + NEW_BOARDROOM + "')");
  }

  // === Step 5: Update GoldCoin tax exempt list ===
  console.log("\n=== Step 5: Update GoldCoin taxExempt ===");
  const gold = await hre.ethers.getContractAt("GoldCoin", GOLD);
  
  try {
    const tx1 = await gold.setTaxExempt(NEW_BOARDROOM, true);
    await tx1.wait();
    console.log("✅ New Boardroom is tax exempt");
  } catch (e) {
    console.log("⚠️  setTaxExempt failed:", e.message);
  }

  // === Step 6: Verify config ===
  console.log("\n=== Step 6: Verify ===");
  const rate = await boardroom.rewardPerEpochPerShare();
  const maxRate = await boardroom.MAX_REWARD_PER_EPOCH_PER_SHARE();
  const epochDur = await boardroom.EPOCH_DURATION();
  const withdrawLock = await boardroom.WITHDRAW_LOCK();
  const totalStaked = await boardroom.totalStaked();
  const injector = await boardroom.rewardInjector();
  
  console.log("rewardPerEpochPerShare:", hre.ethers.formatEther(rate), "GOLD");
  console.log("MAX cap:", hre.ethers.formatEther(maxRate), "GOLD");
  console.log("Epoch duration:", Number(epochDur) / 3600, "hours");
  console.log("Withdraw lock:", Number(withdrawLock) / 3600, "hours");
  console.log("Total staked:", hre.ethers.formatEther(totalStaked));
  console.log("RewardInjector:", injector);
  
  const epochsPerYear = (365n * 24n * 60n * 60n) / epochDur;
  const yieldPerYear = parseFloat(hre.ethers.formatEther(rate * epochsPerYear));
  const apr = (yieldPerYear * 0.001 / 5) * 100;
  console.log(`\n🎯 APR @ GOLD=$0.001, GSHARE=$5: ${apr.toFixed(0)}%`);

  console.log("\n========== SUMMARY ==========");
  console.log("OLD Boardroom:", OLD_BOARDROOM);
  console.log("NEW Boardroom:", NEW_BOARDROOM);
  console.log("=============================");
  console.log("\nNext steps:");
  console.log(`1. Update .env: VITE_BOARDROOM_ADDRESS=${NEW_BOARDROOM}`);
  console.log(`2. Copy ABI: cp artifacts/contracts/Boardroom.sol/Boardroom.json src/contracts/abis/`);
  console.log(`3. Restart Vite dev server`);
}

main().catch(console.error);
