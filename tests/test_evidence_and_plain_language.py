"""BNB Chain: what was found, what was read, and what was not.

This service reaches for UNKNOWN more than the others, and honestly so. Its
live path builds a report from on-chain metadata and a DEX pair; it never
resolves a deployer and never reads the contract's functions. So on a live scan
half the dimensions are genuinely uncollected -- and until now the response
said `GOOD` with no hint that half the checks had not run.

The rule the whole scanner keeps relearning: a dimension we did not read is
UNKNOWN, and UNKNOWN is neither clean nor guilty.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "api"))
sys.path.insert(0, str(ROOT / "chains" / "bnb"))

from evidence import build_evidence  # noqa: E402
from plain_language import FINDING, GAP, REFUSAL, describe, not_established  # noqa: E402

REASSURANCE = "not evidence against the token"


def _record(**overrides) -> dict:
    record = {
        "address": "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
        "token_name": "Wrapped BNB", "symbol": "WBNB",
        "rug_score": 12, "rug_status": "LOW",
        "speculation_score": 6, "speculation_status": "LOW",
        "has_liquidity_evidence": True, "liquidity_usd": 40_000_000.0,
        "is_known_chain_asset": True, "deployer": None, "label": "GOOD",
    }
    record.update(overrides)
    return record


def _described(**overrides) -> dict:
    record = _record(**overrides)
    payload = dict(record)
    payload["evidence"] = build_evidence(record)
    payload.update(describe(payload))
    return payload


# --- a clean answer must not hide how little was checked -------------------

def test_a_good_verdict_says_how_much_of_the_check_ran():
    """"Nothing found in what was checked" hides the size of what was checked,
    and here that is routinely half."""
    result = _described()
    assert "50% of the checks ran" in result["verdict_summary"]
    assert "creator history" in result["verdict_summary"]


def test_a_complete_check_adds_no_coverage_clause():
    result = _described(deployer="0xabc", creator="0xabc",
                        v6={"backdoor": {"backdoor_functions": [], "has_backdoor": False}})
    assert "checks ran" not in result["verdict_summary"]


# --- absent is not clean ---------------------------------------------------

def test_an_unresolved_deployer_is_uncollected_not_clean():
    evidence = build_evidence(_record())
    assert evidence["creator_history"]["status"] == "NOT_COLLECTED"
    assert evidence["creator_history"]["prior_danger_rate_pct"] is None
    assert "what this deployer's previous tokens did" in not_established(
        {"evidence": evidence})


def test_unread_contract_functions_are_not_reported_as_none_found():
    evidence = build_evidence(_record())
    assert evidence["technical_controls"]["status"] == "UNKNOWN"
    assert evidence["technical_controls"]["has_backdoor"] is None


def test_a_missing_pair_is_an_absence_of_market_evidence():
    evidence = build_evidence(_record(has_liquidity_evidence=False, liquidity_usd=None))
    assert evidence["market"]["status"] == "UNKNOWN"
    assert "how deep this token's market is" in not_established({"evidence": evidence})


def test_size_is_never_read_as_identity():
    """A token can be large, widely held and controlled by someone nobody has
    identified. Curation is the only basis here."""
    evidence = build_evidence(_record(is_known_chain_asset=False, liquidity_usd=10**9))
    assert evidence["issuer_identity"]["recognised"] is False
    assert evidence["issuer_identity"]["basis"] == "curated_list"


# --- the two readings behind one label -------------------------------------

def test_a_market_driven_warning_says_it_is_the_market():
    result = _described(label="WARN", rug_status="LOW", speculation_status="HIGH",
                        is_known_chain_asset=False)
    assert "state of the pool today" in result["verdict_summary"]
    assert "not a claim about the contract" in result["verdict_summary"]


def test_a_rug_finding_is_not_blamed_on_the_market():
    result = _described(label="DANGER", rug_status="HIGH", speculation_status="LOW")
    assert result["verdict_basis"] == FINDING
    assert "pool today" not in result["verdict_summary"]


# --- the detector's word is not repeated -----------------------------------

def test_a_matched_function_name_is_not_announced_as_a_proven_power():
    """The matcher raises has_drain_function on any name containing
    "withdraw", which is the unwrap on a wrapped native."""
    result = _described(
        is_known_chain_asset=False, label="WARN",
        v6={"backdoor": {"has_drain_function": True,
                         "backdoor_functions": ["withdraw(uint256)"]}})
    assert "withdraw(uint256)" in result["verdict_summary"]
    assert "matched by name, not by reading what it does" in result["verdict_summary"]
    assert "drain" not in result["verdict_summary"].lower()


# --- the sentence that must not appear where it does not belong ------------

def test_insufficient_data_is_never_softened():
    result = _described(label="UNKNOWN", rug_status="INSUFFICIENT_DATA",
                        speculation_status="INSUFFICIENT_DATA",
                        has_liquidity_evidence=False, liquidity_usd=None)
    assert result["verdict_basis"] == REFUSAL
    assert REASSURANCE not in result["verdict_summary"]
    assert "not a clean bill of health" in result["verdict_summary"]


def test_the_gap_list_says_each_thing_once():
    result = _described()
    assert len(result["not_established"]) == len(set(result["not_established"]))


def test_describing_a_verdict_cannot_change_it():
    payload = dict(_record())
    payload["evidence"] = build_evidence(payload)
    before = dict(payload)
    result = describe(payload)
    assert payload == before
    assert set(result) == {"verdict_summary", "verdict_basis", "not_established"}
