# KASETA demo store — art and page sources

Everything that draws the Webflow demo store at
<https://basepay-demo-store.webflow.io> (site id `6aaa6b8a53b07de8aafbd777`).
The site itself lives in Webflow; this folder is what regenerates its images and
holds the copy and CSS that were pushed into it.

| File | What it is |
| --- | --- |
| `gen.py` | Draws the ten "Strana B" tees as SVG and renders them to PNG with headless Chromium |
| `hero.py` | The Strana B hero and section banner, composed from the tee cut-outs |
| `ksite.py` | Product list and copy, the new CSS classes, and the per-page FX embed |
| `wf.py` | Prints the exact HTML and CSS payloads that were inserted through the Webflow MCP |
| `mock.py` | A local replica of the redesigned pages, for checking the look without publishing |
| `site.css` | The store's existing class styles, exported from Webflow on 2026-11-09 |
| `assets.json` | File name to Webflow asset id for the twelve uploaded images |

Fonts are not committed. `gen.py` expects woff2 files in `fonts/`, fetched from
Google Fonts (Anton, Shrikhand, Monoton, Bungee, Bungee Shade, Righteous, Rubik
Wet Paint, Modak). The paths in `mock.py` assume the layout of the session that
wrote it and need adjusting before it runs elsewhere.

## Redesign progress (unpublished)

Nothing below is live until the site is published from Webflow. Last update
2026-11-10.

Done:

- Twelve images uploaded (ids in `assets.json`).
- Home (`6aaa6b8c53b07de8aafbd7a2`): new hero image and copy, Strana B section
  with ten cards (`61688f75-484f-8ea2-b1b8-5fb25ee8a336`), rainbow bar, older
  grid relabelled "Strana A", announce and ticker text, FX embed
  (`194fc7bf-2d81-a2c6-ef39-d952063f5513`).
- `/trece-oko` created (`6af240218780ca9c7a5a1f0e`) as a plain duplicate of
  `/sunset-86`; its content is still Sunset '86.

To do:

- Shop: banner, Strana B grid, heading for the Strana A grid, texts, FX embed.
- Turn `/trece-oko` into the Strana B product template, then duplicate it for
  the other nine slugs in `ksite.STRANA_B` and swap name, copy, image, tee
  colour and the `data-product` value in the checkout embed.
- Older pages (six products, about, thank-you): FX embed, announce and ticker
  text, nav link "STRANA B", "SVIH 16".

Webflow's API returned 502 on batches of about twenty element edits; batches
of eight or fewer went through.
