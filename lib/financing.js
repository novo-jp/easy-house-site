/**
 * EASY HOUSE — Motor financeiro
 *
 * Regras:
 * - Determinístico e auditável. Sem IA, sem aleatoriedade, sem I/O.
 * - Independente da interface: não conhece DOM, framework nem banco.
 * - Toda regra vem da configuração recebida por parâmetro (versionada).
 * - Nenhuma função aqui decide aprovação de crédito. Só produz estimativas.
 *
 * Usado tanto no browser (ES module) quanto no servidor (Netlify Function)
 * e nos testes (node --test).
 */

export const ENGINE_VERSION = '1.1.0';

/**
 * Teto absoluto do Flat 35, em anos.
 *
 * O produto é de 35 anos. Existe no mercado japonês um Flat 50, que é outro
 * produto e não é oferecido aqui. Esta constante impede que uma configuração
 * editada por engano faça o simulador exibir Flat 35 com prazo maior.
 */
export const FLAT35_ABSOLUTE_MAX_TERM_YEARS = 35;

/* ============================================================
   Erros
   ============================================================ */
export class FinancingInputError extends Error {
  constructor(message, field) {
    super(message);
    this.name = 'FinancingInputError';
    this.field = field;
  }
}

/* ============================================================
   Cálculo da parcela (sistema francês / parcelas constantes)
   ============================================================ */

/**
 * Parcela mensal para um principal, taxa anual e prazo em anos.
 */
export function calculateMonthlyPayment(principal, annualRate, termYears) {
  assertFiniteNonNegative(principal, 'principal');
  assertFiniteNonNegative(annualRate, 'annualRate');

  const months = Math.round(termYears * 12);
  if (!Number.isFinite(months) || months <= 0) {
    throw new FinancingInputError('Prazo de financiamento inválido', 'termYears');
  }

  const monthlyRate = annualRate / 12;
  if (monthlyRate === 0) return principal / months;

  const growth = Math.pow(1 + monthlyRate, months);
  return (principal * monthlyRate * growth) / (growth - 1);
}

/**
 * Principal aproximado que corresponde a uma parcela mensal.
 */
export function calculatePrincipalFromPayment(monthlyPayment, annualRate, termYears) {
  assertFiniteNonNegative(monthlyPayment, 'monthlyPayment');
  assertFiniteNonNegative(annualRate, 'annualRate');

  const months = Math.round(termYears * 12);
  if (!Number.isFinite(months) || months <= 0) {
    throw new FinancingInputError('Prazo de financiamento inválido', 'termYears');
  }

  const monthlyRate = annualRate / 12;
  if (monthlyRate === 0) return monthlyPayment * months;

  return (monthlyPayment * (1 - Math.pow(1 + monthlyRate, -months))) / monthlyRate;
}

/* ============================================================
   Prazo em função da idade
   ============================================================ */

/**
 * Prazo permitido: limitado pelo máximo do produto e pela idade de quitação.
 * Retorna { years, limitedBy, belowMinimum }.
 */
export function calculateTerm({ age, maximumTermYears, payoffAgeLimit, minimumTermYears = 0 }) {
  if (!Number.isFinite(age) || age <= 0 || age > 120) {
    throw new FinancingInputError('Idade inválida', 'age');
  }

  const byAge = Math.floor(payoffAgeLimit - age);
  const years = Math.max(0, Math.min(maximumTermYears, byAge));

  return {
    years,
    limitedBy: byAge < maximumTermYears ? 'age' : 'product',
    belowMinimum: years < minimumTermYears
  };
}

/* ============================================================
   Capacidade a partir da renda
   ============================================================ */

/**
 * Parcela mensal máxima destinada à moradia, considerando o limite de
 * comprometimento e as parcelas de dívidas já existentes.
 */
export function calculateMaximumHousingPayment({
  annualIncome,
  existingMonthlyDebtPayments = 0,
  maximumRepaymentRatio
}) {
  assertFiniteNonNegative(annualIncome, 'annualIncome');
  assertFiniteNonNegative(existingMonthlyDebtPayments, 'existingMonthlyDebtPayments');

  if (!Number.isFinite(maximumRepaymentRatio) || maximumRepaymentRatio <= 0 || maximumRepaymentRatio > 1) {
    throw new FinancingInputError('Percentual de comprometimento inválido', 'maximumRepaymentRatio');
  }

  const annualRepaymentLimit = annualIncome * maximumRepaymentRatio;
  const annualExistingPayments = existingMonthlyDebtPayments * 12;
  const annualHousingCapacity = Math.max(0, annualRepaymentLimit - annualExistingPayments);

  return annualHousingCapacity / 12;
}

