import type { Case } from './lexveritas'

// Sample cases shown while the deployed contract holds no disputes. They use
// the contract's exact data shape so the same views render live data unchanged.
// The ceasefire rationale is the verbatim output of a dry_run_arbitration
// simulation against the deployed contract on Studio Next (2026-09-25).

const H = 3600
const now = () => Math.floor(Date.now() / 1000)

const base = {
  bond_amount: '2000000000000000000',
  attempts: 1,
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
}

export function sampleCases(): Case[] {
  const t = now()
  return [
    {
      market: {
        market_id: '0x5a1e...ceasefire',
        market_url: 'https://polymarket.com/event/ceasefire-signed-by-june-30',
        resolution_criteria:
          'This market resolves YES if a ceasefire agreement between Party A and Party B is signed on or before June 30, 23:59 UTC. Otherwise it resolves NO.',
        cutoff_timestamp: t - 90 * 24 * H,
        status: 'DISPUTED',
        registered_by: '0x2bd806c97F0e00aF1a1fC3328fA763a9269723C8',
        registered_at: t - 30 * H,
        outcome: '',
        active_dispute_id: '0xd15a...0001',
        resolved_at: 0,
      },
      dispute: {
        ...base,
        dispute_id: '0xd15a...0001',
        market_id: '0x5a1e...ceasefire',
        reporter: '0x2bd806c97F0e00aF1a1fC3328fA763a9269723C8',
        verdict: 'OUTCOME_AMBIGUOUS_SPLIT_50_50',
        rationale:
          'The literal criterion is technically satisfied: the evidence reports both delegations signed a ceasefire on June 12, before June 30. But the same report says shelling resumed 10 minutes later and both sides declared the agreement void, undermining whether the intended real-world outcome, a functioning ceasefire, actually occurred.',
        confidence_bps: 9200,
        sources_read: 2,
        evidence_urls: ['https://www.reuters.com/world/ceasefire-signed', 'https://apnews.com/article/ceasefire-collapses'],
        evidence_hashes: ['0xcd3c2474ff3fb49aced905bd17236be1909ba66033fc10ed7d666191b0fd2c8e', '0x1aad173ea317eb8f30832943d212d6707a542b7757c3b87ca605e6200071fb11'],
        filed_at: t - 7 * H,
        challenge_deadline: t + 17 * H,
        status: 'ACTIVE_CHALLENGE',
      },
      excerpts: {
        'https://www.reuters.com/world/ceasefire-signed':
          'Both delegations signed the ceasefire text at 14:00 UTC on June 12 in the presence of mediators.',
        'https://apnews.com/article/ceasefire-collapses':
          'Shelling resumed at 14:10 UTC, ten minutes after the signing ceremony. By evening both sides had declared the agreement void.',
      },
    },
    {
      market: {
        market_id: '0x7b20...etf',
        market_url: 'https://polymarket.com/event/spot-etf-approved-q2',
        resolution_criteria:
          'Resolves YES if the SEC approves a spot ETF for Asset X by June 30. Approval means a signed order published on sec.gov; statements by commissioners do not count.',
        cutoff_timestamp: t - 60 * 24 * H,
        status: 'RESOLVED',
        registered_by: '0x81b637d8fCD2C6da6359E6963113a1170de795e4',
        registered_at: t - 80 * H,
        outcome: 'OUTCOME_NO',
        active_dispute_id: '',
        resolved_at: t - 30 * H,
      },
      dispute: {
        ...base,
        dispute_id: '0xd15a...0002',
        market_id: '0x7b20...etf',
        reporter: '0x81b637d8fCD2C6da6359E6963113a1170de795e4',
        verdict: 'OUTCOME_YES',
        rationale: 'Multiple outlets report the ETF as approved before the cutoff.',
        confidence_bps: 7400,
        sources_read: 1,
        evidence_urls: ['https://www.coindesk.example/markets/etf-approved'],
        evidence_hashes: ['0xcdd19794c27dea397aade80db25e34df5e4d95bd5f698b96b1a127bc581c3929'],
        filed_at: t - 72 * H,
        challenge_deadline: t - 48 * H,
        status: 'OVERTURNED',
        challenged: true,
        challenger: '0x3c4FF52dbb8355aBF699a1c47FCc71e0bF18E515',
        counter_bond: '4000000000000000000',
        counter_evidence_urls: ['https://www.sec.gov/rules/sro/order-2026-117'],
        counter_evidence_hashes: ['0x5eba61865629499bd29a82a4c49bbee2f80222f66457caff5b1023baade01640'],
        challenge_verdict: 'OUTCOME_NO',
        challenge_rationale:
          'The criteria require a signed order on sec.gov. The primary register shows the order was signed on July 2, after the cutoff; earlier media reports described a commissioner statement, which the criteria exclude.',
        challenge_confidence_bps: 9500,
        final_verdict: 'OUTCOME_NO',
        settled_at: t - 30 * H,
      },
      excerpts: {
        'https://www.coindesk.example/markets/etf-approved':
          'A commissioner said on June 28 that approval was "effectively done".',
        'https://www.sec.gov/rules/sro/order-2026-117': 'Order granting approval ... By the Commission. Dated: July 2.',
      },
    },
    {
      market: {
        market_id: '0x3c91...summit',
        market_url: 'https://polymarket.com/event/leaders-meet-before-august',
        resolution_criteria: 'Resolves YES if Leader A and Leader B meet in person before August 1, 00:00 UTC.',
        cutoff_timestamp: t - 20 * 24 * H,
        status: 'DISPUTED',
        registered_by: '0x81b637d8fCD2C6da6359E6963113a1170de795e4',
        registered_at: t - 3 * H,
        outcome: '',
        active_dispute_id: '0xd15a...0003',
        resolved_at: 0,
      },
      dispute: {
        ...base,
        dispute_id: '0xd15a...0003',
        market_id: '0x3c91...summit',
        reporter: '0x81b637d8fCD2C6da6359E6963113a1170de795e4',
        verdict: '',
        rationale: 'no evidence source readable',
        confidence_bps: 0,
        sources_read: 0,
        evidence_urls: ['https://www.ft.example/content/summit-held'],
        evidence_hashes: ['0x543840ef7696afd0940e9710eb4254e04dea345ebc1e51acfd117f2ea96df133'],
        filed_at: t - 2 * H,
        challenge_deadline: 0,
        status: 'PENDING_CONSENSUS',
      },
    },
  ]
}
