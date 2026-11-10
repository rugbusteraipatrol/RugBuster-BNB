#!/usr/bin/env python3
"""Renders the KASETA 'Strana B' psychedelic tees: SVG mockup -> PNG via headless Chrome."""
import math, os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
CHROME = "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell"

PINK, BLUE, YEL = "#ff2e88", "#2b59ff", "#ffd23f"
GREEN, ORANGE, PURPLE, CYAN = "#00d68f", "#ff7a1a", "#9b3dff", "#19d3ff"
CREAM, INK, WHITE = "#fff6dc", "#141414", "#ffffff"
RAINBOW = [PINK, ORANGE, YEL, GREEN, CYAN, BLUE, PURPLE]

FONTS = {
    "Anton": "anton", "Shrikhand": "shrikhand", "Monoton": "monoton", "Bungee Shade": "bungee-shade",
    "Bungee": "bungee", "Righteous": "righteous", "Rubik Wet Paint": "rubik-wet-paint", "Modak": "modak",
    "Fascinate Inline": "fascinate-inline", "Bowlby One": "bowlby-one", "Rubik Mono One": "rubik-mono-one",
}


def font_css():
    css = []
    for fam, slug in FONTS.items():
        for sub, rng in (("latin-ext", "U+0100-02AF,U+1E00-1EFF,U+2020,U+20A0-20AB"), ("latin", "U+0000-00FF,U+2000-206F,U+20AC,U+2122")):
            p = os.path.join(HERE, "fonts", f"{slug}-{sub}.woff2")
            if os.path.exists(p):
                css.append(f"@font-face{{font-family:'{fam}';src:url('file://{p}') format('woff2');unicode-range:{rng};}}")
    return "\n".join(css)


def pol(r, a):
    return (r * math.cos(a), r * math.sin(a))


def f(x):
    return f"{x:.1f}"


def wavy_ring(r, amp, lobes, phase=0.0, steps=180):
    pts = []
    for i in range(steps):
        a = 2 * math.pi * i / steps
        rr = r * (1 + amp * math.sin(lobes * a + phase))
        x, y = pol(rr, a)
        pts.append(f"{f(x)},{f(y)}")
    return "M" + " L".join(pts) + "Z"


def star(cx, cy, r, fill, pts=4, inner=0.38, rot=0):
    p = []
    for i in range(pts * 2):
        rr = r if i % 2 == 0 else r * inner
        x, y = pol(rr, rot + math.pi * i / pts - math.pi / 2)
        p.append(f"{f(cx + x)},{f(cy + y)}")
    return f'<polygon points="{" ".join(p)}" fill="{fill}"/>'


# ---------------------------------------------------------------- designs
# Each returns (defs, body) drawn in a box about x -210..210, y -270..270.

def d_trece_oko():
    rings = []
    n = 11
    for i in range(n):
        r = 205 - i * 13
        rings.append(f'<path d="{wavy_ring(r, 0.045, 10, i * 0.9)}" fill="{RAINBOW[i % 7]}" stroke="{INK}" stroke-width="2.5"/>')
    rays = []
    for i in range(16):
        a = 2 * math.pi * i / 16
        x1, y1 = pol(214, a - 0.06); x2, y2 = pol(214, a + 0.06); x3, y3 = pol(252, a)
        rays.append(f'<polygon points="{f(x1)},{f(y1)} {f(x2)},{f(y2)} {f(x3)},{f(y3)}" fill="{YEL if i % 2 else PINK}"/>')
    iris = []
    for i, c in enumerate([BLUE, CYAN, GREEN, YEL, ORANGE, PINK]):
        iris.append(f'<circle r="{50 - i * 6.5}" fill="{c}"/>')
    lashes = []
    for i in range(9):
        t = -1 + 2 * i / 8
        x = t * 96
        ytop = -52 * (1 - t * t) - 6
        lashes.append(f'<line x1="{f(x)}" y1="{f(ytop)}" x2="{f(x * 1.18)}" y2="{f(ytop - 22)}" stroke="{INK}" stroke-width="5" stroke-linecap="round"/>')
    body = f'''
    <g transform="translate(0,-50)">
      {''.join(rays)}{''.join(rings)}
      <circle r="74" fill="#1d1a6b" stroke="{INK}" stroke-width="2.5"/>
      <g transform="scale(0.9)">
      {''.join(lashes)}
      <path d="M-112,0 Q0,-98 112,0 Q0,98 -112,0Z" fill="{CREAM}" stroke="{INK}" stroke-width="7" stroke-linejoin="round"/>
      <clipPath id="eyeclip"><path d="M-112,0 Q0,-98 112,0 Q0,98 -112,0Z"/></clipPath>
      <g clip-path="url(#eyeclip)">{''.join(iris)}<circle r="17" fill="{INK}"/><circle cx="-7" cy="-8" r="6" fill="#fff"/></g>
      <path d="M-112,0 Q0,-98 112,0 Q0,98 -112,0Z" fill="none" stroke="{INK}" stroke-width="7" stroke-linejoin="round"/>
      </g>
    </g>
    <text y="226" text-anchor="middle" font-family="Shrikhand" font-size="62" fill="{PINK}" transform="translate(4,4)">TREĆE OKO</text>
    <text y="226" text-anchor="middle" font-family="Shrikhand" font-size="62" fill="{YEL}">TREĆE OKO</text>
    <text y="262" text-anchor="middle" font-family="Anton" font-size="17" letter-spacing="7" fill="{CYAN}">VIDI ŠTA DRUGI NE VIDE</text>'''
    return "", body


