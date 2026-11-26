import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import * as schema from '@az-news/db';
import { drizzle, type PgliteQueryResultHKT } from 'drizzle-orm/pglite';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { PostgresUserRepository } from './postgres-user-repository.js';

// shortcut: PGlite sem @electric-sql/pglite-pgvector; a extensão vector é conferida no Postgres do compose.
const migrationSql = readFileSync(
  fileURLToPath(
    new URL(
      '../../../../packages/db/drizzle/0000_initial.sql',
      import.meta.url,
    ),
  ),
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

describe('PostgresUserRepository', () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let repository: PostgresUserRepository<PgliteQueryResultHKT>;

  beforeAll(async () => {
    client = new PGlite();
    await applySchema(client);
    db = drizzle({ client, schema });
    repository = new PostgresUserRepository(db);
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await db.delete(schema.users);
  });

  it('deve inserir e achar o usuário pelo e-mail em qualquer caixa', async () => {
    const randomUuid = vi.spyOn(crypto, 'randomUUID');
    try {
      const created = await repository.insert({
        email: 'Ada@Aznews.com',
        name: 'Ada',
        role: 'editor',
        active: true,
      });

      expect(randomUuid).toHaveBeenCalledOnce();
      expect(created).toEqual({
        id: randomUuid.mock.results[0]?.value,
        email: 'ada@aznews.com',
        name: 'Ada',
        role: 'editor',
        active: true,
      });
      expect(await repository.findByEmail('ADA@aznews.com')).toEqual(created);
      expect(await repository.findByEmail('ada@aznews.com')).toEqual(created);
      expect(await repository.findByEmail('ausente@aznews.com')).toBeNull();
    } finally {
      randomUuid.mockRestore();
    }
  });

  it("deve gravar name como '' quando NewUser.name é null e devolver null ao ler", async () => {
    const created = await repository.insert({
      email: 'sem-nome@aznews.com',
      name: null,
      role: 'sales',
      active: true,
    });

    expect(created.name).toBeNull();
    const rows = await db.select().from(schema.users);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe('');
    expect(await repository.findByEmail('sem-nome@aznews.com')).toMatchObject({
      name: null,
    });
    expect(await repository.findById(created.id)).toMatchObject({ name: null });
    expect(await repository.list()).toEqual([
      expect.objectContaining({ id: created.id, name: null }),
    ]);
  });

  it('deve persistir papel e active', async () => {
    const created = await repository.insert({
      email: 'eva@aznews.com',
      name: 'Eva',
      role: 'editor',
      active: true,
    });

    await repository.updateRole(created.id, 'sales');
    await repository.setActive(created.id, false);

    const stored = await repository.findById(created.id);
    expect(stored).toMatchObject({
      id: created.id,
      role: 'sales',
      active: false,
    });
    expect(await repository.list()).toEqual([stored]);
    expect(await repository.findById(crypto.randomUUID())).toBeNull();
  });

  it('deve contar admins ativos', async () => {
    await repository.insert({
      email: 'ana@aznews.com',
      name: 'Ana',
      role: 'admin',
      active: true,
    });
    await repository.insert({
      email: 'bia@aznews.com',
      name: 'Bia',
      role: 'admin',
      active: true,
    });
    await repository.insert({
      email: 'caio@aznews.com',
      name: 'Caio',
      role: 'admin',
      active: false,
    });
    await repository.insert({
      email: 'davi@aznews.com',
      name: 'Davi',
      role: 'editor',
      active: true,
    });

    expect(await repository.countActiveAdmins()).toBe(2);
  });

  it('deve propagar a exceção quando o banco recusa a gravação', async () => {
    const user = {
      email: 'ada@aznews.com',
      name: 'Ada',
      role: 'editor' as const,
      active: true,
    };
    await repository.insert(user);

    await expect(
      repository.insert({ ...user, email: 'ADA@aznews.com' }),
    ).rejects.toThrow();
  });
});
