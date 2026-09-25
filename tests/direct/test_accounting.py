"""Accounting invariant and bond solvency.

Every check measures the contract's simulated native balance (see Chain in
conftest.py) against its ledger, so a bookkeeping bug that the contract's own
_check_invariant could not see -- because the ledger and the ledger agree --
still fails here.
"""

import random

import pytest

from conftest import (
    ATTO,
    COUNTER_1,
    COUNTER_2,
    COUNTER_BOND,
    CRITERIA,
    CUTOFF,
    DISPUTE_BOND,
    GOV,
    NO,
    REUTERS,
    AP,
    SPLIT,
    STALE,
    T0,
    WINDOW,
    YES,
    page,
    ruling,
    standard_sources,
)


def total_value(chain, accounts) -> int:
    return chain.contract_balance() + sum(chain.bal(a) for a in accounts)


def test_strict_accounting_solvency_invariant(funded, direct_alice, direct_bob, direct_charlie):
    """Zero-leak: across a full lifecycle mixing every settlement path, the
    contract's balance equals staked bonds plus uncollected rewards after every
    single transaction, total value is conserved, and once everyone has claimed
    the contract holds exactly zero."""
    chain = funded
    people = (direct_alice, direct_bob, direct_charlie)
    genesis = total_value(chain, people)

    def step():
        chain.assert_solvent()
        assert total_value(chain, people) == genesis

    step()
    standard_sources(chain)
    chain.web(r"bbc\.com|aljazeera\.com", page("The truce collapsed minutes later."))
    chain.llm(r"ROUND 1", ruling(YES))
    chain.llm(r"ROUND 2", ruling(NO))

    # Market 1: unchallenged, finalized after the window.
    m1 = chain.call("register_market", "https://polymarket.com/event/m1", CRITERIA, CUTOFF, sender=direct_alice)
    step()
    d1 = chain.call("raise_dispute", m1, [REUTERS], sender=direct_alice, value=DISPUTE_BOND)
    step()

    # Market 2: challenged and overturned.
    m2 = chain.call("register_market", "https://polymarket.com/event/m2", CRITERIA, CUTOFF, sender=direct_bob)
    d2 = chain.call("raise_dispute", m2, [AP], sender=direct_bob, value=DISPUTE_BOND)
    step()
    chain.call("challenge_verdict", d2, [COUNTER_1], sender=direct_charlie, value=COUNTER_BOND)
    step()
    acc = chain.assert_solvent()
    assert int(acc["total_staked_bonds"]) == 2 * DISPUTE_BOND + COUNTER_BOND

    # Market 3: sources down -> pending -> released as stale.
    m3 = chain.call("register_market", "https://polymarket.com/event/m3", CRITERIA, CUTOFF, sender=direct_charlie)
    chain.web(r"deadsource\.org", {"status": 503, "body": ""})
    d3 = chain.call("raise_dispute", m3, ["https://deadsource.org/x"], sender=direct_charlie, value=DISPUTE_BOND)
    step()
    assert chain.view("get_dispute", d3)["status"] == "PENDING_CONSENSUS"

    chain.call("finalize_resolution", d2, sender=direct_alice)
    step()
    chain.warp(T0 + STALE)
    chain.call("release_stale_dispute", d3, sender=direct_alice)
    step()
    chain.warp(T0 + WINDOW)
    chain.call("finalize_resolution", d1, sender=direct_bob)
    step()

    acc = chain.assert_solvent()
    assert int(acc["total_staked_bonds"]) == 0
    assert int(acc["uncollected_rewards"]) == 2 * DISPUTE_BOND + COUNTER_BOND + DISPUTE_BOND

    # Everyone pulls; the contract is left holding exactly nothing.
    chain.call("claim", sender=direct_alice)  # d1: own bond back
    step()
    chain.call("claim", sender=direct_charlie)  # d2 pot + d3 refund
    step()
    chain.reverts("nothing to claim", "claim", sender=direct_bob)  # bob was slashed on d2
    step()

    acc = chain.assert_solvent()
    assert chain.contract_balance() == 0
    assert int(acc["total_staked_bonds"]) == 0 and int(acc["uncollected_rewards"]) == 0
    assert int(acc["total_deposited"]) == int(acc["total_withdrawn"]) == 3 * DISPUTE_BOND + COUNTER_BOND

    # Net effect per participant: bob lost exactly his dispute bond to charlie.
    assert chain.bal(direct_alice) == 100 * ATTO
    assert chain.bal(direct_bob) == 100 * ATTO - DISPUTE_BOND
    assert chain.bal(direct_charlie) == 100 * ATTO + DISPUTE_BOND


def test_claim_is_pull_only_and_single_use(funded, direct_alice, direct_bob):
    chain = funded
    standard_sources(chain)
    chain.llm(r"ROUND 1", ruling(NO))
    m = chain.call("register_market", "https://polymarket.com/event/c", CRITERIA, CUTOFF, sender=direct_alice)
    d = chain.call("raise_dispute", m, [REUTERS], sender=direct_alice, value=DISPUTE_BOND)
    chain.reverts("nothing to claim", "claim", sender=direct_alice)  # still staked
    chain.warp(T0 + WINDOW)
    chain.call("finalize_resolution", d, sender=direct_bob)
    chain.reverts("nothing to claim", "claim", sender=direct_bob)  # finalizer earns nothing
    assert chain.call("claim", sender=direct_alice) == str(DISPUTE_BOND)
    chain.reverts("nothing to claim", "claim", sender=direct_alice)  # no double claim
    chain.assert_solvent()


