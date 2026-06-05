from __future__ import annotations

import json
import os
import sys
from dataclasses import dataclass

import requests


API_URL = os.getenv("BNB_API_URL", "http://localhost:8000/api/scan")


@dataclass(frozen=True)
class ScanExpectation:
    symbol: str
    address: str
    max_rug_score: int
    max_speculation_score: int


@dataclass(frozen=True)
class UnknownLiquidityExpectation:
    symbol: str
    address: str
    min_rug_score: int


KNOWN_TOKENS = [
    ScanExpectation("WBNB", "0xBB4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", 35, 40),
    ScanExpectation("USDT", "0x55d398326f99059ff775485246999027b3197955", 35, 40),
    ScanExpectation("USDC", "0x8AC76a51cc950d9822d68b83fE1Ad97B32Cd580d", 35, 40),
    ScanExpectation("BTCB", "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c", 35, 45),
    ScanExpectation("ETH", "0x2170Ed0880ac9A755fd29B2688956BD959F933F8", 35, 45),
    ScanExpectation("CAKE", "0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82", 45, 55),
]

UNKNOWN_LIQUIDITY = [
    UnknownLiquidityExpectation("NO_PAIR_SAMPLE", "0x1111111111111111111111111111111111111111", 60),
]


def main() -> int:
    failures = 0
    print(f"Verifying BNB scanner against {API_URL}")

    for item in KNOWN_TOKENS:
        response = requests.post(API_URL, json={"address": item.address}, timeout=30)
        response.raise_for_status()
        payload = response.json()
        if not payload.get("ok") or not payload.get("report"):
            print(f"[FAIL] {item.symbol}: malformed response")
            failures += 1
            continue

        report = payload["report"]
        rug_score = report.get("rug_score")
        speculation_score = report.get("speculation_score")
        rug_status = str(report.get("rug_status") or "")
        speculation_status = str(report.get("speculation_status") or "")

        ok = (
            rug_score is not None
            and speculation_score is not None
            and int(rug_score) <= item.max_rug_score
            and int(speculation_score) <= item.max_speculation_score
            and rug_status == "LOW"
            and speculation_status == "LOW"
        )
        line = {
            "symbol": item.symbol,
            "rug_score": rug_score,
            "rug_status": rug_status,
            "speculation_score": speculation_score,
            "speculation_status": speculation_status,
            "liquidity_usd": report.get("liquidity_usd"),
            "dex": report.get("dex_id"),
            "pair": report.get("pair_address"),
            "ok": ok,
        }
        print(json.dumps(line, ensure_ascii=True))
        if not ok:
            failures += 1

    for item in UNKNOWN_LIQUIDITY:
        response = requests.post(API_URL, json={"address": item.address}, timeout=30)
        response.raise_for_status()
        payload = response.json()
        if not payload.get("ok") or not payload.get("report"):
            print(f"[FAIL] {item.symbol}: malformed response")
            failures += 1
            continue

        report = payload["report"]
        rug_score = report.get("rug_score")
        rug_status = str(report.get("rug_status") or "")
        speculation_score = report.get("speculation_score")
        speculation_status = str(report.get("speculation_status") or "")
        ok = (
            rug_score is not None
            and int(rug_score) >= item.min_rug_score
            and rug_status in {"ELEVATED", "HIGH"}
            and speculation_score is None
            and speculation_status == "UNKNOWN"
            and not report.get("has_liquidity_evidence")
        )
        line = {
            "symbol": item.symbol,
            "rug_score": rug_score,
            "rug_status": rug_status,
            "speculation_score": speculation_score,
            "speculation_status": speculation_status,
            "has_liquidity_evidence": report.get("has_liquidity_evidence"),
            "ok": ok,
        }
        print(json.dumps(line, ensure_ascii=True))
        if not ok:
            failures += 1

    if failures:
        print(f"Verification failed for {failures} token(s).")
        return 1

    print("All BNB verification checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
