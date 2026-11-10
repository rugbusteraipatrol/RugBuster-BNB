"""Single source of truth for the KASETA redesign: products, new CSS, and the per-page FX embed."""

SITE = "6aaa6b8a53b07de8aafbd777"

# slug, card name, tee colour, card tagline, product paragraph
STRANA_B = [
    ("trece-oko", "Treće Oko", "CRNA", "Vidi šta drugi ne vide.",
     "Oko usred duginog talasa koje gleda pravo u tebe. Print u sedam boja na teškoj crnoj majici, za one koji primete stvari pre ostalih."),
    ("tecno-sunce", "Tečno Sunce", "BELA", "Sunce se topi na 41°C.",
     "Ono isto sunce sa Sunset '86, samo što je ovog puta beogradski avgust pobedio. Boje cure niz majicu od žute do ljubičaste."),
    ("sumski-trip", "Šumski Trip", "BELA", "Fruška gora, posle kiše.",
     "Tri pečurke, talasasto nebo i livada koja se malo previše šareni. Uspomena na jedan izlet posle kiše."),
    ("hipnoza", "Hipnoza", "CRNA", "Gledaj u centar. Ne trepći.",
     "Spirala u sedam boja koja se vrti i kad stojiš u mestu. Upozorenje: ljudi će ti dugo gledati u grudi."),
    ("tunel", "Tunel", "BELA", "Op-art bez izlaza.",
     "Crno-bela šahovnica koja se uvija u tunel, sa ružičastom tačkom na kraju. Što duže gledaš, to se više pomera."),
    ("lava", "Lava", "CRNA", "Lampa koja nikad ne staje.",
     "Lava lampa iz dnevne sobe tvojih roditelja, uhvaćena u trenutku kad se mehur odvaja. Svetli i na crnoj majici."),
    ("kaleidoskop", "Kaleidoskop", "BELA", "Okreni, pa opet okreni.",
     "Četiri reda latica u osam boja, složenih kao slika iz dečjeg kaleidoskopa. Simetrično sa svih strana."),
    ("leto-ljubavi", "Leto Ljubavi", "CRNA", "Smeško se topi od sreće.",
     "Žuti smeško iz 1989. koji se topi pod dugom. Za sve žurke na kojima nismo bili, a pričamo kao da jesmo."),
    ("kosmicka-kaseta", "Kosmička Kaseta", "BELA", "Traka je pobegla u dugu.",
     "Naša kaseta na Strani B: traka se odmotala i pretvorila u dugu. Premotavanje olovkom ovde ne pomaže."),
    ("dobre-vibracije", "Dobre Vibracije", "BELA", "Talasi u sedam boja.",
     "Dva talasa duge i natpis koji se njiše između njih. Majica koja radi posao i kad ti nije dan."),
]

STRANA_A = [
    ("sunset-86", "Sunset '86", "Prugasto sunce, beogradsko leto."),
    ("neon-nights", "Neon Nights", "Mreža, sunce, ponoć."),
    ("kaseta-c60", "Kaseta C-60", "Strana A: mix za leto."),
    ("rewind-86", "Rewind '86", "Hi-fi stereo, premotaj."),
    ("player-2", "Player 2", "Pritisni start."),
    ("beograd-nocu", "Beograd Noću", "Grad posle ponoći."),
]

ANNOUNCE = "✦ NOVO: STRANA B · 10 PSIHODELIČNIH MAJICA ✦ PLAĆANJE U USDC ✦ BESPLATNA DOSTAVA PREKO $50 ✦ ŠTAMPANO U BEOGRADU "
TICKER = "STRANA B ✦ PSIHODELIJA ✦ 10 NOVIH MAJICA ✦ OKRENI KASETU ✦ BEOGRAD ✦ "

