// Framework-free wallet logic: JSON-RPC helpers, persistence and the EIP-1193
// chain handshake. Kept separate from React so it can be unit-tested with a
// mock provider (see walletCore.test.ts).
import { RPC_URL, STUDIO_CHAIN_ID } from './lexveritas'

export const CHAIN_ID = STUDIO_CHAIN_ID
export const CHAIN_ID_HEX = '0x' + CHAIN_ID.toString(16)
export const GUEST_FUNDING = '100000000000000000000' // 100 GEN, requested from the Studio faucet
const STORAGE_KEY = 'lexveritas.wallet'

export type WalletKind = 'guest' | 'injected'

export interface StoredWallet {
  kind: WalletKind
  address: string
  /** Guest wallets only: a throwaway Studio key. Never holds real value. */
  privateKey?: `0x${string}`
}

export interface Eip1193 {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
  on?: (event: string, cb: (...a: unknown[]) => void) => void
  removeListener?: (event: string, cb: (...a: unknown[]) => void) => void
}

export const STUDIO_CHAIN_PARAMS = {
  chainId: CHAIN_ID_HEX,
  chainName: 'GenLayer Studio Next',
  nativeCurrency: { name: 'GEN', symbol: 'GEN', decimals: 18 },
  rpcUrls: [RPC_URL],
}

export const injectedProvider = (): Eip1193 | undefined =>
  typeof window === 'undefined' ? undefined : (window as unknown as { ethereum?: Eip1193 }).ethereum

// Storage can throw (private mode, blocked site data); the wallet must still work without it.
export function loadWallet(): StoredWallet | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as StoredWallet) : null
  } catch {
    return null
  }
}

export function saveWallet(s: StoredWallet | null): void {
  try {
    if (s) localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* non-fatal */
  }
}

/** Raw JSON-RPC. The body is built by hand so 1e20-sized integers are sent exactly (JSON.stringify cannot encode bigint). */
export async function rpc(method: string, rawParams: string, url: string = RPC_URL): Promise<unknown> {
  const res = await fetch(url, {
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

export const errorMessage = (e: unknown): string =>
  e instanceof Error ? e.message : ((e as { message?: string })?.message ?? String(e))

/** Normalise a chain id reported by a provider ("0xf22d", "61997" or a number). */
export function parseChainId(raw: unknown): number | null {
  if (typeof raw === 'number') return raw
  if (typeof raw !== 'string' || !raw) return null
  const n = raw.startsWith('0x') ? parseInt(raw, 16) : parseInt(raw, 10)
  return Number.isFinite(n) ? n : null
}

/**
 * Put an EIP-1193 wallet on Studio Next: switch if it knows the chain, add it
 * if the wallet reports 4902 (unknown chain), rethrow anything else (for
 * example 4001, the user rejecting the prompt).
 */
export async function ensureStudioChain(eth: Eip1193): Promise<void> {
  const current = parseChainId(await eth.request({ method: 'eth_chainId' }).catch(() => null))
  if (current === CHAIN_ID) return
  try {
    await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_ID_HEX }] })
  } catch (e) {
    const code = (e as { code?: number }).code
    // MetaMask mobile wraps 4902 inside data.originalError.
    const nested = (e as { data?: { originalError?: { code?: number } } }).data?.originalError?.code
    if (code !== 4902 && nested !== 4902) throw e
    await eth.request({ method: 'wallet_addEthereumChain', params: [STUDIO_CHAIN_PARAMS] })
  }
}

/** Request accounts, then move the wallet to Studio Next. Returns the selected address. */
export async function connectInjectedProvider(eth: Eip1193): Promise<string> {
  const accounts = (await eth.request({ method: 'eth_requestAccounts' })) as string[]
  if (!accounts?.length) throw new Error('The wallet returned no accounts.')
  await ensureStudioChain(eth)
  return accounts[0]
}
