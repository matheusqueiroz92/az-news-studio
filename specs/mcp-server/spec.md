# Spec — Servidor MCP do AZ News Studio

- Status: v1 pronta para implementação ao fim da Fase 1 (1A + 1B); cresce a cada fase
- Estimativa da v1: 1 semana
- Referências: [ADR 0005](../../docs/adr/0005-studio-como-servidor-mcp.md), [ADR 0004](../../docs/adr/0004-orquestracao-agentica-e-autonomia.md)

## 1. Objetivo

Permitir que a equipe opere o Studio conversando com o Claude (app no celular, web, desktop ou Claude Code): consultar a pauta, produzir matérias, revisar, aprovar e acompanhar resultados, com as mesmas permissões e salvaguardas da interface web.

Exemplos de uso:
- "Qual a pauta de hoje para Itapetinga?"
- "Produz as matérias dos assuntos 2, 4 e 5."
- "Mostra o que está esperando aprovação e aprova as que não têm alerta."
- "Importa este link e foca no impacto para os servidores de Conquista."
- "Pausa a publicação automática até amanhã."

## 2. Arquitetura

- Pacote `apps/mcp` (ou rota `/mcp` em `apps/web`), com o SDK oficial `@modelcontextprotocol/sdk`.
- Transporte **Streamable HTTP** em `https://studio.aznews.com.br/mcp`.
- Cada ferramenta = validação Zod da entrada → checagem de papel → **um caso de uso** de `packages/core` → resposta resumida em texto + `structuredContent`.
- Nenhuma regra de negócio no servidor MCP.

## 3. Autenticação

- **OAuth 2.1** conforme a especificação de autorização do MCP (metadados do servidor de autorização, registro dinâmico de cliente, PKCE), implementado com o plugin **OAuth 2.1 Provider do Better Auth** ([ADR 0006](../../docs/adr/0006-better-auth.md)) sobre a mesma instância de autenticação do Studio. O login continua sendo o link mágico. Isso permite adicionar o Studio como **conector personalizado** no Claude.
- **Token pessoal** (gerado em "Meu perfil", com escopo e validade) para Claude Code e Cursor.
- Escopos: `studio:read`, `studio:write`, `studio:publish`, `studio:admin`, mapeados aos papéis `sales`, `editor`, `admin`.
- Toda chamada grava em `audit_log` com `channel = mcp` e o cliente usado.

## 4. Ferramentas da v1

| Ferramenta | Caso de uso | Escopo | Anotações |
|---|---|---|---|
| `pauta_listar` (data?, editoria?, cidade?, score_min?, limite?) | consulta de `StoryCluster` | read | readOnly |
| `pauta_detalhar` (cluster_id) | consulta | read | readOnly |
| `pauta_produzir` (cluster_ids[], instrucao?) | `ProduceFromCluster` | write | — |
| `pauta_descartar` (cluster_id, motivo?) | `DismissCluster` | write | — |
| `materia_importar` (urls[] \| texto, editoria?, instrucao?) | `ImportSource` | write | — |
| `fila_listar` (status?, minhas?) | consulta de `Article` | read | readOnly |
| `materia_ver` (id) | consulta: versão atual, alertas, nota, checklist | read | readOnly |
| `materia_editar` (id, campos) | `EditVersion` | write | — |
| `materia_nova_versao` (id, instrucao) | `RequestNewVersion` | write | — |
| `alerta_resolver` (issue_id, resolucao) | `ResolveFidelityIssue` | write | — |
| `materia_aprovar_publicar` (ids[], publicar_em?) | `ApproveAndPublish` / `BatchApprove` | publish | destructive |
| `materia_descartar` (id) | `DiscardArticle` | write | destructive |
| `autonomia_pausar` (ate?) / `autonomia_retomar` | kill switch | admin | destructive |
| `fontes_listar` / `fonte_testar` (id) | `ManageSources` | read | readOnly |

### Regras específicas

- `materia_aprovar_publicar` aplica **exatamente** as mesmas invariantes da UI (INV-01..07 da Fase 1A). Item com alerta `high` aberto ou nível `full_review` não aprovado na tela retorna erro explicando o motivo e o link para revisar no Studio.
- Aprovação em lote pelo MCP aceita no máximo 10 itens por chamada.
- Respostas sempre trazem o link da tela correspondente no Studio, para o usuário conferir visualmente.
- Textos longos (corpo da matéria) vêm resumidos por padrão; `materia_ver` com `completo: true` traz o texto inteiro.

## 5. Recursos e prompts

- **Recursos:** `studio://guia-de-estilo` (versão ativa), `studio://pauta/hoje`, `studio://fila/aguardando-aprovacao`.
- **Prompts:** `pauta_do_dia` (resume a pauta e sugere o que produzir), `revisao_rapida` (percorre a fila de aprovação item a item).

## 6. Ferramentas das próximas fases (planejadas)

| Fase | Ferramentas |
|---|---|
| 2 — Redes sociais | `social_gerar` (artigo_id), `social_agendar`, `social_fila`, `social_metricas` |
| 3 — Painel | `metricas_resumo` (período), `anuncios_campanhas`, `relatorio_cliente` (anunciante, mês) |
| 4 — Vídeo | `live_enviar` (arquivo), `cortes_sugeridos` (live_id), `corte_aprovar`, `resumo_semana_gerar` |

## 7. Critérios de aceitação

- [ ] O Studio é adicionado como conector personalizado no Claude e o login OAuth funciona.
- [ ] Usuário `sales` lista a pauta mas recebe erro de permissão ao produzir.
- [ ] "Aprova as que não têm alerta" pelo Claude aprova só os itens elegíveis e explica os recusados.
- [ ] Toda ação feita pelo MCP aparece no `audit_log` com `channel = mcp`.
- [ ] Testes de contrato: para cada ferramenta, entrada inválida é recusada com mensagem clara e a saída bate com o schema declarado.

## 8. Tarefas

1. Servidor MCP com Streamable HTTP e ferramentas `readOnly` (sem autenticação, só em dev).
2. Servidor de autorização OAuth 2.1 com o plugin OAuth 2.1 Provider do Better Auth (conferir na documentação vigente a integração recomendada para MCP); tokens pessoais.
3. Ferramentas de escrita e publicação, com escopos e testes de permissão.
4. Recursos e prompts.
5. Teste ponta a ponta no Claude (conector personalizado) e no Claude Code.
