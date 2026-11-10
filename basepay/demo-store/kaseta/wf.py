import json,sys,os
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
import ksite as S
A=json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),"assets.json")))
CDN="https://cdn.prod.website-files.com/6aaa6b8a53b07de8aafbd777/"
def url(slug): return f"{CDN}{A['tee-'+slug+'.png']}_tee-{slug}.png"
def card(slug,name,colour,sub,_d):
    tee="crna" if colour=="CRNA" else "bela"
    return (f'<a class="k-card-b" href="/{slug}"><div class="k-card-b-media"><img class="k-card-img" src="{url(slug)}" alt="{name}, {tee} majica" loading="lazy">'
            f'<span class="k-badge-b">NOVO</span></div><div class="k-card-info"><span class="k-card-b-name">{name}</span><span class="k-card-b-price">$0.10</span></div>'
            f'<span class="k-card-b-sub">{sub}</span></a>')
def section(eyebrow,title,lead,link_text,link_href,dom_id=None):
    lead_html=f'<p class="k-b-lead">{lead}</p>' if lead else ''
    idattr=f' id="{dom_id}"' if dom_id else ''
    return (f'<section class="k-b"{idattr}><div class="k-b-head"><div><span class="k-b-eyebrow">{eyebrow}</span><h2 class="k-b-title">{title}</h2>{lead_html}</div>'
            f'<a class="k-b-link" href="{link_href}">{link_text}</a></div><div class="k-grid-5">{"".join(card(*p) for p in S.STRANA_B)}</div></section>')
if __name__=="__main__":
    what=sys.argv[1]
    if what=="home": print(section("NOVA KOLEKCIJA · 10 MAJICA","STRANA B: PSIHODELIJA","Okrenuli smo kasetu. Na drugoj strani su boje koje cure, spirale koje se vrte i jedno oko koje sve vidi.","SVIH 10 →","/shop#strana-b","strana-b"))
    if what=="shop": print(section("NOVA KOLEKCIJA · 10 MAJICA","STRANA B: PSIHODELIJA","Deset printova u sedam boja, na belim i crnim majicama od pamuka 240 g/m².","NA VRH ↑","#","strana-b"))
    if what=="pdp": print(section("CELA STRANA B","NASTAVI TRIP",None,"SVIH 16 →","/shop"))
    if what=="css": print(S.NEW_CSS.strip())
    if what=="fx": print(json.dumps(S.FX))
