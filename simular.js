/**
 * EASY HOUSE — Fluxo do simulador
 * Liga a interface ao controlador e ao motor financeiro.
 */

import {
  initFunnel, goTo, goBack, setAnswer, getAnswers, getState,
  simulate, submitLead, whatsappLink, PROPERTY_MESSAGE,
  track, yen, parseYen, bindYenInput
} from './funnel.js?v=9';

import config from './lib/financing-config.json?v=7' with { type: 'json' };
import { t, tm } from './i18n.js?v=1';
import { compareWithRent } from './lib/financing.js?v=7';

const $ = s => document.querySelector(s);
const nextBtn = $('#fxNext');

/* ============================================================
   Roteiro de etapas
   ============================================================ */
const FLOW = {
  intro:        { next: () => 'q_payment',  label: t('btn.calcular') },
  q_payment:    { next: () => 'q_cities',   label: t('btn.continuar'), validate: vPayment },
  q_cities:     { next: () => 'q_age',      label: t('btn.continuar'), validate: vCities },
  q_age:        { next: () => 'q_work',     label: t('btn.continuar'), validate: vAge },
  q_work:       { next: nextAfterWork,      label: t('btn.continuar'), validate: vWork },
  q_work_years: { next: () => 'q_residency',label: t('btn.continuar'), validate: vWorkYears },
  q_residency:  { next: nextAfterNationality, label: t('btn.continuar'), validate: vNationality },
  q_visa:       { next: () => 'q_composition', label: t('btn.continuar'), validate: vVisa },
  q_composition:{ next: () => 'preliminary', label: t('btn.primeiroCenario'), validate: vComposition },
  preliminary:  { next: () => 'f_income',   label: t('btn.completar') },
  f_income:     { next: nextAfterIncome,    label: t('btn.continuar'), validate: vIncome },
  f_second:     { next: () => 'f_debts',    label: t('btn.continuar') },
  f_debts:      { next: () => 'f_down',     label: t('btn.continuar'), validate: vDebts },
  f_down:       { next: () => 'f_timing',   label: t('btn.continuar'), validate: vDown },
  f_timing:     { next: () => 'lead',       label: t('btn.simulacaoCompleta'), validate: vTiming },
  lead:         { next: () => 'result',     label: t('btn.verSimulacao'), validate: vLead, submit: true },
  result:       { next: () => null,         label: '' }
};

function nextAfterWork() {
  const tipo = getAnswers().employmentType;
  return (tipo === 'seishain' || tipo === 'empreiteira') ? 'q_work_years' : 'q_residency';
}
function nextAfterNationality() {
  return getAnswers().nationality === 'japanese' ? 'q_composition' : 'q_visa';
}
function nextAfterIncome() {
  return getAnswers().composition === 'couple' ? 'f_second' : 'f_debts';
}

/* ============================================================
   Seleção nas listas de opções
   ============================================================ */
function single(containerId, key, onPick) {
  const box = document.getElementById(containerId);
  if (!box) return;
  box.querySelectorAll('.fx-opt').forEach(btn => {
    btn.setAttribute('aria-pressed', 'false');
    btn.addEventListener('click', () => {
      box.querySelectorAll('.fx-opt').forEach(b => b.setAttribute('aria-pressed', 'false'));
      btn.setAttribute('aria-pressed', 'true');
      setAnswer(key, btn.dataset.value);
      clearError(containerId);
      onPick?.(btn.dataset.value);
    });
  });
}

