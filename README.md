# RugBuster BNB

AI-powered token security registry and live risk scanner for BNB Smart Chain.

RugBuster BNB extends the RugBusterAI security engine into the BNB Chain ecosystem as a public, verifiable risk layer for tokens, launchpads, wallets, DEX interfaces, and builder tooling.

## Grant Thesis

BNB Chain does not need another isolated off-chain scanner. It needs security tooling that can collect live token evidence, score risk consistently, expose builder-friendly APIs, and create a public trail for integrations.

RugBuster BNB is built for the BNB Chain Builder Grant track:

- Scan new and active BNB Smart Chain tokens from DEX and pool activity.
- Enrich tokens with metadata, deployer history, bytecode, holder concentration, liquidity signals, and market structure.
- Label scans as `GOOD`, `WARN`, or `DANGER` for model training.
- Provide cache-first API access for wallets, dashboards, DEX tools, and launchpads.
- Optionally publish module-level attestations on-chain through EVM registry contracts.

## Repository Layout

```txt
RugBuster-BNB/
  api/
    server.py                    # Flask API for BNB scans, cache lookups, alerts
  chains/
    bnb/
      adapter.py                 # BNB Smart Chain pair monitor
      bridge.py                  # Registry and Telegram integration helpers
      risk_engine.py             # Deterministic dual-score rules
      bnb_collector_v1.py         # 24/7 BNB collector worker
  contracts/
    RugBusterRegistry.sol         # On-chain score registry
    RugBusterActivityLogger.sol   # Module-level activity logger
    RugBusterScanner.sol          # Minimal scanner request contract
  docs/
    index.html                    # Public BNB scanner site
    BNB_API.md                    # API docs
    BNB_GRANT_PREP.md             # Grant preparation notes
    BNB_SECURITY_ROADMAP.md       # Product roadmap
  scripts/
    network_config.py
    deploy_bsc_testnet.py
    deploy_activity_logger.js
    deploy_scanner_bsc_testnet.js
```

## Railway

The repo can run a web API and a BNB worker as separate Railway services.

```Procfile
web: gunicorn --bind 0.0.0.0:$PORT api.server:app
bnb_worker: python chains/bnb/bnb_collector_v1.py
```

For a first low-cost worker test, run only:

```bash
python chains/bnb/bnb_collector_v1.py
```

## Core Variables

```env
DATABASE_URL=
BNB_RPC=https://bsc-dataseed.binance.org/
BSCSCAN_API_KEY=
RUGBUSTER_NETWORK=bsc

ONCHAIN_LOG_ENABLED=false
BOT_PUBLISH_TO_REGISTRY=false

MAX_TOKENS_PER_DAY=120
MIN_SCAN_DELAY_MINUTES=2
MAX_SCAN_DELAY_MINUTES=3
RUN_UNTIL_DATE=2026-07-01
```

Optional Telegram/feed variables:

```env
BNB_TELEGRAM_BOT_TOKEN=
BNB_TELEGRAM_CHAT_ID=@RugBusterBNB
RECENT_SCAN_FEED_URL=
RECENT_SCAN_INGEST_TOKEN=
```

Optional on-chain logging variables:

```env
BNB_LOG_PRIVATE_KEY=
BNB_ACTIVITY_LOGGER_ADDRESS=
BNB_REGISTRY_ADDRESS=
MAX_BNB_TOTAL=2
MAX_EUR_TOTAL=20
TARGET_BNB_PER_SCAN=0.0002
```

## Local Checks

```bash
pip install -r requirements.txt
python -m py_compile api/server.py chains/bnb/*.py scripts/*.py
npm install
npm run compile
```

## API Surface

- `GET /health`
- `GET /score?address=0x...`
- `GET /scan?address=0x...`
- `POST /api/scan`
- `GET /api/recent-scans`

The API is designed to expose compact risk intelligence without publishing the raw private evidence corpus.

## Current Status

- BNB collector worker is implemented.
- BNB site and scanner UI are adapted from the existing RugBuster EVM scanner.
- BNB API docs and grant notes are included.
- On-chain logging is optional and disabled by default for cost control.
