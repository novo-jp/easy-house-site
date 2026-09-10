# QA — busca e seleção de imóveis (`/comprar/imoveis`)

Data: 10/09/2026. Ambiente: dev-server local (`node dev-server.mjs`, porta 3400) contra o Supabase real
(somente leitura de imóveis; a telemetria de teste gravou linhas em `funnel_event`, ver ANALYTICS_MAP).
**Nada foi publicado, nem merge, nem push, nem alteração de produção.**

## Comandos

```bash
cd "/Users/NEC/Site Easy House"
node --test 'tests/**/*.test.mjs'                                  # 102 testes, 0 falhas
node dev-server.mjs                                                # ou: preview "easyhouse-site" (porta 3400)
python3 docs/easy-house-marketplace/baseline/capturar.py http://localhost:3400 docs/easy-house-marketplace/baseline/antes   # baseline (rodado ANTES das mudanças)
python3 docs/easy-house-marketplace/baseline/e2e.py      http://localhost:3400 docs/easy-house-marketplace/baseline/depois  # 75 verificações, 0 falhas
```

Resultados brutos: `baseline/antes/medidas.json`, `baseline/depois/resultado.json`, capturas em `antes/` e `depois/`.

## 1. Confirmado por teste

### Unitário (`tests/casas-busca.test.mjs`, 28 testes novos; suítes antigas seguem passando: 102/102)

- parsing e serialização de query params (inversa; padrão não vai para a URL); inválido cai no padrão e é
  reportado em `ignorados`; faixa invertida corrigida; parâmetros abusivos limitados (30 valores, 80 chars,
  50 códigos); `precoMax=abc` **não** vira 0 (era um bug encontrado pelo teste);
- combinação de filtros (OU entre cidades, E entre filtros), faixa de preço inclusiva, planta japonesa
  preservada, campo ausente não exclui (estação, estacionamento), novo/usado, entrega, fotos reais,
  `codigos=` em qualquer caixa, busca livre por código e por estação;
- texto que é nome de lugar substitui o filtro de cidade (o caso "Hekinan");
- ordenação: cada ordem com rótulo e explicação, sem "recomendados", estável, nulos por último, paginação
  além do fim volta para a última;
- facetas mantêm opções zeradas com província; `Mie + Toyota → 0` com diagnóstico do filtro que mais pesa;
- formatação `¥29.800.000` / `2.980 万円`, era japonesa → ano, entrega prevista legível, estacionamento
  sim/não/não informado, `verificadoEm` e fonte;
- card: omite ausentes (sem 0/NaN/undefined), um link acessível, foto fora da tabulação, botões separados,
  ≤ 2 selos com regra real, texto do anúncio escapado (XSS).

### Ponta a ponta (`e2e.py`, 75 verificações, 0 falhas)

| área | verificado |
|---|---|
| sem JS | 18 cards no HTML; painel é `<form>` visível; chip remove por link real; vazio com sugestões como links |
| 320 / 390 / 412 / 768 / 1440 | placeholder cabe; sem rolagem horizontal; **um** `aria-current` na nav; alvo "Ver detalhes" ≥ 44 px; foto do card leva à ficha; em ≤ 412 a primeira dobra tem os 3 campos + Buscar |
| busca rápida | "Toyota" vira `cidade=toyota` (1 entrada no histórico), chip "Cidade: Toyota" |
| painel | foco no título ao abrir; 3 toques = 0 entradas no histórico; "Mostrar N imóveis" com N vivo (38 → 16); consultas leves `somenteTotal=1`; opção incompatível desabilitada com motivo ("Tsu fica em Mie, fora da província escolhida"); Tab preso; ESC descarta rascunho e devolve foco; aplicar = 1 pushState |
| chips | rótulo completo ("Planta: 4LDK"); remover tira da URL |
| ficha | abre pela lista; "Voltar para a busca" aponta para a mesma busca; WhatsApp 13 → 8 na página inteira; verificação + fonte; 3 "Não informado pela fonte"; CTA leva o código e nada sensível; lightbox foco/ESC |
| voltar | mesma URL e rolagem restaurada (823 → 840 px) |
| favoritos / comparação | `aria-pressed` + texto; bandeja só no 2º; 4º recusado com aviso; /comparar com 3 colunas, URL só com códigos, 1 request; ◆ + negrito nas diferenças; "não informado"; /favoritos com **1** request `codigos=` (17 antes) |
| consentimento | aviso pendente **não** cobre "Mostrar N imóveis" (defeito real encontrado e corrigido) |
| menu | burger "Abrir menu" ⇄ "Fechar menu" |
| vazio | diz qual filtro pesa (+79 / +38) e oferece remover; "nada muda sozinho" |
| segurança | URL abusiva → 200 com aviso discreto |
| ordenação | "Menor preço" ordena de fato e mostra a explicação |
| reflow | 320 px e texto 200% sem rolagem horizontal; painel idem |
| axe-core 4.10 | 0 violações critical/serious em lista (390 e 1440), lista+painel, ficha, comparação |

