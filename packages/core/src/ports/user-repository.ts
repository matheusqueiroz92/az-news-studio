import type { Role } from '../domain/role.js';

/**
 * Usuário da equipe.
 * E-mail único, em minúsculas. Não há senha nem token neste tipo.
 */
export type User = {
  readonly id: string;
  readonly email: string;
  readonly name: string | null;
  readonly role: Role;
  readonly active: boolean;
};

/** Usuário ainda sem id. O adaptador gera o id ao inserir, no formato da tabela `users` do Better Auth. */
export type NewUser = Omit<User, 'id'>;

/**
 * Persistência de usuários.
 * Falha de infraestrutura (banco fora do ar) lança exceção e não usa Result, porque não é regra de negócio.
 */
export interface UserRepository {
  /**
   * Busca pelo e-mail em minúsculas.
   * `Ada@Az` e `ada@az` são o mesmo usuário. Ausente volta `null`.
   */
  findByEmail(email: string): Promise<User | null>;

  /** Ausente volta `null`. Não apaga inativo. */
  findById(id: string): Promise<User | null>;

  /** Todos, inclusive inativos. E-mail, papel e situação; sem segredo. */
  list(): Promise<readonly User[]>;

  /**
   * Insere o usuário e devolve a linha com o id gerado pelo adaptador.
   * O e-mail persistido fica em minúsculas. Não há exclusão física.
   */
  insert(user: NewUser): Promise<User>;

  /** Troca o papel de um id existente. Não cria usuário. */
  updateRole(id: string, role: Role): Promise<void>;

  /** Ativa ou desativa. A linha permanece. */
  setActive(id: string, active: boolean): Promise<void>;

  /** Quantos admins estão ativos. Serve para proteger o último. */
  countActiveAdmins(): Promise<number>;
}