def d_tecno_sunce():
    drips = []
    spec = [(-118, 40, 26), (-78, 118, 30), (-36, 62, 24), (4, 150, 34), (48, 84, 26), (88, 132, 30), (124, 50, 22)]
    for x, ln, w in spec:
        drips.append(f'<rect x="{x - w / 2}" y="60" width="{w}" height="{ln}" rx="{w / 2}" fill="url(#sung)"/>')
        drips.append(f'<circle cx="{x}" cy="{60 + ln + 4}" r="{w * 0.62}" fill="url(#sung)"/>')
    drops = f'<ellipse cx="4" cy="236" rx="10" ry="14" fill="{PINK}"/><ellipse cx="-78" cy="206" rx="7" ry="10" fill="#ff5c5c"/><ellipse cx="88" cy="218" rx="7" ry="10" fill="{PINK}"/>'
    gaps = "".join(f'<rect x="-170" y="{y}" width="340" height="{h}" fill="#fff"/>' for y, h in [(-22, 7), (6, 10), (36, 13), (68, 16)])
    defs = f'''<linearGradient id="sung" gradientUnits="userSpaceOnUse" x1="0" y1="-230" x2="0" y2="260">
        <stop offset="0" stop-color="#ffe14a"/><stop offset="0.35" stop-color="{ORANGE}"/><stop offset="0.62" stop-color="{PINK}"/><stop offset="1" stop-color="{PURPLE}"/></linearGradient>
      <filter id="melt" x="-20%" y="-20%" width="140%" height="150%"><feTurbulence type="fractalNoise" baseFrequency="0.012 0.02" numOctaves="2" seed="7" result="n"/>
        <feDisplacementMap in="SourceGraphic" in2="n" scale="26" xChannelSelector="R" yChannelSelector="G"/></filter>
      <clipPath id="sunclip"><circle cy="-70" r="150"/></clipPath>'''
    body = f'''
    <g transform="translate(0,-62)">
      <g filter="url(#melt)">
        <g clip-path="url(#sunclip)"><rect x="-170" y="-230" width="340" height="330" fill="url(#sung)"/>{gaps}</g>
        {''.join(drips)}
      </g>
      {drops}
    </g>
    <text y="-262" text-anchor="middle" font-family="Anton" font-size="20" letter-spacing="9" fill="{PINK}">BEOGRAD · 41°C</text>
    <g transform="translate(0,6)"><text y="258" text-anchor="middle" font-family="Rubik Wet Paint" font-size="66" fill="#1d1a6b">TEČNO SUNCE</text></g>'''
    return defs, body


def mushroom(x, y, s, cap, dots=WHITE, stem=CREAM):
    return f'''<g transform="translate({x},{y}) scale({s})">
      <path d="M-22,0 C-30,60 -34,96 -26,120 Q0,134 26,120 C34,96 30,60 22,0Z" fill="{stem}" stroke="{INK}" stroke-width="6" stroke-linejoin="round"/>
      <path d="M-20,34 Q0,46 20,34" fill="none" stroke="{INK}" stroke-width="4" stroke-linecap="round"/>
      <path d="M-104,6 C-104,-84 -52,-118 0,-118 C52,-118 104,-84 104,6 Q52,26 0,22 Q-52,26 -104,6Z" fill="{cap}" stroke="{INK}" stroke-width="6" stroke-linejoin="round"/>
      <ellipse cx="-48" cy="-52" rx="19" ry="15" fill="{dots}" stroke="{INK}" stroke-width="4"/>
      <ellipse cx="14" cy="-80" rx="23" ry="17" fill="{dots}" stroke="{INK}" stroke-width="4"/>
      <ellipse cx="58" cy="-36" rx="16" ry="13" fill="{dots}" stroke="{INK}" stroke-width="4"/>
      <ellipse cx="-8" cy="-24" rx="13" ry="10" fill="{dots}" stroke="{INK}" stroke-width="4"/>
    </g>'''


