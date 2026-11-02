# Auditoria inicial — portal de Guias, Dúvidas, Dicionário e Blog

Data: 02/11/2026. Base: repositório do site (`main`) e produção (easyhouse.homes).

## Como o site é montado

| Parte | Onde | Observação |
|---|---|---|
| Hospedagem | Vercel, deploy a cada push em `main` | `cleanUrls: true`, `trailingSlash: false` |
| Páginas estáticas | `*.html` na raiz (PT) e `es/*.html` (ES) | arquivo e pasta com o mesmo nome convivem (`entregas.html` + `entregas/`) |
| Guias de SEO (31/10) | `build-conteudo.mjs` → `guia-comprar-casa-japao.html` etc. | precisa do Supabase (.env.local); texto em `docs/seo/guias/{pt,es}` |
| Busca e fichas de imóvel | funções em `api/` + `lib/casas-html.mjs` | `/comprar/imoveis`, `/imoveis`, `/casas-a-venda/<cidade>` (geradas na hora, com trava de estoque) |
| Menu, gaveta, rodapé | `lib/casas-layout.json` (PT) e `lib/layout-es.mjs` (ES, derivado) | o mesmo bloco está copiado nas páginas estáticas |
| Medição | `casas-comum.js` (cliques em `a[href*="wa.me"]` com `data-cta`) e `analytics.js` (`/api/event` próprio + pixel com consentimento) | não há GA4 |
| Texto para IA | `lib/llms-template.txt` → `/llms.txt` (função) | |
| Sitemaps | `sitemap.xml` (estático), `sitemap-casas.xml`, `sitemap-aluguel.xml` (funções) | |
| Filtro do tema excluído | `lib/tema-excluido.mjs` + `tests/tema-excluido.test.mjs` | varre o repositório inteiro, exceto `docs/`, `tests/` e mídias |
| Documentação | `docs/` | **não vai para a Vercel** (`.vercelignore`), mas é pública no GitHub |

## Rotas existentes que o manifesto propunha recriar

O manifesto propunha tudo sob `/pt/...` com barra final. O site não usa prefixo de idioma para o português nem barra final; criar `/pt/guias/...` duplicaria páginas já indexadas. Decisão: **manter o padrão atual** (PT na raiz, sem barra) e mapear cada candidato para a URL real.

| Candidato | Proposto | Já existia em |
|---|---|---|
| EH-ED-005 guia completo | `/pt/guias/guia-completo-comprar-casa-no-japao/` | `/guia-comprar-casa-japao` |
| EH-ED-006 financiamento | `/pt/guias/financiamento-imobiliario-no-japao/` | `/financiamento-imovel-japao` |
| EH-ED-007 quanto posso financiar | `/pt/guias/quanto-posso-financiar-com-minha-renda/` | `/renda-minima-financiamento` |
| EH-ED-008 e 019 documentos | `/pt/guias/documentos-para-comprar-casa-japao/` | `/documentos-financiamento` |
| EH-ED-012 custos | `/pt/guias/quanto-custa-comprar-casa-no-japao/` | `/quanto-custa-casa-japao` |
| EH-ED-020 haken | `/pt/guias/...haken/` | `/financiamento-trabalho-haken` |
| EH-ED-021 autônomo | `/pt/guias/...autonomos/` | `/financiamento-autonomo` |
| EH-ED-114 a 123 cidades | `/pt/regioes/aichi/<cidade>/` | `/casas-a-venda/<cidade>` (acervo real) |

Não existiam: `/guias`, `/duvidas`, `/dicionario-imobiliario`, `/blog` nem página de verbete.

## Dicionário que já existia

Não havia dicionário no site. O conteúdo aprovado estava no **Dicionário da Casa** (publicador de Reels/feed, fora deste repositório): 56 termos com explicação em português revisada, dica ao comprador e fonte. Os verbetes do portal partem dessas explicações aprovadas. Itens de aluguel (047–051 do catálogo) ainda estão na fila de publicação social. A dica do item 046 (Flat 35) traz o tema excluído e não foi usada; só a explicação neutra.

## Riscos encontrados

1. **Tema excluído no DOCX.** O guia traz o financiamento sem visto permanente em três pontos (cap. 1, cap. 11, último item, e cap. 12, FAQ). Nada disso foi importado. O build recusa gravar qualquer página, rascunho, índice ou dúvida que contenha os trechos vetados, e o teste `tests/portal.test.mjs` repete a checagem.
2. **Números com data.** Taxas de juros (julho/2026), alíquotas, reduções de imposto e prazos de dedução mudam. Nada disso entrou em página publicada; os guias de impostos e juros ficaram adiados (ver `pendencias-validacao-editorial.md`).
3. **Afirmações do DOCX que não se sustentam** (ex.: 司法書士 chamado de "tabelião", "vale a ordem de chegada" no 買付, sinal com limite de 20% como regra geral, data de 1982 para a dedução). Corrigidas nos textos novos e listadas nas pendências.
4. **Duplicação de intenção.** 21 candidatos repetiam a intenção de outro (ex.: guia "O que é 買付証明書" × verbete 買付証明書). Foram consolidados (`duplicateOf` no manifesto resolvido).
5. **Páginas locais sem estoque.** Kani e Minokamo (Gifu) não têm casas no acervo; página regional vazia não foi criada.
6. **Identidade nos metadados.** O menu e o rodapé mostram "EASY HOUSE ｜株式会社movO" e o registro 沖縄県知事(1)第5984号; o JSON-LD de algumas páginas e o `llms.txt` usam "株式会社EASY HOUSE". **Nada foi alterado** — por decisão do responsável, a identidade jurídica do site não é corrigida nesta etapa. As páginas novas usam só a marca "EASY HOUSE" como autora.
7. **Revisor nomeado.** Não há revisor humano nomeado nas páginas; o campo `reviewer` diz "sem revisor nomeado" em vez de inventar um.
