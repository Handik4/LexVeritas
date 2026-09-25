"""Shared harness for the LexVeritas direct-mode suite.

The direct runner executes the contract in-process but does not move native
value: `vm.value` is visible to the contract as gl.message.value, yet no
balance is credited, and emitted transfers are dropped. `Chain` closes that gap
so the solvency tests measure real balances rather than the contract's own
bookkeeping:

  * a payable call credits the contract (and debits the sender) BEFORE the
    call, the way GenVM credits a transaction's value before execution, and
    undoes it if the call reverts;
  * every EmitInternalMessage transfer is captured and applied only after the
    call returns successfully, the way an on="finalized" transfer settles after
    the transaction.

LLM mocks are double-encoded on purpose: the harness JSON-decodes a mocked
reply once, while this SDK's exec_prompt(response_format="json") expects the
raw JSON text, exactly as a live model returns it.
"""

import json
from datetime import datetime, timezone

import pytest
from eth_hash.auto import keccak

CONTRACT = "contracts/lex_veritas.py"

ATTO = 10**18
DISPUTE_BOND = 2 * ATTO
COUNTER_BOND = 4 * ATTO
WINDOW = 24 * 60 * 60
STALE = 6 * 60 * 60

YES = "OUTCOME_YES"
NO = "OUTCOME_NO"
SPLIT = "OUTCOME_AMBIGUOUS_SPLIT_50_50"
INVALID = "OUTCOME_INVALID_MARKET"

T0 = 1_750_000_000  # 2025-06-15T15:06:40Z, "now" at the start of every test
CUTOFF = T0 - 7 * 24 * 60 * 60

MARKET_URL = "https://polymarket.com/event/ceasefire-by-june-30"
CRITERIA = (
    "This market resolves YES if a ceasefire agreement between Party A and Party B "
    "is signed on or before the cutoff. Otherwise it resolves NO."
)

REUTERS = "https://www.reuters.com/world/ceasefire-signed"
AP = "https://apnews.com/article/ceasefire-talks"
GOV = "https://www.state.gov/briefings/ceasefire"
COUNTER_1 = "https://www.bbc.com/news/ceasefire-collapses"
COUNTER_2 = "https://www.aljazeera.com/news/ceasefire-broken"


