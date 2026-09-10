# Baseline — busca de imóveis `/comprar/imoveis`

Fotografia datada de **10/09/2026**, medida no dev-server local (`node dev-server.mjs`,
porta 3400) contra a base real do Supabase. Tudo aqui foi reproduzido por
instrumento: `baseline/capturar.py` gera as capturas e o `baseline/antes/medidas.json`.
Nada foi estimado.

## Stack real (confirmada por leitura do repositório)

| item | valor |
|---|---|
| raiz | `/Users/NEC/Site Easy House` (git, branch `main`, worktree limpo antes desta tarefa) |
| framework | nenhum — HTML/CSS/JS estático + funções serverless Vercel (`api/*.mjs`, Node ESM) |
| gerenciador de pacotes | nenhum (`package.json` ausente); testes com `node --test tests/` |
| roteamento | `vercel.json`: `cleanUrls`, rewrite `/comprar/imoveis/:slug → /api/casa`; `dev-server.mjs` imita isso |
| dados | Supabase REST, tabela `casas_venda_aichi`, lida por `lib/casas-fonte.mjs` com chave de serviço (só no servidor) |
| view model | `lib/casas.mjs` (`normalizarCasa`, `ehPublicavel`) |
| listagem | `comprar/imoveis.html` estático + `casas-busca.js` + `/api/casas` |
| ficha | `api/casa.mjs` renderiza HTML no servidor |
| favoritos | `favoritos.html` + `casas-favoritos.js`, `localStorage` (`eh_casas_favoritas`) |
| design | `theme-v2.css` (tokens: `--ink`, `--pearl`, `--gold`, `--teal`, `--sakura`; fontes Amaranth / DM Sans / Noto Sans JP) + `casas.css` |
| ícones | SVG inline, sem biblioteca |
| analytics | `casas-comum.js → medir()` → `window.dataLayer` + `sendBeacon('/api/event')` com allowlist; `analytics.js` = Meta Pixel com consentimento |
| instruções locais | não há `AGENTS.md` nem `CLAUDE.md`; não existe pasta `sources/` |
| testes existentes | `tests/financing.test.mjs`, `tests/i18n.test.mjs`, `tests/pixel-portal.test.mjs` |

## Itens da auditoria externa — reprodução

| # | item observado | resultado | evidência |
|---|---|---|---|
| 1 | grade vazia / `aria-busy` no HTML, 100% dependente de JS | **reproduzido** | `semJs.cardsNoHtml = 0`, `gradeAriaBusy = true`, contagem `—` (`lista-390-sem-js.png`) |
| 2 | 44 cidades em chips, sem busca nem agrupamento | **reproduzido** | `chipsCidadeNoPainel = 44` em todos os viewports (`filtros-390.png`) |
| 3 | facetas montadas uma vez; `Mie + Toyota` → zero | **reproduzido** | `casas-busca.js` linha `opcoesMontadas`; `mieToyotaTotal = "0 imóveis"` |
| 4 | botão mobile só `Ver imóveis` | **reproduzido** | `botaoVerImoveis = "Ver imóveis"` |
| 5 | placeholder cortado em 390 px | **reproduzido** (também 320 e 412) | 390: texto 273 px, espaço 194 px; 320: 124 px; 412: 215 px |
| 6 | `pushState` + consulta a cada clique | **reproduzido** | 3 cliques no painel → +3 entradas no histórico, 4 requests à API |
| 7 | 24 cards × ~522 px ≈ 15.369 px; só o título abre a ficha | **reproduzido** | 390: página 15.651 px, card médio 533 px, link do título 21 px. A foto não está dentro de um link; o card é clicável só por `::after` do título |
| 8 | sem mapa, comparação, busca salva, alertas | **confirmado por inspeção** do código | — |
| 9 | `/favoritos` baixa o acervo em chamadas sequenciais | **reproduzido** | 17 requests `porPagina=48` para 1 favorito (`favoritos-390.png`) |
| 10 | ficha sem mapa, sem data de checagem, sem retorno à busca, sem custos | **reproduzido** (parcial) | `temMapa=false`, `temDataChecagem=false`; há link "Casas à venda" nas migalhas, mas não devolve à *mesma* busca |
| 11 | japonês sem `lang="ja"` | **reproduzido** | 17 nós de texto com kana/kanji fora de `[lang="ja"]`; `langJa = 0` |
| 12 | ~13 links de WhatsApp na ficha | **reproduzido** | `waLinks = 13` (390 e 1440) |
| 13 | menu/filtro/lightbox e foco; burger sempre `Abrir menu` | **reproduzido** | `burgerLabel = "Abrir menu"`; `theme-v2.js` nunca troca o rótulo |
| 14 | `aria-current` em `Casas à venda` **e** `Sobre` | **reproduzido** | lista: `["Casas à venda","Sobre"]`; ficha: `["Sobre"]` |
| 15 | metadata promete Gifu; API só tem Aichi e Mie | **reproduzido** | título `Aichi, Gifu e Mie`; facetas `["Aichi","Mie"]` (690 + 79) |

