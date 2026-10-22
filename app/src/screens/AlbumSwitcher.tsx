import { useNavigate } from 'react-router-dom';
import { Sheet, afterBack, toast } from '../components/ui';
import { Row, Group } from '../components/Form';
import { Icon } from '../components/Icon';
import { Logo } from '../components/Logo';
import { useSession } from '../state/session';
import { spaceAmp } from '../lib/kids';

export function AlbumSwitcher({ open, onClose }: { open: boolean; onClose: () => void }) {
  const albums = useSession((st) => st.albums);
  const albumId = useSession((st) => st.albumId);
  const select = useSession((st) => st.selectAlbum);
  const nav = useNavigate();
  const pick = async (id: string) => {
    onClose();
    if (id === albumId) return;
    // 시트가 쌓아 둔 기록이 먼저 빠진 다음 옮겨요 (늦게 빠지면 설정 화면으로 되돌아가요)
    await afterBack();
    // 사진은 홈 화면이 새 앨범으로 바뀌면서 불러와요 (두 번 부르지 않게)
    try {
      await select(id);
      nav('/home', { replace: true });
    } catch (e) { toast((e as Error).message); }
  };
  return (
    <Sheet open={open} onClose={onClose} title="앨범">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-6)' }}>
        <Group>
          {albums.map((a) => (
            <Row key={a.id} icon={<Logo size={30} />} label={spaceAmp(a.name)} detail={a.myRole === 'owner' ? '관리자' : undefined} onClick={() => pick(a.id)} chevron={false}>
              {a.id === albumId && <Icon name="check" size={20} style={{ color: 'var(--c-accent-strong)' }} />}
            </Row>
          ))}
        </Group>
        <Group>
          <Row icon={<Icon name="plus" size={18} />} label="새 앨범 만들기" onClick={async () => { onClose(); await afterBack(); nav('/create'); }} />
          <Row icon={<Icon name="link" size={18} />} label="초대 코드로 들어가기" onClick={async () => { onClose(); await afterBack(); nav('/join'); }} />
        </Group>
      </div>
    </Sheet>
  );
}
