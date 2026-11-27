import { http, HttpResponse } from 'msw/http';
import { setupServer } from 'msw/node';
import { delay } from 'msw/utils/delay';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { WordPressRestCms } from '../index.js';

const ORIGIN = 'https://homolog.aznews.com.br';
const INDEX_URL = `${ORIGIN}/wp-json`;
const ME_URL = `${ORIGIN}/wp-json/wp/v2/users/me`;
const HEALTH_URL = `${ORIGIN}/wp-json/az-bridge/v1/health`;

const USERNAME = 'studio';
const APP_PASSWORD_SPACED = 'abcd efgh ijkl mnop';
const APP_PASSWORD_COMPACT = 'abcdefghijklmnop';
const SITE_NAME = 'AZ News';
const BRIDGE_VERSION = '1.0.0';

const server = setupServer();

const connected = {
  ok: true,
  value: {
    reachable: true,
    authenticated: true,
    bridgeVersion: BRIDGE_VERSION,
    siteName: SITE_NAME,
  },
};

function authorizationHeader(username: string, password: string): string {
  const token = Buffer.from(`${username}:${password}`, 'utf8').toString(
    'base64',
  );
  return `Basic ${token}`;
}

function createCms(overrides?: {
  readonly baseUrl?: string;
  readonly username?: string;
  readonly appPassword?: string;
  readonly timeoutMs?: number;
  readonly backoff?: (attempt: number) => Promise<void>;
}): WordPressRestCms {
  return new WordPressRestCms({
    baseUrl: overrides?.baseUrl ?? ORIGIN,
    username: overrides?.username ?? USERNAME,
    appPassword: overrides?.appPassword ?? APP_PASSWORD_COMPACT,
    timeoutMs: overrides?.timeoutMs,
    backoff:
      overrides?.backoff ??
      (async () => {
        throw new Error('backoff sem falha de rede');
      }),
  });
}

