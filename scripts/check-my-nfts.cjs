const hre = require("hardhat");

async function main() {
  const [user] = await hre.ethers.getSigners();
  const NFT_ADDR = "0x588b6615Bf93e9818bA83651F8255FCE6C56eae7";
  
  const nft = await hre.ethers.getContractAt("GoldVaultNFTv2", NFT_ADDR);
  
  console.log("User:", user.address);
  console.log("\n=== Scanning token IDs directly ===");
  
  const totalActive = await nft.totalActiveNFTs();
  console.log("Total active NFTs:", totalActive.toString());
  
  const upperBound = Number(totalActive) + 50;
  console.log(`Scanning tokens 1..${upperBound}...`);
  
  for (let i = 1; i <= upperBound; i++) {
    try {
      const owner = await nft.ownerOf(i);
      if (owner.toLowerCase() === user.address.toLowerCase()) {
        const data = await nft.vaultData(i);
        const product = await nft.products(data.productId);
        
        console.log(`\n  Token #${i}:`);
        console.log(`    Product: ${product.name}`);
        console.log(`    Minted: ${new Date(Number(data.mintedAt) * 1000).toLocaleString()}`);
        console.log(`    Burned: ${hre.ethers.formatEther(data.goldBurnedAtMint)} GOLD`);
        console.log(`    Delivered: ${data.physicallyDelivered}`);
      }
    } catch {}
  }
  
  const burnt = await nft.totalGoldBurnt();
  console.log(`\nTotal GOLD burnt across all NFTs: ${hre.ethers.formatEther(burnt)}`);
}

main().catch(console.error);
