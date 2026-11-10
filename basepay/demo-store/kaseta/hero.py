#!/usr/bin/env python3
"""Hero banner and section art for the KASETA 'Strana B' drop."""
import math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gen
from gen import PINK, BLUE, YEL, GREEN, ORANGE, PURPLE, CYAN, CREAM, INK, OUT, wavy_ring, star


def rings(cx, cy, r_max, step, lobes=9, amp=0.035):
    out = []
    cols = [PURPLE, BLUE, CYAN, GREEN, YEL, ORANGE, PINK]
    n = int(r_max / step)
    for i in range(n):
        r = r_max - i * step
        out.append(f'<path d="{wavy_ring(r, amp, lobes, i * 0.7, steps=220)}" fill="{cols[i % 7]}" stroke="{INK}" stroke-width="3"/>')
    return f'<g transform="translate({cx},{cy})">{"".join(out)}</g>'


def tee(name, x, y, w, rot):
    return (f'<img src="file://{OUT}/cut-{name}.png" style="position:absolute;left:{x}px;top:{y}px;width:{w}px;'
            f'transform:rotate({rot}deg);filter:drop-shadow(18px 22px 0 rgba(20,20,20,.55))">')


def hero():
    W, H = 1920, 900
    sparkles = "".join(star(x, y, r, c) for x, y, r, c in [
        (110, 110, 26, YEL), (760, 90, 18, CREAM), (900, 300, 14, CYAN), (240, 760, 18, PINK), (1840, 120, 22, CREAM),
        (1000, 70, 12, YEL), (1030, 700, 20, YEL), (700, 800, 12, CREAM), (1700, 800, 16, CREAM)])
    html = f'''<!doctype html><html><head><meta charset="utf-8"><style>{gen.font_css()}
    html,body{{margin:0}} .wrap{{position:relative;width:{W}px;height:{H}px;overflow:hidden;background:#1a0b3b}}
    .floor{{position:absolute;left:-40%;right:-40%;bottom:-420px;height:900px;transform:perspective(520px) rotateX(64deg);
      background:repeating-conic-gradient({PINK} 0 25%, {INK} 0 50%) 0 0/150px 150px;transform-origin:50% 100%}}
    .fade{{position:absolute;inset:0;background:linear-gradient(90deg,rgba(26,11,59,.97) 0,rgba(26,11,59,.9) 30%,rgba(26,11,59,0) 62%)}}
    .horizon{{position:absolute;left:0;right:0;top:776px;height:6px;background:{YEL};box-shadow:0 0 0 4px {INK}}}
    .t1{{position:absolute;left:92px;top:120px;font-family:'Shrikhand';font-size:240px;line-height:1;color:{YEL};white-space:nowrap;
      -webkit-text-stroke:5px {INK};paint-order:stroke fill;text-shadow:9px 9px 0 {PINK},10px 10px 0 {INK},19px 19px 0 {BLUE},20px 20px 0 {INK}}}
    .t2{{position:absolute;left:100px;top:424px;font-family:'Monoton';font-size:118px;line-height:1;color:{CREAM};letter-spacing:4px;white-space:nowrap;text-shadow:5px 5px 0 {PINK}}}
    .t3{{position:absolute;left:100px;top:596px;font-family:'Anton';font-size:34px;letter-spacing:9px;color:{INK};background:{YEL};padding:12px 22px;border:4px solid {INK};box-shadow:8px 8px 0 {INK};white-space:nowrap}}
    </style></head><body><div class="wrap">
      <svg width="{W}" height="{H}" style="position:absolute;left:0;top:0">{rings(1420, 430, 1500, 62)}</svg>
      <div class="fade"></div>
      <svg width="{W}" height="{H}" style="position:absolute;left:0;top:0">{sparkles}</svg>
      {tee("sumski-trip", 1040, 170, 520, -13)}
      {tee("leto-ljubavi", 1420, 200, 500, 11)}
      {tee("trece-oko", 1200, 50, 600, -2)}
      <div class="t1">Strana B</div>
      <div class="t2">PSIHODELIJA</div>
      <div class="t3">NOVA KOLEKCIJA · 10 MAJICA · ŠTAMPANO U BEOGRADU</div>
    </div></body></html>'''
    gen.render_html(html, os.path.join(OUT, "hero-strana-b.png"), W, H)


def banner_b():
    """Wide strip used as the Strana B section header image on the shop page."""
    W, H = 1920, 560
    tees = "".join(tee(n, 1010 + i * 170, 30 + (i % 2) * 40, 330, (-9, 6, -4, 8, -6)[i]) for i, n in enumerate(
        ["hipnoza", "kaleidoskop", "lava", "kosmicka-kaseta", "tunel"]))
    html = f'''<!doctype html><html><head><meta charset="utf-8"><style>{gen.font_css()}
    html,body{{margin:0}} .wrap{{position:relative;width:{W}px;height:{H}px;overflow:hidden;background:{INK}}}
    .fade{{position:absolute;inset:0;background:linear-gradient(90deg,rgba(20,20,20,.96) 0,rgba(20,20,20,.86) 34%,rgba(20,20,20,0) 60%)}}
    .t1{{position:absolute;left:80px;top:96px;font-family:'Shrikhand';font-size:170px;line-height:1;color:{PINK};white-space:nowrap;
      -webkit-text-stroke:4px {INK};paint-order:stroke fill;text-shadow:7px 7px 0 {YEL},8px 8px 0 {INK},15px 15px 0 {CYAN}}}
    .t3{{position:absolute;left:86px;top:336px;font-family:'Anton';font-size:30px;letter-spacing:9px;color:{CREAM};white-space:nowrap}}
    </style></head><body><div class="wrap">
      <svg width="{W}" height="{H}" style="position:absolute;left:0;top:0">{rings(1420, 280, 1300, 54, lobes=7, amp=0.05)}</svg>
      <div class="fade"></div>
      {tees}
      <div class="t1">Strana B</div>
      <div class="t3">PSIHODELIJA · OKRENI KASETU</div>
    </div></body></html>'''
    gen.render_html(html, os.path.join(OUT, "banner-strana-b.png"), W, H)


if __name__ == "__main__":
    hero(); banner_b()
    prev = f'<!doctype html><html><body style="margin:0;background:#fff"><img src="file://{OUT}/hero-strana-b.png" style="width:1200px;display:block"><img src="file://{OUT}/banner-strana-b.png" style="width:1200px;display:block"></body></html>'
    gen.render_html(prev, os.path.join(OUT, "hero-prev.png"), 1200, 913)
