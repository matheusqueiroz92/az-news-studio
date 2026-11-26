import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';

import {
  err,
  ok,
  type AuditEntry,
  type AuditLogPort,
  type AuditWriteError,
  type Result,
} from '@az-news/core';
import { auditLog } from '@az-news/db';
import type * as schema from '@az-news/db';

export class PostgresAuditLog<
  TResult extends PgQueryResultHKT,
> implements AuditLogPort {
  constructor(private readonly db: PgDatabase<TResult, typeof schema>) {}

  async record(entry: AuditEntry): Promise<Result<void, AuditWriteError>> {
    try {
      await this.db.insert(auditLog).values({
        occurredAt: entry.occurredAt,
        actorId: entry.actorId,
        action: entry.action,
        channel: entry.channel,
        result: entry.result,
        target: entry.target,
        detail: entry.detail,
      });
      return ok(undefined);
    } catch {
      // A porta só conhece write_failed: recusa do banco não sobe como exceção.
      return err({ code: 'write_failed' });
    }
  }
}
