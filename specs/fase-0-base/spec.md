# Spec — Fase 0: Base

- Status: pronta para implementação
- Estimativa: 1 semana (dedicação parcial)
- Depende de: nada
- Referências: [ADR 0001](../../docs/adr/0001-wordpress-como-cms-studio-separado.md), [ADR 0002](../../docs/adr/0002-monorepo-e-stack.md), [ADR 0006](../../docs/adr/0006-better-auth.md), [Arquitetura](../../docs/arquitetura.md)
- Plano de execução: [plan.md](plan.md)

## 1. Objetivo

Ter o esqueleto do Studio rodando em produção, com login, banco, fila e uma integração funcional com um WordPress de homologação. Nenhuma funcionalidade editorial ainda.

**Pronto quando:** um usuário logado em `studio.aznews.com.br` clica em "Testar conexão" e o Studio cria um rascunho de teste no WordPress de homologação, com meta description do Yoast preenchida.

## 2. Escopo

### Dentro
- Monorepo (pnpm + Turborepo), TypeScript strict, ESLint (com regras de fronteira), Prettier, Vitest.
- `apps/web` (Next.js) com autenticação (Better Auth, link mágico) e as páginas **Usuários** e **Conexões**, ambas só para `admin`.
- `apps/worker` consumindo a fila `cms`.
- `packages/core` com as portas `CmsPort`, `JobQueuePort`, `ClockPort`, `AuditLogPort` e `UserRepository`, e os casos de uso `TestCmsConnection`, `ManageUsers` e `RecordWordpressWebhook`.
- `packages/adapters` com `WordPressRestCms`.
- `packages/db` com as tabelas de autenticação do Better Auth com `usePlural` (`users`, `sessions`, `accounts`, `verifications`), com os campos adicionais `role` e `active`, e a tabela `audit_log` (seção 3.1).
- `packages/contracts` com o schema do webhook do AZ Bridge.
- Plugin `wordpress/az-bridge` v1.
- Postgres com a extensão `pgvector` (usada na Fase 1B).
- Docker Compose (dev e prod), deploy na VPS, CI no GitHub Actions.

### Fora
- Qualquer tela editorial (Fase 1).
- Armazenamento S3 (entra na Fase 1, com imagens).

## 3. Requisitos funcionais

| ID | Requisito |
|---|---|
| RF-01 | Login por link mágico enviado por e-mail; somente e-mails **cadastrados e ativos** entram. O link não é enviado para e-mail desconhecido ou inativo, e o Better Auth não cria usuário sozinho. O primeiro admin é criado por `SEED_ADMIN_EMAIL` (`pnpm db:seed`), só quando a tabela de usuários está vazia |
| RF-02 | Papéis `admin`, `editor`, `sales`. Na página **Usuários**, o `admin` cadastra e-mail com papel, troca papel e desativa/reativa usuários (sem exclusão física). Não é possível rebaixar nem desativar o último admin ativo |
| RF-03 | Página "Conexões" (só `admin`) mostra o status do WordPress (alcançável, autenticado, nome do site, versão do AZ Bridge) |
| RF-04 | Botão "Testar conexão" enfileira um job que cria um rascunho `[TESTE STUDIO] YYYY-MM-DD` (data de calendário em `America/Sao_Paulo`; slug com data e hora para não colidir) com meta description do Yoast e o manda para a **lixeira** (sem exclusão definitiva) |
| RF-05 | Endpoint `POST /api/webhooks/wordpress` recebe o evento `post.published` do AZ Bridge, valida a assinatura HMAC sobre o **corpo cru** e grava em `audit_log`. Respostas: `204` sucesso; `401` assinatura ausente ou inválida; `400` assinatura válida com corpo fora do schema |
| RF-06 | Toda ação de usuário e todo job externo gravam em `audit_log` (quem, o quê, quando, resultado), conforme a seção 3.1 |

### 3.1 Formato dos registros

**`audit_log`** (somente inserção, sem update nem delete):

| Coluna | Tipo | Observação |
|---|---|---|
| `id` | uuid | |
| `occurred_at` | timestamptz | UTC |
| `actor_id` | texto, nulo | Sem FK obrigatória: webhook não tem usuário |
| `action` | texto | Vocabulário fixo, ex.: `auth.sign_in`, `user.create`, `user.change_role`, `user.set_active`, `cms.test_connection.requested`, `cms.test_connection.completed`, `webhook.post.published` |
| `channel` | texto | `web` \| `worker` \| `mcp` (o MCP chega depois, mas o valor já existe) |
| `result` | texto | `success` \| `failure` |
| `target` | texto, nulo | Ex.: id do post, id do usuário alterado |
| `detail` | jsonb, nulo | Sem segredos |

**Usuário** (tabela do Better Auth + campos adicionais): `role` texto `not null` (`admin` \| `editor` \| `sales`); `active` boolean `not null` default `true`; e-mail único, guardado em minúsculas pela aplicação.