def iso(ts: int) -> str:
    return datetime.fromtimestamp(ts, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def keccak_hex(s: str) -> str:
    return "0x" + keccak(s.encode("utf-8")).hex()


def page(text: str, status: int = 200) -> dict:
    return {"status": status, "body": f"<html><body><article>{text}</article></body></html>"}


def ruling(verdict: str, rationale: str = "Decisive reporting cited.", confidence=0.9) -> str:
    return json.dumps(json.dumps({"verdict": verdict, "rationale": rationale, "confidence": confidence}))


def raw_llm(obj) -> str:
    """Mock an arbitrary LLM reply (object or already-serialized text)."""
    return json.dumps(obj if isinstance(obj, str) else json.dumps(obj))


class Chain:
    def __init__(self, vm, contract):
        self.vm = vm
        self.c = contract
        self.addr = vm._contract_address
        self.pending = []
        self.prompts = []
        vm._gl_call_hook = self._hook
        original_match = vm._match_llm_mock

        def recording_match(prompt):
            self.prompts.append(prompt)
            return original_match(prompt)

        vm._match_llm_mock = recording_match
        self.now = T0
        vm.warp(iso(T0))

    # ------------------------------------------------------------- balances
    def _hook(self, vm, req):
        msg = req.get("EmitInternalMessage")
        if msg is not None and not msg.get("calldata"):
            self.pending.append((bytes(msg["address"].as_bytes), int(msg["value"])))
            return {"ok": None}
        return None

    @staticmethod
    def key(who) -> bytes:
        return bytes(who.as_bytes) if hasattr(who, "as_bytes") else bytes(who)

    def bal(self, who) -> int:
        return self.vm._balances.get(self.key(who), 0)

    def contract_balance(self) -> int:
        return self.vm._balances.get(self.addr, 0)

    def _add(self, key: bytes, delta: int) -> None:
        self.vm._balances[key] = self.vm._balances.get(key, 0) + delta

    def fund(self, who, amount: int) -> None:
        self._add(self.key(who), amount)

    # ------------------------------------------------------------------ calls
    def call(self, method: str, *args, sender, value: int = 0):
        sender_key = self.key(sender)
        if value:
            if self.bal(sender) < value:
                raise AssertionError("test sender underfunded")
            self._add(sender_key, -value)
            self._add(self.addr, value)
        self.vm.sender = sender
        self.vm.value = value
        self.pending = []
        try:
            result = getattr(self.c, method)(*args)
        except BaseException:
            if value:
                self._add(sender_key, value)
                self._add(self.addr, -value)
            self.pending = []
            raise
        finally:
            self.vm.value = 0
        for to, amount in self.pending:
            self._add(self.addr, -amount)
            self._add(to, amount)
        self.pending = []
        return result

    def reverts(self, fragment: str, method: str, *args, sender, value: int = 0):
        before = (self.contract_balance(), self.bal(sender), json.dumps(self.c.get_accounting(), sort_keys=True))
        with self.vm.expect_revert(fragment):
            self.call(method, *args, sender=sender, value=value)
        after = (self.contract_balance(), self.bal(sender), json.dumps(self.c.get_accounting(), sort_keys=True))
        assert before == after, "a reverted call must leave no balance or ledger residue"

    def view(self, method: str, *args):
        return getattr(self.c, method)(*args)

    def warp(self, ts: int) -> None:
        self.now = ts
        self.vm.warp(iso(ts))

    # -------------------------------------------------------------- invariants
    def assert_solvent(self) -> dict:
        acc = self.c.get_accounting()
        staked = int(acc["total_staked_bonds"])
        uncollected = int(acc["uncollected_rewards"])
        assert acc["ledger_ok"] is True
        assert staked + uncollected == self.contract_balance(), acc
        assert acc["balance_matches"] is True
        return acc

    # ------------------------------------------------------------------ mocks
    def web(self, pattern: str, response: dict) -> None:
        self.vm.mock_web(pattern, response)

    def llm(self, pattern: str, reply: str) -> None:
        self.vm.mock_llm(pattern, reply)

    def clear(self) -> None:
        self.vm._web_mocks.clear()
        self.vm._llm_mocks.clear()


@pytest.fixture
def chain(direct_vm, direct_deploy):
    contract = direct_deploy(CONTRACT)
    return Chain(direct_vm, contract)


@pytest.fixture
def funded(chain, direct_alice, direct_bob, direct_charlie):
    for who in (direct_alice, direct_bob, direct_charlie):
        chain.fund(who, 100 * ATTO)
    return chain


def standard_sources(chain) -> None:
    chain.web(r"reuters\.com", page("Party A and Party B signed a ceasefire agreement on June 1."))
    chain.web(r"apnews\.com", page("Negotiators confirmed the signed ceasefire text."))
    chain.web(r"state\.gov", page("The Department welcomes the signed ceasefire."))


def register(chain, sender, url: str = MARKET_URL, criteria: str = CRITERIA, cutoff: int = CUTOFF) -> str:
    return chain.call("register_market", url, criteria, cutoff, sender=sender)


def open_dispute(chain, reporter, verdict: str = YES, urls=None, confidence=0.9, market_id=None) -> tuple:
    """Register (if needed) and dispute a market; returns (market_id, dispute_id)."""
    if market_id is None:
        market_id = register(chain, reporter)
    standard_sources(chain)
    chain.llm(r"ROUND 1", ruling(verdict, confidence=confidence))
    dispute_id = chain.call(
        "raise_dispute", market_id, urls or [REUTERS, AP], sender=reporter, value=DISPUTE_BOND
    )
    return market_id, dispute_id
