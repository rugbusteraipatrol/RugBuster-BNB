import qrcode from 'qrcode-generator';

/**
 * Renders the payment URI as an inline SVG.
 *
 * Built as a single `<path>` of module rectangles rather than one element per
 * module: a typical EIP-681 URI is ~45x45 modules, and 2000 DOM nodes inside a
 * host page nobody controls is worth avoiding.
 *
 * Error correction level M tolerates a scuffed phone screen without inflating
 * the module count the way H would.
 */
export function renderQrSvg(text: string, options: { size: number; margin?: number } = { size: 220 }): SVGElement {
  const margin = options.margin ?? 2;
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();

  const count = qr.getModuleCount();
  const total = count + margin * 2;

  let path = '';
  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) {
      if (qr.isDark(row, col)) {
        path += `M${col + margin} ${row + margin}h1v1h-1z`;
      }
    }
  }

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${total} ${total}`);
  svg.setAttribute('width', String(options.size));
  svg.setAttribute('height', String(options.size));
  svg.setAttribute('role', 'img');
  svg.setAttribute('shape-rendering', 'crispEdges');

  const background = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  background.setAttribute('width', String(total));
  background.setAttribute('height', String(total));
  background.setAttribute('fill', '#ffffff');
  svg.appendChild(background);

  const modules = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  modules.setAttribute('d', path);
  modules.setAttribute('fill', '#0b0d12');
  svg.appendChild(modules);

  return svg;
}
