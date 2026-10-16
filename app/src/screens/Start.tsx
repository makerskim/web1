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
import { childName, newChild, spaceAmp, suggestAlbumName, type Child } from '../lib/kids';
import { callName } from '../lib/korean';
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
        <p>가족 앨범을 새로 만들거나,<br />받은 초대 코드로 들어가 보세요.</p>
      </motion.div>
      <div className={s.choices}>
        <motion.button whileTap={{ scale: 0.98 }} className={s.choice} onClick={() => nav('/create')} data-start="create">
          <span className={s.choiceArt}><Logo size={44} /></span>
          <span><b>새 앨범 만들기</b><small>아이 사진을 모을 앨범을 만들어요</small></span>
        </motion.button>
        <motion.button whileTap={{ scale: 0.98 }} className={s.choice} onClick={() => nav('/join')} data-start="join">
          <span className={`${s.choiceArt} ${s.code}`}>ABCD</span>
          <span><b>초대 코드로 들어가기</b><small>가족에게 받은 코드 8자리를 넣어요</small></span>
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
  // 앨범 이름은 아이 이름을 따라가요: '씩씩이 & 튼튼이네 앨범'
  const albumName = nameTouched ? name : suggestAlbumName(kids);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const filled = kids.filter((c) => childName(c));
    if (!filled.length) return toast('아이의 태명이나 이름을 적어 주세요.');
    if (!role.trim()) return toast('아이와 어떤 사이인지 적어 주세요.');
    const p = progress('앨범을 만들고 있어요');
    try {
      const id = await api.createAlbum({ name: spaceAmp(albumName.trim()) || suggestAlbumName(filled), children: filled, displayName: role.trim(), avatar: me.avatarUrl });
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
        <KidsForm kids={kids} onChange={setKids} />
        <Group title="앨범">
          <Field label="앨범 이름" placeholder="튼튼이네 앨범" value={albumName} onChange={(e) => { setNameTouched(true); setName(e.target.value); }}
            onBlur={() => nameTouched && setName((v) => spaceAmp(v))} maxLength={40} autoComplete="off" name="album" />
        </Group>
        <Group title="나" footer="가족에게 이렇게 보여요. 나중에 바꿀 수 있어요.">
          <Field label="나는 아이의" placeholder="엄마" value={role} onChange={(e) => setRole(e.target.value)} maxLength={20} autoComplete="off" name="role" />
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
  const [info, setInfo] = useState<{ name: string; babyName: string } | null | undefined>(undefined);
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
    if (!role.trim()) return toast('아이와 어떤 사이인지 적어 주세요.');
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
              <p>{info.babyName ? `${callName(info.babyName)}의 사진을 함께 볼 수 있어요` : '가족 사진을 함께 볼 수 있어요'}</p>
            </motion.div>
          ) : (
            <p className={s.codeHelp}>{info === null ? '코드가 맞지 않아요. 가족에게 새 코드를 받아 주세요.' : '가족에게 받은 코드 8자리를 넣어 주세요.'}</p>
          )}
          <input className={s.codeInput} value={fmtCode(code)} onChange={(e) => setCode(cleanCode(e.target.value))} placeholder="ABCD-EF23"
            autoCapitalize="characters" autoComplete="off" spellCheck={false} inputMode="text" maxLength={9} aria-label="초대 코드" name="code" />
        </div>
        <Group title="나" footer="가족에게 이렇게 보여요.">
          <Field label="나는 아이의" placeholder="할머니" value={role} onChange={(e) => setRole(e.target.value)} maxLength={20} autoComplete="off" name="role" />
        </Group>
        <div className={s.submit}><Button type="submit" size="lg" block disabled={!info}>앨범 들어가기</Button></div>
      </form>
    </div>
  );
}
