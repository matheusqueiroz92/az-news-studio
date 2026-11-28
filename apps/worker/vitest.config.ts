import { defaultExclude, defineConfig, mergeConfig } from 'vitest/config';
import { sharedVitestConfig } from '@az-news/config/vitest.shared';

export default mergeConfig(
  sharedVitestConfig,
  defineConfig({
    test: {
      // A ponta a ponta abre Redis, Postgres e WordPress. Fica fora do `pnpm test`.
      exclude: [...defaultExclude, '**/*.e2e.test.ts'],
    },
  }),
);
