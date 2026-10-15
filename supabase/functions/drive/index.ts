// Pastel Memories · 구글 드라이브 저장 서버 기능 (Supabase Edge Function, 이름: drive)
//
// 앨범 관리자가 자기 구글 드라이브를 연결하면, 가족 누구나 올린 사진이 관리자 드라이브의
// 'Pastel Memories · 앨범이름' 폴더에 저장돼요. 사진은 공개 링크 없이 이 기능을 거쳐서만 볼 수 있어요.
//
// 필요한 비밀값 (Supabase → Edge Functions → Secrets):
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET   (Google Cloud의 '웹 애플리케이션' OAuth 클라이언트)
// SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 는 Supabase가 자동으로 넣어 줘요.

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') ?? '';
const CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '';
const DRIVE = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const MAX_UPLOAD = 25 * 1024 * 1024;
const ID_RE = /^[A-Za-z0-9_-]{10,200}$/;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const fail = (error: string, status = 400) => json({ error }, status);

// ---------- 구글 토큰 ----------
const tokenCache = new Map<string, { token: string; exp: number }>();

async function googleToken(params: Record<string, string>) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, ...params }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`google_token: ${body.error || res.status}`);
  return body as { access_token: string; refresh_token?: string; expires_in: number };
}

async function accessToken(albumId: string) {
  const c = tokenCache.get(albumId);
  if (c && c.exp > Date.now() + 60_000) return c.token;
  const { data } = await admin.from('drive_tokens').select('refresh_token').eq('family_id', albumId).maybeSingle();
  if (!data) throw new Error('drive_not_connected');
  const t = await googleToken({ grant_type: 'refresh_token', refresh_token: data.refresh_token });
  tokenCache.set(albumId, { token: t.access_token, exp: Date.now() + t.expires_in * 1000 });
  return t.access_token;
}

