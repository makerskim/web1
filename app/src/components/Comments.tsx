import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Sheet, confirm, toast } from './ui';
import { Avatar } from './Avatar';
import { useSession } from '../state/session';
import { usePosts } from '../state/posts';
import { addComment, deleteComment } from '../state/actions';
import { timeAgo } from '../lib/dates';
import type { Post } from '../lib/types';
import s from './Comments.module.css';

// 자판이 가리는 높이 (iOS·안드로이드 모두 보이는 영역 기준으로 재요)
function useKeyboardInset(on: boolean) {
  const [kb, setKb] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!on || !vv) return;
    const measure = () => {
      const k = Math.round(window.innerHeight - vv.height - vv.offsetTop);
      setKb(k > 80 ? k : 0);
    };
    measure();
    vv.addEventListener('resize', measure);
    vv.addEventListener('scroll', measure);
    return () => { vv.removeEventListener('resize', measure); vv.removeEventListener('scroll', measure); };
  }, [on]);
  return on ? kb : 0;
}

export function Comments({ post, open, onClose }: { post: Post | null; open: boolean; onClose: () => void }) {
  const live = usePosts((st) => (post ? st.byId[post.id] : undefined)) || post;
  const member = useSession((st) => st.member);
  const me = useSession((st) => st.me);
  const isOwner = useSession((st) => st.isOwner());
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const count = live?.comments.length ?? 0;
  const kb = useKeyboardInset(open);
  const kbOpen = kb > 0;

  // 새 댓글이 생기거나 자판이 올라오면 맨 아래 댓글이 보이게
  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' }); }, [count]);
  // 자판이 올라올 때만 (닫힐 때나 확대할 때는 읽던 자리 그대로)
  useEffect(() => { if (kbOpen) list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' }); }, [kbOpen]);
  useEffect(() => { if (!open) setText(''); }, [open]);

  const send = async (body: string) => {
    if (!live || !body.trim() || busy) return;
    setBusy(true);
    try {
      const c = await addComment(live, body.trim());
      setText('');
      toast('댓글을 남겼어요', { action: '되돌리기', onAction: () => deleteComment(usePosts.getState().byId[live.id] || live, c.id).catch((e) => toast(e.message)) });
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const author = live ? member(live.authorId) : null;
  return (
    <Sheet open={open && !!live} onClose={onClose} title="댓글" tall className={s.sheet}>
      {live && author && (
        <div className={s.wrap}>
          <div className={s.list} ref={list}>
            {live.caption && (
              <div className={`${s.row} ${s.cap}`}>
                <Avatar src={author.avatar} name={author.displayName} size={32} />
                <p><b>{author.displayName}</b> {live.caption}<time>{timeAgo(live.createdAt)}</time></p>
              </div>
            )}
            {!live.comments.length && <p className={s.empty}>첫 댓글을 남겨 보세요</p>}
            <AnimatePresence initial={false}>
              {live.comments.map((c) => {
                const m = member(c.authorId);
                const canDel = c.authorId === me?.id || isOwner;
                return (
                  <motion.div key={c.id} className={s.row} data-cmt={c.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }}>
                    <Avatar src={m.avatar} name={m.displayName} size={32} />
                    <p>
                      <b>{m.displayName}</b> {c.body}
                      <time>{timeAgo(c.createdAt)}{canDel && (
                        <button className={s.del} onClick={async () => {
                          if (await confirm({ title: '댓글을 지울까요?', ok: '지우기', danger: true })) deleteComment(live, c.id).catch((e) => toast(e.message));
                        }}>지우기</button>
                      )}</time>
                    </p>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
          {/* 이모티콘은 휴대폰 자판으로 넣어요. 자판이 올라오면 입력칸이 그 바로 위에 와요 */}
          <div className={s.composer} style={{ '--kb': `${kb}px` } as CSSProperties} data-kb={kbOpen ? '' : undefined}>
            <form className={s.form} onSubmit={(e) => { e.preventDefault(); send(text); }}>
              <Avatar src={me ? member(me.id).avatar : ''} name={me ? member(me.id).displayName : ''} size={32} />
              <div className={s.pill}>
                <input value={text} onChange={(e) => setText(e.target.value)} placeholder="댓글 달기…" maxLength={1000} enterKeyHint="send" aria-label="댓글" />
                <button type="submit" disabled={!text.trim() || busy} className={s.post}>게시</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Sheet>
  );
}