/**
 * Percentual de comprometimento aplicável conforme a faixa de renda.
 */
export function resolveRepaymentRatio(annualIncome, product) {
  if (product.lowerIncomeRepaymentRatio == null || product.higherIncomeRepaymentRatio == null) {
    return null; // regra ainda não configurada — não inventar
  }
  return annualIncome >= product.incomeThreshold
    ? product.higherIncomeRepaymentRatio
    : product.lowerIncomeRepaymentRatio;
}

/* ============================================================
   Custo de aquisição
   ============================================================ */

export function calculateAcquisitionCost({ propertyPrice, acquisitionFeeRate, downPayment = 0 }) {
  assertFiniteNonNegative(propertyPrice, 'propertyPrice');
  assertFiniteNonNegative(downPayment, 'downPayment');

  const estimatedFees = propertyPrice * acquisitionFeeRate;
  const totalAcquisitionCost = propertyPrice + estimatedFees;
  const financedAmount = Math.max(0, totalAcquisitionCost - downPayment);

  return { propertyPrice, estimatedFees, totalAcquisitionCost, downPayment, financedAmount };
}

/**
 * Preço máximo de imóvel compatível com um valor financiável.
 */
export function calculateMaximumPropertyPrice({ maximumFinancingAmount, downPayment = 0, acquisitionFeeRate }) {
  assertFiniteNonNegative(maximumFinancingAmount, 'maximumFinancingAmount');
  assertFiniteNonNegative(downPayment, 'downPayment');
  return (maximumFinancingAmount + downPayment) / (1 + acquisitionFeeRate);
}

/* ============================================================
   Seleção do cenário
   ============================================================ */

/**
 * Escolhe o cenário de simulação a partir do perfil.
 * Nunca representa escolha de banco nem aprovação.
 *
 * profile: {
 *   employmentType: 'seishain' | 'empreiteira' | 'autonomo' | 'empresario' | 'temporario' | 'outro',
 *   employmentYears: 'lt1' | '1to3' | 'gte3',
 *   residency: 'japanese' | 'permanent_resident' | ... ,
 *   age: number
 * }
 */
export function selectFinancingScenario(profile, config) {
  const reasons = [];
  const { employmentType, employmentYears, residency } = profile;

  const stableEmployee =
    employmentType === 'seishain' ||
    (employmentType === 'empreiteira' && employmentYears === 'gte3');

  const flat35Profile =
    employmentType === 'autonomo' ||
    (employmentType === 'empreiteira' && employmentYears !== 'gte3');

  const unmapped =
    employmentType === 'empresario' ||
    employmentType === 'temporario' ||
    employmentType === 'outro' ||
    !employmentType;

  // Residência
  const residencyAccepted = config.flat35.residencyStatusesAccepted.includes(residency);
  const residencyNeedsReview = !residencyAccepted;

  let scenario;
  let manualReview = false;

  if (unmapped) {
    scenario = 'manual_review';
    manualReview = true;
    reasons.push('perfil_de_trabalho_nao_mapeado');
  } else if (flat35Profile) {
    scenario = 'flat35';
    reasons.push(employmentType === 'autonomo' ? 'autonomo' : 'empreiteira_menos_de_3_anos');
    if (residencyNeedsReview) {
      manualReview = true;
      reasons.push('residencia_requer_verificacao');
    }
  } else if (stableEmployee) {
    scenario = 'bank';
    reasons.push(employmentType === 'seishain' ? 'funcionario_efetivo' : 'empreiteira_3_anos_ou_mais');
    if (residencyNeedsReview) {
      manualReview = true;
      reasons.push('residencia_requer_verificacao');
    }
  } else {
    scenario = 'manual_review';
    manualReview = true;
    reasons.push('dados_insuficientes');
  }

  return { scenario, manualReview, reasons, residencyAccepted };
}

/* ============================================================
   Simulação completa
   ============================================================ */

/**
 * Executa a simulação. Sempre devolve estimativas com faixa, nunca aprovação.
 *
 * input: {
 *   desiredMonthlyPayment?: number,
 *   age: number,
 *   employmentType, employmentYears, residency,
 *   annualIncome?: number,
 *   secondApplicant?: { annualIncome: number, age?: number },
 *   monthlyDebtPayments?: number,
 *   downPayment?: number,
 *   propertyPrice?: number   // modo imóvel específico
 * }
 */
