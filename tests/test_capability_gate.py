"""A possible power never scores, and never lets a token be called clean.

Review traced possible_powers -> powers -> scorer on this chain and asked for
that path to be removed, for independent findings to survive, and for a check
that did not finish to withhold GOOD. Three inputs, as asked: a selector alone,
a pattern proven from source, and a pattern left unresolved -- through the
collector's scorer, through the API's label, and through what a caller reads.
"""

from __future__ import annotations

import importlib
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "api"))
sys.path.insert(0, str(ROOT / "chains" / "bnb"))

import bnb_collector_v1 as collector  # noqa: E402
import contract_functions as functions  # noqa: E402

MINT = "40c10f19"
BURN_OTHERS = "9dc29fac"
OWNER = "8da5cb5b"
TOKEN = "0x55d398326f99059fF775485246999027B3197955"


def selector_only(*selectors: str) -> dict:
    return functions.read_bytecode("0x" + "".join(selectors) + "00" * 8)


def proven(*powers: str, selectors: tuple[str, ...] = (MINT,)) -> dict:
    """A reading where source established these powers. No source pass runs on
    this chain yet; the scorer must still honour one when it exists."""
    reading = selector_only(*selectors)
    reading["source_status"] = "OK"
    reading["source_read_powers"] = list(powers)
    return functions.settle_capability(reading)


def unresolved() -> dict:
    reading = selector_only(BURN_OTHERS)
    reading["source_status"] = "OK"
    reading["unread_restrictions"]["burn(address,uint256)"] = "modifier onlyMinter is not defined"
    return functions.settle_capability(reading)


def classify(backdoor: dict | None, holders: int = 5_000, cia: dict | None = None) -> tuple[str, list[str]]:
    v6 = {"concentration": {"concentration_risk": "LOW"}, "velocity": {"is_fast_rug": False}}
    if backdoor is not None:
        v6["backdoor"] = backdoor
    return collector.classify_BNB_token_v6(
        {"name": "Solid", "symbol": "SOLID", "holders_count": holders}, cia or {}, {}, v6, 5.0)


# --- the collector's scorer ---------------------------------------------------

def test_nothing_possible_is_good():
    assert classify(selector_only(OWNER)) == ("GOOD", [])


def test_a_selector_alone_scores_nothing_and_withholds_good():
    label, flags = classify(selector_only(MINT))
    assert label == "INSUFFICIENT_DATA"
    assert flags == [], "a possible power must not become a counted flag"


def test_a_selector_alone_scores_nothing_even_where_it_used_to_bite():
    """Before: mint on a token with under 10 holders was a hard danger signal,
    on the selector alone."""
    label, _flags = classify(selector_only(MINT), holders=5)
    assert label == "INSUFFICIENT_DATA"


def test_a_proven_power_scores():
    label, flags = classify(proven("mint"), holders=5)
    assert "Mint power read from published source" in flags
    assert label == "WARN"


def test_proven_powers_accumulate_to_danger():
    label, _flags = classify(proven("blacklist", "sweep"))
    assert label in ("WARN", "DANGER")
    assert label != "GOOD"


def test_an_unresolved_pattern_scores_nothing_and_withholds_good():
    label, flags = classify(unresolved())
    assert label == "INSUFFICIENT_DATA"
    assert not any("Burn" in flag for flag in flags)


def test_an_independent_finding_survives_the_gap():
    """Missing confirmation does not clear a token, and does not hide what else
    was found."""
    label, _flags = classify(selector_only(MINT), cia={
        "wash": {"wash_detected": True}, "cluster": {"is_bot_farm": True}})
    assert label == "DANGER"


def test_no_contract_reading_at_all_withholds_good():
    assert classify(None)[0] == "INSUFFICIENT_DATA"


def test_booleans_from_an_old_reading_do_not_score():
    """Stored records carry has_mint_function set by a selector. Only
    source_read_powers counts."""
    old = selector_only(OWNER)
    old.update({"has_mint_function": True, "has_blacklist": True, "powers": ["mint", "blacklist"],
                "backdoor_risk_score": 40})
    assert classify(old) == ("GOOD", [])


