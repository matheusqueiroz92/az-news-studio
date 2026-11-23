# ADR 0002 — Monorepo pnpm + Turborepo e stack base

- Status: aceita
- Data: 2026-11-23

## Decisão

- **Monorepo** com pnpm workspaces + Turborepo: `apps/web`, `apps/worker`, `packages/core`, `packages/adapters`, `packages/db`, `packages/contracts`, `packages/config`.
- **Node 22 LTS**, TypeScript 5 `strict`.
- **Next.js** (App Router) para UI e API interna.
- **PostgreSQL 16 + Drizzle ORM** (schema em TypeScript, migrações versionadas, SQL previsível).
- **Redis 7 + BullMQ** para filas.
- **Zod** para contratos (entrada da API, saída da IA, eventos).
- **Vitest** para testes; Playwright para E2E da UI (a partir da Fase 1).
- **Auth.js** com login por e-mail (link mágico) e papéis `admin`, `editor`, `sales`.
- **ESLint + Prettier**, com `eslint-plugin-boundaries` para impor as regras de dependência da arquitetura hexagonal.

## Por que Drizzle e não Prisma

Sem engine binária (deploy mais simples no Docker), tipos inferidos do schema e consultas próximas do SQL. Prisma seria aceitável; a escolha é de conveniência e pode ser revista antes da primeira migração.