export function runSimulation(input, config) {
  const notes = [];
  const warnings = [];

  const selection = selectFinancingScenario(input, config);
  const productKey = selection.scenario === 'flat35' ? 'flat35' : 'bank';
  const product = config[productKey];

  // --- Prazo ---
  // O Flat 35 é limitado a 35 anos aqui, e não apenas na configuração:
  // assim nenhuma edição indevida faz o produto aparecer com prazo maior.
  const productMaxTerm = productKey === 'flat35'
    ? Math.min(product.maximumTermYears, FLAT35_ABSOLUTE_MAX_TERM_YEARS)
    : product.maximumTermYears;

  const term = calculateTerm({
    age: input.age,
    maximumTermYears: productMaxTerm,
    payoffAgeLimit: product.payoffAgeLimit,
    minimumTermYears: product.minimumTermYears || 0
  });

  if (term.years <= 0) {
    return {
      engineVersion: ENGINE_VERSION,
      configVersion: config.version,
      status: 'manual_review',
      scenario: selection.scenario,
      manualReview: true,
      reasons: [...selection.reasons, 'prazo_indisponivel_para_a_idade'],
      notes: ['Não foi possível estimar um prazo para esta idade dentro das regras configuradas.'],
      warnings
    };
  }

  if (term.belowMinimum) {
    warnings.push(
      `O prazo estimado (${term.years} anos) está abaixo do mínimo configurado para esta modalidade. O caso precisa de análise personalizada.`
    );
  }

  // --- Capacidade pela renda ---
  let incomeCapacity = null;
  let repaymentRatio = null;
  let combinedIncome = null;

  if (Number.isFinite(input.annualIncome) && input.annualIncome > 0) {
    combinedIncome = input.annualIncome;

    if (input.secondApplicant && Number.isFinite(input.secondApplicant.annualIncome)) {
      const rate = config.incomeCombination.secondApplicantIncomeRate;
      combinedIncome += input.secondApplicant.annualIncome * rate;
      notes.push(
        `Esta simulação considerou ${Math.round(rate * 100)}% da segunda renda. A instituição financeira poderá utilizar outro percentual após analisar os documentos.`
      );
    }

    repaymentRatio = resolveRepaymentRatio(combinedIncome, product);

    if (repaymentRatio != null) {
      incomeCapacity = calculateMaximumHousingPayment({
        annualIncome: combinedIncome,
        existingMonthlyDebtPayments: input.monthlyDebtPayments || 0,
        maximumRepaymentRatio: repaymentRatio
      });
    } else {
      warnings.push(
        'As regras de comprometimento de renda desta modalidade ainda não foram configuradas pela Easy House. A capacidade pela renda precisa de validação.'
      );
    }
  }

  // --- Parcela considerada ---
  const desired = Number.isFinite(input.desiredMonthlyPayment) ? input.desiredMonthlyPayment : null;
  let monthlyPaymentUsed;
  let paymentBasis;

  if (desired != null && incomeCapacity != null) {
    monthlyPaymentUsed = Math.min(desired, incomeCapacity);
    paymentBasis = monthlyPaymentUsed === desired ? 'desired' : 'income';
    if (desired > incomeCapacity) {
      notes.push(
        'A parcela que você deseja pagar está acima do cenário calculado com base na renda e nas parcelas atuais. Por segurança, utilizamos o menor valor na simulação.'
      );
    }
  } else if (incomeCapacity != null) {
    monthlyPaymentUsed = incomeCapacity;
    paymentBasis = 'income';
  } else if (desired != null) {
    monthlyPaymentUsed = desired;
    paymentBasis = 'desired';
    notes.push(
      'Calculamos isso só com o valor da parcela que você quer pagar. Ainda não sabemos se isso cabe na sua renda e nas suas dívidas atuais.'
    );
  } else {
    throw new FinancingInputError('É necessário informar a parcela desejada ou a renda anual', 'desiredMonthlyPayment');
  }

  if (monthlyPaymentUsed <= 0) {
    return {
      engineVersion: ENGINE_VERSION,
      configVersion: config.version,
      status: 'manual_review',
      scenario: selection.scenario,
      manualReview: true,
      reasons: [...selection.reasons, 'capacidade_estimada_zero'],
      notes: [
        'Com as parcelas atuais informadas, o cenário calculado não deixa margem para a parcela da casa. Vale conversar sobre organizar as dívidas antes.'
      ],
      warnings,
      incomeCapacity: 0
    };
  }

  // --- Valor financiável e faixa de imóvel ---
  const rate = product.referenceAnnualRate;
  const maxFinancing = calculatePrincipalFromPayment(monthlyPaymentUsed, rate, term.years);
  const downPayment = input.downPayment || 0;

  const centerPropertyPrice = calculateMaximumPropertyPrice({
    maximumFinancingAmount: maxFinancing,
    downPayment,
    acquisitionFeeRate: config.acquisitionFeeRate
  });

  const margin = config.propertyRangeMargin;
  const range = {
    min: roundDown(centerPropertyPrice * (1 - margin), 100000),
    center: roundDown(centerPropertyPrice, 100000),
    max: roundDown(centerPropertyPrice * (1 + margin), 100000)
  };

  const cost = calculateAcquisitionCost({
    propertyPrice: range.center,
    acquisitionFeeRate: config.acquisitionFeeRate,
    downPayment
  });

  // --- Modo imóvel específico ---
  let specificProperty = null;
  if (Number.isFinite(input.propertyPrice) && input.propertyPrice > 0) {
    const c = calculateAcquisitionCost({
      propertyPrice: input.propertyPrice,
      acquisitionFeeRate: config.acquisitionFeeRate,
      downPayment
    });
    const payment = calculateMonthlyPayment(c.financedAmount, rate, term.years);
    specificProperty = {
      ...c,
      estimatedMonthlyPayment: Math.round(payment),
      withinRange: c.propertyPrice <= range.max,
      slightlyAbove: c.propertyPrice > range.max && c.propertyPrice <= range.max * 1.10
    };
  }

  // --- Dívidas / まとめトク ---
  const debt = input.monthlyDebtPayments || 0;
  const matome = debt > 0 && config.matomeToku.enabled
    ? {
        eligibleForReview: true,
        manualReviewRequired: config.matomeToku.manualReviewRequired,
        maximumRefinanceAmount: config.matomeToku.maximumRefinanceAmount,
        message:
          'Você informou parcelas atuais. Dependendo da composição das dívidas e da análise da instituição, pode existir a possibilidade de reunir alguns empréstimos ao financiamento da casa. Isso precisa ser analisado individualmente.'
      }
    : null;

  const status = selection.manualReview || term.belowMinimum ? 'manual_review' : 'calculated';

  return {
    engineVersion: ENGINE_VERSION,
    configVersion: config.version,
    configValidFrom: config.validFrom,
    status,
    scenario: selection.scenario,
    scenarioLabel: product.label,
    manualReview: selection.manualReview || term.belowMinimum,
    reasons: selection.reasons,

    term: { years: term.years, months: term.years * 12, limitedBy: term.limitedBy },
    rate: { annual: rate, display: product.rateDisplayLabel },

    payment: {
      desired,
      incomeCapacity: incomeCapacity != null ? Math.round(incomeCapacity) : null,
      used: Math.round(monthlyPaymentUsed),
      basis: paymentBasis,
      repaymentRatio
    },

    financing: {
      maximumAmount: roundDown(maxFinancing, 10000),
      downPayment,
      acquisitionFeeRate: config.acquisitionFeeRate
    },

    propertyRange: range,
    costBreakdown: {
      propertyPrice: cost.propertyPrice,
      estimatedFees: Math.round(cost.estimatedFees),
      totalAcquisitionCost: Math.round(cost.totalAcquisitionCost),
      downPayment: cost.downPayment,
      financedAmount: Math.round(cost.financedAmount)
    },

    specificProperty,
    matomeToku: matome,
    combinedAnnualIncome: combinedIncome,
    notes,
    warnings,
    disclaimer:
      'Simulação inicial de referência. Não representa aprovação de financiamento. Taxa, prazo, limite e enquadramento dependem da análise da instituição financeira.'
  };
}

