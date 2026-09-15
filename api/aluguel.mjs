/**
 * GET /api/aluguel — busca e filtro dos apartamentos para alugar (JSON).
 *
 * Toda a lógica mora em lib/aluguel-busca.mjs, compartilhada com a página
 * /imoveis renderizada no servidor: a mesma URL devolve a mesma lista nas
 * duas portas.
 *
 * Parâmetros extras além dos filtros:
 *   codigos=123,456     só estes imóveis — máx. 50
 *   somenteTotal=1      devolve só total + facetas, sem itens (contador do painel)
 */

import { carregarAlugueis } from '../lib/aluguel-fonte.mjs';
import { lerFiltros, resolverLocal, buscar, facetas, diagnosticoVazio, ORDENS, filtrosParaParams } from '../lib/aluguel-busca.mjs';

export default async function handler(req, res) {
  try {
    const url = new URL(req.url, `https://${req.headers.host || 'easyhouse.homes'}`);
    const p = url.searchParams;
    const somenteTotal = p.get('somenteTotal') === '1';

    const acervo = await carregarAlugueis();
    const pedido = resolverLocal(lerFiltros(p), acervo.itens);
    const r = buscar(acervo.itens, pedido);

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
      itens: somenteTotal ? [] : r.itens,
      facetas: facetas(acervo.itens, pedido.filtros),
      vazio: r.total === 0 ? diagnosticoVazio(acervo.itens, pedido.filtros) : null,
      ignorados: pedido.ignorados,
      filtros: pedido.filtros,
      urlCanonica: '?' + filtrosParaParams(pedido.filtros, pedido.ordem, pedido.pagina).toString(),
      limites: r.limites,
      verificadoEm: acervo.verificadoEm,
      janelaDias: acervo.janelaDias
    });
  } catch (e) {
    console.error('[api/aluguel]', e);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json({ erro: 'Não foi possível carregar os imóveis agora.' });
  }
}
