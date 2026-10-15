import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Sheet, confirm, toast } from './ui';
import { Avatar } from './Avatar';
import { useSession } from '../state/session';
import { usePosts } from '../state/posts';
import { addComment, deleteComment } from '../state/actions';
import { timeAgo } from '../lib/dates';
import type { Post } from '../lib/types';
import s from './Comments.module.css';

const EMOJIS = ['❤️', '🥰', '😍', '👏', '😂', '🥹', '👍', '🎉'];

export function Comments({ post, open, onClose }: { post: Post | null; open: boolean; onClose: () => void }) {
  const live = usePosts((st) => (post ? st.byId[post.id] : undefined)) || post;
  const member = useSession((st) => st.member);
  const me = useSession((st) => st.me);
  const isOwner = useSession((st) => st.isOwner());
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const count = live?.comments.length ?? 0;

  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' }); }, [count]);
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
          <div className={s.composer}>
            <div className={s.emojis}>
              {EMOJIS.map((e) => (
                <button key={e} type="button" onPointerDown={(ev) => { if (document.activeElement === input.current) ev.preventDefault(); }}
                  onClick={() => setText((t) => t + e)} aria-label={`${e} 넣기`} data-emoji={e}>{e}</button>
              ))}
            </div>
            <form className={s.form} onSubmit={(e) => { e.preventDefault(); send(text); }}>
              <Avatar src={me ? member(me.id).avatar : ''} name={me ? member(me.id).displayName : ''} size={32} />
              <div className={s.pill}>
                <input ref={input} value={text} onChange={(e) => setText(e.target.value)} placeholder="댓글 달기…" maxLength={1000} enterKeyHint="send" aria-label="댓글" />
                <button type="submit" disabled={!text.trim() || busy} className={s.post}>게시</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Sheet>
  );
}
