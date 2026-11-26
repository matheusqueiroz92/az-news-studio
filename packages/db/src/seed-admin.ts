import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';

import { createDb } from './client.js';
import { users } from './schema/auth.js';
import type * as schema from './schema/index.js';

export type SeedAdminResult = {
  status: 'skipped' | 'inserted' | 'unchanged' | 'refused';
};

const messages = {
  skipped: 'SEED_ADMIN_EMAIL vazio; nenhum usuário foi criado.',
  inserted: 'Admin criado.',
  unchanged: 'O admin do seed já existe; nenhum usuário novo foi criado.',
  refused:
    'A tabela de usuários não está vazia e o e-mail do seed ainda não existe. Nenhum admin foi criado.',
} as const;

export async function seedAdmin<TResult extends PgQueryResultHKT>(
  db: PgDatabase<TResult, typeof schema>,
  email: string,
): Promise<SeedAdminResult> {
  const normalized = email.trim().toLowerCase();
  if (normalized === '') {
    return { status: 'skipped' };
  }

  const existing = await db.select({ email: users.email }).from(users);
  if (existing.some((row) => row.email.toLowerCase() === normalized)) {
    return { status: 'unchanged' };
  }
  if (existing.length > 0) {
    return { status: 'refused' };
  }

  await db.insert(users).values({
    id: crypto.randomUUID(),
    name: '',
    email: normalized,
    emailVerified: false,
    role: 'admin',
    active: true,
  });
  return { status: 'inserted' };
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) {
    return false;
  }
  return pathToFileURL(path.resolve(entry)).href === import.meta.url;
}

async function runSeedCli(): Promise<void> {
  const connectionString = process.env.DATABASE_URL ?? '';
  if (connectionString === '') {
    console.error('DATABASE_URL ausente.');
    process.exitCode = 1;
    return;
  }

  const db = createDb(connectionString);
  try {
    const result = await seedAdmin(db, process.env.SEED_ADMIN_EMAIL ?? '');
    if (result.status === 'refused') {
      console.error(messages.refused);
      process.exitCode = 1;
      return;
    }
    console.log(messages[result.status]);
  } finally {
    await db.$client.end();
  }
}

if (isDirectRun()) {
  await runSeedCli();
}
