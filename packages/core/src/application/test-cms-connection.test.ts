import { describe, expect, it } from 'vitest';

import { FakeAuditLog } from '../../test/fakes/fake-audit-log.js';
import { FakeClock } from '../../test/fakes/fake-clock.js';
import { FakeCmsPort } from '../../test/fakes/fake-cms-port.js';
import type { CmsErrorCode } from '../ports/cms-error.js';
import { TestCmsConnection, buildTestDraft } from './test-cms-connection.js';
import type { TestCmsConnectionFailureCode } from './test-cms-connection.js';

const ACTOR = 'user-7';
const POST_ID = '4821';
const PREVIOUS_EVENING = new Date('2026-11-24T02:00:00.000Z');
const SAO_PAULO_MIDNIGHT = new Date('2026-11-24T03:05:09.000Z');

const EXCERPT = 'Rascunho de teste do AZ News Studio.';
const CONTENT_HTML =
  '<p>Rascunho criado pelo AZ News Studio para testar a conexão. Pode ir para a lixeira.</p>';
const META_DESCRIPTION =
  'Rascunho automático do AZ News Studio para testar a conexão com o WordPress. Não publicar.';

function expectedDraft(calendarDate: string, stamp: string) {
  return {
    title: `[TESTE STUDIO] ${calendarDate}`,
    excerpt: EXCERPT,
    contentHtml: CONTENT_HTML,
    slug: `teste-studio-${stamp}`,
    metaDescription: META_DESCRIPTION,
    categoryIds: [],
    tagNames: [],
  };
}

function trackCalls(cms: FakeCmsPort, auditLog: FakeAuditLog): string[] {
  const order: string[] = [];
  const checkConnection = cms.checkConnection.bind(cms);
  const createDraft = cms.createDraft.bind(cms);
  const trashPost = cms.trashPost.bind(cms);
  const record = auditLog.record.bind(auditLog);

  cms.checkConnection = () => {
    order.push('checkConnection');
    return checkConnection();
  };
  cms.createDraft = (input) => {
    order.push('createDraft');
    return createDraft(input);
  };
  cms.trashPost = (id) => {
    order.push('trashPost');
    return trashPost(id);
  };
  auditLog.record = (entry) => {
    order.push('record');
    return record(entry);
  };

  return order;
}

function harness(instant: Date = SAO_PAULO_MIDNIGHT) {
  const cms = new FakeCmsPort();
  cms.nextPostId = POST_ID;
  const auditLog = new FakeAuditLog();
  const clock = new FakeClock(instant);
  const order = trackCalls(cms, auditLog);
  const useCase = new TestCmsConnection(cms, auditLog, clock);

  return { cms, auditLog, clock, order, useCase, instant };
}

function expectOnce(clock: FakeClock, cms: FakeCmsPort): void {
  expect(clock.nowCount).toBe(1);
  expect(cms.checkCount).toBe(1);
}

function expectNotCreated(cms: FakeCmsPort): void {
  expect(cms.drafts).toEqual([]);
  expect(cms.createdIds).toEqual([]);
  expect(cms.trashAttempts).toEqual([]);
}

function expectFailureAudit(
  auditLog: FakeAuditLog,
  code: TestCmsConnectionFailureCode,
  target: string | null,
  instant: Date,
): void {
  expect(auditLog.entries).toEqual([
    {
      actorId: ACTOR,
      action: 'cms.test_connection.completed',
      channel: 'worker',
      result: 'failure',
      target,
      detail: { code },
      occurredAt: instant,
    },
  ]);
}

describe('buildTestDraft', () => {
  it('deve montar o rascunho exato da tabela RF-04 quando o instante é 2026-11-24T03:05:09.000Z', () => {
    expect(buildTestDraft(SAO_PAULO_MIDNIGHT)).toEqual(
      expectedDraft('2026-11-24', '20261124-000509'),
    );
  });

  it('deve montar título e slug do dia anterior em São Paulo quando o instante é 2026-11-24T02:00:00.000Z', () => {
    expect(buildTestDraft(PREVIOUS_EVENING)).toEqual(
      expectedDraft('2026-11-23', '20261123-230000'),
    );
  });
});

