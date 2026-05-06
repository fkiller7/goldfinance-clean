import GoldCoin from "./GoldCoin.json";
import GoldShare from "./GoldShare.json";
import Boardroom from "./Boardroom.json";
import GoldShareFarm from "./GoldShareFarm.json";
import GoldVaultNFT from "./GoldVaultNFT.json";
import BuybackController from "./BuybackController.json";
import TeamVester from "./TeamVester.json";
import ERC20 from "./ERC20.json";

const ABIS: Record<string, any> = {
  goldcoin: GoldCoin,
  goldshare: GoldShare,
  boardroom: Boardroom,
  farm: GoldShareFarm,
  goldsharefarm: GoldShareFarm,
  nft: GoldVaultNFT,
  vault: GoldVaultNFT,
  buyback: BuybackController,
  vester: TeamVester,
  erc20: ERC20,

  // Aliases / backward compat
  rewardpool: GoldShareFarm,
};

export default ABIS;
