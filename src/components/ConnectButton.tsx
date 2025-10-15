import React from 'react'
import { useAccount, useConnect, useDisconnect } from 'wagmi'
import { injected } from 'wagmi/connectors'

export default function Connect(){
  const { address, isConnected } = useAccount()
  const { connect } = useConnect({ connector: injected() })
  const { disconnect } = useDisconnect()
  return isConnected ? (
    <div style={{display:'flex',gap:8,alignItems:'center'}}>
      <div className="mono" style={{fontSize:12}}>{address}</div>
      <button className="button" onClick={() => disconnect()}>Disconnect</button>
    </div>
  ) : (
    <button className="button primary" onClick={() => connect()}>Connect Wallet</button>
  )
}
