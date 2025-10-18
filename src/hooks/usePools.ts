import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import RewardPoolABI from "../contracts/abis/RewardPool.json";
import addresses from "../contracts/addresses";

function safeClient(client: any) {
  console.log("🧠 safeClient input:", client);

  if (!client || typeof client !== "object") {
    console.warn("⚠️ Geen walletClient gevonden — gebruik fallback");
    return { chain: { id: 56 } };
  }

  const hasChain = client?.chain && typeof client.chain.id === "number";
  if (!hasChain) {
    console.warn("⚠️ client.chain ontbreekt — voeg fallback toe");
    client.chain = { id: 56 };
  }

  console.log("✅ safeClient output:", client);
  return client;
}

export function useStakeActions() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { data: rawWalletClient } = useWalletClient();

  console.log("📡 useStakeActions init:", {
    address,
    isConnected,
    publicClientExists: !!publicClient,
    rawWalletClientType: typeof rawWalletClient,
  });

  // Veilig initieel client object
  const walletClient = safeClient(rawWalletClient);

  if (!publicClient || !walletClient) {
    console.warn("⚠️ Clients niet klaar — skip init");
    return {
      deposit: () => alert("⏳ Wallet client not ready"),
      withdraw: () => alert("⏳ Wallet client not ready"),
      claim: () => alert("⏳ Wallet client not ready"),
    };
  }

  // ================================
  // 💰 FUNCTIES
  // ================================

  async function deposit() {
    try {
      if (!isConnected) return alert("🔌 Connect je wallet eerst!");

      const tx = await walletClient.writeContract({
        address: addresses.RewardPool,
        abi: RewardPoolABI,
        functionName: "deposit",
        args: [0n, 1000000000000000000n],
        account: address,
      });

      console.log("✅ Deposit TX:", tx);
    } catch (err) {
      console.error("❌ Deposit error:", err);
    }
  }

  async function withdraw() {
    try {
      if (!isConnected) return alert("🔌 Connect je wallet eerst!");

      const tx = await walletClient.writeContract({
        address: addresses.RewardPool,
        abi: RewardPoolABI,
        functionName: "withdraw",
        args: [0n, 1000000000000000000n],
        account: address,
      });

      console.log("✅ Withdraw TX:", tx);
    } catch (err) {
      console.error("❌ Withdraw error:", err);
    }
  }

  async function claim() {
    try {
      if (!isConnected) return alert("🔌 Connect je wallet eerst!");

      const tx = await walletClient.writeContract({
        address: addresses.RewardPool,
        abi: RewardPoolABI,
        functionName: "claim",
        args: [],
        account: address,
      });

      console.log("✅ Claim TX:", tx);
    } catch (err) {
      console.error("❌ Claim error:", err);
    }
  }

  return { deposit, withdraw, claim };
}

