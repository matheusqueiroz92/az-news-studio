import { isRole, type Role } from '../domain/role.js';
import type { AuditEntry, AuditLogPort } from '../ports/audit-log-port.js';
import type { ClockPort } from '../ports/clock-port.js';
import type { User, UserRepository } from '../ports/user-repository.js';
import { err, isErr, ok, type Err, type Result } from '../shared/result.js';

/**
 * E-mail do Studio, sem biblioteca.
 * Vale para a string já normalizada por `canonicalEmail`.
 * Um trecho sem espaço e sem `@`, um `@`, um trecho sem espaço e sem `@`,
 * um ponto, e outro trecho sem espaço e sem `@`.
 * Aceita `a@b.c` e `a@b..c`. Recusa vazio, sem `@`, sem ponto no domínio e espaço no meio.
 * shortcut: regex simples, sem RFC 5322; apertar se o cadastro receber lixo que passe neste padrão.
 */
export const STUDIO_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Trim nas pontas e `toLowerCase()` (sem locale).
 * Devolve essa string se `STUDIO_EMAIL_PATTERN` casar; senão `null`.
 * `'  Ada@AzNews.com.br  '` vira `'ada@aznews.com.br'`.
 */
export function canonicalEmail(email: string): string | null {
  const normalized = email.trim().toLowerCase();
  if (!STUDIO_EMAIL_PATTERN.test(normalized)) {
    return null;
  }
  return normalized;
}

/** Quem pede a operação. `role` já é um papel da sessão; este caso de uso não o relê no repositório. */
export type ManageUsersActor = {
  readonly userId: string;
  readonly role: Role;
};

export type CreateUserCommand = {
  readonly actor: ManageUsersActor;
  /** Texto cru. A normalização é `canonicalEmail`. */
  readonly email: string;
  /** Texto cru. Só `admin`, `editor` e `sales`, sem trim e sem mudar a caixa. */
  readonly role: string;
};

export type ChangeUserRoleCommand = {
  readonly actor: ManageUsersActor;
  readonly userId: string;
  /** Texto cru. Só `admin`, `editor` e `sales`, sem trim e sem mudar a caixa. */
  readonly role: string;
};

export type SetUserActiveCommand = {
  readonly actor: ManageUsersActor;
  readonly userId: string;
  readonly active: boolean;
};

export type ListUsersCommand = {
  readonly actor: ManageUsersActor;
};

/** O autor não é `admin`. Nada foi lido nem gravado. */
export type ForbiddenManageUsersError = {
  readonly code: 'forbidden';
};

/** `canonicalEmail` devolveu `null`. */
export type InvalidEmailManageUsersError = {
  readonly code: 'invalid_email';
};

/** O papel pedido não é `admin`, `editor` nem `sales`. */
export type InvalidRoleManageUsersError = {
  readonly code: 'invalid_role';
};

/**
 * Já existe usuário com esse e-mail canônico, ativo ou inativo.
 * Criar de novo não reativa.
 */
export type EmailTakenManageUsersError = {
  readonly code: 'email_taken';
};

/** Não há usuário com esse id. */
export type UserNotFoundManageUsersError = {
  readonly code: 'user_not_found';
};

/**
 * A operação tiraria o último admin ativo, inclusive se o alvo for o autor.
 * A contagem antes da escrita é menor que 2.
 */
export type LastAdminManageUsersError = {
  readonly code: 'last_admin';
};

export type ManageUsersAuditAction =
  | 'user.create'
  | 'user.change_role'
  | 'user.set_active';

/**
 * A mudança já está no repositório. O audit log recusou.
 * Não há segunda gravação nem exclusão do usuário.
 */
export type AuditWriteFailedManageUsersError<
  TAction extends ManageUsersAuditAction = ManageUsersAuditAction,
> = {
  readonly code: 'audit_write_failed';
  readonly action: TAction;
  readonly userId: string;
};

export type CreateUserError =
  | ForbiddenManageUsersError
  | InvalidEmailManageUsersError
  | InvalidRoleManageUsersError
  | EmailTakenManageUsersError
  | AuditWriteFailedManageUsersError<'user.create'>;

export type ChangeUserRoleError =
  | ForbiddenManageUsersError
  | InvalidRoleManageUsersError
  | UserNotFoundManageUsersError
  | LastAdminManageUsersError
  | AuditWriteFailedManageUsersError<'user.change_role'>;

