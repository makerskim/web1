// 아이 정보 입력: 태명 · 이름 · 생일(예정일). 한 명이 기본이고, 쌍둥이·다둥이는 '아이 추가'로.
import { Group, Field } from './Form';
import { DateField } from './DatePicker';
import { Icon } from './Icon';
import { MAX_KIDS, isBorn, newChild, type Child } from '../lib/kids';
import { ymd } from '../lib/dates';
import s from './KidsForm.module.css';

const ORDER = ['첫째', '둘째', '셋째', '넷째', '다섯째', '여섯째'];

export function KidsForm({ kids, onChange }: { kids: Child[]; onChange: (k: Child[]) => void }) {
  const set = (i: number, patch: Partial<Child>) => onChange(kids.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const max = ymd(new Date(Date.now() + 300 * 86400000)); // 예정일은 열 달 안쪽
  return (
    <div className={s.wrap}>
      {kids.map((c, i) => {
        const born = isBorn(c);
        return (
          <Group key={c.id} title={kids.length > 1 ? `${ORDER[i]} 아이` : '아이'}
            footer={born && !c.name.trim() ? '태어났어요! 이름을 넣으면 앨범에 이름으로 보여요.' : i === 0 ? '태어나기 전엔 태명으로, 태어나면 이름으로 보여요.' : undefined}>
            <Field label="태명" value={c.nickname} onChange={(e) => set(i, { nickname: e.target.value })} maxLength={20} placeholder="튼튼이" name={`nick${i}`} autoComplete="off" />
            <Field label="이름" value={c.name} onChange={(e) => set(i, { name: e.target.value })} maxLength={20} placeholder={born ? '이름을 넣어 주세요' : '태어나면 넣어요'} name={`name${i}`} autoComplete="off" />
            <DateField label={born ? '생일' : '생일·예정일'} title={born ? '생일' : '생일 또는 출산 예정일'} value={c.birthday} onChange={(v) => set(i, { birthday: v })}
              name={`bday${i}`} min="2000-01-01" max={max} allowClear />
            {kids.length > 1 && (
              <button type="button" className={s.remove} onClick={() => onChange(kids.filter((_, j) => j !== i))} data-kid-remove={i}>
                <Icon name="minus" size={18} stroke={2.4} /> 이 아이 빼기
              </button>
            )}
          </Group>
        );
      })}
      {kids.length < MAX_KIDS && (
        <button type="button" className={s.add} onClick={() => onChange([...kids, newChild({ birthday: kids[0]?.birthday ?? null })])} data-kid-add>
          <Icon name="plus" size={20} stroke={2.4} /> 아이 추가 <small>쌍둥이·다둥이</small>
        </button>
      )}
    </div>
  );
}
