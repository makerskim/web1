// 게시물 카드 (인스타그램 순서: 이름·아기 나이 → 사진 → ♡ 💬 저장 → 좋아요 → 글 → 댓글 → 시간)

import { html, raw, fmtDate, timeAgo, ymd, toDate, subj, av } from './util.js';
import { icon } from './icons.js';
import { menu, confirmBox, toast, sheet, copyText } from './ui.js';
import { observeImages, saveWithChoice, sharePhotos, safePh } from './media.js';
import { openComments } from './comments.js';
import { openViewer } from './viewer.js';

const clampRatio = (r) => Math.max(0.8, Math.min(1.91, r || 1));
const COACH_KEY = 'ssuk-coach-feed';
const coachDone = () => { try { return localStorage.getItem(COACH_KEY) === '1'; } catch { return true; } };
export function dismissCoach() {
  try { localStorage.setItem(COACH_KEY, '1'); } catch { /* 무시 */ }
  document.querySelectorAll('.coach').forEach((c) => c.remove());
}

// 좋아요 줄: "할머니가 좋아해요" / "할머니, 엄마가 좋아해요" / "할머니 외 3명이 좋아해요"
export function likesText(app, likes) {
  const names = likes.map((l) => app.nameOf(l.userId));
  if (!names.length) return '';
  if (names.length > 3) return html`<b>${names[0]}</b> 외 ${names.length - 1}명이 좋아해요`;
  const last = names[names.length - 1];
  const head = names.slice(0, -1).map((n) => html`<b>${n}</b>, `);
  return html`${head}<b>${last}</b>${subj(last).slice(last.length)} 좋아해요`;
}

const sameDay = (a, b) => ymd(a) === ymd(b);
const monthKey = (d) => ymd(d).slice(0, 7);

// 머리줄 둘째 줄: 사진 찍은 날 아기 나이 (+ 올린 날과 다르면 찍은 날짜)
function subtitle(app, post) {
  const age = app.ageAt(post.takenAt);
  const d = toDate(post.takenAt);
  const short = d.getFullYear() === new Date().getFullYear() ? `${d.getMonth() + 1}월 ${d.getDate()}일` : fmtDate(d, false);
  if (!age) return short;
  return sameDay(post.takenAt, post.createdAt) ? age : `${age} · ${short}`;
}

