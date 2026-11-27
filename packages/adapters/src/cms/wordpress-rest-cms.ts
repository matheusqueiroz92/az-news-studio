import {
  err,
  ok,
  type CmsConnectionStatus,
  type CmsDraftInput,
  type CmsError,
  type CmsPort,
  type CmsPostId,
  type CmsPostRef,
  type Result,
} from '@az-news/core';

const MAX_ATTEMPTS = 3;
const DEFAULT_TIMEOUT_MS = 10_000;

type WordPressRestCmsOptions = {
  readonly baseUrl: string;
  readonly username: string;
  readonly appPassword: string;
  readonly timeoutMs?: number;
  readonly backoff?: (attempt: number) => Promise<void>;
};

/**
 * Cliente REST do WordPress.
 * Credenciais vêm do construtor. O índice e o health são públicos e saem
 * sem Authorization: uma Application Password inválida faz o WordPress
 * responder 401 em qualquer rota que receba o cabeçalho. Só `users/me`
 * autentica; 401 ali é ok com `authenticated: false`. Sem resposta HTTP
 * (rede ou timeout) tenta de novo, no máximo 3 vezes; status HTTP não repete.
 */
export class WordPressRestCms implements CmsPort {
  private readonly baseUrl: string;
  private readonly authorization: string;
  private readonly timeoutMs: number;
  private readonly backoff: (attempt: number) => Promise<void>;

  constructor(options: WordPressRestCmsOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.authorization = basicAuthorization(
      options.username,
      options.appPassword,
    );
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.backoff = options.backoff ?? defaultBackoff;
  }

  async checkConnection(): Promise<Result<CmsConnectionStatus, CmsError>> {
    const index = await this.request('/wp-json');
    if (index === undefined) {
      return err({ code: 'unreachable' });
    }

    const siteName = await readSiteName(index);
    if (siteName === null) {
      return err({ code: 'invalid_response' });
    }

    const me = await this.request('/wp-json/wp/v2/users/me', {
      authorization: this.authorization,
    });
    if (me === undefined) {
      return err({ code: 'unreachable' });
    }

    const authenticated = authenticatedFrom(me);
    if (authenticated === undefined) {
      return err({ code: 'invalid_response' });
    }

    const health = await this.request('/wp-json/az-bridge/v1/health');
    if (health === undefined) {
      return err({ code: 'unreachable' });
    }

    const bridgeVersion = await readBridgeVersion(health);
    if (bridgeVersion === undefined) {
      return err({ code: 'invalid_response' });
    }

    return ok({
      reachable: true,
      authenticated,
      bridgeVersion,
      siteName,
    });
  }

  /**
   * T13 cria o rascunho. A assinatura fecha `CmsPort` nesta tarefa.
   */
  createDraft(_input: CmsDraftInput): Promise<Result<CmsPostRef, CmsError>> {
    return Promise.resolve(err({ code: 'draft_failed' }));
  }

  /**
   * T13 manda o post para a lixeira.
   */
  trashPost(_id: CmsPostId): Promise<Result<void, CmsError>> {
    return Promise.resolve(err({ code: 'trash_failed' }));
  }

  private async request(
    path: string,
    headers?: { readonly authorization: string },
  ): Promise<Response | undefined> {
    const url = `${this.baseUrl}${path}`;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        return await fetch(url, {
          headers,
          signal: AbortSignal.timeout(this.timeoutMs),
        });
      } catch {
        if (attempt < MAX_ATTEMPTS) {
          await this.backoff(attempt);
        }
      }
    }

    return undefined;
  }
}

/**
 * A Application Password do WordPress sai com espaços (`abcd efgh …`).
 * O mesmo segredo sem espaços produz o mesmo Basic.
 */
function basicAuthorization(username: string, appPassword: string): string {
  const password = appPassword.replaceAll(/\s+/g, '');
  const token = Buffer.from(`${username}:${password}`, 'utf8').toString(
    'base64',
  );
  return `Basic ${token}`;
}

function defaultBackoff(attempt: number): Promise<void> {
  const delayMs = 1_000 * 2 ** (attempt - 1);
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

function authenticatedFrom(response: Response): boolean | undefined {
  if (response.status === 200) {
    return true;
  }
  if (response.status === 401) {
    return false;
  }
  return undefined;
}

async function readSiteName(response: Response): Promise<string | null> {
  if (response.status !== 200) {
    return null;
  }

  const body = await readJson(response);
  if (!isRecord(body) || typeof body.name !== 'string') {
    return null;
  }

  return body.name;
}

async function readBridgeVersion(
  response: Response,
): Promise<string | null | undefined> {
  if (response.status === 404) {
    return null;
  }
  if (response.status !== 200) {
    return undefined;
  }

  const body = await readJson(response);
  if (!isRecord(body) || typeof body.version !== 'string') {
    return undefined;
  }

  return body.version;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
