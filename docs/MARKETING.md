# Estratégia de aquisição — simulador `/simular`

Como transformar a landing page de simulação em uma máquina de leads pagos.
Documento de trabalho, não de teoria.

---

## 1. Diagnóstico antes de gastar o primeiro iene

Duas coisas encontradas no dia 06/08/2026 que precisam ser resolvidas **antes** de subir campanha:

### 1.1 Não existe pixel no site

Nenhuma página do site tem Meta Pixel, GA4 ou GTM instalados. O funil já dispara
10 eventos (`landing_view`, `simulation_started`, `quick_simulation_completed`,
`preliminary_result_viewed`, `full_simulation_started`, `lead_form_viewed`,
`lead_submitted`, `simulation_result_viewed`, `whatsapp_clicked`,
`quick_question_completed`) para `window.dataLayer` — mas **não há ninguém escutando**.

Consequência prática: sem pixel, o Meta não sabe quem converteu. Você não compra
leads, compra impressões. O algoritmo não tem sinal para otimizar, o retargeting
não existe, e não dá para saber qual criativo funcionou. Investir mídia nesse
estado é jogar dinheiro fora de forma mensurável.

**Isto é o passo zero. Nada mais na estratégia funciona sem isso.**

### 1.2 Os bots do Facebook estão fora do ar

Os 6 tokens em `~/EasyHouseBot/*/fb_token_venda.txt` retornam o mesmo erro:

```
Error validating access token: The session has been invalidated
because the user changed their password (code 190, subcode 460)
```

Alguém trocou a senha do Facebook e invalidou todos. Isso significa que as
postagens automáticas de imóveis e os vídeos diários pararam. O canal orgânico
que alimentaria a campanha paga está desligado. Precisa regerar o token
(o passo a passo está no `CLAUDE.md` do EasyHouseBot).

---

## 2. A tese

O obstáculo do cliente não é preço. É a crença de que **"isso não é para mim"**.

O brasileiro que mora há anos em Aichi normalmente acredita em três coisas:

1. "Não tenho visto permanente, então não consigo financiamento."
2. "Trabalho por empreiteira, banco nenhum me aceita."
3. "Não tenho dinheiro guardado para a entrada."

Nenhuma das três é um não automático — mas quase ninguém descobre isso, porque
descobrir exige **perguntar**, e perguntar expõe a pessoa a um "não" na frente de
alguém. O medo do constrangimento é o verdadeiro gargalo do funil.

O simulador resolve exatamente isso: dá a resposta **em 60 segundos, sozinho,
no celular, sem falar com ninguém**. Essa é a proposta de valor real, e é ela
que a mídia paga deve vender — não "compre uma casa".

### O gancho central

A pessoa já paga ¥70.000 de aluguel. O simulador mostra que ¥70.000 por mês
corresponde a um imóvel de aproximadamente ¥16.700.000.

> **"Você já paga a parcela. Só que da casa de outra pessoa."**

É honesto (não promete aprovação), é concreto (usa o número dela) e reposiciona
a compra de "sonho distante" para "troca do que já acontece".

---

## 3. Público e geografia

Números reais, para dimensionar expectativa:

| Recorte | Número | Data |
|---|---|---|
| Brasileiros em Aichi | 61.003 | jun/2025 |
| Brasileiros em Aichi | 60.406 | dez/2025 |
| Estrangeiros em Aichi | 345.900 (4,80% da população) | jun/2025 |
| Hekinan 碧南市 — estrangeiros | 6.932 (**9,56%** da cidade) | jun/2025 |
| Takahama 高浜市 — estrangeiros | 4.967 (**10,09%** da cidade) | jun/2025 |
| Nishio 西尾市 — estrangeiros | 12.989 (7,63%) | jun/2025 |
| Toyota 豊田市 — estrangeiros | 23.402, sendo 31,2% brasileiros (~7.300) | jun/2025 |
| Okazaki 岡崎市 — brasileiros | 4.811 | jun/2025 |

Não encontrei o dado de brasileiros isolados em Anjo e Kariya — vale levantar
depois, mas não bloqueia nada.

**Duas leituras importantes:**

- **Hekinan e Takahama estão entre as cidades com maior proporção de estrangeiros
  do Japão.** A Easy House está fisicamente dentro do bolsão mais denso do
  próprio mercado. Isso é vantagem competitiva geográfica, não sorte.
