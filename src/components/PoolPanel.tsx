import React from "react";
import { useAccount } from "wagmi";
import { usePool } from "../hooks/usePool";
import { useStakeActions } from "../hooks/usePools";

export default function PoolPanel() {
  const { isConnected } = useAccount();
  const { pending, loading, refresh, claim: claimPool } = usePool();
  const { deposit, withdraw, claim } = useStakeActions();

  // ✅ Veiligheidscheck: voorkom crash als walletClient nog niet klaar is
  if (!deposit || !withdraw || !claim) {
    console.warn("⚠️ Wallet client not ready yet (PoolPanel)");
    return (
      <div
        style={{
          color: "white",
          textAlign: "center",
          marginTop: "2rem",
          opacity: 0.8,
        }}
      >
        Loading wallet...
      </div>
    );
  }

  return (
    <div className="card">
      <h3>Primary Pool</h3>
      <p>Pending rewards: {loading ? "…" : pending}</p>

      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button className="button" onClick={deposit}>
          Stake (demo)
        </button>
        <button className="button" onClick={withdraw}>
          Unstake (demo)
        </button>
        <button className="button_primary" onClick={claimPool}>
          Claim (demo)
        </button>
      </div>

      {!isConnected && (
        <p style={{ marginTop: 8 }}>🔌 Connect wallet to send transactions.</p>
      )}

      <p style={{ fontSize: 12, opacity: 0.7, marginTop: 8 }}>
        ⚠️ Let op: adressen zijn voor demo-doeleinden.
      </p>
    </div>
  );
}

