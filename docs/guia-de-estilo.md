# Guia de estilo editorial — v1

> Este arquivo é a semente do `StyleGuide` v1 no banco. Depois da Fase 1, a versão viva fica editável na UI do Studio, e este arquivo é só a referência histórica.

## Quem somos

AZ News: política e cidades do Sudoeste da Bahia. Centro: Vitória da Conquista e Itapetinga. Bahia e Brasil entram quando têm impacto ou ângulo local.

## Regras de reescrita

1. **Texto do zero.** Nova estrutura, novas frases, título próprio. Nunca parafrasear frase a frase nem seguir a ordem dos parágrafos da original.
2. **Nenhum fato novo.** Só o que está na fonte. Sem números, nomes, datas, cargos ou relações de causa que a fonte não traga. O que faltar vira item da nota para o editor, nunca texto inventado.
3. **Sem enchimento.** Fonte curta gera matéria curta. Se faltar informação importante, diga na nota para o editor o que apurar.
4. **Citações.** No máximo uma citação direta curta (até ~15 palavras) por fonte. O resto em discurso indireto ("segundo X", "X afirmou que").
5. **Crédito conforme a origem:**

   | Origem (`OriginType`) | Crédito no texto |
   |---|---|
   | `official_release` (prefeitura, câmara, governo, órgão público) | Não |
   | `public_fact` (discurso, sessão, post público em rede social, agenda oficial) | Não |
   | `wire` (agência; dados públicos) | Não para fatos públicos; **sim** para declarações dadas ao veículo ("disse à Folha") — ou omitir a declaração |
   | `exclusive_report` (apuração própria de outro veículo, dados inéditos) | **Sim**, no corpo ("segundo o Política Livre", "dados revelados pelo O Globo") — ou omitir a informação |
   | `exclusive_interview` (entrevista dada a outro veículo) | **Sim**, no 1º ou 2º parágrafo ("em entrevista à Folha de S.Paulo") |
   | `own` (texto da própria equipe) | Não |

   Nunca colocar "Fonte:" no rodapé. O crédito, quando existe, é parte da informação.
6. **Cadeia de cópias.** Se a fonte disser que reproduz outro veículo ("Fonte: Metro1", "As informações são do blog de..."), a origem real é o primeiro da cadeia, e a regra de crédito vale para ele.
7. **Datas relativas** no padrão da imprensa: "nesta quinta-feira (19)", "na terça-feira (17)". Se a fonte não deixa claro o dia, use "nesta semana" e registre na nota para o editor.
8. **Ângulo local.** Quando houver ligação real com o Sudoeste (pessoa, cidade, órgão, impacto), traga para o título ou para o primeiro parágrafo. Quando não houver, não force; sugira na nota um gancho a apurar.
9. **Tom.** Informativo, frases curtas, sem adjetivos de elogio ("competente", "pé-quente"), sem caixa-alta, sem exclamação. Texto de cliente com tom de propaganda vira notícia factual; o tom de torcida vai para a legenda do Instagram, e a nota sugere publicar como "Conteúdo institucional" se o cliente quiser o texto original.
10. **Saúde e segurança.** Nunca acrescentar detalhe que identifique paciente ou vítima além do que o órgão oficial divulgou. Em saúde, manter as orientações oficiais (não interromper tratamento etc.).
11. **Serviço.** Quando a matéria tiver utilidade prática (quem tem direito, passo a passo, telefones), organize em subtítulos e listas.

## Campos de saída

| Campo | Regra |
|---|---|
| Título | Até 90 caracteres, com o fato principal; sem clickbait |
| Linha fina | 1 frase complementando o título, sem repeti-lo |
| Editoria | Uma de: Política, Vitória da Conquista, Itapetinga, Região, Bahia e Brasil, Esporte, Cultura, Serviço, Entrevistas, Opinião |
| Tags | 4 a 8, nomes próprios e temas |
| Slug | Minúsculas, sem acento, até ~60 caracteres, palavras-chave |
| Meta description | Até 155 caracteres, com a palavra-chave e o fato |
| Corpo | Markdown; intertítulos em negrito ou `###`; parágrafos de até 3 frases |
| Nota para o editor | Itens numerados: o que conferir, o que foi omitido e por quê, gancho local, sugestão de apuração própria |
| Checklist | Itens objetivos e verificáveis antes de publicar |
| Legenda do Instagram | Gancho na 1ª linha, até 5 frases, "link na bio", 5 a 10 hashtags (#AZNews sempre) |
