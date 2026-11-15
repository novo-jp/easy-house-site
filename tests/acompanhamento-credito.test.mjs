/**
 * Ficha de crédito do corretor — a conta e a limpeza dos dados.
 * Rodar: node --test tests/
 *
 * Os números de "igual à planilha" foram conferidos contra o sistema de
 * planilhas de crédito da Easy House (13/11/2026), com as taxas que ele usava.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import * as L from '../lib/acompanhamento-credito.mjs';
import { entradaPadrao, calcular, validarEntrada } from '../lib/acompanhamento-simulacao.mjs';

const REF = new Date(2026, 10, 13);   // 13/11/2026

/** A tabela que a planilha usava — para provar que a conta é a mesma. */
const PLANILHA = [
  { id: 'flat35', nome: 'FLAT35', ativo: true, regra: 'flat35', ratio: 35, taxa_aprov: 3.81, taxa_real: 3.81, prazo_max: 35, idade_final: 80, limite_max: 120000000, fator_custos: 1.1 },
  { id: 'rokin', nome: 'ROUKIN', ativo: true, regra: 'flat35', ratio: 35, taxa_aprov: 1.5, taxa_real: 1.59, prazo_max: 39, idade_final: 80, limite_max: 0, fator_custos: 1.1 },
  { id: 'docomo', nome: 'SBI', ativo: true, regra: 'fixo', ratio: 40, taxa_aprov: 4, taxa_real: 3.5, prazo_max: 35, idade_final: 79, limite_max: 0, fator_custos: 1.1 },
];
const cliente = (extra = {}) => ({
  ficha: { nascimento: '1996-05-01', renda_anual: 3772280, permanente: 'sim', emprestimos: [], ...extra },
  codevedor: {}, credito: {},
});

describe('limite por banco', () => {
  test('igual à planilha: renda ¥3.772.280, 30 anos', () => {
    const r = L.credito(cliente(), PLANILHA, REF);
    assert.equal(r.idadeReq, 30);
    const [flat, rokin, sbi] = r.bancos;
    assert.deepEqual([flat.por1M, flat.maxEmp, flat.maxCasa, flat.casaSegura], [4314, 21860000, 19870000, 15890000]);
    assert.deepEqual([rokin.maxEmp, rokin.maxCasa], [33400000, 30360000]);
    assert.deepEqual([sbi.maxEmp, sbi.maxCasa], [28400000, 25810000]);
  });

  test('返済負担率: FLAT35 30% abaixo de ¥4M e 35% acima; faixas 25–40%', () => {
    assert.equal(L.ratioBanco({ regra: 'flat35' }, 3999999), 0.30);
    assert.equal(L.ratioBanco({ regra: 'flat35' }, 4000000), 0.35);
    assert.deepEqual([2999999, 3999999, 6999999, 7000000].map((v) => L.ratioBanco({ regra: 'faixas' }, v)), [0.25, 0.30, 0.35, 0.40]);
    assert.equal(L.ratioBanco({ regra: 'fixo', ratio: 40 }, 1), 0.4);
  });

  test('o prazo respeita a idade final do banco', () => {
    const c = cliente({ nascimento: '1970-01-01' });   // 56 anos
    const flat = L.credito(c, PLANILHA, REF).bancos[0];
    assert.equal(flat.prazo, 24);                      // 80 − 56
  });

  test('quitar dívidas marcadas libera parcela e aumenta o limite', () => {
    const c = cliente({ emprestimos: [{ parcela: 30000, saldo: 600000, quitar: 'sim' }, { parcela: 10000, saldo: 90000, quitar: 'nao' }] });
    const r = L.credito(c, PLANILHA, REF);
    assert.equal(r.divida, 10000);
    assert.equal(r.dividaSemQuitar, 40000);
    assert.equal(r.ganhoQuitar.parcelaLiberada, 30000);
    assert.equal(r.ganhoQuitar.saldo, 600000);
    assert.ok(r.ganhoQuitar.ganho > 0);
    c.credito.considerar_quitacao = false;
    assert.equal(L.credito(c, PLANILHA, REF).divida, 40000);
  });

  test('co-devedor: soma 100% por padrão, ou o percentual informado', () => {
    const c = cliente();
    c.codevedor = { ativo: true, renda_anual: 2000000, emprestimos: [] };
    c.credito = { somar_codevedor: true };
    assert.equal(L.credito(c, PLANILHA, REF).renda, 5772280);
    c.credito.pct_codevedor = 50;
    assert.equal(L.credito(c, PLANILHA, REF).renda, 4772280);
    c.codevedor.ativo = false;
    assert.equal(L.credito(c, PLANILHA, REF).renda, 3772280);
  });

  test('alertas: sem renda, sem 永住権, emprego recente', () => {
    const r = L.credito({ ficha: { permanente: 'teiju', admissao: '2026-06-01', nascimento: '1990-01-01' }, codevedor: {}, credito: {} }, PLANILHA, REF);
    const tipos = r.alertas.map((a) => a[0]);
    assert.ok(tipos.includes('erro'));
    assert.ok(r.alertas.some((a) => a[1].includes('永住権')));
    assert.ok(r.alertas.some((a) => a[1].includes('5 meses')));
    // texto puro: a página põe na tela por textContent
    assert.ok(r.alertas.every((a) => typeof a[1] === 'string' && !/<\w/.test(a[1])));
  });
});

