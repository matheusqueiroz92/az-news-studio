import { isErr, type TestCmsConnection } from '@az-news/core';
import { UnrecoverableError } from 'bullmq';
import { z } from 'zod';

export type CmsJob = {
  readonly name: string;
  readonly id: string;
  readonly data: unknown;
};

export type JobLogger = {
  info(obj: Record<string, unknown>, message: string): void;
  error(obj: Record<string, unknown>, message: string): void;
};

const payloadSchema = z.object({
  requestedBy: z.string().trim().nonempty(),
});

/** Sem Redis. A falha é `UnrecoverableError` e a mensagem é só o código. */
export async function processCmsJob(
  job: CmsJob,
  useCase: Pick<TestCmsConnection, 'execute'>,
  logger: JobLogger,
): Promise<void> {
  if (job.name !== 'TestCmsConnection') {
    fail(logger, job, 'unknown_job');
  }

  const parsed = payloadSchema.safeParse(job.data);
  if (!parsed.success) {
    fail(logger, job, 'invalid_payload');
  }

  const result = await useCase.execute({
    requestedBy: parsed.data.requestedBy,
  });
  if (isErr(result)) {
    fail(logger, job, result.error.code);
  }

  logger.info(
    { jobName: job.name, jobId: job.id, result: 'success' },
    'job concluído',
  );
}

function fail(logger: JobLogger, job: CmsJob, code: string): never {
  logger.error(
    { jobName: job.name, jobId: job.id, result: 'failure', code },
    'job falhou',
  );
  throw new UnrecoverableError(code);
}
