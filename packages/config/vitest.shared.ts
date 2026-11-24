import { defineConfig } from 'vitest/config';

export const sharedVitestConfig = defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
  },
});
