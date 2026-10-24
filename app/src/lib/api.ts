// Supabase 데이터: 앨범, 가족, 게시물, 좋아요, 댓글, 소식
import { uuid } from './uuid';
import { sb } from './supabase';
import { friendly } from './errors';
import { removeFiles, uploadFile, isDrive } from './storage';
import { fnCall } from './fn';
import { ymd } from './dates';
import { REACTIONS, type ActivityEvent, type Album, type AlbumKind, type Anniversary, type Comment, type Me, type Member, type PhotoBg, type PhotoMeta, type Post, type Reaction, type StorageKind, type Visibility } from './types';
import { ageBirthday, childName, kidsFrom, kidsLabel, type Child } from './kids';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function check<T>({ data, error }: { data: T; error: unknown }): T {
  if (error) throw new Error(friendly(error));
  return data;
}

export const toKind = (v: unknown): AlbumKind => (v === 'group' || v === 'family' ? v : 'baby');
// 기념일 목록 (모양이 이상한 건 빼요)
export const toDays = (v: unknown): Anniversary[] => (Array.isArray(v) ? v : []).filter((x) => x && typeof x === 'object'
  && typeof x.name === 'string' && typeof x.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x.date))
  // id가 없던 기념일은 늘 같은 id로 (불러올 때마다 바뀌면 고치던 기념일이 새로 추가돼요)
  .map((x, i) => ({ id: typeof x.id === 'string' && x.id ? x.id : `d${i}-${x.date}`, name: x.name, date: x.date, yearly: x.yearly === true }));
const album = (r: Row, m?: Row): Album => {
  const children = kidsFrom(r.children, r.baby_name || '', r.baby_birthday || null);
  return {
  id: r.id, name: r.name, children, bio: r.bio || '',
  babyName: kidsLabel(children) || r.baby_name || '', babyBirthday: children.length ? ageBirthday(children) : r.baby_birthday ?? null, inviteCode: r.invite_code,
  storage: (r.storage || 'supabase') as StorageKind, cover: r.cover || '',
  kind: toKind(r.kind), since: typeof r.since === 'string' && /^\d{4}-\d{2}-\d{2}/.test(r.since) ? r.since.slice(0, 10) : null, days: toDays(r.days),
  createdAt: r.created_at, myRole: m?.role || 'member', myName: m?.display_name || '', myAvatar: m?.avatar || '',
  };
};
// 아이 목록을 저장할 모양으로 (예전 칸 baby_name·baby_birthday도 첫째 아이로 맞춰 둬요)
const kidsRow = (kids: Child[]) => ({
  children: kids.map((c) => ({
    id: c.id, nickname: c.nickname.trim(), name: c.name.trim(), birthday: c.birthday,
    ...(typeof c.born === 'boolean' ? { born: c.born } : {}), ...(c.start ? { start: c.start } : {}),
  })),
  baby_name: kids[0] ? childName(kids[0]).slice(0, 20) : '',
  baby_birthday: kids[0]?.birthday ?? null,
});
const member = (r: Row): Member => ({ userId: r.user_id, displayName: r.display_name, avatar: r.avatar || '', role: r.role, joinedAt: r.joined_at });
const comment = (r: Row): Comment => ({ id: r.id, postId: r.post_id, authorId: r.author_id, body: r.body, createdAt: r.created_at });
const post = (r: Row): Post => ({
  id: r.id, albumId: r.family_id, authorId: r.author_id, caption: r.caption, takenAt: r.taken_at, createdAt: r.created_at,
  photos: r.photos || [],
  likes: (r.likes || []).map((l: Row) => ({ userId: l.user_id, createdAt: l.created_at, emoji: toReaction(l.emoji) })),
  comments: (r.comments || []).map(comment).sort((a: Comment, b: Comment) => a.createdAt.localeCompare(b.createdAt)),
  bg: r.bg === 'black' || r.bg === 'white' ? r.bg : 'blur',
  visibility: r.visibility === 'owners' ? 'owners' : 'all',
});
const toReaction = (x: unknown): Reaction => (REACTIONS as readonly unknown[]).includes(x) ? x as Reaction : '❤️';
// likes(*): 리액션 칸(emoji)이 아직 없는 데이터베이스에서도 읽혀요
const POST_COLS = '*, likes(*), comments(id, post_id, author_id, body, created_at)';

