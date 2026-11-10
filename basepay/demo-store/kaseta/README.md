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
