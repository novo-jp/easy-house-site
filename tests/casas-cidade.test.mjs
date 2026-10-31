/**
 * Páginas por cidade — /casas-a-venda/<cidade>.
 *
 * Criadas em 31/10/2026. A lista filtrada (`/comprar/imoveis?cidade=x`) é
 * `noindex` de propósito, então nenhuma página do site mirava "casa à venda
 * em Nishio" — que é como a busca é feita em português.
 *
 * O que estes testes guardam:
 *  - os números são os do acervo, não texto fixo (é o que separa esta página
 *    de uma doorway page: as 5 /simular/<cidade> são 99,8% iguais entre si);
 *  - 0 significa coisas opostas conforme o campo — em preço e área é dado
 *    ausente, em idade é "casa nova". A mediana já errou isso uma vez;
 *  - cidade sem acervo não vira página magra;
 *  - só cidade com acervo suficiente é anunciada ao Google.
 *
 * Rodar: node --test tests/
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { estatisticas, cidadesComPagina, acharCidade, acharProvincia, paginaCidade, paginaProvincia,
         paginaHub, paginaTipo, urlsRegionais, slugCidade, cidadeJpSemBairro, ehNova,
         MINIMO_PARA_SITEMAP } from '../lib/casas-cidade.mjs';

/** Casa normalizada, só com o que a página de cidade lê. */
function casa(over = {}) {
  return {
    codigo: 'EH-1', slug: 'casa-3ldk-nishio-eh1', titulo: 'Casa 3LDK em Nishio',
    cidade: 'Nishio', cidadeJp: '西尾市', prefeitura: 'Aichi',
    preco: 30000000, precoFormatado: '¥30.000.000', precoMan: '3.000 万円',
    planta: '3LDK', areaConstruida: 100, areaTerreno: 150, idade: 0,
    vaga: { vagas: 1, pt: 'Com vaga' }, acesso: { estacao: '西尾', minutosAPe: 10 },
    estimativa: { valor: 90000 }, fotos: [], destaquesLista: [], ...over,
  };
}

describe('estatísticas da cidade', () => {
  test('preço: mínimo, máximo e mediana vêm do acervo', () => {
    const s = estatisticas([casa({ preco: 10e6 }), casa({ preco: 20e6 }), casa({ preco: 60e6 })]);
    assert.equal(s.total, 3);
    assert.equal(s.precoMin, 10e6);
    assert.equal(s.precoMax, 60e6);
    assert.equal(s.precoMediana, 20e6);
  });

  test('idade 0 é "casa nova" e entra na mediana; preço 0 é ausente e não entra', () => {
    // O bug: a mediana descartava todo zero. Com 4 casas novas e 2 usadas, a
    // mediana de idade saía das usadas — a página dizia "3 anos" onde 54 das
    // 56 casas eram novas.
    const casas = [casa({ idade: 0 }), casa({ idade: 0 }), casa({ idade: 0 }), casa({ idade: 0 }),
                   casa({ idade: 2 }), casa({ idade: 3 })];
    const s = estatisticas(casas);
    assert.equal(s.idadeMediana, 0, 'maioria nova → mediana nova');
    assert.equal(s.novas, 4);

    // Preço ausente vem como 0/null e não pode puxar a mediana para baixo.
    const comVazio = estatisticas([casa({ preco: 0 }), casa({ preco: 30e6 }), casa({ preco: 40e6 })]);
    assert.equal(comVazio.precoMin, 30e6);
    assert.equal(comVazio.precoMediana, 35e6);
  });

  test('conta plantas e estações, da mais comum para a menos', () => {
    const s = estatisticas([
      casa({ planta: '4LDK' }), casa({ planta: '3LDK' }), casa({ planta: '4LDK' }),
    ]);
    assert.deepEqual(s.plantas[0], ['4LDK', 2]);
  });
});

