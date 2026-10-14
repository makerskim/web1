// 소식: 누가 사진을 올렸는지, 누가 좋아요·댓글을 남겼는지

import { html, timeAgo, toDate } from '../util.js';
import { observeImages, safePh } from '../media.js';

let viewEl = null;

function group(at) {
  const d = toDate(at);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = (today - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000;
  if (diff <= 0) return '오늘';
  if (diff === 1) return '어제';
  if (diff < 7) return '이번 주';
  return '지난 소식';
}

function line(app, e) {
  const who = html`<b>${app.nameOf(e.userId)}</b>`;
  if (e.type === 'post') return html`${who}님이 사진 ${e.count > 1 ? `${e.count}장을` : '을'} 올렸어요 📷`;
  if (e.type === 'like') return html`${who}님이 사진을 좋아해요 ❤️`;
  return html`${who}님이 댓글을 남겼어요: <q>${e.body}</q>`;
}

function draw(app) {
  if (!viewEl) return;
  const list = app.activity.filter((e) => e.userId !== app.user.id);
  if (!list.length) {
    viewEl.innerHTML = String(html`
      <div class="empty"><div class="empty-art">🔔</div><h2>아직 새 소식이 없어요</h2>
      <p>가족이 사진을 올리거나 좋아요·댓글을 남기면<br>여기에서 알려 드려요.</p></div>`);
    return;
  }
  let last = '';
  viewEl.innerHTML = String(html`<div class="activity">${list.map((e) => {
    const g = group(e.at);
    const head = g !== last ? html`<h3 class="act-group">${g}</h3>` : '';
    last = g;
    const ph = e.post?.photos?.[0];
    return html`${head}
      <a class="act-row" href="#/p/${e.postId}">
        <span class="avatar">${app.memberOf(e.userId).avatar}</span>
        <span class="act-text">${line(app, e)}<small>${timeAgo(e.at)}</small></span>
        ${ph ? html`<span class="act-thumb ph-box" style="${safePh(ph.ph) ? `background-image:url(${safePh(ph.ph)})` : ''}"><img data-path="${ph.thumb}" alt=""></span>` : ''}
      </a>`;
  })}</div>`);
  observeImages(viewEl);
}

export async function render(app, view) {
  app.setTop(html`<h1 class="top-title">새 소식</h1>`);
  document.getElementById('topbar').onclick = null;
  viewEl = view;
  if (app.activity.length) draw(app);
  else view.innerHTML = '<div class="spinner center"></div>';
  await app.checkNews();
  draw(app);
}

export function update(app) { draw(app); }
export function leave() { viewEl = null; }
