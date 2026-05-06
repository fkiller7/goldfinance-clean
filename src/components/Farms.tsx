import React, { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { ethers } from "ethers";
import { useWallet } from "../contexts/WalletContext";
import { CONTRACTS } from "../contracts/addresses";
import farmArtifact from "../contracts/abis/GoldShareFarm.json";
import erc20Artifact from "../contracts/abis/ERC20.json";

const farmAbi = (farmArtifact as any).abi;
const erc20Abi = (erc20Artifact as any).abi || erc20Artifact;

// Public RPC for read-only
const READ_PROVIDER = new ethers.JsonRpcProvider("https://data-seed-prebsc-1-s1.binance.org:8545/");

// Test prices — replace later with oracle/DEX reads
const PRICES = {
  GSHARE: 5,
  GOLD: 0.001,
  BNB: 600,
};

interface PoolData {
  pid: number;
  name: string;
  route: string;
  lpAddress: string;
  allocPoint: number;
  totalAllocPoint: number;
  lpStaked: string;        // LP tokens staked in farm
  emissionPerSec: string;  // GSHARE/sec across all pools (overall)
  poolEmissionPerDay: number; // GSHARE/day for THIS pool
  pendingReward: string;   // user pending GSHARE
}

const POOLS_META = [
  { pid: 0, name: "GoldShare / BNB", route: "/farms/goldshare-bnb", lpAddress: CONTRACTS.LP_GSHARE_BNB },
  { pid: 1, name: "GoldCoin / BNB",  route: "/farms/goldcoin-bnb",  lpAddress: CONTRACTS.LP_GOLD_BNB },
  { pid: 2, name: "GoldCoin / GoldShare", route: "/farms/goldcoin-goldshare", lpAddress: CONTRACTS.LP_GOLD_GSHARE },
];

const Farms: React.FC = () => {
  const { account } = useWallet();
  const [pools, setPools] = useState<PoolData[]>([]);
  const [loading, setLoading] = useState(true);

  const loadPools = useCallback(async () => {
    try {
      const farm = new ethers.Contract(CONTRACTS.FARM, farmAbi, READ_PROVIDER);

      const [emissionPerSec, totalAllocPoint] = await Promise.all([
        farm.emissionPerSecond(Math.floor(Date.now() / 1000)),
        farm.totalAllocPoint(),
      ]);
      const totalAlloc = Number(totalAllocPoint);
      const emissionPerSecNum = parseFloat(ethers.formatEther(emissionPerSec));

      const data: PoolData[] = await Promise.all(
        POOLS_META.map(async (meta) => {
          const lp = new ethers.Contract(meta.lpAddress, erc20Abi, READ_PROVIDER);
          const [poolInfo, lpStakedRaw, pendingRaw] = await Promise.all([
            farm.poolInfo(meta.pid),
            lp.balanceOf(CONTRACTS.FARM),
            account ? farm.pendingGshare(meta.pid, account) : Promise.resolve(0n),
          ]);

          const allocPoint = Number(poolInfo.allocPoint);
          const poolShare = totalAlloc > 0 ? allocPoint / totalAlloc : 0;
          const poolEmissionPerSec = emissionPerSecNum * poolShare;
          const poolEmissionPerDay = poolEmissionPerSec * 86400;

          return {
            pid: meta.pid,
            name: meta.name,
            route: meta.route,
            lpAddress: meta.lpAddress,
            allocPoint,
            totalAllocPoint: totalAlloc,
            lpStaked: ethers.formatEther(lpStakedRaw),
            emissionPerSec: emissionPerSec.toString(),
            poolEmissionPerDay,
            pendingReward: ethers.formatEther(pendingRaw),
          };
        })
      );

      setPools(data);
    } catch (e) {
      console.error("[Farms] load failed:", e);
    } finally {
      setLoading(false);
    }
  }, [account]);

  useEffect(() => {
    loadPools();
    const interval = setInterval(loadPools, 12000);
    return () => clearInterval(interval);
  }, [loadPools]);

  // APR calc per pool: (emissions/day × 365 × GSHARE_price) / TVL × 100
  const calcApr = (pool: PoolData) => {
    const tvl = parseFloat(pool.lpStaked);
    if (tvl <= 0) return 0;
    // Simplified: assume 1 LP token ~ $5 valuation (very rough placeholder)
    // We'll improve once we read actual LP reserves
    const tvlUsd = tvl * 5;
    const yearlyRewardUsd = pool.poolEmissionPerDay * 365 * PRICES.GSHARE;
    return (yearlyRewardUsd / tvlUsd) * 100;
  };

  return (
    <div>
      <h1 className="page-title">Gold Farming Pools</h1>
      <p className="page-subtitle">Earn GoldShare rewards by staking LP tokens</p>

      {loading ? (
        <div className="gf-card" style={{ textAlign: "center" }}>
          Loading pools...
        </div>
      ) : (
        <div className="farm-list">
          {pools.map((pool) => {
            const apr = calcApr(pool);
            const allocPercent = pool.totalAllocPoint > 0
              ? (pool.allocPoint / pool.totalAllocPoint) * 100
              : 0;
            return (
              <Link key={pool.pid} to={pool.route} className="farm-list-card">
                <div className="farm-list-card__title">
                  <span className="farm-list-card__name">{pool.name}</span>
                  <span className="farm-list-card__pid">PID {pool.pid}</span>
                </div>
                <span className="farm-list-card__badge">
                  {allocPercent.toFixed(0)}% allocation
                </span>

                <div className="farm-list-card__row">
                  <span>APR</span>
                  <span>{apr > 0 ? `${apr.toFixed(2)}%` : "—"}</span>
                </div>
                <div className="farm-list-card__row">
                  <span>Daily</span>
                  <span>{(apr / 365).toFixed(3)}%</span>
                </div>
                <div className="farm-list-card__row">
                  <span>Pool emission</span>
                  <span>{pool.poolEmissionPerDay.toFixed(2)} GSHARE/day</span>
                </div>
                <div className="farm-list-card__row">
                  <span>LP staked</span>
                  <span>{parseFloat(pool.lpStaked).toFixed(4)}</span>
                </div>
                {account && parseFloat(pool.pendingReward) > 0 && (
                  <div className="farm-list-card__row farm-list-card__row--earn">
                    <span>Earned</span>
                    <span>{parseFloat(pool.pendingReward).toFixed(4)} GSHARE</span>
                  </div>
                )}

                <div className="farm-list-card__cta">View Farm →</div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Farms;
