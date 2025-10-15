import { useState, useEffect } from 'react'
import { usePublicClient, useAccount } from 'wagmi'
import ERC20Abi from '../contracts/abis/ERC20.json'
import addresses from '../contracts/addresses'
import { formatUnits } from 'viem'

type Bal = { address: `0x${string}`; symbol: string; formatted: string }

export function useTokenBalances(){
  const client = usePublicClient()
  const { address } = useAccount()
  const [balances, setBalances] = useState<Bal[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function run(){
      setLoading(true)
      try{
        const tokens: `0x${string}`[] = [addresses.GOLD, addresses.GSHARE]
        const outs: Bal[] = []
        for(const t of tokens){
          try{
            const [symbol, decimals] = await Promise.all([
              client.readContract({ address: t, abi: ERC20Abi, functionName: 'symbol' }),
              client.readContract({ address: t, abi: ERC20Abi, functionName: 'decimals' })
            ]) as [string, number]
            let bal = 0n
            if(address){
              bal = await client.readContract({ address: t, abi: ERC20Abi, functionName: 'balanceOf', args: [address] }) as bigint
            }
            outs.push({ address: t, symbol, formatted: formatUnits(bal, decimals) })
          }catch(e){
            outs.push({ address: t, symbol: t.slice(0,6), formatted: 'n/a' })
          }
        }
        if(!cancelled) setBalances(outs)
      } finally {
        if(!cancelled) setLoading(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [client, address])

  return { balances, loading }
}
