# Mapeamento de dados — `casas_venda_aichi` → interface

Medido em **10/09/2026** sobre as **769 linhas publicáveis** (status `紹介可能`, com foto,
preço e planta) de 1.012 na tabela. Preenchimento = % das publicáveis com valor não vazio.
Origem: scraper ATBB (`/Users/NEC/PROJETO ONLINE/atbb-ficha/base/enviar_supabase.py → linha_para_site()`).

Regra desta tabela: **um filtro só aparece na interface quando o campo existe, tem semântica
consistente e cobertura que não engane.** As colunas "pode filtrar/ordenar" refletem essa decisão,
não a possibilidade técnica.

| conceito da interface | campo real | tipo | preenchimento | origem | pode filtrar? | pode ordenar? | tratamento de ausente |
|---|---|---|---:|---|---|---|---|
| ID interno | `id` (物件番号 do ATBB) | text | 100% | ATBB | não (exposto só como código) | — | nunca ausente |
| Código público | derivado: `EH-` + últimos 7 do `id` (`codigoPublico`) | derivado | 100% | site | sim (`codigos=`, busca `q`) | — | — |
| Slug | derivado: `casa-{planta}-{cidade}-eh{código}` (`slugDe`) | derivado | 100% | site | — | — | slug antigo → 301 |
| Status | `status` (`紹介可能` 769 / `取下げ` 243) | enum text | 100% | ATBB → sender | só publicáveis | — | ausente = não publica |
| Disponibilidade checada | `last_seen_at` | timestamp | 100% | scraper (rodada) | sim (implícito: >14 dias sai) | — | `null` → tratado como ativo (regra existente) |
| Publicado em | `created_at` | timestamp | 100% | Supabase | sim ("novos" ≤ 14 dias) | **sim** (`recentes`) | — |
| Atualizado em | `updated_at` | timestamp | 100% | Supabase | — | — | — |
| Preço (JPY) | `preco_yen` | integer | 100% | ATBB (OCR da imagem) | **sim** (min/max) | **sim** | ausente = não publica |
| Preço em 万円 | derivado: `preco_yen / 10.000` (`formatarMan`) | derivado | 100% | site | — | — | — |
| Histórico de preço | **não existe** | — | 0% | — | não | não | selo "preço reduzido" **não pode existir** |
| Província | `prefeitura` (JP) / `prefeitura_pt` (Aichi 690, Mie 79) | text | 100% | ATBB / romanizador | **sim** | — | — |
| Cidade | `cidade` (JP) / `cidade_pt` (44 distintas) | text | 100% | ATBB / romanizador | **sim** (multi) | — | — |
| Bairro / endereço público | `endereco` (ex.: `高浜市神明町６丁目 3-143`) | text | 100% | ATBB | busca `q` | — | 160/769 chegam ao nível do lote; exibido na ficha como hoje (ver DECISIONS) |
| Latitude / longitude | **não existe** | — | 0% | — | não | não | **mapa impossível** sem geocodificação (não autorizada) |
| Linha / estação | `estacao` (texto: `名鉄三河線 三河高浜 距離1,400m`) → `acesso.linha`, `acesso.estacao` | text → derivado | 92% (estação parseada em 707) | ATBB | busca `q` | — | omitido |
| Caminhada até a estação | `minutos_estacao` (70%) + regex `徒歩N分` em `estacao` → `acesso.minutosAPe` | integer | 70% (542) | ATBB | **sim, com aviso** ("sem dado continua aparecendo") | **sim** (nulos por último) | omitido no card; "não informado" na ficha |
| Ônibus / distância | `距離1,400m` dentro de `estacao` (165 linhas só têm distância) | texto | — | ATBB | não | não | mostrado como texto |
| Tipo | `tipo_imovel` (`新築売戸建住宅` 649 / `売戸建住宅` 120) | enum | 100% | ATBB | via novo/usado | — | — |
| Novo / usado | `construcao_nova` (true 649 / false 120) | boolean | 100% | sender | **sim** | — | — |
| Planta | `planta` (`4LDK` 449, `3LDK` 160, `5LDK` 58, `3SLDK` 38, `4SLDK` 24…) | text JP | 100% | ATBB | **sim** (multi, valor japonês preservado) | — | ausente = não publica |
| Estrutura | `estrutura` (`木造` 748 = 97%) | text | 100% | ATBB | não (97% igual — filtro sem efeito) | — | mostrado na ficha |
| Pavimentos | `pavimentos` (`2階建` 706, `1階建` 56, `3階建` 5) | text | 100% | ATBB | não (92% igual) | — | mostrado na ficha |
| Área construída | `area_constr_m2` | numeric | 100% | ATBB | **sim** (mín.) | **sim** | — |
| Área do terreno | `area_terreno_m2` | numeric | 100% | ATBB | **sim** (mín.) | **sim** | — |
| Ano/mês de construção | `ano_construcao` (`2025-09`) → `ano.ano`, `idade` | text → derivado | 100% | ATBB | **sim** (a partir de) | **sim** | — |
| Reforma | `reforma_info` (texto JP livre) | text | 14% | ATBB | não | — | omitido; ficha com `lang="ja"` |
| Estacionamento | `estacionamento` (`有` 448, `有 無料` 94, `なし` 7, vazio 220) → `vaga.pt`, `vaga.vagas` | text → derivado | 71% | ATBB | **sim, só booleano** ("com estacionamento"); **número de vagas NÃO** (7/769) | — | "não informado" |
| Fotos | `foto_principal` + `fotos_extras[]` (URLs no Storage do Supabase) | url[] | 100% / 59% | scraper → Storage | "com fotos reais" (`sem_foto_original=false`) | por quantidade: não | — |
| Imagem é a ficha | `sem_foto_original` (true 290) | boolean | 100% | sender | **sim** (implícito no filtro acima) | — | — |
| Legenda / tipo da foto | `fotos_meta[]` (`tipo: "foto"|"ficha"`, legenda **vazia**) | json | 100% | sender | não | — | galeria sem rótulo fachada/interior (lacuna do sender) |
| Planta baixa, vídeo, tour | **não existem** como campo | — | 0% | — | não | — | — |
| Características | `highlights` (texto JP separado por espaço) → `destaquesLista[{pt,jp}]` | text → derivado | 98% | ATBB | não (texto livre) | — | mostrado; sem tradução mantém JP com `lang="ja"` |
| Direito do terreno | `direito_terreno` (`所有権` 100%) | enum | 100% | ATBB | não (100% igual) | — | ficha |
| Zoneamento | `uso_terreno` (`１種住居` 245, `１種中高` 166, `無指定` 108…) | enum | 99% | ATBB | não nesta entrega (ver DECISIONS) | — | ficha |
| Acesso viário | não existe como campo | — | 0% | — | não | — | — |
| Situação atual | `situacao` (`空家` 532, `完成済` 235, `所有者居住中` 2) | enum | 100% | ATBB | não nesta entrega | — | ficha |
| Entrega | `entrega` (`即時` 597, `予定 2026年09月下旬` 124, `相談` 48) → `entrega.pt` | text → derivado | 100% | ATBB | **sim** (imediata / prevista / a combinar) | — | — |
| Forma da transação | `transacao` (`★売主` 767, `★代理` 2) | enum | 100% | ATBB | não | — | ficha |
| Comissão | `comissao_pct` | numeric | **0%** | — | não | — | omitido |
| Reforma incluída no preço | `custo_inclui_reforma` (false 100%) | boolean | 100% | sender | não | — | — |
| Fonte / anunciante | `fonte` (`atbb` 100%), `bukken_url` (0%) | text | 100% / 0% | sender | não | — | exibido como "Fonte: ATBB (at home)" |
| Destaque pago | `destaque` (false 100%) | boolean | 100% | sender | não há conteúdo pago | — | — |
| Risco / inspeção / eficiência | **não existem** | — | 0% | — | não | — | não afirmar nada |

