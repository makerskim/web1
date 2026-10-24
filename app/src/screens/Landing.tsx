import { useState } from 'react';
import { motion } from 'motion/react';
import { Logo } from '../components/Logo';
import { GoogleIcon, KakaoIcon } from '../components/ProviderIcon';
import { toast } from '../components/ui';
import { signIn } from '../lib/api';
import { isKakaoInApp } from '../lib/device';
import s from './Landing.module.css';

const ease = [0.22, 1, 0.36, 1] as const;
const rise = (d: number) => ({ initial: { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.8, ease, delay: d } });

// 첫 화면: 로고와 로그인 버튼만
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
      </div>
      <motion.div {...rise(0.2)} className={s.actions}>
        <button className={`${s.btn} ${s.kakao}`} onClick={() => go('kakao')} disabled={!!busy} data-login="kakao">
          <KakaoIcon />
          {busy === 'kakao' ? '카카오로 이동 중…' : '카카오 로그인'}
        </button>
        <button className={`${s.btn} ${s.google}`} onClick={() => go('google')} disabled={!!busy} data-login="google">
          <GoogleIcon />
          {busy === 'google' ? 'Google로 이동 중…' : 'Google 로그인'}
        </button>
        <p className={s.note} data-f="login-note">사진·동영상은 올린 사람의 구글 드라이브에 저장돼요. 카카오로 로그인해도 사진을 올릴 때 구글 로그인을 한 번 해요.</p>
        <a className={s.policy} href="privacy.html" target="_blank" rel="noopener" data-f="privacy">개인정보처리방침</a>
      </motion.div>
    </div>
  );
}
