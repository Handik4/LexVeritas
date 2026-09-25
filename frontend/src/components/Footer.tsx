import type { ReactNode } from 'react'
import { CONTRACT_ADDRESS, EXPLORER_URL, REPO_URL, formatGen, shortHex, type Accounting } from '../lib/lexveritas'
import { Wordmark } from './Brand'

function Col({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="eyebrow mb-3 text-slate-300">{title}</h3>
      <ul className="space-y-2 text-sm">{children}</ul>
    </div>
  )
}

function Ext({ href, children }: { href: string; children: ReactNode }) {
  return (
    <li>
      <a href={href} target="_blank" rel="noreferrer noopener" className="text-slate-400 transition hover:text-emerald-300">
        {children}
      </a>
    </li>
  )
}

function Status({ ok, label, value }: { ok: boolean | null; label: string; value: string }) {
  const dot = ok === null ? 'bg-slate-500' : ok ? 'bg-emerald-400' : 'bg-rose-400'
  return (
    <li className="flex items-start gap-2">
      <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} aria-hidden />
      <span>
        <span className="block text-slate-400">{label}</span>
        <span className={`font-mono text-xs ${ok === false ? 'text-rose-300' : 'text-slate-200'}`}>{value}</span>
      </span>
    </li>
  )
}

/** Solvency as read from get_accounting(); a surplus is a reverted call's value awaiting its finalization refund. */
function solvency(acc: Accounting | null): { ok: boolean | null; value: string } {
  if (!acc) return { ok: null, value: 'Awaiting first read' }
  const bal = BigInt(acc.balance)
  const liab = BigInt(acc.liabilities)
  if (!acc.ledger_ok || bal < liab) return { ok: false, value: 'Invariant violated' }
  if (bal > liab) return { ok: true, value: `Preserved · ${formatGen((bal - liab).toString())} settling` }
  return { ok: true, value: '100% invariant preserved' }
}

export function Footer({ online, accounting, counts }: {
  online: boolean | null
  accounting: Accounting | null
  counts: { markets: number; disputes: number } | null
}) {
  const s = solvency(accounting)
  return (
    <footer className="mt-12 border-t border-indigo-400/10 bg-zinc-950/60">
      <div className="mx-auto grid max-w-[1400px] gap-10 px-4 py-10 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
        <div>
          <Wordmark />
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-slate-400">
            Autonomous Semantic Dispute Oracle built natively on GenVM.
          </p>
          <p className="mt-3 inline-flex rounded-md border border-white/10 px-2 py-0.5 font-mono text-[11px] text-slate-400">MIT Licensed</p>
        </div>

        <Col title="Quick links">
          {EXPLORER_URL && <Ext href={EXPLORER_URL}>Explorer contract <span className="font-mono text-xs text-slate-500">{shortHex(CONTRACT_ADDRESS, 4)}</span></Ext>}
          <Ext href={REPO_URL}>GitHub repository</Ext>
          <Ext href={`${REPO_URL}/blob/main/specs/architecture.md`}>Architecture spec</Ext>
        </Col>

        <Col title="Ecosystem">
          <Ext href="https://studio-next.genlayer.com">GenLayer Studio Next</Ext>
          <Ext href="https://docs.polymarket.com">Polymarket resolution docs</Ext>
          <Ext href={`${REPO_URL}/blob/main/specs/game_theory.md#6-bribery-resistance-compared-with-token-voting`}>UMA oracle comparison</Ext>
        </Col>

        <Col title="Status & telemetry">
          <Status
            ok={online}
            label="Validator network status"
            value={online === null ? 'Checking...' : online ? 'Active · RPC reachable' : 'Unreachable'}
          />
          <Status ok={s.ok} label="Active solvency check" value={s.value} />
          {counts && <Status ok={online} label="On-chain state" value={`${counts.markets} markets · ${counts.disputes} disputes`} />}
        </Col>
      </div>
      <div className="border-t border-white/[0.05]">
        <p className="mx-auto max-w-[1400px] px-4 py-5 text-center text-xs text-slate-500 sm:px-6">
          Crafted for GenLayer by Handik4 • Open Source • MIT License
        </p>
      </div>
    </footer>
  )
}