function multi(containerId, key, { exclusive } = {}) {
  const box = document.getElementById(containerId);
  if (!box) return;
  box.querySelectorAll('.fx-opt').forEach(btn => {
    btn.setAttribute('aria-pressed', 'false');
    btn.addEventListener('click', () => {
      const val = btn.dataset.value;
      const isExclusive = exclusive && val === exclusive;

      if (isExclusive) {
        box.querySelectorAll('.fx-opt').forEach(b => b.setAttribute('aria-pressed', 'false'));
        btn.setAttribute('aria-pressed', 'true');
      } else {
        if (exclusive) box.querySelector(`[data-value="${exclusive}"]`)?.setAttribute('aria-pressed', 'false');
        btn.setAttribute('aria-pressed', btn.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
      }

      const picked = [...box.querySelectorAll('.fx-opt[aria-pressed="true"]')].map(b => b.dataset.value);
      setAnswer(key, picked);
      clearError(containerId);
      box.dispatchEvent(new CustomEvent('picked', { detail: picked }));
    });
  });
}

function showError(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  if (msg) el.textContent = msg;
  el.classList.add('show');
}
function clearError(scope) {
  document.querySelectorAll(`.fx-step[data-step="${getState().step}"] .fx-error`).forEach(e => e.classList.remove('show'));
}

/* ============================================================
   Validações
   ============================================================ */
function vPayment() {
  const a = getAnswers();
  if (a.desiredMonthlyPaymentChoice === 'other') {
    const v = parseYen($('#inPayment').value);
    if (v < 20000 || v > 500000) { showError('errPayment'); $('#inPayment').focus(); return false; }
    setAnswer('desiredMonthlyPayment', v);
    return true;
  }
  if (!a.desiredMonthlyPayment) { showError('errPayment', t('erro.escolhaOpcao')); return false; }
  return true;
}
function vCities() {
  const c = getAnswers().cities;
  if (!c || !c.length) { alertStep('Escolha pelo menos uma cidade.'); return false; }
  return true;
}
function vAge() {
  const v = Number($('#inAge').value);
  if (!v || v < 18 || v > 79) { showError('errAge'); $('#inAge').focus(); return false; }
  setAnswer('age', v);
  return true;
}
function vWork() {
  if (!getAnswers().employmentType) { alertStep('Escolha uma opção para continuar.'); return false; }
  return true;
}
function vWorkYears() {
  if (!getAnswers().employmentYears) { alertStep('Escolha uma opção para continuar.'); return false; }
  return true;
}
function vNationality() {
  const n = getAnswers().nationality;
  if (!n) { alertStep('Escolha uma opção para continuar.'); return false; }
  if (n === 'japanese') setAnswer('residency', 'japanese');
  return true;
}
function vVisa() {
  if (!getAnswers().residency) { alertStep('Escolha uma opção para continuar.'); return false; }
  return true;
}
function vComposition() {
  if (!getAnswers().composition) { alertStep('Escolha uma opção para continuar.'); return false; }
  return true;
}
function vIncome() {
  const v = parseYen($('#inIncome').value);
  if (v < 500000 || v > 50000000) { showError('errIncome'); $('#inIncome').focus(); return false; }
  setAnswer('annualIncome', v);
  return true;
}
function vDebts() {
  const d = getAnswers().debts;
  if (!d || !d.length) { alertStep('Escolha uma opção para continuar.'); return false; }
  if (d.includes('none')) { setAnswer('monthlyDebtPayments', 0); return true; }
  setAnswer('monthlyDebtPayments', parseYen($('#inDebt').value));
  return true;
}
function vDown() {
  const a = getAnswers();
  if (a.downPaymentChoice == null) { alertStep('Escolha uma opção para continuar.'); return false; }
  if (a.downPaymentChoice === 'other') setAnswer('downPayment', parseYen($('#inDown').value));
  return true;
}
function vTiming() {
  if (!getAnswers().purchaseTiming) { alertStep('Escolha uma opção para continuar.'); return false; }
  return true;
}
function vLead() {
  let ok = true;
  const name = $('#inName').value.trim();
  const phone = $('#inPhone').value.trim();
  const consent = $('#inConsent').checked;

  $('#errName').classList.toggle('show', name.length < 2);
  $('#errPhone').classList.toggle('show', phone.replace(/\D/g, '').length < 10);
  $('#errConsent').classList.toggle('show', !consent);

  if (name.length < 2) { $('#inName').focus(); ok = false; }
  else if (phone.replace(/\D/g, '').length < 10) { $('#inPhone').focus(); ok = false; }
  else if (!consent) { $('#inConsent').focus(); ok = false; }
  return ok;
}

function alertStep(msg) {
  const step = document.querySelector(`.fx-step[data-step="${getState().step}"]`);
  let el = step.querySelector('.fx-error--inline');
  if (!el) {
    el = document.createElement('p');
    el.className = 'fx-error fx-error--inline';
    step.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 4000);
}

/* ============================================================
   Telas de resultado
   ============================================================ */
function row(label, value, cls = '') {
  return `<div class="fx-row ${cls}"><span>${label}</span><span>${value}</span></div>`;
}

async function renderPreliminary() {
  $('#prelimLoading').hidden = false;
  $('#prelimContent').hidden = true;
  track('quick_simulation_completed', { cities: (getAnswers().cities || []).join('|') });

  const result = await simulate();
  getState().preliminary = result;

  const a = getAnswers();
  const r = result;

  if (r.status === 'manual_review' && !r.propertyRange) {
    $('#prelimLoading').hidden = true;
    $('#prelimContent').hidden = false;
    $('#prelimBadge').textContent = t('badge.analisePersonalizada');
    $('#prelimBadge').className = 'fx-badge fx-badge--review';
    $('#prelimIntro').textContent = t('prelim.semRange');
    $('#prelimRows').innerHTML = '';
    $('#prelimProps').innerHTML = (r.notes || []).map(tm).join(' ');
    $('#prelimCenter').textContent = '—';
    $('#prelimMin').textContent = '—';
    $('#prelimMax').textContent = '—';
    track('preliminary_result_viewed', { status: 'manual_review' });
    return;
  }

  $('#prelimCenter').textContent = yen(r.propertyRange.center);
  $('#prelimMin').textContent = yen(r.propertyRange.min);
  $('#prelimMax').textContent = yen(r.propertyRange.max);

  // Ponte para o portal de casas: quem acabou de descobrir a faixa quer ver
  // o que existe dentro dela. Leva o teto da faixa e as cidades escolhidas.
  const verCasas = $('#prelimVerCasas');
  if (verCasas && r.propertyRange.max > 0) {
    const params = new URLSearchParams({ precoMax: String(Math.round(r.propertyRange.max)) });
    const cidades = (a.cities || []).filter(Boolean);
    if (cidades.length) params.set('cidade', cidades.join(','));
    verCasas.href = '/comprar/imoveis?' + params.toString();
    verCasas.textContent = t('prelim.verCasas', { max: yen(r.propertyRange.max) });
    verCasas.hidden = false;
    const ajuda = $('#prelimVerCasasAjuda');
    if (ajuda) { ajuda.textContent = t('prelim.verCasasAjuda'); ajuda.hidden = false; }
    verCasas.addEventListener('click', function () {
      track('simulacao_ver_casas', { precoMax: r.propertyRange.max });
    }, { once: true });
  }

  $('#prelimIntro').textContent = t('prelim.intro', {
    parcela: yen(r.payment.used),
    min: yen(r.propertyRange.min),
    max: yen(r.propertyRange.max)
  });

  $('#prelimRows').innerHTML = [
    row(t('row.parcelaMes'), yen(r.payment.desired || r.payment.used)),
    row(t('row.tempoPagar'), t('row.anosParcelas', { anos: r.term.years, meses: r.term.months })),
    row(t('row.juros'), tm(r.rate.display)),
    row(t('row.tipoFinanciamento'), tm(r.scenarioLabel)),
    row(t('row.cidadeEscolhida'), (a.cities || []).join(', ') || '—')
  ].join('');

  if (r.manualReview) {
    $('#prelimBadge').textContent = t('badge.infoAdicionais');
    $('#prelimBadge').className = 'fx-badge fx-badge--review';
  } else {
    $('#prelimBadge').textContent = t('badge.calculada');
    $('#prelimBadge').className = 'fx-badge fx-badge--ok';
  }

  $('#prelimProps').innerHTML = `${PROPERTY_MESSAGE} ${t('prelim.proximaEtapa')}`;

  const notes = [...(r.notes || []), ...(r.warnings || [])];
  $('#prelimNotes').innerHTML = notes.map(n => `<div class="fx-note fx-note--warn">${tm(n)}</div>`).join('');

  $('#prelimLoading').hidden = true;
  $('#prelimContent').hidden = false;
  track('preliminary_result_viewed', { status: r.status, scenario: r.scenario });
}

async function renderResult() {
  const r = getState().full || getState().preliminary;
  const a = getAnswers();
  const lead = getState().lead;

  if (lead?.code) $('#resultName').textContent = `, ${$('#inName').value.trim().split(' ')[0]}`;

  if (r.manualReview) {
    $('#resultBadge').textContent = t('badge.analisePersonalizada');
    $('#resultBadge').className = 'fx-badge fx-badge--review';
  }

  if (r.propertyRange) {
    $('#resCenter').textContent = yen(r.propertyRange.center);
    $('#resMin').textContent = yen(r.propertyRange.min);
    $('#resMax').textContent = yen(r.propertyRange.max);
  }

  $('#resPayment').innerHTML = [
    row(t('row.parcelaEstimada'), yen(r.payment.used), 'fx-row--total'),
    row(t('row.tempoPagar'), t('row.anos', { anos: r.term.years })),
    row(t('row.totalParcelas'), r.term.months),
    row(t('row.juros'), tm(r.rate.display)),
    r.payment.desired ? row(t('row.parcelaDesejada'), yen(r.payment.desired), 'fx-row--sub') : '',
    r.payment.incomeCapacity != null
      ? row(t('row.estimativaRenda'), yen(r.payment.incomeCapacity), 'fx-row--sub')
      : row(t('row.estimativaRenda'), t('row.precisaValidacao'), 'fx-row--sub')
  ].join('');

  const c = r.costBreakdown;
  $('#resCost').innerHTML = [
    row(t('row.valorImovel'), yen(c.propertyPrice)),
    row(t('row.despesas', { pct: Math.round(r.financing.acquisitionFeeRate * 100) }), yen(c.estimatedFees)),
    row(t('row.custoTotal'), yen(c.totalAcquisitionCost)),
    row(t('row.entrada'), yen(c.downPayment)),
    row(t('row.valorFinanciado'), yen(c.financedAmount), 'fx-row--total')
  ].join('');

  $('#resScenario').innerHTML =
    `<p style="margin-bottom:10px"><strong>${tm(r.scenarioLabel)}</strong></p>` +
    `<p style="font-size:.94rem;color:var(--ink-soft)">${explain(r, a)}</p>` +
    (r.manualReview
      ? `<div class="fx-note fx-note--warn" style="margin-top:12px">${t('res.casoIndividual')}</div>`
      : '');

  const notes = [...(r.notes || []), ...(r.warnings || [])];
  $('#resExplain').innerHTML = notes.map(n => `<div class="fx-note">${tm(n)}</div>`).join('');

  $('#resMatome').innerHTML = r.matomeToku
    ? `<div class="fx-card">
         <p class="fx-card__label">${t('res.parcelasAtuais')}</p>
         <p style="font-size:.95rem;color:var(--ink-soft)">${tm(r.matomeToku.message)}</p>
         <a class="fx-btn fx-btn--ghost fx-btn--block" style="margin-top:14px" href="/omatome">${t('res.analisarDividas')}</a>
       </div>`
    : '';

  $('#resLegal').textContent = tm(r.disclaimer) +
    t('res.legalDespesas', { pct: Math.round(r.financing.acquisitionFeeRate * 100) }) +
    t('res.legalConfig', { versao: r.configVersion, data: r.configValidFrom });

  $('#btnWhatsApp').href = whatsappLink('result');
  $('#btnWhatsApp').addEventListener('click', () => track('whatsapp_clicked', { from: 'result' }), { once: true });

  // Imóveis: mensagem única, sem listar ou contar o que não podemos confirmar
  const cidades = (a.cities || []).filter(c => c !== 'outra');
  $('#resProps').innerHTML =
    `<div class="fx-card">
       <p class="fx-card__label">${t('res.imoveis')}</p>
       <p style="font-size:.98rem;color:var(--ink);line-height:1.6">${PROPERTY_MESSAGE}</p>
       ${cidades.length ? `<p class="fx-help" style="margin-top:10px">${t('res.cidadesEscolhidas', { cidades: cidades.join(', ') })}</p>` : ''}
       <p class="fx-help" style="margin-top:10px">${t('res.leveCodigo')}</p>
     </div>`;

  track('simulation_result_viewed', { status: r.status, scenario: r.scenario });
}

/** Explicação em linguagem simples, usando apenas números já calculados. */
function explain(r, a) {
  const trabalho = {
    seishain: t('exp.seishain'),
    empreiteira: a.employmentYears === 'gte3' ? t('exp.haken3') : t('exp.hakenMenos'),
    autonomo: t('exp.autonomo'),
    empresario: t('exp.empresario'),
    temporario: t('exp.temporario'),
    outro: t('exp.outro')
  }[a.employmentType] || t('exp.outro');

  let txt = t('exp.produto', { trabalho, produto: tm(r.scenarioLabel).toLowerCase() });
  txt += t('exp.prazo', { anos: r.term.years });

  if (r.payment.basis === 'income') {
    txt += t('exp.baseRenda');
  } else if (r.payment.incomeCapacity != null) {
    txt += t('exp.baseComparada');
  } else {
    txt += t('exp.baseDesejada');
  }
  return txt;
}

/* ============================================================
   Comparação com aluguel
   ============================================================ */
function bindRent() {
  const input = $('#inRent');
  bindYenInput(input);
  input.addEventListener('input', () => {
    const rent = parseYen(input.value);
    const r = getState().full || getState().preliminary;
    if (!rent || !r) { $('#resRent').innerHTML = ''; return; }

    const cmp = compareWithRent({ currentRent: rent, estimatedPayment: r.payment.used, otherMonthlyCosts: 0 });
    const diff = cmp.difference;
    $('#resRent').innerHTML = [
      row(t('row.aluguelAtual'), yen(cmp.currentRent)),
      row(t('row.parcelaFinanciamento'), yen(cmp.estimatedPayment)),
      row(tm(cmp.label), (diff >= 0 ? '+' : '−') + yen(Math.abs(diff)), 'fx-row--total')
    ].join('') +
      `<p class="fx-help" style="margin-top:12px">${t('res.aluguelNota')}</p>`;
  });
}

/* ============================================================
   Botão principal
   ============================================================ */
async function onNext() {
  const step = getState().step;
  const node = FLOW[step];
  if (!node) return;

  if (node.validate && !node.validate()) return;

  if (step === 'intro') track('simulation_started', { variant: getState().variant });
  if (step === 'preliminary') track('full_simulation_started');
  if (step.startsWith('q_')) track('quick_question_completed', { question: step });

  // envio do lead
  if (node.submit) {
    nextBtn.disabled = true;
    nextBtn.textContent = t('btn.enviando');
    $('#errSubmit').classList.remove('show');
    try {
      const contact = {
        firstName: $('#inName').value.trim(),
        phone: $('#inPhone').value.trim(),
        email: $('#inEmail').value.trim() || null,
        language: $('#inLang').value,
        preferredTime: $('#inWhen').value || null
      };
      const consent = {
        dataProcessing: $('#inConsent').checked,
        dataProcessingText: $('#consentText').textContent.trim(),
        marketing: $('#inMarketing').checked,
        marketingText: t('consent.marketing')
      };
      const data = await submitLead(contact, consent);
      // O servidor recalcula com todos os dados; se não vier, calcula aqui.
      getState().full = data.result || (await simulate());
      track('lead_submitted', { persisted: !!data.persisted, eventId: getState().leadEventId });
    } catch (err) {
      // A gravação pode falhar, mas o cálculo não pode ficar desatualizado:
      // recalcula com as respostas da etapa financeira antes de exibir.
      $('#errSubmit').textContent = err.message + t('erro.submitSufixo');
      $('#errSubmit').classList.add('show');
      getState().full = await simulate();
    } finally {
      nextBtn.disabled = false;
    }

    goTo('result');
    await renderResult();
    $('#fxActions').style.display = 'none';
    return;
  }

  const next = node.next();
  if (!next) return;

  goTo(next);
  nextBtn.textContent = FLOW[next].label || t('btn.continuar');

  if (next === 'preliminary') await renderPreliminary();
  if (next === 'lead') track('lead_form_viewed');
  if (next === 'f_income') adaptIncomeCopy();
}

/** Ajusta a explicação da renda conforme o tipo de trabalho. */
function adaptIncomeCopy() {
  const tipo = getAnswers().employmentType;
  const tip = $('#incomeTip');
  if (tipo === 'autonomo' || tipo === 'empresario') {
    $('#incomeHelp').textContent = t('renda.helpAutonomo');
    tip.innerHTML = t('renda.tipAutonomo');
  } else {
    $('#incomeHelp').textContent = t('renda.helpAssalariado');
    tip.innerHTML = t('renda.tipAssalariado');
  }
}

/* ============================================================
   Teste A/B da headline
   ============================================================ */
function applyVariant() {
  if (getState().variant === 'B') {
    $('#fxHeadline').textContent = t('variante.headlineB');
    $('#fxSubline').textContent = t('variante.sublineB');
  }
}

/* ============================================================
   Início
   ============================================================ */
await initFunnel(config);

/* ============================================================
   Entrada sem tela de abertura (tráfego de anúncio)
   ------------------------------------------------------------
   Quando o funil já começa na pergunta 1, o rótulo do botão
   precisa acompanhar, e "começou a simulação" passa a ser a
   primeira resposta — antes era o clique na tela de abertura.
   Sem isso os dois caminhos não seriam comparáveis.
   ============================================================ */
const passoInicial = getState().step;
nextBtn.textContent = FLOW[passoInicial]?.label || t('btn.continuar');

if (passoInicial !== 'intro') {
  document.getElementById('optPayment')?.addEventListener('click', () => {
    track('simulation_started', { variant: getState().variant, entrada: 'direto_na_pergunta' });
  }, { once: true });
}
applyVariant();

// Opções
single('optPayment', 'desiredMonthlyPaymentChoice', v => {
  const other = v === 'other';
  $('#fieldPaymentOther').hidden = !other;
  if (other) setTimeout(() => $('#inPayment').focus(), 60);
  else setAnswer('desiredMonthlyPayment', Number(v));
});
multi('optCities', 'cities');
single('optWork', 'employmentType');
single('optWorkYears', 'employmentYears', () => {
  const tipo = getAnswers().employmentType;
  $('#qWorkYears').textContent = tipo === 'seishain' ? t('q.tempoEmpresa') : t('q.tempoEmpreiteira');
});
single('optNationality', 'nationality');
single('optVisa', 'residency');
single('optComposition', 'composition');
multi('optDebts', 'debts', { exclusive: 'none' });
single('optDown', 'downPaymentChoice', v => {
  const other = v === 'other';
  $('#fieldDownOther').hidden = !other;
  if (!other) setAnswer('downPayment', Number(v));
});
single('optTiming', 'purchaseTiming');

// Mostra o campo de valor das dívidas quando houver alguma
document.getElementById('optDebts')?.addEventListener('picked', e => {
  const has = e.detail.length && !e.detail.includes('none');
  $('#fieldDebtAmount').hidden = !has;
});

// Ajusta o título do tempo de trabalho ao entrar na etapa
document.getElementById('optWork')?.addEventListener('click', () => {
  const tipo = getAnswers().employmentType;
  $('#qWorkYears').textContent = tipo === 'seishain' ? t('q.tempoEmpresa') : t('q.tempoEmpreiteira');
});

// Campos em ienes
['#inPayment', '#inIncome', '#inSecondIncome', '#inDebt', '#inDown'].forEach(s => bindYenInput($(s)));
bindRent();

// Segunda pessoa
$('#inSecondIncome')?.addEventListener('input', () => setAnswer('secondIncome', parseYen($('#inSecondIncome').value)));
$('#inSecondAge')?.addEventListener('input', () => setAnswer('secondAge', Number($('#inSecondAge').value)));
$('#inSecondWork')?.addEventListener('change', () => setAnswer('secondWork', $('#inSecondWork').value));

// Navegação
nextBtn.addEventListener('click', onNext);
$('#prelimCta')?.addEventListener('click', onNext);

/* ============================================================
   Atalhos para o WhatsApp
   ------------------------------------------------------------
   O link é montado no momento do clique, e não no carregamento,
   porque as cidades (e o código, quando existe) só são conhecidos
   depois que a pessoa avança.
   ============================================================ */
[['#prelimWhats', 'preliminary'], ['#leadWhats', 'lead'], ['#fxTopWhats', 'topo']].forEach(([sel, origem]) => {
  const el = $(sel);
  if (!el) return;
  el.addEventListener('click', () => {
    el.href = whatsappLink(origem);
    track('whatsapp_clicked', { from: origem });
  });
});
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && getState().step !== 'lead' && getState().step !== 'result') {
    if (e.target.tagName === 'TEXTAREA') return;
    e.preventDefault();
    onNext();
  }
});
