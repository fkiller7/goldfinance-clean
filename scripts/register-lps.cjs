const { ethers } = require("hardhat");
const fs = require("fs");

async function main() {
  const addresses = JSON.parse(fs.readFileSync("./deployed-addresses.json", "utf8"));
  const [signer] = await ethers.getSigners();

  console.log("Signer:", signer.address);
  console.log("BNB balance:", ethers.formatEther(await ethers.provider.getBalance(signer.address)));

  const gold = await ethers.getContractAt("GoldCoin", addresses.GoldCoin, signer);
  const farm = await ethers.getContractAt("GoldShareFarm", addresses.GoldShareFarm, signer);

  // ===== 1. ADD POOLS TO FARM =====
  console.log("\n--- Adding pools to GoldShareFarm ---");

  // Pool 0: GSHARE/BNB - 40% weight
  console.log("\nPool 0: GSHARE/BNB (weight 40)");
  console.log("LP:", addresses.LP_GSHARE_BNB);
  let tx = await farm.addPool(addresses.LP_GSHARE_BNB, 40);
  await tx.wait();
  console.log("Added, tx:", tx.hash);

  // Pool 1: GOLD/BNB - 35% weight
  console.log("\nPool 1: GOLD/BNB (weight 35)");
  console.log("LP:", addresses.LP_GOLD_BNB);
  tx = await farm.addPool(addresses.LP_GOLD_BNB, 35);
  await tx.wait();
  console.log("Added, tx:", tx.hash);

  // Pool 2: GOLD/GSHARE - 25% weight
  console.log("\nPool 2: GOLD/GSHARE (weight 25)");
  console.log("LP:", addresses.LP_GOLD_GSHARE);
  tx = await farm.addPool(addresses.LP_GOLD_GSHARE, 25);
  await tx.wait();
  console.log("Added, tx:", tx.hash);

  const poolCount = await farm.poolLength();
  console.log("\nTotal pools registered:", poolCount.toString());

  // ===== 2. REGISTER AMM PAIRS FOR TAX =====
  console.log("\n--- Registering AMM pairs in GoldCoin (for sell tax) ---");

  console.log("\nRegistering GOLD/BNB pair...");
  tx = await gold.setAmmPair(addresses.LP_GOLD_BNB, true);
  await tx.wait();
  console.log("GOLD/BNB AMM pair set, tx:", tx.hash);

  console.log("\nRegistering GOLD/GSHARE pair...");
  tx = await gold.setAmmPair(addresses.LP_GOLD_GSHARE, true);
  await tx.wait();
  console.log("GOLD/GSHARE AMM pair set, tx:", tx.hash);

  // Note: GSHARE/BNB doesn't need AMM registration for GOLD tax
  // (no GOLD flows through that pair)

  // ===== SUMMARY =====
  console.log("\n========================================");
  console.log("        REGISTRATION COMPLETE");
  console.log("========================================");
  console.log("Farm pools:");
  console.log("  Pool 0: GSHARE/BNB    (40% weight)");
  console.log("  Pool 1: GOLD/BNB      (35% weight)");
  console.log("  Pool 2: GOLD/GSHARE   (25% weight)");
  console.log("");
  console.log("AMM pairs registered for GOLD sell tax:");
  console.log("  GOLD/BNB pair");
  console.log("  GOLD/GSHARE pair");
  console.log("");
  console.log("READY:");
  console.log("  - Users can now stake LP tokens in GoldShareFarm to earn GSHARE");
  console.log("  - Users can stake GSHARE in Boardroom to earn GOLD");
  console.log("  - Selling GOLD via PancakeSwap triggers 10% sell tax -> BuybackController");
  console.log("");
  console.log("NEXT: Update frontend with deployed addresses");

  // Update state
  addresses.poolsRegistered = true;
  addresses.ammPairsRegistered = true;
  fs.writeFileSync("./deployed-addresses.json", JSON.stringify(addresses, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
