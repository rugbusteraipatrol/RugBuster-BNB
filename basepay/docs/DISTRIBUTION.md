# Where StableCart can be listed and sold

## Update 2026-09-22 — platform by platform

Researched after the WooCommerce plugin shipped. Ranked by reach per day of
work. "Works today" means the embeddable widget (one script tag) already runs
there; "channel" means a place merchants browse and install from.

| Platform | Can we be a real payment method? | Channel | Effort | Verdict |
| --- | --- | --- | --- | --- |
| **WordPress family** (Easy Digital Downloads, Gravity Forms, WPForms, GiveWP, memberships) | Yes — each has a gateway/add-on API like WooCommerce | WordPress.org, one listing per add-on | Low each (same server, same webhook, PHP already written) | **Do next.** Crypto add-ons already exist for EDD and Gravity Forms, so the category is accepted |
| **Payment links** (hosted checkout on stablecart.org) | Yes — any platform, invoices, Instagram, email | Our own site; no marketplace | ~1 day (we have `/pro/` as the template) | **Do first.** Works everywhere the plugins never will |
| **Framer** | Not in a cart, but Framer has no cart either: plugins add a Stripe/Razorpay/Dodo *button* | Framer Marketplace (plugins), 0% cut | Low–medium (small React plugin that inserts our embed) | **Good second channel.** Few crypto plugins there |
| **Webflow** | No — Webflow Ecommerce only takes Stripe and PayPal, no custom gateway API. A "buy this" button per product works today (KASETA store) | Webflow Marketplace (Designer Extension), review ~10–15 business days, needs demo video + docs | Medium | Worth it for trust and the Apps panel; after Framer |
| **PrestaShop** | Yes — payment module API; Addons marketplace has a Cryptocurrencies category | PrestaShop Addons (technical validation; 300k stores, strong in FR/ES/IT) | Medium (PHP module, ~WooCommerce-sized) | Do after the WordPress family; Europe-heavy audience that card processors decline |
| **OpenCart / Magento** | Yes — extension APIs | OpenCart marketplace (free listing); Magento Marketplace (strict review) | Medium each | Later; smaller and shrinking |
| **BigCommerce** | Half — no custom gateway API; crypto apps register as an *offline payment method* | App Marketplace | Medium | Later, only if asked |
| **Shopify** | Yes, but only via Payments Apps API after Payments Partner approval; blockchain-app rules; app must be free | Shopify App Store | High + compliance | Only on demand |
| **Wix** | Custom providers exist (Velo Payment Provider plugin) but **cannot be published to the App Market** — site owners must paste the code themselves. Listed crypto providers (CoinGate, Triple-A) are partnerships | None public | Low for a guide + Velo snippet; high for partnership | Guide only |
| **Squarespace** | No — Squarespace Payments, Stripe, PayPal, Square only | None | Low for a guide (embed needs Business plan) | Guide only |
| **Carrd, Ghost** | No custom providers (Ghost is Stripe-only; Carrd embeds on Pro) | None | — | Skip |

### Recommended order

1. **Payment links.** `stablecart.org/pay?merchant=…&amount=…&ref=…` with the
   widget on it and the merchant's own success message. One page, and every
   platform above can link to it.
2. **WordPress family add-ons**, cheapest reach we have: Easy Digital Downloads
   gateway, Gravity Forms and WPForms payment add-on, GiveWP donations. Each is
   its own WordPress.org listing, its own search term, and reuses the
   self-registration and webhook code from the WooCommerce plugin.
3. **Framer plugin.**
4. **Webflow App.**
5. **PrestaShop module**, then OpenCart.
6. Shopify when a merchant asks. Wix and Squarespace get a how-to page each.

### Sources

- Webflow payment providers (Stripe, PayPal only; custom via embed): https://www.flowradar.com/answer/can-a-third-party-payment-gateway-be-integrated-into-webflow-for-an-ecommerce-site
- Webflow Marketplace submission and review: https://developers.webflow.com/data/v2.0.0-beta/docs/marketplace/submitting-your-app
- Wix Payment Provider Service Plugin (own sites only, not App Market): https://dev.wix.com/docs/velo/events-service-plugins/payments/service-plugins/wix-payments/payment-provider/introduction
- Wix crypto providers (CoinGate, Triple-A, Bankful): https://support.wix.com/en/article/connecting-coingate-as-a-payment-provider-for-cryptocurrency-payments
- Squarespace accepted processors: https://support.squarespace.com/hc/en-us/articles/206541017-What-payment-methods-can-I-accept-with-Squarespace-Commerce
- Framer Marketplace payment plugins (Stripe, Razorpay, Dodo): https://www.framer.com/community/marketplace/plugins/categories/ecommerce/
- BigCommerce crypto as offline/app payment methods: https://www.bigcommerce.com/solutions/cryptocurrency-payments/
- Shopify blockchain app requirements: https://shopify.dev/docs/apps/build/blockchain
- PrestaShop Addons selling: https://addons.prestashop.com/en/content/25-how-to-sell-on-prestashop-addons
- PrestaShop Cryptocurrencies category: https://addons.prestashop.com/en/802-Cryptocurrencies
- EDD crypto gateways already listed (StableDeliver, CryptoPay, OxaPay): https://wordpress.org/plugins/stabledeliver-crypto-payments-for-easy-digital-downloads/
- Gravity Forms crypto add-ons: https://www.gravityforms.com/blog/gravity-forms-accept-7-cryptos/
- Ghost: Stripe only: https://ghost.org/help/alternative-payment-gateways/

---

## Original research (2026-09-15)

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
