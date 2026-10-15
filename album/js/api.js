// 설정(config.js)에 Supabase 정보가 있으면 가족 공유 모드, 없으면 체험 모드
import config from '../config.js';

// 'abcdefgh' (프로젝트 ID만) 이나 'abcdefgh.supabase.co' 를 넣어도 전체 주소로 바꿔 줘요
export function supabaseUrl(v) {
  const s = String(v || '').trim().replace(/\/+$/, '');
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  if (/^[a-z0-9]{10,40}$/i.test(s)) return `https://${s.toLowerCase()}.supabase.co`;
  return `https://${s}`;
}

export async function createApi() {
  const url = supabaseUrl(config.supabaseUrl);
  if (url && config.supabaseKey) {
    const { CloudApi } = await import('./api-cloud.js');
    return new CloudApi({ ...config, supabaseUrl: url });
  }
  const { LocalApi } = await import('./api-local.js');
  return new LocalApi();
}
