import { useCallback, useEffect, useRef, useState } from 'react'
import { AboutModal } from './components/AboutModal'
import { CaseViewer } from './components/CaseViewer'
import { DisputeFeed } from './components/DisputeFeed'
import { Footer } from './components/Footer'
import { Navbar } from './components/Navbar'
import { Simulator } from './components/Simulator'
import {
  CONTRACT_ADDRESS,
  EXPLORER_URL,
  fetchAccounting,
  fetchCounts,
  fetchLiveCases,
  formatGen,
  probeRpc,
  shortHex,
  type Accounting,
  type Case,
} from './lib/lexveritas'
import { sampleCases } from './lib/samples'

type Source = 'loading' | 'live' | 'sample' | 'offline'

/**
 * A reverted payable call leaves its value in the contract until the
 * transaction finalizes (about half a minute on Studio Next), then GenLayer
 * returns it to the sender. A surplus is therefore expected briefly; only a
 * shortfall, or a broken ledger, is a real problem.
 */
function SolvencyState({ accounting }: { accounting: Accounting }) {
  const balance = BigInt(accounting.balance)
  const liabilities = BigInt(accounting.liabilities)
  if (!accounting.ledger_ok || balance < liabilities) {
    return <span className="text-rose-300">invariant violated: balance below liabilities</span>
  }
  if (balance > liabilities) {
    return (
      <span className="text-amber-200" title="Value from a reverted transaction is returned to its sender at finalization">
        settling: {formatGen((balance - liabilities).toString())} pending refund
      </span>
    )
  }
  return <span className="text-emerald-300">staked + uncollected == balance</span>
}

const REFRESH_MS = 20_000
const MAX_BACKOFF_MS = 60_000
// Sample ids are abbreviated with '...'; live dispute ids are full keccak hex.
const isSample = (c: Case) => c.dispute.dispute_id.includes('...')

interface Sync {
  source: Source
  cases: Case[]
  counts: { markets: number; disputes: number } | null
  accounting: Accounting | null
  lastSynced: number | null
  failures: number
}

const INITIAL: Sync = { source: 'loading', cases: [], counts: null, accounting: null, lastSynced: null, failures: 0 }

/**
 * One sync cycle. A cheap health probe runs first, so an unreachable RPC costs
 * a single failed request instead of six (genlayer-js logs each failed
 * contract read to the console). On failure the last good data stays on
 * screen; before any success, the sample cases do.
 */
async function syncOnce(prev: Sync): Promise<Sync> {
  try {
    await probeRpc()
    const [live, counts, accounting] = await Promise.all([fetchLiveCases(), fetchCounts(), fetchAccounting()])
    const cases = live.length ? live : prev.cases.length && isSample(prev.cases[0]) ? prev.cases : sampleCases()
    return { source: live.length ? 'live' : 'sample', cases, counts, accounting, lastSynced: Date.now(), failures: 0 }
  } catch {
    return { ...prev, cases: prev.cases.length ? prev.cases : sampleCases(), source: 'offline', failures: prev.failures + 1 }
  }
}

const since = (ts: number) => {
  const s = Math.round((Date.now() - ts) / 1000)
  return s < 60 ? `${s}s ago` : `${Math.round(s / 60)} min ago`
}

