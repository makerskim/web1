// 사진 파일 저장소: 경로가 'drive:파일ID'면 구글 드라이브(서버 기능을 거쳐서), 아니면 Supabase 저장소
import { sb } from './supabase';
import { config } from './config';
import { cachedBlob, cachedURL, forget, remember } from './photoCache';
import { friendly } from './errors';

const BUCKET = 'photos';
export const isDrive = (p: string) => p.startsWith('drive:');

async function authHeaders() {
  const { data } = await sb.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('다시 로그인해 주세요.');
  return { Authorization: `Bearer ${token}`, apikey: config.supabaseKey };
}

const fnUrl = (route: string) => `${config.supabaseUrl}/functions/v1/drive/${route}`;

// 오류에는 서버가 보낸 이름(code)도 붙여 둬요 (연결 준비 상태를 가릴 때 써요)
const fnError = (code: string) => Object.assign(new Error(friendly(code)), { code });

export async function driveCall<T>(route: string, init: RequestInit = {}): Promise<T> {
  const headers = { ...(await authHeaders()), ...(init.headers || {}) };
  const res = await fetch(fnUrl(route), { ...init, headers }).catch(() => { throw fnError('offline'); });
  if (!res.ok) {
    let msg = `drive_${res.status}`;
    try { msg = (await res.json()).error || msg; } catch { /* 본문 없음 */ }
    throw fnError(msg);
  }
  const type = res.headers.get('content-type') || '';
  return (type.includes('application/json') ? res.json() : res.blob()) as Promise<T>;
}

// 파일 받기 (캐시 없이)
export async function fetchFile(albumId: string, path: string): Promise<Blob> {
  if (isDrive(path)) {
    return driveCall<Blob>(`file?album=${encodeURIComponent(albumId)}&id=${encodeURIComponent(path.slice(6))}`);
  }
  const { data, error } = await sb.storage.from(BUCKET).download(path);
  if (error) {
    const err = new Error(friendly(error)) as Error & { notFound?: boolean };
    err.notFound = /not.?found/i.test(error.message || '');
    throw err;
  }
  return data;
}

// 화면에 보여줄 주소 (휴대폰에 보관된 것 먼저)
export const photoURL = (albumId: string, path: string) => cachedURL(path, () => fetchFile(albumId, path));
export const photoBlob = (albumId: string, path: string) => cachedBlob(path, () => fetchFile(albumId, path));

export interface UploadTarget { albumId: string; storage: 'supabase' | 'drive'; postId: string }

// 올리기 → 저장된 경로를 돌려줘요
export async function uploadFile(t: UploadTarget, name: string, blob: Blob, type: string, cache = true): Promise<string> {
  // 파일에 적힌 형식이 이상하면(예: image/jpg) 저장소가 거절해서, 내용은 그대로 형식 이름만 바꿔요
  const body = blob.type === type ? blob : blob.slice(0, blob.size, type);
  let path: string;
  if (t.storage === 'drive') {
    const r = await driveCall<{ id: string }>(`upload?album=${encodeURIComponent(t.albumId)}&name=${encodeURIComponent(`${t.postId}_${name}`)}`, {
      method: 'POST', body, headers: { 'Content-Type': type },
    });
    path = `drive:${r.id}`;
  } else {
    path = `${t.albumId}/${t.postId}/${name}`;
    const { error } = await sb.storage.from(BUCKET).upload(path, body, { contentType: type, cacheControl: '31536000', upsert: false });
    if (error) throw new Error(friendly(error));
  }
  if (cache) remember(path, blob);
  return path;
}

// 지우기 (드라이브는 서버가 이 앨범 폴더 안의 파일인지 확인해요)
export async function removeFiles(albumId: string, paths: string[]) {
  const drive = paths.filter(isDrive).map((p) => p.slice(6));
  const local = paths.filter((p) => !isDrive(p));
  for (let i = 0; i < local.length; i += 100) {
    const { error } = await sb.storage.from(BUCKET).remove(local.slice(i, i + 100));
    if (error) throw new Error(friendly(error));
  }
  if (drive.length) {
    await driveCall('delete', { method: 'POST', body: JSON.stringify({ album: albumId, ids: drive }), headers: { 'Content-Type': 'application/json' } });
  }
  paths.forEach((p) => forget(p));
}
