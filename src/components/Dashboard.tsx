import React from 'react'
import { useAccount } from 'wagmi'
import BalancePanel from './BalancePanel'
import PoolPanel from './PoolPanel'

export default function Dashboard(){
  const { isConnected } = useAccount()
  return (
    <div className="container" style={{paddingTop:20}}>
      <div className="grid">
        <div>
          <div className="card">
            <h2>Dashboard</h2>
            <p>Welkom bij je Goldfinance dashboard op <strong>BSC Testnet</strong>.</p>
            {!isConnected && <p>Verbind je wallet om balances en pools te laden.</p>}
          </div>
          <BalancePanel />
          <PoolPanel />
        </div>
        <aside>
          <div className="card">
            <h3>Quick actions</h3>
            <p>Approve, Stake en Claim zijn beschikbaar wanneer je wallet verbonden is.</p>
          </div>
        </aside>
      </div>
    </div>
  )
}