def test_claim_refuses_when_underfunded(funded, direct_alice):
    chain = funded
    standard_sources(chain)
    chain.llm(r"ROUND 1", ruling(YES))
    m = chain.call("register_market", "https://polymarket.com/event/u", CRITERIA, CUTOFF, sender=direct_alice)
    d = chain.call("raise_dispute", m, [REUTERS], sender=direct_alice, value=DISPUTE_BOND)
    chain.warp(T0 + WINDOW)
    chain.call("finalize_resolution", d, sender=direct_alice)
    # Simulate an external drain: the contract must not emit a transfer it
    # cannot cover, and the claimable balance must survive for a later retry.
    chain.vm._balances[chain.addr] = DISPUTE_BOND - 1
    with chain.vm.expect_revert("balance below claim"):
        chain.call("claim", sender=direct_alice)
    assert chain.view("get_accounting")["balance_matches"] is False
    chain.vm._balances[chain.addr] = DISPUTE_BOND
    assert chain.call("claim", sender=direct_alice) == str(DISPUTE_BOND)
    chain.assert_solvent()


def test_reverted_paths_leave_no_residue(funded, direct_alice, direct_bob):
    """Every revert point precedes every effect, so failures cannot leak value
    or leave a half-written dispute behind."""
    chain = funded
    m = chain.call("register_market", "https://polymarket.com/event/r", CRITERIA, CUTOFF, sender=direct_alice)
    chain.web(r"reuters\.com", page("fine"))
    chain.llm(r"ROUND 1", '"not json"')
    chain.reverts("[LLM_ERROR]", "raise_dispute", m, [REUTERS], sender=direct_alice, value=DISPUTE_BOND)
    chain.reverts("dispute bond", "raise_dispute", m, [REUTERS], sender=direct_alice, value=COUNTER_BOND)
    assert chain.view("get_counts")["disputes"] == 0
    assert chain.view("get_market", m)["status"] == "OPEN"
    chain.assert_solvent()
    assert chain.contract_balance() == 0


def test_view_reports_the_formula(funded, direct_alice):
    chain = funded
    acc = chain.view("get_accounting")
    for key in ("total_staked_bonds", "uncollected_rewards", "liabilities", "balance", "total_deposited", "total_withdrawn"):
        assert acc[key] == "0"
    assert acc["ledger_ok"] is True and acc["balance_matches"] is True


@pytest.mark.parametrize("seed", range(6))
def test_randomized_lifecycles_conserve_value(funded, direct_alice, direct_bob, direct_charlie, seed):
    """Property check: random interleavings of every write path never break
    balance == staked + uncollected, and value is conserved throughout."""
    chain = funded
    rng = random.Random(seed)
    people = [direct_alice, direct_bob, direct_charlie]
    genesis = total_value(chain, people)
    chain.web(r"reuters\.com|apnews\.com|state\.gov|bbc\.com|aljazeera\.com", page("reporting"))
    chain.web(r"deadsource\.org", {"status": 503, "body": ""})
    verdicts = [YES, NO, SPLIT]
    chain.llm(r"ROUND 1", ruling(rng.choice(verdicts)))
    chain.llm(r"ROUND 2", ruling(rng.choice(verdicts)))

    now = T0
    open_markets, disputes = [], []
    ok = {}
    actions = ["register", "dispute", "challenge", "finalize", "release", "claim", "wait"]
    weights = [2, 5, 4, 3, 2, 3, 2]
    for i in range(40):
        action = "register" if not open_markets else rng.choices(actions, weights)[0]
        who = rng.choice(people)
        try:
            if action == "register":
                open_markets.append(
                    chain.call("register_market", f"https://polymarket.com/event/s{seed}-{i}", CRITERIA, CUTOFF, sender=who)
                )
            elif action == "dispute" and open_markets:
                src = rng.choice([REUTERS, "https://deadsource.org/x"])
                disputes.append(chain.call("raise_dispute", rng.choice(open_markets), [src], sender=who, value=DISPUTE_BOND))
            elif action == "challenge" and disputes:
                chain.call("challenge_verdict", rng.choice(disputes), [rng.choice([COUNTER_1, COUNTER_2, GOV])], sender=who, value=COUNTER_BOND)
            elif action == "finalize" and disputes:
                chain.call("finalize_resolution", rng.choice(disputes), sender=who)
            elif action == "release" and disputes:
                chain.call("release_stale_dispute", rng.choice(disputes), sender=who)
            elif action == "claim":
                chain.call("claim", sender=who)
            elif action == "wait":
                now += rng.choice([600, STALE, WINDOW])
                chain.warp(now)
            else:
                continue
            ok[action] = ok.get(action, 0) + 1
        except Exception:
            pass  # rejected transitions are expected; the invariant must hold regardless
        chain.assert_solvent()
        assert total_value(chain, people) == genesis

    # The walk must actually move money, not just bounce off guards.
    assert ok.get("dispute", 0) >= 1 and ok.get("challenge", 0) + ok.get("finalize", 0) + ok.get("claim", 0) >= 1, ok

    # Drain: close everything out and claim; the contract must end empty.
    chain.warp(now + WINDOW + STALE)
    for d in disputes:
        status = chain.view("get_dispute", d)["status"]
        if status == "ACTIVE_CHALLENGE":
            chain.call("finalize_resolution", d, sender=direct_alice)
        elif status == "PENDING_CONSENSUS":
            chain.call("release_stale_dispute", d, sender=direct_alice)
    for who in people:
        try:
            chain.call("claim", sender=who)
        except Exception:
            pass
    chain.assert_solvent()
    assert chain.contract_balance() == 0
    assert total_value(chain, people) == genesis
