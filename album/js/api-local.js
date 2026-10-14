// 체험 모드: 모든 것이 이 휴대폰 안에만 저장됩니다. (가족 공유 X)
// 클라우드 모드(api-cloud.js)와 똑같은 기능 이름을 가지고 있어서 화면 코드는 둘을 구분하지 않습니다.

import { openDB } from './idb.js';
import { uuid } from './util.js';

const ME = 'local-me';

export class LocalApi {
  mode = 'local';
  urls = new Map();

  async init() {
    this.db = await openDB('ssukssuk-local', 1, (d) => {
      d.createObjectStore('families', { keyPath: 'id' });
      d.createObjectStore('members', { keyPath: ['familyId', 'userId'] }).createIndex('familyId', 'familyId');
      d.createObjectStore('posts', { keyPath: 'id' }).createIndex('familyId', 'familyId');
      const likes = d.createObjectStore('likes', { keyPath: ['postId', 'userId'] });
      likes.createIndex('postId', 'postId');
      likes.createIndex('familyId', 'familyId');
      const comments = d.createObjectStore('comments', { keyPath: 'id' });
      comments.createIndex('postId', 'postId');
      comments.createIndex('familyId', 'familyId');
      d.createObjectStore('photos');
    });
    return this.user();
  }

  user() { return { id: ME, email: null, isAnonymous: true }; }
  async ensureUser() { return this.user(); }
  get canInvite() { return false; }
  get canLinkEmail() { return false; }