async function gfetch(albumId: string, url: string, init: RequestInit = {}) {
  const token = await accessToken(albumId);
  const res = await fetch(url, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` } });
  if (res.status === 401) tokenCache.delete(albumId);
  if (res.status === 403) {
    const t = await res.clone().text();
    if (/storageQuotaExceeded/.test(t)) throw new Error('drive_quota');
  }
  return res;
}

// 파일이 이 앨범 폴더 안에 있는지
async function inFolder(albumId: string, folder: string, id: string) {
  if (!ID_RE.test(id)) return false;
  const res = await gfetch(albumId, `${DRIVE}/files/${id}?fields=parents,trashed`);
  if (!res.ok) return false;
  const f = await res.json();
  return !f.trashed && Array.isArray(f.parents) && f.parents.includes(folder);
}

// ---------- 요청 처리 ----------
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const url = new URL(req.url);
    const route = url.pathname.split('/').filter(Boolean).pop();

    // 로그인한 사람 확인
    const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: { user } } = await admin.auth.getUser(jwt);
    if (!user) return fail('not_signed_in', 401);

    const body = req.method === 'POST' && (req.headers.get('content-type') || '').includes('application/json')
      ? await req.json() : {};
    const albumId: string = url.searchParams.get('album') || body.album || '';
    if (!/^[0-9a-f-]{36}$/.test(albumId)) return fail('bad_album');

    const { data: me } = await admin.from('members').select('role').eq('family_id', albumId).eq('user_id', user.id).maybeSingle();
    if (!me) return fail('not_member', 403);
    const { data: fam } = await admin.from('families').select('name, drive_folder_id').eq('id', albumId).single();

    // 관리자: 드라이브 연결 (브라우저에서 받은 인증 코드를 토큰으로 바꿔 보관)
    if (route === 'connect') {
      if (me.role !== 'owner') return fail('not_owner', 403);
      if (!CLIENT_ID || !CLIENT_SECRET) return fail('drive_not_configured', 500);
      const t = await googleToken({ grant_type: 'authorization_code', code: body.code, redirect_uri: 'postmessage' });
      if (!t.refresh_token) return fail('drive_no_refresh_token');
      await admin.from('drive_tokens').upsert({ family_id: albumId, refresh_token: t.refresh_token, connected_by: user.id, updated_at: new Date().toISOString() });
      tokenCache.set(albumId, { token: t.access_token, exp: Date.now() + t.expires_in * 1000 });
      const about = await (await gfetch(albumId, `${DRIVE}/about?fields=user(emailAddress)`)).json();
      let folder = fam?.drive_folder_id as string | null;
      if (!folder || !(await gfetch(albumId, `${DRIVE}/files/${folder}?fields=id,trashed`)).ok) {
        const created = await gfetch(albumId, `${DRIVE}/files?fields=id`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: `Pastel Memories · ${fam?.name || '가족 앨범'}`, mimeType: 'application/vnd.google-apps.folder' }),
        });
        if (!created.ok) return fail('drive_folder_failed', 502);
        folder = (await created.json()).id;
      }
      await admin.from('families').update({ drive_folder_id: folder, drive_email: about?.user?.emailAddress || null, storage: 'drive' }).eq('id', albumId);
      return json({ email: about?.user?.emailAddress || null });
    }

    if (route === 'disconnect') {
      if (me.role !== 'owner') return fail('not_owner', 403);
      await admin.from('drive_tokens').delete().eq('family_id', albumId);
      await admin.from('families').update({ storage: 'supabase', drive_email: null }).eq('id', albumId);
      tokenCache.delete(albumId);
      return json({ ok: true });
    }

    const folder = fam?.drive_folder_id as string | null;
    if (!folder) return fail('drive_not_connected', 409);

    // 가족 누구나: 사진 올리기
    if (route === 'upload') {
      const type = req.headers.get('content-type') || 'image/jpeg';
      if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(type)) return fail('bad_type');
      const bytes = new Uint8Array(await req.arrayBuffer());
      if (!bytes.length || bytes.length > MAX_UPLOAD) return fail('Payload too large', 413);
      const name = (url.searchParams.get('name') || 'photo.jpg').replace(/[^\w.\-]/g, '_').slice(0, 120);
      const boundary = `pm${crypto.randomUUID()}`;
      const meta = JSON.stringify({ name, parents: [folder] });
      const enc = new TextEncoder();
      const head = enc.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${type}\r\n\r\n`);
      const tail = enc.encode(`\r\n--${boundary}--`);
      const payload = new Uint8Array(head.length + bytes.length + tail.length);
      payload.set(head, 0); payload.set(bytes, head.length); payload.set(tail, head.length + bytes.length);
      const res = await gfetch(albumId, `${UPLOAD}/files?uploadType=multipart&fields=id`, {
        method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body: payload,
      });
      if (!res.ok) return fail(`drive_upload_${res.status}`, 502);
      return json({ id: (await res.json()).id });
    }

    // 가족 누구나: 사진 보기 (앨범 폴더 안의 파일만)
    if (route === 'file') {
      const id = url.searchParams.get('id') || '';
      if (!(await inFolder(albumId, folder, id))) return fail('not_found', 404);
      const res = await gfetch(albumId, `${DRIVE}/files/${id}?alt=media`);
      if (!res.ok || !res.body) return fail('not_found', 404);
      return new Response(res.body, {
        headers: { ...cors, 'Content-Type': res.headers.get('content-type') || 'image/jpeg', 'Cache-Control': 'private, max-age=31536000, immutable' },
      });
    }

    // 지우기: 관리자, 또는 그 사진이 들어 있는 게시물을 올린 사람
    if (route === 'delete') {
      const ids: string[] = (Array.isArray(body.ids) ? body.ids : []).filter((x: unknown) => typeof x === 'string' && ID_RE.test(x)).slice(0, 100);
      let mine = new Set<string>();
      if (me.role !== 'owner') {
        const { data: rows } = await admin.from('posts').select('photos').eq('family_id', albumId).eq('author_id', user.id);
        mine = new Set((rows || []).flatMap((r: { photos: Array<Record<string, string>> }) =>
          r.photos.flatMap((p) => [p.path, p.thumb, p.orig]).filter((x) => x?.startsWith('drive:')).map((x) => x.slice(6))));
      }
      let deleted = 0;
      for (const id of ids) {
        if (me.role !== 'owner' && !mine.has(id)) continue;
        if (!(await inFolder(albumId, folder, id))) continue;
        const res = await gfetch(albumId, `${DRIVE}/files/${id}`, { method: 'DELETE' });
        if (res.ok || res.status === 404) deleted++;
      }
      return json({ deleted });
    }

    return fail('unknown_route', 404);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return fail(msg, /drive_not_connected/.test(msg) ? 409 : /drive_quota/.test(msg) ? 507 : 500);
  }
});