describe('taxas definidas em 13/11/2026', () => {
  const b = (id) => L.BANCOS_PADRAO.lista.find((x) => x.id === id);

  test('FLAT35 3,92% e financeira dos 10% a 4,09%', () => {
    assert.equal(b('flat35').taxa_real, 3.92);
    assert.equal(b('flat35').taxa_aprov, 3.92);
    assert.equal(L.BANCOS_PADRAO.financeira10, 4.09);
  });

  test('ROUKIN 1,84%; com まとめトク 2,24% na casa e 2,69% no refinanciamento', () => {
    assert.equal(b('rokin').taxa_real, 1.84);
    assert.ok(b('rokin').taxa_aprov >= b('rokin').taxa_real, '審査金利 nunca abaixo da taxa cobrada');
    assert.equal(L.BANCOS_PADRAO.matome_casa, 2.24);
    assert.equal(L.BANCOS_PADRAO.matome_refin, 2.69);
  });

  test('SBI (Docomo) 1,7%', () => {
    assert.equal(b('docomo').taxa_real, 1.7);
  });

  test('os ids são os bancos do processo', () => {
    const modelos = JSON.parse(readFileSync(new URL('../lib/acompanhamento-modelos.json', import.meta.url)));
    assert.deepEqual(L.BANCOS_PADRAO.lista.map((x) => x.id).sort(), Object.keys(modelos.bancos).sort());
  });

  test('a tabela padrão passa pela própria validação', () => {
    const limpa = L.limparBancos(structuredClone(L.BANCOS_PADRAO));
    assert.deepEqual(limpa, L.BANCOS_PADRAO);
  });

  test('a simulação de parcelas do processo usa o juro do banco do processo', () => {
    assert.deepEqual(L.jurosDoProcesso(L.BANCOS_PADRAO, 'rokin'), { juros: 1.84 });
    assert.deepEqual(L.jurosDoProcesso(L.BANCOS_PADRAO, 'docomo'), { juros: 1.7 });
    assert.deepEqual(L.jurosDoProcesso(L.BANCOS_PADRAO, 'flat35'), { juros: 3.92, juros_financeira: 4.09 });
    assert.deepEqual(L.jurosDoProcesso(L.BANCOS_PADRAO, 'banco-que-nao-existe'), {});
    assert.equal(entradaPadrao('privado', L.jurosDoProcesso(L.BANCOS_PADRAO, 'docomo')).juros, 1.7);
    assert.equal(entradaPadrao('privado').juros, 1.84);
    const flat = entradaPadrao('flat35');
    assert.deepEqual([flat.juros, flat.juros_financeira], [3.92, 4.09]);
    // juro absurdo vindo da tabela não entra: fica o padrão
    assert.equal(entradaPadrao('privado', { juros: 184 }).juros, 1.84);
  });

  test('parcela do processo FLAT35 a 3,92% + 4,09% (¥24,9M, 35 anos)', () => {
    const r = calcular(validarEntrada({ ...entradaPadrao('flat35'), preco: '24900000', prazo_anos: '35' }, 'flat35'));
    assert.equal(r.total, 27160000);
    assert.equal(r.parcela, 119235);   // 107.062 (90% a 3,92%) + 12.173 (10% a 4,09%)
  });
});

