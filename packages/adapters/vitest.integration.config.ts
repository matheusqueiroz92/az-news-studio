/**
 * `pnpm test:integration` na raiz do repositório.
 * Fora do `pnpm test` e do CI. Aponta para a homologação do WordPress:
 * WP_BASE_URL, WP_USERNAME e WP_APP_PASSWORD. Sem essas variáveis, o teste pula.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/cms/wordpress-rest-cms.integration.test.ts'],
    coverage: {
      enabled: false,
    },
  },
});
