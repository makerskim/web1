// 사진 크게 보기: 두 손가락으로 확대, 두 번 톡톡 확대, 옆으로 넘기기, 아래로 내려 닫기

import { html, fmtDate } from './util.js';
import { icon } from './icons.js';
import { openOverlay } from './ui.js';
import { savePhotos, safePh } from './media.js';

export function openViewer(app, items, start = 0, { postLink = false } = {}) {
  if (!items.length) return;
  let index = Math.max(0, Math.min(items.length - 1, start));

  openOverlay({
    cls: 'viewer',
    backdrop: false,
    content: html`
      <div class="v-top">
        <button class="v-btn" data-close aria-label="닫기">${icon('close', { size: 26 })}<span>닫기</span></button>
        <span class="v-count"></span>
        <button class="v-btn" data-v="save" aria-label="저장">${icon('download', { size: 24 })}<span>저장</span></button>
      </div>
      <div class="v-stage"><div class="v-img"><img alt="" draggable="false"></div></div>
      <button class="v-nav prev" data-v="prev" aria-label="이전 사진">${icon('back', { size: 34 })}</button>
      <button class="v-nav next" data-v="next" aria-label="다음 사진">${icon('right', { size: 34 })}</button>
      <div class="v-bottom">
        <span class="v-date"></span>
        ${postLink ? html`<button class="v-btn pill" data-v="post">${icon('comment', { size: 20 })}<span>게시물·댓글 보기</span></button>` : ''}
      </div>`,
    mount(el, ctl) {
      const stage = el.querySelector('.v-stage');
      const box = el.querySelector('.v-img');
      const img = box.querySelector('img');
      let scale = 1, tx = 0, ty = 0;

      const apply = (anim = false) => {
        box.style.transition = anim ? 'transform .22s ease' : 'none';
        box.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
      };

      const show = async (i) => {
        index = i;
        scale = 1; tx = 0; ty = 0; apply();
        const it = items[i];
        el.querySelector('.v-count').textContent = items.length > 1 ? `${i + 1} / ${items.length}` : '';
        const age = app.ageAt(it.takenAt);
        el.querySelector('.v-date').textContent = `${fmtDate(it.takenAt)}${age ? ' · ' + age : ''}`;
        el.querySelector('.prev').hidden = i === 0;
        el.querySelector('.next').hidden = i === items.length - 1;
        box.style.backgroundImage = safePh(it.ph) ? `url(${safePh(it.ph)})` : '';
        img.removeAttribute('src');
        img.classList.remove('ready');
        try {
          const url = await app.api.photoURL(it.path);
          if (index === i) { img.src = url; img.onload = () => img.classList.add('ready'); }
        } catch { /* 자리표시만 보임 */ }
        [i + 1, i - 1].forEach((k) => items[k] && app.api.photoURL(items[k].path).catch(() => {}));
      };

      const go = (d) => {
        const n = index + d;
        if (n < 0 || n >= items.length) { tx = 0; apply(true); return; }
        show(n);
      };

      el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-v]');
        if (!b) return;
        const v = b.dataset.v;
        if (v === 'prev') go(-1);
        if (v === 'next') go(1);
        if (v === 'save') savePhotos([items[index]], items[index].takenAt);
        if (v === 'post') {
          const id = items[index].postId;
          app.go(`#/p/${id}`); // 열린 창을 모두 닫고 이동
        }
      });

      const onKey = (e) => {
        if (e.key === 'ArrowLeft') go(-1);
        if (e.key === 'ArrowRight') go(1);
      };
      document.addEventListener('keydown', onKey);
      const obs = new MutationObserver(() => { if (!el.isConnected) { document.removeEventListener('keydown', onKey); obs.disconnect(); } });
      obs.observe(document.body, { childList: true });

      // ----- 손가락 동작 -----
      const pts = new Map();
      let g = null;          // 동작 시작 시점의 값
      let lastTapAt = 0;

      const center = () => {
        const r = stage.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
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
        if (p.length === 2) {
          g.dist = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
          g.mx = (p[0].x + p[1].x) / 2;
          g.my = (p[0].y + p[1].y) / 2;
        }
      };

      stage.addEventListener('pointerdown', (e) => {
        stage.setPointerCapture(e.pointerId);
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        begin();
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
        } else {
          tx = dx; ty = 0;
        }
        apply();
      });
      const end = (e) => {
        if (!pts.has(e.pointerId)) return;
        pts.delete(e.pointerId);
        if (pts.size) { begin(); return; }
        if (!g) return;
        const dx = e.clientX - g.x;
        const dy = e.clientY - g.y;
        el.style.setProperty('--fade', '1');
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
            setTimeout(() => { if (lastTapAt === now) el.classList.toggle('bare'); }, 310);
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
