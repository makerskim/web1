// 아이 정보 입력: 태명 · 이름 · 출산 예정일(태어나면 생일). 한 명이 기본이고, 쌍둥이·다둥이는 '아이 추가'로.
import { useState } from 'react';
import { Group, Field, Row } from './Form';
import { DateField, WeeksSheet } from './DatePicker';
import { Icon } from './Icon';
import { FULL_TERM, MAX_KIDS, TERM_MAX, dueInfo, isBorn, newChild, termDays, weeksIs, weeksText, type Child } from '../lib/kids';
import { addDays, daysBetween, ymd } from '../lib/dates';
import s from './KidsForm.module.css';

const ORDER = ['첫째', '둘째', '셋째', '넷째', '다섯째', '여섯째'];

export function KidsForm({ kids, onChange }: { kids: Child[]; onChange: (k: Child[]) => void }) {
  // 이름을 지우는 중에는 칸이 사라지지 않게 (키보드가 닫히지 않게)
  const [editing, setEditing] = useState<string | null>(null);
  // 임신 주수로 넣기 (몇 번째 아이)
  const [weeksFor, setWeeksFor] = useState<number | null>(null);
  const set = (i: number, patch: Partial<Child>) => onChange(kids.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const today = ymd(new Date());
  const dueMax = ymd(new Date(Date.now() + 300 * 86400000)); // 예정일은 열 달 안쪽
  // 날짜를 고르면: 앞으로의 날짜는 예정일(뱃속), 지난 날짜는 생일(태어났어요). 오늘은 고른 그대로
  const pickDate = (i: number, v: string | null) => set(i, { birthday: v, ...(v && v > today ? { born: false } : v && v < today ? { born: true } : {}) });
  // 임신 시작일: 쌍둥이(같은 예정일, 뱃속)는 같이 바뀌어요. 예정일이 비어 있으면 40주 뒤로 채워 줘요
  const pickStart = (i: number, v: string | null) => {
    const me = kids[i];
    onChange(kids.map((c, j) => {
      const twin = j === i || (!!me.birthday && c.birthday === me.birthday && !isBorn(c));
      if (!twin) return c;
      return { ...c, start: v, ...(v && !c.birthday ? { birthday: addDays(v, FULL_TERM), born: false } : {}) };
    }));
  };
  return (
    <div className={s.wrap}>
      {kids.map((c, i) => {
        const born = isBorn(c);
        const late = !born && !!c.birthday && c.birthday < today;
        const early = born && !!c.birthday && c.birthday > today;
        // 임신 주수: 임신 시작일이 있으면 그날부터, 없으면 예정일을 40주로
        const due = !born ? dueInfo(c) : null;
        const badTerm = !born && !!c.start && !!c.birthday && termDays(c) === null;
        const gest = !born && c.start ? daysBetween(c.start, today) : null;
        const footer = early ? '생일이 아직 오지 않았어요. 태어난 날로 바꿔 주세요.'
          : late ? '예정일이 지났어요. 태어났으면 ‘태어났어요’를 눌러 생일을 넣어 주세요.'
          : badTerm ? '임신 시작일과 출산 예정일 사이가 20주 ~ 44주가 되게 골라 주세요.'
          : born && !c.name.trim() ? '태어났어요! 이름을 넣으면 앨범에 이름으로 보여요.'
          : !born && due?.custom ? `출산 예정일엔 임신 ${weeksIs(due.dueWeek, due.dueDay)}. 태어나면 ‘태어났어요’를 눌러 주세요.`
          : !born ? '임신 시작일(마지막 생리 시작일)을 비워 두면 예정일을 40주로 계산해요. 쌍둥이처럼 일찍 낳을 예정이면 넣어 주세요.'
          : i === 0 ? '이름을 넣으면 태명 대신 이름으로 보여요.' : undefined;
        return (
          <Group key={c.id} title={kids.length > 1 ? `${ORDER[i]} 아이` : '아이'} footer={footer}>
            {/* 뱃속에 있어요 | 태어났어요: 예정일이 지나도 누르기 전까지는 '태어났다'고 하지 않아요 */}
            <div className={s.seg} role="group" aria-label="태어났는지" data-kid-born={i}>
              <button type="button" className={!born ? s.segOn : ''} aria-pressed={!born} onClick={() => set(i, { born: false })} data-born-opt="no">🤰 뱃속에 있어요</button>
              <button type="button" className={born ? s.segOn : ''} aria-pressed={born} onClick={() => set(i, { born: true })} data-born-opt="yes">👶 태어났어요</button>
            </div>
            {/* 뱃속에 있으면 태명만, 태어나면 이름(그리고 태명) */}
            {(born || !!c.name.trim() || editing === c.id) && (
              <Field label="이름" value={c.name} onChange={(e) => set(i, { name: e.target.value })} maxLength={20} placeholder="이름을 넣어 주세요" name={`name${i}`} autoComplete="off"
                onFocus={() => setEditing(c.id)} onBlur={() => setEditing((v) => (v === c.id ? null : v))} />
            )}
            <Field label="태명" value={c.nickname} onChange={(e) => set(i, { nickname: e.target.value })} maxLength={20} placeholder="튼튼이" name={`nick${i}`} autoComplete="off" />
            {/* 뱃속이면 '출산 예정일', 태어났으면 '생일' */}
            <DateField label={born ? '생일' : '출산 예정일'} title={born ? '생일' : '출산 예정일'} value={c.birthday} onChange={(v) => pickDate(i, v)}
              name={`bday${i}`} min="2000-01-01" max={born ? today : dueMax} allowClear />
            {/* 뱃속이면: 임신 시작일 (날짜로 또는 오늘 주수로) */}
            {!born && (
              <>
                <DateField label="임신 시작일" title="임신 시작일 (마지막 생리 시작일)" value={c.start ?? null} onChange={(v) => pickStart(i, v)} placeholder="선택"
                  name={`start${i}`} min={c.birthday ? addDays(c.birthday, -TERM_MAX) : '2000-01-01'} max={today} allowClear />
                <Row label="오늘 임신 주수" detail={gest !== null && gest >= 0 ? weeksText(Math.floor(gest / 7), gest % 7) : due ? `${weeksText(due.week, due.day)} (40주 기준)` : '고르기'}
                  onClick={() => setWeeksFor(i)} data-row={`weeks${i}`} />
              </>
            )}
            {kids.length > 1 && (
              <button type="button" className={s.remove} onClick={() => onChange(kids.filter((_, j) => j !== i))} data-kid-remove={i}>
                <Icon name="minus" size={18} stroke={2.4} /> 이 아이 빼기
              </button>
            )}
          </Group>
        );
      })}
      <WeeksSheet open={weeksFor !== null} onClose={() => setWeeksFor(null)} start={weeksFor !== null ? kids[weeksFor]?.start ?? null : null}
        due={weeksFor !== null ? kids[weeksFor]?.birthday ?? null : null} onChange={(v) => weeksFor !== null && pickStart(weeksFor, v)} />
      {kids.length < MAX_KIDS && (
        <button type="button" className={s.add} onClick={() => onChange([...kids, newChild({ birthday: kids[0]?.birthday ?? null, born: kids[0] ? isBorn(kids[0]) : false, start: kids[0]?.start ?? null })])} data-kid-add>
          <Icon name="plus" size={20} stroke={2.4} /> 아이 추가 <small>쌍둥이·다둥이</small>
        </button>
      )}
    </div>
  );
}
