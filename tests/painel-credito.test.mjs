/**
 * Ficha de crédito — quem pode o quê em api/painel.mjs.
 * Rodar: node --test tests/
 *
 * Roda a função de verdade contra um Supabase em memória
 * (tests/apoio/supabase-falso.mjs): nada daqui toca o banco real.
 *
 * A regra que este arquivo segura: cada corretor vê só as fichas dele, o
 * administrador vê todas, e o cliente não vê ficha nenhuma.
 */

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { criarSupabaseFalso } from './apoio/supabase-falso.mjs';

const BASE = 'http://supabase.falso';
process.env.SUPABASE_URL = BASE;
process.env.SUPABASE_SERVICE_KEY = 'chave-de-teste-que-nao-abre-nada-0123456789';
delete process.env.SESSAO_SEGREDO;

const U = {
  admin: '00000000-0000-4000-8000-000000000001',
  ana: '00000000-0000-4000-8000-000000000002',
  bia: '00000000-0000-4000-8000-000000000003',
  cliente: '00000000-0000-4000-8000-000000000004',
  desativado: '00000000-0000-4000-8000-000000000005',
};
const pessoa = (user_id, usuario, nome, papel, extra = {}) =>
  ({ user_id, usuario, nome, papel, ativo: true, whatsapp: null, ultimo_acesso: null, ...extra });

let falso; let handler; let emitirCookie;

function novoBanco({ comCredito = true } = {}) {
  falso = criarSupabaseFalso({
    tabelas: {
      acomp_usuario: [
        pessoa(U.admin, 'teste-admin', 'Admin Teste', 'admin'),
        pessoa(U.ana, 'teste-ana', 'Ana Teste', 'corretor', { whatsapp: '81 80 0000 0002' }),
        pessoa(U.bia, 'teste-bia', 'Bia Teste', 'corretor'),
        pessoa(U.cliente, 'teste-cliente', 'Cliente Teste', 'cliente'),
        pessoa(U.desativado, 'teste-fora', 'Corretor Desativado', 'corretor', { ativo: false }),
      ],
    },
  });
  if (!comCredito) { delete falso.db.tabelas.acomp_ficha; delete falso.db.tabelas.acomp_config; }
  globalThis.fetch = falso.comoFetch(BASE);
}

/** Chama a função como a Vercel chamaria, já com o cookie de quem está logado. */
async function chamar(quem, metodo, acao, dados = {}) {
  const req = {
    method: metodo,
    url: metodo === 'GET' ? `/api/painel?${new URLSearchParams({ acao, ...dados })}` : '/api/painel',
    headers: { host: 'localhost:3000', 'content-type': 'application/json', 'x-painel': '1' },
    body: metodo === 'GET' ? undefined : { acao, ...dados },
  };
  if (quem) req.headers.cookie = emitirCookie(req, U[quem]).split(';')[0];
  const res = {
    cabecalhos: {}, codigo: 200, corpo: null,
    setHeader(k, v) { this.cabecalhos[k] = v; },
    status(c) { this.codigo = c; return this; },
    json(o) { this.corpo = o; return this; },
  };
  await handler(req, res);
  return { status: res.codigo, ...res.corpo, corpo: res.corpo };
}
const get = (quem, acao, dados) => chamar(quem, 'GET', acao, dados);
const post = (quem, acao, dados) => chamar(quem, 'POST', acao, dados);

before(async () => {
  novoBanco();
  handler = (await import('../api/painel.mjs')).default;
  ({ emitirCookie } = await import('../lib/painel-sessao.mjs'));
});

