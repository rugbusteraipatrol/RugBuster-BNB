# Where BasePay can be listed and sold

Researched 2026-09-15. Ranked by: is it actually allowed, how many merchants it
reaches, and how much work it costs. Sources at the bottom.

The short version: **one channel gives real distribution (WooCommerce), a
handful of free directories give backlinks and a trickle, and two marketplaces
are gated behind a review process.** Directory listings are not customers; they
are how customers eventually find the page.

## Tier 1 — proven allowed, biggest reach

### WordPress.org / WooCommerce plugin

**Verified allowed.** The WordPress.org directory already hosts several
non-custodial crypto gateways for WooCommerce — Card2Crypto, NoHoldPay,
CoinPayGateway, StableDeliver — all with the same model as BasePay: buyer pays
the merchant's own wallet, no custody, no KYC.

- **Reach:** WooCommerce is the largest e-commerce install base in the world.
- **Work:** a PHP plugin that registers a WooCommerce payment gateway and calls
  BasePay's API to open a session, then completes the order from the webhook.
  The service does not change; this is a wrapper. Bounded, not small.
- **Competition exists.** That is the market telling you it is real. Differentiate
  on the parts they skimp on: the exact-amount attribution, reorg handling, and
  honest docs.
- **Listing:** free. Review takes days to weeks; plugins must be GPL.

This is the single highest-value thing to build after deployment.

## Tier 2 — free directories, low effort, indirect payoff

Do all of these in one afternoon the week the site goes live. Each is a backlink
and a place a searching merchant might land. None of them are traffic on their own.

| Directory | Why | Cost |
| --- | --- | --- |
| **Alchemy Dapp Store** | Lists 298 "web3 payment tools"; takes inbound submissions | Free |
| **Base ecosystem** (base.org/ecosystem) | The official list of what runs on Base. Exact submission path is not published; the Base Services Hub has a provider form, and their Discord is the other route | Free |
| **DappRadar** | Standard dapp listing | Free |
| **Product Hunt** | Launch-day traffic and a permanent page. Do it once, properly, with the demo | Free |
| **AlternativeTo** | High-authority backlink; people searching "Stripe alternative" browse it | Free |
| **Indie Hackers** | Founders who got declined by processors are there | Free |

## Tier 3 — allowed but gated

### Webflow Marketplace

Covered in HANDOFF.md. No crypto prohibition found in the guidelines; the forum
is effectively dead for questions; the path is register an app → build a
Designer Extension that installs the widget → submit for review. Worth it
later for the trust signal. Requires the service to be live first.

### Shopify App Store

**Allowed, but heavy.** Verified requirements: crypto/blockchain payment apps
need approval under Shopify's Payments Partner program, the submitter must own
the gateway, the app itself must be free, and there are fulfilment-tracking and
compliance obligations. Shopify already lists Coinbase Commerce, BitPay and
others as "alternative payment methods".

This is a real process with real compliance work. Do it only if there is
demonstrated Shopify demand. Not first.

## Tier 4 — works today, no listing needed

**Wix, Squarespace, Framer, Carrd** all support custom HTML/script embeds, so
the widget already works on them. There is nothing to submit. Reach them with
one short "how to add BasePay to <platform>" page each, targeting the search.
Their app marketplaces were not checked for payment-app policies.

## Communities where the customer already is

Not listings — conversations. Answer the question, link the page, do not pitch.

- The Webflow forum threads on crypto payments (linked in earlier notes)
- Reddit: r/ecommerce, r/smallbusiness, r/webflow, r/woocommerce, r/Entrepreneur
- The Webflow Wishlist item asking for crypto payments
- Indie Hackers

## Two things to decide before any of this

**Who you will and will not serve.** The "declined by Stripe" market includes
people declined for good reasons. The high-risk-processor space (RiskPay and
similar) is crowded and legally exposed. Decide your line now — it is in the
landing page's FAQ already, and it should be true.

**How you charge.** Non-custodial means you cannot take a cut of the payment;
the money never passes through. That leaves a subscription or a flat fee, billed
separately. Every listing above asks for pricing. Have the number.

## Recommended order

1. Deploy (HANDOFF.md).
2. Same week: the Tier 2 directories, all of them, one afternoon.
3. Next build: the **WooCommerce plugin**. It is the only item here that is
   distribution rather than discoverability.
4. Then: Webflow App, for trust.
5. Shopify only if merchants ask for it.

## Sources

- WordPress.org crypto-payments tag: https://wordpress.org/plugins/tags/crypto-payments/
- NoHoldPay (non-custodial, listed): https://wordpress.org/plugins/noholdpay-non-custodial-crypto-payments/
- Card2Crypto (listed): https://wordpress.org/plugins/card2crypto-crypto-payment-gateway/
- Shopify App Store requirements: https://shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements
- Shopify blockchain apps: https://shopify.dev/docs/apps/build/blockchain
- Shopify third-party payment providers: https://help.shopify.com/en/manual/payments/third-party-providers
- Alchemy Dapp Store, web3 payment tools: https://www.alchemy.com/dapps/best/web3-payment-tools
- Base ecosystem: https://www.base.org/ecosystem
- Base Services Hub: https://docs.base.org/base-services-hub
- DappRadar: https://dappradar.com/
- Product Hunt submission: https://www.producthunt.com/products/submitting
- AlternativeTo FAQ: https://alternativeto.net/faq
