const hre = require("hardhat");

async function main() {
  const [user] = await hre.ethers.getSigners();
  console.log("User:", user.address);
  
  const NFT_ADDR = "0x4dE29198971811B812F2EF3D00F94Db3EDb985B7";
  const GOLD_ADDR = "0x3C9c4C6C308904fC8A6BbAfFb132F04C6FdD11fc";
  
  const nft = await hre.ethers.getContractAt("GoldVaultNFTv2", NFT_ADDR);
  const gold = await hre.ethers.getContractAt("GoldCoin", GOLD_ADDR);
  
  // 1. Check user GOLD balance
  const balance = await gold.balanceOf(user.address);
  console.log("\n=== User state ===");
  console.log("GOLD balance:", hre.ethers.formatEther(balance));
  console.log("BNB balance:", hre.ethers.formatEther(await hre.ethers.provider.getBalance(user.address)));
  
  // 2. Check allowance
  const allowance = await gold.allowance(user.address, NFT_ADDR);
  console.log("Allowance to NFT:", hre.ethers.formatEther(allowance));
  
  // 3. Quote 1g Gold
  const quote = await nft.quoteMint(0);
  console.log("\n=== Quote 1g Gold ===");
  console.log("GOLD needed:", hre.ethers.formatEther(quote[0]));
  console.log("BNB fee needed:", hre.ethers.formatEther(quote[1]));
  
  // 4. Check if GOLD has burnFrom function
  console.log("\n=== GoldCoin checks ===");
  try {
    // Try to read the burnFrom interface
    const burnFromFragment = gold.interface.getFunction("burnFrom");
    console.log("burnFrom exists:", burnFromFragment.format());
  } catch (e) {
    console.log("❌ burnFrom NOT FOUND in GoldCoin ABI");
  }
  
  // 5. Try to staticCall mint to see exact error
  console.log("\n=== Simulating mint(0) ===");
  try {
    const result = await nft.mint.staticCall(0, { value: quote[1] });
    console.log("✅ Static call success! Token would be:", result);
  } catch (e) {
    console.log("❌ Static call failed:");
    console.log("Error:", e.message);
    if (e.data) console.log("Data:", e.data);
    if (e.reason) console.log("Reason:", e.reason);
  }
  
  // 6. Set max allowance via approve and try again
  if (allowance < quote[0]) {
    console.log("\n=== Approving GOLD ===");
    const tx = await gold.approve(NFT_ADDR, hre.ethers.MaxUint256);
    await tx.wait();
    console.log("✅ Approved");
    
    const newAllowance = await gold.allowance(user.address, NFT_ADDR);
    console.log("New allowance:", hre.ethers.formatEther(newAllowance));
    
    // Try static call again
    console.log("\n=== Retrying static mint(0) ===");
    try {
      const result = await nft.mint.staticCall(0, { value: quote[1] });
      console.log("✅ Static call success!");
    } catch (e) {
      console.log("❌ Still failing:", e.message);
      if (e.reason) console.log("Reason:", e.reason);
    }
  }
}

main().catch(console.error);
