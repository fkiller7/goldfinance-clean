const { ethers } = require("hardhat");
const fs = require("fs");

async function main() {
  // Load deployed addresses
  const addresses = JSON.parse(fs.readFileSync("./deployed-addresses.json", "utf8"));
  console.log("Loaded addresses from deployed-addresses.json");

  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "BNB");

  // Connect to deployed contracts
  const gold = await ethers.getContractAt("GoldCoin", addresses.GoldCoin);
  console.log("\nConnected to GoldCoin at:", addresses.GoldCoin);

  // ===== STEP 2: MINT INITIAL GOLD FOR LP =====
  console.log("\n--- Minting 10,000,000 GOLD for LP seed ---");
  const mintAmount = ethers.parseEther("10000000"); // 10M GOLD
  const tx1 = await gold.mint(deployer.address, mintAmount);
  console.log("Tx hash:", tx1.hash);
  await tx1.wait();
  
  const balance = await gold.balanceOf(deployer.address);
  console.log("GOLD balance now:", ethers.formatEther(balance));

  // ===== PRE-WHITELIST PANCAKESWAP ROUTER =====
  // BSC Testnet PancakeSwap V2 Router
  const PCS_ROUTER_TESTNET = "0xD99D1c33F9fC3444f8101754aBC46c52416550D1";
  const PCS_FACTORY_TESTNET = "0x6725F303b657a9451d8BA641348b6761A6CC7a17";
  
  console.log("\n--- Whitelisting PancakeSwap router (no tax on liquidity adds) ---");
  const tx2 = await gold.setTaxExempt(PCS_ROUTER_TESTNET, true);
  console.log("Router whitelisted, tx:", tx2.hash);
  await tx2.wait();

  console.log("\n--- Whitelisting PancakeSwap factory ---");
  const tx3 = await gold.setTaxExempt(PCS_FACTORY_TESTNET, true);
  console.log("Factory whitelisted, tx:", tx3.hash);
  await tx3.wait();

  // ===== SUMMARY =====
  console.log("\n========================================");
  console.log("        INITIAL SETUP COMPLETE");
  console.log("========================================");
  console.log("GOLD minted to deployer: 10,000,000");
  console.log("PancakeSwap router/factory whitelisted (no tax)");
  console.log("");
  console.log("READY FOR:");
  console.log("  - Creating LP pairs on PancakeSwap testnet");
  console.log("  - URL: https://pancake.kiemtienonline360.com/#/add (testnet UI)");
  console.log("");
  console.log("AFTER LPs CREATED:");
  console.log("  Run scripts/register-lps.cjs to set AMM pairs and add to farm");

  // Save updated state
  addresses.initialMintDone = true;
  addresses.initialGoldMinted = "10000000";
  addresses.pancakeRouterTestnet = PCS_ROUTER_TESTNET;
  addresses.pancakeFactoryTestnet = PCS_FACTORY_TESTNET;
  fs.writeFileSync("./deployed-addresses.json", JSON.stringify(addresses, null, 2));
  console.log("\nState saved to deployed-addresses.json");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
