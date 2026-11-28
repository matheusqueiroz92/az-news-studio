import {
  CMS_QUEUE_CONCURRENCY,
  CMS_QUEUE_NAME,
  PostgresAuditLog,
  WordPressRestCms,
} from '@az-news/adapters';
import { TestCmsConnection, type ClockPort } from '@az-news/core';
import * as schema from '@az-news/db';
import { Worker } from 'bullmq';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Redis } from 'ioredis';
import { Pool } from 'pg';
import { z } from 'zod';

import { startHeartbeat } from './heartbeat.js';
import {
  processCmsJob,
  type JobLogger,
} from './jobs/test-cms-connection-job.js';
import { LOG_LEVELS, createLogger } from './logger.js';

const envSchema = z.object({
  DATABASE_URL: z.string().nonempty(),
  REDIS_URL: z.string().nonempty(),
  WP_BASE_URL: z.string().nonempty(),
  WP_USERNAME: z.string().nonempty(),
  WP_APP_PASSWORD: z.string().nonempty(),
  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
});

/** Único leitor de ambiente. A mensagem cita o nome da variável, nunca o valor. */
export function readWorkerEnv(source: Record<string, string | undefined>) {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const names = [
      ...new Set(
        parsed.error.issues.map((issue) => String(issue.path[0] ?? 'ambiente')),
      ),
    ];
    throw new Error(
      `Configuração inválida. Variáveis ausentes ou inválidas: ${names.join(', ')}`,
    );
  }
  return parsed.data;
}

export type WorkerClosable = {
  readonly heartbeat: { stop(): void };
  readonly worker: { close(): Promise<void> };
  readonly redis: { readonly status: string; quit(): Promise<unknown> };
  readonly pool: { end(): Promise<void> };
};

/** Heartbeat, job em andamento, Redis e Postgres, nessa ordem. */
export async function closeWorkerResources(
  resources: WorkerClosable,
): Promise<void> {
  resources.heartbeat.stop();
  await resources.worker.close();
  if (resources.redis.status !== 'end') {
    await resources.redis.quit();
  }
  await resources.pool.end();
}

export type WorkerApp = {
  readonly logger: JobLogger;
  close(): Promise<void>;
};

export async function createWorkerApp(
  source: Record<string, string | undefined> = process.env,
): Promise<WorkerApp> {
  const env = readWorkerEnv(source);
  const logger = createLogger({ level: env.LOG_LEVEL });
  const jobLogger: JobLogger = {
    info: (obj, message) => logger.info(obj, message),
    error: (obj, message) => logger.error(obj, message),
  };
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  pool.on('error', (error: Error) => {
    jobLogger.error({ message: error.message }, 'erro no postgres');
  });
  const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  redis.on('error', (error: Error) => {
    jobLogger.error({ message: error.message }, 'erro no redis');
  });
  const clock: ClockPort = { now: () => new Date() };
  const useCase = new TestCmsConnection(
    new WordPressRestCms({
      baseUrl: env.WP_BASE_URL,
      username: env.WP_USERNAME,
      appPassword: env.WP_APP_PASSWORD,
    }),
    new PostgresAuditLog(drizzle({ client: pool, schema })),
    clock,
  );
  const heartbeat = startHeartbeat({
    async set(key, value, ttlSeconds) {
      await redis.set(key, value, 'EX', ttlSeconds);
    },
  });
  const worker = new Worker(
    CMS_QUEUE_NAME,
    async (job) => {
      await processCmsJob(
        { name: job.name, id: job.id ?? '', data: job.data },
        useCase,
        jobLogger,
      );
    },
    { connection: redis, concurrency: CMS_QUEUE_CONCURRENCY },
  );
  worker.on('error', (error: Error) => {
    jobLogger.error({ message: error.message }, 'erro no worker');
  });
  jobLogger.info({ queue: CMS_QUEUE_NAME }, 'worker no ar');

  let closed = false;
  return {
    logger: jobLogger,
    async close() {
      if (closed) return;
      closed = true;
      await closeWorkerResources({ heartbeat, worker, redis, pool });
    },
  };
}
