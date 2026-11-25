import type { Result } from '../shared/result.js';

/** A fila recusou a publicação. Não há outro código. */
export type EnqueueError = {
  readonly code: 'enqueue_failed';
};

export interface JobQueuePort {
  /**
   * Publica um job na fila nomeada.
   * `payload` é um registro JSON somente leitura.
   * `jobId`, quando vem, identifica o job para não duplicar.
   * Err `enqueue_failed` quando a fila recusa.
   */
  enqueue(
    queue: string,
    jobName: string,
    payload: Readonly<Record<string, unknown>>,
    jobId?: string,
  ): Promise<Result<{ readonly jobId: string }, EnqueueError>>;
}
