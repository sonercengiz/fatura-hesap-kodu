import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  base: './',
  build: { target: 'chrome109' },
  test: { environment: 'node', include: ['test/**/*.test.ts'] },
});
