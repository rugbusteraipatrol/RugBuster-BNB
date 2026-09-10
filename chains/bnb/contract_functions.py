"""What a contract's bytecode says about its functions, and what it cannot.

Shared by the collector and the API, and deliberately free of dependencies:
the collector module imports psycopg2 and configures logging when it loads, and
the API must not inherit either to read four bytes.

NOT the same claim as on Avalanche, and the difference matters. There, the
published source is read and a power is only reported once its modifiers,
conditions and internal calls resolve. Here there is no explorer lookup --
BscScan needs an API key this deployment does not hold -- so nothing can be
established and a reading rests on the selector alone.

So nothing here scores. A matched selector is a *possible* power, and a
possible power is a question the scan did not answer: it is reported, it adds
no risk, and it keeps the answer from being called clean. `capability_check`
says which of those this reading is.

`powers` used to be an alias for `possible_powers`, kept because the scorer
read it. That alias is how a selector reached the verdict as an established
power, and it is gone: `powers` now carries only `source_read_powers`, which
is empty on this chain until source can be read.

Each selector says what the function *is*, not what its name resembles. The
previous matcher matched substrings of the human-readable name, and the names
lie in both directions -- burn(uint256) is the caller's own burn,
withdraw(uint256) is the unwrap on a wrapped native, paused() and
isBlacklisted(address) are view getters.

What this still cannot do: a selector is matched by searching the bytecode
for its bytes, so a coincidental byte sequence reads as a function. That is
one more reason a selector only ever makes a power possible.
"""

from __future__ import annotations

from typing import Any

POWER_MINT = "mint"
POWER_SWEEP = "sweep"
POWER_UPGRADE = "upgrade"
POWER_PAUSE = "pause"
POWER_BLACKLIST = "blacklist"
POWER_BURN_OTHERS = "burn_others"

STATUS_OK = "OK"
STATUS_NOT_FOUND = "NOT_FOUND"
STATUS_FETCH_FAILED = "FETCH_FAILED"
STATUS_NOT_QUERIED = "NOT_QUERIED"

CAPABILITY_COMPLETE = "COMPLETE"      # every possible power established or ruled out
CAPABILITY_INCOMPLETE = "INCOMPLETE"  # something possible was left unsettled
CAPABILITY_NOT_RUN = "NOT_RUN"        # the bytecode itself was not read

GAP_CONTRACT_NOT_READ = "contract_backdoor"
GAP_CAPABILITY = "contract_capability"

# Structural markers: they indicate a proxy without themselves being a power.
PROXY_MARKERS = {"3659cfe6", "4f1ef286", "5c60da1b"}

FUNCTION_SIGNATURES = {
    # selector: (name, power granted over other holders, or None)
    "8da5cb5b": ("owner()", None),                              # view getter
    # An owner exists. That is centralisation and it is reported, but on its
    # own it grants nothing over anyone's balance.
    "f2fde38b": ("transferOwnership(address)", None),
    "715018a6": ("renounceOwnership()", None),                  # gives a power up
    "42966c68": ("burn(uint256)", None),                        # caller's own balance
    "40c10f19": ("mint(address,uint256)", POWER_MINT),
    "3ccfd60b": ("withdraw()", None),                           # caller's own funds
    "2e1a7d4d": ("withdraw(uint256)", None),                    # caller's own; the unwrap
    # withdraw(address) may send the caller's own balance or sweep the
    # contract's; the name does not say, so it grants nothing.
    "51cff8d9": ("withdraw(address)", None),
    "89476069": ("withdrawToken(address)", POWER_SWEEP),
    "3659cfe6": ("upgradeTo(address)", POWER_UPGRADE),
    "4f1ef286": ("upgradeToAndCall(address,bytes)", POWER_UPGRADE),
    "5c60da1b": ("implementation()", None),                     # view getter
    "8456cb59": ("pause()", POWER_PAUSE),
    "3f4ba83a": ("unpause()", POWER_PAUSE),
    "5c975abb": ("paused()", None),                             # view getter
    "f9f92be4": ("blacklist(address)", POWER_BLACKLIST),
    "1a895266": ("unBlacklist(address)", POWER_BLACKLIST),
    # Burning someone else's balance. Whether it needs their consent is exactly
    # what a selector cannot say -- on Avalanche the same selector turned out
    # owner-only on one token and allowance-gated on another.
    "9dc29fac": ("burn(address,uint256)", POWER_BURN_OTHERS),
    # Spends the caller's allowance: the holder approved it.
    "79cc6790": ("burnFrom(address,uint256)", None),
    "fe575a87": ("isBlacklisted(address)", None),               # view getter
}