# New classes. Longhand only, Webflow breakpoints only, no descendant selectors: this is what the WHTML builder accepts.
NEW_CSS = """
.k-b{position:relative;padding-top:88px;padding-right:40px;padding-bottom:96px;padding-left:40px;border-bottom-style:solid;border-bottom-width:2px;border-bottom-color:#141414;background-color:#141414;color:#ffffff}
.k-rainbow{height:12px;background-image:linear-gradient(90deg,#ff2e88,#ff7a1a,#ffd23f,#00d68f,#19d3ff,#2b59ff,#9b3dff,#ff2e88);border-bottom-style:solid;border-bottom-width:2px;border-bottom-color:#141414}
.k-b-head{display:flex;margin-bottom:44px;justify-content:space-between;align-items:flex-end;column-gap:24px}
.k-b-eyebrow{display:block;margin-bottom:14px;color:#ffd23f;font-size:13px;font-weight:700;letter-spacing:0.18em}
.k-b-title{margin-top:0px;margin-right:0px;margin-bottom:0px;margin-left:0px;font-family:Impact;color:#ffffff;font-size:104px;line-height:0.95;font-style:italic;font-weight:400;letter-spacing:0.01em;text-shadow:5px 5px 0px #ff2e88, 10px 10px 0px #2b59ff}
.k-b-lead{max-width:520px;margin-top:22px;margin-right:0px;margin-bottom:0px;margin-left:0px;color:#d9d6cf;font-size:18px;line-height:1.5}
.k-b-link{padding-bottom:2px;border-bottom-style:solid;border-bottom-width:3px;border-bottom-color:#ffd23f;color:#ffffff;font-size:14px;font-weight:700;letter-spacing:0.1em;text-decoration:none;white-space:nowrap}
.k-b-link:hover{color:#ffd23f}
.k-grid-5{display:grid;grid-column-gap:22px;grid-row-gap:44px;grid-template-columns:1fr 1fr 1fr 1fr 1fr;grid-template-rows:auto}
.k-card-b{display:block;color:#ffffff;text-decoration:none}
.k-card-b-media{position:relative;border-top-style:solid;border-top-width:2px;border-top-color:#ffffff;border-right-style:solid;border-right-width:2px;border-right-color:#ffffff;border-bottom-style:solid;border-bottom-width:2px;border-bottom-color:#ffffff;border-left-style:solid;border-left-width:2px;border-left-color:#ffffff;background-color:#f3f1ec;overflow-x:hidden;overflow-y:hidden;transition:transform 200ms ease, box-shadow 200ms ease}
.k-badge-b{position:absolute;left:10px;top:10px;padding-top:5px;padding-right:9px;padding-bottom:5px;padding-left:9px;background-color:#ffd23f;color:#141414;font-size:11px;font-weight:700;letter-spacing:0.12em}
.k-card-b-name{font-family:Impact;color:#ffffff;font-size:23px;line-height:1.1;letter-spacing:0.02em}
.k-card-b-price{color:#ffd23f;font-size:16px;font-weight:700}
.k-card-b-sub{display:block;margin-top:2px;color:#bdbdbd;font-size:13px}
.k-swatch-crna{width:24px;height:24px;border-top-style:solid;border-top-width:2px;border-top-color:#141414;border-right-style:solid;border-right-width:2px;border-right-color:#141414;border-bottom-style:solid;border-bottom-width:2px;border-bottom-color:#141414;border-left-style:solid;border-left-width:2px;border-left-color:#141414;background-color:#141414}
.k-tag-b{margin-bottom:18px;padding-top:6px;padding-right:10px;padding-bottom:6px;padding-left:10px;align-self:flex-start;background-color:#141414;color:#ffd23f;font-size:12px;font-weight:700;letter-spacing:0.12em}
.k-banner-b{display:block;width:100%;height:auto;border-bottom-style:solid;border-bottom-width:2px;border-bottom-color:#141414}
@media screen and (max-width:991px){
.k-grid-5{grid-template-columns:1fr 1fr 1fr}
.k-b-title{font-size:72px}
}
@media screen and (max-width:767px){
.k-b{padding-top:56px;padding-right:20px;padding-bottom:64px;padding-left:20px}
.k-b-head{flex-direction:column;align-items:flex-start;row-gap:16px}
.k-b-title{font-size:52px;text-shadow:3px 3px 0px #ff2e88, 6px 6px 0px #2b59ff}
.k-grid-5{grid-template-columns:1fr 1fr;grid-column-gap:14px;grid-row-gap:30px}
.k-card-b-name{font-size:19px}
.k-b-lead{font-size:16px}
}
"""

