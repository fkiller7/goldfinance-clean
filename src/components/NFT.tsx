import { useEffect, useState } from "react";
import { ethers } from "ethers";
import { useWallet } from "../contexts/WalletContext";
import { CONTRACTS } from "../contracts/addresses";
import nftArtifact from "../contracts/abis/GoldVaultNFTv2.json";
import goldArtifact from "../contracts/abis/GoldCoin.json";

const READ_PROVIDER = new ethers.JsonRpcProvider(
  "https://data-seed-prebsc-1-s1.binance.org:8545/"
);

const NFT_ABI = (nftArtifact as any).abi;
const GOLD_ABI = (goldArtifact as any).abi;

async function getSigner() {
  const eth = (window as any).ethereum;
  if (!eth) return null;
  const provider = new ethers.BrowserProvider(eth);
  return await provider.getSigner();
}

interface Product {
  id: number;
  name: string;
  weightMg: bigint;
  metal: number;
  active: boolean;
  totalMinted: bigint;
  totalRedeemed: bigint;
  goldNeeded: bigint;
  bnbFeeNeeded: bigint;
}

interface UserNFT {
  tokenId: bigint;
  productId: number;
  productName: string;
  weightMg: bigint;
  metal: number;
  mintedAt: bigint;
  goldBurnedAtMint: bigint;
}