function installConnected(onRequest?: (request: Request) => void): void {
  server.use(
    http.get(INDEX_URL, ({ request }) => {
      onRequest?.(request);
      return HttpResponse.json({
        name: SITE_NAME,
        description: 'Homologação',
        url: ORIGIN,
        namespaces: ['wp/v2', 'az-bridge/v1'],
      });
    }),
    http.get(ME_URL, ({ request }) => {
      onRequest?.(request);
      return HttpResponse.json({ id: 2, name: 'Studio', slug: 'studio' });
    }),
    http.get(HEALTH_URL, ({ request }) => {
      onRequest?.(request);
      return HttpResponse.json({ version: BRIDGE_VERSION });
    }),
  );
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

describe('WordPressRestCms', () => {
  beforeAll(() => {
    server.listen({ onUnhandledFrame: 'error' });
  });

  afterEach(() => {
    server.resetHandlers();
  });

  afterAll(() => {
    server.close();
  });

  it('deve marcar alcançável e ler o nome do site quando `GET /wp-json` responde', async () => {
    installConnected();

    await expect(createCms().checkConnection()).resolves.toEqual(connected);
  });

  it('deve marcar autenticado quando `GET /wp-json/wp/v2/users/me` responde 200', async () => {
    installConnected();

    const result = await createCms().checkConnection();

    expect(result).toEqual(connected);
    expect(result.ok && result.value.authenticated).toBe(true);
  });

  it('deve marcar não autenticado quando o WordPress responde 401, sem transformar isso em exceção', async () => {
    let meCalls = 0;
    server.use(
      http.get(INDEX_URL, () => HttpResponse.json({ name: SITE_NAME })),
      http.get(ME_URL, () => {
        meCalls += 1;
        return HttpResponse.json(
          {
            code: 'rest_not_logged_in',
            message: 'Você não está conectado.',
            data: { status: 401 },
          },
          { status: 401 },
        );
      }),
      http.get(HEALTH_URL, () =>
        HttpResponse.json({ version: BRIDGE_VERSION }),
      ),
    );

    await expect(createCms().checkConnection()).resolves.toEqual({
      ok: true,
      value: {
        reachable: true,
        authenticated: false,
        bridgeVersion: BRIDGE_VERSION,
        siteName: SITE_NAME,
      },
    });
    expect(meCalls).toBe(1);
  });

  it('deve ler `version` em `GET /wp-json/az-bridge/v1/health`', async () => {
    installConnected();

    const result = await createCms().checkConnection();

    expect(result).toEqual(connected);
    expect(result.ok && result.value.bridgeVersion).toBe(BRIDGE_VERSION);
  });

  it('deve devolver `bridgeVersion` nula quando o health responde 404', async () => {
    server.use(
      http.get(INDEX_URL, () => HttpResponse.json({ name: SITE_NAME })),
      http.get(ME_URL, () =>
        HttpResponse.json({ id: 2, name: 'Studio', slug: 'studio' }),
      ),
      http.get(HEALTH_URL, () =>
        HttpResponse.json(
          {
            code: 'rest_no_route',
            message: 'Nenhuma rota foi encontrada.',
            data: { status: 404 },
          },
          { status: 404 },
        ),
      ),
    );

    await expect(createCms().checkConnection()).resolves.toEqual({
      ok: true,
      value: {
        reachable: true,
        authenticated: true,
        bridgeVersion: null,
        siteName: SITE_NAME,
      },
    });
  });

  it('deve falhar com `unreachable` quando não há resposta', async () => {
    server.use(http.get(INDEX_URL, () => HttpResponse.error()));

    await expect(
      createCms({ backoff: async () => {} }).checkConnection(),
    ).resolves.toEqual({
      ok: false,
      error: { code: 'unreachable' },
    });
  });

  it('deve falhar com `invalid_response` quando o JSON não tem o formato esperado', async () => {
    server.use(
      http.get(INDEX_URL, () => HttpResponse.json({ description: 'sem nome' })),
    );

    await expect(createCms().checkConnection()).resolves.toEqual({
      ok: false,
      error: { code: 'invalid_response' },
    });

    server.resetHandlers();
    server.use(
      http.get(INDEX_URL, () =>
        HttpResponse.html('<html>erro</html>', { status: 200 }),
      ),
    );

    await expect(createCms().checkConnection()).resolves.toEqual({
      ok: false,
      error: { code: 'invalid_response' },
    });

    server.resetHandlers();
    server.use(
      http.get(INDEX_URL, () => HttpResponse.json({ name: SITE_NAME })),
      http.get(ME_URL, () =>
        HttpResponse.json({ id: 2, name: 'Studio', slug: 'studio' }),
      ),
      http.get(HEALTH_URL, () => HttpResponse.json({ version: 1 })),
    );

    await expect(createCms().checkConnection()).resolves.toEqual({
      ok: false,
      error: { code: 'invalid_response' },
    });
  });

  it('deve enviar Authorization Basic do usuário `studio`', async () => {
    let meHeader: string | null = null;
    server.use(
      http.get(INDEX_URL, () => HttpResponse.json({ name: SITE_NAME })),
      http.get(ME_URL, ({ request }) => {
        meHeader = request.headers.get('authorization');
        return HttpResponse.json({ id: 2, name: 'Studio', slug: 'studio' });
      }),
      http.get(HEALTH_URL, () =>
        HttpResponse.json({ version: BRIDGE_VERSION }),
      ),
    );

    await createCms({
      username: USERNAME,
      appPassword: APP_PASSWORD_COMPACT,
    }).checkConnection();

    expect(meHeader).toBe(authorizationHeader(USERNAME, APP_PASSWORD_COMPACT));
  });

  it('deve não enviar Authorization para o índice nem para o health', async () => {
    const authorizations = new Map<string, string | null>();
    server.use(
      http.get(INDEX_URL, ({ request }) => {
        authorizations.set('index', request.headers.get('authorization'));
        return HttpResponse.json({ name: SITE_NAME });
      }),
      http.get(ME_URL, ({ request }) => {
        authorizations.set('me', request.headers.get('authorization'));
        return HttpResponse.json({ id: 2, slug: 'studio' });
      }),
      http.get(HEALTH_URL, ({ request }) => {
        authorizations.set('health', request.headers.get('authorization'));
        return HttpResponse.json({ version: BRIDGE_VERSION });
      }),
    );

    await expect(createCms().checkConnection()).resolves.toEqual(connected);
    expect(authorizations.get('index')).toBeNull();
    expect(authorizations.get('health')).toBeNull();
    expect(authorizations.get('me')).toBe(
      authorizationHeader(USERNAME, APP_PASSWORD_COMPACT),
    );
  });

  it('deve manter o site alcançável e a versão do bridge quando a senha é inválida', async () => {
    const correct = authorizationHeader(USERNAME, APP_PASSWORD_COMPACT);
    const unauthorized = () =>
      HttpResponse.json(
        {
          code: 'rest_not_logged_in',
          message: 'Você não está conectado.',
          data: { status: 401 },
        },
        { status: 401 },
      );

    server.use(
      http.get(INDEX_URL, ({ request }) => {
        if (request.headers.get('authorization') !== null) {
          return unauthorized();
        }
        return HttpResponse.json({
          name: SITE_NAME,
          description: 'Homologação',
          url: ORIGIN,
          namespaces: ['wp/v2', 'az-bridge/v1'],
        });
      }),
      http.get(ME_URL, ({ request }) => {
        if (request.headers.get('authorization') !== correct) {
          return unauthorized();
        }
        return HttpResponse.json({ id: 2, name: 'Studio', slug: 'studio' });
      }),
      http.get(HEALTH_URL, ({ request }) => {
        if (request.headers.get('authorization') !== null) {
          return unauthorized();
        }
        return HttpResponse.json({ version: BRIDGE_VERSION });
      }),
    );

    await expect(
      createCms({ appPassword: 'zzzz wwww xxxx yyyy' }).checkConnection(),
    ).resolves.toEqual({
      ok: true,
      value: {
        reachable: true,
        authenticated: false,
        bridgeVersion: BRIDGE_VERSION,
        siteName: SITE_NAME,
      },
    });
  });

  it('deve tratar senha de aplicação com espaços como a mesma senha sem espaços', async () => {
    const meHeaders: string[] = [];
    const capture = (request: Request): void => {
      if (new URL(request.url).pathname !== '/wp-json/wp/v2/users/me') {
        return;
      }
      meHeaders.push(request.headers.get('authorization') ?? '');
    };

    installConnected(capture);
    await createCms({ appPassword: APP_PASSWORD_SPACED }).checkConnection();
    const withSpaces = [...meHeaders];

    meHeaders.length = 0;
    server.resetHandlers();
    installConnected(capture);
    await createCms({ appPassword: APP_PASSWORD_COMPACT }).checkConnection();

    const expected = authorizationHeader(USERNAME, APP_PASSWORD_COMPACT);
    expect(withSpaces).toEqual([expected]);
    expect(meHeaders).toEqual(withSpaces);
    expect(withSpaces.join(' ')).not.toContain(APP_PASSWORD_SPACED);
  });

  it('deve tentar no máximo 3 vezes com backoff quando a rede falha, e uma vez só quando recebe HTTP', async () => {
    const events: string[] = [];
    const cms = createCms({
      backoff: async () => {
        events.push('backoff');
      },
    });

    server.use(
      http.get(INDEX_URL, () => {
        events.push('index');
        return HttpResponse.error();
      }),
    );

    await expect(cms.checkConnection()).resolves.toEqual({
      ok: false,
      error: { code: 'unreachable' },
    });
    expect(events).toEqual(['index', 'backoff', 'index', 'backoff', 'index']);

    events.length = 0;
    server.resetHandlers();
    server.use(
      http.get(INDEX_URL, () => {
        events.push('index');
        return HttpResponse.json(
          { code: 'internal_server_error', message: 'erro' },
          { status: 500 },
        );
      }),
    );

    await expect(cms.checkConnection()).resolves.toEqual({
      ok: false,
      error: { code: 'invalid_response' },
    });
    expect(events).toEqual(['index']);

    events.length = 0;
    server.resetHandlers();
    server.use(
      http.get(INDEX_URL, () => {
        events.push('index');
        return HttpResponse.json({ name: SITE_NAME });
      }),
      http.get(ME_URL, () => {
        events.push('me');
        return HttpResponse.error();
      }),
    );

    await expect(cms.checkConnection()).resolves.toEqual({
      ok: false,
      error: { code: 'unreachable' },
    });
    expect(events).toEqual(['index', 'me', 'backoff', 'me', 'backoff', 'me']);
  });

  it('deve tratar o timeout da requisição como unreachable', async () => {
    let calls = 0;
    server.use(
      http.get(INDEX_URL, async () => {
        calls += 1;
        await delay(1_000);
        return HttpResponse.json({ name: SITE_NAME });
      }),
    );

    await expect(
      createCms({
        timeoutMs: 50,
        backoff: async () => {},
      }).checkConnection(),
    ).resolves.toEqual({
      ok: false,
      error: { code: 'unreachable' },
    });
    expect(calls).toBe(3);
  });

  it('deve aceitar baseUrl com ou sem barra final', async () => {
    for (const baseUrl of [ORIGIN, `${ORIGIN}/`]) {
      const urls: string[] = [];
      server.use(
        http.get(INDEX_URL, ({ request }) => {
          urls.push(request.url);
          return HttpResponse.json({ name: SITE_NAME });
        }),
        http.get(ME_URL, ({ request }) => {
          urls.push(request.url);
          return HttpResponse.json({ id: 2, slug: 'studio' });
        }),
        http.get(HEALTH_URL, ({ request }) => {
          urls.push(request.url);
          return HttpResponse.json({ version: BRIDGE_VERSION });
        }),
      );

      await expect(createCms({ baseUrl }).checkConnection()).resolves.toEqual(
        connected,
      );
      expect(urls).toEqual([INDEX_URL, ME_URL, HEALTH_URL]);
      server.resetHandlers();
    }
  });

  it('deve deixar a senha fora do erro', async () => {
    server.use(http.get(INDEX_URL, () => HttpResponse.error()));

    const cms = createCms({
      appPassword: APP_PASSWORD_SPACED,
      backoff: async () => {},
    });
    let thrown: unknown;
    const result = await cms.checkConnection().catch((error: unknown) => {
      thrown = error;
      return undefined;
    });

    expect(thrown).toBeUndefined();
    const serialized = JSON.stringify(result);
    const token = Buffer.from(
      `${USERNAME}:${APP_PASSWORD_COMPACT}`,
      'utf8',
    ).toString('base64');
    expect(serialized).not.toContain(APP_PASSWORD_SPACED);
    expect(serialized).not.toContain(APP_PASSWORD_COMPACT);
    expect(serialized).not.toContain(token);
    expect(result).toEqual({
      ok: false,
      error: { code: 'unreachable' },
    });
  });

  it('deve usar as credenciais do construtor sem ler process.env', async () => {
    const previous = {
      WP_BASE_URL: process.env.WP_BASE_URL,
      WP_USERNAME: process.env.WP_USERNAME,
      WP_APP_PASSWORD: process.env.WP_APP_PASSWORD,
    };
    process.env.WP_BASE_URL = 'https://env.invalido';
    process.env.WP_USERNAME = 'env-user';
    process.env.WP_APP_PASSWORD = 'senha-somente-do-env';

    try {
      const seen: string[] = [];
      installConnected((request) => {
        seen.push(
          `${request.url} ${request.headers.get('authorization') ?? ''}`,
        );
      });

      await expect(createCms().checkConnection()).resolves.toEqual(connected);

      const header = authorizationHeader(USERNAME, APP_PASSWORD_COMPACT);
      const envHeader = authorizationHeader('env-user', 'senha-somente-do-env');
      expect(seen).toEqual([
        `${INDEX_URL} `,
        `${ME_URL} ${header}`,
        `${HEALTH_URL} `,
      ]);
      expect(seen.join('\n')).not.toContain(envHeader);
      expect(seen.join('\n')).not.toContain('https://env.invalido');
    } finally {
      restoreEnv('WP_BASE_URL', previous.WP_BASE_URL);
      restoreEnv('WP_USERNAME', previous.WP_USERNAME);
      restoreEnv('WP_APP_PASSWORD', previous.WP_APP_PASSWORD);
    }
  });

  it('deve esperar 1 s e depois 2 s no backoff padrão quando a rede falha', async () => {
    vi.useFakeTimers();
    try {
      const calls: number[] = [];
      server.use(
        http.get(INDEX_URL, () => {
          calls.push(calls.length + 1);
          return HttpResponse.error();
        }),
      );

      const pending = new WordPressRestCms({
        baseUrl: ORIGIN,
        username: USERNAME,
        appPassword: APP_PASSWORD_COMPACT,
      }).checkConnection();

      await vi.advanceTimersByTimeAsync(0);
      expect(calls).toEqual([1]);

      await vi.advanceTimersByTimeAsync(999);
      expect(calls).toEqual([1]);

      await vi.advanceTimersByTimeAsync(1);
      expect(calls).toEqual([1, 2]);

      await vi.advanceTimersByTimeAsync(1_999);
      expect(calls).toEqual([1, 2]);

      await vi.advanceTimersByTimeAsync(1);
      expect(calls).toEqual([1, 2, 3]);

      await expect(pending).resolves.toEqual({
        ok: false,
        error: { code: 'unreachable' },
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
