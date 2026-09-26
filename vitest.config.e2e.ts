import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    env: {
      JWT_ACCESS_SECRET: 'e2e-secret-that-is-at-least-32-characters',
    },
    globals: true,
    globalSetup: ['./test/global-setup.ts'],
    hookTimeout: 60_000,
    root: './',
    include: ['**/*.e2e-spec.ts'],
  },
});
