// 서버 기능(Supabase Edge Function 'drive') 부르기
import { sb } from './supabase';
import { config } from './config';
import { friendly } from './errors';

export async function authHeaders() {
  const { data } = await sb.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('다시 로그인해 주세요.');
  return { Authorization: `Bearer ${token}`, apikey: config.supabaseKey };
}

export const fnUrl = (route: string) => `${config.supabaseUrl}/functions/v1/drive/${route}`;

// 오류에는 서버가 보낸 이름(code)도 붙여 둬요 (연결 준비 상태를 가릴 때 써요)
const fnError = (code: string) => Object.assign(new Error(friendly(code)), { code });

export async function fnCall<T>(route: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { ...(await authHeaders()) };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(fnUrl(route), { method: body === undefined ? 'GET' : 'POST', headers, body: body === undefined ? undefined : JSON.stringify(body) })
    .catch(() => { throw fnError('offline'); });
  if (!res.ok) {
    let msg = `drive_${res.status}`;
    try { msg = (await res.json()).error || msg; } catch { /* 본문 없음 */ }
    throw fnError(msg);
  }
  return res.json() as Promise<T>;
}
