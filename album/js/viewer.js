// 사진 크게 보기 + 스토리(최근 사진 넘겨 보기)
// 크게 보기: 두 손가락·두 번 톡톡·[크게 보기] 버튼으로 확대, 옆으로 넘기기, 아래로 내려 닫기
// 스토리: 6초마다 다음 사진, 오른쪽 누르면 다음·왼쪽 누르면 이전, 꾹 누르면 멈춤, 한 번에 반응 보내기

import { html, fmtDate, timeAgo } from './util.js';
import { icon } from './icons.js';
import { openOverlay, toast } from './ui.js';
import { saveWithChoice, safePh } from './media.js';
import { toggleLike, refreshCard } from './postcard.js';
import { openComments } from './comments.js';

const STORY_MS = 6000;
const REACTIONS = ['😍', '🥰', '👏', '😂'];

export function openViewer(app, items, start = 0, { postLink = false, story = false, onShown } = {}) {
  if (!items.length) return;
  let index = Math.max(0, Math.min(items.length - 1, start));
  const st = { closed: false, holdTimer: null, onVis: null, onKey: null }; // 창이 닫힐 때 정리할 것들

  const normalTop = html`
    <div class="v-top">
      <button class="v-btn" data-close aria-label="닫기">${icon('close', { size: 24 })}<span>닫기</span></button>
      <span class="v-count"></span>
      <button class="v-btn" data-v="save" aria-label="저장">${icon('download', { size: 22 })}<span>저장</span></button>
    </div>`;
  const storyTop = html`
    <div class="st-top">
      <div class="st-bars"></div>
      <div class="st-head">
        <span class="avatar s32" data-st="avatar"></span>
        <span class="st-who"><b data-st="name"></b><small data-st="sub"></small></span>
        <button class="v-btn" data-close aria-label="닫기">${icon('close', { size: 24 })}<span>닫기</span></button>
      </div>
    </div>`;
  const normalBottom = html`
    <div class="v-bottom">
      <p class="v-date"></p>
      <div class="v-row">
        <button class="v-pill" data-v="zoom">${icon('zoom', { size: 18 })}<span>크게 보기</span></button>
        ${postLink ? html`<button class="v-pill" data-v="post">${icon('comment', { size: 18 })}<span>게시물·댓글 보기</span></button>` : ''}
      </div>
    </div>`;
  const storyBottom = html`
    <div class="st-bottom">
      <button class="st-like" data-v="like" aria-pressed="false">${icon('heart', { size: 24 })}<span>좋아요</span></button>
      <div class="st-emojis">${REACTIONS.map((e) => html`<button data-react="${e}" aria-label="${e} 반응 보내기">${e}</button>`)}</div>
      <button class="v-pill" data-v="comments">${icon('comment', { size: 18 })}<span>댓글</span></button>
    </div>`;

  openOverlay({
    cls: `viewer ${story ? 'story-mode' : ''}`,
    backdrop: false,
    content: html`
      ${story ? storyTop : normalTop}
      <div class="v-stage">
        <div class="v-img"><img alt="" draggable="false"></div>
        <button class="v-nav prev" data-v="prev" aria-label="이전 사진">${icon('back', { size: 30 })}</button>
        <button class="v-nav next" data-v="next" aria-label="다음 사진">${icon('right', { size: 30 })}</button>
      </div>
      ${story ? storyBottom : normalBottom}`,
    onClose: () => {
      st.closed = true;
      clearTimeout(st.holdTimer);
      document.removeEventListener('visibilitychange', st.onVis);
      document.removeEventListener('keydown', st.onKey);
    },
    mount(el, ctl) {
      const stage = el.querySelector('.v-stage');
      const box = el.querySelector('.v-img');
      const img = box.querySelector('img');
      let scale = 1, tx = 0, ty = 0;

      const apply = (anim = false) => {
        box.style.transition = anim ? 'transform .22s ease' : 'none';
        box.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
        const z = el.querySelector('[data-v=zoom] span');
        if (z) z.textContent = scale > 1.01 ? '원래대로' : '크게 보기';
      };

      // ----- 스토리: 같은 사람 사진끼리 묶어 위쪽 막대로 표시 -----
      const groupOf = (i) => {
        let a = i;
        let b = i;
        while (a > 0 && items[a - 1].authorId === items[i].authorId) a--;
        while (b < items.length - 1 && items[b + 1].authorId === items[i].authorId) b++;
        return [a, b];
      };
      const bars = el.querySelector('.st-bars');
      let paused = false;
      const setPaused = (p) => {
        paused = p;
        el.classList.toggle('paused', p);
      };
      const drawBars = (i) => {
        if (!bars) return;
        const [a, b] = groupOf(i);
        bars.innerHTML = '';
        for (let k = a; k <= b; k++) {
          const s = document.createElement('span');
          s.className = `st-bar ${k < i ? 'done' : k === i ? 'cur' : ''}`;
          s.innerHTML = '<i></i>';
          bars.appendChild(s);
        }
        const cur = bars.querySelector('.cur i');
        cur?.addEventListener('animationend', () => { if (!paused) go(1, true); });
      };
      const drawStoryHead = (it) => {
        const m = app.memberOf(it.authorId);
        el.querySelector('[data-st=avatar]').textContent = m.avatar;
        el.querySelector('[data-st=name]').textContent = m.displayName;
        const age = app.ageAt(it.takenAt);
        el.querySelector('[data-st=sub]').textContent = [age && age.split(' · ')[0], timeAgo(it.createdAt)].filter(Boolean).join(' · ');
        const post = app.postsById.get(it.postId);
        const liked = !!post?.likes.some((l) => l.userId === app.user.id);
        const lb = el.querySelector('[data-v=like]');
        lb.classList.toggle('on', liked);
        lb.setAttribute('aria-pressed', String(liked));
        lb.querySelector('svg').setAttribute('fill', liked ? 'currentColor' : 'none');
      };

      const show = async (i) => {
        index = i;
        scale = 1; tx = 0; ty = 0; apply();
        const it = items[i];
        if (story) {
          drawBars(i);
          drawStoryHead(it);
          onShown?.(it);
        } else {
          el.querySelector('.v-count').textContent = items.length > 1 ? `${i + 1} / ${items.length}` : '';
          const age = app.ageAt(it.takenAt);
          el.querySelector('.v-date').textContent = `${fmtDate(it.takenAt)}${age ? ' · ' + age : ''}`;
        }
        el.querySelector('.v-nav.prev').hidden = i === 0;
        el.querySelector('.v-nav.next').hidden = i === items.length - 1 && !story;
        box.style.backgroundImage = safePh(it.ph) ? `url(${safePh(it.ph)})` : '';
        img.removeAttribute('src');
        img.classList.remove('ready');
        try {
          const url = await app.api.photoURL(it.path);
          if (index === i) { img.src = url; img.onload = () => img.classList.add('ready'); }
        } catch { /* 자리표시만 보임 */ }
        [i + 1, i - 1].forEach((k) => items[k] && app.api.photoURL(items[k].path).catch(() => {}));
      };

      const go = (d, auto = false) => {
        if (st.closed) return;
        const n = index + d;
        if (n < 0) { tx = 0; apply(true); if (story) show(0); return; }
        if (n >= items.length) { if (story || auto) ctl.close(); else { tx = 0; apply(true); } return; }
        show(n);
      };

      el.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-v], [data-react]');
        if (!b) return;
        const it = items[index];
        const post = app.postsById.get(it.postId);
        const v = b.dataset.v;
        if (v === 'prev') go(-1);
        if (v === 'next') go(1);
        if (v === 'save') saveWithChoice([it], it.takenAt);
        if (v === 'zoom') {
          if (scale > 1.01) { scale = 1; tx = 0; ty = 0; } else { scale = 2.5; tx = 0; ty = 0; }
          apply(true);
        }
        if (v === 'post') {
          app.go(`#/p/${it.postId}`); // 열린 창을 모두 닫고 이동
        }
        if (!post) return;
        if (v === 'like') {
          await toggleLike(app, post, !post.likes.some((l) => l.userId === app.user.id));
          drawStoryHead(it);
        }
        if (v === 'comments') {
          setPaused(true);
          openComments(app, post, { onClose: () => setPaused(false) });
        }
        if (b.dataset.react) {
          const emoji = b.dataset.react;
          floatEmoji(el, emoji);
          try {
            const c = await app.api.addComment(post, emoji);
            post.comments = [...post.comments, c];
            refreshCard(app, post);
            toast('보냈어요', {
              action: '되돌리기',
              onAction: async () => {
                try {
                  await app.api.deleteComment(c);
                  post.comments = post.comments.filter((x) => x.id !== c.id);
                  refreshCard(app, post);
                } catch (err) { toast(err.message); }
              },
            });
          } catch (err) {
            toast(err.message);
          }
        }
      });

      st.onKey = (e) => {
        if (e.key === 'ArrowLeft') go(-1);
        if (e.key === 'ArrowRight') go(1);
      };
      document.addEventListener('keydown', st.onKey);
      st.onVis = () => { if (story) setPaused(document.hidden); };
      document.addEventListener('visibilitychange', st.onVis);

      // ----- 손가락 동작 -----
      const pts = new Map();
      let g = null;
      let lastTapAt = 0;

      const center = () => {
        const r = stage.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, left: r.left };
      };
      const clampPan = () => {
        const c = center();
        const bx = Math.max(0, (c.w * scale - c.w) / 2);
        const by = Math.max(0, (c.h * scale - c.h) / 2);
        tx = Math.max(-bx, Math.min(bx, tx));
        ty = Math.max(-by, Math.min(by, ty));
      };
      const begin = () => {
        const p = [...pts.values()];
        g = { scale, tx, ty, t: Date.now(), x: p[0].x, y: p[0].y, moved: false };
        if (p.length === 2 && !story) {
          g.dist = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
          g.mx = (p[0].x + p[1].x) / 2;
          g.my = (p[0].y + p[1].y) / 2;
        }
      };

      stage.addEventListener('pointerdown', (e) => {
        if (e.target.closest('button')) return;
        stage.setPointerCapture(e.pointerId);
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        begin();
        if (story) {
          clearTimeout(st.holdTimer);
          st.holdTimer = setTimeout(() => { if (g) g.held = true; setPaused(true); }, 200);
        }
      });
      stage.addEventListener('pointermove', (e) => {
        if (!pts.has(e.pointerId) || !g) return;
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const p = [...pts.values()];
        const c = center();
        if (p.length >= 2 && g.dist) {
          const d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
          const s = Math.max(1, Math.min(5, g.scale * d / g.dist));
          const mx = (p[0].x + p[1].x) / 2;
          const my = (p[0].y + p[1].y) / 2;
          const cx = (g.mx - c.x - g.tx) / g.scale;
          const cy = (g.my - c.y - g.ty) / g.scale;
          scale = s; tx = mx - c.x - cx * s; ty = my - c.y - cy * s;
          clampPan();
          g.moved = true;
          apply();
          return;
        }
        const dx = e.clientX - g.x;
        const dy = e.clientY - g.y;
        if (Math.hypot(dx, dy) > 8) g.moved = true;
        if (scale > 1.01) {
          tx = g.tx + dx; ty = g.ty + dy; clampPan();
        } else if (Math.abs(dy) > Math.abs(dx) && dy > 0) {
          tx = 0; ty = dy;
          el.style.setProperty('--fade', String(Math.max(0.3, 1 - dy / 400)));
        } else if (!story) {
          tx = dx; ty = 0;
        }
        apply();
      });
      const end = (e) => {
        if (!pts.has(e.pointerId)) return;
        pts.delete(e.pointerId);
        clearTimeout(st.holdTimer);
        if (pts.size) { begin(); return; }
        if (!g) return;
        const dx = e.clientX - g.x;
        const dy = e.clientY - g.y;
        const held = g.held;
        el.style.setProperty('--fade', '1');
        if (story) {
          if (held) setPaused(false);
          if (dy > 120 && Math.abs(dy) > Math.abs(dx)) { ctl.close(); return; }
          tx = 0; ty = 0; apply(true);
          if (!g.moved && !held) {
            // 왼쪽 1/3을 누르면 이전, 나머지는 다음
            const c = center();
            go(e.clientX - c.left < c.w / 3 ? -1 : 1);
          } else if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) {
            go(dx < 0 ? 1 : -1);
          }
          g = null;
          return;
        }
        if (!g.moved && Date.now() - g.t < 300) {
          const now = Date.now();
          if (now - lastTapAt < 300) {
            // 두 번 톡톡: 확대 ↔ 원래대로
            lastTapAt = 0;
            if (scale > 1.01) { scale = 1; tx = 0; ty = 0; } else {
              const c = center();
              scale = 2.5;
              tx = -(e.clientX - c.x) * 1.5;
              ty = -(e.clientY - c.y) * 1.5;
              clampPan();
            }
            apply(true);
          } else {
            lastTapAt = now;
          }
        } else if (scale <= 1.01) {
          if (dy > 120 && Math.abs(dy) > Math.abs(dx)) { ctl.close(); return; }
          if (dx < -60) go(1);
          else if (dx > 60) go(-1);
          else { tx = 0; ty = 0; apply(true); }
        }
        g = null;
      };
      stage.addEventListener('pointerup', end);
      stage.addEventListener('pointercancel', end);

      show(index);
    },
  });
}

function floatEmoji(el, emoji) {
  const f = document.createElement('span');
  f.className = 'float-emoji';
  f.textContent = emoji;
  el.appendChild(f);
  setTimeout(() => f.remove(), 1000);
}
