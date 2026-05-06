// Load env variables
require("dotenv").config();

// Hardhat plugins — ALLEEN ethers v6 (geen v5 plugin)
require("@nomicfoundation/hardhat-toolbox");

const PRIVATE_KEY = process.env.PRIVATE_KEY;
const BSC_RPC = process.env.BSC_RPC || "https://bsc-testnet-rpc.publicnode.com";
const BSCSCAN_API_KEY = process.env.BSCSCAN_API_KEY;

module.exports = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 1000,
      },
      viaIR: true,  // helpt bij grote contracten zoals GoldVaultNFT
    },
  },

  networks: {
    hardhat: {
      // Lokale test node
    },
    localhost: {
      url: "http://127.0.0.1:8545",
    },
    bscTestnet: {
      url: BSC_RPC,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      chainId: 97,
      gasPrice: 10000000000, // 10 gwei
    },
    bsc: {
      url: process.env.BSC_MAINNET_RPC || "https://bsc-dataseed.binance.org/",
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      chainId: 56,
    },
  },

  etherscan: {
    apiKey: {
      bscTestnet: BSCSCAN_API_KEY,
      bsc: BSCSCAN_API_KEY,
    },
  },

  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },

  mocha: {
    timeout: 120000, // 2 min timeout for slow networks
  },
};