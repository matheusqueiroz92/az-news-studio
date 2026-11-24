# ADR 0006 — Better Auth em vez de Auth.js

- Status: aceita
- Data: 2026-11-23
- Substitui: a linha "Auth.js" do [ADR 0002](0002-monorepo-e-stack.md)

## Contexto

O ADR 0002 escolheu Auth.js. Ao planejar a Fase 0 verificamos que:

- a versão 5 (`next-auth@5`) segue em beta desde outubro de 2023; a tag `latest` do npm ainda é a 4.x;
- desde setembro de 2025 o Auth.js é mantido pela equipe do Better Auth, que recomenda o Better Auth para projetos novos e mantém o Auth.js só com correções de segurança;
- a spec do servidor MCP exige um servidor de autorização OAuth 2.1, que o Auth.js não oferece.

## Decisão

Usar **Better Auth** (última versão estável, sem beta, pinada no dia da tarefa) com:

- adaptador **Drizzle** (Postgres);
- plugin **magic link**, com criação automática de usuário **desligada**: só entra e-mail já cadastrado e ativo;
- sessões no banco;
- campos adicionais `role` (`admin` | `editor` | `sales`) e `active` no usuário;
- na fase do MCP, o plugin **OAuth 2.1 Provider** (base oficial para autenticação de clientes MCP).

**Não usar o plugin `admin` do Better Auth.** Papéis, desativação e a regra "não rebaixar nem desativar o último admin" pertencem ao caso de uso `ManageUsers` em `packages/core`. O Better Auth só autentica e mantém a sessão; quem autoriza é o domínio.

## Consequências

- Tabelas de autenticação geradas pela CLI do Better Auth para Drizzle com a opção **`usePlural: true`**: `users`, `sessions`, `accounts`, `verifications` (evita `user`, palavra reservada no Postgres). Versionadas em migração SQL.
- Variáveis `BETTER_AUTH_SECRET` e `BETTER_AUTH_URL` no lugar de `AUTH_SECRET` e `AUTH_URL`.
- O envio do link continua com Nodemailer (função `sendMagicLink`), apontando para o Mailpit em desenvolvimento.
- O servidor MCP reaproveita a mesma instância para emitir tokens OAuth.