describe('資金計画書', () => {
  const casa = (tranches) => ({
    ficha: {}, codevedor: {},
    simulacao: { preco: 24900000, proprio: 0, taxa_jimu: 2.2, base_corretagem: 'sem', custos: L.custosPadrao(), tranches },
  });

  test('igual à planilha: casa de ¥24,9M → 総予算 ¥27.150.000', () => {
    const r = L.simulacao(casa([{ nome: '住宅ローン', modo: 'resto', prazo: 35, taxa: 3.5 }]));
    assert.equal(r.total, 27150000);
    assert.equal(r.emprestimo, 27150000);
    assert.equal(r.linhas.find((l) => l.k === 'chukai').calc, 887700);          // (24,9M × 3% + 60.000) × 1,1
    assert.equal(r.custos + r.arredondamento, 2250000);
    assert.equal(Math.round(r.mensal), 112208);
  });

  test('igual à planilha: FLAT 90% a 3,81% + 10% a 3,2% → ¥116.179', () => {
    const r = L.simulacao(casa([
      { nome: 'フラット35（90%）', modo: 'pct', pct: 90, prazo: 35, taxa: 3.81 },
      { nome: '住宅ローン（10%）', modo: 'resto', prazo: 35, taxa: 3.2 },
    ]));
    assert.deepEqual(r.tranches.map((t) => t.valor_calc), [24435000, 2715000]);
    assert.equal(Math.round(r.mensal), 116179);
    assert.equal(r.alertas.length, 0);
  });

  test('entrada (自己資金) reduz o empréstimo e a taxa do banco', () => {
    const c = casa([{ modo: 'resto', prazo: 35, taxa: 1.84 }]);
    const semEntrada = L.simulacao(c);
    c.simulacao.proprio = 2000000;
    const comEntrada = L.simulacao(c);
    assert.ok(comEntrada.emprestimo < semEntrada.emprestimo - 2000000 + 1);
    const jimu = (r) => r.linhas.find((l) => l.k === 'jimu').calc;
    assert.ok(jimu(comEntrada) < jimu(semEntrada));
  });

  test('avisa quando as parcelas não fecham com o 借入金額', () => {
    const r = L.simulacao(casa([{ modo: 'valor', valor: 10000000, prazo: 35, taxa: 1.84 }]));
    assert.equal(r.alertas.length, 1);
    assert.equal(r.alertas[0][0], 'aviso');
  });

  test('planos prontos usam as taxas da tabela', () => {
    const c = { ...cliente({ emprestimos: [{ parcela: 30000, saldo: 600000, quitar: 'sim' }] }), simulacao: {} };
    const B = L.BANCOS_PADRAO;
    const chaves = L.planosDisponiveis(B).map((p) => p.chave);
    assert.deepEqual(chaves, ['unico:rokin', 'unico:docomo', 'unico:aeon', 'flat9010', 'pair', 'matome']);

    const flat = L.montarPlano('flat9010', c, B, REF);
    assert.deepEqual(flat.map((t) => t.taxa), [3.92, 4.09]);
    assert.deepEqual([flat[0].modo, flat[0].pct, flat[1].modo], ['pct', 90, 'resto']);

    assert.equal(L.montarPlano('unico:docomo', c, B, REF)[0].taxa, 1.7);
    assert.equal(L.montarPlano('unico:rokin', c, B, REF)[0].taxa, 1.84);

    const matome = L.montarPlano('matome', c, B, REF);
    assert.deepEqual(matome.map((t) => t.taxa), [2.24, 2.69]);
    assert.equal(matome[1].extra, true);
    assert.equal(matome[1].valor, 600000);

    assert.equal(L.bancoDoPlano('unico:docomo'), 'docomo');
    assert.equal(L.bancoDoPlano('flat9010'), 'flat35');
    assert.equal(L.bancoDoPlano('matome'), 'rokin');
    assert.equal(L.bancoDoPlano(''), null);
  });

  test('FLAT35 90/10 com as taxas novas (¥24,9M, 35 anos)', () => {
    const r = L.simulacao(casa(L.montarPlano('flat9010', cliente(), L.BANCOS_PADRAO, REF)));
    assert.equal(Math.round(r.mensal), 119191);   // ¥24.435.000 a 3,92% + ¥2.715.000 a 4,09%
  });

  test('sem preço do imóvel não há arredondamento negativo', () => {
    const c = casa([]); c.simulacao.preco = '';
    const r = L.simulacao(c);
    assert.equal(r.total, 0);
    assert.equal(r.arredondamento, 0);
    assert.equal(r.custos, 760000);   // os custos fixos continuam somados
  });
});

