/**
 * lib/acompanhamento-simulacao.mjs — simulação de parcelas do painel.
 *
 * Reproduz a planilha Simular.xlsx que a Easy House manda aos clientes, aba
 * por aba. A conta é a mesma; muda só onde ela roda. Duas abas, dois modelos:
 *
 *   privado  (Rokin, DOCOMO, AEON) — um empréstimo só, pela casa + taxas.
 *   flat35   — o mesmo total dividido em dois: 90% pelo FLAT35 e 10% por uma
 *              financeira, cada um com a sua taxa; a parcela é a soma.
 *
 * Fórmulas da planilha, para conferência:
 *   Taxa Imobiliária = casa × 3,3% + ¥66.000        (B×1,033 + 66000 − B)
 *   Taxa Financeira  = ARRED.PARA.CIMA((casa + todas as taxas, menos ela
 *                      mesma e "Outros"/"Free Loan") × 2,21%; −4)
 *   TAXAS            = ARRED.PARA.CIMA(soma das taxas; −4)
 *   TOTAL            = casa + TAXAS
 *   Parcela          = PGTO(juros anual ÷ 12; anos × 12; −valor)
 *
 * Os números ficam guardados como o corretor digitou; o cálculo é refeito a
 * cada leitura, para que uma correção aqui valha para todas as simulações.
 */

export const MODELOS_SIMULACAO = {
  privado: {
    taxas: [
      { chave: 'imobiliaria', rotulo: 'Taxa Imobiliária', auto: true },
      { chave: 'escritura', rotulo: 'Escritura', padrao: 350000 },
      { chave: 'selo_contrato', rotulo: 'Selo Contrato', padrao: 10000 },
      { chave: 'selo_bancario', rotulo: 'Selo Bancário', padrao: 0 },
      { chave: 'registro', rotulo: 'Taxa Registro', padrao: 100000 },
      { chave: 'imposto', rotulo: 'Imposto Anual', padrao: 50000 },
      { chave: 'financeira', rotulo: 'Taxa Financeira', auto: true },
      { chave: 'outros', rotulo: 'Outros', padrao: 0, foraDaBase: true },
      { chave: 'seguro', rotulo: 'Seguro de Incêndio', padrao: 300000 },
    ],
    juros: [{ chave: 'juros', rotulo: 'Taxa de juros', padrao: 1.79 }],
    prazoPadrao: 33,
  },
  flat35: {
    taxas: [
      { chave: 'imobiliaria', rotulo: 'Taxa Imobiliária', auto: true },
      { chave: 'escritura', rotulo: 'Escritura', padrao: 350000 },
      { chave: 'selo_contrato', rotulo: 'Selo Contrato', padrao: 10000 },
      { chave: 'selo_bancario', rotulo: 'Selo Bancário', padrao: 20000 },
      { chave: 'registro', rotulo: 'Taxa Registro', padrao: 0 },
      // Na planilha (aba FLAT) esta célula está com 50; o valor certo é
      // 50.000, como na aba Privado (confirmado pela Easy House em 10/10/2026).
      { chave: 'imposto', rotulo: 'Imposto Anual', padrao: 50000 },
      { chave: 'financeira', rotulo: 'Taxa Financeira', auto: true },
      { chave: 'free_loan', rotulo: 'Free Loan', padrao: 0, foraDaBase: true },
      { chave: 'seguro', rotulo: 'Seguro de Incêndio', padrao: 350000 },
    ],
    juros: [
      { chave: 'juros', rotulo: 'Taxa FLAT35 (90%)', padrao: 3.9 },
      { chave: 'juros_financeira', rotulo: 'Taxa da financeira (10%)', padrao: 4.09 },
    ],
    prazoPadrao: 20,
    divisao: 0.9,
  },
};

/** ARRED.PARA.CIMA(x; −4). Arredonda os centavos antes, para que um
 *  2.280.000,0000001 de ponto flutuante não vire 2.290.000. */
const sobe10mil = (x) => Math.ceil(Math.round(x * 100) / 1_000_000) * 10_000;

/** PGTO do Excel, para valor presente positivo e sem valor futuro. */
export function pgto(jurosMensal, meses, valor) {
  if (!meses || !valor) return 0;
  if (!jurosMensal) return valor / meses;
  return (valor * jurosMensal) / (1 - Math.pow(1 + jurosMensal, -meses));
}

/** Os números que o corretor pode digitar, com os padrões da planilha. */
export function entradaPadrao(modelo) {
  const m = MODELOS_SIMULACAO[modelo];
  const taxas = Object.fromEntries(m.taxas.filter((t) => !t.auto).map((t) => [t.chave, t.padrao]));
  const juros = Object.fromEntries(m.juros.map((j) => [j.chave, j.padrao]));
  return { modelo, preco: null, prazo_anos: m.prazoPadrao, taxas, ajustes: {}, ...juros };
}

/**
 * Faz a conta. `ajustes` permite ao corretor fixar à mão as taxas que a
 * planilha calcula sozinha (imobiliária e financeira) — quando o caso real
 * foge da fórmula. Sem ajuste, vale a fórmula.
 */
