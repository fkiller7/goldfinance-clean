import React from "react";
import PoolFarm from "./PoolFarm";
import { CONTRACTS } from "../contracts/addresses";

const GoldGshareFarm: React.FC = () => (
  <PoolFarm
    pid={2}
    poolName="GoldCoin / GoldShare"
    lpAddress={CONTRACTS.LP_GOLD_GSHARE}
    lpSymbol="GOLD/GSHARE LP"
  />
);

export default GoldGshareFarm;
