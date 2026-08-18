/**
 * EASY HOUSE — Fluxo do simulador
 * Liga a interface ao controlador e ao motor financeiro.
 */

import {
  initFunnel, goTo, goBack, setAnswer, getAnswers, getState,
  simulate, submitLead, whatsappLink, PROPERTY_MESSAGE,
  track, yen, parseYen, bindYenInput
} from './funnel.js?v=6';

import config from './lib/financing-config.json?v=6' with { type: 'json' };
import { compareWithRent } from './lib/financing.js?v=6';

const $ = s => document.querySelector(s);
const nextBtn = $('#fxNext');

/* ============================================================
   Roteiro de etapas
   ============================================================ */
const FLOW = {
  intro:        { next: () => 'q_payment',  label: 'Calcular minha faixa de compra' },
  q_payment:    { next: () => 'q_cities',   label: 'Continuar', validate: vPayment },
  q_cities:     { next: () => 'q_age',      label: 'Continuar', validate: vCities },
  q_age:        { next: () => 'q_work',     label: 'Continuar', validate: vAge },
  q_work:       { next: nextAfterWork,      label: 'Continuar', validate: vWork },
  q_work_years: { next: () => 'q_residency',label: 'Continuar', validate: vWorkYears },
  q_residency:  { next: nextAfterNationality, label: 'Continuar', validate: vNationality },
  q_visa:       { next: () => 'q_composition', label: 'Continuar', validate: vVisa },
  q_composition:{ next: () => 'preliminary', label: 'Ver meu primeiro cenário', validate: vComposition },
  preliminary:  { next: () => 'f_income',   label: 'Completar dados da minha simulação' },
  f_income:     { next: nextAfterIncome,    label: 'Continuar', validate: vIncome },
  f_second:     { next: () => 'f_debts',    label: 'Continuar' },
  f_debts:      { next: () => 'f_down',     label: 'Continuar', validate: vDebts },
  f_down:       { next: () => 'f_timing',   label: 'Continuar', validate: vDown },
  f_timing:     { next: () => 'lead',       label: 'Ver minha simulação completa', validate: vTiming },
  lead:         { next: () => 'result',     label: 'Ver minha simulação', validate: vLead, submit: true },
  result:       { next: () => null,         label: '' }
};

