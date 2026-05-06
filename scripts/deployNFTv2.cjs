const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with:", deployer.address);
  
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Balance:", hre.ethers.formatEther(balance), "BNB");

  // === ADDRESSES (from V2 deployment) ===
  const GOLD_TOKEN = "0x3C9c4C6C308904fC8A6BbAfFb132F04C6FdD11fc";
  const TREASURY = "0xfB89B0224bCb9B9387e888004d3e8e640199Bb55";
  const GOLD_BNB_LP = "0x572cec24D18B8277EDBaA4D40F477Fa74FE2De57";
  const WBNB_TESTNET = "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd";

  console.log("\n=== Deploying GoldVaultNFTv2 ===");
  console.log("GoldToken:", GOLD_TOKEN);
  console.log("Treasury:", TREASURY);

  const NFT = await hre.ethers.getContractFactory("GoldVaultNFTv2");
  const nft = await NFT.deploy(GOLD_TOKEN, TREASURY);
  await nft.waitForDeployment();
  
  const address = await nft.getAddress();
  console.log("\n✅ GoldVaultNFTv2 deployed to:", address);

  // === Configure: link GOLD/BNB LP for auto pricing ===
  console.log("\n=== Configuring LP & WBNB ===");
  const tx1 = await nft.setGoldBnbLP(GOLD_BNB_LP, WBNB_TESTNET);
  await tx1.wait();
  console.log("✅ LP set:", GOLD_BNB_LP);

  // === Verify products are registered ===
  console.log("\n=== Verifying default products ===");
  const count = await nft.productCount();
  console.log("Total products:", count.toString());
  
  for (let i = 0; i < count; i++) {
    const p = await nft.products(i);
    console.log(`  [${i}] ${p.name} — ${p.weightMg}mg — ${p.metal == 0n ? "GOLD" : "SILVER"} — active: ${p.active}`);
  }

  // === Show fee config ===
  console.log("\n=== Fee config ===");
  console.log("Burn fee BPS:", (await nft.mintBurnFeeBps()).toString(), "(=1%)");
  console.log("BNB fee BPS:", (await nft.mintBnbFeeBps()).toString(), "(=3%)");

  // === Show prices ===
  console.log("\n=== Initial manual prices (testnet) ===");
  console.log("Gold/oz USD:", hre.ethers.formatUnits(await nft.manualGoldPriceUSD(), 8));
  console.log("Silver/oz USD:", hre.ethers.formatUnits(await nft.manualSilverPriceUSD(), 8));
  console.log("GOLD token USD:", hre.ethers.formatUnits(await nft.manualGoldTokenPriceUSD(), 8));
  console.log("BNB USD:", hre.ethers.formatUnits(await nft.manualBnbPriceUSD(), 8));

  // === Quote test: what does 1g Gold mint cost? ===
  console.log("\n=== Quote test: 1g Gold (productId=0) ===");
  const quote = await nft.quoteMint(0);
  console.log("GOLD needed:", hre.ethers.formatEther(quote[0]));
  console.log("BNB fee:", hre.ethers.formatEther(quote[1]));

  console.log("\n=== Quote test: 1oz Silver (productId=4) ===");
  const quote2 = await nft.quoteMint(4);
  console.log("GOLD needed:", hre.ethers.formatEther(quote2[0]));
  console.log("BNB fee:", hre.ethers.formatEther(quote2[1]));

  console.log("\n========== SUMMARY ==========");
  console.log("GoldVaultNFTv2:", address);
  console.log("=============================");
  console.log("\nNext: update src/contracts/addresses.ts with new NFT address");
  console.log("\nVerify command:");
  console.log(`npx hardhat verify --network bscTestnet ${address} ${GOLD_TOKEN} ${TREASURY}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
