// 소식: 누가 사진을 올렸는지, 좋아요·댓글을 남겼는지, 새 가족이 들어왔는지

import { html, timeAgo, toDate, ymd, subj } from '../util.js';
import { icon } from '../icons.js';
import { observeImages, safePh } from '../media.js';

let viewEl = null;
const EMOJI_ONLY = /^(\p{Extended_Pictographic}️?){1,3}$/u;

function group(at) {
  const d = toDate(at);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((today - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
  if (diff <= 0) return '오늘';
  if (diff === 1) return '어제';
  if (diff < 7) return '이번 주';
  if (diff < 31) return '이번 달';
  return '이전';
}

const shortAgo = (at) => timeAgo(at).replace(/ 전$/, '');

// 같은 날 같은 사진에 누른 좋아요는 한 줄로
function aggregate(list) {
  const out = [];
  const likeRows = new Map();
  for (const e of list) {
    if (e.type !== 'like') { out.push(e); continue; }
    const key = `${e.postId}|${ymd(e.at)}`;
    const row = likeRows.get(key);
    if (row) { row.users.push(e.userId); continue; }
    const r = { ...e, users: [e.userId] };
    likeRows.set(key, r);
    out.push(r);
  }
  return out;
}

function avatars(app, e) {
  if (e.type === 'like' && e.users.length > 1) {
    return html`<span class="avatar-pair"><span class="avatar s32">${app.memberOf(e.users[0]).avatar}</span><span class="avatar s32">${app.memberOf(e.users[1]).avatar}</span></span>`;
  }
  return html`<span class="avatar s44">${app.memberOf(e.userId).avatar}</span>`;
}

function line(app, e) {
  const t = html` <time>${shortAgo(e.at)}</time>`;
  const name = app.nameOf(e.userId);
  const who = html`<b>${name}</b>${subj(name).slice(name.length)}`;
  if (e.type === 'join') return html`${who} 앨범에 들어왔어요 🎉${t}`;
  if (e.type === 'post') return html`${who} 사진${e.count > 1 ? ` ${e.count}장을` : '을'} 올렸어요.${t}`;
  if (e.type === 'like') {
    if (e.users.length === 1) return html`${who} 사진을 좋아해요.${t}`;
    const [a, b] = e.users.map((u) => app.nameOf(u));
    return e.users.length === 2
      ? html`<b>${a}</b>, <b>${b}</b>${subj(b).slice(b.length)} 사진을 좋아해요.${t}`
      : html`<b>${a}</b>, <b>${b}</b> 외 ${e.users.length - 2}명이 사진을 좋아해요.${t}`;
  }
  if (EMOJI_ONLY.test(e.body.trim())) return html`${who} ${e.body} 반응을 남겼어요.${t}`;
  return html`${who} 댓글을 남겼어요.${t}<span class="act-quote">${e.body}</span>`;
}

function draw(app) {
  if (!viewEl) return;
  const me = app.user.id;
  const monthAgo = Date.now() - 30 * 86400000;
  const joins = app.members
    .filter((m) => m.userId !== me && m.joinedAt && Date.parse(m.joinedAt) > monthAgo)
    .map((m) => ({ type: 'join', at: m.joinedAt, userId: m.userId }));
  const list = aggregate([...app.activity.filter((e) => e.userId !== me), ...joins].sort((a, b) => b.at.localeCompare(a.at)));
  if (!list.length) {
    viewEl.innerHTML = String(html`
      <div class="empty"><div class="empty-art">${icon('bell', { size: 40, stroke: 1.5 })}</div><h2>아직 새 소식이 없어요</h2>
      <p>가족이 사진을 올리거나 좋아요·댓글을 남기면 여기에서 알려 드려요.</p></div>`);
    return;
  }
  let last = '';
  viewEl.innerHTML = String(html`<div class="activity">${list.map((e) => {
    const g = group(e.at);
    const head = g !== last ? html`<h3 class="act-group">${g}</h3>` : '';
    last = g;
    const ph = e.post?.photos?.[0];
    const href = e.type === 'join' ? '#/family' : e.type === 'comment' ? `#/p/${e.postId}/c` : `#/p/${e.postId}`;
    const reply = e.type === 'comment' && !EMOJI_ONLY.test(e.body.trim());
    return html`${head}
      <a class="act-row" href="${href}">
        ${avatars(app, e)}
        <span class="act-text">${line(app, e)}${reply ? html`<span class="link-btn sm act-reply">답글 달기</span>` : ''}</span>
        ${ph ? html`<span class="act-thumb ph-box" style="${safePh(ph.ph) ? `background-image:url(${safePh(ph.ph)})` : ''}"><img data-path="${ph.thumb}" alt=""></span>` : ''}
      </a>`;
  })}</div>`);
  observeImages(viewEl);
}

export async function render(app, view) {
  app.setTop(html`<h1 class="top-title">새 소식</h1>`);
  document.getElementById('topbar').onclick = null;
  viewEl = view;
  window.scrollTo(0, 0);
  if (app.activity.length) draw(app);
  else view.innerHTML = '<div class="spinner center"></div>';
  await app.checkNews();
  draw(app);
}

export function update(app) { draw(app); }
export function leave() { viewEl = null; }
