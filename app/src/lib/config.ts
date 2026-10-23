// ================================================================
//  Pastel Memories 설정 — 바꾼 뒤 GitHub에 저장하면 1~2분 뒤 자동으로 반영돼요
// ================================================================

const raw = {
  // Supabase → Project Settings → API: Project URL (프로젝트 ID만 넣어도 돼요)
  supabaseUrl: 'https://nontwyuhvjizyuconxej.supabase.co',
  // Supabase → Project Settings → API Keys: Publishable key (공개돼도 괜찮은 키)
  supabaseKey: 'sb_publishable_2tY66N_caUEo3oMDMY6sWQ_KFY5rIdw',
};

function normalizeUrl(v: string) {
  const s = v.trim().replace(/\/+$/, '');
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  if (/^[a-z0-9]{10,40}$/i.test(s)) return `https://${s.toLowerCase()}.supabase.co`;
  return `https://${s}`;
}

// 테스트에서 바꿔 끼울 수 있게 (window.__PM_CONFIG__)
const override = (globalThis as { __PM_CONFIG__?: Partial<typeof raw> }).__PM_CONFIG__ || {};
const merged = { ...raw, ...override };

export const config = {
  ...merged,
  supabaseUrl: normalizeUrl(merged.supabaseUrl),
};
