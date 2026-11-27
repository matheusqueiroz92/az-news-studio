import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import { BullmqQueue, type JobProducer } from '../index.js';

const ONE_DAY_SECONDS = 24 * 60 * 60;
const SEVEN_DAYS_SECONDS = 7 * ONE_DAY_SECONDS;

const payload = { requestedBy: 'user-7' };

const testConnectionOptions = {
  attempts: 1,
  backoff: { type: 'exponential', delay: 1_000 },
  removeOnComplete: { age: ONE_DAY_SECONDS, count: 100 },
  removeOnFail: { age: SEVEN_DAYS_SECONDS, count: 500 },
};

function queueWith(add: JobProducer['add']): BullmqQueue {
  return new BullmqQueue({ cms: { add } });
}

describe('BullmqQueue', () => {
  it('deve publicar o job TestCmsConnection com o payload recebido', async () => {
    const add = vi.fn<JobProducer['add']>(async () => ({ id: 'job-1' }));
    const queue = queueWith(add);

    await expect(
      queue.enqueue('cms', 'TestCmsConnection', payload),
    ).resolves.toEqual({
      ok: true,
      value: { jobId: 'job-1' },
    });

    expect(add).toHaveBeenCalledOnce();
    expect(add).toHaveBeenCalledWith(
      'TestCmsConnection',
      payload,
      testConnectionOptions,
    );
  });

  it('deve publicar TestCmsConnection com uma única tentativa', async () => {
    const add = vi.fn<JobProducer['add']>(async () => ({ id: 'job-2' }));
    const queue = queueWith(add);

    await queue.enqueue('cms', 'TestCmsConnection', payload);

    expect(add.mock.calls[0]?.[2]).toMatchObject({ attempts: 1 });
  });

  it('deve publicar um job sem exceção com 3 tentativas', async () => {
    const add = vi.fn<JobProducer['add']>(async () => ({ id: 'job-3' }));
    const queue = queueWith(add);

    await queue.enqueue('cms', 'PublishToCms', { articleId: 'artigo-1' });

    expect(add.mock.calls[0]?.[2]).toMatchObject({
      attempts: 3,
      backoff: { type: 'exponential', delay: 1_000 },
    });
  });

  it('deve repassar o jobId quando informado', async () => {
    const add = vi.fn<JobProducer['add']>(async () => ({
      id: 'cms-test-user-7',
    }));
    const queue = queueWith(add);

    await expect(
      queue.enqueue('cms', 'TestCmsConnection', payload, 'cms-test-user-7'),
    ).resolves.toEqual({
      ok: true,
      value: { jobId: 'cms-test-user-7' },
    });

    expect(add).toHaveBeenCalledWith('TestCmsConnection', payload, {
      ...testConnectionOptions,
      jobId: 'cms-test-user-7',
    });
  });

  it('deve devolver enqueue_failed quando o Redis recusa a publicação (cliente injetado que falha, sem Redis real)', async () => {
    const add = vi.fn<JobProducer['add']>(async () => {
      throw new Error('Redis connection refused');
    });
    const queue = queueWith(add);

    await expect(
      queue.enqueue('cms', 'TestCmsConnection', payload),
    ).resolves.toEqual({
      ok: false,
      error: { code: 'enqueue_failed' },
    });
  });

  it('deve devolver enqueue_failed quando a fila pedida não está registrada', async () => {
    const add = vi.fn<JobProducer['add']>(async () => ({ id: 'job-4' }));
    const queue = queueWith(add);

    await expect(
      queue.enqueue('sources', 'PollSource', payload),
    ).resolves.toEqual({
      ok: false,
      error: { code: 'enqueue_failed' },
    });
    expect(add).not.toHaveBeenCalled();
  });

  it('deve devolver enqueue_failed quando a publicação não devolve jobId', async () => {
    const add = vi.fn<JobProducer['add']>(async () => ({}));
    const queue = queueWith(add);

    await expect(
      queue.enqueue('cms', 'TestCmsConnection', payload),
    ).resolves.toEqual({
      ok: false,
      error: { code: 'enqueue_failed' },
    });
  });

  it('não exporta tipos do bullmq no index do pacote', () => {
    const source = readFileSync(
      fileURLToPath(new URL('../index.ts', import.meta.url)),
      'utf8',
    );

    expect(source).not.toMatch(/from\s+['"]bullmq['"]/);
  });
});