describe('quem enxerga as fichas', () => {
  test('cliente e visitante não chegam perto', async () => {
    novoBanco();
    const { id } = await post('ana', 'criar_ficha', { nome: 'Fulano' });
    for (const [metodo, acao, dados] of [
      ['GET', 'fichas', {}], ['GET', 'ficha', { id }], ['GET', 'bancos_credito', {}],
      ['POST', 'criar_ficha', {}], ['POST', 'salvar_ficha', { id, versao: 1, mudanca: { status: 'perdido' } }],
      ['POST', 'apagar_ficha', { id, confirmacao: 'apagar' }], ['POST', 'salvar_bancos', { operacao: 'restaurar' }],
      ['POST', 'ficha_processo', { ficha_id: id, banco: 'rokin' }],
    ]) {
      assert.equal((await chamar('cliente', metodo, acao, dados)).status, 403, `cliente em ${acao}`);
      assert.equal((await chamar(null, metodo, acao, dados)).status, 401, `visitante em ${acao}`);
      assert.equal((await chamar('desativado', metodo, acao, dados)).status, 401, `corretor desativado em ${acao}`);
    }
    assert.equal(falso.db.tabelas.acomp_ficha.length, 1);
    assert.equal(falso.db.tabelas.acomp_ficha[0].status, 'lead');
  });

  test('cada corretor só as dele; o administrador, todas', async () => {
    novoBanco();
    const daAna = (await post('ana', 'criar_ficha', { nome: 'Cliente da Ana' })).id;
    const daBia = (await post('bia', 'criar_ficha', { nome: 'Cliente da Bia' })).id;

    const nomes = async (quem) => (await get(quem, 'fichas')).fichas.map((f) => f.nome).sort();
    assert.deepEqual(await nomes('ana'), ['Cliente da Ana']);
    assert.deepEqual(await nomes('bia'), ['Cliente da Bia']);
    assert.deepEqual(await nomes('admin'), ['Cliente da Ana', 'Cliente da Bia']);

    assert.equal((await get('ana', 'ficha', { id: daAna })).status, 200);
    assert.equal((await get('admin', 'ficha', { id: daBia })).status, 200);
    // 404 e não 403: não confirma à outra corretora que a ficha existe
    assert.equal((await get('bia', 'ficha', { id: daAna })).status, 404);
    assert.equal((await post('bia', 'salvar_ficha', { id: daAna, versao: 1, mudanca: { status: 'perdido' } })).status, 404);
    assert.equal((await post('bia', 'ficha_processo', { ficha_id: daAna, banco: 'rokin' })).status, 404);
    assert.equal(falso.db.tabelas.acomp_ficha.find((f) => f.id === daAna).status, 'lead');
    assert.equal(falso.db.tabelas.acomp_processo.length, 0);
  });

  test('a lista não carrega a ficha inteira, e só o admin recebe os corretores', async () => {
    novoBanco();
    const { id } = await post('ana', 'criar_ficha', { nome: 'Fulano' });
    await post('ana', 'salvar_ficha', { id, versao: 1, mudanca: { ficha: { nome: 'Fulano', renda_anual: 3772280, endereco: 'Rua X' } } });
    const daAna = await get('ana', 'fichas');
    assert.deepEqual(Object.keys(daAna.fichas[0]).sort(), ['atualizado_em', 'corretor_id', 'id', 'nome', 'processo_id', 'renda_anual', 'status']);
    assert.equal(daAna.fichas[0].renda_anual, 3772280);
    assert.deepEqual(daAna.corretores, []);
    assert.ok((await get('admin', 'fichas')).corretores.length >= 3);
  });

  test('trocar o corretor é só do administrador — e muda quem vê', async () => {
    novoBanco();
    const { id } = await post('ana', 'criar_ficha', { nome: 'Fulano' });
    assert.equal((await post('ana', 'salvar_ficha', { id, versao: 1, mudanca: { corretor_id: U.bia } })).status, 403);
    assert.equal((await post('admin', 'salvar_ficha', { id, versao: 1, mudanca: { corretor_id: U.cliente } })).status, 422);
    assert.equal((await post('admin', 'salvar_ficha', { id, versao: 1, mudanca: { corretor_id: U.bia } })).status, 200);
    assert.equal((await get('ana', 'ficha', { id })).status, 404);
    assert.equal((await get('bia', 'ficha', { id })).status, 200);
  });

  test('excluir é só do administrador, e pede confirmação', async () => {
    novoBanco();
    const { id } = await post('ana', 'criar_ficha', { nome: 'Fulano' });
    assert.equal((await post('ana', 'apagar_ficha', { id, confirmacao: 'apagar' })).status, 403);
    assert.equal((await post('admin', 'apagar_ficha', { id })).status, 422);
    assert.equal(falso.db.tabelas.acomp_ficha.length, 1);
    assert.equal((await post('admin', 'apagar_ficha', { id, confirmacao: 'apagar' })).status, 200);
    assert.equal(falso.db.tabelas.acomp_ficha.length, 0);
  });
});

