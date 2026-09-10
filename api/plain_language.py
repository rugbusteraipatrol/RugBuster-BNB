"""Say, in a sentence, what was found and what could not be established.

Written for BNB Chain; not shared with the other services. Same three fields,
own vocabulary.

`label` here mixes two independent readings. Rug risk is our claim about the
contract. Speculation risk is a reading of the pool on the day of the scan.
Where they disagree the sentence says which one moved, because a reader holding
only the label cannot tell -- that confusion is what made the Avalanche deploy
gate report a scanner regression when a bridged Chainlink token's pool drained.

And most of what keeps a token out of GOOD on this service is not a finding at
all: the live path never resolves a deployer, so its history is uncollected
rather than clean. Printing that as an unexplained warning invites the reader
to supply a reason we never gave them.
"""

from __future__ import annotations

from typing import Any

FINDING, REFUSAL, GAP = "FINDING", "REFUSAL", "GAP"

UNREAD_STATUSES = {"", "UNKNOWN", "NOT_COLLECTED", "NOT_QUERIED", "FETCH_FAILED", "NOT_FOUND"}

# Powers a controller can use on someone else's balance. Presence of a matched
# function name is not one of them: on Avalanche, `has_backdoor` is raised by a
# plain ERC-20 burn and `has_drain_function` by any name containing "withdraw",
# which is the unwrap on a wrapped native. The same matcher runs here.
CONTROLLER_POWERS = (
    "has_drain_function",
    "has_blacklist",
    "has_pause_function",
    "has_upgrade_authority",
    "has_mint_function",
)


def _dimension(evidence: dict[str, Any], name: str) -> dict[str, Any]:
    value = (evidence or {}).get(name)
    return value if isinstance(value, dict) else {}


def _was_read(block: dict[str, Any]) -> bool:
    return str(block.get("status") or "").upper() not in UNREAD_STATUSES


def not_established(payload: dict[str, Any]) -> list[str]:
    """Plainly: the questions this answer does not settle."""
    evidence = payload.get("evidence") if isinstance(payload.get("evidence"), dict) else {}
    gaps: list[str] = []

    controls = _dimension(evidence, "technical_controls")
    identity = _dimension(evidence, "issuer_identity")
    issuer_known = identity.get("recognised") is True

    if not _was_read(controls):
        gaps.append("what functions this contract exposes")
    elif controls.get("contract_functions_matched") or controls.get("admin_functions"):
        gaps.append("what the matched contract functions actually do")
        if not issuer_known:
            gaps.append("who can call them")

    if not issuer_known:
        gaps.append("who issued this token")

    if not _was_read(_dimension(evidence, "market")):
        gaps.append("how deep this token's market is")

    creator = _dimension(evidence, "creator_history")
    if not _was_read(creator):
        gaps.append("what this deployer's previous tokens did")
    incidents = creator.get("confirmed_incidents")
    if isinstance(incidents, dict) and not _was_read(incidents):
        gaps.append("whether this token or its deployer has a confirmed incident on record")

    gaps.append("how concentrated ownership is")

    # coverage's dimensions_not_read is deliberately not walked here: every
    # dimension above already contributes its own sentence, and adding the
    # coverage name too said the same thing twice in different words.

    seen: set[str] = set()
    return [gap for gap in gaps if not (gap in seen or seen.add(gap))]


def _headline(payload: dict[str, Any]) -> tuple[str, str]:
    label = str(payload.get("label") or "").upper()
    rug_status = str(payload.get("rug_status") or "").upper()
    speculation = str(payload.get("speculation_status") or "").upper()
    backdoor = payload.get("v6") or {}
    backdoor = backdoor.get("backdoor") if isinstance(backdoor, dict) else {}
    backdoor = backdoor if isinstance(backdoor, dict) else {}

    gaps = payload.get("blocking_data_gaps") or []
    if label == "INSUFFICIENT_DATA" and "contract_capability" in gaps:
        return (
            "A function in this contract could give its controller power over "
            "holders, and whether it does was not established: its selector was "
            "matched and its code was not read. No clean verdict is given. That is "
            "a gap in our check, not a finding against the token.",
            REFUSAL,
        )
    if label == "INSUFFICIENT_DATA" and "contract_backdoor" in gaps:
        return (
            "The contract's functions were not read, so no clean verdict is given. "
            "That is a gap in our check, not a finding against the token.",
            REFUSAL,
        )
    if label in {"INSUFFICIENT_DATA", "UNKNOWN"} or rug_status == "INSUFFICIENT_DATA":
        return (
            "Too little was readable to judge this token. That is our answer, "
            "not a clean bill of health.",
            REFUSAL,
        )

    powers = [name for name in CONTROLLER_POWERS if backdoor.get(name) is True]
    if powers:
        functions = [str(f) for f in (backdoor.get("backdoor_functions") or []) if f]
        named = ", ".join(functions) if functions else "controller functions"
        if payload.get("is_known_chain_asset") is True:
            return (
                f"A recognised BNB Chain asset. Its contract exposes {named}, "
                "which is expected for this kind of asset and is reported "
                "rather than read as intent.",
                FINDING,
            )
        return (
            f"This contract exposes {named}, which its controller can call. "
            "What that does here has not been established -- the function was "
            "matched by name, not by reading what it does.",
            FINDING,
        )

    if rug_status in {"HIGH", "DANGER"}:
        return "Findings against this contract, listed below.", FINDING

    if rug_status in {"LOW", "MEDIUM"} and speculation in {"HIGH", "MEDIUM", "DANGER"} \
            and label != "GOOD":
        return (
            f"Rug risk reads {rug_status.lower()}; the warning comes from the "
            "market reading, which is the state of the pool today and not a "
            "claim about the contract or its deployer.",
            FINDING,
        )

    if label == "GOOD":
        return "Nothing found against this token in what was checked.", FINDING
    return "Nothing conclusive was found either way.", GAP


def _coverage_clause(payload: dict[str, Any]) -> str:
    """How much of the check actually ran.

    A clean answer built on half the checks is not the same as a clean answer,
    and "nothing found in what was checked" hides the size of *what was
    checked*. On this service's live path that is routinely half: no deployer
    is resolved and the contract's functions are not read.
    """
    evidence = payload.get("evidence") if isinstance(payload.get("evidence"), dict) else {}
    coverage = evidence.get("coverage") if isinstance(evidence.get("coverage"), dict) else {}
    pct = coverage.get("completeness_pct")
    not_read = coverage.get("dimensions_not_read") or []
    if pct is None or pct >= 100 or not not_read:
        return ""
    names = ", ".join(str(name).replace("_", " ") for name in not_read)
    return f" {pct}% of the checks ran; these did not: {names}."


def describe(payload: dict[str, Any]) -> dict[str, Any]:
    """A sentence and a list, both restating fields computed elsewhere."""
    summary, basis = _headline(payload)
    summary += _coverage_clause(payload)
    gaps = not_established(payload)

    # Only a GAP earns the reassuring clause. A refusal to judge must never be
    # softened with it: on a token we could barely read, "not evidence against
    # the token" is the sentence a reader would most like to hear and the one
    # least supported by what we know.
    if basis == GAP and gaps:
        summary += (
            " What is missing is knowledge on our side, not evidence against "
            "the token: see not_established."
        )

    return {"verdict_summary": summary, "verdict_basis": basis, "not_established": gaps}
