// 설정(config.js)에 Supabase 정보가 있으면 가족 공유 모드, 없으면 체험 모드
import config from '../config.js';

export async function createApi() {
  if (config.supabaseUrl && config.supabaseKey) {
    const { CloudApi } = await import('./api-cloud.js');
    return new CloudApi(config);
  }
  const { LocalApi } = await import('./api-local.js');
  return new LocalApi();
}
