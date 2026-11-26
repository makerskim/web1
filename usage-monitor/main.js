'use strict';
const { app, BrowserWindow, Tray, Menu, Notification, ipcMain, nativeImage, nativeTheme, net, powerMonitor, screen } = require('electron');
const path = require('path');
const os = require('os');
const { createClaudeSource } = require('./src/sources/claude');
const { createCodexSource } = require('./src/sources/codex');
const { readClaudeWeb, readChatgptWeb } = require('./src/sources/web');
const { createProvider } = require('./src/providers');
const { createWebAccount } = require('./src/websession');
const { pace, worstLevel, Alerts } = require('./src/logic');
const { createSettings } = require('./src/settings');

const APP_ID = 'com.aiusage.monitor';
const startHidden = process.argv.includes('--hidden');

// A second launch (for example the desktop icon while it already runs) brings the open window forward.
if (!app.requestSingleInstanceLock()) {
  app.quit();
  return;
}
app.on('second-instance', () => showWindow());

const home = process.env.USAGE_MONITOR_HOME || os.homedir();
const fetchFn = (url, opts) => net.fetch(url, opts);
let sources = []; // built once Electron is ready (sessions need it)
const accounts = {};
const alerts = new Alerts();

let settings;
let win = null;
let tray = null;
let timer = null;
let quitting = false;
let busy = false;
let snapshot = { providers: [], checkedAt: null };
const lastGood = new Map();
const backoff = new Map(); // provider id -> skip until (ms) after "too many requests"

const COLORS = {
  light: { bg: '#E9EDF1', symbol: '#17202B' },
  dark: { bg: '#141A21', symbol: '#E6EBF0' },
};

function theme() {
  return nativeTheme.shouldUseDarkColors ? COLORS.dark : COLORS.light;
}

function icon(name) {
  return nativeImage.createFromPath(path.join(__dirname, 'assets', name));
}

// The app's own icon: the multi-size .ico on Windows keeps the taskbar and title bar sharp.
function appIcon() {
  return icon(process.platform === 'win32' ? 'icon.ico' : 'icon.png');
}

// A small panel pinned to a corner of the screen; it can't be dragged away.
const PANEL_WIDTH = 280;
const MARGIN = 10;
let panelHeight = 240;

function placeWindow() {
  if (!win || win.isDestroyed()) return;
  const area = screen.getPrimaryDisplay().workArea; // the screen minus the taskbar
  const h = Math.min(panelHeight, area.height - MARGIN * 2);
  const x = area.x + area.width - PANEL_WIDTH - MARGIN;
  const y = settings.get().dock === 'bottom-right' ? area.y + area.height - h - MARGIN : area.y + MARGIN;
  win.setBounds({ x, y, width: PANEL_WIDTH, height: h });
}

