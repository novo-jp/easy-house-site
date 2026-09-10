/**
 * GET /api/casas — busca e filtro das casas à venda (JSON).
 *
 * Toda a lógica mora em lib/casas-busca.mjs, compartilhada com a página
 * /comprar/imoveis renderizada no servidor: a mesma URL devolve a mesma
 * lista nas duas portas.
 *
 * A filtragem acontece no servidor: o navegador nunca baixa o acervo inteiro
 * nem recebe a chave do banco.
 *
 * Parâmetros extras além dos filtros:
 *   codigos=EH-1,EH-2   só estes imóveis (favoritos, comparação) — máx. 50
 *   somenteTotal=1      devolve só total + facetas, sem itens (contador do painel)
 */

import { carregarCasas } from '../lib/casas-fonte.mjs';
import { lerFiltros, resolverLocal, buscar, facetas, diagnosticoVazio, resumirParaLista, ORDENS, filtrosParaParams } from '../lib/casas-busca.mjs';

export default async function handler(req, res) {
  try {
    const url = new URL(req.url, `https://${req.headers.host || 'easyhouse.homes'}`);
    const p = url.searchParams;
    const somenteTotal = p.get('somenteTotal') === '1';

    const todas = await carregarCasas();
    const pedido = resolverLocal(lerFiltros(p), todas);
    const r = buscar(todas, pedido);

    res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=3600');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(200).json({
      total: r.total,
      totalAcervo: r.totalAcervo,
      pagina: r.pagina,
      porPagina: r.porPagina,
      totalPaginas: r.totalPaginas,
      ordem: r.ordem,
      ordens: Object.fromEntries(Object.entries(ORDENS).map(([k, v]) => [k, { rotulo: v.rotulo, explica: v.explica }])),
      itens: somenteTotal ? [] : r.itens.map(resumirParaLista),
      facetas: facetas(todas, pedido.filtros),
      vazio: r.total === 0 ? diagnosticoVazio(todas, pedido.filtros) : null,
      ignorados: pedido.ignorados,
      // quando o texto virou filtro de lugar, a interface reescreve a URL para a forma canônica
      filtros: pedido.filtros,
      urlCanonica: '?' + filtrosParaParams(pedido.filtros, pedido.ordem, pedido.pagina).toString(),
      limites: r.limites
    });
  } catch (e) {
    console.error('[api/casas]', e);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json({ erro: 'indisponivel', mensagem: 'Não foi possível carregar os imóveis agora.' });
  }
}
