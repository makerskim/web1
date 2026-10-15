import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages: https://<user>.github.io/<repo>/album/ — 상대 경로로 빌드해서 어디에 올려도 동작해요
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { outDir: 'dist', sourcemap: false, target: 'es2020' },
  server: { host: true },
});
