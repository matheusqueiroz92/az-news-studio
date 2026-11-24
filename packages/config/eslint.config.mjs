import path from 'node:path';
import boundaries from 'eslint-plugin-boundaries';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const sourceFiles = '**/*.{ts,tsx,js,mjs,cjs}';
const domainPackages = ['core', 'contracts', 'db'];
const configFileNames = [
  'vitest.config.ts',
  'eslint.config.mjs',
  'drizzle.config.ts',
  'tsconfig.json',
  'tsconfig.*.json',
];
const boundaryIgnores = domainPackages.flatMap((pkg) =>
  configFileNames.flatMap((name) => [
    `packages/${pkg}/${name}`,
    `packages/${pkg}/**/${name}`,
  ]),
);

const elements = [
  { type: 'core', pattern: 'packages/core' },
  { type: 'contracts', pattern: 'packages/contracts' },
  { type: 'db', pattern: 'packages/db' },
  { type: 'adapters', pattern: 'packages/adapters' },
  { type: 'web', pattern: 'apps/web' },
  { type: 'worker', pattern: 'apps/worker' },
];

const externalOrBuiltin = {
  to: { module: { origin: ['external', 'core'] } },
};

export default [
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tseslint.parser,
    },
  },
  prettier,
  {
    files: [
      `packages/{core,contracts,db,adapters}/${sourceFiles}`,
      `apps/{web,worker}/${sourceFiles}`,
    ],
    ignores: boundaryIgnores,
    plugins: { boundaries },
    settings: {
      'boundaries/root-path': repoRoot,
      'boundaries/elements': elements,
      'boundaries/files': [
        { pattern: '**/*.test.ts', category: 'test' },
        { pattern: '**/test/**', category: 'test' },
      ],
      'import/resolver': {
        [path.join(import.meta.dirname, 'relative-import-resolver.cjs')]: {},
        node: {},
      },
    },
    rules: {
      'boundaries/dependencies': [
        'error',
        {
          default: 'disallow',
          checkAllOrigins: true,
          checkUnknownLocals: true,
          policies: [
            {
              from: { element: { type: 'core' } },
              allow: [
                { to: { element: { type: 'contracts' } } },
                { to: { module: { source: ['zod', '@az-news/contracts'] } } },
              ],
            },
            {
              from: { element: { type: 'contracts' } },
              allow: { to: { module: { source: 'zod' } } },
            },
            {
              from: { element: { type: 'db' } },
              allow: [
                externalOrBuiltin,
                { to: { element: { type: 'contracts' } } },
              ],
            },
            {
              from: { element: { type: 'db' } },
              disallow: [
                { to: { element: { type: ['core', 'adapters'] } } },
                {
                  to: {
                    module: { source: ['@az-news/core', '@az-news/adapters'] },
                  },
                },
              ],
            },
            {
              from: { element: { type: 'adapters' } },
              allow: [
                externalOrBuiltin,
                { to: { element: { type: ['core', 'contracts', 'db'] } } },
              ],
            },
            {
              from: { element: { type: 'adapters' } },
              disallow: [
                { to: { element: { type: ['web', 'worker'] } } },
                {
                  to: {
                    module: { source: ['@az-news/web', '@az-news/worker'] },
                  },
                },
              ],
            },
            {
              from: { element: { type: ['web', 'worker'] } },
              allow: [
                externalOrBuiltin,
                {
                  to: {
                    element: { type: ['core', 'adapters', 'db', 'contracts'] },
                  },
                },
              ],
            },
            {
              from: {
                element: { type: domainPackages },
                file: { categories: 'test' },
              },
              allow: { to: { module: { source: 'vitest' } } },
            },
          ],
        },
      ],
    },
  },
  {
    files: [`packages/core/${sourceFiles}`],
    rules: {
      'no-restricted-globals': [
        'error',
        {
          name: 'fetch',
          message:
            'packages/core não pode chamar fetch; a rede fica nos adaptadores.',
        },
        {
          name: 'process',
          message:
            'packages/core não lê process.env; a configuração fica na borda.',
        },
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'globalThis',
          property: 'fetch',
          message:
            'packages/core não pode chamar fetch; a rede fica nos adaptadores.',
        },
      ],
    },
  },
];
