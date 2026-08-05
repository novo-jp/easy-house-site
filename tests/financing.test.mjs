/**
 * Testes do motor financeiro.
 * Rodar: node --test tests/
 * Sem dependências externas — usa o test runner nativo do Node.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  FLAT35_ABSOLUTE_MAX_TERM_YEARS,
  calculateMonthlyPayment,
  calculatePrincipalFromPayment,
  calculateTerm,
  calculateMaximumHousingPayment,
  calculateAcquisitionCost,
  calculateMaximumPropertyPrice,
  selectFinancingScenario,
  runSimulation,
  compareWithRent,
  resolveRepaymentRatio,
  FinancingInputError
} from '../lib/financing.js';

const config = JSON.parse(readFileSync(new URL('../lib/financing-config.json', import.meta.url)));

/** Diferença aceitável por arredondamento. */
function approx(actual, expected, tolerance = 5) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `esperado ~${expected}, recebido ${actual} (diferença ${Math.abs(actual - expected).toFixed(2)})`
  );
}

describe('Configuração vigente', () => {
  test('Flat 35 usa 2,9% ao ano', () => {
    assert.equal(config.flat35.referenceAnnualRate, 0.029);
    assert.ok(config.flat35.rateDisplayLabel.includes('2,9%'));
  });

  test('Flat 35 está configurado com 35 anos', () => {
    assert.equal(config.flat35.maximumTermYears, 35);
  });

  test('o rótulo do Flat 35 nunca menciona 50 anos', () => {
    const texto = JSON.stringify(config.flat35);
    assert.ok(!texto.includes('50'), 'nada em flat35 pode citar 50');
  });
});

describe('Parcela mensal', () => {
  test('Teste 1 — ¥27.500.000 a 2,5% em 35 anos ≈ ¥98.311', () => {
    approx(calculateMonthlyPayment(27_500_000, 0.025, 35), 98_311);
  });

  test('Teste 2 — ¥27.500.000 a 1,4% em 50 anos ≈ ¥63.757', () => {
    approx(calculateMonthlyPayment(27_500_000, 0.014, 50), 63_757);
  });

  test('taxa zero divide o principal pelo número de parcelas', () => {
    assert.equal(calculateMonthlyPayment(12_000_000, 0, 10), 100_000);
  });

  test('prazo zero é rejeitado', () => {
    assert.throws(() => calculateMonthlyPayment(10_000_000, 0.02, 0), FinancingInputError);
  });

  test('principal negativo é rejeitado', () => {
    assert.throws(() => calculateMonthlyPayment(-1, 0.02, 30), FinancingInputError);
  });

  test('ida e volta: parcela → principal → parcela', () => {
    const principal = 30_000_000;
    const payment = calculateMonthlyPayment(principal, 0.019, 32);
    approx(calculatePrincipalFromPayment(payment, 0.019, 32), principal, 1);
  });
});