## 4. Requisitos não funcionais

- TypeScript 5.9.x `strict`; `packages/core` com cobertura ≥ 90% de linhas.
- `eslint-plugin-boundaries`: `core` não importa `adapters`, `db`, `apps` nem SDKs.
- Segredos apenas por variáveis de ambiente; `.env.example` completo.
- Healthcheck `GET /api/health` (web) → `200 { "status": "ok" }`, sem consultar o worker nem expor variáveis. Heartbeat do worker: chave `worker:heartbeat` no Redis com TTL de 30 s, renovada a cada 10 s.
- Logs estruturados em JSON (pino).

## 5. Estrutura do repositório

```
apps/
  web/                 Next.js (App Router)
  worker/              Node + BullMQ
packages/
  core/                src/domain, src/application, src/ports, test/
  adapters/            src/cms/wordpress, src/queue/bullmq, ...
  db/                  src/schema, drizzle/ (migrações)
  contracts/           schemas Zod
  config/              tsconfig, eslint, prettier compartilhados
wordpress/
  az-bridge/           plugin PHP
infra/
  docker-compose.dev.yml
  docker-compose.prod.yml
  Dockerfile.web
  Dockerfile.worker
docs/  specs/
```

## 6. Porta e adaptador do CMS (subconjunto da Fase 0)

```ts
// packages/core/src/ports/cms-port.ts
export interface CmsPort {
  checkConnection(): Promise<Result<CmsConnectionStatus, CmsError>>;
  createDraft(input: CmsDraftInput): Promise<Result<CmsPostRef, CmsError>>;
  trashPost(id: CmsPostId): Promise<Result<void, CmsError>>;
}

export type CmsConnectionStatus = {
  reachable: boolean;
  authenticated: boolean;
  bridgeVersion: string | null;
  siteName: string;
};

export type CmsPostId = string; // opaco no domínio; o adaptador converte o id numérico do WordPress

export type CmsDraftInput = {
  title: string;
  excerpt: string;
  contentHtml: string;
  slug: string;
  metaDescription: string;
  categoryIds: number[];
  tagNames: string[];
};
```

Demais portas da Fase 0 (`packages/core/src/ports`):

| Porta | Operações |
|---|---|
| `ClockPort` | `now(): Date` (UTC) |
| `JobQueuePort` | `enqueue(queue, jobName, payload, jobId?) → Result<{ jobId }, { code: 'enqueue_failed' }>` |
| `AuditLogPort` | `record({ actorId, action, channel, result, target, detail, occurredAt }) → Result<void, { code: 'write_failed' }>` |
| `UserRepository` | `findByEmail`, `findById`, `list`, `insert`, `updateRole`, `setActive`, `countActiveAdmins` |

Erros do `CmsPort`: `unreachable` (sem resposta HTTP), `invalid_response`, `draft_failed`, `trash_failed`. Uma resposta 401 do WordPress **não** é erro de `checkConnection`: volta `ok` com `authenticated: false`.

`WordPressRestCms` usa `fetch` com autenticação Basic por **Application Password** de um usuário dedicado `studio` (papel Editor). Endpoints: `GET /wp-json`, `GET /wp-json/az-bridge/v1/health`, `POST /wp-json/wp/v2/posts` (`status: draft`), `DELETE /wp-json/wp/v2/posts/:id`.

Testes do adaptador: contra um mock HTTP (msw) no CI e um teste de integração opcional (`pnpm test:integration`) contra o WordPress de homologação.

## 7. Plugin AZ Bridge v1 (`wordpress/az-bridge`)

| Função | Detalhe |
|---|---|
| Campos do Yoast na REST | `register_post_meta('post', '_yoast_wpseo_metadesc' / '_yoast_wpseo_focuskw', ['show_in_rest' => true, 'single' => true, 'type' => 'string', 'auth_callback' => fn() => current_user_can('edit_posts')])` |
| Metadados do Studio | `_az_studio_article_id`, `_az_studio_source_url` (registrados do mesmo jeito; não exibidos no site) |
| Webhook | Em `transition_post_status` para `publish`, **somente quando `post_type` = `post`**: `wp_remote_post` não bloqueante para `AZ_STUDIO_WEBHOOK_URL` com corpo `{ event: "post.published", postId, url, title, publishedAt }` e cabeçalho `X-AZ-Signature: sha256=<HMAC do corpo com AZ_STUDIO_WEBHOOK_SECRET>` |
| Health | `GET /wp-json/az-bridge/v1/health` → `{ version: "1.0.0" }` (público) |
| Configuração | Constantes no `wp-config.php`: `AZ_STUDIO_WEBHOOK_URL`, `AZ_STUDIO_WEBHOOK_SECRET`. Sem tela de configuração na v1 |

