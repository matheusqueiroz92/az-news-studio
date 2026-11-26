import type { WordPressWebhookEvent } from '@az-news/contracts';

import type { AuditEntry, AuditLogPort } from '../ports/audit-log-port.js';
import type { ClockPort } from '../ports/clock-port.js';
import { err, isErr, ok, type Result } from '../shared/result.js';

/**
 * `record` devolveu `write_failed`. Nenhuma linha ficou no audit log.
 * Não há segunda tentativa.
 */
export type AuditWriteFailedRecordWordpressWebhookError = {
  readonly code: 'audit_write_failed';
};

/** Falha fechada deste caso de uso. Não há outro código. */
export type RecordWordpressWebhookError =
  AuditWriteFailedRecordWordpressWebhookError;

type _AssertExtends<A extends B, B> = A;

/** O evento inteiro precisa caber em `AuditEntry.detail` sem campo extra. */
type _EventDetailFitsAuditLog = _AssertExtends<
  WordPressWebhookEvent,
  NonNullable<AuditEntry['detail']>
>;

/**
 * Grava no audit log um `post.published` já validado.
 * Não conhece HTTP, não calcula HMAC e não relê o schema.
 *
 * Uma única chamada a `auditLog.record`, com result `success`:
 * actorId null (o webhook não tem usuário), channel `web`,
 * action `webhook.post.published`, target = `postId` em string,
 * detail = o evento inteiro, occurredAt = `clock.now()`
 * (hora de recebimento; o `publishedAt` do WordPress fica em `detail`).
 *
 * Se `record` falha, o retorno é `audit_write_failed` e `record`
 * não é chamado de novo.
 */
export class RecordWordpressWebhook {
  constructor(
    private readonly auditLog: AuditLogPort,
    private readonly clock: ClockPort,
  ) {}

  async execute(
    event: WordPressWebhookEvent,
  ): Promise<Result<void, RecordWordpressWebhookError>> {
    const occurredAt = this.clock.now();
    const recorded = await this.auditLog.record({
      actorId: null,
      action: 'webhook.post.published',
      channel: 'web',
      result: 'success',
      target: String(event.postId),
      detail: event,
      occurredAt,
    });

    if (isErr(recorded)) {
      return err({ code: 'audit_write_failed' });
    }

    return ok(undefined);
  }
}
