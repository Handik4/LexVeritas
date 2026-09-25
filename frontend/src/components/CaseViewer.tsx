import { EXPLORER_URL, formatGen, hostOf, shortHex, type Case } from '../lib/lexveritas'
import { Countdown } from './Countdown'
import { Confidence, Panel, StatusPill, VerdictBadge } from './ui'

const TIER1 = ['reuters.com', 'apnews.com', 'bloomberg.com', 'afp.com', 'bbc.co.uk', 'bbc.com', 'sec.gov', 'federalregister.gov', 'congress.gov', 'europa.eu', 'un.org', 'fec.gov']
const isTier1 = (url: string) => {
  const h = hostOf(url)
  return TIER1.some((s) => h === s || h.endsWith(`.${s}`))
}

function EvidenceList({ urls, hashes, excerpts, side, edited = [] }: {
  urls: string[]
  hashes: string[]
  excerpts?: Record<string, string>
  side: 'reporter' | 'challenger'
  edited?: string[]
}) {
  return (
    <ul className="space-y-2.5">
      {urls.map((url, i) => (
        <li
          key={url}
          className={`rounded-xl border bg-black/20 p-3 ${edited.includes(url) ? 'border-amber-300/30' : 'border-white/[0.07]'}`}
        >
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <a href={url} target="_blank" rel="noreferrer noopener" className="truncate text-sm font-medium text-slate-200 hover:text-emerald-300">
              {hostOf(url)}
            </a>
            <span
              className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] ${
                isTier1(url) ? 'bg-emerald-400/10 text-emerald-300' : 'bg-white/5 text-slate-400'
              }`}
              title={isTier1(url) ? 'Tier-1 wire service or primary register' : 'Unverified source: weighed, but ranked below tier-1 when sources conflict'}
            >
              {isTier1(url) ? 'TIER 1' : 'UNVERIFIED'}
            </span>
          </div>
          {excerpts?.[url] && <p className="mb-2 text-[13px] leading-relaxed text-slate-300">{excerpts[url]}</p>}
          {edited.includes(url) && (
            <p className="mb-2 rounded-md bg-amber-300/[0.08] px-2 py-1 text-[11px] text-amber-200">
              Content hash differs from the round-1 snapshot (layout, timestamp or editorial change). Round 2 was told, neutrally.
            </p>
          )}
          <p
            className="font-mono text-[10px] text-slate-500"
            title={`keccak256 of the sanitized text this source served in round ${side === 'challenger' ? 2 : 1}, committed on chain`}
          >
            {hashes[i] ? `content keccak ${shortHex(hashes[i], 8)}` : 'unreadable when read'}
          </p>
        </li>
      ))}
    </ul>
  )
}

function Rationale({ label, verdict, rationale, bps }: { label: string; verdict: Case['dispute']['verdict']; rationale: string; bps: number }) {
  return (
    <div className="rounded-xl border border-indigo-400/15 bg-indigo-400/[0.04] p-4">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <span className="eyebrow whitespace-nowrap">{label}</span>
        <VerdictBadge verdict={verdict} />
      </div>
      <p className="text-[13.5px] leading-relaxed text-slate-200">{rationale || 'No rationale recorded.'}</p>
      {bps > 0 && (
        <div className="mt-3">
          <Confidence bps={bps} />
        </div>
      )}
    </div>
  )
}

export function CaseViewer({ c }: { c: Case | undefined }) {
  if (!c) {
    return (
      <Panel eyebrow="Case viewer" title="Select a dispute">
        <p className="text-sm text-slate-500">Pick a dispute from the feed to compare its criteria, evidence and rulings.</p>
      </Panel>
    )
  }
  const { market, dispute, excerpts } = c
  const settled = dispute.final_verdict

  return (
    <Panel
      eyebrow={`Case ${shortHex(dispute.dispute_id, 4)}`}
      title={
        <a href={market.market_url} target="_blank" rel="noreferrer noopener" className="hover:text-emerald-300">
          {hostOf(market.market_url)}
          <span className="font-normal text-slate-500">{new URL(market.market_url).pathname}</span>
        </a>
      }
      actions={<StatusPill status={dispute.status} />}
    >
      <div className="mb-5">
        <Countdown dispute={dispute} />
      </div>

      <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
        <div>
          <h3 className="eyebrow mb-2.5">1 · Market criteria</h3>
          <blockquote className="rounded-xl border border-white/[0.07] bg-black/20 p-4 font-display text-[14.5px] leading-relaxed text-slate-100">
            {market.resolution_criteria}
          </blockquote>
          <dl className="mt-3 grid grid-cols-2 gap-y-1.5 text-xs">
            <dt className="text-slate-500">Cutoff</dt>
            <dd className="text-right font-mono text-slate-300">{new Date(market.cutoff_timestamp * 1000).toISOString().slice(0, 16).replace('T', ' ')}Z</dd>
            <dt className="text-slate-500">Market bond</dt>
            <dd className="text-right font-mono text-slate-300">
              {formatGen(market.dispute_bond)} / {formatGen(market.counter_bond)}
            </dd>
            <dt className="text-slate-500">Criteria hash</dt>
            <dd className="truncate text-right font-mono text-slate-300" title={market.criteria_hash}>
              {shortHex(market.criteria_hash, 5)}
            </dd>
            <dt className="text-slate-500">Sources read</dt>
            <dd className="text-right font-mono text-slate-300">
              {dispute.sources_read} / {dispute.evidence_urls.length}
            </dd>
          </dl>
        </div>

        <div>
          <h3 className="eyebrow mb-2.5">2 · Web evidence</h3>
          <EvidenceList
            urls={dispute.evidence_urls}
            hashes={dispute.evidence_hashes}
            excerpts={excerpts}
            side="reporter"
            edited={dispute.stealth_edits}
          />
          {dispute.challenged && (
            <>
              <h4 className="eyebrow mb-2 mt-4 text-rose-300/80">Counter evidence</h4>
              <EvidenceList urls={dispute.counter_evidence_urls} hashes={dispute.counter_evidence_hashes} excerpts={excerpts} side="challenger" />
            </>
          )}
        </div>

        <div className="space-y-3 md:col-span-2 2xl:col-span-1">
          <h3 className="eyebrow mb-2.5">3 · AI rationale</h3>
          <Rationale label="Round 1" verdict={dispute.verdict} rationale={dispute.rationale} bps={dispute.confidence_bps} />
          {dispute.stealth_edit_detected && (
            <div className="rounded-xl border border-amber-300/20 bg-amber-300/[0.05] px-4 py-3 text-[12.5px] leading-relaxed text-amber-100/90">
              {dispute.stealth_edits.length} round-1 source{dispute.stealth_edits.length > 1 ? 's' : ''} served different content in round 2.
              The contract added a neutral content-change notice to the round-2 prompt.
            </div>
          )}
          {dispute.challenged && (
            <Rationale
              label="Round 2 · blind review"
              verdict={dispute.challenge_verdict}
              rationale={dispute.challenge_rationale}
              bps={dispute.challenge_confidence_bps}
            />
          )}
          {settled && (
            <div className="flex items-center justify-between rounded-xl border border-emerald-400/20 bg-emerald-400/[0.05] px-4 py-3">
              <span className="text-sm text-emerald-200">Final outcome</span>
              <VerdictBadge verdict={settled} size="lg" />
            </div>
          )}
        </div>
      </div>

      {EXPLORER_URL && !dispute.dispute_id.includes('...') && (
        <p className="mt-5 text-right text-xs">
          <a href={EXPLORER_URL} target="_blank" rel="noreferrer noopener" className="text-slate-500 hover:text-emerald-300">
            View contract on explorer
          </a>
        </p>
      )}
    </Panel>
  )
}
