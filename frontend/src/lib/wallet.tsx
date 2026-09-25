import { createAccount, generatePrivateKey } from 'genlayer-js'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { RPC_URL } from './lexveritas'

export const CHAIN_ID = 61997
const CHAIN_ID_HEX = '0x' + CHAIN_ID.toString(16)
const STORAGE_KEY = 'lexveritas.wallet'
const GUEST_FUNDING = '100000000000000000000' // 100 GEN, requested from the Studio faucet

export type WalletKind = 'guest' | 'injected'

interface Stored {
  kind: WalletKind
  address: string
  /** Guest wallets only: a throwaway Studio key. Never holds real value. */
  privateKey?: `0x${string}`
}

interface WalletState {
  kind: WalletKind | null
  address: string | null
  balance: bigint | null
  status: 'idle' | 'connecting' | 'connected' | 'error'
  error: string | null
  hasInjected: boolean
  connectGuest: () => Promise<void>
  connectInjected: () => Promise<void>
  disconnect: () => void
  refreshBalance: () => Promise<void>
}

interface Eip1193 {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
  on?: (event: string, cb: (...a: unknown[]) => void) => void
  removeListener?: (event: string, cb: (...a: unknown[]) => void) => void
}

const injected = (): Eip1193 | undefined => (window as unknown as { ethereum?: Eip1193 }).ethereum

// Storage can throw (private mode, blocked site data); the wallet must still work without it.
const load = (): Stored | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Stored) : null
  } catch {
    return null
  }
}
const save = (s: Stored | null) => {
  try {
    if (s) localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* non-fatal */
  }
}

/** Raw JSON-RPC. The body is built by hand so 1e20-sized integers are sent exactly (JSON.stringify cannot encode bigint). */
async function rpc(method: string, rawParams: string): Promise<unknown> {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: `{"jsonrpc":"2.0","id":1,"method":"${method}","params":${rawParams}}`,
  })
  const data = (await res.json()) as { result?: unknown; error?: { message?: string } }
  if (data.error) throw new Error(data.error.message ?? `${method} failed`)
  return data.result
}

export async function fetchBalance(address: string): Promise<bigint> {
  return BigInt((await rpc('eth_getBalance', JSON.stringify([address, 'latest']))) as string)
}

const Ctx = createContext<WalletState | null>(null)

export function WalletProvider({ children }: { children: ReactNode }) {
  const [stored, setStored] = useState<Stored | null>(load)
  const [balance, setBalance] = useState<bigint | null>(null)
  const [status, setStatus] = useState<WalletState['status']>(stored ? 'connected' : 'idle')
  const [error, setError] = useState<string | null>(null)

  const commit = useCallback((s: Stored | null) => {
    save(s)
    setStored(s)
    setBalance(null)
    setStatus(s ? 'connected' : 'idle')
  }, [])

  const refreshBalance = useCallback(async () => {
    if (!stored) return
    try {
      setBalance(await fetchBalance(stored.address))
    } catch {
      /* keep last known balance */
    }
  }, [stored])

  useEffect(() => {
    refreshBalance()
    if (!stored) return
    const id = setInterval(refreshBalance, 15_000)
    return () => clearInterval(id)
  }, [refreshBalance, stored])

  // Follow account switches and disconnects made inside the extension.
  useEffect(() => {
    const eth = injected()
    if (!eth?.on || stored?.kind !== 'injected') return
    const onAccounts = (...args: unknown[]) => {
      const accounts = args[0] as string[]
      commit(accounts.length ? { kind: 'injected', address: accounts[0] } : null)
    }
    eth.on('accountsChanged', onAccounts)
    return () => eth.removeListener?.('accountsChanged', onAccounts)
  }, [stored?.kind, commit])

  const connectGuest = useCallback(async () => {
    setStatus('connecting')
    setError(null)
    try {
      // Reuse this browser's guest key if there is one, so the address stays stable.
      const prior = load()
      const privateKey = prior?.kind === 'guest' && prior.privateKey ? prior.privateKey : generatePrivateKey()
      const address = createAccount(privateKey).address
      const current = await fetchBalance(address).catch(() => 0n)
      if (current === 0n) await rpc('sim_fundAccount', `["${address}", ${GUEST_FUNDING}]`)
      commit({ kind: 'guest', address, privateKey })
    } catch (e) {
      setStatus('error')
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [commit])

  const connectInjected = useCallback(async () => {
    const eth = injected()
    if (!eth) {
      setStatus('error')
      setError('No browser wallet found. Install MetaMask or use the Studio guest wallet.')
      return
    }
    setStatus('connecting')
    setError(null)
    try {
      const accounts = (await eth.request({ method: 'eth_requestAccounts' })) as string[]
      try {
        await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_ID_HEX }] })
      } catch (e) {
        if ((e as { code?: number }).code === 4902) {
          await eth.request({
            method: 'wallet_addEthereumChain',
            params: [
              {
                chainId: CHAIN_ID_HEX,
                chainName: 'GenLayer Studio Next',
                nativeCurrency: { name: 'GEN', symbol: 'GEN', decimals: 18 },
                rpcUrls: [RPC_URL],
              },
            ],
          })
        } else throw e
      }
      commit({ kind: 'injected', address: accounts[0] })
    } catch (e) {
      setStatus('error')
      setError(e instanceof Error ? e.message : (e as { message?: string }).message ?? String(e))
    }
  }, [commit])

  const disconnect = useCallback(() => {
    // The guest key is dropped too: "disconnect" should leave nothing behind.
    commit(null)
    setError(null)
  }, [commit])

  const value = useMemo<WalletState>(
    () => ({
      kind: stored?.kind ?? null,
      address: stored?.address ?? null,
      balance,
      status,
      error,
      hasInjected: typeof window !== 'undefined' && !!injected(),
      connectGuest,
      connectInjected,
      disconnect,
      refreshBalance,
    }),
    [stored, balance, status, error, connectGuest, connectInjected, disconnect, refreshBalance],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useWallet(): WalletState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useWallet must be used inside WalletProvider')
  return v
}
