// 클라우드 모드: Supabase(무료)를 통해 멀리 있는 가족과 사진을 나눕니다.
// 받은 사진은 photo-cache.js가 휴대폰 안에도 보관합니다.

import { createClient } from '../vendor/supabase.js';
import { uuid } from './util.js';
import { cachedURL, cachedBlob, remember, forget } from './photo-cache.js';
import { friendly } from './errors.js';

const BUCKET = 'photos';

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

  constructor({ supabaseUrl, supabaseKey }) {
    this.sb = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'ssukssuk-auth' },
    });
    this.session = null;
  }

  async init() {
    const { data } = await this.sb.auth.getSession();
    this.session = data.session;
    this.sb.auth.onAuthStateChange((_e, s) => { this.session = s; });
    return this.user();
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
    const rows = await this.allPhotos(f.id);
    const paths = rows.flatMap((p) => p.photos.flatMap((ph) => [ph.path, ph.thumb]));
    for (let i = 0; i < paths.length; i += 100) {
      check(await this.sb.storage.from(BUCKET).remove(paths.slice(i, i + 100)));
    }
    check(await this.sb.from('families').delete().eq('id', f.id));
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

  async removeMember(fid, userId) {
    check(await this.sb.from('members').delete().eq('family_id', fid).eq('user_id', userId));
  }

  async leaveFamily(fid) { return this.removeMember(fid, this.uid); }

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
      const rows = check(await this.sb.from('posts').select('id, photos, taken_at, created_at')
        .eq('family_id', fid).order('taken_at', { ascending: false }).range(from, from + 999));
      out.push(...rows.map((r) => ({ id: r.id, photos: r.photos, takenAt: r.taken_at, createdAt: r.created_at })));
      if (rows.length < 1000) return out;
    }
  }

  async post(id) {
    const r = check(await this.sb.from('posts').select(POST_COLS).eq('id', id).maybeSingle());
    return r ? post(r) : null;
  }

  async createPost(fid, { caption, takenAt, photos }, onProgress) {
    const id = uuid();
    const store = this.sb.storage.from(BUCKET);
    const uploaded = [];
    const metas = [];
    const total = photos.length * 2;
    try {
      for (let i = 0; i < photos.length; i++) {
        const ph = photos[i];
        const path = `${fid}/${id}/${i}.jpg`;
        const thumb = `${fid}/${id}/${i}_t.jpg`;
        for (const [p, blob] of [[path, ph.blob], [thumb, ph.thumb]]) {
          check(await store.upload(p, blob, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false }));
          uploaded.push(p);
          remember(p, blob);
          onProgress?.(uploaded.length / total);
        }
        metas.push({ path, thumb, w: ph.w, h: ph.h, ph: ph.ph });
      }
      const row = check(await this.sb.from('posts').insert({
        id, family_id: fid, caption: caption || '',
        taken_at: new Date(takenAt || Date.now()).toISOString(), photos: metas,
      }).select(POST_COLS).single());
      return post(row);
    } catch (e) {
      if (uploaded.length) await store.remove(uploaded).catch(() => {});
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
    const paths = p.photos.flatMap((ph) => [ph.path, ph.thumb]);
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
