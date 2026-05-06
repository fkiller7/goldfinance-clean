import React, { useEffect, useState, useCallback } from "react";
import { ethers } from "ethers";
import { useWallet } from "../contexts/WalletContext";
import CONTRACTS from "../contracts/addresses";
import GoldCoinArtifact from "../contracts/abis/GoldCoin.json";
import GoldShareArtifact from "../contracts/abis/GoldShare.json";
import BoardroomArtifact from "../contracts/abis/Boardroom.json";
import erc20Artifact from "../contracts/abis/ERC20.json";

const goldAbi = (GoldCoinArtifact as any).abi;
const gshareAbi = (GoldShareArtifact as any).abi;
const boardroomAbi = (BoardroomArtifact as any).abi;
const erc20Abi = (erc20Artifact as any).abi || erc20Artifact;

const READ_PROVIDER = new ethers.JsonRpcProvider(
  "https://data-seed-prebsc-1-s1.binance.org:8545/"
);

// Test prices — replace with oracle/DEX read on mainnet
const PRICES = {
  GSHARE: 5,
  GOLD: 0.001,
  LP_PLACEHOLDER: 5,
};

const GOLD_MAX_SUPPLY = 21_000_000_000;  // 21B
const GSHARE_MAX_SUPPLY = 350_000;        // V2 cap

