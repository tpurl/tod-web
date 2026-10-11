import { defineConfig } from 'vitest/config';

// base './' so the build works from a GitHub Pages project subpath.
export default defineConfig({
  base: './',
  build: { target: 'es2022', outDir: 'dist' },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
