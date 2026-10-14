// 홈: 가족 사진 소식 (인스타그램 피드처럼) + 최근 사진 스토리 줄

import { html, babyDay, babyMilestone, ymd, callName, obj, hasBatchim } from '../util.js';
import { icon } from '../icons.js';
import { toast } from '../ui.js';
import { postCard, bindCard, handlePostClick, viewerItems } from '../postcard.js';
import { observeImages } from '../media.js';
import { openViewer } from '../viewer.js';
import { openInvite, openAlbumSwitcher } from './family.js';

const PAGE = 8;
const STORY_HOURS = 72;
const S = { el: null, fid: null, posts: [], done: false, loading: false, scrollY: 0, io: null, seenAt: null };

const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 무시 */ } };

export function reset(snapPosts) {
  S.io?.disconnect();
  S.el = null;
  S.fid = null;
  S.posts = snapPosts || [];
  S.done = false;
  S.scrollY = 0;
  S.seenAt = null;
}

export const firstPosts = (n) => S.posts.slice(0, n);
// 다른 탭에 있는 동안 화면에서 빠져 있는 홈 (카드 고칠 때 같이 고치려고)
export const detachedRoot = () => (S.el && !S.el.isConnected ? [S.el] : []);

// ---------- 위쪽 막대: 앨범 이름 (누르면 앨범 바꾸기) ----------
export function topBar(app, right = '') {
  return html`
    <button class="wordmark" data-top="albums" aria-label="${app.fam.name}, 앨범 바꾸기">
      <span>${app.fam.name}</span>${icon('down', { size: 16, stroke: 2.4 })}
    </button>
    ${right}`;
}

export function bindTop(app, extra) {
  document.getElementById('topbar').onclick = (e) => {
    if (e.target.closest('[data-top=albums]')) openAlbumSwitcher(app);
    extra?.(e);
  };
}

// ---------- 특별한 날 카드 (백일·돌·출산 전) ----------
function milestoneCard(app) {
  const { babyName, babyBirthday } = app.fam;
  if (!babyBirthday) return '';
  const day = babyDay(babyBirthday);
  const ms = babyMilestone(babyBirthday);
  if (!ms && day >= 1) return '';
  if (load(msKey(app), false)) return '';
  const nm = callName(babyName || '아기');
  if (day < 1) {
    return html`<div class="ms-card"><p>${obj(nm)} 만나기까지 <b>D-${1 - day}</b> 💕</p>
      <button class="icon-btn" data-feed="ms-x" aria-label="닫기">${icon('close', { size: 20 })}</button></div>`;
  }
  const [emoji, ...rest] = ms.split(' ');
  const label = rest.join(' ');
  return html`<div class="ms-card">
      <p>${emoji} 오늘은 ${nm} <b>${label}</b>${hasBatchim(label) ? '이에요' : '예요'}!</p>
      <button class="btn primary sm" data-feed="compose">축하 사진 올리기</button>
      <button class="icon-btn" data-feed="ms-x" aria-label="닫기">${icon('close', { size: 20 })}</button>
    </div>`;
}
const msKey = (app) => `ssuk-ms-${app.fam.id}-${ymd(new Date())}`;

// ---------- 스토리 (최근 3일 동안 올린 사진, 사람별) ----------
const seenKey = () => `ssuk-story-seen-${S.fid}`;
const storySeen = () => load(seenKey(), {});

export function storyGroups() {
  if (!S.fid) return [];
  const cutoff = Date.now() - STORY_HOURS * 3600000;
  const seen = storySeen();
  const by = new Map();
  for (const p of S.posts) {
    if (Date.parse(p.createdAt) < cutoff) continue;
    if (!by.has(p.authorId)) by.set(p.authorId, []);
    by.get(p.authorId).push(p);
  }
  const groups = [...by].map(([authorId, posts]) => {
    posts.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return { authorId, posts, newest: posts[posts.length - 1].createdAt, unseen: posts.some((p) => !seen[p.id]) };
  });
  return groups.sort((a, b) => (b.unseen - a.unseen) || b.newest.localeCompare(a.newest));
}

export const hasUnseenStory = (authorId) => storyGroups().some((g) => g.authorId === authorId && g.unseen);

function markStorySeen(post) {
  const seen = storySeen();
  const cutoff = Date.now() - STORY_HOURS * 3600000;
  for (const [id, at] of Object.entries(seen)) if (Date.parse(at) < cutoff) delete seen[id];
  seen[post.id] = post.createdAt;
  save(seenKey(), seen);
}

