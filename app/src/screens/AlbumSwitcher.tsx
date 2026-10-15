import { useNavigate } from 'react-router-dom';
import { Sheet, toast } from '../components/ui';
import { Row, Group } from '../components/Form';
import { Icon } from '../components/Icon';
import { Logo } from '../components/Logo';
import { useSession } from '../state/session';
import { usePosts } from '../state/posts';

export function AlbumSwitcher({ open, onClose }: { open: boolean; onClose: () => void }) {
  const albums = useSession((st) => st.albums);
  const albumId = useSession((st) => st.albumId);
  const select = useSession((st) => st.selectAlbum);
  const nav = useNavigate();
  const pick = async (id: string) => {
    onClose();
    if (id === albumId) return;
    try {
      await select(id);
      usePosts.getState().reset(id);
      usePosts.getState().loadFirst();
      nav('/home');
    } catch (e) { toast((e as Error).message); }
  };
  return (
    <Sheet open={open} onClose={onClose} title="앨범">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-6)' }}>
        <Group>
          {albums.map((a) => (
            <Row key={a.id} icon={<Logo size={30} />} label={a.name} detail={a.myRole === 'owner' ? '관리자' : undefined} onClick={() => pick(a.id)} chevron={false}>
              {a.id === albumId && <Icon name="check" size={20} style={{ color: 'var(--c-accent-strong)' }} />}
            </Row>
          ))}
        </Group>
        <Group>
          <Row icon={<Icon name="plus" size={18} />} label="새 앨범 만들기" onClick={() => { onClose(); setTimeout(() => nav('/create'), 50); }} />
          <Row icon={<Icon name="link" size={18} />} label="초대 코드로 들어가기" onClick={() => { onClose(); setTimeout(() => nav('/join'), 50); }} />
        </Group>
      </div>
    </Sheet>
  );
}
