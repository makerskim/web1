import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { TopBar } from '../components/Bars';
import { Button } from '../components/Button';
import { Field, Group } from '../components/Form';
import { Avatar } from '../components/Avatar';
import { Logo } from '../components/Logo';
import { progress, toast } from '../components/ui';
import { useSession } from '../state/session';
import * as api from '../lib/api';
import { childName, isBorn, newChild, spaceAmp, suggestAlbumName, termDays, type Child } from '../lib/kids';
import { callName } from '../lib/korean';
import { ymd } from '../lib/dates';
import { DateField } from '../components/DatePicker';
import type { AlbumKind } from '../lib/types';
import { sinceLabel } from '../lib/album';
import { KindPicker } from '../components/KindPicker';
import { KidsForm } from '../components/KidsForm';
import s from './Start.module.css';

const cleanCode = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
const fmtCode = (c: string) => (c.length > 4 ? `${c.slice(0, 4)}-${c.slice(4)}` : c);

// 로그인했지만 앨범이 아직 없을 때
export function Start() {
  const me = useSession((st) => st.me)!;
  const nav = useNavigate();
  return (
    <div className={s.start}>
      <motion.div className={s.hello} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}>
        <Avatar src={me.avatarUrl} name={me.name} size={72} />
        <h1>{me.name ? `${me.name}님, 반가워요` : '반가워요'}</h1>
        <p>가족·모임 앨범을 새로 만들거나,<br />받은 초대 코드로 들어가 보세요.</p>
      </motion.div>
      <div className={s.choices}>
        <motion.button whileTap={{ scale: 0.98 }} className={s.choice} onClick={() => nav('/create')} data-start="create">
          <span className={s.choiceArt}><Logo size={44} /></span>
          <span><b>새 앨범 만들기</b><small>아이 사진이나 친구·모임 사진을 모아요</small></span>
        </motion.button>
        <motion.button whileTap={{ scale: 0.98 }} className={s.choice} onClick={() => nav('/join')} data-start="join">
          <span className={`${s.choiceArt} ${s.code}`}>ABCD</span>
          <span><b>초대 코드로 들어가기</b><small>받은 코드 8자리를 넣어요</small></span>
        </motion.button>
      </div>
      <div className={s.outs}>
        <button className={s.out} onClick={() => api.signOut()}>다른 계정으로 로그인</button>
        <button className={s.out} onClick={() => nav('/settings/account/delete')}>계정 삭제</button>
      </div>
    </div>
  );
}

export function CreateAlbum() {
  const me = useSession((st) => st.me)!;
  const loadAlbums = useSession((st) => st.loadAlbums);
  const selectAlbum = useSession((st) => st.selectAlbum);
  const nav = useNavigate();
  const [kids, setKids] = useState<Child[]>(() => [newChild()]);
  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [role, setRole] = useState('');
  // 아기 앨범 / 가족 앨범 / 친구·모임 앨범
  const [kind, setKind] = useState<AlbumKind>('baby');
  const [since, setSince] = useState<string | null>(null);
  const group = kind !== 'baby'; // 가족·모임: 아이 칸 없이 이름 · 시작일
  // 앨범 이름은 아이 이름을 따라가요: '씩씩이 & 튼튼이네 앨범' (가족·모임은 직접 써요)
  const albumName = nameTouched || group ? name : suggestAlbumName(kids);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const filled = group ? [] : kids.filter((c) => childName(c));
    if (group) {
      if (!spaceAmp(albumName.trim())) return toast('앨범 이름을 적어 주세요.');
      if (!role.trim()) return toast('내 이름을 적어 주세요.');
    } else {
      if (!filled.length) return toast('아이의 태명이나 이름을 적어 주세요.');
      if (filled.some((c) => c.born && c.birthday && c.birthday > ymd(new Date()))) return toast('태어난 날은 오늘이나 그 전 날짜로 골라 주세요.');
      if (filled.some((c) => !isBorn(c) && c.start && c.birthday && termDays(c) === null)) return toast('임신 시작일과 출산 예정일 사이가 20주 ~ 44주가 되게 골라 주세요.');
      if (!role.trim()) return toast('아이와 어떤 사이인지 적어 주세요.');
    }
    const p = progress('앨범을 만들고 있어요');
    try {
      const id = await api.createAlbum({
        name: spaceAmp(albumName.trim()) || suggestAlbumName(filled), children: filled, displayName: role.trim(), avatar: me.avatarUrl,
        ...(group ? { kind, since } : {}),
      });
      await loadAlbums();
      await selectAlbum(id);
      p.close();
      nav('/home?welcome=1', { replace: true });
    } catch (err) {
      p.close();
      toast((err as Error).message);
    }
  };

  return (
    <div className={s.formPage}>
      <TopBar back title="새 앨범" />
      <form className={s.form} onSubmit={submit} noValidate>
        {/* 어떤 앨범인가요? 아기 · 가족 · 친구·모임 (나중에 설정에서 바꿀 수 있어요) */}
        <KindPicker value={kind} onChange={(k) => { if (kind !== k) { setKind(k); if (!nameTouched) setName(''); } }} />
        {!group && <KidsForm kids={kids} onChange={setKids} />}
        <Group title="앨범" footer={group ? `${sinceLabel(kind)}부터 함께한 날과 다음 100일 · 1주년까지 남은 날을 보여 줘요. 비워 두면 오늘부터 세요. 결혼기념일 같은 기념일은 만든 뒤 설정에서 넣을 수 있어요.` : undefined}>
          <Field label="앨범 이름" placeholder={kind === 'group' ? '우리 모임 앨범' : kind === 'family' ? '우리 가족 앨범' : '튼튼이네 앨범'} value={albumName} onChange={(e) => { setNameTouched(true); setName(e.target.value); }}
            onBlur={() => nameTouched && setName((v) => spaceAmp(v))} maxLength={40} autoComplete="off" name="album" />
          {group && <DateField label={sinceLabel(kind)} title={sinceLabel(kind)} value={since} onChange={setSince} placeholder="선택" name="since" min="1950-01-01" max={ymd(new Date())} allowClear />}
        </Group>
        <Group title="나" footer={kind === 'group' ? '멤버에게 이렇게 보여요. 나중에 바꿀 수 있어요.' : '가족에게 이렇게 보여요. 나중에 바꿀 수 있어요.'}>
          {group
            ? <Field label="내 이름" placeholder={kind === 'group' ? '민지' : '엄마'} value={role} onChange={(e) => setRole(e.target.value)} maxLength={20} autoComplete="off" name="role" />
            : <Field label="나는 아이의" placeholder="엄마" value={role} onChange={(e) => setRole(e.target.value)} maxLength={20} autoComplete="off" name="role" />}
        </Group>
        <div className={s.submit}><Button type="submit" size="lg" block>앨범 만들기</Button></div>
      </form>
    </div>
  );
}

