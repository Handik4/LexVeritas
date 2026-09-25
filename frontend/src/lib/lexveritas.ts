import { createAccount, createClient } from 'genlayer-js'
import { studioDevnet } from 'genlayer-js/chains'
import deployment from '../../../deployments/studio-next.json'

export const CONTRACT_ADDRESS = (import.meta.env.VITE_CONTRACT_ADDRESS ?? deployment.contract_address) as `0x${string}`
export const RPC_URL: string = import.meta.env.VITE_GENLAYER_RPC ?? deployment.rpc_url
export const EXPLORER_URL: string | null = deployment.explorer_url
export const DEPLOYED_AT: string = deployment.deployed_at

export type Verdict =
  | 'OUTCOME_YES'
  | 'OUTCOME_NO'
  | 'OUTCOME_AMBIGUOUS_SPLIT_50_50'
  | 'OUTCOME_INVALID_MARKET'

export type DisputeStatus = 'PENDING_CONSENSUS' | 'ACTIVE_CHALLENGE' | 'FINALIZED' | 'OVERTURNED' | 'WITHDRAWN'

export interface Market {
  market_id: string
  market_url: string
  resolution_criteria: string
  cutoff_timestamp: number
  status: 'OPEN' | 'DISPUTED' | 'RESOLVED'
  registered_by: string
  registered_at: number
  outcome: Verdict | ''
  active_dispute_id: string
  resolved_at: number
}

export interface Dispute {
  dispute_id: string
  market_id: string
  reporter: string
  bond_amount: string
  verdict: Verdict | ''
  rationale: string
  confidence_bps: number
  sources_read: number
  evidence_urls: string[]
  evidence_hashes: string[]
  filed_at: number
  challenge_deadline: number
  status: DisputeStatus
  attempts: number
  challenged: boolean
  challenger: string
  counter_bond: string
  counter_evidence_urls: string[]
  counter_evidence_hashes: string[]
  challenge_verdict: Verdict | ''
  challenge_rationale: string
  challenge_confidence_bps: number
  final_verdict: Verdict | ''
  settled_at: number
}

export interface Ruling {
  verdict: Verdict
  rationale: string
  confidence_bps: number
}

export interface Accounting {
  total_staked_bonds: string
  uncollected_rewards: string
  liabilities: string
  balance: string
  balance_matches: boolean
  ledger_ok: boolean
}

export interface Case {
  market: Market
  dispute: Dispute
  /** Evidence excerpts are only available for sample cases; live disputes store URLs and hashes, not page text. */
  excerpts?: Record<string, string>
}

const client = createClient({ chain: studioDevnet, endpoint: RPC_URL, account: createAccount() })

/** GenVM dicts decode to Map and integers to bigint; flatten both for React. */
function plain(value: unknown): unknown {
  if (value instanceof Map) {
    return Object.fromEntries([...value.entries()].map(([k, v]) => [String(k), plain(v)]))
  }
  if (Array.isArray(value)) return value.map(plain)
  if (typeof value === 'bigint') {
    return value <= BigInt(Number.MAX_SAFE_INTEGER) && value >= -BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : value.toString()
  }
  return value
}

async function read<T>(functionName: string, args: (string | number)[] = []): Promise<T> {
  const raw = await client.readContract({ address: CONTRACT_ADDRESS, functionName, args })
  return plain(raw) as T
}

export async function fetchLiveCases(limit = 50): Promise<Case[]> {
  const disputes = await read<Dispute[]>('list_disputes', [0, limit])
  const markets = new Map<string, Market>()
  for (const d of disputes) {
    if (!markets.has(d.market_id)) markets.set(d.market_id, await read<Market>('get_market', [d.market_id]))
  }
  return disputes.map((dispute) => ({ dispute, market: markets.get(dispute.market_id)! })).reverse()
}

export const fetchAccounting = () => read<Accounting>('get_accounting')
export const fetchCounts = () => read<{ markets: number; disputes: number }>('get_counts')

/**
 * One independent leader execution of the contract's arbitration prompt on
 * Studio Next. Simulated, so nothing is committed on chain.
 */
export async function simulateRuling(criteria: string, evidence: string): Promise<Ruling> {
  const raw = await client.simulateWriteContract({
    address: CONTRACT_ADDRESS,
    functionName: 'dry_run_arbitration',
    args: [criteria, evidence],
    leaderOnly: true,
  })
  return plain(raw) as Ruling
}

export const VERDICT_LABEL: Record<Verdict, string> = {
  OUTCOME_YES: 'YES',
  OUTCOME_NO: 'NO',
  OUTCOME_AMBIGUOUS_SPLIT_50_50: 'SPLIT 50/50',
  OUTCOME_INVALID_MARKET: 'INVALID',
}

export const formatGen = (atto: string | number) => {
  const n = Number(BigInt(atto) / 10n ** 14n) / 1e4
  return `${n.toLocaleString(undefined, { maximumFractionDigits: 4 })} GEN`
}

export const shortHex = (h: string, n = 6) => (h && h.length > 2 * n + 2 ? `${h.slice(0, n + 2)}...${h.slice(-n)}` : h)

export const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}
