// 앨범 종류 고르기: 아기 · 가족 · 친구·모임 (새 앨범 · 설정에서 같이 써요)
import { useEffect, useState } from 'react';
import { Sheet, toast } from './ui';
import { Button } from './Button';
import { KINDS, kindInfo, sinceLabel } from '../lib/album';
import { useAlbum, useSession } from '../state/session';
import * as api from '../lib/api';
import type { AlbumKind } from '../lib/types';
import s from './KindPicker.module.css';

export function KindPicker({ value, onChange }: { value: AlbumKind; onChange: (k: AlbumKind) => void }) {
  return (
    <div className={s.kinds} role="radiogroup" aria-label="앨범 종류">
      {KINDS.map((k) => (
        <button key={k.v} type="button" role="radio" aria-checked={value === k.v} className={`${s.kind} ${value === k.v ? s.kindOn : ''}`} data-kind={k.v}
          onClick={() => onChange(k.v)}>
          <span aria-hidden="true">{k.icon}</span><b>{k.short}</b><small>{k.desc}</small>
        </button>
      ))}
    </div>
  );
}

/** 바꾸면 무엇이 달라지는지 한 줄로 */
function changeNote(from: AlbumKind, to: AlbumKind) {
  if (from === to) return '지금 이 앨범의 종류예요.';
  const keep = from === 'baby' ? ' 아이 정보는 지우지 않고 그대로 둬요.' : '';
  if (to === 'baby') return '출산 예정일까지 남은 날과 임신 주수, 태어난 뒤엔 아이 나이를 보여 줘요. 아래 탭 이름은 ‘가족’이에요.';
  return `${sinceLabel(to)}부터 함께한 날과 다음 100일 · 1주년을 보여 줘요. 아래 탭 이름은 ‘${to === 'group' ? '모임' : '가족'}’이에요.${keep}`;
}

/** 설정: 앨범 종류 바꾸기 (고른 뒤 '바꾸기'를 눌러야 바뀌어요. 모든 멤버에게 같이 바뀌어요) */
export function KindSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const album = useAlbum();
  const [pick, setPick] = useState<AlbumKind>(album?.kind ?? 'baby');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open && album) setPick(album.kind); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!album) return null;
  const same = pick === album.kind;
  const apply = async () => {
    if (busy || same) return;
    setBusy(true);
    const albumId = album.id;
    try {
      await api.updateAlbum(albumId, { kind: pick });
      if (useSession.getState().albumId === albumId) useSession.getState().patchAlbum({ kind: pick });
      onClose();
      toast(`${kindInfo(pick).label}으로 바꿨어요`);
    } catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Sheet open={open} onClose={onClose} title="앨범 종류">
      <div className={s.sheet}>
        <KindPicker value={pick} onChange={setPick} />
        <p className={s.note} data-f="kind-note">{changeNote(album.kind, pick)}</p>
        <p className={s.who}>모든 멤버의 화면이 함께 바뀌어요.</p>
        <Button block onClick={apply} disabled={busy || same} data-f="kind-apply">
          {busy ? '바꾸는 중…' : same ? '지금 종류예요' : `${kindInfo(pick).label}으로 바꾸기`}
        </Button>
      </div>
    </Sheet>
  );
}
