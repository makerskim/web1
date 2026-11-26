// Draws the extension icons from one vector (each size drawn, not scaled down).
// Needs Playwright (run once; the PNGs are committed).
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
function svg(size) {
  const small = size <= 24;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">
  <rect x="1" y="1" width="62" height="62" rx="${small ? 12 : 14}" fill="#17202b" stroke="#55657a" stroke-width="${small ? 3 : 2}"/>
  <rect x="9" y="${small ? 14 : 17}" width="46" height="${small ? 14 : 11}" rx="${small ? 7 : 5.5}" fill="#3a4757"/>
  <rect x="9" y="${small ? 14 : 17}" width="30" height="${small ? 14 : 11}" rx="${small ? 7 : 5.5}" fill="#ec8a55"/>
  <rect x="9" y="${small ? 36 : 36}" width="46" height="${small ? 14 : 11}" rx="${small ? 7 : 5.5}" fill="#3a4757"/>
  <rect x="9" y="${small ? 36 : 36}" width="20" height="${small ? 14 : 11}" rx="${small ? 7 : 5.5}" fill="#2fbf94"/>
</svg>`;
}
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  for (const s of [16, 32, 48, 128]) {
    await p.setViewportSize({ width: s, height: s });
    await p.setContent(`<html><body style="margin:0;background:transparent">${svg(s)}</body></html>`);
    fs.writeFileSync(path.join(__dirname, '..', 'icons', `icon${s}.png`), await p.screenshot({ omitBackground: true }));
  }
  await b.close();
})();