def d_sumski_trip():
    rings = []
    cols = [PURPLE, PINK, ORANGE, YEL, GREEN, CYAN, BLUE]
    for i in range(12):
        r = 200 - i * 16
        rings.append(f'<path d="{wavy_ring(r, 0.07, 6, i * 0.55)}" fill="{cols[i % 7]}"/>')
    defs = '<clipPath id="skyclip"><circle r="196"/></clipPath>'
    stars = star(-150, -150, 18, WHITE) + star(150, -120, 13, WHITE) + star(120, -176, 9, YEL) + star(-96, -186, 10, YEL)
    body = f'''
    <g transform="translate(0,-48)">
      <circle r="204" fill="{INK}"/>
      <g clip-path="url(#skyclip)">{''.join(rings)}
        <path d="M-220,130 Q-110,84 0,118 Q110,150 220,104 L220,230 L-220,230Z" fill="{GREEN}" stroke="{INK}" stroke-width="6"/>
        <path d="M-220,168 Q-80,128 30,160 Q130,186 220,150 L220,230 L-220,230Z" fill="#00a86f" stroke="{INK}" stroke-width="5"/>
      </g>
      <circle r="198" fill="none" stroke="{INK}" stroke-width="8"/>
      {stars}
      {mushroom(-98, 56, 0.62, ORANGE)}
      {mushroom(104, 70, 0.52, PURPLE, YEL)}
      {mushroom(4, 6, 1.0, PINK)}
    </g>
    <text y="232" text-anchor="middle" font-family="Shrikhand" font-size="64" fill="{INK}" transform="translate(4,4)">ŠUMSKI TRIP</text>
    <text y="232" text-anchor="middle" font-family="Shrikhand" font-size="64" fill="{PINK}">ŠUMSKI TRIP</text>
    <text y="266" text-anchor="middle" font-family="Anton" font-size="17" letter-spacing="7" fill="{INK}">FRUŠKA GORA · POSLE KIŠE</text>'''
    return defs, body


def d_hipnoza():
    arms = []
    n = 14
    R = 196
    for i in range(n):
        a0 = 2 * math.pi * i / n
        da = 2 * math.pi / n
        pts1, pts2 = [], []
        for k in range(0, 41):
            r = R * k / 40
            tw = 2.6 * (r / R) ** 0.85
            x, y = pol(r, a0 + tw); pts1.append(f"{f(x)},{f(y)}")
            x, y = pol(r, a0 + da + tw); pts2.append(f"{f(x)},{f(y)}")
        arms.append(f'<polygon points="{" ".join(pts1 + pts2[::-1])}" fill="{RAINBOW[i % 7]}"/>')
    defs = f'''<clipPath id="hc"><circle r="{R}"/></clipPath>
      <path id="hring" d="M0,-222 A222,222 0 1 1 -0.1,-222"/>
      <radialGradient id="hvig"><stop offset="0.55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.45"/></radialGradient>'''
    body = f'''
    <g transform="translate(0,-18)">
      <circle r="{R + 8}" fill="{CREAM}"/>
      <g clip-path="url(#hc)">{''.join(arms)}<circle r="{R}" fill="url(#hvig)"/></g>
      <circle r="34" fill="{INK}"/><circle r="22" fill="{YEL}"/><circle r="9" fill="{INK}"/>
      <text font-family="Monoton" font-size="34" fill="{CREAM}" letter-spacing="6"><textPath href="#hring" startOffset="0">HIPNOZA ✦ GLEDAJ U CENTAR ✦ HIPNOZA ✦ NE TREPĆI ✦</textPath></text>
    </g>'''
    return defs, body