# --- the API: what a caller sees ------------------------------------------------

@pytest.fixture()
def server(monkeypatch):
    monkeypatch.setenv("RUGBUSTER_API_KEY", "")
    import api.server as srv
    importlib.reload(srv)
    srv.SCAN_CACHE.clear()
    return srv


def _live(backdoor: dict) -> dict:
    return {"address": TOKEN, "rug_status": "LOW", "speculation_status": "LOW",
            "v6": {"backdoor": backdoor}}


def test_the_caller_sees_a_withheld_answer_and_why(server):
    body = server.compact_score_response(_live(selector_only(MINT)), "live_scan")
    assert body["label"] == "INSUFFICIENT_DATA"
    assert body["blocking_data_gaps"] == ["contract_capability"]
    assert body["verdict_basis"] == "REFUSAL"
    assert "not established" in body["verdict_summary"]


def test_the_caller_sees_good_when_nothing_was_left_unsettled(server):
    body = server.compact_score_response(_live(selector_only(OWNER)), "live_scan")
    assert body["label"] == "GOOD"
    assert body["blocking_data_gaps"] == []


def test_an_unresolved_pattern_reaches_the_caller_as_a_gap(server):
    body = server.compact_score_response(_live(unresolved()), "live_scan")
    assert body["label"] == "INSUFFICIENT_DATA"
    assert body["blocking_data_gaps"] == ["contract_capability"]


def test_a_stored_good_label_does_not_survive_an_unsettled_check(server):
    """Collector records written before this change carry flat fields and a
    label computed without the gate."""
    record = {"contract_address": TOKEN, "label": "GOOD",
              "v6_backdoor_functions": ["mint(address,uint256)"], "v6_is_proxy": False}
    body = server.compact_score_response(record, "postgres_cache")
    assert body["label"] == "INSUFFICIENT_DATA"


def test_a_stored_good_label_with_nothing_possible_stands(server):
    record = {"contract_address": TOKEN, "label": "GOOD",
              "v6_backdoor_functions": ["owner()"], "v6_is_proxy": False}
    assert server.compact_score_response(record, "postgres_cache")["label"] == "GOOD"


def test_a_stored_danger_label_is_left_alone(server):
    record = {"contract_address": TOKEN, "label": "DANGER",
              "v6_backdoor_functions": ["mint(address,uint256)"]}
    assert server.compact_score_response(record, "postgres_cache")["label"] == "DANGER"


def _chain(code: bytes | None = None, error: BaseException | None = None):
    class _Call:
        def __init__(self, value):
            self.value = value

        def call(self):
            return self.value

    class _Functions:
        name = staticmethod(lambda: _Call("Tether USD"))
        symbol = staticmethod(lambda: _Call("USDT"))
        decimals = staticmethod(lambda: _Call(18))
        totalSupply = staticmethod(lambda: _Call(10**24))

    class _Token:
        functions = _Functions

    class _Eth:
        @staticmethod
        def get_code(_address):
            if error:
                raise error
            return code

        @staticmethod
        def contract(address=None, abi=None):
            return _Token

    class _Web3:
        eth = _Eth

    return _Web3


def test_the_live_path_now_reads_the_contract(server):
    metadata = server.get_onchain_metadata(_chain(bytes.fromhex(MINT + "00" * 8)), TOKEN)
    report = server.build_report_from_metadata(TOKEN, metadata, None, "live_scan")
    assert report["v6"]["backdoor"]["possible_powers"] == ["mint"]
    assert report["blocking_data_gaps"] == ["contract_capability"]


def test_an_unreadable_contract_on_the_live_path_is_a_gap_not_a_clean_read(server):
    metadata = server.get_onchain_metadata(_chain(error=TimeoutError("rpc")), TOKEN)
    report = server.build_report_from_metadata(TOKEN, metadata, None, "live_scan")
    assert report["v6"]["backdoor"]["status"] == "FETCH_FAILED"
    assert report["blocking_data_gaps"] == ["contract_backdoor"]