// ---------- 로그인 ----------
export function meFrom(u: { id: string; email?: string | null; user_metadata?: Row; app_metadata?: Row } | null): Me | null {
  if (!u) return null;
  const md = u.user_metadata || {};
  const name = md.full_name || md.name || md.nickname || md.preferred_username || md.user_name || (u.email || '').split('@')[0] || '';
  let avatarUrl: string = md.avatar_url || md.picture || '';
  if (avatarUrl.startsWith('http://')) avatarUrl = `https://${avatarUrl.slice(7)}`;
  if (!/^https:\/\/([a-z0-9-]+\.)*(googleusercontent\.com|kakaocdn\.net|kakao\.com)\//.test(avatarUrl)) avatarUrl = '';
  return { id: u.id, email: u.email || null, name: String(name).slice(0, 20), avatarUrl, provider: u.app_metadata?.provider || '' };
}

// 카카오는 닉네임·프로필 사진만 받아요. Supabase는 기본으로 이메일도 요청하는데,
// 개인 개발자 앱은 이메일 동의항목을 켤 수 없어 KOE205 오류가 나요 → scope를 직접 정해서 보내요.
const KAKAO_SCOPE = 'profile_nickname,profile_image';

// 구글은 로그인하면서 '내 구글 드라이브'(이 앱이 만든 파일만)도 함께 허락받아요 → 따로 연결하지 않고 바로 올려요
// (구글 화면에서 드라이브 항목을 체크하지 않았으면 + 를 누를 때 다시 물어봐요)
const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

export async function signIn(provider: 'kakao' | 'google') {
  const redirectTo = `${location.origin}${location.pathname}`;
  // 돌아왔을 때 어느 쪽으로 로그인했는지 (구글이면 드라이브 연결 정보를 서버 기능에 건네요)
  sessionStorage.setItem('pm-login', provider);
  const { error } = await sb.auth.signInWithOAuth({
    provider,
    options: provider === 'google'
      ? { redirectTo, scopes: GOOGLE_DRIVE_SCOPE, queryParams: { prompt: 'consent select_account', access_type: 'offline' } }
      : { redirectTo, queryParams: { scope: KAKAO_SCOPE } },
  });
  if (error) throw new Error(friendly(error));
}

export async function signOut() { await sb.auth.signOut(); }

// 계정 삭제: 나 혼자 있는 앨범은 사진 파일까지 먼저 지우고, 그다음 계정을 지워요
/** 계정을 지우면 내 구글 드라이브 연결이 풀리는 앨범 이름들 */
export async function driveLinksToRelease(): Promise<string[]> {
  const rows = check(await sb.rpc('drive_links_to_release')) as unknown;
  return Array.isArray(rows) ? rows.map((r) => (typeof r === 'string' ? r : String(Object.values(r as object)[0] ?? ''))).filter(Boolean) : [];
}

export async function deleteAccount(uid: string, mine: Album[]) {
  // 막히는 게 있으면 아무것도 지우기 전에 알려 줘요 (혼자 있는 앨범 사진이 먼저 지워지지 않게)
  const blocked = check(await sb.rpc('delete_account_check')) as string | null;
  if (blocked) throw new Error(friendly(blocked));
  for (const a of mine) {
    const others = (check(await sb.from('members').select('user_id').eq('family_id', a.id).neq('user_id', uid).limit(1)) as Row[]).length;
    if (!others) await deleteAlbum(a.id, uid);
  }
  check(await sb.rpc('delete_account'));
  await sb.auth.signOut().catch(() => {});
}

// ---------- 앨범 ----------
export async function albums(uid: string): Promise<Album[]> {
  const rows = check(await sb.from('members').select('role, display_name, avatar, joined_at, families(*)').eq('user_id', uid).order('joined_at'));
  return (rows as Row[]).filter((r) => r.families).map((r) => album(r.families, r));
}

export async function createAlbum(p: { name: string; children: Child[]; bio?: string; displayName: string; avatar: string; kind?: AlbumKind; since?: string | null }) {
  const k = kidsRow(p.children);
  const group = !!p.kind && p.kind !== 'baby';
  // 가족·모임 앨범은 데이터베이스에 '앨범 종류' 칸이 있어야 해요 (없으면 만들기 전에 알려 줘요)
  if (group) check(await sb.from('families').select('kind, since, days').limit(1));
  const f = check(await sb.rpc('create_family', {
    p_name: p.name, p_baby_name: k.baby_name, p_baby_birthday: k.baby_birthday, p_display_name: p.displayName, p_avatar: p.avatar,
  })) as Row;
  // 아이들(태명·이름)과 소개는 만든 뒤에 저장해요. 데이터베이스가 예전 설정이어도 앨범은 만들어져요
  await sb.from('families').update({ children: k.children, ...(p.bio ? { bio: p.bio } : {}) }).eq('id', f.id).then(() => {}, () => {});
  if (group) {
    const r = await sb.from('families').update({ kind: p.kind, since: p.since ?? null }).eq('id', f.id).select('id');
    // 종류를 못 바꿨으면 방금 만든 앨범을 지워요 (아기 앨범이 남지 않게)
    if (r.error || !r.data?.length) {
      await sb.from('families').delete().eq('id', f.id).then(() => {}, () => {});
      throw new Error(r.error ? friendly(r.error) : '앨범을 만들지 못했어요. 다시 시도해 주세요.');
    }
  }
  return f.id as string;
}

export async function inviteInfo(code: string) {
  const rows = check(await sb.rpc('invite_info', { p_code: code })) as Row[];
  return rows?.[0] ? { name: rows[0].name as string, babyName: rows[0].baby_name as string, kind: toKind(rows[0].kind) } : null;
}

export async function joinAlbum(code: string, displayName: string, avatar: string) {
  const f = check(await sb.rpc('join_family', { p_code: code, p_display_name: displayName, p_avatar: avatar })) as Row;
  return f.id as string;
}

export async function updateAlbum(id: string, patch: { name?: string; children?: Child[]; bio?: string; storage?: StorageKind; cover?: string; kind?: AlbumKind; since?: string | null; days?: Anniversary[] }) {
  const row: Row = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.children !== undefined) Object.assign(row, kidsRow(patch.children));
  if (patch.bio !== undefined) row.bio = patch.bio;
  if (patch.storage !== undefined) row.storage = patch.storage;
  if (patch.cover !== undefined) row.cover = patch.cover;
  if (patch.kind !== undefined) row.kind = patch.kind;
  if (patch.since !== undefined) row.since = patch.since;
  if (patch.days !== undefined) row.days = patch.days.map((d) => ({ id: d.id, name: d.name.trim(), date: d.date, yearly: d.yearly }));
  const rows = check(await sb.from('families').update(row).eq('id', id).select('id')) as Row[];
  if (!rows.length) throw new Error('앨범 관리자만 바꿀 수 있어요.');
}