export type SetUserActiveError =
  | ForbiddenManageUsersError
  | UserNotFoundManageUsersError
  | LastAdminManageUsersError
  | AuditWriteFailedManageUsersError<'user.set_active'>;

export type ListUsersError = ForbiddenManageUsersError;

/** `user.create`. Sem e-mail, nome ou segredo. */
export type UserCreateAuditDetail = {
  readonly role: Role;
};

/** `user.change_role`. Papel anterior e papel novo. */
export type UserChangeRoleAuditDetail = {
  readonly from: Role;
  readonly to: Role;
};

/** `user.set_active`. Situação anterior e situação nova. */
export type UserSetActiveAuditDetail = {
  readonly from: boolean;
  readonly to: boolean;
};

type _AssertExtends<A extends B, B> = A;

type _CreateDetailFitsAuditLog = _AssertExtends<
  UserCreateAuditDetail,
  NonNullable<AuditEntry['detail']>
>;

type _ChangeRoleDetailFitsAuditLog = _AssertExtends<
  UserChangeRoleAuditDetail,
  NonNullable<AuditEntry['detail']>
>;

type _SetActiveDetailFitsAuditLog = _AssertExtends<
  UserSetActiveAuditDetail,
  NonNullable<AuditEntry['detail']>
>;

type ManageUsersAuditDetail =
  UserCreateAuditDetail | UserChangeRoleAuditDetail | UserSetActiveAuditDetail;

/**
 * Cadastro, papel e ativação dos usuários (RF-01, RF-02, RF-06).
 * Não há exclusão física nem revogação de sessão.
 *
 * Só `actor.role === 'admin'` segue. `editor` e `sales` recebem `forbidden`
 * sem repositório, relógio ou audit log. O primeiro erro da lista do método vence.
 * Recusa não grava audit log. Exceção do repositório propaga e não vira `Result`.
 *
 * O mesmo papel, ou o mesmo `active`, é sucesso: não escreve, não conta admin,
 * não lê o relógio e não grava audit log.
 * Rebaixar ou desativar um admin ativo só segue se `countActiveAdmins()` for
 * pelo menos 2 (a contagem inclui o alvo). Abaixo disso é `last_admin`,
 * seja o alvo o autor ou outra pessoa. Com outros admins ativos, o autor
 * pode rebaixar ou desativar a si mesmo, e isso grava audit log.
 * Admin inativo pode ser rebaixado. Reativar não consulta a contagem.
 *
 * Audit log só depois da escrita, uma vez: channel `web`, result `success`,
 * `actorId` = `actor.userId`, `target` = id do usuário afetado,
 * `occurredAt` = o único `clock.now()`. `detail` é o tipo da ação, sem e-mail.
 * `record` com falha devolve `audit_write_failed` e não é chamado de novo.
 * Este caso de uso não grava result `failure`.
 */
export class ManageUsers {
  constructor(
    private readonly users: UserRepository,
    private readonly auditLog: AuditLogPort,
    private readonly clock: ClockPort,
  ) {}

  /**
   * Cria com e-mail canônico, `name: null` e `active: true`.
   * 1. `forbidden` 2. `invalid_email` 3. `invalid_role` 4. `email_taken`
   * 5. insert e audit `user.create` com `detail.role`.
   */
  async createUser(
    command: CreateUserCommand,
  ): Promise<Result<User, CreateUserError>> {
    const denied = this.denyUnlessAdmin(command.actor);
    if (denied !== null) {
      return denied;
    }

    const email = this.parseStudioEmail(command.email);
    if (isErr(email)) {
      return email;
    }

    const role = this.parseRole(command.role);
    if (isErr(role)) {
      return role;
    }

    const duplicate = await this.duplicateEmail(email.value);
    if (duplicate !== null) {
      return duplicate;
    }

    const user = await this.users.insert({
      email: email.value,
      name: null,
      role: role.value,
      active: true,
    });
    return this.recordAudit(command.actor, 'user.create', user, {
      role: user.role,
    });
  }

