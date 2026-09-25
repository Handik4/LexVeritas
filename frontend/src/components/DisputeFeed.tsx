import { useMemo, useState } from 'react'
import { hostOf, type Case, type DisputeStatus } from '../lib/lexveritas'
import { Countdown } from './Countdown'
import { Confidence, Panel, StatusPill, VerdictBadge } from './ui'

const FILTERS: { key: 'all' | 'triage' | 'settled'; label: string; match: (s: DisputeStatus) => boolean }[] = [
  { key: 'triage', label: 'Triage', match: (s) => s === 'ACTIVE_CHALLENGE' },
  { key: 'settled', label: 'Settled', match: (s) => s === 'FINALIZED' || s === 'OVERTURNED' },
  { key: 'all', label: 'All', match: () => true },
]

// Triage order: open windows first, soonest deadline first.
const rank = (c: Case) => (c.dispute.status === 'ACTIVE_CHALLENGE' ? 0 : 1)

export function DisputeFeed({ cases, selected, onSelect }: {
  cases: Case[]
  selected: string | null
  onSelect: (id: string) => void
}) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['key']>('triage')
  const visible = useMemo(() => {
    const f = FILTERS.find((x) => x.key === filter)!
    return cases
      .filter((c) => f.match(c.dispute.status))
      .sort((a, b) => rank(a) - rank(b) || (a.dispute.challenge_deadline || 0) - (b.dispute.challenge_deadline || 0))
  }, [cases, filter])

  return (
    <Panel
      eyebrow="Live triage"
      title="Disputes"
      actions={
        <div className="flex rounded-lg border border-white/10 bg-black/20 p-0.5" role="tablist" aria-label="Filter disputes">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              role="tab"
              aria-selected={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                filter === f.key ? 'bg-white/10 text-slate-100' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      }
    >
      {visible.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">Nothing here.</p>
      ) : (
        <ul className="-mx-2 space-y-1">
          {visible.map(({ market, dispute }) => {
            const active = selected === dispute.dispute_id
            return (
              <li key={dispute.dispute_id}>
                <button
                  onClick={() => onSelect(dispute.dispute_id)}
                  aria-current={active}
                  className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                    active
                      ? 'border-emerald-400/30 bg-emerald-400/[0.06]'
                      : 'border-transparent hover:border-white/10 hover:bg-white/[0.03]'
                  }`}
                >
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2">
                      <StatusPill status={dispute.status} />
                      {dispute.stealth_edit_detected && (
                        <span className="rounded bg-amber-300/10 px-1.5 py-0.5 font-mono text-[10px] text-amber-200" title="A round-1 source's content hash changed before round 2 read it">
                          CONTENT CHANGED
                        </span>
                      )}
                    </span>
                    <VerdictBadge verdict={dispute.final_verdict || dispute.challenge_verdict || dispute.verdict} />
                  </div>
                  <p className="line-clamp-2 text-sm leading-snug text-slate-200">{market.resolution_criteria}</p>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="truncate font-mono text-[11px] text-slate-500">{hostOf(market.market_url)}</span>
                    {dispute.confidence_bps > 0 && <Confidence bps={dispute.challenge_confidence_bps || dispute.confidence_bps} />}
                  </div>
                  {dispute.status === 'ACTIVE_CHALLENGE' && (
                    <div className="mt-2.5">
                      <Countdown dispute={dispute} compact />
                    </div>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}