// 앨범 사진 (관리자): 앨범의 사진 하나를 고르거나, 휴대폰 사진을 내 구글 드라이브에 올려요
// 예전에 Supabase에 올린 앨범 사진 파일은 지워요 (드라이브 사진은 게시물 사진일 수 있어서 그대로)
const isCoverFile = (albumId: string, path: string) => path.startsWith(`${albumId}/cover/`);
export async function setCover(albumId: string, path: string, old: string) {
  await updateAlbum(albumId, { cover: path });
  if (old && old !== path && isCoverFile(albumId, old)) await sb.storage.from('photos').remove([old]).catch(() => {});
}
export async function uploadCover(albumId: string, blob: Blob, old: string) {
  const path = await uploadFile({ albumId, storage: 'drive', postId: 'cover' }, `${Date.now()}.jpg`, blob, 'image/jpeg', true, { small: true, driveName: `앨범 사진 ${ymd(new Date())}.jpg` });
  try {
    await setCover(albumId, path, old);
  } catch (e) {
    await removeFiles(albumId, [path]).catch(() => {});
    throw e;
  }
  return path;
}

export const resetInvite = async (id: string) => check(await sb.rpc('reset_invite_code', { p_family: id })) as string;

export async function deleteAlbum(id: string, uid: string) {
  // Supabase 파일 전부 (관리자 확인 포함)
  const paths = (check(await sb.rpc('family_files', { p_family: id })) as string[]) || [];
  if (paths.length) await removeFiles(id, paths);
  // 드라이브 파일은 관리자 드라이브의 앨범 폴더에 그대로 남겨요 (가족 추억이 사라지지 않게)
  const rows = check(await sb.from('families').delete().eq('id', id).select('id')) as Row[];
  if (!rows.length) throw new Error('앨범 관리자만 할 수 있어요.');
  void uid;
}

