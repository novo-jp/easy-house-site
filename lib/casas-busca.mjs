/**
 * lib/casas-busca.mjs — a busca de casas, do lado do servidor.
 *
 * Um só lugar para ler os parâmetros da URL, aplicar filtros, ordenar,
 * paginar e contar facetas. É usado por `/api/casas` (JSON para o navegador)
 * e por `/comprar/imoveis` (HTML renderizado no servidor), para que as duas
 * portas devolvam exatamente a mesma lista para a mesma URL.
 *
 * Regras que atravessam o arquivo:
 *   - parâmetro inválido volta ao padrão em silêncio (nunca 500);
 *   - um filtro só exclui um imóvel quando o dado EXISTE e não atende —
 *     imóvel que não informou o campo continua aparecendo, e a interface
 *     avisa isso ao lado do filtro;
 *   - nenhuma ordenação se chama "recomendados": cada ordem tem um critério
 *     que dá para explicar em uma frase.
 */

const MAX_LISTA = 30;          // valores por parâmetro multi (cidade=a,b,c…)
const MAX_TEXTO = 80;          // caracteres da busca livre
export const POR_PAGINA_PADRAO = 24;
export const POR_PAGINA_MAX = 48;
export const MAX_CODIGOS = 50; // favoritos/comparação: nunca o acervo inteiro

/** Remove acento e caixa para que "sao paulo" ache "São Paulo". */
export const chave = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// Number(null) e Number('') valem 0, não NaN — sem esta guarda um parâmetro
// ausente viraria "precoMax=0" e zeraria a busca inteira.
function num(v, { min = 0, max = Infinity } = {}) {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const limpo = String(v).replace(/[^\d.-]/g, '');
  if (!/\d/.test(limpo)) return null;              // "abc" não é 0 — é lixo
  const n = Number(limpo);
  if (!Number.isFinite(n)) return null;
  if (n < min || n > max) return null;
  return n;
}

function lista(v, normalizar = chave, max = MAX_LISTA) {
  if (!v) return [];
  return [...new Set(String(v).split(',').map(normalizar).filter(Boolean))].slice(0, max);
}

function umDe(v, permitidos) {
  const s = chave(v);
  return permitidos.includes(s) ? s : null;
}

/* ─────────────────────────────────────────────────────────────
   Ordenação — cada entrada explica a si mesma
   ───────────────────────────────────────────────────────────── */

const nulosPorUltimo = (get, dir = 1) => (a, b) => {
  const x = get(a), y = get(b);
  const xn = x === null || x === undefined || Number.isNaN(x);
  const yn = y === null || y === undefined || Number.isNaN(y);
  if (xn && yn) return 0;
  if (xn) return 1;
  if (yn) return -1;
  return (x - y) * dir;
};

export const ORDENS = {
  recentes: {
    rotulo: 'Mais recentes',
    explica: 'Anúncios publicados no site há menos tempo primeiro.',
    cmp: (a, b) => new Date(b.criadoEm || 0) - new Date(a.criadoEm || 0)
  },
  preco_asc: {
    rotulo: 'Menor preço',
    explica: 'Do mais barato para o mais caro.',
    cmp: nulosPorUltimo((c) => c.preco, 1)
  },
  preco_desc: {
    rotulo: 'Maior preço',
    explica: 'Do mais caro para o mais barato.',
    cmp: nulosPorUltimo((c) => c.preco, -1)
  },
  area_desc: {
    rotulo: 'Maior área construída',
    explica: 'Casas maiores primeiro (建物面積).',
    cmp: nulosPorUltimo((c) => c.areaConstruida, -1)
  },
  terreno_desc: {
    rotulo: 'Maior terreno',
    explica: 'Terrenos maiores primeiro (土地面積).',
    cmp: nulosPorUltimo((c) => c.areaTerreno, -1)
  },
  estacao_asc: {
    rotulo: 'Mais perto da estação',
    explica: 'Menos minutos a pé até a estação primeiro. Imóveis sem esse dado ficam no fim.',
    cmp: nulosPorUltimo((c) => c.acesso?.minutosAPe, 1)
  },
  novos: {
    rotulo: 'Construção mais nova',
    explica: 'Ano de construção mais recente primeiro.',
    cmp: nulosPorUltimo((c) => c.ano?.ano, -1)
  }
};
export const ORDEM_PADRAO = 'recentes';

