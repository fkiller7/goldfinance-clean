const { ethers } = require("hardhat");
const fs = require("fs");

async function main() {
  const addresses = JSON.parse(fs.readFileSync("./deployed-addresses-v2.json", "utf8"));
  const [deployer] = await ethers.getSigners();

  console.log("Signer:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "tBNB\n");

  const gold = await ethers.getContractAt("GoldCoin", addresses.GoldCoin);

  async function sendTx(name, fn) {
    console.log(`→ ${name}`);
    const tx = await fn();
    console.log(`  tx: ${tx.hash}`);
    await tx.wait();
    console.log(`  ✓ confirmed`);
    await new Promise(r => setTimeout(r, 2000));
  }

  // ===== MINT 10M GOLD FOR LP =====
  const currentGoldBal = await gold.balanceOf(deployer.address);
  console.log("Current GOLD balance:", ethers.formatEther(currentGoldBal));

  if (currentGoldBal < ethers.parseEther("10000000")) {
    const mintAmount = ethers.parseEther("10000000") - currentGoldBal;
    await sendTx(`Mint ${ethers.formatEther(mintAmount)} GOLD to deployer`,
      () => gold.mint(deployer.address, mintAmount));
  } else {
    console.log("→ skip: already have 10M+ GOLD");
  }

  // ===== WHITELIST PANCAKESWAP ROUTER & FACTORY =====
  const PCS_ROUTER = "0xD99D1c33F9fC3444f8101754aBC46c52416550D1";
  const PCS_FACTORY = "0x6725F303b657a9451d8BA641348b6761A6CC7a17";

  const routerExempt = await gold.taxExempt(PCS_ROUTER);
  if (!routerExempt) {
    await sendTx("Whitelist PancakeSwap router (no tax)",
      () => gold.setTaxExempt(PCS_ROUTER, true));
  } else {
    console.log("→ skip: router already whitelisted");
  }

  const factoryExempt = await gold.taxExempt(PCS_FACTORY);
  if (!factoryExempt) {
    await sendTx("Whitelist PancakeSwap factory (no tax)",
      () => gold.setTaxExempt(PCS_FACTORY, true));
  } else {
    console.log("→ skip: factory already whitelisted");
  }

  // ===== VERIFY =====
  console.log("\n--- Verification ---");
  console.log("GOLD balance:", ethers.formatEther(await gold.balanceOf(deployer.address)));
  console.log("GOLD totalSupply:", ethers.formatEther(await gold.totalSupply()));
  console.log("GOLD remaining mintable:", ethers.formatEther(await gold.remainingMintCapacity()));
  console.log("Router tax-exempt:", await gold.taxExempt(PCS_ROUTER));
  console.log("Factory tax-exempt:", await gold.taxExempt(PCS_FACTORY));

  // ===== SAVE =====
  addresses.pancakeRouterTestnet = PCS_ROUTER;
  addresses.pancakeFactoryTestnet = PCS_FACTORY;
  addresses.initialMintDone = true;
  fs.writeFileSync("./deployed-addresses-v2.json", JSON.stringify(addresses, null, 2));

  console.log("\n========================================");
  console.log("    INITIAL SETUP COMPLETE!");
  console.log("========================================");
  console.log("NEXT: scripts/create-lps-v2.cjs");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ FAILED:");
    console.error(error);
    process.exit(1);
  });
