// 게시물 하나 크게 보기 (소식·모아보기에서 들어옴). 주소 끝이 /c 이면 댓글 창까지 열어요.

import { html } from '../util.js';
import { icon } from '../icons.js';
import { postCard, bindCard, handlePostClick } from '../postcard.js';
import { observeImages } from '../media.js';
import { openComments } from '../comments.js';

export async function render(app, view, id, extra) {
  app.setTop(html`
    <button class="icon-btn" data-top="back" aria-label="뒤로">${icon('back', { size: 28 })}</button>
    <h1 class="top-title">사진</h1>`);
  document.getElementById('topbar').onclick = (e) => {
    if (e.target.closest('[data-top=back]')) {
      if (history.length > 1) history.back();
      else app.go('#/home');
    }
  };
  let post = app.postsById.get(id);
  if (!post) view.innerHTML = '<div class="spinner center"></div>';
  try {
    const fresh = await app.api.post(id);
    if (fresh) post = fresh;
  } catch { /* 저장된 것 사용 */ }
  if (!post) {
    view.innerHTML = String(html`<div class="empty"><div class="empty-art">${icon('image', { size: 40, stroke: 1.5 })}</div><h2>지워진 사진이에요</h2>
      <button class="btn ghost" onclick="location.hash='#/home'">홈으로</button></div>`);
    return;
  }
  app.postsById.set(post.id, post);
  view.innerHTML = String(html`<div class="post-page">${postCard(app, post, { full: true })}</div>`);
  const card = view.querySelector('article.post');
  card.classList.add('full');
  bindCard(card);
  observeImages(view);
  window.scrollTo(0, 0);
  view.onclick = (e) => handlePostClick(app, e, { onDeleted: () => app.go('#/home') });
  if (extra === 'c') openComments(app, post);
}

export function leave() {
  document.getElementById('view').onclick = null;
}
