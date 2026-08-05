/**
 * POST /api/event
 *
 * Registra eventos do funil para medição interna.
 * Aceita apenas eventos de uma lista fechada e descarta qualquer
 * campo sensível que venha por engano no payload.
 */

const HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };

const ALLOWED_EVENTS = new Set([
  'landing_view',
  'simulation_started',
  'quick_question_completed',
  'quick_simulation_completed',
  'preliminary_result_viewed',
  'full_simulation_started',
  'lead_form_viewed',
  'lead_submitted',
  'simulation_result_viewed',
  'property_match_viewed',
  'property_opened',
  'whatsapp_clicked',
  'visit_requested'
]);

/** Campos que nunca podem ser gravados como telemetria. */
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
    if (typeof v === 'object' && v !== null) continue; // só valores simples
    clean[k] = typeof v === 'string' ? v.slice(0, 120) : v;
  }
  return clean;
}

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(null, { status: 405, headers: HEADERS });
  }

  let body;
  try { body = await req.json(); } catch { return new Response(null, { status: 204 }); }

  if (!ALLOWED_EVENTS.has(body.event)) {
    return new Response(JSON.stringify({ ok: false, error: 'Evento não reconhecido' }), { status: 400, headers: HEADERS });
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return new Response(JSON.stringify({ ok: true, persisted: false }), { status: 200, headers: HEADERS });

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

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: HEADERS });
};

export const config = { path: '/api/event' };
