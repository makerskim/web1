import { useState } from 'react';
import { motion } from 'motion/react';
import { Logo } from '../components/Logo';
import { toast } from '../components/ui';
import { signIn } from '../lib/api';
import { isKakaoInApp } from '../lib/device';
import s from './Landing.module.css';

const ease = [0.22, 1, 0.36, 1] as const;
const rise = (d: number) => ({ initial: { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.8, ease, delay: d } });

// 첫 화면: 로그인만
export function Landing() {
  const [busy, setBusy] = useState<string | null>(null);
  const go = async (p: 'kakao' | 'google') => {
    // 구글은 카카오톡 안의 브라우저에서 로그인을 막아요 → 휴대폰 브라우저로 열기
    if (p === 'google' && isKakaoInApp()) {
      location.href = `kakaotalk://web/openExternal?url=${encodeURIComponent(location.href)}`;
      return;
    }
    setBusy(p);
    try { await signIn(p); } catch (e) { toast((e as Error).message); setBusy(null); }
  };
  return (
    <div className={s.wrap}>
      <div className={s.glow} aria-hidden="true"><i /><i /><i /></div>
      <div className={s.hero}>
        <motion.div {...rise(0)} className={s.logo}><Logo size={88} /></motion.div>
        <motion.h1 {...rise(0.08)} className={s.brand}>Pastel Memories</motion.h1>
        <motion.p {...rise(0.16)} className={s.tag}>우리 아이의 하루를,<br />가족과 함께 간직해요.</motion.p>
      </div>
      <motion.div {...rise(0.28)} className={s.actions}>
        <button className={`${s.btn} ${s.kakao}`} onClick={() => go('kakao')} disabled={!!busy} data-login="kakao">
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="#000" d="M12 3C6.48 3 2 6.48 2 10.78c0 2.78 1.86 5.21 4.66 6.59l-.95 3.46c-.08.3.26.54.52.37l4.13-2.73c.53.06 1.08.1 1.64.1 5.52 0 10-3.48 10-7.79C22 6.48 17.52 3 12 3z" /></svg>
          {busy === 'kakao' ? '카카오로 이동 중…' : '카카오로 시작하기'}
        </button>
        <button className={`${s.btn} ${s.google}`} onClick={() => go('google')} disabled={!!busy} data-login="google">
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" /><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" /><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" /><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" /></svg>
          {busy === 'google' ? 'Google로 이동 중…' : 'Google로 시작하기'}
        </button>
        <p className={s.note}>가족끼리만 보는 비공개 앨범이에요</p>
      </motion.div>
    </div>
  );
}
