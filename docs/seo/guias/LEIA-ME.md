# Guias — texto-fonte das páginas publicadas

Estes arquivos **são** as páginas `/guia-comprar-casa-japao`, `/financiamento-*`,
`/renda-minima-financiamento`, `/documentos-financiamento` e as versões em espanhol em
`/es/...`. Aprovados pela Easy House em 31/10/2026.

**Para mudar um texto:** editar o `.md` (em `pt/` e no par em `es/`) e rodar, na raiz:

    node build-conteudo.mjs

O script gera o HTML com menu, data de atualização, hreflang e dados estruturados.
Formato aceito: `#`, `##`, `###`, parágrafos, listas (`-` e `1.`), tabelas, `**negrito**`,
`*itálico*`, `[link](/url)`, e as chamadas `[CTA] Rótulo → /url` e
`[CTA] WhatsApp ("mensagem")` na seção "Próximo passo". Nas páginas em espanhol, os links
para páginas em português viram o par em espanhol sozinhos.

**Guia novo** só entra depois de aprovado — conteúdo financeiro exige revisão humana
(briefing §11). Nunca publicar: aprovação garantida, 100% financiado como promessa, renda
mínima universal, banco citado sem autorização, taxa sem fonte e data.
