import React from 'react'
import Connect from './ConnectButton'

export default function Header(){
  return (
    <header className="header">
      <div className="container" style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div className="brand">Goldfinance Dashboard</div>
        <div style={{display:'flex',gap:10,alignItems:'center'}}>
          <nav>
            <a href="#" style={{marginRight:10}}>Dashboard</a>
            <a href="#" style={{marginRight:10}}>Stake</a>
          </nav>
          <Connect />
        </div>
      </div>
    </header>
  )
}
