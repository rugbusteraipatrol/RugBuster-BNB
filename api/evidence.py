"""What the scanner claims, split into things that can each be checked.

Written for BNB Chain and deliberately not shared with the other services. The
dimensions carry the same names because the questions are the same; what fills
them is not. Copying field names between services is how `withhold_verdict`
came to blank a label on Avalanche while leaving every numeric verdict field
populated -- the code read correct and the vocabulary underneath it belonged to
another chain.

One rule throughout: a dimension we did not read reports UNKNOWN. UNKNOWN is
neither clean nor guilty, and it must never be collapsed into either. This
service reaches for it more than the others do, because its live path builds a
report from on-chain metadata and a DEX pair and never looks up a deployer at
all -- so `creator_history` is genuinely uncollected rather than empty.
"""

from __future__ import annotations

from typing import Any

OK = "OK"
UNKNOWN = "UNKNOWN"
NOT_COLLECTED = "NOT_COLLECTED"


def _dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def technical_controls(report: dict[str, Any]) -> dict[str, Any]:
    """What the contract's controller can do, independent of who they are.

    Reported whether or not the issuer is recognised. A recognised issuer may
    explain why a power exists; it never removes a holder's exposure to it.
    """
    backdoor = _dict(_dict(report.get("v6")).get("backdoor")) or _dict(report.get("backdoor"))
    functions = [str(f) for f in (backdoor.get("backdoor_functions") or []) if f]
    admin_functions = [str(f) for f in (report.get("admin_control_functions") or []) if f]

    if not backdoor and not admin_functions:
        return {
            "status": UNKNOWN,
            "admin_functions": [],
            "contract_functions_matched": [],
            "has_backdoor": None,
            "note": (
                "The contract's functions were not read on this path. Not read "
                "is not the same as none found."
            ),
        }

    return {
        "status": OK,
        "admin_functions": admin_functions,
        "contract_functions_matched": functions,
        "has_backdoor": backdoor.get("has_backdoor"),
        "note": (
            "Functions were matched by name, not by reading what they do. A "
            "name match is a reason to look, not a finding about behaviour."
        ),
    }


def market(report: dict[str, Any]) -> dict[str, Any]:
    """Depth and volume: the market's state, not the deployer's intent."""
    liquidity = report.get("liquidity_usd")
    if not report.get("has_liquidity_evidence") and liquidity is None:
        return {
            "status": UNKNOWN,
            "liquidity_usd": None,
            "note": (
                "No trading pair was found. That is an absence of evidence "
                "about the market, not evidence of a bad market."
            ),
        }
    return {
        "status": OK,
        "liquidity_usd": liquidity,
        "fdv": report.get("fdv"),
        "volume24h": report.get("volume24h"),
        "risk_status": report.get("speculation_status"),
        "risk_score": report.get("speculation_score"),
        "reasons": list(report.get("speculation_reasons") or []),
        "source": report.get("pair_source") or "dexscreener",
        "note": (
            "Reported by the DEX aggregator, not independently verified on "
            "chain. Changes day to day and says nothing about the deployer."
        ),
    }


def issuer_identity(report: dict[str, Any]) -> dict[str, Any]:
    """Whether we recognise who issued this, by curation and nothing else.

    Never by size. A token can be large, widely held and still controlled by
    someone nobody has identified; treating scale as identity is what let a
    concentrated unverified mint through on the Solana side.
    """
    if report.get("is_known_chain_asset") is True:
        return {
            "status": OK,
            "recognised": True,
            "basis": "curated_list",
            "note": "On the curated list of canonical BNB Chain assets.",
        }
    return {
        "status": UNKNOWN,
        "recognised": False,
        "basis": "curated_list",
        "note": (
            "Not on the curated list. The issuer is unestablished here, which "
            "is the common case and not an accusation."
        ),
    }


def creator_history(report: dict[str, Any]) -> dict[str, Any]:
    """What this deployer's previous tokens were *labelled by us*.

    The name carries the distinction because the number cannot: these are
    counts of our own earlier verdicts, not independently confirmed rug events.
    Counting them as confirmed would let one earlier mistake harden into a
    record and then justify the next.
    """
    deployer = report.get("creator") or report.get("deployer")
    rate = report.get("creator_prior_danger_rate", report.get("creator_rug_rate"))

    if not deployer:
        return {
            "status": NOT_COLLECTED,
            "deployer": None,
            "prior_tokens_scanned_by_us": None,
            "prior_danger_rate_pct": None,
            "confirmed_incidents": {"count": None, "status": NOT_COLLECTED},
            "note": (
                "The live path does not resolve a deployer, so no history was "
                "looked up. Absent coverage, not an absence of history."
            ),
        }

    return {
        "status": OK,
        "deployer": deployer,
        "prior_tokens_scanned_by_us": report.get("creator_prior_tokens"),
        "prior_danger_rate_pct": rate,
        "confirmed_incidents": {
            "count": None,
            "status": NOT_COLLECTED,
            "note": (
                "Sourced, dated incidents belong here. No such store exists "
                "yet, so this is not zero -- it is uncollected."
            ),
        },
        "note": (
            "Counts of our own earlier verdicts on this deployer's tokens. Not "
            "independently confirmed rug events."
        ),
    }


def coverage(report: dict[str, Any]) -> dict[str, Any]:
    """How much of the above was read, and which rules read it."""
    dimensions = {
        "technical_controls": technical_controls(report),
        "market": market(report),
        "issuer_identity": issuer_identity(report),
        "creator_history": creator_history(report),
    }
    read = [name for name, block in dimensions.items() if block["status"] == OK]
    missing = sorted(name for name in dimensions if name not in read)

    return {
        "status": OK,
        "dimensions_read": sorted(read),
        "dimensions_not_read": missing,
        "completeness_pct": round(100 * len(read) / len(dimensions)),
        "source": report.get("source") or report.get("pair_source"),
        "note": (
            "Governs how far the other dimensions can be trusted. A dimension "
            "under dimensions_not_read was not read -- it was not read as clean."
        ),
    }


def build_evidence(report: dict[str, Any]) -> dict[str, Any]:
    """Additive. Reads the report; writes no verdict field."""
    report = _dict(report)
    return {
        "technical_controls": technical_controls(report),
        "market": market(report),
        "issuer_identity": issuer_identity(report),
        "creator_history": creator_history(report),
        "coverage": coverage(report),
    }