  /**
   * 1. `forbidden` 2. `invalid_role` (não busca o id) 3. `user_not_found`
   * 4. mesmo papel: ok, no-op 5. `last_admin` se a troca tira o último admin ativo
   * 6. `updateRole` e audit `user.change_role` com `{ from, to }`.
   */
  async changeUserRole(
    command: ChangeUserRoleCommand,
  ): Promise<Result<User, ChangeUserRoleError>> {
    const denied = this.denyUnlessAdmin(command.actor);
    if (denied !== null) {
      return denied;
    }

    const role = this.parseRole(command.role);
    if (isErr(role)) {
      return role;
    }

    const found = await this.loadUser(command.userId);
    if (isErr(found)) {
      return found;
    }

    const user = found.value;
    if (user.role === role.value) {
      return ok(user);
    }

    const blocked = await this.blockLastAdmin(this.isActiveAdmin(user));
    if (blocked !== null) {
      return blocked;
    }

    const nextRole = role.value;
    await this.users.updateRole(user.id, nextRole);
    const updated: User = { ...user, role: nextRole };
    return this.recordAudit(command.actor, 'user.change_role', updated, {
      from: user.role,
      to: nextRole,
    });
  }

  /**
   * 1. `forbidden` 2. `user_not_found` 3. mesmo `active`: ok, no-op
   * 4. `last_admin` se desativa o último admin ativo
   * 5. `setActive` e audit `user.set_active` com `{ from, to }`.
   */
  async setUserActive(
    command: SetUserActiveCommand,
  ): Promise<Result<User, SetUserActiveError>> {
    const denied = this.denyUnlessAdmin(command.actor);
    if (denied !== null) {
      return denied;
    }

    const found = await this.loadUser(command.userId);
    if (isErr(found)) {
      return found;
    }

    const user = found.value;
    if (user.active === command.active) {
      return ok(user);
    }

    const blocked = await this.blockLastAdmin(this.isActiveAdmin(user));
    if (blocked !== null) {
      return blocked;
    }

    await this.users.setActive(user.id, command.active);
    const updated: User = { ...user, active: command.active };
    return this.recordAudit(command.actor, 'user.set_active', updated, {
      from: user.active,
      to: command.active,
    });
  }

  /**
   * 1. `forbidden` (não chama `list`)
   * 2. ok com `list()`, inclusive inativos, na ordem do repositório, sem audit log.
   * O `User` traz `id`, `email`, `name`, `role` e `active`. Não há campo de segredo.
   */
  async listUsers(
    command: ListUsersCommand,
  ): Promise<Result<readonly User[], ListUsersError>> {
    const denied = this.denyUnlessAdmin(command.actor);
    if (denied !== null) {
      return denied;
    }

    return ok(await this.users.list());
  }

  private denyUnlessAdmin(
    actor: ManageUsersActor,
  ): Err<ForbiddenManageUsersError> | null {
    if (actor.role === 'admin') {
      return null;
    }
    return err({ code: 'forbidden' });
  }

  private parseStudioEmail(
    email: string,
  ): Result<string, InvalidEmailManageUsersError> {
    const canonical = canonicalEmail(email);
    if (canonical === null) {
      return err({ code: 'invalid_email' });
    }
    return ok(canonical);
  }

  private parseRole(role: string): Result<Role, InvalidRoleManageUsersError> {
    if (!isRole(role)) {
      return err({ code: 'invalid_role' });
    }
    return ok(role);
  }

  private async duplicateEmail(
    email: string,
  ): Promise<Err<EmailTakenManageUsersError> | null> {
    const existing = await this.users.findByEmail(email);
    if (existing !== null) {
      return err({ code: 'email_taken' });
    }
    return null;
  }

  private async loadUser(
    userId: string,
  ): Promise<Result<User, UserNotFoundManageUsersError>> {
    const user = await this.users.findById(userId);
    if (user === null) {
      return err({ code: 'user_not_found' });
    }
    return ok(user);
  }

  private isActiveAdmin(user: User): boolean {
    return user.role === 'admin' && user.active;
  }

  private async blockLastAdmin(
    removesSeat: boolean,
  ): Promise<Err<LastAdminManageUsersError> | null> {
    if (!removesSeat) {
      return null;
    }

    const activeAdmins = await this.users.countActiveAdmins();
    if (activeAdmins < 2) {
      return err({ code: 'last_admin' });
    }
    return null;
  }

  private async recordAudit<TAction extends ManageUsersAuditAction>(
    actor: ManageUsersActor,
    action: TAction,
    user: User,
    detail: ManageUsersAuditDetail,
  ): Promise<Result<User, AuditWriteFailedManageUsersError<TAction>>> {
    const occurredAt = this.clock.now();
    const recorded = await this.auditLog.record({
      actorId: actor.userId,
      action,
      channel: 'web',
      result: 'success',
      target: user.id,
      detail,
      occurredAt,
    });
    if (isErr(recorded)) {
      return err({
        code: 'audit_write_failed',
        action,
        userId: user.id,
      });
    }
    return ok(user);
  }
}
