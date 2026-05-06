export const CONTRACTS = {
  // Token contracts
  GOLD: import.meta.env.VITE_GOLDCOIN_ADDRESS,
  GSHARE: import.meta.env.VITE_GOLDSHARE_ADDRESS,

  // Protocol contracts
  BOARDROOM: import.meta.env.VITE_BOARDROOM_ADDRESS,
  TEAMVESTER: import.meta.env.VITE_TEAMVESTER_ADDRESS,
  BUYBACK: import.meta.env.VITE_BUYBACK_ADDRESS,
  FARM: import.meta.env.VITE_GOLDSHAREFARM_ADDRESS,
  NFT: import.meta.env.VITE_NFT_ADDRESS,

  // LP token addresses
  LP_GSHARE_BNB: import.meta.env.VITE_LP_GSHARE_BNB,
  LP_GOLD_BNB: import.meta.env.VITE_LP_GOLD_BNB,
  LP_GOLD_GSHARE: import.meta.env.VITE_LP_GOLD_GSHARE,

  // Farm pool IDs (zoals geregistreerd in GoldShareFarm contract)
  POOL_GSHARE_BNB: 0,
  POOL_GOLD_BNB: 1,
  POOL_GOLD_GSHARE: 2,

  // === Aliases voor backward compat ===
  GoldCoin: import.meta.env.VITE_GOLDCOIN_ADDRESS,
  GoldShare: import.meta.env.VITE_GOLDSHARE_ADDRESS,
  Boardroom: import.meta.env.VITE_BOARDROOM_ADDRESS,
  GoldShareFarm: import.meta.env.VITE_GOLDSHAREFARM_ADDRESS,
  GoldVaultNFT: import.meta.env.VITE_NFT_ADDRESS,
  GoldBnbLP: import.meta.env.VITE_LP_GOLD_BNB,
  GshareBnbLP: import.meta.env.VITE_LP_GSHARE_BNB,
  GoldGshareLP: import.meta.env.VITE_LP_GOLD_GSHARE,

  // Deprecated — wijst naar nieuwe farm voor zachte migratie
  REWARDPOOL: import.meta.env.VITE_GOLDSHAREFARM_ADDRESS,
  RewardPool: import.meta.env.VITE_GOLDSHAREFARM_ADDRESS,
};

export default CONTRACTS;