describe('português na tela da simulação', () => {
  test('todo custo padrão tem tradução (名目, 備考, 支払先)', () => {
    for (const l of L.custosPadrao()) {
      for (const k of ['nome', 'obs', 'pagar']) {
        if (l[k]) assert.ok(L.emPortugues(l[k]), `${k}: ${l[k]}`);
      }
    }
    assert.equal(L.emPortugues('仲介手数料'), 'Comissão da imobiliária');
    assert.equal(L.emPortugues(' 火災保険料 '), 'Seguro de incêndio');
  });

  test('empréstimos dos planos prontos e tipos de juros também', () => {
    const c = cliente({ emprestimos: [{ saldo: 1000000, parcela: 30000, quitar: true }] });
    for (const plano of ['unico:rokin', 'flat9010', 'matome']) {
      for (const t of L.montarPlano(plano, c, L.BANCOS_PADRAO, REF)) {
        assert.ok(L.emPortugues(t.nome), `${plano}: ${t.nome}`);
        assert.ok(L.emPortugues(t.tipo), `${plano}: ${t.tipo}`);
      }
    }
    for (const k of L.TIPO_JUROS) assert.ok(L.emPortugues(k), k);
  });

  test('taxa do banco com outro percentual; texto desconhecido fica sem tradução', () => {
    assert.equal(L.emPortugues('借入金額 × 2.2%'), 'Valor financiado × 2,2%');
    assert.equal(L.emPortugues('借入金額×2.75%'), 'Valor financiado × 2,75%');
    assert.equal(L.emPortugues('解体費用'), '');
    assert.equal(L.emPortugues(''), '');
    assert.equal(L.emPortugues(null), '');
  });
});

describe('números e datas', () => {
  test('ienes: vírgula e ponto são separador de milhar', () => {
    assert.equal(L.inteiro('24,900,000'), 24900000);
    assert.equal(L.inteiro('24.900.000'), 24900000);
    assert.equal(L.inteiro('２４９０００００'), 24900000);
    assert.equal(L.inteiro('¥ 87,168'), 87168);
    assert.equal(L.inteiro(''), 0);
  });

  test('taxas: vírgula é decimal (1,84 não vira 184)', () => {
    assert.equal(L.dec('1,84'), 1.84);
    assert.equal(L.dec('1.84'), 1.84);
    assert.equal(L.dec('3,92%'), 3.92);
  });

  test('a data do documento é a do Japão, não a de UTC', () => {
    assert.equal(L.hojeJST(new Date('2026-11-12T23:30:00Z')), '2026-11-13');   // 08:30 em Tóquio
    assert.equal(L.hojeJST(new Date('2026-11-13T14:59:00Z')), '2026-11-13');   // 23:59 em Tóquio
    assert.equal(L.dataJP('2026-11-09'), '2026年11月9日');
  });

  test('idade e tempo de casa', () => {
    assert.equal(L.idade('1996-11-14', REF), 29);
    assert.equal(L.idade('1996-11-13', REF), 30);
    assert.equal(L.mesesDesde('2026-06-01', REF), 5);
    assert.equal(L.idade('', REF), null);
  });
});

