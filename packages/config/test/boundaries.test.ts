import { ESLint } from 'eslint';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const configFile = fileURLToPath(
  new URL('../eslint.config.mjs', import.meta.url),
);

let eslint: ESLint;

beforeAll(() => {
  eslint = new ESLint({
    cwd: repoRoot,
    overrideConfigFile: configFile,
  });
});

async function lint(
  relativePath: string,
  code: string,
): Promise<ESLint.LintResult> {
  const [result] = await eslint.lintText(code, {
    filePath: path.join(repoRoot, relativePath),
  });
  if (result === undefined) {
    throw new Error(`ESLint não devolveu resultado para ${relativePath}`);
  }
  return result;
}

function ruleCount(result: ESLint.LintResult, ruleId: string): number {
  return result.messages.filter((message) => message.ruleId === ruleId).length;
}

describe('fronteiras da arquitetura hexagonal', () => {
  it('deve falhar quando packages/core importa @az-news/adapters', async () => {
    const result = await lint(
      'packages/core/src/forbidden.ts',
      "import { cms } from '@az-news/adapters';\nexport const value = cms;\n",
    );
    expect(ruleCount(result, 'boundaries/dependencies')).toBeGreaterThan(0);
  });

  it('deve falhar quando o ESLint roda com cwd em packages/core e src importa @az-news/adapters', async () => {
    const coreRoot = path.join(repoRoot, 'packages/core');
    const fromCore = new ESLint({ cwd: coreRoot });
    const [result] = await fromCore.lintText(
      "import { cms } from '@az-news/adapters';\nexport const value = cms;\n",
      { filePath: path.join(coreRoot, 'src/forbidden.ts') },
    );
    if (result === undefined) {
      throw new Error('ESLint não devolveu resultado para src/forbidden.ts');
    }
    expect(ruleCount(result, 'boundaries/dependencies')).toBeGreaterThan(0);
  });

  it('deve falhar quando packages/core importa @az-news/db', async () => {
    const result = await lint(
      'packages/core/src/forbidden.ts',
      "import { db } from '@az-news/db';\nexport const value = db;\n",
    );
    expect(ruleCount(result, 'boundaries/dependencies')).toBeGreaterThan(0);
  });

  it('deve falhar quando packages/core importa drizzle-orm, bullmq, next, better-auth ou pino', async () => {
    for (const specifier of [
      'drizzle-orm',
      'bullmq',
      'next',
      'better-auth',
      'pino',
    ]) {
      const result = await lint(
        'packages/core/src/forbidden.ts',
        `import lib from '${specifier}';\nexport const value = lib;\n`,
      );
      expect(
        ruleCount(result, 'boundaries/dependencies'),
        specifier,
      ).toBeGreaterThan(0);
    }
  });

  it('deve falhar quando packages/core importa um built-in node:*', async () => {
    const result = await lint(
      'packages/core/src/forbidden.ts',
      "import fs from 'node:fs';\nexport const value = fs;\n",
    );
    expect(ruleCount(result, 'boundaries/dependencies')).toBeGreaterThan(0);
  });

  it('deve aceitar quando packages/core importa @az-news/contracts e zod', async () => {
    const result = await lint(
      'packages/core/src/allowed.ts',
      "import { event } from '@az-news/contracts';\nimport { z } from 'zod';\nexport const value = { event, z };\n",
    );
    expect(result.errorCount).toBe(0);
  });

  it('deve falhar quando packages/contracts importa @az-news/core', async () => {
    const result = await lint(
      'packages/contracts/src/forbidden.ts',
      "import { result } from '@az-news/core';\nexport const value = result;\n",
    );
    expect(ruleCount(result, 'boundaries/dependencies')).toBeGreaterThan(0);
  });

  it('deve aceitar quando packages/adapters importa @az-news/core', async () => {
    const result = await lint(
      'packages/adapters/src/allowed.ts',
      "import { result } from '@az-news/core';\nexport const value = result;\n",
    );
    expect(result.errorCount).toBe(0);
  });

  it('deve falhar quando packages/adapters importa apps/web', async () => {
    const byPackage = await lint(
      'packages/adapters/src/forbidden.ts',
      "import { page } from '@az-news/web';\nexport const value = page;\n",
    );
    expect(ruleCount(byPackage, 'boundaries/dependencies')).toBeGreaterThan(0);

    const byFolder = await lint(
      'packages/adapters/src/forbidden.ts',
      "import { page } from '../../../apps/web/src/page.ts';\nexport const value = page;\n",
    );
    expect(ruleCount(byFolder, 'boundaries/dependencies')).toBeGreaterThan(0);
  });

  it('deve falhar quando packages/core usa o global fetch', async () => {
    const result = await lint(
      'packages/core/src/forbidden.ts',
      "export const value = fetch('https://example.com');\n",
    );
    expect(ruleCount(result, 'no-restricted-globals')).toBeGreaterThan(0);
  });

  it('deve aceitar import relativo dentro do próprio packages/core', async () => {
    const result = await lint(
      'packages/core/src/index.ts',
      "import { sibling } from './sibling.ts';\nexport const value = sibling;\n",
    );
    expect(result.errorCount).toBe(0);
  });

  it('deve aceitar quando packages/core/src/x.test.ts importa vitest', async () => {
    const result = await lint(
      'packages/core/src/x.test.ts',
      "import { expect } from 'vitest';\nexport const value = expect;\n",
    );
    expect(result.errorCount).toBe(0);
  });

  it('deve falhar quando packages/core/src/x.test.ts importa @az-news/adapters', async () => {
    const result = await lint(
      'packages/core/src/x.test.ts',
      "import { cms } from '@az-news/adapters';\nexport const value = cms;\n",
    );
    expect(ruleCount(result, 'boundaries/dependencies')).toBeGreaterThan(0);
  });

  it('deve aceitar packages/core/vitest.config.ts importando vitest/config e @az-news/config', async () => {
    const result = await lint(
      'packages/core/vitest.config.ts',
      "import { defineConfig } from 'vitest/config';\nimport { sharedVitestConfig } from '@az-news/config/vitest.shared';\nexport default defineConfig(sharedVitestConfig);\n",
    );
    expect(result.errorCount).toBe(0);
  });

  it('deve falhar quando packages/core usa globalThis.fetch', async () => {
    const result = await lint(
      'packages/core/src/forbidden.ts',
      "export const value = globalThis.fetch('https://example.com');\n",
    );
    expect(ruleCount(result, 'no-restricted-properties')).toBeGreaterThan(0);
  });

  it('deve falhar quando packages/core usa process.env', async () => {
    const result = await lint(
      'packages/core/src/forbidden.ts',
      'export const value = process.env.DATABASE_URL;\n',
    );
    expect(ruleCount(result, 'no-restricted-globals')).toBeGreaterThan(0);
  });
});
