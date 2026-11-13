/**
 * lib/acompanhamento-credito.mjs — ficha de crédito do corretor.
 *
 * Reproduz as planilhas de crédito da Easy House: a ficha do cliente (申込人),
 * o co-devedor (連帯), o limite por banco (借入可能額) e o 資金計画書.
 *
 * O MESMO arquivo roda nos dois lados, como acompanhamento-simulacao.mjs:
 *   - no navegador, para a conta ao vivo enquanto o corretor digita;
 *   - no servidor (api/painel.mjs), para limpar o que chega antes de gravar.
 * Nada aqui toca em rede, banco ou DOM.
 *
 * Contas, para conferência:
 *   Limite de parcela = renda ÷ 12 × 返済負担率 − parcelas atuais
 *   Empréstimo máx.   = limite ÷ (parcela por ¥1M na 審査金利) × ¥1M   (↓ ¥10.000)
 *   Casa máx.         = empréstimo máx. ÷ fator de custos             (↓ ¥10.000)
 *   Recomendado       = casa máx. × 80%
 *   仲介手数料          = (preço × 3% + ¥60.000) × 1,1                   (↓ ¥1)
 *   ローン事務手数料      = r × (preço + custos − 自己資金) ÷ (1 − r)      (↑ ¥1)
 *   総予算             = preço + custos                                (↑ ¥10.000)
 */

// ── tabelas ─────────────────────────────────────────────────────────────────

export const STATUS = [
  ['lead', 'Lead'], ['ficha', 'Ficha preenchida'], ['pre', 'Pré-aprovação (事前審査)'],
  ['aprovado', 'Pré-aprovado'], ['contrato', 'Contrato (売買契約)'], ['honshinsa', '本審査'],
  ['entregue', 'Entregue (決済)'], ['perdido', 'Perdido'],
];
export const rotuloStatus = (k) => (STATUS.find((s) => s[0] === k) || [k, k])[1];

export const CONTRATOS = [
  ['', '—'], ['seishain', '正社員 (efetivo)'], ['keiyaku', '契約社員'], ['haken', '派遣社員'],
  ['part', 'パート・アルバイト'], ['jiei', '自営業'], ['yakuin', '会社役員'],
];
export const contratoJP = (k) => ({
  seishain: '正社員', keiyaku: '契約社員', haken: '派遣社員', part: 'パート・アルバイト', jiei: '自営業', yakuin: '会社役員',
}[k] || '');

export const PERMANENTE = [
  ['', '—'], ['sim', 'Sim (永住者)'], ['tokubetsu', '特別永住者'], ['teiju', 'Não — 定住者'],
  ['nikkei', 'Não — 日本人の配偶者等'], ['outro', 'Não — outro visto'],
];
export const permanenteJP = (k) => ({
  sim: 'はい（永住者）', tokubetsu: '特別永住者', teiju: 'いいえ（定住者）', nikkei: 'いいえ（日本人の配偶者等）', outro: 'いいえ',
}[k] || '');

export const SIM_NAO = [['', '—'], ['sim', 'Sim / はい'], ['nao', 'Não / いいえ']];
export const BASE_RENDA = [['', '—'], ['gensen', '源泉徴収票'], ['soma', 'Soma de holerites'], ['mikomi', '見込み年収 (estimativa)']];
export const PAPEL_CODEVEDOR = [
  ['', '—'], ['rentai_saimu', '連帯債務者 (renda somada)'], ['rentai_hosho', '連帯保証人 (avalista)'],
  ['pair', 'ペアローン (empréstimo próprio)'], ['gassan', '収入合算者'],
];
export const TIPO_IMOVEL = [['', '—'], ['shinchiku', '新築戸建'], ['chuko', '中古戸建'], ['mansion', 'マンション'], ['tochi', '土地']];
export const TIPO_JUROS = ['変動', '固定', '10年固定', '3年固定'];
export const MODO_PARCELA = [['resto', 'Restante'], ['pct', '% do total'], ['valor', 'Valor fixo']];
export const REGRAS = [['flat35', 'FLAT35 (30% / 35%)'], ['faixas', 'Faixas 25–40%'], ['fixo', 'Fixo']];

