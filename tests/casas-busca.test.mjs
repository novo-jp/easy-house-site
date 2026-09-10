/**
 * Testes da busca de casas (lib/casas-busca.mjs) e do card (lib/casas-cartao.js).
 * Rodar: node --test tests/
 *
 * Fixtures mínimas, sem banco: o que se testa é a regra, não o Supabase.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { lerFiltros, filtrosParaParams, aplicarFiltros, buscar, facetas, diagnosticoVazio,
         resolverLocal, ORDENS, ORDEM_PADRAO, chave } from '../lib/casas-busca.mjs';
import { normalizarCasa, classeEntrega, entregaPrevistaPt, formatarYen, formatarMan } from '../lib/casas.mjs';

const require = createRequire(import.meta.url);
const Cartao = require('../lib/casas-cartao.js');

const FOTO = 'https://igtqdhesorahhdyvsjrl.supabase.co/storage/v1/object/public/fichas/x.jpg';
function casa(over) {
  return normalizarCasa({
    id: over.id || '69675509040', preco_yen: 29800000, planta: '4LDK', cidade: '豊田市', cidade_pt: 'Toyota',
    prefeitura: '愛知県', prefeitura_pt: 'Aichi', estacionamento: '有', estacao: '名鉄三河線 三河高浜 徒歩12分',
    area_constr_m2: 105.6, area_terreno_m2: 172.04, ano_construcao: '2025-09', construcao_nova: true, entrega: '即時',
    foto_principal: FOTO, fotos_extras: [FOTO + '?2'], last_seen_at: '2026-09-10T01:00:00Z', created_at: '2026-09-09T00:00:00Z',
    fonte: 'atbb', status: '紹介可能', ...over
  }, { publicacao: { diasParaInativar: 14 } }, {}, new Date('2026-09-10T12:00:00Z'));
}
const ACERVO = [
  casa({ id: '1000001', cidade: '豊田市', cidade_pt: 'Toyota', preco_yen: 29800000, planta: '4LDK' }),
  casa({ id: '1000002', cidade: '岡崎市', cidade_pt: 'Okazaki', preco_yen: 19800000, planta: '3LDK', construcao_nova: false, ano_construcao: '平成30年9月', estacionamento: 'なし', entrega: '相談' }),
  casa({ id: '1000003', cidade: '津市', cidade_pt: 'Tsu', prefeitura: '三重県', prefeitura_pt: 'Mie', preco_yen: 12800000, planta: '3LDK', estacionamento: '', estacao: null, entrega: '予定 2026年09月下旬', sem_foto_original: true }),
  casa({ id: '1000004', cidade: '豊田市', cidade_pt: 'Toyota', preco_yen: 44900000, planta: '4SLDK', minutos_estacao: 25, estacao: '愛知環状鉄道 三河豊田 徒歩25分' })
];
const P = (s) => new URLSearchParams(s);

describe('parâmetros da URL', () => {
  test('lê e canoniza multi, números e enums', () => {
    const { filtros, ordem, pagina, ignorados } = lerFiltros(P('cidade=Toyota,%20okazaki&planta=4LDK&precoMax=30000000&estado=novo&entrega=imediata,x&ordem=preco_asc&pagina=2'));
    assert.deepEqual(filtros.cidades, ['toyota', 'okazaki']);
    assert.deepEqual(filtros.plantas, ['4ldk']);
    assert.equal(filtros.precoMax, 30000000);
    assert.equal(filtros.estado, 'novo');
    assert.deepEqual(filtros.entrega, ['imediata']);
    assert.equal(ordem, 'preco_asc'); assert.equal(pagina, 2);
    assert.deepEqual(ignorados, []);
  });
  test('inválido cai no padrão e é reportado, nunca lança', () => {
    const r = lerFiltros(P('precoMax=abc&anoMin=5&estado=talvez&ordem=recomendados&pagina=-3&porPagina=9999'));
    assert.equal(r.filtros.precoMax, null); assert.equal(r.filtros.anoMin, null); assert.equal(r.filtros.estado, null);
    assert.equal(r.ordem, 'recentes');            // legado mapeado
    assert.equal(r.pagina, 1); assert.equal(r.porPagina, 24, 'fora da faixa volta ao padrão');
    assert.ok(r.ignorados.includes('precoMax') && r.ignorados.includes('anoMin') && r.ignorados.includes('estado'));
  });
  test('faixa invertida é corrigida e avisada', () => {
    const r = lerFiltros(P('precoMin=40000000&precoMax=10000000'));
    assert.equal(r.filtros.precoMin, 10000000); assert.equal(r.filtros.precoMax, 40000000);
    assert.ok(r.ignorados.includes('faixaDePreco'));
  });
  test('parâmetros abusivos são limitados', () => {
    const muitos = Array.from({ length: 200 }, (_, i) => 'c' + i).join(',');
    const r = lerFiltros(P('cidade=' + muitos + '&q=' + 'a'.repeat(5000) + '&codigos=' + Array.from({ length: 100 }, (_, i) => 'EH-' + i).join(',')));
    assert.equal(r.filtros.cidades.length, 30); assert.equal(r.filtros.q.length, 80); assert.equal(r.filtros.codigos.length, 50);
  });
  test('serialização é inversa da leitura (URL estável e compartilhável)', () => {
    const entrada = 'q=toyota&cidade=toyota,okazaki&planta=4ldk&precoMax=30000000&estado=novo&ordem=preco_asc&pagina=3';
    const r = lerFiltros(P(entrada));
    const saida = filtrosParaParams(r.filtros, r.ordem, r.pagina).toString();
    const r2 = lerFiltros(P(saida));
    assert.deepEqual(r2.filtros, r.filtros); assert.equal(r2.ordem, r.ordem); assert.equal(r2.pagina, r.pagina);
    assert.ok(!saida.includes('ordem=recentes'), 'padrão não vai para a URL');
  });
  test('texto sem acento acha cidade com acento', () => {
    assert.equal(chave('São Paulo'), 'sao paulo');
    assert.equal(chave('  Okazaki '), 'okazaki');
  });
});

describe('aplicação dos filtros', () => {
  test('múltiplas cidades somam (OU), demais filtros restringem (E)', () => {
    const r = aplicarFiltros(ACERVO, lerFiltros(P('cidade=toyota,okazaki&planta=4ldk')).filtros);
    assert.deepEqual(r.map((c) => c.id), ['1000001']);
  });
  test('faixa de preço inclusive', () => {
    const r = aplicarFiltros(ACERVO, lerFiltros(P('precoMin=19800000&precoMax=29800000')).filtros);
    assert.deepEqual(r.map((c) => c.id).sort(), ['1000001', '1000002']);
  });
  test('planta japonesa é preservada, nunca convertida em quartos', () => {
    const r = aplicarFiltros(ACERVO, lerFiltros(P('planta=4SLDK')).filtros);
    assert.deepEqual(r.map((c) => c.planta), ['4SLDK']);
    assert.equal(Cartao.cartao(r[0]).includes('>4SLDK<'), true);
  });
  test('campo ausente não exclui (estação, estacionamento)', () => {
    const semEstacao = aplicarFiltros(ACERVO, lerFiltros(P('estacaoMax=15')).filtros).map((c) => c.id);
    assert.ok(semEstacao.includes('1000003'), 'Tsu não informa caminhada e continua');
    assert.ok(!semEstacao.includes('1000004'), '25 min é excluído');
    const comEst = aplicarFiltros(ACERVO, lerFiltros(P('estacionamento=com')).filtros).map((c) => c.id);
    assert.ok(comEst.includes('1000003'), 'não informado continua');
    assert.ok(!comEst.includes('1000002'), '"なし" sai');
  });
  test('novo/usado, entrega e fotos reais', () => {
    assert.deepEqual(aplicarFiltros(ACERVO, lerFiltros(P('estado=usado')).filtros).map((c) => c.id), ['1000002']);
    assert.deepEqual(aplicarFiltros(ACERVO, lerFiltros(P('entrega=prevista')).filtros).map((c) => c.id), ['1000003']);
    assert.ok(!aplicarFiltros(ACERVO, lerFiltros(P('fotos=reais')).filtros).some((c) => c.id === '1000003'));
  });
  test('codigos= devolve só os pedidos, em qualquer caixa', () => {
    const cod = ACERVO[1].codigo;
    const r = aplicarFiltros(ACERVO, lerFiltros(P('codigos=' + cod.toLowerCase() + ',EH-NAOEXISTE')).filtros);
    assert.deepEqual(r.map((c) => c.codigo), [cod]);
  });
  test('busca livre por código e por estação, tolerante a caixa', () => {
    assert.equal(aplicarFiltros(ACERVO, lerFiltros(P('q=' + ACERVO[0].codigo.toLowerCase())).filtros).length, 1);
    assert.equal(aplicarFiltros(ACERVO, lerFiltros(P('q=三河高浜')).filtros).length, 2);
  });
});

describe('texto que é nome de lugar', () => {
  test('"Hekinan" digitado com outras cidades marcadas substitui o filtro de cidade', () => {
    const pedido = resolverLocal(lerFiltros(P('q=Toyota&prefeitura=aichi&cidade=okazaki,tsu')), ACERVO);
    assert.deepEqual(pedido.filtros.cidades, ['toyota']);
    assert.deepEqual(pedido.filtros.prefeituras, []);
    assert.equal(pedido.filtros.q, null);
    assert.equal(pedido.localResolvido, true);
  });
  test('texto que não é lugar fica como texto', () => {
    const pedido = resolverLocal(lerFiltros(P('q=EH-1234')), ACERVO);
    assert.equal(pedido.filtros.q, 'eh-1234'); assert.ok(!pedido.localResolvido);
  });
});

describe('ordenação', () => {
  test('cada ordem tem rótulo e explicação; não existe "recomendados"', () => {
    for (const o of Object.values(ORDENS)) { assert.ok(o.rotulo && o.explica && typeof o.cmp === 'function'); }
    assert.ok(!ORDENS.recomendados); assert.equal(ORDEM_PADRAO, 'recentes');
  });
  test('estável e com nulos por último', () => {
    const r = buscar(ACERVO, { filtros: lerFiltros(P('')).filtros, ordem: 'estacao_asc', porPagina: 10, pagina: 1 });
    assert.equal(r.itens.at(-1).id, '1000003', 'sem caminhada vai para o fim');
    const r2 = buscar([...ACERVO].reverse(), { filtros: lerFiltros(P('')).filtros, ordem: 'preco_asc', porPagina: 10, pagina: 1 });
    assert.deepEqual(r2.itens.map((c) => c.preco), [12800000, 19800000, 29800000, 44900000]);
  });
  test('paginação: página além do fim volta para a última, total correto', () => {
    const r = buscar(ACERVO, { filtros: lerFiltros(P('')).filtros, ordem: 'recentes', porPagina: 3, pagina: 9 });
    assert.equal(r.totalPaginas, 2); assert.equal(r.pagina, 2); assert.equal(r.itens.length, 1); assert.equal(r.total, 4);
  });
});

describe('facetas e estado vazio', () => {
  test('facetas mantêm opções zeradas com a província de cada cidade', () => {
    const f = facetas(ACERVO, lerFiltros(P('prefeitura=mie')).filtros);
    const toyota = f.cidades.find((c) => c.chave === 'toyota');
    assert.equal(toyota.total, 0); assert.equal(toyota.prefeitura, 'Aichi');
    assert.equal(f.cidades.find((c) => c.chave === 'tsu').total, 1);
    assert.equal(f.estado.novo + f.estado.usado, 1);
  });
  test('Mie + Toyota → zero, e o diagnóstico aponta o filtro que mais pesa', () => {
    const filtros = lerFiltros(P('prefeitura=mie&cidade=toyota')).filtros;
    assert.equal(aplicarFiltros(ACERVO, filtros).length, 0);
    const d = diagnosticoVazio(ACERVO, filtros);
    assert.deepEqual(d.ativos.sort(), ['cidades', 'prefeituras']);
    // tirar Toyota devolve 1 (o de Mie); tirar Mie devolve 2 (os de Toyota) → Mie pesa mais
    assert.equal(d.sugestoes[0].filtro, 'prefeituras');
    assert.equal(d.sugestoes[0].voltariam, 2);
    assert.equal(d.sugestoes[1].filtro, 'cidades');
    assert.equal(d.sugestoes[1].voltariam, 1);
  });
});

describe('view model e formatação', () => {
  test('JPY no locale do público e 万円 exato', () => {
    assert.equal(formatarYen(29800000), '¥29.800.000');
    assert.equal(formatarMan(29800000), '2.980 万円');
    assert.equal(formatarMan(23490000), '2.349 万円');
    assert.equal(formatarYen(null), null);
  });
  test('era japonesa vira ano', () => { assert.equal(ACERVO[1].ano.ano, 2018); });
  test('entrega classificada e prevista legível', () => {
    assert.equal(classeEntrega('予定 2026年09月下旬'), 'prevista');
    assert.equal(entregaPrevistaPt('予定 2026年09月下旬'), 'previsão: fim de setembro de 2026');
    assert.equal(classeEntrega('契約後'), 'combinar');
  });
  test('estacionamento: sim / não / não informado — nunca "0 vagas" inventado', () => {
    assert.equal(ACERVO[0].temEstacionamento, true);
    assert.equal(ACERVO[1].temEstacionamento, false);
    assert.equal(ACERVO[2].temEstacionamento, null);
  });
  test('verificadoEm e fonte vêm do dado real', () => {
    assert.equal(ACERVO[0].verificadoEm, '2026-09-10'); assert.equal(ACERVO[0].fonteRotulo, 'ATBB (at home)');
  });
});

describe('card', () => {
  test('omite o que não existe, nunca imprime 0/NaN/undefined', () => {
    const html = Cartao.cartao(ACERVO[2], {});
    assert.ok(!/NaN|undefined|>0 </.test(html));
    assert.ok(!html.includes('min a pé'), 'sem caminhada, sem linha de caminhada');
    assert.ok(html.includes('Fotos sob consulta'));
    assert.ok(html.includes('Entrega prevista para fim de setembro de 2026'));
  });
  test('um link acessível de navegação, foto fora da tabulação, botões separados', () => {
    const html = Cartao.cartao(ACERVO[0], { favorito: true });
    assert.equal((html.match(/aria-label="Ver detalhes: /g) || []).length, 1);
    assert.ok(html.includes('class="casa__foto" href="/comprar/imoveis/') && html.includes('tabindex="-1" aria-hidden="true"'));
    assert.ok(html.includes('data-favoritar="' + ACERVO[0].codigo + '"') && html.includes('aria-pressed="true"'));
    assert.ok(html.includes('data-comparar="' + ACERVO[0].codigo + '"'));
    assert.ok(html.includes('Verificado em 10/09'));
  });
  test('no máximo dois selos, e só com regra real', () => {
    const html = Cartao.cartao(ACERVO[2], {});
    assert.ok((html.match(/class="selo/g) || []).length <= 2);
    assert.ok(!Cartao.cartao(casa({ created_at: '2026-01-01T00:00:00Z' }), {}).includes('Novo anúncio'));
  });
  test('texto do anúncio é escapado (nunca vira HTML)', () => {
    const html = Cartao.cartao(casa({ cidade_pt: '<img src=x onerror=alert(1)>' }), {});
    assert.ok(!html.includes('<img src=x'));
    assert.ok(html.includes('&lt;img'));
  });
});
