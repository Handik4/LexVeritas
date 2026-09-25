import { useCallback, useEffect, useState } from 'react'
import { CaseViewer } from './components/CaseViewer'
import { DisputeFeed } from './components/DisputeFeed'
import { Simulator } from './components/Simulator'
import {
  CONTRACT_ADDRESS,
  EXPLORER_URL,
  fetchAccounting,
  fetchCounts,
  fetchLiveCases,
  formatGen,
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
// Sample ids are abbreviated with '...'; live dispute ids are full keccak hex.
const isSample = (c: Case) => c.dispute.dispute_id.includes('...')

export default function App() {
  const [cases, setCases] = useState<Case[]>([])
  const [source, setSource] = useState<Source>('loading')
  const [counts, setCounts] = useState<{ markets: number; disputes: number } | null>(null)
  const [accounting, setAccounting] = useState<Accounting | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [live, c, acc] = await Promise.all([fetchLiveCases(), fetchCounts(), fetchAccounting()])
      setCounts(c)
      setAccounting(acc)
      setError(null)
      if (live.length > 0) {
        setCases(live)
        setSource('live')
      } else {
        setCases((prev) => (prev.length && isSample(prev[0]) ? prev : sampleCases()))
        setSource('sample')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message.split('\n')[0] : String(e))
      setCases((prev) => (prev.length ? prev : sampleCases()))
      setSource((s) => (s === 'live' ? 'live' : 'offline'))
    }
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(load, REFRESH_MS)
    return () => clearInterval(id)
  }, [load])

  useEffect(() => {
    if (!selected && cases.length) setSelected(cases[0].dispute.dispute_id)
  }, [cases, selected])

  const current = cases.find((c) => c.dispute.dispute_id === selected)

  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-16 pt-6 sm:px-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <img src="/favicon.svg" alt="" className="h-9 w-9" />
            <h1 className="font-display text-3xl font-semibold tracking-tight text-white">LexVeritas</h1>
          </div>
          <p className="mt-1.5 max-w-xl text-sm text-slate-400">
            Semantic dispute oracle for prediction markets. Validators read the web themselves and rule on the literal criteria.
          </p>
        </div>
        <div className="glass flex items-center gap-4 px-4 py-2.5 text-xs">
          <span className="flex items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full ${
                source === 'offline' ? 'bg-rose-400' : source === 'loading' ? 'bg-slate-500' : 'bg-emerald-400'
              }`}
              aria-hidden
            />
            <span className="text-slate-300">{source === 'offline' ? 'RPC unreachable' : 'Studio Next'}</span>
          </span>
          <a
            href={EXPLORER_URL ?? '#'}
            target="_blank"
            rel="noreferrer noopener"
            className="font-mono text-slate-400 hover:text-emerald-300"
            title={CONTRACT_ADDRESS}
          >
            {shortHex(CONTRACT_ADDRESS, 4)}
          </a>
          {counts && (
            <span className="font-mono text-slate-400">
              {counts.markets} mkts · {counts.disputes} disputes
            </span>
          )}
        </div>
      </header>

      {source === 'sample' && (
        <div className="mb-4 rounded-xl border border-indigo-400/20 bg-indigo-400/[0.06] px-4 py-2.5 text-sm text-indigo-100">
          The deployed contract has no disputes yet, so the feed shows <strong className="font-semibold">sample cases</strong>. Live
          disputes replace them automatically. The simulator below always runs against the live contract.
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-xl border border-rose-400/20 bg-rose-400/[0.06] px-4 py-2.5 text-sm text-rose-200">
          Could not read the contract: {error}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
        <DisputeFeed cases={cases} selected={selected} onSelect={setSelected} />
        <CaseViewer c={current} />
      </div>

      <div className="mt-5">
        <Simulator />
      </div>

      {accounting && (
        <footer className="glass mt-5 flex flex-wrap items-center gap-x-8 gap-y-2 px-5 py-3 text-xs">
          <span className="eyebrow">Solvency</span>
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
        </footer>
      )}
    </div>
  )
}
