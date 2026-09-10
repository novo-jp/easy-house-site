# Mapa de analytics — busca de imóveis

## Pipeline (auditado em 10/09/2026)

```
casas-comum.js → medir(evento, dados)
   ├─ window.dataLayer.push({event, ...dados})          → GTM/GA4 (se instalado na página)
   └─ navigator.sendBeacon('/api/event', {event, sessionId, step, payload})
          └─ api/event.mjs: allowlist de eventos + BLOCKED_KEYS (renda, visto, idade, nome…)
                └─ Supabase REST → tabela `funnel_event` (session_id, event, step, payload)
analytics.js → Meta Pixel só com consentimento; MAPA decide quais eventos vão ao pixel
```

**Prova de chegada:** durante o QA local (dev-server apontando para o Supabase real), consultei
`funnel_event` e os eventos novos e antigos chegaram com o payload esperado:

```
property_compare_view      {"total":3}
property_compare_started   {"total":2,"property_id":"EH-3599031"}
property_list_view         {"modo":"servidor","ordem":"recentes","total":769,"pagina":1}
filter_used                {"filtros":"ordem:preco_asc"}
```

Efeito colateral a declarar: as rodadas do `e2e.py` gravam eventos reais em `funnel_event` (session_id
começa com `S…`, `step` = `/comprar/imoveis`). São poucas dezenas de linhas de teste; nada pessoal.

## Eventos (nomes já usados pelo repositório; os do brief entre parênteses)

| evento | gatilho | propriedades (allowlist) | destino | teste |
|---|---|---|---|---|
| `property_list_view` (property_list_viewed) | HTML inicial carregado (`modo: servidor`); cada resposta da API; "carregar mais" (`modo: carregar_mais`) | `total`, `pagina`, `ordem`, `modo` | funnel_event | e2e: carga e ordenação |
| `search_performed` (property_search_submitted) | submit da busca rápida; aplicar do painel | `filtros`: **só os nomes** dos filtros ativos (`cidades,plantas`) — nunca o texto digitado | funnel_event + pixel `Search` | e2e busca rápida |
| `filter_used` (property_filter_applied / removed) | aplicar do painel; troca de ordem (`ordem:x`); remover chip (`remover:x`); limpar (`limpar`) | `filtros` | funnel_event | e2e chips |
| `search_no_results` (property_zero_results) | resposta com `total = 0` | `filtros` (nomes) | funnel_event | e2e vazio |
| `property_view` (property_detail_viewed) | carga da ficha | `property_id`, `city`, `prefecture`, `price`, `source` (agora `atbb`, antes fixo `reprice`) | funnel_event + pixel `ViewContent` | inspeção |
| `property_favorite` (property_favorited) | toque em Salvar/Salvo | `property_id`, `acao` | funnel_event + pixel `AddToWishlist` | e2e favoritos |
| `favorites_view` | carga de /favoritos | `total`, `disponiveis` | funnel_event | e2e favoritos |
| `property_compare_started` (property_compare_started) **novo** | adicionar à comparação | `property_id`, `total` | funnel_event | e2e comparação (chegou) |
| `property_compare_removed` **novo** | tirar da comparação | `property_id`, `total` | funnel_event | — |
| `property_compare_view` **novo** | carga de /comparar | `total` | funnel_event | e2e comparação (chegou) |
| `whatsapp_click` / `whatsapp_property_click` / `whatsapp_visit_click` (property_contact_clicked) | clique em link `wa.me` (delegado) | `cta_position` (data-cta), `property_id` | funnel_event + pixel `Contact` | teste `pixel-portal` |
| `gallery_open`, `property_share`, `related_property_click` | ficha | `property_id`… | funnel_event | inspeção |
| `property_map_opened` | **não existe** — não há mapa | — | — | — |

## Regras verificadas

- Allowlist de eventos em `api/event.mjs`; evento fora da lista é descartado (400).
- `BLOCKED_KEYS` remove `renda`, `visto`, `idade`, `phone`, `email`, `name`… de qualquer payload.
- Busca livre **nunca** vai para o evento: `search_performed` manda só os nomes dos filtros.
- Localização só no nível cidade/província (público).
- Nenhum pageview duplicado: `property_list_view` do servidor e da API são distinguíveis por `modo`.
- Consentimento: o pixel só carrega após aceite (`analytics.js`); a medição de primeira parte não depende dele
  (comportamento existente, não alterado).
- Nenhuma ferramenta nova ativada.
- Teste `tests/pixel-portal.test.mjs` trava a deriva: todo `medir('x')` nos `casas-*.js` precisa estar
  mapeado para o pixel ou listado como exclusão — os três eventos de comparação estão listados como exclusão.

## Não verificado

- Chegada no GTM/GA4: não há GTM instalado nas páginas do portal (só `dataLayer` em memória).
- Meta Pixel em produção: exige consentimento real e o ID `137135779491997` ativo; não testado nesta tarefa.
