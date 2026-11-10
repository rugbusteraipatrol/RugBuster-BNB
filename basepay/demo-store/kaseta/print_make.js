// Fits each design's real painted bounds into an A3 portrait page and writes PDF + 300 dpi PNG.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, 'print');
const { fontCss, designs } = JSON.parse(fs.readFileSync(path.join(dir, 'designs.json'), 'utf8'));
const A3 = { w: 297, h: 420 }, MARGIN = 10;           // mm
const html = (inner, css = '') => `<!doctype html><html><head><meta charset="utf-8"><style>${fontCss}
html,body{margin:0;padding:0;background:transparent}svg{display:block}${css}</style></head><body>${inner}</body></html>`;
const tmp = path.join(dir, '_tmp.html');
const load = async (page, markup) => {
  fs.writeFileSync(tmp, markup);
  await page.goto('file://' + tmp);
  await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.fonts].map(f => f.load().catch(() => null))); });
  await page.waitForTimeout(500);
};
(async () => {
  const browser = await chromium.launch();
  const report = {};
  for (const [name, d] of Object.entries(designs)) {
    // 1. measure what is actually painted (filters and strokes included): 2 px per unit over -450..450
    const S = 2, R = 450;
    const page = await browser.newPage({ viewport: { width: 2 * R * S, height: 2 * R * S } });
    await load(page, html(`<svg xmlns="http://www.w3.org/2000/svg" width="${2 * R * S}" height="${2 * R * S}" viewBox="${-R} ${-R} ${2 * R} ${2 * R}"><defs>${d.defs}</defs>${d.body}</svg>`));
    const shot = (await page.screenshot({ omitBackground: true })).toString('base64');
    const bb = await page.evaluate(async (b64) => {
      const img = await createImageBitmap(await (await fetch('data:image/png;base64,' + b64)).blob());
      const c = new OffscreenCanvas(img.width, img.height), g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      const { data, width, height } = g.getImageData(0, 0, img.width, img.height);
      let x0 = width, y0 = height, x1 = -1, y1 = -1;
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (data[(y * width + x) * 4 + 3] > 6) {
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
      return { x0, y0, x1, y1 };
    }, shot);
    await page.close();
    const ux0 = bb.x0 / S - R, uy0 = bb.y0 / S - R, uw = (bb.x1 - bb.x0 + 1) / S, uh = (bb.y1 - bb.y0 + 1) / S;
    // 2. scale to the printable box and centre on the page
    const k = Math.min((A3.w - 2 * MARGIN) / uw, (A3.h - 2 * MARGIN) / uh);   // mm per unit
    const vbW = A3.w / k, vbH = A3.h / k;
    const vbX = ux0 - (vbW - uw) / 2, vbY = uy0 - (vbH - uh) / 2;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${A3.w}mm" height="${A3.h}mm" viewBox="${vbX.toFixed(2)} ${vbY.toFixed(2)} ${vbW.toFixed(2)} ${vbH.toFixed(2)}"><defs>${d.defs}</defs>${d.body}</svg>`;
    const p2 = await browser.newPage();
    await load(p2, html(svg, `@page{size:${A3.w}mm ${A3.h}mm;margin:0}`));
    await p2.pdf({ path: path.join(dir, `${name}-A3.pdf`), width: `${A3.w}mm`, height: `${A3.h}mm`, printBackground: true, pageRanges: '1' });
    await p2.close();
    // 3. 300 dpi transparent PNG of the same page: 3508 x 4961 px
    const PW = 3508, PH = 4961, CSSW = 1754;
    const p3 = await browser.newPage({ viewport: { width: CSSW, height: Math.round(CSSW * PH / PW) }, deviceScaleFactor: PW / CSSW });
    await load(p3, html(svg.replace(`width="${A3.w}mm" height="${A3.h}mm"`, `width="${CSSW}" height="${(CSSW * A3.h / A3.w).toFixed(2)}"`)));
    await p3.screenshot({ path: path.join(dir, `${name}-A3-300dpi.png`), omitBackground: true, clip: { x: 0, y: 0, width: CSSW, height: CSSW * PH / PW } });
    await p3.close();
    report[name] = { tee: d.tee, printMm: [+(uw * k).toFixed(1), +(uh * k).toFixed(1)] };
    console.log(name, report[name].printMm.join(' x '), 'mm');
  }
  fs.writeFileSync(path.join(dir, 'report.json'), JSON.stringify(report, null, 1));
  fs.rmSync(tmp, { force: true });
  await browser.close();
})();
