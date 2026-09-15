/**
 * lib/aluguel-busca.mjs — a busca de apartamentos para alugar, do lado do servidor.
 *
 * O par de lib/casas-busca.mjs para o aluguel: um só lugar para ler os
 * parâmetros da URL, aplicar filtros, ordenar, paginar e contar facetas.
 * É usado por `/api/aluguel` (JSON) e por `/imoveis` (HTML renderizado no
 * servidor), para que as duas portas devolvam a mesma lista para a mesma URL.
 *
 * As mesmas regras da busca de casas:
 *   - parâmetro inválido volta ao padrão em silêncio (nunca 500);
 *   - um filtro só exclui um imóvel quando o dado EXISTE e não atende —
 *     imóvel que não informou o campo continua aparecendo, e a interface
 *     avisa isso ao lado do filtro. Exceção honesta: pet e internet, que
 *     só valem quando conferidos; quem não foi conferido NÃO aparece no
 *     filtro "aceita pet", e a interface diz quantos já foram conferidos;
 *   - cada ordenação tem um critério que dá para explicar em uma frase.
 */

import { chave } from './aluguel.mjs';
export { chave };

const MAX_LISTA = 30;
const MAX_TEXTO = 80;
export const POR_PAGINA_PADRAO = 24;
export const POR_PAGINA_MAX = 48;
export const MAX_CODIGOS = 50;

function num(v, { min = 0, max = Infinity } = {}) {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const limpo = String(v).replace(/[^\d.-]/g, '');
  if (!/\d/.test(limpo)) return null;
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
   Ordenação
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
  aluguel_asc: {
    rotulo: 'Menor aluguel',
    explica: 'Do aluguel mais baixo para o mais alto (só o 家賃, sem condomínio).',
    cmp: nulosPorUltimo((a) => a.aluguel, 1)
  },
  mensal_asc: {
    rotulo: 'Menor custo mensal',
    explica: 'Pelo total que sai por mês: aluguel, condomínio, vaga, garantidora e suporte.',
    cmp: nulosPorUltimo((a) => a.mensal, 1)
  },
  entrada_asc: {
    rotulo: 'Menor entrada',
    explica: 'Pelo que é preciso pagar para entrar, estimado com 15 diárias e a vaga incluída.',
    cmp: nulosPorUltimo((a) => a.entrada, 1)
  },
  aluguel_desc: {
    rotulo: 'Maior aluguel',
    explica: 'Do aluguel mais alto para o mais baixo.',
    cmp: nulosPorUltimo((a) => a.aluguel, -1)
  },
  area_desc: {
    rotulo: 'Maior área',
    explica: 'Apartamentos maiores primeiro (専有面積). Sem esse dado ficam no fim.',
    cmp: nulosPorUltimo((a) => a.area, -1)
  },
  estacao_asc: {
    rotulo: 'Mais perto da estação',
    explica: 'Menos minutos a pé até a estação primeiro. Trajetos de ônibus e imóveis sem esse dado ficam no fim.',
    cmp: nulosPorUltimo((a) => (a.acesso.onibus ? null : a.acesso.minutosAPe), 1)
  },
  disponivel: {
    rotulo: 'Entrada mais próxima',
    explica: 'Quem já está livre primeiro, depois por data prevista.',
    cmp: (a, b) => {
      const ka = a.disponibilidade.classe === 'imediata' ? '0' : (a.disponibilidade.quando || '9');
      const kb = b.disponibilidade.classe === 'imediata' ? '0' : (b.disponibilidade.quando || '9');
      return ka.localeCompare(kb);
    }
  }
};
export const ORDEM_PADRAO = 'aluguel_asc';

// Nomes da página antiga que ainda podem estar em links compartilhados
const ORDENS_LEGADO = { menor: 'aluguel_asc', maior: 'aluguel_desc', area: 'area_desc', recentes: 'aluguel_asc' };

function comparadorEstavel(cmp) {
  return (a, b) => cmp(a, b) || String(a.codigo).localeCompare(String(b.codigo));
}

/* ─────────────────────────────────────────────────────────────
   Parâmetros da URL → filtros
   ───────────────────────────────────────────────────────────── */

