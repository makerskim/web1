// 모아보기: 달마다 묶어서 보는 성장 앨범. 누르면 크게 보면서 옆으로 넘겨 볼 수 있어요.

import { html, raw, fmtMonth, fmtDate, babyMonths, toDate } from '../util.js';
import { icon } from '../icons.js';
import { toast } from '../ui.js';
import { observeImages, safePh } from '../media.js';
import { openViewer } from '../viewer.js';
import { topBar, bindTop } from './feed.js';

let cache = null; // { fid, items }

export function invalidate() { cache = null; }

// 사진 목록 (가족 화면의 '사진 N장'에도 씀)
export async function items(app) {
  if (cache && cache.fid === app.fam.id) return cache.items;
  const rows = await app.api.allPhotos(app.fam.id);
  const list = rows
    .sort((a, b) => String(b.takenAt).localeCompare(String(a.takenAt)))
    .flatMap((p) => p.photos.map((ph, i) => ({
      path: ph.path, thumb: ph.thumb, ph: ph.ph, w: ph.w, h: ph.h, orig: ph.orig, origName: ph.origName, origSize: ph.origSize, dec: ph.dec,
      postId: p.id, authorId: p.authorId, createdAt: p.createdAt, index: i, count: p.photos.length, takenAt: p.takenAt,
    })));
  cache = { fid: app.fam.id, items: list };
  return list;
}

function monthLabel(app, key, { chip = false } = {}) {
  const d = toDate(`${key}-01`);
  const b = app.fam.babyBirthday;
  if (!b) return fmtMonth(d);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0); // 그 달 마지막 날 기준
  const m = babyMonths(b, end);
  if (m < 0) return fmtMonth(d);
  const age = m < 24 ? `${m}개월` : `만 ${Math.floor(m / 12)}살`;
  return chip ? html`${fmtMonth(d)} <small>${age}</small>` : html`${fmtMonth(d)} <small>· ${age}</small>`;
}

export async function render(app, view, arg) {
  app.setTop(topBar(app));
  bindTop(app);
  view.innerHTML = '<div class="spinner center"></div>';
  let list;
  try {
    list = await items(app);
  } catch (e) {
    view.innerHTML = String(html`<div class="empty"><div class="empty-art">${icon('image', { size: 40, stroke: 1.5 })}</div><p>${e.message}</p></div>`);
    toast(e.message);
    return;
  }
  if (!list.length) {
    view.innerHTML = String(html`
      <div class="empty"><div class="empty-art">${icon('image', { size: 40, stroke: 1.5 })}</div><h2>모아볼 사진이 아직 없어요</h2>
      <p>사진을 올리면 여기에 달마다 정리돼요.</p>
      <button class="btn primary big" data-g="compose">${icon('camera')} 사진 올리기</button></div>`);
    view.querySelector('[data-g=compose]').onclick = () => app.compose();
    return;
  }

  const groups = [];
  for (let i = 0; i < list.length; i++) {
    const d = toDate(list[i].takenAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (groups[groups.length - 1]?.key !== key) groups.push({ key, list: [] });
    groups[groups.length - 1].list.push(i);
  }

  view.innerHTML = String(html`
    <div class="grid-page">
      ${groups.length > 2 ? html`<div class="month-chips">${groups.map((g) => html`<button class="chip" data-jump="${g.key}">${monthLabel(app, g.key, { chip: true })}</button>`)}</div>` : ''}
      ${groups.map((g) => html`
        <section class="month" id="m-${g.key}">
          <h3 class="month-bar">${monthLabel(app, g.key)}</h3>
          <div class="tiles">
            ${g.list.map((i) => {
              const it = list[i];
              const bg = safePh(it.ph);
              return html`
                <button class="tile ph-box" data-i="${i}" style="${bg ? raw(`background-image:url(${bg})`) : ''}" aria-label="${fmtDate(it.takenAt)} 사진 크게 보기">
                  <img data-path="${it.thumb}" alt="" draggable="false">
                  ${it.count > 1 && it.index === 0 ? html`<span class="multi">${icon('layers', { size: 18, stroke: 2 })}</span>` : ''}
                </button>`;
            })}
          </div>
        </section>`)}
    </div>`);
  observeImages(view);
  view.onclick = (e) => {
    const t = e.target.closest('[data-i]');
    if (t) openViewer(app, list, +t.dataset.i, { postLink: true });
    const j = e.target.closest('[data-jump]');
    if (j) document.getElementById(`m-${j.dataset.jump}`)?.scrollIntoView({ behavior: 'smooth' });
  };
  // 게시물의 '생후 N일'을 눌러서 왔으면 그 달로
  if (arg && /^\d{4}-\d{2}$/.test(arg)) {
    requestAnimationFrame(() => document.getElementById(`m-${arg}`)?.scrollIntoView());
  } else {
    window.scrollTo(0, 0);
  }
}
