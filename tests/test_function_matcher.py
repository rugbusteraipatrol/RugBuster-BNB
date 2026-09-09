"""A function's name is not its behaviour -- BNB Chain.

The same matcher runs on all three EVM chains and had the same two false
positives here. Measured on this chain with real contracts:

    WBNB   drain 20 -> 0    withdraw(uint256) is the unwrap: it burns the
                        caller's own wrapper and returns their own BNB.
    USDT   backdoor -> none  owner() and a plain ERC-20 burn.
    CAKE   mint 20        kept: PancakeSwap can mint CAKE.

The table is a statement about EVM selectors, so it is identical to the
Avalanche one by intent rather than by accident; the tests are separate because
the collectors are.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "chains" / "bnb"))

import bnb_collector_v1 as collector  # noqa: E402

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


# --- the false positives this replaces -------------------------------------

def test_the_unwrap_on_a_wrapped_native_is_not_a_drain():
    """withdraw(uint256) burns the caller's own wrapper and returns their own
    native token. It is the whole purpose of the contract."""
    reading = _read("withdraw(uint256)")
    assert reading["has_drain_function"] is False
    assert reading["backdoor_risk_score"] == 0
    assert reading["backdoor_functions"] == ["withdraw(uint256)"]


def test_a_plain_erc20_burn_is_not_a_backdoor():
    """burn(uint256) burns the caller's own balance."""
    reading = _read("burn(uint256)")
    assert reading["has_backdoor"] is False
    assert reading["powers"] == []


def test_a_view_getter_is_not_a_power():
    for name in ("paused()", "isBlacklisted(address)", "owner()", "implementation()"):
        reading = _read(name)
        assert reading["powers"] == [], f"{name} was read as granting a power"
        assert reading["backdoor_risk_score"] == 0, name


def test_renouncing_ownership_is_not_a_power():
    assert _read("renounceOwnership()")["powers"] == []


def test_a_proxy_is_counted_once():
    """is_proxy and has_upgrade_authority describe the same fact, and
    implementation() is a getter beside them."""
    reading = _read("upgradeTo(address)", "upgradeToAndCall(address,bytes)", "implementation()")
    assert reading["is_proxy"] is True
    assert reading["has_upgrade_authority"] is True
    assert reading["powers"] == ["upgrade"]
    assert reading["backdoor_risk_score"] == 20


# --- what must still bite --------------------------------------------------

def test_minting_is_a_power():
    reading = _read("mint(address,uint256)")
    assert reading["has_mint_function"] is True
    assert reading["has_backdoor"] is True
    assert reading["backdoor_risk_score"] == 20


def test_pausing_transfers_is_a_power_and_the_getter_beside_it_is_not():
    reading = _read("pause()", "unpause()", "paused()")
    assert reading["has_pause_function"] is True
    assert reading["powers"] == ["pause"]
    assert reading["backdoor_risk_score"] == 20


def test_blacklisting_is_a_power():
    reading = _read("blacklist(address)", "isBlacklisted(address)")
    assert reading["has_blacklist"] is True
    assert reading["powers"] == ["blacklist"]


def test_sweeping_arbitrary_tokens_is_still_a_drain():
    """withdrawToken(address) takes tokens the contract holds for others. This
    is the one withdraw-shaped function that keeps the flag."""
    reading = _read("withdrawToken(address)")
    assert reading["has_drain_function"] is True
    assert reading["powers"] == ["sweep"]


def test_several_powers_accumulate():
    reading = _read("mint(address,uint256)", "pause()", "blacklist(address)")
    assert reading["backdoor_risk_score"] == 60
    assert reading["powers"] == ["blacklist", "mint", "pause"]


# --- ownership is reported, not scored -------------------------------------

def test_an_owner_is_reported_without_being_scored():
    """Centralisation is worth knowing. On its own it grants nothing over
    anyone's balance, and counting it put every Ownable contract at 20."""
    reading = _read("owner()", "transferOwnership(address)")
    assert reading["has_owner"] is True
    assert reading["powers"] == []
    assert reading["backdoor_risk_score"] == 0


# --- absent is not clean ---------------------------------------------------

def test_unreadable_bytecode_reports_no_powers_rather_than_a_clean_read():
    """Weaker than the Avalanche version deliberately: this collector has no
    per-module status field, so "no backdoor found" and "never read the
    bytecode" still come out the same. That gap is real and is recorded here
    rather than papered over -- powers being empty is all this can assert."""
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
    assert reading["powers"] == []
    assert reading["has_backdoor"] is False
    assert "status" not in reading, (
        "a status field appeared; tighten this test to assert it is not OK"
    )


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
