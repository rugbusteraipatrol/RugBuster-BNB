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

## Redesign status (published 2026-11-10)

Published to `basepay-demo-store.webflow.io` on 2026-11-10 at the owner's
request. It has not been viewed in a browser yet: the session that made the
edits could not open the site or the Designer, so every page type still needs
a look.

- Twelve images uploaded (ids in `assets.json`).
- Home (`6aaa6b8c53b07de8aafbd7a2`): new hero image and copy, Strana B section
  with ten cards, rainbow bar, older grid relabelled "Strana A", announce and
  ticker text, FX embed.
- Shop (`6aaa7240afee14d00a0c9c6a`): banner, Strana B grid, heading for the
  Strana A grid, texts, FX embed.
- Ten Strana B product pages, all duplicates of `/trece-oko` and therefore
  sharing its element ids. Each has its own name, copy, image, tee colour
  swatch and `data-product` value in the checkout embed.

  | slug | page id | tee |
  |---|---|---|
  | trece-oko | `6af240218780ca9c7a5a1f0e` | black |
  | tecno-sunce | `6af2cecb4c918da2c831179b` | white |
  | sumski-trip | `6af2cecbead7d7f72ea5a125` | white |
  | hipnoza | `6af2cecc7efaf61368e677e2` | black |
  | tunel | `6af2cecc135b3cab05099006` | white |
  | lava | `6af2cece4c918da2c8311918` | black |
  | kaleidoskop | `6af2ced1135b3cab0509931a` | white |
  | leto-ljubavi | `6af2ced22237cb12f01687d8` | black |
  | kosmicka-kaseta | `6af2ced332f37deb8f6581d0` | white |
  | dobre-vibracije | `6af2ced38949ac4cedee516c` | white |

- Six older product pages, about and thank-you: FX embed, announce and ticker
  text, nav link "STRANA B" to `/#strana-b`, "SVIH 16" on the product pages.

The FX embed is a copy of `ksite.FX` on every page, so a change to it has to be
written to each page's embed again.

Webflow's API returned 502 on batches of about twenty element edits; batches
of eight or fewer went through.

## Print files (A3)

`print/` holds the ten Strana B designs as print-ready vector files, one A3
portrait page each (297 x 420 mm, 10 mm clear margin, transparent background):
`print/pdf/` with fonts embedded and `print/svg/` with text converted to
outlines. `print/PROCITAJ.txt` is the note for the print shop (print size per
design, tee colour, which three designs contain raster effects).

To regenerate: `python3 print_prep.py` then `node print_make.js` (needs
Playwright and the woff2 files in `fonts/`, which are not in the repo), then
`pdftocairo -svg` on each PDF. `print_make.js` also writes a 300 dpi PNG per
design; those are not committed because of their size.
