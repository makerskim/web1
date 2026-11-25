// Draws the app icon (PNG + multi-size Windows .ico) and the tray icons.
// Every size is drawn from the vector, not scaled down, so small icons stay sharp.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const out = (f) => path.join(__dirname, '..', 'assets', f);
const FILL = { ok: '#2fa58c', warn: '#e0a33a', danger: '#e5544a', idle: '#7d8896' };

// A meter: dark tile, track, filled part, and the white "now" tick — same idea as the window.
function svg(size, fill) {
  const small = size <= 24;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">
  <rect x="1" y="1" width="62" height="62" rx="${small ? 12 : 14}" fill="#17202b" stroke="#55657a" stroke-width="${small ? 3 : 2}"/>
  <rect x="9" y="${small ? 23 : 25}" width="46" height="${small ? 18 : 14}" rx="${small ? 9 : 7}" fill="#3a4757"/>
  <rect x="9" y="${small ? 23 : 25}" width="30" height="${small ? 18 : 14}" rx="${small ? 9 : 7}" fill="${fill}"/>
  <rect x="${small ? 41 : 42}" y="${small ? 12 : 15}" width="${small ? 6 : 4}" height="${small ? 40 : 34}" rx="2" fill="#f2f5f8"/>
</svg>`;
}

function ico(pngs) {
  const head = Buffer.alloc(6);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(pngs.length, 4);
  const dir = Buffer.alloc(16 * pngs.length);
  let offset = 6 + dir.length;
  pngs.forEach(({ size, buf }, i) => {
    const o = i * 16;
    dir.writeUInt8(size >= 256 ? 0 : size, o);
    dir.writeUInt8(size >= 256 ? 0 : size, o + 1);
    dir.writeUInt8(0, o + 2); dir.writeUInt8(0, o + 3);
    dir.writeUInt16LE(1, o + 4); dir.writeUInt16LE(32, o + 6);
    dir.writeUInt32LE(buf.length, o + 8); dir.writeUInt32LE(offset, o + 12);
    offset += buf.length;
  });
  return Buffer.concat([head, dir, ...pngs.map((p) => p.buf)]);
}

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  async function render(size, fill) {
    await p.setViewportSize({ width: size, height: size });
    await p.setContent(`<html><body style="margin:0;background:transparent">${svg(size, fill)}</body></html>`);
    return p.screenshot({ omitBackground: true });
  }
  const sizes = [16, 20, 24, 32, 40, 48, 64, 128, 256];
  const pngs = [];
  for (const s of sizes) pngs.push({ size: s, buf: await render(s, FILL.ok) });
  fs.writeFileSync(out('icon.ico'), ico(pngs));
  fs.writeFileSync(out('icon.png'), pngs[pngs.length - 1].buf);
  for (const [k, c] of Object.entries(FILL)) {
    fs.writeFileSync(out(`tray-${k}.png`), await render(16, c));
    fs.writeFileSync(out(`tray-${k}@2x.png`), await render(32, c));
  }
  await b.close();
})();
