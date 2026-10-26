import { useEffect, useState } from 'react';
import { useStudio } from '../lib/store';
import { buildImages, buildPdf, buildPptx, download, parseRanges, safeName, zipFiles, type Page } from '../lib/pdf';
import { Icon } from './Icon';

export type ExportTab = 'pdf' | 'split' | 'pptx' | 'image';

const TABS: { id: ExportTab; label: string }[] = [
  { id: 'pdf', label: 'PDF' },
  { id: 'split', label: '나누기' },
  { id: 'pptx', label: 'PPTX' },
  { id: 'image', label: '이미지' },
];

export function Export({ tab: initial, onClose }: { tab: ExportTab; onClose: () => void }) {
  const pages = useStudio((s) => s.pages);
  const sources = useStudio((s) => s.sources);
  const selected = useStudio((s) => s.selected);
  const name = useStudio((s) => s.name);
  const toast = useStudio((s) => s.toast);

  const [tab, setTab] = useState<ExportTab>(initial);
  const [scope, setScope] = useState<'all' | 'sel'>(selected.length ? 'sel' : 'all');
  const [numbers, setNumbers] = useState<'none' | 'n' | 'n/total'>('none');
  const [splitMode, setSplitMode] = useState<'ranges' | 'every' | 'each'>('ranges');
  const [ranges, setRanges] = useState('');
  const [every, setEvery] = useState(2);
  const [notes, setNotes] = useState(true);
  const [fmt, setFmt] = useState<'png' | 'jpeg'>('png');
  const [quality, setQuality] = useState(2000);
  const [busy, setBusy] = useState<string | null>(null);

  const list: Page[] = scope === 'sel' ? pages.filter((p) => selected.includes(p.id)) : pages;
  const base = safeName(name || 'document');
  const total = list.length;

  useEffect(() => {
    const on = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose();
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [busy, onClose]);

  useEffect(() => {
    if (!ranges && total) {
      const half = Math.ceil(total / 2);
      setRanges(total > 1 ? `1-${half}, ${half + 1}-${total}` : '1');
    }
  }, [total, ranges]);

  const groups: number[][] | string =
    splitMode === 'ranges'
      ? parseRanges(ranges, total)
      : splitMode === 'every'
        ? Array.from({ length: Math.ceil(total / Math.max(1, every)) }, (_, g) =>
            Array.from({ length: Math.min(every, total - g * every) }, (_, k) => g * every + k),
          )
        : list.map((_, k) => [k]);

  const run = async () => {
    if (!total) return;
    try {
      if (tab === 'pdf') {
        setBusy('PDF를 만들고 있어요');
        const bytes = await buildPdf(sources, list, { pageNumbers: numbers, title: name });
        download(bytes, `${base}.pdf`);
        toast(`${base}.pdf 를 내려받았어요`, 'ok');
      } else if (tab === 'split') {
        if (typeof groups === 'string') return;
        const files = [];
        const pad = String(groups.length).length;
        for (let g = 0; g < groups.length; g++) {
          setBusy(`나누는 중 ${g + 1} / ${groups.length}`);
          const part = groups[g].map((k) => list[k]);
          const label = describe(groups[g]);
          files.push({ name: `${base}-${String(g + 1).padStart(pad, '0')}_p${label}.pdf`, data: await buildPdf(sources, part, { pageNumbers: numbers }) });
        }
        if (files.length === 1) download(files[0].data, files[0].name);
        else download(await zipFiles(files), `${base}-나눔.zip`, 'application/zip');
        toast(`${files.length}개 파일로 나눠서 내려받았어요`, 'ok');
      } else if (tab === 'pptx') {
        setBusy(`슬라이드 만드는 중 0 / ${total}`);
        const blob = await buildPptx(sources, list, { notes, onProgress: (n) => setBusy(`슬라이드 만드는 중 ${n} / ${total}`) });
        download(blob, `${base}.pptx`);
        toast(`${base}.pptx 를 내려받았어요`, 'ok');
      } else {
        setBusy(`이미지 만드는 중 0 / ${total}`);
        const blob = await buildImages(sources, list, { format: fmt, maxSide: quality, base, onProgress: (n) => setBusy(`이미지 만드는 중 ${n} / ${total}`) });
        download(blob, `${base}-이미지.zip`, 'application/zip');
        toast(`이미지 ${total}장을 ZIP으로 내려받았어요`, 'ok');
      }
      onClose();
    } catch (e) {
      console.error(e);
      toast(`저장하지 못했어요: ${(e as Error).message || '알 수 없는 오류'}`, 'error');
    } finally {
      setBusy(null);
    }
  };

  const cta =
    tab === 'pdf'
      ? 'PDF 내려받기'
      : tab === 'split'
        ? typeof groups === 'string'
          ? '나누기'
          : `${groups.length}개 파일로 나누기`
        : tab === 'pptx'
          ? 'PPTX 내려받기'
          : `이미지 ${total}장 내려받기`;

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="export-title" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="sheet">
        <header className="sheet-head">
          <h2 id="export-title">저장하기</h2>
          <button className="icon-btn" onClick={onClose} disabled={!!busy} aria-label="닫기">
            <Icon name="x" />
          </button>
        </header>

        <div className="seg" role="tablist">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'is-on' : ''} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="sheet-body">
          {selected.length > 0 && (
            <Field label="저장할 페이지">
              <div className="chips">
                <Chip on={scope === 'all'} onClick={() => setScope('all')}>전체 {pages.length}페이지</Chip>
                <Chip on={scope === 'sel'} onClick={() => setScope('sel')}>고른 {selected.length}페이지만</Chip>
              </div>
            </Field>
          )}

          {tab === 'pdf' && (
            <>
              <p className="sheet-note">지금 보이는 순서와 회전 그대로 {total}페이지짜리 PDF 하나를 만들어요. 글자 · 링크 · 화질은 원본 그대로예요.</p>
              <NumberField value={numbers} onChange={setNumbers} />
            </>
          )}

          {tab === 'split' && (
            <>
              <Field label="나누는 방법">
                <div className="chips">
                  <Chip on={splitMode === 'ranges'} onClick={() => setSplitMode('ranges')}>범위로</Chip>
                  <Chip on={splitMode === 'every'} onClick={() => setSplitMode('every')}>N페이지씩</Chip>
                  <Chip on={splitMode === 'each'} onClick={() => setSplitMode('each')}>한 장씩</Chip>
                </div>
              </Field>
              {splitMode === 'ranges' && (
                <Field label="페이지 범위" hint={`쉼표로 파일을 나눠요. 예: 1-3, 4, 5-${total} · 비워 두면 처음이나 끝 (예: 5-)`}>
                  <input className="input" value={ranges} onChange={(e) => setRanges(e.target.value)} placeholder="1-3, 4-6, 7-" />
                </Field>
              )}
              {splitMode === 'every' && (
                <Field label="몇 페이지씩">
                  <div className="stepper">
                    <button onClick={() => setEvery((v) => Math.max(1, v - 1))} aria-label="줄이기">−</button>
                    <input type="number" min={1} max={total} value={every} onChange={(e) => setEvery(Math.max(1, +e.target.value || 1))} />
                    <button onClick={() => setEvery((v) => Math.min(total || 1, v + 1))} aria-label="늘리기">+</button>
                  </div>
                </Field>
              )}
              {typeof groups === 'string' ? (
                <p className="sheet-error">{groups}</p>
              ) : (
                <div className="split-preview" aria-label="나눈 결과 미리보기">
                  {groups.slice(0, 40).map((g, k) => (
                    <span key={k} style={{ ['--w' as string]: Math.min(g.length, 12) }}>
                      <b>{k + 1}</b> {describe(g)}쪽
                    </span>
                  ))}
                  {groups.length > 40 && <span>… 외 {groups.length - 40}개</span>}
                </div>
              )}
              <p className="sheet-note">{typeof groups !== 'string' && groups.length > 1 ? '여러 파일은 ZIP 하나로 묶어서 내려받아요.' : ''} 페이지 번호는 지금 화면의 순서 기준이에요.</p>
            </>
          )}

          {tab === 'pptx' && (
            <>
              <p className="sheet-note">페이지마다 슬라이드 한 장을 만들어요. 페이지는 고화질 이미지로 들어가서 원본과 똑같이 보이지만, 슬라이드 안의 글자를 바로 고칠 수는 없어요. 슬라이드 크기는 첫 페이지 비율에 맞춰요.</p>
              <label className="toggle">
                <input type="checkbox" checked={notes} onChange={(e) => setNotes(e.target.checked)} />
                <span />
                <div>
                  <b>발표자 노트에 페이지 글자 넣기</b>
                  <small>글자를 복사해서 슬라이드에 다시 쓸 때 편해요</small>
                </div>
              </label>
            </>
          )}

          {tab === 'image' && (
            <>
              <Field label="형식">
                <div className="chips">
                  <Chip on={fmt === 'png'} onClick={() => setFmt('png')}>PNG · 선명하게</Chip>
                  <Chip on={fmt === 'jpeg'} onClick={() => setFmt('jpeg')}>JPG · 작은 용량</Chip>
                </div>
              </Field>
              <Field label="크기 (긴 변)">
                <div className="chips">
                  <Chip on={quality === 1200} onClick={() => setQuality(1200)}>1200px</Chip>
                  <Chip on={quality === 2000} onClick={() => setQuality(2000)}>2000px</Chip>
                  <Chip on={quality === 3200} onClick={() => setQuality(3200)}>3200px</Chip>
                </div>
              </Field>
              <p className="sheet-note">페이지마다 이미지 한 장, 모두 ZIP 하나로 묶어서 내려받아요.</p>
            </>
          )}

          {(tab === 'split') && <NumberField value={numbers} onChange={setNumbers} />}
        </div>

        <footer className="sheet-foot">
          <span className="sheet-name">
            <Icon name="file" size={15} />
            {base}
          </span>
          <button className="btn is-primary" onClick={run} disabled={!!busy || !total || (tab === 'split' && typeof groups === 'string')}>
            {busy ? (
              <>
                <span className="spinner" /> {busy}
              </>
            ) : (
              <>
                <Icon name="download" size={17} /> {cta}
              </>
            )}
          </button>
        </footer>
      </div>
    </div>
  );
}

function describe(g: number[]) {
  const a = g[0] + 1;
  const b = g[g.length - 1] + 1;
  const contiguous = g.every((v, k) => k === 0 || v === g[k - 1] + 1);
  return contiguous ? (a === b ? `${a}` : `${a}-${b}`) : g.map((v) => v + 1).join('.');
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <div className="field-label">{label}</div>
      {children}
      {hint && <div className="field-hint">{hint}</div>}
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button className={`chip${on ? ' is-on' : ''}`} aria-pressed={on} onClick={onClick}>
      {children}
    </button>
  );
}

function NumberField({ value, onChange }: { value: 'none' | 'n' | 'n/total'; onChange: (v: 'none' | 'n' | 'n/total') => void }) {
  return (
    <Field label="페이지 번호 넣기">
      <div className="chips">
        <Chip on={value === 'none'} onClick={() => onChange('none')}>안 넣기</Chip>
        <Chip on={value === 'n'} onClick={() => onChange('n')}>1, 2, 3</Chip>
        <Chip on={value === 'n/total'} onClick={() => onChange('n/total')}>1 / 12</Chip>
      </div>
    </Field>
  );
}
