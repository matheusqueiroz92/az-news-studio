export const CMS_QUEUE_NAME = 'cms';

/** Concorrência do Worker da fila cms: um job por vez. */
export const CMS_QUEUE_CONCURRENCY = 1;

export type CmsJobOptions = {
  readonly attempts: number;
  readonly backoff: {
    readonly type: 'exponential';
    readonly delay: number;
  };
  readonly removeOnComplete: {
    readonly age: number;
    readonly count: number;
  };
  readonly removeOnFail: {
    readonly age: number;
    readonly count: number;
  };
};

const DEFAULT_ATTEMPTS = 3;

/**
 * Política da fila cms.
 * Backoff exponencial a partir de 1 s (`delay` em milissegundos).
 * `TestCmsConnection` é a exceção, com `attempts: 1`,
 * porque repetir o job criaria outro rascunho.
 * Redis guarda no máximo 100 concluídos por 24 h e 500 falhos por 7 dias
 * (`age` em segundos, `count` como teto).
 * shortcut: BullMQ só remove quando outro job termina, trocar se a fila
 * parada precisar de prazo rígido. Um jobId repetido pode entrar de novo
 * depois que o job sai por esses limites.
 */
const DEFAULT_JOB_OPTIONS = {
  attempts: DEFAULT_ATTEMPTS,
  backoff: { type: 'exponential', delay: 1_000 },
  removeOnComplete: { age: 24 * 60 * 60, count: 100 },
  removeOnFail: { age: 7 * 24 * 60 * 60, count: 500 },
} as const satisfies CmsJobOptions;

const ATTEMPTS_BY_JOB_NAME: Readonly<Record<string, number>> = {
  TestCmsConnection: 1,
};

export function optionsForJob(jobName: string): CmsJobOptions {
  return {
    ...DEFAULT_JOB_OPTIONS,
    attempts: ATTEMPTS_BY_JOB_NAME[jobName] ?? DEFAULT_JOB_OPTIONS.attempts,
  };
}
