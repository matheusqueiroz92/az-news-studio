# Plano — Fase 0: Base

- Spec: [spec.md](spec.md) (seção 10 quebrada em tarefas de um commit)
- Status: pronto para o Domain Architect / Implementer, tarefa a tarefa
- Branch sugerida: `fase-0-base`
- Este plano não implementa Fase 1A, 1B nem o servidor MCP. Só impede que a base feche a porta para elas.

Como executar: um chat novo por papel e por tarefa, na ordem numérica. Tarefa de domínio passa por Domain Architect → Test Engineer → Implementer → Reviewer. Tarefa de infra, adaptador, app ou plugin vai direto ao Implementer e depois ao Reviewer. Não começar a tarefa seguinte no mesmo chat.

As recomendações da seção "Decisões em aberto" valem como decisão de trabalho. Se alguma resposta sua for diferente, a tarefa afetada para e o plano é ajustado antes do código.

Teto: cerca de 300 linhas de **código de produção** por tarefa (ajustado em 2026-11-26, revisão da T12). Testes não entram na conta: adaptadores HTTP precisam de muitos cenários, e teste a mais é desejável. Se o código de produção passar do teto, dividir antes do commit, sem puxar escopo da tarefa seguinte.

Fora de todas as tarefas: telas editoriais, S3/MinIO, filas `sources`, `pauta`, `extraction`, `ai`, `social`, `video`, `metrics`, OAuth do MCP, `apps/mcp`, publicação `publish`/`future`.

## Portas que esta fase deixa abertas

- `pnpm-workspace.yaml` usa o glob `apps/*` e `packages/*`, para `apps/mcp` entrar depois sem mudar o workspace.
- `CmsPort` fica com as três operações da seção 6 da spec. Fase 1A acrescenta métodos (atualizar post, mídia, categorias, tags, `publish`/`future`) sem alterar estas assinaturas. O teste de conexão cria rascunho e manda para a lixeira; isso não vira regra do domínio.
- `JobQueuePort` recebe o nome da fila. Nesta fase só existe `cms` / `TestCmsConnection`, com concorrência 1, 3 tentativas e backoff exponencial (arquitetura).
- `audit_log.channel` aceita `web`, `worker` e `mcp` desde a primeira migração. O servidor MCP ainda não existe.
- O webhook valida HMAC, confere o schema e grava o corpo em `audit_log.detail`. A Fase 1A encaixa `HandleCmsPublished` no mesmo ponto da rota, sem reinventar a assinatura.
- Postgres sobe com `CREATE EXTENSION IF NOT EXISTS vector`. Nenhuma coluna `vector` é criada aqui (a Fase 1B usa `vector(384)` em `source_items`).
- Papéis `admin`, `editor`, `sales` nascem agora. Os escopos do MCP (`studio:read` / `write` / `publish` / `admin`) mapeiam estes papéis depois.
- O plugin registra `_yoast_wpseo_metadesc`, `_yoast_wpseo_focuskw`, `_az_studio_article_id` e `_az_studio_source_url`, como a spec pede, mesmo o teste usando só a meta description.

## Vocabulário estável

Fila `cms`. Nome do job `TestCmsConnection`.

Ações gravadas em `audit_log` (não inventar sinônimo noutra tarefa):

| Ação | Quem grava | Channel |
|---|---|---|
| `auth.sign_in` | hook de sessão criada do Better Auth na web | `web` |
| `user.create` | caso de uso `ManageUsers` | `web` |
| `user.change_role` | `ManageUsers` | `web` |
| `user.set_active` | `ManageUsers` | `web` |
| `cms.test_connection.requested` | ação do botão, antes da fila | `web` |
| `cms.test_connection.completed` | caso de uso `TestCmsConnection` | `worker` |
| `webhook.post.published` | caso de uso `RecordWordpressWebhook` | `web` |

O worker não grava uma segunda linha além da que o caso de uso já gravou.

Rascunho de teste (RF-04), sempre em português:

| Campo | Valor |
|---|---|
| title | `[TESTE STUDIO] YYYY-MM-DD` (data de calendário em `America/Sao_Paulo`) |
| excerpt | `Rascunho de teste do AZ News Studio.` |
| contentHtml | `<p>Rascunho criado pelo AZ News Studio para testar a conexão. Pode ir para a lixeira.</p>` |
| slug | `teste-studio-YYYYMMDD-HHmmss` no mesmo fuso |
| metaDescription | `Rascunho automático do AZ News Studio para testar a conexão com o WordPress. Não publicar.` |
| categoryIds | `[]` (o adaptador omite `categories` no JSON para o WordPress aplicar a categoria padrão) |
| tagNames | `[]` |

`trashPost` é `DELETE /wp-json/wp/v2/posts/:id` sem `force=true` (lixeira, não exclusão definitiva).

---

## T01 — Monorepo pnpm, Turborepo e config compartilhada

- Objetivo: ter o repositório instalável, com TypeScript strict, Prettier, Vitest e scripts de raiz, ainda sem regra de negócio.
- Tipo: [infra]
- Depende de: nenhuma
- Arquivos a criar:
  - `package.json`
  - `pnpm-workspace.yaml`
  - `pnpm-lock.yaml` (gerado pelo install)
  - `turbo.json`
  - `.nvmrc`
  - `.npmrc`
  - `packages/config/package.json`
  - `packages/config/tsconfig.base.json`
  - `packages/config/tsconfig.node.json`
  - `packages/config/prettier.config.mjs`
  - `packages/config/vitest.shared.ts`
  - `.env.example`
  - `.prettierignore`