// ---------- 가족 ----------
export async function members(albumId: string): Promise<Member[]> {
  return (check(await sb.from('members').select('*').eq('family_id', albumId).order('joined_at')) as Row[]).map(member);
}

// 앨범마다 가족 수 (계정 삭제 안내에 써요)
export async function memberCounts(albumIds: string[]): Promise<Record<string, number>> {
  if (!albumIds.length) return {};
  const rows = check(await sb.from('members').select('family_id').in('family_id', albumIds)) as Row[];
  const out: Record<string, number> = {};
  rows.forEach((r) => { out[r.family_id] = (out[r.family_id] || 0) + 1; });
  return out;
}

export async function updateMe(albumId: string, uid: string, p: { displayName?: string; avatar?: string }) {
  const row: Row = {};
  if (p.displayName) row.display_name = p.displayName;
  if (p.avatar !== undefined) row.avatar = p.avatar;
  check(await sb.from('members').update(row).eq('family_id', albumId).eq('user_id', uid));
}

// 내가 고른 프로필 사진: 내 구글 드라이브(앨범 폴더의 앱용 작은 사진)에 올려요 → 'gd:파일ID'
export async function setAvatarPhoto(albumId: string, uid: string, blob: Blob, old: string) {
  const path = await uploadFile({ albumId, storage: 'drive', postId: 'avatar' }, `${Date.now()}.jpg`, blob, 'image/jpeg', true, { small: true, driveName: `프로필 사진 ${ymd(new Date())}.jpg` });
  try {
    await updateMe(albumId, uid, { avatar: path });
  } catch (e) {
    await removeFiles(albumId, [path]).catch(() => {});
    throw e;
  }
  // 예전 프로필 사진 파일 정리 (Supabase에 있던 것 · 내 드라이브에 있던 것)
  if (old.startsWith(`sb:${albumId}/avatars/${uid}-`)) await sb.storage.from('photos').remove([old.slice(3)]).catch(() => {});
  else if (isDrive(old)) await removeFiles(albumId, [old]).catch(() => {});
}

export async function leaveAlbum(albumId: string, uid: string) {
  check(await sb.from('members').delete().eq('family_id', albumId).eq('user_id', uid));
}
export const removeMember = async (albumId: string, uid: string) =>
  check(await sb.rpc('remove_member', { p_family: albumId, p_user: uid })) as string;
export const setRole = async (albumId: string, uid: string, role: 'owner' | 'member') =>
  check(await sb.rpc('set_member_role', { p_family: albumId, p_user: uid, p_role: role }));

