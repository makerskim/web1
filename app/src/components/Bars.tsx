import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Icon, type IconName } from './Icon';
import s from './Bars.module.css';

// 위쪽 막대: 스크롤하면 유리처럼 흐려지고 얇은 선이 생겨요
export function TopBar({ title, left, right, large = false, back = false }: {
  title?: ReactNode; left?: ReactNode; right?: ReactNode; large?: boolean; back?: boolean;
}) {
  const [scrolled, setScrolled] = useState(false);
  const nav = useNavigate();
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 4);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  if (large) {
    return (
      <header className={`${s.top} ${s.large} ${scrolled ? s.scrolled : ''}`}>
        <div className={s.titleLarge}>{title}</div>
        <div className={`${s.side} ${s.right}`}>{right}</div>
      </header>
    );
  }
  return (
    <header className={`${s.top} ${scrolled ? s.scrolled : ''}`}>
      <div className={s.side}>
        {back && <button className={s.iconBtn} onClick={() => (history.length > 1 ? nav(-1) : nav('/'))} aria-label="뒤로"><Icon name="back" size={26} /></button>}
        {left}
      </div>
      <div className={s.title}>{title}</div>
      <div className={`${s.side} ${s.right}`}>{right}</div>
    </header>
  );
}

export function IconButton({ icon, label, onClick, badge }: { icon: IconName; label: string; onClick?: () => void; badge?: boolean }) {
  return (
    <motion.button whileTap={{ scale: 0.9 }} className={s.iconBtn} onClick={onClick} aria-label={label}>
      <Icon name={icon} size={24} />
      {badge && <i className={s.dot} />}
    </motion.button>
  );
}

const TABS: Array<{ to: string; icon: IconName; label: string }> = [
  { to: '/home', icon: 'home', label: '홈' },
  { to: '/grid', icon: 'grid', label: '모아보기' },
  { to: '/new', icon: 'plus', label: '올리기' },
  { to: '/activity', icon: 'heart', label: '소식' },
  { to: '/album', icon: 'users', label: '가족' },
];

export function TabBar({ onCompose, badge }: { onCompose: () => void; badge?: { activity?: number; home?: boolean } }) {
  return (
    <nav className={s.tabs} aria-label="메뉴">
      {TABS.map((t) => (t.to === '/new' ? (
        <motion.button key={t.to} whileTap={{ scale: 0.9 }} className={`${s.tab} ${s.compose}`} onClick={onCompose} aria-label="사진 올리기" data-tab="new">
          <span className={s.plus}><Icon name="plus" size={22} stroke={2.4} /></span>
        </motion.button>
      ) : (
        <NavLink key={t.to} to={t.to} className={({ isActive }) => `${s.tab} ${isActive ? s.on : ''}`} data-tab={t.to.slice(1)} aria-label={t.label}>
          {({ isActive }) => (
            <>
              <Icon name={t.icon} size={26} stroke={isActive ? 2.2 : 1.7} filled={isActive && t.icon !== 'grid'} />
              <span>{t.label}</span>
              {t.to === '/activity' && !!badge?.activity && <i className={s.badge}>{badge.activity > 9 ? '9+' : badge.activity}</i>}
              {t.to === '/home' && badge?.home && <i className={s.dot} />}
            </>
          )}
        </NavLink>
      )))}
    </nav>
  );
}

// 화면 전환: 살짝 올라오며 나타나기
export function Page({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <motion.main className={`${s.page} ${className}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}>
      {children}
    </motion.main>
  );
}