const Dashboard: React.FC = () => {
  const { account } = useWallet();
  const [stats, setStats] = useState({
    goldSupply: "...",
    gshareSupply: "...",
    goldBalance: "0",
    gshareBalance: "0",
    tvl: "...",
    loading: true,
    error: null as string | null,
  });

  const fmt = (val: bigint, dec = 2) =>
    parseFloat(ethers.formatUnits(val, 18)).toLocaleString("en-US", {
      maximumFractionDigits: dec,
    });

  const fetchData = useCallback(async () => {
    try {
      const provider = READ_PROVIDER;
      const gold = new ethers.Contract(CONTRACTS.GoldCoin, goldAbi, provider);
      const gshare = new ethers.Contract(CONTRACTS.GoldShare, gshareAbi, provider);
      const boardroom = new ethers.Contract(CONTRACTS.BOARDROOM, boardroomAbi, provider);
      const lpGshareBnb = new ethers.Contract(CONTRACTS.LP_GSHARE_BNB, erc20Abi, provider);
      const lpGoldBnb = new ethers.Contract(CONTRACTS.LP_GOLD_BNB, erc20Abi, provider);
      const lpGoldGshare = new ethers.Contract(CONTRACTS.LP_GOLD_GSHARE, erc20Abi, provider);

      const [
        goldSupply,
        gshareSupply,
        boardroomStaked,
        lpGshareBnbStaked,
        lpGoldBnbStaked,
        lpGoldGshareStaked,
      ] = await Promise.all([
        gold.totalSupply(),
        gshare.totalSupply(),
        boardroom.totalStaked(),
        lpGshareBnb.balanceOf(CONTRACTS.FARM),
        lpGoldBnb.balanceOf(CONTRACTS.FARM),
        lpGoldGshare.balanceOf(CONTRACTS.FARM),
      ]);

      // TVL: boardroom GSHARE × $5 + LP totals × $5 placeholder
      const boardroomUsd = parseFloat(ethers.formatEther(boardroomStaked)) * PRICES.GSHARE;
      const lpUsd =
        (parseFloat(ethers.formatEther(lpGshareBnbStaked)) +
          parseFloat(ethers.formatEther(lpGoldBnbStaked)) +
          parseFloat(ethers.formatEther(lpGoldGshareStaked))) *
        PRICES.LP_PLACEHOLDER;
      const totalTvl = boardroomUsd + lpUsd;

      let goldBalance = "0";
      let gshareBalance = "0";
      if (account) {
        const [gb, gsb] = await Promise.all([
          gold.balanceOf(account),
          gshare.balanceOf(account),
        ]);
        goldBalance = fmt(gb);
        gshareBalance = fmt(gsb);
      }

      setStats({
        goldSupply: fmt(goldSupply, 0),
        gshareSupply: fmt(gshareSupply, 2),
        goldBalance,
        gshareBalance,
        tvl: "$" + totalTvl.toLocaleString("en-US", { maximumFractionDigits: 2 }),
        loading: false,
        error: null,
      });
    } catch (e: any) {
      console.error("[Dashboard] load failed:", e);
      setStats((prev) => ({ ...prev, loading: false, error: e.message }));
    }
  }, [account]);

  useEffect(() => {
    fetchData();
    const iv = setInterval(fetchData, 15000);
    return () => clearInterval(iv);
  }, [fetchData]);

  const card: React.CSSProperties = {
    background: "rgba(20,16,0,0.75)",
    border: "1px solid rgba(243,186,47,0.3)",
    borderRadius: 14,
    padding: "22px 24px",
    backdropFilter: "blur(14px)",
    display: "flex",
    flexDirection: "column",
    gap: 12,
  };
  const row: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 15,
  };

  return (
    <div
      style={{
        position: "relative",
        zIndex: 1,
        padding: "32px 24px 80px",
        maxWidth: 680,
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: 20,
      }}
    >
      {/* TVL */}
      <div style={{ ...card, textAlign: "center", boxShadow: "0 0 40px rgba(243,186,47,0.08)" }}>
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.55)", letterSpacing: 1 }}>
          Total Value Locked
        </div>
        <div style={{ fontSize: 42, fontWeight: 700, color: "#f3ba2f" }}>{stats.tvl}</div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>
          Boardroom + LP Farms
        </div>
      </div>

      {/* GoldCoin */}
      <div style={card}>
        <div style={{ fontSize: 18, fontWeight: 700, color: "#f3ba2f" }}>GoldCoin</div>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#f87171", letterSpacing: 1 }}>
          SELL TAX: 10%
        </div>
        <div style={row}>
          <span style={{ color: "rgba(255,255,255,0.5)" }}>Current Price:</span>
          <span style={{ fontWeight: 600 }}>${PRICES.GOLD.toFixed(4)} <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>(testnet)</span></span>
        </div>
        <div style={row}>
          <span style={{ color: "rgba(255,255,255,0.5)" }}>Total Supply:</span>
          <span style={{ fontWeight: 600 }}>{stats.goldSupply} GOLD</span>
        </div>
        <div style={row}>
          <span style={{ color: "rgba(255,255,255,0.5)" }}>Max Supply:</span>
          <span style={{ fontWeight: 600 }}>21,000,000,000 GOLD</span>
        </div>
        <div style={row}>
          <span style={{ color: "rgba(255,255,255,0.5)" }}>Your Balance:</span>
          <span style={{ fontWeight: 600 }}>{stats.goldBalance} GOLD</span>
        </div>
      </div>

      {/* GoldShare */}
      <div style={card}>
        <div style={{ fontSize: 18, fontWeight: 700, color: "#f3ba2f" }}>GoldShare</div>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#fbbf24", letterSpacing: 1 }}>
          HOT START ACTIVE
        </div>
        <div style={row}>
          <span style={{ color: "rgba(255,255,255,0.5)" }}>Price:</span>
          <span style={{ fontWeight: 600 }}>${PRICES.GSHARE.toFixed(2)} <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>(testnet)</span></span>
        </div>
        <div style={row}>
          <span style={{ color: "rgba(255,255,255,0.5)" }}>Total Supply:</span>
          <span style={{ fontWeight: 600 }}>{stats.gshareSupply} GSHARE</span>
        </div>
        <div style={row}>
          <span style={{ color: "rgba(255,255,255,0.5)" }}>Max Supply:</span>
          <span style={{ fontWeight: 600 }}>{GSHARE_MAX_SUPPLY.toLocaleString()} GSHARE</span>
        </div>
        <div style={row}>
          <span style={{ color: "rgba(255,255,255,0.5)" }}>Your Balance:</span>
          <span style={{ fontWeight: 600 }}>{stats.gshareBalance} GSHARE</span>
        </div>
      </div>

      {/* Protocol */}
      <div style={card}>
        <div style={{ fontSize: 18, fontWeight: 700, color: "#f3ba2f" }}>Protocol</div>
        <div style={row}>
          <span style={{ color: "rgba(255,255,255,0.5)" }}>Emission Period:</span>
          <span style={{ fontWeight: 600 }}>20 years</span>
        </div>
        <div style={row}>
          <span style={{ color: "rgba(255,255,255,0.5)" }}>Hot Start Bonus:</span>
          <span style={{ fontWeight: 600, color: "#4ade80" }}>First 30 days</span>
        </div>
        <div style={row}>
          <span style={{ color: "rgba(255,255,255,0.5)" }}>Boardroom Epoch:</span>
          <span style={{ fontWeight: 600 }}>6 hours</span>
        </div>
        <div style={row}>
          <span style={{ color: "rgba(255,255,255,0.5)" }}>Sell Tax:</span>
          <span style={{ fontWeight: 600 }}>10% → buyback &amp; burn</span>
        </div>
        <div style={row}>
          <span style={{ color: "rgba(255,255,255,0.5)" }}>Network:</span>
          <span style={{ fontWeight: 600 }}>BSC Testnet</span>
        </div>
      </div>

      {stats.error && (
        <div
          style={{
            background: "rgba(220,38,38,0.15)",
            border: "1px solid rgba(220,38,38,0.4)",
            borderRadius: 10,
            padding: "12px 16px",
            fontSize: 13,
            color: "#f87171",
          }}
        >
          ⚠️ {stats.error}
        </div>
      )}
    </div>
  );
};

export default Dashboard;
