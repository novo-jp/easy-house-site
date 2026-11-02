# Portal educativo — como manter

O portal tem quatro entradas: **/guias**, **/duvidas**, **/dicionario-imobiliario** e **/blog**. Tudo é gerado por `build-portal.mjs` (raiz do repositório) a partir dos arquivos desta pasta. Não precisa de banco nem de `.env`.

```
docs/seo/portal-guias/
├── conteudo/
│   ├── verbetes/<slug>.md      → /dicionario-imobiliario/<slug>
│   ├── blog/<slug>.md          → /blog/<slug>
│   ├── guias/<slug>.md         → /<slug>   (guias ficam na raiz, como os de 31/10)
│   ├── dicionario-indice.json  → lista do /dicionario-imobiliario
│   └── duvidas.md              → /duvidas
├── manifesto-resolvido.json    decisão para cada um dos 125 candidatos do pacote
├── pendencias-validacao-editorial.md
├── auditoria-inicial.md
└── relatorio-implementacao.md
```

## Rodar

```bash
node build-portal.mjs            # grava as páginas, rss.xml e o trecho do portal no sitemap.xml
node build-portal.mjs --previa   # também grava previa-rascunhos.html (revisão; não vai ao site)
node --test 'tests/*.test.mjs'   # testes, inclusive tests/portal.test.mjs
```

O build **não grava nada** se encontrar problema: campo faltando, description fora de 70–165 caracteres, title acima de 70, título ou URL repetidos, link quebrado, link de texto publicado para rascunho, guia com o mesmo slug de uma página que já existe, ou o tema excluído (`lib/tema-excluido.mjs`) em qualquer texto, inclusive rascunhos.

Depois de rodar, faça commit dos `.md` e das páginas geradas juntos. O teste acusa página desatualizada em relação ao `.md`.

## Frontmatter

Todo `.md` começa com:

```yaml
---
id: EH-ED-053                # id do manifesto (ou EH-DIC-<TERMO> para verbete fora dele)
locale: pt-BR
slug: tetsukekin             # = nome do arquivo
contentType: verbete         # verbete | blog | guia (= pasta)
cluster: contrato
title: …                     # até 70 caracteres
h1: …
description: …               # 70 a 165 caracteres
summary: …                   # frase dos cartões e do "Continue lendo"
sourceFiles:
  - de onde o texto veio
references:
  - Nome da fonte oficial | https://…   # pelo menos uma para publicar
author: EASY HOUSE
reviewer: sem revisor nomeado
publishedAt: 2026-11-02
updatedAt: 2026-11-02        # vira dateModified e lastmod do sitemap
status: publicado            # publicado | rascunho
relatedIds:
  - EH-ED-054                # id de outro item ou caminho do site (/quanto-custa-casa-japao)
tags:
  - contrato
needsFactCheck: false        # true bloqueia a publicação
---
```

Verbetes também têm `termJa`, `reading` (kana), `romaji` e `traducao`.

O corpo é Markdown simples: o texto antes do primeiro `##` vira a caixa de resposta direta; `##` e `###` são seções; `> texto` vira nota; tabelas com `|`; links `[texto](/caminho)`.

## Publicar um rascunho

1. Confira cada afirmação na fonte oficial (lista em `pendencias-validacao-editorial.md`).
2. No `.md`: `status: publicado`, `needsFactCheck: false` e `updatedAt` com a data do dia.
3. `node build-portal.mjs`. O item entra sozinho no hub, no sitemap e, se for do blog, no RSS.
4. Atualize `manifesto-resolvido.json` (status e actualPath) e a lista de pendências.
5. `node --test 'tests/*.test.mjs'`, commit e push.

Os guias de financiamento precisam da aprovação do responsável antes do passo 2.

## Atualizar um texto publicado

Mude o `.md`, troque `updatedAt` e rode o build. Data só muda quando o conteúdo muda: o build não carimba o dia sozinho.

## Novo termo no dicionário

Inclua no `dicionario-indice.json` (`termJa`, `romaji` em Hepburn, `titulo`, `definicao`, `categoria`, `fonte`). Para dar página própria, crie `conteudo/verbetes/<slug>.md` e ponha `"pagina": "<slug>"` no termo. Verbete publicado fora do índice é erro no build.

## Menu, gaveta e rodapé

"Guias" no menu, "Guias, dúvidas e dicionário" na gaveta e a coluna "Aprenda" no rodapé estão em `lib/casas-layout.json`. O espanhol deriva disso em `lib/layout-es.mjs` (o rodapé ES aponta para o portal com o aviso "en portugués"). Ao mudar o layout, troque também o mesmo bloco nas páginas estáticas que o copiam (lista na auditoria) e rode `node build-portal.mjs`.

## Regras que valem sempre

- Nada sobre financiamento sem visto permanente, em nenhuma língua ou superfície.
- Taxas, alíquotas e prazos só com fonte oficial e data; nada de "taxa atual" sem data.
- Região: Aichi, Mie e Gifu. Página local só com estoque real (`/casas-a-venda/<cidade>`).
- Sem depoimento, telefone, endereço, taxa ou caso inventado. Sem promessa de aprovação ou de valorização.
- Não mexer no nome jurídico, registro, rodapé institucional nem em /sobre.
