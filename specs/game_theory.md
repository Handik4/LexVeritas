# LexVeritas Game Theory

Version 0.3.0 (security-review revision). All amounts in GEN. `B` is the
market's dispute bond, set at registration (default and floor 2, cap 100,000).
`C = 2B` is the counter bond.

This document states the payoffs as the code implements them, derives when
each action is rational, and lists where the equilibrium is weak. It does not
claim the mechanism is incentive-compatible in every case; section 5 lists the
cases where it is not.

---

## 1. Who does what

| Actor | Action | Stake | Can lose |
|---|---|---|---|
| Market registrant | `register_market` (chooses `B`) | 0 | nothing |
| Reporter | `raise_dispute` | B | B, if overturned |
| Challenger | `challenge_verdict` | C | C, if round 2 agrees with round 1 |
| Anyone | `finalize_resolution` | 0 | gas only |
| Validators | run arbitration | GenLayer validator stake | slashed by GenLayer's own appeal mechanism, not by this contract |

The reporter does **not** choose the verdict. They supply evidence; the
validators' models decide. Being "correct" means that the final consensus
verdict is the one your stake backed:

* the reporter backs the round-1 verdict;
* the challenger backs "round 1 is wrong".

## 2. Payoff table (as implemented in `finalize_resolution`)

| Path | Reporter net | Challenger net | Contract net |
|---|---|---|---|
| Unchallenged, finalized | 0 (B returned) | n/a | 0 |
| Challenged, round 2 == round 1 (`FINALIZED`) | +C = +2B | -C = -2B | 0 |
| Challenged, round 2 != round 1 (`OVERTURNED`) | -B | +B | 0 |
| No readable source (reverts, nothing stored) | fees only; B returned at finalization | n/a | 0 |

There is no protocol fee, no treasury and no minting. The contract's net is
zero on every path, which is the accounting invariant seen from the payoff side.

## 3. When is challenging rational?

Let `q` be the challenger's belief that round 2 will differ from round 1.

```
E[challenge] = q * (+B) + (1 - q) * (-2B) = B(3q - 2)
```

`E > 0` iff `q > 2/3`, whatever `B` is. The 2x counter bond means a challenger
must believe the round-1 verdict is wrong with better than two-to-one odds.
That threshold is the main anti-griefing lever: a coin-flip challenge loses
`B/2` in expectation.

For the reporter, once challenged:

```
E[reporter | challenged] = (1 - q) * (+2B) + q * (-B) = B(2 - 3q)
```

The reporter's position is favourable exactly when the challenger's is not.
The game is zero-sum between the two bonded parties.

## 3a. Why the registrant sets B, and why B is exact

With a fixed 2 GEN bond, the cost of contesting a verdict is the same for a
market holding 1,000 GEN and one holding 10,000,000 GEN. On the large market,
2 GEN buys a lottery ticket on round-2 model variance (section 5, weakness 1),
and 2 GEN is too little to make a dishonest reporter's curated evidence
expensive. The security review (High 2) asked for scaling. The registrant knows
the market's size, so the registrant sets `B`:

* **`B` is bound into `market_id`.** Otherwise a squatter could pre-register the
  honest criteria at `B = 2` on a high-value market and take the id the honest
  registrant wanted. With the bond in the id, the two are different markets, and
  consumers bind to the id of the terms they display.
* **`B` is exact, not a minimum.** If reporters could post more than `B`, the
  counter bond `2 x posted` would let a well-funded reporter set the price of
  disagreement. A reporter posting 1,000 GEN on a 2 GEN market would need a
  2,000 GEN challenger, which is a way to buy an unchallengeable round 1.
* **Floor 2 GEN, cap 100,000 GEN.** Below the floor, disputes are near-free
  spam. Above the cap a market is effectively undisputable, and a registrant
  should say so explicitly rather than hide it in the bond.

## 4. Why report at all?

An unchallenged dispute pays the reporter nothing beyond their bond back. The
reporter's incentive is outside the contract: they hold a position in the
market and want it settled correctly, or they are a market operator that
needs a credible resolution. The bond exists to price spam, not to reward
reporting.

This is a deliberate choice. A fixed reward for unchallenged disputes would
have to come from somewhere (a fee on the market, or a treasury), and it would
pay reporters for disputes nobody contested, which invites filing on markets
that were never in doubt.

A consuming protocol that wants to reward reporters can do so from its own
fees by reading `get_dispute` after resolution.

## 5. Equilibrium and where it is weak

**Honest equilibrium.** If validators' consensus verdict tracks the literal
criteria applied to public reporting, then:

