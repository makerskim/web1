'use strict';
// Each provider prefers the website login made in this program; when that isn't
// signed in or can't answer, it falls back to Claude Code / Codex on this computer.

function createProvider({ id, name, readWeb, local }) {
  return {
    id,
    name,
    async read(now = Date.now()) {
      let web;
      try {
        web = await readWeb(now);
      } catch (e) {
        web = { status: 'error', message: String((e && e.message) || e) };
      }
      // Offline: we can't tell whether the site is signed in, so don't claim it is.
      const webLoggedIn = !['not_logged_in', 'offline'].includes(web.status);
      if (web.status === 'ok') {
        const stats = await local.readStats(now).catch(() => null);
        return { ...web, source: 'live', via: 'web', webLoggedIn, stats };
      }
      const l = await local.read(now).catch(() => ({ status: 'error', windows: [] }));
      if (l.status === 'ok' && l.windows && l.windows.length) return { ...l, via: 'app', webLoggedIn };
      if (web.status === 'not_logged_in') return { status: 'not_logged_in', windows: [], webLoggedIn, stats: l.stats || null };
      return { windows: [], ...web, webLoggedIn, stats: l.stats || null };
    },
  };
}

module.exports = { createProvider };
