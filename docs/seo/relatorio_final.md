# Relatório final — SEO Tokai (31/10/2026)

Implementação do briefing `EASY_HOUSE_SEO_TOKAI_CLAUDE_CODE.md`: venda de casas em
Aichi, Mie e Gifu para o público brasileiro (pt-BR) e latino (es). Auditoria prévia em
`auditoria_antes.md`; mapeamento completo em `seo_manifest_resolvido.json` / `.csv`.

> **Atualização 31/10/2026, tarde.** A coleta do ATBB rodou hoje (750 casas de Aichi e 56
> de Mie verificadas), então o prazo de 8/11 deixou de valer. Ele volta sempre que a coleta
> parar: casa não verificada há 30 dias sai do site. Os 6 guias foram aprovados e publicados,
> com as versões em espanhol, e as decisões abertas foram fechadas (ver "Decisões").

## Números que o briefing pede

| | Quantidade |
|---|---|
| Páginas do briefing (Anexo B) | 134 |
| — publicadas e verificadas em produção | **66** |
| — já cobertas por página existente | 7 |
| — redirecionamento | 1 (`/es` → `/es/casas-en-venta`) |
| — bloqueadas por dados externos (sem estoque) | 26 |
| — planejadas (backlog) | 34 |
| Rotas **criadas** (URLs novas indexáveis no ar) | **61** — 47 regionais, 6 guias em português, 6 guias e 2 páginas-pilar em espanhol |
| Rotas **atualizadas** | 37 páginas de cidade PT, `/simular`, `/simular-es`, `/financiamento-imovel-japao`, `/quanto-custa-casa-japao`, `/custo-inicial-aluguel-japao`, `/comprar/imoveis`, rodapé compartilhado, sitemaps, llms.txt |
| URLs regionais no sitemap | 84 (42 pares pt/es, com hreflang) |
| Páginas de conteúdo bilíngues | 16 (8 pares pt/es, com hreflang) |
| Palavras-chave (Anexo G) | 537, **todas com destino** |
| — destino publicado ou existente | **354 (65%)** |
| — destino bloqueado por estoque | 129 |
| — destino planejado | 54 |
| Testes do site | 223, todos passando |

**Por que 37 cidades e não 21:** o acervo tem mais cidades de Aichi e Mie com 5+ casas do
que o briefing listou (Seto, Inuyama, Ama…). Estão nas províncias do escopo e passam no
mesmo gate de estoque.

## O que foi publicado

| Página | Português | Espanhol |
|---|---|---|
| Hub (províncias, cidades, 7 etapas da compra) | `/casas-a-venda` | `/es/casas-en-venta` |
| Província | `/casas-a-venda/aichi`, `/mie` | `/es/casas-en-venta/aichi`, `/mie` |
| Cidade (37) | `/casas-a-venda/<cidade>` | `/es/casas-en-venta/<ciudad>` |
| Casas novas (新築) | `/casas-novas` | `/es/casas-nuevas` |
| Casas usadas (中古) | `/casas-usadas` | `/es/casas-usadas` |

Tudo gerado do acervo a cada pedido (`lib/casas-cidade.mjs`), servido pela função que já
existia (`api/casas-lista.mjs`) — o projeto continua com 11 de 12 funções.

**Por que não são doorway pages:** o que muda de uma página para outra são os números do
lugar — quantas casas, faixa e mediana de preço, plantas, estações, as casas em si. Duas
cidades compartilham ~43% do texto (menu, rodapé, avisos); as antigas `/simular/<cidade>`
compartilhavam 99,8%. Conteúdo local verificável: residentes brasileiros por cidade
(dez/2025, 在留外国人統計, conferidos um a um), com fonte, nas páginas em português.

**Gate:** 5+ casas → sitemap; 1 a 4 → página com `noindex`; 0 → 404.

**Técnico:** canonical autorreferente, hreflang `pt-BR`/`es`/`x-default` recíproco (HTML e
sitemap), `RealEstateAgent` com os dados do `/sobre`, `BreadcrumbList`, `ItemList`. Sem
FAQ schema (o briefing desaconselha). Sem `meta keywords`.

**Links internos:** rodapé compartilhado (centenas de páginas) leva a "Casas por cidade",
novas, usadas e Español; a busca de casas leva às províncias e tipos; `/simular` e
`/simular-es` levam aos hubs; cada cidade leva às outras da mesma província.

## Testes e verificação

- `node --test tests/` — 205 testes. Novos: escopo (Shizuoka fora, Gifu sem página),
  colisão cidade/província (`gifu-shi`), bairro (区) fora do nome, nova = 新築 do anúncio,
  hreflang recíproco, nada de português nas páginas em espanhol, comunidade só em PT com
  fonte, regra do Flat 35 nas duas línguas, WhatsApp só com a cidade, sitemap só com o que
  passa no gate e sempre em par.
- Varredura em **produção**: 84 URLs, 585 destinos de link — nenhum quebrado; H1 único,
  canonical próprio, `lang` certo, hreflang recíproco, título 30–80 e descrição 80–200
  caracteres, nenhuma frase proibida.
- axe (WCAG 2 A/AA) sem violação séria; sem rolagem horizontal em 390 e 1440 px.

## Correções de conformidade feitas no caminho

1. **Simulador** — Flat 35 aparecia como produto para quem não tem 永住 (`a5d37bb`).
2. **`/financiamento-imovel-japao`** — a regra do Flat 35 estava omitida (`2a2fd19`).
3. **`docs/` publicada na web**, inclusive o mapa de plataformas (`79dba83`).

## Guias publicados (aprovados em 31/10/2026)

