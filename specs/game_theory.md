# LexVeritas Game Theory

Version 0.3.0. All amounts in GEN. `B = 2` (dispute bond), `C = 2B = 4`
(counter bond).

This document states the payoffs as the code implements them, derives when
each action is rational, and lists where the equilibrium is weak. It does not
claim the mechanism is incentive-compatible in every case; section 5 lists the
cases where it is not.

---

## 1. Who does what

| Actor | Action | Stake | Can lose |
|---|---|---|---|
| Market registrant | `register_market` | 0 | nothing |
| Reporter | `raise_dispute` | B | B, if overturned |
| Challenger | `challenge_verdict` | C | C, if round 2 agrees with round 1 |
| Anyone | `finalize_resolution`, `retry_arbitration`, `release_stale_dispute` | 0 | gas only |
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
| Challenged, round 2 == round 1 (`FINALIZED`) | +C = +4 | -C = -4 | 0 |
| Challenged, round 2 != round 1 (`OVERTURNED`) | -B = -2 | +B = +2 | 0 |
| Sources unreadable, released (`WITHDRAWN`) | 0 (B refunded) | n/a | 0 |

There is no protocol fee, no treasury and no minting. The contract's net is
zero on every path, which is the accounting invariant seen from the payoff side.

## 3. When is challenging rational?

Let `q` be the challenger's belief that round 2 will differ from round 1.

```
E[challenge] = q * (+B) + (1 - q) * (-C) = 2q - 4(1 - q) = 6q - 4
```

`E > 0` iff `q > 2/3`. The 2x counter bond means a challenger must believe the
round-1 verdict is wrong with better than two-to-one odds. That threshold is
the main anti-griefing lever: a coin-flip challenge loses 1 GEN in expectation.

For the reporter, once challenged:

```
E[reporter | challenged] = (1 - q) * (+C) + q * (-B) = 4 - 6q
```

The reporter's position is favourable exactly when the challenger's is not.
The game is zero-sum between the two bonded parties.

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
4. **Stale-release griefing.** A reporter can name dead URLs, lock a market in
   `PENDING_CONSENSUS`, and have the bond fully refunded. Cost: gas plus 2 GEN
   of capital locked for up to 6h, after which anyone can release. Repeatable,
   so a determined griefer can delay a market at low cost. A future version
   could forfeit part of the bond after N failed retries.
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
| I4 | A settled pot equals exactly the bonds staked on that dispute | `finalize_resolution` (`pot = bond + counter_bond`) |
| I5 | `claim` never emits more than the contract holds | `balance >= amount` guard |
| I6 | At most one non-terminal dispute per market | market `active_dispute_id` gate |
| I7 | A resolved market's outcome never changes | no transition out of `RESOLVED` |
| I8 | The challenge deadline is written once | only `_apply_round_one` writes it |