export default function App() {
  const [sync, setSync] = useState<Sync>(INITIAL)
  const [selected, setSelected] = useState<string | null>(null)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [retryToken, setRetryToken] = useState(0)
  const [retrying, setRetrying] = useState(false)
  const { source, cases, counts, accounting, lastSynced, failures } = sync
  // Last known state, so a manual retry (which restarts the loop) keeps the
  // data on screen, its "last synced" time and the attempt count.
  const syncRef = useRef<Sync>(INITIAL)

  // Poll with exponential backoff while the RPC is unreachable. The chain of
  // timeouts (not an interval) guarantees cycles never overlap.
  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const cycle = async () => {
      const next = await syncOnce(syncRef.current)
      if (cancelled) return
      syncRef.current = next
      setSync(next)
      setRetrying(false)
      const delay = next.failures ? Math.min(MAX_BACKOFF_MS, 5_000 * 2 ** (next.failures - 1)) : REFRESH_MS
      timer = setTimeout(cycle, delay)
    }
    cycle()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [retryToken])

  const retryNow = useCallback(() => {
    setRetrying(true)
    setRetryToken((t) => t + 1)
  }, [])

  // The first case is selected until the user picks one (derived, not synced by an effect).
  const selectedId = selected && cases.some((c) => c.dispute.dispute_id === selected) ? selected : (cases[0]?.dispute.dispute_id ?? null)
  const current = cases.find((c) => c.dispute.dispute_id === selectedId)
  const online = source === 'loading' ? null : source !== 'offline'

  return (
    <div id="top" className="flex min-h-screen flex-col">
      <Navbar online={online !== false} onAbout={() => setAboutOpen(true)} />
      <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} />

      <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 pb-8 pt-8 sm:px-6">
        <section className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <p className="eyebrow mb-2 text-emerald-300/80">Autonomous semantic dispute oracle</p>
            <h1 className="font-display text-3xl font-semibold leading-tight tracking-tight text-white sm:text-4xl">
              Prediction markets, resolved on the literal criteria.
            </h1>
            <p className="mt-3 text-[15px] leading-relaxed text-slate-400">
              GenLayer validators read the evidence themselves, rule with their own models, and must agree on the verdict.
              Anyone can challenge for 24 hours with a double bond.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => setAboutOpen(true)} className="btn border border-indigo-400/25 text-indigo-100 hover:bg-indigo-400/10">
              How it works
            </button>
            <a
              href={EXPLORER_URL ?? '#'}
              target="_blank"
              rel="noreferrer noopener"
              className="btn border border-white/10 font-mono text-xs text-slate-300 hover:bg-white/5"
              title={CONTRACT_ADDRESS}
            >
              Contract {shortHex(CONTRACT_ADDRESS, 4)}
            </a>
          </div>
        </section>

        {source === 'sample' && (
          <div className="mb-4 rounded-xl border border-indigo-400/20 bg-indigo-400/[0.06] px-4 py-2.5 text-sm text-indigo-100">
            The deployed contract has no disputes yet, so the feed shows <strong className="font-semibold">sample cases</strong>. Live
            disputes replace them automatically. The simulator always runs against the live contract.
          </div>
        )}
        {source === 'offline' && (
          <div
            className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300/20 bg-amber-300/[0.06] px-4 py-2.5 text-sm text-amber-100"
            role="status"
          >
            <span>
              <strong className="font-semibold">Studio Next RPC unreachable.</strong>{' '}
              {lastSynced ? `Showing data last synced ${since(lastSynced)}.` : 'Showing sample cases until the network responds.'}{' '}
              Reconnecting automatically{failures > 1 ? ` (attempt ${failures})` : ''}.
            </span>
            <button onClick={retryNow} disabled={retrying} className="btn border border-amber-300/30 py-1 text-amber-100 hover:bg-amber-300/10">
              {retrying ? 'Retrying...' : 'Retry now'}
            </button>
          </div>
        )}

        <section id="disputes" className="scroll-mt-24" aria-label="Active disputes">
          <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
            <DisputeFeed cases={cases} selected={selectedId} onSelect={setSelected} />
            <CaseViewer c={current} />
          </div>
        </section>

        <section id="simulator" className="mt-5 scroll-mt-24" aria-label="Dry-run simulator">
          <Simulator />
        </section>

        {accounting && (
          <section className="glass mt-5 flex flex-wrap items-center gap-x-8 gap-y-2 px-5 py-3 text-xs" aria-label="Solvency">
            <span className="eyebrow">Solvency ledger</span>
            <span className="text-slate-400">
              Staked <span className="font-mono text-slate-200">{formatGen(accounting.total_staked_bonds)}</span>
            </span>
            <span className="text-slate-400">
              Uncollected <span className="font-mono text-slate-200">{formatGen(accounting.uncollected_rewards)}</span>
            </span>
            <span className="text-slate-400">
              Balance <span className="font-mono text-slate-200">{formatGen(accounting.balance)}</span>
            </span>
            <SolvencyState accounting={accounting} />
          </section>
        )}
      </main>

      <Footer online={online} accounting={accounting} counts={counts} />
    </div>
  )
}