// Nomes antigos que ainda podem estar em links compartilhados
const ORDENS_LEGADO = { recomendados: 'recentes', mensal_asc: 'preco_asc' };

/** Empate resolvido pelo código: a ordem tem que ser estável entre requests. */
function comparadorEstavel(cmp) {
  return (a, b) => cmp(a, b) || String(a.codigo).localeCompare(String(b.codigo));
}

/* ─────────────────────────────────────────────────────────────
   Parâmetros da URL → filtros
   ───────────────────────────────────────────────────────────── */

export const CAMPOS_FILTRO = [
  'q', 'prefeitura', 'cidade', 'planta', 'precoMin', 'precoMax', 'mensalMax',
  'areaMin', 'terrenoMin', 'anoMin', 'estacaoMax', 'estado', 'entrega',
  'estacionamento', 'fotos', 'codigos'
];

/**
 * Lê `URLSearchParams` e devolve filtros válidos. Devolve também `ignorados`:
 * parâmetros que vieram inválidos e caíram no padrão, para a interface avisar
 * discretamente em vez de falhar.
 */
export function lerFiltros(p) {
  const get = (k) => (p && typeof p.get === 'function') ? p.get(k) : (p ? p[k] : null);
  const ignorados = [];
  const checa = (k, valorBruto, valorLido) => {
    if (valorBruto !== null && valorBruto !== undefined && String(valorBruto).trim() !== ''
        && (valorLido === null || (Array.isArray(valorLido) && !valorLido.length))) ignorados.push(k);
    return valorLido;
  };

  const f = {
    q: checa('q', get('q'), (chave(get('q')).slice(0, MAX_TEXTO) || null)),
    prefeituras: checa('prefeitura', get('prefeitura'), lista(get('prefeitura'))),
    cidades: checa('cidade', get('cidade'), lista(get('cidade'))),
    plantas: checa('planta', get('planta'), lista(get('planta'))),
    precoMin: checa('precoMin', get('precoMin'), num(get('precoMin'), { max: 1e10 })),
    precoMax: checa('precoMax', get('precoMax'), num(get('precoMax'), { max: 1e10 })),
    mensalMax: checa('mensalMax', get('mensalMax'), num(get('mensalMax'), { max: 1e8 })),
    areaMin: checa('areaMin', get('areaMin'), num(get('areaMin'), { max: 1e5 })),
    terrenoMin: checa('terrenoMin', get('terrenoMin'), num(get('terrenoMin'), { max: 1e6 })),
    anoMin: checa('anoMin', get('anoMin'), num(get('anoMin'), { min: 1900, max: 2100 })),
    estacaoMax: checa('estacaoMax', get('estacaoMax'), num(get('estacaoMax'), { min: 1, max: 180 })),
    estado: checa('estado', get('estado'), umDe(get('estado'), ['novo', 'usado'])),
    entrega: checa('entrega', get('entrega'), lista(get('entrega')).filter((v) => ['imediata', 'prevista', 'combinar'].includes(v))),
    estacionamento: checa('estacionamento', get('estacionamento'), umDe(get('estacionamento'), ['com'])),
    fotos: checa('fotos', get('fotos'), umDe(get('fotos'), ['reais'])),
    codigos: checa('codigos', get('codigos'), lista(get('codigos'), (s) => String(s).trim().toUpperCase(), MAX_CODIGOS))
  };

  // Faixa invertida não é erro fatal: trocamos e avisamos.
  if (f.precoMin !== null && f.precoMax !== null && f.precoMin > f.precoMax) {
    [f.precoMin, f.precoMax] = [f.precoMax, f.precoMin];
    ignorados.push('faixaDePreco');
  }

  const ordemBruta = chave(get('ordem'));
  const ordem = ORDENS[ordemBruta] ? ordemBruta : (ORDENS_LEGADO[ordemBruta] || ORDEM_PADRAO);
  if (ordemBruta && !ORDENS[ordemBruta] && !ORDENS_LEGADO[ordemBruta]) ignorados.push('ordem');

  const porPagina = Math.min(POR_PAGINA_MAX, Math.max(1, num(get('porPagina'), { min: 1, max: 1000 }) ?? POR_PAGINA_PADRAO));
  const pagina = Math.max(1, num(get('pagina'), { min: 1, max: 100000 }) ?? 1);

  return { filtros: f, ordem, porPagina, pagina, ignorados };
}

