"""Challenge window timelock and bonded counter-evidence (round 2)."""

import pytest

from conftest import (
    ATTO,
    AP,
    COUNTER_1,
    COUNTER_2,
    COUNTER_BOND,
    DISPUTE_BOND,
    GOV,
    NO,
    REUTERS,
    SPLIT,
    T0,
    WINDOW,
    YES,
    keccak_hex,
    open_dispute,
    page,
    ruling,
)


def counter_sources(chain) -> None:
    chain.web(r"bbc\.com", page("Hostilities resumed within minutes; officials say the deal never took effect."))
    chain.web(r"aljazeera\.com", page("Both sides accuse each other of breaking the truce ten minutes after signing."))


def challenge(chain, dispute_id, challenger, verdict, urls=None):
    counter_sources(chain)
    chain.llm(r"ROUND 2", ruling(verdict, "Round two weighed both sides.", 0.88))
    return chain.call(
        "challenge_verdict", dispute_id, urls or [COUNTER_1, COUNTER_2], sender=challenger, value=COUNTER_BOND
    )


# ------------------------------------------------------------------ bonding


def test_unbound_challenge_reverts(funded, direct_alice, direct_bob):
    chain = funded
    _, dispute_id = open_dispute(chain, direct_alice, YES)
    counter_sources(chain)
    chain.llm(r"ROUND 2", ruling(NO))

    # No bond, the dispute bond instead of 2x, and off-by-one amounts all revert.
    for value in (0, DISPUTE_BOND, COUNTER_BOND - 1, COUNTER_BOND + 1):
        chain.reverts("counter bond must be exactly", "challenge_verdict", dispute_id, [COUNTER_1], sender=direct_bob, value=value)

    # A bonded challenge with no evidence is still unbound to any claim.
    chain.reverts("counter evidence urls required", "challenge_verdict", dispute_id, [], sender=direct_bob, value=COUNTER_BOND)
    chain.reverts("unknown dispute", "challenge_verdict", "0xbeef", [COUNTER_1], sender=direct_bob, value=COUNTER_BOND)

    d = chain.view("get_dispute", dispute_id)
    assert d["challenged"] is False and d["counter_bond"] == "0"
    chain.assert_solvent()


def test_counter_bond_is_twice_the_dispute_bond(chain):
    cfg = chain.view("get_config")
    assert cfg["counter_bond_multiplier"] == 2 and int(cfg["default_dispute_bond"]) == DISPUTE_BOND
    assert COUNTER_BOND == 4 * ATTO and DISPUTE_BOND == 2 * ATTO


def test_counter_evidence_must_be_new_sources(funded, direct_alice, direct_bob):
    chain = funded
    _, dispute_id = open_dispute(chain, direct_alice, YES, urls=[REUTERS, AP])
    chain.llm(r"ROUND 2", ruling(NO))
    chain.reverts("must be new sources", "challenge_verdict", dispute_id, [COUNTER_1, AP], sender=direct_bob, value=COUNTER_BOND)
    chain.reverts("duplicate", "challenge_verdict", dispute_id, [COUNTER_1, COUNTER_1], sender=direct_bob, value=COUNTER_BOND)
    chain.reverts("https", "challenge_verdict", dispute_id, ["http://www.bbc.com/x"], sender=direct_bob, value=COUNTER_BOND)


def test_unreadable_counter_evidence_reverts_and_keeps_window(funded, direct_alice, direct_bob):
    chain = funded
    _, dispute_id = open_dispute(chain, direct_alice, YES)
    chain.web(r"bbc\.com", {"status": 404, "body": "not found"})
    chain.llm(r"ROUND 2", ruling(NO))
    chain.reverts("counter evidence unreadable", "challenge_verdict", dispute_id, [COUNTER_1], sender=direct_bob, value=COUNTER_BOND)
    d = chain.view("get_dispute", dispute_id)
    assert d["status"] == "ACTIVE_CHALLENGE" and d["challenged"] is False
    assert d["challenge_deadline"] == T0 + WINDOW
    chain.assert_solvent()


def test_reporter_cannot_self_challenge(funded, direct_alice):
    chain = funded
    _, dispute_id = open_dispute(chain, direct_alice, YES)
    counter_sources(chain)
    chain.llm(r"ROUND 2", ruling(NO))
    chain.reverts("reporter cannot challenge", "challenge_verdict", dispute_id, [COUNTER_1], sender=direct_alice, value=COUNTER_BOND)


