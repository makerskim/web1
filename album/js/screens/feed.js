// 홈: 가족 사진 소식 (인스타그램 피드처럼)

import { html, babyAge, babyDay, babyMilestone } from '../util.js';
import { icon } from '../icons.js';
import { toast } from '../ui.js';
import { postCard, bindCarousel, handlePostClick } from '../postcard.js';
import { observeImages } from '../media.js';
import { openInvite, openAlbumSwitcher } from './family.js';

const PAGE = 8;
const S = { el: null, fid: null, posts: [], done: false, loading: false, scrollY: 0, io: null };

export function reset(snapPosts) {
  S.io?.disconnect();
  S.el = null;
  S.fid = null;
  S.posts = snapPosts || [];
  S.done = false;
  S.scrollY = 0;
}

export const firstPosts = (n) => S.posts.slice(0, n);

// 받침이 있으면 '하준이', 없으면 '서아'
export function callName(name) {
  const c = name.charCodeAt(name.length - 1);
  return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 ? `${name}이` : name;
}

export function topBar(app) {
  const b = app.fam.babyBirthday;
  return html`
    <button class="album-title" data-top="albums" aria-label="앨범 바꾸기">
      <span class="logo-sm">🌱</span><b>${app.fam.name}</b>${icon('down', { size: 18 })}
    </button>
    ${b ? html`<span class="age-pill">${babyAge(b, new Date(), { short: true })}</span>` : ''}`;
}

export function bindTop(app) {
  document.getElementById('topbar').onclick = (e) => {
    if (e.target.closest('[data-top=albums]')) openAlbumSwitcher(app);
  };
}

function todayLine(app) {
  const { babyName, babyBirthday } = app.fam;
  if (!babyName || !babyBirthday) return '';
  const day = babyDay(babyBirthday);
  const nm = callName(babyName);
  if (day < 1) return html`<p class="today-line">${nm}를 만나기까지 <b>D-${1 - day}</b> 💕</p>`;
  const ms = babyMilestone(babyBirthday);
  return html`<p class="today-line">${ms ? html`<b>${ms}</b> 축하해요! ` : ''}오늘은 ${nm}가 태어난 지 <b>${day}일</b>째 🌱</p>`;
}

function strip(app) {
  if (!app.members.length && !app.api.canInvite) return todayLine(app);
  return html`
    ${todayLine(app)}
    <div class="strip" role="list" aria-label="우리 가족">
      ${app.members.map((m) => html`
        <a class="story" role="listitem" href="#/family"><span class="ring"><span class="avatar lg">${m.avatar}</span></span><span class="nm">${m.displayName}</span></a>`)}
      ${app.api.canInvite ? html`
        <button class="story" data-feed="invite"><span class="ring add">${icon('plus', { size: 26 })}</span><span class="nm">초대하기</span></button>` : ''}
    </div>`;
}

function emptyState(app) {
  return html`
    <div class="empty">
      <div class="empty-art">📷</div>
      <h2>아직 사진이 없어요</h2>
      <p>첫 사진을 올려서 가족에게<br>우리 아기 소식을 전해 보세요!</p>
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
    const a = e.target.closest('[data-feed]');
    if (!a) return;
    const act = a.dataset.feed;
    if (act === 'invite') openInvite(app);
    if (act === 'compose') app.compose();
    if (act === 'refresh') toTopAndRefresh(app);
    if (act === 'more') loadPage(app);
  });
  drawStrip(app);
  if (S.posts.length) {
    S.posts.forEach((p) => app.postsById.set(p.id, p));
    appendCards(app, S.posts);
  }
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

export function drawStrip(app) {
  const el = S.el?.querySelector('.family-strip');
  if (el) el.innerHTML = String(strip(app));
}

function appendCards(app, posts, { prepend = false } = {}) {
  const box = S.el.querySelector('.posts');
  const tmp = document.createElement('div');
  tmp.innerHTML = posts.map((p) => String(postCard(app, p))).join('');
  const cards = [...tmp.children];
  if (prepend) box.prepend(...cards);
  else box.append(...cards);
  cards.forEach(bindCarousel);
  observeImages(box);
}

function drawEnd(app) {
  const end = S.el?.querySelector('.feed-end');
  if (!end) return;
  if (S.loading && !S.posts.length) end.innerHTML = '<div class="spinner center"></div>';
  else if (!S.posts.length && S.done) end.innerHTML = String(emptyState(app));
  else if (S.done) end.innerHTML = String(html`<p class="end-note">🌱 처음 사진까지 다 봤어요</p>`);
  else end.innerHTML = String(html`<button class="btn soft" data-feed="more">더 보기</button>`);
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
  drawEnd(app);
  app.snapshot();
}

export function remove(id) {
  S.posts = S.posts.filter((p) => p.id !== id);
  if (S.el) {
    S.el.querySelector(`article.post[data-id="${CSS.escape(id)}"]`)?.remove();
    drawEnd(window.ssukApp);
  }
}
