// 사진 올리기: 고르기 → 꾸미기 → 글 쓰기 → 올리기 → 가족에게 알리기

import { html, ymd, toDate, babyAge, subj, callName } from './util.js';
import { icon } from './icons.js';
import { openOverlay, progress, toast, sheet, closeAllOverlays, copyText } from './ui.js';
import { loadPhoto, openEditor, exportPhoto, layout, render } from './editor.js';

const MAX_PHOTOS = 10;
const MAX_ORIGINAL = 30 * 1024 * 1024; // 원본 한 장 최대 30MB (schema.sql 버킷 설정과 같게)
const ORIG_PREF = 'ssuk-upload-original';
const mb = (n) => (n / 1048576 < 10 ? (n / 1048576).toFixed(1) : Math.round(n / 1048576));
const CAPTION_IDEAS = ['오늘의 우리 아기 😊', '까꿍! 👀', '잘 자요 💤', '냠냠 맛있어요 😋', '산책 나왔어요 🌳', '할머니 할아버지 보고 싶어요 💕'];

let input = null;

// 사진 고르기 창은 버튼을 누른 그 순간에 열어야 해서 미리 만들어 둡니다
export function startCompose(app) {
  if (!input) {
    input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.className = 'visually-hidden';
    input.setAttribute('aria-hidden', 'true');
    document.body.appendChild(input);
    input.addEventListener('change', () => {
      const files = [...input.files];
      input.value = '';
      if (files.length) begin(input.app, files);
    });
  }
  input.app = app;
  input.click();
}

async function begin(app, files) {
  if (files.length > MAX_PHOTOS) {
    toast(`한 번에 ${MAX_PHOTOS}장까지 올릴 수 있어요. 앞의 ${MAX_PHOTOS}장만 골랐어요.`, 4000);
    files = files.slice(0, MAX_PHOTOS);
  }
  const p = progress('사진을 준비하고 있어요…');
  const photos = [];
  for (let i = 0; i < files.length; i++) {
    try {
      photos.push(await loadPhoto(files[i]));
    } catch (e) {
      toast(e.message, 4000);
    }
    p.set((i + 1) / files.length);
  }
  p.close();
  if (!photos.length) return;
  const baby = app.fam.babyBirthday;
  openEditor(photos, { baby, onNext: () => openWrite(app, photos) });
}

function openWrite(app, photos) {
  const baby = app.fam.babyBirthday;
  const first = new Date(Math.min(...photos.map((p) => +toDate(p.takenAt) || Date.now())));
  const ageText = (d) => (baby ? babyAge(baby, d) : '');
  const origBytes = photos.reduce((n, p) => n + (p.file?.size || 0), 0);
  let origOn = true;
  try { origOn = localStorage.getItem(ORIG_PREF) !== 'off'; } catch { /* 기본값 */ }

  const dateText = (d) => {
    const age = baby ? babyAge(baby, d, { short: true }) : '';
    return `${d.getMonth() + 1}월 ${d.getDate()}일${age ? ` · ${age}` : ''}`;
  };

  openOverlay({
    cls: 'write-wrap',
    backdrop: false,
    content: html`
      <div class="write">
        <header class="ed-top">
          <button class="ed-txtbtn" data-close>${icon('back', { size: 20 })} 꾸미기</button>
          <h2>새 게시물</h2>
          <button class="ed-txtbtn accent" data-w="post">공유</button>
        </header>
        <div class="write-body">
          <div class="w-compose">
            <span class="w-thumb"><canvas></canvas>${photos.length > 1 ? html`<i>+${photos.length - 1}</i>` : ''}</span>
            <textarea rows="3" maxlength="2000" data-w="caption" placeholder="사진 이야기를 적어 주세요 (안 써도 돼요)" aria-label="사진 이야기"></textarea>
          </div>
          <div class="w-ideas">${CAPTION_IDEAS.map((c) => html`<button class="chip outline" data-idea="${c}">${c}</button>`)}</div>
          <label class="w-row">
            ${icon('calendar', { size: 22 })}<span class="w-label">찍은 날</span>
            <span class="w-val" data-w="dateText">${dateText(first)}</span>${icon('right', { size: 20 })}
            <input type="date" class="date-overlay" data-w="date" value="${ymd(first)}" max="${ymd(new Date())}" aria-label="찍은 날 고르기">
          </label>
          <label class="w-row switch-row">
            ${icon('image', { size: 22 })}
            <span class="switch-text"><b>원본 화질로도 올리기</b>
              <small>가족이 찍은 그대로의 고화질 사진을 내려받을 수 있어요 · ${mb(origBytes)}MB 더 써요</small></span>
            <input type="checkbox" class="switch" data-w="orig" ${origOn ? 'checked' : ''}>
          </label>
        </div>
        <div class="write-foot">
          <button class="btn primary big block" data-w="post">${icon('send')} 가족에게 올리기</button>
        </div>
      </div>`,
    mount(el) {
      const c = el.querySelector('.w-thumb canvas');
      const l = layout(photos[0], 200);
      c.width = l.W; c.height = l.H;
      render(c.getContext('2d'), photos[0], l, { baby, cache: false });
      const ta = el.querySelector('[data-w=caption]');
      const dateIn = el.querySelector('[data-w=date]');
      dateIn.addEventListener('change', () => {
        if (dateIn.value) el.querySelector('[data-w=dateText]').textContent = dateText(toDate(dateIn.value));
      });
      // 컴퓨터에서는 줄을 눌러도 달력이 열리도록
      dateIn.addEventListener('click', () => { try { dateIn.showPicker?.(); } catch { /* 휴대폰은 저절로 열려요 */ } });
      let busy = false;
      el.addEventListener('click', async (e) => {
        const idea = e.target.closest('[data-idea]');
        if (idea) {
          ta.value = ta.value ? `${ta.value.trimEnd()} ${idea.dataset.idea}` : idea.dataset.idea;
          return;
        }
        const btn = e.target.closest('[data-w=post]');
        if (!btn || busy) return;
        busy = true;
        let takenAt = first;
        if (dateIn.value && dateIn.value !== ymd(first)) {
          takenAt = toDate(dateIn.value);
          takenAt.setHours(12);
        }
        const withOrig = el.querySelector('[data-w=orig]').checked;
        try { localStorage.setItem(ORIG_PREF, withOrig ? 'on' : 'off'); } catch { /* 무시 */ }
        try {
          await upload(app, photos, { caption: ta.value.trim(), takenAt, withOrig });
        } finally {
          busy = false;
        }
      });
    },
  });
}

