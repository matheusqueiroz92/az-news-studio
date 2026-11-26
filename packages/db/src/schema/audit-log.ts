import { sql } from 'drizzle-orm';
import {
  check,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    occurredAt: timestamp('occurred_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    actorId: text('actor_id'),
    action: text('action').notNull(),
    channel: text('channel').notNull(),
    result: text('result').notNull(),
    target: text('target'),
    detail: jsonb('detail'),
  },
  (table) => [
    check(
      'audit_log_channel_check',
      sql`${table.channel} in ('web', 'worker', 'mcp')`,
    ),
    check(
      'audit_log_result_check',
      sql`${table.result} in ('success', 'failure')`,
    ),
  ],
);
