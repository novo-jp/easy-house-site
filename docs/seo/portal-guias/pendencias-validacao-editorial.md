# Pendências de validação editorial

Atualizado em 02/11/2026. Nada desta lista está publicado. Para publicar, confirme o item na fonte proposta, ajuste o texto e troque `status: rascunho` → `publicado` e `needsFactCheck: true` → `false` no arquivo; depois `node build-portal.mjs`.

Status: **aberta** (falta conferir), **corrigida** (o texto novo já traz a versão certa; o DOCX não deve ser copiado), **fora do escopo** (não será publicada).

## 1. Afirmações do DOCX que não foram usadas como estavam

| # | Afirmação | Onde (DOCX) | Motivo | Fonte oficial proposta | Status |
|---|---|---|---|---|---|
| 1 | 司法書士 = "tabelião (judicial)" | cap. 5, etapa 6; cap. 9 | 司法書士 não é tabelião (公証人); é o profissional de registro | 日本司法書士会連合会 — shiho-shoshi.or.jp | corrigida no verbete `/dicionario-imobiliario/shihoshoshi` |
| 2 | O 買付 "garante a posição na fila… vale a ordem de chegada" | cap. 5, etapa 3 | Não há regra legal de ordem de chegada; o vendedor escolhe | 宅地建物取引業法 (e-Gov) | corrigida no verbete `/dicionario-imobiliario/kaitsuke-shomeisho` |
| 3 | Sinal de 5 a 10%; limite de 20% apresentado como regra geral | cap. 5, etapa 4; glossário | O teto de 20% (art. 39) vale só quando o vendedor é 宅建業者 | 宅地建物取引業法 art. 39; 民法 art. 557 (e-Gov) | corrigida no verbete `/dicionario-imobiliario/tetsukekin` |
| 4 | Casa usada "construída a partir de junho de 1982" para a dedução | cap. 7 | Data errada: o critério da dedução é construção a partir de 1º/01/1982 (data do registro) ou certificado sísmico; e a norma sísmica é de junho de 1981 | 国税庁 No.1211-3 (conferido: "昭和57年1月1日以後に建築") | aberta (guia de dedução adiado) |
| 5 | Taxas variáveis 0,95–1,3% e fixa ~3,1% "(julho de 2026)"; exemplo de parcela | cap. 6 | Taxa datada não pode aparecer como atual | sites dos bancos / flat35.com, com data | aberta (EH-ED-014 adiado) |
| 6 | "Taxa básica do BoJ chegou a 1,0% em junho de 2026" | cap. 6 | Fato datado, sem fonte no texto | 日本銀行 — boj.or.jp | aberta |
| 7 | Dedução de 0,7% do saldo por 13 anos, exemplo de ¥210.000 | cap. 7 | Limites, prazos e condições mudam por ano e por tipo de casa | 国税庁 No.1211-1 | aberta (EH-ED-033 adiado) |
| 8 | 不動産取得税: dedução de ¥12 milhões, 3%, exemplo | cap. 8 | Alíquota e redução têm prazo legal; conferir vigência | 地方税法 / 愛知県・三重県 税務 | aberta (EH-ED-032 adiado) |
| 9 | 固定資産税 1,4%; 都市計画税 "até 0,3%" | cap. 9 | 1,4% é a alíquota padrão (cidades podem mudar); reduções para moradia com prazo | 地方税法 / prefeitura | parcial: o índice do dicionário cita só o teto de 0,3% do 都市計画税; resto aberto |
| 10 | "Entrada zero é comum… bancos financiam 100%" | cap. 9 e 11 | Promessa genérica; depende do banco e do perfil | — | corrigida: `/duvidas` diz "varia por banco e por produto" (texto já aprovado) |
| 11 | Acesso a "praticamente qualquer imóvel" via REINS | cap. 5, etapa 2 | Afirmação comercial sem verificação | — | fora do escopo (não usada) |
| 12 | "Estação perto = valor garantido"; "≤10 min mantêm liquidez e preço" | cap. 11 | Promessa de valorização | — | fora do escopo (não usada) |
| 13 | Descontos "de ¥100.000 a ¥500.000" na negociação | cap. 5, etapa 3 | Número sem fonte | — | fora do escopo; `/duvidas` só diz que dá para propor |
| 14 | Associação de bairro "¥200–500/mês"; condomínio "¥15.000–30.000" | cap. 9 e 10 | Valores locais sem fonte | prefeituras | aberta (sem uso) |
| 15 | Registro de herança obrigatório em 3 anos desde 2024 | cap. 11 | Verdadeiro (不動産登記法, reforma de 2024), mas fora da jornada | 法務省 | aberta (sem uso) |
| 16 | "Há financeiras que aceitam a partir de 1 mês no emprego" | cap. 4 | Sem fonte; promessa de aprovação | — | fora do escopo |
| 17 | Trechos sobre financiamento sem visto permanente | cap. 1 (pp. 19–20), cap. 11 (último item), cap. 12 (FAQ) | **Tema excluído** por decisão editorial | — | fora do escopo (bloqueado pelo filtro) |

## 2. Rascunhos escritos (fora do site)

Prévia para revisão: `docs/seo/portal-guias/previa-rascunhos.html` (gerada com `node build-portal.mjs --previa`).

| Rascunho | URL planejada | O que conferir antes de publicar | Fonte proposta | Status |
|---|---|---|---|---|
| EH-ED-009 casa nova, usada ou sob encomenda | `/casa-nova-usada-ou-sob-encomenda` | Garantia de 10 anos do 品確法 (quem responde e de quê); liberação do financiamento em partes na obra (varia por banco); comissão na compra direta | 品確法 art. 94–95 (e-Gov); bancos | aberta |
| EH-ED-010 terreno e direitos | `/terreno-e-direitos-imovel-japao` | Tratamento do 借地権 pelos bancos; 再建築不可; regra de recuo (art. 42, item 2) | 建築基準法 art. 42, 43; 借地借家法 (e-Gov) | aberta |
| EH-ED-011 contrato de compra | `/contrato-compra-imovel-japao` | Ordem das etapas (análise final × contrato do banco); quem marca o 決済 | 宅建業法 art. 35, 37, 39; 民法 art. 557 | aberta |
| EH-ED-017 pré-análise e análise final (inclui 018) | `/pre-analise-e-analise-final-financiamento` | Prazos típicos de cada análise; o que o banco consulta no histórico de crédito | bancos; CIC | aberta |
| EH-ED-022 renda do casal | `/financiamento-renda-do-casal` | Quem tem 団信 e dedução em cada modalidade; quanto da 2ª renda conta | bancos; 国税庁 No.1211-1 | aberta |

Os rascunhos de financiamento (017 e 022) também dependem da **aprovação do responsável**, como os guias de financiamento de 31/10.

## 3. Guias e artigos adiados (não escritos)

EH-ED-013 (impostos), 014 (juros), 032 (不動産取得税), 033 (dedução), 034 (固定資産税), 036 e 107 (seguro), 101 (estação), 103 (comprar × alugar), 104 (erros comuns), 108 (custo anual), 111 (vizinhos), 112 (parcela baixa). Motivo de cada um em `manifesto-resolvido.json` (campo `nota`).

## 4. Fora do portal, ainda em aberto

- Validade nova do certificado de 住宅ローンアドバイザー (renovado em out/2026): `CERTIFICADO_VALIDO_ATE` no `build-conteudo.mjs` e `validoAte` em /entregas.
- Revisor humano nomeado para as páginas (hoje "sem revisor nomeado").
