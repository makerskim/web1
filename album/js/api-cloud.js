// 클라우드 모드: Supabase(무료)를 통해 멀리 있는 가족과 사진을 나눕니다.
// 받은 사진은 photo-cache.js가 휴대폰 안에도 보관합니다.

import { createClient } from '../vendor/supabase.js';
import { uuid, originalInfo, filesOf } from './util.js';
import { cachedURL, cachedBlob, remember, forget } from './photo-cache.js';
import { friendly } from './errors.js';

const BUCKET = 'photos';
const ORPHANS = 'ssuk-orphans'; // 올리다 실패했는데 지우지도 못한 파일 (다음에 다시 지워요)

const family = (r) => r && ({
  id: r.id, name: r.name, babyName: r.baby_name, babyBirthday: r.baby_birthday,
  inviteCode: r.invite_code, createdAt: r.created_at,
});
const member = (r) => ({
  userId: r.user_id, displayName: r.display_name, avatar: r.avatar, role: r.role, joinedAt: r.joined_at,
});
const comment = (r) => ({
  id: r.id, postId: r.post_id, familyId: r.family_id, authorId: r.author_id, body: r.body, createdAt: r.created_at,
});
const post = (r) => ({
  id: r.id, familyId: r.family_id, authorId: r.author_id, caption: r.caption, takenAt: r.taken_at,
  createdAt: r.created_at, photos: r.photos || [],
  likes: (r.likes || []).map((l) => ({ userId: l.user_id, createdAt: l.created_at })),
  comments: (r.comments || []).map(comment).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
});

const POST_COLS = '*, likes(user_id, created_at), comments(id, post_id, family_id, author_id, body, created_at)';

function check({ data, error }) {
  if (error) throw new Error(friendly(error));
  return data;
}

export class CloudApi {
  mode = 'cloud';
  canInvite = true;
  canLinkEmail = true;

