'use strict';
// A separate, remembered browser session per website. The user signs in on the
// site's own login page inside this program; we never see or store the password.
const { BrowserWindow, session } = require('electron');

// Some sign-in pages (Google in particular) refuse browsers that announce
// themselves as Electron, so present a plain Chrome user agent.
function plainUserAgent(ua) {
  return ua.replace(/\s?Electron\/\S+/, '').replace(/\s?ai-usage-monitor\/\S+/, '').replace(/\s?AI Usage Monitor\/\S+/, '');
}

// Never wait forever on a page or a request (sleeping network, endless challenge pages).
function withTimeout(promise, ms, fallback) {
  let t;
  return Promise.race([promise, new Promise((resolve) => (t = setTimeout(() => resolve(fallback), ms)))]).finally(() => clearTimeout(t));
}

function createWebAccount({ partition, origin, loginUrl, probeUrl, title, icon }) {
  const ses = session.fromPartition(partition);
  const ua = plainUserAgent(ses.getUserAgent());
  ses.setUserAgent(ua);

  let worker = null; // hidden page on the site, so requests run as the site's own page would
  let loginWin = null;

  function dropWorker() {
    if (worker && !worker.isDestroyed()) worker.destroy();
    worker = null;
  }

  async function ensureWorker() {
    if (worker && !worker.isDestroyed() && worker.webContents.getURL().startsWith(origin)) return worker;
    dropWorker();
    worker = new BrowserWindow({
      show: false,
      webPreferences: { partition, sandbox: true, contextIsolation: true, nodeIntegration: false },
    });
    worker.webContents.setUserAgent(ua);
    await withTimeout(worker.loadURL(probeUrl).catch(() => {}), 15000);
    return worker;
  }

  async function request(url, headers = {}) {
    let w;
    try {
      w = await withTimeout(ensureWorker(), 20000, null);
    } catch {
      return { status: 0 };
    }
    if (!w || w.isDestroyed() || !w.webContents.getURL().startsWith(origin)) {
      dropWorker();
      return { status: 0 };
    }
    const code = `(async () => {
      try {
        const r = await fetch(${JSON.stringify(url)}, { credentials: 'include', headers: ${JSON.stringify(headers)} });
        let json = null;
        try { json = await r.json(); } catch (e) {}
        return { status: r.status, json };
      } catch (e) { return { status: 0 }; }
    })()`;
    const res = await withTimeout(w.webContents.executeJavaScript(code, true).catch(() => ({ status: 0 })), 15000, { status: 0 });
    if (!res || res.status === 0) dropWorker();
    return res || { status: 0 };
  }

  /**
   * Opens the site's sign-in page. isSignedIn() is polled while it is open;
   * the window closes by itself once signing in has worked.
   */
  function openLogin(isSignedIn, onDone) {
    if (loginWin && !loginWin.isDestroyed()) {
      loginWin.show();
      loginWin.focus();
      return;
    }
    loginWin = new BrowserWindow({
      width: 500,
      height: 760,
      title,
      icon,
      autoHideMenuBar: true,
      webPreferences: { partition, sandbox: true, contextIsolation: true, nodeIntegration: false },
    });
    loginWin.removeMenu();
    loginWin.webContents.setUserAgent(ua);
    // Sign-in with Google, Apple or Microsoft opens a pop-up: keep it in the same session.
    loginWin.webContents.setWindowOpenHandler(() => ({
      action: 'allow',
      overrideBrowserWindowOptions: {
        width: 520,
        height: 720,
        autoHideMenuBar: true,
        icon,
        webPreferences: { partition, sandbox: true, contextIsolation: true, nodeIntegration: false },
      },
    }));
    loginWin.loadURL(loginUrl);
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearInterval(timer);
      onDone();
    };
    const timer = setInterval(async () => {
      if (await isSignedIn().catch(() => false)) {
        finish();
        if (loginWin && !loginWin.isDestroyed()) loginWin.close();
      }
    }, 3000);
    loginWin.on('closed', () => {
      loginWin = null;
      finish();
    });
  }

  async function logout() {
    dropWorker();
    await ses.clearStorageData().catch(() => {});
    await ses.clearCache().catch(() => {});
  }

  return { request, openLogin, logout };
}

module.exports = { createWebAccount, plainUserAgent };
