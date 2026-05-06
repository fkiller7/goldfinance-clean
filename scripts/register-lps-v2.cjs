const { ethers } = require("hardhat");
const fs = require("fs");

async function main() {
  const addresses = JSON.parse(fs.readFileSync("./deployed-addresses-v2.json", "utf8"));
  const [signer] = await ethers.getSigners();

  console.log("Signer:", signer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(signer.address)), "tBNB\n");

  const gold = await ethers.getContractAt("GoldCoin", addresses.GoldCoin, signer);
  const farm = await ethers.getContractAt("GoldShareFarm", addresses.GoldShareFarm, signer);

  async function sendTx(name, fn) {
    console.log(`→ ${name}`);
    const tx = await fn();
    console.log(`  tx: ${tx.hash}`);
    await tx.wait();
    console.log(`  ✓ confirmed`);
    await new Promise(r => setTimeout(r, 2000));
  }

  // ===== ADD POOLS TO FARM =====
  console.log("--- Adding pools to GoldShareFarm ---");

  // Pool 0: GSHARE/BNB (40% weight)
  await sendTx("Pool 0: GSHARE/BNB (weight 40)",
    () => farm.addPool(addresses.LP_GSHARE_BNB, 40));

  // Pool 1: GOLD/BNB (35% weight)
  await sendTx("Pool 1: GOLD/BNB (weight 35)",
    () => farm.addPool(addresses.LP_GOLD_BNB, 35));

  // Pool 2: GOLD/GSHARE (25% weight)
  await sendTx("Pool 2: GOLD/GSHARE (weight 25)",
    () => farm.addPool(addresses.LP_GOLD_GSHARE, 25));

  const poolCount = await farm.poolLength();
  const totalAlloc = await farm.totalAllocPoint();
  console.log("\nFarm has", poolCount.toString(), "pools");
  console.log("Total allocation points:", totalAlloc.toString());

  // ===== REGISTER AMM PAIRS FOR SELL TAX =====
  console.log("\n--- Registering AMM pairs for GOLD sell tax ---");

  await sendTx("Register GOLD/BNB as AMM pair",
    () => gold.setAmmPair(addresses.LP_GOLD_BNB, true));

  await sendTx("Register GOLD/GSHARE as AMM pair",
    () => gold.setAmmPair(addresses.LP_GOLD_GSHARE, true));

  // Note: GSHARE/BNB heeft GEEN GOLD, dus geen AMM registration nodig

  // ===== VERIFY =====
  console.log("\n--- Verification ---");
  for (let pid = 0; pid < poolCount; pid++) {
    const pool = await farm.poolInfo(pid);
    console.log(`Pool ${pid}: lp=${pool.lpToken} alloc=${pool.allocPoint.toString()} totalStaked=${ethers.formatEther(pool.totalStaked)}`);
  }

  console.log("\nGOLD/BNB is AMM pair:", await gold.ammPairs(addresses.LP_GOLD_BNB));
  console.log("GOLD/GSHARE is AMM pair:", await gold.ammPairs(addresses.LP_GOLD_GSHARE));

  // ===== SAVE =====
  addresses.poolsRegistered = true;
  addresses.ammPairsRegistered = true;
  fs.writeFileSync("./deployed-addresses-v2.json", JSON.stringify(addresses, null, 2));

  console.log("\n========================================");
  console.log("    REGISTRATION COMPLETE — V2 LIVE!");
  console.log("========================================");
  console.log("Farm pools:");
  console.log("  Pool 0: GSHARE/BNB    (40% emission)");
  console.log("  Pool 1: GOLD/BNB      (35% emission)");
  console.log("  Pool 2: GOLD/GSHARE   (25% emission)");
  console.log("");
  console.log("AMM tax pairs:");
  console.log("  GOLD/BNB     → 10% sell tax to Buyback");
  console.log("  GOLD/GSHARE  → 10% sell tax to Buyback");
  console.log("");
  console.log("READY:");
  console.log("  - Stake LP tokens to earn GSHARE (continuous!)");
  console.log("  - Stake GSHARE in Boardroom to earn GOLD");
  console.log("  - Selling GOLD triggers 10% tax → 50% burn / 50% boardroom inject");
  console.log("");
  console.log("NEXT: Update frontend (.env, addresses.ts, ABIs)");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ FAILED:");
    console.error(error);
    process.exit(1);
  });
