import { defineConfig, mergeConfig } from 'vitest/config';
import { sharedVitestConfig } from '@az-news/config/vitest.shared';

export default mergeConfig(
  sharedVitestConfig,
  defineConfig({
    test: {
      coverage: {
        provider: 'v8',
        exclude: ['test/**'],
        thresholds: {
          lines: 90,
        },
      },
    },
  }),
);
