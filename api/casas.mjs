/**
 * GET /api/casas — busca e filtro das casas à venda.
 *
 * Devolve a página pedida já normalizada em português, mais as contagens de
 * cada opção de filtro (facets), para que a interface só ofereça filtros que
 * realmente têm resultado.
 *
 * A filtragem acontece no servidor: o navegador nunca baixa o acervo inteiro
 * nem recebe a chave do banco.
 */

import { carregarCasas } from '../lib/casas-fonte.js';

const POR_PAGINA_MAX = 48;

// Number(null) e Number('') valem 0, não NaN — sem esta guarda um parâmetro
// ausente viraria "precoMax=0" e zeraria a busca inteira.
const num = (v) => {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const lista = (v) => (v ? String(v).split(',').map((s) => s.trim()).filter(Boolean).slice(0, 30) : []);

/** Remove acento e caixa para que "sao paulo" ache "São Paulo". */
const chave = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function aplicarFiltros(casas, f) {
  return casas.filter((c) => {
    if (f.cidades.length && !f.cidades.includes(chave(c.cidade))) return false;
    if (f.prefeituras.length && !f.prefeituras.includes(chave(c.prefeitura))) return false;
    if (f.plantas.length && !f.plantas.includes(chave(c.planta))) return false;

    if (f.precoMin !== null && (c.preco ?? 0) < f.precoMin) return false;
    if (f.precoMax !== null && (c.preco ?? Infinity) > f.precoMax) return false;

    if (f.mensalMax !== null) {
      const m = c.estimativa?.valor;
      if (!Number.isFinite(m) || m > f.mensalMax) return false;
    }

    // Campos incompletos no acervo: filtrar por eles esconde imóveis cujo dado
    // apenas não veio. Só excluímos quando o dado existe e não atende.
    if (f.areaMin !== null && c.areaConstruida !== null && c.areaConstruida < f.areaMin) return false;
    if (f.terrenoMin !== null && c.areaTerreno !== null && c.areaTerreno < f.terrenoMin) return false;
    if (f.anoMin !== null && c.ano?.ano && c.ano.ano < f.anoMin) return false;
    if (f.vagasMin !== null && c.vaga?.vagas !== null && c.vaga?.vagas !== undefined
        && c.vaga.vagas < f.vagasMin) return false;
    if (f.estacaoMax !== null && c.acesso?.minutosAPe !== null && c.acesso?.minutosAPe !== undefined
        && c.acesso.minutosAPe > f.estacaoMax) return false;

    if (f.q) {
      const alvo = chave([
        c.titulo, c.cidade, c.prefeitura, c.endereco, c.planta,
        c.acesso?.estacao, c.acesso?.linha, c.codigo, c.cidadeJp
      ].filter(Boolean).join(' '));
      if (!f.q.split(/\s+/).every((termo) => alvo.includes(termo))) return false;
    }
    return true;
  });
}

const ORDENS = {
  recomendados: (a, b) => (b.novo - a.novo) || (b.totalFotos - a.totalFotos) || (a.preco - b.preco),
  recentes:     (a, b) => new Date(b.criadoEm || 0) - new Date(a.criadoEm || 0),
  preco_asc:    (a, b) => (a.preco ?? Infinity) - (b.preco ?? Infinity),
  preco_desc:   (a, b) => (b.preco ?? -1) - (a.preco ?? -1),
  mensal_asc:   (a, b) => (a.estimativa?.valor ?? Infinity) - (b.estimativa?.valor ?? Infinity),
  terreno_desc: (a, b) => (b.areaTerreno ?? -1) - (a.areaTerreno ?? -1),
  area_desc:    (a, b) => (b.areaConstruida ?? -1) - (a.areaConstruida ?? -1),
  novos:        (a, b) => (b.ano?.ano ?? -1) - (a.ano?.ano ?? -1)
};

/** Contagens por opção, calculadas sem o próprio filtro para não zerar a lista. */
function facetas(casas, filtros) {
  const contar = (campo, ignorar) => {
    const base = aplicarFiltros(casas, { ...filtros, [ignorar]: [] });
    const m = new Map();
    for (const c of base) {
      const v = c[campo];
      if (v) m.set(v, (m.get(v) || 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
                           .map(([valor, total]) => ({ valor, total }));
  };
  return {
    cidades: contar('cidade', 'cidades'),
    prefeituras: contar('prefeitura', 'prefeituras'),
    plantas: contar('planta', 'plantas')
  };
}

export default async function handler(req, res) {
  try {
    const url = new URL(req.url, `https://${req.headers.host || 'easyhouse.homes'}`);
    const p = url.searchParams;

    const filtros = {
      cidades: lista(p.get('cidade')).map(chave),
      prefeituras: lista(p.get('prefeitura')).map(chave),
      plantas: lista(p.get('planta')).map(chave),
      precoMin: num(p.get('precoMin')),
      precoMax: num(p.get('precoMax')),
      mensalMax: num(p.get('mensalMax')),
      areaMin: num(p.get('areaMin')),
      terrenoMin: num(p.get('terrenoMin')),
      anoMin: num(p.get('anoMin')),
      vagasMin: num(p.get('vagasMin')),
      estacaoMax: num(p.get('estacaoMax')),
      q: chave(p.get('q')).trim() || null
    };

    const todas = await carregarCasas();
    const achadas = aplicarFiltros(todas, filtros);

    const ordem = ORDENS[p.get('ordem')] ? p.get('ordem') : 'recomendados';
    achadas.sort(ORDENS[ordem]);

    const porPagina = Math.min(POR_PAGINA_MAX, Math.max(1, num(p.get('porPagina')) ?? 24));
    const pagina = Math.max(1, num(p.get('pagina')) ?? 1);
    const inicio = (pagina - 1) * porPagina;

    // A listagem não precisa das 20 fotos de cada imóvel: mandamos só a capa.
    const itens = achadas.slice(inicio, inicio + porPagina).map((c) => ({
      ...c, fotos: c.fotos.slice(0, 1), observacoes: null, destaques: null
    }));

    res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=3600');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(200).json({
      total: achadas.length,
      totalAcervo: todas.length,
      pagina,
      porPagina,
      totalPaginas: Math.max(1, Math.ceil(achadas.length / porPagina)),
      ordem,
      itens,
      facetas: facetas(todas, filtros),
      // Nomes como se escrevem, para a interface not rotular "toyota" quando
      // a combinação de filtros zera a faceta e o rótulo se perderia.
      rotulos: {
        cidades: [...new Set(todas.map((c) => c.cidade).filter(Boolean))].sort(),
        prefeituras: [...new Set(todas.map((c) => c.prefeitura).filter(Boolean))].sort(),
        plantas: [...new Set(todas.map((c) => c.planta).filter(Boolean))].sort()
      },
      limites: {
        precoMin: Math.min(...todas.map((c) => c.preco ?? Infinity)),
        precoMax: Math.max(...todas.map((c) => c.preco ?? 0))
      }
    });
  } catch (e) {
    console.error('[api/casas]', e);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json({ erro: 'indisponivel', mensagem: 'Não foi possível carregar os imóveis agora.' });
  }
}
