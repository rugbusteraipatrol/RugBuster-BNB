"""An unusable cache never answers for the token, and a failed refresh says so.

Base cbBTC (2026-09-11) returned UNKNOWN from a stored row with no rug_status.
BNB had the same lookup, and additionally turned any Postgres error into a 500
carrying the exception text without trying the live scan.
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
LEGACY_ROW = {"contract_address": USDT, "token_name": "Tether USD", "risk_percent": 40}
LIVE = {"address": USDT, "token_name": "Tether USD", "symbol": "USDT",
        "rug_status": "LOW", "speculation_status": "LOW", "rug_score": 12, "risk_percent": 12}


class _Cursor:
    def __init__(self, row):
        self.row = row

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def execute(self, *args, **kwargs):
        return None

    def fetchone(self):
        return self.row


class _Connection:
    def __init__(self, row):
        self.row = row

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def cursor(self):
        return _Cursor(self.row)


@pytest.fixture()
def server(monkeypatch):
    monkeypatch.setenv("RUGBUSTER_API_KEY", "")
    import api.server as srv
    importlib.reload(srv)
    srv.SCAN_CACHE.clear()
    srv.app.config.update(TESTING=True)
    return srv


def _database(server, monkeypatch, connect):
    fake = mock.Mock()
    fake.connect = connect
    monkeypatch.setattr(server, "psycopg2", fake)
    monkeypatch.setattr(server, "DATABASE_URL", "postgres://test")


def test_a_row_without_rug_status_falls_through_to_the_live_scan(server, monkeypatch):
    _database(server, monkeypatch, lambda *a, **k: _Connection((LEGACY_ROW,)))
    with mock.patch.object(server, "scan_token", return_value=dict(LIVE)) as scan:
        body = server.app.test_client().get(f"/score?address={USDT}").get_json()
    scan.assert_called_once()
    assert body["source"] == "live_scan"
    assert body["label"] != "UNKNOWN"


def test_a_row_with_rug_status_is_still_served(server, monkeypatch):
    _database(server, monkeypatch, lambda *a, **k: _Connection(({**LEGACY_ROW, "rug_status": "LOW", "speculation_status": "LOW"},)))
    with mock.patch.object(server, "scan_token") as scan:
        body = server.app.test_client().get(f"/score?address={USDT}").get_json()
    scan.assert_not_called()
    assert body["source"] == "postgres_cache"


def test_a_database_error_does_not_block_the_live_scan(server, monkeypatch):
    def broken(*a, **k):
        raise RuntimeError("password=hunter2 host=db.internal")
    _database(server, monkeypatch, broken)
    with mock.patch.object(server, "scan_token", return_value=dict(LIVE)):
        response = server.app.test_client().get(f"/score?address={USDT}")
    assert response.status_code == 200
    assert "hunter2" not in response.get_data(as_text=True)


def test_unusable_cache_and_failed_refresh_say_the_check_failed(server, monkeypatch):
    _database(server, monkeypatch, lambda *a, **k: _Connection((LEGACY_ROW,)))
    with mock.patch.object(server, "scan_token", side_effect=TimeoutError("rpc timed out")):
        response = server.app.test_client().get(f"/score?address={USDT}")
    body = response.get_json()
    assert response.status_code == 502
    assert body["error"] == "live_scan_failed"
    assert "not a finding about the token" in body["message"]
    assert "label" not in body
