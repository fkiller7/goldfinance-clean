import { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getProvider } from "../utils/blockchain";
import GoldCoinAbi from "../contracts/GoldCoin.json"; // gebruik voorlopig dezelfde test-ABI
import  CONTRACTS  from "../contracts/addresses";

interface TokenInfo {
  symbol: string;
  totalSupply: number;
}

export const useTokenData = () => {
  const [data, setData] = useState<{
    goldCoin: TokenInfo | null;
    goldShare: TokenInfo | null;
  }>({
    goldCoin: null,
    goldShare: null,
  });

  useEffect(() => {
    const loadData = async () => {
      try {
        const provider = getProvider();

        // Contract instanties
        const goldCoin = new ethers.Contract(
          CONTRACTS.GOLD,
          GoldCoinAbi,
          provider
        );
        const goldShare = new ethers.Contract(
          CONTRACTS.GSHARE,
          GoldCoinAbi, // zelfde ABI-structuur (symbol, totalSupply, decimals)
          provider
        );

        // Data ophalen
        const [coinSymbol, coinSupply, coinDecimals] = await Promise.all([
          goldCoin.symbol(),
          goldCoin.totalSupply(),
          goldCoin.decimals(),
        ]);

        const [shareSymbol, shareSupply, shareDecimals] = await Promise.all([
          goldShare.symbol(),
          goldShare.totalSupply(),
          goldShare.decimals(),
        ]);

        setData({
          goldCoin: {
            symbol: coinSymbol,
            totalSupply: Number(ethers.formatUnits(coinSupply, coinDecimals)),
          },
          goldShare: {
            symbol: shareSymbol,
            totalSupply: Number(ethers.formatUnits(shareSupply, shareDecimals)),
          },
        });
      } catch (error) {
        console.error("❌ Fout bij ophalen token data:", error);
      }
    };

    loadData();
  }, []);

  return data;
};