export default function NFT() {
  const { account, isCorrectNetwork } = useWallet();
  const isConnected = !!account;

  const [totalActive, setTotalActive] = useState(0n);
  const [totalGoldBurnt, setTotalGoldBurnt] = useState(0n);
  const [totalMintedAll, setTotalMintedAll] = useState(0n);
  const [totalRedeemedAll, setTotalRedeemedAll] = useState(0n);

  const [products, setProducts] = useState<Product[]>([]);
  const [userNFTs, setUserNFTs] = useState<UserNFT[]>([]);
  const [goldBalance, setGoldBalance] = useState(0n);
  const [bnbBalance, setBnbBalance] = useState(0n);

  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");

  async function loadData() {
    try {
      const nft = new ethers.Contract(CONTRACTS.NFT, NFT_ABI, READ_PROVIDER);

      const [active, burnt] = await Promise.all([
        nft.totalActiveNFTs(),
        nft.totalGoldBurnt(),
      ]);
      setTotalActive(active);
      setTotalGoldBurnt(burnt);

      const count: bigint = await nft.productCount();
      const productList: Product[] = [];
      let totalMintedSum = 0n;
      let totalRedeemedSum = 0n;

      for (let i = 0; i < Number(count); i++) {
        const p = await nft.products(i);
        const quote = await nft.quoteMint(i);

        productList.push({
          id: i,
          name: p.name,
          weightMg: p.weightMg,
          metal: Number(p.metal),
          active: p.active,
          totalMinted: p.totalMinted,
          totalRedeemed: p.totalRedeemed,
          goldNeeded: quote[0],
          bnbFeeNeeded: quote[1],
        });

        totalMintedSum += p.totalMinted;
        totalRedeemedSum += p.totalRedeemed;
      }

      setProducts(productList);
      setTotalMintedAll(totalMintedSum);
      setTotalRedeemedAll(totalRedeemedSum);

      if (account) {
        const gold = new ethers.Contract(CONTRACTS.GOLD, GOLD_ABI, READ_PROVIDER);
        const bal = await gold.balanceOf(account);
        setGoldBalance(bal);

        const bnb = await READ_PROVIDER.getBalance(account);
        setBnbBalance(bnb);

        await loadUserNFTs(nft, account, productList);
      } else {
        setUserNFTs([]);
      }
    } catch (err) {
      console.error("loadData err:", err);
    }
  }

  async function loadUserNFTs(
    nft: ethers.Contract,
    userAddress: string,
    productList: Product[]
  ) {
    try {
      const ownedTokens: bigint[] = [];
      const totalActiveBig = await nft.totalActiveNFTs();
      const upperBound = Number(totalActiveBig) + 50;

      for (let i = 1; i <= upperBound; i++) {
        try {
          const owner = await nft.ownerOf(i);
          if (owner.toLowerCase() === userAddress.toLowerCase()) {
            ownedTokens.push(BigInt(i));
          }
        } catch {
          // token doesn't exist
        }
      }

      const nfts: UserNFT[] = [];
      for (let idx = 0; idx < ownedTokens.length; idx++) {
        const tokenId = ownedTokens[idx];
        const data = await nft.vaultData(tokenId);
        const product = productList[Number(data.productId)];
        nfts.push({
          tokenId,
          productId: Number(data.productId),
          productName: product?.name || "Unknown",
          weightMg: product?.weightMg || 0n,
          metal: product?.metal || 0,
          mintedAt: data.mintedAt,
          goldBurnedAtMint: data.goldBurnedAtMint,
        });
      }

      setUserNFTs(nfts);
    } catch (err) {
      console.error("loadUserNFTs err:", err);
    }
  }

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 15000);
    return () => clearInterval(interval);
  }, [account]);

  async function handleMint(product: Product) {
    if (!isConnected || !isCorrectNetwork) {
      setStatus("Connect wallet on BSC Testnet first");
      return;
    }

    if (goldBalance < product.goldNeeded) {
      setStatus(
        `Insufficient GOLD. Need ${formatGold(product.goldNeeded)}, have ${formatGold(goldBalance)}`
      );
      return;
    }

    if (bnbBalance < product.bnbFeeNeeded) {
      setStatus(`Insufficient BNB. Need ${formatBnb(product.bnbFeeNeeded)} BNB`);
      return;
    }

    setActionLoading(`mint-${product.id}`);
    setStatus("");

    try {
      const signer = await getSigner();
      if (!signer) throw new Error("No signer");

      const gold = new ethers.Contract(CONTRACTS.GOLD, GOLD_ABI, signer);
      const nft = new ethers.Contract(CONTRACTS.NFT, NFT_ABI, signer);

      const allowance: bigint = await gold.allowance(account, CONTRACTS.NFT);
      if (allowance < product.goldNeeded) {
        setStatus(`Approving GOLD for ${product.name}...`);
        const approveTx = await gold.approve(CONTRACTS.NFT, ethers.MaxUint256);
        await approveTx.wait();
      }

      setStatus(`Minting ${product.name}...`);
      const tx = await nft.mint(product.id, { value: product.bnbFeeNeeded });
      await tx.wait();

      setStatus(`✅ Minted ${product.name}!`);
      await loadData();

      setTimeout(() => setStatus(""), 5000);
    } catch (err: any) {
      console.error("mint err:", err);
      setStatus(`❌ ${err.shortMessage || err.message || "Mint failed"}`);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleRedeem(tokenId: bigint, productName: string) {
    if (!isConnected || !isCorrectNetwork) return;

    if (
      !confirm(
        `Redeem ${productName} (Token #${tokenId})?\n\nThis burns the NFT and marks it for physical delivery. You'll need to provide shipping details separately.`
      )
    ) {
      return;
    }

    setActionLoading(`redeem-${tokenId}`);
    setStatus("");

    try {
      const signer = await getSigner();
      if (!signer) throw new Error("No signer");

      const nft = new ethers.Contract(CONTRACTS.NFT, NFT_ABI, signer);

      setStatus(`Redeeming Token #${tokenId}...`);
      const tx = await nft.redeem(tokenId);
      await tx.wait();

      setStatus(`✅ Redeemed Token #${tokenId}! Contact us for delivery.`);
      await loadData();

      setTimeout(() => setStatus(""), 7000);
    } catch (err: any) {
      console.error("redeem err:", err);
      setStatus(`❌ ${err.shortMessage || err.message || "Redeem failed"}`);
    } finally {
      setActionLoading(null);
    }
  }

  function formatGold(amount: bigint): string {
    const formatted = ethers.formatEther(amount);
    const num = parseFloat(formatted);
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(2) + "M";
    if (num >= 1_000) return (num / 1_000).toFixed(1) + "K";
    return num.toFixed(2);
  }

  function formatBnb(amount: bigint): string {
    return parseFloat(ethers.formatEther(amount)).toFixed(4);
  }

  function formatWeight(mg: bigint): string {
    const num = Number(mg);
    if (num >= 31103) {
      const oz = num / 31103;
      return oz.toFixed(oz % 1 === 0 ? 0 : 2) + "oz";
    }
    return num / 1000 + "g";
  }

  const goldProducts = products.filter((p) => p.metal === 0);
  const silverProducts = products.filter((p) => p.metal === 1);

  return (
    <div className="gf-page">
      <div className="gf-page-header">
        <h1>Gold Vault NFTs</h1>
        <p>Mint physical metal-backed NFTs. Burn GOLD, claim metal.</p>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
        gap: "12px",
        marginBottom: "24px"
      }}>
        <div className="gf-stat-card">
          <div className="gf-stat-label">Total Minted</div>
          <div className="gf-stat-value">{totalMintedAll.toString()}</div>
        </div>
        <div className="gf-stat-card">
          <div className="gf-stat-label">Active</div>
          <div className="gf-stat-value">{totalActive.toString()}</div>
        </div>
        <div className="gf-stat-card">
          <div className="gf-stat-label">Redeemed</div>
          <div className="gf-stat-value">{totalRedeemedAll.toString()}</div>
        </div>
        <div className="gf-stat-card">
          <div className="gf-stat-label">GOLD Burnt</div>
          <div className="gf-stat-value">{formatGold(totalGoldBurnt)}</div>
        </div>
      </div>

      {status && (
        <div style={{
          marginBottom: "16px",
          padding: "12px",
          background: "rgba(212,175,55,0.1)",
          border: "1px solid rgba(212,175,55,0.3)",
          borderRadius: "8px",
          color: "#d4af37",
        }}>
          {status}
        </div>
      )}

      {isConnected && (
        <div className="gf-card" style={{
          marginBottom: "24px",
          padding: "16px",
          display: "flex",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "16px",
        }}>
          <div>
            <div style={{ fontSize: "12px", opacity: 0.7 }}>Your GOLD</div>
            <div style={{ fontSize: "18px", fontWeight: 600, color: "#d4af37" }}>
              {formatGold(goldBalance)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: "12px", opacity: 0.7 }}>Your BNB</div>
            <div style={{ fontSize: "18px", fontWeight: 600, color: "#d4af37" }}>
              {formatBnb(bnbBalance)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: "12px", opacity: 0.7 }}>Your NFTs</div>
            <div style={{ fontSize: "18px", fontWeight: 600, color: "#d4af37" }}>
              {userNFTs.length}
            </div>
          </div>
        </div>
      )}

      <h2 style={{ fontSize: "18px", fontWeight: 500, color: "#d4af37", marginBottom: "12px" }}>
        Gold
      </h2>
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: "16px",
        marginBottom: "32px",
      }}>
        {goldProducts.map((p) => (
          <ProductCard
            key={p.id}
            product={p}
            onMint={() => handleMint(p)}
            isLoading={actionLoading === `mint-${p.id}`}
            disabled={!isConnected || !isCorrectNetwork}
            metalColor="#d4af37"
            metalSymbol="Au"
          />
        ))}
      </div>

      <h2 style={{ fontSize: "18px", fontWeight: 500, color: "#c0c0c0", marginBottom: "12px" }}>
        Silver
      </h2>
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: "16px",
        marginBottom: "32px",
      }}>
        {silverProducts.map((p) => (
          <ProductCard
            key={p.id}
            product={p}
            onMint={() => handleMint(p)}
            isLoading={actionLoading === `mint-${p.id}`}
            disabled={!isConnected || !isCorrectNetwork}
            metalColor="#c0c0c0"
            metalSymbol="Ag"
          />
        ))}
      </div>

      <h2 style={{ fontSize: "18px", fontWeight: 500, color: "#d4af37", marginBottom: "12px" }}>
        Your Vault NFTs
      </h2>

      {!isConnected ? (
        <div className="gf-card" style={{ padding: "32px", textAlign: "center", opacity: 0.7 }}>
          Connect wallet to see your NFTs
        </div>
      ) : userNFTs.length === 0 ? (
        <div className="gf-card" style={{ padding: "32px", textAlign: "center", opacity: 0.7 }}>
          No NFTs yet. Mint above to start your vault.
        </div>
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: "16px",
        }}>
          {userNFTs.map((nft) => (
            <UserNFTCard
              key={nft.tokenId.toString()}
              nft={nft}
              onRedeem={() => handleRedeem(nft.tokenId, nft.productName)}
              isLoading={actionLoading === `redeem-${nft.tokenId}`}
              formatWeight={formatWeight}
              formatGold={formatGold}
            />
          ))}
        </div>
      )}

      <div className="gf-card" style={{
        marginTop: "32px",
        padding: "16px",
        fontSize: "13px",
        opacity: 0.8,
        lineHeight: 1.6,
      }}>
        <strong style={{ color: "#d4af37" }}>How it works:</strong> Mint = burn GOLD tokens (1%
        extra burn fee) + 3% BNB fee → treasury. Each NFT represents claim on physical metal stored
        in vault. Redeem to initiate physical delivery (KYC required for shipping).
      </div>
    </div>
  );
}