export function postCard(app, post, { full = false, coach = false } = {}) {
  const me = app.user.id;
  const liked = post.likes.some((l) => l.userId === me);
  const ratio = clampRatio(post.photos[0].w / post.photos[0].h);
  const n = post.photos.length;
  const shownComments = full ? post.comments : post.comments.slice(-2);
  const author = app.memberOf(post.authorId);
  const ring = app.hasUnseenStory?.(post.authorId);
  const likers = post.likes.slice(-3).map((l) => app.memberOf(l.userId).avatar);

  return html`
  <article class="post" data-id="${post.id}" data-author="${post.authorId}">
    <header class="post-head">
      ${ring
        ? html`<button class="avatar-ring" data-act="story" aria-label="${author.displayName} 새 소식 보기">${av(author.avatar, 's36')}</button>`
        : html`${av(author.avatar, 's36')}`}
      <div class="who">
        <b>${author.displayName}</b>
        <button class="sub" data-act="month" data-month="${monthKey(post.takenAt)}">${subtitle(app, post)}</button>
      </div>
      <button class="icon-btn" data-act="more" aria-label="더 보기">${icon('more')}</button>
    </header>
    <div class="media" style="aspect-ratio:${ratio}">
      <div class="track" data-act="media">
        ${post.photos.map((p, i) => html`
          <div class="slide ph-box" style="${safePh(p.ph) ? raw(`background-image:url(${safePh(p.ph)})`) : ''}">
            <img data-path="${p.path}" alt="${subj(author.displayName)} 올린 사진 ${i + 1}/${n}, ${fmtDate(post.takenAt)}" draggable="false">
          </div>`)}
      </div>
      ${n > 1 ? html`
        <span class="count" aria-hidden="true">1/${n}</span>
        <button class="nav-arrow prev" data-act="prev" aria-label="이전 사진" hidden><i>${icon('back', { size: 18, stroke: 2.4 })}</i></button>
        <button class="nav-arrow next" data-act="next" aria-label="다음 사진"><i>${icon('right', { size: 18, stroke: 2.4 })}</i></button>
        <span class="visually-hidden" aria-live="polite" data-live></span>` : ''}
      <div class="burst">${icon('heart', { size: 96, fill: 'currentColor', stroke: 0 })}</div>
    </div>
    <div class="actions">
      <button class="act like ${liked ? 'on' : ''}" data-act="like" aria-pressed="${liked}" aria-label="좋아요${post.likes.length ? `, ${post.likes.length}명` : ''}">
        ${icon('heart', { size: 28, stroke: 1.9, fill: liked ? 'currentColor' : 'none' })}${post.likes.length ? html`<span class="n">${post.likes.length}</span>` : ''}<span class="lbl">좋아요</span>
      </button>
      <button class="act" data-act="comments" aria-label="댓글${post.comments.length ? ` ${post.comments.length}개` : ''} 보기">
        ${icon('comment', { size: 27, stroke: 1.9 })}${post.comments.length ? html`<span class="n">${post.comments.length}</span>` : ''}<span class="lbl">댓글</span>
      </button>
      ${n > 1 ? html`<div class="dots" aria-hidden="true">${post.photos.map((_, i) => html`<i class="${i === 0 ? 'on' : ''}"></i>`)}</div>` : ''}
      <button class="act save" data-act="save" aria-label="휴대폰에 저장">${icon('download', { size: 26, stroke: 1.9 })}<span>저장</span></button>
    </div>
    ${coach && !coachDone() ? html`
      <div class="coach"><p>❤️ 누르면 좋아요 · 💬 누르면 댓글 · 사진을 누르면 크게 보여요</p><button class="link-btn" data-act="coach">알겠어요</button></div>` : ''}
    <div class="post-body">
      ${post.likes.length ? html`
        <button class="likes-line" data-act="likers"><span class="lk-avs">${likers.map((a) => av(a, 's22'))}</span><span>${likesText(app, post.likes)}</span></button>` : ''}
      ${post.caption ? html`<div class="cap-wrap"><p class="caption ${full ? 'open' : ''}"><b>${author.displayName}</b> ${post.caption}</p><button class="more-btn" data-act="caption" hidden>더 보기</button></div>` : ''}
      ${!full && post.comments.length > 2 ? html`<button class="link-btn muted" data-act="comments">댓글 ${post.comments.length}개 모두 보기</button>` : ''}
      ${shownComments.length ? html`<div class="cmts">${shownComments.map((c) => html`<p><b>${app.nameOf(c.authorId)}</b> ${c.body}</p>`)}</div>` : ''}
      <time class="post-time" datetime="${post.createdAt}">${timeAgo(post.createdAt)}</time>
      <button class="fake-input" data-act="comments">${av(app.me.avatar, 's28')}댓글 달기…</button>
    </div>
  </article>`;
}

// 화면에 있는 같은 게시물 카드를 모두 새로 그리기
export function refreshCard(app, post) {
  app.postsById.set(post.id, post);
  // 홈 화면이 잠시 숨어 있어도(다른 탭에 있을 때) 그 카드까지 함께 고쳐요
  const roots = [document, ...(app.extraRoots?.() || [])];
  const cards = new Set(roots.flatMap((r) => [...r.querySelectorAll(`article.post[data-id="${CSS.escape(post.id)}"]`)]));
  for (const old of cards) {
    const idx = slideIndex(old);
    const full = old.classList.contains('full');
    const coach = !!old.querySelector('.coach');
    const capOpen = !!old.querySelector('.caption.open');
    const bursting = !!old.querySelector('.burst.go');
    const tmp = document.createElement('div');
    tmp.innerHTML = String(postCard(app, post, { full, coach }));
    const card = tmp.firstElementChild;
    if (full) card.classList.add('full');
    // 펼쳐 둔 글, 막 시작한 하트 애니메이션은 새 카드에서도 그대로
    if (capOpen) card.querySelector('.caption')?.classList.add('open');
    old.replaceWith(card);
    if (bursting) burst(card);
    bindCard(card);
    observeImages(card);
    if (idx) goSlide(card, idx, false);
  }
}

function slideIndex(card) {
  const t = card.querySelector('.track');
  return t ? Math.round(t.scrollLeft / Math.max(1, t.clientWidth)) : 0;
}

export function goSlide(card, i, smooth = true) {
  const t = card.querySelector('.track');
  t.scrollTo({ left: i * t.clientWidth, behavior: smooth ? 'smooth' : 'auto' });
}

// 사진 몇 번째인지 숫자는 넘길 때만 잠깐 보여요
const countIO = 'IntersectionObserver' in window ? new IntersectionObserver((en) => {
  for (const e of en) {
    if (!e.isIntersecting) continue;
    countIO.unobserve(e.target);
    flashCount(e.target, 3000);
  }
}, { threshold: 0.5 }) : null;

