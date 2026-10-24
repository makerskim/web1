// 앨범 종류 고르기: 아기 · 가족 · 친구·모임 (새 앨범 · 설정에서 같이 써요)
import { useState } from 'react';
import { Sheet, toast } from './ui';
import { KINDS, kindInfo } from '../lib/album';
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

/** 설정: 앨범 종류 바꾸기. 누르면 바로 바뀌어요 (모든 멤버에게 같이) · 잘못 눌렀으면 알림의 '되돌리기' */
export function KindSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const album = useAlbum();
  const [busy, setBusy] = useState<AlbumKind | null>(null);
  if (!album) return null;
  const set = async (albumId: string, kind: AlbumKind) => {
    await api.updateAlbum(albumId, { kind });
    if (useSession.getState().albumId === albumId) useSession.getState().patchAlbum({ kind });
  };
  const change = async (kind: AlbumKind) => {
    if (busy) return;
    if (kind === album.kind) { onClose(); return; }
    setBusy(kind);
    const albumId = album.id;
    const before = album.kind;
    try {
      await set(albumId, kind);
      onClose();
      toast(`${kindInfo(kind).label}으로 바꿨어요`, {
        action: '되돌리기',
        onAction: () => set(albumId, before).then(() => toast(`${kindInfo(before).label}으로 되돌렸어요`), (e) => toast((e as Error).message)),
      });
    } catch (e) { toast((e as Error).message); } finally { setBusy(null); }
  };
  return (
    <Sheet open={open} onClose={onClose} title="앨범 종류">
      <div className={s.list} role="radiogroup" aria-label="앨범 종류">
        {KINDS.map((k) => {
          const now = album.kind === k.v;
          return (
            <button key={k.v} type="button" role="radio" aria-checked={now} className={`${s.row} ${now ? s.rowOn : ''}`} data-kind={k.v}
              onClick={() => change(k.v)} disabled={!!busy}>
              <span className={s.rowIcon} aria-hidden="true">{k.icon}</span>
              <span className={s.rowText}><b>{k.label}</b><small>{k.desc}</small></span>
              {now ? <em className={s.now} data-f="kind-now">지금 앨범 종류</em> : busy === k.v ? <i className={s.spin} /> : null}
            </button>
          );
        })}
      </div>
      <p className={s.who}>누르면 바로 바뀌고, 모든 멤버의 화면이 함께 바뀌어요.</p>
    </Sheet>
  );
}
