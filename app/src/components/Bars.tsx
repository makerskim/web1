import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Icon, type IconName } from './Icon';
import { markBack, scrollPageTop, usePageScroll } from './Stack';
import { useSession } from '../state/session';
import s from './Bars.module.css';

// 위쪽 막대: 스크롤하면 유리처럼 흐려지고 얇은 선이 생겨요
export function TopBar({ title, left, right, large = false, back = false, white = false }: {
  title?: ReactNode; left?: ReactNode; right?: ReactNode; large?: boolean; back?: boolean;
  /** 아래 게시물과 같은 흰색 (홈) */
  white?: boolean;
}) {
  const [scrolled, setScrolled] = useState(false);
  const nav = useNavigate();
  // 화면마다 스크롤이 따로라서, 이 화면의 스크롤을 봐요
  const sc = usePageScroll();
  useEffect(() => {
    const on = () => setScrolled((sc ? sc.scrollTop : window.scrollY) > 4);
    on();
    const target: HTMLElement | Window = sc || window;
    target.addEventListener('scroll', on, { passive: true });
    return () => target.removeEventListener('scroll', on);
  }, [sc]);
  if (large) {
    return (
      <header className={`${s.top} ${s.large} ${scrolled ? s.scrolled : ''} ${white ? s.white : ''}`}>
        <div className={s.titleLarge}>{title}</div>
        <div className={`${s.side} ${s.right}`}>{right}</div>
      </header>
    );
  }
  return (
    <header className={`${s.top} ${scrolled ? s.scrolled : ''}`}>
      <div className={s.side}>
        {back && <button className={s.iconBtn} onClick={() => { if (history.length > 1) { markBack(); nav(-1); } else nav('/'); }} aria-label="뒤로" data-back><Icon name="back" size={26} /></button>}
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
  const loc = useLocation();
  // 친구·모임 앨범이면 '가족' 대신 '모임'
  const group = useSession((st) => st.album()?.kind === 'group'); // 가족·아기 앨범은 '가족'
  return (
    <nav className={s.tabs} aria-label="메뉴">
      {TABS.map((t) => (t.to === '/new' ? (
        <motion.button key={t.to} whileTap={{ scale: 0.9 }} className={`${s.tab} ${s.compose}`} onClick={onCompose} aria-label="사진 올리기" data-tab="new">
          <span className={s.plus}><Icon name="plus" size={22} stroke={2.4} /></span>
        </motion.button>
      ) : (
        <NavLink key={t.to} to={t.to} className={({ isActive }) => `${s.tab} ${isActive ? s.on : ''}`} data-tab={t.to.slice(1)} aria-label={t.to === '/album' && group ? '모임' : t.label}
          onClick={(e) => { if (loc.pathname === t.to) { e.preventDefault(); scrollPageTop(true); } }}>
          {({ isActive }) => (
            <>
              <Icon name={t.icon} size={26} stroke={isActive ? 2.2 : 1.7} filled={isActive && t.icon !== 'grid'} />
              <span>{t.to === '/album' && group ? '모임' : t.label}</span>
              {t.to === '/activity' && !!badge?.activity && <i className={s.badge}>{badge.activity > 9 ? '9+' : badge.activity}</i>}
              {t.to === '/home' && badge?.home && <i className={s.dot} />}
            </>
          )}
        </NavLink>
      )))}
    </nav>
  );
}

// 화면 한 장 (넘어가는 움직임은 Stack이 맡아요)
export function Page({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <main className={`${s.page} ${className}`}>{children}</main>;
}
