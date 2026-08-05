/**
 * EASY HOUSE — Controlador do simulador
 *
 * Regras de privacidade aplicadas aqui:
 * - Renda, dívidas, entrada e residência ficam apenas em memória.
 * - localStorage guarda somente navegação (etapa, cidade, variante).
 * - Nenhum dado financeiro vai para eventos de analytics.
 */

import { runSimulation, formatYen } from './lib/financing.js';

/* ============================================================
   Estado
   ============================================================ */
const state = {
  step: 'intro',
  history: [],
  answers: {},          // em memória apenas
  preliminary: null,
  full: null,
  lead: null,
  config: null,
  sessionId: null,
  source: {},
  variant: 'A'
};

const SAFE_KEYS = ['cities', 'purchaseTiming', 'desiredMonthlyPayment']; // podem ser retomados
const STORAGE_KEY = 'eh_funnel_nav';

/* ============================================================
   Origem da campanha e variante
   ============================================================ */
function readSource() {
  const p = new URLSearchParams(location.search);
  const src = {
    utm_source: p.get('utm_source'),
    utm_medium: p.get('utm_medium'),
    utm_campaign: p.get('utm_campaign'),
    utm_content: p.get('utm_content'),
    utm_term: p.get('utm_term'),
    gclid: p.get('gclid'),
    fbclid: p.get('fbclid'),
    propertyId: p.get('property') || document.body.dataset.propertyId || null,
    landing: location.pathname
  };
  Object.keys(src).forEach(k => src[k] == null && delete src[k]);
  return src;
}

function resolveVariant() {
  const forced = new URLSearchParams(location.search).get('v');
  if (forced === 'A' || forced === 'B') {
    localStorage.setItem('eh_variant', forced);
    return forced;
  }
  let v = localStorage.getItem('eh_variant');
  if (v !== 'A' && v !== 'B') {
    v = Math.random() < 0.5 ? 'A' : 'B';
    localStorage.setItem('eh_variant', v);
  }
  return v;
}

function sessionId() {
  let id = sessionStorage.getItem('eh_session');
  if (!id) {
    id = 'S' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    sessionStorage.setItem('eh_session', id);
  }
  return id;
}

/* ============================================================
   Eventos (nunca com dado sensível)
   ============================================================ */
const SENSITIVE = new Set([
  'annualIncome', 'secondIncome', 'monthlyDebtPayments', 'downPayment',
  'residency', 'nationality', 'age', 'debts', 'currentRent'
]);

export function track(event, payload = {}) {
  const clean = {};
  for (const [k, v] of Object.entries(payload)) {
    if (SENSITIVE.has(k)) continue;
    if (typeof v === 'object') continue;
    clean[k] = v;
  }

  // camada de dados para GTM/GA4 (sem dados financeiros)
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ event, variant: state.variant, ...clean });

  // medição interna
  try {
    navigator.sendBeacon(
      '/api/event',
      new Blob(
        [JSON.stringify({
          event, sessionId: state.sessionId, leadId: state.lead?.leadId || null,
          variant: state.variant, step: state.step, source: state.source, payload: clean
        })],
        { type: 'application/json' }
      )
    );
  } catch { /* telemetria nunca quebra a experiência */ }
}

/* ============================================================
   Navegação
   ============================================================ */
export function goTo(step, { push = true } = {}) {
  if (push && state.step !== step) state.history.push(state.step);
  state.step = step;

  document.querySelectorAll('.fx-step').forEach(el => {
    el.classList.toggle('active', el.dataset.step === step);
  });

  const active = document.querySelector(`.fx-step[data-step="${step}"]`);
  if (active) {
    const h = active.querySelector('.fx-q, .fx-hero__title, h2');
    if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
  }
  window.scrollTo({ top: 0, behavior: 'instant' });

  updateProgress();
  updateActions();
  saveNav();
}

export function goBack() {
  const prev = state.history.pop();
  if (prev) goTo(prev, { push: false });
}

const QUICK_STEPS = ['q_payment', 'q_cities', 'q_age', 'q_work', 'q_work_years', 'q_residency', 'q_visa', 'q_composition'];
const FULL_STEPS = ['f_income', 'f_second', 'f_debts', 'f_down', 'f_timing'];

function updateProgress() {
  const bar = document.getElementById('fxProgress');
  if (!bar) return;
  const all = ['intro', ...QUICK_STEPS, 'preliminary', ...FULL_STEPS, 'lead', 'result'];
  const i = all.indexOf(state.step);
  bar.style.width = i < 0 ? '0%' : Math.round((i / (all.length - 1)) * 100) + '%';

  const counter = document.querySelector(`.fx-step[data-step="${state.step}"] .fx-count`);
  if (counter && counter.dataset.of) {
    counter.textContent = `Pergunta ${counter.dataset.n} de ${counter.dataset.of}`;
  }
}

