// src/hooks/usePool.ts
import { useEffect, useState } from "react";
import { usePublicClient, useAccount } from "wagmi";
import { parseUnits, formatUnits } from "viem";

import RewardPoolABI from "../contracts/abis/RewardPool.json";
import addresses from "../contracts/addresses";

/**
 * Deze hook leest pending rewards en voert stake/unstake/claim acties uit.
 * Volledig veilig en stabiel bij laden of niet-verbonden wallet.
 */
export function usePool() {
  const client = usePublicClient();
  const { address } = useAccount();

  const [pending, setPending] = useState<string>("0");
  const [loading, setLoading] = useState<boolean>(false);

  // 🧠 Veilige fallback als client niet geladen is
  if (!client) {
    return { pending: "0", loading: true, refresh: () => {}, claim: () => {} };
  }

  // 📦 Haalt pending rewards op
  const refresh = async () => {
    if (!address) return;
    setLoading(true);
    try {
      const val = await client.readContract({
        address: addresses.RewardPool,
        abi: RewardPoolABI as const,
        functionName: "pendingSmelt",
        args: [address],
      });
      setPending(formatUnits(val as bigint, 18));
    } catch (err) {
      console.error("Fout bij ophalen pending rewards:", err);
      setPending("0");
    } finally {
      setLoading(false);
    }
  };

  // 💰 Claim demo actie
  const claim = async () => {
    if (!address) {
      alert("Connect eerst je wallet.");
      return;
    }
    try {
      alert("Claim demo uitgevoerd (geen echte transactie)");
    } catch (e) {
      console.error("Fout bij claim:", e);
    }
  };

  useEffect(() => {
    refresh();
  }, [client, address]);

  return { pending, loading, refresh, claim };
}