/** Filtros → URLSearchParams (a forma canônica que vai na barra de endereço). */
export function filtrosParaParams(f, ordem, pagina) {
  const p = new URLSearchParams();
  if (f.q) p.set('q', f.q);
  if (f.prefeituras?.length) p.set('prefeitura', f.prefeituras.join(','));
  if (f.cidades?.length) p.set('cidade', f.cidades.join(','));
  if (f.plantas?.length) p.set('planta', f.plantas.join(','));
  for (const k of ['precoMin', 'precoMax', 'mensalMax', 'areaMin', 'terrenoMin', 'anoMin', 'estacaoMax']) {
    if (f[k] !== null && f[k] !== undefined) p.set(k, String(f[k]));
  }
  if (f.estado) p.set('estado', f.estado);
  if (f.entrega?.length) p.set('entrega', f.entrega.join(','));
  if (f.estacionamento) p.set('estacionamento', f.estacionamento);
  if (f.fotos) p.set('fotos', f.fotos);
  if (f.codigos?.length) p.set('codigos', f.codigos.join(','));
  if (ordem && ordem !== ORDEM_PADRAO) p.set('ordem', ordem);
  if (pagina && pagina > 1) p.set('pagina', String(pagina));
  return p;
}

/* ─────────────────────────────────────────────────────────────
   Texto livre que é nome de lugar

   "Hekinan" digitado no campo de busca com Nishio/Takahama/Kariya
   ainda marcadas no filtro de cidade devolvia zero: o texto era
   somado às cidades. Quando o que a pessoa digitou É uma cidade ou
   província do acervo, isso vira o filtro de lugar — e substitui
   as cidades anteriores, que é o que quem digita espera.
   ───────────────────────────────────────────────────────────── */

export function resolverLocal(pedido, casas) {
  const f = pedido.filtros;
  if (!f.q) return pedido;
  const cidades = new Map(), provincias = new Map();
  for (const c of casas) {
    if (c.cidade) cidades.set(chave(c.cidade), c.cidade);
    if (c.cidadeJp) cidades.set(chave(c.cidadeJp), c.cidade);
    if (c.prefeitura) provincias.set(chave(c.prefeitura), c.prefeitura);
    if (c.prefeituraJp) provincias.set(chave(c.prefeituraJp), c.prefeitura);
  }
  const termos = f.q.split(/\s+/);
  const achouCidades = [], achouProv = [], resto = [];
  for (const t of termos) {
    if (cidades.has(t)) achouCidades.push(chave(cidades.get(t)));
    else if (provincias.has(t)) achouProv.push(chave(provincias.get(t)));
    else resto.push(t);
  }
  if (!achouCidades.length && !achouProv.length) return pedido;
  const filtros = { ...f, q: resto.join(' ') || null };
  if (achouCidades.length) { filtros.cidades = [...new Set(achouCidades)]; filtros.prefeituras = []; }
  else if (achouProv.length) { filtros.prefeituras = [...new Set(achouProv)]; filtros.cidades = []; }
  return { ...pedido, filtros, localResolvido: true };
}

/* ─────────────────────────────────────────────────────────────
   Aplicação dos filtros
   ───────────────────────────────────────────────────────────── */

const temDado = (v) => v !== null && v !== undefined && !Number.isNaN(v);

