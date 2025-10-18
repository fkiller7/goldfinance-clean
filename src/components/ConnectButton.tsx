import React from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { injected } from "@wagmi/connectors";

export default function ConnectButton() {
  const { address, isConnected } = useAccount();
  const { connect, isPending } = useConnect({
    connector: injected(),
  });
  const { disconnect } = useDisconnect();

  if (isConnected) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <p style={{ margin: 0, fontSize: "14px" }}>
          ✅ Verbonden met:{" "}
          <span style={{ fontWeight: "bold", color: "#facc15" }}>
            {address?.slice(0, 6)}...{address?.slice(-4)}
          </span>
        </p>
        <button
          onClick={() => disconnect()}
          style={{
            backgroundColor: "#ef4444",
            border: "none",
            padding: "6px 12px",
            borderRadius: "6px",
            color: "white",
            cursor: "pointer",
          }}
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => connect()}
      disabled={isPending}
      style={{
        backgroundColor: "#22c55e",
        border: "none",
        padding: "8px 14px",
        borderRadius: "8px",
        color: "white",
        fontWeight: "bold",
        cursor: "pointer",
      }}
    >
      {isPending ? "Verbinden..." : "Verbinden met Wallet"}
    </button>
  );
}

