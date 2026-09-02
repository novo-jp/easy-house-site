/**
 * lib/casas.mjs — modelo de apresentação das casas à venda.
 *
 * .mjs, não .js: ver a nota em casas-fonte.mjs.
 *
 * Converte a linha crua de `casas_venda_aichi` (scraper da Reprice, campos em
 * japonês) no objeto que o site mostra ao público, em português.
 *
 * Regra que atravessa o arquivo inteiro: **nada é inventado**. Quando o dado
 * não veio do scraper, o campo fica `null` e a interface omite a linha em vez
 * de preencher com suposição.
 */

import { calculateMonthlyPayment } from './financing.js';

/* ─────────────────────────────────────────────────────────────
   Sanitização

   Tudo aqui vem de páginas de terceiros. O texto é tratado como
   texto puro: nunca vira HTML, nunca vira URL sem conferência.
   ───────────────────────────────────────────────────────────── */

export function texto(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/\s+/g, ' ').trim();
  return s ? s : null;
}

/** Texto que será interpolado em HTML no servidor. */
export function escaparHtml(v) {
  const s = texto(v);
  if (s === null) return '';
  return s.replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/** Só aceita http(s) de hosts conhecidos das fotos. Qualquer outra coisa vira null. */
const HOSTS_FOTO = new Set(['img.miraie-net.com', 'www.miraie-net.com', 'miraie-net.com']);
export function urlFotoSegura(v) {
  const s = texto(v);
  if (!s) return null;
  let u;
  try { u = new URL(s); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  if (!HOSTS_FOTO.has(u.hostname)) return null;
  u.protocol = 'https:';
  return u.toString();
}

/* ─────────────────────────────────────────────────────────────
   Era japonesa → ano gregoriano

   O scraper devolve "平成30年9月". Um comprador brasileiro não tem
   como saber que isso é 2018, então guardamos os dois.
   ───────────────────────────────────────────────────────────── */

const ERAS = [
  { nome: '令和', base: 2018 },   // Reiwa  começou em 2019 = 令和1
  { nome: '平成', base: 1988 },   // Heisei começou em 1989 = 平成1
  { nome: '昭和', base: 1925 },   // Showa  começou em 1926 = 昭和1
  { nome: '大正', base: 1911 }
];

export function anoConstrucao(bruto) {
  const s = texto(bruto);
  if (!s) return null;

  // Formato já gregoriano: "2002-09" ou "2002年9月"
  const g = s.match(/^(\d{4})[-年/.](\d{1,2})?/);
  if (g) return { ano: Number(g[1]), mes: g[2] ? Number(g[2]) : null, original: s };

  for (const era of ERAS) {
    const m = s.match(new RegExp(`${era.nome}\\s*(\\d{1,2}|元)\\s*年\\s*(\\d{1,2})?`));
    if (m) {
      const n = m[1] === '元' ? 1 : Number(m[1]);
      return { ano: era.base + n, mes: m[2] ? Number(m[2]) : null, original: s };
    }
  }
  return null;
}

/** Idade em anos completos; null quando não sabemos o ano. */
export function idadeImovel(info, hoje = new Date()) {
  if (!info || !info.ano) return null;
  const idade = hoje.getFullYear() - info.ano;
  return idade >= 0 ? idade : null;
}

/* ─────────────────────────────────────────────────────────────
   Dicionários

   Termo em português + termo japonês entre parênteses, como pede o
   briefing: o cliente entende, e quem for à imobiliária reconhece.
   ───────────────────────────────────────────────────────────── */

const USO_TERRENO = {
  '1種低層': 'Residencial de baixa altura',
  '2種低層': 'Residencial de baixa altura (categoria 2)',
  '1種中高': 'Residencial de média/alta altura',
  '2種中高': 'Residencial de média/alta altura (categoria 2)',
  '1種住居': 'Residencial',
  '2種住居': 'Residencial (categoria 2)',
  '準住居':  'Residencial misto',
  '準工業':  'Misto industrial leve',
  '工業':    'Industrial',
  '工業専用': 'Exclusivamente industrial',
  '近隣商業': 'Comercial de bairro',
  '商業':    'Comercial',
  '田園住居': 'Residencial rural',
  '指定無':  'Sem zoneamento definido',
  '無指定':  'Sem zoneamento definido'
};

const DIREITO_TERRENO = {
  '所有権':   'Propriedade plena',
  '借地権':   'Direito de superfície (terreno alugado)',
  '定期借地権': 'Direito de superfície por prazo determinado'
};

const TRANSACAO = {
  '売主':  'Vendedor direto',
  '媒介':  'Intermediação',
  '仲介':  'Intermediação',
  '専任':  'Intermediação exclusiva',
  '専属専任': 'Intermediação exclusiva'
};

const ENTREGA = {
  '即時':   'Imediata',
  '相談':   'A combinar',
  '応相談': 'A combinar',
  '契約後': 'Após o contrato'
};

const ESTRUTURA = [
  [/木造/,       'Madeira'],
  [/軽量鉄骨/,   'Estrutura metálica leve'],
  [/重量鉄骨/,   'Estrutura metálica pesada'],
  [/鉄骨鉄筋|SRC/, 'Concreto armado com perfis metálicos (SRC)'],
  [/鉄筋|RC/,    'Concreto armado (RC)'],
  [/鉄骨|S造/,   'Estrutura metálica'],
  [/ブロック/,   'Blocos de concreto']
];

/** "木造 地上2階建て" → "Madeira · 2 andares" */
export function traduzirEstrutura(bruto) {
  const s = texto(bruto);
  if (!s) return null;
  const partes = [];
  for (const [re, pt] of ESTRUTURA) { if (re.test(s)) { partes.push(pt); break; } }
  const andares = s.match(/地上\s*(\d+)\s*階/);
  if (andares) partes.push(`${andares[1]} ${andares[1] === '1' ? 'andar' : 'andares'}`);
  const sub = s.match(/地下\s*(\d+)\s*階/);
  if (sub) partes.push(`${sub[1]} subsolo`);
  return partes.length ? { pt: partes.join(' · '), jp: s } : { pt: null, jp: s };
}

function traduzirPor(dicionario, bruto) {
  const s = texto(bruto);
  if (!s) return null;
  if (dicionario[s]) return { pt: dicionario[s], jp: s };
  for (const [jp, pt] of Object.entries(dicionario)) {
    if (s.includes(jp)) return { pt, jp: s };
  }
  return { pt: null, jp: s };   // desconhecido: mostramos o original, sem inventar
}

/**
 * Cidades que o scraper não traduziu.
 *
 * O dicionário dele cobre as cidades grandes; vilas e distritos (郡) ficam de
 * fora e chegariam ao cliente em japonês. As leituras abaixo são os nomes
 * oficiais dos municípios — informação verificável, não suposição. Quando um
 * nome novo aparecer, ele continua em japonês na tela até ser acrescentado
 * aqui: preferimos o japonês visível a um palpite de leitura.
 */
const CIDADES_PT = {
  '四日市': 'Yokkaichi',        '四日市市': 'Yokkaichi',
  '三重郡川越町': 'Kawagoe',    '羽島郡岐南町': 'Ginan',
  '本巣市': 'Motosu',           '額田郡幸田町': 'Kota',
  '知多郡阿久比町': 'Agui',      '知多郡東浦町': 'Higashiura',
  '海部郡蟹江町': 'Kanie',       '海部郡大治町': 'Oharu',
  '愛知郡東郷町': 'Togo',        '丹羽郡扶桑町': 'Fuso'
};

/** Nome da cidade em alfabeto latino; devolve o japonês quando não conhecemos. */
export function cidadePt(cidadePtBanco, cidadeJp) {
  const doBanco = texto(cidadePtBanco);
  const temKanji = (s) => /[\u3040-\u30ff\u3400-\u9fff]/.test(s || '');
  if (doBanco && !temKanji(doBanco)) return doBanco;

  const chave = texto(cidadeJp) || doBanco;
  if (!chave) return doBanco;
  if (CIDADES_PT[chave]) return CIDADES_PT[chave];

  const semSufixo = chave.replace(/[市町村区]$/, '');
  if (CIDADES_PT[semSufixo]) return CIDADES_PT[semSufixo];

  return doBanco || chave;
}

/* ─────────────────────────────────────────────────────────────
   Estacionamento e estação
   ───────────────────────────────────────────────────────────── */

/** "有 2台" → 2 vagas · "敷地内 7,000円/月" → vaga paga · "空無" → sem vaga */
export function estacionamento(bruto) {
  const s = texto(bruto);
  if (!s) return null;

  if (/^空無|^無$|^なし/.test(s)) return { vagas: 0, pt: 'Sem vaga', mensalidade: null, jp: s };

  const vagas = s.match(/(\d+)\s*台/);
  const mensal = s.match(/([\d,]+)\s*円\s*\/?\s*月/);
  const n = vagas ? Number(vagas[1]) : null;
  const valor = mensal ? Number(mensal[1].replace(/,/g, '')) : null;

  let pt;
  if (n !== null) pt = `${n} ${n === 1 ? 'vaga' : 'vagas'}`;
  else if (valor !== null) pt = 'Vaga alugada à parte';
  else if (/有/.test(s)) pt = 'Com vaga';
  else pt = null;

  return { vagas: n, pt, mensalidade: valor, jp: s };
}

/**
 * "武豊線「亀崎」駅 3km 徒歩38分／車8分 知多バス「上池」停 約950m"
 *   → linha, estação, minutos a pé
 */
export function acesso(bruto, minutosBanco) {
  const s = texto(bruto);
  if (!s) return null;
  const est = s.match(/「([^」]+)」\s*駅/);
  const linha = s.match(/^([^「]+?)「/);
  const aPe = s.match(/徒歩\s*(\d+)\s*分/);
  const dist = s.match(/([\d.]+)\s*km/);
  return {
    estacao: est ? est[1] : null,
    linha: linha ? texto(linha[1]) : null,
    minutosAPe: aPe ? Number(aPe[1]) : (Number.isFinite(minutosBanco) ? minutosBanco : null),
    distanciaKm: dist ? Number(dist[1]) : null,
    jp: s
  };
}

/* ─────────────────────────────────────────────────────────────
   Destaques do anúncio (設備・特徴)

   O portal manda uma lista de termos padronizados do mercado
   imobiliário japonês. São expressões fixas, com tradução direta —
   não texto livre —, então dá para traduzir sem interpretar nada.
   Termo desconhecido continua aparecendo em japonês: melhor o cliente
   ver o original e perguntar do que ler um palpite nosso.
   ───────────────────────────────────────────────────────────── */

const DESTAQUES_PT = {
  // Cozinha
  'システムキッチン': 'Cozinha planejada',
  'カウンターキッチン': 'Cozinha com bancada',
  '独立キッチン': 'Cozinha independente',
  'パントリー': 'Despensa',
  '食器洗浄乾燥機': 'Lava-louças',
  'グリル': 'Grill embutido',
  'IHクッキングヒーター': 'Cooktop por indução',

  // Banheiro e lavanderia
  '追焚機能': 'Reaquecimento da banheira',
  '浴室暖房': 'Aquecimento no banheiro',
  '浴室乾燥機': 'Secadora de roupas no banheiro',
  '洗髪洗面化粧台': 'Bancada com ducha para lavar o cabelo',
  '温水洗浄便座': 'Vaso sanitário com ducha (washlet)',
  'トイレ2箇所': '2 banheiros',
  '室内洗濯機置場': 'Espaço interno para a máquina de lavar',
  '浴室1.6×1.6m以上': 'Banheiro amplo (1,6 × 1,6 m ou mais)',
  'バリアフリー': 'Sem degraus (acessível)',

  // Armazenamento
  '全居室収納': 'Armário em todos os quartos',
  '床下収納': 'Compartimento sob o piso',
  'ウォークインクローゼット': 'Closet',
  'シューズインクローク': 'Sapateira de entrada',
  '納戸': 'Quarto de despejo',
  '収納スペース': 'Espaço de armazenamento',
  'ロフト': 'Mezanino',

  // Espaços
  'LDK15畳以上': 'Sala/cozinha ampla (15 tatames ou mais)',
  'LDK18畳以上': 'Sala/cozinha ampla (18 tatames ou mais)',
  'LDK20畳以上': 'Sala/cozinha ampla (20 tatames ou mais)',
  '吹抜': 'Pé-direito duplo',
  '可動間仕切': 'Divisória móvel',
  '庭': 'Quintal',
  '専用庭': 'Quintal privativo',
  'ウッドデッキ': 'Deck de madeira',
  '2面バルコニー': 'Sacada em 2 lados',
  '両面バルコニー': 'Sacada em 2 lados',
  '3面バルコニー': 'Sacada em 3 lados',
  'ワイドバルコニー': 'Sacada ampla',
  'ルーフバルコニー': 'Terraço na cobertura',
  'アルコーブ': 'Recuo na entrada',
  '全室フローリング': 'Piso de madeira em todos os cômodos',
  '二世帯向': 'Adequado para duas famílias',

  // Estacionamento
  '駐車2台可能': 'Cabem 2 carros',
  '駐車3台以上可能': 'Cabem 3 carros ou mais',
  'ハイルーフ駐車可能': 'Cabe carro alto',
  '駐輪場': 'Bicicletário',
  'バイク置場': 'Vaga para moto',

  // Terreno e posição
  '整形地': 'Terreno regular',
  '平坦地': 'Terreno plano',
  '角地': 'Terreno de esquina',
  '角部屋': 'Unidade de canto',
  '高台に立地': 'Situado em terreno alto',
  '南向': 'Face sul',
  '全室南向': 'Todos os cômodos voltados ao sul',
  '南側道路面す': 'Frente para rua ao sul',
  '陽当り良好': 'Boa iluminação natural',
  '眺望良好': 'Boa vista',
  '閑静な住宅街': 'Bairro residencial tranquilo',
  '全室2面採光': 'Luz natural por 2 lados em todos os cômodos',
  '最上階': 'Último andar',
  '外観タイル張': 'Fachada revestida em cerâmica',

  // Segurança e prédio
  'モニタ付インターホン': 'Interfone com vídeo',
  'オートロック': 'Portaria com tranca automática',
  '防犯カメラ': 'Câmeras de segurança',
  '24時間セキュリティ': 'Segurança 24 horas',
  'ディンプルキー': 'Fechadura de alta segurança',
  '電動シャッター': 'Portão elétrico',
  '宅配BOX': 'Armário para entregas',
  'エレベーター': 'Elevador',
  'エレベーター2基': '2 elevadores',
  '管理人日勤': 'Zelador em horário comercial',
  '管理人常駐': 'Zelador residente',

  // Instalações
  '太陽光発電システム': 'Sistema de energia solar',
  '24時間換気システム': 'Ventilação 24 horas',
  '複層ガラス': 'Vidro duplo',
  'エアコン': 'Ar-condicionado',
  '光インターネット': 'Internet por fibra óptica',
  'CATV': 'TV a cabo',
  'BS': 'Antena BS',
  'CS': 'Antena CS',

  // Regras e garantias
  'ペット相談': 'Aceita pet (a combinar)',
  '楽器相談': 'Instrumentos musicais (a combinar)',
  '長期優良住宅': 'Certificado de casa de longa durabilidade',
  '建築確認完了検査済証': 'Certificado de vistoria de obra concluída',
  '瑕疵保証(不動産会社独自)有': 'Garantia contra vícios (da imobiliária)',
  '瑕疵保険(国交省指定)付': 'Seguro contra vícios (registrado no Ministério)',
  '瑕疵保険検査基準適合': 'Aprovado na vistoria do seguro contra vícios'
};

/**
 * Traduz um destaque. Devolve sempre {pt, jp}: quando não conhecemos o
 * termo, `pt` vem null e a interface mostra o japonês original.
 */
export function traduzirDestaque(termo) {
  const jp = texto(termo);
  if (!jp) return null;
  return { pt: DESTAQUES_PT[jp] || null, jp };
}

export function listaDestaques(bruto) {
  const s = texto(bruto);
  if (!s) return [];
  return s.split(/[\s\u3000]+/).filter(Boolean).map(traduzirDestaque).filter(Boolean);
}

/* ─────────────────────────────────────────────────────────────
   Estimativa de parcela

   Sempre rotulada como estimativa na interface. A taxa vem do
   financing-config (fonte única); prazo e entrada, do casas-config.
   ───────────────────────────────────────────────────────────── */

export function estimativaMensal(precoYen, casasConfig, financingConfig) {
  if (!Number.isFinite(precoYen) || precoYen <= 0) return null;

  const e = casasConfig?.estimativa;
  const produto = financingConfig?.[e?.produto ?? 'flat35'];
  if (!e || !produto?.referenceAnnualRate) return null;

  const entrada = precoYen * (e.entradaPercentual ?? 0);
  const principal = Math.max(0, precoYen - entrada);
  const bruto = calculateMonthlyPayment(principal, produto.referenceAnnualRate, e.prazoAnos);
  if (!Number.isFinite(bruto) || bruto <= 0) return null;

  const passo = e.arredondarPara || 1;
  return {
    valor: Math.round(bruto / passo) * passo,
    prazoAnos: e.prazoAnos,
    taxaAnual: produto.referenceAnnualRate,
    taxaRotulo: produto.rateDisplayLabel ?? null,
    produtoRotulo: produto.label ?? null,
    entradaPercentual: e.entradaPercentual ?? 0,
    avisoCurto: e.avisoCurto,
    avisoLongo: e.avisoLongo
  };
}

/* ─────────────────────────────────────────────────────────────
   Formatação
   ───────────────────────────────────────────────────────────── */

export function formatarYen(v) {
  if (!Number.isFinite(v)) return null;
  return '¥' + Math.round(v).toLocaleString('ja-JP');
}

/** ¥23.490.000 → "2.349 万円", como o mercado japonês anuncia. */
export function formatarMan(v) {
  if (!Number.isFinite(v)) return null;
  const man = v / 10000;
  const s = Number.isInteger(man) ? man.toLocaleString('pt-BR')
                                  : man.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  return `${s} 万円`;
}

export function formatarArea(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return `${n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} m²`;
}

/* ─────────────────────────────────────────────────────────────
   Slug e código público
   ───────────────────────────────────────────────────────────── */

const SEM_ACENTO = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Código curto e estável mostrado ao cliente: EH-XXXXXXX (o id da Reprice). */
export function codigoPublico(linha) {
  const cgi = texto(linha.cgi_id);
  if (cgi) return `EH-${cgi}`;
  const id = texto(linha.id) || '';
  return `EH-${id.slice(-7).toUpperCase()}`;
}

/**
 * "casa-4ldk-toyota-eh3851266"
 * O sufixo com o código garante unicidade: cidade e planta se repetem.
 */
export function slugDe(linha) {
  const partes = ['casa'];
  const planta = texto(linha.planta);
  if (planta) partes.push(planta.toLowerCase());
  const cidade = cidadePt(linha.cidade_pt, linha.cidade);
  if (cidade) partes.push(SEM_ACENTO(cidade).toLowerCase());
  partes.push(codigoPublico(linha).toLowerCase().replace('-', ''));
  return partes.join('-').replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

/** Aceita o slug inteiro ou só o código; devolve o cgi_id / sufixo do id. */
export function codigoDoSlug(slug) {
  const s = texto(slug);
  if (!s) return null;
  const m = s.toLowerCase().match(/eh([a-z0-9]+)$/);
  return m ? m[1] : null;
}

/* ─────────────────────────────────────────────────────────────
   Normalização
   ───────────────────────────────────────────────────────────── */

/**
 * Um imóvel só é publicável quando temos o essencial para o cliente
 * decidir: foto, preço, planta e status de disponível. Sem isso ele
 * existe no banco para auditoria, mas não aparece no site.
 */
export function ehPublicavel(linha, casasConfig) {
  const p = casasConfig?.publicacao ?? {};
  const statusOk = (p.statusPublicaveis ?? ['紹介可能']).includes(texto(linha.status));
  const temFoto = !p.exigirFoto || !!urlFotoSegura(linha.foto_principal);
  const temPreco = !p.exigirPreco || Number(linha.preco_yen) > 0;
  return statusOk && temFoto && temPreco && !!texto(linha.planta);
}

/** Dias desde a última vez que o scraper viu o imóvel na origem. */
export function diasDesdeVisto(linha, agora = new Date()) {
  const v = linha.last_seen_at || linha.updated_at;
  if (!v) return null;
  const t = new Date(v).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.floor((agora.getTime() - t) / 86400000);
}

export function normalizarCasa(linha, casasConfig, financingConfig, agora = new Date()) {
  const preco = Number(linha.preco_yen) || null;
  const ano = anoConstrucao(linha.ano_construcao);
  const vaga = estacionamento(linha.estacionamento);
  const acc = acesso(linha.estacao, linha.minutos_estacao);
  const est = estimativaMensal(preco, casasConfig, financingConfig);
  const dias = diasDesdeVisto(linha, agora);

  const fotos = [];
  const principal = urlFotoSegura(linha.foto_principal);
  if (principal) fotos.push(principal);
  for (const f of Array.isArray(linha.fotos_extras) ? linha.fotos_extras : []) {
    const u = urlFotoSegura(f);
    if (u && !fotos.includes(u)) fotos.push(u);
  }

  const cidade = cidadePt(linha.cidade_pt, linha.cidade);
  const prefeitura = texto(linha.prefeitura_pt);
  const planta = texto(linha.planta);

  return {
    id: texto(linha.id),
    codigo: codigoPublico(linha),
    slug: slugDe(linha),

    titulo: [
      'Casa',
      planta || null,
      cidade ? `em ${cidade}` : null
    ].filter(Boolean).join(' '),

    cidade,
    cidadeJp: texto(linha.cidade),
    prefeitura,
    prefeituraJp: texto(linha.prefeitura),
    endereco: texto(linha.endereco),

    preco,
    precoFormatado: formatarYen(preco),
    precoMan: formatarMan(preco),
    comissaoPct: Number(linha.comissao_pct) || null,
    incluiReforma: linha.custo_inclui_reforma === true,

    planta,
    areaConstruida: Number(linha.area_constr_m2) || null,
    areaTerreno: Number(linha.area_terreno_m2) || null,
    ano,
    idade: idadeImovel(ano, agora),
    estrutura: traduzirEstrutura(linha.estrutura),
    usoTerreno: traduzirPor(USO_TERRENO, linha.uso_terreno),
    direitoTerreno: traduzirPor(DIREITO_TERRENO, linha.direito_terreno),
    transacao: traduzirPor(TRANSACAO, linha.transacao),
    entrega: traduzirPor(ENTREGA, linha.entrega),
    vaga,
    acesso: acc,

    reforma: texto(linha.reforma_info),
    destaques: texto(linha.highlights),
    destaquesLista: listaDestaques(linha.highlights),
    observacoes: texto(linha.observacoes),

    fotos,
    totalFotos: fotos.length,

    estimativa: est,

    // Controle — usado pelo site, não mostrado como dado do imóvel
    origem: { fonte: 'reprice', id: texto(linha.id), url: texto(linha.bukken_url) },
    statusJp: texto(linha.status),
    diasDesdeVisto: dias,
    ativo: dias === null ? true : dias <= (casasConfig?.publicacao?.diasParaInativar ?? 14),
    criadoEm: linha.created_at ?? null,
    atualizadoEm: linha.updated_at ?? null,
    novo: dias !== null && linha.created_at
      ? (agora - new Date(linha.created_at)) / 86400000 <= 14
      : false
  };
}

/* ─────────────────────────────────────────────────────────────
   WhatsApp contextual

   Cada botão diz de onde veio (`cta`) para sabermos depois o que
   converte, e leva o imóvel identificado — nunca uma mensagem solta.
   ───────────────────────────────────────────────────────────── */

const MOTIVOS = {
  simulacao: (c) => `Vi este imóvel no site da Easy House e gostaria de saber quanto ficaria aproximadamente a mensalidade para o meu perfil.`,
  visita:    (c) => `Vi este imóvel no site da Easy House e gostaria de verificar a disponibilidade para uma visita.`,
  duvida:    (c) => `Vi este imóvel no site da Easy House e gostaria de mais informações.`,
  disponivel:(c) => `Vi este imóvel no site da Easy House e gostaria de saber se ainda está disponível.`
};

export function mensagemWhatsApp(casa, motivo = 'duvida', url = null) {
  const linhas = ['Olá! ' + (MOTIVOS[motivo] ?? MOTIVOS.duvida)(casa), ''];
  linhas.push(`Imóvel: ${casa.titulo}`);
  linhas.push(`Código: ${casa.codigo}`);
  if (casa.precoFormatado) linhas.push(`Valor: ${casa.precoFormatado}`);
  if (url) linhas.push(`Link: ${url}`);
  return linhas.join('\n');
}

export function linkWhatsApp(casa, motivo, url, cta, config) {
  const numero = config?.whatsapp?.numero ?? '818028867708';
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensagemWhatsApp(casa, motivo, url))}`
       + (cta ? `#cta=${encodeURIComponent(cta)}` : '');
}