async function upload(app, photos, { caption, takenAt, withOrig }) {
  const baby = app.fam.babyBirthday;
  const p = progress('사진을 만드는 중…');
  try {
    const out = [];
    let skipped = 0;
    for (let i = 0; i < photos.length; i++) {
      const ex = await exportPhoto(photos[i], baby);
      const f = photos[i].file;
      if (withOrig && f) {
        if (f.size <= MAX_ORIGINAL) ex.orig = f;
        else skipped++;
      }
      out.push(ex);
      p.set(((i + 1) / photos.length) * 0.15);
    }
    if (skipped) toast(`원본이 30MB가 넘는 사진 ${skipped}장은 일반 화질로만 올려요.`, 4000);
    p.set(0.15, app.api.mode === 'cloud' ? '가족에게 올리는 중… (화면을 끄지 마세요)' : '저장하는 중…');
    const post = await app.api.createPost(app.fam.id, { caption, takenAt: takenAt.toISOString(), photos: out },
      (f) => p.set(0.15 + f * 0.85));
    p.close();
    app.addPost(post);
    await closeAllOverlays();
    await app.go('#/home');
    window.scrollTo({ top: 0 });
    done(app, post);
  } catch (e) {
    p.close();
    toast(e.message || '올리지 못했어요. 다시 시도해 주세요.', 5000);
  }
}

function done(app, post) {
  if (app.api.mode !== 'cloud') { toast('사진을 올렸어요! 🎉'); return; }
  const who = app.me.displayName;
  const baby = app.fam.babyName;
  const msg = `📷 ${subj(who)} ${baby ? `${callName(baby)} ` : ''}새 사진 ${post.photos.length}장을 올렸어요!\n${location.origin}${location.pathname}`;
  sheet({
    title: '올렸어요! 🎉',
    body: html`
      <p class="lead">가족에게 카카오톡으로 알려 주면 바로 보러 올 거예요.</p>
      <button class="btn primary big block" data-n="share">${icon('send')} 가족에게 알리기</button>
      <button class="btn ghost big block" data-close>괜찮아요</button>`,
    mount: (el, ctl) => el.querySelector('[data-n=share]').addEventListener('click', async () => {
      if (navigator.share) {
        try { await navigator.share({ text: msg }); ctl.close(); return; } catch (err) { if (err.name === 'AbortError') return; }
      }
      if (await copyText(msg)) toast('복사했어요. 가족 대화방에 붙여넣기 해 주세요.');
      ctl.close();
    }),
  });
}
