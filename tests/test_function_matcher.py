"""A function's name is not its behaviour -- BNB Chain.

The same matcher runs on all three EVM chains and had the same two false
positives here. Measured on this chain with real contracts:

    WBNB   drain 20 -> 0    withdraw(uint256) is the unwrap: it burns the
                        caller's own wrapper and returns their own BNB.
    USDT   backdoor -> none  owner() and a plain ERC-20 burn.
    CAKE   mint             matched: PancakeSwap's contract has mint.

The table is a statement about EVM selectors, so it is identical to the
Avalanche one by intent rather than by accident; the tests are separate because
the collectors are.

What changed after review: this chain cannot read source, so a matched selector
is a *possible* power and nothing more. The previous version of this file
pinned `powers` as an alias of `possible_powers` because the scorer read it --
which is how a selector reached the verdict as an established power. The alias
is gone and these tests now pin the opposite.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "chains" / "bnb"))

import bnb_collector_v1 as collector  # noqa: E402
import contract_functions as functions  # noqa: E402

SELECTORS = {name: sig for sig, (name, _p) in collector.FUNCTION_SIGNATURES.items()}


def _read(*function_names: str) -> dict:
    """Run the matcher over bytecode containing exactly these selectors."""
    bytecode = "0x" + "".join(SELECTORS[name] for name in function_names) + "00" * 8

    class _Response:
        @staticmethod
        def json():
            return {"result": bytecode}

    original = collector.requests.post
    collector.requests.post = lambda *a, **k: _Response()
    try:
        return collector.detect_contract_backdoor_BNB("0xtest")
    finally:
        collector.requests.post = original


def _nothing_established(reading: dict) -> None:
    assert reading["powers"] == []
    assert reading["source_read_powers"] == []
    assert reading["has_backdoor"] is False
    assert reading["backdoor_risk_score"] == 0
    for field in collector.POWER_FIELDS.values():
        assert reading[field] is False, field


# --- the false positives this replaces -------------------------------------

def test_the_unwrap_on_a_wrapped_native_is_not_a_drain():
    """withdraw(uint256) burns the caller's own wrapper and returns their own
    native token. It is the whole purpose of the contract."""
    reading = _read("withdraw(uint256)")
    assert reading["has_drain_function"] is False
    assert reading["possible_powers"] == []
    assert reading["backdoor_functions"] == ["withdraw(uint256)"]
    assert reading["capability_check"] == functions.CAPABILITY_COMPLETE


def test_a_plain_erc20_burn_is_not_a_backdoor():
    """burn(uint256) burns the caller's own balance."""
    reading = _read("burn(uint256)")
    assert reading["possible_powers"] == []
    _nothing_established(reading)


def test_a_view_getter_is_not_a_power():
    for name in ("paused()", "isBlacklisted(address)", "owner()"):
        reading = _read(name)
        assert reading["possible_powers"] == [], f"{name} was read as granting a power"
        _nothing_established(reading)


def test_renouncing_ownership_is_not_a_power():
    assert _read("renounceOwnership()")["possible_powers"] == []


def test_a_proxy_is_reported_and_never_a_finished_check():
    """is_proxy and upgradeTo describe one fact, and the implementation behind
    the proxy is not read at all."""
    reading = _read("upgradeTo(address)", "upgradeToAndCall(address,bytes)", "implementation()")
    assert reading["is_proxy"] is True
    assert reading["possible_powers"] == ["upgrade"]
    _nothing_established(reading)
    assert reading["capability_check"] == functions.CAPABILITY_INCOMPLETE
    assert "proxy implementation" in reading["unread_restrictions"]


# --- what is still seen, as possible ---------------------------------------

def test_minting_is_a_possible_power_and_nothing_more():
    reading = _read("mint(address,uint256)")
    assert reading["possible_powers"] == ["mint"]
    assert reading["unconfirmed_powers"] == ["mint"]
    _nothing_established(reading)


def test_pausing_is_possible_and_the_getter_beside_it_is_not():
    reading = _read("pause()", "unpause()", "paused()")
    assert reading["possible_powers"] == ["pause"]
    _nothing_established(reading)


def test_blacklisting_is_possible():
    reading = _read("blacklist(address)", "isBlacklisted(address)")
    assert reading["possible_powers"] == ["blacklist"]
    _nothing_established(reading)


def test_sweeping_arbitrary_tokens_is_possible():
    reading = _read("withdrawToken(address)")
    assert reading["possible_powers"] == ["sweep"]
    _nothing_established(reading)


