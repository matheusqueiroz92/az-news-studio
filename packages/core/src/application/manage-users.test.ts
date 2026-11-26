import { describe, expect, it } from 'vitest';

import { FakeAuditLog } from '../../test/fakes/fake-audit-log.js';
import { FakeClock } from '../../test/fakes/fake-clock.js';
import { FakeUserRepository } from '../../test/fakes/fake-user-repository.js';
import type { Role } from '../domain/role.js';
import type { NewUser, User } from '../ports/user-repository.js';
import {
  ManageUsers,
  canonicalEmail,
  type ManageUsersActor,
  type UserChangeRoleAuditDetail,
  type UserCreateAuditDetail,
  type UserSetActiveAuditDetail,
} from './manage-users.js';

const INSTANT = new Date('2026-11-25T21:18:00.000Z');
const MIXED_EMAIL = '  Ada@AzNews.com.br  ';
const CANONICAL_EMAIL = 'ada@aznews.com.br';

const ADMIN: ManageUsersActor = { userId: 'actor-1', role: 'admin' };

const INVALID_EMAILS = [
  ['vazio', ''],
  ['só espaço', '   '],
  ['sem @', 'ada.aznews.com'],
  ['sem ponto no domínio', 'ada@aznews'],
  ['espaço no meio', 'ada @aznews.com.br'],
  ['espaço no domínio', 'ada@ aznews.com.br'],
  ['sem parte local', '@aznews.com'],
  ['sem domínio', 'ada@'],
  ['sem trecho depois do ponto', 'ada@aznews.'],
] as const;

const INVALID_ROLES = [
  'Admin',
  'EDITOR',
  'Sales',
  'sales ',
  ' editor',
  '',
  'guest',
] as const;

type Harness = {
  users: FakeUserRepository;
  auditLog: FakeAuditLog;
  clock: FakeClock;
  useCase: ManageUsers;
};

type AuditDetail =
  UserCreateAuditDetail | UserChangeRoleAuditDetail | UserSetActiveAuditDetail;

function harness(): Harness {
  const users = new FakeUserRepository();
  const auditLog = new FakeAuditLog();
  const clock = new FakeClock(INSTANT);
  const useCase = new ManageUsers(users, auditLog, clock);
  return { users, auditLog, clock, useCase };
}

function clearCalls(users: FakeUserRepository): void {
  users.calls.findByEmail = 0;
  users.calls.findById = 0;
  users.calls.list = 0;
  users.calls.insert = 0;
  users.calls.updateRole = 0;
  users.calls.setActive = 0;
  users.calls.countActiveAdmins = 0;
}

async function seed(users: FakeUserRepository, user: NewUser): Promise<User> {
  const stored = await users.insert(user);
  clearCalls(users);
  return stored;
}

function person(
  email: string,
  role: Role,
  active: boolean,
  name: string | null = null,
): NewUser {
  return { email, name, role, active };
}

function expectNoWrite(h: Harness): void {
  expect(h.users.calls.insert).toBe(0);
  expect(h.users.calls.updateRole).toBe(0);
  expect(h.users.calls.setActive).toBe(0);
  expect(h.auditLog.entries).toEqual([]);
  expect(h.clock.nowCount).toBe(0);
}

function expectUntouched(h: Harness): void {
  expect(h.users.calls.findByEmail).toBe(0);
  expect(h.users.calls.findById).toBe(0);
  expect(h.users.calls.list).toBe(0);
  expect(h.users.calls.countActiveAdmins).toBe(0);
  expectNoWrite(h);
}

function audit(
  action: 'user.create' | 'user.change_role' | 'user.set_active',
  actorId: string,
  target: string,
  detail: AuditDetail,
) {
  return {
    actorId,
    action,
    channel: 'web' as const,
    result: 'success' as const,
    target,
    detail,
    occurredAt: INSTANT,
  };
}

