# Regras para agentes (Cursor / Claude)

Leia este arquivo antes de qualquer tarefa neste repositório.

## Fluxo

1. Toda tarefa parte de uma spec em `specs/<fase>/spec.md`. Se a tarefa não estiver na spec, pare e proponha a alteração da spec primeiro.
2. Papéis: **Planner** (quebra a spec em tarefas) → **Domain Architect** (entidades, value objects, portas) → **Test Engineer** (testes que falham) → **Implementer** (faz passar) → **Reviewer** (confere spec, arquitetura e testes).
3. TDD obrigatório no `packages/core`: nenhum caso de uso sem teste.
4. Uma tarefa = um commit pequeno, com mensagem no padrão Conventional Commits em português (`feat(redacao): ...`).

## Arquitetura (hexagonal)

```
apps/web        Next.js (App Router): UI + Route Handlers  → adaptadores de ENTRADA
apps/worker     Consumidores BullMQ (agentes)               → adaptadores de ENTRADA
apps/mcp        Servidor MCP (ferramentas = casos de uso)  → adaptador de ENTRADA
packages/core   Domínio + casos de uso + PORTAS             → sem dependências externas
packages/adapters  Implementações das portas (WordPress, Claude, Readability, Playwright, S3, Postgres)
packages/db     Schema Drizzle + migrações
packages/contracts  Schemas Zod compartilhados (DTOs, saída da IA, eventos)
packages/config     tsconfig, ESLint e Prettier compartilhados
wordpress/az-bridge Plugin PHP (ponte com o WordPress)
```

Regras de dependência (verificadas por lint):

- `packages/core` **não importa** nada de `adapters`, `db`, `apps`, nem bibliotecas de infraestrutura (fetch, SDKs, ORM). Só `zod` e utilitários puros.
- `apps/*` dependem de `core` + `adapters` e fazem a composição (injeção de dependência) num único `container.ts`.
- Adaptadores implementam interfaces de `core/ports`. Nunca exponha tipos de SDK fora do adaptador.

## Convenções

- TypeScript `strict`, sem `any`. Erros de domínio como `Result<T, E>` (nada de `throw` para fluxo esperado).
- Código e identificadores em **inglês**; textos de interface, mensagens ao usuário e conteúdo editorial em **português**. Glossário em `docs/arquitetura.md`.
- Datas em UTC no banco; exibição em `America/Sao_Paulo`.
- Segredos só via variáveis de ambiente (`.env` nunca commitado; `.env.example` sempre atualizado).
- Testes: `*.test.ts` ao lado do código; fixtures de matérias em `packages/core/test/fixtures/`.

## Regras editoriais que o código deve garantir

Estão em `docs/guia-de-estilo.md` e nos invariantes da spec da Fase 1. Em especial:

- Nenhum caso de uso publica sem `approvedBy` (usuário ou `policy:<id>`), e a política de autonomia é a regra mais testada do sistema (ADR 0004).
- O servidor MCP não contém regra de negócio: valida, checa permissão e chama um caso de uso (ADR 0005).
- Versão com alerta de fidelidade aberto não pode ser aprovada.
- Imagem de terceiros nunca vai para o WordPress automaticamente.
