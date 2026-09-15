# Handoff — continuing BasePay from another session

Read this first, then [`DEPLOY.md`](./DEPLOY.md). Everything below is settled;
do not re-litigate it.

## What this is

`basepay/` is a self-contained Node/TypeScript project in this repository. It is
**non-custodial USDC checkout on Base**: a merchant gives a wallet address, the
buyer pays it directly, and this service watches the chain and reports status.
It holds no key and moves no funds. It shares nothing with the Python collectors
at the repository root.

## State: the code is finished

CI is green on `claude/basepay-usdc-widget-7815r3` — lint, typecheck, build,
tests (including a suite that runs the whole payment flow against anvil and a
real ERC-20), `npm audit`, and the Docker image.

Built and verified: the session API and amount-offset attribution, the chain
watcher with reorg handling and restart backfill, HMAC-signed webhooks with
retry and dead-lettering, the embeddable widget, reference webhook receivers in
[`../examples/`](../examples/) (Node and Flask, both tested against the real
signer), a marketing page in [`../site/`](../site/), and this runbook.

**Nothing in the code is blocking. What remains is deployment.**

## Decisions already made

| | |
| --- | --- |
| Product shape | Embeddable `<script>` widget, not a Webflow Marketplace app. A Marketplace app is wanted later as a second channel, and would *install* this widget — the widget is its prerequisite, not its alternative. |
| Database | **Neon** free tier, to avoid Railway's Postgres cost until there is traffic |
| App hosting | **Railway** (the user already runs other services there) |
| RPC | **Alchemy**, free tier, Base mainnet. The user has the HTTPS and WSS URLs in hand. |
| Merchant wallet | `0x3208F5DfE9B2010bBe711033f39fF7Ee83039AAf` — checksum verified, accepted by the service, funded with ETH on Base for gas |

## What the user has, and what they do not

**In hand:** the wallet address above; Alchemy HTTPS + WSS URLs.

**Not yet done:** Neon project and its `DATABASE_URL`; the Railway service;
merchant registration; the three placeholders in [`../site/`](../site/README.md)
(domain, pricing, contact address).

Secrets — the RPC URLs, `DATABASE_URL`, `ADMIN_TOKEN`, webhook secrets — go
straight into Railway's environment variables. They must not be pasted into chat
or committed.

## Next steps, in order

1. **Neon** — create a project, take the connection string, set it as
   `DATABASE_URL`. The service migrates on boot, so there is no separate
   migration step.
2. **Railway** — new service from this repository, branch
   `claude/basepay-usdc-widget-7815r3`. **Set the service's Root Directory to
   `basepay`**, or Railway builds the Python project at the repository root
   instead. Then the variables in DEPLOY.md section 2.
3. **Check** `/readyz` — it names any failing dependency.
4. **Register the merchant** with the wallet address above (DEPLOY.md section 4).
5. **Webhook receiver** — copy one from `../examples/` and point the merchant's
   `webhookUrl` at it. Until this exists, payments are recorded but no order
   completes.
6. **One real $1 payment** end to end before pointing any customer at it.

## Why this could not be done in the previous session

It ran in a cloud container whose network policy blocks `railway.com` and
`neon.tech` outright — 403 at the proxy, with or without credentials. A session
running on the user's own machine can reach both. That is the only reason the
work moved.

## How the user wants to be worked with

Short answers. One step at a time. They asked explicitly for less text and for
finishing one thing before starting the next. Do not send long plans; send the
next step and wait.
