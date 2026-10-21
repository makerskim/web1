import { Sheet, toast, copyText } from '../components/ui';
import { Button } from '../components/Button';
import { useAlbum } from '../state/session';
import { callName } from '../lib/korean';
import s from './Invite.module.css';

export const inviteLink = (code: string) => `${location.origin}${location.pathname}?invite=${code}`;
const fmt = (c: string) => `${c.slice(0, 4)}-${c.slice(4)}`;

export function InviteSheet({ open, onClose, welcome = false }: { open: boolean; onClose: () => void; welcome?: boolean }) {
  const album = useAlbum();
  if (!album) return null;
  const baby = album.babyName ? callName(album.babyName) : '우리 아이';
  const text = `${baby} 사진 앨범에 초대해요 🤍\n카카오나 구글로 로그인한 뒤 초대 코드 ${fmt(album.inviteCode)} 를 넣어 주세요.\n${inviteLink(album.inviteCode)}`;
  const share = async () => {
    if (navigator.share) {
      try { await navigator.share({ text }); return; } catch (e) { if ((e as Error).name === 'AbortError') return; }
    }
    if (await copyText(text)) toast('초대 글을 복사했어요. 가족 대화방에 붙여 넣어 주세요.');
  };
  return (
    <Sheet open={open} onClose={onClose} title={welcome ? '앨범을 만들었어요' : '초대하기'}>
      <div className={s.wrap}>
        <p className={s.lead}>{welcome ? '이제 가족을 초대해 보세요. ' : ''}초대받은 가족은 로그인한 뒤 이 코드를 넣으면 들어올 수 있어요.</p>
        <button className={s.code} onClick={async () => { if (await copyText(album.inviteCode)) toast('코드를 복사했어요'); }} aria-label="초대 코드 복사">
          <small>초대 코드</small>
          <strong data-code={album.inviteCode}>{fmt(album.inviteCode)}</strong>
          <span>눌러서 복사</span>
        </button>
        <Button size="lg" block onClick={share}>초대 링크 보내기</Button>
        {welcome && <Button size="lg" block variant="secondary" onClick={onClose}>나중에 할게요</Button>}
      </div>
    </Sheet>
  );
}
