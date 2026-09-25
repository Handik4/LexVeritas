import { useEffect, useRef, useState } from 'react'
import { formatGen, shortHex } from '../lib/lexveritas'
import { useWallet } from '../lib/wallet'
import { Modal } from './Modal'

function WalletOption({ title, detail, badge, onClick, disabled }: {
  title: string
  detail: string
  badge?: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="group w-full rounded-xl border border-white/[0.08] bg-white/[0.03] p-4 text-left transition hover:border-emerald-400/40 hover:bg-emerald-400/[0.05] disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className="flex items-center justify-between gap-3">
        <span className="font-medium text-slate-100">{title}</span>
        {badge && <span className="rounded-md bg-indigo-400/10 px-2 py-0.5 font-mono text-[10px] text-indigo-200">{badge}</span>}
      </span>
      <span className="mt-1 block text-[13px] leading-relaxed text-slate-400">{detail}</span>
    </button>
  )
}

export function ConnectWallet() {
  const w = useWallet()
  const [picker, setPicker] = useState(false)
  const [menu, setMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close the account menu on outside click.
  useEffect(() => {
    if (!menu) return
    const onDown = (e: MouseEvent) => !menuRef.current?.contains(e.target as Node) && setMenu(false)
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [menu])

  // A successful connection from the picker closes it.
  useEffect(() => {
    if (w.status === 'connected') setPicker(false)
  }, [w.status])

  if (w.address) {
    return (
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setMenu((m) => !m)}
          aria-expanded={menu}
          aria-haspopup="menu"
          className="flex items-center gap-2 rounded-xl border border-emerald-400/25 bg-emerald-400/[0.06] py-1.5 pl-2 pr-3 text-sm transition hover:border-emerald-400/45"
        >
          <span className="h-6 w-6 rounded-full bg-gradient-to-br from-emerald-400 to-indigo-500" aria-hidden />
          <span className="font-mono text-slate-100">{shortHex(w.address, 2)}</span>
          <span className="hidden font-mono text-xs text-emerald-200 sm:inline">
            {w.balance === null ? '...' : formatGen(w.balance.toString())}
          </span>
        </button>
        {menu && (
          <div role="menu" className="absolute right-0 top-full z-40 mt-2 w-72 rounded-xl border border-indigo-400/15 bg-slate-900/95 p-3 shadow-2xl backdrop-blur">
            <p className="eyebrow mb-1">{w.kind === 'guest' ? 'Studio guest wallet' : 'Browser wallet'}</p>
            <p className="break-all font-mono text-xs text-slate-300">{w.address}</p>
            <p className="mt-2 font-mono text-lg text-emerald-200">
              {w.balance === null ? 'Loading balance...' : formatGen(w.balance.toString())}
            </p>
            {w.kind === 'guest' && (
              <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                A throwaway Studio Next key kept in this browser. Test tokens only; never send real funds to it.
              </p>
            )}
            <div className="mt-3 flex gap-2">
              <button
                role="menuitem"
                onClick={() => navigator.clipboard?.writeText(w.address!).catch(() => {})}
                className="btn flex-1 border border-white/10 text-slate-200 hover:bg-white/5"
              >
                Copy
              </button>
              <button
                role="menuitem"
                onClick={() => {
                  setMenu(false)
                  w.disconnect()
                }}
                className="btn flex-1 border border-rose-400/25 text-rose-200 hover:bg-rose-400/10"
              >
                Disconnect
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  const busy = w.status === 'connecting'
  return (
    <>
      <button onClick={() => setPicker(true)} className="btn bg-emerald-500 font-semibold text-emerald-950 shadow-lg shadow-emerald-500/20 hover:bg-emerald-400">
        Connect Wallet
      </button>
      <Modal open={picker} onClose={() => setPicker(false)} eyebrow="GenLayer Studio Next · chain 61997" title="Connect a wallet">
        <div className="space-y-3">
          <WalletOption
            title="Studio Guest Wallet"
            badge="100 GEN FAUCET"
            detail="Creates a throwaway key in this browser and funds it with 100 test GEN from the Studio faucet. Nothing to install."
            onClick={w.connectGuest}
            disabled={busy}
          />
          <WalletOption
            title="Injected Web3 / MetaMask"
            detail={
              w.hasInjected
                ? 'Connects your browser wallet and adds or switches to GenLayer Studio Next (61997).'
                : 'No browser wallet detected in this browser.'
            }
            onClick={w.connectInjected}
            disabled={busy || !w.hasInjected}
          />
        </div>
        {busy && <p className="mt-4 text-sm text-slate-400" aria-live="polite">Connecting...</p>}
        {w.status === 'error' && w.error && (
          <p className="mt-4 rounded-lg border border-rose-400/20 bg-rose-400/[0.06] px-3 py-2 text-sm text-rose-200" role="alert">
            {w.error}
          </p>
        )}
      </Modal>
    </>
  )
}
