// Draws the app and tray icons (run once; output is committed in assets/).
const { chromium } = require('playwright');
const path = require('path');
const C = { ok: '#1d7a69', warn: '#d08a17', danger: '#d23b2b', idle: '#8792a0' };
function svg(size, color, bg) {
  // A meter: track, filled part, and the "now" tick — same idea as the window.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">
  ${bg ? `<rect width="64" height="64" rx="14" fill="#17202b"/>` : ''}
  <rect x="${bg?10:4}" y="${bg?26:22}" width="${bg?44:56}" height="${bg?12:20}" rx="${bg?6:10}" fill="${bg?'#2f3b48':'#ffffff'}" ${bg?'':'stroke="#17202b" stroke-width="3"'}/>
  <rect x="${bg?10:4}" y="${bg?26:22}" width="${bg?28:34}" height="${bg?12:20}" rx="${bg?6:10}" fill="${color}"/>
  <rect x="${bg?42:44}" y="${bg?18:12}" width="${bg?4:6}" height="${bg?28:40}" rx="2" fill="${bg?'#e6ebf0':'#17202b'}"/>
</svg>`;
}
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  async function shot(file, size, s) {
    await p.setViewportSize({ width: size, height: size });
    await p.setContent(`<html><body style="margin:0;background:transparent">${s}</body></html>`);
    await p.screenshot({ path: path.join(__dirname, '..', 'assets', file), omitBackground: true });
  }
  await shot('icon.png', 256, svg(256, C.ok, true));
  for (const [k, c] of Object.entries(C)) { await shot(`tray-${k}.png`, 16, svg(16, c, false)); await shot(`tray-${k}@2x.png`, 32, svg(32, c, false)); }
  await b.close();
})();
