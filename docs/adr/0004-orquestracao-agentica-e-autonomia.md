# ADR 0004 — Orquestração agêntica com níveis de autonomia

- Status: aceita
- Data: 2026-11-23
- Substitui: item 5 do [ADR 0003](0003-ia-saida-estruturada-e-aprovacao.md) ("o Studio só cria rascunho ou agendamento")

## Contexto

A equipe do AZ News é pequena. O objetivo é que agentes de IA executem o máximo do processo (pauta → reescrita → publicação → distribuição), reduzindo o trabalho humano a **aprovar**. Ao mesmo tempo, o AZ News cobre política e tem contratos com órgãos públicos: um erro publicado tem custo jurídico e comercial alto.

## Decisão

### 1. Agentes como etapas de um fluxo determinístico

Os "agentes" do Studio são etapas com IA dentro de **máquinas de estado e filas**, não um agente livre que decide o próximo passo sozinho. O código decide a ordem; a IA decide o conteúdo de cada etapa (o que é relevante, como reescrever, o que está errado). Motivos: previsibilidade, custo controlado, testes, auditoria.

| Agente | Etapa | Ferramentas (portas) |
|---|---|---|
| Pauteiro | Classifica e ranqueia o que as fontes publicaram (Fase 1B) | `SourceCollectorPort`, `LlmPort` |
| Redator | Reescreve no padrão AZ News (Fase 1A) | `ContentFetcherPort`, `LlmPort` |
| Revisor | Checa fidelidade, similaridade, SEO e crédito (Fase 1A) | `LlmPort`, funções puras do domínio |
| Editor-chefe | Aplica a política de autonomia: publica, pede aprovação ou exige revisão | `AutonomyPolicy` (domínio), `CmsPort` |
| Social, Vídeo | Fases 2 e 4 | — |

Onde a IA precisa de mais liberdade (ex.: o Pauteiro pesquisar contexto de um tema), ela usa *tool use* da API do Claude com as portas expostas como ferramentas, sempre com limite de passos e de custo por tarefa.

### 2. Níveis de autonomia

Cada conteúdo recebe um nível, calculado por regras configuráveis no painel (`AutonomyPolicy`):

| Nível | Comportamento | Padrão para |
|---|---|---|
| `auto` | Publica sozinho se **todas** as checagens passarem | Releases de prefeituras e câmaras parceiras, utilidade pública, agenda, posts sociais de matérias já publicadas |
| `one_tap` | Tudo pronto; humano aprova com um toque, inclusive em lote | Política, matérias baseadas em outros veículos, cortes de live |
| `full_review` | Exige abrir, ler e editar | Conteúdo de origem exclusiva, saúde, segurança pública, qualquer alerta de fidelidade, primeira matéria de uma fonte nova |

Regras de precedência: o nível mais restritivo vence; qualquer alerta `high` rebaixa para `full_review`; o nível `auto` nunca vale para editoria Política na v1.

### 3. Salvaguardas do modo automático

- Limite diário de publicações automáticas (`AUTO_PUBLISH_DAILY_CAP`, padrão 10).
- Botão de pausa geral (*kill switch*) no painel e via MCP.
- Toda publicação automática registra `approvedBy = policy:<id>` e entra no resumo diário para conferência posterior.
- Primeira semana de cada regra `auto` em modo **sombra**: o Studio registra o que publicaria, mas pede aprovação.

### 4. Caixa de aprovação

Tela única, pensada para celular (PWA), com os itens `one_tap` e `full_review`, aprovação em lote e notificação (web push e e-mail) duas vezes ao dia ou quando houver algo urgente.

## Consequências

- Publicação direta no WordPress (`publish` ou `future`), sem passar pelo painel do WordPress.
- A política de autonomia é uma entidade de domínio com testes próprios: é a regra mais importante do sistema.
- O trabalho humano diário fica concentrado em aprovar e em melhorar o guia de estilo e as regras.