def d_tunel():
    cells = []
    rings = 13
    sectors = 20
    r_out = 205
    k = 0.80
    for i in range(rings):
        r1 = r_out * (k ** i)
        r2 = r_out * (k ** (i + 1))
        tw = i * 0.16
        for j in range(sectors):
            if (i + j) % 2:
                continue
            a1 = 2 * math.pi * j / sectors + tw
            a2 = 2 * math.pi * (j + 1) / sectors + tw
            a1b = a1 + 0.16
            a2b = a2 + 0.16
            x1, y1 = pol(r1, a1); x2, y2 = pol(r1, a2); x3, y3 = pol(r2, a2b); x4, y4 = pol(r2, a1b)
            cells.append(f'M{f(x1)},{f(y1)} A{f(r1)},{f(r1)} 0 0 1 {f(x2)},{f(y2)} L{f(x3)},{f(y3)} A{f(r2)},{f(r2)} 0 0 0 {f(x4)},{f(y4)}Z')
    d = "".join(cells)
    defs = '<clipPath id="tc"><rect x="-200" y="-200" width="400" height="400" rx="28"/></clipPath>'
    body = f'''
    <g transform="translate(0,-40)">
      <rect x="-206" y="-206" width="412" height="412" rx="32" fill="{INK}"/>
      <g clip-path="url(#tc)">
        <rect x="-200" y="-200" width="400" height="400" fill="#fff"/>
        <path d="{d}" fill="{CYAN}" transform="translate(-7,0)" style="mix-blend-mode:multiply"/>
        <path d="{d}" fill="{PINK}" transform="translate(7,0)" style="mix-blend-mode:multiply"/>
        <path d="{d}" fill="{INK}"/>
        <circle r="13" fill="{PINK}"/>
      </g>
    </g>
    <text y="232" text-anchor="middle" font-family="Bungee Shade" font-size="66" fill="{INK}">TUNEL</text>
    <text y="264" text-anchor="middle" font-family="Anton" font-size="17" letter-spacing="8" fill="{PINK}">OP-ART · NEMA IZLAZA</text>'''
    return defs, body


def d_lava():
    defs = f'''<linearGradient id="lg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{PURPLE}"/><stop offset="0.55" stop-color="{PINK}"/><stop offset="1" stop-color="{ORANGE}"/></linearGradient>
      <linearGradient id="lb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff27a"/><stop offset="1" stop-color="{YEL}"/></linearGradient>
      <linearGradient id="lm" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8d8d99"/><stop offset="0.35" stop-color="#f1f1f6"/><stop offset="1" stop-color="#6a6a76"/></linearGradient>
      <filter id="goo" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur in="SourceGraphic" stdDeviation="9" result="b"/>
        <feColorMatrix in="b" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -9"/></filter>
      <filter id="glow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="26"/></filter>
      <clipPath id="glass"><path d="M-44,-170 L44,-170 L92,120 L-92,120Z"/></clipPath>'''
    blobs = [(0, 92, 54), (-34, 64, 30), (30, 44, 26), (8, -6, 34), (-18, -52, 22), (14, -92, 27), (-6, -134, 17), (40, 100, 30), (-52, 104, 26)]
    bl = "".join(f'<circle cx="{x}" cy="{y}" r="{r}" fill="url(#lb)"/>' for x, y, r in blobs)
    body = f'''
    <g transform="translate(0,-60) scale(1.04)">
      <ellipse cy="-20" rx="150" ry="190" fill="{PINK}" opacity="0.55" filter="url(#glow)"/>
      {star(-150, -150, 16, YEL)}{star(150, -90, 12, CYAN)}{star(-140, 40, 10, CYAN)}{star(136, 96, 15, YEL)}{star(-96, -214, 8, WHITE)}
      <path d="M-30,-222 L30,-222 L44,-170 L-44,-170Z" fill="url(#lm)" stroke="{CREAM}" stroke-width="4" stroke-linejoin="round"/>
      <path d="M-44,-170 L44,-170 L92,120 L-92,120Z" fill="url(#lg)"/>
      <g clip-path="url(#glass)"><g filter="url(#goo)">{bl}</g>
        <path d="M-30,-160 L-14,-160 L-48,104 L-74,104Z" fill="#fff" opacity="0.2"/></g>
      <path d="M-44,-170 L44,-170 L92,120 L-92,120Z" fill="none" stroke="{CREAM}" stroke-width="5" stroke-linejoin="round"/>
      <path d="M-92,120 L92,120 L64,176 L104,236 L-104,236 L-64,176Z" fill="url(#lm)" stroke="{CREAM}" stroke-width="4" stroke-linejoin="round"/>
    </g>
    <text y="268" text-anchor="middle" font-family="Modak" font-size="84" fill="{PINK}" transform="translate(5,5)">LAVA</text>
    <text y="268" text-anchor="middle" font-family="Modak" font-size="84" fill="{YEL}">LAVA</text>'''
    return defs, body


