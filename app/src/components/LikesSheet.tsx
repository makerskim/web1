// 리액션한 가족 목록 (누가 어떤 리액션을)
import { Sheet } from './ui';
import { PeopleList, PersonRow } from './People';
import { useSession } from '../state/session';
import { usePosts } from '../state/posts';
import type { Post } from '../lib/types';
import s from './LikesSheet.module.css';

export function LikesSheet({ post, onClose }: { post: Post | null; onClose: () => void }) {
  const live = usePosts((st) => (post ? st.byId[post.id] : undefined)) || post;
  const member = useSession((st) => st.member);
  const me = useSession((st) => st.me);
  return (
    <Sheet open={!!live} onClose={onClose} title="리액션">
      {live && (
        <PeopleList>
          {[...live.likes].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((l) => <PersonRow key={l.userId} m={member(l.userId)} me={l.userId === me?.id} action={<span className={s.emoji} data-emoji={l.emoji} aria-label={`리액션 ${l.emoji}`}>{l.emoji}</span>} />)}
        </PeopleList>
      )}
    </Sheet>
  );
}