def test_only_one_challenge_per_dispute(funded, direct_alice, direct_bob, direct_charlie):
    chain = funded
    _, dispute_id = open_dispute(chain, direct_alice, YES)
    challenge(chain, dispute_id, direct_bob, NO)
    chain.reverts("already challenged", "challenge_verdict", dispute_id, [GOV], sender=direct_charlie, value=COUNTER_BOND)


# ----------------------------------------------------------------- timelock


def test_challenge_window_boundary(funded, direct_alice, direct_bob):
    chain = funded
    _, dispute_id = open_dispute(chain, direct_alice, YES)
    counter_sources(chain)
    chain.llm(r"ROUND 2", ruling(NO))

    chain.warp(T0 + WINDOW)  # the deadline itself is already closed
    chain.reverts("challenge window closed", "challenge_verdict", dispute_id, [COUNTER_1], sender=direct_bob, value=COUNTER_BOND)
    chain.warp(T0 + WINDOW + 10 * 24 * 3600)
    chain.reverts("challenge window closed", "challenge_verdict", dispute_id, [COUNTER_1], sender=direct_bob, value=COUNTER_BOND)

    chain.warp(T0 + WINDOW - 1)  # last valid second
    assert chain.call("challenge_verdict", dispute_id, [COUNTER_1], sender=direct_bob, value=COUNTER_BOND) == NO


def test_finalize_respects_timelock(funded, direct_alice, direct_bob):
    chain = funded
    market_id, dispute_id = open_dispute(chain, direct_alice, YES)
    for ts in (T0, T0 + 3600, T0 + WINDOW - 1):
        chain.warp(ts)
        chain.reverts("challenge window still open", "finalize_resolution", dispute_id, sender=direct_bob)
    assert chain.view("get_market_outcome", market_id)["final"] is False

    chain.warp(T0 + WINDOW)
    assert chain.call("finalize_resolution", dispute_id, sender=direct_bob) == YES  # anyone may finalize
    d = chain.view("get_dispute", dispute_id)
    assert d["status"] == "FINALIZED" and d["final_verdict"] == YES
    assert d["settled_at"] == T0 + WINDOW
    out = chain.view("get_market_outcome", market_id)
    assert out["final"] is True and out["outcome"] == YES and out["yes_payout_bps"] == 10000

    # Immutable: no second finalization, no challenge after the fact.
    chain.reverts("not awaiting finalization", "finalize_resolution", dispute_id, sender=direct_bob)
    chain.reverts("not open for challenge", "challenge_verdict", dispute_id, [COUNTER_1], sender=direct_bob, value=COUNTER_BOND)


def test_deadline_is_fixed_at_filing(funded, direct_alice, direct_bob):
    """The countdown is immutable: nothing after filing moves it."""
    chain = funded
    _, dispute_id = open_dispute(chain, direct_alice, YES)
    deadline = chain.view("get_dispute", dispute_id)["challenge_deadline"]
    chain.warp(T0 + 5000)
    chain.web(r"bbc\.com", {"status": 500, "body": ""})
    chain.llm(r"ROUND 2", ruling(NO))
    chain.reverts("unreadable", "challenge_verdict", dispute_id, [COUNTER_1], sender=direct_bob, value=COUNTER_BOND)
    assert chain.view("get_dispute", dispute_id)["challenge_deadline"] == deadline == T0 + WINDOW


# -------------------------------------------------------------- settlement


