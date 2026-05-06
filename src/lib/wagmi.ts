import { http, createConfig } from "wagmi";
import { mainnet, arbitrum, bsc } from "wagmi/chains";
import { QueryClient } from "@tanstack/react-query";

// 🧠 Nieuwe query client voor React Query
export const queryClient = new QueryClient();

// 🌍 Wagmi-config met multi-chain support (BSC, Arbitrum, Ethereum)
export const config = createConfig({
  chains: [bsc, arbitrum, mainnet],
  transports: {
    [bsc.id]: http("https://bsc-dataseed.binance.org"),
    [arbitrum.id]: http("https://arb1.arbitrum.io/rpc"),
    [mainnet.id]: http("https://eth.llamarpc.com"),
  },
  multiInjectedProviderDiscovery: false, // voorkomt dubbele detectie van wallets
  ssr: false, // belangrijk voor Vite/React
});
