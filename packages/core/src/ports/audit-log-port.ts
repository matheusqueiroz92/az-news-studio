import type { Result } from '../shared/result.js';

/**
 * Vocabulário fechado. Não criar sinônimo.
 * O webhook usa `actorId` nulo; o restante identifica o usuário.
 */
export type AuditAction =
  | 'auth.sign_in'
  | 'user.create'
  | 'user.change_role'
  | 'user.set_active'
  | 'cms.test_connection.requested'
  | 'cms.test_connection.completed'
  | 'webhook.post.published';

/** `mcp` já existe para a fase do servidor, que ainda não está aqui. */
export type AuditChannel = 'web' | 'worker' | 'mcp';

export type AuditOutcome = 'success' | 'failure';

/** A gravação foi recusada. Não há outro código. */
export type AuditWriteError = {
  readonly code: 'write_failed';
};

export type AuditEntry = {
  readonly actorId: string | null;
  readonly action: AuditAction;
  readonly channel: AuditChannel;
  readonly result: AuditOutcome;
  readonly target: string | null;
  readonly detail: Readonly<Record<string, unknown>> | null;
  /** Instante UTC da ocorrência. */
  readonly occurredAt: Date;
};

export interface AuditLogPort {
  /**
   * Só acrescenta uma linha.
   * Não há update nem delete. `detail` não leva segredo.
   * Err `write_failed` quando a gravação é recusada.
   */
  record(entry: AuditEntry): Promise<Result<void, AuditWriteError>>;
}
