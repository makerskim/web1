// 쑥쑥 앨범 — 앱 시작, 화면 이동, 공통 상태

import { createApi } from './api.js';
import { setMediaApi } from './media.js';
import { html, babyAge, babyMilestone, isKakaoInApp } from './util.js';
import { icon } from './icons.js';
import { closeAllOverlays, toast } from './ui.js';
import * as Feed from './screens/feed.js';
import * as Grid from './screens/grid.js';
import * as Activity from './screens/activity.js';
import * as Family from './screens/family.js';
import * as PostPage from './screens/post.js';
import * as Onboarding from './screens/onboarding.js';
import { startCompose } from './compose.js';

const TEXT_SIZES = { normal: '17px', large: '19.5px', xlarge: '22px' };
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 공간 부족 */ } };

const app = {
  api: null,
  user: null,
  families: [],
  fam: null,
  members: [],
  memberMap: new Map(),
  me: { displayName: '나', avatar: '🙂' },
  postsById: new Map(),
  activity: [],
  prefs: load('ssuk-prefs', { textSize: 'normal' }),
  installPrompt: null,
  pendingInvite: null,

  get isOwner() { return this.fam?.myRole === 'owner'; },
  memberOf(uid) { return this.memberMap.get(uid) || { displayName: '가족', avatar: '🙂' }; },
  nameOf(uid) { return this.memberOf(uid).displayName; },

  // 사진 찍은 날 아기 나이 ("🎉 백일 · 생후 100일", "생후 123일 · 4개월")
  ageAt(date) {
    const b = this.fam?.babyBirthday;
    if (!b) return '';
    const ms = babyMilestone(b, date);
    const age = babyAge(b, date);
    return ms ? `${ms} · ${babyAge(b, date, { short: true })}` : age;
  },

  setPref(k, v) {
    this.prefs[k] = v;
    save('ssuk-prefs', this.prefs);
    applyPrefs();
  },

  async go(hash) {
    await closeAllOverlays();
    if (location.hash === hash) route();
    else location.hash = hash;
  },

  setTop(content) {
    const top = document.getElementById('topbar');
    if (top) top.innerHTML = String(content);
  },

  compose() { startCompose(app); },

  // 새 게시물을 올린 뒤
  addPost(post) {
    this.postsById.set(post.id, post);
    Feed.prepend(app, post);
    Grid.invalidate();
  },

  removePost(id) {
    Feed.remove(id);
    Grid.invalidate();
  },

  async reloadFamilies() {
    this.families = await this.api.families();
    save('ssuk-families', this.families);
    const cur = this.families.find((f) => f.id === this.fam?.id);
    if (cur) this.fam = cur;
    return this.families;
  },

  async reloadMembers() {
    this.members = await this.api.members(this.fam.id);
    this.indexMembers();
    saveSnap();
  },

  indexMembers() {
    this.memberMap = new Map(this.members.map((m) => [m.userId, m]));
    this.me = this.memberMap.get(this.user?.id) || { userId: this.user?.id, displayName: this.fam?.myName || '나', avatar: this.fam?.myAvatar || '🙂', role: this.fam?.myRole };
  },

  async enterFamily(fam) {
    this.fam = fam;
    localStorage.setItem('ssuk-fam', fam.id);
    const snap = load(`ssuk-snap-${fam.id}`, null);
    this.members = snap?.members || [];
    this.indexMembers();
    let fresh = false;
    if (!this.members.length) {
      // 처음 들어온 앨범: 가족 이름을 먼저 받아야 '가족' 대신 '엄마'로 보여요
      try { await this.reloadMembers(); fresh = true; } catch { /* 아래에서 다시 */ }
    }
    Feed.reset(snap?.posts);
    Grid.invalidate();
    renderShell();
    route();
    try {
      if (!fresh) await this.reloadMembers();
      if (location.hash.startsWith('#/family')) route();
      else { Feed.drawStrip(app); Feed.redrawCards(app); }
    } catch (e) {
      toast(e.message);
    }
    checkNews();
  },

  // 앨범이 하나도 없을 때(처음, 또는 나간 뒤)
  async restart() {
    this.fam = null;
    await this.reloadFamilies().catch(() => {});
    start();
  },

  snapshot: saveSnap,
  refreshBadges,
  checkNews,
  markSeen: (k) => markSeen(k),
};

window.ssukApp = app; // 문제 해결용

function saveSnap() {
  if (!app.fam) return;
  save(`ssuk-snap-${app.fam.id}`, { members: app.members, posts: Feed.firstPosts(12) });
}

function applyPrefs() {
  document.documentElement.style.fontSize = TEXT_SIZES[app.prefs.textSize] || TEXT_SIZES.normal;
}

// ---------- 새 소식 확인 (빨간 점, 숫자) ----------
const seenKey = () => `ssuk-seen-${app.fam?.id}`;
function markSeen(kind) {
  const s = load(seenKey(), {});
  s[kind] = new Date().toISOString();
  save(seenKey(), s);
  refreshBadges();
}

function refreshBadges() {
  if (!app.fam) return;
  let s = load(seenKey(), null);
  if (!s) {
    s = { feed: new Date().toISOString(), act: new Date().toISOString() };
    save(seenKey(), s);
  }
  const others = app.activity.filter((e) => e.userId !== app.user?.id);
  const newPosts = others.filter((e) => e.type === 'post' && e.at > s.feed).length;
  const newAct = others.filter((e) => e.at > s.act).length;
  const dot = document.querySelector('[data-tab=home] .badge');
  const num = document.querySelector('[data-tab=activity] .badge');
  if (dot) dot.hidden = !newPosts;
  if (num) { num.hidden = !newAct; num.textContent = newAct > 9 ? '9+' : String(newAct); }
  Feed.newPostsHint(app);
}

