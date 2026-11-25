/**
 * Falhas do CMS.
 * `unreachable`: não houve resposta HTTP (DNS, timeout, conexão recusada).
 * `unauthenticated`: a credencial foi recusada numa operação que exige sessão.
 * `draft_failed`: o rascunho não foi criado.
 * `trash_failed`: o post não foi para a lixeira.
 * `invalid_response`: o corpo não tem o formato esperado.
 * `checkConnection` não usa `unauthenticated`: HTTP 401 volta ok com `authenticated: false`.
 */
export const cmsErrorCodes = [
  'unreachable',
  'unauthenticated',
  'draft_failed',
  'trash_failed',
  'invalid_response',
] as const;

export type CmsErrorCode = (typeof cmsErrorCodes)[number];

export type CmsError = {
  readonly code: CmsErrorCode;
};
