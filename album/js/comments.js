// 댓글 창: 누르기만 하면 바로 남겨지는 '빠른 댓글'로 어르신도 쉽게, 실수하면 '되돌리기'

import { html, timeAgo } from './util.js';
import { sheet, toast, confirmBox } from './ui.js';
import { refreshCard } from './postcard.js';

export const QUICK_REPLIES = ['😍 너무 예뻐요', '🥰 보고 싶다', '👏 많이 컸네!', '💕 사랑해', '😆 귀여워라', '🙏 건강하게 자라렴'];
const EMOJIS = ['❤️', '😍', '🥰', '👏', '😂', '😮', '🙏', '💕'];

export function openComments(app, post, { onClose } = {}) {
  const author = app.memberOf(post.authorId);
  const canDel = (c) => c.authorId === app.user.id || app.isOwner;
  const listHTML = () => html`
    ${post.caption ? html`
      <div class="cmt cap">
        <span class="avatar s32">${author.avatar}</span>
        <div class="cmt-main"><p class="cmt-b"><b>${author.displayName}</b> ${post.caption}</p><time>${timeAgo(post.createdAt)}</time></div>
      </div>` : ''}
    ${post.comments.length
      ? post.comments.map((c) => html`
        <div class="cmt" data-id="${c.id}">
          <span class="avatar s32">${app.memberOf(c.authorId).avatar}</span>
          <div class="cmt-main">
            <p class="cmt-h"><b>${app.nameOf(c.authorId)}</b> <time>${timeAgo(c.createdAt)}</time></p>
            <p class="cmt-b">${c.body}</p>
            ${canDel(c) ? html`<button class="link-btn sm" data-del="${c.id}">지우기</button>` : ''}
          </div>
        </div>`)
      : html`<p class="empty-note">아직 댓글이 없어요. 첫 댓글을 남겨 주세요 💌</p>`}`;

  return sheet({
    title: '댓글',
    cls: 'comments-sheet',
    onClose,
    body: html`
      <div class="cmt-list">${listHTML()}</div>
      <div class="composer">
        <div class="quick" aria-label="빠른 댓글 (누르면 바로 남겨져요)">
          ${QUICK_REPLIES.map((q) => html`<button class="chip outline" data-quick="${q}">${q}</button>`)}
        </div>
        <div class="emoji-bar" aria-label="이모지 넣기">
          ${EMOJIS.map((e) => html`<button type="button" data-emoji="${e}" aria-label="${e} 넣기">${e}</button>`)}
        </div>
        <form class="cmt-form">
          <span class="avatar s32">${app.me.avatar}</span>
          <div class="pill">
            <input type="text" maxlength="1000" placeholder="댓글을 입력하세요" enterkeyhint="send" aria-label="댓글 입력">
            <button type="submit" class="send-txt" disabled>보내기</button>
          </div>
        </form>
      </div>`,
    mount: (el) => {
      const sheetEl = el.querySelector('.sheet');
      const list = el.querySelector('.cmt-list');
      const input = el.querySelector('input');
      const send = el.querySelector('.send-txt');
      const sync = () => {
        send.disabled = !input.value.trim();
        sheetEl.classList.toggle('typing', document.activeElement === input || !!input.value.trim());
      };
      const redraw = () => {
        list.innerHTML = String(listHTML());
        list.scrollTop = list.scrollHeight;
        refreshCard(app, post);
      };
      list.scrollTop = list.scrollHeight;
      input.addEventListener('input', sync);
      input.addEventListener('focus', sync);
      input.addEventListener('blur', () => setTimeout(sync, 150));

      let busy = false;
      const post1 = async (body) => {
        body = body.trim();
        if (!body || busy) return;
        busy = true;
        try {
          const c = await app.api.addComment(post, body);
          post.comments = [...post.comments, c];
          input.value = '';
          sync();
          redraw();
          toast('댓글을 남겼어요', {
            action: '되돌리기',
            onAction: async () => {
              try {
                await app.api.deleteComment(c);
                post.comments = post.comments.filter((x) => x.id !== c.id);
                if (el.isConnected) redraw(); else refreshCard(app, post);
              } catch (err) { toast(err.message); }
            },
          });
        } catch (err) {
          toast(err.message);
        } finally {
          busy = false;
        }
      };

      el.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); post1(input.value); });
      // 이모지를 눌러도 글자판(키보드)이 내려가지 않게 입력칸에서 초점을 뺏지 않아요
      const keepFocus = (e) => { if (document.activeElement === input) e.preventDefault(); };
      const bar = el.querySelector('.emoji-bar');
      bar.addEventListener('pointerdown', keepFocus);
      bar.addEventListener('mousedown', keepFocus);
      el.addEventListener('click', async (e) => {
        const q = e.target.closest('[data-quick]');
        if (q) return post1(q.dataset.quick);
        const em = e.target.closest('[data-emoji]');
        if (em) {
          // 커서 자리에 넣기만 하고 바로 보내지는 않아요 (손 떨림 실수 방지)
          const s = input.selectionStart ?? input.value.length;
          const t = input.selectionEnd ?? input.value.length;
          input.setRangeText(em.dataset.emoji, s, t, 'end');
          sync();
          return;
        }
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
