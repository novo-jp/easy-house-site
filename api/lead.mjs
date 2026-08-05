/**
 * POST /api/lead — Vercel Serverless Function
 *
 * Grava o lead, o consentimento, as respostas e a simulação.
 * Só é chamada depois que a pessoa aceitou a política — nunca antes.
 *
 * Requer as variáveis de ambiente:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_KEY   (service role — nunca exposta ao browser)
 */

import { runSimulation } from '../lib/financing.js';
import { readFileSync } from 'node:fs';

const defaultConfig = JSON.parse(readFileSync(new URL('../lib/financing-config.json', import.meta.url), 'utf8'));

const POLICY_VERSION = '2026-06-28';

const hits = new Map();
function rateLimited(ip, max = 8, windowMs = 60_000) {
  const now = Date.now();
  const e = hits.get(ip) || { count: 0, reset: now + windowMs };
  if (now > e.reset) { e.count = 0; e.reset = now + windowMs; }
  e.count += 1;
  hits.set(ip, e);
  if (hits.size > 5000) hits.clear();
  return e.count > max;
}

function sb(path, options = {}) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  return fetch(`${url}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(options.headers || {})
    }
  });
}

/** Normaliza telefone japonês para E.164 quando possível. */
function normalizePhone(raw) {
  const digits = String(raw || '').replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits;
  if (digits.startsWith('81')) return '+' + digits;
  if (digits.startsWith('0')) return '+81' + digits.slice(1);
  return digits ? '+81' + digits : '';
}

function leadCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return 'EH-' + out;
}

function toNumber(v) {
  if (v === '' || v == null) return undefined;
  const n = Number(String(v).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : undefined;
}

/** Score interno de priorização comercial. Nunca exibido ao cliente. */
function internalScore({ answers, result }) {
  let score = 0;
  const timing = answers.purchaseTiming;
  if (timing === 'asap') score += 30;
  else if (timing === '3m') score += 25;
  else if (timing === '6m') score += 15;
  else if (timing === '12m') score += 8;

  if (toNumber(answers.annualIncome)) score += 20;
  if (Array.isArray(answers.cities) && answers.cities.length) score += 10;
  if (result?.status === 'calculated') score += 20;
  if (result?.propertyRange?.center >= 15_000_000) score += 10;
  if (answers.downPayment && toNumber(answers.downPayment) > 0) score += 10;
  return Math.min(100, score);
}

function leadStatus(result) {
  if (!result) return 'contact_requested';
  if (result.manualReview || result.status === 'manual_review') return 'manual_review';
  return 'simulation_completed';
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const ip = String(req.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim();
  if (rateLimited(ip)) {
    return res.status(429).json({ error: 'Muitas tentativas. Aguarde um minuto.' });
  }

  const body = typeof req.body === 'string' ? safeParse(req.body) : (req.body || {});
  if (!body) return res.status(400).json({ error: 'Corpo inválido' });

  const { contact = {}, answers = {}, consent = {}, source = {}, sessionId } = body;

  // Validação
  const errors = {};
  if (!contact.firstName || String(contact.firstName).trim().length < 2) errors.firstName = 'Informe seu nome';
  const phone = normalizePhone(contact.phone);
  if (!phone || phone.replace(/\D/g, '').length < 10) errors.phone = 'Informe um telefone válido';
  if (consent.dataProcessing !== true) errors.consent = 'É necessário aceitar o uso dos dados para esta solicitação';

  if (Object.keys(errors).length) {
    return res.status(422).json({ error: 'Dados incompletos', fields: errors });
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    // Sem banco configurado: não perder o lead — devolve código para o WhatsApp
    return res.status(200).json({
      ok: true,
      persisted: false,
      code: leadCode(),
      warning: 'Banco não configurado. O lead não foi gravado.'
    });
  }

  try {
    // Recalcula no servidor — o resultado enviado pelo cliente não é confiável
    const result = runSimulation(
      {
        age: toNumber(answers.age),
        employmentType: answers.employmentType,
        employmentYears: answers.employmentYears,
        residency: answers.residency || 'unknown',
        desiredMonthlyPayment: toNumber(answers.desiredMonthlyPayment),
        annualIncome: toNumber(answers.annualIncome),
        monthlyDebtPayments: toNumber(answers.monthlyDebtPayments) || 0,
        downPayment: toNumber(answers.downPayment) || 0,
        secondApplicant: toNumber(answers.secondIncome)
          ? { annualIncome: toNumber(answers.secondIncome), age: toNumber(answers.secondAge) }
          : undefined
      },
      defaultConfig
    );

    // Lead: procura por telefone antes de criar (evita duplicidade)
    const found = await sb(`lead?phone=eq.${encodeURIComponent(phone)}&select=id,code&limit=1`);
    const existing = found.ok ? (await found.json())[0] : null;

    const payload = {
      first_name: String(contact.firstName).trim().slice(0, 80),
      phone,
      phone_raw: String(contact.phone).slice(0, 40),
      email: contact.email ? String(contact.email).trim().slice(0, 160) : null,
      language: contact.language || 'pt-BR',
      preferred_time: contact.preferredTime || null,
      cities: Array.isArray(answers.cities) ? answers.cities.slice(0, 12) : [],
      status: leadStatus(result),
      internal_score: internalScore({ answers, result }),
      source: {
        utm_source: source.utm_source || null,
        utm_medium: source.utm_medium || null,
        utm_campaign: source.utm_campaign || null,
        utm_content: source.utm_content || null,
        utm_term: source.utm_term || null,
        gclid: source.gclid || null,
        fbclid: source.fbclid || null,
        variant: source.variant || null,
        propertyId: source.propertyId || null,
        landing: source.landing || null
      }
    };

    let lead;
    if (existing) {
      const upd = await sb(`lead?id=eq.${existing.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      lead = (await upd.json())[0] || existing;
    } else {
      payload.code = leadCode();
      const ins = await sb('lead', { method: 'POST', body: JSON.stringify(payload) });
      if (!ins.ok) throw new Error('falha ao gravar lead');
      lead = (await ins.json())[0];
    }

    // Consentimentos
    const consents = [
      {
        lead_id: lead.id,
        consent_type: 'data_processing',
        accepted: true,
        policy_version: POLICY_VERSION,
        text_accepted: consent.dataProcessingText || 'Aceite do uso dos dados para esta solicitação',
        source: source.landing || null
      }
    ];
    if (consent.marketing === true) {
      consents.push({
        lead_id: lead.id,
        consent_type: 'marketing',
        accepted: true,
        policy_version: POLICY_VERSION,
        text_accepted: consent.marketingText || 'Aceite de recebimento de novidades',
        source: source.landing || null
      });
    }
    await sb('consent', { method: 'POST', body: JSON.stringify(consents) });

    // Simulação
    await sb('simulation', {
      method: 'POST',
      body: JSON.stringify({
        lead_id: lead.id,
        session_id: sessionId || null,
        config_version: result.configVersion,
        engine_version: result.engineVersion,
        inputs: answers,
        result,
        scenario: result.scenario,
        status: result.status,
        requires_review: !!result.manualReview
      })
    });

    // Respostas, com marcação de sensibilidade
    const SENSITIVE = {
      annualIncome: 'financial', secondIncome: 'financial', monthlyDebtPayments: 'financial',
      downPayment: 'financial', debts: 'financial', residency: 'residency', nationality: 'residency'
    };
    const rows = Object.entries(answers)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([question, answer]) => ({
        lead_id: lead.id,
        question,
        answer: typeof answer === 'object' ? answer : { value: answer },
        sensitivity: SENSITIVE[question] || 'normal'
      }));
    if (rows.length) await sb('lead_answer', { method: 'POST', body: JSON.stringify(rows) });

    return res.status(200).json({ ok: true, persisted: true, code: lead.code, leadId: lead.id, result });
  } catch (err) {
    console.error('lead: falha ao gravar');
    return res.status(500).json({ ok: false, error: 'Não foi possível registrar agora. Fale conosco pelo WhatsApp.' });
  }
}

function safeParse(s) { try { return JSON.parse(s); } catch { return null; } }
