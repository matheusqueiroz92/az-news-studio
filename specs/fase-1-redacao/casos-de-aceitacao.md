# Casos de aceitação — Fase 1 (Redação)

Os 12 casos abaixo foram feitos à mão em 20/11 e 23/11/2026 (documentos "Matérias AZ News — 20/11/2026" e "— 23/11/2026"). O Studio precisa chegar às **mesmas decisões editoriais**. Não comparamos o texto palavra por palavra, mas sim os campos verificáveis.

Os HTMLs das fontes são salvos por `pnpm fixtures:fetch` em `packages/core/test/fixtures/sources/` (pasta no `.gitignore`: é conteúdo de terceiros, só para teste local).

| # | Fonte | `originType` esperado | Crédito no texto | Alertas / notas obrigatórias |
|---|---|---|---|---|
| A1 | politicalivre.com.br — Geddel sinaliza apoio a Antonio Brito (19/11) | `public_fact` (post de Geddel) + trecho `exclusive_report` (nota Radar do Poder sobre Otto Alencar) | Nenhum; o trecho exclusivo é **omitido** | Nota: informação de Otto omitida por ser exclusiva; citação de Geddel só copiando do post original; dia exato do post |
| A2 | politicalivre.com.br — Lula critica especulações sobre ministérios (Folhapress, 19/11) | `wire` | Nenhum obrigatório; nomes cotados tratados como "bastidores" | Nota: local da declaração não informado; nomes cotados vêm de apuração da Folha; gancho Rui Costa |
| A3 | sudoestedigital.com.br — Aluno da Uesb vence maratona da NASA (19/11) | `public_fact` | Nenhum | Alerta de inconsistência: "Instituto Federal Baiano (Ifba)" (IF Baiano ≠ Ifba) → texto usa só "Instituto Federal"; sugestão de apuração própria (frase e foto do aluno); follow-up em 03/12 |
| A4 | pmvc.ba.gov.br — Nova insulina no SUS (19/11) | `official_release` | Nenhum | Campos de serviço (quem tem direito, passo a passo); nota: faltam endereço/horário da Farmácia da Família |
| A5 | politicalivre.com.br — Tereza Cristina sobre futuro da direita (Folhapress, 19/11) | `exclusive_interview` (Folha de S.Paulo) | **Sim**: "em entrevista à Folha de S.Paulo" no 1º parágrafo | Nota: sem ligação regional, sugerir nota curta |
| A6 | Texto próprio — Seleção de Itapetinga viaja para semifinal | `own` | Nenhum | Remover elogios e caixa-alta; "hoje" → data com confirmação; legenda de Instagram com tom de torcida |
| B1 | politicalivre.com.br — BR-319 deve avançar em 2027 (Folhapress, 23/11) | `wire` | Declarações dadas à Folha omitidas (ou "disse à Folha") | Nota: sem ligação regional |
| B2 | politicalivre.com.br — Entrevista Denise Menezes (23/11) | `exclusive_interview` (Política Livre) | **Sim**: "em entrevista ao Política Livre" | Sugestão: convidar para a Entrevista AZ |
| B3 | pmvc.ba.gov.br — Primeiro caso de mpox do ano (22/11) | `official_release` | Nenhum | Invariante de privacidade: perfil do paciente idêntico ao do release; telefones da Vigilância presentes; nota sobre vacina |
| B4 | wsnoticias.com.br — Jerônimo e ajuda humanitária (23/11) | `public_fact` | Nenhum | Matéria **curta** (sem enchimento); nota: faltam data, quantidades e cidades; gancho local (cidades do Sudoeste em emergência) |
| B5 | trbn.com.br — 22 milhões do INSS com prova de vida pelo voto (23/11) | `exclusive_report` via cadeia Tribuna → Metro1 → O Globo | **Sim**: "dados da Dataprev divulgados pela coluna de Lauro Jardim, do O Globo" | Detecção de cadeia de cópias; bloco de serviço marcado na nota como acréscimo a conferir |
| B6 | Texto próprio — Itapetinga 4 x 1 Santa Luz | `own` | Nenhum | Tom de propaganda do prefeito (cliente) removido; nota sugere "Conteúdo institucional"; faltam autores dos gols e local do jogo |

## Critérios gerais (valem para todos)

- Saída válida contra `RewriteOutput` (Zod).
- Similaridade por n-gramas de 8 palavras com a fonte abaixo do limite (padrão 15%).
- Zero `FidelityIssue` com severidade `high` não resolvida na versão aprovada.
- Nenhuma linha "Fonte:" no corpo.
- No máximo uma citação direta por fonte, com até 20 palavras.