function ProductCard({
  product,
  onMint,
  isLoading,
  disabled,
  metalColor,
  metalSymbol,
}: {
  product: Product;
  onMint: () => void;
  isLoading: boolean;
  disabled: boolean;
  metalColor: string;
  metalSymbol: string;
}) {
  return (
    <div className="gf-pool-card" style={{
      padding: "20px",
      display: "flex",
      flexDirection: "column",
      gap: "12px"
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <div style={{
          width: "36px",
          height: "36px",
          borderRadius: "50%",
          background: metalColor,
          color: "#0a0908",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 600,
          fontSize: "13px",
        }}>
          {metalSymbol}
        </div>
        <div>
          <div style={{ fontWeight: 600, fontSize: "16px" }}>{product.name}</div>
          <div style={{ fontSize: "11px", opacity: 0.6 }}>
            #{product.id} · {product.totalMinted.toString()} minted
          </div>
        </div>
      </div>

      <div style={{ borderTop: "1px solid rgba(212,175,55,0.15)", paddingTop: "12px" }}>
        <div style={{ fontSize: "11px", opacity: 0.7, marginBottom: "2px" }}>Cost</div>
        <div style={{ fontSize: "15px", fontWeight: 500 }}>
          {formatGoldDisplay(product.goldNeeded)} GOLD
        </div>
        <div style={{ fontSize: "12px", opacity: 0.6 }}>
          + {parseFloat(ethers.formatEther(product.bnbFeeNeeded)).toFixed(4)} BNB fee
        </div>
      </div>

      <button
        className="gf-btn"
        onClick={onMint}
        disabled={disabled || isLoading || !product.active}
        style={{
          background: metalColor,
          color: "#0a0908",
          fontWeight: 600,
          opacity: disabled || isLoading ? 0.5 : 1,
        }}
      >
        {isLoading ? "Processing..." : !product.active ? "Inactive" : "Mint"}
      </button>
    </div>
  );
}

function UserNFTCard({
  nft,
  onRedeem,
  isLoading,
  formatWeight,
  formatGold,
}: {
  nft: UserNFT;
  onRedeem: () => void;
  isLoading: boolean;
  formatWeight: (mg: bigint) => string;
  formatGold: (g: bigint) => string;
}) {
  const isGold = nft.metal === 0;
  const color = isGold ? "#d4af37" : "#c0c0c0";
  const symbol = isGold ? "Au" : "Ag";

  const mintedDate = new Date(Number(nft.mintedAt) * 1000).toLocaleDateString();

  return (
    <div className="gf-pool-card" style={{ padding: "16px" }}>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "12px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{
            width: "32px",
            height: "32px",
            borderRadius: "50%",
            background: color,
            color: "#0a0908",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 600,
            fontSize: "12px",
          }}>
            {symbol}
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: "14px" }}>{nft.productName}</div>
            <div style={{ fontSize: "11px", opacity: 0.6 }}>Token #{nft.tokenId.toString()}</div>
          </div>
        </div>
        <div style={{
          background: color,
          color: "#0a0908",
          padding: "4px 8px",
          borderRadius: "4px",
          fontSize: "11px",
          fontWeight: 600,
        }}>
          {formatWeight(nft.weightMg)}
        </div>
      </div>

      <div style={{ fontSize: "11px", opacity: 0.7, marginBottom: "12px" }}>
        Minted: {mintedDate} · Burned: {formatGold(nft.goldBurnedAtMint)} GOLD
      </div>

      <button
        className="gf-btn"
        onClick={onRedeem}
        disabled={isLoading}
        style={{ width: "100%", fontSize: "13px" }}
      >
        {isLoading ? "Processing..." : "Request Physical Delivery"}
      </button>
    </div>
  );
}

function formatGoldDisplay(amount: bigint): string {
  const formatted = ethers.formatEther(amount);
  const num = parseFloat(formatted);
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(2) + "M";
  if (num >= 1_000) return (num / 1_000).toFixed(1) + "K";
  return num.toFixed(2);
}
