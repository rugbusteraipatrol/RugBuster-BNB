# Webflow support — the policy question to ask before building

Send at <https://support.webflow.com>. Category: Webflow Apps / Developer
Platform. The point is to spend one email finding out whether a crypto payment
App is allowed at all, rather than three weeks building one and asking after.

Webflow's own documentation has no rule either way on payments, cryptocurrency
or stablecoins — the Marketplace Guidelines cover fee disclosure, deceptive
pricing, ads and write-operation security, and stop there. So the answer has to
come from a human, and it is worth getting in writing before the work starts.

---

## Subject

> Marketplace policy: is a non-custodial stablecoin payment App permitted?

## Body

> Hello,
>
> I am planning a Webflow App and would like to confirm it is permitted before
> building it, so I do not waste your reviewers' time or mine.
>
> **What it does.** StableCart lets a Webflow site accept USDC — a dollar
> stablecoin — on the Base network. The App would place a checkout element on
> the page and register our script through the Custom Code API. The buyer pays
> in one blockchain transaction and the site owner is notified when it confirms.
>
> **The part I think matters for policy:** it is non-custodial. The payment goes
> from the buyer's wallet straight to the site owner's own wallet address. Our
> service never holds, routes or touches the money — it only watches the public
> blockchain and reports what it sees. We have no ability to freeze, delay or
> reverse a payment, and we take no percentage of any sale. There is no account
> to open and no funds of anyone's on our side to lose.
>
> The same product is already published on WordPress.org, where it passed the
> plugin review:
> https://wordpress.org/plugins/stablecart-for-woocommerce/
>
> **My questions:**
>
> 1. Does the Marketplace permit Apps that process payments in cryptocurrency or
>    stablecoins? I could not find a rule either way in the Marketplace
>    Guidelines.
> 2. If it is permitted, are there extra requirements for payment Apps —
>    disclosures, a compliance review, or restrictions on what the App may place
>    on a published site?
> 3. If it is not permitted, is a listing that only *links* to our hosted
>    payment pages acceptable instead, without any payment element on the
>    Webflow site itself?
>
> Our pricing is freemium and would be disclosed on the listing: free up to 20
> paid orders a month, $12 per 30 days above that, and no fee on sales on either
> plan.
>
> Thank you,
> Fedja — Fantom Studio, Serbia
> hello@stablecart.org · https://www.stablecart.org

---

## Why it is shaped this way

- **It leads with non-custodial.** The risk a marketplace fears from a payment
  App is holding other people's money. Saying plainly that we cannot is the
  fastest way past that worry.
- **It cites the WordPress.org approval.** Another platform's review already
  passed this exact code. That is evidence, not a claim.
- **Question 3 gives them an easy yes.** If a checkout element on the canvas is
  the problem, a link-only listing may still clear — and the point of the
  Marketplace for us is discovery, not the embed, which already works today via
  a plain script tag.

## What to do with the answer

| Answer | Next step |
| --- | --- |
| Permitted | Build the Hybrid App. Reckon on 10–15 business days of review after that, plus the demo video, the 3–5 screenshots at 1280×846, the 900×900 logo, and a published `.webflow.io` site with the App installed. |
| Permitted with conditions | Write the conditions into this file before any code. |
| Not permitted | Drop the App. Put the effort into the directories and the Product Hunt launch, which the WordPress.org approval has just unblocked. |
