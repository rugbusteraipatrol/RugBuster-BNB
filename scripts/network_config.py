"""Shared network helpers for RugBuster BNB scripts."""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]

NETWORKS = {
    "bsc_testnet": {
        "rpc_env": "BSC_TESTNET_RPC_URL",
        "default_rpc": "https://data-seed-prebsc-1-s1.binance.org:8545/",
        "chain_id": 97,
        "label": "BNB Smart Chain Testnet",
    },
    "bsc": {
        "rpc_env": "BNB_RPC",
        "default_rpc": "https://bsc-dataseed.binance.org/",
        "chain_id": 56,
        "label": "BNB Smart Chain Mainnet",
    },
}


def load_env() -> None:
    load_dotenv(ROOT / ".env")


def resolve_network() -> str:
    raw = (os.getenv("RUGBUSTER_NETWORK") or "bsc").strip().lower()
    if raw not in NETWORKS:
        raise RuntimeError(f"Unsupported RUGBUSTER_NETWORK: {raw}")
    return raw


def resolve_rpc(network: str) -> str:
    config = NETWORKS[network]
    return os.getenv(config["rpc_env"]) or config["default_rpc"]
