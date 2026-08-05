/**
 * POST /api/simulate
 *
 * Roda a simulação no servidor. O browser envia as respostas e recebe
 * apenas o resultado — nenhuma regra de negócio fica exposta no cliente.
 *
 * Não grava nada. Persistência acontece em /api/lead, após o consentimento.
 */

import { runSimulation, FinancingInputError } from '../../lib/financing.js';
import defaultConfig from '../../lib/financing-config.json' with { type: 'json' };

const CORS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store'
};

// Limite simples por IP, em memória (a instância é efêmera; serve como
// primeira barreira contra abuso trivial).
const hits = new Map();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 30;

function rateLimited(ip) {
  const now = Date.now();
  const entry = hits.get(ip) || { count: 0, reset: now + WINDOW_MS };
  if (now > entry.reset) {
    entry.count = 0;
    entry.reset = now + WINDOW_MS;
  }
  entry.count += 1;
  hits.set(ip, entry);
  if (hits.size > 5000) hits.clear();
  return entry.count > MAX_PER_WINDOW;
}

/** Busca a configuração ativa no banco; cai no arquivo local se indisponível. */
async function loadConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return defaultConfig;

  try {
    const resp = await fetch(
      `${url}/rest/v1/financing_configuration?select=config,version&is_active=eq.true&limit=1`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } }
    );
    if (!resp.ok) return defaultConfig;
    const rows = await resp.json();
    return rows?.[0]?.config || defaultConfig;
  } catch {
    return defaultConfig;
  }
}

function toNumber(value) {
  if (value === '' || value == null) return undefined;
  const n = Number(String(value).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : undefined;
}

export default async (req, context) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método não permitido' }), { status: 405, headers: CORS });
  }

  const ip = context?.ip || req.headers.get('x-nf-client-connection-ip') || 'unknown';
  if (rateLimited(ip)) {
    return new Response(JSON.stringify({ error: 'Muitas requisições. Tente novamente em instantes.' }), {
      status: 429,
      headers: CORS
    });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Corpo inválido' }), { status: 400, headers: CORS });
  }

  const config = await loadConfig();

  const input = {
    age: toNumber(body.age),
    employmentType: String(body.employmentType || ''),
    employmentYears: String(body.employmentYears || ''),
    residency: String(body.residency || 'unknown'),
    desiredMonthlyPayment: toNumber(body.desiredMonthlyPayment),
    annualIncome: toNumber(body.annualIncome),
    monthlyDebtPayments: toNumber(body.monthlyDebtPayments) || 0,
    downPayment: toNumber(body.downPayment) || 0,
    propertyPrice: toNumber(body.propertyPrice)
  };

  if (body.secondApplicant && toNumber(body.secondApplicant.annualIncome)) {
    input.secondApplicant = {
      annualIncome: toNumber(body.secondApplicant.annualIncome),
      age: toNumber(body.secondApplicant.age)
    };
  }

  try {
    const result = runSimulation(input, config);
    return new Response(JSON.stringify({ ok: true, result }), { status: 200, headers: CORS });
  } catch (err) {
    if (err instanceof FinancingInputError) {
      return new Response(JSON.stringify({ error: err.message, field: err.field }), { status: 422, headers: CORS });
    }
    // Não vazar detalhes internos nem os dados enviados
    console.error('simulate: erro inesperado');
    return new Response(JSON.stringify({ error: 'Não foi possível calcular agora.' }), { status: 500, headers: CORS });
  }
};

export const config = { path: '/api/simulate' };