BACKDOOR_SIGNATURES = {sig: name for sig, (name, _power) in FUNCTION_SIGNATURES.items()}
FUNCTION_SIGNATURES_BY_NAME = {name: power for _sig, (name, power) in FUNCTION_SIGNATURES.items()}

OWNERSHIP_MARKERS = {"8da5cb5b", "f2fde38b", "715018a6"}

POWER_FIELDS = {
    POWER_MINT: "has_mint_function",
    POWER_SWEEP: "has_drain_function",
    POWER_UPGRADE: "has_upgrade_authority",
    POWER_PAUSE: "has_pause_function",
    POWER_BLACKLIST: "has_blacklist",
    POWER_BURN_OTHERS: "has_burn_others",
}

# Checked at import: a power with no field behind it once raised a KeyError
# inside a broad `except` and was reported as an RPC outage.
_declared = {power for _name, power in FUNCTION_SIGNATURES.values() if power}
assert _declared <= set(POWER_FIELDS), (
    f"FUNCTION_SIGNATURES names powers with no field: {sorted(_declared - set(POWER_FIELDS))}"
)


def empty_reading() -> dict[str, Any]:
    return {
        "has_backdoor": False,
        "backdoor_functions": [],
        "has_upgrade_authority": False,
        "has_pause_function": False,
        "has_mint_function": False,
        "has_drain_function": False,
        "has_blacklist": False,
        "has_burn_others": False,
        "is_proxy": False,
        "has_owner": False,
        "possible_functions": [],
        "possible_powers": [],
        "source_read_powers": [],     # established from source; none on this chain yet
        "ruled_out_functions": {},
        "unread_restrictions": {},
        "unconfirmed_powers": [],
        "capability_check": CAPABILITY_NOT_RUN,
        "control": "unknown",
        "source_status": STATUS_NOT_QUERIED,
        "powers": [],                 # == source_read_powers
        "backdoor_risk_score": 0,
        "status": STATUS_OK,
        "status_reason": "",
    }


def established_powers(backdoor: dict[str, Any] | None) -> set[str]:
    """Powers a scorer may count. Only what was read from source.

    Booleans like `has_mint_function` and the old `powers` alias are ignored on
    purpose: on stored records they were set from a selector.
    """
    return {str(p) for p in ((backdoor or {}).get("source_read_powers") or []) if p}


def settle_capability(result: dict[str, Any]) -> dict[str, Any]:
    """Fill in what the reading established and whether the check finished.

    A proxy is never complete: its bytecode delegates to an implementation
    contract whose functions are not read, so "nothing found" would describe
    the wrapper and not the token.
    """
    established = established_powers(result)
    for power, field in POWER_FIELDS.items():
        result[field] = power in established
    result["source_read_powers"] = sorted(established)
    result["powers"] = sorted(established)
    result["has_backdoor"] = bool(established)
    result["backdoor_risk_score"] = min(len(established) * 20, 100)

    if result.get("status") != STATUS_OK:
        result["capability_check"] = CAPABILITY_NOT_RUN
        result["unconfirmed_powers"] = []
        return result

    ruled_out = result.get("ruled_out_functions") or {}
    unconfirmed = {
        FUNCTION_SIGNATURES_BY_NAME[name]
        for name in result.get("possible_functions") or []
        if FUNCTION_SIGNATURES_BY_NAME.get(name)
        and FUNCTION_SIGNATURES_BY_NAME[name] not in established
        and name not in ruled_out
    }
    result["unconfirmed_powers"] = sorted(unconfirmed)
    unread = result.setdefault("unread_restrictions", {})
    for name in result.get("possible_functions") or []:
        power = FUNCTION_SIGNATURES_BY_NAME.get(name)
        if power in unconfirmed and name not in unread:
            unread[name] = "matched by selector only; no source was read on this chain"
    if result.get("is_proxy"):
        unread["proxy implementation"] = (
            "this address is a proxy; the implementation contract's functions were not read")
    unsettled = bool(unconfirmed) or bool(result.get("is_proxy"))
    result["capability_check"] = CAPABILITY_INCOMPLETE if unsettled else CAPABILITY_COMPLETE
    return result


