import { createAccount, generatePrivateKey } from 'genlayer-js'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { WalletContext, type WalletState } from './walletContext'
import {
  CHAIN_ID,
  GUEST_FUNDING,
  connectInjectedProvider,
  ensureStudioChain,
  errorMessage,
  fetchBalance,
  injectedProvider,
  loadWallet,
  parseChainId,
  rpc,
  saveWallet,
  type StoredWallet,
} from './walletCore'

const BALANCE_REFRESH_MS = 15_000

export function WalletProvider({ children }: { children: ReactNode }) {
  // A remembered injected session is dropped up front if the extension is gone.
  const [stored, setStored] = useState<StoredWallet | null>(() => {
    const s = loadWallet()
    return s?.kind === 'injected' && !injectedProvider() ? null : s
  })
  const [balance, setBalance] = useState<{ address: string; value: bigint } | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [chainId, setChainId] = useState<number | null>(null)

  const commit = useCallback((s: StoredWallet | null) => {
    saveWallet(s)
    setStored(s)
  }, [])

  // Live balance for the connected address, polled; stale results are dropped.
  useEffect(() => {
    if (!stored) return
    let cancelled = false
    const tick = () =>
      fetchBalance(stored.address)
        .then((value) => !cancelled && setBalance({ address: stored.address, value }))
        .catch(() => {}) // keep the last known balance through a network blip
    tick()
    const id = setInterval(tick, BALANCE_REFRESH_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [stored])

  // Injected wallets: on load, confirm the remembered account is still
  // authorised, and follow account and chain changes made in the extension.
  useEffect(() => {
    const eth = injectedProvider()
    if (stored?.kind !== 'injected' || !eth) return
    let cancelled = false
    eth
      .request({ method: 'eth_accounts' })
      .then((a) => {
        const accounts = (a as string[]).map((x) => x.toLowerCase())
        if (!cancelled && !accounts.includes(stored.address.toLowerCase())) commit(null)
      })
      .catch(() => {})
    eth
      .request({ method: 'eth_chainId' })
      .then((c) => !cancelled && setChainId(parseChainId(c)))
      .catch(() => {})
    const onAccounts = (...args: unknown[]) => {
      const accounts = args[0] as string[]
      commit(accounts.length ? { kind: 'injected', address: accounts[0] } : null)
    }
    const onChain = (...args: unknown[]) => setChainId(parseChainId(args[0]))
    eth.on?.('accountsChanged', onAccounts)
    eth.on?.('chainChanged', onChain)
    return () => {
      cancelled = true
      eth.removeListener?.('accountsChanged', onAccounts)
      eth.removeListener?.('chainChanged', onChain)
    }
  }, [stored?.kind, stored?.address, commit])

  const connectGuest = useCallback(async () => {
    setPending(true)
    setError(null)
    try {
      // Reuse this browser's guest key if there is one, so the address stays stable.
      const prior = loadWallet()
      const privateKey = prior?.kind === 'guest' && prior.privateKey ? prior.privateKey : generatePrivateKey()
      const address = createAccount(privateKey).address
      const current = await fetchBalance(address).catch(() => 0n)
      if (current === 0n) await rpc('sim_fundAccount', `["${address}", ${GUEST_FUNDING}]`)
      commit({ kind: 'guest', address, privateKey })
      return true
    } catch (e) {
      setError(`Could not create the guest wallet: ${errorMessage(e)}`)
      return false
    } finally {
      setPending(false)
    }
  }, [commit])

  const connectInjected = useCallback(async () => {
    const eth = injectedProvider()
    if (!eth) {
      setError('No browser wallet found. Install MetaMask or use the Studio guest wallet.')
      return false
    }
    setPending(true)
    setError(null)
    try {
      const address = await connectInjectedProvider(eth)
      setChainId(CHAIN_ID)
      commit({ kind: 'injected', address })
      return true
    } catch (e) {
      const code = (e as { code?: number }).code
      setError(code === 4001 ? 'Request rejected in the wallet.' : errorMessage(e))
      return false
    } finally {
      setPending(false)
    }
  }, [commit])

  const switchNetwork = useCallback(async () => {
    const eth = injectedProvider()
    if (!eth) return
    try {
      await ensureStudioChain(eth)
      setChainId(CHAIN_ID)
    } catch (e) {
      setError(errorMessage(e))
    }
  }, [])

  const disconnect = useCallback(() => {
    // The guest key is dropped too: "disconnect" should leave nothing behind.
    commit(null)
    setError(null)
    setChainId(null)
  }, [commit])

  const value = useMemo<WalletState>(() => {
    const address = stored?.address ?? null
    return {
      kind: stored?.kind ?? null,
      address,
      balance: balance && balance.address === address ? balance.value : null,
      status: pending ? 'connecting' : error ? 'error' : address ? 'connected' : 'idle',
      error,
      hasInjected: !!injectedProvider(),
      wrongNetwork: stored?.kind === 'injected' && chainId !== null && chainId !== CHAIN_ID,
      connectGuest,
      connectInjected,
      switchNetwork,
      disconnect,
    }
  }, [stored, balance, pending, error, chainId, connectGuest, connectInjected, switchNetwork, disconnect])

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
}