// ---------- 게시물 ----------
/** 홈 타임라인: 새로 올린 게 위. range(날짜로 보기)를 주면 그 기간에 찍은 사진만, 최근에 찍은 게 위 ([시작일, 끝 다음날) 'YYYY-MM-DD') */
export async function posts(albumId: string, opts: { after?: Post | null; range?: [string, string] | null } = {}, limit = 8): Promise<Post[]> {
  const col = opts.range ? 'taken_at' : 'created_at';
  let q = sb.from('posts').select(POST_COLS).eq('family_id', albumId)
    .order(col, { ascending: false }).order('id', { ascending: false }).limit(limit);
  if (opts.range) {
    // 이 휴대폰 시간의 그날 0시 기준
    const at = (d: string) => new Date(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)).toISOString();
    q = q.gte('taken_at', at(opts.range[0])).lt('taken_at', at(opts.range[1]));
  }
  if (opts.after) {
    // 같은 시각이 여럿이어도 빠뜨리지 않게 (시각, ID) 순서로 이어서
    const at = opts.range ? opts.after.takenAt : opts.after.createdAt;
    q = q.or(`${col}.lt."${at}",and(${col}.eq."${at}",id.lt.${opts.after.id})`);
  }
  return (check(await q) as Row[]).map(post);
}

/** 날짜로 보기 달력에 쓰는 게시물 날짜들 (올린 사람 · 올린 날 · 찍은 날) */
export async function postDates(albumId: string): Promise<{ authorId: string; createdAt: string; takenAt: string }[]> {
  const out: { authorId: string; createdAt: string; takenAt: string }[] = [];
  for (let from = 0; ; from += 1000) {
    const rows = check(await sb.from('posts').select('author_id, created_at, taken_at').eq('family_id', albumId).order('created_at', { ascending: false }).range(from, from + 999)) as Row[];
    rows.forEach((r) => out.push({ authorId: r.author_id, createdAt: r.created_at, takenAt: r.taken_at }));
    if (rows.length < 1000) return out;
  }
}

export async function getPost(id: string): Promise<Post | null> {
  const r = check(await sb.from('posts').select(POST_COLS).eq('id', id).maybeSingle()) as Row | null;
  return r ? post(r) : null;
}

export interface GridItem extends PhotoMeta { postId: string; authorId: string; takenAt: string; createdAt: string; index: number; count: number }

export async function allPhotos(albumId: string): Promise<GridItem[]> {
  const out: GridItem[] = [];
  for (let from = 0; ; from += 1000) {
    const rows = check(await sb.from('posts').select('id, author_id, photos, taken_at, created_at')
      .eq('family_id', albumId).order('created_at', { ascending: false }).range(from, from + 999)) as Row[];
    for (const r of rows) {
      (r.photos as PhotoMeta[]).forEach((ph, i) => out.push({
        ...ph, postId: r.id, authorId: r.author_id, takenAt: r.taken_at, createdAt: r.created_at, index: i, count: r.photos.length,
      }));
    }
    if (rows.length < 1000) return out;
  }
}

// 가족 탭 그리드: 게시물마다 한 칸 (첫 사진 + 여러 장 표시 + 좋아요한 사람)
export interface PostTile { id: string; authorId: string; createdAt: string; first: PhotoMeta; count: number; likedBy: string[] }

export async function postTiles(albumId: string): Promise<PostTile[]> {
  const out: PostTile[] = [];
  for (let from = 0; ; from += 1000) {
    const rows = check(await sb.from('posts').select('id, author_id, photos, created_at, likes(user_id)')
      .eq('family_id', albumId).order('created_at', { ascending: false }).range(from, from + 999)) as Row[];
    for (const r of rows) {
      out.push({ id: r.id, authorId: r.author_id, createdAt: r.created_at, first: r.photos[0], count: r.photos.length, likedBy: (r.likes || []).map((l: Row) => l.user_id) });
    }
    if (rows.length < 1000) return out;
  }
}