describe('Prazo pela idade', () => {
  test('Teste 3 — 45 anos, cenário bancário (máx 50, quitação aos 80) = 35 anos', () => {
    const t = calculateTerm({ age: 45, maximumTermYears: 50, payoffAgeLimit: 80 });
    assert.equal(t.years, 35);
    assert.equal(t.limitedBy, 'age');
  });

  test('Teste 4 — 50 anos, Flat 35 (máx 35, quitação aos 80) = 30 anos', () => {
    const t = calculateTerm({ age: 50, maximumTermYears: 35, payoffAgeLimit: 80 });
    assert.equal(t.years, 30);
  });

  test('30 anos no cenário bancário usa o máximo do produto (50)', () => {
    const t = calculateTerm({ age: 30, maximumTermYears: 50, payoffAgeLimit: 80 });
    assert.equal(t.years, 50);
    assert.equal(t.limitedBy, 'product');
  });

  test('40 anos → 40; 55 anos → 25 (cenário bancário)', () => {
    assert.equal(calculateTerm({ age: 40, maximumTermYears: 50, payoffAgeLimit: 80 }).years, 40);
    assert.equal(calculateTerm({ age: 55, maximumTermYears: 50, payoffAgeLimit: 80 }).years, 25);
  });

  test('Flat 35 não recebe prazo de 50 anos', () => {
    const t = calculateTerm({ age: 25, maximumTermYears: config.flat35.maximumTermYears, payoffAgeLimit: 80 });
    assert.equal(t.years, 35);
  });

  test('Flat 35 continua limitado a 35 anos mesmo se a configuração for editada errado', () => {
    const errada = structuredClone(config);
    errada.flat35.maximumTermYears = 50;             // edição indevida
    const r = runSimulation(
      { age: 25, employmentType: 'autonomo', employmentYears: 'gte3', residency: 'permanent_resident', desiredMonthlyPayment: 90_000 },
      errada
    );
    assert.equal(r.scenario, 'flat35');
    assert.equal(r.term.years, FLAT35_ABSOLUTE_MAX_TERM_YEARS, 'o teto de 35 anos precisa valer no motor, não só na configuração');
    assert.ok(r.term.years < 50);
  });

  test('prazo abaixo do mínimo é sinalizado', () => {
    const t = calculateTerm({ age: 70, maximumTermYears: 35, payoffAgeLimit: 80, minimumTermYears: 15 });
    assert.equal(t.years, 10);
    assert.equal(t.belowMinimum, true);
  });

  test('idade inválida é rejeitada', () => {
    assert.throws(() => calculateTerm({ age: 0, maximumTermYears: 35, payoffAgeLimit: 80 }), FinancingInputError);
    assert.throws(() => calculateTerm({ age: 150, maximumTermYears: 35, payoffAgeLimit: 80 }), FinancingInputError);
  });
});

describe('Capacidade pela renda', () => {
  test('Teste 6 — renda ¥3.600.000, limite 30%, dívidas ¥30.000/mês → ¥60.000/mês', () => {
    const capacity = calculateMaximumHousingPayment({
      annualIncome: 3_600_000,
      existingMonthlyDebtPayments: 30_000,
      maximumRepaymentRatio: 0.30
    });
    approx(capacity, 60_000, 1);
  });

  test('dívida acima do limite resulta em capacidade zero, não negativa', () => {
    const capacity = calculateMaximumHousingPayment({
      annualIncome: 3_000_000,
      existingMonthlyDebtPayments: 200_000,
      maximumRepaymentRatio: 0.30
    });
    assert.equal(capacity, 0);
  });

  test('faixa de renda define o percentual (30% abaixo de ¥4M, 35% acima)', () => {
    assert.equal(resolveRepaymentRatio(3_900_000, config.flat35), 0.30);
    assert.equal(resolveRepaymentRatio(4_000_000, config.flat35), 0.35);
  });

  test('regra não configurada devolve null em vez de inventar', () => {
    assert.equal(resolveRepaymentRatio(5_000_000, config.bank), null);
  });

  test('renda negativa é rejeitada', () => {
    assert.throws(
      () => calculateMaximumHousingPayment({ annualIncome: -1, maximumRepaymentRatio: 0.3 }),
      FinancingInputError
    );
  });
});

describe('Custo de aquisição', () => {
  test('Teste 7 — imóvel ¥25.000.000 + 10%, sem entrada → total ¥27.500.000', () => {
    const c = calculateAcquisitionCost({ propertyPrice: 25_000_000, acquisitionFeeRate: 0.10, downPayment: 0 });
    assert.equal(c.totalAcquisitionCost, 27_500_000);
    assert.equal(c.financedAmount, 27_500_000);
  });

  test('Teste 8 — mesmo imóvel com entrada de ¥1.500.000 → financia ¥26.000.000', () => {
    const c = calculateAcquisitionCost({ propertyPrice: 25_000_000, acquisitionFeeRate: 0.10, downPayment: 1_500_000 });
    assert.equal(c.financedAmount, 26_000_000);
  });

  test('entrada maior que o custo não gera valor financiado negativo', () => {
    const c = calculateAcquisitionCost({ propertyPrice: 10_000_000, acquisitionFeeRate: 0.10, downPayment: 20_000_000 });
    assert.equal(c.financedAmount, 0);
  });

  test('preço máximo é o inverso do custo total', () => {
    const price = calculateMaximumPropertyPrice({
      maximumFinancingAmount: 27_500_000,
      downPayment: 0,
      acquisitionFeeRate: 0.10
    });
    approx(price, 25_000_000, 1);
  });
});

