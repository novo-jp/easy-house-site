/**
 * EASY HOUSE — Controlador do simulador
 *
 * Regras de privacidade aplicadas aqui:
 * - Renda, dívidas, entrada e residência ficam apenas em memória.
 * - localStorage guarda somente navegação (etapa, cidade, variante).
 * - Nenhum dado financeiro vai para eventos de analytics.
 */

import { runSimulation, formatYen } from './lib/financing.js?v=7';
import { t, tm } from './i18n.js?v=1';

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

  // No resultado preliminar o botão de avançar já aparece logo após o valor;
  // a barra fixa mantém só o "voltar" para não duplicar o mesmo botão.
  const next = document.getElementById('fxNext');
  if (next) next.style.display = state.step === 'preliminary' ? 'none' : '';
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
  // Identificador único deste envio. O navegador e o servidor mandam o mesmo
  // valor para o Meta, que assim conta uma conversão só em vez de duas.
  state.leadEventId = 'L' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

  // Só acompanha a atribuição de anúncio quem aceitou a medição.
  // Sem aceite isto vem null, e o servidor não mede nada.
  const ads = (window.ehConsent && window.ehConsent.atribuicao)
    ? window.ehConsent.atribuicao()
    : null;

  const body = {
    contact,
    consent,
    answers: state.answers,
    source: { ...state.source, variant: state.variant },
    sessionId: state.sessionId,
    eventId: state.leadEventId,
    ads
  };

  const resp = await fetch('/api/lead', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const err = new Error(tm(data.error || 'Falha no envio'));
    err.fields = data.fields;
    throw err;
  }
  state.lead = data;
  return data;
}

/* ============================================================
   WhatsApp — sem dados financeiros na mensagem
   ============================================================ */
/**
 * Link do WhatsApp.
 *
 * `origem` muda apenas a última frase, para o corretor saber em que ponto a
 * pessoa estava. Continua valendo a regra: **nenhum valor financeiro na
 * mensagem** — nem parcela, nem renda, nem a faixa estimada. Isso viaja como
 * texto dentro de uma URL, e URL não é lugar para dado financeiro. O corretor
 * consulta o resto pelo código, ou pergunta.
 */
export function whatsappLink(origem) {
  const code = state.lead?.code || '';
  const cities = (state.answers.cities || []).filter(c => c !== 'outra').join(', ');

  const fecho = {
    preliminary: t('wa.fechoPreliminary'),
    lead:        t('wa.fechoLead'),
    result:      t('wa.fechoResult'),
    topo:        t('wa.fechoTopo')
  }[origem] || t('wa.fechoPadrao');

  // Quem sai pelo topo não simulou nada: dizer que simulou confunde os dois
  // lados da conversa. A abertura muda, o resto do formato continua igual.
  const abertura = origem === 'topo' ? t('wa.aberturaTopo') : t('wa.abertura');

  const parts = [
    abertura,
    code ? t('wa.codigo', { codigo: code }) : '',
    cities ? t('wa.cidades', { cidades: cities }) : '',
    fecho
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
export const PROPERTY_MESSAGE = t('imoveis.mensagem');

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
/**
 * Quem chega por anúncio já disse "sim" uma vez: assistiu ao vídeo e clicou.
 * A tela de abertura repete a promessa e cobra um segundo "sim" — e era ali
 * que 92% das pessoas saíam (411 chegaram, 26 apertaram o botão).
 *
 * Para tráfego de anúncio começamos direto na pergunta 1, que é fácil e já
 * mostra movimento. Quem chega pelo site continua vendo a introdução, o que
 * mantém uma base de comparação.
 *
 * `?intro=1` força a introdução e `?intro=0` força o pulo — para testar.
 */
export function veioDeAnuncio() {
  const forcado = new URLSearchParams(location.search).get('intro');
  if (forcado === '1') return false;
  if (forcado === '0') return true;
  const s = state.source || {};
  return !!(s.utm_source || s.utm_medium || s.utm_campaign || s.fbclid || s.gclid);
}

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

  const semIntroducao = veioDeAnuncio();
  state.entrada = semIntroducao ? 'direto_na_pergunta' : 'com_introducao';

  track('landing_view', {
    landing: location.pathname,
    city: cityFromRoute || null,
    entrada: state.entrada
  });

  if (semIntroducao) goTo('q_payment', { push: false });

  updateProgress();
  updateActions();
}
