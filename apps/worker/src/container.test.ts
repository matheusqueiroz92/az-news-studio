import { describe, expect, it, vi } from 'vitest';

import { closeWorkerResources, readWorkerEnv } from './container.js';

const appPassword = 'senha-super-secreta';
const webhookSecret = 'segredo-do-webhook';

describe('readWorkerEnv', () => {
  it('deve aceitar as variáveis do worker e assumir info quando o nível falta', () => {
    expect(
      readWorkerEnv({
        DATABASE_URL: 'postgres://studio@127.0.0.1:5432/studio',
        REDIS_URL: 'redis://127.0.0.1:6379',
        WP_BASE_URL: 'http://127.0.0.1:8080',
        WP_USERNAME: 'studio',
        WP_APP_PASSWORD: 'abcd efgh',
      }),
    ).toMatchObject({ WP_USERNAME: 'studio', LOG_LEVEL: 'info' });
  });

  it('deve recusar variável ausente sem mostrar o valor', () => {
    try {
      readWorkerEnv({
        WP_APP_PASSWORD: appPassword,
        WP_WEBHOOK_SECRET: webhookSecret,
        authorization: 'Basic abc',
      });
      expect.unreachable();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).toContain('DATABASE_URL');
      expect(message).toContain('REDIS_URL');
      expect(message).toContain('WP_BASE_URL');
      expect(message).toContain('WP_USERNAME');
      expect(message).not.toContain(appPassword);
      expect(message).not.toContain(webhookSecret);
      expect(message).not.toContain('Basic abc');
    }
  });
});

describe('closeWorkerResources', () => {
  it('deve parar o heartbeat, fechar o worker, o Redis e o Postgres', async () => {
    const order: string[] = [];

    await closeWorkerResources({
      heartbeat: {
        stop() {
          order.push('heartbeat');
        },
      },
      worker: {
        async close() {
          order.push('worker');
        },
      },
      redis: {
        status: 'ready',
        async quit() {
          order.push('redis');
        },
      },
      pool: {
        async end() {
          order.push('pool');
        },
      },
    });

    expect(order).toEqual(['heartbeat', 'worker', 'redis', 'pool']);
  });

  it('deve não chamar quit quando o Redis já foi fechado pelo worker', async () => {
    const quit = vi.fn(async () => undefined);

    await closeWorkerResources({
      heartbeat: { stop() {} },
      worker: { async close() {} },
      redis: { status: 'end', quit },
      pool: { async end() {} },
    });

    expect(quit).not.toHaveBeenCalled();
  });
});
