const { ethers } = require("hardhat");
const fs = require("fs");

const ADDRS = {
  GoldCoin: "0x3C9c4C6C308904fC8A6BbAfFb132F04C6FdD11fc",
  GoldShare: "0x82092356fA73008E0B9A5305e7da8F930De143a3",
  TeamVester: "0x550C26403756695Ac298511ceB1c42654E035053",
  Boardroom: "0x261C0409ac23AFDc43a455Ae35041EDF83eB26ad",
  BuybackController: "0xCDD5cbE6999377eeF1ec647415239eef45857FAe",
  GoldShareFarm: "0x87796CBD1eF97e041FBC2DE74690Ba4B076Cf374",
  GoldVaultNFT: "0x8370E26dcB74bf429Af5588f7b69FB4f3A97dBa9"
};

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Signer:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "tBNB\n");

  const gold = await ethers.getContractAt("GoldCoin", ADDRS.GoldCoin);
  const gshare = await ethers.getContractAt("GoldShare", ADDRS.GoldShare);
  const boardroom = await ethers.getContractAt("Boardroom", ADDRS.Boardroom);

  // Helper: send tx with delay between
  async function sendTx(name, fn) {
    console.log(`→ ${name}`);
    const tx = await fn();
    console.log(`  tx: ${tx.hash}`);
    await tx.wait();
    console.log(`  ✓ confirmed`);
    await new Promise(r => setTimeout(r, 2000)); // 2s delay between tx
  }

  // === Check what's already done ===
  console.log("Checking current state...");
  const isBoardroomMinter = await gold.minters(ADDRS.Boardroom);
  console.log("  Boardroom is GOLD minter:", isBoardroomMinter);

  const buybackBoardroom = await (await ethers.getContractAt("BuybackController", ADDRS.BuybackController)).boardroom();
  console.log("  Buyback knows Boardroom:", buybackBoardroom !== ethers.ZeroAddress);

  const goldBuybackCtrl = await gold.buybackController();
  console.log("  GOLD knows Buyback:", goldBuybackCtrl !== ethers.ZeroAddress);

  const boardroomInjector = await boardroom.rewardInjector();
  console.log("  Boardroom injector set:", boardroomInjector !== ethers.ZeroAddress);

  const isFarmMinter = await gshare.minters(ADDRS.GoldShareFarm);
  console.log("  Farm is GSHARE minter:", isFarmMinter);

  const teamMinted = await gshare.teamAllocationMinted();
  console.log("  Team allocation minted:", teamMinted);

  console.log("\n--- Performing remaining wiring ---");

  if (goldBuybackCtrl === ethers.ZeroAddress) {
    await sendTx("setBuybackController on GOLD",
      () => gold.setBuybackController(ADDRS.BuybackController));
  } else {
    console.log("→ skip: GOLD already knows Buyback");
  }

  if (boardroomInjector === ethers.ZeroAddress) {
    await sendTx("setRewardInjector on Boardroom",
      () => boardroom.setRewardInjector(ADDRS.BuybackController));
  } else {
    console.log("→ skip: Boardroom already has injector");
  }

  if (!isFarmMinter) {
    await sendTx("setMinter(Farm) on GSHARE",
      () => gshare.setMinter(ADDRS.GoldShareFarm, true));
  } else {
    console.log("→ skip: Farm already GSHARE minter");
  }

  if (!teamMinted) {
    await sendTx("mintTeamAllocation to Vester",
      () => gshare.mintTeamAllocation(ADDRS.TeamVester));
  } else {
    console.log("→ skip: Team allocation already minted");
  }

  // === Save addresses ===
  const addresses = {
    network: "bscTestnet",
    deployer: deployer.address,
    treasury: deployer.address,
    ...ADDRS,
    epochStart: 1777707238,
    farmStart: 1777707241,
    deployedAt: new Date().toISOString(),
    version: "v2-continuous-21b-cap"
  };
  fs.writeFileSync("./deployed-addresses-v2.json", JSON.stringify(addresses, null, 2));

  console.log("\n========================================");
  console.log("    WIRING COMPLETE!");
  console.log("========================================");

  const treasuryGshare = await gshare.balanceOf(deployer.address);
  const vesterGshare = await gshare.balanceOf(ADDRS.TeamVester);
  console.log("Treasury GSHARE:", ethers.formatEther(treasuryGshare));
  console.log("Vester GSHARE:  ", ethers.formatEther(vesterGshare));
  console.log("\nSaved to deployed-addresses-v2.json");
  console.log("\nNEXT: scripts/setup-initial-v2.cjs (mint 10M GOLD + whitelist PCS)");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ FAILED:");
    console.error(error);
    process.exit(1);
  });
