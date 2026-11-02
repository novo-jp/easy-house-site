# Relatório de implementação — portal educativo

Data: 02/11/2026. Pacote: PACOTE_CLAUDE_CODE_PORTAL_GUIAS_EASYHOUSE_2026 (manifesto com 125 candidatos).

## Resumo

| | Quantidade |
|---|---|
| Propostas no manifesto | 125 |
| URLs novas indexáveis (no sitemap) | **40** — 4 hubs, 3 guias, 27 verbetes, 6 artigos |
| …das quais fora do manifesto | 6 verbetes (契約不適合責任, 登記, 抵当権, 接道義務, 用途地域, 検査済証) |
| Candidatos respondidos dentro de um hub (âncora, sem URL própria) | 36 — 11 em /duvidas, 25 no índice do dicionário |
| Candidatos que já tinham URL (mantida, não duplicada) | 17 — 7 guias + 10 páginas de cidade |
| Duplicatas consolidadas | 21 |
| Rascunhos escritos, fora do site | 2 (financiamento; os outros 3 foram revisados e publicados em 02/11) |
| Adiados (dependem de validação) | 13 |
| Não criados (sem estoque) | 2 — Kani e Minokamo |
| URLs existentes atualizadas | 18 arquivos estáticos (só menu/rodapé) + páginas geradas na hora (busca, fichas, cidades) via `lib/casas-layout.json` |

Rascunho não conta como publicado. A decisão item a item está em `manifesto-resolvido.json`.

## URLs novas (indexáveis)

- Hubs: `/guias`, `/duvidas`, `/dicionario-imobiliario`, `/blog` (+ `/rss.xml`)
- Guias (revisados pelo responsável): `/casa-nova-usada-ou-sob-encomenda`, `/terreno-e-direitos-imovel-japao`, `/contrato-compra-imovel-japao`
- Dicionário: `/dicionario-imobiliario/` + baibai-keiyaku, chukai-tesuryo, hikiwatashi, hon-shinsa, jitsuin, jizen-shinsa, juuyo-jiko-setsumei, kaitsuke-shomeisho, keiyaku-futekigo-sekinin, kenpeiritsu, kensazumisho, kessai, loan-tokuyaku, naiken, setback, setsudo-gimu, shakuchiken, shigaika-chosei-kuiki, shihoshoshi, shin-taishin, shoyuken, teitoken, tetsukekin, toki, tsubo, yosekiritsu, yoto-chiiki
- Blog: `/blog/` + como-ler-anuncio-imobiliario-japones, o-que-significa-3ldk, checklist-primeira-visita-casa, hazard-map-antes-de-comprar, casa-usada-antiga-e-terremoto, perguntas-para-imobiliaria-antes-contrato

## URLs existentes alteradas

Só o menu ("Guias"), a gaveta do celular e o rodapé (coluna "Aprenda"); o conteúdo não mudou e as datas não foram recarimbadas:
`/guia-comprar-casa-japao`, `/financiamento-imovel-japao`, `/renda-minima-financiamento`, `/documentos-financiamento`, `/financiamento-trabalho-haken`, `/financiamento-autonomo`, `/quanto-custa-casa-japao`, `/custo-inicial-aluguel-japao`, `/comparar`, `/favoritos`, `index.html` (só menu), e o rodapé das 7 páginas em espanhol (`/es/...`, coluna "Guías (en portugués)").

Não alterados: `/sobre`, `/entregas`, `/simular`, `/simular-es`, o redirecionamento de `/` e o funil pago.

Outros arquivos: `sitemap.xml` (bloco do portal entre marcadores), `lib/llms-template.txt` (seção do portal), `theme-v2.css` (menu com 6 itens: sem quebra de linha e troca para o menu hambúrguer abaixo de 1000 px, antes 900 px) e `theme-v2.js` (fecha a gaveta acima de 1000 px).

## Como foi feito

- `lib/portal.mjs` (modelo das páginas) e `build-portal.mjs` (gerador). Mesmo visual do site (theme-v2 + casas.css), mesmo menu e rodapé.
- Cada página publicada tem: title, description, canonical, h1 único, resposta direta no topo, sumário (guias/artigos longos), fontes oficiais com link, aviso de atualização, CTA de WhatsApp medido (`data-cta`: `portal_dicionario`, `blog_contact_click`, `guide_cta_click`) e o simulador, "Continue lendo" com links internos e JSON-LD (Article/BlogPosting + BreadcrumbList; DefinedTerm nos verbetes; DefinedTermSet, Blog e CollectionPage nos hubs). Sem hreflang: o portal só existe em português.
- O /duvidas não usa FAQPage em JSON-LD: a página é um índice de respostas curtas com link para a explicação completa.
- Fontes conferidas: leis no e-Gov (宅建業法 art. 34-2, 35, 37, 39, 46; 民法 art. 557; 建築基準法 art. 42, 43, 52, 53; 借地借家法 art. 3 e 22; 都市計画法; 品確法; 不動産登記法; 計量法), MLIT, 国土地理院, 国税庁, províncias de Aichi e Mie, 日本司法書士会連合会, JHF (flat35.com), CIC. Todas as URLs devolveram 200 em 02/11/2026.
- Dicionário: 98 termos em 9 categorias, escrita japonesa + romaji Hepburn + definição; 27 com página própria. As explicações partem do Dicionário da Casa já revisado.

## Busca simulada (cliques a partir de qualquer página)

| Busca | Caminho | Cliques |
|---|---|---|
| "como comprar casa" | Menu **Guias** → etapa 1 → "Como comprar casa no Japão sendo estrangeiro" | 2 |
| "documentos financiamento" | Menu **Guias** → etapa 2 → "Documentos para financiar casa no Japão" (ou /duvidas, filtro "documentos") | 2 |
| "qual a diferença entre 事前審査 e 本審査" | Rodapé **Dúvidas frequentes** → a pergunta já está aberta na página, com links para os dois verbetes; ou **Guias** → etapa 2 → 事前審査 | 1–2 |
| "o que é 手付金" | Rodapé **Dicionário imobiliário** → filtro "手付金" ou "sinal" → página do verbete | 2 |
| "quanto custa comprar casa" | Menu **Guias** → etapa 1 → "Quanto custa comprar uma casa no Japão" | 2 |

O filtro do /duvidas e do /dicionario-imobiliario aceita português, romaji e japonês (testado com 事前審査, 審査, 手付金, "sinal", "documentos").

## Build e testes

```
node build-portal.mjs --previa
  publicados: 27 verbetes, 6 artigos, 3 guias + 4 hubs
  dicionário: 98 termos no índice
  dúvidas: 23 perguntas
  rascunhos (fora do site): 2

node --test 'tests/*.test.mjs'
  inclui tests/portal.test.mjs (21 testes) e tests/tema-excluido.test.mjs; todos passando
```

Conferido no navegador (servidor local): hubs e verbetes no computador (1280 px), no tablet (905–1001 px, menu) e no celular (375 px, sem rolagem horizontal).

## Pendências

Ver `pendencias-validacao-editorial.md`: 2 rascunhos de financiamento aguardando aprovação, 13 adiados (impostos, juros, seguro, custos anuais, estação, comprar × alugar, erros comuns, vizinhos, parcela) e as afirmações do DOCX que não foram usadas.

Nenhum ranqueamento é prometido: as páginas estão indexáveis e no sitemap; a posição na busca depende do Google.
