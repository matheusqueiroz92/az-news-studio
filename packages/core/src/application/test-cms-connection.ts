import { err, isErr, ok } from '../shared/result.js';
import type { AuditEntry, AuditLogPort } from '../ports/audit-log-port.js';
import type { ClockPort } from '../ports/clock-port.js';
import type { CmsErrorCode } from '../ports/cms-error.js';
import type {
  CmsConnectionStatus,
  CmsDraftInput,
  CmsPort,
  CmsPostId,
} from '../ports/cms-port.js';
import type { Result } from '../shared/result.js';
import { formatStudioCalendarDate, formatStudioStamp } from './studio-date.js';

/**
 * Rascunho de teste (RF-04). Textos fixos, em português.
 * Título e slug recebem a data de `studio-date` à frente destes prefixos.
 * O espaço de `TEST_DRAFT_TITLE_PREFIX` faz parte do título.
 */

export const TEST_DRAFT_TITLE_PREFIX = '[TESTE STUDIO] ';

export const TEST_DRAFT_SLUG_PREFIX = 'teste-studio-';

export const TEST_DRAFT_EXCERPT = 'Rascunho de teste do AZ News Studio.';

export const TEST_DRAFT_CONTENT_HTML =
  '<p>Rascunho criado pelo AZ News Studio para testar a conexão. Pode ir para a lixeira.</p>';

export const TEST_DRAFT_META_DESCRIPTION =
  'Rascunho automático do AZ News Studio para testar a conexão com o WordPress. Não publicar.';

/** Vazio: o adaptador omite `categories` e o WordPress aplica a categoria padrão. */
export const TEST_DRAFT_CATEGORY_IDS: readonly number[] = [];

/** Vazio: o rascunho de teste não leva tag. */
export const TEST_DRAFT_TAG_NAMES: readonly string[] = [];

/**
 * Códigos de falha do CMS que este caso de uso grava em `detail.code`.
 * `audit_write_failed` não entra aqui: essa falha não chega a ser gravada.
 */
export const testCmsConnectionFailureCodes = [
  'unreachable',
  'unauthenticated',
  'invalid_response',
  'draft_failed',
  'trash_failed',
] as const;

export type TestCmsConnectionFailureCode =
  (typeof testCmsConnectionFailureCodes)[number];

type _AssertExtends<A extends B, B> = A;

/** `{ code }` precisa caber em `AuditEntry.detail` sem campo extra. */
type _FailureDetailFitsAuditLog = _AssertExtends<
  { readonly code: TestCmsConnectionFailureCode },
  NonNullable<AuditEntry['detail']>
>;

/** Quem pediu o teste. Vira `actorId`. Este caso de uso não confere papel nem string vazia. */
export type TestCmsConnectionInput = {
  readonly requestedBy: string;
};

/** O rascunho foi criado e foi para a lixeira. Não houve exclusão definitiva. */
export type TestCmsConnectionSuccess = {
  readonly postId: CmsPostId;
  readonly trashed: true;
};

/**
 * O WordPress não respondeu, ou a porta disse `reachable: false`.
 * Nenhum rascunho é criado.
 * Audit log: result `failure`, target null, detail `{ code: 'unreachable' }`.
 */
export type UnreachableTestCmsConnectionError = {
  readonly code: 'unreachable';
};

/**
 * Credencial recusada: Ok com `reachable: true` e `authenticated: false`,
 * ou Err `unauthenticated` em `checkConnection` ou em `createDraft`.
 * Nenhum rascunho fica criado. A lixeira não é chamada.
 * Audit log: result `failure`, target null, detail `{ code: 'unauthenticated' }`.
 */
export type UnauthenticatedTestCmsConnectionError = {
  readonly code: 'unauthenticated';
};

/**
 * O corpo da resposta não serve (`invalid_response`), ou `checkConnection`
 * devolveu um código que não descreve este passo (`draft_failed`, `trash_failed`).
 * Nenhum rascunho é criado.
 * Audit log: result `failure`, target null, detail `{ code: 'invalid_response' }`.
 */
export type InvalidResponseTestCmsConnectionError = {
  readonly code: 'invalid_response';
};

/**
 * O rascunho não foi criado.
 * A porta devolveu `draft_failed`, ou devolveu `trash_failed` na criação
 * (não há id para órfão). A lixeira não é chamada.
 * Audit log: result `failure`, target null, detail `{ code: 'draft_failed' }`.
 */