### Antes → depois (mesmas medidas, `antes/medidas.json` × `depois/resultado.json`)

| medida | antes | depois |
|---|---:|---:|
| cards no HTML sem JS | 0 | 18 |
| altura da página 390×844 | 15.651 px | 11.310 px |
| altura média do card 390 | 533 px | 474 px |
| alvo do link principal do card | 21 px | 44 px |
| placeholder cortado em 320/390/412 | sim | não |
| entradas no histórico após 3 toques no painel | 3 | 0 |
| requests à API após 3 toques | 4 (lista inteira) | 3 leves (`somenteTotal`, canceláveis) |
| `Mie + Toyota` | 0 imóveis sem explicação | opção desabilitada com motivo + vazio com sugestões |
| /favoritos requests | 17 | 1 |
| links WhatsApp na ficha | 13 | 8 (5 do imóvel, 3 nav/menu/rodapé) |
| japonês sem `lang="ja"` na ficha | 17 nós | 0 (ver nota) |
| `aria-current` na nav | 2 (Casas à venda + Sobre) | 1 |
| título da lista | "Aichi, Gifu e Mie" | "Aichi e Mie \| 769 imóveis" (do acervo) |
| axe critical/serious | não medido | 0 |
| HTML da lista | 95 KB (estático, sem resultados) | 82 KB (18 cards + painel + datalist) |
| requests à API na carga inicial | 1 | 0 |

## 2. Confirmado por inspeção (código lido, não testado por instrumento)

- Filtros rodam no servidor; a chave do Supabase nunca sai do servidor (`lib/casas-fonte.mjs`); parâmetros
  validados em `lerFiltros`; nada de SQL — filtragem em memória sobre a lista já normalizada (como antes).
- `AbortController` cancela a consulta anterior (`consultar()`); resposta obsoleta lança e é ignorada.
- `pushState` só em: submit da busca rápida, aplicar do painel, remover chip, ordenar, paginação.
  `replaceState`: "carregar mais", canonização (texto → cidade). Nada no `input`/`change` do painel.
- Cache: API e página `s-maxage=600, stale-while-revalidate` (igual ao existente); `carregarCasas` em memória
  10 min. Invalidação continua por tempo, não por mudança do imóvel (comportamento pré-existente).
- Estimativa: premissas exibidas (produto, taxa, prazo, entrada) + aviso literal; sem renda/dívida/visto em
  lugar nenhum; `simular` linkado.
- JSON-LD: `CollectionPage` + `ItemList` (10 primeiros) na lista; `BreadcrumbList` + `Product` na ficha
  (existentes, mantidos); lista filtrada `noindex, follow`; canonical sempre a base.
- Imóvel indisponível: página informativa `noindex`, com data da última verificação (mantido e ampliado).
- Sem mudanças em `sources/` (a pasta não existe), sem migração, sem índice, sem dado inventado.

## 3. Inferência / proposta (não medido)

- **Core Web Vitals**: sem Lighthouse nem RUM no repositório. Inferência a partir do que muda: LCP tende a
  melhorar (primeiro card no HTML com `fetchpriority=high`, sem esperar JS + API); CLS tende a zero nos
  cards (`aspect-ratio` + `width/height`); INP: as interações do painel não bloqueiam (fetch leve). Precisa
  ser medido em campo antes de qualquer afirmação numérica.
- Lista **desktop** com 18 por página: proposta; o brief pede "quantidade adequada após teste" e o teste
  com pessoas ainda não aconteceu.
- Ocultar imóvel, "preciso ter/seria bom ter", alertas: propostas P1 (ver DECISIONS).

## 4. Bloqueado / não verificado

- **Mapa**: 0 de 769 linhas têm coordenadas. Não geocodificar sem aprovação (custo/provedor/termos).
- **Preço reduzido**: sem histórico de preço na base. Proposta aditiva: tabela `casas_preco_hist` alimentada
  pelo sender do scraper (não criada, não aplicada).
- **Legenda das fotos (fachada/interior/planta)**: existe no SQLite do scraper, não chega ao Supabase.
  Galeria não rotula a planta baixa. Correção é no sender (`enviar_supabase.py`), fora deste repositório.
