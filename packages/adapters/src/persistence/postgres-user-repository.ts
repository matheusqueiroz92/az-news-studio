import { and, eq, sql, type SQL } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';

import type { NewUser, Role, User, UserRepository } from '@az-news/core';
import { users } from '@az-news/db';
import type * as schema from '@az-news/db';

type UserRow = typeof users.$inferSelect;

function toUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name === '' ? null : row.name,
    role: row.role as Role,
    active: row.active,
  };
}

export class PostgresUserRepository<
  TResult extends PgQueryResultHKT,
> implements UserRepository {
  constructor(private readonly db: PgDatabase<TResult, typeof schema>) {}

  async findByEmail(email: string): Promise<User | null> {
    return this.findOne(sql`lower(${users.email}) = ${email.toLowerCase()}`);
  }

  async findById(id: string): Promise<User | null> {
    return this.findOne(eq(users.id, id));
  }

  async list(): Promise<readonly User[]> {
    const rows = await this.db.select().from(users);
    return rows.map(toUser);
  }

  async insert(user: NewUser): Promise<User> {
    const [row] = await this.db
      .insert(users)
      .values({
        id: crypto.randomUUID(),
        name: user.name ?? '',
        email: user.email.toLowerCase(),
        role: user.role,
        active: user.active,
      })
      .returning();
    if (row === undefined) {
      throw new Error('Insert into users returned no row');
    }
    return toUser(row);
  }

  async updateRole(id: string, role: Role): Promise<void> {
    await this.db.update(users).set({ role }).where(eq(users.id, id));
  }

  async setActive(id: string, active: boolean): Promise<void> {
    await this.db.update(users).set({ active }).where(eq(users.id, id));
  }

  async countActiveAdmins(): Promise<number> {
    const rows = await this.db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.role, 'admin'), eq(users.active, true)));
    return rows.length;
  }

  private async findOne(where: SQL): Promise<User | null> {
    const [row] = await this.db.select().from(users).where(where);
    return row === undefined ? null : toUser(row);
  }
}
