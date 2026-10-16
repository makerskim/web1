// 좋아요한 가족 목록
import { Sheet } from './ui';
import { PeopleList, PersonRow } from './People';
import { useSession } from '../state/session';
import { usePosts } from '../state/posts';
import type { Post } from '../lib/types';

export function LikesSheet({ post, onClose }: { post: Post | null; onClose: () => void }) {
  const live = usePosts((st) => (post ? st.byId[post.id] : undefined)) || post;
  const member = useSession((st) => st.member);
  const me = useSession((st) => st.me);
  return (
    <Sheet open={!!live} onClose={onClose} title="좋아요">
      {live && (
        <PeopleList>
          {[...live.likes].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((l) => <PersonRow key={l.userId} m={member(l.userId)} me={l.userId === me?.id} />)}
        </PeopleList>
      )}
    </Sheet>
  );
}
