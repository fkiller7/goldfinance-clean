const { ethers } = require("hardhat");

// ===== CONFIG =====
const TREASURY = "0xfB89B0224bCb9B9387e888004d3e8e640199Bb55";

// 0.0685 GOLD per GSHARE per epoch = 2000% APR @ launch prices ($5 GSHARE, $0.001 GOLD)
const INITIAL_BOARDROOM_REWARD = ethers.parseEther("0.0685");

// Pool weights (must sum to 100)
const POOL_GSHARE_BNB_WEIGHT = 40;
const POOL_GOLD_BNB_WEIGHT = 35;
const POOL_GOLD_GSHARE_WEIGHT = 25;

// BSC Mainnet Chainlink XAU/USD: 0x86896fEB19D8A607c3b11f2aF50A0f239Bd71CD0
// BSC Testnet: gebruik manual price (no oracle)
const XAU_ORACLE = "0x0000000000000000000000000000000000000000"; // pas aan voor mainnet

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "BNB");

  // Start time: nu (epochs starten direct)
  const now = Math.floor(Date.now() / 1000);
  const epochStart = now;
  console.log("Epoch start:", new Date(epochStart * 1000).toISOString());

  // ===== 1. DEPLOY TOKENS =====
  console.log("\n--- Deploying GoldCoin (GOLD) ---");
  const GoldCoin = await ethers.getContractFactory("GoldCoin");
  const gold = await GoldCoin.deploy(deployer.address);
  await gold.waitForDeployment();
  console.log("GoldCoin:", await gold.getAddress());

  console.log("\n--- Deploying GoldShare (GSHARE) ---");
  const GoldShare = await ethers.getContractFactory("GoldShare");
  const gshare = await GoldShare.deploy(deployer.address, TREASURY);
  await gshare.waitForDeployment();
  console.log("GoldShare:", await gshare.getAddress());
  console.log("Treasury received 7,000 GSHARE (LP seed + marketing)");

  // ===== 2. DEPLOY VESTER =====
  console.log("\n--- Deploying TeamVester ---");
  const TeamVester = await ethers.getContractFactory("TeamVester");
  const vester = await TeamVester.deploy(
    deployer.address,
    await gshare.getAddress(),
    TREASURY // beneficiary = treasury for now (kan later switch naar multisig)
  );
  await vester.waitForDeployment();
  console.log("TeamVester:", await vester.getAddress());

  console.log("\n--- Minting team allocation to vester ---");
  const tx1 = await gshare.mintTeamAllocation(await vester.getAddress());
  await tx1.wait();
  console.log("26,250 GSHARE locked in vester (2-year linear)");

  // ===== 3. DEPLOY BOARDROOM =====
  console.log("\n--- Deploying Boardroom ---");
  const Boardroom = await ethers.getContractFactory("Boardroom");
  const boardroom = await Boardroom.deploy(
    deployer.address,
    await gshare.getAddress(),
    await gold.getAddress(),
    epochStart,
    INITIAL_BOARDROOM_REWARD
  );
  await boardroom.waitForDeployment();
  console.log("Boardroom:", await boardroom.getAddress());

  // ===== 4. DEPLOY BUYBACK CONTROLLER =====
  console.log("\n--- Deploying BuybackController ---");
  const Buyback = await ethers.getContractFactory("BuybackController");
  const buyback = await Buyback.deploy(deployer.address, await gold.getAddress());
  await buyback.waitForDeployment();
  console.log("BuybackController:", await buyback.getAddress());

  // ===== 5. DEPLOY FARM =====
  console.log("\n--- Deploying GoldShareFarm ---");
  const Farm = await ethers.getContractFactory("GoldShareFarm");
  const farm = await Farm.deploy(deployer.address, await gshare.getAddress(), epochStart);
  await farm.waitForDeployment();
  console.log("GoldShareFarm:", await farm.getAddress());

  // ===== 6. DEPLOY NFT VAULT =====
  console.log("\n--- Deploying GoldVaultNFT ---");
  const NFT = await ethers.getContractFactory("GoldVaultNFT");
  const nft = await NFT.deploy(
    deployer.address,
    await gold.getAddress(),
    TREASURY
  );
  await nft.waitForDeployment();
  console.log("GoldVaultNFT:", await nft.getAddress());

  if (XAU_ORACLE !== "0x0000000000000000000000000000000000000000") {
    await nft.setXauOracle(XAU_ORACLE);
    console.log("XAU oracle set");
  } else {
    console.log("⚠️  No XAU oracle set (testnet mode) — set manually later");
  }

  // ===== 7. WIRE PERMISSIONS =====
  console.log("\n--- Wiring permissions ---");

  console.log("Setting Boardroom as GOLD minter...");
  await (await gold.setMinter(await boardroom.getAddress(), true)).wait();

  console.log("Setting BuybackController as GOLD recipient...");
  await (await gold.setBuybackController(await buyback.getAddress())).wait();
  await (await gold.setTaxExempt(await boardroom.getAddress(), true)).wait();
  await (await gold.setTaxExempt(await farm.getAddress(), true)).wait();
  await (await gold.setTaxExempt(await nft.getAddress(), true)).wait();
  await (await gold.setTaxExempt(TREASURY, true)).wait();

  console.log("Setting GoldShareFarm as GSHARE minter...");
  await (await gshare.setMinter(await farm.getAddress(), true)).wait();

  console.log("Linking BuybackController to Boardroom...");
  await (await buyback.setBoardroom(await boardroom.getAddress())).wait();
  await (await boardroom.setRewardInjector(await buyback.getAddress())).wait();

  // ===== 8. ADD FARM POOLS =====
  // ⚠️  Pool LP addresses moeten eerst gecreëerd worden op PancakeSwap
  // ⚠️  Hieronder placeholder addresses — vervang met echte LP addresses
  console.log("\n--- Adding farm pools (requires LP addresses!) ---");
  console.log("⚠️  Skipping pool addition — first create LPs on PancakeSwap, then run addPools script");
  // const lpGshareBnb = "0x...";
  // await farm.addPool(lpGshareBnb, POOL_GSHARE_BNB_WEIGHT);
  // const lpGoldBnb = "0x...";
  // await farm.addPool(lpGoldBnb, POOL_GOLD_BNB_WEIGHT);
  // const lpGoldGshare = "0x...";
  // await farm.addPool(lpGoldGshare, POOL_GOLD_GSHARE_WEIGHT);

  // ===== SUMMARY =====
  console.log("\n========================================");
  console.log("        DEPLOYMENT COMPLETE 🎉");
  console.log("========================================");
  console.log("Network:           ", (await ethers.provider.getNetwork()).name);
  console.log("Deployer:          ", deployer.address);
  console.log("Treasury:          ", TREASURY);
  console.log("");
  console.log("GOLD:              ", await gold.getAddress());
  console.log("GSHARE:            ", await gshare.getAddress());
  console.log("TeamVester:        ", await vester.getAddress());
  console.log("Boardroom:         ", await boardroom.getAddress());
  console.log("BuybackController: ", await buyback.getAddress());
  console.log("GoldShareFarm:     ", await farm.getAddress());
  console.log("GoldVaultNFT:      ", await nft.getAddress());
  console.log("");
  console.log("Initial reward:    ", ethers.formatEther(INITIAL_BOARDROOM_REWARD), "GOLD/GSHARE/epoch");
  console.log("Epoch start:       ", new Date(epochStart * 1000).toISOString());
  console.log("");
  console.log("NEXT STEPS:");
  console.log("1. Mint initial GOLD for LP via gold.mint(deployer, ...)");
  console.log("2. Create LPs on PancakeSwap (GSHARE/BNB, GOLD/BNB, GOLD/GSHARE)");
  console.log("3. Add LP addresses to farm via farm.addPool()");
  console.log("4. Set AMM pairs via gold.setAmmPair() so tax kicks in");
  console.log("5. Update frontend addresses.ts with deployed addresses");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });