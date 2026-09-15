/**
 * Testes da busca de aluguel (lib/aluguel-busca.mjs), da normalização
 * (lib/aluguel.mjs) e do card (lib/aluguel-cartao.js).
 * Rodar: node --test tests/*.test.mjs
 *
 * Fixtures mínimas, sem banco: o que se testa é a regra, não o Supabase.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { lerFiltros, filtrosParaParams, aplicarFiltros, buscar, facetas, diagnosticoVazio,
         resolverLocal, ORDENS, ORDEM_PADRAO } from '../lib/aluguel-busca.mjs';
import { normalizarAluguel, lerArea, lerAcesso, lerDisponibilidade, quartosDaPlanta, ehPublicavel } from '../lib/aluguel.mjs';

const require = createRequire(import.meta.url);
const Cartao = require('../lib/aluguel-cartao.js');
const Custos = require('../custos.js');

const FOTO = 'https://image.eheya.net/propertyPicture/017/441/601/017441601-G.jpg';
function apto(over) {
  return normalizarAluguel({
    id: 1000001, titulo: 'アイランド・ヴィレッジⅠ', endereco: '愛知県名古屋市港区八百島１丁目', cidade: '名古屋市', cidade_pt: 'Nagoya',
    planta: '1LDK', aluguel: 56000, condominio: 3500, estacionamento: 4400, tem_estacionamento: true,
    deposito: 0, luva: 56000, area: 0, andar: '44.75㎡', estacao: '名古屋鉄道尾西線 観音寺駅', minutos_estacao: 8,
    disponivel_de: '即入居可', pet: false, internet: false, pet_verificado_em: null,
    foto_url: FOTO, foto_planta: FOTO.replace('-G', '-M'), dk_url: 'https://front.dk-portal.jp/p/h/abc%3D%3D',
    updated_at: '2026-09-14T22:09:24+00:00', ...over
  });
}
const ACERVO = [
  apto({ id: 1, cidade: '名古屋市', cidade_pt: 'Nagoya', aluguel: 56000, planta: '1LDK', luva: 56000 }),
  apto({ id: 2, cidade: '豊橋市', cidade_pt: 'Toyohashi', aluguel: 35000, planta: '2DK', luva: 0, deposito: 0, andar: '39.7㎡',
         estacao: '東海道本線（ＪＲ東海） 二川駅 バス 13分 (バス停)大岩', minutos_estacao: 5, disponivel_de: '2026年10月上旬',
         pet: true, internet: true, pet_verificado_em: '2026-09-15T08:00:00+00:00' }),
  apto({ id: 3, cidade: '豊橋市', cidade_pt: 'Toyohashi', aluguel: 48000, planta: '3LDK', luva: 48000, deposito: 96000, andar: '70.2㎡',
         minutos_estacao: 25, pet: false, pet_verificado_em: '2026-09-15T08:00:00+00:00' }),
  apto({ id: 4, cidade: '豊田市', cidade_pt: 'Toyota', aluguel: 83500, planta: '1K', luva: 0, andar: '', area: 0, estacao: '', minutos_estacao: 0,
         dk_url: 'https://front.dk-portal.jp/property/detail/housing/broker/173436', foto_planta: '' })
];
const P = (s) => new URLSearchParams(s);

describe('normalização (lib/aluguel.mjs)', () => {
  test('área vem do campo andar quando area é 0', () => {
    assert.equal(lerArea(0, '44.75㎡'), 44.75);
    assert.equal(lerArea(50.5, '3F'), 50.5);
    assert.equal(lerArea(0, ''), null);
    assert.equal(lerArea(null, '2階'), null);
  });
  test('quartos a partir da planta', () => {
    assert.equal(quartosDaPlanta('1R'), '1');
    assert.equal(quartosDaPlanta('2LDK'), '2');
    assert.equal(quartosDaPlanta('4SLDK'), '3');
    assert.equal(quartosDaPlanta(''), null);
  });
  test('acesso: linha, estação, ônibus e caminhada', () => {
    const tr = lerAcesso('名古屋鉄道尾西線 観音寺駅', 8);
    assert.deepEqual([tr.linha, tr.estacao, tr.minutosAPe, tr.onibus], ['名古屋鉄道尾西線', '観音寺駅', 8, false]);
    const on = lerAcesso('名古屋市交通局東山線 高畑駅 バス 31分 (バス停)八百島', 8);
    assert.equal(on.onibus, true);
    assert.equal(on.minutosOnibus, 31);
    assert.equal(on.ponto, '八百島');
    assert.equal(on.estacao, '高畑駅');
    assert.equal(lerAcesso('', 0).minutosAPe, null);
  });
  test('disponibilidade: imediata, prevista com decêndio, desconhecida', () => {
    assert.equal(lerDisponibilidade('即入居可').classe, 'imediata');
    const p = lerDisponibilidade('2026年10月上旬');
    assert.equal(p.classe, 'prevista');
    assert.equal(p.quando, '2026-10-1');
    assert.match(p.texto, /início de outubro\/2026/);
    assert.equal(lerDisponibilidade('').classe, null);
  });
  test('pet e internet só valem depois de conferidos', () => {
    assert.equal(apto({ pet: true, pet_verificado_em: null }).pet, null);
    assert.equal(apto({ pet: true, pet_verificado_em: '2026-09-15' }).pet, true);
    assert.equal(apto({ pet: false, pet_verificado_em: '2026-09-15' }).pet, false);
    assert.equal(apto({ internet: true, pet_verificado_em: null }).internet, null);
  });
  test('URL do portal: só a de cliente passa', () => {
    assert.equal(apto({}).dkUrl, 'https://front.dk-portal.jp/p/h/abc%3D%3D');
    assert.equal(apto({ dk_url: 'https://front.dk-portal.jp/property/detail/housing/broker/1' }).dkUrl, null);
    assert.equal(apto({ dk_url: '' }).dkUrl, null);
  });
  test('custos batem com custos.js', () => {
    const a = apto({});
    const c = Custos.calcular({ aluguel: 56000, condominio: 3500, estacionamento: 4400, tem_estacionamento: true, deposito: 0, luva: 56000 });
    assert.equal(a.mensal, c.mensal);
    assert.equal(a.entrada, c.entrada);
    assert.ok(a.entrada > a.mensal * 2, 'a entrada inclui luva, diárias, mês adiantado e taxas');
  });
  test('publicável exige aluguel e cidade', () => {
    assert.equal(ehPublicavel(apto({})), true);
    assert.equal(ehPublicavel(apto({ aluguel: 0 })), false);
    assert.equal(ehPublicavel(apto({ cidade_pt: '' })), false);
  });
});

describe('parâmetros da URL', () => {
  test('lê e canoniza multi, números e enums', () => {
    const { filtros, ordem, pagina, ignorados } = lerFiltros(P('cidade=Toyohashi,%20nagoya&quartos=2,3%2B,9&planta=2DK&aluguelMax=50000&luva=sem&disponivel=imediata,x&ordem=mensal_asc&pagina=2'));
    assert.deepEqual(filtros.cidades, ['toyohashi', 'nagoya']);
    assert.deepEqual(filtros.quartos, ['2', '3']);
    assert.deepEqual(filtros.plantas, ['2dk']);
    assert.equal(filtros.aluguelMax, 50000);
    assert.equal(filtros.luva, 'sem');
    assert.deepEqual(filtros.disponivel, ['imediata']);
    assert.equal(ordem, 'mensal_asc');
    assert.equal(pagina, 2);
    assert.deepEqual(ignorados, []);
  });
  test('inválido cai no padrão e é listado', () => {
    const { filtros, ordem, ignorados } = lerFiltros(P('aluguelMax=abc&pet=talvez&ordem=xyz'));
    assert.equal(filtros.aluguelMax, null);
    assert.equal(filtros.pet, null);
    assert.equal(ordem, ORDEM_PADRAO);
    assert.deepEqual(ignorados.sort(), ['aluguelMax', 'ordem', 'pet']);
  });
  test('nomes antigos de ordenação ainda funcionam', () => {
    assert.equal(lerFiltros(P('ordem=menor')).ordem, 'aluguel_asc');
    assert.equal(lerFiltros(P('ordem=maior')).ordem, 'aluguel_desc');
    assert.equal(lerFiltros(P('ordem=area')).ordem, 'area_desc');
  });
  test('faixa invertida é trocada, não perdida', () => {
    const { filtros, ignorados } = lerFiltros(P('aluguelMin=60000&aluguelMax=40000'));
    assert.equal(filtros.aluguelMin, 40000);
    assert.equal(filtros.aluguelMax, 60000);
    assert.ok(ignorados.includes('faixaDeAluguel'));
  });
  test('ida e volta: filtros → params → filtros', () => {
    const { filtros, ordem } = lerFiltros(P('cidade=toyohashi&quartos=2&luva=sem&pet=sim&estacaoMax=10&ordem=entrada_asc'));
    const p = filtrosParaParams(filtros, ordem, 3);
    const de = lerFiltros(p);
    assert.deepEqual(de.filtros, filtros);
    assert.equal(de.ordem, 'entrada_asc');
    assert.equal(de.pagina, 3);
  });
  test('padrões não vão para a URL', () => {
    const { filtros, ordem } = lerFiltros(P(''));
    assert.equal(filtrosParaParams(filtros, ordem, 1).toString(), '');
  });
});

describe('filtros', () => {
  const f = () => lerFiltros(P('')).filtros;
  test('cidade e quartos', () => {
    assert.deepEqual(aplicarFiltros(ACERVO, { ...f(), cidades: ['toyohashi'] }).map((a) => a.codigo), ['2', '3']);
    assert.deepEqual(aplicarFiltros(ACERVO, { ...f(), quartos: ['1'] }).map((a) => a.codigo), ['1', '4']);
    assert.deepEqual(aplicarFiltros(ACERVO, { ...f(), quartos: ['3'] }).map((a) => a.codigo), ['3']);
  });
  test('aluguel, custo mensal e entrada', () => {
    assert.deepEqual(aplicarFiltros(ACERVO, { ...f(), aluguelMax: 50000 }).map((a) => a.codigo), ['2', '3']);
    const barato = ACERVO.filter((a) => a.mensal <= 60000).map((a) => a.codigo);
    assert.deepEqual(aplicarFiltros(ACERVO, { ...f(), mensalMax: 60000 }).map((a) => a.codigo), barato);
    const entradaBaixa = ACERVO.filter((a) => a.entrada <= 250000).map((a) => a.codigo);
    assert.deepEqual(aplicarFiltros(ACERVO, { ...f(), entradaMax: 250000 }).map((a) => a.codigo), entradaBaixa);
  });
  test('sem luva e sem depósito', () => {
    assert.deepEqual(aplicarFiltros(ACERVO, { ...f(), luva: 'sem' }).map((a) => a.codigo), ['2', '4']);
    assert.deepEqual(aplicarFiltros(ACERVO, { ...f(), deposito: 'sem' }).map((a) => a.codigo), ['1', '2', '4']);
  });
  test('pet: só quem foi conferido e aceita', () => {
    assert.deepEqual(aplicarFiltros(ACERVO, { ...f(), pet: 'sim' }).map((a) => a.codigo), ['2']);
    assert.deepEqual(aplicarFiltros(ACERVO, { ...f(), internet: 'sim' }).map((a) => a.codigo), ['2']);
  });
  test('estação: ônibus e sem dado continuam aparecendo', () => {
    // 1: 8 min a pé · 2: ônibus (caminhada não conta) · 3: 25 min · 4: sem dado
    assert.deepEqual(aplicarFiltros(ACERVO, { ...f(), estacaoMax: 10 }).map((a) => a.codigo), ['1', '2', '4']);
  });
  test('área mínima não exclui quem não informa', () => {
    assert.deepEqual(aplicarFiltros(ACERVO, { ...f(), areaMin: 60 }).map((a) => a.codigo), ['3', '4']);
  });
  test('disponibilidade', () => {
    assert.deepEqual(aplicarFiltros(ACERVO, { ...f(), disponivel: ['prevista'] }).map((a) => a.codigo), ['2']);
  });
  test('texto livre acha nome, estação e código', () => {
    assert.deepEqual(aplicarFiltros(ACERVO, { ...f(), q: '観音寺' }).map((a) => a.codigo), ['1', '3']);
    assert.deepEqual(aplicarFiltros(ACERVO, { ...f(), q: '4' }).map((a) => a.codigo), ['4']);
  });
});

describe('texto que é cidade', () => {
  test('"Toyohashi" digitado vira filtro de cidade e substitui as marcadas', () => {
    const pedido = lerFiltros(P('q=Toyohashi&cidade=nagoya'));
    const r = resolverLocal(pedido, ACERVO);
    assert.equal(r.localResolvido, true);
    assert.deepEqual(r.filtros.cidades, ['toyohashi']);
    assert.equal(r.filtros.q, null);
  });
  test('nome em japonês, com ou sem 市', () => {
    assert.deepEqual(resolverLocal(lerFiltros(P('q=豊橋市')), ACERVO).filtros.cidades, ['toyohashi']);
    assert.deepEqual(resolverLocal(lerFiltros(P('q=豊橋')), ACERVO).filtros.cidades, ['toyohashi']);
  });
  test('texto que não é cidade fica como busca', () => {
    const r = resolverLocal(lerFiltros(P('q=ヴィレッジ')), ACERVO);
    assert.equal(r.localResolvido, undefined);
    assert.equal(r.filtros.q, 'ヴィレッジ');
  });
});

describe('ordenação e paginação', () => {
  const pedido = (s) => lerFiltros(P(s));
  test('padrão é menor aluguel; nulos por último', () => {
    const r = buscar(ACERVO, pedido(''));
    assert.deepEqual(r.itens.map((a) => a.aluguel), [35000, 48000, 56000, 83500]);
  });
  test('cada ordem se explica', () => {
    for (const [k, o] of Object.entries(ORDENS)) {
      assert.ok(o.rotulo && o.explica && typeof o.cmp === 'function', k);
    }
  });
  test('mais perto da estação: ônibus e sem dado no fim', () => {
    const r = buscar(ACERVO, pedido('ordem=estacao_asc'));
    assert.deepEqual(r.itens.map((a) => a.codigo).slice(0, 2), ['1', '3']);
  });
  test('entrada mais próxima: imediata antes da prevista', () => {
    const r = buscar(ACERVO, pedido('ordem=disponivel'));
    assert.equal(r.itens.at(-1).codigo, '2');
  });
  test('página além do fim volta para a última', () => {
    const r = buscar(ACERVO, { ...pedido('porPagina=2&pagina=9') });
    assert.equal(r.pagina, 2);
    assert.equal(r.totalPaginas, 2);
    assert.equal(r.itens.length, 2);
  });
});

describe('facetas', () => {
  test('cidade não zera a si mesma; as outras respeitam o filtro', () => {
    const f = lerFiltros(P('cidade=toyohashi')).filtros;
    const fac = facetas(ACERVO, f);
    const nagoya = fac.cidades.find((c) => c.chave === 'nagoya');
    assert.equal(nagoya.total, 1, 'Nagoya continua contável mesmo com Toyohashi marcada');
    assert.equal(nagoya.jp, '名古屋市');
    assert.deepEqual(fac.quartos.map((q) => [q.valor, q.total]), [['1', 0], ['2', 1], ['3', 1]]);
    assert.equal(fac.luva.sem, 1);
    assert.equal(fac.pet.sim, 1);
    assert.equal(fac.pet.verificados, 2);
    assert.equal(fac.disponivel.imediata, 1);
    assert.equal(fac.disponivel.prevista, 1);
  });
  test('sem dado: estação (inclui ônibus) e área', () => {
    const fac = facetas(ACERVO, lerFiltros(P('')).filtros);
    assert.equal(fac.semDado.estacao, 2);   // ônibus (2) + sem dado (4)
    assert.equal(fac.semDado.onibus, 1);
    assert.equal(fac.semDado.area, 1);
  });
});

describe('estado vazio', () => {
  test('sugere afrouxar o filtro que mais devolve', () => {
    const f = lerFiltros(P('cidade=toyota&aluguelMax=40000')).filtros;
    assert.equal(aplicarFiltros(ACERVO, f).length, 0);
    const d = diagnosticoVazio(ACERVO, f);
    assert.deepEqual(d.ativos, ['cidades', 'aluguelMax']);
    assert.equal(d.sugestoes[0].filtro, 'cidades');
    assert.equal(d.sugestoes[0].voltariam, 1);
  });
});

describe('card', () => {
  test('mostra aluguel, condomínio, custos e omite o que não existe', () => {
    const html = Cartao.cartao(ACERVO[0]);
    assert.match(html, /¥56\.000/);
    assert.match(html, /\+ ¥3\.500 condomínio/);
    assert.match(html, /Custo mensal/);
    assert.match(html, /Entrada estimada/);
    assert.match(html, /data-custos="1"/);
    assert.match(html, /44,8 m²/);
    assert.match(html, /8 min a pé de <span lang="ja">観音寺駅/);
    assert.match(html, /Vaga ¥4\.400\/mês/);
    assert.doesNotMatch(html, /NaN|undefined|null/);
    assert.doesNotMatch(html, /Aceita pet/, 'pet não conferido não ganha selo');
  });
  test('selos: pet conferido e sem luva/depósito', () => {
    const html = Cartao.cartao(ACERVO[1]);
    assert.match(html, /selo--pet/);
    assert.match(html, /Sem luva e sem depósito/);
    assert.match(html, /Ônibus 13 min até <span lang="ja">二川駅/);
    assert.match(html, /Internet inclusa/);
    assert.match(html, /início de outubro\/2026/);
  });
  test('sem URL de cliente não há link para o portal; sem planta não há troca', () => {
    const html = Cartao.cartao(ACERVO[3]);
    assert.doesNotMatch(html, /Portal/);
    assert.doesNotMatch(html, /data-slide-ir/);
    assert.doesNotMatch(html, /m²/);
  });
  test('WhatsApp leva o imóvel descrito', () => {
    const url = Cartao.linkWhatsApp(ACERVO[0]);
    const txt = decodeURIComponent(url.split('text=')[1]);
    assert.match(txt, /アイランド・ヴィレッジⅠ/);
    assert.match(txt, /Nagoya/);
    assert.match(txt, /Código 1/);
  });
  test('escapa HTML vindo do banco', () => {
    const html = Cartao.cartao(apto({ titulo: '<script>x</script>' }));
    assert.doesNotMatch(html, /<script>x/);
  });
});
