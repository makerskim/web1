import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Page, TopBar } from '../components/Bars';
import { PostCard } from '../components/PostCard';
import { openComments, usePostHandlers } from '../components/PostHub';
import { usePosts } from '../state/posts';
import * as api from '../lib/api';

export function PostPage() {
  const { id = '', extra } = useParams();
  const post = usePosts((st) => st.byId[id]);
  const [missing, setMissing] = useState(false);
  const handlers = usePostHandlers();
  useEffect(() => {
    let live = true;
    api.getPost(id).then((p) => {
      if (!live) return;
      // 없으면 (지워졌거나 '관리자만'으로 바뀌었으면) 들고 있던 것도 지워요
      if (p) { usePosts.getState().put(p); if (extra === 'c') openComments(p.id); } else { usePosts.getState().remove(id); setMissing(true); }
    }, () => { if (live && !usePosts.getState().byId[id]) setMissing(true); });
    return () => { live = false; };
  }, [id, extra]);
  return (
    <Page>
      <TopBar back title="게시물" />
      {post ? <PostCard post={post} h={handlers} full /> : missing ? <p style={{ textAlign: 'center', padding: '64px 16px', color: 'var(--c-label-3)' }}>지워졌거나 볼 수 없는 게시물이에요</p> : null}
    </Page>
  );
}