export const CAMPOS_FILTRO = [
  'q', 'cidade', 'quartos', 'planta', 'aluguelMin', 'aluguelMax', 'mensalMax', 'entradaMax',
  'areaMin', 'estacaoMax', 'pet', 'internet', 'luva', 'deposito', 'disponivel', 'codigos'
];

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
    cidades: checa('cidade', get('cidade'), lista(get('cidade'))),
    quartos: checa('quartos', get('quartos'), lista(get('quartos'), (s) => String(s).trim().replace('+', ''), 3).filter((v) => ['1', '2', '3'].includes(v))),
    plantas: checa('planta', get('planta'), lista(get('planta'))),
    aluguelMin: checa('aluguelMin', get('aluguelMin'), num(get('aluguelMin'), { max: 1e7 })),
    aluguelMax: checa('aluguelMax', get('aluguelMax'), num(get('aluguelMax'), { max: 1e7 })),
    mensalMax: checa('mensalMax', get('mensalMax'), num(get('mensalMax'), { max: 1e7 })),
    entradaMax: checa('entradaMax', get('entradaMax'), num(get('entradaMax'), { max: 1e8 })),
    areaMin: checa('areaMin', get('areaMin'), num(get('areaMin'), { max: 1e4 })),
    estacaoMax: checa('estacaoMax', get('estacaoMax'), num(get('estacaoMax'), { min: 1, max: 180 })),
    pet: checa('pet', get('pet'), umDe(get('pet'), ['sim'])),
    internet: checa('internet', get('internet'), umDe(get('internet'), ['sim'])),
    luva: checa('luva', get('luva'), umDe(get('luva'), ['sem'])),
    deposito: checa('deposito', get('deposito'), umDe(get('deposito'), ['sem'])),
    disponivel: checa('disponivel', get('disponivel'), lista(get('disponivel')).filter((v) => ['imediata', 'prevista'].includes(v))),
    codigos: checa('codigos', get('codigos'), lista(get('codigos'), (s) => String(s).trim(), MAX_CODIGOS))
  };

  if (f.aluguelMin !== null && f.aluguelMax !== null && f.aluguelMin > f.aluguelMax) {
    [f.aluguelMin, f.aluguelMax] = [f.aluguelMax, f.aluguelMin];
    ignorados.push('faixaDeAluguel');
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
  if (f.cidades?.length) p.set('cidade', f.cidades.join(','));
  if (f.quartos?.length) p.set('quartos', f.quartos.join(','));
  if (f.plantas?.length) p.set('planta', f.plantas.join(','));
  for (const k of ['aluguelMin', 'aluguelMax', 'mensalMax', 'entradaMax', 'areaMin', 'estacaoMax']) {
    if (f[k] !== null && f[k] !== undefined) p.set(k, String(f[k]));
  }
  for (const k of ['pet', 'internet', 'luva', 'deposito']) if (f[k]) p.set(k, f[k]);
  if (f.disponivel?.length) p.set('disponivel', f.disponivel.join(','));
  if (f.codigos?.length) p.set('codigos', f.codigos.join(','));
  if (ordem && ordem !== ORDEM_PADRAO) p.set('ordem', ordem);
  if (pagina && pagina > 1) p.set('pagina', String(pagina));
  return p;
}

/* ─────────────────────────────────────────────────────────────
   Texto livre que é nome de cidade: vira o filtro de cidade
   (e substitui as cidades marcadas antes, que é o que quem digita espera).
   ───────────────────────────────────────────────────────────── */

export function resolverLocal(pedido, itens) {
  const f = pedido.filtros;
  if (!f.q) return pedido;
  const cidades = new Map();
  for (const a of itens) {
    if (a.cidade) cidades.set(chave(a.cidade), a.cidade);
    if (a.cidadeJp) {
      cidades.set(chave(a.cidadeJp), a.cidade);
      cidades.set(chave(a.cidadeJp.replace(/[市町村区]$/, '')), a.cidade);   // "豊橋" acha "豊橋市"
    }
  }
  const termos = f.q.split(/\s+/);
  const achou = [], resto = [];
  for (const t of termos) {
    if (cidades.has(t)) achou.push(chave(cidades.get(t)));
    else resto.push(t);
  }
  if (!achou.length) return pedido;
  const filtros = { ...f, q: resto.join(' ') || null, cidades: [...new Set(achou)] };
  return { ...pedido, filtros, localResolvido: true };
}

