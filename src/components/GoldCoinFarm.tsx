import React from "react";
import PoolFarm from "./PoolFarm";
import { CONTRACTS } from "../contracts/addresses";

const GoldCoinFarm: React.FC = () => (
  <PoolFarm
    pid={1}
    poolName="GoldCoin / BNB"
    lpAddress={CONTRACTS.LP_GOLD_BNB}
    lpSymbol="GOLD/BNB LP"
  />
);

export default GoldCoinFarm;
