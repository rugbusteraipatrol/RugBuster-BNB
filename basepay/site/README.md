# Landing page

A static page for the searches your customers actually type — *"accept crypto
payments without a merchant account"*, *"payment processor rejected my
business"*, *"accept USDC on my website"*. No build step, no dependencies, no
JavaScript required to read it.

Served by the BasePay service at `/` when `SERVE_SITE` is on (the default), so
the marketing page, the widget and the API all sit on one domain and one deploy.

## Before it goes live — replace these

Search the directory for `example.com` and for `REPLACE`. Nothing here ships
correctly until all of it is real.

| What | Where |
| --- | --- |
| `pay.example.com` → your domain | `index.html` (title tags, canonical, Open Graph, the embed snippet, JSON-LD), `robots.txt`, `sitemap.xml` |
| Your pricing | `index.html`, the "What does it cost?" FAQ answer |
| `hello@example.com` → your contact | `index.html`, the closing call to action |
| Social share image | add one and reference it as `og:image`; without it, links shared on social look bare |

`lastmod` in `sitemap.xml` should be updated whenever you meaningfully edit the
page.

## Why the page is written the way it is

**It answers the question the searcher asked.** Someone who just got declined by
a processor is not searching for a brand — they are searching for whether a way
around it exists. The page says yes in the first sentence and explains the trade
immediately.

**The FAQ is the SEO engine.** Each question is a real long-tail search, written
as a question and answered directly, and mirrored in `FAQPage` JSON-LD so search
engines can surface the answers. Adding questions over time is the cheapest way
to grow traffic; add them in both places.

**It is honest about the limits.** There is a whole section on where BasePay is
the wrong fit. That is not modesty — this audience has been sold to by people who
hid the catch, and burying "refunds are manual" until after the first order costs
more than the sale was worth.

**No fabricated proof.** No invented testimonials, customer counts or logos. Add
real ones when you have them.

## After you deploy

1. Verify the domain in [Google Search Console](https://search.google.com/search-console)
   and submit `sitemap.xml`.
2. Check the structured data with the
   [Rich Results Test](https://search.google.com/test/rich-results) — the FAQ
   markup is what can earn expanded results.
3. Get listed where your buyers already look: the Base ecosystem directory, the
   Webflow forum thread on crypto payments, and any "Stripe alternatives"
   roundups that accept submissions. Those links do more early on than the page
   itself.

Ranking takes weeks, not days. The page working on day one is the listings and
the links, not the search traffic.