function expectAuditOmitsEmail(auditLog: FakeAuditLog, email: string): void {
  const serialized = JSON.stringify(auditLog.entries);
  expect(serialized).not.toContain(email);
  expect(serialized.toLowerCase()).not.toContain(email.trim().toLowerCase());
  for (const entry of auditLog.entries) {
    expect(entry.detail).not.toHaveProperty('email');
  }
}

describe('canonicalEmail', () => {
  it('deve devolver ada@aznews.com.br quando o e-mail é "  Ada@AzNews.com.br  "', () => {
    expect(canonicalEmail(MIXED_EMAIL)).toBe(CANONICAL_EMAIL);
  });

  it.each([
    ['ADA@AZNEWS.COM.BR', CANONICAL_EMAIL],
    [CANONICAL_EMAIL, CANONICAL_EMAIL],
    ['\n\tAda@AzNews.com.br\t', CANONICAL_EMAIL],
    ['a@b.c', 'a@b.c'],
    ['a@b..c', 'a@b..c'],
  ] as const)('deve normalizar %j para %j', (email, expected) => {
    expect(canonicalEmail(email)).toBe(expected);
  });

  it('deve aplicar toLowerCase sem locale quando a parte local é İ', () => {
    expect(canonicalEmail('İ@B.C')).toBe('i\u0307@b.c');
  });

  it.each(INVALID_EMAILS)(
    'deve devolver null quando o e-mail está %s',
    (_label, email) => {
      expect(canonicalEmail(email)).toBeNull();
    },
  );
});

