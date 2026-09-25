import { useState } from 'react'
import { Wordmark } from './Brand'
import { ConnectWallet } from './ConnectWallet'

export function NetworkBadge({ online }: { online: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs text-slate-300"
      title={online ? 'RPC reachable' : 'RPC unreachable'}
    >
      <span className="relative flex h-2 w-2" aria-hidden>
        {online && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${online ? 'bg-emerald-400' : 'bg-rose-400'}`} />
      </span>
      <span className="whitespace-nowrap">GenLayer Studio Next <span className="font-mono text-slate-500">(61997)</span></span>
    </span>
  )
}

const LINKS = [
  { href: '#disputes', label: 'Active Disputes' },
  { href: '#simulator', label: 'Dry-Run Simulator' },
]

export function Navbar({ online, onAbout }: { online: boolean; onAbout: () => void }) {
  const [open, setOpen] = useState(false)
  const linkClass = 'rounded-lg px-3 py-2 text-sm text-slate-300 transition hover:bg-white/5 hover:text-white'

  return (
    <nav className="sticky top-0 z-30 border-b border-indigo-400/10 bg-zinc-950/70 backdrop-blur-xl" aria-label="Main">
      <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <a href="#top" className="shrink-0" aria-label="LexVeritas home">
          <Wordmark />
        </a>

        <div className="hidden items-center gap-1 lg:flex">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} className={linkClass}>
              {l.label}
            </a>
          ))}
          <button onClick={onAbout} className={linkClass}>
            Protocol Specs &amp; About
          </button>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <span className="hidden md:inline-flex">
            <NetworkBadge online={online} />
          </span>
          <ConnectWallet />
          <button
            className="rounded-lg p-2 text-slate-300 hover:bg-white/5 lg:hidden"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label="Menu"
          >
            <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
              {open ? <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" /> : <path d="M3 6h14M3 10h14M3 14h14" strokeLinecap="round" />}
            </svg>
          </button>
        </div>
      </div>

      {open && (
        <div id="mobile-nav" className="border-t border-white/[0.06] px-4 pb-4 pt-2 lg:hidden">
          <div className="flex flex-col">
            {LINKS.map((l) => (
              <a key={l.href} href={l.href} className={linkClass} onClick={() => setOpen(false)}>
                {l.label}
              </a>
            ))}
            <button
              onClick={() => {
                setOpen(false)
                onAbout()
              }}
              className={`${linkClass} text-left`}
            >
              Protocol Specs &amp; About
            </button>
            <span className="mt-2 md:hidden">
              <NetworkBadge online={online} />
            </span>
          </div>
        </div>
      )}
    </nav>
  )
}