describe('Seleção do cenário', () => {
  test('funcionário efetivo → cenário bancário', () => {
    const s = selectFinancingScenario(
      { employmentType: 'seishain', employmentYears: 'gte3', residency: 'permanent_resident' },
      config
    );
    assert.equal(s.scenario, 'bank');
    assert.equal(s.manualReview, false);
  });

  test('empreiteira com 3 anos ou mais → cenário bancário', () => {
    const s = selectFinancingScenario(
      { employmentType: 'empreiteira', employmentYears: 'gte3', residency: 'japanese' },
      config
    );
    assert.equal(s.scenario, 'bank');
  });

  test('empreiteira com menos de 3 anos → Flat 35', () => {
    const s = selectFinancingScenario(
      { employmentType: 'empreiteira', employmentYears: '1to3', residency: 'permanent_resident' },
      config
    );
    assert.equal(s.scenario, 'flat35');
  });

  test('Teste 5 — autônomo estrangeiro sem residência permanente → análise manual', () => {
    const s = selectFinancingScenario(
      { employmentType: 'autonomo', employmentYears: 'gte3', residency: 'work_visa' },
      config
    );
    assert.equal(s.scenario, 'flat35');
    assert.equal(s.manualReview, true, 'precisa exigir análise manual');
    assert.ok(s.reasons.includes('residencia_requer_verificacao'));
  });

  test('dono de empresa e contrato temporário caem em análise manual', () => {
    for (const employmentType of ['empresario', 'temporario', 'outro']) {
      const s = selectFinancingScenario({ employmentType, employmentYears: 'gte3', residency: 'japanese' }, config);
      assert.equal(s.scenario, 'manual_review', employmentType);
      assert.equal(s.manualReview, true);
    }
  });
});