/** Testa UM imóvel contra UM filtro. Exportado para o diagnóstico do vazio. */
export const TESTES = {
  codigos:  (c, f) => !f.codigos?.length || f.codigos.includes(String(c.codigo).toUpperCase()),
  prefeituras: (c, f) => !f.prefeituras?.length || f.prefeituras.includes(chave(c.prefeitura)),
  cidades:  (c, f) => !f.cidades?.length || f.cidades.includes(chave(c.cidade)),
  plantas:  (c, f) => !f.plantas?.length || f.plantas.includes(chave(c.planta)),
  precoMin: (c, f) => f.precoMin === null || (c.preco ?? 0) >= f.precoMin,
  precoMax: (c, f) => f.precoMax === null || (c.preco ?? Infinity) <= f.precoMax,
  mensalMax:(c, f) => f.mensalMax === null || (Number.isFinite(c.estimativa?.valor) && c.estimativa.valor <= f.mensalMax),
  areaMin:  (c, f) => f.areaMin === null || !temDado(c.areaConstruida) || c.areaConstruida >= f.areaMin,
  terrenoMin:(c, f) => f.terrenoMin === null || !temDado(c.areaTerreno) || c.areaTerreno >= f.terrenoMin,
  anoMin:   (c, f) => f.anoMin === null || !temDado(c.ano?.ano) || c.ano.ano >= f.anoMin,
  estacaoMax:(c, f) => f.estacaoMax === null || !temDado(c.acesso?.minutosAPe) || c.acesso.minutosAPe <= f.estacaoMax,
  estado:   (c, f) => !f.estado || (f.estado === 'novo' ? c.construcaoNova === true : c.construcaoNova === false),
  entrega:  (c, f) => !f.entrega?.length || f.entrega.includes(c.entregaClasse),
  // "com estacionamento" só exclui quem DISSE que não tem; quem não informou fica.
  estacionamento: (c, f) => !f.estacionamento || c.temEstacionamento !== false,
  fotos:    (c, f) => !f.fotos || c.imagemEhFicha !== true,
  q: (c, f) => {
    if (!f.q) return true;
    const alvo = chave([
      c.titulo, c.cidade, c.cidadeJp, c.prefeitura, c.prefeituraJp, c.endereco, c.planta,
      c.acesso?.estacao, c.acesso?.linha, c.codigo
    ].filter(Boolean).join(' '));
    return f.q.split(/\s+/).every((termo) => alvo.includes(termo));
  }
};

export function aplicarFiltros(casas, f) {
  const testes = Object.values(TESTES);
  return casas.filter((c) => testes.every((t) => t(c, f)));
}

/* ─────────────────────────────────────────────────────────────
   Facetas — contadas SEM o próprio filtro, para a opção não zerar
   a si mesma. Opções com zero continuam na resposta: a interface
   as mostra desabilitadas, com o motivo, em vez de sumir com elas.
   ───────────────────────────────────────────────────────────── */

