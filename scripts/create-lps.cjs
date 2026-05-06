const { ethers } = require("hardhat");
const fs = require("fs");

// PancakeSwap V2 Testnet
const PCS_ROUTER = "0xD99D1c33F9fC3444f8101754aBC46c52416550D1";
const PCS_FACTORY = "0x6725F303b657a9451d8BA641348b6761A6CC7a17";

// Router ABI (minimal)
const ROUTER_ABI = [
  "function addLiquidity(address tokenA, address tokenB, uint amountADesired, uint amountBDesired, uint amountAMin, uint amountBMin, address to, uint deadline) external returns (uint amountA, uint amountB, uint liquidity)",
  "function addLiquidityETH(address token, uint amountTokenDesired, uint amountTokenMin, uint amountETHMin, address to, uint deadline) external payable returns (uint amountToken, uint amountETH, uint liquidity)",
  "function factory() external pure returns (address)",
  "function WETH() external pure returns (address)"
];

const FACTORY_ABI = [
  "function getPair(address tokenA, address tokenB) external view returns (address pair)"
];

async function main() {
  const addresses = JSON.parse(fs.readFileSync("./deployed-addresses.json", "utf8"));
  const [signer] = await ethers.getSigners();

  console.log("Signer:", signer.address);
  const balance = await ethers.provider.getBalance(signer.address);
  console.log("BNB balance:", ethers.formatEther(balance));

  const router = new ethers.Contract(PCS_ROUTER, ROUTER_ABI, signer);
  const factory = new ethers.Contract(PCS_FACTORY, FACTORY_ABI, signer);
  const wbnb = await router.WETH();
  console.log("WBNB testnet:", wbnb);

  const gold = await ethers.getContractAt("GoldCoin", addresses.GoldCoin, signer);
  const gshare = await ethers.getContractAt("GoldShare", addresses.GoldShare, signer);

  const goldBal = await gold.balanceOf(signer.address);
  const gshareBal = await gshare.balanceOf(signer.address);
  console.log("GOLD balance:", ethers.formatEther(goldBal));
  console.log("GSHARE balance:", ethers.formatEther(gshareBal));

  // ===== AMOUNTS =====
  const goldForBnbLp = ethers.parseEther("100000");
  const goldForGshareLp = ethers.parseEther("100000");
  const gshareForBnbLp = ethers.parseEther("50");
  const gshareForGoldLp = ethers.parseEther("50");
  const bnbPerLp = ethers.parseEther("0.01");

  const totalGoldNeeded = goldForBnbLp + goldForGshareLp;
  const totalGshareNeeded = gshareForBnbLp + gshareForGoldLp;

  if (goldBal < totalGoldNeeded) throw new Error("Not enough GOLD");
  if (gshareBal < totalGshareNeeded) throw new Error("Not enough GSHARE");
  if (balance < bnbPerLp * 2n + ethers.parseEther("0.01")) throw new Error("Not enough BNB");

  // ===== APPROVE ROUTER =====
  console.log("\n--- Approving GOLD ---");
  let tx = await gold.approve(PCS_ROUTER, ethers.MaxUint256);
  await tx.wait();
  console.log("GOLD approved:", tx.hash);

  console.log("\n--- Approving GSHARE ---");
  tx = await gshare.approve(PCS_ROUTER, ethers.MaxUint256);
  await tx.wait();
  console.log("GSHARE approved:", tx.hash);

  const deadline = Math.floor(Date.now() / 1000) + 3600;

  // ===== LP 1: GSHARE/BNB =====
  console.log("\n--- Creating LP: GSHARE/BNB ---");
  console.log("Adding 50 GSHARE + 0.01 BNB");
  tx = await router.addLiquidityETH(
    addresses.GoldShare,
    gshareForBnbLp,
    0,
    0,
    signer.address,
    deadline,
    { value: bnbPerLp }
  );
  await tx.wait();
  console.log("Tx:", tx.hash);
  const lpGshareBnb = await factory.getPair(addresses.GoldShare, wbnb);
  console.log("LP GSHARE/BNB created at:", lpGshareBnb);

  // ===== LP 2: GOLD/BNB =====
  console.log("\n--- Creating LP: GOLD/BNB ---");
  console.log("Adding 100,000 GOLD + 0.01 BNB");
  tx = await router.addLiquidityETH(
    addresses.GoldCoin,
    goldForBnbLp,
    0,
    0,
    signer.address,
    deadline,
    { value: bnbPerLp }
  );
  await tx.wait();
  console.log("Tx:", tx.hash);
  const lpGoldBnb = await factory.getPair(addresses.GoldCoin, wbnb);
  console.log("LP GOLD/BNB created at:", lpGoldBnb);

  // ===== LP 3: GOLD/GSHARE =====
  console.log("\n--- Creating LP: GOLD/GSHARE ---");
  console.log("Adding 100,000 GOLD + 50 GSHARE");
  tx = await router.addLiquidity(
    addresses.GoldCoin,
    addresses.GoldShare,
    goldForGshareLp,
    gshareForGoldLp,
    0,
    0,
    signer.address,
    deadline
  );
  await tx.wait();
  console.log("Tx:", tx.hash);
  const lpGoldGshare = await factory.getPair(addresses.GoldCoin, addresses.GoldShare);
  console.log("LP GOLD/GSHARE created at:", lpGoldGshare);

  // ===== SAVE ADDRESSES =====
  addresses.LP_GSHARE_BNB = lpGshareBnb;
  addresses.LP_GOLD_BNB = lpGoldBnb;
  addresses.LP_GOLD_GSHARE = lpGoldGshare;
  addresses.WBNB = wbnb;
  fs.writeFileSync("./deployed-addresses.json", JSON.stringify(addresses, null, 2));

  console.log("\n========================================");
  console.log("        LPs CREATED");
  console.log("========================================");
  console.log("GSHARE/BNB:   ", lpGshareBnb);
  console.log("GOLD/BNB:     ", lpGoldBnb);
  console.log("GOLD/GSHARE:  ", lpGoldGshare);
  console.log("\nAddresses saved to deployed-addresses.json");
  console.log("\nNEXT: Run scripts/register-lps.cjs to add pools to farm + register AMM pairs");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
