// 게시물 카드 (인스타그램처럼: 사진 넘기기, 두 번 톡톡 좋아요, 댓글, 저장)

import { html, raw, fmtDate, timeAgo, ymd, toDate } from './util.js';
import { icon } from './icons.js';
import { menu, confirmBox, toast, sheet } from './ui.js';
import { observeImages, savePhotos, safePh } from './media.js';
import { openComments } from './comments.js';
import { openViewer } from './viewer.js';

const clampRatio = (r) => Math.max(0.66, Math.min(1.91, r || 1));

export function likesLine(app, post) {
  const names = post.likes.map((l) => app.nameOf(l.userId));
  if (!names.length) return '';
  const shown = names.slice(0, 3).join(', ');
  return names.length > 3 ? `${shown} 외 ${names.length - 3}명이 좋아해요` : `${shown}님이 좋아해요`;
}

export function postCard(app, post, { full = false } = {}) {
  const liked = post.likes.some((l) => l.userId === app.user.id);
  const ratio = clampRatio(post.photos[0].w / post.photos[0].h);
  const multi = post.photos.length > 1;
  const age = app.ageAt(post.takenAt);
  const shownComments = full ? post.comments : post.comments.slice(-2);
  const author = app.memberOf(post.authorId);

  return html`
  <article class="post" data-id="${post.id}">
    <header class="post-head">
      <span class="avatar">${author.avatar}</span>
      <div class="who"><b>${author.displayName}</b><span>${timeAgo(post.createdAt)}</span></div>
      <button class="icon-btn" data-act="more" aria-label="더 보기">${icon('more')}</button>
    </header>
    <div class="media" style="aspect-ratio:${ratio}">
      <div class="track" data-act="media">
        ${post.photos.map((p, i) => html`
          <div class="slide ph-box" style="${safePh(p.ph) ? raw(`background-image:url(${safePh(p.ph)})`) : ''}">
            <img data-path="${p.path}" alt="${i + 1}번째 사진" draggable="false">
          </div>`)}
      </div>
      ${multi ? html`<span class="count">1/${post.photos.length}</span>
        <div class="dots">${post.photos.map((_, i) => html`<i class="${i === 0 ? 'on' : ''}"></i>`)}</div>` : ''}
      <div class="burst">${icon('heart', { size: 96, fill: 'currentColor', stroke: 0 })}</div>
    </div>
    <div class="actions">
      <button class="act like ${liked ? 'on' : ''}" data-act="like" aria-pressed="${liked}">
        ${icon('heart', { size: 28, fill: liked ? 'currentColor' : 'none' })}<span>좋아요${post.likes.length ? ` ${post.likes.length}` : ''}</span>
      </button>
      <button class="act" data-act="comments">${icon('comment', { size: 27 })}<span>댓글${post.comments.length ? ` ${post.comments.length}` : ''}</span></button>
      <button class="act" data-act="save">${icon('download', { size: 27 })}<span>저장</span></button>
    </div>
    <div class="post-body">
      ${age ? html`<p class="age-line"><span class="age-chip">${age}</span><span class="date">${fmtDate(post.takenAt)}</span></p>`
        : html`<p class="age-line"><span class="date">${fmtDate(post.takenAt)}</span></p>`}
      ${post.likes.length ? html`<p class="likes-line">${icon('heart', { size: 16, fill: 'currentColor', stroke: 0 })} ${likesLine(app, post)}</p>` : ''}
      ${post.caption ? html`<p class="caption ${full ? 'open' : ''}" data-act="caption"><b>${author.displayName}</b> ${post.caption}</p>` : ''}
      ${!full && post.comments.length > 2 ? html`<button class="link-btn" data-act="comments">댓글 ${post.comments.length}개 모두 보기</button>` : ''}
      <div class="cmts">${shownComments.map((c) => html`<p><b>${app.nameOf(c.authorId)}</b> ${c.body}</p>`)}</div>
      <button class="fake-input" data-act="comments"><span class="avatar xs">${app.me.avatar}</span>댓글 달기…</button>
    </div>
  </article>`;
}

// 화면에 있는 같은 게시물 카드를 모두 새로 그리기
export function refreshCard(app, post) {
  app.postsById.set(post.id, post);
  for (const old of document.querySelectorAll(`article.post[data-id="${CSS.escape(post.id)}"]`)) {
    const idx = slideIndex(old);
    const full = old.classList.contains('full');
    const tmp = document.createElement('div');
    tmp.innerHTML = String(postCard(app, post, { full }));
    const card = tmp.firstElementChild;
    if (full) card.classList.add('full');
    old.replaceWith(card);
    bindCarousel(card);
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

export function bindCarousel(card) {
  const t = card.querySelector('.track');
  if (!t || t.children.length < 2) return;
  const count = card.querySelector('.count');
  const dots = card.querySelectorAll('.dots i');
  t.addEventListener('scroll', () => {
    const i = slideIndex(card);
    if (count) count.textContent = `${i + 1}/${t.children.length}`;
    dots.forEach((d, k) => d.classList.toggle('on', k === i));
  }, { passive: true });
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
      tapTimer = setTimeout(() => openViewer(app, viewerItems(app, [post]), idx), 320);
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
  if (act === 'save') { savePhotos(post.photos, post.takenAt); return true; }
  if (act === 'caption') { actEl.classList.toggle('open'); return true; }
  if (act === 'more') { await moreMenu(app, post, onDeleted); return true; }
  return false;
}

function burst(card) {
  const b = card.querySelector('.burst');
  b.classList.remove('go');
  void b.offsetWidth;
  b.classList.add('go');
}

async function toggleLike(app, post, on) {
  const me = app.user.id;
  const before = post.likes;
  post.likes = on ? [...before.filter((l) => l.userId !== me), { userId: me, createdAt: new Date().toISOString() }]
    : before.filter((l) => l.userId !== me);
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
    path: ph.path, ph: ph.ph, w: ph.w, h: ph.h, postId: p.id, index: i, takenAt: p.takenAt,
  })));
}

async function moreMenu(app, post, onDeleted) {
  const mine = post.authorId === app.user.id;
  const items = [{ label: `사진 ${post.photos.length > 1 ? `${post.photos.length}장 ` : ''}휴대폰에 저장`, icon: 'download', value: 'save' }];
  if (mine) items.push({ label: '글·날짜 고치기', icon: 'edit', value: 'edit' });
  if (mine || app.isOwner) items.push({ label: '게시물 지우기', icon: 'trash', value: 'delete', danger: true });
  const v = await menu(items);
  if (v === 'save') savePhotos(post.photos, post.takenAt);
  if (v === 'edit') editPost(app, post);
  if (v === 'delete') {
    const ok = await confirmBox({
      title: '이 게시물을 지울까요?', message: '가족 모두의 화면에서 사라지고, 되돌릴 수 없어요.', ok: '지우기', danger: true,
    });
    if (!ok) return;
    try {
      await app.api.deletePost(post);
      app.postsById.delete(post.id);
      document.querySelectorAll(`article.post[data-id="${CSS.escape(post.id)}"]`).forEach((c) => c.remove());
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
      <button class="btn primary block" data-save>저장하기</button>`,
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