export interface NewPhoto {
  blob: Blob; thumb: Blob; w: number; h: number; ph: string;
  /** 원본 사진, 또는 동영상 파일 */
  orig?: File;
  /** 동영상이면 길이(초) */
  video?: { dur: number };
}
export interface OrigInfo { type: string; ext: string }

const ORIG_TYPES: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif' };
const VIDEO_TYPES: Record<string, string> = { mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', '3gp': 'video/3gpp' };
export function originalInfo(file: File): OrigInfo | null {
  const ext = (file.name.match(/\.([a-z0-9]{2,5})$/i)?.[1] || '').toLowerCase();
  const byType = Object.entries(ORIG_TYPES).find(([, t]) => t === file.type);
  const type = byType ? file.type : ORIG_TYPES[ext];
  if (!type) return null;
  const e = byType ? byType[0] : ext;
  return { type, ext: e === 'jpeg' ? 'jpg' : e };
}
export function videoInfo(file: File): OrigInfo | null {
  const ext = (file.name.match(/\.([a-z0-9]{2,5})$/i)?.[1] || '').toLowerCase();
  if (file.type.startsWith('video/')) return { type: file.type, ext: ext || 'mp4' };
  return VIDEO_TYPES[ext] ? { type: VIDEO_TYPES[ext], ext } : null;
}

// 드라이브에 보일 원본 이름: '2026-10-23 IMG_1234.HEIC' (찍은 날 + 원래 이름)
const driveOrigName = (f: File, takenAt: string) => `${ymd(takenAt)} ${(f.name || 'photo').replace(/[\\/\u0000-\u001f]/g, '_').slice(-80)}`;

// 사진 올리기: 화면용·작은 사진을 먼저 모두, 그다음 원본(실패해도 그 원본만 빼고 계속)
// 동영상은 첫 장면 사진을 먼저, 그다음 동영상 파일 (동영상은 꼭 올라가야 해요)
export async function createPost(
  a: Album, p: { caption: string; takenAt: string; photos: NewPhoto[]; bg?: PhotoBg; visibility?: Visibility }, onProgress?: (f: number) => void,
): Promise<{ post: Post; skippedOriginals: number }> {
  const id = uuid();
  // 사진·동영상은 언제나 올린 사람의 구글 드라이브에
  const target = { albumId: a.id, storage: 'drive' as const, postId: id };
  const total = p.photos.reduce((n, ph) => n + ph.blob.size + ph.thumb.size + (ph.orig?.size || 0), 0) || 1;
  let done = 0;
  const step = (n: number) => { done += n; onProgress?.(Math.min(1, done / total)); };
  const uploaded: string[] = [];
  const put = async (name: string, blob: Blob, type: string, cache: boolean, opts: { small?: boolean; driveName?: string } = {}) => {
    const base = done;
    const path = await uploadFile(target, name, blob, type, cache, { ...opts, onProgress: (n) => onProgress?.(Math.min(1, (base + n) / total)) });
    uploaded.push(path);
    done = base;
    step(blob.size);
    return path;
  };
  let skippedOriginals = 0;
  try {
    const metas: PhotoMeta[] = [];
    for (let i = 0; i < p.photos.length; i++) {
      const ph = p.photos[i];
      metas.push({
        path: await put(`${i}.jpg`, ph.blob, 'image/jpeg', true, { small: true }),
        thumb: await put(`${i}_t.jpg`, ph.thumb, 'image/jpeg', true, { small: true }),
        w: ph.w, h: ph.h, ph: ph.ph,
      });
    }
    for (let i = 0; i < p.photos.length; i++) {
      const ph = p.photos[i];
      if (!ph.orig) continue;
      if (ph.video) {
        const info = videoInfo(ph.orig);
        if (!info) throw new Error('이 동영상 형식은 올릴 수 없어요. (mp4 · mov · webm)');
        const path = await put(`${i}_v.${info.ext}`, ph.orig, info.type, false, { driveName: driveOrigName(ph.orig, p.takenAt) });
        Object.assign(metas[i], { orig: path, origName: ph.orig.name.slice(-80), origSize: ph.orig.size, kind: 'video', dur: Math.round(ph.video.dur * 10) / 10, mime: info.type });
        continue;
      }
      const info = originalInfo(ph.orig);
      if (!info) { step(ph.orig.size); continue; }
      try {
        const name = `${i}_o.${info.ext}`;
        const opts = { driveName: driveOrigName(ph.orig, p.takenAt) };
        const path = await put(name, ph.orig, info.type, false, opts).catch(() => put(name, ph.orig!, info.type, false, opts));
        Object.assign(metas[i], { orig: path, origName: ph.orig.name.slice(-80), origSize: ph.orig.size });
      } catch {
        skippedOriginals++;
        step(ph.orig.size);
      }
    }
    const row = check(await sb.from('posts').insert({
      id, family_id: a.id, caption: p.caption, taken_at: p.takenAt, photos: metas,
      // 기본값이 아닐 때만 보내요 (새 칸이 없는 예전 데이터베이스에서도 기본 올리기는 돼요)
      ...(p.bg && p.bg !== 'blur' ? { bg: p.bg } : {}),
      ...(p.visibility === 'owners' ? { visibility: 'owners' } : {}),
    }).select(POST_COLS).single()) as Row;
    return { post: post(row), skippedOriginals };
  } catch (e) {
    // 게시물은 저장됐는데 응답만 못 받은 경우엔 지우지 않아요
    const found = await sb.from('posts').select(POST_COLS).eq('id', id).maybeSingle().then((r) => r.data, () => null);
    if (found) return { post: post(found as Row), skippedOriginals };
    await removeFiles(a.id, uploaded).catch(() => {});
    throw e;
  }
}

export async function updatePost(id: string, p: { caption?: string; takenAt?: string; bg?: PhotoBg; visibility?: Visibility }) {
  const row: Row = {};
  if (p.caption !== undefined) row.caption = p.caption;
  if (p.takenAt) row.taken_at = p.takenAt;
  if (p.bg) row.bg = p.bg;
  if (p.visibility) row.visibility = p.visibility;
  return post(check(await sb.from('posts').update(row).eq('id', id).select(POST_COLS).single()) as Row);
}

export const filesOf = (ph: PhotoMeta) => [ph.path, ph.thumb, ph.orig].filter(Boolean) as string[];

export async function deletePost(p: Post, uid?: string) {
  // 구글 드라이브의 사진·동영상도 휴지통으로: 서버 기능이 올린 사람의 연동으로 지워요 (관리자가 남의 게시물을 지워도)
  // 서버 기능에 닿지 않으면, 내가 올린 것만 내 드라이브에서 직접 지워요
  const viaServer = await fnCall<{ trashed: number }>('trash', { album: p.albumId, post: p.id }).then((r) => r.trashed >= 0, () => false);
  const paths = p.photos.flatMap(filesOf).filter((x) => (!viaServer && isDrive(x) && p.authorId === uid) || x.startsWith(`${p.albumId}/${p.id}/`));
  const rows = check(await sb.from('posts').delete().eq('id', p.id).select('id')) as Row[];
  if (!rows.length) throw new Error('지울 수 있는 권한이 없어요.');
  await removeFiles(p.albumId, paths).catch(() => {});
}

// ---------- 알림 (올린 다음 가족에게) ----------
export function notify(albumId: string, type: 'post' | 'comment', id: string) {
  fnCall('notify', { album: albumId, type, id }).catch(() => { /* 알림이 안 가도 올리기는 끝났어요 */ });
}

// ---------- N년 전 오늘 ----------
export async function onThisDay(albumId: string, at: Date = new Date()): Promise<Post[]> {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Seoul';
  const { data, error } = await sb.rpc('on_this_day', { p_family: albumId, p_month: at.getMonth() + 1, p_day: at.getDate(), p_tz: tz });
  if (error) return [];
  return ((data || []) as Row[]).map((r) => post({ ...r, likes: [], comments: [] }));
}

// ---------- 리액션·댓글 ----------
// 한 사람이 게시물마다 리액션 하나: 없으면 남기고, 같은 걸 다시 누르면 없애고, 다른 걸 누르면 바꿔요
export async function react(p: Post, emoji: Reaction | null, uid: string) {
  const mine = p.likes.find((l) => l.userId === uid);
  if (!emoji) {
    check(await sb.from('likes').delete().eq('post_id', p.id).eq('user_id', uid));
  } else if (mine) {
    if (mine.emoji !== emoji) check(await sb.from('likes').update({ emoji }).eq('post_id', p.id).eq('user_id', uid));
  } else {
    // ❤️는 기본값이라 보내지 않아요 (리액션 칸이 없는 예전 데이터베이스에서도 하트는 돼요)
    const { error } = await sb.from('likes').insert(emoji === '❤️' ? { post_id: p.id } : { post_id: p.id, emoji });
    if (!error) return;
    if ((error as { code?: string }).code !== '23505') throw new Error(friendly(error));
    if (emoji !== '❤️') check(await sb.from('likes').update({ emoji }).eq('post_id', p.id).eq('user_id', uid));
  }
}

export const addComment = async (p: Post, body: string) =>
  comment(check(await sb.from('comments').insert({ post_id: p.id, body }).select().single()) as Row);
export async function deleteComment(c: Comment) { check(await sb.from('comments').delete().eq('id', c.id)); }

// ---------- 소식 ----------
export async function activity(albumId: string): Promise<ActivityEvent[]> {
  const [ps, ls, cs, ms] = await Promise.all([
    sb.from('posts').select('id, author_id, photos, created_at').eq('family_id', albumId).order('created_at', { ascending: false }).limit(30),
    sb.from('likes').select('*').eq('family_id', albumId).order('created_at', { ascending: false }).limit(40),
    sb.from('comments').select('id, post_id, author_id, body, created_at').eq('family_id', albumId).order('created_at', { ascending: false }).limit(40),
    sb.from('members').select('user_id, joined_at').eq('family_id', albumId).order('joined_at', { ascending: false }).limit(20),
  ]).then((rs) => rs.map((r) => check(r as { data: Row[]; error: unknown }) as Row[]));
  const byId = new Map<string, { id: string; photos: PhotoMeta[] }>(ps.map((p) => [p.id, { id: p.id, photos: p.photos }]));
  const missing = [...new Set([...ls, ...cs].map((x) => x.post_id))].filter((id) => !byId.has(id));
  if (missing.length) (check(await sb.from('posts').select('id, photos').in('id', missing)) as Row[]).forEach((p) => byId.set(p.id, p as { id: string; photos: PhotoMeta[] }));
  const month = new Date(Date.now() - 30 * 86400000).toISOString();
  const ev: ActivityEvent[] = [
    ...ps.map((p) => ({ type: 'post' as const, at: p.created_at, userId: p.author_id, postId: p.id, post: byId.get(p.id), count: p.photos.length })),
    ...ls.map((l) => ({ type: 'like' as const, at: l.created_at, userId: l.user_id, postId: l.post_id, post: byId.get(l.post_id), emoji: toReaction(l.emoji) })),
    ...cs.map((c) => ({ type: 'comment' as const, at: c.created_at, userId: c.author_id, postId: c.post_id, post: byId.get(c.post_id), body: c.body })),
    ...ms.filter((m) => m.joined_at > month).map((m) => ({ type: 'join' as const, at: m.joined_at, userId: m.user_id })),
  ];
  return ev.filter((e) => e.type === 'join' || e.post).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 80);
}


