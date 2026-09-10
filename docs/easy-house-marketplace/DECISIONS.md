# Decisões e trade-offs — busca de imóveis

Cada decisão segue a regra de desempate do brief:
veracidade e segurança → compreensão → utilidade → acessibilidade e desempenho → conversão → beleza → sofisticação técnica.

## Arquitetura

**`/comprar/imoveis` passou a ser renderizada no servidor (`api/casas-lista.mjs`).**
Antes era um HTML estático com a grade vazia. Sem JS não havia imóvel; o Google recebia uma casca.
Agora a mesma URL entrega os 18 primeiros resultados, o formulário de filtros como `<form method="get">`,
os chips como links e a paginação como links. `casas-busca.js` só acelera por cima.
Trade-off: a página deixa de ser um arquivo estático e vira uma função (cache CDN de 10 min, igual à API).
O arquivo antigo foi movido para `docs/easy-house-marketplace/baseline/imoveis.antes.html` como evidência;
o rewrite está em `vercel.json` e replicado em `dev-server.mjs`.

**Uma só lógica de busca (`lib/casas-busca.mjs`) para a API e para a página.** Antes a filtragem morava em
`api/casas.mjs`; agora a mesma função serve JSON e HTML. Se as duas portas divergissem, o link compartilhado
mostraria uma lista e o JS outra.

**Um só card (`lib/casas-cartao.js`), universal.** Roda no Node (servidor, testes) e no navegador. O card do
HTML inicial e o card montado pelo JS eram dois códigos diferentes e já divergiam (coração num, "ver
detalhes" no outro). `lib/` já era servido publicamente (`lib/financing.js`), então não há exposição nova.

**Sem framework, sem bundler, sem dependência nova.** É a stack do repositório. Testes com `node --test`.

## Dados: o que virou filtro e o que não virou

Fonte: `DATA_MAPPING.md`, medido sobre 769 linhas.

| decisão | motivo |
|---|---|
| **Removido** filtro "Vagas 1+/2+/3+" | só 7 de 769 anúncios têm número de vagas; o filtro parecia funcionar e devolvia quase tudo. Enganoso. |
| **Novo** "Com estacionamento" (booleano) | `estacionamento` tem 有/なし em 71%; quem não informou continua aparecendo, e a nota diz quantos são |
| **Novo** "Casa nova / usada" | `construcao_nova` 100% preenchido (649/120) |
| **Novo** "Entrega: imediata / prevista / a combinar" | `entrega` 100% preenchido (597/124/48); "予定 2026年09月下旬" vira "prevista para fim de setembro de 2026" |
| **Novo** "Só com fotos do imóvel" | 290 anúncios não liberam fotos; a imagem é a ficha da Easy House e o card avisa |
| Mantido "Estação até N min" **com aviso** | 70% de cobertura; a nota diz quantos dos resultados atuais não informam e continuam aparecendo |
| **Não** virou filtro: estrutura, pavimentos, direito do terreno | 97%, 92% e 100% iguais — um filtro sem efeito é ruído |
| **Não** virou filtro: zoneamento, situação | possível, mas o público-alvo não decide por 用途地域 na busca; fica na ficha (P1 se houver demanda) |
| **Não existe**: mapa, "preço reduzido", risco, comissão | 0 coordenadas, 0 histórico de preço, 0 dados de risco, comissão vazia. Não se inventa. |
| Texto que é nome de lugar vira filtro de cidade | "Hekinan" digitado com Nishio/Takahama/Kariya marcadas devolvia zero. Agora substitui o filtro de cidade e avisa |

## Ordenação

"Recomendados" era `novo desc → fotos desc → preço asc`: ordem arbitrária com nome que sugeria critério.
Removido. Padrão: **Mais recentes** (`created_at`, 100% de cobertura). Cada ordem tem uma frase de explicação
visível ao lado do select. "Menor mensalidade" removida por ser idêntica a "Menor preço" (a estimativa é função
monótona do preço). Links antigos com `ordem=recomendados`/`mensal_asc` são mapeados, não quebram.
Empates são resolvidos pelo código do imóvel: a ordem é estável entre requests.

Não há conteúdo pago nem relevância algorítmica: `destaque` é `false` em 100% das linhas.

## Interação

**Painel = rascunho.** Mexer nos filtros só atualiza "Mostrar N imóveis" (consulta leve `somenteTotal=1`,
cancelada pela seguinte via `AbortController`). A lista muda ao tocar no botão: 1 `pushState`.
Antes 3 toques = 3 entradas no histórico e 4 requests concorrentes. ESC fecha e descarta o rascunho.

**Reconciliação de facetas a cada resposta.** Opção com zero fica desabilitada e diz o motivo
("Tsu fica em Mie, fora da província escolhida"), em vez de sumir ou de permitir `Mie + Toyota → 0`.

**Cidades agrupadas por província, com busca dentro da lista.** 44 chips soltos viraram dois grupos com
contagem e um campo "Procurar cidade na lista".

**Voltar da ficha volta ao mesmo lugar.** A lista guarda a URL da busca e a rolagem em `sessionStorage`;
a ficha aponta "Voltar para a busca" para essa URL; a lista restaura filtros, ordem, página e rolagem
(`scrollTo` instantâneo, ignorando o `scroll-behavior: smooth` do tema).

**18 por página, "Carregar mais" com `replaceState`.** A página em 390 px caiu de 15.651 para 11.310 px.
"Carregar mais" acrescenta e reescreve a URL com a página atual, para o "voltar" reabrir no mesmo ponto
(no HTML servidor só a página atual; o resto é carregado pelo JS — limitação documentada no QA).

**Sem rolagem infinita, sem mapa, sem busca em linguagem natural.** Mapa: sem coordenadas. NL: sem
infraestrutura segura para enviar texto livre a terceiros; a busca clássica já entende nome de cidade.
Ambos registrados como bloqueados/P2, não simulados.

## Cards

Foto 16:10 com dimensões reservadas; preço total em texto claro (não em cor promocional); 万円 secundário;
estimativa mensal pequena e rotulada "estimativa, não é oferta"; fatos só quando existem; "Verificado em
DD/MM" real (`last_seen_at`). Máximo de dois selos, ambos com regra real: "Novo anúncio" (`created_at` ≤ 14
dias) e "Fotos sob consulta" (`sem_foto_original`). **Um** link acessível de navegação ("Ver detalhes: título",
44 px); a foto também leva à ficha mas sai da ordem de tabulação (`tabindex=-1 aria-hidden`) para não
duplicar parada. Favoritar e comparar são botões com nome e 44 px. O `::after` que fazia o card inteiro
clicável foi removido (armadilha com controles aninhados). O hover não desloca mais o card (ele saía de
baixo do dedo/cursor e quebrava a estabilidade do alvo).