describe('quais cidades têm página', () => {
  const acervo = [
    ...Array.from({ length: 7 }, () => casa()),
    ...Array.from({ length: 2 }, () => casa({ cidade: 'Anjo', cidadeJp: '安城市' })),
  ];

  test('só entra no sitemap a cidade com acervo suficiente', () => {
    const anunciadas = cidadesComPagina(acervo, MINIMO_PARA_SITEMAP).map((c) => c.chave);
    assert.deepEqual(anunciadas, ['nishio'], 'Anjo tem 2 casas: página magra não se anuncia');
    // Mas a página existe, para o link da busca não morrer.
    assert.ok(acharCidade(acervo, 'anjo'));
  });

  test('a chave da URL não tem acento nem maiúscula', () => {
    const c = cidadesComPagina([casa({ cidade: 'Anjō' })], 1)[0];
    assert.equal(c.chave, 'anjo');
  });

  test('cidade fora do acervo não tem página', () => {
    assert.equal(acharCidade(acervo, 'kyoto'), null);
    assert.equal(acharCidade(acervo, ''), null);
  });
});

describe('a página', () => {
  const casas = [casa({ preco: 17.9e6, slug: 'a' }), casa({ preco: 27.9e6, slug: 'b' }), casa({ preco: 37.8e6, slug: 'c' })];
  const cidade = { chave: 'nishio', nome: 'Nishio', nomeJp: '西尾市', prefeitura: 'Aichi' };
  const html = paginaCidade({ cidade, casas, alugueis: [] });

  test('título e canonical miram a cidade', () => {
    assert.match(html, /<title>3 casas à venda em Nishio, Aichi a partir de ¥17\.900\.000/);
    assert.match(html, /canonical" href="https:\/\/easyhouse\.homes\/casas-a-venda\/nishio"/);
  });

  test('publica os números daquela cidade', () => {
    assert.match(html, /¥17\.900\.000 a ¥37\.800\.000/);
    assert.match(html, /¥27\.900\.000/);          // mediana
  });

  test('lista as casas da mais barata para a mais cara', () => {
    const ordem = [...html.matchAll(/\/comprar\/imoveis\/([abc])"/g)].map((m) => m[1]);
    assert.equal(ordem[0], 'a', 'a mais barata primeiro');
  });

  test('declara ItemList com as casas, para o buscador', () => {
    const dados = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
    const lista = dados['@graph'].find((i) => i['@type'] === 'ItemList');
    assert.equal(lista.numberOfItems, 3);
    assert.equal(lista.itemListElement.length, 3);
  });

  test('nunca promete aprovação de crédito', () => {
    const texto = html.replace(/<[^>]+>/g, ' ');
    assert.doesNotMatch(texto, /crédito aprovado|aprovação garantida|financiamento garantido/i);
    assert.match(texto, /não é instituição financeira|não aprova crédito/i);
  });

  test('duas cidades diferentes geram páginas diferentes', () => {
    const outra = paginaCidade({
      cidade: { chave: 'anjo', nome: 'Anjo', nomeJp: '安城市', prefeitura: 'Aichi' },
      casas: [casa({ cidade: 'Anjo', preco: 44e6, slug: 'd' })], alugueis: [],
    });
    const limpo = (s) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    assert.notEqual(limpo(html), limpo(outra));
    assert.match(limpo(outra), /Anjo/);
    assert.doesNotMatch(limpo(outra), /¥27\.900\.000/);
  });
});

describe('as /simular/<cidade> antigas', () => {
  // Eram cópias do simulador com o nome da cidade no título: 99,8% de texto
  // igual entre si e paradas no HTML de agosto. Em 60 dias somaram 29 de
  // 12.020 eventos. Viraram 301 para a página da cidade, que responde à
  // mesma pergunta com os números do acervo.
  const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  const sitemap = readFileSync(new URL('../sitemap.xml', import.meta.url), 'utf8');

  for (const c of ['hekinan', 'takahama', 'nishio', 'anjo', 'kariya']) {
    test(`/simular/${c} redireciona de vez para /casas-a-venda/${c}`, () => {
      const r = vercel.redirects.find((x) => x.source === `/simular/${c}`);
      assert.ok(r, 'redirecionamento ausente');
      assert.equal(r.destination, `/casas-a-venda/${c}`);
      assert.equal(r.permanent, true, '301, para o buscador transferir a página');
    });
  }

  test('nenhuma delas é anunciada no sitemap', () => {
    assert.doesNotMatch(sitemap, /\/simular\/[a-z]/);
  });
});

/* ───────────────────────────────────────────────────────────────────────────
   Briefing SEO Tokai (31/10/2026): províncias, hub, novas/usadas, espanhol
   ─────────────────────────────────────────────────────────────────────────── */

const acervo = [
  ...Array.from({ length: 6 }, (_, i) => casa({ slug: `n${i}`, preco: (20 + i) * 1e6 })),
  ...Array.from({ length: 5 }, (_, i) => casa({ slug: `t${i}`, cidade: 'Toyota', cidadeJp: '豊田市', preco: 30e6, construcaoNova: false, idade: 12 })),
  ...Array.from({ length: 5 }, (_, i) => casa({ slug: `s${i}`, cidade: 'Suzuka', cidadeJp: '鈴鹿市', prefeitura: 'Mie', preco: 25e6 })),
  casa({ slug: 'k1', cidade: 'Shizuoka', cidadeJp: '静岡市', prefeitura: 'Shizuoka' }),   // fora do escopo
];

describe('escopo: só Aichi, Mie e Gifu', () => {
  test('casa de outra província não gera página', () => {
    assert.equal(acharCidade(acervo, 'shizuoka'), null);
    assert.ok(!cidadesComPagina(acervo).some((c) => c.chave === 'shizuoka'));
  });

  test('província sem estoque não tem página (Gifu hoje)', () => {
    assert.equal(acharProvincia(acervo, 'gifu'), null);
    assert.ok(acharProvincia(acervo, 'mie'));
  });

  test('cidade com o nome da província ganha -shi, e a URL não colide', () => {
    assert.equal(slugCidade('Gifu'), 'gifu-shi');
    assert.equal(slugCidade('Nishio'), 'nishio');
    assert.equal(acharCidade(acervo, 'aichi'), null, 'aichi é província, não cidade');
  });

  test('bairro (区) não vira nome da cidade', () => {
    // O acervo grava 名古屋市港区; a página é de 名古屋市.
    assert.equal(cidadeJpSemBairro('名古屋市港区'), '名古屋市');
    assert.equal(cidadeJpSemBairro('西尾市'), '西尾市');
  });

  test('nova é o que o anúncio classifica como 新築, não a idade', () => {
    assert.equal(ehNova(casa({ construcaoNova: true, idade: 1 })), true);
    assert.equal(ehNova(casa({ construcaoNova: false, idade: 0 })), false);
  });
});

describe('as duas línguas', () => {
  const cidade = acharCidade(acervo, 'nishio');
  const pt = paginaCidade({ cidade, casas: cidade.casas, todas: acervo, lang: 'pt' });
  const es = paginaCidade({ cidade, casas: cidade.casas, todas: acervo, lang: 'es' });
  const texto = (h) => h.replace(/<script.*?<\/script>/gs, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

  test('cada uma declara o próprio idioma e canonical', () => {
    assert.match(pt, /<html lang="pt-BR"/);
    assert.match(es, /<html lang="es"/);
    assert.match(pt, /canonical" href="https:\/\/easyhouse\.homes\/casas-a-venda\/nishio"/);
    assert.match(es, /canonical" href="https:\/\/easyhouse\.homes\/es\/casas-en-venta\/nishio"/);
  });

  test('hreflang recíproco: uma aponta para a outra, com x-default em português', () => {
    for (const h of [pt, es]) {
      assert.match(h, /hreflang="pt-BR" href="https:\/\/easyhouse\.homes\/casas-a-venda\/nishio"/);
      assert.match(h, /hreflang="es" href="https:\/\/easyhouse\.homes\/es\/casas-en-venta\/nishio"/);
      assert.match(h, /hreflang="x-default" href="https:\/\/easyhouse\.homes\/casas-a-venda\/nishio"/);
    }
  });

  test('a página em espanhol não tem menu nem texto em português', () => {
    const t = texto(es.replace(/<[^>]+lang="(pt-BR|ja)"[^>]*>.*?<\/[a-z0-9]+>/gs, ' '));
    assert.doesNotMatch(t, /\b(você|não|também|à venda|Falar no WhatsApp|Início)\b/);
    assert.match(t, /Casas en venta en Nishio/);
    assert.match(t, /Hablar por WhatsApp/);
  });

  test('em espanhol, o link para a ficha avisa que ela está em português', () => {
    assert.match(es, /Ver ficha \(en portugués\)/);
    assert.match(es, /hreflang="pt-BR"/);
  });

  test('a comunidade brasileira aparece só em português, com fonte e data', () => {
    assert.match(texto(pt), /Moram em Nishio 4\.107 brasileiros \(dezembro de 2025\)/);
    assert.match(pt, /e-stat\.go\.jp/);
    assert.doesNotMatch(texto(es), /4\.107/);
  });

  test('nenhuma das duas afirma que o Flat 35 aceita quem não tem visto permanente', () => {
    for (const h of [pt, es]) assert.match(texto(h), /永住者.*特別永住者/);
  });

  test('a mensagem pré-preenchida do WhatsApp diz só a cidade', () => {
    const msg = decodeURIComponent(pt.match(/wa\.me\/\d+\?text=([^"]+)"[^>]*data-cta="seo_whatsapp"/)[1]);
    assert.equal(msg, 'Olá! Quero comprar casa em Nishio. Podemos conversar?');
  });
});

describe('província, hub e tipos', () => {
  test('a província lista as cidades e leva a cada uma', () => {
    const prov = acharProvincia(acervo, 'aichi');
    const h = paginaProvincia({ provincia: prov, casas: prov.casas, lang: 'pt' });
    assert.match(h, /<h1>Casas à venda em Aichi <span lang="ja">\(愛知県\)<\/span>/);
    assert.match(h, /href="\/casas-a-venda\/nishio"/);
    assert.match(h, /href="\/casas-a-venda\/toyota"/);
    assert.doesNotMatch(h, /href="\/casas-a-venda\/suzuka"/, 'Suzuka é de Mie');
  });

  test('o hub mostra Gifu sem prometer casa que não existe', () => {
    const h = paginaHub({ todas: acervo, lang: 'pt' });
    assert.match(h, /Gifu: o acervo ainda não inclui casas desta província/);
    assert.doesNotMatch(h, /href="\/casas-a-venda\/gifu"/);
    assert.match(h, /Receber as chaves/, 'as etapas reais do processo');
  });

  test('novas e usadas separam pelo que o anúncio diz', () => {
    const novas = paginaTipo({ tipo: 'novas', todas: acervo, lang: 'pt' });
    const usadas = paginaTipo({ tipo: 'usadas', todas: acervo, lang: 'pt' });
    assert.match(novas, /11 imóveis/);     // Nishio 6 + Suzuka 5
    assert.match(usadas, /5 imóveis/);     // Toyota
  });
});

describe('sitemap regional', () => {
  test('só entra o que passa no gate, sempre em par pt/es', () => {
    const urls = urlsRegionais(acervo).map((u) => u.loc.replace('https://easyhouse.homes', ''));
    for (const esperado of ['/casas-a-venda', '/es/casas-en-venta', '/casas-a-venda/aichi', '/es/casas-en-venta/aichi',
      '/casas-a-venda/mie', '/casas-a-venda/nishio', '/es/casas-en-venta/nishio', '/casas-a-venda/toyota',
      '/casas-novas', '/es/casas-nuevas', '/casas-usadas', '/es/casas-usadas']) {
      assert.ok(urls.includes(esperado), `faltou ${esperado}`);
    }
    assert.ok(!urls.some((u) => /gifu|shizuoka/.test(u)), 'nada de Gifu (sem estoque) nem de fora do escopo');
    assert.equal(urls.filter((u) => u.startsWith('/es/')).length * 2, urls.length, 'toda URL tem o par');
  });
});
