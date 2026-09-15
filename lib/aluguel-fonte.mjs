/**
 * lib/aluguel-fonte.mjs — leitura da tabela `imoveis_aichi`.
 *
 * O scraper do DK Portal reescreve a tabela todo dia às 7h (JST) e apaga o
 * que saiu do portal. Mesmo assim, só publicamos o que foi confirmado nos
 * últimos dias: se o scraper falhar uma semana, a lista encolhe em vez de
 * mostrar apartamento já alugado. Se encolher demais (menos de 100), a
 * janela abre para 30 dias — melhor uma lista um pouco velha do que vazia,
 * e a página diz a data da última verificação.
 *
 * Lê com a chave de serviço, no servidor. A tabela continua legível pela
 * chave pública (o chatbot usa), mas o navegador não precisa mais dela.
 *
 * O acervo (≈2.300 linhas) cabe em memória e muda uma vez por dia: carregar
 * tudo e guardar 10 minutos dá busca instantânea e ~1 consulta por instância.
 */

import { normalizarAluguel, ehPublicavel } from './aluguel.mjs';

const TABELA = 'imoveis_aichi';
const TTL_MS = 10 * 60 * 1000;
const PAGINA = 1000;
export const DIAS_VALIDADE = 7;
export const DIAS_VALIDADE_AMPLA = 30;
export const MINIMO_ANTES_DE_AMPLIAR = 100;

let cache = { em: 0, dados: null, promessa: null };

function dataCorte(dias, agora) {
  return new Date(agora.getTime() - dias * 86400000).toISOString().slice(0, 10);
}

async function buscarLinhas(corte) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL/SUPABASE_SERVICE_KEY ausentes');

  const linhas = [];
  for (let offset = 0; ; offset += PAGINA) {
    const r = await fetch(
      `${url}/rest/v1/${TABELA}?select=*&updated_at=gte.${corte}&order=id.asc&limit=${PAGINA}&offset=${offset}`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } }
    );
    if (!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text()}`);
    const lote = await r.json();
    linhas.push(...lote);
    if (lote.length < PAGINA) break;
    if (offset > 20000) break;   // nunca um laço infinito por erro de paginação
  }
  return linhas;
}

/**
 * Todos os apartamentos publicáveis, normalizados, mais a data da última
 * verificação e a janela usada. Lança se o banco falhar.
 */
export async function carregarAlugueis({ forcar = false, agora = new Date() } = {}) {
  const t = Date.now();
  if (!forcar && cache.dados && t - cache.em < TTL_MS) return cache.dados;
  if (cache.promessa) return cache.promessa;

  cache.promessa = (async () => {
    try {
      let dias = DIAS_VALIDADE;
      let linhas = await buscarLinhas(dataCorte(dias, agora));
      if (linhas.length < MINIMO_ANTES_DE_AMPLIAR) {
        const amplo = await buscarLinhas(dataCorte(DIAS_VALIDADE_AMPLA, agora));
        if (amplo.length > linhas.length) { linhas = amplo; dias = DIAS_VALIDADE_AMPLA; }
      }
      const itens = linhas.map(normalizarAluguel).filter(ehPublicavel);
      const verificadoEm = itens.reduce((m, a) => (a.verificadoEm && a.verificadoEm > m ? a.verificadoEm : m), '') || null;
      cache = { em: Date.now(), dados: { itens, verificadoEm, janelaDias: dias }, promessa: null };
      return cache.dados;
    } catch (e) {
      cache.promessa = null;
      if (cache.dados) return cache.dados;   // banco fora do ar: serve o que já tinha
      throw e;
    }
  })();
  return cache.promessa;
}
