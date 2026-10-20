// 아이 정보 입력: 태명 · 이름 · 출산 예정일(태어나면 생일). 한 명이 기본이고, 쌍둥이·다둥이는 '아이 추가'로.
import { Group, Field } from './Form';
import { DateField } from './DatePicker';
import { Icon } from './Icon';
import { MAX_KIDS, isBorn, newChild, type Child } from '../lib/kids';
import { ymd } from '../lib/dates';
import s from './KidsForm.module.css';

const ORDER = ['첫째', '둘째', '셋째', '넷째', '다섯째', '여섯째'];

export function KidsForm({ kids, onChange }: { kids: Child[]; onChange: (k: Child[]) => void }) {
  const set = (i: number, patch: Partial<Child>) => onChange(kids.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const today = ymd(new Date());
  const dueMax = ymd(new Date(Date.now() + 300 * 86400000)); // 예정일은 열 달 안쪽
  // 날짜를 고르면: 앞으로의 날짜는 예정일(뱃속), 지난 날짜는 생일(태어났어요). 오늘은 고른 그대로
  const pickDate = (i: number, v: string | null) => set(i, { birthday: v, ...(v && v > today ? { born: false } : v && v < today ? { born: true } : {}) });
  return (
    <div className={s.wrap}>
      {kids.map((c, i) => {
        const born = isBorn(c);
        const late = !born && !!c.birthday && c.birthday < today;
        const early = born && !!c.birthday && c.birthday > today;
        const footer = early ? '생일이 아직 오지 않았어요. 태어난 날로 바꿔 주세요.'
          : late ? '예정일이 지났어요. 태어났으면 ‘태어났어요’를 눌러 생일을 넣어 주세요.'
          : born && !c.name.trim() ? '태어났어요! 이름을 넣으면 앨범에 이름으로 보여요.'
          : i === 0 ? '태어나기 전엔 태명으로, 태어나면 이름으로 보여요.' : undefined;
        return (
          <Group key={c.id} title={kids.length > 1 ? `${ORDER[i]} 아이` : '아이'} footer={footer}>
            {/* 뱃속에 있어요 | 태어났어요: 예정일이 지나도 누르기 전까지는 '태어났다'고 하지 않아요 */}
            <div className={s.seg} role="group" aria-label="태어났는지" data-kid-born={i}>
              <button type="button" className={!born ? s.segOn : ''} aria-pressed={!born} onClick={() => set(i, { born: false })} data-born-opt="no">🤰 뱃속에 있어요</button>
              <button type="button" className={born ? s.segOn : ''} aria-pressed={born} onClick={() => set(i, { born: true })} data-born-opt="yes">👶 태어났어요</button>
            </div>
            <Field label="태명" value={c.nickname} onChange={(e) => set(i, { nickname: e.target.value })} maxLength={20} placeholder="튼튼이" name={`nick${i}`} autoComplete="off" />
            <Field label="이름" value={c.name} onChange={(e) => set(i, { name: e.target.value })} maxLength={20} placeholder={born ? '이름을 넣어 주세요' : '태어나면 넣어요'} name={`name${i}`} autoComplete="off" />
            {/* 뱃속이면 '출산 예정일', 태어났으면 '생일' */}
            <DateField label={born ? '생일' : '출산 예정일'} title={born ? '생일' : '출산 예정일'} value={c.birthday} onChange={(v) => pickDate(i, v)}
              name={`bday${i}`} min="2000-01-01" max={born ? today : dueMax} allowClear />
            {kids.length > 1 && (
              <button type="button" className={s.remove} onClick={() => onChange(kids.filter((_, j) => j !== i))} data-kid-remove={i}>
                <Icon name="minus" size={18} stroke={2.4} /> 이 아이 빼기
              </button>
            )}
          </Group>
        );
      })}
      {kids.length < MAX_KIDS && (
        <button type="button" className={s.add} onClick={() => onChange([...kids, newChild({ birthday: kids[0]?.birthday ?? null, born: kids[0] ? isBorn(kids[0]) : false })])} data-kid-add>
          <Icon name="plus" size={20} stroke={2.4} /> 아이 추가 <small>쌍둥이·다둥이</small>
        </button>
      )}
    </div>
  );
}
