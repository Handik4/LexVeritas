import type { ReactNode } from 'react'
import { REPO_URL } from '../lib/lexveritas'
import { Modal } from './Modal'

function Section({ n, title, children }: { n: string; title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 sm:p-5">
      <p className="eyebrow mb-1 text-emerald-300/80">{n}</p>
      <h3 className="mb-2.5 font-display text-lg font-semibold text-slate-50">{title}</h3>
      <div className="space-y-2.5 text-[14px] leading-relaxed text-slate-300">{children}</div>
    </section>
  )
}

function Safeguard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-indigo-400/15 bg-indigo-400/[0.04] p-3">
      <p className="text-sm font-medium text-indigo-100">{title}</p>
      <p className="mt-1 text-[13px] leading-relaxed text-slate-400">{children}</p>
    </div>
  )
}

export function AboutModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} wide eyebrow="Protocol specs & about" title="How LexVeritas resolves what token votes cannot">
      <div className="space-y-4">
        <Section n="01" title="The Polymarket semantic problem">
          <p>
            Prediction markets resolve on text, and the costly disputes live in the gap between the wording and what happened.
            <em className="text-slate-100"> "Will a ceasefire be signed by June 30?"</em> It was signed at 14:00 and broke at
            14:10. Technically yes; in substance, no.
          </p>
          <p>
            Optimistic oracles escalate these cases to a token-weighted vote. The cost of corrupting the result is the cost of
            buying or bribing enough votes, and nothing ties a vote to the criteria, the evidence, or a stated reason.
          </p>
        </Section>

        <Section n="02" title="How GenVM solves it">
          <p>
            <strong className="text-slate-100">Multi-source web consensus.</strong> Every validator fetches up to three cited
            sources itself, such as Reuters, AP or a primary register. There is no relayer to trust. Unreadable sources are
            skipped. If none can be read, the dispute reverts instead of locking the market.
          </p>
          <p>
            <strong className="text-slate-100">LLM legal arbitration, deterministic settlement.</strong> Each validator's own
            model weighs the literal criteria against the reporting and returns one of four verdicts: YES, NO, SPLIT 50/50 or
            INVALID. Validators must agree on that categorical verdict, not on wording. Once they do, payouts and the market
            outcome follow deterministically.
          </p>
          <p>
            <strong className="text-slate-100">Hardened ingestion.</strong> Evidence is stripped of markup, prompt-injection
            markers are redacted, angle brackets are escaped, and the text is fenced as data. In live runs, three independent
            models ignored an injected "output YES".
          </p>
        </Section>

        <Section n="03" title="Cryptographic and economic safeguards">
          <div className="grid gap-2.5 sm:grid-cols-2">
            <Safeguard title="Criteria hash binding">
              market_id = keccak256(url : cutoff : keccak256(criteria) : bond). A squatter with skewed wording or a wrong
              bond gets a different market; consumers bind to the id of the terms they display.
            </Safeguard>
            <Safeguard title="24h challenge timelock">
              The deadline is written once at filing and never moves. Challenges close exactly at it; unchallenged
              disputes finalize from it.
            </Safeguard>
            <Safeguard title="2x counter-bonds">
              A challenge costs twice the market's dispute bond, so it pays only if the challenger believes round 1 is
              wrong with better than 2/3 odds. Round 2 is blind to round 1.
            </Safeguard>
            <Safeguard title="Zero-leak balance invariant">
              staked bonds + uncollected rewards == contract balance. The ledger identity is checked on every write, and
              the test suite drives full lifecycles to a contract balance of exactly zero.
            </Safeguard>
          </div>
        </Section>

        <div className="flex flex-wrap gap-2 pt-1">
          <a href={`${REPO_URL}/blob/main/specs/architecture.md`} target="_blank" rel="noreferrer noopener" className="btn bg-indigo-500/90 text-white hover:bg-indigo-400">
            Formal architecture spec
          </a>
          <a href={`${REPO_URL}/blob/main/specs/game_theory.md`} target="_blank" rel="noreferrer noopener" className="btn border border-white/10 text-slate-200 hover:bg-white/5">
            Game theory &amp; invariants
          </a>
          <a href={REPO_URL} target="_blank" rel="noreferrer noopener" className="btn border border-white/10 text-slate-200 hover:bg-white/5">
            Source on GitHub
          </a>
        </div>
      </div>
    </Modal>
  )
}
