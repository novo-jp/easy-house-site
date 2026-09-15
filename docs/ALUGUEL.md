# Aluguel — como funciona

Referência do setor de aluguel: de onde vêm os imóveis do site, como os
valores são calculados e o que fazer quando algo parece errado.

---

## 1. Caminho dos dados

```
DK Portal  →  scraper_dk_v4.py  →  Supabase (imoveis_aichi)  →  /imoveis
                                          (chave de serviço, no servidor)
```

A página `/imoveis` é renderizada no servidor (`api/aluguel-lista.mjs`),
no mesmo desenho da busca de casas: `lib/aluguel-fonte.mjs` lê a tabela
com a chave de serviço (janela de 7 dias, ampliada para 30 se sobrar menos
de 100 imóveis; cache de 10 min), `lib/aluguel.mjs` normaliza cada linha,
`lib/aluguel-busca.mjs` filtra/ordena/conta facetas, e `lib/aluguel-cartao.js`
monta o card — o mesmo arquivo roda no servidor e no navegador. O
`aluguel-busca.js` entra por cima para não recarregar a página e para abrir
o modal "o que está incluso". Tudo funciona sem JavaScript (formulário GET).

Filtros na URL: `q`, `cidade`, `quartos` (1/2/3), `planta`, `aluguelMin`,
`aluguelMax`, `mensalMax` (custo total), `entradaMax`, `areaMin`,
`estacaoMax`, `pet=sim`, `internet=sim`, `luva=sem`, `deposito=sem`,
`disponivel` (imediata/prevista), `ordem`, `pagina`. Ex.:
`/imoveis?cidade=toyohashi&quartos=2&luva=sem`.

**Armadilha do campo `andar`:** o portal manda a metragem ("44.75㎡") em
`floor` e deixa `exclusiveArea` vazio. O scraper passou a gravar isso em
`area`; `lib/aluguel.mjs` também lê de `andar` para linhas antigas.

O scraper **não decide o que buscar**. Ele abre uma condição de busca
salva dentro do portal, chamada **"Aichi Principais Cidades"**, e traz o
que estiver lá. Mudar o que aparece no site significa editar essa
condição no portal, não o código.

**Roda todos os dias às 07:00 JST**, em dois passes (`run_scraper.sh`).
Leva cerca de 12 minutos.

### Teto de preço (decisão de negócio)

A condição favorita corta em torno de **¥85.000** de aluguel. Nenhum
imóvel acima disso entra no site — foi verificado que o banco não tem
nada acima de ¥83.500. É intencional: é a faixa do nosso público.

Efeito colateral esperado: cidades caras aparecem menos. Toyota tinha 23
imóveis quando o portal listava 131; Toyohashi, mais barata, tinha 437.

---

## 2. Valores mostrados ao cliente

Toda a conta fica em **`custos.js`**, em um só lugar. O site nunca
calcula nada por fora.

### Todo mês

| Item | Valor |
|---|---|
| 家賃 Aluguel | do imóvel |
| 共益費 Condomínio | do imóvel |
| 駐車場 Vaga | do imóvel, opcional |
| 保証委託料 Garantidora | 2,2% da soma acima |
| ruumサポート Suporte 24h | ¥1.980 |

### Para entrar (pagamento único)

| Item | Valor |
|---|---|
| 日割り家賃 Diárias | mensal ÷ 30 × dias (padrão: 15) |
| 前家賃 Aluguel adiantado | 1 mês completo |
| 仲介手数料 Intermediação | (aluguel + vaga) × 1,1 |
| 敷金 Depósito | do imóvel, quando houver |
| 礼金 Luva | do imóvel, quando houver |
| 保証委託料 Garantidora | ¥22.000 |
| クリーニング費 Limpeza | ¥70.000 |
| 更新事務手数料 Administrativa | ¥22.000 |
| 鍵セット費 Chaves | ¥3.300 |

Itens zerados não aparecem no detalhamento.

### Cartão de crédito

Acréscimo de **3,6%** sobre o total da entrada, conforme a planilha de
orçamentos usada no atendimento.

### Atenção ao 敷金/礼金

O portal informa esses dois **em meses de aluguel**, não em ienes:
`2` significa dois meses. Um imóvel de ¥54.000 com 2 meses de depósito
tem ¥108.000 a mais na entrada. O scraper converte antes de gravar
(`valor_em_ienes`); o banco guarda sempre em ienes.

