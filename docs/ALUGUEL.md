# Aluguel — como funciona

Referência do setor de aluguel: de onde vêm os imóveis do site, como os
valores são calculados e o que fazer quando algo parece errado.

---

## 1. Caminho dos dados

```
DK Portal  →  scraper_dk_v4.py  →  Supabase (imoveis_aichi)  →  /imoveis
```

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

## 4. Aceita pet

A informação **não existe na lista** do portal — só na página de detalhe
de cada imóvel, junto dos equipamentos (`ペット可`). Abrir todas as
páginas por dia levaria de 2 a 3 horas.

Solução: cada execução confere um lote de **120 imóveis**, priorizando
quem nunca foi verificado, e revalida depois de 60 dias. O banco se
preenche ao longo de algumas semanas.

Enquanto a cobertura for baixa, o filtro "Aceita pet" mostra pouca coisa.

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

# Verificar pet em N imóveis, sem varrer a lista
python3 scraper_dk_v4.py --pet 50

# Ver quais campos o portal expõe hoje
python3 inspecionar_portal.py
```

---

## 6. Migrações pendentes

`sql/imoveis_custos_entrada.sql` — cria `deposito`, `luva` e
`pet_verificado_em`. Executar no SQL Editor do Supabase.

Enquanto não for aplicada, o scraper detecta as colunas ausentes, avisa
no log e continua rodando sem gravar esses campos.

---

## 7. Onde mexer em cada coisa

| Para mudar | Arquivo |
|---|---|
| Taxas e percentuais | `custos.js` |
| Quais imóveis entram | condição "Aichi Principais Cidades", **no portal** |
| Captura e limpeza | `Imoveis/scraper_dk_v4.py` |
| Página da lista | `imoveis.html` |
| Página que explica o aluguel | `landingaluguel.html` |

O scraper fica fora do Git (a pasta `Imoveis/` não vai para o deploy).