let checking = false;
async function checkNews() {
  if (!app.fam || checking || document.hidden) return;
  checking = true;
  try {
    app.activity = await app.api.activity(app.fam.id);
    if (app.activity.some((e) => !app.memberMap.has(e.userId))) {
      // 새로 들어온 가족이 있으면 이름 다시 받기
      await app.reloadMembers();
      Feed.drawStrip(app);
      Feed.redrawCards(app);
    }
    refreshBadges();
    if (location.hash.startsWith('#/activity')) Activity.update(app);
  } catch { /* 인터넷이 없으면 다음에 */ } finally {
    checking = false;
  }
}

setInterval(checkNews, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkNews(); });

// ---------- 화면 틀 ----------
function renderShell() {
  document.getElementById('app').innerHTML = String(html`
    <header class="topbar" id="topbar"></header>
    <main id="view" class="view"></main>
    <nav class="tabbar" aria-label="메뉴">
      <a href="#/home" data-tab="home">${icon('home', { size: 27 })}<span>홈</span><i class="badge dot" hidden></i></a>
      <a href="#/grid" data-tab="grid">${icon('grid', { size: 27 })}<span>모아보기</span></a>
      <button type="button" data-tab="new" class="tab-new" aria-label="사진 올리기"><i>${icon('plus', { size: 28, stroke: 2.6 })}</i><span>사진 올리기</span></button>
      <a href="#/activity" data-tab="activity">${icon('bell', { size: 27 })}<span>소식</span><i class="badge num" hidden></i></a>
      <a href="#/family" data-tab="family">${icon('users', { size: 27 })}<span>가족</span></a>
    </nav>`);
  document.querySelector('[data-tab=new]').addEventListener('click', () => app.compose());
  document.querySelector('[data-tab=home]').addEventListener('click', (e) => {
    if (location.hash === '#/home' || location.hash === '' || location.hash === '#/') {
      e.preventDefault();
      Feed.toTopAndRefresh(app);
    }
  });
  refreshBadges();
}

let current = null;
function route() {
  if (!app.fam) return;
  const view = document.getElementById('view');
  if (!view) return;
  const [, name = 'home', arg] = (location.hash || '#/home').split('/');
  current?.leave?.();
  view.onclick = null;
  document.querySelectorAll('.tabbar [data-tab]').forEach((t) => t.classList.toggle('on', t.dataset.tab === name));
  document.body.dataset.screen = name;
  const screens = { home: Feed, grid: Grid, activity: Activity, family: Family, p: PostPage };
  current = screens[name] || Feed;
  current.render(app, view, arg);
  if (name === 'activity') markSeen('act');
}
window.addEventListener('hashchange', () => {
  // 이메일 로그인 링크(#access_token=...)는 Supabase가 처리
  if (!location.hash.startsWith('#/') && location.hash) return;
  route();
});

function start() {
  if (app.pendingInvite) return Onboarding.join(app, app.pendingInvite);
  if (!app.families.length) return Onboarding.welcome(app);
  const saved = localStorage.getItem('ssuk-fam');
  const fam = app.families.find((f) => f.id === saved) || app.families[0];
  if (!location.hash.startsWith('#/')) history.replaceState(history.state, '', '#/home');
  app.enterFamily(fam);
}
app.start = start;

function fatal(msg) {
  document.getElementById('app').innerHTML = String(html`
    <div class="fatal">
      <div class="logo-big">🌱</div>
      <h1>앱을 열지 못했어요</h1>
      <p>${msg}</p>
      <button class="btn primary block" onclick="location.reload()">다시 시도</button>
    </div>`);
}

// 카카오톡 안의 브라우저에서는 사진 저장·설치가 잘 안 되어서 휴대폰 기본 브라우저로 엽니다
function escapeKakao() {
  if (!isKakaoInApp() || sessionStorage.getItem('ssuk-kakao-tried')) return false;
  sessionStorage.setItem('ssuk-kakao-tried', '1');
  location.href = 'kakaotalk://web/openExternal?url=' + encodeURIComponent(location.href);
  return true;
}

async function boot() {
  applyPrefs();
  if (history.state?.ov) history.replaceState(null, '');
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); app.installPrompt = e; });
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  if (escapeKakao()) {
    setTimeout(() => boot2(), 1500); // 이동하지 못했으면 그냥 여기서 계속
    return;
  }
  boot2();
}

async function boot2() {
  if (app.api) return;
  try {
    app.api = await createApi();
    setMediaApi(app.api);
    app.user = await app.api.init();
  } catch (e) {
    console.error(e);
    app.api = null;
    return fatal('인터넷 연결을 확인한 뒤 다시 시도해 주세요.');
  }
  const params = new URLSearchParams(location.search);
  app.pendingInvite = params.get('invite') || null;
  if (location.hash.includes('access_token') || location.hash.includes('error_description')) {
    if (location.hash.includes('error_description')) toast('인증 링크가 만료되었어요. 다시 시도해 주세요.');
    app.user = await app.api.refreshSession?.() ?? app.user;
    history.replaceState(null, '', location.pathname + location.search + '#/home');
  }
  if (app.user) {
    try {
      await app.reloadFamilies();
    } catch (e) {
      app.families = load('ssuk-families', []);
      if (!app.families.length) toast(e.message);
    }
  }
  start();
}

boot();