- **O público é pequeno e está encolhendo devagar.** Estamos falando de talvez
  15 a 25 mil brasileiros alcançáveis no raio de operação. Isso muda tudo no
  planejamento de mídia (ver seção 6): o limite não é orçamento, é **frequência**.
  Você satura o público rápido e queima criativo rápido.

---

## 4. O que a lei permite dizer

Isto não é detalhe jurídico — define o texto de cada anúncio.

### 4.1 Regras de anúncio imobiliário no Japão

Anúncio de imóvel segue o 宅建業法 e o 不動産の表示に関する公正競争規約:

- **Proibido おとり広告 (anúncio isca)** — em três formas: imóvel inexistente,
  imóvel real já vendido, ou imóvel que o corretor não tem intenção de vender.
- **Proibido superlativo sem base** (最上級表現) e afirmação categórica
  (断定的表現). Em português isso vale igual: "o melhor", "o mais barato",
  "garantido", "com certeza aprovado".
- **Sanções:** advertência do 不動産公正取引協議会 com multa de até ¥500.000 na
  primeira vez e até ¥5.000.000 na reincidência, além de divulgação do nome da
  empresa e remoção dos portais. Desde outubro de 2024, o 景品表示法 revisado
  permite **multa direta de até ¥1.000.000 sem passar por ordem administrativa**.

> **Consequência para a campanha:** a decisão já tomada no funil — não mostrar
> lista nem contagem de imóveis, e sim *"Temos imóveis disponíveis na região, o
> corretor irá lhe apresentar as opções que se enquadram"* — não é só uma escolha
> de produto. É a decisão que mantém a Easy House longe do risco de おとり広告.
> **Não voltar atrás nisso na criação dos anúncios.** Nenhum anúncio deve mostrar
> um imóvel específico com preço, a menos que ele esteja verificadamente à venda
> naquele momento.

⚠️ **Risco relacionado:** os bots que postam imóveis raspados do DK Portal e do
Suumo automaticamente no Facebook publicam anúncio de imóvel sem checar se ainda
está disponível. Se um deles já foi vendido, isso se enquadra no tipo 2 de
おとり広告. Vale revisar esse fluxo antes de religar os bots.

### 4.2 A Easy House não é instituição financeira

Já está correto no funil e precisa continuar em todo criativo: nada de
"aprovamos seu financiamento", "conseguimos crédito para você", "taxa de X%
garantida". O verbo é sempre **simular**, **estimar**, **verificar com o banco**.

### 4.3 Meta — Categoria Especial de Anúncio (Habitação)

O Meta classifica anúncios de habitação, emprego e crédito como categoria
especial, e a cobertura deixou de ser só EUA/Canadá. Mais importante: a detecção
hoje é **multimodal** — o classificador analisa a imagem em busca de fachada de
casa, planta baixa, placa de venda, e **aplica a restrição sozinho, mesmo que
você não marque a categoria**.

Quando aplicada, a restrição tira:
- segmentação por idade (fica travada 18–65+)
- segmentação por gênero
- segmentação por CEP
- raio menor que ~24 km de qualquer ponto

**Planeje assumindo que vai ser aplicada.** Confirme no Gerenciador de Anúncios,
mas não construa a estratégia dependendo de segmentação fina.

E aqui está o ponto que vira a restrição a favor:

> Se o Meta tira sua capacidade de segmentar, **o criativo passa a ser a
> segmentação**. Falar português nos primeiros 2 segundos do vídeo filtra o
> público com uma precisão que nenhuma restrição de plataforma consegue remover.
> Num mercado definido por idioma, isso é uma vantagem — não um problema.

---

## 5. Passo zero: instrumentação

Sem isso, não suba campanha.

### 5.1 Instalar Pixel + Conversions API

1. Criar o Pixel no Gerenciador de Eventos do Meta.
2. Instalar o código base em todas as páginas (ou via GTM).
3. Ligar os eventos que o funil **já dispara** no `dataLayer`:

| Evento do funil | Evento Meta | Uso |
|---|---|---|
| `landing_view` | `PageView` | público de retargeting |
| `simulation_started` | `ViewContent` | quem começou |
| `quick_simulation_completed` | `CompleteRegistration` (custom) | **evento de otimização inicial** |
| `preliminary_result_viewed` | custom | público quente |
| `lead_form_viewed` | `InitiateCheckout` | quase lá |
| `lead_submitted` | `Lead` | **evento de otimização final** |
| `whatsapp_clicked` | `Contact` | conversão real |

