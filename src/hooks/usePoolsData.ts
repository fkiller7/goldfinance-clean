import { useEffect, useState } from "react";
import { Contract, JsonRpcProvider } from "ethers";
import BoardroomABI from "../contracts/abis/Boardroom.json";
import CONTRACTS from "../contracts/addresses";

export const usePoolsData = () => {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const rpcUrl = import.meta.env.VITE_RPC_URL;
  const boardroomAddress = CONTRACTS.Boardroom;

  useEffect(() => {
    const fetchData = async () => {
      try {
        if (!rpcUrl || !boardroomAddress) {
          throw new Error("RPC URL of Boardroom adres ontbreekt");
        }

        // ✅ ethers v6 — gebruik JsonRpcProvider, niet providers
        const provider = new JsonRpcProvider(rpcUrl);
        const boardroom = new Contract(boardroomAddress, BoardroomABI.abi, provider);

        // Roep contractfuncties op
        const [epoch, nextEpochPoint, totalSupply] = await Promise.all([
          boardroom.epoch().catch(() => 0),
          boardroom.nextEpochPoint().catch(() => 0),
          boardroom.totalSupply().catch(() => 0),
        ]);

        setData({
          epoch: Number(epoch),
          nextEpochPoint: Number(nextEpochPoint),
          totalStaked: Number(totalSupply) / 1e18,
        });
      } catch (err: any) {
        console.error("❌ usePoolsData fout:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  return { data, error, loading };
};

export default usePoolsData;
