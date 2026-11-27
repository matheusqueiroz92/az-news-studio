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
 * autentica; 401 ali é ok com `authenticated: false`.
 * `checkConnection` e `trashPost` repetem até 3 vezes sem resposta HTTP
 * (a lixeira é idempotente). `createDraft` só repete se a conexão nem
 * abriu (DNS ou conexão recusada): timeout e qualquer HTTP ficam numa
 * tentativa, porque o WordPress pode ter criado o post. 401 numa escrita
 * é `unauthenticated`.
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

  async createDraft(
    input: CmsDraftInput,
  ): Promise<Result<CmsPostRef, CmsError>> {
    const response = await this.request('/wp-json/wp/v2/posts', {
      method: 'POST',
      authorization: this.authorization,
      body: JSON.stringify(draftPayload(input)),
      retry: 'before-connect',
    });
    if (response === undefined) {
      return err({ code: 'unreachable' });
    }
    if (response.status === 401) {
      return err({ code: 'unauthenticated' });
    }
    if (!isHttpSuccess(response)) {
      return err({ code: 'draft_failed' });
    }

    const id = await readCreatedPostId(response);
    if (id === null) {
      return err({ code: 'invalid_response' });
    }
    return ok({ id });
  }

  async trashPost(id: CmsPostId): Promise<Result<void, CmsError>> {
    const response = await this.request(
      `/wp-json/wp/v2/posts/${encodeURIComponent(id)}`,
      {
        method: 'DELETE',
        authorization: this.authorization,
      },
    );
    if (response === undefined) {
      return err({ code: 'unreachable' });
    }
    if (response.status === 401) {
      return err({ code: 'unauthenticated' });
    }
    if (!isHttpSuccess(response)) {
      return err({ code: 'trash_failed' });
    }
    return ok(undefined);
  }

  private async request(
    path: string,
    options?: {
      readonly authorization?: string;
      readonly method?: 'POST' | 'DELETE';
      readonly body?: string;
      readonly retry?: 'until-http' | 'before-connect';
    },
  ): Promise<Response | undefined> {
    const url = `${this.baseUrl}${path}`;
    const retry = options?.retry ?? 'until-http';
    const headers: Record<string, string> = {};
    if (options?.authorization !== undefined) {
      headers.authorization = options.authorization;
    }
    if (options?.body !== undefined) {
      headers['content-type'] = 'application/json';
    }

    const init: RequestInit = {
      headers: Object.keys(headers).length > 0 ? headers : undefined,
    };
    if (options?.method !== undefined) {
      init.method = options.method;
    }
    if (options?.body !== undefined) {
      init.body = options.body;
    }

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        return await fetch(url, {
          ...init,
          signal: AbortSignal.timeout(this.timeoutMs),
        });
      } catch (error) {
        if (attempt === MAX_ATTEMPTS || !shouldRetry(retry, error)) {
          return undefined;
        }
        await this.backoff(attempt);
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

/** DNS ou conexão recusada: o TCP não abriu, o POST não chegou. */
const BEFORE_CONNECT = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN']);

function shouldRetry(
  retry: 'until-http' | 'before-connect',
  error: unknown,
): boolean {
  if (retry === 'until-http') {
    return true;
  }
  return connectionNeverEstablished(error);
}

function connectionNeverEstablished(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  if (
    'code' in error &&
    typeof error.code === 'string' &&
    BEFORE_CONNECT.has(error.code)
  ) {
    return true;
  }
  if ('cause' in error && error.cause !== error) {
    return connectionNeverEstablished(error.cause);
  }
  return false;
}

/**
 * shortcut: `tagNames` não vai no JSON; a REST do WordPress recebe ids de tag,
 * e a Fase 1 é quem resolve o nome.
 */
function draftPayload(input: CmsDraftInput): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    status: 'draft',
    title: input.title,
    excerpt: input.excerpt,
    content: input.contentHtml,
    slug: input.slug,
    meta: {
      _yoast_wpseo_metadesc: input.metaDescription,
    },
  };
  if (input.categoryIds.length > 0) {
    payload.categories = [...input.categoryIds];
  }
  return payload;
}

function isHttpSuccess(response: Response): boolean {
  return response.status >= 200 && response.status < 300;
}

async function readCreatedPostId(response: Response): Promise<string | null> {
  const body = await readJson(response);
  if (!isRecord(body) || !isWpPostId(body.id)) {
    return null;
  }
  return String(body.id);
}

function isWpPostId(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

export function backoffDelayMs(attempt: number): number {
  return 1_000 * 2 ** (attempt - 1);
}

function defaultBackoff(attempt: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, backoffDelayMs(attempt));
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
