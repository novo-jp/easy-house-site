# EASY HOUSE — Site

Site institucional da EASY HOUSE — imobiliária licenciada no Japão com atendimento em português para brasileiros.

**Produção:** https://easyhouse.homes

## Stack

- HTML/CSS/JS estático (sem build step)
- Tema compartilhado: `theme-v2.css` + `theme-v2.js`
- Listagem de apartamentos: Supabase REST API (tabela `imoveis_aichi`)
- Hospedagem: Vercel — projeto `easy-house-site` (auto-deploy via push em `main`)

## Estrutura

```
.
├── index.html              # Home — hero cinemático, bento grid, sticky scroll
├── sobre.html              # Sobre + dados oficiais JP + galeria
├── landingvendas.html      # Landing de compra (Flat 35)
├── landingaluguel.html     # Landing de aluguel
├── api/aluguel-lista.mjs   # /imoveis — busca de aluguel renderizada no servidor
├── terms.html / privacy.html
├── theme-v2.css            # CSS compartilhado (nav, footer, cursor, etc)
├── theme-v2.js             # JS compartilhado (interações)
├── shared.css              # CSS antigo (usado por terms/privacy)
├── images/                 # fotos reais (família, equipe, chave, etc)
├── api/                    # Serverless Functions (simulate, lead, event)
├── lib/                    # motor financeiro + Meta CAPI
└── vercel.json             # config de cache + security headers
```

## Como atualizar o conteúdo

1. Editar HTML diretamente. Pré-visualizar abrindo o arquivo no navegador.
2. `git add . && git commit -m "..." && git push`
3. O Vercel publica automaticamente em ~30s.

## Listagem de imóveis

### Apartamentos para alugar — `/imoveis`

Renderizada no servidor por `api/aluguel-lista.mjs`, com o mesmo desenho da
busca de casas: filtros como `<form method="get">`, chips e paginação como
links, e `aluguel-busca.js` por cima para não recarregar a página. A lógica
de filtros/facetas/ordenação fica em `lib/aluguel-busca.mjs`, compartilhada
com `/api/aluguel` (JSON). Os dados vêm de `imoveis_aichi` via
`lib/aluguel-fonte.mjs` (chave de serviço, janela de 7 dias, cache de 10 min).
O card (`lib/aluguel-cartao.js`) e o modal "o que está incluso" calculam
custo mensal e entrada com o mesmo `custos.js`.

Testes: `node --test tests/*.test.mjs` (`tests/aluguel-busca.test.mjs`).
Documentação do setor: `docs/ALUGUEL.md`.

### Casas à venda — `/comprar/imoveis`

`api/casas-lista.mjs` + `lib/casas-busca.mjs`; ver comentários nos arquivos.