function flashCount(card, ms) {
  const c = card.querySelector('.count');
  if (!c) return;
  c.classList.add('show');
  clearTimeout(c._t);
  c._t = setTimeout(() => c.classList.remove('show'), ms);
}

// 글이 두 줄을 넘으면 '더 보기' 버튼 보이기. 화면에 붙어 있는 카드만 잴 수 있어요
// (숨어 있는 홈 화면의 카드는 홈으로 돌아올 때 다시 재요)
export function measureCaption(card) {
  const cap = card.querySelector('.caption:not(.open)');
  const btn = card.querySelector('.more-btn');
  if (!cap || !btn || !card.isConnected) return;
  btn.hidden = !(cap.scrollHeight > cap.clientHeight + 1);
}

// 카드를 화면에 넣은 뒤: 사진 넘기기 표시, '더 보기' 버튼
export function bindCard(card) {
  if (card.querySelector('.caption:not(.open)')) requestAnimationFrame(() => measureCaption(card));
  const t = card.querySelector('.track');
  if (!t || t.children.length < 2) return;
  const n = t.children.length;
  const count = card.querySelector('.count');
  const dots = [...card.querySelectorAll('.dots i')];
  const live = card.querySelector('[data-live]');
  const prev = card.querySelector('.nav-arrow.prev');
  const next = card.querySelector('.nav-arrow.next');
  let last = 0;
  const update = () => {
    const i = slideIndex(card);
    count.textContent = `${i + 1}/${n}`;
    prev.hidden = i === 0;
    next.hidden = i === n - 1;
    // 사진이 6장 이상이면 점은 5개만 (가장자리는 작게)
    const start = Math.max(0, Math.min(n - 5, i - 2));
    dots.forEach((d, k) => {
      d.classList.toggle('on', k === i);
      d.hidden = n > 5 && (k < start || k > start + 4);
      d.classList.toggle('edge', n > 5 && ((k === start && start > 0) || (k === start + 4 && start + 4 < n - 1)));
    });
    if (i !== last) {
      last = i;
      if (live) live.textContent = `사진 ${i + 1}/${n}`;
      flashCount(card, 2500);
    }
  };
  t.addEventListener('scroll', update, { passive: true });
  update();
  countIO?.observe(card);
}

// 카드 안의 버튼 처리 (홈, 게시물 화면 공통) — 처리했으면 true
let lastTap = 0;
let tapTimer = null;

export async function handlePostClick(app, e, { onDeleted } = {}) {
  const actEl = e.target.closest('[data-act]');
  const card = e.target.closest('article.post');
  if (!actEl || !card) return false;
  const post = app.postsById.get(card.dataset.id);
  if (!post) return false;
  const act = actEl.dataset.act;

  if (act === 'prev' || act === 'next') {
    goSlide(card, slideIndex(card) + (act === 'next' ? 1 : -1));
    return true;
  }
  if (act === 'media') {
    const now = Date.now();
    if (now - lastTap < 320) {
      clearTimeout(tapTimer);
      lastTap = 0;
      burst(card);
      if (!post.likes.some((l) => l.userId === app.user.id)) await toggleLike(app, post, true);
    } else {
      lastTap = now;
      const idx = slideIndex(card);
      tapTimer = setTimeout(() => { dismissCoach(); openViewer(app, viewerItems(app, [post]), idx); }, 320);
    }
    return true;
  }
  if (act === 'like') {
    const on = !post.likes.some((l) => l.userId === app.user.id);
    if (on) burst(card);
    await toggleLike(app, post, on);
    return true;
  }
  if (act === 'comments') { openComments(app, post); return true; }
  if (act === 'save') { saveWithChoice(post.photos, post.takenAt); return true; }
  if (act === 'caption') {
    card.querySelector('.caption')?.classList.add('open');
    actEl.hidden = true;
    return true;
  }
  if (act === 'likers') { openLikers(app, post); return true; }
  if (act === 'month') { app.go(`#/grid/${actEl.dataset.month}`); return true; }
  if (act === 'story') { app.openStory?.(post.authorId); return true; }
  if (act === 'coach') { dismissCoach(); return true; }
  if (act === 'more') { await moreMenu(app, post, onDeleted); return true; }
  return false;
}

function burst(card) {
  const b = card.querySelector('.burst');
  if (!b) return;
  b.classList.remove('go');
  void b.offsetWidth;
  b.classList.add('go');
  b.addEventListener('animationend', () => b.classList.remove('go'), { once: true });
}

