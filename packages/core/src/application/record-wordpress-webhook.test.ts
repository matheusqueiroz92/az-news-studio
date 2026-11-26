import { describe, expect, it } from 'vitest';
import type { WordPressWebhookEvent } from '@az-news/contracts';

import { FakeAuditLog } from '../../test/fakes/fake-audit-log.js';
import { FakeClock } from '../../test/fakes/fake-clock.js';
import { RecordWordpressWebhook } from './record-wordpress-webhook.js';

/** Hora de recebimento no Studio. Diferente do `publishedAt` do WordPress. */
const RECEIVED_AT = new Date('2026-11-26T13:26:00.000Z');

/** Formato `c` do PHP, o mesmo que o AZ Bridge grava em `publishedAt`. */
const PUBLISHED_AT = '2026-11-24T15:30:00+00:00';

const POST_ID = 4821;

const EVENT = {
  event: 'post.published',
  postId: POST_ID,
  url: 'https://homolog.aznews.com.br/obra-no-centro/',
  title: 'Prefeitura anuncia obra no centro',
  publishedAt: PUBLISHED_AT,
} satisfies WordPressWebhookEvent;

function harness(instant: Date = RECEIVED_AT) {
  const auditLog = new FakeAuditLog();
  const clock = new FakeClock(instant);
  const useCase = new RecordWordpressWebhook(auditLog, clock);

  return { auditLog, clock, useCase, instant };
}

function countRecordCalls(auditLog: FakeAuditLog): { count: number } {
  const record = auditLog.record.bind(auditLog);
  const counter = { count: 0 };

  auditLog.record = (entry) => {
    counter.count += 1;
    return record(entry);
  };

  return counter;
}

function publishedEntry(instant: Date) {
  return {
    actorId: null,
    action: 'webhook.post.published' as const,
    channel: 'web' as const,
    result: 'success' as const,
    target: String(POST_ID),
    detail: EVENT,
    occurredAt: instant,
  };
}

describe('RecordWordpressWebhook', () => {
  it('deve gravar `webhook.post.published` com channel `web`, ator nulo, target igual ao postId e o evento inteiro em `detail`', async () => {
    const { auditLog, useCase, instant } = harness();

    const result = await useCase.execute(EVENT);

    expect(result).toEqual({ ok: true, value: undefined });
    expect(auditLog.entries).toEqual([publishedEntry(instant)]);
  });

  it('deve devolver falha e não engolir o erro quando o audit log falha', async () => {
    const { auditLog, useCase, instant } = harness();
    auditLog.failWrites = true;

    const result = await useCase.execute(EVENT);

    expect(result).toEqual({
      ok: false,
      error: { code: 'audit_write_failed' },
    });
    expect(auditLog.entries).toEqual([publishedEntry(instant)]);
  });

  it('deve usar a hora do relógio em occurredAt, não o publishedAt do evento', async () => {
    const { auditLog, clock, useCase, instant } = harness();

    await useCase.execute(EVENT);

    expect(clock.nowCount).toBe(1);
    expect(instant.getTime()).not.toBe(new Date(PUBLISHED_AT).getTime());
    expect(auditLog.entries).toEqual([publishedEntry(instant)]);
    expect(auditLog.entries[0]?.detail).toEqual(EVENT);
  });

  it('deve chamar record uma única vez', async () => {
    const success = harness();
    const successCalls = countRecordCalls(success.auditLog);

    await success.useCase.execute(EVENT);

    expect(successCalls.count).toBe(1);

    const failure = harness();
    failure.auditLog.failWrites = true;
    const failureCalls = countRecordCalls(failure.auditLog);

    await failure.useCase.execute(EVENT);

    expect(failureCalls.count).toBe(1);
  });
});
