import { Sheet, toast, copyText } from '../components/ui';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { QR, qrImage } from '../components/QR';
import { useAlbum } from '../state/session';
import { callName } from '../lib/korean';
import s from './Invite.module.css';

export const inviteLink = (code: string) => `${location.origin}${location.pathname}?invite=${code}`;
const fmt = (c: string) => `${c.slice(0, 4)}-${c.slice(4)}`;

export function InviteSheet({ open, onClose, welcome = false }: { open: boolean; onClose: () => void; welcome?: boolean }) {
  const album = useAlbum();
  if (!album) return null;
  const group = album.kind === 'group';
  const baby = album.babyName ? callName(album.babyName) : '우리 아이';
  const text = `${album.kind === 'baby' ? `${baby} 사진` : `‘${album.name}’`} 앨범에 초대해요 🤍\n카카오나 구글로 로그인한 뒤 초대 코드 ${fmt(album.inviteCode)} 를 넣어 주세요.\n${inviteLink(album.inviteCode)}`;
  const link = inviteLink(album.inviteCode);
  const share = async () => {
    if (navigator.share) {
      try { await navigator.share({ text }); return; } catch (e) { if ((e as Error).name === 'AbortError') return; }
    }
    if (await copyText(text)) toast(`초대 글을 복사했어요. ${group ? '단체' : '가족'} 대화방에 붙여 넣어 주세요.`);
  };
  // QR 사진: 대화방에 보내거나 저장해 두고 보여 주기
  const shareQR = async () => {
    try {
      const blob = await qrImage(link, album.name, fmt(album.inviteCode));
      const file = new File([blob], `${album.name.replace(/[\\/:*?"<>|]/g, '')}_초대QR.png`, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        try { await navigator.share({ files: [file], text: `${album.name} 초대 QR이에요. 카메라로 찍으면 들어올 수 있어요.` }); return; } catch (e) { if ((e as Error).name === 'AbortError') return; }
      }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(file);
      a.download = file.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      toast('QR 사진을 저장했어요');
    } catch (e) { toast((e as Error).message); }
  };
  const copyLink = async () => { if (await copyText(link)) toast('초대 링크를 복사했어요'); };
  return (
    <Sheet open={open} onClose={onClose} title={welcome ? '앨범을 만들었어요' : '초대하기'}>
      <div className={s.wrap}>
        <p className={s.lead}>{welcome ? `이제 ${group ? '멤버를' : '가족을'} 초대해 보세요. ` : ''}카메라로 QR을 찍거나, 로그인한 뒤 초대 코드를 넣으면 들어올 수 있어요.</p>
        <div className={s.card}>
          <div className={s.qrBox}><QR text={link} size={148} /></div>
          <button className={s.code} onClick={async () => { if (await copyText(album.inviteCode)) toast('코드를 복사했어요'); }} aria-label="초대 코드 복사">
            <small>초대 코드</small>
            <strong data-code={album.inviteCode}>{fmt(album.inviteCode)}</strong>
            <span>눌러서 복사</span>
          </button>
        </div>
        <Button size="lg" block onClick={share} data-f="invite-share"><Icon name="share" size={20} /> 초대 링크 보내기</Button>
        <div className={s.two}>
          <Button variant="secondary" onClick={shareQR} data-f="invite-qr"><Icon name="qr" size={18} /> QR 사진 보내기</Button>
          <Button variant="secondary" onClick={copyLink} data-f="invite-copy"><Icon name="link" size={18} /> 링크 복사</Button>
        </div>
        {welcome && <Button size="lg" block variant="plain" onClick={onClose}>나중에 할게요</Button>}
      </div>
    </Sheet>
  );
}