function updateActions() {
  const back = document.getElementById('fxBack');
  if (back) back.style.display = state.history.length && state.step !== 'result' ? '' : 'none';
}

function saveNav() {
  try {
    const nav = { step: state.step, variant: state.variant };
    for (const k of SAFE_KEYS) if (state.answers[k] != null) nav[k] = state.answers[k];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nav));
  } catch { /* modo privado */ }
}

/* ============================================================
   Respostas
   ============================================================ */
export function setAnswer(key, value) {
  state.answers[key] = value;
  saveNav();
}

export function getAnswers() { return state.answers; }
export function getState() { return state; }

/* ============================================================
   Simulação
   ============================================================ */
function buildInput() {
  const a = state.answers;
  const input = {
    age: Number(a.age),
    employmentType: a.employmentType,
    employmentYears: a.employmentYears || 'gte3',
    residency: a.residency || (a.nationality === 'japanese' ? 'japanese' : 'unknown'),
    desiredMonthlyPayment: Number(a.desiredMonthlyPayment) || undefined,
    annualIncome: Number(a.annualIncome) || undefined,
    monthlyDebtPayments: Number(a.monthlyDebtPayments) || 0,
    downPayment: Number(a.downPayment) || 0
  };
  if (a.propertyPrice) input.propertyPrice = Number(a.propertyPrice);
  if (Number(a.secondIncome)) {
    input.secondApplicant = { annualIncome: Number(a.secondIncome), age: Number(a.secondAge) || undefined };
  }
  return input;
}

/**
 * Calcula. Tenta o servidor (fonte da verdade); se indisponível,
 * usa o mesmo motor localmente para não travar a experiência.
 */
export async function simulate() {
  const input = buildInput();
  try {
    const resp = await fetch('/api/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input)
    });
    if (resp.ok) {
      const data = await resp.json();
      if (data.ok) return data.result;
    }
  } catch { /* cai para o cálculo local */ }
  return runSimulation(input, state.config);
}

/* ============================================================
   Envio do lead
   ============================================================ */
export async function submitLead(contact, consent) {
  const body = {
    contact,
    consent,
    answers: state.answers,
    source: { ...state.source, variant: state.variant },
    sessionId: state.sessionId
  };

  const resp = await fetch('/api/lead', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const err = new Error(data.error || 'Falha no envio');
    err.fields = data.fields;
    throw err;
  }
  state.lead = data;
  return data;
}

/* ============================================================
   WhatsApp — sem dados financeiros na mensagem
   ============================================================ */
export function whatsappLink() {
  const code = state.lead?.code || '';
  const cities = (state.answers.cities || []).join(', ');
  const parts = [
    'Olá! Fiz uma simulação no site da Easy House.',
    code ? `Meu código é ${code}.` : '',
    cities ? `Tenho interesse em imóveis em ${cities}.` : '',
    'Gostaria de confirmar minha pré-análise.'
  ].filter(Boolean);
  return 'https://wa.me/818028867708?text=' + encodeURIComponent(parts.join(' '));
}

/* ============================================================
   Imóveis
   ============================================================ */

/**
 * Mensagem única sobre imóveis.
 *
 * Não existe base de imóveis à venda publicada: em vez de contar ou listar
 * algo que não podemos confirmar, dizemos o que é verdade — a Easy House tem
 * imóveis na região e o corretor apresenta os que se enquadram.
 */
export const PROPERTY_MESSAGE =
  'Temos imóveis disponíveis na região, o corretor irá lhe apresentar as opções que se enquadram.';

/* ============================================================
   Utilidades de formatação
   ============================================================ */
export const yen = formatYen;

export function parseYen(text) {
  const n = Number(String(text).replace(/[^\d]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

export function bindYenInput(el) {
  if (!el) return;
  el.addEventListener('input', () => {
    const raw = el.value.replace(/[^\d]/g, '');
    el.value = raw ? Number(raw).toLocaleString('pt-BR') : '';
  });
}

/* ============================================================
   Início
   ============================================================ */
export async function initFunnel(config) {
  state.config = config;
  state.sessionId = sessionId();
  state.source = readSource();
  state.variant = resolveVariant();

  // cidade vinda da rota (/simular/hekinan)
  const cityFromRoute = document.body.dataset.city;
  if (cityFromRoute) state.answers.cities = [cityFromRoute];

  const priceFromRoute = document.body.dataset.propertyPrice;
  if (priceFromRoute) state.answers.propertyPrice = Number(priceFromRoute);

  document.getElementById('fxBack')?.addEventListener('click', goBack);

  track('landing_view', { landing: location.pathname, city: cityFromRoute || null });
  updateProgress();
  updateActions();
}
