import { useEffect, useState } from "react";
import { Contract, ethers } from "ethers";
import CONTRACTS from "../contracts/addresses";
import ABIS from "../contracts/abis"; // als ABIS niet bestaat, zeg het

export const useContractData = (name: string) => {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const address = CONTRACTS[name]; // ✅ haal address van mapping
  const abi = ABIS[name]; // ✅ pak ABI van mapping

  useEffect(() => {
    const fetchData = async () => {
      try {
        if (!window.ethereum) throw new Error("MetaMask niet gevonden");

        const provider = new ethers.providers.Web3Provider(window.ethereum);
        const signer = provider.getSigner();

        if (!address) throw new Error(`Contractadres ontbreekt voor ${name}`);
        if (!abi) throw new Error(`ABI ontbreekt voor ${name}`);

        const contract = new Contract(address, abi, signer);

        setData(contract);
      } catch (err: any) {
        console.error("useContractData fout:", err);
        setError(err.message);
      }
    };

    fetchData();
  }, [name, address]);

  return { data, error };
};
