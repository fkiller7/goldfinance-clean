import { useCallback, useEffect, useState } from "react";
import { ethers } from "ethers";
import { getProvider } from "../utils/blockchain";
import  CONTRACTS  from "../contracts/addresses";
import BoardroomArtifact from "../contracts/abis/Boardroom.json";
import GoldShareArtifact from "../contracts/abis/GoldShare.json";
import GoldCoinArtifact from "../contracts/abis/GoldCoin.json";

const BoardroomABI = (BoardroomArtifact as any).abi;
const GoldShareABI = (GoldShareArtifact as any).abi;
const GoldCoinABI = (GoldCoinArtifact as any).abi;

export interface BoardroomData {
  staked: number;
  earned: number;
  printRate: number;
  epochDurationSec: number;
  lastEpochTime: number;
  allowance: number;
  gshareSymbol: string;
  goldSymbol: string;
  apr: number;
  loading: boolean;
  error?: string | null;
}

const format18 = (v: bigint) => Number(ethers.formatUnits(v, 18));

export const useBoardroomData = () => {
  const [data, setData] = useState<BoardroomData>({
    staked: 0,
    earned: 0,
    printRate: 0,
    epochDurationSec: 6 * 3600,
    lastEpochTime: 0,
    allowance: 0,
    gshareSymbol: "GSHARE",
    goldSymbol: "GOLD",
    apr: 2000,
    loading: true,
  });

  const fetchBoardroomData = useCallback(async () => {
    try {
      const provider = getProvider();
      const accounts: string[] = await provider.send("eth_requestAccounts", []);
      const user = accounts[0];
      const signer = await provider.getSigner();

      const boardroom = new ethers.Contract(CONTRACTS.Boardroom, BoardroomABI, signer);
      const gshare = new ethers.Contract(CONTRACTS.GoldShare, GoldShareABI, signer);
      const gold = new ethers.Contract(CONTRACTS.GoldCoin, GoldCoinABI, signer);

      const staked = format18(await boardroom.staked(user).catch(() => 0n));
      const earned = format18(await boardroom.rewardDebt(user).catch(() => 0n));
      const printRate = Number(await boardroom.printRate().catch(() => 0n));
      const epochDurationSec = Number(await boardroom.EPOCH_DURATION().catch(() => 6 * 3600));
      const lastEpochTime = Number(await boardroom.lastEpochTime().catch(() => 0));
      const allowance = format18(await gshare.allowance(user, CONTRACTS.Boardroom).catch(() => 0n));
      const gshareSymbol = await gshare.symbol().catch(() => "GSHARE");
      const goldSymbol = await gold.symbol().catch(() => "GOLD");

      setData({
        staked,
        earned,
        printRate,
        epochDurationSec,
        lastEpochTime,
        allowance,
        gshareSymbol,
        goldSymbol,
        apr: 2000,
        loading: false,
      });
    } catch (e: any) {
      console.error("❌ useBoardroomData error:", e);
      setData((prev) => ({ ...prev, loading: false, error: e.message }));
    }
  }, []);

  useEffect(() => {
    fetchBoardroomData();
    const interval = setInterval(fetchBoardroomData, 15000);
    return () => clearInterval(interval);
  }, [fetchBoardroomData]);

  return { ...data, refetch: fetchBoardroomData };
};