export type DraftFailedTestCmsConnectionError = {
  readonly code: 'draft_failed';
};

/**
 * O rascunho existe e a lixeira recusou, qualquer que seja o código da porta.
 * O post fica órfão: continua no WordPress, fora da lixeira.
 * Audit log: result `failure`, target = `postId`, detail `{ code: 'trash_failed' }`.
 * Uma chamada só; este caso de uso não tenta de novo.
 */
export type TrashFailedTestCmsConnectionError = {
  readonly code: 'trash_failed';
  readonly postId: CmsPostId;
};

/**
 * `record` devolveu `write_failed`. Nenhuma linha ficou no audit log.
 * Não há segunda tentativa.
 * Órfão somente quando `attemptedResult` é `trash_failed` (`postId` preenchido).
 * `success`: o rascunho já está na lixeira e `postId` vem preenchido.
 * Nos demais, `postId` é null e nada foi criado.
 */
export type AuditWriteFailedTestCmsConnectionError = {
  readonly code: 'audit_write_failed';
  readonly attemptedResult: 'success' | TestCmsConnectionFailureCode;
  readonly postId: CmsPostId | null;
};

/** Falha fechada do teste de conexão. Não há outro código. */
export type TestCmsConnectionError =
  | UnreachableTestCmsConnectionError
  | UnauthenticatedTestCmsConnectionError
  | InvalidResponseTestCmsConnectionError
  | DraftFailedTestCmsConnectionError
  | TrashFailedTestCmsConnectionError
  | AuditWriteFailedTestCmsConnectionError;

type OpenFailureCode = Exclude<TestCmsConnectionFailureCode, 'trash_failed'>;

type CmsAttempt =
  | {
      readonly code: 'success';
      readonly postId: CmsPostId;
    }
  | {
      readonly code: 'trash_failed';
      readonly postId: CmsPostId;
    }
  | {
      readonly code: OpenFailureCode;
      readonly postId: null;
    };

/**
 * Diz se o worker (T17) deixa o BullMQ repetir o job.
 * A decisão olha só `error.code`.
 * Só `unreachable` é repetível: nada foi criado e a causa é transitória.
 * `unauthenticated`, `invalid_response` e `draft_failed` não se resolvem
 * com outra tentativa.
 * `trash_failed` e `audit_write_failed` ficam de fora: um job novo criaria
 * outro rascunho. `audit_write_failed` continua fora mesmo quando
 * `attemptedResult` é `unreachable`.
 */
export function isRetryableTestCmsConnectionError(
  error: TestCmsConnectionError,
): boolean {
  return error.code === 'unreachable';
}

/**
 * Monta o rascunho da tabela RF-04 para o instante UTC informado.
 * Título: `TEST_DRAFT_TITLE_PREFIX` + `formatStudioCalendarDate`.
 * Slug: `TEST_DRAFT_SLUG_PREFIX` + `formatStudioStamp`.
 * Os outros campos são as constantes deste arquivo.
 */
export function buildTestDraft(instant: Date): CmsDraftInput {
  return {
    title: `${TEST_DRAFT_TITLE_PREFIX}${formatStudioCalendarDate(instant)}`,
    excerpt: TEST_DRAFT_EXCERPT,
    contentHtml: TEST_DRAFT_CONTENT_HTML,
    slug: `${TEST_DRAFT_SLUG_PREFIX}${formatStudioStamp(instant)}`,
    metaDescription: TEST_DRAFT_META_DESCRIPTION,
    categoryIds: TEST_DRAFT_CATEGORY_IDS,
    tagNames: TEST_DRAFT_TAG_NAMES,
  };
}

/**
 * Cria o rascunho de teste e manda para a lixeira quando o WordPress
 * está alcançável e autenticado. Grava uma linha no audit log.
 *
 * Um único `clock.now()` serve ao título, ao slug e a `occurredAt`.
 * Ordem: `checkConnection`, `createDraft` só se `reachable` e `authenticated`
 * são true, `trashPost` só se a criação devolveu id, `auditLog.record` uma
 * vez no fim de cada caminho. `reachable: false` é `unreachable`, mesmo
 * quando `authenticated` também é false.
 *
 * A linha é `cms.test_connection.completed`, channel `worker`,
 * actorId = `requestedBy`. Sucesso: result `success`, target = postId,
 * detail null. Fracasso: result `failure`, detail `{ code }`, target = postId
 * só quando o id existe. `detail` não leva segredo.
 *
 * Se `record` falha, o retorno é `audit_write_failed` (o resultado do CMS
 * vai em `attemptedResult`) e `record` não é chamado de novo.
 * `createDraft` com `unreachable`, `unauthenticated` ou `invalid_response`
 * preserva esse código e não chama a lixeira.
 * Não enfileira, não lê papel e não repete chamada ao CMS.
 */
