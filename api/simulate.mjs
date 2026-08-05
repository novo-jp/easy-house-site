/**
 * POST /api/simulate — Vercel Serverless Function
 *
 * Roda a simulação no servidor. Não grava nada; a persistência acontece
 * em /api/lead, depois do consentimento.
 */

import { runSimulation, FinancingInputError } from '../lib/financing.js';
import { readFileSync } from 'node:fs';

const defaultConfig = JSON.parse(readFileSync(new URL('../lib/financing-config.json', import.meta.url), 'utf8'));

const hits = new Map();
function rateLimited(ip, max = 30, windowMs = 60_000) {
  const now = Date.now();
  const e = hits.get(ip) || { count: 0, reset: now + windowMs };
  if (now > e.reset) { e.count = 0; e.reset = now + windowMs; }
  e.count += 1;
  hits.set(ip, e);
  if (hits.size > 5000) hits.clear();
  return e.count > max;
}

async function loadConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return defaultConfig;
  try {
    const r = await fetch(
      `${url}/rest/v1/financing_configuration?select=config&is_active=eq.true&limit=1`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } }
    );
    if (!r.ok) return defaultConfig;
    const rows = await r.json();
    return rows?.[0]?.config || defaultConfig;
  } catch {
    return defaultConfig;
  }
}

function toNumber(v) {
  if (v === '' || v == null) return undefined;
  const n = Number(String(v).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : undefined;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const ip = req.headers['x-forwarded-for'] || 'unknown';
  if (rateLimited(String(ip).split(',')[0].trim())) {
    return res.status(429).json({ error: 'Muitas requisições. Tente novamente em instantes.' });
  }

  const body = typeof req.body === 'string' ? safeParse(req.body) : (req.body || {});
  if (!body) return res.status(400).json({ error: 'Corpo inválido' });

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
    return res.status(200).json({ ok: true, result });
  } catch (err) {
    if (err instanceof FinancingInputError) {
      return res.status(422).json({ error: err.message, field: err.field });
    }
    console.error('simulate: erro inesperado');
    return res.status(500).json({ error: 'Não foi possível calcular agora.' });
  }
}

function safeParse(s) { try { return JSON.parse(s); } catch { return null; } }
