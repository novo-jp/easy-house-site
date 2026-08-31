/**
 * Testes do dicionário de idiomas.
 * Rodar: node --test tests/
 *
 * O ponto principal é o terceiro teste. As frases que o motor devolve prontas
 * são traduzidas por texto exato, e isso quebra em silêncio: basta alguém mudar
 * uma vírgula em `lib/financing.js` para a frase voltar a sair em português na
 * página em espanhol, sem erro nenhum no console. O teste roda cenários reais
 * do motor, junta tudo que ele produz como texto e falha se aparecer qualquer
 * frase que o dicionário não conheça.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { runSimulation, compareWithRent } from '../lib/financing.js';
import { t, _interno } from '../i18n.js';

const config = JSON.parse(readFileSync(new URL('../lib/financing-config.json', import.meta.url)));
const { DICT, MOTOR_EXATO, MOTOR_PADRAO, SERVIDOR_EXATO } = _interno;

/** Mesma resolução de `tm()`, sem depender do `document`. */
function temTraducao(frase) {
  if (MOTOR_EXATO[frase] || SERVIDOR_EXATO[frase]) return true;
  return MOTOR_PADRAO.some(p => p.re.test(frase));
}

describe('dicionário', () => {
  test('português e espanhol têm exatamente as mesmas chaves', () => {
    const pt = Object.keys(DICT['pt-BR']).sort();
    const es = Object.keys(DICT.es).sort();
    assert.deepEqual(es, pt);
  });

  test('nenhum texto ficou vazio', () => {
    for (const [lang, tabela] of Object.entries(DICT)) {
      for (const [chave, texto] of Object.entries(tabela)) {
        assert.ok(texto && texto.trim().length > 0, `${lang}.${chave} vazio`);
      }
    }
  });

  test('as duas línguas usam as mesmas variáveis em cada frase', () => {
    const vars = s => (s.match(/\{(\w+)\}/g) || []).sort().join(',');
    for (const chave of Object.keys(DICT['pt-BR'])) {
      assert.equal(
        vars(DICT.es[chave]), vars(DICT['pt-BR'][chave]),
        `variáveis diferentes em ${chave}`
      );
    }
  });

  test('interpola valores', () => {
    assert.equal(t('row.anos', { anos: 30 }), '30 anos');
    assert.match(t('res.cidadesEscolhidas', { cidades: 'Hekinan' }), /Hekinan/);
  });

  test('sem tradução, cai no português em vez de ficar vazio', () => {
    // Em Node não há `document`: LANG é pt-BR, e o texto tem de sair mesmo assim.
    assert.equal(t('btn.continuar'), 'Continuar');
  });
});

describe('frases do motor', () => {
  const base = {
    age: 35,
    employmentType: 'seishain',
    employmentYears: 'gte3',
    residency: 'permanent_resident',
    desiredMonthlyPayment: 90_000
  };

  /** Cenários escolhidos para acionar cada nota e cada aviso do motor. */
  const cenarios = [
    ['padrão', base],
    ['sem renda informada', { ...base, annualIncome: undefined }],
    ['renda sem regra configurada', { ...base, annualIncome: 5_000_000 }],
    ['flat 35 com dívida', { ...base, employmentType: 'autonomo', annualIncome: 4_500_000, monthlyDebtPayments: 40_000 }],
    ['parcela acima da capacidade', { ...base, employmentType: 'autonomo', annualIncome: 3_000_000, desiredMonthlyPayment: 200_000 }],
    ['dívida alta demais', { ...base, employmentType: 'autonomo', annualIncome: 3_000_000, monthlyDebtPayments: 90_000 }],
    ['idade alta', { ...base, age: 70 }],
    ['idade muito alta', { ...base, age: 78 }],
    ['jovem', { ...base, age: 22, employmentType: 'autonomo' }],
    ['segunda pessoa', { ...base, employmentType: 'autonomo', annualIncome: 3_600_000, secondApplicant: { annualIncome: 2_000_000, age: 33 } }],
    ['contrato temporário', { ...base, employmentType: 'temporario', employmentYears: 'lt1' }],
    ['visto de trabalho', { ...base, residency: 'work_visa' }],
    ['residência desconhecida', { ...base, residency: 'unknown' }]
  ];

  test('toda frase produzida tem tradução em espanhol', () => {
    const semTraducao = new Set();

    for (const [nome, entrada] of cenarios) {
      let r;
      try {
        r = runSimulation(entrada, config);
      } catch {
        continue; // entrada inválida para o motor não é assunto deste teste
      }
      const frases = [
        ...(r.notes || []),
        ...(r.warnings || []),
        r.disclaimer,
        r.scenarioLabel,
        r.rate?.display,
        r.matomeToku?.message
      ].filter(Boolean);

      for (const f of frases) {
        if (!temTraducao(f)) semTraducao.add(`[${nome}] ${f}`);
      }
    }

    // compareWithRent devolve rótulo próprio, nos dois formatos
    for (const outros of [0, 20_000]) {
      const cmp = compareWithRent({ currentRent: 85_000, estimatedPayment: 92_000, otherMonthlyCosts: outros });
      if (!temTraducao(cmp.label)) semTraducao.add(`[aluguel] ${cmp.label}`);
    }

    assert.deepEqual([...semTraducao], [], 'frases do motor sem tradução em espanhol');
  });

  test('as traduções do motor não repetem o português', () => {
    for (const [pt, es] of Object.entries(MOTOR_EXATO)) {
      if (pt === 'Flat 35') continue; // nome de produto não se traduz
      assert.notEqual(es, pt, `tradução igual ao original: ${pt}`);
    }
  });
});

