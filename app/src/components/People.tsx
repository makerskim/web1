// 가족 목록 한 줄: 얼굴 · 이름 · '나' · '관리자' (들어온 때 같은 건 보여 주지 않아요)
import type { ReactNode } from 'react';
import { Avatar } from './Avatar';
import { Icon } from './Icon';
import type { Member } from '../lib/types';
import s from './People.module.css';

export function PersonRow({ m, me, action }: { m: Member; me?: boolean; action?: ReactNode }) {
  return (
    <li className={s.row} data-person={m.userId}>
      <Avatar src={m.avatar} name={m.displayName} size={48} />
      <span className={s.name}>
        <b>{m.displayName}</b>
        {me && <em className={s.me}>나</em>}
        {m.role === 'owner' && <em className={s.owner}><Icon name="crown" size={12} stroke={2.2} />관리자</em>}
      </span>
      {action}
    </li>
  );
}

export function PeopleList({ children }: { children: ReactNode }) {
  return <ul className={s.list}>{children}</ul>;
}

// 좋아요한 가족 얼굴을 겹쳐서 (인스타그램처럼 작게)
export function FaceStack({ people, size = 22 }: { people: Member[]; size?: number }) {
  return (
    <span className={s.stack} aria-hidden="true">
      {people.map((m) => <span key={m.userId} className={s.stackFace}><Avatar src={m.avatar} name={m.displayName} size={size} /></span>)}
    </span>
  );
}