/* ─────────────────────────────────────────────────────────────
   Aplicação dos filtros
   ───────────────────────────────────────────────────────────── */

const temDado = (v) => v !== null && v !== undefined && !Number.isNaN(v);
/** Caminhada até a estação só conta quando o trajeto não é de ônibus. */
const minutosAte = (a) => (a.acesso && !a.acesso.onibus ? a.acesso.minutosAPe : null);

export const TESTES = {
  codigos:  (a, f) => !f.codigos?.length || f.codigos.includes(String(a.codigo)),
  cidades:  (a, f) => !f.cidades?.length || f.cidades.includes(chave(a.cidade)),
  quartos:  (a, f) => !f.quartos?.length || (a.quartos !== null && f.quartos.includes(a.quartos)),
  plantas:  (a, f) => !f.plantas?.length || f.plantas.includes(chave(a.planta)),
  aluguelMin: (a, f) => f.aluguelMin === null || (a.aluguel ?? 0) >= f.aluguelMin,
  aluguelMax: (a, f) => f.aluguelMax === null || (a.aluguel ?? Infinity) <= f.aluguelMax,
  mensalMax:  (a, f) => f.mensalMax === null || (a.mensal ?? Infinity) <= f.mensalMax,
  entradaMax: (a, f) => f.entradaMax === null || (a.entrada ?? Infinity) <= f.entradaMax,
  areaMin:  (a, f) => f.areaMin === null || !temDado(a.area) || a.area >= f.areaMin,
  estacaoMax: (a, f) => f.estacaoMax === null || !temDado(minutosAte(a)) || minutosAte(a) <= f.estacaoMax,
  // pet/internet: só quem foi conferido E aceita. Não conferido não entra —
  // dizer "aceita pet" sem ter olhado seria inventar.
  pet:      (a, f) => !f.pet || a.pet === true,
  internet: (a, f) => !f.internet || a.internet === true,
  luva:     (a, f) => !f.luva || !a.luva,
  deposito: (a, f) => !f.deposito || !a.deposito,
  disponivel: (a, f) => !f.disponivel?.length || f.disponivel.includes(a.disponibilidade.classe),
  q: (a, f) => {
    if (!f.q) return true;
    const alvo = chave([
      a.titulo, a.cidade, a.cidadeJp, a.endereco, a.planta,
      a.acesso?.estacao, a.acesso?.linha, a.codigo
    ].filter(Boolean).join(' '));
    return f.q.split(/\s+/).every((termo) => alvo.includes(termo));
  }
};

export function aplicarFiltros(itens, f) {
  const testes = Object.values(TESTES);
  return itens.filter((a) => testes.every((t) => t(a, f)));
}

/* ─────────────────────────────────────────────────────────────
   Facetas — contadas SEM o próprio filtro, para a opção não zerar a si
   mesma. Opções com zero continuam na resposta: a interface as mostra
   desabilitadas, com o motivo, em vez de sumir com elas.
   ───────────────────────────────────────────────────────────── */