def petal(r_in, r_out, w):
    return f"M0,{-r_in} C{w},{-(r_in + (r_out - r_in) * 0.35)} {w * 0.9},{-(r_in + (r_out - r_in) * 0.8)} 0,{-r_out} C{-w * 0.9},{-(r_in + (r_out - r_in) * 0.8)} {-w},{-(r_in + (r_out - r_in) * 0.35)} 0,{-r_in}Z"


def d_kaleidoskop():
    layers = [(120, 206, 30, 16, [BLUE, PURPLE]), (84, 168, 30, 16, [PINK, ORANGE]), (52, 128, 26, 12, [YEL, GREEN]), (22, 86, 22, 8, [CYAN, PINK])]
    g = []
    for li, (ri, ro, w, n, cols) in enumerate(layers):
        off = 180 / n if li % 2 else 0
        for i in range(n):
            g.append(f'<path d="{petal(ri, ro, w)}" transform="rotate({360 * i / n + off})" fill="{cols[i % 2]}" stroke="{INK}" stroke-width="3.5" stroke-linejoin="round"/>')
    dots = "".join(f'<circle cx="{f(pol(214, 2 * math.pi * i / 32)[0])}" cy="{f(pol(214, 2 * math.pi * i / 32)[1])}" r="{5 if i % 2 else 8}" fill="{PINK if i % 2 else INK}"/>' for i in range(32))
    body = f'''
    <g transform="translate(0,-40)">
      {dots}{''.join(g)}
      <circle r="26" fill="{YEL}" stroke="{INK}" stroke-width="4"/><circle r="12" fill="{PINK}" stroke="{INK}" stroke-width="3.5"/>
    </g>
    <text y="240" text-anchor="middle" font-family="Righteous" font-size="46" letter-spacing="5" fill="{INK}">KALEIDOSKOP</text>
    <text y="268" text-anchor="middle" font-family="Anton" font-size="17" letter-spacing="8" fill="{BLUE}">OKRENI · PA OPET OKRENI</text>'''
    return "", body


def d_leto_ljubavi():
    arcs = []
    for i, c in enumerate(RAINBOW):
        r = 214 - i * 15
        arcs.append(f'<circle r="{r}" fill="none" stroke="{c}" stroke-width="15"/>')
    drips = "".join(
        f'<rect x="{x - w / 2}" y="60" width="{w}" height="{ln}" rx="{w / 2}" fill="{YEL}" stroke="{INK}" stroke-width="6"/>'
        for x, ln, w in [(-92, 96, 34), (-36, 150, 40), (34, 108, 34), (92, 70, 30)])
    cover = "".join(f'<rect x="{x - w / 2 + 3}" y="40" width="{w - 6}" height="{40}" fill="{YEL}"/>' for x, w in [(-92, 34), (-36, 40), (34, 34), (92, 30)])
    defs = '<clipPath id="arcclip"><rect x="-240" y="-240" width="480" height="232"/></clipPath>'
    body = f'''
    <g transform="translate(0,-28)">
      <g clip-path="url(#arcclip)" transform="translate(0,10)">{''.join(arcs)}</g>
      {drips}
      <circle r="124" cy="0" fill="{YEL}" stroke="{INK}" stroke-width="7"/>
      {cover}
      <ellipse cx="-42" cy="-34" rx="15" ry="26" fill="{INK}"/><ellipse cx="42" cy="-34" rx="15" ry="26" fill="{INK}"/>
      <rect x="-50" y="-34" width="16" height="64" rx="8" fill="{INK}"/><circle cx="-42" cy="36" r="11" fill="{INK}"/>
      <path d="M-70,22 Q0,96 70,22" fill="none" stroke="{INK}" stroke-width="10" stroke-linecap="round"/>
      <path d="M-78,14 L-62,26 M78,14 L62,26" stroke="{INK}" stroke-width="8" stroke-linecap="round"/>
      <ellipse cx="-36" cy="238" rx="12" ry="16" fill="{YEL}" stroke="{INK}" stroke-width="5"/>
    </g>
    <text y="-232" text-anchor="middle" font-family="Anton" font-size="20" letter-spacing="9" fill="{CYAN}">DRUGO LETO · 1989</text>
    <text y="262" text-anchor="middle" font-family="Shrikhand" font-size="48" fill="{PINK}" transform="translate(74,3)">LJUBAVI</text>
    <text y="262" text-anchor="middle" font-family="Shrikhand" font-size="48" fill="{CREAM}" transform="translate(-112,0)">LETO</text>
    <text y="262" text-anchor="middle" font-family="Shrikhand" font-size="48" fill="{YEL}" transform="translate(71,0)">LJUBAVI</text>'''
    return defs, body


