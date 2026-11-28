/**
 * Fora do `pnpm test` e do CI.
 * Na raiz: `pnpm test:e2e`, com Postgres e Redis do `pnpm infra:up`
 * e o WordPress local do `pnpm wp:up`. Lê o `.env` da raiz.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.e2e.test.ts'],
    fileParallelism: false,
    testTimeout: 90_000,
    hookTimeout: 30_000,
  },
});
