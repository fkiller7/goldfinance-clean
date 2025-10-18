import { http, createConfig } from "wagmi";
import { mainnet, bsc, arbitrum } from "wagmi/chains";
import { createClient } from "viem";
import { QueryClient } from "@tanstack/react-query";

// 👇 Dit maakt een nieuwe wagmi-config (v2 stijl)
export const queryClient = new QueryClient();

export const config = createConfig({
  chains: [bsc, arbitrum, mainnet], // je kan later extra chains toevoegen
  transports: {
    [bsc.id]: http("https://bsc-dataseed.binance.org"),
    [arbitrum.id]: http("https://arb1.arbitrum.io/rpc"),
    [mainnet.id]: http("https://eth.llamarpc.com"),
  },
  client: createClient({
    chain: bsc,
    transport: http(),
  }),
  ssr: false, // belangrijk voor Next/Vite
});
