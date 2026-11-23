# ADR 0003 — IA com saída estruturada, checagem de fidelidade e aprovação humana

- Status: aceita
- Data: 2026-11-23

## Decisão

1. A reescrita usa a API do Claude com **saída JSON validada por Zod** (`RewriteOutput` em `packages/contracts`). Saída inválida → nova tentativa com o erro de validação no prompt (máx. 2).
2. O prompt de sistema é montado a partir do **`StyleGuide` ativo** (versionado no banco, editável na UI). Cada `ArticleVersion` registra modelo, versão do guia e custo.
3. Toda versão passa por **checagem de fidelidade** (segunda chamada) que lista afirmações sem respaldo na fonte. Alerta aberto bloqueia a aprovação.
4. **Similaridade** com a fonte é medida localmente (n-gramas de 8 palavras). Acima do limite configurável (padrão 15% de trechos coincidentes), o Studio pede nova reescrita automaticamente uma vez e depois sinaliza para o editor.
5. ~~**Aprovação humana obrigatória** antes de qualquer gravação no WordPress, e o Studio só cria rascunho ou agendamento.~~ **Substituído pelo [ADR 0004](0004-orquestracao-agentica-e-autonomia.md):** o Studio publica direto no WordPress após aprovação humana ou, nos casos permitidos, pela política de autonomia.

## Consequências

- Custo por matéria: duas chamadas de LLM (reescrita + fidelidade). Registrado por chamada.
- O modelo usado fica em variável de ambiente (`LLM_MODEL`), para trocar sem deploy de código.