function createWindow() {
  const t = theme();
  win = new BrowserWindow({
    width: PANEL_WIDTH,
    height: panelHeight,
    show: false,
    frame: false,
    resizable: false,
    movable: false,
    maximizable: false,
    fullscreenable: false,
    title: 'AI 사용량',
    backgroundColor: t.bg,
    icon: appIcon(),
    alwaysOnTop: settings.get().alwaysOnTop,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.removeMenu();
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  placeWindow();
  win.once('ready-to-show', () => {
    placeWindow();
    if (!startHidden) win.show();
    else if (settings.get().closeAction !== 'tray') win.minimize(); // started with Windows: wait on the taskbar
    updateTaskbar();
  });
  // Keep our own title (it carries the percentages shown when hovering the taskbar button).
  win.on('page-title-updated', (e) => e.preventDefault());
  win.on('close', (e) => {
    if (quitting) return;
    const action = settings.get().closeAction;
    if (action === 'quit') {
      quitting = true;
      app.quit();
      return;
    }
    e.preventDefault();
    if (action === 'minimize') {
      win.minimize();
      return;
    }
    win.hide();
    if (!settings.get().trayHintShown && Notification.isSupported()) {
      new Notification({
        title: 'AI 사용량은 계속 확인하고 있어요',
        body: '화면 오른쪽 아래 시계 옆 아이콘이나 바탕화면의 AI 사용량 아이콘을 누르면 다시 열려요. 완전히 끄려면 시계 옆 아이콘을 마우스 오른쪽 버튼으로 누르고 "끝내기"를 누르세요.',
        icon: appIcon(),
      }).show();
      settings.set({ trayHintShown: true });
    }
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
}

function showWindow() {
  if (!win) createWindow();
  if (win.isMinimized()) win.restore();
  placeWindow();
  win.show();
  win.focus();
}

function trayMenu() {
  return Menu.buildFromTemplate([
    { label: '열기', click: showWindow },
    { label: '지금 새로고침', click: () => refresh(true) },
    { type: 'separator' },
    {
      label: '끝내기',
      click: () => {
        quitting = true;
        app.quit();
      },
    },
  ]);
}

function trayText() {
  const parts = snapshot.providers.map((p) => {
    const w = (p.windows || []).find((x) => x.primary) || (p.windows || [])[0];
    return w ? `${p.name} ${Math.round(w.usedPercent)}%` : `${p.name} 정보 없음`;
  });
  return `AI 사용량\n${parts.join('\n')}`;
}

function updateTray() {
  if (!tray) return;
  const lvl = worstLevel(snapshot, settings.get().thresholds);
  tray.setImage(icon(`tray-${lvl}.png`));
  tray.setToolTip(trayText());
  updateTaskbar();
}

/**
 * The taskbar button shows the fullest 5-hour limit as a progress bar
 * (green, yellow at the warning level, red at the danger level), a coloured
 * badge, and the percentages in the window title when hovered.
 */
function updateTaskbar() {
  if (!win || win.isDestroyed()) return;
  const [warn, danger] = settings.get().thresholds;
  const parts = [];
  let top = null;
  for (const p of snapshot.providers) {
    const w = (p.windows || []).find((x) => x.primary);
    if (!w) continue;
    parts.push(`${p.name} ${Math.round(w.usedPercent)}%`);
    top = Math.max(top ?? 0, w.usedPercent);
  }
  win.setTitle(parts.length ? `AI 사용량  ${parts.join(', ')}` : 'AI 사용량');
  if (top == null) {
    win.setProgressBar(-1);
  } else {
    const mode = top >= danger ? 'error' : top >= warn ? 'paused' : 'normal';
    win.setProgressBar(Math.max(0.02, top / 100), { mode });
  }
  if (process.platform === 'win32') {
    const lvl = worstLevel(snapshot, settings.get().thresholds);
    win.setOverlayIcon(lvl === 'idle' ? null : icon(`tray-${lvl}.png`), parts.join(', '));
  }
}

function decorate(p, now) {
  return { ...p, windows: (p.windows || []).map((w) => ({ ...w, pace: pace(w, now) })) };
}

async function readOne(src, now, force) {
  const wait = backoff.get(src.id);
  const prev = lastGood.get(src.id);
  if (!force && wait && now < wait.until) {
    // Still waiting after "too many requests": don't ask again yet.
    return prev ? { ...prev, stale: true, liveStatus: 'busy' } : { status: 'busy', windows: [] };
  }
  let r;
  try {
    r = await src.read(now);
  } catch (e) {
    r = { status: 'error', message: String((e && e.message) || e), windows: [] };
  }
  if (r.status === 'busy') {
    // Asked too often: wait 2 minutes, then 4, 8, up to 10.
    const step = Math.min(10 * 60e3, wait ? wait.step * 2 : 2 * 60e3);
    backoff.set(src.id, { until: now + step, step });
  } else {
    backoff.delete(src.id);
  }
  if (r.status === 'ok' && r.windows.length) {
    lastGood.set(src.id, { ...r, fetchedAt: now });
    return { ...r, fetchedAt: now };
  }
  // Keep showing the last numbers we had, and say why they are not fresh.
  if (prev && ['offline', 'busy', 'error', 'expired'].includes(r.status)) {
    return { ...prev, stats: r.stats || prev.stats, stale: true, liveStatus: r.status, message: r.message };
  }
  return r;
}

async function refresh(force = false) {
  if (busy) return snapshot;
  busy = true;
  try {
    const now = Date.now();
    const results = await Promise.all(sources.map((s) => readOne(s, now, force)));
    snapshot = {
      checkedAt: now,
      providers: results.map((r, i) => decorate({ id: sources[i].id, name: sources[i].name, ...r }, now)),
    };
    const s = settings.get();
    if (s.notify && Notification.isSupported()) {
      for (const a of alerts.check(snapshot, s.thresholds)) notify(a);
    } else {
      alerts.check(snapshot, s.thresholds);
    }
    updateTray();
    if (win && !win.isDestroyed()) win.webContents.send('usage:update', snapshot);
  } finally {
    busy = false;
  }
  return snapshot;
}

function notify({ provider, window: w, threshold }) {
  const when = w.resetsAt
    ? new Date(w.resetsAt).toLocaleString('ko-KR', { weekday: 'short', hour: 'numeric', minute: '2-digit' })
    : null;
  const n = new Notification({
    title: `${provider.name} ${w.label} ${Math.round(w.usedPercent)}% 사용`,
    body:
      threshold >= 100 || w.usedPercent >= 100
        ? `한도를 다 썼어요.${when ? ` ${when}에 다시 채워져요.` : ''}`
        : `알림 기준 ${threshold}%를 넘었어요.${when ? ` ${when}에 다시 채워져요.` : ''}`,
    icon: appIcon(),
    urgency: threshold >= settings.get().thresholds[1] ? 'critical' : 'normal',
  });
  n.on('click', showWindow);
  n.show();
}

function schedule() {
  clearInterval(timer);
  timer = setInterval(() => refresh(false), settings.get().intervalSec * 1000);
}

function applyLogin(on) {
  if (process.platform !== 'win32' && process.platform !== 'darwin') return;
  app.setLoginItemSettings({ openAtLogin: on, args: ['--hidden'] });
}

app.whenReady().then(() => {
  app.setAppUserModelId(APP_ID);
  settings = createSettings(app.getPath('userData'));

  ipcMain.handle('usage:get', () => snapshot);
  ipcMain.handle('usage:refresh', () => refresh(true));
  ipcMain.handle('settings:get', () => ({ ...settings.get(), version: app.getVersion(), platform: process.platform }));
  ipcMain.handle('settings:set', (_e, patch) => {
    const allowed = ['intervalSec', 'notify', 'thresholds', 'openAtLogin', 'alwaysOnTop', 'closeAction', 'dock'];
    const clean = {};
    for (const k of allowed) if (patch && k in patch) clean[k] = patch[k];
    const next = settings.set(clean);
    if ('intervalSec' in clean) schedule();
    if ('openAtLogin' in clean) applyLogin(next.openAtLogin);
    if ('alwaysOnTop' in clean && win) win.setAlwaysOnTop(next.alwaysOnTop);
    if ('thresholds' in clean) updateTray();
    if ('dock' in clean) placeWindow();
    return { ...next, version: app.getVersion(), platform: process.platform };
  });
  // The page reports how tall its content is; the panel grows or shrinks to fit.
  ipcMain.on('panel:height', (_e, h) => {
    const n = Math.round(Number(h));
    if (!Number.isFinite(n) || n < 80 || n > 2000 || n === panelHeight) return;
    panelHeight = n;
    placeWindow();
  });
  ipcMain.on('panel:close', () => win && win.close());
  ipcMain.handle('account:login', (_e, id) => {
    const a = accounts[id];
    if (!a) return;
    a.web.openLogin(
      async () => (await a.read(Date.now())).status === 'ok',
      () => refresh(true)
    );
  });
  ipcMain.handle('account:logout', async (_e, id) => {
    const a = accounts[id];
    if (!a) return snapshot;
    await a.web.logout();
    lastGood.delete(id);
    return refresh(true);
  });
  // Claude: claude.ai login first, Claude Code on this computer second.
  const claudeWeb = createWebAccount({
    partition: 'persist:claude-web',
    origin: 'https://claude.ai',
    loginUrl: 'https://claude.ai/login',
    probeUrl: 'https://claude.ai/api/organizations',
    title: 'Claude 로그인',
    icon: appIcon(),
  });
  // ChatGPT: chatgpt.com login first, Codex on this computer second.
  const chatgptWeb = createWebAccount({
    partition: 'persist:chatgpt-web',
    origin: 'https://chatgpt.com',
    loginUrl: 'https://chatgpt.com/auth/login',
    probeUrl: 'https://chatgpt.com/api/auth/session',
    title: 'ChatGPT 로그인',
    icon: appIcon(),
  });
  accounts.claude = { web: claudeWeb, read: () => readClaudeWeb(claudeWeb.request) };
  accounts.chatgpt = { web: chatgptWeb, read: (now) => readChatgptWeb(chatgptWeb.request, now) };
  sources = [
    createProvider({ id: 'claude', name: 'Claude', readWeb: accounts.claude.read, local: createClaudeSource({ home, fetch: fetchFn }) }),
    createProvider({ id: 'chatgpt', name: 'ChatGPT', readWeb: accounts.chatgpt.read, local: createCodexSource({ home, fetch: fetchFn }) }),
  ];

  createWindow();
  tray = new Tray(icon('tray-idle.png'));
  tray.setToolTip('AI 사용량');
  tray.setContextMenu(trayMenu());
  tray.on('click', () => (win && win.isVisible() && win.isFocused() ? win.hide() : showWindow()));

  nativeTheme.on('updated', () => {
    if (win) win.setBackgroundColor(theme().bg);
  });
  powerMonitor.on('resume', () => refresh(true));
  // Screen size or taskbar changed: stay in the corner.
  screen.on('display-metrics-changed', placeWindow);
  screen.on('display-added', placeWindow);
  screen.on('display-removed', placeWindow);

  refresh(true);
  schedule();
});

app.on('before-quit', () => {
  quitting = true;
});
app.on('window-all-closed', () => {
  // Stays in the tray; quitting goes through the tray menu.
});
