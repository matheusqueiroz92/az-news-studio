import { defaultExclude, defineConfig, mergeConfig } from 'vitest/config';
import { sharedVitestConfig } from '@az-news/config/vitest.shared';

export default mergeConfig(
  sharedVitestConfig,
  defineConfig({
    test: {
      // A integração abre socket contra a homologação e não entra no `pnpm test`.
      exclude: [...defaultExclude, '**/*.integration.test.ts'],
      coverage: {
        provider: 'v8',
        exclude: ['test/**', '**/*.integration.test.ts'],
        thresholds: {
          lines: 90,
        },
      },
    },
  }),
);