export function facetas(itens, f) {
  const contar = (campo, ignorar) => {
    const base = aplicarFiltros(itens, { ...f, [ignorar]: [] });
    const m = new Map();
    for (const a of base) { const v = campo(a); if (v) m.set(v, (m.get(v) || 0) + 1); }
    const todos = new Map();
    for (const a of itens) { const v = campo(a); if (v) todos.set(v, (todos.get(v) || 0) + 1); }
    return [...todos.keys()].map((valor) => ({ valor, total: m.get(valor) || 0, chave: chave(valor) }))
      .sort((x, y) => y.total - x.total || x.valor.localeCompare(y.valor, 'pt'));
  };
  const booleana = (campo, teste) => aplicarFiltros(itens, { ...f, [campo]: null }).filter(teste).length;

  const cidades = contar((a) => a.cidade, 'cidades');
  const nomeJp = {};
  for (const a of itens) if (a.cidade && a.cidadeJp) nomeJp[chave(a.cidade)] = a.cidadeJp;

  const quartos = contar((a) => a.quartos, 'quartos')
    .sort((x, y) => x.valor.localeCompare(y.valor));
  const plantas = contar((a) => a.planta, 'plantas')
    .sort((x, y) => (x.valor[0] - y.valor[0]) || x.valor.length - y.valor.length || x.valor.localeCompare(y.valor));

  const baseDisp = aplicarFiltros(itens, { ...f, disponivel: [] });
  const baseAtual = aplicarFiltros(itens, f);

  return {
    cidades: cidades.map((c) => ({ ...c, jp: nomeJp[c.chave] || null })),
    quartos,
    plantas,
    disponivel: {
      imediata: baseDisp.filter((a) => a.disponibilidade.classe === 'imediata').length,
      prevista: baseDisp.filter((a) => a.disponibilidade.classe === 'prevista').length
    },
    pet: {
      sim: booleana('pet', (a) => a.pet === true),
      verificados: itens.filter((a) => a.pet !== null).length
    },
    internet: {
      sim: booleana('internet', (a) => a.internet === true),
      verificados: itens.filter((a) => a.internet !== null).length
    },
    luva: { sem: booleana('luva', (a) => !a.luva) },
    deposito: { sem: booleana('deposito', (a) => !a.deposito) },
    semDado: {
      estacao: baseAtual.filter((a) => !temDado(minutosAte(a))).length,
      onibus: baseAtual.filter((a) => a.acesso && a.acesso.onibus).length,
      area: baseAtual.filter((a) => !temDado(a.area)).length,
      pet: baseAtual.filter((a) => a.pet === null).length
    }
  };
}

/* ─────────────────────────────────────────────────────────────
   Estado vazio: qual filtro pesou mais?
   ───────────────────────────────────────────────────────────── */

const VAZIOS = { q: null, cidades: [], quartos: [], plantas: [], aluguelMin: null, aluguelMax: null,
  mensalMax: null, entradaMax: null, areaMin: null, estacaoMax: null, pet: null, internet: null,
  luva: null, deposito: null, disponivel: [], codigos: [] };

export function filtrosAtivos(f) {
  return Object.keys(VAZIOS).filter((k) => Array.isArray(f[k]) ? f[k].length > 0 : (f[k] !== null && f[k] !== undefined));
}

export function diagnosticoVazio(itens, f) {
  const ativos = filtrosAtivos(f);
  const sugestoes = [];
  for (const k of ativos) {
    const sem = aplicarFiltros(itens, { ...f, [k]: VAZIOS[k] });
    if (sem.length) sugestoes.push({ filtro: k, voltariam: sem.length });
  }
  sugestoes.sort((a, b) => b.voltariam - a.voltariam);
  return { ativos, sugestoes };
}

/* ─────────────────────────────────────────────────────────────
   Busca completa
   ───────────────────────────────────────────────────────────── */

export function buscar(itens, { filtros, ordem, porPagina, pagina }) {
  const achados = aplicarFiltros(itens, filtros);
  achados.sort(comparadorEstavel((ORDENS[ordem] || ORDENS[ORDEM_PADRAO]).cmp));
  const totalPaginas = Math.max(1, Math.ceil(achados.length / porPagina));
  const pag = Math.min(pagina, totalPaginas);
  const inicio = (pag - 1) * porPagina;
  const alugueis = itens.map((a) => a.aluguel).filter((v) => typeof v === 'number');
  return {
    total: achados.length,
    totalAcervo: itens.length,
    pagina: pag,
    porPagina,
    totalPaginas,
    ordem,
    itens: achados.slice(inicio, inicio + porPagina),
    limites: {
      aluguelMin: alugueis.length ? Math.min(...alugueis) : null,
      aluguelMax: alugueis.length ? Math.max(...alugueis) : null
    }
  };
}