4. **Conversions API** (server-side): as funções em `api/` já rodam no Vercel.
   Enviar `Lead` também pelo servidor recupera as conversões perdidas por
   bloqueador de anúncio e iOS. Em público de celular, isso costuma ser a
   diferença entre enxergar metade dos leads e enxergar quase todos.

### 5.2 Consentimento primeiro

O `docs/FUNIL.md` já registra que falta decidir a gestão de consentimento antes
de carregar tags de publicidade. Resolver isso junto: o pixel não pode disparar
antes do aceite. Aproveitar que a tabela `consent` já existe.

### 5.3 Qual evento otimizar

Detalhe técnico que decide o sucesso da campanha: o Meta precisa de **~50
conversões por semana por conjunto** para sair do aprendizado.

Com um público de 15–25 mil pessoas, `lead_submitted` **não vai atingir 50/semana
no começo**. Se você otimizar direto para `Lead`, o conjunto trava em aprendizado
e a entrega fica cara e instável.

**Faça assim:**
1. **Semanas 1–4:** otimizar para `quick_simulation_completed` (quem terminou as
   6 perguntas). Tem volume muito maior e já indica intenção real.
2. **Depois:** quando `lead_submitted` passar de ~50/semana, migrar a otimização
   para `Lead`.

Pular essa etapa é o erro mais comum e mais caro em campanha de nicho pequeno.

---

## 6. Estrutura de campanha

### 6.1 O princípio: público pequeno, verba baixa, prazo longo

Com 15–25 mil pessoas alcançáveis, gastar muito por dia não acelera nada — só
aumenta a frequência e queima o criativo. A conta que importa não é
"quanto posso gastar", é "quantas vezes a mesma pessoa vai ver isso esta semana".

- **Frequência acima de ~3 por semana:** o criativo está saturando, troque.
- **Não fragmente em muitos conjuntos.** Cada conjunto disputa o mesmo público
  minúsculo contra você mesmo. Um conjunto de prospecção, um de retargeting.

### 6.2 Estrutura sugerida

**Campanha 1 — Prospecção (o motor)**
- Objetivo: Conversões → `quick_simulation_completed`
- Público: raio de ~25 km de Hekinan (pega Takahama, Nishio, Anjo, Kariya,
  Okazaki e parte de Toyota), idioma **Português**, 18–65+
- Verba: ~¥2.000/dia
- 3 criativos rodando ao mesmo tempo, trocando a cada 2–3 semanas
- Destino: `/simular` com UTM

**Campanha 2 — Retargeting (o fechamento)**
- Público: quem viu `preliminary_result_viewed` mas **não** fez `lead_submitted`
  nos últimos 30 dias
- Verba: ~¥500/dia
- Criativo: prova (o certificado), não repetição do gancho
- Destino: `/simular` ou **Click-to-WhatsApp direto** — nesse estágio a pessoa já
  sabe o número dela, o atrito a remover é falar com gente

**Campanha 3 — Cidade (quando a 1 estiver estável)**
- Usar as páginas que já existem: `/simular/hekinan`, `/takahama`, `/nishio`,
  `/anjo`, `/kariya`
- Criativo nomeia a cidade. "Você mora em Takahama?" performa acima da média
  porque parece endereçado, não publicidade.

### 6.3 Verba de partida

**~¥75.000/mês** (¥2.500/dia) para as duas primeiras campanhas, por no mínimo
6 semanas. Menos que isso não gera dado suficiente para decidir; mais que isso,
no início, só antecipa a saturação.

Não estimo custo por lead aqui de propósito — não tenho referência confiável de
CPM para este nicho no Japão, e um número inventado viraria meta falsa. As
primeiras 3 semanas **são** a medição. A partir do dado real, decide-se escalar
ou trocar o gancho.

---

## 7. Criativos

### 7.1 Regras que valem para todos

- **Vertical 9:16.** O público está no celular, no intervalo da fábrica.
- **Português falado nos primeiros 2 segundos.** É o filtro de público.
- **Legenda sempre.** Assiste-se sem som.
- **Nada de aprovação garantida, superlativo ou imóvel específico com preço.**
- Mostrar o número ¥ do simulador é permitido e é o que segura a atenção.

### 7.2 Vídeos

---

**V1 — "A conta do aluguel"** · 25s · *o principal*

