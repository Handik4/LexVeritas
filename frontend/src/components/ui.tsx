import type { ReactNode } from 'react'
import { VERDICT_LABEL, type DisputeStatus, type Verdict } from '../lib/lexveritas'

const VERDICT_STYLE: Record<Verdict, string> = {
  OUTCOME_YES: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300',
  OUTCOME_NO: 'border-rose-400/30 bg-rose-400/10 text-rose-300',
  OUTCOME_AMBIGUOUS_SPLIT_50_50: 'border-amber-300/30 bg-amber-300/10 text-amber-200',
  OUTCOME_INVALID_MARKET: 'border-slate-400/30 bg-slate-400/10 text-slate-300',
}

export function VerdictBadge({ verdict, size = 'sm' }: { verdict: Verdict | ''; size?: 'sm' | 'lg' }) {
  if (!verdict) {
    return <span className="rounded-md border border-white/10 px-2 py-0.5 font-mono text-[11px] text-slate-500">NO VERDICT</span>
  }
  const pad = size === 'lg' ? 'px-3 py-1 text-sm' : 'px-2 py-0.5 text-[11px]'
  return (
    <span className={`inline-flex items-center rounded-md border font-mono font-medium tracking-wide ${pad} ${VERDICT_STYLE[verdict]}`}>
      {VERDICT_LABEL[verdict]}
    </span>
  )
}

const STATUS_STYLE: Record<DisputeStatus, { dot: string; text: string; label: string }> = {
  PENDING_CONSENSUS: { dot: 'bg-amber-300', text: 'text-amber-200', label: 'Pending consensus' },
  ACTIVE_CHALLENGE: { dot: 'bg-indigo-400 animate-pulse', text: 'text-indigo-200', label: 'Challenge window' },
  FINALIZED: { dot: 'bg-emerald-400', text: 'text-emerald-300', label: 'Finalized' },
  OVERTURNED: { dot: 'bg-rose-400', text: 'text-rose-300', label: 'Overturned' },
  WITHDRAWN: { dot: 'bg-slate-500', text: 'text-slate-400', label: 'Withdrawn' },
}

export function StatusPill({ status }: { status: DisputeStatus }) {
  const s = STATUS_STYLE[status]
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${s.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} aria-hidden />
      {s.label}
    </span>
  )
}

export function Confidence({ bps }: { bps: number }) {
  const pct = Math.round(bps / 100)
  return (
    <div className="flex items-center gap-2" title={`${pct}% model confidence`}>
      <div className="h-1 w-16 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-emerald-400" style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-[11px] text-slate-400">{pct}%</span>
    </div>
  )
}

export function Panel({ title, eyebrow, actions, children, className = '' }: {
  title?: ReactNode
  eyebrow?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`glass p-5 ${className}`}>
      {(title || eyebrow || actions) && (
        <header className="mb-4 flex items-start justify-between gap-4">
          <div>
            {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
            {title && <h2 className="text-base font-semibold text-slate-100">{title}</h2>}
          </div>
          {actions}
        </header>
      )}
      {children}
    </section>
  )
}
