// 사진 파일 저장소: 경로가 'gd:파일ID'면 올린 사람의 구글 드라이브(공유 폴더에서 바로), 아니면 Supabase 저장소
import { sb } from './supabase';
import { cachedBlob, cachedURL, forget, remember } from './photoCache';
import { friendly } from './errors';
import { fetchDriveFile, trashOnDrive, uploadToDrive } from './drive';

const BUCKET = 'photos';
/** 구글 드라이브 파일 ('gd:파일ID') */
export const isDrive = (p: string) => p.startsWith('gd:');
export const driveId = (p: string) => p.slice(3);

// 파일 받기 (캐시 없이)
export async function fetchFile(albumId: string, path: string): Promise<Blob> {
  if (isDrive(path)) return fetchDriveFile(driveId(path));
  if (path.startsWith('drive:')) throw Object.assign(new Error('예전 드라이브 연결의 사진이라 볼 수 없어요.'), { notFound: true });
  void albumId;
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
export interface UploadOpts {
  /** 구글 드라이브: 앱용 작은 사진 폴더에 (원본·동영상은 앨범 폴더에) */
  small?: boolean;
  /** 구글 드라이브에 보일 파일 이름 */
  driveName?: string;
  onProgress?: (sent: number) => void;
}

// 올리기 → 저장된 경로를 돌려줘요
export async function uploadFile(t: UploadTarget, name: string, blob: Blob, type: string, cache = true, opts: UploadOpts = {}): Promise<string> {
  // 파일에 적힌 형식이 이상하면(예: image/jpg) 저장소가 거절해서, 내용은 그대로 형식 이름만 바꿔요
  const body = blob.type === type ? blob : blob.slice(0, blob.size, type);
  let path: string;
  if (t.storage === 'drive') {
    const id = await uploadToDrive(t.albumId, body, { name: opts.driveName || `${t.postId}_${name}`, type, small: opts.small, onProgress: opts.onProgress });
    path = `gd:${id}`;
  } else {
    path = `${t.albumId}/${t.postId}/${name}`;
    const { error } = await sb.storage.from(BUCKET).upload(path, body, { contentType: type, cacheControl: '31536000', upsert: false });
    if (error) throw new Error(friendly(error));
  }
  if (cache) remember(path, blob);
  return path;
}

// 지우기: Supabase 파일, 그리고 내가 올린 구글 드라이브 파일은 드라이브 휴지통으로
export async function removeFiles(albumId: string, paths: string[]) {
  const drive = paths.filter(isDrive).map(driveId);
  const local = paths.filter((p) => !isDrive(p) && !p.startsWith('drive:'));
  for (let i = 0; i < local.length; i += 100) {
    const { error } = await sb.storage.from(BUCKET).remove(local.slice(i, i + 100));
    if (error) throw new Error(friendly(error));
  }
  if (drive.length) await trashOnDrive(albumId, drive).catch(() => {});
  paths.forEach((p) => forget(p));
}