| Tempo | Imagem | Áudio (PT) |
|---|---|---|
| 0–3s | Mão segurando envelope de aluguel, ou tela do app do banco com o débito | "Setenta mil ienes. Todo mês." |
| 3–8s | Calendário passando / anos passando | "Faz sete anos que você paga isso." |
| 8–12s | Número grande na tela: **¥5.880.000** | "Isso já foi quase seis milhões de ienes. Na casa de outra pessoa." |
| 12–18s | Tela do celular percorrendo o simulador, terminando em ¥16.700.000 | "Com essa mesma parcela, dá para comprar uma casa de dezesseis milhões e setecentos." |
| 18–25s | Logo + CTA | "Descubra o seu número em 60 segundos. Sozinho, no celular, sem falar com ninguém." |

Por que funciona: usa o dinheiro que ela **já gasta**, não o que ela não tem.
E fecha na privacidade, que é o bloqueio real.

---

**V2 — "As três frases que eu mais ouço"** · 30s · *autoridade*

O consultor 住宅ローンアドバイザー falando direto para a câmera:

> "Tem três coisas que eu mais escuto de brasileiro aqui em Aichi.
> *'Não tenho visto permanente.'*
> *'Trabalho por empreiteira.'*
> *'Não tenho dinheiro para a entrada.'*
> Olha — nenhuma dessas três é um não automático. Cada banco tem uma regra
> diferente, e tem gente que descobre isso tarde demais.
> Antes de achar que não dá, faz a simulação. É de graça e leva um minuto."

Fechar mostrando o **certificado real** (registro (1)第2455204号, emitido pelo
一般財団法人住宅金融普及協会).

Por que funciona: ataca as três objeções pelo nome e usa a única prova que
concorrente nenhum tem. Repare que ele diz "não é um não automático" — não diz
"você vai conseguir". Essa diferença é o que mantém o anúncio legal.

---

**V3 — Gravação de tela do simulador** · 15s · *o mais barato, geralmente o melhor*

Só um dedo percorrendo as 6 perguntas em velocidade acelerada, terminando no
número grande. Legenda em português, sem narração ou com música.

Este é o criativo de teste: produz em 20 minutos, mede rápido, e serve de
controle para comparar os outros. Se um criativo caro não bate a gravação de
tela, o problema é o criativo caro.

---

**V4 — "Sem japonês"** · 20s · *remoção de atrito*

A barreira do idioma trava mais gente do que a barreira financeira. Mostrar
atendimento em **português, espanhol, inglês e japonês** — e o consultor dizendo
uma frase em cada idioma. Fecha: "A gente traduz o banco para você."

---

**V5 — Cliente real** · 30s · *só se existir de verdade*

Depoimento de cliente que comprou. **Só produzir se houver um cliente real que
aceite gravar, com autorização por escrito.** Depoimento inventado, além de
ilegal pelo 景表法, destrói a confiança que a certificação constrói.
Se não houver cliente disponível hoje, use V2 no lugar e produza este quando
houver.

### 7.3 Fotos e estáticos

Aproveitando o que **já existe** em `images/opt/`:

| Peça | Arquivo | Texto |
|---|---|---|
| Prova de credencial | `certificado-1024.webp` | "Consultor certificado em financiamento habitacional (住宅ローンアドバイザー). Registro (1)第2455204号." |
| Atendimento humano | `consultoria-1024.webp` | "Conversa de 30 minutos, em português, sem compromisso." |
| Fechamento emocional | `chave-porta-1024.webp` | "Sua chave, seu nome no contrato." |
| Equipe/confiança | `equipe-imovel-900.webp` | "EASY HOUSE — 株式会社movO · 沖縄県知事(1)第5984号" |

**Carrossel "As 6 perguntas"** — 6 cards, um por pergunta do simulador
(parcela, cidade, idade, trabalho, nacionalidade, composição), último card com o
resultado em ¥. Mostra que é curto, o que ataca a objeção "vai dar trabalho".

**Estático de maior tração provável:** fundo simples, só o texto grande

> **¥70.000 de aluguel**
> **=**
> **casa de ¥16.700.000**
>
> *simulação de referência · easyhouse.homes/simular*

Baixo custo, alta clareza, e o asterisco mantém a honestidade.

---

## 8. O orgânico que sustenta o pago

Mídia paga em público pequeno satura. O orgânico é o que segura o custo.

1. **Religar os bots** (token morto — seção 1.2). As postagens diárias de imóveis
   e os vídeos alimentam a página e criam público de retargeting de graça.
2. **Revisar o bot de imóveis** quanto ao risco de おとり広告 (seção 4.1) antes
   de religar.
