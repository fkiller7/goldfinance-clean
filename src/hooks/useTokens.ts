// src/hooks/useTokens.ts
import { useEffect, useState } from "react";
import { usePublicClient, useAccount } from "wagmi";
import { formatUnits } from "viem";

import ERC20Abi from "../contracts/abis/ERC20.json";
import addresses from "../contracts/addresses";

/**
 * Deze hook leest de token balances (Goldcoin + Goldshare)
 * Veilig bij nog niet verbonden wallet.
 */
type Bal = {
  address: `0x${string}`;
  symbol: string;
  formatted: string;
};

export default function useTokens() {
  const client = usePublicClient();
  const { address } = useAccount();

  const [balances, setBalances] = useState<Bal[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // 🧠 Veilige return als client of wallet nog niet klaar is
  if (!client) {
    return { balances: [], loading: true };
  }

  const refresh = async () => {
    if (!address) {
      setBalances([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const tokens: `0x${string}`[] = [
        addresses.GOLD,
        addresses.GSHARE,
      ];

      const outs: Bal[] = [];

      for (const t of tokens) {
        try {
          const [symbol, decimals] = await Promise.all([
            client.readContract({
              address: t,
              abi: ERC20Abi as const,
              functionName: "symbol",
            }),
            client.readContract({
              address: t,
              abi: ERC20Abi as const,
              functionName: "decimals",
            }),
          ]) as [string, number];

          let balance = 0n;
          if (address) {
            balance = await client.readContract({
              address: t,
              abi: ERC20Abi as const,
              functionName: "balanceOf",
              args: [address],
            });
          }

          outs.push({
            address: t,
            symbol,
            formatted: formatUnits(balance, decimals),
          });
        } catch (e) {
          console.warn(`Kon token ${t} niet laden:`, e);
          outs.push({
            address: t,
            symbol: "N/A",
            formatted: "0",
          });
        }
      }

      setBalances(outs);
    } catch (err) {
      console.error("Fout bij laden token balances:", err);
      setBalances([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, address]);

  return { balances, loading, refresh };
}
