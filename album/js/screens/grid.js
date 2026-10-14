// 모아보기: 달마다 묶어서 보는 성장 앨범. 누르면 크게 보면서 옆으로 넘겨 볼 수 있어요.

import { html, fmtMonth, babyMonths, toDate } from '../util.js';
import { icon } from '../icons.js';
import { toast } from '../ui.js';
import { observeImages, safePh } from '../media.js';
import { openViewer } from '../viewer.js';
import { topBar, bindTop } from './feed.js';

let cache = null; // { fid, items }

export function invalidate() { cache = null; }

function monthLabel(app, key) {
  const d = toDate(`${key}-01`);
  const b = app.fam.babyBirthday;
  if (!b) return fmtMonth(d);
  // 그 달 말일 기준 개월 수
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const m = babyMonths(b, end);
  return m >= 0 ? html`${fmtMonth(d)} <small>${m < 24 ? `${m}개월` : `만 ${Math.floor(m / 12)}살`}</small>` : fmtMonth(d);
}

export async function render(app, view) {
  app.setTop(topBar(app));
  bindTop(app);
  view.innerHTML = '<div class="spinner center"></div>';
  try {
    if (!cache || cache.fid !== app.fam.id) {
      const rows = await app.api.allPhotos(app.fam.id);
      const items = rows
        .sort((a, b) => String(b.takenAt).localeCompare(String(a.takenAt)))
        .flatMap((p) => p.photos.map((ph, i) => ({
          path: ph.path, thumb: ph.thumb, ph: ph.ph, w: ph.w, h: ph.h, postId: p.id, index: i, takenAt: p.takenAt,
        })));
      cache = { fid: app.fam.id, items };
    }
  } catch (e) {
    view.innerHTML = String(html`<div class="empty"><div class="empty-art">📶</div><p>${e.message}</p></div>`);
    toast(e.message);
    return;
  }
  const { items } = cache;
  if (!items.length) {
    view.innerHTML = String(html`
      <div class="empty"><div class="empty-art">🖼️</div><h2>모아볼 사진이 아직 없어요</h2>
      <p>사진을 올리면 여기에 달마다 정리돼요.</p>
      <button class="btn primary big" data-g="compose">${icon('camera')} 사진 올리기</button></div>`);
    view.querySelector('[data-g=compose]').onclick = () => app.compose();
    return;
  }

  const groups = [];
  for (let i = 0; i < items.length; i++) {
    const d = toDate(items[i].takenAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (groups[groups.length - 1]?.key !== key) groups.push({ key, list: [] });
    groups[groups.length - 1].list.push(i);
  }

  view.innerHTML = String(html`
    <div class="grid-page">
      <div class="grid-head">
        <p><b>사진 ${items.length}장</b> · 누르면 크게 볼 수 있어요</p>
        ${groups.length > 2 ? html`<div class="month-chips">${groups.map((g) => html`<button class="chip" data-jump="${g.key}">${monthLabel(app, g.key)}</button>`)}</div>` : ''}
      </div>
      ${groups.map((g) => html`
        <section class="month" id="m-${g.key}">
          <h3>${monthLabel(app, g.key)} <span>${g.list.length}장</span></h3>
          <div class="tiles">
            ${g.list.map((i) => html`
              <button class="tile ph-box" data-i="${i}" style="${safePh(items[i].ph) ? `background-image:url(${safePh(items[i].ph)})` : ''}" aria-label="사진 크게 보기">
                <img data-path="${items[i].thumb}" alt="" draggable="false">
              </button>`)}
          </div>
        </section>`)}
    </div>`);
  observeImages(view);
  view.onclick = (e) => {
    const t = e.target.closest('[data-i]');
    if (t) openViewer(app, items, +t.dataset.i, { postLink: true });
    const j = e.target.closest('[data-jump]');
    if (j) document.getElementById(`m-${j.dataset.jump}`)?.scrollIntoView({ behavior: 'smooth' });
  };
}
