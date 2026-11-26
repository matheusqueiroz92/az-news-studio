import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getTableName, is } from 'drizzle-orm';
import { getTableColumns } from 'drizzle-orm/utils';
import {
  getTableConfig,
  PgDialect,
  PgTable,
  type PgColumn,
} from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { accounts, sessions, users, verifications } from './auth.js';
import { auditLog } from './audit-log.js';
import * as schema from './index.js';

const dialect = new PgDialect();

type ColumnSpec = {
  sqlName: string;
  sqlType: string;
  notNull: boolean;
  unique?: boolean;
  primary?: boolean;
};

function expectColumns(
  table: PgTable,
  specs: Record<string, ColumnSpec>,
): void {
  const columns = getTableColumns(table);
  expect(Object.keys(columns).sort()).toEqual(Object.keys(specs).sort());
  for (const [key, spec] of Object.entries(specs)) {
    const column = columns[key];
    expect(column, key).toBeDefined();
    if (column === undefined) {
      continue;
    }
    expect(column.name, key).toBe(spec.sqlName);
    expect(column.getSQLType(), key).toBe(spec.sqlType);
    expect(column.notNull, key).toBe(spec.notNull);
    if (spec.unique !== undefined) {
      expect(column.isUnique, key).toBe(spec.unique);
    }
    if (spec.primary !== undefined) {
      expect(column.primary, key).toBe(spec.primary);
    }
  }
}

function expectCascadeUserId(table: PgTable, column: PgColumn): void {
  const match = getTableConfig(table).foreignKeys.find((foreignKey) =>
    foreignKey.reference().columns.some((item) => item.name === column.name),
  );
  expect(match).toBeDefined();
  expect(match?.onDelete).toBe('cascade');
  const foreignColumn = match?.reference().foreignColumns[0];
  expect(foreignColumn?.name).toBe('id');
  if (match !== undefined) {
    expect(getTableName(match.reference().foreignTable)).toBe('users');
  }
}

function migrationSql(): string {
  const directory = fileURLToPath(new URL('../../drizzle/', import.meta.url));
  const files = readdirSync(directory).filter((name) => name.endsWith('.sql'));
  expect(files).toHaveLength(1);
  const fileName = files[0];
  expect(fileName).toBeDefined();
  if (fileName === undefined) {
    return '';
  }
  return readFileSync(path.join(directory, fileName), 'utf8');
}

const text = (sqlName: string, notNull: boolean): ColumnSpec => ({
  sqlName,
  sqlType: 'text',
  notNull,
});

const timestamp = (sqlName: string, notNull: boolean): ColumnSpec => ({
  sqlName,
  sqlType: 'timestamp with time zone',
  notNull,
});

