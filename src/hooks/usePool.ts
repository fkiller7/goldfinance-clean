import { useState, useEffect } from 'react'
import { usePublicClient, useWalletClient } from 'wagmi'
import RewardPoolAbi from '../contracts/abis/RewardPool.json'
import addresses from '../contracts/addresses'
import { parseUnits, formatUnits } from 'viem'

export function usePendingRewards(){
  const client = usePublicClient()
  const [pending, setPending] = useState<string>('0')
  const [loading, setLoading] = useState<boolean>(false)

  async function refresh(){
    setLoading(true)
    try{
      const accounts = await client.getAddresses().catch(() => [] as `0x${string}`[])
      const user = accounts?.[0] ?? '0x0000000000000000000000000000000000000000'
      const val = await client.readContract({
        address: addresses.RewardPool,
        abi: RewardPoolAbi,
        functionName: 'pendingSmelt',
        args: [0n, user]
      }) as bigint
      setPending(formatUnits(val, 18))
    }catch(e){
      setPending('0')
    }finally{
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [])

  return { pending, loading, refresh }
}

export function useStakeActions(){
  const { data: wallet } = useWalletClient()

  const deposit = async () => {
    if(!wallet){ alert('Connect wallet first'); return }
    try{
      await wallet.writeContract({
        address: addresses.RewardPool,
        abi: RewardPoolAbi,
        functionName: 'deposit',
        args: [0n, parseUnits('1', 18)]
      })
      alert('Stake tx sent')
    }catch(e:any){
      alert(e?.message || 'Failed')
    }
  }

  const withdraw = async () => {
    if(!wallet){ alert('Connect wallet first'); return }
    try{
      await wallet.writeContract({
        address: addresses.RewardPool,
        abi: RewardPoolAbi,
        functionName: 'withdraw',
        args: [0n, parseUnits('0.1', 18)]
      })
      alert('Unstake tx sent')
    }catch(e:any){
      alert(e?.message || 'Failed')
    }
  }

  const claim = async () => {
    if(!wallet){ alert('Connect wallet first'); return }
    try{
      await wallet.writeContract({
        address: addresses.RewardPool,
        abi: RewardPoolAbi,
        functionName: 'deposit',
        args: [0n, 0n]
      })
      alert('Claim tx sent')
    }catch(e:any){
      alert(e?.message || 'Failed')
    }
  }

  return { deposit, withdraw, claim }
}