# The embed that goes on every page: web font, motion, hover states. Everything here is an enhancement:
# with it removed the page still reads and works.
FX = """<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Anton&display=swap" rel="stylesheet">
<style>
.k-h1,.k-h2,.k-h3,.k-btn,.k-btn-yellow,.k-card-name,.k-card-b-name,.k-ticker-text,.k-cta-title,.k-feature-num,.k-pdp-price,.k-quote,.k-submit,.k-b-title{font-family:Anton,Impact,'Arial Narrow',sans-serif!important}
::selection{background:#ff2e88;color:#fff}
html{scroll-behavior:smooth}
@keyframes k-marq{to{transform:translateX(-12.5%)}}
@keyframes k-hue{to{filter:hue-rotate(360deg)}}
@keyframes k-wig{0%,100%{transform:rotate(-4deg)}50%{transform:rotate(4deg)}}
@keyframes k-up{from{opacity:0;transform:translateY(22px)}to{opacity:1;transform:none}}
.k-marq{display:inline-block;white-space:nowrap;will-change:transform;animation:k-marq 38s linear infinite}
.k-announce .k-marq{animation-duration:54s}
.k-ticker:hover .k-marq{animation-play-state:paused}
.k-rainbow{background-size:200% 100%;animation:k-rb 6s linear infinite}
@keyframes k-rb{to{background-position:200% 0}}
.k-card-media,.k-card-b-media{transition:transform .2s ease,box-shadow .2s ease}
.k-card:hover .k-card-media{transform:translate(-4px,-4px);box-shadow:8px 8px 0 #ff2e88}
.k-card-b:hover .k-card-b-media{transform:translate(-4px,-4px);box-shadow:8px 8px 0 #ffd23f}
.k-card-b:hover .k-card-img{animation:k-hue 1.6s linear infinite}
.k-card:hover .k-card-name{color:#ff2e88}
.k-card-b:hover .k-card-b-name{color:#ffd23f}
.k-badge,.k-badge-b{transform:rotate(-4deg);transform-origin:left top}
.k-card:hover .k-badge,.k-card-b:hover .k-badge-b{animation:k-wig .5s ease-in-out infinite}
.k-btn,.k-btn-yellow,.k-submit{transition:transform .12s ease,box-shadow .12s ease,background-color .12s ease}
.k-btn:hover,.k-btn-yellow:hover{transform:translate(4px,4px);box-shadow:2px 2px 0 #141414}
.k-size{transition:background-color .12s ease,transform .12s ease;user-select:none}
.k-size.is-on{background:#141414;color:#ffd23f}
.k-size:active{transform:translate(2px,2px)}
.k-b-title{background:linear-gradient(90deg,#ffd23f,#ff7a1a,#ff2e88,#9b3dff,#19d3ff,#00d68f,#ffd23f);background-size:200% 100%;-webkit-background-clip:text;background-clip:text;color:transparent!important;text-shadow:none!important;filter:drop-shadow(4px 4px 0 #2b59ff);animation:k-rb 8s linear infinite;padding-right:.12em}
.k-menu-link{position:relative}
.k-menu-link::after{content:"";position:absolute;left:0;right:100%;bottom:-6px;height:3px;background:#ff2e88;transition:right .18s ease}
.k-menu-link:hover::after{right:0}
.k-pre{opacity:0}
.k-in{animation:k-up .55s cubic-bezier(.2,.7,.2,1) both}
.k-pdp-img{transition:transform .5s cubic-bezier(.2,.7,.2,1)}
.k-pdp-media:hover .k-pdp-img{transform:scale(1.05) rotate(-1.5deg)}
@media (prefers-reduced-motion:reduce){.k-marq,.k-rainbow,.k-b-title,.k-in,.k-card-b:hover .k-card-img,.k-card:hover .k-badge,.k-card-b:hover .k-badge-b{animation:none!important}}
</style>
<script>
(function(){
  function ready(f){document.readyState!=='loading'?f():document.addEventListener('DOMContentLoaded',f)}
  ready(function(){
    document.querySelectorAll('.k-ticker-text,.k-announce-text').forEach(function(el){
      var t=el.textContent.replace(/\\s+$/,'')+' ';
      el.textContent=new Array(9).join(t);
      el.classList.add('k-marq');
    });
    var sizes=document.querySelectorAll('.k-size');
    sizes.forEach(function(s){s.addEventListener('click',function(){
      sizes.forEach(function(o){o.classList.remove('is-on')});s.classList.add('is-on');
      var slot=document.getElementById('checkout');if(slot){slot.dataset.size=s.textContent.trim()}
    })});
    if('IntersectionObserver' in window){
      var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.remove('k-pre');e.target.classList.add('k-in');io.unobserve(e.target)}})},{rootMargin:'0px 0px -6% 0px'});
      document.querySelectorAll('.k-card,.k-card-b,.k-feature,.k-feature-last').forEach(function(el,i){
        if(el.getBoundingClientRect().top>window.innerHeight){el.classList.add('k-pre');el.style.animationDelay=(i%5)*60+'ms';io.observe(el)}
      });
    }
  });
})();
</script>"""
