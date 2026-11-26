import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { users } from './schema/auth.js';
import * as schema from './schema/index.js';
import { seedAdmin } from './seed-admin.js';

// shortcut: PGlite sem @electric-sql/pglite-pgvector; a extensão vector é conferida no Postgres do compose.
const migrationSql = readFileSync(
  fileURLToPath(new URL('../drizzle/0000_initial.sql', import.meta.url)),
  'utf8',
);

async function applySchema(client: PGlite): Promise<void> {
  const statements = migrationSql
    .split('--> statement-breakpoint')
    .map((part) => part.trim())
    .filter((part) => part !== '' && !part.startsWith('CREATE EXTENSION'));
  for (const statement of statements) {
    await client.exec(statement);
  }
}

describe('seed do primeiro admin', () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;

  beforeAll(async () => {
    client = new PGlite();
    await applySchema(client);
    db = drizzle({ client, schema });
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await db.delete(users);
  });

  it('deve não inserir admin quando SEED_ADMIN_EMAIL está vazio', async () => {
    const result = await seedAdmin(db, '');

    expect(result).toEqual({ status: 'skipped' });
    expect(await db.select().from(users)).toHaveLength(0);
  });

  it('deve inserir um admin ativo com o e-mail em minúsculas quando a tabela está vazia', async () => {
    const randomUuid = vi.spyOn(crypto, 'randomUUID');
    try {
      const result = await seedAdmin(db, 'Admin@Example.com');

      expect(result).toEqual({ status: 'inserted' });
      expect(randomUuid).toHaveBeenCalledOnce();
      const rows = await db.select().from(users);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        id: randomUuid.mock.results[0]?.value,
        name: '',
        email: 'admin@example.com',
        emailVerified: false,
        role: 'admin',
        active: true,
      });
    } finally {
      randomUuid.mockRestore();
    }
  });

  it('deve não duplicar o admin numa segunda execução', async () => {
    const first = await seedAdmin(db, 'admin@example.com');
    const second = await seedAdmin(db, 'ADMIN@example.com');

    expect(first).toEqual({ status: 'inserted' });
    expect(second).toEqual({ status: 'unchanged' });
    const rows = await db.select().from(users);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.email).toBe('admin@example.com');
  });

  it('deve recusar semear se já existir outro usuário e o e-mail do seed ainda não existir', async () => {
    await db.insert(users).values({
      id: crypto.randomUUID(),
      name: '',
      email: 'editor@example.com',
      emailVerified: false,
      role: 'editor',
      active: true,
    });

    const result = await seedAdmin(db, 'admin@example.com');

    expect(result).toEqual({ status: 'refused' });
    const rows = await db.select().from(users);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.email).toBe('editor@example.com');
  });
});
