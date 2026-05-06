const { ethers } = require("hardhat");
const fs = require("fs");

async function main() {
  const [deployer] = await ethers.getSigners();
  const TREASURY = deployer.address;

  console.log("========================================");
  console.log("    GOLD FINANCE V2 — DEPLOYMENT");
  console.log("========================================");
  console.log("Deployer / Treasury:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "tBNB\n");

  // ===== 1. GOLDCOIN (21B cap) =====
  console.log("[1/7] Deploying GoldCoin (21B max supply)...");
  const GoldCoin = await ethers.getContractFactory("GoldCoin");
  const gold = await GoldCoin.deploy();
  await gold.waitForDeployment();
  const goldAddr = await gold.getAddress();
  console.log("      → GoldCoin:", goldAddr);

  // ===== 2. GOLDSHARE (350K cap, mints 7K to treasury) =====
  console.log("[2/7] Deploying GoldShare (350K cap)...");
  const GoldShare = await ethers.getContractFactory("GoldShare");
  const gshare = await GoldShare.deploy(deployer.address, TREASURY);
  await gshare.waitForDeployment();
  const gshareAddr = await gshare.getAddress();
  console.log("      → GoldShare:", gshareAddr);

  // ===== 3. TEAMVESTER (2y linear) =====
  console.log("[3/7] Deploying TeamVester (2 year linear)...");
  const TeamVester = await ethers.getContractFactory("TeamVester");
  const vester = await TeamVester.deploy(deployer.address, gshareAddr, TREASURY);
  await vester.waitForDeployment();
  const vesterAddr = await vester.getAddress();
  console.log("      → TeamVester:", vesterAddr);

  // ===== 4. BOARDROOM (epoch 6h, 12h withdraw lock) =====
  const epochStart = Math.floor(Date.now() / 1000) + 60;
  const initialReward = ethers.parseEther("0.0685");
  console.log("[4/7] Deploying Boardroom (epoch 6h, 2000% APR)...");
  const Boardroom = await ethers.getContractFactory("Boardroom");
  const boardroom = await Boardroom.deploy(
    deployer.address,
    gshareAddr,
    goldAddr,
    epochStart,
    initialReward
  );
  await boardroom.waitForDeployment();
  const boardroomAddr = await boardroom.getAddress();
  console.log("      → Boardroom:", boardroomAddr);
  console.log("      → epochStart:", epochStart, "(", new Date(epochStart * 1000).toISOString(), ")");

  // ===== 5. BUYBACKCONTROLLER (gets sell tax) =====
  console.log("[5/7] Deploying BuybackController...");
  const Buyback = await ethers.getContractFactory("BuybackController");
  const buyback = await Buyback.deploy(deployer.address, goldAddr);
  await buyback.waitForDeployment();
  const buybackAddr = await buyback.getAddress();
  console.log("      → BuybackController:", buybackAddr);

  // ===== 6. GOLDSHAREFARM (CONTINUOUS — new!) =====
  const farmStart = Math.floor(Date.now() / 1000) + 60;
  console.log("[6/7] Deploying GoldShareFarm (continuous emission)...");
  const Farm = await ethers.getContractFactory("GoldShareFarm");
  const farm = await Farm.deploy(gshareAddr, farmStart);
  await farm.waitForDeployment();
  const farmAddr = await farm.getAddress();
  console.log("      → GoldShareFarm:", farmAddr);
  console.log("      → farmStart:", farmStart);

  // ===== 7. GOLDVAULTNFT =====
  console.log("[7/7] Deploying GoldVaultNFT...");
  const NFT = await ethers.getContractFactory("GoldVaultNFT");
  const nft = await NFT.deploy(deployer.address, goldAddr, TREASURY);
  await nft.waitForDeployment();
  const nftAddr = await nft.getAddress();
  console.log("      → GoldVaultNFT:", nftAddr);

  // ===== WIRING =====
  console.log("\n--- Wiring permissions ---");
  let tx;

  // 1. Boardroom can mint GOLD
  tx = await gold.setMinter(boardroomAddr, true);
  await tx.wait();
  console.log("  ✓ Boardroom is GOLD minter");

  // 2. BuybackController link
  tx = await buyback.setBoardroom(boardroomAddr);
  await tx.wait();
  console.log("  ✓ Buyback knows Boardroom");

  // 3. GoldCoin → BuybackController for tax
  tx = await gold.setBuybackController(buybackAddr);
  await tx.wait();
  console.log("  ✓ GoldCoin sends tax to Buyback");

  // 4. Boardroom accepts reward injection from Buyback
  tx = await boardroom.setRewardInjector(buybackAddr);
  await tx.wait();
  console.log("  ✓ Boardroom accepts inject from Buyback");

  // 5. GoldShareFarm can mint GSHARE
  tx = await gshare.setMinter(farmAddr, true);
  await tx.wait();
  console.log("  ✓ GoldShareFarm is GSHARE minter");

  // ===== INITIAL DISTRIBUTION =====
  console.log("\n--- Initial GSHARE allocation ---");

  const treasuryBal = await gshare.balanceOf(TREASURY);
  console.log("  Treasury already has:", ethers.formatEther(treasuryBal), "GSHARE (constructor)");

  // Team allocation → TeamVester
  tx = await gshare.mintTeamAllocation(vesterAddr);
  await tx.wait();
  const vesterBal = await gshare.balanceOf(vesterAddr);
  console.log("  ✓ TeamVester loaded:", ethers.formatEther(vesterBal), "GSHARE (vests over 2 years)");

  // ===== SAVE ADDRESSES =====
  const addresses = {
    network: "bscTestnet",
    deployer: deployer.address,
    treasury: TREASURY,
    GoldCoin: goldAddr,
    GoldShare: gshareAddr,
    TeamVester: vesterAddr,
    Boardroom: boardroomAddr,
    BuybackController: buybackAddr,
    GoldShareFarm: farmAddr,
    GoldVaultNFT: nftAddr,
    epochStart,
    farmStart,
    deployedAt: new Date().toISOString(),
    version: "v2-continuous-21b-cap",
    notes: "GoldCoin has 21B max cap. Farm uses continuous per-second emissions."
  };
  fs.writeFileSync("./deployed-addresses-v2.json", JSON.stringify(addresses, null, 2));

  // ===== FINAL SUMMARY =====
  console.log("\n========================================");
  console.log("    DEPLOYMENT V2 COMPLETE!");
  console.log("========================================");
  console.log("GoldCoin       (21B cap):   ", goldAddr);
  console.log("GoldShare      (350K cap):  ", gshareAddr);
  console.log("TeamVester     (2y linear): ", vesterAddr);
  console.log("Boardroom      (6h epoch):  ", boardroomAddr);
  console.log("BuybackCtrl    :            ", buybackAddr);
  console.log("GoldShareFarm  (continuous):", farmAddr);
  console.log("GoldVaultNFT   :            ", nftAddr);
  console.log("");
  console.log("Saved to: deployed-addresses-v2.json");
  console.log("");
  console.log("NEXT:");
  console.log("  1. scripts/setup-initial-v2.cjs  → mint 10M GOLD + whitelist PCS");
  console.log("  2. scripts/create-lps-v2.cjs     → create 3 LP pairs");
  console.log("  3. scripts/register-lps-v2.cjs   → register pools + AMM tax");
  console.log("  4. Update frontend (.env, addresses.ts, ABIs)");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ DEPLOYMENT FAILED:");
    console.error(error);
    process.exit(1);
  });