## Ficha

- 13 links de WhatsApp → 8 na página inteira (3 são nav/menu/rodapé). Hierarquia: **"Perguntar sobre este
  imóvel"** (topo, barra fixa, coluna lateral), "Agendar uma visita" secundário. Blocos "simular" duplicados
  removidos. A mensagem leva o código público; nada pessoal.
- Dado relevante ausente aparece como **"Não informado pela fonte — confirme com a Easy House"**
  (estacionamento, caminhada, comissão, 建ぺい率/容積率…). Distingue-se de "não aplicável" pela omissão da linha.
- Nova seção **Fonte e datas**: fonte (ATBB), última verificação, publicado em, código, situação das fotos.
- Nova seção **Preço e custos** com as premissas da estimativa (produto, taxa, prazo, entrada) e o aviso
  literal do brief. Impostos/escritura: "não informados pelo anúncio".
- **Localização**: endereço público do anúncio + "Sem mapa: o anúncio não traz coordenadas". O endereço já
  era exibido antes; mantido — 160/769 chegam ao nível do lote. **Decisão pendente do corretor** se deve ser
  truncado ao bairro (ver riscos).
- Japonês marcado com `lang="ja"` (planta, endereço, estação, reforma, observações, características, 万円, licença).
- Galeria focável pelo teclado; lightbox com foco contido e ESC.

## Acessibilidade e desempenho

- `aria-current="page"` exatamente um por rota: o layout compartilhado não traz mais "Sobre" fixo; quem
  renderiza marca pela URL (`navAtual`). `favoritos.html`/`comparar.html` idem.
- Burger anuncia "Abrir/Fechar menu" (mudança em `theme-v2.js`, compartilhado — comportamento correto para
  todas as páginas).
- Botão WhatsApp: texto branco sobre `#25D366` dava 1,9:1. Nas páginas do portal, texto `#06322E` (≈ 9:1),
  via `casas.css`, sem tocar o tema global.
- Aviso de consentimento (`z-index` máximo) cobria "Mostrar N imóveis" e as setas da galeria em quem ainda
  não respondeu. Com diálogo aberto, o aviso espera (`body.dialogo-aberto .eh-cc{display:none}`).
- Formato de moeda: `¥29.800.000` (pt-BR) em toda a superfície do portal, 万円 ao lado.
- Sem Lighthouse (sem npm no repositório): medidas de laboratório via Playwright — HTML da lista 82 KB
  (18 cards + painel + datalist), 0 requests à API na carga inicial, API 13–19 ms local.

## Analytics

Eventos existentes preservados; novos só para comparação, com allowlist em `api/event.mjs` e classificação
no teste `pixel-portal` como "fora do pixel". Payloads carregam só nome do filtro (nunca o texto digitado),
código público e contagens. Ver `ANALYTICS_MAP.md`.

## O que ficou fora, de propósito

- Ocultar imóvel (opcional no brief): P1. Comparação e favoritos cobrem a necessidade de organizar.
- "Preciso ter" × "seria bom ter" (§8): sem critério determinístico que valha com 44 cidades e 12 plantas
  sem virar score misterioso. Registrado como P1; filtros clássicos mantidos.
- Alertas/conta (§24): sem backend de e-mail/LINE/push; nada inventado.
- Páginas por cidade indexáveis: `?cidade=x` recebe `noindex, follow`; a base sem filtro é indexável com
  `ItemList`. Abrir cidades ao índice pede conteúdo editorial real por cidade — não existe hoje.
- `build-conteudo.mjs` não foi re-executado: ele usa o layout corrigido e vai gerar as páginas editoriais
  sem o "Sobre" fixo na próxima rodada, mas rodá-lo agora reescreveria páginas fora do escopo.