---

## 3. Imóvel que sai do portal

O portal não avisa quando um imóvel é alugado: ele apenas some da busca.
Por isso o scraper remove, ao fim do passe 2, o que não aparece há mais
de **7 dias**.

Como apagar automaticamente é arriscado, a limpeza só age se:

- houver **pelo menos 500** imóveis confirmados nas últimas 36h — se a
  varredura veio parcial (portal fora do ar, login falhou), não remove nada;
- a remoção não passar de **25% da base** numa mesma execução;
- e sempre grava antes um JSON com tudo que será removido.

A página `/imoveis` ainda filtra por `updated_at` recente, como segunda
camada: se a limpeza falhar, o visitante continua não vendo anúncio velho.

---

## 4. Aceita pet e internet grátis

A informação **não existe na lista** do portal — só na página de detalhe
de cada imóvel, numa fileira de ícones de equipamentos.

**O texto "ペット可" está sempre lá, mesmo quando não aceita.** O que muda
é a classe do ícone: `facility-icon__pets_allowed` aceita,
`facility-icon__pets_allowed_off` não. A primeira versão da verificação
lia o texto e marcava todos como "aceita" — corrigida em 15/09/2026 para
ler a classe. O mesmo ícone diz se a internet é grátis (`net_free`).

Cada execução confere um lote de **300 imóveis** (≈1 s por página),
priorizando quem nunca foi verificado, e revalida depois de 60 dias. Só
entram na fila imóveis com URL de cliente; os sem URL não podem ser
conferidos e, se entrassem, travavam a fila (foi o que aconteceu: 4 por
dia em vez de 120).

Duas regras que protegem o dado:
- `pet` e `internet` **não entram no upsert diário** — mandá-los apagava
  o que já tinha sido verificado;
- no site, `pet` só vale depois de `pet_verificado_em`; antes disso é
  "não conferido" e o imóvel **não** aparece no filtro "Aceita pet". A
  interface diz quantos já foram conferidos.

Amostra de 40 páginas em 15/09/2026: 36% aceitam pet, 95% têm internet.

---

## 5. Comandos

```bash
cd ~/"Site Easy House"/Imoveis

# Varredura completa (o que roda todo dia)
bash run_scraper.sh

# Só a limpeza, mostrando o que sairia sem apagar
python3 scraper_dk_v4.py --limpar --simular

# Limpeza ignorando as travas (usar com cuidado)
python3 scraper_dk_v4.py --limpar --forcar

# Verificar pet/internet em N imóveis, sem varrer a lista
python3 scraper_dk_v4.py --pet 50

# Ver quais campos o portal expõe hoje
python3 inspecionar_portal.py
```

---

## 6. Migrações

`sql/imoveis_custos_entrada.sql` — cria `deposito`, `luva` e
`pet_verificado_em`. **Aplicada em 29/08/2026.** Se um dia a tabela for
recriada, o scraper detecta as colunas ausentes, avisa no log e continua
rodando sem gravar esses campos.

Testes da busca: `node --test tests/*.test.mjs` (`tests/aluguel-busca.test.mjs`).

---

## 7. Onde mexer em cada coisa

| Para mudar | Arquivo |
|---|---|
| Taxas e percentuais | `custos.js` |
| Quais imóveis entram | condição "Aichi Principais Cidades", **no portal** |
| Captura e limpeza | `Imoveis/scraper_dk_v4.py` |
| Página da lista (HTML do servidor, filtros, textos) | `api/aluguel-lista.mjs` |
| Regras de filtro, ordenação e facetas | `lib/aluguel-busca.mjs` |
| Leitura de uma linha do banco (área, estação, disponibilidade, pet) | `lib/aluguel.mjs` |
| Card e mensagem do WhatsApp | `lib/aluguel-cartao.js` |
| Comportamento no navegador e modal de custos | `aluguel-busca.js` |
| Estilo próprio do aluguel | `aluguel.css` (a base é `casas.css`) |
| Nomes das cidades em português | `CITY_PT` em `Imoveis/scraper_dk_v4.py` |
| Página que explica o aluguel | `landingaluguel.html` |

O scraper fica fora do Git (a pasta `Imoveis/` não vai para o deploy).