describe('salvar a ficha', () => {
  test('grava só campos conhecidos e mantém o nome da lista igual ao da ficha', async () => {
    novoBanco();
    const { id } = await post('ana', 'criar_ficha', {});
    const r = await post('ana', 'salvar_ficha', {
      id, versao: 1,
      mudanca: { ficha: { nome: 'SILVA JOAO', renda_anual: '3,772,280', campo_inventado: '<script>', permanente: 'sim' }, status: 'ficha' },
    });
    assert.equal(r.status, 200);
    assert.equal(r.versao, 2);
    const linha = falso.db.tabelas.acomp_ficha[0];
    assert.equal(linha.nome, 'SILVA JOAO');
    assert.equal(linha.status, 'ficha');
    assert.deepEqual(linha.ficha, { nome: 'SILVA JOAO', renda_anual: 3772280, permanente: 'sim' });
    assert.equal(linha.corretor_id, U.ana);
    // as outras partes não foram tocadas
    assert.ok(linha.simulacao.custos.length > 0);
  });

  test('status fora do funil e pedido vazio são recusados', async () => {
    novoBanco();
    const { id } = await post('ana', 'criar_ficha', {});
    assert.equal((await post('ana', 'salvar_ficha', { id, versao: 1, mudanca: { status: 'hackeado' } })).status, 422);
    assert.equal((await post('ana', 'salvar_ficha', { id, versao: 1, mudanca: {} })).status, 400);
    assert.equal((await post('ana', 'salvar_ficha', { id, versao: 'x', mudanca: { status: 'pre' } })).status, 400);
    assert.equal(falso.db.tabelas.acomp_ficha[0].versao, 1);
  });

  test('duas telas na mesma ficha: a segunda não apaga a primeira em silêncio', async () => {
    novoBanco();
    const { id } = await post('ana', 'criar_ficha', {});
    assert.equal((await post('ana', 'salvar_ficha', { id, versao: 1, mudanca: { ficha: { nome: 'Tela da Ana' } } })).status, 200);
    // o administrador ainda está com a versão 1 aberta
    const r = await post('admin', 'salvar_ficha', { id, versao: 1, mudanca: { ficha: { nome: 'Tela do admin' } } });
    assert.equal(r.status, 409);
    assert.match(r.erro, /outra tela/);
    assert.equal(falso.db.tabelas.acomp_ficha[0].nome, 'Tela da Ana');
    assert.equal((await post('admin', 'salvar_ficha', { id, versao: 2, mudanca: { status: 'pre' } })).status, 200);
  });

  test('abrir a ficha traz a tabela de bancos e o 融資担当', async () => {
    novoBanco();
    const { id } = await post('ana', 'criar_ficha', { nome: 'Fulano' });
    const d = await get('admin', 'ficha', { id });
    assert.equal(d.ficha.ficha.nome, 'Fulano');
    assert.equal(d.bancos.lista.find((b) => b.id === 'rokin').taxa_real, 1.84);
    // o responsável é o corretor da ficha, mesmo quando é o admin que abre
    assert.deepEqual(d.responsavel, { nome: 'Ana Teste', whatsapp: '81 80 0000 0002' });
  });
});