describe('TestCmsConnection', () => {
  it('deve criar o rascunho com o título, a meta description e o slug da tabela acima e jogá-lo na lixeira quando a conexão está autenticada', async () => {
    const { cms, order, useCase } = harness();

    const result = await useCase.execute({ requestedBy: ACTOR });

    expect(result).toEqual({
      ok: true,
      value: { postId: POST_ID, trashed: true },
    });
    expect(cms.drafts).toEqual([
      expectedDraft('2026-11-24', '20261124-000509'),
    ]);
    expect(cms.createdIds).toEqual([POST_ID]);
    expect(cms.trashAttempts).toEqual([POST_ID]);
    expect(cms.trashedIds).toEqual([POST_ID]);
    expect(order).toEqual([
      'checkConnection',
      'createDraft',
      'trashPost',
      'record',
    ]);
  });

  it('deve chamar checkConnection, createDraft, trashPost e o audit log nessa ordem quando a conexão está autenticada', async () => {
    const { order, useCase } = harness();

    await useCase.execute({ requestedBy: ACTOR });

    expect(order).toEqual([
      'checkConnection',
      'createDraft',
      'trashPost',
      'record',
    ]);
  });

  it('deve pedir a hora ao ClockPort uma única vez quando o título, o slug e o occurredAt são gravados', async () => {
    const { cms, auditLog, clock, useCase, instant } =
      harness(PREVIOUS_EVENING);

    await useCase.execute({ requestedBy: ACTOR });

    expect(clock.nowCount).toBe(1);
    expect(cms.drafts).toEqual([
      expectedDraft('2026-11-23', '20261123-230000'),
    ]);
    expect(auditLog.entries).toEqual([
      {
        actorId: ACTOR,
        action: 'cms.test_connection.completed',
        channel: 'worker',
        result: 'success',
        target: POST_ID,
        detail: null,
        occurredAt: instant,
      },
    ]);
  });

  it('deve gravar `cms.test_connection.completed` com sucesso, channel `worker`, o ator e o id do post', async () => {
    const { auditLog, useCase, instant } = harness();

    await useCase.execute({ requestedBy: ACTOR });

    expect(auditLog.entries).toEqual([
      {
        actorId: ACTOR,
        action: 'cms.test_connection.completed',
        channel: 'worker',
        result: 'success',
        target: POST_ID,
        detail: null,
        occurredAt: instant,
      },
    ]);
  });

  it('deve não criar rascunho quando o WordPress não está alcançável', async () => {
    const { cms, clock, order, useCase } = harness();
    cms.checkError = { code: 'unreachable' };

    const result = await useCase.execute({ requestedBy: ACTOR });

    expect(result).toEqual({ ok: false, error: { code: 'unreachable' } });
    expectNotCreated(cms);
    expect(order).toEqual(['checkConnection', 'record']);
    expectOnce(clock, cms);
  });

  it('deve gravar falha no audit log quando a conexão falha', async () => {
    const { cms, auditLog, useCase, instant } = harness();
    cms.checkError = { code: 'unreachable' };

    await useCase.execute({ requestedBy: ACTOR });

    expectFailureAudit(auditLog, 'unreachable', null, instant);
  });

  it('deve devolver unreachable e não criar rascunho quando reachable é false e authenticated é true', async () => {
    const { cms, auditLog, clock, order, useCase, instant } = harness();
    cms.status = { ...cms.status, reachable: false, authenticated: true };

    const result = await useCase.execute({ requestedBy: ACTOR });

    expect(result).toEqual({ ok: false, error: { code: 'unreachable' } });
    expectNotCreated(cms);
    expect(order).toEqual(['checkConnection', 'record']);
    expectFailureAudit(auditLog, 'unreachable', null, instant);
    expectOnce(clock, cms);
  });

  it('deve devolver unreachable e não criar rascunho quando reachable é false e authenticated também é false', async () => {
    const { cms, auditLog, clock, order, useCase, instant } = harness();
    cms.status = { ...cms.status, reachable: false, authenticated: false };

    const result = await useCase.execute({ requestedBy: ACTOR });

    expect(result).toEqual({ ok: false, error: { code: 'unreachable' } });
    expectNotCreated(cms);
    expect(order).toEqual(['checkConnection', 'record']);
    expectFailureAudit(auditLog, 'unreachable', null, instant);
    expectOnce(clock, cms);
  });

  it('deve não criar rascunho quando a autenticação falha', async () => {
    const { cms, auditLog, clock, order, useCase, instant } = harness();
    cms.status = { ...cms.status, reachable: true, authenticated: false };

    const result = await useCase.execute({ requestedBy: ACTOR });

    expect(result).toEqual({
      ok: false,
      error: { code: 'unauthenticated' },
    });
    expectNotCreated(cms);
    expect(order).toEqual(['checkConnection', 'record']);
    expectFailureAudit(auditLog, 'unauthenticated', null, instant);
    expectOnce(clock, cms);
  });

  it.each([
    ['unreachable', 'unreachable'],
    ['unauthenticated', 'unauthenticated'],
    ['invalid_response', 'invalid_response'],
    ['invalid_response', 'draft_failed'],
    ['invalid_response', 'trash_failed'],
  ] as const)(
    'deve devolver %s e gravar essa falha no audit log sem criar rascunho quando checkConnection devolve %s',
    async (useCaseCode, portCode) => {
      const { cms, auditLog, clock, order, useCase, instant } = harness();
      cms.checkError = { code: portCode };

      const result = await useCase.execute({ requestedBy: ACTOR });

      expect(result).toEqual({ ok: false, error: { code: useCaseCode } });
      expectNotCreated(cms);
      expect(order).toEqual(['checkConnection', 'record']);
      expectFailureAudit(auditLog, useCaseCode, null, instant);
      expectOnce(clock, cms);
    },
  );

  it.each(['unreachable', 'unauthenticated', 'invalid_response'] as const)(
    'deve preservar %s e não chamar a lixeira quando createDraft devolve esse código',
    async (code) => {
      const { cms, auditLog, clock, order, useCase, instant } = harness();
      cms.draftError = { code };

      const result = await useCase.execute({ requestedBy: ACTOR });

      expect(result).toEqual({ ok: false, error: { code } });
      expect(cms.drafts).toHaveLength(1);
      expect(cms.createdIds).toEqual([]);
      expect(cms.trashAttempts).toEqual([]);
      expect(order).toEqual(['checkConnection', 'createDraft', 'record']);
      expectFailureAudit(auditLog, code, null, instant);
      expectOnce(clock, cms);
    },
  );

  it('deve devolver `draft_failed` e não chamar a lixeira quando a criação falha', async () => {
    const { cms, auditLog, clock, order, useCase, instant } = harness();
    cms.draftError = { code: 'draft_failed' };

    const result = await useCase.execute({ requestedBy: ACTOR });

    expect(result).toEqual({ ok: false, error: { code: 'draft_failed' } });
    expect(cms.createdIds).toEqual([]);
    expect(cms.trashAttempts).toEqual([]);
    expect(order).toEqual(['checkConnection', 'createDraft', 'record']);
    expectFailureAudit(auditLog, 'draft_failed', null, instant);
    expectOnce(clock, cms);
  });

  it('deve devolver draft_failed e não chamar a lixeira quando a criação devolve trash_failed', async () => {
    const { cms, auditLog, clock, order, useCase, instant } = harness();
    cms.draftError = { code: 'trash_failed' };

    const result = await useCase.execute({ requestedBy: ACTOR });

    expect(result).toEqual({ ok: false, error: { code: 'draft_failed' } });
    expect(cms.createdIds).toEqual([]);
    expect(cms.trashAttempts).toEqual([]);
    expect(order).toEqual(['checkConnection', 'createDraft', 'record']);
    expectFailureAudit(auditLog, 'draft_failed', null, instant);
    expectOnce(clock, cms);
  });

  it('deve devolver `trash_failed` com o id do post quando a criação funciona e a lixeira falha', async () => {
    const { cms, clock, order, useCase } = harness();
    cms.trashError = { code: 'trash_failed' };

    const result = await useCase.execute({ requestedBy: ACTOR });

    expect(result).toEqual({
      ok: false,
      error: { code: 'trash_failed', postId: POST_ID },
    });
    expect(cms.createdIds).toEqual([POST_ID]);
    expect(cms.trashAttempts).toEqual([POST_ID]);
    expect(cms.trashedIds).toEqual([]);
    expect(order).toEqual([
      'checkConnection',
      'createDraft',
      'trashPost',
      'record',
    ]);
    expectOnce(clock, cms);
  });

  it('deve gravar falha no audit log quando a lixeira falha', async () => {
    const { cms, auditLog, useCase, instant } = harness();
    cms.trashError = { code: 'trash_failed' };

    await useCase.execute({ requestedBy: ACTOR });

    expectFailureAudit(auditLog, 'trash_failed', POST_ID, instant);
  });

  it.each([
    'unreachable',
    'unauthenticated',
    'invalid_response',
    'draft_failed',
  ] as const satisfies readonly CmsErrorCode[])(
    'deve devolver trash_failed com o id do post e gravar essa falha quando a lixeira devolve %s',
    async (portCode) => {
      const { cms, auditLog, clock, order, useCase, instant } = harness();
      cms.trashError = { code: portCode };

      const result = await useCase.execute({ requestedBy: ACTOR });

      expect(result).toEqual({
        ok: false,
        error: { code: 'trash_failed', postId: POST_ID },
      });
      expect(cms.createdIds).toEqual([POST_ID]);
      expect(cms.trashAttempts).toEqual([POST_ID]);
      expect(cms.trashedIds).toEqual([]);
      expect(order).toEqual([
        'checkConnection',
        'createDraft',
        'trashPost',
        'record',
      ]);
      expectFailureAudit(auditLog, 'trash_failed', POST_ID, instant);
      expectOnce(clock, cms);
    },
  );

  it('deve devolver audit_write_failed com o post na lixeira quando o audit log recusa o sucesso', async () => {
    const { cms, auditLog, clock, order, useCase, instant } = harness();
    auditLog.failWrites = true;

    const result = await useCase.execute({ requestedBy: ACTOR });

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'audit_write_failed',
        attemptedResult: 'success',
        postId: POST_ID,
      },
    });
    expect(cms.trashedIds).toEqual([POST_ID]);
    expect(auditLog.entries).toEqual([
      {
        actorId: ACTOR,
        action: 'cms.test_connection.completed',
        channel: 'worker',
        result: 'success',
        target: POST_ID,
        detail: null,
        occurredAt: instant,
      },
    ]);
    expect(order).toEqual([
      'checkConnection',
      'createDraft',
      'trashPost',
      'record',
    ]);
    expectOnce(clock, cms);
  });

  it('deve devolver audit_write_failed com o post órfão quando o audit log recusa a falha da lixeira', async () => {
    const { cms, auditLog, clock, order, useCase, instant } = harness();
    cms.trashError = { code: 'trash_failed' };
    auditLog.failWrites = true;

    const result = await useCase.execute({ requestedBy: ACTOR });

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'audit_write_failed',
        attemptedResult: 'trash_failed',
        postId: POST_ID,
      },
    });
    expect(cms.createdIds).toEqual([POST_ID]);
    expect(cms.trashedIds).toEqual([]);
    expect(cms.trashAttempts).toEqual([POST_ID]);
    expectFailureAudit(auditLog, 'trash_failed', POST_ID, instant);
    expect(order).toEqual([
      'checkConnection',
      'createDraft',
      'trashPost',
      'record',
    ]);
    expectOnce(clock, cms);
  });

  it('deve devolver audit_write_failed sem post quando o audit log recusa a falha de conexão', async () => {
    const { cms, auditLog, clock, order, useCase, instant } = harness();
    cms.checkError = { code: 'unreachable' };
    auditLog.failWrites = true;

    const result = await useCase.execute({ requestedBy: ACTOR });

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'audit_write_failed',
        attemptedResult: 'unreachable',
        postId: null,
      },
    });
    expectNotCreated(cms);
    expectFailureAudit(auditLog, 'unreachable', null, instant);
    expect(order).toEqual(['checkConnection', 'record']);
    expectOnce(clock, cms);
  });
});