export async function toggleLike(app, post, on) {
  const me = app.user.id;
  const before = post.likes;
  post.likes = on ? [...before.filter((l) => l.userId !== me), { userId: me, createdAt: new Date().toISOString() }]
    : before.filter((l) => l.userId !== me);
  if (on) dismissCoach();
  refreshCard(app, post);
  try {
    await app.api.like(post, on);
  } catch (err) {
    post.likes = before;
    refreshCard(app, post);
    toast(err.message);
  }
}

export function viewerItems(app, posts) {
  return posts.flatMap((p) => p.photos.map((ph, i) => ({
    path: ph.path, ph: ph.ph, w: ph.w, h: ph.h, orig: ph.orig, origName: ph.origName, dec: ph.dec,
    postId: p.id, authorId: p.authorId, createdAt: p.createdAt, index: i, count: p.photos.length, takenAt: p.takenAt,
  })));
}

function openLikers(app, post) {
  sheet({
    title: '좋아한 가족',
    body: html`<ul class="people">${post.likes.map((l) => {
      const m = app.memberOf(l.userId);
      return html`<li>${av(m.avatar, 's44')}<b>${m.displayName}</b><small>${timeAgo(l.createdAt)}</small></li>`;
    })}</ul>`,
  });
}

async function moreMenu(app, post, onDeleted) {
  const mine = post.authorId === app.user.id;
  const items = [];
  if (mine) items.push({ label: '글·날짜 고치기', icon: 'edit', value: 'edit' });
  if (mine || app.isOwner) items.push({ label: '게시물 지우기', icon: 'trash', value: 'delete', danger: true });
  const v = await menu(items, {
    quick: [
      { label: '저장', icon: 'download', value: 'save' },
      { label: '보내기', icon: 'send', value: 'share' },
      { label: '링크 복사', icon: 'link', value: 'link' },
    ],
  });
  if (v === 'save') saveWithChoice(post.photos, post.takenAt);
  if (v === 'share') {
    const who = app.memberOf(post.authorId).displayName;
    sharePhotos(post.photos, `${post.caption ? `${post.caption}\n` : ''}— ${app.fam.name} · ${who} (${fmtDate(post.takenAt, false)})`);
  }
  if (v === 'link') {
    const ok = await copyText(`${location.origin}${location.pathname}#/p/${post.id}`);
    toast(ok ? '링크를 복사했어요. 가족만 열 수 있어요.' : '복사하지 못했어요.');
  }
  if (v === 'edit') editPost(app, post);
  if (v === 'delete') {
    const ok = await confirmBox({
      title: '이 게시물을 지울까요?', message: '가족 모두의 화면에서 사라지고, 되돌릴 수 없어요.', ok: '지우기', danger: true,
    });
    if (!ok) return;
    try {
      await app.api.deletePost(post);
      app.postsById.delete(post.id);
      [document, ...(app.extraRoots?.() || [])].forEach((r) => r.querySelectorAll(`article.post[data-id="${CSS.escape(post.id)}"]`).forEach((c) => c.remove()));
      app.removePost(post.id);
      toast('지웠어요.');
      onDeleted?.();
    } catch (err) {
      toast(err.message);
    }
  }
}

function editPost(app, post) {
  sheet({
    title: '글·날짜 고치기',
    body: html`
      <label class="field"><span>사진 이야기</span>
        <textarea rows="4" maxlength="2000" data-f="caption">${post.caption}</textarea></label>
      <label class="field"><span>찍은 날</span>
        <input type="date" data-f="date" value="${ymd(post.takenAt)}" max="${ymd(new Date())}"></label>
      <button class="btn primary big block" data-save>저장하기</button>`,
    mount: (el, ctl) => {
      el.querySelector('[data-save]').addEventListener('click', async () => {
        const caption = el.querySelector('[data-f=caption]').value.trim();
        const d = el.querySelector('[data-f=date]').value;
        const old = toDate(post.takenAt);
        let takenAt;
        if (d && d !== ymd(old)) {
          const nd = toDate(d);
          nd.setHours(old.getHours(), old.getMinutes());
          takenAt = nd.toISOString();
        }
        try {
          const updated = await app.api.updatePost(post, { caption, takenAt });
          refreshCard(app, { ...post, ...updated, likes: post.likes, comments: post.comments });
          ctl.close();
          toast('고쳤어요.');
        } catch (err) {
          toast(err.message);
        }
      });
    },
  });
}
