import React from 'react'
import { usePendingRewards, useStakeActions } from '../hooks/usePool'
import { useAccount } from 'wagmi'

export default function PoolPanel(){
  const { isConnected } = useAccount()
  const { pending, loading } = usePendingRewards()
  const { deposit, withdraw, claim } = useStakeActions()
  return (
    <div className="card">
      <h3>Primary Pool</h3>
      <p>Pending rewards: {loading ? '...' : pending}</p>
      <div style={{display:'flex',gap:8,marginTop:8}}>
        <button className="button" onClick={() => deposit()}>Stake (demo)</button>
        <button className="button" onClick={() => withdraw()}>Unstake (demo)</button>
        <button className="button primary" onClick={() => claim()}>Claim</button>
      </div>
      {!isConnected && <p style={{marginTop:8}}>Connect wallet to send txs.</p>}
      <p style={{fontSize:12,opacity:0.7,marginTop:8}}>Let op: adressen zijn van het originele project. Als deze niet op BSC Testnet bestaan, geven calls 0 of falen — vervang ze door je eigen testnet-deploys wanneer beschikbaar.</p>
    </div>
  )
}
