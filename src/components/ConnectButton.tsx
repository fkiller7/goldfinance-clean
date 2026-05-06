import React, { useState, useRef, useEffect } from "react";
import { useWallet } from "../contexts/WalletContext";

const ConnectButton: React.FC = () => {
  const { account, isConnecting, isCorrectNetwork, connect, disconnect, switchToTestnet } = useWallet();
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (!account) {
    return (
      <button className="connect-btn" onClick={connect} disabled={isConnecting}>
        {isConnecting ? "Connecting..." : "Connect Wallet"}
      </button>
    );
  }

  if (!isCorrectNetwork) {
    return (
      <button
        className="connect-btn"
        onClick={switchToTestnet}
        style={{ background: "linear-gradient(180deg, #ef4444, #b91c1c)", color: "#fff" }}
      >
        Switch to BSC Testnet
      </button>
    );
  }

  const short = `${account.slice(0, 6)}...${account.slice(-4)}`;
  const copyAddress = () => {
    navigator.clipboard.writeText(account);
    setMenuOpen(false);
  };
  const openBscScan = () => {
    window.open(`https://testnet.bscscan.com/address/${account}`, "_blank");
    setMenuOpen(false);
  };
  const handleDisconnect = () => {
    disconnect();
    setMenuOpen(false);
  };

  return (
    <div className="connect-wrap" ref={wrapRef}>
      <button
        className="connect-btn connect-btn--connected"
        onClick={() => setMenuOpen((v) => !v)}
      >
        <span className="wallet-dot" />
        {short}
      </button>

      {menuOpen && (
        <div className="wallet-menu">
          <div className="wallet-menu__address">{account}</div>
          <div className="wallet-menu__divider" />
          <button className="wallet-menu__item" onClick={copyAddress}>
            Copy address
          </button>
          <button className="wallet-menu__item" onClick={openBscScan}>
            View on BSCScan
          </button>
          <div className="wallet-menu__divider" />
          <button className="wallet-menu__item" onClick={handleDisconnect}>
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
};

export default ConnectButton;
