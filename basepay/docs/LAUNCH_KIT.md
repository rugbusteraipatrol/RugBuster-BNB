# Launch kit — ready-to-paste copy

Written 2026-09-22. Everything here is posted by a person from their own
accounts; nothing is automated. Links:

- Site: https://www.stablecart.org
- Plugin download: https://www.stablecart.org/downloads/stablecart-for-woocommerce.zip
- Live checkout demo: https://www.stablecart.org/demo/
- Demo store (Webflow): https://basepay-demo-store.webflow.io — unfinished (KASETA), do not link it yet

Order matters: WordPress.org first (the review clock is the long pole), then
the free directories, then the community posts once one or two of them are live.

---

## 1. WordPress.org plugin submission (today)

1. Log in (or create an account) at https://login.wordpress.org. The username
   becomes the plugin's `Contributors:` line in `readme.txt` — if it is not
   `fantomstudio`, change that line before uploading.
2. Go to https://wordpress.org/plugins/developers/add/
3. Upload `stablecart-for-woocommerce.zip` (the same file as the download link).
   Plugin Check already passes with no errors.
4. Plugin name: **StableCart for WooCommerce**. The slug will be
   `stablecart-for-woocommerce`.
5. Review is manual. Expect an email within a few days to a few weeks; reviewers
   sometimes ask for changes. Reply from the same account.

---

## 2. Directories (one afternoon)

### Short description (≤ 160 chars)

> Accept USDC on Base straight into your own wallet. WooCommerce plugin: paste a wallet address, save, done. No account, no custody, no fee on sales.

### Long description

> StableCart is a non-custodial checkout for USDC on the Base network. Buyers pay the merchant's own wallet directly, in one transaction; StableCart never holds the money and cannot freeze or reverse it.
>
> The WooCommerce plugin sets up in about a minute: paste the wallet address that should receive payments and save. The shop registers itself — no account, no API keys, no identity check. Buyers get a pay page with the exact amount and a QR code for any wallet app; the order completes on its own once the payment confirms.
>
> Each order is quoted a unique amount (e.g. 25.000173 USDC), which is how payments are matched to orders without generating per-order wallets. Payments that arrive after the quote expired are still matched for 24 hours.
>
> Free for 20 paid orders a month; Pro is $12 per 30 days for unlimited orders, paid in USDC from the plugin settings. No fee on sales on either plan.

Category / tags: payments, stablecoins, USDC, Base, WooCommerce, merchant tools, non-custodial.

| Where | Link | Notes |
| --- | --- | --- |
| Alchemy Dapp Store | https://www.alchemy.com/dapps (Submit) | Category: Payments |
| Base ecosystem | https://www.base.org/ecosystem | No public form; ask in the Base Discord #builders, or the Base Services Hub provider form |
| DappRadar | https://dappradar.com/dashboard/submit-dapp | Chain: Base |
| AlternativeTo | https://alternativeto.net/software/new/ | List it as an alternative to Stripe, Coinbase Commerce, NOWPayments |
| SaaSHub | https://www.saashub.com/submit | Free listing |

---

## 3. Community posts

Rule for all of them: answer the question that is actually being asked, link
once, say you built it. No cross-posting the same text.

### Indie Hackers (post)

**Title:** I built a crypto checkout that sets up by pasting a wallet address

> Merchants who get turned down by card processors (CBD, supplements, adult, some SaaS, lots of shops outside the US/EU) usually end up on crypto gateways that hold their money, ask for KYC anyway, or take 1%.
>
> I built StableCart: USDC on the Base network, paid straight into the merchant's own wallet. The service only watches the chain and tells the shop when an order is paid — it has no key and can't touch the money.
>
> The part I'm proudest of is onboarding. The WooCommerce plugin has one field: your wallet address. Save, and the shop registers itself (it proves it controls its own webhook URL with a signed challenge). No account, no dashboard, no API key.
>
> Matching payments to orders without a wallet per order: every open order gets a unique amount, 25.000000, 25.000001, 25.000002… The last digits are a tenth of a cent, but they tell us exactly which order was paid. And late payments still settle for 24h, because real buyers wander off to find their wallet.
>
> Pricing: free for 20 paid orders a month, $12 per 30 days unlimited (paid in USDC from the plugin), no cut of sales.
>
> Live demo (pay $0.01 if you want to see it settle): https://www.stablecart.org/demo/
>
> Would love feedback, especially from anyone who's been de-platformed by a processor.

