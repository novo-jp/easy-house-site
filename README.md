# EASY HOUSE — Site

Site institucional da EASY HOUSE — imobiliária licenciada no Japão com atendimento em português para brasileiros.

**Produção:** https://easyhouse.homes

## Stack

- HTML/CSS/JS estático (sem build step)
- Tema compartilhado: `theme-v2.css` + `theme-v2.js`
- Listagem de apartamentos: Supabase REST API (tabela `imoveis_aichi`)
- Hospedagem: Netlify (auto-deploy via push em `main`)

## Estrutura

```
.
├── index.html              # Home — hero cinemático, bento grid, sticky scroll
├── sobre.html              # Sobre + dados oficiais JP + galeria
├── landingvendas.html      # Landing de compra (Flat 35)
├── landingaluguel.html     # Landing de aluguel
├── imoveis.html            # Listagem ao vivo Supabase com filtros
├── terms.html / privacy.html
├── theme-v2.css            # CSS compartilhado (nav, footer, cursor, etc)
├── theme-v2.js             # JS compartilhado (interações)
├── shared.css              # CSS antigo (usado por terms/privacy)
├── images/                 # fotos reais (família, equipe, chave, etc)
└── netlify.toml            # config de cache + security headers
```

## Como atualizar o conteúdo

1. Editar HTML diretamente. Pré-visualizar abrindo o arquivo no navegador.
2. `git add . && git commit -m "..." && git push`
3. Netlify deploya automaticamente em ~30s.

## Listagem de imóveis

A página `imoveis.html` busca dados do Supabase tabela `imoveis_aichi` (alimentada pelo scraper DK Portal, que roda automaticamente toda segunda-feira).