## Cobertura resumida dos campos que a interface mostra

| campo | cobertura | consequência na UI |
|---|---:|---|
| preço, planta, cidade, província, área construída, terreno, ano | 100% | podem ser filtro e aparecer no card sem "não informado" |
| estação (nome) | 92% | card mostra quando há |
| caminhada (min) | 70% | filtro com aviso; card omite quando falta |
| estacionamento (sim/não) | 71% | filtro booleano; card omite quando falta |
| número de vagas | **1%** | **filtro removido** |
| fotos reais | 62% (479) | 290 imóveis usam a ficha como imagem; card sinaliza |
| reforma | 14% | só na ficha |
| coordenadas, histórico de preço, risco, comissão | 0% | **não existem na UI** |

## Duplicatas

Chave primária é `id` (物件番号 do ATBB), único por anúncio. Não há dois anúncios da mesma
propriedade detectáveis por regra confiável (o ATBB emite um 物件番号 por oferta). Nenhuma
deduplicação por título/foto foi feita — seria inventar.

## Campos importantes ausentes na base (lista para o scraper/sender)

1. `lat`/`lng` com precisão declarada — sem isso não há mapa.
2. Tipo/legenda das fotos (`fachada`, `interior`, `planta`) — existe no SQLite do scraper (`fotos_json.tipo`), não chega ao Supabase.
3. Histórico de preço (tabela aditiva `casas_preco_hist`) — sem isso não há "preço reduzido".
4. `comissao_pct` — vem vazio.
5. Planta baixa como imagem identificada.
6. Data da fotografia / validade do anúncio.
7. Custos conhecidos (管理費/修繕 não se aplicam a casas; impostos e taxas de escritura não vêm do anúncio).
