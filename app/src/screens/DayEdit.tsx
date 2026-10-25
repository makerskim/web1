// 기념일 넣기 · 고치기 (관리자): 기념일인지 생일인지 → 이름 → 날짜(양력 · 음력) → 반복(매년 · 매월 · 매주 · N일마다 · 100일·주년 · 한 번) → 다음 그날 미리 보기
// 음력으로 넣으면 양력 날짜를 바로 보여 주고, 매년 · 매월은 해마다 · 달마다 음력으로 다시 계산해요
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Page, TopBar } from '../components/Bars';
import { Group, Field, Segmented } from '../components/Form';
import { DateField } from '../components/DatePicker';
import { confirm, toast, useOnce } from '../components/ui';
import { useAlbum, useSession } from '../state/session';
import * as api from '../lib/api';
import { fmtDay, ymd } from '../lib/dates';
import { albumSince } from '../lib/album';
import { LUNAR_MAX_YEAR, LUNAR_MIN_YEAR, REPEATS, hasLeapMonth, lunarLabel, lunarMonthDays, lunarToSolar, nextDays, solarToLunar } from '../lib/days';
import { hasBatchim } from '../lib/korean';
import { uuid } from '../lib/uuid';
import type { Anniversary, DayRepeat, LunarDate } from '../lib/types';
import s from './Settings.module.css';

const MAX_DAYS = 30;
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

