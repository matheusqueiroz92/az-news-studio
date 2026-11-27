import { describe, expect, it } from 'vitest';

import { WordPressRestCms } from '../index.js';

/**
 * Opcional. Não entra em `pnpm test` nem no CI.
 * Na raiz: `pnpm test:integration`, com WP_BASE_URL, WP_USERNAME e
 * WP_APP_PASSWORD da homologação. Sem elas, este arquivo pula e avisa.
 */
const REQUIRED_ENV = ['WP_BASE_URL', 'WP_USERNAME', 'WP_APP_PASSWORD'] as const;

const missing = REQUIRED_ENV.filter((name) => {
  const value = process.env[name];
  return value === undefined || value.trim() === '';
});

if (missing.length > 0) {
  console.warn(
    `Teste de integração do WordPress ignorado. Defina ${missing.join(', ')} e rode \`pnpm test:integration\` contra a homologação. Este teste não faz parte do \`pnpm test\` nem do CI.`,
  );
}

const EXCERPT = 'Rascunho de teste do AZ News Studio.';
const CONTENT_HTML =
  '<p>Rascunho criado pelo AZ News Studio para testar a conexão. Pode ir para a lixeira.</p>';
const META_DESCRIPTION =
  'Rascunho automático do AZ News Studio para testar a conexão com o WordPress. Não publicar.';

describe.skipIf(missing.length > 0)('WordPressRestCms (integração)', () => {
  it('cria o rascunho com a meta description e manda para a lixeira', async () => {
    const baseUrl = process.env.WP_BASE_URL ?? '';
    const username = process.env.WP_USERNAME ?? '';
    const appPassword = process.env.WP_APP_PASSWORD ?? '';
    const cms = new WordPressRestCms({
      baseUrl,
      username,
      appPassword,
      timeoutMs: 20_000,
    });
    const stamp = new Date().toISOString().replaceAll(/\D/g, '').slice(0, 14);
    const created = await cms.createDraft({
      title: `[TESTE STUDIO] ${stamp}`,
      excerpt: EXCERPT,
      contentHtml: CONTENT_HTML,
      slug: `teste-studio-${stamp}`,
      metaDescription: META_DESCRIPTION,
      categoryIds: [],
      tagNames: [],
    });

    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    const authorization = basicAuthorization(username, appPassword);
    try {
      expect(created.value.id).toMatch(/^\d+$/);
      const draft = await readPost(baseUrl, created.value.id, authorization);
      expect(draft.status).toBe('draft');
      expect(draft.metaDescription).toBe(META_DESCRIPTION);

      await expect(cms.trashPost(created.value.id)).resolves.toEqual({
        ok: true,
        value: undefined,
      });

      const trashed = await readPost(baseUrl, created.value.id, authorization);
      expect(trashed.status).toBe('trash');
    } finally {
      await cms.trashPost(created.value.id);
    }
  }, 40_000);
});

function basicAuthorization(username: string, appPassword: string): string {
  const password = appPassword.replaceAll(/\s+/g, '');
  const token = Buffer.from(`${username}:${password}`, 'utf8').toString(
    'base64',
  );
  return `Basic ${token}`;
}

async function readPost(
  baseUrl: string,
  id: string,
  authorization: string,
): Promise<{ status: string | undefined; metaDescription: unknown }> {
  const origin = baseUrl.replace(/\/+$/, '');
  const response = await fetch(
    `${origin}/wp-json/wp/v2/posts/${encodeURIComponent(id)}?context=edit`,
    { headers: { authorization } },
  );
  const body = (await response.json()) as {
    status?: string;
    meta?: Record<string, unknown>;
  };
  return {
    status: body.status,
    metaDescription: body.meta?._yoast_wpseo_metadesc,
  };
}
