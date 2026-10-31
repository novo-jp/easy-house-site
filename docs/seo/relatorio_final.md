# Relatório final — SEO Tokai (31/10/2026)

Implementação do briefing `EASY_HOUSE_SEO_TOKAI_CLAUDE_CODE.md`: venda de casas em
Aichi, Mie e Gifu para o público brasileiro (pt-BR) e latino (es). Auditoria prévia em
`auditoria_antes.md`; mapeamento completo em `seo_manifest_resolvido.json` / `.csv`.

> ## ⚠️ Antes de tudo: o acervo de casas some em 8/11/2026
>
> A última verificação do ATBB foi em **9/10/2026** (o scraper para no reCAPTCHA).
> Casa não verificada há 30 dias sai do site. Se o scraper não rodar até **8/11**, o
> portal `/comprar/imoveis`, as 84 páginas regionais e as 949 URLs do
> `sitemap-casas.xml` ficam vazios ou dão 404 — e o Google começa a desindexar.
> Nada do que foi feito aqui resolve isso: é a coleta que precisa voltar.

## Números que o briefing pede

| | Quantidade |
|---|---|
| Páginas do briefing (Anexo B) | 134 |
| — publicadas e verificadas em produção | **52** |
| — já cobertas por página existente | 7 |
| — redirecionamento | 1 (`/es` → `/es/casas-en-venta`) |
| — bloqueadas por dados externos (sem estoque) | 26 |
| — rascunho pendente de revisão | 6 |
| — planejadas (backlog) | 42 |
| Rotas **criadas** (URLs novas indexáveis no ar) | **47** — hub, 2 províncias, novas e usadas em PT; hub, 2 províncias, 37 cidades, novas e usadas em ES |
| Rotas **atualizadas** | 37 páginas de cidade PT, `/simular`, `/simular-es`, `/financiamento-imovel-japao`, `/quanto-custa-casa-japao`, `/custo-inicial-aluguel-japao`, `/comprar/imoveis`, rodapé compartilhado, sitemap, llms.txt |
| URLs regionais no sitemap | 84 (42 pares pt/es, com hreflang) |
| Palavras-chave (Anexo G) | 537, **todas com destino** |
| — destino publicado ou existente | 303 (56%) |
| — destino bloqueado por estoque | 129 |
| — destino em rascunho | 33 |
| — destino planejado | 72 |
| Testes do site | 205, todos passando |

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

## Pendências — decisões do dono

| # | Pendência | Por que é sua |
|---|---|---|
| 1 | **Coleta do ATBB** antes de 8/11 | ver o aviso no topo |
| 2 | **Gifu**: estender o scraper à província | 16 páginas do briefing (12 delas P0/P1: província, Kani, Minokamo, Ogaki…) e 79 palavras-chave dependem disso |
| 3 | **Home `/`** redireciona para `/entregas` | o briefing quer home de marca; o hub `/casas-a-venda` cobre a intenção enquanto isso |
| 4 | **Pré-análise com província** (Aichi/Mie/Gifu) | o funil do `/simular` pergunta 7 cidades de Mikawa + "outra"; mexer nele mexe no tráfego pago |
| 5 | **Faixa de preço para quem não tem 永住** no cenário Flat 35 | hoje aparece rotulada "referência" com aviso; mostrar ou não é decisão de produto |
| 6 | **Atendimento presencial em Mie** | as páginas de cidade dizem "a gente visita com você"; confirmar que vale para Suzuka, Yokkaichi, Tsu… |
| 7 | **Revisar os 6 rascunhos** em `docs/seo/rascunhos/` | conteúdo financeiro; o briefing exige revisão humana |
| 8 | **`PLATAFORMAS.html` no histórico do git** (commit `f71c2b9`) | saiu do site e do índice; tirar do histórico exige reescrever o repositório público |
| 9 | **Repositório público** | `docs/seo/` (palavras-chave, estratégia) está visível no GitHub, não no site |

## Backlog (planejado, não iniciado)

- Espanhol dos 6 guias, depois da revisão do português.
- Espanhol de `/quanto-custa-casa-japao` e `/financiamento-imovel-japao` (exige gerador
  bilíngue em `build-conteudo.mjs`).
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
