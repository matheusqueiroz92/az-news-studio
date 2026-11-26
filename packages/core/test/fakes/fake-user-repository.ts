import type { Role } from '../../src/domain/role.js';
import type {
  NewUser,
  User,
  UserRepository,
} from '../../src/ports/user-repository.js';

function sameEmail(stored: string, asked: string): boolean {
  return stored.toLowerCase() === asked.toLowerCase();
}

/**
 * Usuários em memória. O estado é `users`; `calls` conta cada método.
 * Leituras devolvem cópia rasa.
 * Não valida e-mail, não recusa duplicata e não protege o último admin.
 * Não reescreve o e-mail: a comparação só ignora caixa. Quem normaliza é o caso de uso.
 * `updateRole` e `setActive` lançam se o id não existe.
 */
export class FakeUserRepository implements UserRepository {
  readonly users: User[] = [];

  /** Próximo id de `insert`: `user-${nextId}`. */
  nextId = 1;

  readonly calls = {
    findByEmail: 0,
    findById: 0,
    list: 0,
    insert: 0,
    updateRole: 0,
    setActive: 0,
    countActiveAdmins: 0,
  };

  async findByEmail(email: string): Promise<User | null> {
    this.calls.findByEmail += 1;
    const found = this.users.find((user) => sameEmail(user.email, email));
    return found === undefined ? null : { ...found };
  }

  async findById(id: string): Promise<User | null> {
    this.calls.findById += 1;
    const found = this.users.find((user) => user.id === id);
    return found === undefined ? null : { ...found };
  }

  async list(): Promise<readonly User[]> {
    this.calls.list += 1;
    return this.users.map((user) => ({ ...user }));
  }

  async insert(user: NewUser): Promise<User> {
    this.calls.insert += 1;
    const stored: User = {
      id: `user-${this.nextId}`,
      email: user.email,
      name: user.name,
      role: user.role,
      active: user.active,
    };
    this.nextId += 1;
    this.users.push(stored);
    return { ...stored };
  }

  async updateRole(id: string, role: Role): Promise<void> {
    this.calls.updateRole += 1;
    const index = this.users.findIndex((user) => user.id === id);
    const current = this.users[index];
    if (current === undefined) {
      throw new Error('FakeUserRepository: unknown id');
    }
    this.users[index] = { ...current, role };
  }

  async setActive(id: string, active: boolean): Promise<void> {
    this.calls.setActive += 1;
    const index = this.users.findIndex((user) => user.id === id);
    const current = this.users[index];
    if (current === undefined) {
      throw new Error('FakeUserRepository: unknown id');
    }
    this.users[index] = { ...current, active };
  }

  async countActiveAdmins(): Promise<number> {
    this.calls.countActiveAdmins += 1;
    return this.users.filter((user) => user.role === 'admin' && user.active)
      .length;
  }
}