def test_challenge_overturns_and_pays_challenger(funded, direct_alice, direct_bob, direct_charlie):
    chain = funded
    market_id, dispute_id = open_dispute(chain, direct_alice, YES)
    chain.warp(T0 + 600)
    assert challenge(chain, dispute_id, direct_bob, SPLIT) == SPLIT

    d = chain.view("get_dispute", dispute_id)
    assert d["challenged"] is True
    assert d["challenger"].lower() == chain_hex(chain, direct_bob).lower()
    assert d["counter_bond"] == str(COUNTER_BOND)
    assert d["counter_evidence_urls"] == [COUNTER_1, COUNTER_2]
    assert d["counter_evidence_hashes"] == [
        keccak_hex(chain.view("sanitize_preview", page("Hostilities resumed within minutes; officials say the deal never took effect.")["body"])),
        keccak_hex(chain.view("sanitize_preview", page("Both sides accuse each other of breaking the truce ten minutes after signing.")["body"])),
    ]
    assert d["stealth_edit_detected"] is False
    assert d["challenge_verdict"] == SPLIT
    assert d["challenge_confidence_bps"] == 8800
    assert d["status"] == "ACTIVE_CHALLENGE"

    # A challenged dispute is final after round 2 -- no need to wait out the window.
    before_alice, before_bob = chain.bal(direct_alice), chain.bal(direct_bob)
    assert chain.call("finalize_resolution", dispute_id, sender=direct_charlie) == SPLIT
    d = chain.view("get_dispute", dispute_id)
    assert d["status"] == "OVERTURNED" and d["final_verdict"] == SPLIT
    assert chain.view("get_market", market_id)["outcome"] == SPLIT

    chain.call("claim", sender=direct_bob)
    assert chain.bal(direct_bob) - before_bob == COUNTER_BOND + DISPUTE_BOND  # own bond + slashed reporter bond
    chain.reverts("nothing to claim", "claim", sender=direct_alice)
    assert chain.bal(direct_alice) == before_alice
    chain.assert_solvent()


def test_challenge_upheld_slashes_challenger(funded, direct_alice, direct_bob):
    chain = funded
    _, dispute_id = open_dispute(chain, direct_alice, YES)
    challenge(chain, dispute_id, direct_bob, YES)
    before = chain.bal(direct_alice)
    assert chain.call("finalize_resolution", dispute_id, sender=direct_bob) == YES
    assert chain.view("get_dispute", dispute_id)["status"] == "FINALIZED"
    chain.call("claim", sender=direct_alice)
    assert chain.bal(direct_alice) - before == DISPUTE_BOND + COUNTER_BOND
    chain.reverts("nothing to claim", "claim", sender=direct_bob)
    chain.assert_solvent()


def test_round_two_is_blind_to_round_one(funded, direct_alice, direct_bob):
    chain = funded
    marker = "ROUND-ONE-RATIONALE-MARKER"
    market_id = chain.call(
        "register_market", "https://polymarket.com/event/blind", "Resolves YES if X.", T0 - 100, sender=direct_alice
    )
    chain.web(r"reuters\.com", page("X was reported."))
    chain.llm(r"ROUND 1", ruling(YES, marker, 0.9))
    dispute_id = chain.call("raise_dispute", market_id, [REUTERS], sender=direct_alice, value=DISPUTE_BOND)
    challenge(chain, dispute_id, direct_bob, NO, urls=[COUNTER_1])

    round_two = chain.prompts[-1]
    assert "ROUND 2 (CHALLENGE REVIEW)" in round_two
    assert marker not in round_two
    # Both sides' evidence is present, each in its own tag.
    assert '<evidence side="reporter"' in round_two and '<evidence side="challenger"' in round_two
    assert "X was reported." in round_two and "Hostilities resumed" in round_two


def test_round_two_consensus_requires_counter_evidence_agreement(funded, direct_alice, direct_bob):
    chain = funded
    _, dispute_id = open_dispute(chain, direct_alice, YES)
    challenge(chain, dispute_id, direct_bob, NO)
    assert chain.vm.run_validator() is True
    # A validator that cannot read the counter evidence cannot endorse round 2.
    chain.clear()
    chain.web(r"reuters\.com|apnews\.com", page("signed"))
    chain.web(r"bbc\.com|aljazeera\.com", {"status": 404, "body": ""})
    chain.llm(r"ROUND 2", ruling(NO))
    assert chain.vm.run_validator() is False


@pytest.mark.parametrize("round_two, status, winner", [(YES, "FINALIZED", "reporter"), (NO, "OVERTURNED", "challenger")])
def test_settlement_matrix(funded, direct_alice, direct_bob, round_two, status, winner):
    chain = funded
    _, dispute_id = open_dispute(chain, direct_alice, YES)
    challenge(chain, dispute_id, direct_bob, round_two)
    chain.call("finalize_resolution", dispute_id, sender=direct_alice)
    assert chain.view("get_dispute", dispute_id)["status"] == status
    reporter_due = int(chain.view("claimable_of", chain_hex(chain, direct_alice)))
    challenger_due = int(chain.view("claimable_of", chain_hex(chain, direct_bob)))
    pot = DISPUTE_BOND + COUNTER_BOND
    assert (reporter_due, challenger_due) == ((pot, 0) if winner == "reporter" else (0, pot))


def chain_hex(chain, who) -> str:
    chain.vm.sender = who
    return chain.view("whoami")
