// 사진 올리기: 고르기 → 꾸미기 → 글 쓰기 → 올리기 → 가족에게 알리기

import { html, ymd, toDate, babyAge } from './util.js';
import { icon } from './icons.js';
import { openOverlay, progress, toast, sheet, closeAllOverlays } from './ui.js';
import { loadPhoto, openEditor, exportPhoto, layout, render } from './editor.js';
import { copyText } from './screens/family.js';

const MAX_PHOTOS = 10;
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

  openOverlay({
    cls: 'write-wrap',
    backdrop: false,
    content: html`
      <div class="write">
        <header class="ed-top">
          <button class="ed-txtbtn" data-close>${icon('back', { size: 20 })} 꾸미기</button>
          <h2>글 쓰기</h2>
          <span class="ed-top-space"></span>
        </header>
        <div class="write-body">
          <div class="write-previews">${photos.map(() => html`<canvas></canvas>`)}</div>
          <label class="field"><span>어떤 순간인가요? <small>(안 써도 돼요)</small></span>
            <textarea rows="4" maxlength="2000" data-w="caption" placeholder="예: 오늘 처음으로 뒤집기 성공했어요!"></textarea></label>
          <div class="quick">${CAPTION_IDEAS.map((c) => html`<button class="chip" data-idea="${c}">${c}</button>`)}</div>
          <label class="field"><span>${icon('calendar', { size: 18 })} 찍은 날</span>
            <input type="date" data-w="date" value="${ymd(first)}" max="${ymd(new Date())}"></label>
          ${baby ? html`<p class="age-preview" data-w="age">${ageText(first)}</p>` : ''}
        </div>
        <div class="write-foot">
          <button class="btn primary big block" data-w="post">${icon('send')} 가족에게 올리기</button>
        </div>
      </div>`,
    mount(el) {
      el.querySelectorAll('.write-previews canvas').forEach((c, i) => {
        const l = layout(photos[i], 220);
        c.width = l.W; c.height = l.H;
        render(c.getContext('2d'), photos[i], l, { baby, cache: false });
      });
      const ta = el.querySelector('[data-w=caption]');
      const dateIn = el.querySelector('[data-w=date]');
      dateIn.addEventListener('change', () => {
        const a = el.querySelector('[data-w=age]');
        if (a && dateIn.value) a.textContent = ageText(toDate(dateIn.value));
      });
      el.addEventListener('click', async (e) => {
        const idea = e.target.closest('[data-idea]');
        if (idea) {
          ta.value = ta.value ? `${ta.value.trimEnd()} ${idea.dataset.idea}` : idea.dataset.idea;
          return;
        }
        const btn = e.target.closest('[data-w=post]');
        if (!btn) return;
        btn.disabled = true;
        let takenAt = first;
        if (dateIn.value && dateIn.value !== ymd(first)) {
          takenAt = toDate(dateIn.value);
          takenAt.setHours(12);
        }
        try {
          await upload(app, photos, { caption: ta.value.trim(), takenAt });
        } finally {
          btn.disabled = false;
        }
      });
    },
  });
}

async function upload(app, photos, { caption, takenAt }) {
  const baby = app.fam.babyBirthday;
  const p = progress('사진을 만드는 중…');
  try {
    const out = [];
    for (let i = 0; i < photos.length; i++) {
      out.push(await exportPhoto(photos[i], baby));
      p.set(((i + 1) / photos.length) * 0.25);
    }
    p.set(0.25, app.api.mode === 'cloud' ? '가족에게 올리는 중… (화면을 끄지 마세요)' : '저장하는 중…');
    const post = await app.api.createPost(app.fam.id, { caption, takenAt: takenAt.toISOString(), photos: out },
      (f) => p.set(0.25 + f * 0.75));
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
  const msg = `📷 ${who}님이 ${baby ? `${baby} ` : ''}새 사진 ${post.photos.length}장을 올렸어요!\n${location.origin}${location.pathname}`;
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