def d_kosmicka_kaseta():
    # rainbow tape ribbon flowing out of the cassette
    path = "M-60,-40 C-260,-80 -230,-250 -40,-214 C150,-178 240,-250 190,-110 C150,0 240,40 200,130 C160,220 -40,150 -150,214"
    ribbons = []
    cols = [PINK, ORANGE, YEL, GREEN, BLUE]
    for i, c in enumerate(cols):
        w = 62 - i * 12
        ribbons.append(f'<path d="{path}" fill="none" stroke="{c}" stroke-width="{w}" stroke-linecap="round" stroke-linejoin="round"/>')
    stars = star(-170, 60, 15, INK) + star(160, -210, 12, PINK) + star(-190, -120, 9, BLUE) + star(110, 230, 11, PINK) + star(-40, 120, 8, BLUE)
    body = f'''
    <g transform="translate(0,-30)">
      <path d="{path}" fill="none" stroke="{INK}" stroke-width="74" stroke-linecap="round" stroke-linejoin="round"/>
      {''.join(ribbons)}
      {stars}
      <g transform="translate(0,6) rotate(-8)">
        <rect x="-150" y="-92" width="300" height="184" rx="16" fill="{INK}" transform="translate(8,8)"/>
        <rect x="-150" y="-92" width="300" height="184" rx="16" fill="{BLUE}" stroke="{INK}" stroke-width="7"/>
        <rect x="-126" y="-72" width="252" height="100" rx="8" fill="{CREAM}" stroke="{INK}" stroke-width="5"/>
        <rect x="-126" y="-72" width="252" height="24" fill="{PINK}" stroke="{INK}" stroke-width="5"/>
        <text x="-114" y="-54" font-family="Anton" font-size="16" letter-spacing="3" fill="#fff">STRANA B · PSIHODELIJA</text>
        <rect x="-78" y="-34" width="156" height="50" rx="25" fill="{INK}"/>
        <circle cx="-46" cy="-9" r="18" fill="{CREAM}"/><circle cx="46" cy="-9" r="18" fill="{CREAM}"/>
        <path d="M-46,-27 v36 M-64,-9 h36" stroke="{INK}" stroke-width="4"/><path d="M46,-27 v36 M28,-9 h36" stroke="{INK}" stroke-width="4"/>
        <circle cx="-46" cy="-9" r="6" fill="{INK}"/><circle cx="46" cy="-9" r="6" fill="{INK}"/>
        <path d="M-96,92 L-76,46 L76,46 L96,92Z" fill="{YEL}" stroke="{INK}" stroke-width="5" stroke-linejoin="round"/>
        <circle cx="-50" cy="70" r="7" fill="{INK}"/><circle cx="50" cy="70" r="7" fill="{INK}"/><circle cx="0" cy="72" r="5" fill="{INK}"/>
        <circle cx="-132" cy="74" r="6" fill="{INK}"/><circle cx="132" cy="74" r="6" fill="{INK}"/>
      </g>
    </g>
    <text y="268" text-anchor="middle" font-family="Bungee" font-size="36" fill="{INK}">KOSMIČKA KASETA</text>'''
    return "", body


def d_dobre_vibracije():
    cols = [PURPLE, BLUE, CYAN, GREEN, YEL, ORANGE, PINK]
    bands = []
    for i, c in enumerate(cols):
        y = -208 + i * 22
        pts = []
        for k in range(0, 61):
            x = -214 + k * (428 / 60)
            yy = y + 34 * math.sin(k / 60 * 2 * math.pi * 1.5 + 0.4) + i * 2.0 * math.sin(k / 9)
            pts.append(f"{f(x)},{f(yy)}")
        bands.append(f'<polyline points="{" ".join(pts)}" fill="none" stroke="{c}" stroke-width="23" stroke-linecap="round" stroke-linejoin="round"/>')
    bands2 = []
    for i, c in enumerate(cols[::-1]):
        y = 150 + i * 16
        pts = []
        for k in range(0, 61):
            x = -214 + k * (428 / 60)
            yy = y + 20 * math.sin(k / 60 * 2 * math.pi * 2 + 2.2)
            pts.append(f"{f(x)},{f(yy)}")
        bands2.append(f'<polyline points="{" ".join(pts)}" fill="none" stroke="{c}" stroke-width="17" stroke-linecap="round" stroke-linejoin="round"/>')
    defs = f'''<filter id="wob" x="-10%" y="-20%" width="120%" height="140%"><feTurbulence type="fractalNoise" baseFrequency="0.011" numOctaves="1" seed="3" result="n"/>
        <feDisplacementMap in="SourceGraphic" in2="n" scale="20" xChannelSelector="R" yChannelSelector="G"/></filter>'''
    body = f'''
    {''.join(bands)}
    <g filter="url(#wob)">
      <text y="34" text-anchor="middle" font-family="Shrikhand" font-size="104" fill="{INK}" transform="translate(6,6)">DOBRE</text>
      <text y="34" text-anchor="middle" font-family="Shrikhand" font-size="104" fill="{PINK}">DOBRE</text>
      <text y="124" text-anchor="middle" font-family="Shrikhand" font-size="67" fill="{INK}" transform="translate(5,5)">VIBRACIJE</text>
      <text y="124" text-anchor="middle" font-family="Shrikhand" font-size="67" fill="{BLUE}">VIBRACIJE</text>
    </g>
    {''.join(bands2)}
    {star(-176, -36, 13, YEL)}{star(182, 60, 11, PINK)}{star(170, -66, 8, BLUE)}'''
    return defs, body