export function JoinAlbum() {
  const me = useSession((st) => st.me)!;
  const loadAlbums = useSession((st) => st.loadAlbums);
  const selectAlbum = useSession((st) => st.selectAlbum);
  const nav = useNavigate();
  const params = useParams();
  const [code, setCode] = useState(cleanCode(params.code || sessionStorage.getItem('pm-invite') || ''));
  const [info, setInfo] = useState<{ name: string; babyName: string; kind: AlbumKind } | null | undefined>(undefined);
  const group = !!info && info.kind !== 'baby'; // 가족·모임: '내 이름'
  const [role, setRole] = useState('');

  useEffect(() => {
    if (code.length !== 8) { setInfo(undefined); return; }
    let live = true;
    api.inviteInfo(code).then((i) => live && setInfo(i), (e) => toast((e as Error).message));
    return () => { live = false; };
  }, [code]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== 8) return toast('초대 코드 8자리를 넣어 주세요.');
    if (!role.trim()) return toast(group ? '내 이름을 적어 주세요.' : '아이와 어떤 사이인지 적어 주세요.');
    const p = progress('앨범에 들어가는 중');
    try {
      const id = await api.joinAlbum(code, role.trim(), me.avatarUrl);
      sessionStorage.removeItem('pm-invite');
      await loadAlbums();
      await selectAlbum(id);
      if (/^(외)?할(머니|아버지)$/.test(role.trim())) useSession.getState().setTextSize('large');
      p.close();
      toast(`환영해요, ${role.trim()}!`);
      nav('/home', { replace: true });
    } catch (err) {
      p.close();
      toast((err as Error).message);
    }
  };

  return (
    <div className={s.formPage}>
      <TopBar back title="초대 코드" />
      <form className={s.form} onSubmit={submit} noValidate>
        <div className={s.codeHero}>
          {info ? (
            <motion.div key="found" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className={s.found}>
              <Logo size={56} />
              <h2>{info.name}</h2>
              <p>{info.kind === 'group' ? '모임 사진을 함께 볼 수 있어요' : info.kind === 'baby' && info.babyName ? `${callName(info.babyName)}의 사진을 함께 볼 수 있어요` : '가족 사진을 함께 볼 수 있어요'}</p>
            </motion.div>
          ) : (
            <p className={s.codeHelp}>{info === null ? '코드가 맞지 않아요. 초대한 사람에게 새 코드를 받아 주세요.' : '받은 초대 코드 8자리를 넣어 주세요.'}</p>
          )}
          <input className={s.codeInput} value={fmtCode(code)} onChange={(e) => setCode(cleanCode(e.target.value))} placeholder="ABCD-EF23"
            autoCapitalize="characters" autoComplete="off" spellCheck={false} inputMode="text" maxLength={9} aria-label="초대 코드" name="code" />
        </div>
        <Group title="나" footer={info?.kind === 'group' ? '멤버에게 이렇게 보여요.' : '가족에게 이렇게 보여요.'}>
          {group
            ? <Field label="내 이름" placeholder={info?.kind === 'group' ? '민지' : '할머니'} value={role} onChange={(e) => setRole(e.target.value)} maxLength={20} autoComplete="off" name="role" />
            : <Field label="나는 아이의" placeholder="할머니" value={role} onChange={(e) => setRole(e.target.value)} maxLength={20} autoComplete="off" name="role" />}
        </Group>
        <div className={s.submit}><Button type="submit" size="lg" block disabled={!info}>앨범 들어가기</Button></div>
      </form>
    </div>
  );
}