def read_bytecode(bytecode: Any) -> dict[str, Any]:
    """A reading of the functions matched in this bytecode."""
    if isinstance(bytecode, (bytes, bytearray)):
        code = bytes(bytecode).hex()
    else:
        code = str(bytecode or "")
    code = code.lower()
    if code.startswith("0x"):
        code = code[2:]

    result = empty_reading()
    if len(code) <= 8:
        result["status"] = STATUS_NOT_FOUND
        result["status_reason"] = "no contract bytecode at this address"
        return settle_capability(result)

    for sig, (name, power) in FUNCTION_SIGNATURES.items():
        if sig not in code:
            continue
        result["backdoor_functions"].append(name)
        result["possible_functions"].append(name)
        if sig in PROXY_MARKERS:
            result["is_proxy"] = True
        if sig in OWNERSHIP_MARKERS:
            result["has_owner"] = True
        if power:
            result["possible_powers"].append(power)
    result["possible_powers"] = sorted(set(result["possible_powers"]))
    return settle_capability(result)


def reading_failed(reason: str) -> dict[str, Any]:
    result = empty_reading()
    result["status"] = STATUS_FETCH_FAILED
    result["status_reason"] = reason
    return settle_capability(result)


def backdoor_from_report(report: dict[str, Any]) -> dict[str, Any] | None:
    """The contract reading a report carries, in whichever shape it was stored.

    Live reports nest it under v6.backdoor. Collector records written before
    this module existed carry flat v6_* fields and no capability_check; their
    matched function names are re-read through today's table, so a stored
    record is judged by the same rule as a fresh one.
    """
    nested = (report.get("v6") or {}).get("backdoor") if isinstance(report.get("v6"), dict) else None
    if isinstance(nested, dict) and nested:
        if "capability_check" in nested:
            return nested
        functions = nested.get("backdoor_functions") or []
        is_proxy = nested.get("is_proxy")
        status = nested.get("status") or STATUS_OK
    elif "v6_backdoor_functions" in report:
        functions = report.get("v6_backdoor_functions") or []
        is_proxy = report.get("v6_is_proxy")
        status = STATUS_OK
    else:
        return None

    result = empty_reading()
    result["status"] = status
    result["possible_functions"] = [str(f) for f in functions if f]
    result["backdoor_functions"] = list(result["possible_functions"])
    result["possible_powers"] = sorted({
        FUNCTION_SIGNATURES_BY_NAME[f] for f in result["possible_functions"]
        if FUNCTION_SIGNATURES_BY_NAME.get(f)
    })
    result["is_proxy"] = bool(is_proxy)
    return settle_capability(result)


def capability_gaps(report: dict[str, Any]) -> list[str]:
    """Why a clean verdict must be withheld on contract grounds, if it must.

    No reading at all is a gap: a GOOD built without looking at the contract
    asserts something nobody checked. That was the live path on this chain,
    which scored metadata and a DEX pair and called the result GOOD.
    """
    backdoor = backdoor_from_report(report)
    if backdoor is None:
        return [GAP_CONTRACT_NOT_READ]
    if backdoor.get("status") in (STATUS_FETCH_FAILED, STATUS_NOT_QUERIED):
        return [GAP_CONTRACT_NOT_READ]
    if backdoor.get("capability_check") == CAPABILITY_INCOMPLETE:
        return [GAP_CAPABILITY]
    return []