- Testes esperados / verificação:
  - `pnpm install`
  - `pnpm lint` (pode ser no-op honesto se ainda não houver pacote com lint)
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm exec tsc --version` imprime 5.9.x
- Critério de pronto: os quatro comandos terminam com código 0; `pnpm-workspace.yaml` declara `apps/*` e `packages/*`; `.nvmrc` é `24`; `package.json` da raiz tem `"packageManager": "pnpm@10"` com o patch exato da linha 10; `.env.example` contém todas as variáveis da spec mais `SEED_ADMIN_EMAIL=`; nenhum pacote de app ou de domínio é criado nesta tarefa; versões pinadas sem `^`, conforme a tabela de versões.
- Requisitos: critério de aceitação do CI (os scripts que o CI vai chamar existem); NFR de TypeScript strict e de segredos via ambiente.
- Commit sugerido: `chore: inicia o monorepo da fase 0`

Notas para o implementer: Node 24 (`engines": ">=24 <25"`), conforme ADR 0002 atualizado em 2026-11-24. Prettier e o tsconfig base com `strict`, `noUncheckedIndexedAccess` e `verbatimModuleSyntax` se não atrapalhar o Next. Scripts da raiz delegam ao Turbo: `lint`, `typecheck`, `test`. Não criar `apps/mcp`.

## T02 — ESLint com fronteiras da arquitetura hexagonal

- Objetivo: fazer o lint falhar quando `packages/core` importar adaptador, banco, app ou biblioteca de infraestrutura.
- Tipo: [infra]
- Depende de: T01
- Arquivos a criar/alterar:
  - `packages/config/eslint.config.mjs`
  - `packages/config/vitest.config.ts`
  - `packages/config/test/boundaries.test.ts`
  - `packages/config/package.json` (dependências de lint e o script `test`)
- Testes esperados (o teste chama a API do ESLint em memória, com `filePath` fictício):
  - deve falhar quando `packages/core` importa `@az-news/adapters`
  - deve falhar quando `packages/core` importa `@az-news/db`
  - deve falhar quando `packages/core` importa `drizzle-orm`, `bullmq`, `next`, `better-auth` ou `pino`
  - deve falhar quando `packages/core` importa um built-in `node:*`
  - deve aceitar quando `packages/core` importa `@az-news/contracts` e `zod`
  - deve falhar quando `packages/contracts` importa `@az-news/core`
  - deve aceitar quando `packages/adapters` importa `@az-news/core`
  - deve falhar quando `packages/adapters` importa `apps/web`
- Critério de pronto: `pnpm test` cobre os casos acima; a regra proíbe o global `fetch` dentro de `packages/core`; elementos previstos: `core`, `contracts`, `db`, `adapters`, `web`, `worker`.
- Requisitos: critério de aceitação "Lint de fronteiras falha se `packages/core` importar algo de `adapters`"; NFR do `eslint-plugin-boundaries`.
- Commit sugerido: `chore(config): impõe as fronteiras entre pacotes`

Regra de dependência que o lint precisa expressar: `core` → `contracts` e `zod`; `contracts` → só `zod`; `db` não importa `core` nem `adapters`; `adapters` → `core`, `contracts`, `db`; `apps/*` → `core`, `adapters`, `db`, `contracts`.

## T03 — Result, papéis, relógio e portas da Fase 0

- Objetivo: fixar os tipos puros que os casos de uso e os adaptadores vão implementar, sem I/O.
- Tipo: [domínio]
- Depende de: T02
- Arquivos a criar:
  - `packages/core/package.json`
  - `packages/core/tsconfig.json`
  - `packages/core/eslint.config.mjs`
  - `packages/core/vitest.config.ts`
  - `packages/core/src/index.ts`
  - `packages/core/src/shared/result.ts`
  - `packages/core/src/shared/result.test.ts`
  - `packages/core/src/domain/role.ts`
  - `packages/core/src/ports/clock-port.ts`
  - `packages/core/src/ports/cms-port.ts`
  - `packages/core/src/ports/cms-error.ts`
  - `packages/core/src/ports/cms-error.test.ts`
  - `packages/core/src/ports/job-queue-port.ts`
  - `packages/core/src/ports/audit-log-port.ts`
  - `packages/core/src/ports/user-repository.ts`
- Testes esperados:
  - deve distinguir ok e erro sem lançar exceção
  - deve preservar o código de erro ao mapear um Result com falha
  - deve expor os códigos `unreachable`, `unauthenticated`, `draft_failed`, `trash_failed` e `invalid_response`
  - deve aceitar somente os papéis `admin`, `editor` e `sales`
- Critério de pronto: `pnpm test` passa; cobertura de linhas de `packages/core` configurada em 90; `CmsPort` é exatamente a interface da seção 6 da spec; `core` não importa adaptador, banco nem SDK.
- Requisitos: base de RF-02 (papéis), RF-03 e RF-04 (porta do CMS), RF-06 (porta de auditoria). NFR de cobertura.
- Commit sugerido: `feat(core): adiciona Result e as portas da fase 0`

Contratos que o Domain Architect deve seguir (sem acrescentar método):

`ClockPort`: `now(): Date` (instante UTC).

`JobQueuePort.enqueue`: fila, nome do job, payload (`readonly` record JSON) e `jobId` opcional. Devolve `Result` com `jobId`. Erro com código `enqueue_failed`.

`AuditLogPort.record`: `actorId` (string ou null), `action`, `channel` (`web` | `worker` | `mcp`), `result` (`success` | `failure`), `target` (string ou null), `detail` (record ou null), `occurredAt` (Date). Só acrescenta; não há update nem delete. Erro com código `write_failed`.

`UserRepository`: `findByEmail`, `findById`, `list`, `insert`, `updateRole`, `setActive`, `countActiveAdmins`. E-mail comparado em minúsculas. Usuário: `id`, `email`, `name` ou null, `role`, `active`.

`CmsConnectionStatus` permanece o da spec. `checkConnection` devolve **Ok** com `reachable`/`authenticated` quando o WordPress responde HTTP (inclusive 401). Devolve **Err** `unreachable` quando não há resposta (DNS, timeout, conexão recusada) e **Err** `invalid_response` quando o corpo não tem o formato esperado.

## T04 — Caso de uso TestCmsConnection

- Objetivo: criar o rascunho de teste e enviá-lo à lixeira quando o WordPress está alcançável e autenticado, gravando o resultado no audit log.
- Tipo: [domínio]
- Depende de: T03
- Arquivos a criar:
  - `packages/core/src/application/studio-date.ts`
  - `packages/core/src/application/studio-date.test.ts`
  - `packages/core/src/application/test-cms-connection.ts`
  - `packages/core/src/application/test-cms-connection.test.ts`
  - `packages/core/test/fakes/fake-cms-port.ts`
  - `packages/core/test/fakes/fake-audit-log.ts`
  - `packages/core/test/fakes/fake-clock.ts`
  - `packages/core/src/index.ts` (exportar o caso de uso)
- Testes esperados:
  - deve formatar `2026-11-24T02:00:00.000Z` como `2026-11-23` em `America/Sao_Paulo`
  - deve criar o rascunho com o título, a meta description e o slug da tabela acima e jogá-lo na lixeira quando a conexão está autenticada
  - deve pedir a hora ao `ClockPort`
  - deve gravar `cms.test_connection.completed` com sucesso, channel `worker`, o ator e o id do post
  - deve não criar rascunho quando o WordPress não está alcançável
  - deve não criar rascunho quando a autenticação falha
  - deve gravar falha no audit log quando a conexão falha
  - deve devolver `trash_failed` com o id do post quando a criação funciona e a lixeira falha
  - deve gravar falha no audit log quando a lixeira falha
  - deve devolver `draft_failed` e não chamar a lixeira quando a criação falha
- Critério de pronto: os testes passam com fakes; nenhuma chamada a `fetch`, Redis ou Postgres; cobertura de linhas do `core` continua ≥ 90.
- Requisitos: RF-04 (regra), RF-06 (job externo).
- Commit sugerido: `feat(core): testa a conexão criando e descartando um rascunho`

Entrada: `{ requestedBy: string }`. Saída de sucesso: `{ postId: string, trashed: true }`. O id numérico do WordPress viaja como string na borda do domínio (`CmsPostId`), para a Fase 1A não ficar presa a `number` se o adaptador mudar. O adaptador converte. Se o Domain Architect achar que a spec exige `number` porque `categoryIds` é `number[]`, manter `number` em `CmsPostId` e registrar no review. Recomendação: `CmsPostId` como string opaca.

## T05 — Caso de uso ManageUsers

- Objetivo: permitir que um admin cadastre e-mail, altere papel e desative usuário, que é o que torna o link mágico restrito a quem já existe.
- Tipo: [domínio]
- Depende de: T03
- Arquivos a criar:
  - `packages/core/src/application/manage-users.ts`
  - `packages/core/src/application/manage-users.test.ts`
  - `packages/core/test/fakes/fake-user-repository.ts`
  - `packages/core/src/index.ts`
- Testes esperados:
  - deve criar o usuário com e-mail em minúsculas e o papel pedido quando o autor é admin
  - deve recusar e-mail inválido
  - deve recusar e-mail já cadastrado
  - deve recusar papel fora de admin, editor e sales
  - deve recusar quando o autor não é admin
  - deve trocar o papel
  - deve recusar rebaixar ou desativar o último admin ativo
  - deve desativar e reativar um usuário
  - deve listar e-mail, papel e situação, sem segredo
  - deve gravar `user.create`, `user.change_role` e `user.set_active` no audit log
  - deve não gravar audit log quando a operação é recusada
- Critério de pronto: testes passam com fakes; usuário inativo continua no banco; não há exclusão física.
- Requisitos: RF-01 (só entra quem foi cadastrado), RF-02, RF-06.
- Commit sugerido: `feat(core): permite ao admin gerenciar usuários`

Entrada sempre carrega o autor `{ userId, role }`. Desativar é a lacuna P3: entra nesta tarefa porque a recomendação da decisão D7 está adotada.

## T06 — Schema Zod do evento post.published

- Objetivo: ter o contrato único do webhook do AZ Bridge, reutilizável pela rota e, depois, pela Fase 1A.
- Tipo: [domínio]
- Depende de: T02
- Arquivos a criar:
  - `packages/contracts/package.json`
  - `packages/contracts/tsconfig.json`
  - `packages/contracts/eslint.config.mjs`
  - `packages/contracts/vitest.config.ts`
  - `packages/contracts/src/index.ts`
  - `packages/contracts/src/wordpress-webhook-event.ts`
  - `packages/contracts/src/wordpress-webhook-event.test.ts`
- Testes esperados:
  - deve aceitar `post.published` com postId inteiro positivo, url, title e publishedAt em ISO-8601
  - deve aceitar publishedAt com `Z` e com offset
  - deve recusar event diferente de `post.published`
  - deve recusar postId zero, negativo ou fracionário
  - deve recusar url que não seja URL absoluta
  - deve recusar title vazio
  - deve recusar publishedAt que não seja data
  - deve ignorar campo desconhecido (o plugin pode crescer sem quebrar a Fase 0)
- Critério de pronto: pacote `@az-news/contracts` exporta o schema e o tipo inferido; dependência externa única é `zod`; `pnpm test` passa.
- Requisitos: RF-05 (contrato do corpo).
- Commit sugerido: `feat(contracts): valida o evento post.published do WordPress`

Nome exportado: `wordpressWebhookEventSchema` / tipo `WordPressWebhookEvent`.

## T07 — Caso de uso RecordWordpressWebhook

- Objetivo: gravar no audit log um `post.published` já validado, sem conhecer HTTP nem HMAC.
- Tipo: [domínio]
- Depende de: T03, T06
- Arquivos a criar:
  - `packages/core/src/application/record-wordpress-webhook.ts`
  - `packages/core/src/application/record-wordpress-webhook.test.ts`
  - `packages/core/src/index.ts`
- Testes esperados:
  - deve gravar `webhook.post.published` com channel `web`, ator nulo, target igual ao postId e o evento inteiro em `detail`
  - deve devolver falha e não engolir o erro quando o audit log falha
- Critério de pronto: o caso de uso recebe o tipo já parseado de `@az-news/contracts`; não calcula HMAC; cobertura do core ≥ 90.
- Requisitos: RF-05 (persistência), RF-06.
- Commit sugerido: `feat(core): registra no audit log o post publicado no WordPress`

A Fase 1A não substitui este caso de uso: a rota passará a chamá-lo e, em seguida, `HandleCmsPublished`.

## T08 — Schema Drizzle, audit log e extensão pgvector

- Objetivo: versionar a primeira migração com as tabelas do Better Auth, o papel e a situação do usuário e o audit log, e ligar o pgvector.
- Tipo: [infra]
- Depende de: T02
- Arquivos a criar:
  - `packages/db/package.json`
  - `packages/db/tsconfig.json`
  - `packages/db/eslint.config.mjs`
  - `packages/db/drizzle.config.ts`
  - `packages/db/src/schema/auth.ts`
  - `packages/db/src/schema/audit-log.ts`
  - `packages/db/src/schema/index.ts`
  - `packages/db/src/schema/schema.test.ts`
  - `packages/db/drizzle/` (SQL gerado + `CREATE EXTENSION IF NOT EXISTS vector`)
- Testes esperados:
  - deve declarar `users`, `sessions`, `accounts` e `verifications` com as colunas que o adaptador Drizzle do Better Auth espera (`usePlural: true`)
  - deve exigir `users.role` e `users.active`
  - deve guardar `audit_log.occurred_at` como timestamptz e `channel` restrito a `web`, `worker` e `mcp`
  - deve incluir `CREATE EXTENSION IF NOT EXISTS vector` na migração
  - deve não criar tabela `articles`, `source_items` nem coluna `vector`
- Critério de pronto: `pnpm test` passa sem Postgres no ar; a migração é arquivo SQL commitado, não um push solto; o schema de autenticação é gerado pela CLI do Better Auth para Drizzle (com `usePlural: true` e os campos adicionais `role` e `active` declarados na configuração) e revisado antes do commit; não usar o plugin `admin` do Better Auth (ADR 0006).
- Requisitos: RF-02, RF-05, RF-06; NFR da extensão pgvector (seção 2 e Fase 1B).
- Commit sugerido: `feat(db): cria o schema inicial com audit log e pgvector`

Colunas de `audit_log`: `id` (uuid), `occurred_at`, `actor_id` (texto, sem obrigar FK, para webhook sem usuário), `action`, `channel`, `result`, `target`, `detail` (jsonb). Tabela só de append.

`users.role`: texto `not null` default `editor`. `users.active`: boolean `not null` default `true`. O default de papel só existe para nenhum insert interno do Better Auth furar a constraint (a criação automática de usuário fica desligada); o caso de uso sempre grava o papel escolhido. A configuração do Better Auth usada pela CLI mora em `packages/db/src/auth-schema.config.ts`, para o `packages/db` não depender do `apps/web`. E-mail único, guardado em minúsculas pela aplicação.

## T09 — Postgres, Redis e Mailpit no compose de desenvolvimento

- Objetivo: subir o banco com pgvector, o Redis e o Mailpit, aplicar a migração e semear o primeiro admin.
- Tipo: [infra]
- Depende de: T08
- Arquivos a criar/alterar:
  - `infra/docker-compose.dev.yml`
  - `packages/db/src/client.ts`
  - `packages/db/src/migrate.ts`
  - `packages/db/src/seed-admin.ts`
  - `packages/db/src/seed-admin.test.ts`
  - `package.json` (scripts `db:migrate` e `db:seed`)
- Testes esperados:
  - deve não inserir admin quando `SEED_ADMIN_EMAIL` está vazio
  - deve inserir um admin ativo com o e-mail em minúsculas quando a tabela está vazia
  - deve não duplicar o admin numa segunda execução
  - deve recusar semear se já existir outro usuário e o e-mail do seed ainda não existir (não cria um segundo admin escondido)
- Verificação (com Docker):
  - `docker compose -f infra/docker-compose.dev.yml up -d`
  - `pnpm db:migrate`
  - `pnpm db:seed`
  - `docker compose -f infra/docker-compose.dev.yml exec postgres psql -U studio -d studio -c "SELECT extname FROM pg_extension WHERE extname = 'vector'"`
- Critério de pronto: a extensão `vector` aparece; existe uma linha em `users` com o e-mail do seed e papel `admin`; Redis e Mailpit respondem; imagens pinadas (`pgvector/pgvector:pg16`, `redis:7.4.12-alpine`, tag semver do Mailpit escolhida nesta tarefa); portas só em localhost (5432, 6379, 1025, 8025).
- Requisitos: NFR de Postgres com pgvector; prepara RF-01.
- Commit sugerido: `feat(infra): sobe Postgres, Redis e Mailpit para desenvolvimento`

Banco e usuário do compose de dev: `studio` / senha só no `.env`, nunca no arquivo commitado. `DATABASE_URL` aponta para `localhost` porque web e worker rodam no host. O WordPress entra na T17, não aqui.

## T10 — Verificação HMAC do webhook

- Objetivo: aceitar só o corpo cru assinado com o segredo compartilhado, no formato do plugin.
- Tipo: [adaptador]
- Depende de: T02
- Arquivos a criar:
  - `packages/adapters/package.json`
  - `packages/adapters/tsconfig.json`
  - `packages/adapters/eslint.config.mjs`
  - `packages/adapters/vitest.config.ts`
  - `packages/adapters/src/index.ts`
  - `packages/adapters/src/webhooks/wordpress-signature.ts`
  - `packages/adapters/src/webhooks/wordpress-signature.test.ts`
- Testes esperados:
  - deve aceitar o cabeçalho `sha256=` com o HMAC-SHA256 hexadecimal do corpo exato
  - deve recusar cabeçalho ausente
  - deve recusar prefixo diferente de `sha256=`
  - deve recusar segredo errado
  - deve recusar quando um byte do corpo muda
  - deve recusar assinatura com tamanho diferente
- Critério de pronto: comparação com `timingSafeEqual`; a função recebe o corpo em bytes ou string já lida, sem reserializar JSON; teste com vetor fixo (corpo, segredo e hex conhecidos).
- Requisitos: RF-05 (assinatura).
- Commit sugerido: `feat(adapters): valida a assinatura HMAC do webhook`

## T11 — Repositórios Postgres de usuário e de audit log

- Objetivo: persistir os dois contratos do domínio no banco da T08.
- Tipo: [adaptador]
- Depende de: T03, T05, T08
- Arquivos a criar:
  - `packages/adapters/src/persistence/postgres-user-repository.ts`
  - `packages/adapters/src/persistence/postgres-user-repository.test.ts`
  - `packages/adapters/src/persistence/postgres-audit-log.ts`
  - `packages/adapters/src/persistence/postgres-audit-log.test.ts`
  - `packages/adapters/src/index.ts`
- Testes esperados (PGlite, entram no `pnpm test`, sem Docker):
  - deve inserir e achar o usuário pelo e-mail em qualquer caixa
  - deve gravar name como '' quando NewUser.name é null e devolver null ao ler (users.name é NOT NULL no schema do Better Auth; o domínio aceita null)
  - deve persistir papel e active
  - deve contar admins ativos
  - deve inserir audit log com `occurred_at` em UTC
  - deve aceitar channel `mcp`
  - deve devolver `write_failed` quando a tabela rejeita o channel
- Critério de pronto: os testes sobem o schema via Drizzle no PGlite (sem precisar da extensão vector); `core` continua sem importar este pacote; os repositórios recebem a instância do Drizzle por injeção, tipada de forma genérica para Postgres (`PgDatabase`), para o mesmo código rodar com PGlite nos testes e com `node-postgres` em produção.
- Requisitos: RF-02, RF-06.
- Commit sugerido: `feat(adapters): persiste usuários e audit log no Postgres`

## T12 — WordPressRestCms: checar conexão

- Objetivo: ler se o WordPress responde, se o usuário `studio` autentica e qual a versão do AZ Bridge.
- Tipo: [adaptador]
- Depende de: T03
- Arquivos a criar:
  - `packages/adapters/src/cms/wordpress-rest-cms.ts`
  - `packages/adapters/src/cms/wordpress-rest-cms.test.ts`
  - `packages/adapters/src/index.ts`
- Testes esperados (msw, sem rede):
  - deve marcar alcançável e ler o nome do site quando `GET /wp-json` responde
  - deve marcar autenticado quando `GET /wp-json/wp/v2/users/me` responde 200
  - deve marcar não autenticado quando o WordPress responde 401, sem transformar isso em exceção
  - deve ler `version` em `GET /wp-json/az-bridge/v1/health`
  - deve devolver `bridgeVersion` nula quando o health responde 404
  - deve falhar com `unreachable` quando não há resposta
  - deve falhar com `invalid_response` quando o JSON não tem o formato esperado
  - deve enviar Authorization Basic do usuário `studio`
  - deve tratar senha de aplicação com espaços como a mesma senha sem espaços
  - deve tentar no máximo 3 vezes com backoff quando a rede falha, e uma vez só quando recebe HTTP
- Critério de pronto: nenhum tipo do SDK vaza no `index` do pacote (a classe implementa `CmsPort`); credenciais vêm de argumento do construtor, não de `process.env` lido dentro da classe.
- Requisitos: RF-03.
- Commit sugerido: `feat(adapters): consulta o estado da conexão com o WordPress`

## T13 — WordPressRestCms: criar rascunho e mandar para a lixeira

- Objetivo: completar a porta do CMS para o teste de conexão gravar a meta description do Yoast.
- Tipo: [adaptador]
- Depende de: T12
- Arquivos a alterar/criar:
  - `packages/adapters/src/cms/wordpress-rest-cms.ts`
  - `packages/adapters/src/cms/wordpress-rest-cms.test.ts`
  - `packages/adapters/src/cms/wordpress-rest-cms.integration.test.ts`
  - `package.json` (script `test:integration`, fora do `pnpm test`)
- Testes esperados (msw):
  - deve criar post com `status: draft` e `meta._yoast_wpseo_metadesc` igual à meta description
  - deve enviar título, resumo, conteúdo e slug
  - deve omitir `categories` quando a lista vem vazia
  - deve devolver `draft_failed` quando o WordPress responde 4xx ou 5xx, sem repetir o POST
  - deve repetir o POST só quando a conexão cai antes de qualquer resposta HTTP
  - deve chamar `DELETE /wp-json/wp/v2/posts/:id` sem `force=true`
  - deve repetir o DELETE em falha de rede, no máximo 3 vezes
  - deve devolver `trash_failed` quando o DELETE responde erro HTTP
- Verificação opcional: `pnpm test:integration` com `WP_BASE_URL` de homologação, documentado no script, não roda no CI.
- Critério de pronto: a suíte padrão não abre socket; o meta do Yoast não aparece em tipo exportado para fora do adaptador.
- Requisitos: RF-04.
- Commit sugerido: `feat(adapters): cria e envia à lixeira o rascunho de teste no WordPress`

## T14 — Fila BullMQ

- Objetivo: enfileirar `TestCmsConnection` na fila `cms` com a política de retry da arquitetura.
- Tipo: [adaptador]
- Depende de: T03
- Arquivos a criar:
  - `packages/adapters/src/queue/job-options.ts`
  - `packages/adapters/src/queue/job-options.test.ts`
  - `packages/adapters/src/queue/bullmq-queue.ts`
  - `packages/adapters/src/queue/bullmq-queue.test.ts`
  - `packages/adapters/src/index.ts`
- Testes esperados:
  - deve fixar a fila `cms` com concorrência 1
  - deve fixar 3 tentativas e backoff exponencial a partir de 1 segundo
  - deve publicar o job `TestCmsConnection` com o payload recebido
  - deve devolver `enqueue_failed` quando o Redis recusa a publicação (cliente injetado que falha, sem Redis real)
- Critério de pronto: `pnpm test` passa sem Redis; tipos de `bullmq` não são exportados no `index`.
- Requisitos: RF-04 (enfileirar); NFR de retry da arquitetura.
- Commit sugerido: `feat(adapters): enfileira jobs na fila cms com BullMQ`

Consumir a fila é tarefa do worker (T17). Aqui a porta de saída só publica.

**Decisão (2026-11-25, revisão da T04):** o job `TestCmsConnection` é publicado com **`attempts: 1`**, exceção à política de 3 tentativas da fila. Ele é disparado manualmente pelo botão; repetir o job inteiro criaria rascunhos extras (inclusive órfãos fora da lixeira, no caso de `trash_failed`). Falhas de rede transitórias já são repetidas dentro do adaptador (T12/T13). A exceção mora em `packages/adapters/src/queue/job-options.ts` (opções por nome de job), sem alterar a `JobQueuePort` do core; teste esperado na T14: "deve publicar `TestCmsConnection` com uma única tentativa". Um helper `createCmsWorker` pode morar neste arquivo se couber no teto de linhas; se não couber, o worker instancia `Worker` do BullMQ no próprio `container.ts` e este pacote só exporta as opções e o `enqueue`.

## T15 — Plugin AZ Bridge v1

- Objetivo: expor o health, os metas do Yoast e do Studio, e disparar o webhook assinado quando um post vai ao ar.
- Tipo: [plugin-php]
- Depende de: nenhuma (pode andar em paralelo desde o dia 1)
- Arquivos a criar:
  - `wordpress/az-bridge/az-bridge.php`
  - `wordpress/az-bridge/readme.txt`
- Verificação:
  - `php -l wordpress/az-bridge/az-bridge.php` (se o PHP estiver instalado; senão, o Reviewer confere a sintaxe e a T17 executa o plugin de verdade)
  - leitura: versão do plugin `1.0.0`; PHP exige `>= 8.1`; cabeçalho do plugin declara WordPress `>= 6.4`
- Critério de pronto: um único arquivo PHP de runtime, dentro do teto de linhas; sem tela de configuração; sem `echo` no front; metas com `auth_callback` de `edit_posts`; health público `GET /wp-json/az-bridge/v1/health` devolve `{ "version": "1.0.0" }`; webhook só em `transition_post_status` para `publish`, `post_type === post`, com corpo `{ event, postId, url, title, publishedAt }` e cabeçalho `X-AZ-Signature: sha256=<hmac do corpo exato>`; `publishedAt` em UTC (`gmdate`); constantes `AZ_STUDIO_WEBHOOK_URL` e `AZ_STUDIO_WEBHOOK_SECRET`; se a constante não existir, não envia e não quebra o publish; erro de HTTP é ignorado.
- Requisitos: RF-04 (meta description visível no Yoast depende destes metas), RF-05 (emissão do evento).
- Commit sugerido: `feat(az-bridge): publica health, metas e o webhook de post publicado`

`blocking => false`, como a spec pede. Ver problema P8 se o ensaio dos 10 segundos perder o evento.

## T16 — WordPress local no compose, com o plugin e o Yoast

- Objetivo: o `docker compose` de dev passar a incluir um WordPress com AZ Bridge e Yoast, e um usuário `studio` com Application Password.
- Tipo: [infra]
- Depende de: T09, T15
- Arquivos a criar/alterar:
  - `infra/docker-compose.dev.yml`
  - `infra/wordpress/bootstrap.sh`
- Verificação:
  - `docker compose -f infra/docker-compose.dev.yml up -d`
  - `docker compose -f infra/docker-compose.dev.yml run --rm wpcli bash /scripts/bootstrap.sh` (o script é montado no serviço `wpcli` e roda dentro do container, não no PowerShell)
  - `curl http://localhost:8080/wp-json/az-bridge/v1/health` devolve `version` `1.0.0`
  - o bootstrap lista o plugin `az-bridge` ativo, o `wordpress-seo` ativo e o usuário `studio` com papel editor
  - a senha de aplicação sai no stdout para copiar em `WP_APP_PASSWORD` no `.env` local (o script não escreve `.env`)
- Critério de pronto: imagens pinadas (`wordpress:7.1.5-php8.3-apache`, MariaDB 11.8 com patch confirmado nesta tarefa, `wordpress:cli` da mesma linha 7.1); volume do plugin montado em `wp-content/plugins/az-bridge`; `WORDPRESS_CONFIG_EXTRA` define as duas constantes; URL do webhook local é `http://host.docker.internal:3000/api/webhooks/wordpress` e o serviço tem `extra_hosts: host.docker.internal:host-gateway`; nada aponta para `aznews.com.br`.
- Requisitos: critério "`pnpm dev` sobe WordPress local" (a parte Docker); prepara o critério do Yoast.
- Commit sugerido: `feat(infra): adiciona o WordPress local com o AZ Bridge`

## T17 — Worker da fila cms, com heartbeat

- Objetivo: consumir `TestCmsConnection`, chamar o caso de uso e renovar o heartbeat no Redis.
- Tipo: [app]
- Depende de: T04, T09, T11, T13, T14
- Arquivos a criar:
  - `apps/worker/package.json`
  - `apps/worker/tsconfig.json`
  - `apps/worker/eslint.config.mjs`
  - `apps/worker/vitest.config.ts`
  - `apps/worker/src/index.ts`
  - `apps/worker/src/container.ts`
  - `apps/worker/src/logger.ts`
  - `apps/worker/src/heartbeat.ts`
  - `apps/worker/src/heartbeat.test.ts`
  - `apps/worker/src/jobs/test-cms-connection-job.ts`
  - `apps/worker/src/jobs/test-cms-connection-job.test.ts`
- Testes esperados:
  - deve chamar `TestCmsConnection` uma vez com o `requestedBy` do payload
  - deve concluir o job quando o caso de uso devolve ok
  - deve falhar o job quando o caso de uso devolve erro (o job foi publicado com `attempts: 1`, então não há nova tentativa automática; ver nota da T14)
  - deve escrever a chave `worker:heartbeat` com TTL de 30 segundos
  - deve renovar a chave a cada 10 segundos enquanto o processo está de pé
  - deve emitir log JSON sem a senha do WordPress nem o segredo do webhook
- Critério de pronto: composição só em `container.ts`; `pnpm --filter @az-news/worker test` passa sem Redis; com o compose no ar, subir o worker cria a chave no Redis.
- Requisitos: RF-04 (execução do job), RF-06 (via caso de uso), NFR de heartbeat e de log JSON.
- Commit sugerido: `feat(worker): processa o teste de conexão e publica o heartbeat`

Dev: `tsx`. A imagem de produção empacota com tsup na T25.

## T18 — Esqueleto do web, health e log

- Objetivo: ter o Next.js no ar com healthcheck e log JSON, ainda sem login.
- Tipo: [app]
- Depende de: T02
- Arquivos a criar:
  - `apps/web/package.json`
  - `apps/web/tsconfig.json`
  - `apps/web/eslint.config.mjs`
  - `apps/web/next.config.ts`
  - `apps/web/vitest.config.ts`
  - `apps/web/src/app/layout.tsx`
  - `apps/web/src/app/page.tsx`
  - `apps/web/src/app/api/health/route.ts`
  - `apps/web/src/app/api/health/route.test.ts`
  - `apps/web/src/server/logger.ts`
  - `apps/web/src/server/container.ts`
- Testes esperados:
  - deve responder 200 com `{ "status": "ok" }` em `GET /api/health`
  - deve não incluir variável de ambiente no corpo do health
- Critério de pronto: `next.config.ts` lista `transpilePackages` dos pacotes `@az-news/*`; página inicial em português, sem navegação editorial; `pnpm --filter @az-news/web test` passa.
- Requisitos: NFR do healthcheck da web e de log JSON.
- Commit sugerido: `feat(web): adiciona o esqueleto do painel e o healthcheck`

## T19 — Login por link mágico

- Objetivo: autenticar só e-mail já cadastrado e ativo, com sessão no banco e papel disponível na sessão.
- Tipo: [app]
- Depende de: T05, T09, T11, T18
- Arquivos a criar/alterar:
  - `apps/web/src/server/auth.ts`
  - `apps/web/src/server/auth-policy.ts`
  - `apps/web/src/server/auth-policy.test.ts`
  - `apps/web/src/server/mailer.ts`
  - `apps/web/src/app/api/auth/[...all]/route.ts`
  - `apps/web/src/lib/auth-client.ts`
  - `apps/web/src/app/login/page.tsx`
  - `apps/web/src/app/login/actions.ts`
  - `apps/web/src/server/container.ts`
  - `.env.example` (comentário do formato de `EMAIL_SERVER` se ainda não estiver claro)
- Testes esperados:
  - deve autorizar o envio do link quando o e-mail existe e está ativo
  - deve autorizar quando a caixa do e-mail difere da cadastrada
  - deve recusar e-mail que não está cadastrado
  - deve recusar usuário inativo
  - deve montar a linha `auth.sign_in` com o id do usuário e channel `web` quando a sessão é criada
- Critério de pronto: Better Auth com adaptador Drizzle (`usePlural: true`), sessões no banco e plugin de link mágico com a criação automática de usuário **desligada**; a função `sendMagicLink` chama a política testada **antes** de enviar (e-mail desconhecido ou inativo não recebe link) e envia via Nodemailer (`EMAIL_SERVER`, `EMAIL_FROM`); `role` e `active` disponíveis no helper de sessão do servidor, **lidos do banco a cada requisição** (ver decisão abaixo), nunca guardados no cookie; rota `[...all]` com o handler do Better Auth para Next.js; página de login em português diz quando o e-mail não pode entrar; Mailpit (`smtp://localhost:1025`) recebe o link com a web rodando no host; variáveis `BETTER_AUTH_SECRET` e `BETTER_AUTH_URL`.
- Requisitos: RF-01; critério "login por link mágico funciona para e-mail cadastrado e é recusado para não cadastrado"; RF-06 (`auth.sign_in`).
- Commit sugerido: `feat(web): entra com link mágico só para e-mail cadastrado`

**Decisão (2026-11-25, revisão da T05):** `role` e `active` do usuário logado são lidos do banco **a cada requisição autenticada** (no helper que obtém a sessão no servidor), nunca de um valor guardado no cookie ou em cache da sessão. Usuário desativado perde o acesso na requisição seguinte; admin rebaixado perde as páginas de admin na hora. Teste esperado: "deve negar acesso quando o usuário da sessão foi desativado depois do login".

Verificação manual desta tarefa: seed aplicado, pedir link do admin, abrir o Mailpit em `http://localhost:8025`, entrar, pedir link de um e-mail desconhecido e ver a recusa.

## T20 — Tela Usuários

- Objetivo: o admin cadastra, troca papel e desativa usuários pela interface.
- Tipo: [app]
- Depende de: T05, T11, T19
- Arquivos a criar:
  - `apps/web/src/app/usuarios/page.tsx`
  - `apps/web/src/app/usuarios/actions.ts`
  - `apps/web/src/app/usuarios/actions.test.ts`
  - `apps/web/src/server/container.ts` (ligar `ManageUsers`)
- Testes esperados:
  - deve recusar a ação quando a sessão não é admin
  - deve chamar `createUser` com o autor da sessão
  - deve chamar `changeUserRole` e `setUserActive`
  - deve mostrar o erro de domínio em português quando o caso de uso recusa (último admin, e-mail duplicado)
- Critério de pronto: editor e sales autenticados não usam a rota (redirecionam para a home); a página lista e-mail, papel e situação; textos em português; o autor passado ao `ManageUsers` vem do helper da T19 (papel lido do banco na requisição), nunca de campo do formulário.
- Requisitos: RF-02, RF-06.
- Commit sugerido: `feat(web): permite ao admin gerenciar usuários`

## T21 — Página Conexões

- Objetivo: mostrar o estado do WordPress e enfileirar o teste de conexão.
- Tipo: [app]
- Depende de: T04, T12, T14, T19
- Arquivos a criar/alterar:
  - `apps/web/src/app/conexoes/page.tsx`
  - `apps/web/src/app/conexoes/actions.ts`
  - `apps/web/src/app/conexoes/actions.test.ts`
  - `apps/web/src/server/container.ts`
- Testes esperados:
  - deve recusar a ação quando a sessão não é admin
  - deve expor alcançável, autenticado, versão do bridge e nome do site a partir de `checkConnection`
  - deve enfileirar `TestCmsConnection` na fila `cms` com o id do usuário
  - deve gravar `cms.test_connection.requested` antes de confirmar o enfileiramento
  - deve gravar falha dessa ação quando a fila recusa, sem dizer que o teste foi executado
- Critério de pronto: a página não chama `createDraft` no processo do Next (quem cria o rascunho é o worker); mensagens em português; editor e sales não abrem a rota.
- Requisitos: RF-03, RF-04, RF-06.
- Commit sugerido: `feat(web): mostra a conexão com o WordPress e enfileira o teste`

Verificação manual contra o WordPress local da T16: o botão cria um rascunho `[TESTE STUDIO]` com a meta description preenchida no Yoast e o post segue para a lixeira. A mesma verificação na homologação fica na T26.

## T22 — Endpoint do webhook

- Objetivo: receber `POST /api/webhooks/wordpress`, exigir a assinatura e gravar o evento.
- Tipo: [app]
- Depende de: T07, T10, T11, T18
- Arquivos a criar:
  - `apps/web/src/app/api/webhooks/wordpress/route.ts`
  - `apps/web/src/app/api/webhooks/wordpress/handle-wordpress-webhook.ts`
  - `apps/web/src/app/api/webhooks/wordpress/handle-wordpress-webhook.test.ts`
- Testes esperados:
  - deve responder 401 e não gravar quando a assinatura é inválida
  - deve responder 401 quando o cabeçalho não vem
  - deve responder 400 quando a assinatura é válida e o JSON não bate com o schema
  - deve responder 204 e gravar o audit log quando assinatura e corpo são válidos
  - deve assinar o corpo cru, sem `JSON.parse` seguido de novo stringify
- Critério de pronto: a função `handleWordpressWebhook` é o único lugar que a Fase 1A precisa estender; segredo lido de `WP_WEBHOOK_SECRET`; rota sem sessão de usuário.
- Requisitos: RF-05, RF-06; critério do 401.
- Commit sugerido: `feat(web): recebe o webhook assinado do WordPress`

## T23 — Um comando pnpm dev

- Objetivo: subir dependências Docker, web e worker com um comando só.
- Tipo: [infra]
- Depende de: T16, T17, T19, T21, T22
- Arquivos a alterar:
  - `package.json`
  - `turbo.json` (`dev` persistente em web e worker)
  - `apps/web/package.json`
  - `apps/worker/package.json`
- Verificação:
  - `pnpm dev`
  - `curl http://localhost:3000/api/health` → 200
  - `curl http://localhost:8025` (Mailpit) responde
  - `curl http://localhost:8080/wp-json/az-bridge/v1/health` → versão `1.0.0`
  - a chave `worker:heartbeat` existe no Redis
  - o script usa `docker compose` e Turbo, e funciona no PowerShell (sem bashismo na raiz)
- Critério de pronto: interromper o comando não derruba os containers (eles ficam de pé de propósito); um segundo `pnpm dev` não quebra o compose já ativo.
- Requisitos: critério "`pnpm dev` sobe web, worker, Postgres, Redis, Mailpit e WordPress local com um comando".
- Commit sugerido: `chore: sobe o ambiente de desenvolvimento com pnpm dev`

## T24 — Imagens e compose de produção

- Objetivo: empacotar web e worker e descrever o deploy na VPS atrás do Traefik, sem publicar banco nem Redis.
- Tipo: [infra]
- Depende de: T17, T18
- Arquivos a criar:
  - `infra/Dockerfile.web`
  - `infra/Dockerfile.worker`
  - `infra/docker-compose.prod.yml`
  - `apps/worker/tsup.config.ts`
- Verificação:
  - `docker compose -f infra/docker-compose.prod.yml config`
  - `docker build -f infra/Dockerfile.web .` e `docker build -f infra/Dockerfile.worker .` (se o Docker local aguentar; senão o Reviewer confere os Dockerfiles e a T26 faz o build na VPS)
- Critério de pronto: imagens base `node:24` com patch pinado nesta tarefa, sem tag `latest`; web em `output: 'standalone'`; worker empacotado com tsup; compose sem WordPress (o CMS é externo); Postgres `pgvector/pgvector:pg16` e Redis `redis:7.4.12-alpine` só na rede interna, sem `ports`; web na rede externa `traefik-public`, host `studio.aznews.com.br`, `certresolver=letsencrypt`, entrada HTTPS; comentário no compose com os caminhos `/var/www/az-news-studio` (código) e `/opt/apps/az-news-studio/` (compose, `.env` chmod 600, volumes); nenhum serviço MinIO.
- Requisitos: critério "app no ar em studio.aznews.com.br com HTTPS" (a parte que é código); NFR de deploy da seção 8.
- Commit sugerido: `feat(infra): adiciona as imagens e o compose de produção`

## T25 — CI no GitHub Actions

- Objetivo: em todo pull request e na `main`, instalar com lockfile congelado e rodar lint, typecheck e test.
- Tipo: [infra]
- Depende de: T02
- Arquivos a criar:
  - `.github/workflows/ci.yml`
- Verificação:
  - o YAML dispara em `pull_request` e em `push` para `main`
  - Node 24
  - passos: `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm test`
  - não há passo de deploy
  - não sobe Postgres, Redis nem WordPress (a suíte padrão não precisa)
- Critério de pronto: arquivo commitado; o primeiro push da branch mostra o workflow verde depois que as tarefas de que ele depende já estão na branch. Como esta tarefa pode ser mergeada cedo, o workflow tem de passar já na T02 e continuar passando.
- Requisitos: critério "CI verde na main" (o workflow); seção 8, deploy continua manual.
- Commit sugerido: `ci: verifica lint, tipos e testes no GitHub Actions`

Ordem prática: implementar a T25 logo depois da T02, para a branch já nascer com CI. As tarefas seguintes não podem quebrar esses três comandos.

## T26 — Deploy na VPS e WordPress de homologação

- Objetivo: colocar o Studio em `https://studio.aznews.com.br` apontando para o WordPress de homologação, e cumprir os critérios que só existem nesse ambiente.
- Tipo: [infra]
- Depende de: T16, T24, T25
- Arquivos: nenhum. Checklist operacional, sem código novo. Se faltar variável, parar e voltar na tarefa que deveria ter atualizado o `.env.example`.
- Verificação (você executa, o agente não inventa acesso à VPS):
  1. Código em `/var/www/az-news-studio`. Compose, `.env` (chmod 600) e volumes em `/opt/apps/az-news-studio/`.
  2. `WP_BASE_URL` aponta para a homologação (`homolog.aznews.com.br` ou o subdomínio interno), nunca para `https://aznews.com.br`.
  3. Cópia do site de produção na homologação, com Yoast. Instalar o AZ Bridge desta branch. Criar o usuário `studio` (Editor) e a Application Password. Definir `AZ_STUDIO_WEBHOOK_URL=https://studio.aznews.com.br/api/webhooks/wordpress` e o mesmo segredo em `WP_WEBHOOK_SECRET`.
  4. Subir o compose de prod na rede `traefik-public`. Abrir `https://studio.aznews.com.br` e ver certificado válido.
  5. Login do admin pelo link mágico no e-mail de verdade; um e-mail não cadastrado é recusado.
  6. Em Conexões, "Testar conexão" cria o rascunho com meta description visível no Yoast e o manda para a lixeira.
  7. Publicar um post na homologação gera `webhook.post.published` no `audit_log` em até 10 s. Repetir com segredo errado no emissor (ou um `curl` com assinatura inválida) e receber 401, sem linha nova.
  8. Workflow da T25 verde na `main`.
- Critério de pronto: os oito passos registrados (print ou nota curta sua). Não há commit obrigatório.
- Requisitos: critérios de login em ambiente real, teste de conexão na homologação, webhook em até 10 s e 401, CI verde e HTTPS.
- Commit sugerido: nenhum.

## T27 — Contas externas

- Objetivo: pedir agora os acessos que as fases seguintes vão usar, porque a fila de aprovação desses provedores leva dias ou semanas.
- Tipo: manual (sem código)
- Depende de: nenhuma. Começar no dia 1, em paralelo com a T01.
- Arquivos: nenhum.
- Verificação: cada linha abaixo tem pedido enviado (e, quando couber, limite de gasto ou auditoria já solicitados).

| Conta / acesso | Para quê | O que conferir no pedido |
|---|---|---|
| Chave da API do Claude (Anthropic Console) | Fases 1A e 1B | Limite de gasto mensal definido no console |
| Projeto no Google Cloud com YouTube Data API v3 | Fase 4 | Auditoria de conformidade pedida no mesmo momento; vídeo de projeto não auditado fica privado |
| GA4 Data API e Search Console API nesse projeto | Fase 3 | OAuth com a conta dona das propriedades |
| App no Meta for Developers, com @canalaznews profissional | Fase 2 | Acesso padrão para publicar nas contas da própria empresa; se a Página do Facebook exige Page Publishing Authorization, anotar |
| Usuário `studio` no WordPress, papel Editor, com Application Password | Fase 0, na homologação (o local sai na T16) | Senha só no `.env` |

- Critério de pronto: os cinco pedidos existem. A chave e as senhas não entram no git.
- Requisitos: seção 8.1 da spec. Nenhum RF de runtime depende desta tarefa para a Fase 0 fechar, exceto o usuário `studio` da homologação, que a T26 também cobra.
- Commit sugerido: nenhum.

---

## Ordem

Caminho crítico: T01 → T02 → T03 → T04 → T13 → T17 → T23 → T24 → T26.

Em paralelo, sem esperar o caminho crítico:

- T27 no dia 1.
- T15 no dia 1.
- T06 depois da T02; T08 depois da T02.
- T05 depois da T03, junto da T04.
- T25 assim que a T02 estiver verde.

A T25 fica no fim da lista porque o deploy depende dela, mas o commit dela é logo após a T02.

## Matriz de cobertura

### Requisitos funcionais

| Requisito | Tarefas |
|---|---|
| RF-01 Login por link mágico; só e-mail cadastrado | T05, T09, T11, T19, T20 |
| RF-02 Papéis admin, editor, sales; admin gerencia usuários | T03, T05, T08, T09, T11, T20 |
| RF-03 Página Conexões com alcançável, autenticado e versão do bridge | T12, T21 |
| RF-04 Botão enfileira job que cria o rascunho `[TESTE STUDIO]` com meta description e manda à lixeira | T04, T13, T14, T15, T17, T21 |
| RF-05 `POST /api/webhooks/wordpress`, HMAC, `post.published` no audit log | T06, T07, T10, T15, T16, T22 |
| RF-06 Toda ação de usuário e todo job externo no audit log | T03, T04, T05, T07, T11, T17, T19, T20, T21, T22 |

### Critérios de aceitação

| Critério | Tarefas |
|---|---|
| `pnpm dev` sobe web, worker, Postgres, Redis, Mailpit e WordPress local | T09, T16, T17, T18, T23 |
| Link mágico aceita cadastrado e recusa o resto | T05, T09, T19, T20, T26 (e-mail real em produção) |
| "Testar conexão" cria e apaga o rascunho na homologação, com meta description visível no Yoast | T04, T13, T15, T17, T21, T26 |
| Publicar na homologação gera `post.published` no audit log em até 10 s; assinatura inválida responde 401 | T06, T07, T10, T15, T22, T26 |
| Lint de fronteiras falha se `core` importar `adapters` | T02 |
| CI verde na `main`; app em `https://studio.aznews.com.br` | T25, T24, T26 |

### Requisitos não funcionais

| Requisito | Tarefas |
|---|---|
| TypeScript strict | T01 |
| Cobertura de linhas ≥ 90% em `packages/core` | T03 (limiar) e T04, T05, T07 |
| `eslint-plugin-boundaries` | T02 |
| Segredos só em ambiente; `.env.example` completo | T01, e qualquer tarefa que crie variável nova |
| `GET /api/health` | T18 |
| Heartbeat do worker no Redis | T17 |
| Logs JSON (pino) | T17, T18 |
| Postgres com pgvector | T08, T09 |
| Compose de dev e de prod, Dockerfiles | T09, T16, T24 |
| CI lint, typecheck, test, sem deploy automático | T25 |
| Plugin PHP ≥ 8.1, WordPress ≥ 6.4, sem efeito no front | T15, T16 |

## Dívida técnica registrada

- **Corrida no "último admin" (T05):** dois admins rebaixando ou desativando um ao outro ao mesmo tempo podem passar ambos pela checagem `countActiveAdmins() < 2`. Risco aceito na Fase 0 (equipe de 2 a 3 pessoas). Correção futura: operação condicional/transação no adaptador (ex.: `UPDATE ... WHERE (SELECT count(*) ...) > 1`).

## Problemas na spec

> **Aplicados na spec em 2026-11-23**, junto com a troca de Auth.js por Better Auth (ADR 0006). A lista fica aqui como histórico; a spec é a referência.

Nada disto foi editado na spec. A correção sugerida é para você aplicar se concordar. Enquanto isso, as tarefas seguem a recomendação.

1. **Tabelas do Auth.js incompletas.** A seção 2 cita `users` e `sessions`/`accounts`. Link mágico com sessão no banco também precisa de `verification_tokens`, e o adaptador espera `accounts` e `sessions` ao mesmo tempo. Sugestão: listar as quatro tabelas na seção 2 e na tarefa 4 da seção 10.
2. **`audit_log` e `users` sem colunas.** RF-02 e RF-06 não dizem o formato da linha. A spec do MCP (fora desta fase) grava `channel = mcp`. Sugestão: documentar as colunas da T08, incluindo `channel` com `web | worker | mcp`, e `users.role`.
3. **RF-02 não tem tela, caso de uso nem primeiro admin.** O escopo narrado só menciona Conexões. Sem um usuário inicial ninguém entra para cadastrar o segundo, e o Auth.js cria usuário sozinho no primeiro clique se a gente não bloquear. Sugestão: página Usuários (admin), recusa de e-mail desconhecido antes de enviar o link, e `SEED_ADMIN_EMAIL` quando a tabela está vazia. A T05 também desativa usuário (`active`), porque "gerenciar" sem revogação não tira o acesso de quem saiu da equipe. Se você não quiser desativação, diga antes da T05.
4. **Quem abre Conexões.** A spec não diz. Sugestão: só `admin` na Fase 0. Editor e sales entram e veem a home.
5. **Portas além da seção 6.** A arquitetura cita `JobQueuePort` e `ClockPort`; não cita porta de audit log nem de usuário. Sem elas o `core` teria de importar Postgres para cumprir RF-02 e RF-06. Sugestão: acrescentar `JobQueuePort`, `ClockPort`, `AuditLogPort` e `UserRepository` à seção 6, como subconjunto da Fase 0.
6. **Data do título `[TESTE STUDIO] <data>`.** Não há fuso nem formato. Sugestão: data de calendário `YYYY-MM-DD` em `America/Sao_Paulo`. O slug leva hora para não colidir no mesmo dia.
7. **Yoast no ambiente local.** O critério pede a meta description visível no Yoast. O AZ Bridge só registra o meta; quem mostra é o plugin Yoast. A homologação, sendo cópia do site, já tem Yoast. O compose de dev não. Sugestão: dizer na spec que o WordPress local instala o Yoast (é o que a T16 faz) e que a checagem visual obrigatória é na homologação.
8. **Webhook não bloqueante e códigos HTTP.** `wp_remote_post` com `blocking => false` às vezes morre no shutdown do PHP, e o critério dos 10 segundos falha sem o Studio ter culpa. A spec também não diz o status de sucesso nem o de corpo inválido, só o 401. Sugestão: manter não bloqueante na v1; se o ensaio da T26 perder evento, trocar para pedido bloqueante com timeout de 2 s, ignorando erro para não segurar o publish. Sucesso da rota: 204. Corpo que não bate com o schema: 400, mesmo com assinatura válida.
9. **Health e heartbeat sem formato.** Sugestão: `GET /api/health` devolve `{ "status": "ok" }` e não consulta o worker; o worker grava `worker:heartbeat` no Redis, TTL 30 s, a cada 10 s.
10. **`transition_post_status` para qualquer tipo de conteúdo.** A spec não restringe a `post`. Sugestão: disparar só quando `post_type` é `post`, para página e anexo não encherem o audit log. A T15 já faz isso.
11. **TypeScript 7 no npm e TypeScript 5 no ADR 0002.** Não é contradição interna da spec (ela aponta o ADR). O `typescript-eslint` 8.74 aceita TypeScript `< 6.1`. Seguir o ADR: 5.9.3. Não mexer no ADR nesta fase.

Não há conflito entre "o teste cria rascunho" e o ADR 0004. O ADR troca a regra editorial (publicar de verdade depois da aprovação). O rascunho da Fase 0 é só o teste da conexão.

## Decisões em aberto

Responda só o que quiser mudar. O resto fica como está.

| # | Pergunta | Recomendação |
|---|---|---|
| D1 | Nome dos pacotes npm | Escopo privado `@az-news/core`, `@az-news/contracts`, `@az-news/db`, `@az-news/adapters`, `@az-news/config`, `@az-news/web`, `@az-news/worker`. Raiz `az-news-studio`, `private: true`. Não publicar no npm. |
| D2 | pnpm | Linha 10, patch pinado no campo `packageManager` no dia da T01. A latest do registry hoje é 12.23.0; ficar na 10 nesta fase. |
| D3 | TypeScript | `5.9.3`. A latest `7.0.2` não passa no peer do typescript-eslint. ADR 0002 manda a linha 5. |
| D4 | Next, React | `next@16.4.6`, `react` e `react-dom@19.3.1`. Turbopack já é o padrão do `next dev`; não passar `--turbopack`. |
| D5 | Autenticação | **Decidido: Better Auth** ([ADR 0006](../../docs/adr/0006-better-auth.md)), última versão estável conferida no registry no dia da T08, pinada sem range e sem beta. Adaptador Drizzle com `usePlural: true`, plugin de link mágico com criação automática desligada, sem o plugin `admin`. |
| D6 | Nodemailer | Usado diretamente em `sendMagicLink` (sem peer de biblioteca de auth). Pinar a versão estável atual no dia da T19. |
| D7 | Usuário inativo | Coluna `active`. Admin desativa; login recusa inativo; não apagar linha. Ver problema 3. |
| D8 | Quem vê Conexões e Usuários | Só `admin`. |
| D9 | Primeiro admin | `SEED_ADMIN_EMAIL`. Roda com `pnpm db:seed` só se ainda não houver usuário. |
| D10 | `CmsPostId` | String opaca no domínio. Ver nota na T04. |
| D11 | Zod | `4.6.7` em todo o monorepo, uma versão só. |
| D12 | Drizzle e driver | `drizzle-orm@0.45.4`, `drizzle-kit@0.31.11`, driver `pg@8.23.1` (`drizzle-orm/node-postgres`). |
| D13 | Teste de repositório | `@electric-sql/pglite@0.6.0` no `pnpm test`, para o CI não depender de Docker. |
| D14 | BullMQ e Redis | `bullmq@6.7.8`, `ioredis@6.1.0`. |
| D15 | HTTP de teste e log | `msw@3.0.7`, `pino@10.4.0`. `pino-pretty` só em dev. |
| D16 | Vitest, Turbo, ESLint, Prettier | `vitest@5.1.1`, `@vitest/coverage-v8@5.1.1`, `turbo@2.11.13`, `eslint@10.15.0`, `typescript-eslint@8.74.0`, `eslint-plugin-boundaries@7.4.4`, `eslint-config-prettier@10.1.8`, `prettier@3.10.1`. |
| D17 | Tipos do Node | `@types/node` na linha 24, não a latest 26, para combinar com o runtime do ADR. |
| D18 | Worker em produção | Dev com `tsx@4.23.15`. Imagem com `tsup@9.0.0`. |
| D19 | Imagens Docker já confirmadas em 2026-11-23 | `pgvector/pgvector:pg16` (a spec fixa esta tag), `redis:7.4.12-alpine`, `wordpress:7.1.5-php8.3-apache`. |
| D20 | Mailpit, MariaDB, wp-cli, Node da imagem | Pinagem semver na tarefa que cria o arquivo, nunca `latest`. MariaDB na linha 11.8. `wordpress:cli` alinhada ao WordPress 7.1.5. Node `24` com patch escrito no Dockerfile. |
| D21 | Versões no package.json | Exatas, sem `^`. Lockfile commitado. CI com `--frozen-lockfile`. |
| D22 | Sucesso e corpo inválido do webhook | 204 e 400. Ver problema 8. |
| D23 | Retry de `createDraft` | Repetir só se não houve resposta HTTP. 4xx/5xx não repetem, para não criar dois rascunhos. A lixeira e o `checkConnection` repetem até 3 vezes. O job no BullMQ também tem 3 tentativas: um retry do job inteiro pode deixar rascunho extra na lixeira. Aceitar isso na Fase 0. |
| D24 | `WP_*` de produção | Homologação até o fim da Fase 1. Produção do aznews.com.br fica fora do `.env` do Studio. |

Pacotes conferidos no registry em 2026-11-23. A T01 grava esses números; se no dia da tarefa o patch tiver subido, usar o patch novo da mesma linha menor e anotar no commit, sem trocar de major.