export function calcular(entrada) {
  const m = MODELOS_SIMULACAO[entrada.modelo];
  if (!m) throw new Error('modelo de simulação desconhecido');
  const preco = Number(entrada.preco) || 0;
  const ajuste = (k) => {
    const v = entrada.ajustes?.[k];
    return v === null || v === undefined || v === '' ? null : Number(v);
  };
  const fixo = (k) => Number(entrada.taxas?.[k]) || 0;

  const valores = {};
  valores.imobiliaria = ajuste('imobiliaria') ?? (preco ? preco * 0.033 + 66000 : 0);
  for (const t of m.taxas) if (!t.auto) valores[t.chave] = fixo(t.chave);

  // Base da Taxa Financeira: a casa e todas as taxas, menos ela mesma e a
  // linha livre (Outros / Free Loan) — exatamente as células da planilha.
  const base = preco + m.taxas
    .filter((t) => t.chave !== 'financeira' && !t.foraDaBase)
    .reduce((s, t) => s + valores[t.chave], 0);
  valores.financeira = ajuste('financeira') ?? (preco ? sobe10mil(base * 0.0221) : 0);

  const somaTaxas = m.taxas.reduce((s, t) => s + valores[t.chave], 0);
  const taxas = sobe10mil(somaTaxas);
  const total = preco + taxas;
  const meses = Math.round((Number(entrada.prazo_anos) || 0) * 12);

  const linhas = m.taxas.map((t) => ({
    chave: t.chave, rotulo: t.rotulo, valor: Math.round(valores[t.chave]),
    automatica: !!t.auto && ajuste(t.chave) === null,
  }));

  const emprestimos = [];
  if (m.divisao) {
    const principal = total * m.divisao;
    const resto = total - principal;
    emprestimos.push({ rotulo: 'FLAT35', percentual: m.divisao, valor: principal, juros_anual: Number(entrada.juros) || 0 });
    emprestimos.push({ rotulo: 'Financeira', percentual: 1 - m.divisao, valor: resto, juros_anual: Number(entrada.juros_financeira) || 0 });
  } else {
    emprestimos.push({ rotulo: 'Financiamento', percentual: 1, valor: total, juros_anual: Number(entrada.juros) || 0 });
  }
  for (const e of emprestimos) {
    e.juros_mensal = e.juros_anual / 12;
    e.parcela = pgto(e.juros_mensal / 100, meses, e.valor);
  }

  return {
    modelo: entrada.modelo,
    preco,
    taxas,
    soma_taxas_exata: Math.round(somaTaxas),
    total,
    prazo_anos: Number(entrada.prazo_anos) || 0,
    prazo_meses: meses,
    linhas,
    emprestimos: emprestimos.map((e) => ({ ...e, valor: Math.round(e.valor), parcela: Math.round(e.parcela) })),
    parcela: Math.round(emprestimos.reduce((s, e) => s + e.parcela, 0)),
  };
}

/**
 * Valida o que veio do formulário. Recusa em vez de "consertar": um preço
 * digitado errado vira uma parcela errada na tela do cliente.
 */
export function validarEntrada(bruto, modelo) {
  const m = MODELOS_SIMULACAO[modelo];
  if (!m) throw new Error('modelo inválido');
  // Ienes: "24,900,000" ou "24.900.000" → separador de milhar, sai tudo.
  // Juros: "1,79" é decimal em português — a vírgula vira ponto. Tratar os
  // dois do mesmo jeito transformava 1,79% em 179%.
  const num = (v, { min = 0, max, nome, decimal = false }) => {
    if (v === null || v === undefined || String(v).trim() === '') return null;
    let t = String(v).replace(/[^\d.,-]/g, '');
    t = decimal ? t.replace(',', '.') : t.replace(/[.,]/g, '');
    const n = Number(t);
    if (!Number.isFinite(n) || n < min || n > max) throw new Error(`${nome}: valor inválido`);
    return n;
  };

  const preco = num(bruto.preco, { min: 1, max: 1e10, nome: 'Preço da casa' });
  if (!preco) throw new Error('informe o preço da casa');
  const prazo = num(bruto.prazo_anos, { min: 1, max: 50, nome: 'Prazo', decimal: true });
  if (!prazo) throw new Error('informe o prazo em anos');

  const saida = { modelo, preco, prazo_anos: prazo, taxas: {}, ajustes: {} };
  for (const j of m.juros) {
    const v = num(bruto[j.chave], { min: 0, max: 20, nome: j.rotulo, decimal: true });
    if (v === null) throw new Error(`informe: ${j.rotulo}`);
    saida[j.chave] = v;
  }
  for (const t of m.taxas) {
    if (t.auto) {
      const v = num(bruto.ajustes?.[t.chave], { max: 1e9, nome: t.rotulo });
      if (v !== null) saida.ajustes[t.chave] = v;
    } else {
      saida.taxas[t.chave] = num(bruto.taxas?.[t.chave], { max: 1e9, nome: t.rotulo }) ?? 0;
    }
  }
  return saida;
}