describe('Simulação completa', () => {
  const base = {
    age: 35,
    employmentType: 'seishain',
    employmentYears: 'gte3',
    residency: 'permanent_resident',
    desiredMonthlyPayment: 90_000
  };

  test('produz faixa de imóvel, e não um valor único', () => {
    const r = runSimulation(base, config);
    assert.equal(r.status, 'calculated');
    assert.ok(r.propertyRange.min < r.propertyRange.center);
    assert.ok(r.propertyRange.center < r.propertyRange.max);
  });

  test('nunca devolve linguagem de aprovação', () => {
    const r = runSimulation(base, config);
    const texto = JSON.stringify(r).toLowerCase();
    for (const proibido of ['aprovado', 'aprovação garantida', 'crédito aprovado', 'garantida']) {
      assert.ok(!texto.includes(proibido), `resultado não pode conter "${proibido}"`);
    }
    assert.ok(r.disclaimer.includes('Não representa aprovação'));
  });

  test('carrega a versão da configuração e do motor', () => {
    const r = runSimulation(base, config);
    assert.equal(r.configVersion, config.version);
    assert.ok(r.engineVersion);
  });

  test('dívidas atuais reduzem a capacidade', () => {
    const semDivida = runSimulation({ ...base, annualIncome: 4_500_000 }, config);
    const comDivida = runSimulation({ ...base, annualIncome: 4_500_000, monthlyDebtPayments: 40_000 }, config);
    // cenário bancário ainda não tem regra de comprometimento configurada
    assert.equal(semDivida.payment.incomeCapacity, null);
    // no Flat 35 a regra existe e a dívida precisa pesar
    const flatBase = { ...base, employmentType: 'autonomo', residency: 'permanent_resident', annualIncome: 4_500_000 };
    const flatSem = runSimulation(flatBase, config);
    const flatCom = runSimulation({ ...flatBase, monthlyDebtPayments: 40_000 }, config);
    assert.ok(flatCom.payment.incomeCapacity < flatSem.payment.incomeCapacity);
    assert.equal(flatSem.payment.incomeCapacity - flatCom.payment.incomeCapacity, 40_000);
  });

  test('usa o menor valor entre parcela desejada e capacidade pela renda', () => {
    const r = runSimulation(
      {
        ...base,
        employmentType: 'autonomo',
        residency: 'permanent_resident',
        annualIncome: 3_600_000,
        monthlyDebtPayments: 30_000,
        desiredMonthlyPayment: 120_000
      },
      config
    );
    assert.equal(r.payment.incomeCapacity, 60_000);
    assert.equal(r.payment.used, 60_000, 'deve usar a capacidade, não o desejo');
    assert.equal(r.payment.basis, 'income');
    assert.ok(r.notes.some(n => n.includes('acima do cenário calculado')));
  });

  test('cenário bancário sem regra configurada avisa que precisa de validação', () => {
    const r = runSimulation({ ...base, annualIncome: 5_000_000 }, config);
    assert.ok(r.warnings.some(w => w.includes('não foram configuradas')));
  });

  test('Flat 35 não recebe prazo de 50 anos', () => {
    const r = runSimulation({ ...base, employmentType: 'autonomo', residency: 'permanent_resident', age: 25 }, config);
    assert.equal(r.scenario, 'flat35');
    assert.ok(r.term.years <= 35);
  });

  test('capacidade zerada pelas dívidas encaminha para análise', () => {
    const r = runSimulation(
      {
        ...base,
        employmentType: 'autonomo',
        residency: 'permanent_resident',
        annualIncome: 3_000_000,
        monthlyDebtPayments: 90_000
      },
      config
    );
    assert.equal(r.status, 'manual_review');
    assert.equal(r.incomeCapacity, 0);
  });

  test('segunda renda entra pelo percentual configurado e é declarada', () => {
    const r = runSimulation(
      {
        ...base,
        employmentType: 'autonomo',
        residency: 'permanent_resident',
        annualIncome: 3_000_000,
        secondApplicant: { annualIncome: 2_000_000, age: 33 }
      },
      config
    );
    assert.equal(r.combinedAnnualIncome, 3_000_000 + 2_000_000 * config.incomeCombination.secondApplicantIncomeRate);
    assert.ok(r.notes.some(n => n.includes('% da segunda renda')));
  });

  test('dívidas ativam o bloco de análise conjunta, sem prometer economia', () => {
    const r = runSimulation({ ...base, monthlyDebtPayments: 35_000 }, config);
    assert.ok(r.matomeToku);
    assert.equal(r.matomeToku.manualReviewRequired, true);
    assert.ok(!JSON.stringify(r.matomeToku).includes('economia'));
  });

  test('imóvel específico devolve parcela e enquadramento na faixa', () => {
    const r = runSimulation({ ...base, propertyPrice: 29_800_000 }, config);
    assert.ok(r.specificProperty.estimatedMonthlyPayment > 0);
    approx(r.specificProperty.totalAcquisitionCost, 32_780_000, 1);
    assert.equal(typeof r.specificProperty.withinRange, 'boolean');
  });

  test('idade que não permite prazo encaminha para análise manual', () => {
    const r = runSimulation({ ...base, age: 79 }, config);
    assert.equal(r.status, 'manual_review');
  });

  test('sem parcela desejada e sem renda é rejeitado', () => {
    assert.throws(() => runSimulation({ age: 35, employmentType: 'seishain', employmentYears: 'gte3', residency: 'japanese' }, config), FinancingInputError);
  });

  test('mudar a configuração muda o resultado', () => {
    const alt = structuredClone(config);
    alt.version = 2;
    alt.bank.referenceAnnualRate = 0.02;
    const a = runSimulation(base, config);
    const b = runSimulation(base, alt);
    assert.notEqual(a.propertyRange.center, b.propertyRange.center);
    assert.equal(b.configVersion, 2);
  });
});

describe('Comparação com aluguel', () => {
  test('sem os outros custos, não chama a diferença de custo total', () => {
    const c = compareWithRent({ currentRent: 85_000, estimatedPayment: 79_500 });
    assert.equal(c.hasCompleteCosts, false);
    assert.ok(c.label.includes('parcela estimada'));
    assert.ok(!c.label.toLowerCase().includes('economia'));
  });

  test('com os outros custos, soma o custo mensal total', () => {
    const c = compareWithRent({ currentRent: 85_000, estimatedPayment: 79_500, otherMonthlyCosts: 11_000 });
    assert.equal(c.totalEstimatedMonthlyCost, 90_500);
    assert.equal(c.difference, 5_500);
    assert.equal(c.hasCompleteCosts, true);
  });
});
