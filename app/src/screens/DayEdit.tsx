// 기념일 넣기 · 고치기 (관리자): 이름 · 날짜 · 기념일(100일 · 1주년)인지 생일(해마다)인지
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Page, TopBar } from '../components/Bars';
import { Group, Field } from '../components/Form';
import { DateField } from '../components/DatePicker';
import { confirm, toast, useOnce } from '../components/ui';
import { useAlbum, useSession } from '../state/session';
import * as api from '../lib/api';
import { fmtDate, ymd } from '../lib/dates';
import { albumSince, nextDay } from '../lib/album';
import { hasBatchim } from '../lib/korean';
import { uuid } from '../lib/uuid';
import type { Anniversary } from '../lib/types';
import s from './Settings.module.css';

const MAX_DAYS = 10;

export function DayEdit() {
  const album = useAlbum()!;
  const nav = useNavigate();
  const { id } = useParams();
  const old = album.days.find((d) => d.id === id);
  const [name, setName] = useState(old?.name ?? '');
  const [date, setDate] = useState<string | null>(old?.date ?? null);
  const [yearly, setYearly] = useState(old?.yearly ?? false);
  const isOwner = album.myRole === 'owner';
  const once = useOnce();
  // 자주 쓰는 기념일: 누르면 이름(과 날짜)이 채워져요
  // 가족·모임 앨범은 시작일을 비워 두면 이미 앨범 만든 날부터 세니까 '앨범 만든 날'은 빼요 (두 번 축하하지 않게)
  const created = ymd(album.createdAt);
  const presets: Array<{ name: string; date?: string; yearly: boolean }> = [
    ...(album.kind !== 'baby' && albumSince(album) === created ? [] : [{ name: '앨범 만든 날', date: created, yearly: false }]),
    { name: '결혼기념일', yearly: false },
    { name: '처음 만난 날', yearly: false },
    { name: '생일', yearly: true },
  ];
  const preview = date ? nextDay({ id: 'x', name: name.trim() || '기념일', date, yearly }) : null;

  const save = async () => {
    const n = name.trim();
    if (!n) return toast('기념일 이름을 적어 주세요');
    if (!date) return toast('날짜를 골라 주세요');
    const day: Anniversary = { id: old?.id ?? uuid(), name: n, date, yearly };
    const days = old ? album.days.map((d) => (d.id === old.id ? day : d)) : [...album.days, day];
    if (days.length > MAX_DAYS) return toast(`기념일은 ${MAX_DAYS}개까지 넣을 수 있어요`);
    try {
      await api.updateAlbum(album.id, { days });
      useSession.getState().patchAlbum({ days });
      toast('저장했어요');
      nav(-1);
    } catch (e) { toast((e as Error).message); }
  };
  const remove = async () => {
    if (!old || !(await confirm({ title: `‘${old.name}’${hasBatchim(old.name) ? '을' : '를'} 지울까요?`, ok: '지우기', danger: true }))) return;
    const days = album.days.filter((d) => d.id !== old.id);
    try {
      await api.updateAlbum(album.id, { days });
      useSession.getState().patchAlbum({ days });
      toast('지웠어요');
      nav(-1);
    } catch (e) { toast((e as Error).message); }
  };

  if (!isOwner) {
    return (
      <Page>
        <TopBar back title="기념일" />
        <div className={s.page}><p className={s.ownerOnly}>기념일은 관리자만 바꿀 수 있어요.</p></div>
      </Page>
    );
  }
  return (
    <Page>
      <TopBar back title={old ? '기념일 고치기' : '기념일 추가'} right={<button className={s.saveBtn} onClick={once(save)} data-save>저장</button>} />
      <div className={s.page}>
        {/* 먼저 어떻게 챙길지 → 자주 쓰는 이름 → 이름·날짜 → 다음 기념일 미리 보기 */}
        <div className={s.daySeg} role="group" aria-label="챙기는 방법">
          <button type="button" className={!yearly ? s.daySegOn : ''} aria-pressed={!yearly} onClick={() => setYearly(false)} data-day-kind="count">🎉 기념일<small>100일 · 1주년 …</small></button>
          <button type="button" className={yearly ? s.daySegOn : ''} aria-pressed={yearly} onClick={() => setYearly(true)} data-day-kind="yearly">🎂 생일<small>해마다 그날</small></button>
        </div>
        {!old && (
          <div className={s.presets} role="group" aria-label="자주 쓰는 기념일">
            {presets.map((p) => (
              <button key={p.name} type="button" className={s.preset} data-preset={p.name} aria-pressed={p.name === name.trim() || (p.name === '생일' && yearly && !name.trim())}
                onClick={() => { setName(p.name === '생일' ? '' : p.name); setYearly(p.yearly); if (p.date) setDate(p.date); }}>
                {p.name}
              </button>
            ))}
          </div>
        )}
        <Group footer={yearly ? '해마다 그날 홈 맨 위에 축하가 떠요.' : '100일 · 1000일 · 1주년마다 홈 맨 위에 축하가 떠요. 앞으로의 날짜면 그날까지 세요.'}>
          <Field label="이름" value={name} onChange={(e) => setName(e.target.value)} maxLength={20} placeholder={yearly ? '예) 아빠 생일' : '예) 결혼기념일'} name="day-name" autoComplete="off" />
          <DateField label="날짜" title="기념일 날짜" value={date} onChange={setDate} name="day-date" min="1900-01-01" max="2100-12-31" />
        </Group>
        {preview && (
          <p className={s.dayPreview} data-f="day-preview">
            {preview.daysLeft
              ? <>다음은 <b>{preview.label}</b><br />{fmtDate(preview.date)} <span className={s.dDay}>D-{preview.daysLeft.toLocaleString()}</span></>
              : <>오늘이 <b>{preview.label}</b>{hasBatchim(preview.label) ? '이에요' : '예요'} 🎉</>}
          </p>
        )}
        {old && <button type="button" className={s.dayRemove} onClick={once(remove)} data-f="day-remove">이 기념일 지우기</button>}
      </div>
    </Page>
  );
}