DESIGNS = {
    "trece-oko": (d_trece_oko, "black"),
    "tecno-sunce": (d_tecno_sunce, "white"),
    "sumski-trip": (d_sumski_trip, "white"),
    "hipnoza": (d_hipnoza, "black"),
    "tunel": (d_tunel, "white"),
    "lava": (d_lava, "black"),
    "kaleidoskop": (d_kaleidoskop, "white"),
    "leto-ljubavi": (d_leto_ljubavi, "black"),
    "kosmicka-kaseta": (d_kosmicka_kaseta, "white"),
    "dobre-vibracije": (d_dobre_vibracije, "white"),
}

TEE = "M398,222 C352,236 298,248 258,262 C196,300 142,372 104,440 L186,540 C216,506 244,470 272,438 C270,600 268,760 268,900 C420,918 580,918 732,900 C732,760 730,600 728,438 C756,470 784,506 814,540 L896,440 C858,372 804,300 742,262 C702,248 648,236 602,222 C560,282 440,282 398,222Z"


# The mockup tee is a size M: body 456 units wide for a 52 cm chest, 660 units long for about 75 cm.
MM_PER_TEE_UNIT = 520 / 456
PRINT_TOP = 335  # top edge of the print, about 8 cm below the collar


def placement(name):
    """Transform that shows the print at its real A3 size (print/report.json) on the mockup."""
    import json
    r = json.load(open(os.path.join(HERE, "print", "report.json")))[name]
    x0, y0, w, h = r["box"]
    s = r["mmPerUnit"] / MM_PER_TEE_UNIT
    return f"translate({500 - (x0 + w / 2) * s:.2f},{PRINT_TOP - y0 * s:.2f}) scale({s:.4f})"