### Reddit — r/woocommerce (only as an answer, or a Showcase flair post if the sub allows)

> I ran into the same thing and ended up building a plugin for it: StableCart. Buyers pay USDC on Base straight into your wallet, the order completes when the payment confirms, and setup is literally pasting a wallet address — no account or KYC on our side. Free up to 20 orders/month. It's in review on WordPress.org; the zip is here in the meantime: https://www.stablecart.org/downloads/stablecart-for-woocommerce.zip — happy to answer questions, I'm the developer.

### Reddit — r/webflow

> Webflow's own checkout only takes Stripe and PayPal, so this won't replace the cart — but for a "buy this item" button it works today: one Embed element, buyer pays USDC into your wallet, you get a signed webhook when it's paid. Here's a Webflow store running it: https://basepay-demo-store.webflow.io (I built both, so take it with that in mind).

### X / Twitter (thread starter)

> Shipped: StableCart for WooCommerce.
>
> Paste a wallet address → your shop takes USDC on @base.
> No account. No KYC. No custody. No cut of sales.
>
> Each order gets a unique amount (25.000173) so payments match orders without a wallet per order.
>
> Free up to 20 orders/mo.
> https://www.stablecart.org

---

## 4. Before posting anywhere, check

- [ ] The KASETA demo store is on hold (prints not made yet): leave it out of posts.
- [ ] Alchemy key rotated.
- [x] Custom domain: stablecart.org (bought 2026-09-22). The product was renamed
      from BasePay because Coinbase ships a product called "Base Pay".

---

## 5. While the plugin is in review (added 2026-09-23)

Version 0.2.2 was uploaded and answered in the review thread on 23 September;
the plugin is back in the reviewer's queue. Until it is approved there is **no
wordpress.org listing to link to**, so every post below points at the payment
links and the zip instead. Do not write "available on WordPress.org" yet.

### What can be published today

| Where | Link | Why it is worth it |
| --- | --- | --- |
| Base Dashboard — register the app | https://dashboard.base.org/register | Sign in with the wallet that receives payments. Registered apps are discoverable in Base's own surfaces, and registration is the entry point for Base's growth programmes |
| Builder Rewards (Talent Protocol) | https://www.builderscore.xyz | Weekly ETH pool split between builders on Base; needs a Basename and a Builder Score of 40+, computed from public GitHub and onchain activity. No application — the score is computed and rewards are paid to the Farcaster primary wallet |
| SaaSHub | https://www.saashub.com/submit | Free listing, reachable, no login wall |
| BetaList | https://betalist.com/submit | Free queue for pre-launch products |
| AlternativeTo | https://alternativeto.net/software/new/ | List as an alternative to Coinbase Commerce, NOWPayments, CoinPayments |
| Product Hunt | https://www.producthunt.com/posts/new | Keep for the day the plugin is approved — one shot, and "install from WordPress.org" is most of the pitch |

### Channels to stay out of

- **Other plugins' support threads on wordpress.org.** Answering a NOWPayments
  or CryptAPI support topic with our plugin is self-promotion in someone else's
  forum; it gets the account flagged, and the plugin is still under review by
  the same organisation. Not worth it at any conversion rate.
- **Reddit link-drops.** Reddit can only be posted to by hand (its pages are not
  reachable from the tooling here), and a first post from an account with no
  history reads as spam. Answer an existing question or post nothing.

### The one thing that beats all of it

Payment links need no approval from anyone: https://www.stablecart.org/links/
One real merchant using them — a photographer invoicing a client, a shop
selling to a crypto-paying customer — is worth more than ten directory
listings, because it produces a screenshot, a quote and a first paid order.