export function openStory(app, authorId) {
  const groups = storyGroups();
  const i = Math.max(0, groups.findIndex((g) => g.authorId === authorId));
  const items = groups.slice(i).flatMap((g) => viewerItems(app, g.posts));
  openViewer(app, items, 0, {
    story: true,
    onShown: (it) => {
      if (it.index !== it.count - 1) return;
      const post = app.postsById.get(it.postId);
      if (!post) return;
      markStorySeen(post);
      drawStrip(app);
      if (!hasUnseenStory(post.authorId)) {
        for (const r of [document, ...detachedRoot()]) {
          r.querySelectorAll(`article.post[data-author="${CSS.escape(post.authorId)}"] .avatar-ring`).forEach((ring) => ring.replaceWith(ring.firstElementChild));
        }
      }
    },
  });
}

function strip(app) {
  const groups = storyGroups();
  if (!groups.length) return '';
  return html`
    <div class="strip" role="list" aria-label="최근 소식">
      ${groups.map((g) => {
        const m = app.memberOf(g.authorId);
        return html`
          <button class="story ${g.unseen ? 'unseen' : 'seen'}" role="listitem" data-story="${g.authorId}" aria-label="${m.displayName} 소식 보기">
            <span class="ring"><span class="avatar s57">${m.avatar}</span></span>
            <span class="nm">${g.authorId === app.user.id ? '내 소식' : m.displayName}</span>
          </button>`;
      })}
      ${app.api.canInvite ? html`
        <button class="story invite" data-feed="invite"><span class="ring"><span class="avatar s57">${icon('plus', { size: 26 })}</span></span><span class="nm">초대하기</span></button>` : ''}
    </div>`;
}

export function drawStrip(app) {
  const el = S.el?.querySelector('.family-strip');
  if (!el) return;
  el.innerHTML = String(html`${strip(app)}${milestoneCard(app)}`);
}

function emptyState(app) {
  return html`
    <div class="empty">
      <div class="empty-art">${icon('camera', { size: 40, stroke: 1.5 })}</div>
      <h2>아직 사진이 없어요</h2>
      <p>첫 사진을 올려서 가족에게 우리 아기 소식을 전해 보세요!</p>
      <button class="btn primary big" data-feed="compose">${icon('camera')} 사진 올리기</button>
      ${app.api.canInvite && app.members.length < 2 ? html`<button class="btn soft big" data-feed="invite">${icon('users')} 가족 초대하기</button>` : ''}
      ${app.api.mode === 'local' ? html`<p class="note">지금은 <b>체험 모드</b>예요. 사진은 이 기기에만 저장돼요.</p>` : ''}
    </div>`;
}

function build(app) {
  S.fid = app.fam.id;
  S.el = document.createElement('div');
  S.el.className = 'feed';
  S.el.innerHTML = String(html`
    <button class="new-pill" data-feed="refresh" hidden>${icon('back', { size: 18, cls: 'up' })} 새 사진이 올라왔어요</button>
    <section class="family-strip"></section>
    <div class="posts"></div>
    <div class="feed-end"></div>`);
  S.el.addEventListener('click', async (e) => {
    if (await handlePostClick(app, e)) return;
    const st = e.target.closest('[data-story]');
    if (st) return openStory(app, st.dataset.story);
    const a = e.target.closest('[data-feed]');
    if (!a) return;
    const act = a.dataset.feed;
    if (act === 'invite') openInvite(app);
    if (act === 'compose') app.compose();
    if (act === 'refresh') toTopAndRefresh(app);
    if (act === 'more') loadPage(app);
    if (act === 'ms-x') { save(msKey(app), true); drawStrip(app); }
  });
  if (S.posts.length) {
    S.posts.forEach((p) => app.postsById.set(p.id, p));
    appendCards(app, S.posts);
  }
  drawStrip(app);
  S.io = new IntersectionObserver((en) => { if (en[0].isIntersecting) loadPage(app); }, { rootMargin: '800px 0px' });
  S.io.observe(S.el.querySelector('.feed-end'));
  loadPage(app, true);
}

// 가족 이름·얼굴이 바뀌었을 때 카드 다시 그리기
export function redrawCards(app) {
  if (!S.el) return;
  const fresh = S.posts.map((p) => app.postsById.get(p.id) || p);
  for (const old of S.el.querySelectorAll('article.post')) old.remove();
  appendCards(app, fresh);
}