function nextAfterWork() {
  const t = getAnswers().employmentType;
  return (t === 'seishain' || t === 'empreiteira') ? 'q_work_years' : 'q_residency';
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
  if (!a.desiredMonthlyPayment) { showError('errPayment', 'Escolha uma opção para continuar.'); return false; }
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
    $('#prelimBadge').textContent = 'Análise personalizada recomendada';
    $('#prelimBadge').className = 'fx-badge fx-badge--review';
    $('#prelimIntro').textContent = 'Seu caso tem características que precisam ser analisadas individualmente.';
    $('#prelimRows').innerHTML = '';
    $('#prelimProps').innerHTML = (r.notes || []).join(' ');
    $('#prelimCenter').textContent = '—';
    $('#prelimMin').textContent = '—';
    $('#prelimMax').textContent = '—';
    track('preliminary_result_viewed', { status: 'manual_review' });
    return;
  }

  $('#prelimCenter').textContent = yen(r.propertyRange.center);
  $('#prelimMin').textContent = yen(r.propertyRange.min);
  $('#prelimMax').textContent = yen(r.propertyRange.max);

  $('#prelimIntro').textContent =
    `Com uma parcela de aproximadamente ${yen(r.payment.used)}, ` +
    `você pode comprar um imóvel entre ${yen(r.propertyRange.min)} e ${yen(r.propertyRange.max)}.`;

  $('#prelimRows').innerHTML = [
    row('Valor da parcela por mês', yen(r.payment.desired || r.payment.used)),
    row('Tempo para pagar', `${r.term.years} anos (${r.term.months} parcelas)`),
    row('Juros', r.rate.display),
    row('Tipo de financiamento', r.scenarioLabel),
    row('Cidade escolhida', (a.cities || []).join(', ') || '—')
  ].join('');

  if (r.manualReview) {
    $('#prelimBadge').textContent = 'Informações adicionais necessárias';
    $('#prelimBadge').className = 'fx-badge fx-badge--review';
  } else {
    $('#prelimBadge').textContent = 'Simulação calculada';
    $('#prelimBadge').className = 'fx-badge fx-badge--ok';
  }

  $('#prelimProps').innerHTML =
    `${PROPERTY_MESSAGE} ` +
    `Para ver se esse valor também combina com sua renda e com suas dívidas atuais, complete a próxima etapa.`;

  const notes = [...(r.notes || []), ...(r.warnings || [])];
  $('#prelimNotes').innerHTML = notes.map(n => `<div class="fx-note fx-note--warn">${n}</div>`).join('');

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
    $('#resultBadge').textContent = 'Análise personalizada recomendada';
    $('#resultBadge').className = 'fx-badge fx-badge--review';
  }

  if (r.propertyRange) {
    $('#resCenter').textContent = yen(r.propertyRange.center);
    $('#resMin').textContent = yen(r.propertyRange.min);
    $('#resMax').textContent = yen(r.propertyRange.max);
  }

  $('#resPayment').innerHTML = [
    row('Parcela estimada', yen(r.payment.used), 'fx-row--total'),
    row('Tempo para pagar', `${r.term.years} anos`),
    row('Total de parcelas', r.term.months),
    row('Juros', r.rate.display),
    r.payment.desired ? row('Parcela que você deseja', yen(r.payment.desired), 'fx-row--sub') : '',
    r.payment.incomeCapacity != null
      ? row('Estimativa pela renda', yen(r.payment.incomeCapacity), 'fx-row--sub')
      : row('Estimativa pela renda', 'Precisa de validação', 'fx-row--sub')
  ].join('');

  const c = r.costBreakdown;
  $('#resCost').innerHTML = [
    row('Valor estimado do imóvel', yen(c.propertyPrice)),
    row(`Despesas estimadas (${Math.round(r.financing.acquisitionFeeRate * 100)}%)`, yen(c.estimatedFees)),
    row('Custo total estimado', yen(c.totalAcquisitionCost)),
    row('Entrada', yen(c.downPayment)),
    row('Valor financiado', yen(c.financedAmount), 'fx-row--total')
  ].join('');

  $('#resScenario').innerHTML =
    `<p style="margin-bottom:10px"><strong>${r.scenarioLabel}</strong></p>` +
    `<p style="font-size:.94rem;color:var(--ink-soft)">${explain(r, a)}</p>` +
    (r.manualReview
      ? `<div class="fx-note fx-note--warn" style="margin-top:12px">Seu caso possui características que precisam ser analisadas individualmente pela Easy House.</div>`
      : '');

  const notes = [...(r.notes || []), ...(r.warnings || [])];
  $('#resExplain').innerHTML = notes.map(n => `<div class="fx-note">${n}</div>`).join('');

  $('#resMatome').innerHTML = r.matomeToku
    ? `<div class="fx-card">
         <p class="fx-card__label">Suas parcelas atuais</p>
         <p style="font-size:.95rem;color:var(--ink-soft)">${r.matomeToku.message}</p>
         <a class="fx-btn fx-btn--ghost fx-btn--block" style="margin-top:14px" href="/omatome">Quero analisar minhas dívidas junto com a casa</a>
       </div>`
    : '';

  $('#resLegal').textContent = r.disclaimer +
    ' Para esta simulação consideramos despesas equivalentes a aproximadamente ' +
    Math.round(r.financing.acquisitionFeeRate * 100) +
    '% do valor do imóvel. A composição e a possibilidade de financiar essas despesas dependem do imóvel e da instituição financeira.' +
    ` Configuração de taxas versão ${r.configVersion}, vigente desde ${r.configValidFrom}.`;

  $('#btnWhatsApp').href = whatsappLink('result');
  $('#btnWhatsApp').addEventListener('click', () => track('whatsapp_clicked', { from: 'result' }), { once: true });

  // Imóveis: mensagem única, sem listar ou contar o que não podemos confirmar
  const cidades = (a.cities || []).filter(c => c !== 'outra');
  $('#resProps').innerHTML =
    `<div class="fx-card">
       <p class="fx-card__label">Imóveis</p>
       <p style="font-size:.98rem;color:var(--ink);line-height:1.6">${PROPERTY_MESSAGE}</p>
       ${cidades.length ? `<p class="fx-help" style="margin-top:10px">Cidades que você escolheu: ${cidades.join(', ')}.</p>` : ''}
       <p class="fx-help" style="margin-top:10px">
         Leve o seu código no WhatsApp: o corretor já vê a faixa estimada desta simulação e traz opções compatíveis.
       </p>
     </div>`;

  track('simulation_result_viewed', { status: r.status, scenario: r.scenario });
}

