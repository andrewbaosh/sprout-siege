import { defineConfig } from 'vite';

export default defineConfig({
  // 相对路径，方便部署到 GitHub Pages 的子路径 /sprout-siege/
  base: './',
  // Three.js 本身就有 500 多 KB，这个体积是正常的
  build: { chunkSizeWarningLimit: 800 },
});
