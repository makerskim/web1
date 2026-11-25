'use strict';
const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  intervalSec: 60,
  notify: true,
  thresholds: [80, 95],
  openAtLogin: false,
  alwaysOnTop: false,
  closeAction: 'minimize', // 'minimize' to the taskbar, 'tray' (hide to the icon by the clock) or 'quit'
  trayHintShown: false,
};

function sanitize(s) {
  const out = { ...DEFAULTS, ...(s || {}) };
  if (s && s.closeToTray === false && !s.closeAction) out.closeAction = 'quit';
  delete out.closeToTray;
  if (!['minimize', 'tray', 'quit'].includes(out.closeAction)) out.closeAction = 'minimize';
  out.intervalSec = [30, 60, 120, 300].includes(Number(out.intervalSec)) ? Number(out.intervalSec) : 60;
  let [a, b] = Array.isArray(out.thresholds) ? out.thresholds.map(Number) : DEFAULTS.thresholds;
  if (!Number.isFinite(a)) a = 80;
  if (!Number.isFinite(b)) b = 95;
  a = Math.max(10, Math.min(99, Math.round(a)));
  b = Math.max(a + 1, Math.min(100, Math.round(b)));
  out.thresholds = [a, b];
  for (const k of ['notify', 'openAtLogin', 'alwaysOnTop', 'trayHintShown']) out[k] = !!out[k];
  return out;
}

function createSettings(dir) {
  const file = path.join(dir, 'settings.json');
  let value;
  try {
    value = sanitize(JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch {
    value = sanitize({});
  }
  return {
    get: () => ({ ...value }),
    set(patch) {
      value = sanitize({ ...value, ...patch });
      try {
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(file, JSON.stringify(value, null, 2));
      } catch {
        /* keep working with the in-memory copy */
      }
      return { ...value };
    },
  };
}

module.exports = { createSettings, sanitize, DEFAULTS };