export function DayEdit() {
  const album = useAlbum()!;
  const nav = useNavigate();
  const { id } = useParams();
  const old = album.days.find((d) => d.id === id);
  const [birthday, setBirthday] = useState(old?.birthday ?? false);
  const [name, setName] = useState(old?.name ?? '');
  const [date, setDate] = useState<string | null>(old?.date ?? null);
  const [lunar, setLunar] = useState<LunarDate | null>(old?.lunar ?? null);
  const [repeat, setRepeat] = useState<DayRepeat>(old?.repeat ?? 'yearly');
  const [every, setEvery] = useState(String(old?.every ?? 100));
  const isOwner = album.myRole === 'owner';
  const once = useOnce();

  // 자주 쓰는 기념일: 누르면 이름 · 반복(과 날짜)이 채워져요
  // 가족·모임 앨범은 시작일을 비워 두면 이미 앨범 만든 날부터 세니까 '앨범 만든 날'은 빼요 (두 번 축하하지 않게)
  const created = ymd(album.createdAt);
  const presets: Array<{ name: string; date?: string; repeat: DayRepeat; birthday: boolean }> = [
    { name: '생일', repeat: 'yearly', birthday: true },
    { name: '결혼기념일', repeat: 'yearly', birthday: false },
    { name: '처음 만난 날', repeat: 'count', birthday: false },
    ...(album.kind !== 'baby' && albumSince(album) === created ? [] : [{ name: '앨범 만든 날', date: created, repeat: 'count' as DayRepeat, birthday: false }]),
  ];

  // 음력 ↔ 양력
  const solarOfLunar = lunar ? lunarToSolar(lunar.y, lunar.m, lunar.d, lunar.leap) : null;
  const theDate = lunar ? solarOfLunar : date;
  const setCalendar = (v: 'solar' | 'lunar') => {
    if (v === 'lunar' && !lunar) {
      const l = solarToLunar(date || ymd(new Date()));
      setLunar(l ? { ...l, y: Math.min(LUNAR_MAX_YEAR, Math.max(LUNAR_MIN_YEAR, l.y)) } : { y: new Date().getFullYear(), m: 1, d: 1, leap: false });
    }
    if (v === 'solar' && lunar) {
      if (solarOfLunar) setDate(solarOfLunar);
      setLunar(null);
    }
  };
  // 음력 칸을 바꾸면: 그 달에 없는 날(30일) · 없는 윤달은 맞춰요
  const changeLunar = (p: Partial<LunarDate>) => setLunar((l) => {
    const n = { ...(l || { y: 2000, m: 1, d: 1, leap: false }), ...p };
    if (n.leap && !hasLeapMonth(n.y, n.m)) n.leap = false;
    n.d = Math.min(n.d, lunarMonthDays(n.y, n.m, n.leap));
    return n;
  });

  const draft = (): Anniversary | null => {
    if (!theDate) return null;
    const n = Math.round(Number(every));
    return {
      id: old?.id ?? uuid(), name: name.trim() || (birthday ? '생일' : '기념일'), date: theDate, birthday, repeat, yearly: repeat === 'yearly',
      ...(repeat === 'days' ? { every: Number.isFinite(n) ? Math.min(10000, Math.max(2, n)) : 100 } : {}),
      ...(lunar ? { lunar } : {}),
    };
  };
  const d = draft();
  const upcoming = d ? nextDays(d, 3) : [];

  const save = async () => {
    const n = name.trim();
    if (!n) return toast(birthday ? '누구의 생일인지 적어 주세요 (예: 아빠 생일)' : '기념일 이름을 적어 주세요');
    if (lunar && !solarOfLunar) return toast('그해에는 그 음력 날짜가 없어요. 날짜를 다시 골라 주세요');
    if (!theDate) return toast('날짜를 골라 주세요');
    if (repeat === 'days' && !(Number(every) >= 2)) return toast('며칠마다인지 2 이상으로 적어 주세요');
    const day = draft()!;
    const days = old ? album.days.map((x) => (x.id === old.id ? day : x)) : [...album.days, day];
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
    const days = album.days.filter((x) => x.id !== old.id);
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
        {/* 기념일인지 생일인지 */}
        <div className={s.daySeg} role="group" aria-label="종류">
          <button type="button" className={!birthday ? s.daySegOn : ''} aria-pressed={!birthday} onClick={() => setBirthday(false)} data-day-kind="anniv">🎉 기념일<small>결혼기념일 · 만난 날 …</small></button>
          <button type="button" className={birthday ? s.daySegOn : ''} aria-pressed={birthday} onClick={() => { setBirthday(true); setRepeat('yearly'); }} data-day-kind="birthday">🎂 생일<small>가족 · 친구 생일</small></button>
        </div>
        {!old && (
          <div className={s.presets} role="group" aria-label="자주 쓰는 기념일">
            {presets.map((p) => (
              <button key={p.name} type="button" className={s.preset} data-preset={p.name} aria-pressed={p.birthday ? birthday && !name.trim() : p.name === name.trim()}
                onClick={() => { setName(p.birthday ? '' : p.name); setBirthday(p.birthday); setRepeat(p.repeat); if (p.date) { setDate(p.date); setLunar(null); } }}>
                {p.name}
              </button>
            ))}
          </div>
        )}

        <Group>
          <Field label="이름" value={name} onChange={(e) => setName(e.target.value)} maxLength={20} placeholder={birthday ? '예) 아빠 생일' : '예) 결혼기념일'} name="day-name" autoComplete="off" />
        </Group>

        {/* 날짜: 양력 · 음력 */}
        <Group title="날짜" footer={lunar
          ? (repeat === 'yearly' || repeat === 'monthly' ? `음력으로 ${repeat === 'yearly' ? '해마다' : '달마다'} 다시 계산해서 양력 날짜로 알려 줘요. (음력 ${LUNAR_MAX_YEAR}년까지)` : '음력 날짜를 양력으로 바꿔서 그날부터 세요.')
          : undefined}>
          <div className={s.calSeg}><Segmented label="양력 · 음력" value={lunar ? 'lunar' : 'solar'} onChange={setCalendar} options={[{ value: 'solar', label: '양력' }, { value: 'lunar', label: '음력' }]} /></div>
          {!lunar && <DateField label="날짜" title={birthday ? '생일' : '기념일 날짜'} value={date} onChange={setDate} name="day-date" min="1900-01-01" max="2100-12-31" />}
          {lunar && (
            <div className={s.lunarRow} data-f="lunar">
              <label><select value={lunar.y} onChange={(e) => changeLunar({ y: +e.target.value })} aria-label="음력 해" data-lunar="y">
                {range(LUNAR_MIN_YEAR, LUNAR_MAX_YEAR).map((y) => <option key={y} value={y}>{y}년</option>)}
              </select></label>
              <label><select value={`${lunar.leap ? 'L' : ''}${lunar.m}`} onChange={(e) => changeLunar({ m: +e.target.value.replace('L', ''), leap: e.target.value.startsWith('L') })} aria-label="음력 달" data-lunar="m">
                {range(1, 12).flatMap((m) => [<option key={m} value={`${m}`}>{m}월</option>, ...(hasLeapMonth(lunar.y, m) ? [<option key={`L${m}`} value={`L${m}`}>윤{m}월</option>] : [])])}
              </select></label>
              <label><select value={lunar.d} onChange={(e) => changeLunar({ d: +e.target.value })} aria-label="음력 날" data-lunar="d">
                {range(1, lunarMonthDays(lunar.y, lunar.m, lunar.leap)).map((x) => <option key={x} value={x}>{x}일</option>)}
              </select></label>
            </div>
          )}
          {lunar && <p className={s.solarNote} data-f="lunar-solar">{solarOfLunar ? <>양력 <b>{fmtDay(solarOfLunar, true)}</b></> : '그해에는 그 날짜가 없어요'}</p>}
        </Group>

        {/* 반복 */}
        <Group title="반복">
          <div className={s.repeatGrid} role="radiogroup" aria-label="반복">
            {REPEATS.map((r) => (
              <button key={r.v} type="button" role="radio" aria-checked={repeat === r.v} className={`${s.repeatBtn} ${repeat === r.v ? s.repeatOn : ''}`} onClick={() => setRepeat(r.v)} data-repeat={r.v}>
                <b>{r.label}</b><small>{r.sub}</small>
              </button>
            ))}
          </div>
          {repeat === 'days' && (
            <label className={s.everyRow}>
              <input type="number" inputMode="numeric" min={2} max={10000} value={every} onChange={(e) => setEvery(e.target.value)} aria-label="며칠마다" data-f="day-every" />
              <span>일마다 (첫날을 1일로 세요)</span>
            </label>
          )}
        </Group>

        {/* 다음 그날 미리 보기 (3번) */}
        {upcoming.length > 0 && (
          <div className={s.dayPreview} data-f="day-preview">
            {upcoming.map((u, i) => (
              <p key={u.date} className={i ? s.nextMore : ''} data-next={u.date}>
                {u.daysLeft ? <>{i === 0 ? '다음은 ' : ''}<b>{u.label}</b><br />{fmtDay(u.date, true)}{u.lunar && <small> ({lunarLabel(u.lunar, false)})</small>} <span className={s.dDay}>D-{u.daysLeft.toLocaleString()}</span></>
                  : <>오늘이 <b>{u.label}</b>{hasBatchim(u.label) ? '이에요' : '예요'} 🎉</>}
              </p>
            ))}
          </div>
        )}
        {d && !upcoming.length && <p className={s.dayPreview} data-f="day-preview">이미 지난 날이에요 (한 번만 챙기는 날)</p>}
        {old && <button type="button" className={s.dayRemove} onClick={once(remove)} data-f="day-remove">이 기념일 지우기</button>}
      </div>
    </Page>
  );
}
