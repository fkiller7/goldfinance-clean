// ------------------------------
// Global dApp config (Frontend)
// ------------------------------

export const NETWORK_ID = 97; // ✅ BSC Testnet Chain ID

export const RPC_URL = "https://data-seed-prebsc-1-s1.binance.org:8545";

// Contract addresses (auto-loaded from addresses.ts)
import CONTRACTS from "./contracts/addresses";

export const ADDRESS_GOLDCOIN  = CONTRACTS.GOLD;
export const ADDRESS_GOLDSHARE = CONTRACTS.GSHARE;
export const ADDRESS_BOARDROOM = CONTRACTS.BOARDROOM;

// Explorer (for linking tx/addresses)
export const BLOCK_EXPLORER = "https://testnet.bscscan.com";

// App name
export const APP_NAME = "GoldFinance Testnet";

// Wallet settings
export const SUPPORTED_CHAIN_IDS = [97];

// Fallback values (just in case)
export const DEFAULT_PROVIDER = RPC_URL;