/**
 * Bancos e taxas. Os ids batem com os bancos do processo
 * (acompanhamento-modelos.json): a simulação de parcelas do processo usa a
 * 実行金利 daqui como padrão, então a taxa é ajustada num lugar só.
 *
 * Taxas definidas pela Easy House em 13/11/2026:
 *   FLAT35 3,92% · financeira dos 10% 4,09% · ROUKIN 1,84% · SBI (Docomo) 1,7%
 *   ROUKIN com まとめトク: 2,24% na casa e 2,69% no refinanciamento.
 */
export const BANCOS_PADRAO = {
  conferido_em: '2026-11-13',
  financeira10: 4.09,
  matome_casa: 2.24,
  matome_refin: 2.69,
  lista: [
    { id: 'flat35', nome: 'FLAT35', ativo: true, regra: 'flat35', ratio: 35, taxa_aprov: 3.92, taxa_real: 3.92,
      prazo_max: 35, idade_final: 80, limite_max: 120000000, fator_custos: 1.1,
      obs: 'Nov/2026: 3,92% é a taxa da JHF para 融資率 acima de 90% (até 90% são 3,81%), 買取型, 21–35 anos. Exige 永住権.' },
    { id: 'rokin', nome: 'ROUKIN', ativo: true, regra: 'flat35', ratio: 35, taxa_aprov: 1.84, taxa_real: 1.84,
      prazo_max: 39, idade_final: 80, limite_max: 0, fator_custos: 1.1,
      obs: '審査金利 igual à taxa real (a planilha antiga usava 1,5%, abaixo da taxa cobrada) — conferir com o banco.' },
    { id: 'docomo', nome: 'SBI (Docomo)', ativo: true, regra: 'fixo', ratio: 40, taxa_aprov: 4, taxa_real: 1.7,
      prazo_max: 35, idade_final: 79, limite_max: 0, fator_custos: 1.1,
      obs: '審査金利 4% e 返済負担率 40% vieram da planilha antiga — conferir.' },
    { id: 'aeon', nome: 'AEON', ativo: true, regra: 'fixo', ratio: 40, taxa_aprov: 4, taxa_real: 1.79,
      prazo_max: 35, idade_final: 79, limite_max: 0, fator_custos: 1.1,
      obs: 'Taxa não informada na revisão de 13/11/2026 — conferir antes de usar.' },
  ],
};

export const custosPadrao = () => ([
  { k: 'inshi_baibai', nome: '売買契約印紙代', obs: '売買契約書に添付', pagar: '国税', valor: 10000 },
  { k: 'inshi_kinsho', nome: '金消契約印紙代', obs: '銀行ローン契約書に添付', pagar: '国税', valor: 20000 },
  { k: 'jimu', nome: 'ローン事務手数料', obs: '借入金額 × 2.2%', pagar: '銀行', auto: true, valor: 0 },
  { k: 'toki', nome: '登記諸経費', obs: '所有権移転・抵当権設定', pagar: '国税・司法書士', valor: 350000 },
  { k: 'tekigo', nome: '適合証明書', obs: 'フラット35のみ', pagar: '設計者', valor: 100000 },
  { k: 'hyodai', nome: '表題登記', obs: '建物表題登記（新築）', pagar: '土地家屋調査士', valor: 80000 },
  { k: 'chukai', nome: '仲介手数料', obs: '（物件価格×3%＋6万円）×消費税', pagar: '仲介会社', auto: true, valor: 0 },
  { k: 'kotei', nome: '固定資産税精算金', obs: '日割り清算', pagar: '売主', valor: 0 },
  { k: 'kasai', nome: '火災保険料', obs: '', pagar: '保険会社', valor: 200000 },
  { k: 'sonota', nome: 'その他', obs: '', pagar: '', valor: 0 },
]);