describe('limpeza do que vem do navegador', () => {
  test('só campos conhecidos, com tipo e tamanho', () => {
    const limpo = L.limparParte('ficha', {
      nome: 'A'.repeat(500), renda_anual: '3,772,280', permanente: 'hacker', nascimento: '13/11/1990',
      __proto__: { x: 1 }, campo_inventado: 'x', observacoes: 'ok',
      emprestimos: Array.from({ length: 50 }, () => ({ parcela: '30,000', quitar: 'talvez', extra: 'x' })),
      familia: 'não é lista',
    });
    assert.equal(limpo.nome.length, 120);
    assert.equal(limpo.renda_anual, 3772280);
    assert.equal(limpo.permanente, '');
    assert.equal(limpo.nascimento, '');
    assert.ok(!('campo_inventado' in limpo));
    assert.equal(limpo.emprestimos.length, 20);
    assert.deepEqual(limpo.emprestimos[0], { parcela: 30000, quitar: '' });
    assert.deepEqual(limpo.familia, []);
  });

  test('o que a tela manda volta igual (não perde dado bom)', () => {
    const nova = L.fichaNova();
    for (const parte of L.PARTES_DA_FICHA) assert.deepEqual(L.limparParte(parte, nova[parte]), nova[parte], parte);
    const plano = L.montarPlano('matome', cliente(), L.BANCOS_PADRAO, REF);
    assert.deepEqual(L.limparParte('simulacao', { tranches: plano }).tranches, plano);
  });

  test('observações internas só existem na ficha do requerente', () => {
    assert.ok(!('observacoes' in L.limparParte('codevedor', { observacoes: 'x', ativo: true })));
    assert.throws(() => L.limparParte('outra', {}));
  });

  test('status: só os do funil', () => {
    assert.ok(L.statusValido('aprovado'));
    assert.ok(!L.statusValido('"><img src=x>'));
  });

  test('tabela de bancos: recusa em vez de consertar', () => {
    const t = () => structuredClone(L.BANCOS_PADRAO);
    assert.throws(() => L.limparBancos({ ...t(), lista: [] }), /pelo menos um banco/);
    const semTaxa = t(); semTaxa.lista[0].taxa_real = '';
    assert.throws(() => L.limparBancos(semTaxa), /実行金利/);
    const absurda = t(); absurda.lista[1].taxa_aprov = 184;
    assert.throws(() => L.limparBancos(absurda), /審査金利/);
    const repetido = t(); repetido.lista[1].id = 'flat35';
    assert.throws(() => L.limparBancos(repetido), /repetido/);
    const semFinanceira = t(); delete semFinanceira.financeira10;
    assert.throws(() => L.limparBancos(semFinanceira), /financeira/);
    const comVirgula = t(); comVirgula.lista[1].taxa_real = '1,84';
    assert.equal(L.limparBancos(comVirgula).lista[1].taxa_real, 1.84);
  });

  test('tabela gravada antes de um campo novo existir ganha o padrão dele', () => {
    const antiga = { conferido_em: '2026-10-01', financeira10: 4, lista: [L.BANCOS_PADRAO.lista[0]] };
    const completa = L.completarBancos(antiga);
    assert.equal(completa.financeira10, 4);
    assert.equal(completa.matome_casa, 2.24);
    assert.equal(completa.lista.length, 1);
    assert.deepEqual(L.completarBancos(null), L.BANCOS_PADRAO);
  });
});

describe('documentos impressos', () => {
  // Decisão da Easy House (13/11/2026): o 資金計画書 sai sem endereço e sem
  // nome de imobiliária nenhuma. Este teste segura a decisão.
  test('a tela de crédito não carrega endereço nem razão social', () => {
    const fonte = readFileSync(new URL('../acompanhamento-credito.js', import.meta.url), 'utf8');
    for (const proibido of ['那覇', '小禄', '碧南', '入船', '株式会社', 'movO', 'easyhouse.homes', '098-923', '仲介不動産会社情報', '知事']) {
      assert.ok(!fonte.includes(proibido), `não deveria conter "${proibido}"`);
    }
  });

  test('nada de innerHTML com dado', () => {
    const fonte = readFileSync(new URL('../acompanhamento-credito.js', import.meta.url), 'utf8');
    assert.ok(!/\.innerHTML\s*=|insertAdjacentHTML|document\.write/.test(fonte));
  });
});