function appendCards(app, posts, { prepend = false } = {}) {
  const box = S.el.querySelector('.posts');
  const tmp = document.createElement('div');
  tmp.innerHTML = posts.map((p) => String(postCard(app, p, { coach: !prepend && p.id === S.posts[0]?.id }))).join('');
  const cards = [...tmp.children];
  if (prepend) box.prepend(...cards);
  else box.append(...cards);
  cards.forEach(bindCard);
  observeImages(box);
  placeDivider();
}

// '새 사진을 모두 봤어요' — 지난번에 본 뒤로 올라온 사진과 예전 사진 사이에
function placeDivider() {
  const box = S.el?.querySelector('.posts');
  if (!box) return;
  box.querySelector('.seen-divider')?.remove();
  if (!S.seenAt) return;
  const me = window.ssukApp?.user?.id;
  let last = -1;
  S.posts.forEach((p, i) => { if (p.createdAt > S.seenAt && p.authorId !== me) last = i; });
  if (last < 0 || last >= S.posts.length - 1) return;
  const card = box.querySelector(`article.post[data-id="${CSS.escape(S.posts[last].id)}"]`);
  if (!card) return;
  const d = document.createElement('div');
  d.className = 'seen-divider';
  d.innerHTML = String(html`<span class="seen-check">${icon('check', { size: 26, stroke: 2.5 })}</span>
    <b>새 사진을 모두 봤어요</b><small>지난 사진은 아래에 있어요</small>`);
  card.after(d);
}

function drawEnd(app) {
  const end = S.el?.querySelector('.feed-end');
  if (!end) return;
  if (S.loading && !S.posts.length) end.innerHTML = '<div class="spinner center"></div>';
  else if (!S.posts.length && S.done) end.innerHTML = String(emptyState(app));
  else if (S.done) end.innerHTML = String(html`<p class="end-note">처음 사진까지 다 봤어요 🌱</p>`);
  else end.innerHTML = String(html`<button class="btn ghost" data-feed="more">더 보기</button>`);
}

async function loadPage(app, fresh = false) {
  if (S.loading || (!fresh && S.done)) return;
  const fid = app.fam.id;
  S.loading = true;
  drawEnd(app);
  try {
    const before = fresh ? undefined : S.posts[S.posts.length - 1]?.createdAt;
    const page = await app.api.posts(fid, { before, limit: PAGE });
    if (S.fid !== fid) return;
    page.forEach((p) => app.postsById.set(p.id, p));
    if (fresh) {
      S.posts = page;
      S.el.querySelector('.posts').innerHTML = '';
    } else {
      S.posts.push(...page);
    }
    appendCards(app, page);
    S.done = page.length < PAGE;
    drawStrip(app);
    app.snapshot();
    newPostsHint(app);
  } catch (e) {
    toast(S.posts.length ? '인터넷이 연결되지 않아 저장해 둔 사진을 보여드려요.' : e.message);
    S.done = !S.posts.length;
  } finally {
    S.loading = false;
    drawEnd(app);
  }
}

export function render(app, view) {
  app.setTop(topBar(app));
  bindTop(app);
  if (S.seenAt === null) S.seenAt = load(`ssuk-seen-${app.fam.id}`, {})?.feed || '';
  if (!S.el || S.fid !== app.fam.id) build(app);
  else drawStrip(app);
  view.replaceChildren(S.el);
  requestAnimationFrame(() => window.scrollTo(0, S.scrollY));
  if (S.scrollY < 300) app.markSeen('feed');
}

export function leave() {
  S.scrollY = window.scrollY;
}

export function toTopAndRefresh(app) {
  window.scrollTo({ top: 0, behavior: 'smooth' });
  S.scrollY = 0;
  loadPage(app, true);
  app.checkNews();
  app.markSeen('feed');
}

export function newPostsHint(app) {
  const pill = S.el?.querySelector('.new-pill');
  if (!pill) return;
  const newest = S.posts[0]?.createdAt || '';
  const fresh = app.activity.filter((e) => e.type === 'post' && e.userId !== app.user.id && e.at > newest && !app.postsById.has(e.postId));
  pill.hidden = !fresh.length;
}

export function prepend(app, post) {
  if (!S.el || S.fid !== app.fam.id) return;
  S.posts.unshift(post);
  appendCards(app, [post], { prepend: true });
  drawStrip(app);
  drawEnd(app);
  app.snapshot();
}

export function remove(id) {
  S.posts = S.posts.filter((p) => p.id !== id);
  if (S.el) {
    S.el.querySelector(`article.post[data-id="${CSS.escape(id)}"]`)?.remove();
    placeDivider();
    drawStrip(window.ssukApp);
    drawEnd(window.ssukApp);
  }
}
