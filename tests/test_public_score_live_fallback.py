"""/score must answer for tokens the collector has never seen.

Measured 2026-09-07 against the deployed BNB path: the chain answered for
**0 of its 4** canonical tokens. USDT, CAKE, WBNB and BUSD all came back
`not_found`. A cache miss was being reported as though the question had no
answer, when the code to answer it was already in the same file behind
/scan.

The fallback deliberately uses scan_token, which only reads. Publishing to
the registry and sending alerts live behind /scan-and-publish and must stay
there: a visitor checking an address is not a reason to announce a token.
"""

from __future__ import annotations

import importlib
import sys
from pathlib import Path
from unittest import mock

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "api"))
sys.path.insert(0, str(ROOT / "chains" / "bnb"))

USDT = "0x55d398326f99059fF775485246999027B3197955"


@pytest.fixture()
def server(monkeypatch):
    monkeypatch.setenv("RUGBUSTER_API_KEY", "")
    import api.server as srv
    importlib.reload(srv)
    srv.SCAN_CACHE.clear()
    srv.app.config.update(TESTING=True)
    return srv


@pytest.fixture()
def client(server):
    return server.app.test_client()


def _report():
    return {
        "address": USDT,
        "token_name": "Tether USD",
        "symbol": "USDT",
        "label": "GOOD",
        "rug_score": 12,
        "rug_status": "LOW",
        "risk_percent": 12,
    }


def test_cache_miss_falls_back_to_a_live_scan(server, client, monkeypatch):
    monkeypatch.setattr(server, "lookup_cached_score", lambda address: None)
    with mock.patch.object(server, "scan_token", return_value=_report()) as scan:
        response = client.get(f"/score?address={USDT}")
    assert response.status_code == 200
    body = response.get_json()
    assert body["ok"] is True
    assert body["source"] == "live_scan"
    scan.assert_called_once()


def test_a_cached_score_is_still_served_without_scanning(server, client, monkeypatch):
    monkeypatch.setattr(server, "lookup_cached_score",
                        lambda address: {"ok": True, "label": "GOOD", "source": "postgres_cache"})
    with mock.patch.object(server, "scan_token") as scan:
        response = client.get(f"/score?address={USDT}")
    assert response.status_code == 200
    assert response.get_json()["source"] == "postgres_cache"
    scan.assert_not_called()


def test_a_lookup_never_publishes_or_alerts(server, client, monkeypatch):
    """The reason the fallback uses scan_token and not the publish path."""
    monkeypatch.setattr(server, "lookup_cached_score", lambda address: None)
    with mock.patch.object(server, "scan_token", return_value=_report()), \
         mock.patch.object(server, "publish_score") as publish, \
         mock.patch.object(server, "publish_score_modules") as publish_modules, \
         mock.patch.object(server, "send_telegram_alert") as telegram:
        client.get(f"/score?address={USDT}")
    publish.assert_not_called()
    publish_modules.assert_not_called()
    telegram.assert_not_called()


def test_a_failed_scan_says_so_rather_than_answering(server, client, monkeypatch):
    """A scan that could not run is not a token with no risk."""
    monkeypatch.setattr(server, "lookup_cached_score", lambda address: None)
    with mock.patch.object(server, "scan_token", side_effect=RuntimeError("rpc down")):
        response = client.get(f"/score?address={USDT}")
    assert response.status_code == 502
    body = response.get_json()
    assert body["ok"] is False
    assert body["error"] == "live_scan_failed"
    assert "label" not in body or body.get("label") is None


def test_the_result_is_cached_so_a_refresh_is_free(server, client, monkeypatch):
    monkeypatch.setattr(server, "lookup_cached_score", lambda address: None)
    with mock.patch.object(server, "scan_token", return_value=_report()) as scan:
        client.get(f"/score?address={USDT}")
        assert server.get_cached_report(USDT) is not None
        assert scan.call_count == 1


def test_an_invalid_address_is_still_rejected_before_scanning(server, client):
    with mock.patch.object(server, "scan_token") as scan:
        response = client.get("/score?address=not-an-address")
    assert response.status_code == 400
    scan.assert_not_called()


# --- label derivation, because a live scan carries no label of its own ---

COMPLETE_READING = {"v6": {"backdoor": {"status": "OK", "capability_check": "COMPLETE"}}}


def test_low_and_low_reads_good_once_the_contract_was_read(server):
    assert server.public_label_from_report(
        {"rug_status": "LOW", "speculation_status": "LOW", **COMPLETE_READING}) == "GOOD"


def test_low_and_low_without_a_contract_reading_is_not_good(server):
    """What this test used to pin as GOOD: metadata and a DEX pair, and no
    look at the contract at all."""
    assert server.public_label_from_report(
        {"rug_status": "LOW", "speculation_status": "LOW"}) == "INSUFFICIENT_DATA"


def test_high_on_either_side_reads_danger(server):
    assert server.public_label_from_report(
        {"rug_status": "HIGH", "speculation_status": "LOW"}) == "DANGER"
    assert server.public_label_from_report(
        {"rug_status": "LOW", "speculation_status": "HIGH"}) == "DANGER"


def test_elevated_reads_warn(server):
    assert server.public_label_from_report(
        {"rug_status": "ELEVATED", "speculation_status": "LOW"}) == "WARN"


def test_a_missing_side_stays_unknown_rather_than_guessing(server):
    """One half of the picture is not a verdict."""
    assert server.public_label_from_report(
        {"rug_status": "LOW", "speculation_status": ""}) == "UNKNOWN"
    assert server.public_label_from_report({}) == "UNKNOWN"


def test_a_collector_label_is_never_overridden(server):
    """classify_BNB_token_v6 runs the full pipeline; derivation must not
    replace its richer answer on cached records."""
    record = {"label": "DANGER", "rug_status": "LOW", "speculation_status": "LOW"}
    assert server.compact_score_response(record, "postgres_cache")["label"] == "DANGER"


def test_a_live_report_gets_a_derived_label(server):
    record = {"address": USDT, "rug_status": "LOW", "speculation_status": "LOW", **COMPLETE_READING}
    assert server.compact_score_response(record, "live_scan")["label"] == "GOOD"
