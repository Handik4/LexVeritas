import type { Case } from './lexveritas'

// Sample cases shown while the deployed contract holds no disputes. They use
// the contract's exact data shape so the same views render live data unchanged.
// Hashes are real keccak256 digests: criteria_hash of the criteria text, and
// evidence hashes of each excerpt (standing in for the sanitized page text).
// The ceasefire rationale is the verbatim output of a dry_run_arbitration
// simulation against the deployed contract on Studio Next (2026-09-25).

const H = 3600
const GEN = 10n ** 18n
const now = () => Math.floor(Date.now() / 1000)

const noChallenge = {
  challenged: false,
  challenger: '',
  counter_bond: '0',
  counter_evidence_urls: [] as string[],
  counter_evidence_hashes: [] as string[],
  challenge_verdict: '' as const,
  challenge_rationale: '',
  challenge_confidence_bps: 0,
  final_verdict: '' as const,
  settled_at: 0,
  stealth_edits: [] as string[],
  stealth_edit_detected: false,
}

export function sampleCases(): Case[] {
  const t = now()
  const reuters = 'https://www.reuters.com/world/ceasefire-signed'
  const ap = 'https://apnews.com/article/ceasefire-collapses'
  const coindesk = 'https://www.coindesk.example/markets/etf-approved'
  const sec = 'https://www.sec.gov/rules/sro/order-2026-117'
  return [
    {
      market: {
        market_id: '0x5a1e...ceasefire',
        market_url: 'https://polymarket.com/event/ceasefire-signed-by-june-30',
        resolution_criteria: 'This market resolves YES if a ceasefire agreement between Party A and Party B is signed on or before June 30, 23:59 UTC. Otherwise it resolves NO.',
        cutoff_timestamp: t - 90 * 24 * H,
        status: 'DISPUTED',
        registered_by: '0x2bd806c97F0e00aF1a1fC3328fA763a9269723C8',
        registered_at: t - 30 * H,
        outcome: '',
        active_dispute_id: '0xd15a...0001',
        resolved_at: 0,
        dispute_bond: (2n * GEN).toString(),
        counter_bond: (4n * GEN).toString(),
        criteria_hash: '0x96b8a179027d6425ac0aec6d5ccd4702f3d333c48ba5b53757571b4896712511',
      },
      dispute: {
        ...noChallenge,
        dispute_id: '0xd15a...0001',
        market_id: '0x5a1e...ceasefire',
        reporter: '0x2bd806c97F0e00aF1a1fC3328fA763a9269723C8',
        bond_amount: (2n * GEN).toString(),
        verdict: 'OUTCOME_AMBIGUOUS_SPLIT_50_50',
        rationale:
          'The literal criterion is technically satisfied: the evidence reports both delegations signed a ceasefire on June 12, before June 30. But the same report says shelling resumed 10 minutes later and both sides declared the agreement void, undermining whether the intended real-world outcome, a functioning ceasefire, actually occurred.',
        confidence_bps: 9200,
        sources_read: 2,
        evidence_urls: [reuters, ap],
        evidence_hashes: ['0x1071d682d0d43b18c5e3c0f16b79fd5d66bad16471e1eb75ae2a972984aff1ea', '0xaac950c27d990faf5d40c3d9d731b1d22fea43c89b1d4b4f787ebb73d3647cb2'],
        filed_at: t - 7 * H,
        challenge_deadline: t + 17 * H,
        status: 'ACTIVE_CHALLENGE',
      },
      excerpts: {
        [reuters]: 'Both delegations signed the ceasefire text at 14:00 UTC on June 12 in the presence of mediators.',
        [ap]: 'Shelling resumed at 14:10 UTC, ten minutes after the signing ceremony. By evening both sides had declared the agreement void.',
      },
    },
    {
      market: {
        market_id: '0x7b20...etf',
        market_url: 'https://polymarket.com/event/spot-etf-approved-q2',
        resolution_criteria: 'Resolves YES if the SEC approves a spot ETF for Asset X by June 30. Approval means a signed order published on sec.gov; statements by commissioners do not count.',
        cutoff_timestamp: t - 60 * 24 * H,
        status: 'RESOLVED',
        registered_by: '0x81b637d8fCD2C6da6359E6963113a1170de795e4',
        registered_at: t - 80 * H,
        outcome: 'OUTCOME_NO',
        active_dispute_id: '',
        resolved_at: t - 30 * H,
        // A high-value market registered with a scaled 25 GEN dispute bond.
        dispute_bond: (25n * GEN).toString(),
        counter_bond: (50n * GEN).toString(),
        criteria_hash: '0x32b20c5d7e92f086b76f094ff01e3134c5c66e5546bab203d7a2243fac73c067',
      },
      dispute: {
        ...noChallenge,
        dispute_id: '0xd15a...0002',
        market_id: '0x7b20...etf',
        reporter: '0x81b637d8fCD2C6da6359E6963113a1170de795e4',
        bond_amount: (25n * GEN).toString(),
        verdict: 'OUTCOME_YES',
        rationale: 'Multiple outlets report the ETF as approved before the cutoff.',
        confidence_bps: 7400,
        sources_read: 1,
        evidence_urls: [coindesk],
        evidence_hashes: ['0x4c1082384a507ed76970cd440b450b7dea34815ed5fc22ba554a74c72dab2227'],
        filed_at: t - 72 * H,
        challenge_deadline: t - 48 * H,
        status: 'OVERTURNED',
        challenged: true,
        challenger: '0x3c4FF52dbb8355aBF699a1c47FCc71e0bF18E515',
        counter_bond: (50n * GEN).toString(),
        counter_evidence_urls: [sec],
        counter_evidence_hashes: ['0x99f85f91f04f953de1cd670973ddeb8fe824f8978b7eb3ccbcd84e03b212438b'],
        challenge_verdict: 'OUTCOME_NO',
        challenge_rationale:
          'The criteria require a signed order on sec.gov. The primary register shows the order was signed on July 2, after the cutoff. The reporter-side article was modified after round 1, so its current wording is given little weight; it describes a commissioner statement, which the criteria exclude.',
        challenge_confidence_bps: 9500,
        final_verdict: 'OUTCOME_NO',
        settled_at: t - 30 * H,
        stealth_edits: [coindesk],
        stealth_edit_detected: true,
      },
      excerpts: {
        [coindesk]: 'A commissioner said on June 28 that approval was "effectively done".',
        [sec]: 'Order granting approval ... By the Commission. Dated: July 2.',
      },
    },
  ]
}
