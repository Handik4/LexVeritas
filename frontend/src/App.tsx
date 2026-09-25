import { useCallback, useEffect, useState } from 'react'
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
  const [aboutOpen, setAboutOpen] = useState(false)

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
        {error && (
          <div className="mb-4 rounded-xl border border-rose-400/20 bg-rose-400/[0.06] px-4 py-2.5 text-sm text-rose-200" role="alert">
            Could not read the contract: {error}
          </div>
        )}

        <section id="disputes" className="scroll-mt-24" aria-label="Active disputes">
          <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
            <DisputeFeed cases={cases} selected={selected} onSelect={setSelected} />
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