  constructor({ supabaseUrl, supabaseKey, storageLimitGB }) {
    this.sb = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'ssukssuk-auth' },
    });
    this.session = null;
    // 저장공간 한도: 무료 1GB. 유료로 바꾸면 config.js의 storageLimitGB만 고치면 돼요
    this.storageLimit = (Number(storageLimitGB) > 0 ? Number(storageLimitGB) : 1) * 1024 ** 3;
  }

  async init() {
    const { data } = await this.sb.auth.getSession();
    this.session = data.session;
    this.sb.auth.onAuthStateChange((_e, s) => { this.session = s; });
    if (this.session) this.cleanOrphans().catch(() => {});
    return this.user();
  }

  // 올리다 실패해서 남은 파일 정리. 게시물이 실제로 만들어졌으면(응답만 못 받은 경우) 그 파일은 절대 안 지워요
  async cleanOrphans(add = []) {
    let list = [];
    try { list = JSON.parse(localStorage.getItem(ORPHANS) || '[]'); } catch { /* 없음 */ }
    list = [...new Set([...list, ...add])].filter((p) => typeof p === 'string' && p.split('/').length === 3);
    try {
      if (list.length && this.session) {
        const ids = [...new Set(list.map((p) => p.split('/')[1]))];
        const alive = new Set(check(await this.sb.from('posts').select('id').in('id', ids)).map((r) => r.id));
        const dead = list.filter((p) => !alive.has(p.split('/')[1]));
        if (dead.length) check(await this.sb.storage.from(BUCKET).remove(dead.slice(0, 100)));
        list = dead.slice(100);
      }
    } catch { /* 인터넷이 없으면 다음에 */ }
    try {
      if (list.length) localStorage.setItem(ORPHANS, JSON.stringify(list.slice(-1000)));
      else localStorage.removeItem(ORPHANS);
    } catch { /* 무시 */ }
  }

  user() {
    const u = this.session?.user;
    return u ? { id: u.id, email: u.email || null, isAnonymous: !!u.is_anonymous } : null;
  }

  get uid() { return this.session?.user?.id; }

  async ensureUser() {
    if (!this.session) {
      const data = check(await this.sb.auth.signInAnonymously());
      this.session = data.session;
    }
    return this.user();
  }

  // ---------- 앨범 ----------
  async families() {
    if (!this.uid) return [];
    const rows = check(await this.sb.from('members')
      .select('role, display_name, avatar, joined_at, families(*)')
      .eq('user_id', this.uid).order('joined_at'));
    return rows.filter((r) => r.families).map((r) => ({
      ...family(r.families), myRole: r.role, myName: r.display_name, myAvatar: r.avatar,
    }));
  }

  async createFamily({ name, babyName, babyBirthday, displayName, avatar }) {
    await this.ensureUser();
    const f = check(await this.sb.rpc('create_family', {
      p_name: name, p_baby_name: babyName || '', p_baby_birthday: babyBirthday || null,
      p_display_name: displayName, p_avatar: avatar || '🙂',
    }));
    return { ...family(f), myRole: 'owner', myName: displayName, myAvatar: avatar };
  }

  async inviteInfo(code) {
    await this.ensureUser();
    const rows = check(await this.sb.rpc('invite_info', { p_code: code }));
    const r = rows?.[0];
    return r ? { name: r.name, babyName: r.baby_name } : null;
  }

  async joinFamily({ code, displayName, avatar }) {
    await this.ensureUser();
    const f = check(await this.sb.rpc('join_family', { p_code: code, p_display_name: displayName, p_avatar: avatar || '🙂' }));
    return { ...family(f), myRole: 'member', myName: displayName, myAvatar: avatar };
  }

  async updateFamily(id, { name, babyName, babyBirthday }) {
    const patch = {};
    if (name !== undefined) patch.name = name;
    if (babyName !== undefined) patch.baby_name = babyName;
    if (babyBirthday !== undefined) patch.baby_birthday = babyBirthday || null;
    return family(check(await this.sb.from('families').update(patch).eq('id', id).select().single()));
  }

  async resetInvite(id) {
    return check(await this.sb.rpc('reset_invite_code', { p_family: id }));
  }

  async deleteFamily(f) {
    // 앨범 폴더의 파일 전부 (올리다 실패해서 남은 파일까지). 관리자가 아니면 여기서 멈춰요 → 아무것도 안 지워져요
    const paths = check(await this.sb.rpc('family_files', { p_family: f.id })) || [];
    for (let i = 0; i < paths.length; i += 100) {
      check(await this.sb.storage.from(BUCKET).remove(paths.slice(i, i + 100)));
    }
    paths.forEach(forget);
    const rows = check(await this.sb.from('families').delete().eq('id', f.id).select('id'));
    if (!rows.length) throw new Error('앨범 관리자만 할 수 있어요.');
  }

  // ---------- 가족 구성원 ----------
  async members(fid) {
    const rows = check(await this.sb.from('members').select('*').eq('family_id', fid).order('joined_at'));
    return rows.map(member);
  }

  async updateMe(fid, { displayName, avatar }) {
    const patch = {};
    if (displayName) patch.display_name = displayName;
    if (avatar) patch.avatar = avatar;
    check(await this.sb.from('members').update(patch).eq('family_id', fid).eq('user_id', this.uid));
  }

  // 프로필 사진: 앨범 폴더/avatars/내아이디-시각.jpg 로 올리고 내 얼굴로 쓰기 (예전 사진은 지워요)
  async setAvatarPhoto(fid, blob, old) {
    const path = `${fid}/avatars/${this.uid}-${Date.now()}.jpg`;
    check(await this.sb.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false }));
    remember(path, blob);
    try {
      check(await this.sb.from('members').update({ avatar: `img:${path}` }).eq('family_id', fid).eq('user_id', this.uid));
    } catch (e) {
      await this.sb.storage.from(BUCKET).remove([path]).catch(() => {});
      throw e;
    }
    const prev = typeof old === 'string' && old.startsWith('img:') ? old.slice(4) : '';
    if (prev && prev.startsWith(`${fid}/avatars/${this.uid}-`)) await this.sb.storage.from(BUCKET).remove([prev]).catch(() => {});
    return path;
  }

  // 관리자가 가족을 내보내면 초대 코드도 바뀌어요 (같은 링크로 다시 못 들어오게). 새 코드를 돌려줘요
  async removeMember(fid, userId) {
    return check(await this.sb.rpc('remove_member', { p_family: fid, p_user: userId }));
  }

  async leaveFamily(fid) {
    check(await this.sb.from('members').delete().eq('family_id', fid).eq('user_id', this.uid));
  }

  async setRole(fid, userId, role) {
    check(await this.sb.rpc('set_member_role', { p_family: fid, p_user: userId, p_role: role }));
  }

  // ---------- 게시물 ----------
  async posts(fid, { before, limit = 10 } = {}) {
    let q = this.sb.from('posts').select(POST_COLS).eq('family_id', fid)
      .order('created_at', { ascending: false }).limit(limit);
    if (before) q = q.lt('created_at', before);
    return check(await q).map(post);
  }

  async allPhotos(fid) {
    const out = [];
    for (let from = 0; ; from += 1000) {
      const rows = check(await this.sb.from('posts').select('id, author_id, photos, taken_at, created_at')
        .eq('family_id', fid).order('taken_at', { ascending: false }).range(from, from + 999));
      out.push(...rows.map((r) => ({ id: r.id, authorId: r.author_id, photos: r.photos, takenAt: r.taken_at, createdAt: r.created_at })));
      if (rows.length < 1000) return out;
    }
  }

  async post(id) {
    const r = check(await this.sb.from('posts').select(POST_COLS).eq('id', id).maybeSingle());
    return r ? post(r) : null;
  }

  // 사진 올리기. 원본은 '덤'이라 원본만 실패하면 그 사진은 일반 화질로 올리고 계속해요
  // (돌려주는 게시물의 skippedOriginals = 원본을 못 올린 장 수)
  async createPost(fid, { caption, takenAt, photos }, onProgress) {
    const id = uuid();
    const store = this.sb.storage.from(BUCKET);
    const uploaded = [];
    const metas = [];
    // 진행 막대는 올린 용량 기준 (원본이 크니까)
    const total = photos.reduce((n, ph) => n + ph.blob.size + ph.thumb.size + (ph.orig?.size || 0), 0) || 1;
    let done = 0;
    let skippedOriginals = 0;
    let inserting = false;
    const step = (n) => { done += n; onProgress?.(done / total); };
    const put = async (p, blob, type, cache) => {
      check(await store.upload(p, blob, { contentType: type, cacheControl: '31536000', upsert: false }));
      uploaded.push(p);
      if (cache) remember(p, blob);
      step(blob.size);
    };
    try {
      // 1) 화면용 사진·작은 사진을 먼저 모두 (작고 빨라요)
      for (let i = 0; i < photos.length; i++) {
        const ph = photos[i];
        const meta = { path: `${fid}/${id}/${i}.jpg`, thumb: `${fid}/${id}/${i}_t.jpg`, w: ph.w, h: ph.h, ph: ph.ph, dec: !!ph.dec };
        await put(meta.path, ph.blob, 'image/jpeg', true);
        await put(meta.thumb, ph.thumb, 'image/jpeg', true);
        metas.push(meta);
      }
      // 2) 그다음 원본 (크고 오래 걸려요). 잠깐 끊겨도(화면이 꺼졌다 켜져도) 한 번 더 시도하고, 그래도 안 되면 그 원본만 빼요
      for (let i = 0; i < photos.length; i++) {
        const ph = photos[i];
        const meta = metas[i];
        const info = ph.orig && originalInfo(ph.orig);
        if (info) {
          const path = `${fid}/${id}/${i}_o.${info.ext}`;
          // 파일에 적힌 형식이 'image/jpg'나 빈 값이면 저장소가 거절해서, 허용되는 형식 이름으로 바꿔 보내요 (내용은 그대로)
          const body = ph.orig.type === info.type ? ph.orig : ph.orig.slice(0, ph.orig.size, info.type);
          try {
            // 원본은 커서 휴대폰에 따로 보관하지 않아요. 큰 파일이라 한 번 끊겨도 한 번 더 시도
            await put(path, body, info.type, false).catch(() => put(path, body, info.type, false));
            meta.orig = path;
            meta.origName = (ph.orig.name || `photo.${info.ext}`).slice(-80);
            meta.origSize = ph.orig.size;
          } catch {
            skippedOriginals++;
            step(ph.orig.size);
          }
        } else if (ph.orig) {
          step(ph.orig.size);
        }
      }
      inserting = true;
      const row = check(await this.sb.from('posts').insert({
        id, family_id: fid, caption: caption || '',
        taken_at: new Date(takenAt || Date.now()).toISOString(), photos: metas,
      }).select(POST_COLS).single());
      return Object.assign(post(row), skippedOriginals ? { skippedOriginals } : {});
    } catch (e) {
      // 게시물은 저장됐는데 응답만 못 받은 경우 (화면이 꺼지는 순간 등) → 지우지 말고 그대로 쓰기
      if (inserting) {
        try {
          const found = check(await this.sb.from('posts').select(POST_COLS).eq('id', id).maybeSingle());
          if (found) return post(found);
        } catch {
          // 확인조차 안 되면 지금은 지우지 않고, 다음에 게시물이 없는 걸 확인한 뒤 지워요
          await this.cleanOrphans(uploaded.splice(0));
        }
      }
      uploaded.forEach(forget);
      if (uploaded.length) {
        const { error } = await store.remove(uploaded).catch((err) => ({ error: err }));
        if (error) await this.cleanOrphans(uploaded);
      }
      throw e;
    }
  }

  async updatePost(p, { caption, takenAt }) {
    const patch = {};
    if (caption !== undefined) patch.caption = caption;
    if (takenAt) patch.taken_at = new Date(takenAt).toISOString();
    return post(check(await this.sb.from('posts').update(patch).eq('id', p.id).select(POST_COLS).single()));
  }

  async deletePost(p) {
    const rows = check(await this.sb.from('posts').delete().eq('id', p.id).select('id'));
    if (!rows.length) throw new Error('지울 수 있는 권한이 없어요.');
    // 이 게시물 폴더 안의 파일만 (다른 게시물 파일은 절대 건드리지 않게)
    const paths = p.photos.flatMap(filesOf).filter((x) => x.startsWith(`${p.familyId}/${p.id}/`));
    await this.sb.storage.from(BUCKET).remove(paths).catch(() => {});
    paths.forEach(forget);
  }

  async like(p, on) {
    if (on) {
      const { error } = await this.sb.from('likes').insert({ post_id: p.id });
      if (error && error.code !== '23505') throw new Error(friendly(error));
    } else {
      check(await this.sb.from('likes').delete().eq('post_id', p.id).eq('user_id', this.uid));
    }
  }

  async addComment(p, body) {
    return comment(check(await this.sb.from('comments').insert({ post_id: p.id, body }).select().single()));
  }

  async deleteComment(c) {
    check(await this.sb.from('comments').delete().eq('id', c.id));
  }

  // 최근 소식: 새 사진, 좋아요, 댓글
  async activity(fid) {
    const [posts, likes, comments] = await Promise.all([
      this.sb.from('posts').select('id, author_id, photos, created_at').eq('family_id', fid)
        .order('created_at', { ascending: false }).limit(30),
      this.sb.from('likes').select('post_id, user_id, created_at').eq('family_id', fid)
        .order('created_at', { ascending: false }).limit(40),
      this.sb.from('comments').select('id, post_id, author_id, body, created_at').eq('family_id', fid)
        .order('created_at', { ascending: false }).limit(40),
    ]).then((rs) => rs.map(check));
    const byId = new Map(posts.map((p) => [p.id, { id: p.id, photos: p.photos }]));
    const missing = [...new Set([...likes, ...comments].map((x) => x.post_id))].filter((id) => !byId.has(id));
    if (missing.length) {
      const more = check(await this.sb.from('posts').select('id, photos').in('id', missing));
      more.forEach((p) => byId.set(p.id, p));
    }
    const ev = [
      ...posts.map((p) => ({ type: 'post', at: p.created_at, userId: p.author_id, postId: p.id, post: byId.get(p.id), count: p.photos.length })),
      ...likes.map((l) => ({ type: 'like', at: l.created_at, userId: l.user_id, postId: l.post_id, post: byId.get(l.post_id) })),
      ...comments.map((c) => ({ type: 'comment', at: c.created_at, userId: c.author_id, postId: c.post_id, post: byId.get(c.post_id), body: c.body })),
    ];
    return ev.filter((e) => e.post).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 60);
  }

  // ---------- 사진 파일 ----------
  async download(path) {
    return check(await this.sb.storage.from(BUCKET).download(path));
  }

  photoURL(path) { return cachedURL(path, () => this.download(path)); }
  photoBlob(path) { return cachedBlob(path, () => this.download(path)); }
  // 원본은 그때그때 받기 (휴대폰 공간 절약). 정리돼서 없는 원본이면 err.notFound
  async originalBlob(path) {
    const { data, error } = await this.sb.storage.from(BUCKET).download(path);
    if (!error) return data;
    const err = new Error(friendly(error));
    err.notFound = /not.?found/i.test(error.message || '') || String(error.statusCode || error.status) === '404';
    throw err;
  }

  // ---------- 저장공간 ----------
  async storageUsage() {
    const used = check(await this.sb.rpc('storage_usage'));
    return { used: Number(used) || 0, limit: this.storageLimit, shared: true };
  }

  // 오래된 게시물의 원본만 지우기 (관리자) — 꾸민 사진·작은 사진은 그대로
  // 파일을 먼저 지우고 게시물 정보를 고쳐요. 중간에 끊겨도 다시 하면 이어서 마무리돼요
  // (거꾸로 하면 어디에도 안 보이는 파일이 공간만 차지할 수 있어요)
  async dropOriginals(fid, paths) {
    for (let i = 0; i < paths.length; i += 100) {
      check(await this.sb.storage.from(BUCKET).remove(paths.slice(i, i + 100)));
    }
    const cleared = check(await this.sb.rpc('forget_originals', { p_family: fid, p_paths: paths })) || [];
    return cleared.length;
  }

  // ---------- 이메일 연결 (기기를 바꿔도 다시 들어올 수 있게) ----------
  async linkEmail(email) {
    check(await this.sb.auth.updateUser({ email }, { emailRedirectTo: location.origin + location.pathname }));
  }

  async verifyLinkEmail(email, token) {
    const data = check(await this.sb.auth.verifyOtp({ email, token, type: 'email_change' }));
    if (data.session) this.session = data.session;
    else this.session = (await this.sb.auth.getSession()).data.session;
  }

  async sendLoginCode(email) {
    check(await this.sb.auth.signInWithOtp({
      email, options: { shouldCreateUser: false, emailRedirectTo: location.origin + location.pathname },
    }));
  }

  async verifyLoginCode(email, token) {
    const data = check(await this.sb.auth.verifyOtp({ email, token, type: 'email' }));
    this.session = data.session;
  }

  async refreshSession() {
    this.session = (await this.sb.auth.getSession()).data.session;
    return this.user();
  }

  async signOut() {
    await this.sb.auth.signOut();
    this.session = null;
  }
}
