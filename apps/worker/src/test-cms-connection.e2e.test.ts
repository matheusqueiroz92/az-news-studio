import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { CMS_QUEUE_NAME, optionsForJob } from '@az-news/adapters';
import { Queue, QueueEvents } from 'bullmq';
import { Redis } from 'ioredis';
import { Pool } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';

import { createWorkerApp, type WorkerApp } from './container.js';

loadDotEnv();

const redisClients: Redis[] = [];
let app: WorkerApp | undefined;
let queue: Queue | undefined;
let events: QueueEvents | undefined;
let pool: Pool | undefined;

afterAll(async () => {
  await app?.close();
  await queue?.close();
  await events?.close();
  await pool?.end();
  await Promise.all(redisClients.map((client) => client.quit().catch(() => undefined)));
});

describe('TestCmsConnection de ponta a ponta', () => {
  it('grava o audit log e manda o rascunho [TESTE STUDIO] para a lixeira', async () => {
    const redisUrl = required('REDIS_URL');
    const queueRedis = track(redisUrl);
    const eventsRedis = track(redisUrl);
    queue = new Queue(CMS_QUEUE_NAME, { connection: queueRedis });
    events = new QueueEvents(CMS_QUEUE_NAME, { connection: eventsRedis });
    await events.waitUntilReady();

    app = await createWorkerApp();
    const requestedBy = `e2e-${crypto.randomUUID()}`;
    const job = await queue.add(
      'TestCmsConnection',
      { requestedBy },
      optionsForJob('TestCmsConnection'),
    );
    await job.waitUntilFinished(events, 60_000);

    const ttl = await queueRedis.ttl('worker:heartbeat');
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(30);

    pool = new Pool({ connectionString: required('DATABASE_URL') });
    const found = await pool.query<{
      channel: string;
      result: string;
      target: string | null;
      detail: unknown;
    }>(
      `select channel, result, target, detail
       from audit_log
       where actor_id = $1 and action = $2
       order by occurred_at desc
       limit 1`,
      [requestedBy, 'cms.test_connection.completed'],
    );
    const row = found.rows[0];
    expect(row).toMatchObject({
      channel: 'worker',
      result: 'success',
      detail: null,
    });
    expect(row?.target).toMatch(/^\d+$/);

    const post = await readPost(row?.target ?? '');
    expect(post.status).toBe('trash');
    expect(post.title.startsWith('[TESTE STUDIO]')).toBe(true);
  });
});

function track(url: string): Redis {
  const client = new Redis(url, { maxRetriesPerRequest: null });
  redisClients.push(client);
  return client;
}

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    throw new Error(
      `Configuração inválida. Variáveis ausentes ou inválidas: ${name}`,
    );
  }
  return value;
}

function loadDotEnv(): void {
  let text: string;
  try {
    text = readFileSync(resolve(import.meta.dirname, '../../../.env'), 'utf8');
  } catch {
    return;
  }
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) {
      continue;
    }
    const eq = line.indexOf('=');
    if (eq === -1) {
      continue;
    }
    const key = line.slice(0, eq).trim();
    if (!/^[A-Z0-9_]+$/.test(key) || process.env[key]) {
      continue;
    }
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

async function readPost(id: string): Promise<{ status: string; title: string }> {
  const baseUrl = required('WP_BASE_URL').replace(/\/+$/, '');
  const token = Buffer.from(
    `${required('WP_USERNAME')}:${required('WP_APP_PASSWORD').replaceAll(/\s+/g, '')}`,
    'utf8',
  ).toString('base64');
  const response = await fetch(
    `${baseUrl}/wp-json/wp/v2/posts/${id}?context=edit`,
    { headers: { Authorization: `Basic ${token}` } },
  );
  if (!response.ok) {
    throw new Error(`WordPress respondeu ${response.status} ao ler o post ${id}`);
  }
  return readTrashBody(await response.json());
}

function readTrashBody(body: unknown): { status: string; title: string } {
  if (typeof body !== 'object' || body === null) {
    throw new Error('Resposta do WordPress sem o formato esperado');
  }
  const status = 'status' in body ? body.status : undefined;
  const title = 'title' in body ? body.title : undefined;
  const raw =
    typeof title === 'object' && title !== null && 'raw' in title
      ? title.raw
      : undefined;
  if (typeof status !== 'string' || typeof raw !== 'string') {
    throw new Error('Resposta do WordPress sem status ou título');
  }
  return { status, title: raw };
}