/** As quatro partes de uma ficha nova. */
export function fichaNova() {
  return {
    ficha: { familia: [], emprestimos: [], nacionalidade: 'ブラジル' },
    codevedor: { ativo: false, familia: [], emprestimos: [] },
    credito: { considerar_quitacao: true, somar_codevedor: false },
    simulacao: { custos: custosPadrao(), tranches: [], taxa_jimu: 2.2, base_corretagem: 'sem', proprio: 0, plano: '' },
  };
}

// ── números e datas ─────────────────────────────────────────────────────────

const paraMeiaLargura = (s) => String(s).replace(/[０-９．，－]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xFEE0));

/** Número já guardado (ou texto simples vindo de dado antigo). */
export function num(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const n = Number(paraMeiaLargura(v).replace(/[¥,\s円]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Ienes digitados: "24,900,000" e "24.900.000" são o mesmo número — em valor
 * inteiro, vírgula e ponto só podem ser separador de milhar.
 */
export function inteiro(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v) : 0;
  const t = paraMeiaLargura(v).trim();
  const n = Number(t.replace(/[^\d]/g, ''));
  if (!Number.isFinite(n)) return 0;
  return /^[-−]/.test(t) ? -n : n;
}

/** Taxas, percentuais, anos e m²: "1,84" é decimal em português — a vírgula vira ponto. */
export function dec(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const n = Number(paraMeiaLargura(v).replace(/[%\s]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

const comoData = (iso) => {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
};

export function idade(nasc, ref = new Date()) {
  const d = comoData(nasc);
  if (!d) return null;
  let a = ref.getFullYear() - d.getFullYear();
  const m = ref.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < d.getDate())) a -= 1;
  return a;
}

export function mesesDesde(data, ref = new Date()) {
  const d = comoData(data);
  if (!d) return null;
  return (ref.getFullYear() - d.getFullYear()) * 12 + (ref.getMonth() - d.getMonth()) - (ref.getDate() < d.getDate() ? 1 : 0);
}

/**
 * Hoje no Japão, AAAA-MM-DD. `new Date().toISOString()` daria o dia em UTC:
 * antes das 09:00 de Tóquio o documento sairia com a data de ontem.
 */
export function hojeJST(agora = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(agora);
}

export const dataJP = (d) => {
  if (!d) return '';
  const [y, m, dd] = String(d).split('-');
  return y && m && dd ? `${y}年${Number(m)}月${Number(dd)}日` : '';
};

/** Parcela mensal — o PGTO do Excel. Taxa em % ao ano. */
export function pmt(taxaAnualPct, anos, pv) {
  const n = Math.round(dec(anos) * 12);
  const valor = num(pv);
  if (!n || !valor) return 0;
  const r = dec(taxaAnualPct) / 100 / 12;
  if (r === 0) return valor / n;
  return (valor * r) / (1 - Math.pow(1 + r, -n));
}

// ── crédito: limite por banco ───────────────────────────────────────────────

export const dividaMensal = (p, considerarQuitacao) =>
  (p?.emprestimos || []).reduce((s, e) => s + ((considerarQuitacao && e.quitar === 'sim') ? 0 : num(e.parcela)), 0);
export const saldoAQuitar = (p) =>
  (p?.emprestimos || []).reduce((s, e) => s + (e.quitar === 'sim' ? num(e.saldo) : 0), 0);

export function ratioBanco(b, renda) {
  if (b.regra === 'flat35') return renda < 4000000 ? 0.30 : 0.35;
  if (b.regra === 'faixas') return renda < 3000000 ? 0.25 : renda < 4000000 ? 0.30 : renda < 7000000 ? 0.35 : 0.40;
  return dec(b.ratio) / 100;
}

export function umBanco(b, renda, divida, idadeReq) {
  const ratio = ratioBanco(b, renda);
  const prazo = idadeReq == null
    ? dec(b.prazo_max)
    : Math.max(0, Math.min(dec(b.prazo_max), dec(b.idade_final) - idadeReq));
  const por1M = Math.floor(pmt(b.taxa_aprov, prazo, 1000000));
  const limiteParcela = (renda / 12) * ratio - divida;
  let maxEmp = (limiteParcela > 0 && por1M > 0) ? Math.floor(((limiteParcela / por1M) * 1000000) / 10000) * 10000 : 0;
  if (num(b.limite_max) > 0) maxEmp = Math.min(maxEmp, num(b.limite_max));
  const fator = dec(b.fator_custos) || 1.1;
  const maxCasa = Math.floor(maxEmp / fator / 10000) * 10000;
  return {
    id: b.id, nome: b.nome, ratio, prazo, por1M, limiteParcela, maxEmp, maxCasa,
    casaSegura: Math.floor((maxCasa * 0.8) / 10000) * 10000,
    parcelaReal: pmt(b.taxa_real, prazo, maxEmp),
    taxa_aprov: dec(b.taxa_aprov), taxa_real: dec(b.taxa_real),
  };
}

/**
 * Limite por banco e os alertas da ficha. Alertas são [tipo, texto] em texto
 * puro — a página põe na tela por textContent.
 */
export function credito(c, bancos, ref = new Date()) {
  const f = c.ficha || {};
  const cd = c.codevedor || {};
  const cr = c.credito || {};
  const somar = !!cr.somar_codevedor && !!cd.ativo;
  const quit = cr.considerar_quitacao !== false;
  const idadeReq = idade(f.nascimento, ref) ?? (cr.idade_manual ? num(cr.idade_manual) : null);
  // Quanto da renda do co-devedor o banco aceita (100% na 連帯債務; alguns
  // bancos contam só metade na 収入合算). Vazio = 100%, como na planilha.
  const pctCo = cr.pct_codevedor === '' || cr.pct_codevedor == null ? 100 : Math.min(100, Math.max(0, dec(cr.pct_codevedor)));
  const rendaReq = num(f.renda_anual);
  const rendaCo = somar ? Math.round((num(cd.renda_anual) * pctCo) / 100) : 0;
  const renda = rendaReq + rendaCo;
  const divida = dividaMensal(f, quit) + (somar ? dividaMensal(cd, quit) : 0);
  const dividaSemQuitar = dividaMensal(f, false) + (somar ? dividaMensal(cd, false) : 0);
  const ativos = (bancos || []).filter((b) => b.ativo !== false);
  const res = ativos.map((b) => umBanco(b, renda, divida, idadeReq));

  const alertas = [];
  if (!renda) alertas.push(['erro', 'Sem renda anual na Ficha — o cálculo fica zerado. Preencha 年収 do requerente.']);
  const perm = f.permanente;
  if (perm && perm !== 'sim' && perm !== 'tokubetsu') {
    alertas.push(['erro', 'Sem 永住権 (visto permanente): o FLAT35 não aceita e a maioria dos bancos também não. Só siga com banco que aceite explicitamente (ex.: cônjuge japonês/永住 como 連帯債務者).']);
  }
  if (!perm) alertas.push(['aviso', 'Situação do visto (永住権) não informada na Ficha.']);
  const mesesEmp = mesesDesde(f.admissao, ref);
  if (mesesEmp != null && mesesEmp < 12) {
    alertas.push(['aviso', `Emprego atual com ${mesesEmp} meses (入社日). A maioria dos bancos pede 1 ano ou mais (派遣/契約: muitas vezes 2–3 anos). Sem 源泉徴収票 de ano completo, a renda declarada é só estimativa (見込み).`]);
  }
  if (['haken', 'keiyaku', 'part'].includes(f.contrato_tipo)) {
    alertas.push(['info', 'Contrato não efetivo (派遣/契約/パート): confirme no banco o tempo mínimo de casa e se aceitam a renda do último 源泉徴収票.']);
  }
  if (idadeReq == null) alertas.push(['aviso', 'Data de nascimento não preenchida: prazo calculado pelo máximo do banco.']);
  if (cr.somar_codevedor && !cd.ativo) {
    alertas.push(['info', '"Somar renda do co-devedor" está ligado, mas a aba Co-devedor está desativada.']);
  }
  const idadeCo = somar ? idade(cd.nascimento, ref) : null;
  if (idadeCo != null && idadeReq != null && idadeCo > idadeReq) {
    alertas.push(['info', `O co-devedor (${idadeCo} anos) é mais velho que o requerente (${idadeReq}). O prazo aqui segue a idade do requerente; alguns bancos usam a do mais velho — confirme.`]);
  }

  let ganhoQuitar = null;
  if (quit && dividaSemQuitar > divida && ativos.length) {
    const sem = umBanco(ativos[0], renda, dividaSemQuitar, idadeReq);
    const com = res[0];
    ganhoQuitar = {
      banco: com.nome, parcelaLiberada: dividaSemQuitar - divida, ganho: com.maxEmp - sem.maxEmp,
      saldo: saldoAQuitar(f) + (somar ? saldoAQuitar(cd) : 0),
    };
  }
  return { idadeReq, renda, rendaReq, rendaCo, pctCo, divida, dividaSemQuitar, bancos: res, alertas, ganhoQuitar, somar };
}

// ── 資金計画書 ───────────────────────────────────────────────────────────────

export function simulacao(c) {
  const s = c.simulacao || {};
  const preco = num(s.preco);
  const baseCorr = s.base_corretagem === 'com' ? preco : (num(s.preco_sem_imposto) || preco);
  const proprio = num(s.proprio);
  const rJimu = (s.taxa_jimu === undefined || s.taxa_jimu === '' || s.taxa_jimu === null ? 2.2 : dec(s.taxa_jimu)) / 100;
  const linhas = (s.custos || []).map((x) => ({ ...x }));
  let outros = 0;
  for (const l of linhas) {
    if (l.k === 'chukai' && l.auto !== false) l.calc = preco ? Math.floor((baseCorr * 0.03 + 60000) * 1.1) : 0;
    else if (l.k === 'jimu' && l.auto !== false) l.calc = null; // depende dos outros: fica para depois
    else l.calc = num(l.valor);
    if (l.calc !== null) outros += l.calc;
  }
  // A taxa do banco incide sobre o valor financiado, que já inclui a própria
  // taxa: fee = r·(preço + outros − próprio) ÷ (1 − r).
  const jimu = linhas.find((l) => l.k === 'jimu' && l.auto !== false);
  if (jimu) {
    jimu.calc = preco ? Math.ceil(Math.max(0, (rJimu * (preco + outros - proprio)) / (1 - rJimu))) : 0;
    outros += jimu.calc;
  }
  const custos = outros;
  const total = preco ? Math.ceil((preco + custos) / 10000) * 10000 : 0;
  const arredondamento = total - preco - custos;
  const emprestimo = Math.max(0, total - proprio);

  const tr = (s.tranches || []).map((t) => ({ ...t }));
  let fixos = 0;
  for (const t of tr) {
    if (t.extra) { t.valor_calc = num(t.valor); continue; }
    if (t.modo === 'pct') t.valor_calc = Math.round((emprestimo * dec(t.pct)) / 100);
    else if (t.modo === 'valor') t.valor_calc = num(t.valor);
    else continue;
    fixos += t.valor_calc;
  }
  const restos = tr.filter((t) => !t.extra && t.modo !== 'pct' && t.modo !== 'valor');
  for (const t of restos) t.valor_calc = Math.max(0, Math.round((emprestimo - fixos) / restos.length));

  let mensal = 0; let anual = 0; let alocado = 0;
  for (const t of tr) {
    t.mensal = pmt(t.taxa, t.prazo, t.valor_calc);
    t.anual = t.mensal * 12;
    t.totalPago = t.mensal * dec(t.prazo) * 12;
    mensal += t.mensal; anual += t.anual;
    if (!t.extra) alocado += t.valor_calc;
  }
  const alertas = [];
  if (tr.length && Math.abs(alocado - emprestimo) > 1) {
    alertas.push(['aviso', `A soma das parcelas do financiamento (¥${Math.round(alocado).toLocaleString('ja-JP')}) não bate com o 借入金額 (¥${emprestimo.toLocaleString('ja-JP')}).`]);
  }
  return { preco, baseCorr, proprio, linhas, custos, arredondamento, total, emprestimo, tranches: tr, mensal, anual, alertas };
}

// ── planos de pagamento prontos ─────────────────────────────────────────────

/** Um botão por banco ativo ("banco único") e os três planos compostos. */
export function planosDisponiveis(bancos) {
  const lista = (bancos?.lista || []).filter((b) => b.ativo !== false);
  const planos = lista.filter((b) => b.id !== 'flat35').map((b) => ({ chave: `unico:${b.id}`, rotulo: b.nome }));
  if (lista.some((b) => b.id === 'flat35')) planos.push({ chave: 'flat9010', rotulo: 'FLAT35 90% + 10%' });
  planos.push({ chave: 'pair', rotulo: 'ペアローン' });
  if (lista.some((b) => b.id === 'rokin')) planos.push({ chave: 'matome', rotulo: 'ROUKIN + まとめトク' });
  return planos;
}

/** Banco contra o qual o plano é conferido (limite de crédito). */
export function bancoDoPlano(plano) {
  if (!plano) return null;
  if (plano.startsWith('unico:')) return plano.slice(6);
  return { flat9010: 'flat35', matome: 'rokin' }[plano] || null;
}

/** As linhas (tranches) do plano escolhido. Os prazos saem do limite por banco. */
export function montarPlano(plano, c, bancos, ref = new Date()) {
  const lista = bancos?.lista || [];
  const cr = credito(c, lista, ref);
  const calc = (id) => cr.bancos.find((x) => x.id === id) || {};
  const banco = (id) => lista.find((x) => x.id === id) || {};
  const prazo = (id, padrao) => calc(id).prazo || padrao;
  const primeiro = lista.find((b) => b.ativo !== false && b.id !== 'flat35') || {};

  if (plano.startsWith('unico:')) {
    const id = plano.slice(6);
    return [{ nome: '住宅ローン', modo: 'resto', prazo: prazo(id, 35), tipo: '変動', taxa: banco(id).taxa_real ?? 1 }];
  }
  if (plano === 'flat9010') {
    return [
      { nome: 'フラット35（90%）', modo: 'pct', pct: 90, prazo: prazo('flat35', 35), tipo: '固定', taxa: banco('flat35').taxa_real ?? 3.92 },
      { nome: '住宅ローン（10%）', modo: 'resto', prazo: prazo('flat35', 35), tipo: '変動', taxa: bancos?.financeira10 ?? 4.09 },
    ];
  }
  if (plano === 'pair') {
    const taxa = primeiro.taxa_real ?? 1;
    const anos = prazo(primeiro.id, 35);
    return [
      { nome: c.ficha?.nome || '申込人', modo: 'pct', pct: 50, prazo: anos, tipo: '変動', taxa },
      { nome: c.codevedor?.nome || 'ペアローン', modo: 'resto', prazo: anos, tipo: '変動', taxa },
    ];
  }
  if (plano === 'matome') {
    const quitar = saldoAQuitar(c.ficha) + (c.codevedor?.ativo ? saldoAQuitar(c.codevedor) : 0);
    return [
      { nome: '住宅ローン', modo: 'resto', prazo: prazo('rokin', 39), tipo: '変動', taxa: bancos?.matome_casa ?? 2.24 },
      { nome: 'まとめ（借り換え）', modo: 'valor', extra: true, valor: quitar, prazo: 10, tipo: '変動', taxa: bancos?.matome_refin ?? 2.69 },
    ];
  }
  return [];
}

// ── limpeza do que vem do navegador ─────────────────────────────────────────
//
// Nada de JSON livre no banco: cada parte da ficha tem uma lista fechada de
// campos, com tipo e tamanho. O que não está na lista é descartado; valor
// fora da faixa vira vazio (a tela faz a mesma leitura, então o que o
// corretor vê é o que fica gravado).

const txt = (max = 200) => (v) => String(v ?? '')
  // eslint-disable-next-line no-control-regex
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').slice(0, max);
const data = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) && comoData(v) ? String(v) : '');
const escolha = (lista) => (v) => (lista.includes(v) ? v : '');
const logico = (v) => v === true || v === 'true' || v === 1;
const ienes = (min = 0, max = 1e11) => (v) => {
  if (v === '' || v === null || v === undefined) return '';
  const n = inteiro(v);
  return n >= min && n <= max ? n : '';
};
const decimal = (min, max) => (v) => {
  if (v === '' || v === null || v === undefined) return '';
  const n = dec(v);
  return n >= min && n <= max ? n : '';
};
const chaves = (pares) => pares.map((p) => p[0]).filter(Boolean);

function limparObjeto(bruto, campos) {
  const o = bruto && typeof bruto === 'object' && !Array.isArray(bruto) ? bruto : {};
  const saida = {};
  for (const [k, limpar] of Object.entries(campos)) {
    if (k in o) saida[k] = limpar(o[k]);
  }
  return saida;
}
const listaDe = (campos, max) => (v) => (Array.isArray(v) ? v.slice(0, max).map((x) => limparObjeto(x, campos)) : []);

const FAMILIAR = { nome: txt(120), relacao: txt(40), nascimento: data, renda: ienes(), trabalho: txt(160) };
const EMPRESTIMO = {
  tipo: txt(80), finalidade: txt(80), data, valor: ienes(), parcela: ienes(), saldo: ienes(),
  quitar: escolha(['sim', 'nao']),
};
const PESSOA = {
  nome: txt(120), furigana: txt(120), alias: txt(120), nascimento: data, nacionalidade: txt(60),
  permanente: escolha(chaves(PERMANENTE)), carteira: escolha(['sim', 'nao']),
  cep: txt(12), endereco: txt(240), telefone: txt(30), email: txt(160),
  tempo_japao: txt(40), tempo_residencia: txt(40), aluguel: ienes(),
  familia: listaDe(FAMILIAR, 12),
  renda_anual: ienes(), renda_obs: escolha(chaves(BASE_RENDA)), dia_pagamento: txt(20),
  haken_nome: txt(160), haken_tel: txt(30), haken_cep: txt(12), haken_endereco: txt(240),
  empresa: txt(160), empresa_tel: txt(30), empresa_cep: txt(12), empresa_endereco: txt(240),
  servico: txt(120), admissao: data, contrato_tipo: escolha(chaves(CONTRATOS)), contrato_prazo: txt(60),
  transporte_atual: txt(80), transporte_novo: txt(80),
  emprestimos: listaDe(EMPRESTIMO, 20),
  licenca: escolha(['sim', 'nao']), licenca_periodo: txt(120), licenca_retorno: data,
};
const CUSTO = { k: txt(24), nome: txt(60), obs: txt(120), pagar: txt(60), valor: ienes(-1e9, 1e10), auto: logico };
const TRANCHE = {
  nome: txt(60), modo: escolha(chaves(MODO_PARCELA)), pct: decimal(0, 100), valor: ienes(),
  prazo: decimal(0, 50), tipo: escolha(TIPO_JUROS), taxa: decimal(0, 20), extra: logico,
};

const PARTES = {
  ficha: { ...PESSOA, observacoes: txt(4000) },
  codevedor: { ...PESSOA, ativo: logico, papel: escolha(chaves(PAPEL_CODEVEDOR)), relacao: txt(40) },
  credito: {
    considerar_quitacao: logico, somar_codevedor: logico,
    idade_manual: decimal(0, 110), pct_codevedor: decimal(0, 100),
  },
  simulacao: {
    imovel: txt(200), vendedor: txt(120), tipo: escolha(chaves(TIPO_IMOVEL)),
    area_constr: decimal(0, 100000), area_terreno: decimal(0, 1000000),
    preco: ienes(), preco_sem_imposto: ienes(), base_corretagem: escolha(['sem', 'com']),
    taxa_jimu: decimal(0, 10), proprio: ienes(), plano: txt(40),
    custos: listaDe(CUSTO, 30), tranches: listaDe(TRANCHE, 8),
  },
};

export const PARTES_DA_FICHA = Object.keys(PARTES);

/** Limpa uma das quatro partes (ficha, codevedor, credito, simulacao). */
export function limparParte(parte, bruto) {
  if (!PARTES[parte]) throw new Error('parte da ficha desconhecida');
  return limparObjeto(bruto, PARTES[parte]);
}

export const statusValido = (v) => STATUS.some((s) => s[0] === v);

const BANCO = {
  id: (v) => String(v ?? '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 24),
  nome: txt(40), ativo: logico, regra: escolha(chaves(REGRAS)),
  ratio: decimal(0, 60), taxa_aprov: decimal(0, 20), taxa_real: decimal(0, 20),
  prazo_max: decimal(1, 50), idade_final: decimal(50, 100), limite_max: ienes(),
  fator_custos: decimal(1, 2), obs: txt(300),
};

/**
 * Tabela de bancos vinda do administrador. Recusa em vez de consertar: uma
 * taxa vazia ou um banco sem nome viraria limite errado na tela de todos.
 */
export function limparBancos(bruto) {
  const o = bruto && typeof bruto === 'object' ? bruto : {};
  const lista = listaDe(BANCO, 12)(o.lista);
  if (!lista.length) throw new Error('a tabela precisa de pelo menos um banco');
  const ids = new Set();
  for (const b of lista) {
    if (!b.id || !b.nome) throw new Error('todo banco precisa de nome');
    if (ids.has(b.id)) throw new Error(`banco repetido: ${b.nome}`);
    ids.add(b.id);
    if (!b.regra) throw new Error(`${b.nome}: escolha a regra de 返済負担率`);
    for (const [k, rotulo] of [['taxa_aprov', '審査金利'], ['taxa_real', '実行金利'], ['prazo_max', 'prazo máximo'], ['idade_final', 'idade final']]) {
      if (b[k] === '' || b[k] === undefined) throw new Error(`${b.nome}: confira ${rotulo}`);
    }
    if (b.regra === 'fixo' && !b.ratio) throw new Error(`${b.nome}: informe o % fixo de 返済負担率`);
    if (b.ratio === '' || b.ratio === undefined) b.ratio = 35;
    if (b.limite_max === '' || b.limite_max === undefined) b.limite_max = 0;
    if (b.fator_custos === '' || b.fator_custos === undefined) b.fator_custos = 1.1;
    b.obs ??= '';
    if (!('ativo' in b)) b.ativo = true;
  }
  const taxa = (k, rotulo) => {
    const v = decimal(0, 20)(o[k]);
    if (v === '') throw new Error(`confira: ${rotulo}`);
    return v;
  };
  return {
    conferido_em: data(o.conferido_em) || hojeJST(),
    financeira10: taxa('financeira10', 'taxa da financeira (10% do FLAT35)'),
    matome_casa: taxa('matome_casa', 'ROUKIN com まとめトク — taxa da casa'),
    matome_refin: taxa('matome_refin', 'ROUKIN com まとめトク — taxa do refinanciamento'),
    lista,
  };
}

/** Tabela gravada + o que ela ainda não tem (campos criados depois). */
export function completarBancos(gravado) {
  if (!gravado?.lista?.length) return structuredClone(BANCOS_PADRAO);
  return { ...BANCOS_PADRAO, ...gravado };
}

/**
 * Juros padrão da simulação de parcelas do processo, tirados da tabela de
 * bancos: a 実行金利 do banco do processo e, no FLAT35, a taxa da financeira.
 */
export function jurosDoProcesso(bancos, bancoDoProcesso) {
  const b = (bancos?.lista || []).find((x) => x.id === bancoDoProcesso);
  const saida = {};
  if (b && dec(b.taxa_real) > 0) saida.juros = dec(b.taxa_real);
  if (bancoDoProcesso === 'flat35' && dec(bancos?.financeira10) > 0) saida.juros_financeira = dec(bancos.financeira10);
  return saida;
}