  async families() {
    const fams = await this.db.all('families');
    const out = [];
    for (const f of fams) {
      const m = await this.db.get('members', [f.id, ME]);
      if (m) out.push({ ...f, myRole: m.role, myName: m.displayName, myAvatar: m.avatar });
    }
    return out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async createFamily({ name, babyName, babyBirthday, displayName, avatar }) {
    const f = {
      id: uuid(), name, babyName: babyName || '', babyBirthday: babyBirthday || null,
      inviteCode: '체험모드', createdAt: new Date().toISOString(),
    };
    await this.db.put('families', f);
    await this.db.put('members', {
      familyId: f.id, userId: ME, displayName, avatar: avatar || '🙂', role: 'owner', joinedAt: f.createdAt,
    });
    return { ...f, myRole: 'owner', myName: displayName, myAvatar: avatar };
  }

  async inviteInfo() { return null; }
  async joinFamily() { throw new Error('체험 모드에서는 초대 코드를 쓸 수 없어요.'); }

  async updateFamily(id, patch) {
    const f = await this.db.get('families', id);
    Object.assign(f, patch);
    await this.db.put('families', f);
    return f;
  }

  async resetInvite() { return '체험모드'; }

  async deleteFamily(f) {
    for (const p of await this.db.allBy('posts', 'familyId', f.id)) await this.deletePost(p);
    for (const m of await this.db.allBy('members', 'familyId', f.id)) await this.db.del('members', [m.familyId, m.userId]);
    await this.db.del('families', f.id);
  }

  async members(fid) {
    const ms = await this.db.allBy('members', 'familyId', fid);
    return ms.sort((a, b) => a.joinedAt.localeCompare(b.joinedAt));
  }

  async updateMe(fid, { displayName, avatar }) {
    const m = await this.db.get('members', [fid, ME]);
    if (displayName) m.displayName = displayName;
    if (avatar) m.avatar = avatar;
    await this.db.put('members', m);
  }

  async removeMember(fid, userId) { await this.db.del('members', [fid, userId]); }
  async leaveFamily(fid) { await this.removeMember(fid, ME); }
  async setRole() { /* 체험 모드는 혼자라서 필요 없음 */ }

  async withExtras(p) {
    const likes = await this.db.allBy('likes', 'postId', p.id);
    const comments = await this.db.allBy('comments', 'postId', p.id);
    comments.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return { ...p, likes, comments };
  }

  async posts(fid, { before, limit = 10 } = {}) {
    let all = await this.db.allBy('posts', 'familyId', fid);
    all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (before) all = all.filter((p) => p.createdAt < before);
    return Promise.all(all.slice(0, limit).map((p) => this.withExtras(p)));
  }

  async allPhotos(fid) {
    const all = await this.db.allBy('posts', 'familyId', fid);
    return all.sort((a, b) => b.takenAt.localeCompare(a.takenAt));
  }

  async post(id) {
    const p = await this.db.get('posts', id);
    return p ? this.withExtras(p) : null;
  }

  async createPost(fid, { caption, takenAt, photos }, onProgress) {
    const id = uuid();
    const metas = [];
    for (let i = 0; i < photos.length; i++) {
      const ph = photos[i];
      const path = `${fid}/${id}/${i}.jpg`;
      const thumb = `${fid}/${id}/${i}_t.jpg`;
      await this.db.put('photos', ph.blob, path);
      await this.db.put('photos', ph.thumb, thumb);
      metas.push({ path, thumb, w: ph.w, h: ph.h, ph: ph.ph });
      onProgress?.((i + 1) / photos.length);
    }
    const p = {
      id, familyId: fid, authorId: ME, caption: caption || '',
      takenAt: new Date(takenAt || Date.now()).toISOString(),
      photos: metas, createdAt: new Date().toISOString(),
    };
    await this.db.put('posts', p);
    return { ...p, likes: [], comments: [] };
  }

  async updatePost(post, { caption, takenAt }) {
    const p = await this.db.get('posts', post.id);
    if (caption !== undefined) p.caption = caption;
    if (takenAt) p.takenAt = new Date(takenAt).toISOString();
    await this.db.put('posts', p);
    return this.withExtras(p);
  }

  async deletePost(post) {
    for (const ph of post.photos) {
      await this.db.del('photos', ph.path);
      await this.db.del('photos', ph.thumb);
    }
    for (const l of await this.db.allBy('likes', 'postId', post.id)) await this.db.del('likes', [l.postId, l.userId]);
    for (const c of await this.db.allBy('comments', 'postId', post.id)) await this.db.del('comments', c.id);
    await this.db.del('posts', post.id);
  }

  async like(post, on) {
    if (on) await this.db.put('likes', { postId: post.id, userId: ME, familyId: post.familyId, createdAt: new Date().toISOString() });
    else await this.db.del('likes', [post.id, ME]);
  }

  async addComment(post, body) {
    const c = { id: uuid(), postId: post.id, familyId: post.familyId, authorId: ME, body, createdAt: new Date().toISOString() };
    await this.db.put('comments', c);
    return c;
  }

  async deleteComment(c) { await this.db.del('comments', c.id); }

  async activity(fid) {
    const posts = await this.db.allBy('posts', 'familyId', fid);
    const likes = await this.db.allBy('likes', 'familyId', fid);
    const comments = await this.db.allBy('comments', 'familyId', fid);
    const byId = new Map(posts.map((p) => [p.id, p]));
    const ev = [
      ...posts.map((p) => ({ type: 'post', at: p.createdAt, userId: p.authorId, postId: p.id, post: p, count: p.photos.length })),
      ...likes.map((l) => ({ type: 'like', at: l.createdAt, userId: l.userId, postId: l.postId, post: byId.get(l.postId) })),
      ...comments.map((c) => ({ type: 'comment', at: c.createdAt, userId: c.authorId, postId: c.postId, post: byId.get(c.postId), body: c.body })),
    ];
    return ev.filter((e) => e.post).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 60);
  }

  async photoBlob(path) {
    const b = await this.db.get('photos', path);
    if (!b) throw new Error('사진을 찾을 수 없어요.');
    return b;
  }

  async photoURL(path) {
    if (this.urls.has(path)) return this.urls.get(path);
    const url = URL.createObjectURL(await this.photoBlob(path));
    this.urls.set(path, url);
    return url;
  }

  async signOut() { /* 체험 모드에는 로그아웃이 없어요 */ }
}
