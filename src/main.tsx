import React from 'react'
import { createRoot } from 'react-dom/client'
import { WagmiConfig, createConfig } from 'wagmi'
import { bscTestnet } from 'wagmi/chains'
import { http } from 'viem'
import App from './App'
import './index.css'

const RPC_URL = import.meta.env.VITE_RPC_URL || 'https://data-seed-prebsc-1-s1.binance.org:8545/'

const config = createConfig({
  chains: [bscTestnet],
  transports: {
    [bscTestnet.id]: http(RPC_URL),
  },
  ssr: false,
})

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <WagmiConfig config={config}>
      <App />
    </WagmiConfig>
  </React.StrictMode>
)