3. **Grupos de brasileiros no Japão no Facebook** são onde essa comunidade
   realmente conversa. Participar com conteúdo útil (não spam de link) constrói
   autoridade — a pasta `SHARE_GRUPOS` no EasyHouseBot indica que isso já foi
   pensado. Cuidado: link solto em grupo costuma ser removido; conteúdo que
   responde uma dúvida real, não.
4. **Mídia da comunidade** — [Portal Mie](https://portalmie.com/) e
   [Revista Alternativa](https://alternativa.co.jp/) são os dois veículos com
   audiência consolidada em português no Japão. Vale cotar publieditorial sobre
   *"o que muda para quem quer comprar casa sem visto permanente"*, linkando o
   simulador. Conteúdo educativo em veículo com credibilidade converte melhor
   que banner.

---

## 9. Como medir (e o que ignorar)

**Ignore:** curtidas, alcance, "engajamento", CPM isolado.

**Acompanhe, nesta ordem:**

| Métrica | Onde | O que decide |
|---|---|---|
| `simulation_started` ÷ `landing_view` | funil | o anúncio prometeu o que a página entrega? |
| `quick_simulation_completed` ÷ `simulation_started` | funil | as 6 perguntas estão longas demais? |
| `lead_submitted` ÷ `preliminary_result_viewed` | funil | o resultado convence a entregar contato? |
| `whatsapp_clicked` ÷ `lead_submitted` | funil | a passagem para o corretor funciona? |
| Frequência | Meta | acima de 3/semana = trocar criativo |
| Custo por `lead_submitted` | Meta | a única métrica de dinheiro que importa |

**O teste A/B já implementado** (`?v=A` / `?v=B`) está rodando o Teste 1 —
headline "Veja em 60 segundos quanto pode custar sua casa no Japão" contra
"Veja quais casas podem caber na parcela que você deseja pagar". Deixe rodar
até ter volume; um teste por vez, sem declarar vencedor cedo.

---

## 10. Ordem de execução

| # | O quê | Bloqueia o quê |
|---|---|---|
| 1 | ~~Instalar Pixel + Conversions API + consentimento~~ — **feito em 08/08/2026**. Falta só colar o ID do pixel em `analytics.js` e criar o token da CAPI. | **tudo** |
| 2 | Regerar token do Facebook e religar os bots | orgânico e retargeting |
| 3 | Revisar bot de imóveis quanto a おとり広告 | risco legal |
| 4 | Produzir V1, V2, V3 (dá para filmar tudo em uma tarde com celular) | campanha |
| 5 | Subir Campanha 1 otimizando `quick_simulation_completed`, ¥2.000/dia | — |
| 6 | Esperar 3 semanas sem mexer | — |
| 7 | Ler os dados, subir retargeting, migrar otimização para `Lead` | — |
| 8 | Abrir campanhas por cidade | — |

Os itens 1 a 3 são trabalho técnico, não de marketing — e são exatamente o que
determina se a verba dos itens 5 em diante vira lead ou vira impressão.

---

## Fontes

- [愛知県 — 外国人住民数（2025年12月末）](https://www.pref.aichi.jp/soshiki/tabunka/gaikokuzinjuminsu-2025-12.html)
- [愛知県 — 外国人住民数（2025年6月末）](https://www.pref.aichi.jp/soshiki/tabunka/gaikokuzinjuminsu-2025-6.html)
- [愛知県で外国人が多い街ランキング（2025年）](https://gaikokujin-ranking.com/aichi-gaikokujin-ranking/)
- [不動産公正取引協議会連合会 — 公正競争規約](https://www.rftc.jp/koseikyosokiyaku/)
- [消費者庁 — 不動産のおとり広告に関する表示](https://www.caa.go.jp/policies/policy/representation/fair_labeling/representation_regulation/case_003)
- [不動産広告の禁止ルール（2026年版）](https://miraie-net.com/fudousan-column/advertising-rules/)
- [Meta — 特別な広告カテゴリ](https://www.facebook.com/business/help/298000447747885)
- [Special Ad Categories: A Guide for Meta Ads — Jon Loomer](https://www.jonloomer.com/special-ad-categories-meta-ads/)
- [Portal Mie](https://portalmie.com/) · [Revista Alternativa](https://alternativa.co.jp/)
- [De dekasseguis a imigrantes no Japão — Portal Mie](https://portalmie.com/atualidade/2024/05/de-dekasseguis-a-imigrantes-no-japao-nikkeis-brasileiros-e-peruanos/)
