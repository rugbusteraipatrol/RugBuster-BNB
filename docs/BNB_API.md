# RugBuster BNB API

Live API:

```txt
Pending dedicated BNB Railway deploy
```

RugBuster BNB exposes a cache-first BNB Chain risk API for wallets,
launchpads, DEX interfaces, dashboards, and L1 builder tooling. The public
endpoint returns compact labels from collected evidence, while private scan
access stays protected to control cost and prevent dataset scraping.

## Public Endpoints

```bash
curl https://rugbuster-api-production.up.railway.app/
curl https://rugbuster-api-production.up.railway.app/health
curl "https://rugbuster-api-production.up.railway.app/score?address=0x34f573187f1249a589a68aa2daf1f25e834c4444"
```

`GET /score?address=0x...` returns the latest cached score for a BNB Smart
Chain token if the collector has evidence for it.

Example response shape:

```json
{
  "address": "0x34f573187f1249a589a68aa2daf1f25e834c4444",
  "chain": "bnb",
  "label": "DANGER",
  "classifier": "weighted_v2",
  "source": "cache"
}
```

## Protected Endpoint

```bash
curl \
  -H "X-API-Key: <partner_or_internal_key>" \
  "https://rugbuster-api-production.up.railway.app/scan?address=0x..."
```

`GET /scan?address=0x...` is protected because it can perform deeper scoring
work and should not be freely scraped or abused. API keys are issued privately
for trusted integrations and internal workers.

## Data Model

The BNB Chain collector stores full scan records in Postgres. The API exposes
risk labels and compact integration responses, not the private raw corpus.

Current storage table:

```txt
bnb_scans(full_record JSONB)
```

Current classifier:

```txt
weighted_v2
```

## On-Chain Registry

Verified BNB Chain mainnet registry:

```txt
0x5F30276B3A5079E088Ec3072884286de5a868355
```

BscScan:

```txt
https://bscscan.com/address/0x5F30276B3A5079E088Ec3072884286de5a868355
```

The API layer and the registry serve different jobs:

- API: fast builder-facing lookups and protected deep scans.
- Registry: public on-chain attestations and reviewer-published proof.
- Collector: private evidence corpus used for scoring and model improvement.

Together they form the first RugBuster BNB security tooling layer for
BNB Chain builders and future L1 security infrastructure.
