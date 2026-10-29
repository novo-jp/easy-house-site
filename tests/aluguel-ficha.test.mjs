/**
 * A ficha de cada apartamento de aluguel — /imoveis/<slug>.
 *
 * Criada em 29/10/2026: até então o acervo de aluguel tinha lista e nada
 * mais, e quem queria detalhe era mandado para o portal japonês de atacado.
 * 2.287 apartamentos sem página própria é 2.287 páginas que buscador nenhum
 * podia indexar.
 *
 * O que estes testes guardam:
 *  - o slug vai e volta (um apartamento, uma URL estável);
 *  - a ficha nunca afirma o que a fonte não disse (0 não vira "não cobra",
 *    pet sem conferência não vira "aceita");
 *  - o aluguel é marcado como preço POR MÊS nos dados estruturados — sem
 *    isso o Google lê ¥26.000 como preço de venda do imóvel;
 *  - nenhum link manda o visitante para o DK Portal.
 *
 * Rodar: node --test tests/
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { normalizarAluguel, slugDeAluguel, codigoDoSlugAluguel } from '../lib/aluguel.mjs';
import { paginaApartamento, relacionados } from '../lib/aluguel-ficha.mjs';

/** Uma linha crua do portal, como vem do Supabase. */
function linha(extra = {}) {
  return {
    id: 1374587, titulo: 'グリーンハイツＫＯＴＯ', endereco: '愛知県一宮市多加木５丁目８番１号',
    cidade: '一宮市', cidade_pt: 'Ichinomiya', estacao: '名古屋鉄道名古屋本線 島氏永駅',
    minutos_estacao: 19, aluguel: 43000, condominio: 2800, planta: '3DK', area: 51.91,
    foto_url: 'https://image.eheya.net/x.jpg', foto_planta: 'https://image.eheya.net/p.gif',
    dk_url: 'https://front.dk-portal.jp/p/h/abc', disponivel_de: '即入居可',
    pet: true, internet: false, updated_at: '2026-10-28T22:08:53Z',
    tem_estacionamento: true, estacionamento: 4400, deposito: 0, luva: 0,
    pet_verificado_em: '2026-09-22T22:10:46Z', ...extra,
  };
}

describe('slug do apartamento', () => {
  test('tem a forma tipo-planta-cidade-codigo e volta ao código', () => {
    const a = normalizarAluguel(linha());
    assert.equal(a.slug, 'apartamento-3dk-ichinomiya-dk1374587');
    assert.equal(codigoDoSlugAluguel(a.slug), '1374587');
  });

  test('aceita o código puro, para link antigo não morrer', () => {
    assert.equal(codigoDoSlugAluguel('1374587'), '1374587');
  });

  test('devolve null para slug sem código — a ficha responde 404, não adivinha', () => {
    assert.equal(codigoDoSlugAluguel('apartamento-sem-codigo'), null);
    assert.equal(codigoDoSlugAluguel(''), null);
    assert.equal(codigoDoSlugAluguel(null), null);
  });

  test('tira acento e espaço da cidade', () => {
    const a = normalizarAluguel(linha({ cidade_pt: 'Anjo ', planta: '1LDK' }));
    assert.match(a.slug, /^apartamento-1ldk-anjo-dk\d+$/);
  });
});

describe('ficha do apartamento', () => {
  const a = normalizarAluguel(linha());
  const html = paginaApartamento(a, []);

  test('o título e o canonical trazem o que a pessoa procura', () => {
    assert.match(html, /<title>Apartamento 3DK para alugar em Ichinomiya por ¥43\.000\/mês/);
    assert.match(html, /<link rel="canonical" href="https:\/\/easyhouse\.homes\/imoveis\/apartamento-3dk-ichinomiya-dk1374587"/);
  });

  test('publica o custo mensal e a entrada, que é o que ninguém mais publica', () => {
    assert.match(html, /Custo mensal total/);
    assert.match(html, /初期費用/);
    assert.match(html, /仲介手数料/);        // a entrada vem item a item
  });

  test('o aluguel é preço por mês nos dados estruturados', () => {
    const dados = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
    const produto = dados['@graph'].find((i) => i['@type'] === 'Product');
    const spec = produto.offers.priceSpecification;
    assert.equal(spec['@type'], 'UnitPriceSpecification');
    assert.equal(spec.price, 43000);
    assert.equal(spec.unitCode, 'MON');
    // Sem `price` solto na oferta: seria lido como preço de venda.
    assert.equal(produto.offers.price, undefined);
  });

  test('nenhum link leva ao portal de atacado', () => {
    assert.ok(!html.includes('dk-portal.jp'), 'a ficha não pode mandar o visitante para a fonte');
  });

  test('diz a data da última verificação e não promete disponibilidade', () => {
    assert.match(html, /28\/10\/2026/);
    assert.match(html, /pode ter sido alugada desde então/);
  });

  test('depósito e luva zerados são omitidos, não viram "não cobra"', () => {
    // `positivo()` devolve null tanto para 0 quanto para ausente: afirmar
    // "não cobra" a partir disso seria inventar em nome do proprietário.
    assert.ok(!html.includes('敷金'), 'depósito ausente não deve aparecer');
    assert.ok(!html.includes('礼金'), 'luva ausente não deve aparecer');
  });

  test('pet sem conferência não vira afirmação', () => {
    const semConferir = normalizarAluguel(linha({ pet_verificado_em: null, pet: true }));
    const h = paginaApartamento(semConferir, []);
    assert.equal(semConferir.pet, null);
    assert.ok(!/Aceita pet[^<]*<\/th><td>Sim/.test(h));
    assert.match(h, /só aparecem quando a Easy House confere/);
  });
});

describe('apartamentos relacionados', () => {
  test('prioriza a mesma cidade e não repete o próprio', () => {
    const base = normalizarAluguel(linha());
    const mesmaCidade = normalizarAluguel(linha({ id: 2, titulo: 'B' }));
    const outraCidade = normalizarAluguel(linha({ id: 3, titulo: 'C', cidade_pt: 'Toyota' }));
    const r = relacionados(base, [base, mesmaCidade, outraCidade], 6);
    assert.ok(!r.some((x) => x.codigo === base.codigo), 'não repete o próprio');
    assert.equal(r[0].codigo, '2', 'mesma cidade primeiro');
  });
});
