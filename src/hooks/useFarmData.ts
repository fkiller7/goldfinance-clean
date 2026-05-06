import { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getProvider } from "../utils/blockchain";
import RewardPoolAbi from "../contracts/abis/RewardPool.json";

// 🎯 TypeScript-interface voor wat we ophalen
interface FarmData {
  apr: number;
  dailyApr: number;
  tvl: number;
  totalStaked: number;
  pendingRewards: number;
}

export const useFarmData = (farmAddress: string) => {
  const [data, setData] = useState<FarmData | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        const provider = getProvider();
        const contract = new ethers.Contract(farmAddress, RewardPoolAbi, provider);

        // ✅ 1. Haal TVL (total staked tokens)
        let totalStaked = 0;
        try {
          const tvlRaw = await contract.totalSupply?.();
          totalStaked = Number(ethers.formatEther(tvlRaw || 0));
        } catch {
          console.warn("⚠️ Contract heeft geen totalSupply() — gebruik fallback");
        }

        // ✅ 2. APR berekening (voorbeeld)
        // Als jouw contract een functie heeft zoals getAPR(), gebruik die i.p.v. de berekening hieronder
        let apr = 0;
        try {
          if (contract.getAPR) {
            const aprRaw = await contract.getAPR();
            apr = Number(aprRaw) / 100;
          } else {
            // schatting — vervang dit door jouw echte logica
            apr = 120; // test fallback
          }
        } catch {
          apr = 120;
        }

        // ✅ 3. Daily APR afgeleid
        const dailyApr = apr / 365;

        // ✅ 4. Pending rewards (voor wallet)
        let pendingRewards = 0;
        try {
          const accounts = await provider.send("eth_requestAccounts", []);
          const userAddr = accounts[0];
          if (contract.pendingReward) {
            const rewards = await contract.pendingReward(userAddr);
            pendingRewards = Number(ethers.formatEther(rewards));
          }
        } catch {
          console.warn("⚠️ Geen pendingReward() gevonden of niet verbonden");
        }

        // ✅ 5. TVL (in USD, schatting)
        const tvlUsd = totalStaked * 100; // bijv. LP $100 per stuk — later koppelen aan oracle

        // ✅ 6. Data opslaan
        setData({
          apr,
          dailyApr,
          tvl: tvlUsd,
          totalStaked,
          pendingRewards,
        });
      } catch (err) {
        console.error("❌ Fout bij ophalen farm data:", err);
      }
    };

    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [farmAddress]);

  return data;
};
