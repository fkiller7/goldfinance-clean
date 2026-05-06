import React, { useEffect, useState, useCallback } from "react";
import { ethers } from "ethers";
import { useWallet, getSigner } from "../contexts/WalletContext";
import { CONTRACTS as ADDRESSES } from "../contracts/addresses";
import boardroomArtifact from "../contracts/abis/Boardroom.json";
import goldShareArtifact from "../contracts/abis/GoldShare.json";

const boardroomAbi = (boardroomArtifact as any).abi;
const goldShareAbi = (goldShareArtifact as any).abi;

// GSHARE price (in USD) — gebruikt voor APR calc.
// TODO: vervangen met echte oracle/LP price reading later
const GSHARE_PRICE_USD = 5;
const GOLD_PRICE_USD = 0.001;

// Public RPC for read-only calls (when not connected)
const READ_PROVIDER = new ethers.JsonRpcProvider("https://data-seed-prebsc-1-s1.binance.org:8545/");

const Boardroom: React.FC = () => {
  const { account, isCorrectNetwork } = useWallet();

  // Contract state
  const [epochStart, setEpochStart] = useState<number>(0);
  const [epochDuration, setEpochDuration] = useState<number>(21600); // 6 hrs default
  const [currentEpoch, setCurrentEpoch] = useState<number>(0);
  const [secondsToNext, setSecondsToNext] = useState<number>(0);
  const [rewardPerEpochPerShare, setRewardPerEpochPerShare] = useState<string>("0");
  const [totalStaked, setTotalStaked] = useState<string>("0");
  const [withdrawLock, setWithdrawLock] = useState<number>(43200); // 12 hrs default

  // User state
  const [userStaked, setUserStaked] = useState<string>("0");
  const [pendingReward, setPendingReward] = useState<string>("0");
  const [walletGshare, setWalletGshare] = useState<string>("0");
  const [allowance, setAllowance] = useState<string>("0");
  const [nextWithdrawAt, setNextWithdrawAt] = useState<number>(0);

  // Live clock for countdown
  const [now, setNow] = useState<number>(Math.floor(Date.now() / 1000));

  // UI state
  const [stakeAmount, setStakeAmount] = useState<string>("");
  const [withdrawAmount, setWithdrawAmount] = useState<string>("");
  const [showStakeModal, setShowStakeModal] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<{ msg: string; type: "info" | "error" | "success" } | null>(null);

  // ---------- Read contract data ----------
  const loadData = useCallback(async () => {
    try {
      const provider = READ_PROVIDER;
      const boardroom = new ethers.Contract(ADDRESSES.Boardroom, boardroomAbi, provider);
      const gshare = new ethers.Contract(ADDRESSES.GoldShare, goldShareAbi, provider);

      // Static (epoch config)
      const [es, ed, rpe, ts, wl] = await Promise.all([
        boardroom.epochStart(),
        boardroom.EPOCH_DURATION(),
        boardroom.rewardPerEpochPerShare(),
        boardroom.totalStaked(),
        boardroom.WITHDRAW_LOCK(),
      ]);

      setEpochStart(Number(es));
      setEpochDuration(Number(ed));
      setRewardPerEpochPerShare(ethers.formatEther(rpe));
      setTotalStaked(ethers.formatEther(ts));
      setWithdrawLock(Number(wl));

      // User-specific (only if connected)
      if (account) {
        const [userInfo, pending, gshareBal, allow] = await Promise.all([
          boardroom.users(account),
          boardroom.pendingReward(account),
          gshare.balanceOf(account),
          gshare.allowance(account, ADDRESSES.Boardroom),
        ]);
        setUserStaked(ethers.formatEther(userInfo.staked));
        setNextWithdrawAt(Number(userInfo.nextWithdrawAllowed));
        setPendingReward(ethers.formatEther(pending));
        setWalletGshare(ethers.formatEther(gshareBal));
        setAllowance(ethers.formatEther(allow));
      } else {
        setUserStaked("0");
        setPendingReward("0");
        setWalletGshare("0");
        setAllowance("0");
        setNextWithdrawAt(0);
      }
    } catch (e) {
      console.error("[Boardroom] load failed:", e);
    }
  }, [account]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 8000); // refresh every 8s
    return () => clearInterval(interval);
  }, [loadData]);

  // ---------- Live epoch + countdown ticker ----------
  useEffect(() => {
    if (!epochStart || !epochDuration) return;
    const tick = () => {
      const tNow = Math.floor(Date.now() / 1000);
      const elapsed = Math.max(0, tNow - epochStart);
      const epoch = Math.floor(elapsed / epochDuration);
      const next = (epoch + 1) * epochDuration;
      const left = Math.max(0, epochStart + next - tNow);
      setCurrentEpoch(epoch);
      setSecondsToNext(left);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [epochStart, epochDuration]);

  // ---------- Live clock for withdraw lock countdown ----------
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Math.floor(Date.now() / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // ---------- Helpers ----------
  const fmtTime = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  };

  const fmtLockTime = (s: number) => {
    if (s <= 0) return "";
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${sec}s`;
    return `${sec}s`;
  };

  const fmtNum = (s: string, dec = 4) =>
    parseFloat(s).toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });

  const fmtNumShort = (s: string) =>
    parseFloat(s).toLocaleString("en-US", { maximumFractionDigits: 0 });

  // APR calculation: (4 epochs/day * 365 * rewardPerShare * goldPrice) / gsharePrice
  const aprPercent = (() => {
    const rps = parseFloat(rewardPerEpochPerShare);
    if (!rps) return 0;
    const epochsPerYear = (365 * 24 * 3600) / epochDuration;
    const goldPerSharePerYear = rps * epochsPerYear;
    const usdPerSharePerYear = goldPerSharePerYear * GOLD_PRICE_USD;
    return (usdPerSharePerYear / GSHARE_PRICE_USD) * 100;
  })();
  const dailyPercent = aprPercent / 365;

  const earnedUsd = (parseFloat(pendingReward) * GOLD_PRICE_USD).toFixed(2);
  const stakedUsd = (parseFloat(userStaked) * GSHARE_PRICE_USD).toFixed(2);

  // Withdraw lock state
  const isLocked = nextWithdrawAt > 0 && now < nextWithdrawAt;
  const lockSecondsLeft = Math.max(0, nextWithdrawAt - now);
  const hasStake = parseFloat(userStaked) > 0;

  // ---------- Actions ----------
  const handleClaim = async () => {
    if (!account || !isCorrectNetwork) return;
    setBusy("claim");
    setStatus({ msg: "Claiming rewards...", type: "info" });
    try {
      const signer = await getSigner();
      const boardroom = new ethers.Contract(ADDRESSES.Boardroom, boardroomAbi, signer);
      const tx = await boardroom.claim();
      setStatus({ msg: "Transaction sent, waiting...", type: "info" });
      await tx.wait();
      setStatus({ msg: "Rewards claimed!", type: "success" });
      loadData();
    } catch (e: any) {
      setStatus({ msg: e?.shortMessage || e?.message || "Claim failed", type: "error" });
    } finally {
      setBusy(null);
    }
  };

  const handleApprove = async () => {
    if (!account || !isCorrectNetwork) return;
    setBusy("approve");
    setStatus({ msg: "Approving GoldShare...", type: "info" });
    try {
      const signer = await getSigner();
      const gshare = new ethers.Contract(ADDRESSES.GoldShare, goldShareAbi, signer);
      const tx = await gshare.approve(ADDRESSES.Boardroom, ethers.MaxUint256);
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
    if (!account || !isCorrectNetwork || !stakeAmount) return;
    const amt = parseFloat(stakeAmount);
    if (isNaN(amt) || amt <= 0) {
      setStatus({ msg: "Invalid amount", type: "error" });
      return;
    }
    setBusy("stake");
    setStatus({ msg: "Staking...", type: "info" });
    try {
      const signer = await getSigner();
      const boardroom = new ethers.Contract(ADDRESSES.Boardroom, boardroomAbi, signer);
      const tx = await boardroom.deposit(ethers.parseEther(stakeAmount));
      await tx.wait();
      setStatus({ msg: `Staked ${stakeAmount} GSHARE!`, type: "success" });
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
    if (!account || !isCorrectNetwork || !withdrawAmount) return;
    if (isLocked) {
      setStatus({ msg: `Locked for ${fmtLockTime(lockSecondsLeft)}`, type: "error" });
      return;
    }
    const amt = parseFloat(withdrawAmount);
    if (isNaN(amt) || amt <= 0) {
      setStatus({ msg: "Invalid amount", type: "error" });
      return;
    }
    setBusy("withdraw");
    setStatus({ msg: "Withdrawing...", type: "info" });
    try {
      const signer = await getSigner();
      const boardroom = new ethers.Contract(ADDRESSES.Boardroom, boardroomAbi, signer);
      const tx = await boardroom.withdraw(ethers.parseEther(withdrawAmount));
      await tx.wait();
      setStatus({ msg: `Withdrew ${withdrawAmount} GSHARE!`, type: "success" });
      setWithdrawAmount("");
      setShowWithdrawModal(false);
      loadData();
    } catch (e: any) {
      setStatus({ msg: e?.shortMessage || e?.message || "Withdraw failed", type: "error" });
    } finally {
      setBusy(null);
    }
  };

  const handlePoke = async () => {
    if (!account || !isCorrectNetwork) return;
    setBusy("poke");
    setStatus({ msg: "Triggering epoch update...", type: "info" });
    try {
      const signer = await getSigner();
      const boardroom = new ethers.Contract(ADDRESSES.Boardroom, boardroomAbi, signer);
      const tx = await boardroom.poke();
      await tx.wait();
      setStatus({ msg: "Epoch updated!", type: "success" });
      loadData();
    } catch (e: any) {
      setStatus({ msg: e?.shortMessage || e?.message || "Poke failed", type: "error" });
    } finally {
      setBusy(null);
    }
  };

  const needsApproval = parseFloat(allowance) < 0.000001;
  const canInteract = account && isCorrectNetwork;

  return (
    <div>
      <h1 className="page-title">Boardroom</h1>
      <p className="page-subtitle">Stake GoldShare. Earn GoldCoin every epoch.</p>

      {/* Stat stack: Next Epoch, Current Epoch, APR, Total Staked */}
      <div className="gf-stat-stack">
        <div className="gf-stat-card">
          <div className="gf-stat-card__label">Next Epoch</div>
          <div className="gf-stat-card__value gf-stat-card__value--big">{fmtTime(secondsToNext)}</div>
        </div>

        <div className="gf-stat-card">
          <div className="gf-stat-card__label">Current Epoch</div>
          <div className="gf-stat-card__value gf-stat-card__value--big">{currentEpoch}</div>
        </div>

        <div className="gf-stat-card">
          <div className="gf-stat-card__label">APR | Daily</div>
          <div className="gf-stat-card__value">
            {aprPercent.toFixed(2)}% | {dailyPercent.toFixed(2)}%
          </div>
          <div className="gf-stat-card__sub">
            GoldCoin per GoldShare ~ {parseFloat(rewardPerEpochPerShare).toFixed(4)}
          </div>
        </div>

        <div className="gf-stat-card">
          <div className="gf-stat-card__label">GoldShare Staked (Total)</div>
          <div className="gf-stat-card__value gf-stat-card__value--big">
            {fmtNumShort(totalStaked)}
          </div>
        </div>
      </div>

      {/* Kick Infinite Printer button */}
      <button
        className="gf-printer-btn"
        onClick={handlePoke}
        disabled={!canInteract || busy !== null || secondsToNext > 0}
        title={secondsToNext > 0 ? "Wait until timer expires" : ""}
      >
        {busy === "poke" ? "Triggering..." : "Kick Infinite Printer When Timer Expires"}
      </button>

      {/* Pool row: GoldCoin Earned + GoldShare Staked */}
      <div className="gf-pool-row">
        {/* GOLD Earned */}
        <div className="gf-pool-card">
          <div className="gf-pool-icon">G</div>
          <div className="gf-pool-amount">{fmtNum(pendingReward)}</div>
          <div className="gf-pool-usd">≈ ${earnedUsd}</div>
          <div className="gf-pool-label">GoldCoin Earned</div>
          <div className="gf-pool-actions">
            <button
              className="gf-btn gf-btn--big"
              onClick={handleClaim}
              disabled={!canInteract || busy !== null || parseFloat(pendingReward) <= 0}
            >
              {busy === "claim" ? "Claiming..." : "CLAIM REWARD"}
            </button>
          </div>
        </div>

        {/* GSHARE Staked */}
        <div className="gf-pool-card">
          <div className="gf-pool-icon">S</div>
          <div className="gf-pool-amount">{fmtNum(userStaked)}</div>
          <div className="gf-pool-usd">≈ ${stakedUsd}</div>
          <div className="gf-pool-label">GoldShare Staked</div>

          {/* Withdraw lock indicator */}
          {hasStake && (
            <div style={{
              marginTop: "8px",
              fontSize: "12px",
              fontWeight: 600,
              color: isLocked ? "#ff9500" : "#4ade80",
              textAlign: "center",
            }}>
              {isLocked
                ? `🔒 Withdraw unlocks in ${fmtLockTime(lockSecondsLeft)}`
                : "✅ Withdraw available"}
            </div>
          )}

          <div className="gf-pool-actions">
            <button
              className="gf-btn gf-btn--circle gf-btn--ghost"
              onClick={() => setShowWithdrawModal(true)}
              disabled={!canInteract || busy !== null || !hasStake || isLocked}
              title={isLocked ? `Locked for ${fmtLockTime(lockSecondsLeft)}` : "Withdraw"}
            >
              −
            </button>
            <button
              className="gf-btn gf-btn--circle"
              onClick={() => {
                if (needsApproval) {
                  handleApprove();
                } else {
                  setShowStakeModal(true);
                }
              }}
              disabled={!canInteract || busy !== null}
              title={needsApproval ? "Approve first" : "Stake"}
            >
              +
            </button>
          </div>
        </div>
      </div>

      {/* Status toast */}
      {status && (
        <div className={`gf-status gf-status--${status.type === "info" ? "" : status.type}`}>
          {status.msg}
        </div>
      )}

      {/* Stake modal */}
      {showStakeModal && (
        <div className="gf-modal-overlay" onClick={() => setShowStakeModal(false)}>
          <div className="gf-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="gf-modal__title">Stake GoldShare</h3>
            <p className="gf-modal__sub">Wallet: {fmtNum(walletGshare)} GSHARE</p>
            <p style={{ fontSize: "12px", opacity: 0.7, margin: "0 0 12px" }}>
              Note: 12-hour withdraw lock applies after staking.
            </p>
            <input
              className="gf-input"
              type="number"
              placeholder="0.0"
              value={stakeAmount}
              onChange={(e) => setStakeAmount(e.target.value)}
              autoFocus
            />
            <div className="gf-modal__actions">
              <button
                className="gf-btn gf-btn--ghost"
                onClick={() => setStakeAmount(walletGshare)}
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

      {/* Withdraw modal */}
      {showWithdrawModal && (
        <div className="gf-modal-overlay" onClick={() => setShowWithdrawModal(false)}>
          <div className="gf-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="gf-modal__title">Withdraw GoldShare</h3>
            <p className="gf-modal__sub">Staked: {fmtNum(userStaked)} GSHARE</p>
            {isLocked && (
              <p style={{ 
                fontSize: "13px", 
                color: "#ff9500", 
                fontWeight: 600,
                margin: "8px 0",
              }}>
                🔒 Locked for {fmtLockTime(lockSecondsLeft)}
              </p>
            )}
            <input
              className="gf-input"
              type="number"
              placeholder="0.0"
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
              autoFocus
              disabled={isLocked}
            />
            <div className="gf-modal__actions">
              <button
                className="gf-btn gf-btn--ghost"
                onClick={() => setWithdrawAmount(userStaked)}
                disabled={isLocked}
              >
                MAX
              </button>
              <button
                className="gf-btn"
                onClick={handleWithdraw}
                disabled={busy !== null || !withdrawAmount || isLocked}
              >
                {busy === "withdraw" 
                  ? "Withdrawing..." 
                  : isLocked 
                    ? `🔒 ${fmtLockTime(lockSecondsLeft)}`
                    : "Confirm Withdraw"}
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

export default Boardroom;
