# ADR 0005 — O Studio exposto como servidor MCP

- Status: aceita
- Data: 2026-11-23

## Contexto

A equipe quer operar o Studio conversando com o Claude ("traz a pauta de hoje", "importa esses links", "aprova as três de Itapetinga"). O MCP (Model Context Protocol) é o padrão para assistentes de IA usarem ferramentas externas.

## Decisão

1. **Dentro do Studio, não usamos MCP** para falar com WordPress, Meta ou YouTube: os adaptadores chamam as APIs diretamente. MCP aqui só acrescentaria uma camada.
2. **O Studio expõe um servidor MCP** (`apps/mcp` ou rota `/mcp` em `apps/web`), com as ferramentas mapeadas **um para um nos casos de uso** de `packages/core`. Nenhuma regra de negócio mora no servidor MCP: ele só autentica, valida a entrada (Zod) e chama o caso de uso.
3. Transporte **Streamable HTTP** em `https://studio.aznews.com.br/mcp`, com **OAuth 2.1** conforme a especificação de autorização do MCP, para funcionar como conector personalizado no Claude (web, desktop e celular). Para uso local no Claude Code ou Cursor, a mesma rota aceita token pessoal.
4. **Permissões iguais às da UI:** cada ferramenta exige o mesmo papel exigido na tela. Ferramentas que publicam ou alteram algo são marcadas como destrutivas (`destructiveHint`) e **respeitam a política de autonomia** (ADR 0004): o MCP não é um atalho para pular a aprovação.
5. Versão 1 no fim da Fase 1 (pauta + redação); cada fase seguinte acrescenta as suas ferramentas.

## Consequências

- SDK oficial `@modelcontextprotocol/sdk` (TypeScript).
- A spec fica em [specs/mcp-server/spec.md](../../specs/mcp-server/spec.md).
- O Studio pode ser operado pelo celular através do app do Claude, o que ajuda uma equipe pequena.
- Diferencial comercial se o Studio virar produto da AZ Work Center.
