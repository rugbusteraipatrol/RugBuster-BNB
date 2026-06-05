# RugBuster BNB

Standalone BNB Smart Chain collector for RugBuster multichain threat intelligence.

This worker scans live BNB Chain token launches and pool activity, runs the same CIA/V5/V6 risk modules used by the RugBuster collector stack, and writes labeled training records into Postgres.

## What It Does

- Monitors BNB Smart Chain token and pool activity.
- Scans token metadata, deployer history, bytecode, holder concentration, liquidity signals, and rug velocity.
- Writes records to the `bnb_scans` Postgres table when `DATABASE_URL` is configured.
- Optionally sends Telegram alerts.
- Optional on-chain module logging is disabled by default.

## Railway Start Command

```bash
python bnb_collector_v1.py
```

The included `Procfile` uses:

```bash
worker: python bnb_collector_v1.py
```

## Required Variables

```env
DATABASE_URL=
BNB_RPC=https://bsc-dataseed.binance.org/
BSCSCAN_API_KEY=
ONCHAIN_LOG_ENABLED=false
MAX_TOKENS_PER_DAY=120
MIN_SCAN_DELAY_MINUTES=2
MAX_SCAN_DELAY_MINUTES=3
```

## Optional Variables

```env
BNB_TELEGRAM_BOT_TOKEN=
BNB_TELEGRAM_CHAT_ID=@RugBusterBNB
RECENT_SCAN_FEED_URL=
RECENT_SCAN_INGEST_TOKEN=
RUN_UNTIL_DATE=2026-07-01
MAX_EUR_TOTAL=20
MAX_BNB_TOTAL=2
```

## Notes

This repo is intentionally separate from the Solana and Avalanche collectors so Railway can run, monitor, and pause the BNB worker independently.
