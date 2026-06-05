# BNB Builder Grant Update - 2026-06-03

RugBuster BNB has moved from a public BNB Chain scanner demo into a live
security tooling stack for BNB Chain builders.

## What Changed

- Live BNB Chain builder API is online:
  `https://rugbuster-api-production.up.railway.app`
- Public cache score endpoint:
  `GET /score?address=0x...`
- Protected deep scan endpoint:
  `GET /scan?address=0x...` with `X-API-Key`
- Current BNB classifier:
  `weighted_v2`
- Private BNB scan corpus is stored in Postgres and continues to grow.
- Verified BNB Chain mainnet registry remains live:
  `0x5F30276B3A5079E088Ec3072884286de5a868355`
- Website now documents the builder API layer and links API documentation.

## Why It Matters For BNB Chain

RugBuster BNB is infrastructure tooling, not only a scanner UI. The stack now
has three layers:

1. Collector: continuously builds private BNB Chain token evidence.
2. API: gives builders compact risk labels without exposing the raw corpus.
3. Registry: records reviewer-published token safety attestations on-chain.

This gives wallets, launchpads, DEX interfaces, dashboards, and future
BNB Chain security products a path to query token risk intelligence before
users interact with dangerous contracts.

## Current Proof Points

- Mainnet registry contract verified on BscScan.
- Reviewer authorization and wallet-published reports work on mainnet.
- Telegram alerts work.
- Wallet portfolio scan works.
- BNB collector is running on Railway.
- Public API health endpoint confirms database connectivity and classifier
  version.

Health response currently reports:

```json
{
  "status": "ok",
  "version": "rugbuster-bnb-api-v1",
  "classifier_version": "weighted_v2",
  "database_configured": true,
  "ai_provider": "none"
}
```

## Next Milestone

The next milestone is RugBuster Sentinel: proactive BNB Chain monitoring that
turns the existing collector, API, alerts, and registry into a continuously
running threat-intelligence layer for builders.

Sentinel will start as monitoring infrastructure and later evolve toward an
BNB Chain security layer.