describe('as duas páginas do simulador', () => {
  const pt = readFileSync(new URL('../simular.html', import.meta.url), 'utf8');
  const es = readFileSync(new URL('../simular-es.html', import.meta.url), 'utf8');

  const ids = h => [...new Set([...h.matchAll(/id="([\w-]+)"/g)].map(m => m[1]))].sort();
  const steps = h => [...new Set([...h.matchAll(/data-step="(\w+)"/g)].map(m => m[1]))].sort();
  const valores = h => [...h.matchAll(/data-value="([^"]+)"/g)].map(m => m[1]);

  // O funil é um só arquivo para as duas páginas. Se a versão em espanhol
  // perder um id, um passo ou o valor de uma opção, o JS quebra só lá — e
  // ninguém percebe até alguém clicar num anúncio.
  test('têm os mesmos ids', () => {
    assert.deepEqual(ids(es), ids(pt));
  });

  test('têm os mesmos passos do funil', () => {
    assert.deepEqual(steps(es), steps(pt));
  });

  test('têm as mesmas opções, na mesma ordem', () => {
    assert.deepEqual(valores(es), valores(pt));
  });

  test('declaram o idioma e apontam uma para a outra', () => {
    assert.match(pt, /<html lang="pt-BR">/);
    assert.match(es, /<html lang="es">/);
    assert.match(pt, /hreflang="es" href="https:\/\/easyhouse\.homes\/simular-es"/);
    assert.match(es, /hreflang="pt-BR" href="https:\/\/easyhouse\.homes\/simular"/);
    assert.match(es, /canonical" href="https:\/\/easyhouse\.homes\/simular-es"/);
  });

  test('carregam a mesma versão do funil', () => {
    const v = h => h.match(/simular\.js\?v=(\d+)/)?.[1];
    assert.equal(v(es), v(pt));
  });

  test('a página em espanhol já vem com o idioma de atendimento certo', () => {
    assert.match(es, /<option value="es" selected>Español<\/option>/);
  });
});

describe('mensagens do servidor', () => {
  const arquivos = ['../api/lead.mjs', '../api/simulate.mjs'];

  // A pessoa que vem de um anúncio em espanhol não pode receber um erro em
  // português. Este teste lê os endpoints e cobra tradução de cada mensagem
  // que eles podem devolver.
  test('toda mensagem de erro dos endpoints tem tradução', () => {
    const semTraducao = [];
    for (const rel of arquivos) {
      const src = readFileSync(new URL(rel, import.meta.url), 'utf8');
      for (const m of src.matchAll(/error:\s*'([^']+)'/g)) {
        if (!temTraducao(m[1])) semTraducao.push(`${rel}: ${m[1]}`);
      }
    }
    assert.deepEqual(semTraducao, []);
  });

  test('a mensagem padrão do cliente também está traduzida', () => {
    assert.ok(SERVIDOR_EXATO['Falha no envio']);
  });
});
