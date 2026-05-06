import React, { useEffect, useState, useCallback } from "react";
import { ethers } from "ethers";
import { useWallet, getSigner } from "../contexts/WalletContext";
import { CONTRACTS } from "../contracts/addresses";
import farmArtifact from "../contracts/abis/GoldShareFarm.json";
import erc20Artifact from "../contracts/abis/ERC20.json";

const farmAbi = (farmArtifact as any).abi;
const erc20Abi = (erc20Artifact as any).abi || erc20Artifact;

const READ_PROVIDER = new ethers.JsonRpcProvider("https://data-seed-prebsc-1-s1.binance.org:8545/");

// Test prices — replace later with oracle/DEX reads
const PRICES = {
  GSHARE: 5,
  GOLD: 0.001,
  LP_PLACEHOLDER: 5, // very rough
};

export interface PoolFarmProps {
  pid: number;
  poolName: string;          // "GoldShare / BNB"
  lpAddress: string;
  lpSymbol: string;          // "GSHARE/BNB LP"
}

const PoolFarm: React.FC<PoolFarmProps> = ({ pid, poolName, lpAddress, lpSymbol }) => {
  const { account, isCorrectNetwork } = useWallet();

  // Pool data
  const [allocPoint, setAllocPoint] = useState<number>(0);
  const [totalAllocPoint, setTotalAllocPoint] = useState<number>(1);
  const [poolEmissionPerDay, setPoolEmissionPerDay] = useState<number>(0);
  const [lpStakedTotal, setLpStakedTotal] = useState<string>("0");

  // User data
  const [walletLp, setWalletLp] = useState<string>("0");
  const [userStaked, setUserStaked] = useState<string>("0");
  const [pendingReward, setPendingReward] = useState<string>("0");
  const [allowance, setAllowance] = useState<string>("0");

  // UI state
  const [stakeAmount, setStakeAmount] = useState<string>("");
  const [withdrawAmount, setWithdrawAmount] = useState<string>("");
  const [showStakeModal, setShowStakeModal] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<{ msg: string; type: "info" | "error" | "success" } | null>(null);

  // ---------- Read data ----------
  const loadData = useCallback(async () => {
    try {
      const farm = new ethers.Contract(CONTRACTS.FARM, farmAbi, READ_PROVIDER);
      const lp = new ethers.Contract(lpAddress, erc20Abi, READ_PROVIDER);
      const now = Math.floor(Date.now() / 1000);

      const [poolInfo, totalAlloc, emissionPerSec, lpStakedRaw] = await Promise.all([
        farm.poolInfo(pid),
        farm.totalAllocPoint(),
        farm.emissionPerSecond(now),
        lp.balanceOf(CONTRACTS.FARM),
      ]);

      const alloc = Number(poolInfo.allocPoint);
      const totAlloc = Number(totalAlloc);
      const emissionNum = parseFloat(ethers.formatEther(emissionPerSec));
      const poolShare = totAlloc > 0 ? alloc / totAlloc : 0;
      const poolEmissionDay = emissionNum * poolShare * 86400;

      setAllocPoint(alloc);
      setTotalAllocPoint(totAlloc);
      setPoolEmissionPerDay(poolEmissionDay);
      setLpStakedTotal(ethers.formatEther(lpStakedRaw));

      if (account) {
        const [userInfo, pending, lpBal, allow] = await Promise.all([
          farm.userInfo(pid, account),
          farm.pendingGshare(pid, account),
          lp.balanceOf(account),
          lp.allowance(account, CONTRACTS.FARM),
        ]);
        setUserStaked(ethers.formatEther(userInfo.amount));
        setPendingReward(ethers.formatEther(pending));
        setWalletLp(ethers.formatEther(lpBal));
        setAllowance(ethers.formatEther(allow));
      } else {
        setUserStaked("0");
        setPendingReward("0");
        setWalletLp("0");
        setAllowance("0");
      }
    } catch (e) {
      console.error(`[PoolFarm pid=${pid}] load failed:`, e);
    }
  }, [pid, lpAddress, account]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 8000);
    return () => clearInterval(interval);
  }, [loadData]);

  // ---------- Helpers ----------
  const fmtNum = (s: string, dec = 4) =>
    parseFloat(s).toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });

  // APR calc
  const tvlUsd = parseFloat(lpStakedTotal) * PRICES.LP_PLACEHOLDER;
  const yearlyRewardUsd = poolEmissionPerDay * 365 * PRICES.GSHARE;
  const apr = tvlUsd > 0 ? (yearlyRewardUsd / tvlUsd) * 100 : 0;
  const dailyPercent = apr / 365;
  const allocPercent = totalAllocPoint > 0 ? (allocPoint / totalAllocPoint) * 100 : 0;

  const earnedUsd = (parseFloat(pendingReward) * PRICES.GSHARE).toFixed(2);
  const stakedUsd = (parseFloat(userStaked) * PRICES.LP_PLACEHOLDER).toFixed(2);

  const needsApproval = parseFloat(allowance) < 0.000001;
  const canInteract = account && isCorrectNetwork;

  // ---------- Actions ----------
  const handleHarvest = async () => {
    if (!canInteract) return;
    setBusy("harvest");
    setStatus({ msg: "Harvesting...", type: "info" });
    try {
      const signer = await getSigner();
      const farm = new ethers.Contract(CONTRACTS.FARM, farmAbi, signer);
      // harvest = deposit 0 (standard MasterChef pattern)
      const tx = await farm.deposit(pid, 0);
      await tx.wait();
      setStatus({ msg: "Harvested!", type: "success" });
      loadData();
    } catch (e: any) {
      setStatus({ msg: e?.shortMessage || e?.message || "Harvest failed", type: "error" });
    } finally {
      setBusy(null);
    }
  };

  const handleApprove = async () => {
    if (!canInteract) return;
    setBusy("approve");
    setStatus({ msg: `Approving ${lpSymbol}...`, type: "info" });
    try {
      const signer = await getSigner();
      const lp = new ethers.Contract(lpAddress, erc20Abi, signer);
      const tx = await lp.approve(CONTRACTS.FARM, ethers.MaxUint256);
      await tx.wait();
      setStatus({ msg: "Approved!", type: "success" });
      loadData();
    } catch (e: any) {
      setStatus({ msg: e?.shortMessage || e?.message || "Approve failed", type: "error" });
    } finally {
      setBusy(null);
    }
  };

  const handleStake = async () => {
    if (!canInteract || !stakeAmount) return;
    if (parseFloat(stakeAmount) <= 0) {
      setStatus({ msg: "Invalid amount", type: "error" });
      return;
    }
    setBusy("stake");
    setStatus({ msg: "Staking...", type: "info" });
    try {
      const signer = await getSigner();
      const farm = new ethers.Contract(CONTRACTS.FARM, farmAbi, signer);
      const tx = await farm.deposit(pid, ethers.parseEther(stakeAmount));
      await tx.wait();
      setStatus({ msg: `Staked ${stakeAmount} ${lpSymbol}!`, type: "success" });
      setStakeAmount("");
      setShowStakeModal(false);
      loadData();
    } catch (e: any) {
      setStatus({ msg: e?.shortMessage || e?.message || "Stake failed", type: "error" });
    } finally {
      setBusy(null);
    }
  };

  const handleWithdraw = async () => {
    if (!canInteract || !withdrawAmount) return;
    if (parseFloat(withdrawAmount) <= 0) {
      setStatus({ msg: "Invalid amount", type: "error" });
      return;
    }
    setBusy("withdraw");
    setStatus({ msg: "Withdrawing...", type: "info" });
    try {
      const signer = await getSigner();
      const farm = new ethers.Contract(CONTRACTS.FARM, farmAbi, signer);
      const tx = await farm.withdraw(pid, ethers.parseEther(withdrawAmount));
      await tx.wait();
      setStatus({ msg: `Withdrew ${withdrawAmount} ${lpSymbol}!`, type: "success" });
      setWithdrawAmount("");
      setShowWithdrawModal(false);
      loadData();
    } catch (e: any) {
      setStatus({ msg: e?.shortMessage || e?.message || "Withdraw failed", type: "error" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <h1 className="page-title">{poolName} Farm</h1>
      <p className="page-subtitle">Stake {lpSymbol} • Earn GoldShare continuously</p>

      <div className="gf-stat-stack">
        <div className="gf-stat-card">
          <div className="gf-stat-card__label">APR | Daily</div>
          <div className="gf-stat-card__value">
            {apr > 1e6 ? `${(apr / 1e6).toFixed(2)}M%` : `${apr.toFixed(2)}%`} | {dailyPercent.toFixed(3)}%
          </div>
          <div className="gf-stat-card__sub">
            Pool emission: {poolEmissionPerDay.toFixed(2)} GSHARE/day
          </div>
        </div>

        <div className="gf-stat-card">
          <div className="gf-stat-card__label">Pool Allocation</div>
          <div className="gf-stat-card__value gf-stat-card__value--big">
            {allocPercent.toFixed(0)}%
          </div>
          <div className="gf-stat-card__sub">
            Weight: {allocPoint} of {totalAllocPoint}
          </div>
        </div>

        <div className="gf-stat-card">
          <div className="gf-stat-card__label">Total {lpSymbol} Staked</div>
          <div className="gf-stat-card__value gf-stat-card__value--big">
            {fmtNum(lpStakedTotal)}
          </div>
        </div>
      </div>

      {/* Pool row: GSHARE Earned + LP Staked */}
      <div className="gf-pool-row">
        {/* GSHARE Earned */}
        <div className="gf-pool-card">
          <div className="gf-pool-icon">S</div>
          <div className="gf-pool-amount">{fmtNum(pendingReward)}</div>
          <div className="gf-pool-usd">≈ ${earnedUsd}</div>
          <div className="gf-pool-label">GoldShare Earned</div>
          <div className="gf-pool-actions">
            <button
              className="gf-btn gf-btn--big"
              onClick={handleHarvest}
              disabled={!canInteract || busy !== null || parseFloat(pendingReward) <= 0}
            >
              {busy === "harvest" ? "Harvesting..." : "HARVEST"}
            </button>
          </div>
        </div>

        {/* LP Staked */}
        <div className="gf-pool-card">
          <div className="gf-pool-icon">LP</div>
          <div className="gf-pool-amount">{fmtNum(userStaked)}</div>
          <div className="gf-pool-usd">≈ ${stakedUsd}</div>
          <div className="gf-pool-label">{lpSymbol} Staked</div>
          <div className="gf-pool-actions">
            <button
              className="gf-btn gf-btn--circle gf-btn--ghost"
              onClick={() => setShowWithdrawModal(true)}
              disabled={!canInteract || busy !== null || parseFloat(userStaked) <= 0}
              title="Withdraw"
            >
              −
            </button>
            <button
              className="gf-btn gf-btn--circle"
              onClick={() => {
                if (needsApproval) handleApprove();
                else setShowStakeModal(true);
              }}
              disabled={!canInteract || busy !== null}
              title={needsApproval ? "Approve first" : "Stake"}
            >
              +
            </button>
          </div>
        </div>
      </div>

      {/* Status */}
      {status && (
        <div className={`gf-status gf-status--${status.type === "info" ? "" : status.type}`}>
          {status.msg}
        </div>
      )}

      {/* Stake Modal */}
      {showStakeModal && (
        <div className="gf-modal-overlay" onClick={() => setShowStakeModal(false)}>
          <div className="gf-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="gf-modal__title">Stake {lpSymbol}</h3>
            <p className="gf-modal__sub">Wallet: {fmtNum(walletLp)} LP</p>
            <input
              className="gf-input gf-input--no-spinner"
              type="number"
              inputMode="decimal"
              placeholder="0.0"
              value={stakeAmount}
              onChange={(e) => setStakeAmount(e.target.value)}
              autoFocus
            />
            <div className="gf-modal__actions">
              <button
                className="gf-btn gf-btn--ghost"
                onClick={() => setStakeAmount(walletLp)}
              >
                MAX
              </button>
              <button
                className="gf-btn"
                onClick={handleStake}
                disabled={busy !== null || !stakeAmount}
              >
                {busy === "stake" ? "Staking..." : "Confirm Stake"}
              </button>
            </div>
            <button
              className="gf-modal__close"
              onClick={() => setShowStakeModal(false)}
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Withdraw Modal */}
      {showWithdrawModal && (
        <div className="gf-modal-overlay" onClick={() => setShowWithdrawModal(false)}>
          <div className="gf-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="gf-modal__title">Withdraw {lpSymbol}</h3>
            <p className="gf-modal__sub">Staked: {fmtNum(userStaked)} LP</p>
            <input
              className="gf-input gf-input--no-spinner"
              type="number"
              inputMode="decimal"
              placeholder="0.0"
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
              autoFocus
            />
            <div className="gf-modal__actions">
              <button
                className="gf-btn gf-btn--ghost"
                onClick={() => setWithdrawAmount(userStaked)}
              >
                MAX
              </button>
              <button
                className="gf-btn"
                onClick={handleWithdraw}
                disabled={busy !== null || !withdrawAmount}
              >
                {busy === "withdraw" ? "Withdrawing..." : "Confirm Withdraw"}
              </button>
            </div>
            <button
              className="gf-modal__close"
              onClick={() => setShowWithdrawModal(false)}
            >
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PoolFarm;