describe('schema do banco', () => {
  it('deve declarar users, sessions, accounts e verifications com as colunas que o adaptador Drizzle do Better Auth espera (usePlural: true)', () => {
    expect(getTableName(users)).toBe('users');
    expect(getTableName(sessions)).toBe('sessions');
    expect(getTableName(accounts)).toBe('accounts');
    expect(getTableName(verifications)).toBe('verifications');

    expectColumns(users, {
      id: { ...text('id', true), primary: true },
      name: text('name', true),
      email: { ...text('email', true), unique: true },
      emailVerified: {
        sqlName: 'email_verified',
        sqlType: 'boolean',
        notNull: true,
      },
      image: text('image', false),
      createdAt: timestamp('created_at', true),
      updatedAt: timestamp('updated_at', true),
      role: text('role', true),
      active: { sqlName: 'active', sqlType: 'boolean', notNull: true },
    });

    expectColumns(sessions, {
      id: { ...text('id', true), primary: true },
      expiresAt: timestamp('expires_at', true),
      token: { ...text('token', true), unique: true },
      createdAt: timestamp('created_at', true),
      updatedAt: timestamp('updated_at', true),
      ipAddress: text('ip_address', false),
      userAgent: text('user_agent', false),
      userId: text('user_id', true),
    });
    const sessionUserId = getTableColumns(sessions).userId;
    expect(sessionUserId).toBeDefined();
    if (sessionUserId !== undefined) {
      expectCascadeUserId(sessions, sessionUserId);
    }

    expectColumns(accounts, {
      id: { ...text('id', true), primary: true },
      accountId: text('account_id', true),
      providerId: text('provider_id', true),
      userId: text('user_id', true),
      accessToken: text('access_token', false),
      refreshToken: text('refresh_token', false),
      idToken: text('id_token', false),
      accessTokenExpiresAt: timestamp('access_token_expires_at', false),
      refreshTokenExpiresAt: timestamp('refresh_token_expires_at', false),
      scope: text('scope', false),
      password: text('password', false),
      createdAt: timestamp('created_at', true),
      updatedAt: timestamp('updated_at', true),
    });
    const accountUserId = getTableColumns(accounts).userId;
    expect(accountUserId).toBeDefined();
    if (accountUserId !== undefined) {
      expectCascadeUserId(accounts, accountUserId);
    }

    expectColumns(verifications, {
      id: { ...text('id', true), primary: true },
      identifier: text('identifier', true),
      value: text('value', true),
      expiresAt: timestamp('expires_at', true),
      createdAt: timestamp('created_at', true),
      updatedAt: timestamp('updated_at', true),
    });
    expect(getTableConfig(verifications).foreignKeys).toHaveLength(0);
  });

  it('deve guardar as datas de autenticação como timestamptz', () => {
    for (const table of [users, sessions, accounts, verifications]) {
      const dateColumns = Object.values(getTableColumns(table)).filter(
        (column) => column.getSQLType().startsWith('timestamp'),
      );
      expect(dateColumns.length).toBeGreaterThan(0);
      for (const column of dateColumns) {
        expect(
          column.getSQLType(),
          `${getTableName(table)}.${column.name}`,
        ).toBe('timestamp with time zone');
      }
    }
    expect(migrationSql()).not.toMatch(/\btimestamp\b(?! with time zone)/);
  });

  it('deve restringir users.role a admin, editor e sales', () => {
    const checks = getTableConfig(users).checks.map(
      (item) => dialect.sqlToQuery(item.value).sql,
    );
    expect(
      checks.some(
        (sql) =>
          sql.includes("'admin'") &&
          sql.includes("'editor'") &&
          sql.includes("'sales'"),
      ),
    ).toBe(true);
    expect(migrationSql()).toContain(`'admin', 'editor', 'sales'`);
  });

  it('deve exigir users.role e users.active', () => {
    const columns = getTableColumns(users);
    expect(columns.role?.notNull).toBe(true);
    expect(columns.role?.getSQLType()).toBe('text');
    expect(columns.role?.hasDefault).toBe(true);
    expect(columns.role?.default).toBe('editor');
    expect(columns.active?.notNull).toBe(true);
    expect(columns.active?.getSQLType()).toBe('boolean');
    expect(columns.active?.hasDefault).toBe(true);
    expect(columns.active?.default).toBe(true);
  });

  it('deve guardar audit_log.occurred_at como timestamptz e channel restrito a web, worker e mcp', () => {
    expect(getTableName(auditLog)).toBe('audit_log');
    expectColumns(auditLog, {
      id: { sqlName: 'id', sqlType: 'uuid', notNull: true, primary: true },
      occurredAt: {
        sqlName: 'occurred_at',
        sqlType: 'timestamp with time zone',
        notNull: true,
      },
      actorId: text('actor_id', false),
      action: text('action', true),
      channel: text('channel', true),
      result: text('result', true),
      target: text('target', false),
      detail: { sqlName: 'detail', sqlType: 'jsonb', notNull: false },
    });
    expect(getTableConfig(auditLog).foreignKeys).toHaveLength(0);

    const checks = getTableConfig(auditLog).checks.map(
      (item) => dialect.sqlToQuery(item.value).sql,
    );
    expect(checks).toHaveLength(2);
    expect(
      checks.some(
        (sql) =>
          sql.includes("'web'") &&
          sql.includes("'worker'") &&
          sql.includes("'mcp'"),
      ),
    ).toBe(true);
    expect(
      checks.some(
        (sql) => sql.includes("'success'") && sql.includes("'failure'"),
      ),
    ).toBe(true);
  });

  it('deve incluir CREATE EXTENSION IF NOT EXISTS vector na migração', () => {
    const sql = migrationSql();
    expect(sql.startsWith('CREATE EXTENSION IF NOT EXISTS vector;\n')).toBe(
      true,
    );
    expect(sql).toContain(`'web', 'worker', 'mcp'`);
    expect(sql).toContain(`'success', 'failure'`);
  });

  it('deve não criar tabela articles, source_items nem coluna vector', () => {
    const names = Object.values(schema)
      .filter((value) => is(value, PgTable))
      .map((table) => getTableName(table));
    expect(names).not.toContain('articles');
    expect(names).not.toContain('source_items');
    for (const table of [users, sessions, accounts, verifications, auditLog]) {
      for (const column of Object.values(getTableColumns(table))) {
        expect(column.getSQLType().toLowerCase()).not.toContain('vector');
      }
    }

    const sql = migrationSql().replace(
      'CREATE EXTENSION IF NOT EXISTS vector;',
      '',
    );
    expect(sql.toLowerCase()).not.toContain('articles');
    expect(sql.toLowerCase()).not.toContain('source_items');
    expect(sql.toLowerCase()).not.toContain('vector');
  });
});