describe('bancos e taxas', () => {
  test('todos da equipe leem; só o administrador grava', async () => {
    novoBanco();
    const padrao = await get('ana', 'bancos_credito');
    assert.equal(padrao.padrao, true);
    assert.equal(padrao.bancos.lista.find((b) => b.id === 'flat35').taxa_real, 3.92);

    const nova = structuredClone(padrao.bancos);
    nova.lista.find((b) => b.id === 'docomo').taxa_real = '1,65';
    assert.equal((await post('ana', 'salvar_bancos', { bancos: nova })).status, 403);
    const r = await post('admin', 'salvar_bancos', { bancos: nova });
    assert.equal(r.status, 200);
    assert.equal(r.padrao, false);
    assert.equal(r.atualizado_por, 'Admin Teste');
    assert.equal((await get('bia', 'bancos_credito')).bancos.lista.find((b) => b.id === 'docomo').taxa_real, 1.65);

    const ruim = structuredClone(nova); ruim.lista[0].taxa_real = '';
    assert.equal((await post('admin', 'salvar_bancos', { bancos: ruim })).status, 422);
    assert.equal((await post('admin', 'salvar_bancos', { operacao: 'restaurar' })).padrao, true);
  });

  test('a simulação de parcelas do processo abre com o juro do banco do processo', async () => {
    novoBanco();
    const padraoDe = async (banco) => {
      const { id } = await post('ana', 'criar_processo', { cliente_nome: `Cliente ${banco}`, banco });
      return (await get('ana', 'processo', { id })).simulacao_modelo.padrao;
    };
    assert.equal((await padraoDe('rokin')).juros, 1.84);
    assert.equal((await padraoDe('docomo')).juros, 1.7);
    const flat = await padraoDe('flat35');
    assert.deepEqual([flat.juros, flat.juros_financeira], [3.92, 4.09]);

    const tabela = (await get('admin', 'bancos_credito')).bancos;
    tabela.lista.find((b) => b.id === 'rokin').taxa_real = 1.9;
    await post('admin', 'salvar_bancos', { bancos: tabela });
    assert.equal((await padraoDe('rokin')).juros, 1.9);
  });
});

describe('ficha → processo', () => {
  test('cria o processo com nome, corretor e casa; só uma vez', async () => {
    novoBanco();
    const { id } = await post('ana', 'criar_ficha', {});
    assert.equal((await post('ana', 'ficha_processo', { ficha_id: id, banco: 'rokin' })).status, 422);   // sem nome
    await post('ana', 'salvar_ficha', {
      id, versao: 1,
      mudanca: { ficha: { nome: 'SILVA JOAO' }, simulacao: { imovel: '岡崎市細川町 2号棟', preco: 24900000 } },
    });
    assert.equal((await post('ana', 'ficha_processo', { ficha_id: id, banco: 'banco-que-nao-existe' })).status, 422);
    const r = await post('admin', 'ficha_processo', { ficha_id: id, banco: 'flat35' });
    assert.equal(r.status, 200);
    const p = falso.db.tabelas.acomp_processo[0];
    assert.equal(p.cliente_nome, 'SILVA JOAO');
    assert.equal(p.corretor_id, U.ana);                 // o corretor da ficha, não o admin que clicou
    assert.equal(p.banco, 'flat35');
    assert.equal(p.casa_titulo, '岡崎市細川町 2号棟');
    assert.equal(p.casa_preco_yen, 24900000);
    assert.equal(falso.db.tabelas.acomp_etapa.length, 7);
    assert.equal(falso.db.tabelas.acomp_ficha[0].processo_id, r.id);
    assert.equal((await post('ana', 'ficha_processo', { ficha_id: id, banco: 'rokin' })).status, 409);
    assert.equal(falso.db.tabelas.acomp_processo.length, 1);
    // o processo não carrega dado da ficha (renda, dívidas): só nome e casa
    assert.deepEqual(p.extras, {});
  });
});

describe('antes de o SQL rodar', () => {
  test('a lista avisa, criar é recusado com a instrução, e o resto do painel segue', async () => {
    novoBanco({ comCredito: false });
    const lista = await get('ana', 'fichas');
    assert.equal(lista.status, 200);
    assert.equal(lista.disponivel, false);
    const criar = await post('ana', 'criar_ficha', {});
    assert.equal(criar.status, 409);
    assert.match(criar.erro, /acompanhamento-credito\.sql/);

    const bancos = await get('ana', 'bancos_credito');
    assert.equal(bancos.disponivel, false);
    assert.equal(bancos.bancos.lista.length, 4);
    assert.equal((await post('admin', 'salvar_bancos', { bancos: bancos.bancos })).status, 409);

    // processos continuam abrindo, com o juro padrão do código
    const { id } = await post('ana', 'criar_processo', { cliente_nome: 'Fulano', banco: 'docomo' });
    const p = await get('ana', 'processo', { id });
    assert.equal(p.status, 200);
    assert.equal(p.simulacao_modelo.padrao.juros, 1.7);
  });
});
