import { err, ok, type TestCmsConnection } from '@az-news/core';
import { UnrecoverableError } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';

import { createLogger } from '../logger.js';
import {
  processCmsJob,
  type CmsJob,
  type JobLogger,
} from './test-cms-connection-job.js';

const silentLogger: JobLogger = {
  info() {},
  error() {},
};

function job(data: unknown, name = 'TestCmsConnection'): CmsJob {
  return { name, id: 'job-1', data };
}

function successExecute() {
  return vi.fn<TestCmsConnection['execute']>(async () =>
    ok({ postId: '15', trashed: true }),
  );
}

async function rejected(run: () => Promise<void>): Promise<unknown> {
  try {
    await run();
    return undefined;
  } catch (error) {
    return error;
  }
}

describe('processCmsJob', () => {
  it('deve chamar TestCmsConnection uma vez com o requestedBy do payload', async () => {
    const execute = successExecute();

    await processCmsJob(
      job({ requestedBy: 'user-7' }),
      { execute },
      silentLogger,
    );

    expect(execute).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledWith({ requestedBy: 'user-7' });
  });

  it('deve concluir o job quando o caso de uso devolve ok', async () => {
    await expect(
      processCmsJob(
        job({ requestedBy: 'user-7' }),
        { execute: successExecute() },
        silentLogger,
      ),
    ).resolves.toBeUndefined();
  });

  it('deve falhar o job quando o caso de uso devolve erro', async () => {
    const execute = vi.fn<TestCmsConnection['execute']>(async () =>
      err({ code: 'draft_failed' }),
    );

    const error = await rejected(() =>
      processCmsJob(
        job({ requestedBy: 'user-7' }),
        { execute },
        silentLogger,
      ),
    );

    expect(execute).toHaveBeenCalledOnce();
    expect(error).toBeInstanceOf(UnrecoverableError);
    expect(error).toMatchObject({ message: 'draft_failed' });
  });

  it('deve falhar o job quando o payload é inválido', async () => {
    const execute = successExecute();

    const error = await rejected(() =>
      processCmsJob(job({}), { execute }, silentLogger),
    );

    expect(execute).not.toHaveBeenCalled();
    expect(error).toBeInstanceOf(UnrecoverableError);
    expect(error).toMatchObject({ message: 'invalid_payload' });
  });

  it('deve falhar o job quando o nome do job é desconhecido', async () => {
    const execute = successExecute();

    const error = await rejected(() =>
      processCmsJob(
        job({ requestedBy: 'user-7' }, 'PublishToCms'),
        { execute },
        silentLogger,
      ),
    );

    expect(execute).not.toHaveBeenCalled();
    expect(error).toBeInstanceOf(UnrecoverableError);
    expect(error).toMatchObject({ message: 'unknown_job' });
  });

  it('deve emitir log JSON sem a senha do WordPress nem o segredo do webhook', async () => {
    const lines: string[] = [];
    const jsonLogger = createLogger({
      level: 'info',
      destination: {
        write(line: string) {
          lines.push(line);
        },
      },
    });
    jsonLogger.info(
      {
        jobName: 'TestCmsConnection',
        jobId: 'job-1',
        result: 'success',
        WP_APP_PASSWORD: 'senha-de-aplicativo',
        authorization: 'Basic c3R1ZGlvOnNlZ3JlZG8=',
        Authorization: 'Basic c3R1ZGlvOnNlZ3JlZG8=',
        WP_WEBHOOK_SECRET: 'segredo-do-webhook',
      },
      'job concluído',
    );

    const captured: string[] = [];
    const logger: JobLogger = {
      info(obj, message) {
        captured.push(JSON.stringify({ ...obj, message }));
      },
      error(obj, message) {
        captured.push(JSON.stringify({ ...obj, message }));
      },
    };
    await processCmsJob(
      job({
        requestedBy: 'user-7',
        WP_APP_PASSWORD: 'senha-de-aplicativo',
        authorization: 'Basic c3R1ZGlvOnNlZ3JlZG8=',
        WP_WEBHOOK_SECRET: 'segredo-do-webhook',
      }),
      { execute: successExecute() },
      logger,
    );

    const output = `${lines.join('')}\n${captured.join('\n')}`;
    expect(output).toContain('TestCmsConnection');
    expect(output).toContain('job-1');
    expect(output).toContain('success');
    expect(output).not.toContain('senha-de-aplicativo');
    expect(output).not.toContain('Basic c3R1ZGlvOnNlZ3JlZG8=');
    expect(output).not.toContain('segredo-do-webhook');
  });
});
