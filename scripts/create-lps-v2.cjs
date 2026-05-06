const { ethers } = require("hardhat");
const fs = require("fs");

const PCS_ROUTER = "0xD99D1c33F9fC3444f8101754aBC46c52416550D1";
const PCS_FACTORY = "0x6725F303b657a9451d8BA641348b6761A6CC7a17";

const ROUTER_ABI = [
  "function addLiquidity(address tokenA, address tokenB, uint amountADesired, uint amountBDesired, uint amountAMin, uint amountBMin, address to, uint deadline) external returns (uint amountA, uint amountB, uint liquidity)",
  "function addLiquidityETH(address token, uint amountTokenDesired, uint amountTokenMin, uint amountETHMin, address to, uint deadline) external payable returns (uint amountToken, uint amountETH, uint liquidity)",
  "function WETH() external pure returns (address)"
];

const FACTORY_ABI = [
  "function getPair(address tokenA, address tokenB) external view returns (address pair)"
];

async function main() {
  const addresses = JSON.parse(fs.readFileSync("./deployed-addresses-v2.json", "utf8"));
  const [signer] = await ethers.getSigners();

  console.log("Signer:", signer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(signer.address)), "tBNB\n");

  const router = new ethers.Contract(PCS_ROUTER, ROUTER_ABI, signer);
  const factory = new ethers.Contract(PCS_FACTORY, FACTORY_ABI, signer);
  const wbnb = await router.WETH();
  console.log("WBNB:", wbnb);

  const gold = await ethers.getContractAt("GoldCoin", addresses.GoldCoin, signer);
  const gshare = await ethers.getContractAt("GoldShare", addresses.GoldShare, signer);

  console.log("GOLD balance:", ethers.formatEther(await gold.balanceOf(signer.address)));
  console.log("GSHARE balance:", ethers.formatEther(await gshare.balanceOf(signer.address)));

  const goldForBnbLp = ethers.parseEther("100000");
  const goldForGshareLp = ethers.parseEther("100000");
  const gshareForBnbLp = ethers.parseEther("50");
  const gshareForGoldLp = ethers.parseEther("50");
  const bnbPerLp = ethers.parseEther("0.01");

  async function sendTx(name, fn) {
    console.log(`→ ${name}`);
    const tx = await fn();
    console.log(`  tx: ${tx.hash}`);
    await tx.wait();
    console.log(`  ✓ confirmed`);
    await new Promise(r => setTimeout(r, 2000));
    return tx;
  }

  // ===== APPROVE ROUTER =====
  console.log("\n--- Approvals ---");
  await sendTx("Approve GOLD to router", () => gold.approve(PCS_ROUTER, ethers.MaxUint256));
  await sendTx("Approve GSHARE to router", () => gshare.approve(PCS_ROUTER, ethers.MaxUint256));

  const deadline = Math.floor(Date.now() / 1000) + 3600;

  // ===== LP 1: GSHARE/BNB =====
  console.log("\n--- LP 1: GSHARE/BNB (50 GSHARE + 0.01 tBNB) ---");
  await sendTx("addLiquidityETH GSHARE/BNB",
    () => router.addLiquidityETH(addresses.GoldShare, gshareForBnbLp, 0, 0, signer.address, deadline, { value: bnbPerLp }));
  const lpGshareBnb = await factory.getPair(addresses.GoldShare, wbnb);
  console.log("  LP address:", lpGshareBnb);

  // ===== LP 2: GOLD/BNB =====
  console.log("\n--- LP 2: GOLD/BNB (100,000 GOLD + 0.01 tBNB) ---");
  await sendTx("addLiquidityETH GOLD/BNB",
    () => router.addLiquidityETH(addresses.GoldCoin, goldForBnbLp, 0, 0, signer.address, deadline, { value: bnbPerLp }));
  const lpGoldBnb = await factory.getPair(addresses.GoldCoin, wbnb);
  console.log("  LP address:", lpGoldBnb);

  // ===== LP 3: GOLD/GSHARE =====
  console.log("\n--- LP 3: GOLD/GSHARE (100,000 GOLD + 50 GSHARE) ---");
  await sendTx("addLiquidity GOLD/GSHARE",
    () => router.addLiquidity(addresses.GoldCoin, addresses.GoldShare, goldForGshareLp, gshareForGoldLp, 0, 0, signer.address, deadline));
  const lpGoldGshare = await factory.getPair(addresses.GoldCoin, addresses.GoldShare);
  console.log("  LP address:", lpGoldGshare);

  // ===== SAVE =====
  addresses.LP_GSHARE_BNB = lpGshareBnb;
  addresses.LP_GOLD_BNB = lpGoldBnb;
  addresses.LP_GOLD_GSHARE = lpGoldGshare;
  addresses.WBNB = wbnb;
  fs.writeFileSync("./deployed-addresses-v2.json", JSON.stringify(addresses, null, 2));

  console.log("\n========================================");
  console.log("    LPs CREATED!");
  console.log("========================================");
  console.log("GSHARE/BNB:   ", lpGshareBnb);
  console.log("GOLD/BNB:     ", lpGoldBnb);
  console.log("GOLD/GSHARE:  ", lpGoldGshare);
  console.log("\nNEXT: scripts/register-lps-v2.cjs");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ FAILED:");
    console.error(error);
    process.exit(1);
  });
