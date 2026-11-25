import type { Result } from '../shared/result.js';
import type { CmsError } from './cms-error.js';

/**
 * Id do post no domínio.
 * Opaco: o número do WordPress fica no adaptador, que converte para esta string.
 */
export type CmsPostId = string;

/** Post criado no CMS. Só o id opaco atravessa o domínio. */
export type CmsPostRef = {
  readonly id: CmsPostId;
};

/**
 * Estado da conexão.
 * `reachable` e `authenticated` descrevem a resposta HTTP; 401 não é erro.
 */
export type CmsConnectionStatus = {
  readonly reachable: boolean;
  readonly authenticated: boolean;
  readonly bridgeVersion: string | null;
  readonly siteName: string;
};

/** Rascunho pedido ao CMS. `categoryIds` e `tagNames` podem vir vazios. */
export type CmsDraftInput = {
  readonly title: string;
  readonly excerpt: string;
  readonly contentHtml: string;
  readonly slug: string;
  readonly metaDescription: string;
  readonly categoryIds: readonly number[];
  readonly tagNames: readonly string[];
};

export interface CmsPort {
  /**
   * Ok quando o WordPress responde HTTP, inclusive 401 (`authenticated: false`).
   * Err `unreachable` sem resposta. Err `invalid_response` se o corpo foge do formato.
   */
  checkConnection(): Promise<Result<CmsConnectionStatus, CmsError>>;

  /** Cria um rascunho. Err `draft_failed` quando o CMS recusa. */
  createDraft(input: CmsDraftInput): Promise<Result<CmsPostRef, CmsError>>;

  /**
   * Manda o post para a lixeira, sem exclusão definitiva.
   * Err `trash_failed` quando o CMS recusa.
   */
  trashPost(id: CmsPostId): Promise<Result<void, CmsError>>;
}