def test_several_possible_powers_accumulate_and_score_nothing():
    reading = _read("mint(address,uint256)", "pause()", "blacklist(address)")
    assert reading["possible_powers"] == ["blacklist", "mint", "pause"]
    _nothing_established(reading)
    assert reading["capability_check"] == functions.CAPABILITY_INCOMPLETE


# --- ownership is reported, not scored -------------------------------------

def test_an_owner_is_reported_without_being_scored():
    """Centralisation is worth knowing. On its own it grants nothing over
    anyone's balance, and counting it put every Ownable contract at 20."""
    reading = _read("owner()", "transferOwnership(address)")
    assert reading["has_owner"] is True
    assert reading["possible_powers"] == []
    assert reading["backdoor_risk_score"] == 0
    assert reading["capability_check"] == functions.CAPABILITY_COMPLETE


# --- absent is not clean ---------------------------------------------------

def test_an_address_with_no_bytecode_says_so():
    class _Empty:
        @staticmethod
        def json():
            return {"result": "0x"}

    original = collector.requests.post
    collector.requests.post = lambda *a, **k: _Empty()
    try:
        reading = collector.detect_contract_backdoor_BNB("0xtest")
    finally:
        collector.requests.post = original
    assert reading["status"] == functions.STATUS_NOT_FOUND
    _nothing_established(reading)


def test_an_rpc_failure_is_a_failure_and_not_a_clean_reading():
    """The earlier version of this collector had no status, so "no backdoor
    found" and "never read the bytecode" came out the same. They do not now."""
    def _raise(*_a, **_k):
        raise TimeoutError("rpc")

    original = collector.requests.post
    collector.requests.post = _raise
    try:
        reading = collector.detect_contract_backdoor_BNB("0xtest")
    finally:
        collector.requests.post = original
    assert reading["status"] == functions.STATUS_FETCH_FAILED
    assert reading["capability_check"] == functions.CAPABILITY_NOT_RUN


# --- the table cannot name a power it has no field for ---------------------

def test_every_declared_power_has_a_field():
    """The first version of the table named `ownership` with no field behind
    it. The KeyError was raised inside the scan's broad `except` and reported
    as "bytecode could not be read from RPC" -- a misconfiguration wearing an
    outage's clothes, which then reads as an absent signal."""
    declared = {power for _name, power in collector.FUNCTION_SIGNATURES.values() if power}
    assert declared <= set(collector.POWER_FIELDS)


def test_the_old_name_still_resolves_for_anything_importing_it():
    assert collector.BACKDOOR_SIGNATURES
    assert set(collector.BACKDOOR_SIGNATURES) == set(collector.FUNCTION_SIGNATURES)


# --- the table must not be able to lie about itself ------------------------

def test_every_selector_hashes_to_the_name_beside_it():
    """Three of seventeen did not, and all three carried a power: 51cff8d9 was
    labelled withdrawToken(address) and is really withdraw(address);
    044df020 and 537df3b6 were labelled blacklist and unBlacklist and hash to
    nothing identifiable. Recomputing the selector is the whole check."""
    from eth_utils import keccak

    wrong = {
        selector: (name, keccak(text=name)[:4].hex())
        for selector, (name, _power) in collector.FUNCTION_SIGNATURES.items()
        if keccak(text=name)[:4].hex() != selector
    }
    assert not wrong, f"selectors that do not hash to their own name: {wrong}"


def test_burning_someone_elses_balance_is_possible():
    reading = _read("burn(address,uint256)")
    assert reading["possible_powers"] == ["burn_others"]
    _nothing_established(reading)


def test_an_allowance_based_burn_is_not():
    """burnFrom spends the caller's allowance; the holder approved it."""
    assert _read("burnFrom(address,uint256)")["possible_powers"] == []


def test_an_ambiguous_withdraw_grants_nothing():
    assert _read("withdraw(address)")["possible_powers"] == []


# --- this chain cannot confirm, and says so --------------------------------

def test_a_reading_here_is_possible_and_never_established():
    """No explorer lookup runs here, so a reading rests on the selector alone.
    `powers` is not an alias for it any more: that alias is how a selector
    reached the scorer as an established power."""
    reading = _read("mint(address,uint256)")
    assert reading["possible_powers"] == ["mint"]
    assert reading["possible_functions"] == ["mint(address,uint256)"]
    assert reading["control"] == "unknown"
    assert reading["source_status"] == "NOT_QUERIED"
    assert reading["powers"] == []
    assert "selector only" in reading["unread_restrictions"]["mint(address,uint256)"]
