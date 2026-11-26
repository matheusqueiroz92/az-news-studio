import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

import { createDb } from './client.js';

const connectionString = process.env.DATABASE_URL ?? '';
if (connectionString === '') {
  console.error('DATABASE_URL ausente.');
  process.exit(1);
}

const db = createDb(connectionString);

try {
  await migrate(db, {
    migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)),
  });
  console.log('Migração aplicada.');
} finally {
  await db.$client.end();
}
