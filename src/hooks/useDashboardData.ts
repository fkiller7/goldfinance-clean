import { useCallback, useEffect, useState } from "react";
import { ethers } from "ethers";
import { getProvider } from "../utils/blockchain";
import  CONTRACTS  from "../contracts/addresses";
import BoardroomArtifact from "../contracts/abis/Boardroom.json";
import RewardPoolArtifact from "../contracts/abis/RewardPool.json";
import GoldShareArtifact from "../contracts/abis/GoldShare.json";
import GoldCoinArtifact from "../contracts/abis/GoldCoin.json";

const BoardroomABI = (BoardroomArtifact as any).abi;
const RewardPoolABI = (RewardPoolArtifact as any).abi;
const GoldShareABI = (GoldShareArtifact as any).abi;
const GoldCoinABI = (GoldCoinArtifact as any).abi;

export interface DashboardData {
  goldPrice: number;
  gsharePrice: number;
  totalStaked: number;
  totalEarned: number;
  nextEpochIn: string;
  boardroomAPR: number;
  farmsAPR: number;
  loading: boolean;
  error?: string | null;
}

const format18 = (v: bigint) => Number(ethers.formatUnits(v, 18));
const toHMS = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
};

export const useDashboardData = () => {
  const [data, setData] = useState<DashboardData>({
    goldPrice: 0,
    gsharePrice: 0,
    totalStaked: 0,
    totalEarned: 0,
    nextEpochIn: "00:00:00",
    boardroomAPR: 2000,
    farmsAPR: 2500,
    loading: true,
  });

  const fetchDashboard = useCallback(async () => {
    try {
      const provider = getProvider();
      const accounts: string[] = await provider.send("eth_requestAccounts", []);
      const user = accounts[0];
      const signer = await provider.getSigner();

      const gold = new ethers.Contract(CONTRACTS.GoldCoin, GoldCoinABI, signer);
      const gshare = new ethers.Contract(CONTRACTS.GoldShare, GoldShareABI, signer);
      const boardroom = new ethers.Contract(CONTRACTS.Boardroom, BoardroomABI, signer);
      const rewardPool = new ethers.Contract(CONTRACTS.RewardPool, RewardPoolABI, signer);

      const totalStaked = format18(await rewardPool.totalSupply().catch(() => 0n));
      const totalEarned = format18(await rewardPool.rewardDebt(user).catch(() => 0n));

      const epochDurationSec = Number(await boardroom.EPOCH_DURATION().catch(() => 6 * 3600));
      const lastEpochTime = Number(await boardroom.lastEpochTime().catch(() => 0));
      const now = Math.floor(Date.now() / 1000);
      const nextEpochIn = toHMS(Math.max(0, lastEpochTime + epochDurationSec - now));

      setData({
        goldPrice: 1,
        gsharePrice: 1,
        totalStaked,
        totalEarned,
        nextEpochIn,
        boardroomAPR: 2000,
        farmsAPR: 2500,
        loading: false,
      });
    } catch (e: any) {
      console.error("❌ useDashboardData error:", e);
      setData((prev) => ({ ...prev, loading: false, error: e.message }));
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
    const interval = setInterval(fetchDashboard, 15000);
    return () => clearInterval(interval);
  }, [fetchDashboard]);

  return { ...data, refetch: fetchDashboard };
};