describe('ManageUsers', () => {
  describe('createUser', () => {
    it.each(['admin', 'editor', 'sales'] as const)(
      'deve criar o usuário com e-mail em minúsculas e o papel %s quando o autor é admin e o e-mail tem espaços e caixa misturada',
      async (role) => {
        const h = harness();

        const result = await h.useCase.createUser({
          actor: ADMIN,
          email: MIXED_EMAIL,
          role,
        });

        const user = {
          id: 'user-1',
          email: CANONICAL_EMAIL,
          name: null,
          role,
          active: true,
        };
        expect(result).toEqual({ ok: true, value: user });
        expect(h.users.users).toEqual([user]);
        expect(h.users.calls.insert).toBe(1);
        expect(h.clock.nowCount).toBe(1);
        expect(h.auditLog.entries).toEqual([
          audit('user.create', ADMIN.userId, user.id, { role }),
        ]);
      },
    );

    it.each(['a@b.c', 'a@b..c'] as const)(
      'deve criar o usuário quando canonicalEmail aceita %s',
      async (email) => {
        const h = harness();

        const result = await h.useCase.createUser({
          actor: ADMIN,
          email,
          role: 'editor',
        });

        expect(result).toEqual({
          ok: true,
          value: {
            id: 'user-1',
            email,
            name: null,
            role: 'editor',
            active: true,
          },
        });
      },
    );

    it.each(INVALID_EMAILS)(
      'deve recusar com invalid_email sem gravar quando o e-mail está %s',
      async (_label, email) => {
        const h = harness();

        const result = await h.useCase.createUser({
          actor: ADMIN,
          email,
          role: 'editor',
        });

        expect(result).toEqual({ ok: false, error: { code: 'invalid_email' } });
        expectNoWrite(h);
      },
    );

    it('deve recusar com invalid_email antes de invalid_role quando o e-mail e o papel são inválidos', async () => {
      const h = harness();

      const result = await h.useCase.createUser({
        actor: ADMIN,
        email: 'ada sem arroba',
        role: 'Papa',
      });

      expect(result).toEqual({ ok: false, error: { code: 'invalid_email' } });
      expectNoWrite(h);
    });

    it.each(INVALID_ROLES)(
      'deve recusar com invalid_role sem buscar o id e sem gravar quando o papel é %j',
      async (role) => {
        const h = harness();
        await seed(h.users, person(CANONICAL_EMAIL, 'editor', true, 'Ada'));

        const result = await h.useCase.createUser({
          actor: ADMIN,
          email: MIXED_EMAIL,
          role,
        });

        expect(result).toEqual({ ok: false, error: { code: 'invalid_role' } });
        expect(h.users.users).toEqual([
          {
            id: 'user-1',
            email: CANONICAL_EMAIL,
            name: 'Ada',
            role: 'editor',
            active: true,
          },
        ]);
        expect(h.users.calls.findById).toBe(0);
        expectNoWrite(h);
      },
    );

    it('deve recusar com email_taken sem gravar quando o e-mail canônico já existe com outra caixa ou outros espaços', async () => {
      const h = harness();
      await seed(h.users, person(CANONICAL_EMAIL, 'editor', true, 'Ada'));

      const result = await h.useCase.createUser({
        actor: ADMIN,
        email: MIXED_EMAIL,
        role: 'sales',
      });

      expect(result).toEqual({ ok: false, error: { code: 'email_taken' } });
      expect(h.users.users).toEqual([
        {
          id: 'user-1',
          email: CANONICAL_EMAIL,
          name: 'Ada',
          role: 'editor',
          active: true,
        },
      ]);
      expectNoWrite(h);
    });

    it('deve recusar com email_taken sem reativar e sem gravar quando o e-mail já pertence a um usuário inativo', async () => {
      const h = harness();
      await seed(h.users, person(CANONICAL_EMAIL, 'sales', false));

      const result = await h.useCase.createUser({
        actor: ADMIN,
        email: MIXED_EMAIL,
        role: 'admin',
      });

      expect(result).toEqual({ ok: false, error: { code: 'email_taken' } });
      expect(h.users.users).toEqual([
        {
          id: 'user-1',
          email: CANONICAL_EMAIL,
          name: null,
          role: 'sales',
          active: false,
        },
      ]);
      expectNoWrite(h);
    });

    it.each(['editor', 'sales'] as const)(
      'deve recusar com forbidden e não tocar o repositório quando o autor é %s',
      async (role) => {
        const h = harness();
        await seed(h.users, person(CANONICAL_EMAIL, 'admin', false));

        const result = await h.useCase.createUser({
          actor: { userId: 'actor-2', role },
          email: 'ada sem arroba',
          role: 'Papa',
        });

        expect(result).toEqual({ ok: false, error: { code: 'forbidden' } });
        expect(h.users.users[0]?.active).toBe(false);
        expectUntouched(h);
      },
    );

    it('deve devolver audit_write_failed com o usuário já persistido e uma única chamada a record quando o audit log falha na criação', async () => {
      const h = harness();
      h.auditLog.failWrites = true;

      const result = await h.useCase.createUser({
        actor: ADMIN,
        email: MIXED_EMAIL,
        role: 'editor',
      });

      const user = {
        id: 'user-1',
        email: CANONICAL_EMAIL,
        name: null,
        role: 'editor' as const,
        active: true,
      };
      expect(result).toEqual({
        ok: false,
        error: {
          code: 'audit_write_failed',
          action: 'user.create',
          userId: user.id,
        },
      });
      expect(h.users.users).toEqual([user]);
      expect(h.users.calls.insert).toBe(1);
      expect(h.auditLog.entries).toEqual([
        audit('user.create', ADMIN.userId, user.id, { role: 'editor' }),
      ]);
      expect(h.clock.nowCount).toBe(1);
    });

    it('deve propagar a exceção do repositório sem gravar audit log quando o insert falha', async () => {
      const h = harness();
      h.users.insert = async () => {
        throw new Error('banco fora do ar');
      };

      await expect(
        h.useCase.createUser({
          actor: ADMIN,
          email: MIXED_EMAIL,
          role: 'editor',
        }),
      ).rejects.toThrow('banco fora do ar');
      expect(h.users.users).toEqual([]);
      expect(h.auditLog.entries).toEqual([]);
    });
  });

  describe('changeUserRole', () => {
    it('deve trocar o papel e gravar user.change_role com from e to quando o autor é admin', async () => {
      const h = harness();
      const user = await seed(
        h.users,
        person('editor@aznews.com.br', 'editor', true, 'Ada'),
      );

      const result = await h.useCase.changeUserRole({
        actor: ADMIN,
        userId: user.id,
        role: 'sales',
      });

      const updated = { ...user, role: 'sales' as const };
      expect(result).toEqual({ ok: true, value: updated });
      expect(h.users.users).toEqual([updated]);
      expect(h.users.calls.updateRole).toBe(1);
      expect(h.clock.nowCount).toBe(1);
      expect(h.auditLog.entries).toEqual([
        audit('user.change_role', ADMIN.userId, user.id, {
          from: 'editor',
          to: 'sales',
        }),
      ]);
    });

    it.each(INVALID_ROLES)(
      'deve recusar com invalid_role sem buscar o id quando o papel é %j',
      async (role) => {
        const h = harness();
        const user = await seed(
          h.users,
          person('ana@aznews.com.br', 'admin', true),
        );

        const result = await h.useCase.changeUserRole({
          actor: ADMIN,
          userId: user.id,
          role,
        });

        expect(result).toEqual({ ok: false, error: { code: 'invalid_role' } });
        expect(h.users.users).toEqual([user]);
        expect(h.users.calls.findById).toBe(0);
        expectNoWrite(h);
      },
    );

    it('deve recusar com invalid_role sem buscar o id quando o papel é inválido e o usuário não existe', async () => {
      const h = harness();

      const result = await h.useCase.changeUserRole({
        actor: ADMIN,
        userId: 'ausente',
        role: 'Admin',
      });

      expect(result).toEqual({ ok: false, error: { code: 'invalid_role' } });
      expect(h.users.calls.findById).toBe(0);
      expectNoWrite(h);
    });

    it('deve recusar com user_not_found sem gravar quando o id não existe', async () => {
      const h = harness();

      const result = await h.useCase.changeUserRole({
        actor: ADMIN,
        userId: 'ausente',
        role: 'editor',
      });

      expect(result).toEqual({
        ok: false,
        error: { code: 'user_not_found' },
      });
      expectNoWrite(h);
    });

    it('deve aceitar sem escrever, sem ler o relógio e sem audit log quando o único admin ativo pede o mesmo papel', async () => {
      const h = harness();
      const user = await seed(
        h.users,
        person('ana@aznews.com.br', 'admin', true),
      );

      const result = await h.useCase.changeUserRole({
        actor: { userId: user.id, role: 'admin' },
        userId: user.id,
        role: 'admin',
      });

      expect(result).toEqual({ ok: true, value: user });
      expect(h.users.users).toEqual([user]);
      expectNoWrite(h);
    });

    it('deve aceitar sem escrever, sem ler o relógio e sem audit log quando o editor pede o mesmo papel', async () => {
      const h = harness();
      const user = await seed(
        h.users,
        person('ada@aznews.com.br', 'editor', true, 'Ada'),
      );

      const result = await h.useCase.changeUserRole({
        actor: ADMIN,
        userId: user.id,
        role: 'editor',
      });

      expect(result).toEqual({ ok: true, value: user });
      expect(h.users.users).toEqual([user]);
      expectNoWrite(h);
    });

    it('deve recusar com last_admin sem gravar quando rebaixa o único admin ativo', async () => {
      const h = harness();
      const user = await seed(
        h.users,
        person('ana@aznews.com.br', 'admin', true),
      );

      const result = await h.useCase.changeUserRole({
        actor: ADMIN,
        userId: user.id,
        role: 'sales',
      });

      expect(result).toEqual({ ok: false, error: { code: 'last_admin' } });
      expect(h.users.users).toEqual([user]);
      expectNoWrite(h);
    });

    it('deve recusar com last_admin sem gravar quando o autor rebaixa a si mesmo e é o único admin ativo', async () => {
      const h = harness();
      const user = await seed(
        h.users,
        person('ana@aznews.com.br', 'admin', true),
      );

      const result = await h.useCase.changeUserRole({
        actor: { userId: user.id, role: 'admin' },
        userId: user.id,
        role: 'editor',
      });

      expect(result).toEqual({ ok: false, error: { code: 'last_admin' } });
      expect(h.users.users).toEqual([user]);
      expectNoWrite(h);
    });

    it('deve rebaixar o próprio autor e gravar audit log quando existem dois admins ativos', async () => {
      const h = harness();
      const self = await seed(
        h.users,
        person('ana@aznews.com.br', 'admin', true),
      );
      const other = await seed(
        h.users,
        person('bia@aznews.com.br', 'admin', true),
      );

      const result = await h.useCase.changeUserRole({
        actor: { userId: self.id, role: 'admin' },
        userId: self.id,
        role: 'editor',
      });

      const updated = { ...self, role: 'editor' as const };
      expect(result).toEqual({ ok: true, value: updated });
      expect(h.users.users).toEqual([updated, other]);
      expect(h.users.calls.updateRole).toBe(1);
      expect(h.clock.nowCount).toBe(1);
      expect(h.auditLog.entries).toEqual([
        audit('user.change_role', self.id, self.id, {
          from: 'admin',
          to: 'editor',
        }),
      ]);
    });

    it('deve rebaixar um admin inativo', async () => {
      const h = harness();
      const user = await seed(
        h.users,
        person('ana@aznews.com.br', 'admin', false),
      );

      const result = await h.useCase.changeUserRole({
        actor: ADMIN,
        userId: user.id,
        role: 'sales',
      });

      const updated = { ...user, role: 'sales' as const };
      expect(result).toEqual({ ok: true, value: updated });
      expect(h.users.users).toEqual([updated]);
      expect(h.users.calls.updateRole).toBe(1);
      expect(h.clock.nowCount).toBe(1);
      expect(h.auditLog.entries).toEqual([
        audit('user.change_role', ADMIN.userId, user.id, {
          from: 'admin',
          to: 'sales',
        }),
      ]);
    });

    it.each(['editor', 'sales'] as const)(
      'deve recusar com forbidden e não tocar o repositório quando o autor é %s',
      async (role) => {
        const h = harness();
        const user = await seed(
          h.users,
          person('ana@aznews.com.br', 'admin', true),
        );

        const result = await h.useCase.changeUserRole({
          actor: { userId: 'actor-2', role },
          userId: user.id,
          role: 'Admin',
        });

        expect(result).toEqual({ ok: false, error: { code: 'forbidden' } });
        expect(h.users.users).toEqual([user]);
        expectUntouched(h);
      },
    );

    it('deve recusar com forbidden sem gravar quando o autor não é admin e a troca tiraria o último admin ativo', async () => {
      const h = harness();
      const user = await seed(
        h.users,
        person('ana@aznews.com.br', 'admin', true),
      );

      const result = await h.useCase.changeUserRole({
        actor: { userId: user.id, role: 'editor' },
        userId: user.id,
        role: 'sales',
      });

      expect(result).toEqual({ ok: false, error: { code: 'forbidden' } });
      expect(h.users.users).toEqual([user]);
      expectUntouched(h);
    });

    it('deve devolver audit_write_failed com o papel já gravado e uma única chamada a record quando o audit log falha na troca', async () => {
      const h = harness();
      const user = await seed(
        h.users,
        person('editor@aznews.com.br', 'editor', true),
      );
      h.auditLog.failWrites = true;

      const result = await h.useCase.changeUserRole({
        actor: ADMIN,
        userId: user.id,
        role: 'sales',
      });

      expect(result).toEqual({
        ok: false,
        error: {
          code: 'audit_write_failed',
          action: 'user.change_role',
          userId: user.id,
        },
      });
      expect(h.users.users).toEqual([{ ...user, role: 'sales' }]);
      expect(h.users.calls.updateRole).toBe(1);
      expect(h.auditLog.entries).toEqual([
        audit('user.change_role', ADMIN.userId, user.id, {
          from: 'editor',
          to: 'sales',
        }),
      ]);
      expect(h.clock.nowCount).toBe(1);
    });

    it('deve propagar a exceção do repositório sem gravar audit log quando updateRole falha', async () => {
      const h = harness();
      const user = await seed(
        h.users,
        person('editor@aznews.com.br', 'editor', true),
      );
      h.users.updateRole = async () => {
        throw new Error('banco fora do ar');
      };

      await expect(
        h.useCase.changeUserRole({
          actor: ADMIN,
          userId: user.id,
          role: 'sales',
        }),
      ).rejects.toThrow('banco fora do ar');
      expect(h.users.users).toEqual([user]);
      expect(h.auditLog.entries).toEqual([]);
    });
  });

  describe('setUserActive', () => {
    it('deve desativar e reativar um usuário sem exclusão física e gravar user.set_active', async () => {
      const h = harness();
      const user = await seed(
        h.users,
        person('ada@aznews.com.br', 'editor', true, 'Ada'),
      );

      const deactivated = await h.useCase.setUserActive({
        actor: ADMIN,
        userId: user.id,
        active: false,
      });

      expect(deactivated).toEqual({
        ok: true,
        value: { ...user, active: false },
      });
      expect(h.users.users).toEqual([{ ...user, active: false }]);

      const reactivated = await h.useCase.setUserActive({
        actor: ADMIN,
        userId: user.id,
        active: true,
      });

      expect(reactivated).toEqual({ ok: true, value: user });
      expect(h.users.users).toEqual([user]);
      expect(h.users.calls.setActive).toBe(2);
      expect(h.clock.nowCount).toBe(2);
      expect(h.auditLog.entries).toEqual([
        audit('user.set_active', ADMIN.userId, user.id, {
          from: true,
          to: false,
        }),
        audit('user.set_active', ADMIN.userId, user.id, {
          from: false,
          to: true,
        }),
      ]);
    });

    it('deve aceitar sem escrever, sem ler o relógio e sem audit log quando o único admin ativo já está ativo', async () => {
      const h = harness();
      const user = await seed(
        h.users,
        person('ana@aznews.com.br', 'admin', true),
      );

      const result = await h.useCase.setUserActive({
        actor: { userId: user.id, role: 'admin' },
        userId: user.id,
        active: true,
      });

      expect(result).toEqual({ ok: true, value: user });
      expect(h.users.users).toEqual([user]);
      expectNoWrite(h);
    });

    it('deve aceitar sem escrever, sem ler o relógio e sem audit log quando o usuário inativo já está inativo', async () => {
      const h = harness();
      const user = await seed(
        h.users,
        person('ada@aznews.com.br', 'editor', false, 'Ada'),
      );

      const result = await h.useCase.setUserActive({
        actor: ADMIN,
        userId: user.id,
        active: false,
      });

      expect(result).toEqual({ ok: true, value: user });
      expect(h.users.users).toEqual([user]);
      expectNoWrite(h);
    });

    it('deve recusar com user_not_found sem gravar quando o id não existe', async () => {
      const h = harness();

      const result = await h.useCase.setUserActive({
        actor: ADMIN,
        userId: 'ausente',
        active: false,
      });

      expect(result).toEqual({
        ok: false,
        error: { code: 'user_not_found' },
      });
      expectNoWrite(h);
    });

    it('deve recusar com last_admin sem gravar quando desativa o único admin ativo', async () => {
      const h = harness();
      const user = await seed(
        h.users,
        person('ana@aznews.com.br', 'admin', true),
      );

      const result = await h.useCase.setUserActive({
        actor: ADMIN,
        userId: user.id,
        active: false,
      });

      expect(result).toEqual({ ok: false, error: { code: 'last_admin' } });
      expect(h.users.users).toEqual([user]);
      expectNoWrite(h);
    });

    it('deve recusar com last_admin sem gravar quando o autor desativa a si mesmo e é o único admin ativo', async () => {
      const h = harness();
      const user = await seed(
        h.users,
        person('ana@aznews.com.br', 'admin', true),
      );

      const result = await h.useCase.setUserActive({
        actor: { userId: user.id, role: 'admin' },
        userId: user.id,
        active: false,
      });

      expect(result).toEqual({ ok: false, error: { code: 'last_admin' } });
      expect(h.users.users).toEqual([user]);
      expectNoWrite(h);
    });

    it('deve desativar o próprio autor e gravar audit log quando existem dois admins ativos', async () => {
      const h = harness();
      const self = await seed(
        h.users,
        person('ana@aznews.com.br', 'admin', true),
      );
      const other = await seed(
        h.users,
        person('bia@aznews.com.br', 'admin', true),
      );

      const result = await h.useCase.setUserActive({
        actor: { userId: self.id, role: 'admin' },
        userId: self.id,
        active: false,
      });

      const updated = { ...self, active: false };
      expect(result).toEqual({ ok: true, value: updated });
      expect(h.users.users).toEqual([updated, other]);
      expect(h.users.calls.setActive).toBe(1);
      expect(h.clock.nowCount).toBe(1);
      expect(h.auditLog.entries).toEqual([
        audit('user.set_active', self.id, self.id, { from: true, to: false }),
      ]);
    });

    it('deve reativar um admin inativo', async () => {
      const h = harness();
      const user = await seed(
        h.users,
        person('ana@aznews.com.br', 'admin', false),
      );

      const result = await h.useCase.setUserActive({
        actor: ADMIN,
        userId: user.id,
        active: true,
      });

      const updated = { ...user, active: true };
      expect(result).toEqual({ ok: true, value: updated });
      expect(h.users.users).toEqual([updated]);
      expect(h.users.calls.setActive).toBe(1);
      expect(h.clock.nowCount).toBe(1);
      expect(h.auditLog.entries).toEqual([
        audit('user.set_active', ADMIN.userId, user.id, {
          from: false,
          to: true,
        }),
      ]);
    });

    it.each(['editor', 'sales'] as const)(
      'deve recusar com forbidden e não tocar o repositório quando o autor é %s',
      async (role) => {
        const h = harness();
        const user = await seed(
          h.users,
          person('ana@aznews.com.br', 'admin', true),
        );

        const result = await h.useCase.setUserActive({
          actor: { userId: 'actor-2', role },
          userId: user.id,
          active: false,
        });

        expect(result).toEqual({ ok: false, error: { code: 'forbidden' } });
        expect(h.users.users).toEqual([user]);
        expectUntouched(h);
      },
    );

    it('deve devolver audit_write_failed com a situação já gravada e uma única chamada a record quando o audit log falha na desativação', async () => {
      const h = harness();
      const user = await seed(
        h.users,
        person('ada@aznews.com.br', 'editor', true, 'Ada'),
      );
      h.auditLog.failWrites = true;

      const result = await h.useCase.setUserActive({
        actor: ADMIN,
        userId: user.id,
        active: false,
      });

      expect(result).toEqual({
        ok: false,
        error: {
          code: 'audit_write_failed',
          action: 'user.set_active',
          userId: user.id,
        },
      });
      expect(h.users.users).toEqual([{ ...user, active: false }]);
      expect(h.users.calls.setActive).toBe(1);
      expect(h.auditLog.entries).toEqual([
        audit('user.set_active', ADMIN.userId, user.id, {
          from: true,
          to: false,
        }),
      ]);
      expect(h.clock.nowCount).toBe(1);
    });

    it('deve propagar a exceção do repositório sem gravar audit log quando setActive falha', async () => {
      const h = harness();
      const user = await seed(
        h.users,
        person('ada@aznews.com.br', 'editor', true),
      );
      h.users.setActive = async () => {
        throw new Error('banco fora do ar');
      };

      await expect(
        h.useCase.setUserActive({
          actor: ADMIN,
          userId: user.id,
          active: false,
        }),
      ).rejects.toThrow('banco fora do ar');
      expect(h.users.users).toEqual([user]);
      expect(h.auditLog.entries).toEqual([]);
    });
  });

  describe('listUsers', () => {
    it('deve listar e-mail, papel e situação, inclusive inativos, na ordem do repositório e sem segredo quando o autor é admin', async () => {
      const h = harness();
      const activeEditor = await seed(
        h.users,
        person('ada@aznews.com.br', 'editor', true, 'Ada'),
      );
      const inactiveAdmin = await seed(
        h.users,
        person('ana@aznews.com.br', 'admin', false),
      );

      const result = await h.useCase.listUsers({ actor: ADMIN });

      expect(result).toEqual({
        ok: true,
        value: [activeEditor, inactiveAdmin],
      });
      if (result.ok) {
        for (const user of result.value) {
          expect(Object.keys(user).sort()).toEqual([
            'active',
            'email',
            'id',
            'name',
            'role',
          ]);
        }
      }
      expectNoWrite(h);
    });

    it.each(['editor', 'sales'] as const)(
      'deve recusar com forbidden sem chamar list quando o autor é %s',
      async (role) => {
        const h = harness();
        await seed(
          h.users,
          person('ada@aznews.com.br', 'editor', false, 'Ada'),
        );

        const result = await h.useCase.listUsers({
          actor: { userId: 'actor-2', role },
        });

        expect(result).toEqual({ ok: false, error: { code: 'forbidden' } });
        expectUntouched(h);
      },
    );

    it('deve propagar a exceção do repositório sem gravar audit log quando list falha', async () => {
      const h = harness();
      h.users.list = async () => {
        throw new Error('banco fora do ar');
      };

      await expect(h.useCase.listUsers({ actor: ADMIN })).rejects.toThrow(
        'banco fora do ar',
      );
      expect(h.auditLog.entries).toEqual([]);
    });
  });

  describe('audit log', () => {
    it('deve gravar user.create, user.change_role e user.set_active com o detail da ação e sem o e-mail do usuário', async () => {
      const h = harness();

      const created = await h.useCase.createUser({
        actor: ADMIN,
        email: MIXED_EMAIL,
        role: 'editor',
      });
      expect(created).toEqual({
        ok: true,
        value: {
          id: 'user-1',
          email: CANONICAL_EMAIL,
          name: null,
          role: 'editor',
          active: true,
        },
      });

      const changed = await h.useCase.changeUserRole({
        actor: ADMIN,
        userId: 'user-1',
        role: 'sales',
      });
      expect(changed).toEqual({
        ok: true,
        value: {
          id: 'user-1',
          email: CANONICAL_EMAIL,
          name: null,
          role: 'sales',
          active: true,
        },
      });

      const deactivated = await h.useCase.setUserActive({
        actor: ADMIN,
        userId: 'user-1',
        active: false,
      });
      expect(deactivated).toEqual({
        ok: true,
        value: {
          id: 'user-1',
          email: CANONICAL_EMAIL,
          name: null,
          role: 'sales',
          active: false,
        },
      });

      expect(h.auditLog.entries).toEqual([
        audit('user.create', ADMIN.userId, 'user-1', { role: 'editor' }),
        audit('user.change_role', ADMIN.userId, 'user-1', {
          from: 'editor',
          to: 'sales',
        }),
        audit('user.set_active', ADMIN.userId, 'user-1', {
          from: true,
          to: false,
        }),
      ]);
      expect(h.clock.nowCount).toBe(3);
      expectAuditOmitsEmail(h.auditLog, MIXED_EMAIL);
    });
  });
});