Requisitos: PHP ≥ 8.1, WordPress ≥ 6.4, nenhum impacto no front do site. Sem as constantes configuradas, o plugin não envia e não quebra a publicação; erro de HTTP no envio é ignorado. `publishedAt` em UTC.

**Envio não bloqueante:** a v1 usa `blocking => false`. Se o ensaio na homologação perder eventos (o PHP pode encerrar antes do envio), trocar para envio bloqueante com timeout de 2 s, sempre ignorando erro para não atrasar a publicação.

## 8. Infraestrutura

- **Dev:** `docker-compose.dev.yml` com Postgres 16 com pgvector (`pgvector/pgvector:pg16`), Redis 7, Mailpit (e-mails do link mágico) e um WordPress + MariaDB locais com o AZ Bridge montado como volume e o **Yoast SEO** instalado (script de bootstrap com wp-cli cria o usuário `studio` e a Application Password). A conferência visual obrigatória da meta description no Yoast é feita na homologação.
- **Homologação do WordPress:** cópia do aznews.com.br em `homolog.aznews.com.br` (ou subdomínio interno), com o AZ Bridge instalado. Nunca testar contra produção antes do fim da Fase 1.
- **Prod:** `docker-compose.prod.yml` na VPS, padrão `/var/www/az-news-studio` (código) e `/opt/apps/az-news-studio/` (compose, `.env`, volumes), Traefik com `studio.aznews.com.br`.
- **CI:** GitHub Actions em PR e `main`: `pnpm install --frozen-lockfile`, `lint`, `typecheck`, `test`. Deploy manual na v1.

### Variáveis de ambiente (`.env.example`)

```
DATABASE_URL=
REDIS_URL=
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=https://studio.aznews.com.br
SEED_ADMIN_EMAIL=
EMAIL_SERVER=
EMAIL_FROM=studio@aznews.com.br
WP_BASE_URL=
WP_USERNAME=studio
WP_APP_PASSWORD=
WP_WEBHOOK_SECRET=
LOG_LEVEL=info
```

## 8.1 Contas externas — solicitar já na Fase 0

Alguns acessos levam dias ou semanas para sair. Pedir agora evita travar as fases seguintes.

| Conta / acesso | Para quê | Observação |
|---|---|---|
| Chave da API do Claude (Anthropic Console) | Fases 1A e 1B | Definir limite de gasto mensal no próprio console |
| Projeto no Google Cloud com YouTube Data API v3 | Fase 4 (upload de cortes) | **Pedir a auditoria de conformidade logo:** vídeos enviados por projetos não auditados ficam travados como privados |
| GA4 Data API e Search Console API no mesmo projeto | Fase 3 | OAuth com a conta dona das propriedades |
| App no Meta for Developers + @canalaznews como conta profissional | Fase 2 | Acesso padrão basta para publicar nas contas da própria empresa; conferir se a Página do Facebook exige Page Publishing Authorization |
| Usuário `studio` no WordPress com Application Password | Fase 0 | Papel Editor |

## 9. Critérios de aceitação

- [ ] `pnpm dev` sobe web, worker, Postgres, Redis, Mailpit e WordPress local com um comando.
- [ ] Login por link mágico funciona para e-mail cadastrado e ativo e é recusado para não cadastrado ou inativo.
- [ ] Admin cadastra, troca papel e desativa usuário pela página Usuários; o sistema impede rebaixar ou desativar o último admin.
- [ ] "Testar conexão" cria e apaga um rascunho no WordPress de homologação, com meta description visível no Yoast.
- [ ] Publicar um post no WordPress de homologação gera registro `post.published` no `audit_log` em até 10 s; assinatura inválida é recusada com 401.
- [ ] Lint de fronteiras falha se `packages/core` importar algo de `adapters`.
- [ ] CI verde na `main`; app no ar em `studio.aznews.com.br` com HTTPS.

## 10. Tarefas (ordem sugerida)

1. Monorepo: pnpm workspaces, Turborepo, `packages/config` (tsconfig/eslint/prettier), Vitest.
2. `packages/core`: tipo `Result`, `CmsPort`, caso de uso `TestCmsConnection` (TDD com fake do CmsPort).
3. `packages/contracts`: `WordPressWebhookEvent` (Zod).
4. `packages/db`: Drizzle, tabelas do Better Auth (com `role` e `active`) + `audit_log` + `CREATE EXTENSION vector`, primeira migração; seed do primeiro admin.
5. `packages/adapters`: `WordPressRestCms` + testes com msw; `BullMqQueue`.
6. `wordpress/az-bridge` v1 + WordPress local no compose.
7. `apps/worker`: fila `cms`, job `TestCmsConnection`, heartbeat.
8. `apps/web`: Better Auth (link mágico), layout, "Usuários", "Conexões", webhook, health.
9. Dockerfiles, compose de prod, CI.
10. Deploy na VPS + WordPress de homologação.
11. Solicitar as contas externas da seção 8.1 (em paralelo, desde o primeiro dia).
