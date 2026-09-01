/**
 * POST /api/event — Vercel Serverless Function
 *
 * Registra eventos do funil. Aceita apenas eventos de uma lista fechada
 * e descarta campos sensíveis que venham por engano.
 */

const ALLOWED_EVENTS = new Set([
  'landing_view', 'simulation_started', 'quick_question_completed',
  'quick_simulation_completed', 'preliminary_result_viewed', 'full_simulation_started',
  'lead_form_viewed', 'lead_submitted', 'simulation_result_viewed',
  'property_match_viewed', 'property_opened', 'whatsapp_clicked', 'visit_requested',
  // Medição primeira-parte das landing pages (analytics.js). Independe do pixel
  // e do aceite de cookies: é a única forma de saber se o tráfego pago clica.
  'lp_view', 'lp_whatsapp_clicked',
  // Portal de casas à venda. O funil que interessa aqui é
  // busca → imóvel → interesse → WhatsApp, e `cta_position` diz qual
  // botão da página trouxe o lead.
  'property_list_view', 'property_view', 'search_performed', 'search_no_results',
  'filter_used', 'property_favorite', 'favorites_view', 'property_share',
  'gallery_open', 'related_property_click', 'simulacao_ver_casas',
  'whatsapp_click', 'whatsapp_property_click',
  'whatsapp_simulation_click', 'whatsapp_visit_click'
]);

const BLOCKED_KEYS = new Set([
  'annualIncome', 'income', 'renda', 'secondIncome',
  'monthlyDebtPayments', 'debts', 'debtBalance', 'saldo',
  'residency', 'nationality', 'visa', 'visto',
  'age', 'idade', 'phone', 'email', 'firstName', 'name'
]);

function sanitize(payload) {
  if (!payload || typeof payload !== 'object') return {};
  const clean = {};
  for (const [k, v] of Object.entries(payload)) {
    if (BLOCKED_KEYS.has(k)) continue;
    if (typeof v === 'object' && v !== null) continue;
    clean[k] = typeof v === 'string' ? v.slice(0, 120) : v;
  }
  return clean;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();

  const body = typeof req.body === 'string' ? safeParse(req.body) : (req.body || {});
  if (!body) return res.status(204).end();

  if (!ALLOWED_EVENTS.has(body.event)) {
    return res.status(400).json({ ok: false, error: 'Evento não reconhecido' });
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return res.status(200).json({ ok: true, persisted: false });

  try {
    await fetch(`${url}/rest/v1/funnel_event`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: String(body.sessionId || 'anon').slice(0, 64),
        lead_id: body.leadId || null,
        event: body.event,
        step: body.step ? String(body.step).slice(0, 40) : null,
        variant: body.variant ? String(body.variant).slice(0, 20) : null,
        source: sanitize(body.source),
        payload: sanitize(body.payload)
      })
    });
  } catch {
    // Telemetria nunca deve quebrar a experiência
  }

  return res.status(200).json({ ok: true });
}

function safeParse(s) { try { return JSON.parse(s); } catch { return null; } }