def tee_svg(defs, body, colour, scale=0.82, bg=True, place=None):
    if colour == "black":
        base, hi, lo, rib, seam, bgshadow = "#1b1b1f", "#34343b", "#0b0b0d", "#232328", "#000", 0.42
        fold_op, tex_op = 0.5, 0.10
    else:
        base, hi, lo, rib, seam, bgshadow = "#ffffff", "#ffffff", "#dcd9d2", "#f1efea", "#b9b5ac", 0.20
        fold_op, tex_op = 0.16, 0.05
    return f'''<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1000" height="1250" viewBox="0 0 1000 1250">
  <defs>
    <linearGradient id="teeg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="{lo}"/><stop offset="0.16" stop-color="{base}"/><stop offset="0.5" stop-color="{hi}"/><stop offset="0.84" stop-color="{base}"/><stop offset="1" stop-color="{lo}"/></linearGradient>
    <linearGradient id="teev" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="0.8" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.10"/></linearGradient>
    <filter id="soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="16"/></filter>
    <filter id="soft2" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="7"/></filter>
    <filter id="tex" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="11"/><feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.9 -0.25"/></filter>
    <clipPath id="teeclip"><path d="{TEE}"/></clipPath>
    {defs}
  </defs>
  {'<rect width="1000" height="1250" fill="#f3f1ec"/>' if bg else ''}
  <g transform="translate(500,632) scale(1.16) translate(-500,-572)">
  <ellipse cx="500" cy="936" rx="280" ry="26" fill="#000" opacity="{bgshadow if bg else 0}" filter="url(#soft)"/>
  <path d="{TEE}" fill="#000" opacity="{bgshadow * 0.7 if bg else 0}" filter="url(#soft)" transform="translate(0,14)"/>
  <path d="{TEE}" fill="url(#teeg)"/>
  <path d="M398,222 C440,250 560,250 602,222 C560,282 440,282 398,222Z" fill="{lo}" opacity="0.9"/>
  <g clip-path="url(#teeclip)">
    <g transform="{place or f'translate(500,640) scale({scale})'}">{body}</g>
    <rect width="1000" height="1250" filter="url(#tex)" opacity="{tex_op}"/>
    <g opacity="{fold_op}" filter="url(#soft)">
      <path d="M272,438 C286,540 280,660 288,900 L250,900 L250,430Z" fill="#000"/>
      <path d="M728,438 C714,540 720,660 712,900 L750,900 L750,430Z" fill="#000"/>
      <path d="M258,262 C232,340 210,440 186,540 L138,484 C170,390 214,310 258,262Z" fill="#000" opacity="0.6"/>
      <path d="M742,262 C768,340 790,440 814,540 L862,484 C830,390 786,310 742,262Z" fill="#000" opacity="0.6"/>
    </g>
    <g opacity="{fold_op * 0.75}" filter="url(#soft2)">
      <path d="M320,846 C400,826 470,838 520,856 C470,850 400,842 320,862Z" fill="#000"/>
      <path d="M560,860 C610,844 660,844 700,856 C660,854 610,856 560,870Z" fill="#000"/>
    </g>
    <path d="{TEE}" fill="url(#teev)"/>
  </g>
  <path d="M398,222 C440,282 560,282 602,222" fill="none" stroke="{rib}" stroke-width="20" stroke-linecap="round"/>
  <path d="M398,222 C440,282 560,282 602,222" fill="none" stroke="{seam}" stroke-width="1.5" opacity="0.45" transform="translate(0,11)"/>
  <path d="M272,438 C262,400 256,330 258,262" fill="none" stroke="{seam}" stroke-width="1.5" opacity="0.35"/>
  <path d="M728,438 C738,400 744,330 742,262" fill="none" stroke="{seam}" stroke-width="1.5" opacity="0.35"/>
  <path d="M104,440 L186,540" fill="none" stroke="{seam}" stroke-width="1.5" opacity="0.3" transform="translate(13,-13)"/>
  <path d="M896,440 L814,540" fill="none" stroke="{seam}" stroke-width="1.5" opacity="0.3" transform="translate(-13,-13)"/>
  <path d="M269,880 C420,898 580,898 731,880" fill="none" stroke="{seam}" stroke-width="1.5" opacity="0.3"/>
  </g>
</svg>'''


def render_html(html, png, w, h, scale=1, transparent=False):
    path = png[:-4] + ".html"
    with open(path, "w") as fh:
        fh.write(html)
    cmd = [CHROME, "--no-sandbox", "--disable-gpu", "--hide-scrollbars", f"--force-device-scale-factor={scale}",
           f"--window-size={w},{h}", "--virtual-time-budget=4000", f"--screenshot={png}"]
    if transparent:
        cmd.append("--default-background-color=00000000")
    subprocess.run(cmd + ["file://" + path], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def page(svg, bg="#f3f1ec"):
    return f'<!doctype html><html><head><meta charset="utf-8"><style>{font_css()} html,body{{margin:0;padding:0;background:{bg}}} svg{{display:block}}</style></head><body>{svg}</body></html>'


def main():
    os.makedirs(OUT, exist_ok=True)
    names = sys.argv[1:] or list(DESIGNS)
    for n in names:
        fn, colour = DESIGNS[n]
        defs, body = fn()
        pl = placement(n)
        render_html(page(tee_svg(defs, body, colour, place=pl)), os.path.join(OUT, f"tee-{n}.png"), 1000, 1250, scale=1.2)
        render_html(page(tee_svg(defs, body, colour, bg=False, place=pl), bg="transparent"), os.path.join(OUT, f"cut-{n}.png"), 1000, 1250, transparent=True)
        print("ok", n)
    cells = "".join(f'<img src="file://{OUT}/tee-{n}.png" style="width:400px;height:500px;display:block">' for n in DESIGNS)
    sheet = f'<!doctype html><html><body style="margin:0;display:grid;grid-template-columns:repeat(5,400px);background:#fff">{cells}</body></html>'
    render_html(sheet, os.path.join(OUT, "sheet.png"), 2000, 1000)


if __name__ == "__main__":
    main()
