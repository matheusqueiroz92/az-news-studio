import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import type { AuditChannel } from '@az-news/core';
import * as schema from '@az-news/db';
import { drizzle, type PgliteQueryResultHKT } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { PostgresAuditLog } from './postgres-audit-log.js';

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

describe('PostgresAuditLog', () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let auditLog: PostgresAuditLog<PgliteQueryResultHKT>;

  beforeAll(async () => {
    client = new PGlite();
    await applySchema(client);
    db = drizzle({ client, schema });
    auditLog = new PostgresAuditLog(db);
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await db.delete(schema.auditLog);
  });

  it('deve inserir audit log com occurred_at em UTC', async () => {
    const occurredAt = new Date('2026-11-26T17:42:00.000Z');

    const result = await auditLog.record({
      actorId: 'user-1',
      action: 'user.create',
      channel: 'web',
      result: 'success',
      target: 'user-2',
      detail: { email: 'ada@aznews.com' },
      occurredAt,
    });

    expect(result).toEqual({ ok: true, value: undefined });
    const rows = await db.select().from(schema.auditLog);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.occurredAt.toISOString()).toBe('2026-11-26T17:42:00.000Z');
    expect(rows[0]).toMatchObject({
      actorId: 'user-1',
      action: 'user.create',
      channel: 'web',
      result: 'success',
      target: 'user-2',
      detail: { email: 'ada@aznews.com' },
    });
  });

  it('deve aceitar channel mcp', async () => {
    const result = await auditLog.record({
      actorId: null,
      action: 'webhook.post.published',
      channel: 'mcp',
      result: 'success',
      target: null,
      detail: null,
      occurredAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    expect(result).toEqual({ ok: true, value: undefined });
    const rows = await db.select().from(schema.auditLog);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.channel).toBe('mcp');
    expect(rows[0]?.actorId).toBeNull();
  });

  it('deve devolver write_failed quando a tabela rejeita o channel', async () => {
    const result = await auditLog.record({
      actorId: null,
      action: 'auth.sign_in',
      channel: 'email' as AuditChannel,
      result: 'failure',
      target: null,
      detail: null,
      occurredAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    expect(result).toEqual({ ok: false, error: { code: 'write_failed' } });
    expect(await db.select().from(schema.auditLog)).toHaveLength(0);
  });
});
