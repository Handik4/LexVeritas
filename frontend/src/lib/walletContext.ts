import { createContext, useContext } from 'react'
import type { WalletKind } from './walletCore'

export interface WalletState {
  kind: WalletKind | null
  address: string | null
  balance: bigint | null
  status: 'idle' | 'connecting' | 'connected' | 'error'
  error: string | null
  hasInjected: boolean
  /** Injected wallets only: connected, but the wallet is on a chain other than Studio Next. */
  wrongNetwork: boolean
  /** Resolve true once connected, false on failure (the error is in `error`). */
  connectGuest: () => Promise<boolean>
  connectInjected: () => Promise<boolean>
  switchNetwork: () => Promise<void>
  disconnect: () => void
}

export const WalletContext = createContext<WalletState | null>(null)

export function useWallet(): WalletState {
  const v = useContext(WalletContext)
  if (!v) throw new Error('useWallet must be used inside WalletProvider')
  return v
}
