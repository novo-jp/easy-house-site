/**
 * lib/casas-fonte.js — leitura da tabela `casas_venda_aichi`.
 *
 * A tabela tem RLS ligada e nenhuma policy pública, então quem lê é o
 * servidor, com a chave de serviço. A chave nunca chega ao navegador.
 *
 * O acervo é pequeno (algumas centenas de imóveis) e muda uma vez por dia,
 * quando o scraper roda às 6h JST. Por isso vale mais carregar tudo uma vez
 * e guardar em memória do que ir ao banco a cada filtro: a busca fica
 * instantânea e o Supabase recebe ~1 consulta por instância, não uma por
 * visitante.
 */

import { readFileSync } from 'node:fs';
import { normalizarCasa, ehPublicavel } from './casas.js';

export const casasConfig = JSON.parse(
  readFileSync(new URL('./casas-config.json', import.meta.url), 'utf8'));
export const financingConfig = JSON.parse(
  readFileSync(new URL('./financing-config.json', import.meta.url), 'utf8'));

const TABELA = 'casas_venda_aichi';
const TTL_MS = 10 * 60 * 1000;          // o scraper roda 1x/dia; 10 min é folgado
const PAGINA = 1000;

let cache = { em: 0, casas: null, promessa: null };

async function buscarLinhas() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL/SUPABASE_SERVICE_KEY ausentes');

  const linhas = [];
  for (let offset = 0; ; offset += PAGINA) {
    const r = await fetch(
      `${url}/rest/v1/${TABELA}?select=*&order=updated_at.desc&limit=${PAGINA}&offset=${offset}`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } }
    );
    if (!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text()}`);
    const lote = await r.json();
    linhas.push(...lote);
    if (lote.length < PAGINA) break;
  }
  return linhas;
}

/** Todas as casas publicáveis, normalizadas. Lança se o banco falhar. */
export async function carregarCasas({ forcar = false } = {}) {
  const agora = Date.now();
  if (!forcar && cache.casas && agora - cache.em < TTL_MS) return cache.casas;
  if (cache.promessa) return cache.promessa;                 // evita corrida entre requisições

  cache.promessa = (async () => {
    try {
      const linhas = await buscarLinhas();
      const hoje = new Date();
      const casas = linhas
        .filter((l) => ehPublicavel(l, casasConfig))
        .map((l) => normalizarCasa(l, casasConfig, financingConfig, hoje))
        .filter((c) => c.ativo);
      cache = { em: Date.now(), casas, promessa: null };
      return casas;
    } catch (e) {
      cache.promessa = null;
      if (cache.casas) return cache.casas;                   // servir o antigo é melhor que errar
      throw e;
    }
  })();
  return cache.promessa;
}

/**
 * Busca um imóvel pelo slug ou pelo código, inclusive entre os que já saíram
 * do ar — a página de "não está mais disponível" precisa deles para não
 * devolver 404 a uma URL que o Google já indexou.
 */
export async function buscarPorSlug(slug) {
  const casas = await carregarCasas();
  const alvo = String(slug || '').toLowerCase();
  const achada = casas.find((c) => c.slug === alvo)
              || casas.find((c) => c.codigo.toLowerCase().replace('-', '') === alvo.replace('-', ''));
  if (achada) return { casa: achada, disponivel: true };

  const codigo = alvo.match(/eh([a-z0-9]+)$/)?.[1] ?? alvo.replace(/^eh-?/, '');
  if (!codigo) return { casa: null, disponivel: false };

  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return { casa: null, disponivel: false };
  const r = await fetch(
    `${url}/rest/v1/${TABELA}?select=*&or=(cgi_id.eq.${encodeURIComponent(codigo)},id.ilike.*${encodeURIComponent(codigo)})&limit=1`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } }
  );
  if (!r.ok) return { casa: null, disponivel: false };
  const [linha] = await r.json();
  if (!linha) return { casa: null, disponivel: false };
  return { casa: normalizarCasa(linha, casasConfig, financingConfig), disponivel: false };
}

/** Imóveis parecidos: mesma cidade primeiro, depois preço e planta próximos. */
export function relacionadas(casa, todas, limite = 6) {
  return todas
    .filter((c) => c.id !== casa.id)
    .map((c) => {
      let peso = 0;
      if (c.cidade && c.cidade === casa.cidade) peso += 50;
      else if (c.prefeitura && c.prefeitura === casa.prefeitura) peso += 15;
      if (c.planta === casa.planta) peso += 20;
      if (casa.preco && c.preco) {
        const dif = Math.abs(c.preco - casa.preco) / casa.preco;
        if (dif <= 0.15) peso += 25; else if (dif <= 0.3) peso += 12;
      }
      if (casa.acesso?.estacao && c.acesso?.estacao === casa.acesso.estacao) peso += 10;
      return { c, peso };
    })
    .filter((x) => x.peso > 0)
    .sort((a, b) => b.peso - a.peso || a.c.preco - b.c.preco)
    .slice(0, limite)
    .map((x) => x.c);
}
