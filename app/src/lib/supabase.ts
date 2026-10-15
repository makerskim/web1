import { createClient } from '@supabase/supabase-js';
import { config } from './config';

export const sb = createClient(config.supabaseUrl, config.supabaseKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce', storageKey: 'pm-auth' },
});

// 디버깅·테스트용
(globalThis as { __pm?: unknown }).__pm = { sb };