## Forças a preservar (confirmadas)

- 769 imóveis publicáveis, 24 por página, `/api/casas` responde em ~100 ms com cache de 10 min no servidor.
- Estado da busca na URL; favoritos anônimos; `popstate` restaura filtros.
- Ficha renderizada no servidor com breadcrumbs, galeria, Open Graph, `BreadcrumbList` + `Product`, redireciona slug antigo (301), imóvel retirado vira página informativa `noindex` (não 404).
- Skip link, `aria-live` na contagem, `aria-busy`, `prefers-reduced-motion` no painel, no esqueleto e no hover do card.
- Painel de filtros devolve o foco ao fechar; lightbox idem.

## Medidas por viewport (antes)

| viewport | altura da página | card médio | alvo do link do título | placeholder cabe? |
|---|---:|---:|---:|---|
| 320×568 | 15.099 px | 501 px | 21 px | não (273 > 124) |
| 390×844 | 15.651 px | 533 px | 21 px | não (273 > 194) |
| 412×915 | 15.987 px | 547 px | 21 px | não (273 > 215) |
| 768×1024 | 8.327 px | 523 px | 21 px | sim |
| 1440×900 | 6.347 px | 539 px | 21 px | sim |

Ficha 390×844: 8.903 px de altura, 13 links de WhatsApp.

## Outros problemas encontrados no pré-voo (além dos 15)

- **Filtro "Vagas 1+/2+/3+" não filtra nada de útil**: só 7 de 769 imóveis têm número de vagas; 542 têm apenas "有" (tem vaga) e 220 não informam. Como a regra é "não excluir quem não informou", o filtro parece funcionar e devolve quase a lista inteira. Enganoso.
- **"Recomendados"** é `novo desc → fotos desc → preço asc`: ordenação arbitrária com nome que sugere critério.
- **"Menor mensalidade estimada"** ordena igual a "Menor preço" (a estimativa é função monótona do preço). Redundante.
- O card fecha o `<a>` do título com `::after` sobre o card inteiro; o coração depende de `stopPropagation`. Funciona, mas o alvo acessível do link é a linha de 21 px.
- `casas-favoritos.js` comenta "o acervo é pequeno: uma chamada traz tudo" — hoje são 17.
- Ficha usa `source: 'reprice'` na medição e `origem.fonte` default `reprice`; a fonte real é `atbb` em 100% das linhas.
- `sitemap`/`llms` não foram auditados nesta tarefa além de existirem.

## URLs e consultas usadas

- `GET /comprar/imoveis`, `?q=Hekinan&prefeitura=aichi&cidade=nishio,takahama,kariya`, `?prefeitura=mie&cidade=toyota`
- `GET /api/casas?porPagina=1`, `GET /favoritos`, `GET /comprar/imoveis/casa-3ldk-tsu-eh1829057`
- Supabase REST `casas_venda_aichi?select=*` paginado (só no servidor / script local com a chave do `.env.local`, nunca impressa)

## Eventos de analytics existentes (allowlist em `api/event.mjs`)

`property_list_view`, `property_view`, `search_performed`, `search_no_results`, `filter_used`,
`property_favorite`, `favorites_view`, `property_share`, `gallery_open`, `related_property_click`,
`whatsapp_click`, `whatsapp_property_click`, `whatsapp_simulation_click`, `whatsapp_visit_click`.
Não verificado nesta tarefa: se o destino (`/api/event` → Supabase / GTM) recebe de fato; ver `ANALYTICS_MAP.md`.

## Lacunas que impedem afirmação confiável

- **Lighthouse / Web Vitals de campo**: não há Lighthouse instalado (sem npm) nem RUM. Medidas de laboratório só via Playwright (altura, requests, tempo de `networkidle`).
- **Coordenadas**: 0 de 769 linhas têm lat/lng → nenhuma afirmação sobre mapa é possível; não geocodificar sem aprovação.
- **Histórico de preço**: não existe → nenhum selo "preço reduzido".
- **Legenda das fotos**: `fotos_meta` chega com `tipo: "foto"` e legenda vazia para 100% das fotos reais; a classificação fachada/interior/planta existe só no SQLite local do scraper.
