import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 만든 때 (한국 시간): 설정 → 버전에 보여요. 휴대폰에 새 버전이 왔는지 여기서 알 수 있어요
const kst = new Date(Date.now() + 9 * 3600_000);
const BUILT = `${kst.getUTCMonth() + 1}월 ${kst.getUTCDate()}일 ${String(kst.getUTCHours()).padStart(2, '0')}:${String(kst.getUTCMinutes()).padStart(2, '0')}`;

// GitHub Pages: https://<user>.github.io/<repo>/album/ — 상대 경로로 빌드해서 어디에 올려도 동작해요
export default defineConfig({
  base: './',
  define: { __BUILT__: JSON.stringify(BUILT) },
  plugins: [react()],
  build: { outDir: 'dist', sourcemap: false, target: 'es2020' },
  server: { host: true },
});
