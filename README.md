# AZ News Studio

Ferramenta interna da **AZ Work Center** para produzir e distribuir o conteúdo do **AZ News** (blog [aznews.com.br](https://www.aznews.com.br), canal no YouTube e Instagram @canalaznews).

Agentes de IA encontram a pauta, escrevem, revisam e distribuem; a equipe aprova; o Studio publica.

## Módulos

| # | Módulo | O que faz | Fase |
|---|--------|-----------|------|
| 1 | Pauta | Monitora fontes confiáveis (prefeituras, câmaras, imprensa), agrupa por assunto, ranqueia e entrega a pauta do dia | 1B |
| 2 | Redação | Assunto ou link → extração → reescrita no padrão AZ News → checagens → aprovação → publicação no WordPress | 1A |
| 3 | Redes sociais | Matéria publicada → legenda, hashtags, carrossel, story → fila de agendamento → Instagram/Facebook | 2 |
| 4 | Painel | GA4, Search Console, YouTube, Instagram, anúncios e relatório mensal por cliente | 3 |
| 5 | Vídeo | Cortes das lives (transcrição + trechos + corte vertical) e resumo semanal | 4 |
| — | Servidor MCP | Operar o Studio conversando com o Claude (pauta, produção, aprovação, métricas) | v1 ao fim da Fase 1 |

## Princípios

1. **Nada é publicado sem aprovação** — humana, ou de uma política de autonomia explícita, auditada e com limite diário (ADR 0004). Política nunca é automática.
2. **A IA não inventa fatos.** Toda versão passa por checagem de fidelidade contra a fonte.
3. **Crédito para exclusivas.** Apuração ou entrevista exclusiva de outro veículo mantém a menção no texto.
4. **WordPress fica atrás de uma porta.** O domínio não conhece o CMS.

## Documentação

- [Arquitetura](docs/arquitetura.md)
- [Decisões (ADRs)](docs/adr/): 0001 WordPress como CMS · 0002 stack · 0003 IA estruturada · 0004 agentes e autonomia · 0005 servidor MCP · 0006 Better Auth
- [Guia de estilo editorial v1](docs/guia-de-estilo.md) — base do prompt de reescrita
- [Regras para agentes de IA](AGENTS.md)
- Specs: [Fase 0 — Base](specs/fase-0-base/spec.md) · [Fase 1A — Redação](specs/fase-1-redacao/spec.md) · [Fase 1B — Fontes e Pauta](specs/fase-1b-pauta/spec.md) · [Servidor MCP](specs/mcp-server/spec.md)

## Fluxo de trabalho

Spec-Driven Development: toda funcionalidade nasce de uma spec em `specs/`, com critérios de aceitação, antes de qualquer código. Implementação em TDD (Vitest), arquitetura hexagonal + DDD.

## WordPress local

O WordPress de desenvolvimento fica num profile do Compose. `pnpm infra:up` sobe só Postgres, Redis e Mailpit.

1. Copie `WORDPRESS_DB_NAME`, `WORDPRESS_DB_USER`, `WORDPRESS_DB_PASSWORD`, `MARIADB_ROOT_PASSWORD`, `WP_BASE_URL`, `WP_ADMIN_PASSWORD` e `WP_WEBHOOK_SECRET` do `.env.example` para o `.env` e troque as senhas. Num WordPress já instalado, o setup não altera a senha do admin.
2. `pnpm wp:up`
3. `pnpm wp:setup`. Na primeira vez, cole a senha impressa em `WP_APP_PASSWORD`. Rodar de novo não cria outro usuário nem outra senha.
4. `pnpm wp:down` para o WordPress e o MariaDB. O volume e o resto da infra ficam.

O site local é [http://127.0.0.1:8080](http://127.0.0.1:8080). O health do AZ Bridge é [http://127.0.0.1:8080/wp-json/az-bridge/v1/health](http://127.0.0.1:8080/wp-json/az-bridge/v1/health).

## Status

Fase 0 — especificação concluída, implementação não iniciada.