- **Busca em linguagem natural (P2)**: não implementada; nenhuma caixa falsa foi exibida.
- **Teste de usabilidade**: roteiro pronto (`USABILITY_TEST.md`), não aplicado.
- **Leitor de tela real** (VoiceOver/TalkBack): não executado; a verificação foi axe + nomes acessíveis +
  ordem de foco por instrumento.
- **"Carregar mais" sem JS**: o link vai para a página seguinte (paginação clássica); só com JS acrescenta.
  Ao voltar, a URL guarda a página atual, mas as páginas anteriores carregadas por "carregar mais" não
  são recompostas pelo HTML do servidor.
- `aria-current="page"` também existe na **paginação** (página atual), como manda ARIA; o critério "um por
  rota" foi lido como referente ao menu do site, que agora tem exatamente um.
- **Endereço no nível do lote** em 160/769 fichas: comportamento pré-existente mantido; decidir se trunca
  ao bairro é do corretor (ver riscos no resumo final).
- Vercel: o rewrite `/comprar/imoveis → /api/casas-lista` foi testado no `dev-server.mjs`, que imita o
  `vercel.json`; em produção precisa de um deploy de preview para confirmar que a função vence o filesystem
  (o arquivo estático foi removido do caminho justamente para isso).

## Falhas conhecidas / pendências

- `docs/easy-house-marketplace/` está no `.vercelignore` novo (só essa pasta) para as capturas não subirem.
- Telemetria de teste gravada em `funnel_event` durante o QA (poucas dezenas de linhas, `step=/comprar/imoveis`).
- Os testes `e2e.py` dependem de rede para o axe-core (cdnjs).

## Pós-deploy — produção (10/09/2026, push `7f7be45` às 20:37, no ar às 20:37:55)

Comandos:

```bash
python3 docs/easy-house-marketplace/baseline/auditoria_producao.py https://easyhouse.homes   # 40 verificações HTTP
python3 docs/easy-house-marketplace/baseline/e2e.py https://easyhouse.homes producao        # 75 verificações com navegador
```

Resultados: `baseline/producao/auditoria.json`, `baseline/producao/resultado.json`, capturas em `producao/`.

**Confirmado em produção**

- O rewrite `/comprar/imoveis → /api/casas-lista` venceu o filesystem da Vercel: título gerado do acervo
  ("Aichi e Mie | 769 imóveis"), 18 cards no HTML sem JS, formulário de filtros no HTML.
- `/comprar/imoveis.html` não serve mais a página antiga.
- Cabeçalhos de segurança preservados; `docs/easy-house-marketplace/` **não** publicado (404).
- Cache da CDN funciona: 1ª chamada `x-vercel-cache: MISS` (~1 s, função em `iad1`), 2ª `HIT` (`age: 1`).
  A Vercel reescreve o `Cache-Control` visível para `public` — é o comportamento dela, não um defeito; a única
  "falha" da auditoria HTTP (39/40) foi essa expectativa do script.
- Casos do baseline: Hekinan → 26 resultados com aviso; `Mie + Toyota` → vazio com sugestões e motivo;
  URL inválida → 200 com aviso; lista filtrada `noindex, follow`.
- API: facetas novas, `somenteTotal`, `codigos=`, `verificadoEm`/`entregaClasse` nos itens; sem `recomendados`.
- Ficha: fonte + verificação, 8 links de WhatsApp, um `aria-current`, 67 `lang="ja"`, JSON-LD, voltar à busca;
  ficha inexistente → 404 informativo `noindex`.
- `/favoritos`, `/comparar` (noindex), `lib/casas-cartao.js`, `casas-busca.js`, `casas.css`, `theme-v2.js` na versão nova.
- Sitemap de imóveis: 770 URLs; robots ok.
- **e2e com navegador: 75/75**, axe 0 critical/serious em lista (390/1440), painel, ficha e comparação.
  Voltar da ficha em produção usa o bfcache do Chrome: URL igual e rolagem a 76 px do ponto de saída
  (tolerância do teste ampliada de 60 para 120 px por isso).

**Observações de produção (não são regressões)**

- Latência: função em `iad1` (EUA) para público no Japão — MISS de ~1 s na lista e 300 ms na API;
  com cache, dezenas de ms. Recomendação, sem aplicar: `"regions": ["hnd1"]` no `vercel.json`
  (decisão de infraestrutura, pede aprovação).
- A auditoria com navegador gravou eventos de teste em `funnel_event` (session_id `S…`, `step=/comprar/imoveis`).
