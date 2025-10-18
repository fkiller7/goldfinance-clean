import React from 'react'
import useTokens from "../hooks/useTokens";


export default function BalancePanel(){
  const { balances, loading } = useTokens();

  return (
    <div className="card">
      <h3>Token Balances</h3>
      {loading ? <div>Loading...</div> : (
        <ul>
          {balances.map(b => (
            <li key={b.address}><strong>{b.symbol}</strong>: {b.formatted}</li>
          ))}
        </ul>
      )}
      <p style={{fontSize:12,opacity:0.7}}>Tokens: Goldcoin (GOLD) & Goldshare (GSHARE)</p>
    </div>
  )
}