| Português | Espanhol |
|---|---|
| `/guia-comprar-casa-japao` | `/es/guia-comprar-casa-japon` |
| `/financiamento-sem-eijuken` | `/es/hipoteca-sin-residencia-permanente` |
| `/financiamento-trabalho-haken` | `/es/hipoteca-trabajo-haken` |
| `/financiamento-autonomo` | `/es/hipoteca-trabajador-independiente` |
| `/renda-minima-financiamento` | `/es/ingresos-para-hipoteca` |
| `/documentos-financiamento` | `/es/documentos-hipoteca` |
| `/quanto-custa-casa-japao` (já existia) | `/es/gastos-comprar-vivienda` |
| `/financiamento-imovel-japao` (já existia) | `/es/financiamiento-hipotecario-tokai` |

Aprovados sem resposta às marcas [CONFIRMAR]: saíram as perguntas; ficou só a versão
genérica das frases que dependiam delas (ex.: "cada banco tem regras para compor
renda"), e os valores de selo, não confirmados, saíram. Texto-fonte em
`docs/seo/guias/{pt,es}/`; para mudar, editar o `.md` e rodar `node build-conteudo.mjs`.

## Decisões (31/10/2026)

| Tema | Decisão |
|---|---|
| Home `/` | Continua redirecionando para `/entregas` |
| Pré-análise com província | Não mexer no funil do tráfego pago — fica sem província |
| Atendimento em Mie | Confirmado: Suzuka, Yokkaichi e Tsu |
| Guias | Aprovados e publicados |
| Certificado 住宅ローンアドバイザー | Renovado — **falta a nova data de validade** (ver abaixo) |

## Pendências

| # | Pendência | Quem |
|---|---|---|
| 1 | **Nova validade do certificado.** A `/entregas` esconde o bloco a partir de 1/11, e a frase da página de financiamento só sai se gerada dentro da validade. Com a foto do certificado novo: atualizar `validoAte` (app, `lib/content/claims.ts`), `CERTIFICADO_VALIDO_ATE` (`build-conteudo.mjs`) e a foto | Easy House envia; equipe aplica |
| 2 | **Gifu**: estender o scraper do ATBB à província | 16 páginas do briefing e 79 palavras-chave dependem disso |
| 3 | **Faixa de preço para quem não tem 永住** no cenário Flat 35 — hoje rotulada "referência", com aviso | decisão de produto |
| 4 | **`PLATAFORMAS.html` no histórico do git** (commit `f71c2b9`) | reescrever o histórico do repositório público é decisão do dono |
| 5 | **Repositório público**: `docs/seo/` (palavras-chave, estratégia) está visível no GitHub, não no site | dono |

## Backlog (planejado, não iniciado)

- Guias P1: alugar ou comprar, bancos para estrangeiros, nova ou usada, checklist de
  visita, comprar sem entrada, sem falar japonês, 事前審査 × 本審査, seishain, Flat 35,
  glossário, impostos, juros fixos × variáveis, somar renda.
- Guias P2: 3LDK × 4LDK, manutenção, tempo do financiamento, restrição no nome.
- Eventos do briefing (`seo_cta_click`, `lead_form_start`…): hoje a medição já registra
  visita e clique no WhatsApp por página (o idioma e a cidade estão na URL), e os CTAs das
  páginas novas têm `data-cta`. Criar eventos próprios só se o GA4 for ligado.

## Lista de verificação manual (Search Console e Google Business Profile)

Não feitas aqui — exigem login nas contas.

**Search Console**
1. Confirmar que a propriedade `easyhouse.homes` está verificada.
2. Enviar `https://easyhouse.homes/sitemap-casas.xml` (agora com as páginas regionais e
   hreflang) e `sitemap-aluguel.xml`.
3. Inspecionar e pedir indexação de: `/casas-a-venda`, `/casas-a-venda/aichi`,
   `/casas-a-venda/nishio`, `/es/casas-en-venta`, `/es/casas-en-venta/suzuka`.
4. Em 2 a 4 semanas: relatório "Páginas" (quantas indexadas), "Desempenho" filtrando
   por página (`/es/`, `/casas-a-venda/`) e por país Japão.
5. Ver se aparecem erros de hreflang em "Segmentação internacional" (se o relatório
   existir na conta).

**Google Business Profile**
1. Endereço igual ao do site: 愛知県碧南市入船町4-37-2.
2. Site do perfil apontando para uma página útil (sugestão: `/casas-a-venda`, já que `/`
   redireciona para `/entregas`).
3. Categoria principal: imobiliária (不動産業者). Idiomas de atendimento na descrição.
4. Não criar perfis para cidades sem escritório.

## Atualização editorial (para a equipe)

- **Taxas e regras de financiamento** vivem em `lib/financing-config.json` (versão 2,
  vigente desde 05/08/2026). Mudou a taxa de referência ou o comprometimento? Mude lá: o
  simulador, `/financiamento-imovel-japao` (rodar `node build-conteudo.mjs`) e as páginas
  regionais usam o mesmo número.
- **Regra do Flat 35 para estrangeiros** (só 永住者/特別永住者): JHF FAQ 308. Reconferir a
  cada 6 meses; se mudar, mudar `residencyStatusesAccepted` e o aviso em `lib/financing.js`.
- **Residentes brasileiros por cidade** (`BRASILEIROS` em `lib/casas-cidade.mjs`): o
  在留外国人統計 sai duas vezes por ano no e-Stat. Atualizar os números e a data juntos.
- **Etapas da compra** vêm de `lib/acompanhamento-modelos.json`; se o processo mudar no
  painel, o hub muda junto.
- **Nunca publicar:** aprovação garantida, 100% financiado, renda mínima universal, banco
  citado sem autorização, taxa sem fonte e data.
