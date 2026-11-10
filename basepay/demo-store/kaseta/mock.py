#!/usr/bin/env python3
"""Local replica of the redesigned KASETA pages, for checking the look before touching Webflow."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gen, ksite as S
H = gen.HERE; O = gen.OUT; ORIG = os.path.join(H, "orig")
BASE = open(os.path.join(H, "..", "site.css")).read()
WF = "body{margin:0} *{box-sizing:border-box} img{max-width:100%;vertical-align:middle;display:inline-block} a{background-color:transparent} h1,h2,h3{margin:0}"

def img(p): return "file://" + p
def head(extra=""):
    return f'<!doctype html><html><head><meta charset="utf-8"><style>{gen.font_css()}{WF}{BASE}{S.NEW_CSS}{extra}</style></head><body><div class="k-page">'
def nav():
    return f'''<div class="k-announce"><span class="k-announce-text">{S.ANNOUNCE}</span></div>
    <header class="k-nav"><a class="k-logo-link" href="/"><img class="k-logo" src="{img(ORIG+'/logo-kaseta.png')}"></a>
    <nav class="k-menu"><a class="k-menu-link" href="#">PRODAVNICA</a><a class="k-menu-link" href="#">STRANA B</a><a class="k-menu-link" href="#">O NAMA</a><a class="k-cart" href="#">KORPA (0)</a></nav></header>'''
def card_b(slug, name, colour, sub, _d):
    return f'''<a class="k-card-b" href="#"><div class="k-card-b-media"><img class="k-card-img" src="{img(O+'/tee-'+slug+'.png')}"><span class="k-badge-b">NOVO</span></div>
    <div class="k-card-info"><span class="k-card-b-name">{name}</span><span class="k-card-b-price">$0.10</span></div><span class="k-card-b-sub">{sub}</span></a>'''
def card_a(slug, name, sub):
    return f'''<a class="k-card" href="#"><div class="k-card-media"><img class="k-card-img" src="{img(ORIG+'/tee-'+slug+'.png')}"><span class="k-badge">STRANA A</span></div>
    <div class="k-card-info"><span class="k-card-name">{name}</span><span class="k-card-price">$0.10</span></div><span class="k-card-sub">{sub}</span></a>'''
def section_b(n=10):
    return f'''<div class="k-rainbow"></div><section class="k-b" id="strana-b"><div class="k-b-head"><div><span class="k-b-eyebrow">NOVA KOLEKCIJA · 10 MAJICA</span><h2 class="k-b-title">STRANA B: PSIHODELIJA</h2>
    <p class="k-b-lead">Okrenuli smo kasetu. Na drugoj strani su boje koje cure, spirale koje se vrte i jedno oko koje sve vidi.</p></div><a class="k-b-link" href="#">SVIH 10 →</a></div>
    <div class="k-grid-5">{''.join(card_b(*p) for p in S.STRANA_B[:n])}</div></section>'''
def footer():
    return '''<footer class="k-footer"><div class="k-footer-top"><div><p class="k-footer-tag">Retro majice iz leta '86. Štampano u Beogradu.</p></div></div>
    <div class="k-footer-bottom"><span class="k-footer-small">© 1986–2026 KASETA®. DEMO PRODAVNICA.</span></div></footer>'''
def home():
    return head() + nav() + f'''
    <section class="k-hero"><img class="k-hero-img" src="{img(O+'/hero-strana-b.png')}"><div class="k-hero-bar"><p class="k-hero-copy">Deset novih printova za Stranu B. Okreni kasetu i pusti da se boje razliju.</p><a class="k-btn" href="#">POGLEDAJ STRANU B →</a></div></section>
    <div class="k-ticker"><span class="k-ticker-text">{S.TICKER}</span></div>
    {section_b()}
    <section class="k-section" id="new-drop"><div class="k-section-head"><h2 class="k-h2">STRANA A: LETO '86</h2><a class="k-link" href="#">SVIH 16 →</a></div>
    <div class="k-grid">{''.join(card_a(*p) for p in S.STRANA_A)}</div></section>
    <section class="k-cta"><h2 class="k-cta-title">PREMOTAJ NA '86.</h2><a class="k-btn-yellow" href="#">SVE MAJICE →</a></section>
    ''' + footer() + f'</div>{S.FX}</body></html>'
def pdp(i=0):
    slug, name, colour, sub, desc = S.STRANA_B[i]
    sw = "k-swatch-crna" if colour == "CRNA" else "k-swatch"
    sizes = "".join(f'<div class="k-size">{x}</div>' for x in ["S", "M", "L", "XL", "XXL"])
    return head() + nav() + f'''<section class="k-pdp"><div class="k-pdp-media"><img class="k-pdp-img" src="{img(O+'/tee-'+slug+'.png')}"></div>
    <div class="k-pdp-info"><a class="k-crumb" href="#">← SVE MAJICE</a><span class="k-tag-b">STRANA B · PSIHODELIJA</span><h1 class="k-h1">{name.upper()}</h1>
    <span class="k-pdp-price">$0.10 USD (TEST)</span><p class="k-p">{desc}</p><span class="k-label">VELIČINA</span><div class="k-sizes">{sizes}</div>
    <span class="k-label">BOJA</span><div class="k-colour"><div class="{sw}"></div><span>{colour}</span></div>
    <span class="k-label">PLAĆANJE</span><div class="k-checkout"><div style="padding:20px"><button class="k-btn">PLATI $0.10 U USDC →</button></div></div></div></section>
    <div class="k-ticker"><span class="k-ticker-text">{S.TICKER}</span></div>
    <div class="k-rainbow"></div><section class="k-b"><div class="k-b-head"><div><span class="k-b-eyebrow">JOŠ SA STRANE B</span><h2 class="k-b-title">NASTAVI TRIP</h2></div><a class="k-b-link" href="#">SVIH 16 →</a></div>
    <div class="k-grid-5">{''.join(card_b(*p) for p in S.STRANA_B[1:6])}</div></section>''' + footer() + f'</div>{S.FX}</body></html>'

if __name__ == "__main__":
    w = int(sys.argv[1]) if len(sys.argv) > 1 else 1440
    gen.render_html(home(), os.path.join(O, f"mock-home-{w}.png"), w, int(sys.argv[2]) if len(sys.argv) > 2 else 3900)
    gen.render_html(pdp(0), os.path.join(O, f"mock-pdp-{w}.png"), w, int(sys.argv[3]) if len(sys.argv) > 3 else 2300)
    # half-scale previews
    for n, hh in (("home", 3900), ("pdp", 2300)):
        gen.render_html(f'<!doctype html><html><body style="margin:0"><img src="file://{O}/mock-{n}-{w}.png" style="width:{w//2}px;display:block"></body></html>',
                        os.path.join(O, f"mockprev-{n}.png"), w // 2, hh // 2)
