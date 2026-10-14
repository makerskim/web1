// 댓글 창: 누르기만 하면 바로 남겨지는 '빠른 댓글'로 어르신도 쉽게

import { html, timeAgo } from './util.js';
import { icon } from './icons.js';
import { sheet, toast, confirmBox } from './ui.js';
import { refreshCard } from './postcard.js';

export const QUICK_REPLIES = ['😍 너무 예뻐요', '🥰 보고 싶다', '👏 많이 컸네!', '💕 사랑해', '😆 귀여워라', '🙏 건강하게 자라렴'];

export function openComments(app, post) {
  const listHTML = () => post.comments.length
    ? html`${post.comments.map((c) => html`
        <div class="cmt" data-id="${c.id}">
          <span class="avatar sm">${app.memberOf(c.authorId).avatar}</span>
          <div class="cmt-main">
            <p><b>${app.nameOf(c.authorId)}</b> ${c.body}</p>
            <span class="cmt-meta">${timeAgo(c.createdAt)}
              ${c.authorId === app.user.id || app.isOwner ? html`<button class="link-btn sm" data-del="${c.id}">지우기</button>` : ''}</span>
          </div>
        </div>`)}`
    : html`<p class="empty-note">아직 댓글이 없어요.<br>첫 댓글을 남겨 주세요 💌</p>`;

  sheet({
    title: `댓글 ${post.comments.length ? post.comments.length + '개' : ''}`,
    cls: 'comments-sheet',
    body: html`
      <div class="cmt-list">${listHTML()}</div>
      <div class="quick" aria-label="빠른 댓글">
        ${QUICK_REPLIES.map((q) => html`<button class="chip" data-quick="${q}">${q}</button>`)}
      </div>
      <form class="cmt-form">
        <span class="avatar sm">${app.me.avatar}</span>
        <input type="text" maxlength="1000" placeholder="댓글을 입력하세요" enterkeyhint="send" aria-label="댓글 입력">
        <button type="submit" class="send-btn" aria-label="댓글 올리기">${icon('send', { size: 22 })}</button>
      </form>`,
    mount: (el) => {
      const list = el.querySelector('.cmt-list');
      const input = el.querySelector('input');
      const title = el.querySelector('.sheet-head h2');
      const redraw = () => {
        list.innerHTML = String(listHTML());
        list.scrollTop = list.scrollHeight;
        title.textContent = `댓글 ${post.comments.length ? post.comments.length + '개' : ''}`;
        refreshCard(app, post);
      };
      list.scrollTop = list.scrollHeight;

      let busy = false;
      const send = async (body) => {
        body = body.trim();
        if (!body || busy) return;
        busy = true;
        try {
          const c = await app.api.addComment(post, body);
          post.comments = [...post.comments, c];
          input.value = '';
          redraw();
        } catch (err) {
          toast(err.message);
        } finally {
          busy = false;
        }
      };

      el.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); send(input.value); });
      el.addEventListener('click', async (e) => {
        const q = e.target.closest('[data-quick]');
        if (q) return send(q.dataset.quick);
        const d = e.target.closest('[data-del]');
        if (d) {
          const c = post.comments.find((x) => x.id === d.dataset.del);
          if (!c || !(await confirmBox({ message: '이 댓글을 지울까요?', ok: '지우기', danger: true }))) return;
          try {
            await app.api.deleteComment(c);
            post.comments = post.comments.filter((x) => x.id !== c.id);
            redraw();
          } catch (err) {
            toast(err.message);
          }
        }
      });
    },
  });
}
