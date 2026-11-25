/** Papéis da equipe na Fase 0. Não existe outro. */
export const roles = ['admin', 'editor', 'sales'] as const;

/** `admin` gere usuários e conexões; `editor` e `sales` entram e ficam na home. */
export type Role = (typeof roles)[number];

/**
 * Aceita somente `admin`, `editor` e `sales`, nessa grafia.
 * Qualquer outro texto, inclusive caixa diferente, é recusado.
 */
export function isRole(value: string): value is Role {
  return roles.some((role) => role === value);
}