export function facetas(casas, f) {
  const contar = (campo, ignorar, valores) => {
    const base = aplicarFiltros(casas, { ...f, [ignorar]: Array.isArray(f[ignorar]) ? [] : null });
    const m = new Map();
    for (const c of base) {
      const v = campo(c);
      if (v) m.set(v, (m.get(v) || 0) + 1);
    }
    // Universo completo: quem existe no acervo, mesmo que zere com os filtros atuais.
    const todos = new Map();
    for (const c of casas) { const v = campo(c); if (v) todos.set(v, (todos.get(v) || 0) + 1); }
    const lista = [...todos.keys()].map((valor) => ({ valor, total: m.get(valor) || 0, chave: chave(valor) }));
    return lista.sort((a, b) => b.total - a.total || a.valor.localeCompare(b.valor, 'pt'));
  };

  const cidades = contar((c) => c.cidade, 'cidades');
  // província de cada cidade, para o painel agrupar e para a interface saber
  // que "Toyota" pertence a Aichi quando alguém marca Mie
  const provinciaDaCidade = {};
  for (const c of casas) if (c.cidade && c.prefeitura) provinciaDaCidade[chave(c.cidade)] = c.prefeitura;

  const booleana = (campo, teste) => {
    const base = aplicarFiltros(casas, { ...f, [campo]: null });
    return base.filter(teste).length;
  };

  return {
    prefeituras: contar((c) => c.prefeitura, 'prefeituras'),
    cidades: cidades.map((x) => ({ ...x, prefeitura: provinciaDaCidade[x.chave] || null })),
    plantas: contar((c) => c.planta, 'plantas'),
    estado: {
      novo: aplicarFiltros(casas, { ...f, estado: null }).filter((c) => c.construcaoNova === true).length,
      usado: aplicarFiltros(casas, { ...f, estado: null }).filter((c) => c.construcaoNova === false).length
    },
    entrega: (() => {
      const base = aplicarFiltros(casas, { ...f, entrega: [] });
      const m = { imediata: 0, prevista: 0, combinar: 0 };
      for (const c of base) if (c.entregaClasse) m[c.entregaClasse]++;
      return m;
    })(),
    estacionamento: { com: booleana('estacionamento', (c) => c.temEstacionamento !== false) },
    fotos: { reais: booleana('fotos', (c) => c.imagemEhFicha !== true) },
    // Cobertura dos campos "com aviso": quantos dos resultados atuais NÃO informam
    semDado: (() => {
      const base = aplicarFiltros(casas, f);
      return {
        estacao: base.filter((c) => !temDado(c.acesso?.minutosAPe)).length,
        estacionamento: base.filter((c) => c.temEstacionamento === null).length
      };
    })()
  };
}

/* ─────────────────────────────────────────────────────────────
   Estado vazio: qual filtro pesou mais?
   Testa remover cada filtro isoladamente e conta o que voltaria.
   Não sugere nada que não seja apenas RELAXAR um filtro já escolhido.
   ───────────────────────────────────────────────────────────── */

const VAZIOS = { q: null, prefeituras: [], cidades: [], plantas: [], precoMin: null, precoMax: null,
  mensalMax: null, areaMin: null, terrenoMin: null, anoMin: null, estacaoMax: null, estado: null,
  entrega: [], estacionamento: null, fotos: null, codigos: [] };

export function filtrosAtivos(f) {
  return Object.keys(VAZIOS).filter((k) => Array.isArray(f[k]) ? f[k].length > 0 : (f[k] !== null && f[k] !== undefined));
}

export function diagnosticoVazio(casas, f) {
  const ativos = filtrosAtivos(f);
  const sugestoes = [];
  for (const k of ativos) {
    const sem = aplicarFiltros(casas, { ...f, [k]: VAZIOS[k] });
    if (sem.length) sugestoes.push({ filtro: k, voltariam: sem.length });
  }
  sugestoes.sort((a, b) => b.voltariam - a.voltariam);
  return { ativos, sugestoes };
}

/* ─────────────────────────────────────────────────────────────
   Busca completa
   ───────────────────────────────────────────────────────────── */

export function buscar(casas, { filtros, ordem, porPagina, pagina }) {
  const achadas = aplicarFiltros(casas, filtros);
  achadas.sort(comparadorEstavel((ORDENS[ordem] || ORDENS[ORDEM_PADRAO]).cmp));
  const totalPaginas = Math.max(1, Math.ceil(achadas.length / porPagina));
  const pag = Math.min(pagina, totalPaginas);
  const inicio = (pag - 1) * porPagina;
  return {
    total: achadas.length,
    totalAcervo: casas.length,
    pagina: pag,
    porPagina,
    totalPaginas,
    ordem,
    itens: achadas.slice(inicio, inicio + porPagina),
    limites: {
      precoMin: casas.length ? Math.min(...casas.map((c) => c.preco ?? Infinity)) : null,
      precoMax: casas.length ? Math.max(...casas.map((c) => c.preco ?? 0)) : null
    }
  };
}

/** Versão leve para o card: sem as 20 fotos, sem textos longos. */
export function resumirParaLista(c) {
  return { ...c, fotos: c.fotos.slice(0, 1), observacoes: null, destaques: null, destaquesLista: undefined, reforma: null };
}