* a reporter with good evidence expects no challenge and loses nothing;
* a challenger only acts when round 1 looks wrong with `q > 2/3`;
* a challenger facing a correct round 1 has `q` small and stays out.

**Weaknesses, stated plainly.**

1. **Model variance on borderline cases.** On a genuinely ambiguous fact
   pattern, two independent rounds may land on different verdicts (for example
   `SPLIT` in round 1 and `NO` in round 2) from model noise alone. If the
   disagreement rate between rounds exceeds 2/3 for some class of case, a
   challenger profits from noise rather than truth. The low-confidence rule
   (binary verdicts below 0.5 confidence become `SPLIT`) narrows this band but
   does not close it.
2. **Evidence curation.** The reporter chooses up to three URLs. Cherry-picked
   sources can steer round 1. The defence is round 2, which reads both sides'
   evidence, but only if someone challenges. A market with no attentive
   counterparty can be resolved on one-sided evidence.
3. **Late challenge race.** A challenge submitted near the deadline can land
   after it and revert. The window is 24h to make this a marginal concern, but
   it is not zero.
4. **Dead-link griefing (fixed).** In the previous revision a reporter could
   cite dead URLs and park a market in a stored `PENDING_CONSENSUS` state for up
   to 6h, repeatably. Now an unreadable round 1 reverts. Nothing is stored, the
   market stays `OPEN`, and the next honest reporter can dispute in the same
   block. The griefer pays transaction fees (about 0.00008 GEN measured on
   Studio Next) and gets the bond back at finalization. There is no lock left to
   buy.
4a. **Stealth edits.** A source edited after round 1 could rewrite the record
   for round 2. Round 2 is now told which sources changed (content hashes).
   The hashes are leader-attested, so a dishonest round-1 leader could plant a
   false "modified" notice. The notice only asks the model to weigh the source
   with care, and the verdict rule is unchanged.
5. **No in-contract appeal beyond round 2.** Round 2 is final inside the
   contract. GenLayer's native appeal mechanism still applies to each
   transaction (a disputed `challenge_verdict` transaction can be appealed to a
   larger validator set), which is the escalation path for a bad round 2.
6. **Finalizer is unpaid.** `finalize_resolution` pays no bounty. The winner
   has every reason to call it, so this is only a liveness concern if the
   winner disappears.

## 6. Bribery resistance compared with token voting

In a token-voting oracle, corrupting an outcome means buying or bribing enough
voting weight, and the vote is on the outcome directly. Voters face no
per-vote cost for voting with the briber, and a bribe is cheap relative to a
large market.

In LexVeritas an attacker must make a majority of the validators selected for
the transaction return the attacker's verdict. Each validator fetches the
evidence itself and runs its own model on it. The attacker has three routes:

* **Bribe validators.** Validators are GenLayer stakers who can be appealed and
  slashed by the protocol. A bribe must cover that expected loss for a
  majority of a randomly selected set, and again for every appeal round.
* **Corrupt the sources.** This means changing what Reuters, AP or a primary
  register publishes, or controlling the domain a reporter cites. The first is
  impractical. The second is why sources are tier-labelled and why round 2
  reads both sides.
* **Inject the prompt.** Section 6 of `architecture.md` covers the defence and
  the tests.

None of these is impossible. All three cost more than buying governance tokens
on the open market, and none is invisible: the evidence URLs and their hashes
are on chain, and anyone can re-read them.

## 7. Invariants

| ID | Invariant | Enforced by |
|---|---|---|
| I1 | `staked + uncollected == deposited - withdrawn` | `_check_invariant`, every write |
| I2 | `balance == staked + uncollected` between transactions | `get_accounting`, `test_strict_accounting_solvency_invariant` |
| I3 | Value only moves staked -> uncollected -> withdrawn; nothing is created or destroyed | `_take_deposit`, `_release_to`, `claim` are the only writers; randomized conservation test |
| I4 | A settled pot equals exactly the bonds staked on that dispute (`B` or `3B`) | `finalize_resolution` (`pot = bond + counter_bond`) |
| I5 | `claim` never emits more than the contract holds | `balance >= amount` guard |
| I6 | At most one non-terminal dispute per market | market `active_dispute_id` gate |
| I7 | A resolved market's outcome never changes | no transition out of `RESOLVED` |
| I8 | The challenge deadline is written once | only `raise_dispute` writes it, when the dispute is created |
| I9 | Every dispute on a market posts exactly the market's `B`; every challenge exactly `2B` | exact-value checks in `raise_dispute`, `challenge_verdict` |
| I10 | No stored dispute is ever without a verdict | unreadable round 1 reverts before any effect |