/** Explicação em linguagem simples, usando apenas números já calculados. */
function explain(r, a) {
  const trabalho = {
    seishain: 'Como você trabalha como funcionário efetivo',
    empreiteira: a.employmentYears === 'gte3'
      ? 'Como você trabalha por empreiteira há 3 anos ou mais'
      : 'Como você trabalha por empreiteira há menos de 3 anos',
    autonomo: 'Como você trabalha como autônomo',
    empresario: 'Como você é dono de empresa',
    temporario: 'Como você tem contrato temporário',
    outro: 'Pelas informações que você enviou'
  }[a.employmentType] || 'Pelas informações que você enviou';

  let txt = `${trabalho}, utilizamos inicialmente o ${r.scenarioLabel.toLowerCase()} configurado pela Easy House. `;
  txt += `Com sua idade, o prazo usado foi de ${r.term.years} anos. `;

  if (r.payment.basis === 'income') {
    txt += 'A parcela considerada veio da estimativa pela renda, já descontando suas parcelas atuais.';
  } else if (r.payment.incomeCapacity != null) {
    txt += 'A parcela desejada foi comparada com a capacidade estimada após considerar suas parcelas atuais.';
  } else {
    txt += 'O cenário foi calculado a partir da parcela que você deseja pagar.';
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
      row('Aluguel atual', yen(cmp.currentRent)),
      row('Parcela estimada do financiamento', yen(cmp.estimatedPayment)),
      row(cmp.label, (diff >= 0 ? '+' : '−') + yen(Math.abs(diff)), 'fx-row--total')
    ].join('') +
      `<p class="fx-help" style="margin-top:12px">A parcela não inclui imposto imobiliário, seguro, manutenção e outros custos da casa própria.
       A Easy House calcula o custo mensal total quando conhecer o imóvel.</p>`;
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
    nextBtn.textContent = 'Enviando…';
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
        marketingText: 'Aceite de recebimento de novidades e novos imóveis'
      };
      const data = await submitLead(contact, consent);
      // O servidor recalcula com todos os dados; se não vier, calcula aqui.
      getState().full = data.result || (await simulate());
      track('lead_submitted', { persisted: !!data.persisted, eventId: getState().leadEventId });
    } catch (err) {
      // A gravação pode falhar, mas o cálculo não pode ficar desatualizado:
      // recalcula com as respostas da etapa financeira antes de exibir.
      $('#errSubmit').textContent = err.message + ' Você ainda pode ver sua simulação abaixo.';
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
  nextBtn.textContent = FLOW[next].label || 'Continuar';

  if (next === 'preliminary') await renderPreliminary();
  if (next === 'lead') track('lead_form_viewed');
  if (next === 'f_income') adaptIncomeCopy();
}

/** Ajusta a explicação da renda conforme o tipo de trabalho. */
function adaptIncomeCopy() {
  const t = getAnswers().employmentType;
  const tip = $('#incomeTip');
  if (t === 'autonomo' || t === 'empresario') {
    $('#incomeHelp').textContent = 'Informe a renda declarada, não o faturamento total.';
    tip.innerHTML = '<strong>Autônomo ou empresa:</strong> use o valor declarado no 確定申告. ' +
      'Faturamento é o total que entrou; despesas são os custos do trabalho; renda declarada é o que sobra depois das despesas — é esse número que o banco analisa.';
  } else {
    $('#incomeHelp').textContent = 'Se possível, use o valor do seu último 源泉徴収票.';
    tip.innerHTML = '<strong>Dica:</strong> o 源泉徴収票 é o comprovante que a empresa entrega no fim do ano. ' +
      'Use o valor bruto anual, incluindo bônus.';
  }
}

/* ============================================================
   Teste A/B da headline
   ============================================================ */
function applyVariant() {
  if (getState().variant === 'B') {
    $('#fxHeadline').textContent = 'Veja quais casas podem caber na parcela que você deseja pagar';
    $('#fxSubline').textContent = 'Responda algumas perguntas simples e receba uma estimativa da faixa de imóvel compatível com o seu perfil.';
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
nextBtn.textContent = FLOW[passoInicial]?.label || 'Continuar';

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
  const t = getAnswers().employmentType;
  $('#qWorkYears').textContent = t === 'seishain'
    ? 'Há quanto tempo você trabalha na empresa atual?'
    : 'Há quanto tempo você trabalha por empreiteira?';
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
  const t = getAnswers().employmentType;
  $('#qWorkYears').textContent = t === 'seishain'
    ? 'Há quanto tempo você trabalha na empresa atual?'
    : 'Há quanto tempo você trabalha por empreiteira?';
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
[['#prelimWhats', 'preliminary'], ['#leadWhats', 'lead']].forEach(([sel, origem]) => {
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