export class TestCmsConnection {
  constructor(
    private readonly cms: CmsPort,
    private readonly auditLog: AuditLogPort,
    private readonly clock: ClockPort,
  ) {}

  async execute(
    input: TestCmsConnectionInput,
  ): Promise<Result<TestCmsConnectionSuccess, TestCmsConnectionError>> {
    const occurredAt = this.clock.now();
    const attempt = await this.testConnection(occurredAt);
    const recorded = await this.auditLog.record(
      completedEntry(input.requestedBy, occurredAt, attempt),
    );

    if (isErr(recorded)) {
      return err(auditWriteFailed(attempt));
    }

    return outcomeOf(attempt);
  }

  private async testConnection(occurredAt: Date): Promise<CmsAttempt> {
    const checked = await this.cms.checkConnection();
    if (isErr(checked)) {
      return openFailure(checkFailureCode(checked.error.code));
    }

    const blocked = statusFailureCode(checked.value);
    if (blocked !== null) {
      return openFailure(blocked);
    }

    const created = await this.cms.createDraft(buildTestDraft(occurredAt));
    if (isErr(created)) {
      return openFailure(draftFailureCode(created.error.code));
    }

    const postId = created.value.id;
    const trashed = await this.cms.trashPost(postId);
    if (isErr(trashed)) {
      return { code: 'trash_failed', postId };
    }

    return { code: 'success', postId };
  }
}

function checkFailureCode(code: CmsErrorCode): OpenFailureCode {
  switch (code) {
    case 'unreachable':
    case 'unauthenticated':
    case 'invalid_response':
      return code;
    case 'draft_failed':
    case 'trash_failed':
      return 'invalid_response';
  }
}

function draftFailureCode(code: CmsErrorCode): OpenFailureCode {
  switch (code) {
    case 'unreachable':
    case 'unauthenticated':
    case 'invalid_response':
    case 'draft_failed':
      return code;
    case 'trash_failed':
      return 'draft_failed';
  }
}

function statusFailureCode(
  status: CmsConnectionStatus,
): 'unreachable' | 'unauthenticated' | null {
  if (!status.reachable) {
    return 'unreachable';
  }
  if (!status.authenticated) {
    return 'unauthenticated';
  }
  return null;
}

function openFailure(code: OpenFailureCode): CmsAttempt {
  return { code, postId: null };
}

function completedEntry(
  actorId: string,
  occurredAt: Date,
  attempt: CmsAttempt,
): AuditEntry {
  if (attempt.code === 'success') {
    return {
      actorId,
      action: 'cms.test_connection.completed',
      channel: 'worker',
      result: 'success',
      target: attempt.postId,
      detail: null,
      occurredAt,
    };
  }

  return {
    actorId,
    action: 'cms.test_connection.completed',
    channel: 'worker',
    result: 'failure',
    target: attempt.postId,
    detail: { code: attempt.code },
    occurredAt,
  };
}

function auditWriteFailed(
  attempt: CmsAttempt,
): AuditWriteFailedTestCmsConnectionError {
  if (attempt.code === 'success') {
    return {
      code: 'audit_write_failed',
      attemptedResult: 'success',
      postId: attempt.postId,
    };
  }

  return {
    code: 'audit_write_failed',
    attemptedResult: attempt.code,
    postId: attempt.postId,
  };
}

function outcomeOf(
  attempt: CmsAttempt,
): Result<
  TestCmsConnectionSuccess,
  Exclude<TestCmsConnectionError, AuditWriteFailedTestCmsConnectionError>
> {
  switch (attempt.code) {
    case 'success':
      return ok({ postId: attempt.postId, trashed: true });
    case 'trash_failed':
      return err({ code: 'trash_failed', postId: attempt.postId });
    case 'unreachable':
      return err({ code: 'unreachable' });
    case 'unauthenticated':
      return err({ code: 'unauthenticated' });
    case 'invalid_response':
      return err({ code: 'invalid_response' });
    case 'draft_failed':
      return err({ code: 'draft_failed' });
  }
}
