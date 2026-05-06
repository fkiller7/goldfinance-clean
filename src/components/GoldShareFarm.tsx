import React from "react";
import PoolFarm from "./PoolFarm";
import { CONTRACTS } from "../contracts/addresses";

const GoldShareFarm: React.FC = () => (
  <PoolFarm
    pid={0}
    poolName="GoldShare / BNB"
    lpAddress={CONTRACTS.LP_GSHARE_BNB}
    lpSymbol="GSHARE/BNB LP"
  />
);

export default GoldShareFarm;
