// 아이(들): 태어나기 전엔 태명, 태어나면 이름. 한 명이 기본이고 쌍둥이·다둥이는 더 넣을 수 있어요.
import { uuid } from './uuid';
import { babyDay, toDate } from './dates';
import { callName } from './korean';

export interface Child {
  id: string;
  /** 태명 (씩씩이) */
  nickname: string;
  /** 이름 (태어난 뒤에 넣어요) */
  name: string;
  /** 생일 또는 출산 예정일 'YYYY-MM-DD' */
  birthday: string | null;
}

export const MAX_KIDS = 6;
export const newChild = (p: Partial<Child> = {}): Child => ({ id: uuid(), nickname: '', name: '', birthday: null, ...p });

/** 보이는 이름: 이름이 있으면 이름, 없으면 태명 */
export const childName = (c: Child) => (c.name.trim() || c.nickname.trim());

/** 태어났는지 (생일이 오늘이거나 지났으면) */
export const isBorn = (c: Child, at: Date = new Date()) => {
  const d = babyDay(c.birthday, at);
  return d !== null && d >= 1;
};

/** 태어났는데 아직 이름이 없는 아이 */
export const needsName = (c: Child) => isBorn(c) && !c.name.trim();

/** '씩씩이 & 튼튼이' */
export const kidsLabel = (kids: Child[]) => kids.map(childName).filter(Boolean).join(' & ');

/** 앨범 이름 추천: '씩씩이 & 튼튼이네 앨범' (받침 있는 이름은 '하준이') */
export function suggestAlbumName(kids: Child[]) {
  const names = kids.map(childName).filter(Boolean);
  if (!names.length) return '';
  return `${names.map(callName).join(' & ')}네 앨범`;
}

/** '&' 양쪽에 한 칸씩 (씩씩이&튼튼이 → 씩씩이 & 튼튼이) */
export const spaceAmp = (s: string) => s.replace(/\s*&\s*/g, ' & ').replace(/\s{2,}/g, ' ').trim();

/** 나이·디데이 기준이 되는 아이 (첫 번째) */
export const primary = (kids: Child[]) => kids[0] || null;

/** 예전 앨범(아이 정보가 baby_name/baby_birthday 하나뿐)도 같은 모양으로 */
export function kidsFrom(raw: unknown, babyName: string, babyBirthday: string | null): Child[] {
  if (Array.isArray(raw) && raw.length) {
    return raw.filter((x) => x && typeof x === 'object').map((x: Record<string, unknown>) => ({
      id: typeof x.id === 'string' ? x.id : uuid(),
      nickname: typeof x.nickname === 'string' ? x.nickname : '',
      name: typeof x.name === 'string' ? x.name : '',
      birthday: typeof x.birthday === 'string' && toDate(x.birthday) ? x.birthday : null,
    }));
  }
  if (babyName || babyBirthday) return [newChild({ name: babyName || '', birthday: babyBirthday })];
  return [];
}

/** 앨범에 바로 반영할 값 (보이는 이름·기준 생일 포함) */
export const kidsPatch = (kids: Child[]) => ({ children: kids, babyName: kidsLabel(kids), babyBirthday: kids[0]?.birthday ?? null });
