=== BasePay – USDC Payments for WooCommerce ===
Contributors: fantomstudio
Tags: crypto, usdc, stablecoin, payment gateway, base
Requires at least: 6.4
Tested up to: 7.1
Requires PHP: 7.4
Stable tag: 0.2.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Accept USDC on Base straight into your own wallet. Paste a wallet address, save, done. No account, no API keys, no custody, no fee on sales.

== Description ==

BasePay lets a WooCommerce shop take **USDC** (a dollar stablecoin) on the **Base** network. The buyer pays your wallet directly, in one blockchain transaction. BasePay never holds the money and cannot freeze, delay or reverse it.

**Setup takes one minute.** Paste your wallet address into the gateway settings and save. The plugin registers your shop with the BasePay service by itself: there is no account to open, no email to confirm, no API key to copy and no identity check. If you can receive USDC in a wallet, you can take payments.

**What the buyer sees.** At checkout they pick "USDC on Base" and land on a pay page with the exact amount and a QR code. They scan it with any wallet app on their phone, or pay from a browser wallet such as MetaMask or Coinbase Wallet. The page updates itself while the network confirms the payment, then sends them to your order-received page. The pay page speaks English and Serbian.

**What you see.** The order moves to *Processing* (or *Completed* for virtual goods) the moment the payment has enough confirmations, with a note linking the transaction on Basescan. If a buyer sends too little, the order goes *On hold* with a note saying how much arrived, and nothing is refunded automatically.

**Prices in any currency.** Your shop can be priced in EUR, GBP, RSD or anything else. The plugin converts the order total to US dollars at a daily market rate (or a rate you pin yourself) and the buyer pays that in USDC.

**Plans.** The free plan covers 20 paid orders per calendar month. Pro is $12 for 30 days, unlimited, paid in USDC from the gateway settings with one click; it switches on by itself. There is no subscription to cancel. The gateway settings show how many orders you have used.

= How it stays safe =

* Every payment gets its own exact amount (for example 45.000173 USDC). That is how BasePay knows which order was paid without giving each order a new wallet.
* Payment notifications are signed (HMAC-SHA256). The plugin checks the signature against the raw request before touching an order.
* A payment only completes an order if it was quoted for that order's amount.
* Blockchain reorganisations are handled: a payment that disappears from the chain does not complete an order.

= External services =

This plugin connects to the **BasePay service** (https://basepay-production.up.railway.app), operated by Fantom Studio, which watches the Base blockchain for your payments:

* On save of the settings it sends your **wallet address, your shop URL and a webhook secret** to register the shop, and later to change the wallet.
* On the pay page the buyer's browser loads the BasePay checkout widget from that service and opens a payment session containing the **order amount in USD and the order reference** (order id plus a fragment of the order key). No customer name, email or address is sent.
* The service calls your shop's `?wc-api=basepay` endpoint to confirm payments.
* The settings page reads your plan and usage from the service. Upgrading to Pro opens a BasePay checkout page on the same service (https://basepay-production.up.railway.app/pro/), which sends your shop id as the order reference.

Terms and privacy: https://basepay-production.up.railway.app

For currency conversion in shops not priced in USD, the plugin fetches daily exchange rates from **open.er-api.com** (https://www.exchangerate-api.com/terms). Only the request for rates is made; nothing about your shop is sent.

The pay page links transactions to **basescan.org**, a public block explorer.

== Installation ==

1. Install and activate the plugin.
2. Go to *WooCommerce → Settings → Payments → BasePay – USDC on Base*.
3. Paste the wallet address that should receive payments and click *Save changes*.
4. The page shows *Connected*. You are taking USDC.

Your shop must be reachable over https from the internet, so payment notifications can arrive. Sites on localhost or behind a password cannot connect.

== Frequently Asked Questions ==

= Do I need an account with BasePay? =

No. Saving a wallet address is the whole registration. Your shop proves it controls its own webhook address, and that is the only credential.

= Which wallets can buyers use? =

Any wallet that holds USDC on the Base network and can scan a QR code or connect to a website: MetaMask, Coinbase Wallet, Rabby, Trust Wallet, Rainbow, hardware wallets through their apps, and exchange withdrawals to Base.

= What does it cost? =

Nothing per sale. The buyer pays the Base network fee, usually well under a cent. The free plan includes 20 paid orders a month; Pro removes the limit for $12 per 30 days, paid in USDC from the settings page.

= Can I refund? =

Refunds are a transfer from your wallet back to the buyer's address, which you make from your own wallet. The plugin does not move your money, so it cannot refund automatically. The buyer's address is in the order note.

= What if a buyer sends the wrong amount? =

If too little arrives the order goes on hold with a note of the amount received. If too much arrives (up to 10 % over) the order completes normally. Money always lands in your wallet either way.

= Does it work with the block checkout? =

Yes, both the classic shortcode checkout and the block-based checkout are supported. High-Performance Order Storage is supported as well.

== Changelog ==

= 0.2.0 =
* Upgrade to Pro from the settings page, paid in USDC. Payments that arrive after the pay page expired are still matched for 24 hours.

= 0.1.0 =
* First release: USDC on Base gateway, one-minute self-registration, signed webhooks, currency conversion, block checkout support.