/* ============================================================
   Comparação com aluguel
   ============================================================ */

export function compareWithRent({ currentRent, estimatedPayment, otherMonthlyCosts = 0 }) {
  assertFiniteNonNegative(currentRent, 'currentRent');
  assertFiniteNonNegative(estimatedPayment, 'estimatedPayment');
  assertFiniteNonNegative(otherMonthlyCosts, 'otherMonthlyCosts');

  const totalEstimatedMonthlyCost = estimatedPayment + otherMonthlyCosts;
  return {
    currentRent,
    estimatedPayment,
    otherMonthlyCosts,
    totalEstimatedMonthlyCost,
    difference: totalEstimatedMonthlyCost - currentRent,
    hasCompleteCosts: otherMonthlyCosts > 0,
    label:
      otherMonthlyCosts > 0
        ? 'Diferença entre seu aluguel atual e o custo mensal total estimado'
        : 'Diferença entre seu aluguel atual e a parcela estimada'
  };
}

/* ============================================================
   Utilidades
   ============================================================ */

function assertFiniteNonNegative(value, field) {
  if (!Number.isFinite(value) || value < 0) {
    throw new FinancingInputError(`Valor inválido para ${field}`, field);
  }
}

function roundDown(value, step) {
  return Math.floor(value / step) * step;
}

export function formatYen(value) {
  return '¥' + Math.round(value).toLocaleString('ja-JP');
}
