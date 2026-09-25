import { useEffect, useState } from 'react'
import type { Dispute } from '../lib/lexveritas'

const WINDOW = 24 * 60 * 60

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

const hms = (s: number) => {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

/** 24h challenge timelock. The deadline is fixed on chain at filing; this only renders it. */
export function Countdown({ dispute, compact = false }: { dispute: Dispute; compact?: boolean }) {
  const now = useNow()
  if (dispute.status === 'PENDING_CONSENSUS') {
    return <p className="text-xs text-amber-200/80">Window starts once validators reach a verdict.</p>
  }
  if (!dispute.challenge_deadline) return null

  const settledEarly = dispute.challenged && dispute.status === 'ACTIVE_CHALLENGE'
  const remaining = Math.max(0, dispute.challenge_deadline - now)
  const elapsed = Math.min(WINDOW, WINDOW - remaining)
  const pct = (elapsed / WINDOW) * 100
  const open = remaining > 0 && dispute.status === 'ACTIVE_CHALLENGE' && !dispute.challenged

  let label: string
  if (dispute.status === 'FINALIZED' || dispute.status === 'OVERTURNED') label = 'Settled'
  else if (settledEarly) label = 'Challenged: round 2 ruled, finalizable now'
  else if (open) label = `${hms(remaining)} left to challenge`
  else label = 'Window closed: anyone may finalize'

  return (
    <div className={compact ? '' : 'space-y-2'}>
      {!compact && (
        <div className="flex items-baseline justify-between">
          <span className="eyebrow">Challenge timelock</span>
          <span className={`font-mono text-sm tabular-nums ${open ? 'text-indigo-200' : 'text-slate-400'}`}>{label}</span>
        </div>
      )}
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.07]"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        aria-label="Challenge window elapsed"
      >
        <div
          className={`h-full rounded-full transition-[width] duration-1000 ease-linear ${
            open ? 'bg-gradient-to-r from-indigo-500 to-indigo-300' : 'bg-emerald-400/70'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {compact && <p className="mt-1.5 font-mono text-[11px] tabular-nums text-slate-400">{label}</p>}
    </div>
  )
}
