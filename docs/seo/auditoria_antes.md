# Auditoria antes da implementação — SEO Tokai

**Data:** 31/10/2026 · **Briefing:** `EASY_HOUSE_SEO_TOKAI_CLAUDE_CODE.md` (fora do repositório,
que é público — ver relatório final) · **Fase 0 do briefing:** descobrir o site real antes de mudar.

## 1. Stack e rotas

| Item | Real |
|---|---|
| Hospedagem | Vercel, deploy a cada push em `main` (`novo-jp/easy-house-site`, **público**) |
| Framework | Nenhum: HTML estático + funções Node em `api/*.mjs` (11 de 12 do plano) + rewrites em `vercel.json` |
| `SITE_URL` | `https://easyhouse.homes` — em `lib/casas-html.mjs` (`SITE`), canonicals, sitemaps e `/sobre`. Conferido: responde 200 com HTTPS |
| i18n | Só `/simular-es` (espanhol, mesmo funil via `i18n.js`). Nenhuma página `ja` |
| Imóveis | `/comprar/imoveis` (casas, Supabase `casas_venda_aichi`, função `casas-lista`) e `/imoveis` (aluguel); ficha por imóvel em `/comprar/imoveis/<slug>` e `/imoveis/<slug>` |
| Sitemaps | `/sitemap.xml` (estático), `/sitemap-casas.xml` e `/sitemap-aluguel.xml` (gerados) |
| robots.txt | Libera tudo exceto `/admin-taxas`, `/acompanhamento`, `/api/`; declara os 3 sitemaps |
| Medição | `analytics.js` em todas as páginas: `lp_view` e `lp_whatsapp_clicked` com `landing = pathname` → `funnel_event`. Pixel Meta só com consentimento |

## 2. Páginas existentes que cobrem intenções do briefing

| Intenção do briefing | Página existente | Decisão |
|---|---|---|
| Home PT `/pt/` | `/` — hoje **redireciona (307) para `/entregas`** | Manter; pendência do dono |
| Simulador PT/ES | `/simular`, `/simular-es` | Reaproveitar (URL das campanhas pagas) |
| Pré-análise PT/ES | Funil completo do `/simular` (renda, dívidas, contato, consentimento) | Reaproveitar; falta seleção de província |
| Custos de compra | `/quanto-custa-casa-japao` (gerada do banco) | Reaproveitar |
| Financiamento (pilar) | `/financiamento-imovel-japao` (gerada do banco) | Reaproveitar e corrigir (Flat 35) |
| Cidades | `/casas-a-venda/<cidade>` (criadas na manhã de 31/10) | Reaproveitar e ampliar |
| Províncias, novas, usadas, tudo em ES | — | Criar |
| Guias editoriais (eijuken, haken, autônomo…) | — | Rascunho com revisão humana |

**Por que não `/pt/...`:** o briefing sugere prefixo de idioma e província no caminho
(`/pt/casas-a-venda/aichi/nishio/`). As páginas em português já existem sem prefixo;
mudar URL indexada só traz redirecionamento. Português fica na raiz, espanhol em `/es/`,
e a província entra no breadcrumb e no `BreadcrumbList`, não na URL.

## 3. Dados comerciais verificados (só estes foram usados)

Do `/sobre` e do rodapé — nada inventado:

- 株式会社EASY HOUSE · 愛知県碧南市入船町４丁目３７−２
- Tel. 080-2886-7708 · info@easyhouse.homes · WhatsApp 81 80-2886-7708
- 沖縄県知事(1)第5984号
- Atendimento em português, espanhol, inglês e japonês

LINE: **não existe** nos dados do projeto — não foi criado botão de LINE.

## 4. Estoque por província (o gate das páginas locais)

Acervo de 31/10/2026: **864 casas**, todas em Aichi (775, 40 cidades) e Mie (89, 5
cidades). **Gifu: 0** — o scraper do ATBB não varre a província. Novas (新築): 724;
usadas (中古): 140, pela classificação do próprio anúncio.

Das 33 cidades do briefing: **21 passam** no gate (5+ casas), **1 magra** (Chiryu, 3) e
**11 sem estoque** (Higashiura, Kota, Iga, Inabe e as 7 de Gifu). Nagoya tem 18 casas,
mas o acervo grava o bairro (名古屋市港区) — o cruzamento pelo kanji exato não via.

## 5. Problemas encontrados na auditoria (corrigidos no mesmo dia)

1. **Simulador apresentava Flat 35 a quem não pode usá-lo.** Autônomo com visto de
   trabalho, cônjuge ou 定住者 via "Tipo de financiamento: Flat 35 · 2,9%", sem aviso.
   A JHF (FAQ 308) aceita estrangeiros só com 永住者/特別永住者. → commit `a5d37bb`.
2. **Página de financiamento omitia a mesma regra** no quadro "Flat 35 × banco" e na
   pergunta "Preciso de visto permanente?". → commit `2a2fd19`.
3. **`docs/` era publicada na web**, inclusive `/docs/PLATAFORMAS` (mapa de contas e
   infraestrutura, sem senhas) e `/docs/FUNIL.md` (números de conversão). → commit `79dba83`.
4. **5 páginas `/simular/<cidade>` 99,8% idênticas** (doorway). Viraram 301 para as páginas
   de cidade em 31/10 (manhã), antes do briefing.

## 6. Plano de mapeamento

Cada uma das 134 URLs do briefing, com URL real, estado e motivo:
`docs/seo/seo_manifest_resolvido.json` (e `.csv` para abrir em planilha).
