/* acompanhamento-credito.js — ficha de crédito do corretor.
 *
 * Carregado sob demanda pelo acompanhamento.js, só para a equipe: o cliente
 * nunca baixa este arquivo. Rotas (depois de "#/credito"):
 *
 *     (vazio)           lista de fichas — cada corretor vê as dele
 *     bancos            bancos e taxas (o administrador edita)
 *     <id>/<aba>        uma ficha: ficha · codevedor · credito · simulacao
 *
 * A conta é a de lib/acompanhamento-credito.mjs — a mesma que o servidor usa
 * para limpar o que chega. Aqui não se repete fórmula.
 *
 * Como no resto do painel, tudo que vem do banco entra na tela por
 * textContent (o h() do acompanhamento.js). Nada de innerHTML com dado.
 */

import * as L from '/lib/acompanhamento-credito.mjs?v=2';

let h, get, post, app, dlg, estado, avisar, acao, abrirDialogo, barraEquipe, fmtDataHora, modelos;

const S = {
  f: null,            // a ficha aberta
  bancos: null,       // tabela de bancos e taxas
  corretores: [],     // só para o administrador
  responsavel: null,  // 融資担当 dos documentos impressos
  aba: 'ficha',
  sujo: new Set(),    // partes alteradas e ainda não gravadas
  timer: null,
  salvando: null,
  conflito: false,
  filtro: { q: '', st: '', cor: '' },
  el: {},             // pontos da tela que a conta atualiza sem redesenhar
};

const ABAS = [
  ['ficha', 'Ficha', '申込人'], ['codevedor', 'Co-devedor', '連帯・収入合算'],
  ['credito', 'Crédito', '借入可能額'], ['simulacao', 'Simulação', '資金計画書'],
];
const admin = () => estado.eu?.papel === 'admin';

// ── formatação ───────────────────────────────────────────────────────────────

const yen = (v) => `¥${Math.round(L.num(v)).toLocaleString('ja-JP')}`;
const man = (v) => `${Math.round(L.num(v) / 10000).toLocaleString('ja-JP')}万円`;
const fmtInt = (v) => (v === '' || v === null || v === undefined ? '' : Number(v).toLocaleString('ja-JP'));
const fmtDec = (v) => (v === '' || v === null || v === undefined ? '' : String(v).replace('.', ','));
const tsubo = (m2) => `${(L.dec(m2) * 0.3025).toFixed(2)} 坪`;

const obter = (o, caminho) => caminho.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);
function definir(o, caminho, v) {
  const ks = caminho.split('.');
  let a = o;
  for (let i = 0; i < ks.length - 1; i++) {
    if (a[ks[i]] == null || typeof a[ks[i]] !== 'object') a[ks[i]] = /^\d+$/.test(ks[i + 1]) ? [] : {};
    a = a[ks[i]];
  }
  a[ks.at(-1)] = v;
}

// ── entrada ──────────────────────────────────────────────────────────────────

let pronto = null;

/** Recebe do acompanhamento.js o que ele já tem (h, get, post, diálogo…). */
export function iniciar(ctx) {
  ({ h, get, post, app, dlg, estado, avisar, acao, abrirDialogo, barraEquipe, fmtDataHora, modelos } = ctx);
  pronto ||= new Promise((ok) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/acompanhamento-credito.css?v=2';
    link.onload = link.onerror = () => ok();
    document.head.append(link);
  });
  // Fechar a aba com algo por gravar: manda o que falta sem esperar resposta.
  window.addEventListener('pagehide', () => {
    if (!S.f || !S.sujo.size || S.conflito) return;
    fetch('/api/painel', {
      method: 'POST', keepalive: true, credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-Painel': '1' },
      body: JSON.stringify({ acao: 'salvar_ficha', id: S.f.id, versao: S.f.versao, mudanca: mudancaPendente() }),
    }).catch(() => {});
  });
  window.addEventListener('afterprint', () => document.getElementById('impressao')?.replaceChildren());
  return pronto;
}

export async function rota(resto) {
  await pronto;
  document.body.classList.add('modo-credito');
  const partes = String(resto || '').split('/').filter(Boolean);
  if (!partes.length) { await fecharFicha(); return telaLista(); }
  if (partes[0] === 'bancos') { await fecharFicha(); return telaBancos(); }
  if (/^[0-9a-f-]{36}$/i.test(partes[0])) return abrirFicha(partes[0], partes[1]);
  location.hash = '#/credito';
  return undefined;
}

/** Saindo da área de crédito (outra rota, logout): grava o que falta. */
export async function sair() {
  await fecharFicha();
  document.body.classList.remove('modo-credito');
}

async function fecharFicha() {
  if (!S.f) return;
  await salvarAgora();
  // Saiu da ficha com algo que não gravou (sem rede, por exemplo): avisa, em
  // vez de perder em silêncio.
  if (S.sujo.size && !S.conflito) {
    avisar(`As últimas alterações de ${S.f.ficha?.nome || 'esta ficha'} não foram salvas. Abra a ficha de novo e confira.`);
  }
  clearTimeout(S.timer);
  S.f = null; S.sujo.clear(); S.conflito = false; S.el = {};
}

// ── salvar automático ────────────────────────────────────────────────────────

const mudancaPendente = () => Object.fromEntries([...S.sujo].map((p) => [p, S.f[p]]));

function estadoSalvar(texto, erro = false) {
  if (!S.el.salvar) return;
  S.el.salvar.textContent = texto;
  S.el.salvar.classList.toggle('erro', erro);
}

function marcar(parte) {
  if (S.conflito) return;
  S.sujo.add(parte);
  estadoSalvar('Alterações não salvas…');
  clearTimeout(S.timer);
  S.timer = setTimeout(salvarAgora, 1200);
}

/** Uma gravação por vez; o que mudar no meio vai na seguinte, com a versão nova. */
async function salvarAgora() {
  clearTimeout(S.timer);
  while (S.salvando) await S.salvando;
  const f = S.f;
  if (!f || !S.sujo.size || S.conflito) return;
  const partes = [...S.sujo];
  const mudanca = mudancaPendente();
  S.sujo.clear();
  estadoSalvar('Salvando…');
  S.salvando = (async () => {
    try {
      const r = await post('salvar_ficha', { id: f.id, versao: f.versao, mudanca });
      f.versao = r.versao; f.atualizado_em = r.atualizado_em;
      if (!S.sujo.size) estadoSalvar(`Salvo ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`);
    } catch (e) {
      if (S.f !== f) return;
      for (const p of partes) S.sujo.add(p);
      if (e.status === 409) { S.conflito = true; avisoConflito(e.message); return; }
      if (e.status === 401 || e.status === 404) { S.sujo.clear(); return; }
      estadoSalvar(`Não salvou: ${e.message} Nova tentativa em instantes.`, true);
      S.timer = setTimeout(salvarAgora, 6000);
    }
  })();
  await S.salvando;
  S.salvando = null;
}

function avisoConflito(msg) {
  estadoSalvar('Não salvo — ficha alterada em outra tela', true);
  const recarregar = h('button', { class: 'btn btn--ouro', type: 'button' }, 'Recarregar a ficha');
  recarregar.onclick = () => { const id = S.f?.id; dlg.close(); S.f = null; S.sujo.clear(); S.conflito = false; if (id) abrirFicha(id, S.aba); };
  abrirDialogo(h('div', {},
    h('h2', {}, 'Esta ficha mudou em outra tela'),
    h('p', { class: 'mudo' }, msg),
    h('p', { class: 'mudo pequeno' }, 'Se digitou algo importante agora, copie antes de recarregar.'),
    h('div', { class: 'dlg__btns' },
      h('button', { class: 'btn', type: 'button', onclick: () => dlg.close() }, 'Fechar'), recarregar)));
}

// ── lista ────────────────────────────────────────────────────────────────────

const faltaSql = () => h('div', { class: 'cartao' },
  h('h2', {}, 'Falta um passo para ligar esta área'),
  h('p', { class: 'mudo' }, 'As tabelas das fichas de crédito ainda não existem no banco. Rode o arquivo sql/acompanhamento-credito.sql no SQL Editor do Supabase (uma vez) e recarregue esta página.'));

async function telaLista() {
  const d = await get('fichas');
  const f = S.filtro;
  const nomeCorretor = (id) => d.corretores.find((c) => c.user_id === id)?.nome || (id ? '' : 'sem corretor');

  const caixa = h('div', {});
  const desenhar = () => {
    const q = f.q.trim().toLowerCase();
    const linhas = d.fichas.filter((c) => (!q || (c.nome || '').toLowerCase().includes(q))
      && (!f.st || c.status === f.st) && (!f.cor || c.corretor_id === f.cor));
    caixa.replaceChildren(linhas.length
      ? h('ul', { class: 'lista' }, linhas.map((c) => h('li', {},
        h('a', { class: 'item', href: `#/credito/${c.id}/ficha` },
          h('span', { class: 'item__nome' }, c.nome || '(sem nome)'),
          h('span', { class: `cred-selo cred-selo--${L.statusValido(c.status) ? c.status : 'lead'}` }, L.rotuloStatus(c.status)),
          h('span', { class: 'item__meta' }, [
            c.renda_anual ? `renda ${yen(c.renda_anual)}` : 'renda não informada',
            admin() ? nomeCorretor(c.corretor_id) : null,
            c.processo_id ? 'com processo' : null,
            `atualizado ${fmtDataHora(c.atualizado_em)}`,
          ].filter(Boolean).join(' · '))))))
      : h('div', { class: 'cartao' },
        h('h2', {}, d.fichas.length ? 'Nenhuma ficha com esse filtro' : 'Nenhuma ficha ainda'),
        h('p', { class: 'mudo' }, d.fichas.length ? 'Mude a busca ou o status.' : 'Clique em "+ Novo cliente" para abrir a primeira ficha de crédito.')));
  };

  const busca = h('input', { type: 'search', placeholder: 'Buscar cliente…', value: f.q, 'aria-label': 'Buscar cliente' });
  busca.oninput = () => { f.q = busca.value; desenhar(); };
  const status = h('select', { 'aria-label': 'Status' }, h('option', { value: '' }, 'Todos os status'),
    L.STATUS.map(([k, l]) => h('option', { value: k, selected: f.st === k }, l)));
  status.onchange = () => { f.st = status.value; desenhar(); };
  let corretor = null;
  if (admin() && d.corretores.length) {
    corretor = h('select', { 'aria-label': 'Corretor' }, h('option', { value: '' }, 'Todos os corretores'),
      d.corretores.map((c) => h('option', { value: c.user_id, selected: f.cor === c.user_id }, c.nome)));
    corretor.onchange = () => { f.cor = corretor.value; desenhar(); };
  }
  const novo = h('button', { class: 'btn btn--ouro', type: 'button' }, '+ Novo cliente');
  novo.onclick = () => acao(novo, async () => {
    const r = await post('criar_ficha', {});
    location.hash = `#/credito/${r.id}/ficha`;
  });

  desenhar();
  app.replaceChildren(h('div', { class: 'pilha' },
    h('div', { class: 'barra' }, barraEquipe('credito'), d.disponivel ? novo : null),
    d.disponivel ? [
      h('div', { class: 'cred-filtros' }, busca, status, corretor,
        h('a', { class: 'link', href: '#/credito/bancos' }, 'Bancos e taxas')),
      h('p', { class: 'mudo pequeno', style: 'margin:0' }, admin()
        ? 'Você vê as fichas de todos os corretores. Cada corretor vê só as dele.'
        : 'Aqui aparecem só as suas fichas. O administrador vê as de todos.'),
      caixa,
    ] : faltaSql()));
}

// ── ficha: abrir e desenhar ──────────────────────────────────────────────────

async function abrirFicha(id, aba) {
  if (!S.f || S.f.id !== id) {
    await fecharFicha();
    const d = await get('ficha', { id });
    const base = L.fichaNova();
    for (const k of L.PARTES_DA_FICHA) d.ficha[k] = Object.assign(base[k], d.ficha[k] || {});
    for (const p of ['ficha', 'codevedor']) {
      d.ficha[p].familia ||= []; d.ficha[p].emprestimos ||= [];
    }
    d.ficha.simulacao.custos ||= []; d.ficha.simulacao.tranches ||= [];
    S.f = d.ficha; S.bancos = d.bancos; S.corretores = d.corretores; S.responsavel = d.responsavel;
    S.sujo.clear(); S.conflito = false;
  }
  S.aba = ABAS.some((a) => a[0] === aba) ? aba : 'ficha';
  desenhar(false);
}

function desenhar(manterRolagem = true) {
  const y = window.scrollY;
  const c = S.f;
  S.el = {};

  const titulo = h('h1', { class: 'cred-titulo' }, c.ficha.nome || 'Novo cliente');
  S.el.titulo = titulo;
  const status = h('select', { 'aria-label': 'Status' }, L.STATUS.map(([k, l]) => h('option', { value: k, selected: c.status === k }, l)));
  ligar(status, 'status', 'texto');
  let corretor = null;
  if (admin() && S.corretores.length) {
    corretor = h('select', { 'aria-label': 'Corretor' },
      c.corretor_id ? null : h('option', { value: '', selected: true }, '— sem corretor —'),
      S.corretores.map((p) => h('option', { value: p.user_id, selected: p.user_id === c.corretor_id }, p.nome)));
    corretor.onchange = () => {
      if (!corretor.value) return;
      c.corretor_id = corretor.value;
      S.responsavel = S.corretores.find((p) => p.user_id === c.corretor_id) || null;
      marcar('corretor_id');
    };
  }
  S.el.salvar = h('span', { class: 'cred-salvar', role: 'status' }, S.sujo.size ? 'Alterações não salvas…' : 'Salvo');

  const imprimirFicha = h('button', { class: 'btn btn--mini', type: 'button', onclick: () => imprimir('ficha') }, 'Imprimir ficha (審査シート)');
  const imprimirSim = h('button', { class: 'btn btn--mini', type: 'button', onclick: () => imprimir('sim') }, 'Imprimir 資金計画書');
  const processo = c.processo_id
    ? h('a', { class: 'btn btn--mini', href: `#/p/${c.processo_id}` }, 'Abrir o processo →')
    : h('button', { class: 'btn btn--mini', type: 'button', onclick: dialogoProcesso }, 'Criar processo');
  let excluir = null;
  if (admin()) {
    excluir = h('button', { class: 'btn btn--mini btn--perigo', type: 'button' }, 'Excluir');
    excluir.onclick = () => {
      if (!confirm(`Excluir a ficha de ${c.ficha.nome || 'cliente sem nome'}? Não dá para desfazer.`)) return;
      acao(excluir, async () => {
        clearTimeout(S.timer); S.sujo.clear();
        await post('apagar_ficha', { id: c.id, confirmacao: 'apagar' });
        S.f = null;
        location.hash = '#/credito';
      });
    };
  }

  const corpo = { ficha: () => abaPessoa('ficha'), codevedor: abaCodevedor, credito: abaCredito, simulacao: abaSimulacao }[S.aba]();

  app.replaceChildren(h('div', { class: 'pilha' },
    h('div', { class: 'barra' }, barraEquipe('credito')),
    h('div', { class: 'cred-cabeca' },
      h('a', { class: 'link', href: '#/credito' }, '← Clientes'),
      titulo,
      h('div', { class: 'cred-cabeca__linha' }, status, corretor, S.el.salvar),
      h('div', { class: 'cred-cabeca__linha' }, imprimirFicha, imprimirSim, processo, excluir)),
    h('nav', { class: 'cred-abas', 'aria-label': 'Partes da ficha' }, ABAS.map(([k, rotulo, jp]) =>
      h('a', { class: 'cred-aba', href: `#/credito/${c.id}/${k}`, 'aria-current': S.aba === k ? 'page' : false },
        rotulo, h('small', {}, jp)))),
    corpo));
  atualizarSaidas();
  window.scrollTo(0, manterRolagem ? y : 0);
}

// ── campos ───────────────────────────────────────────────────────────────────

/**
 * Liga um campo a um caminho da ficha ("ficha.nome", "simulacao.custos.2.valor").
 * tipo: texto · iene (inteiro, milhar) · dec (taxa, %, anos, m²) · check.
 * `estrutural` = mudar este campo muda o formulário (redesenha a aba).
 */
function ligar(el, caminho, tipo, estrutural = false) {
  const parte = caminho.split('.')[0];
  const ler = () => {
    if (tipo === 'check') return el.checked;
    if (tipo === 'iene') return el.value.trim() === '' ? '' : L.inteiro(el.value);
    if (tipo === 'dec') return el.value.trim() === '' ? '' : L.dec(el.value);
    return el.value;
  };
  const gravar = () => {
    const v = ler();
    if (obter(S.f, caminho) === v) return false;
    definir(S.f, caminho, v);
    if (caminho === 'ficha.nome') { S.f.nome = v; if (S.el.titulo) S.el.titulo.textContent = v || 'Novo cliente'; }
    marcar(parte);
    return true;
  };
  el.addEventListener('input', () => { if (gravar() && !estrutural) atualizarSaidas(); });
  el.addEventListener('change', () => {
    const mudou = gravar();
    if (tipo === 'iene' && el.value.trim() !== '') el.value = fmtInt(L.inteiro(el.value));
    if (estrutural) desenhar(); else if (mudou) atualizarSaidas();
  });
  return el;
}

function entrada(caminho, o = {}) {
  const v = obter(S.f, caminho) ?? '';
  if (o.opcoes) {
    return ligar(h('select', {}, o.opcoes.map(([k, l]) => h('option', { value: k, selected: String(v) === k }, l))), caminho, 'texto', o.estrutural);
  }
  if (o.tipo === 'area') return ligar(h('textarea', { maxlength: o.max || 4000, rows: 4 }, String(v)), caminho, 'texto');
  const numero = o.tipo === 'iene' || o.tipo === 'dec';
  const el = h('input', {
    type: { data: 'date', tel: 'tel', email: 'email' }[o.tipo] || 'text',
    inputmode: o.tipo === 'iene' ? 'numeric' : o.tipo === 'dec' ? 'decimal' : false,
    value: o.tipo === 'iene' ? fmtInt(v) : o.tipo === 'dec' ? fmtDec(v) : v,
    placeholder: o.ph, maxlength: numero || o.tipo === 'data' ? false : (o.max || 200),
    class: numero ? 'num' : false, 'aria-label': o.aria,
  });
  return ligar(el, caminho, numero ? o.tipo : 'texto', o.estrutural);
}

/** Campo com rótulo. o.jp = termo japonês ao lado; o.saida = texto calculado embaixo. */
/** Campo com texto em japonês: o português aparece embaixo, em letra pequena. */
function comPortugues(el) {
  const pt = h('small', { class: 'cred-pt' }, L.emPortugues(el.value));
  el.addEventListener('input', () => { pt.textContent = L.emPortugues(el.value); });
  return [el, pt];
}

function campo(caminho, rotulo, o = {}) {
  let saida = null;
  if (o.saida) { saida = h('small', { class: 'mudo pequeno' }); S.el[o.saida] = saida; }
  return h('label', { class: `campo${o.classe ? ` ${o.classe}` : ''}` },
    h('span', {}, rotulo, o.jp ? h('small', { class: 'cred-jp' }, o.jp) : null),
    entrada(caminho, o), saida);
}

/** Caixa de marcar que muda o formulário (liga o co-devedor, por exemplo). */
function marcarCaixa(caminho, rotulo, classe) {
  const el = ligar(h('input', { type: 'checkbox', checked: !!obter(S.f, caminho) }), caminho, 'check', true);
  return h('label', { class: `marcar${classe ? ` ${classe}` : ''}` }, el, h('span', {}, rotulo));
}

const cartao = (titulo, jp, ...corpo) => h('section', { class: 'cartao' },
  h('h2', { class: 'cred-h' }, titulo, jp ? h('small', { class: 'cred-jp' }, jp) : null), corpo);

/** Tabela de linhas editáveis (família, empréstimos). */
function linhas(caminho, colunas, rotuloNovo, linhaNova = () => ({})) {
  const parte = caminho.split('.')[0];
  const arr = obter(S.f, caminho) || [];
  const adicionar = h('button', { class: 'btn btn--mini', type: 'button' }, `+ ${rotuloNovo}`);
  adicionar.onclick = () => {
    if (!obter(S.f, caminho)) definir(S.f, caminho, []);
    obter(S.f, caminho).push(linhaNova());
    marcar(parte); desenhar();
  };
  return h('div', {},
    arr.length ? h('div', { class: 'cred-rolagem' }, h('table', { class: 'cred-tabela' },
      h('thead', {}, h('tr', {}, colunas.map((c) => h('th', { class: c.tipo === 'iene' ? 'num' : false }, c.rotulo)), h('th', {}))),
      h('tbody', {}, arr.map((_, i) => h('tr', {},
        colunas.map((c) => h('td', { style: c.largura ? `min-width:${c.largura}px` : false },
          entrada(`${caminho}.${i}.${c.k}`, { ...c, aria: c.rotulo }))),
        h('td', {}, botaoRemover(caminho, i))))))) : null,
    adicionar);
}

function botaoRemover(caminho, i) {
  const b = h('button', { class: 'cred-x', type: 'button', title: 'Remover', 'aria-label': 'Remover linha' }, '✕');
  b.onclick = () => { obter(S.f, caminho).splice(i, 1); marcar(caminho.split('.')[0]); desenhar(); };
  return b;
}

const soma = (rotulo, chave, grande = false) => {
  const v = h('span', { class: 'num' });
  S.el[chave] = v;
  return h('div', { class: `cred-soma${grande ? ' cred-soma--grande' : ''}` }, h('span', {}, rotulo), v);
};

// ── aba: pessoa (requerente e co-devedor usam o mesmo formulário) ────────────

function abaPessoa(P) {
  const requerente = P === 'ficha';
  return h('div', { class: 'pilha' },
    cartao('Dados pessoais', 'お客様について', h('div', { class: 'cred-grade' },
      campo(`${P}.nome`, 'Nome (romaji)', { jp: '氏名', classe: 'c2', ph: 'SOBRENOME NOME', max: 120 }),
      campo(`${P}.furigana`, 'Furigana', { jp: 'フリガナ', classe: 'c2', max: 120 }),
      campo(`${P}.alias`, 'Nome comum', { jp: '通称名/併記名', max: 120 }),
      campo(`${P}.nascimento`, 'Nascimento', { jp: '生年月日', tipo: 'data', saida: 'idade' }),
      campo(`${P}.nacionalidade`, 'Nacionalidade', { jp: '国籍', max: 60 }),
      campo(`${P}.permanente`, 'Visto permanente', { jp: '永住権', opcoes: L.PERMANENTE }),
      campo(`${P}.carteira`, 'Carteira de motorista', { jp: '運転免許証', opcoes: L.SIM_NAO }),
      campo(`${P}.cep`, 'CEP', { jp: '〒', ph: '472-0011', max: 12 }),
      campo(`${P}.endereco`, 'Endereço atual', { jp: '住所', classe: 'c2', max: 240 }),
      campo(`${P}.telefone`, 'Telefone', { jp: '連絡先', tipo: 'tel', max: 30 }),
      campo(`${P}.email`, 'E-mail', { tipo: 'email', classe: 'c2', max: 160 }),
      campo(`${P}.tempo_japao`, 'Tempo no Japão', { jp: '日本での居住期間', ph: '9年8ヶ月', max: 40 }),
      campo(`${P}.tempo_residencia`, 'Tempo na residência atual', { jp: '現住所居住期間', ph: '7年', max: 40 }),
      campo(`${P}.aluguel`, 'Aluguel mensal (¥)', { jp: '家賃', tipo: 'iene' }))),

    cartao('Família — quem vai morar junto', '家族構成（同居予定者）',
      linhas(`${P}.familia`, [
        { k: 'nome', rotulo: 'Nome 氏名', largura: 190, max: 120 },
        { k: 'relacao', rotulo: 'Relação 続柄', largura: 90, max: 40 },
        { k: 'nascimento', rotulo: 'Nascimento 生年月日', tipo: 'data' },
        { k: 'renda', rotulo: 'Renda anual 年収', tipo: 'iene', largura: 120 },
        { k: 'trabalho', rotulo: 'Trabalho/Escola 勤務先・学校', largura: 180, max: 160 },
      ], 'Adicionar familiar')),

    cartao('Trabalho e renda', '勤務先及び収入', h('div', { class: 'cred-grade' },
      campo(`${P}.renda_anual`, 'Renda anual (¥)', { jp: '年収（源泉徴収票）', tipo: 'iene', classe: 'c2' }),
      campo(`${P}.renda_obs`, 'Base da renda', { jp: '根拠', opcoes: L.BASE_RENDA }),
      campo(`${P}.dia_pagamento`, 'Dia do pagamento', { jp: '給料日', ph: '20', max: 20 }),
      h('p', { class: 'cred-sub c4' }, h('strong', {}, 'Empresa contratante (派遣会社)'), ' — se for 派遣'),
      campo(`${P}.haken_nome`, 'Empreiteira', { jp: '派遣元 会社名', classe: 'c2', max: 160 }),
      campo(`${P}.haken_tel`, 'Telefone', { jp: '電話番号', tipo: 'tel', max: 30 }),
      campo(`${P}.haken_cep`, 'CEP', { jp: '〒', max: 12 }),
      campo(`${P}.haken_endereco`, 'Endereço', { jp: '住所', classe: 'c4', max: 240 }),
      h('p', { class: 'cred-sub c4' }, h('strong', {}, 'Local de trabalho (勤務先)')),
      campo(`${P}.empresa`, 'Empresa', { jp: '勤務先 会社名', classe: 'c2', max: 160 }),
      campo(`${P}.empresa_tel`, 'Telefone', { jp: '電話番号', tipo: 'tel', max: 30 }),
      campo(`${P}.empresa_cep`, 'CEP', { jp: '〒', max: 12 }),
      campo(`${P}.empresa_endereco`, 'Endereço', { jp: '住所', classe: 'c2', max: 240 }),
      campo(`${P}.servico`, 'Tipo de serviço', { jp: '業務内容', max: 120 }),
      campo(`${P}.admissao`, 'Data de contratação', { jp: '入社日', tipo: 'data', saida: 'tempoEmp' }),
      campo(`${P}.contrato_tipo`, 'Tipo de contrato', { jp: '雇用形態', opcoes: L.CONTRATOS }),
      campo(`${P}.contrato_prazo`, 'Prazo do contrato', { jp: '契約期間', ph: '3ヶ月更新', max: 60 }),
      campo(`${P}.transporte_atual`, 'Transporte / tempo atual', { jp: '現在の通勤手段・時間', ph: '車 30分', max: 80 }),
      campo(`${P}.transporte_novo`, 'Transporte / tempo casa nova', { jp: '引越し後', ph: '車 30分', max: 80 }))),

    cartao('Empréstimos e cartões atuais', '現在の借入状況',
      h('p', { class: 'mudo pequeno', style: 'margin:0 0 12px' },
        'Carro, cartão parcelado/リボ, キャッシング, 学生ローン… tudo que tiver parcela mensal. Marque "Quitar?" = Sim se o cliente vai quitar antes do 審査.'),
      linhas(`${P}.emprestimos`, [
        { k: 'tipo', rotulo: 'Tipo ローン・カード', largura: 130, max: 80 },
        { k: 'finalidade', rotulo: 'Finalidade 資金使途', largura: 120, max: 80 },
        { k: 'data', rotulo: 'Início 借入日', tipo: 'data' },
        { k: 'valor', rotulo: 'Valor 借入額', tipo: 'iene', largura: 110 },
        { k: 'parcela', rotulo: 'Parcela 月額', tipo: 'iene', largura: 100 },
        { k: 'saldo', rotulo: 'Saldo 残高', tipo: 'iene', largura: 110 },
        { k: 'quitar', rotulo: 'Quitar? 完済予定', opcoes: L.SIM_NAO },
      ], 'Adicionar empréstimo'),
      soma('Total de parcelas mensais', 'divida')),

    cartao('Licença maternidade / auxílio', '産休・育休', h('div', { class: 'cred-grade' },
      campo(`${P}.licenca`, 'Em licença?', { opcoes: L.SIM_NAO }),
      campo(`${P}.licenca_periodo`, 'Período', { jp: '期間', classe: 'c2', max: 120 }),
      campo(`${P}.licenca_retorno`, 'Previsão de retorno', { jp: '復職予定', tipo: 'data' }))),

    requerente ? cartao('Observações internas', null,
      h('label', { class: 'campo', style: 'margin:0' }, entrada('ficha.observacoes', { tipo: 'area', max: 4000 })),
      h('p', { class: 'mudo pequeno', style: 'margin:8px 0 0' }, 'Não saem em nenhum documento impresso.')) : null);
}

function abaCodevedor() {
  const cd = S.f.codevedor;
  return h('div', { class: 'pilha' },
    h('section', { class: 'cartao' },
      marcarCaixa('codevedor.ativo', 'Este cliente tem co-devedor / cônjuge na operação', 'cred-forte'),
      cd.ativo
        ? h('div', { class: 'cred-grade' },
          campo('codevedor.papel', 'Papel na operação', { opcoes: L.PAPEL_CODEVEDOR, classe: 'c2' }),
          campo('codevedor.relacao', 'Relação com o requerente', { jp: '続柄', ph: '妻', max: 40 }))
        : h('p', { class: 'mudo', style: 'margin:0' }, 'Ative para preencher a 連帯 / ペアローン.')),
    // os mesmos cartões da Ficha, agora lendo de "codevedor"
    cd.ativo ? [...abaPessoa('codevedor').children] : null);
}

// ── aba: crédito ─────────────────────────────────────────────────────────────

function abaCredito() {
  const c = S.f;
  const cd = c.codevedor;
  S.el.credAlertas = h('div', { class: 'cred-alertas' });
  S.el.credKpis = h('div', { class: 'cred-kpis' });
  S.el.credBancos = h('div', { class: 'cred-bancos' });
  const quitar = h('input', { type: 'checkbox', checked: c.credito.considerar_quitacao !== false });
  ligar(quitar, 'credito.considerar_quitacao', 'check', true);
  const somar = h('input', { type: 'checkbox', checked: !!c.credito.somar_codevedor, disabled: !cd.ativo });
  ligar(somar, 'credito.somar_codevedor', 'check', true);

  return h('div', { class: 'pilha' },
    cartao('Parâmetros', null,
      h('label', { class: 'marcar' }, quitar, h('span', {}, 'Desconsiderar empréstimos marcados "Quitar = Sim"')),
      h('label', { class: 'marcar' }, somar, h('span', {}, 'Somar renda e dívidas do co-devedor',
        cd.ativo ? null : h('small', { class: 'mudo' }, ' (ative a aba Co-devedor)'))),
      h('div', { class: 'cred-grade' },
        c.credito.somar_codevedor && cd.ativo
          ? campo('credito.pct_codevedor', 'Renda do co-devedor considerada (%)', { tipo: 'dec', ph: '100', classe: 'c2' }) : null,
        c.ficha.nascimento ? null : campo('credito.idade_manual', 'Idade (sem data de nascimento)', { tipo: 'dec', classe: 'c2' }))),
    S.el.credAlertas,
    S.el.credKpis,
    cartao('Limite por banco', '金融機関別 借入可能額',
      S.el.credBancos,
      h('p', { class: 'mudo pequeno', style: 'margin:14px 0 0' },
        'Cálculo: (renda ÷ 12 × 返済負担率 − parcelas atuais) ÷ parcela por ¥1M na 審査金利 × ¥1M. "Casa máx." = empréstimo ÷ fator de custos (padrão 1,1). ',
        h('strong', {}, 'Não procure casa no limite máximo'), ' — a faixa recomendada é 80%. ',
        `Taxas conferidas em ${L.dataJP(S.bancos.conferido_em) || '—'} · `,
        h('a', { href: '#/credito/bancos' }, admin() ? 'editar bancos' : 'ver bancos'), '.')));
}

function pintarCredito() {
  const r = L.credito(S.f, S.bancos.lista);
  const alerta = ([tipo, ...conteudo]) => h('p', { class: `cred-alerta cred-alerta--${tipo}` }, conteudo);
  const alertas = r.alertas.map(alerta);
  if (r.ganhoQuitar && r.ganhoQuitar.ganho > 0) {
    const g = r.ganhoQuitar;
    alertas.unshift(alerta(['info',
      `Quitar as dívidas marcadas (saldo ${yen(g.saldo)}) libera ${yen(g.parcelaLiberada)}/mês e aumenta o limite em `,
      h('strong', {}, man(g.ganho)), ` no ${g.banco}. Use isso na conversa com o cliente.`]));
  }
  S.el.credAlertas.replaceChildren(...alertas);

  const melhor = r.bancos.reduce((a, b) => (b.maxEmp > (a?.maxEmp || 0) ? b : a), null);
  const kpi = (rotulo, valor, sub) => h('div', { class: 'cred-kpi' },
    h('span', {}, rotulo), h('strong', {}, valor), h('small', {}, sub || ' '));
  S.el.credKpis.replaceChildren(
    kpi('Renda considerada 年収', man(r.renda), r.somar
      ? `Req. ${man(r.rendaReq)} + co-dev. ${man(r.rendaCo)}${r.pctCo < 100 ? ` (${fmtDec(r.pctCo)}%)` : ''}` : 'Só requerente'),
    kpi('Parcelas atuais 他債務 月額', yen(r.divida), r.dividaSemQuitar > r.divida ? `${yen(r.dividaSemQuitar)} sem quitar` : ''),
    kpi('Idade 年齢', r.idadeReq ?? '—', ''),
    kpi('Melhor limite', melhor ? man(melhor.maxCasa) : '—', melhor ? `casa máx. · ${melhor.nome}` : ''));

  const linha = (dt, dd) => [h('dt', {}, dt), h('dd', {}, dd)];
  S.el.credBancos.replaceChildren(...r.bancos.map((b) => h('div', { class: `cred-banco${b.maxEmp ? '' : ' cred-banco--zero'}` },
    h('h3', {}, h('span', {}, b.nome), h('small', {}, `${(b.ratio * 100).toFixed(0)}%`)),
    h('span', { class: 'mudo pequeno' }, 'Casa máxima 物件価格'),
    h('strong', { class: 'cred-banco__valor' }, man(b.maxCasa)),
    h('span', { class: 'cred-banco__seguro' }, `Recomendado (80%): ${man(b.casaSegura)}`),
    h('dl', {},
      linha('Empréstimo máx. 借入可能額', man(b.maxEmp)),
      linha('Prazo 返済期間', `${b.prazo} anos`),
      linha('Limite de parcela', yen(Math.max(0, b.limiteParcela))),
      linha('審査金利 / 実行金利', `${fmtDec(b.taxa_aprov)}% / ${fmtDec(b.taxa_real)}%`),
      linha('Parcela real no máx.', yen(b.parcelaReal))))));
}

// ── aba: simulação / 資金計画書 ──────────────────────────────────────────────

function abaSimulacao() {
  const s = S.f.simulacao;
  S.el.simAlertas = h('div', { class: 'cred-alertas' });
  S.el.custoAuto = {};
  S.el.trValor = {}; S.el.trMensal = {};
  const automatico = (l) => (l.k === 'chukai' || l.k === 'jimu');

  const custos = (s.custos || []).map((l, i) => {
    let valor;
    if (automatico(l) && l.auto !== false) {
      valor = h('input', { class: 'num', readonly: true, tabindex: -1, 'aria-label': `${l.nome} (calculado)` });
      S.el.custoAuto[i] = valor;
    } else {
      valor = entrada(`simulacao.custos.${i}.valor`, { tipo: 'iene', aria: 'Valor' });
    }
    let auto = null;
    if (automatico(l)) {
      auto = h('input', { type: 'checkbox', checked: l.auto !== false, title: 'Calcular pela fórmula', 'aria-label': 'Calcular pela fórmula' });
      ligar(auto, `simulacao.custos.${i}.auto`, 'check', true);
    }
    return h('tr', {},
      h('td', { style: 'min-width:150px' }, comPortugues(entrada(`simulacao.custos.${i}.nome`, { max: 60, aria: '名目' }))),
      h('td', { style: 'min-width:170px' }, comPortugues(entrada(`simulacao.custos.${i}.obs`, { max: 120, aria: '備考' }))),
      h('td', { style: 'min-width:110px' }, comPortugues(entrada(`simulacao.custos.${i}.pagar`, { max: 60, aria: '支払先' }))),
      h('td', { style: 'min-width:130px' }, valor),
      h('td', { class: 'centro' }, auto),
      h('td', {}, botaoRemover('simulacao.custos', i)));
  });
  const novoCusto = h('button', { class: 'btn btn--mini', type: 'button' }, '+ Adicionar custo');
  novoCusto.onclick = () => { s.custos.push({ k: `x${Date.now()}`, nome: '', obs: '', pagar: '', valor: 0 }); marcar('simulacao'); desenhar(); };

  const tranches = (s.tranches || []).map((t, i) => {
    const p = `simulacao.tranches.${i}`;
    const modo = entrada(`${p}.modo`, { opcoes: L.MODO_PARCELA, estrutural: true });
    if (t.extra) modo.disabled = true;
    let quanto;
    if (t.extra || t.modo === 'valor') quanto = entrada(`${p}.valor`, { tipo: 'iene', aria: 'Valor' });
    else if (t.modo === 'pct') quanto = entrada(`${p}.pct`, { tipo: 'dec', aria: 'Percentual' });
    else quanto = h('span', { class: 'mudo pequeno' }, 'automático');
    const valor = h('td', { class: 'num' }); const mensal = h('td', { class: 'num forte' });
    S.el.trValor[i] = valor; S.el.trMensal[i] = mensal;
    return h('tr', {},
      h('td', { style: 'min-width:160px' }, comPortugues(entrada(`${p}.nome`, { max: 60, aria: 'Empréstimo' }))),
      h('td', { style: 'min-width:120px' }, modo),
      h('td', { style: 'min-width:110px' }, quanto),
      h('td', { style: 'min-width:70px' }, entrada(`${p}.prazo`, { tipo: 'dec', aria: 'Prazo em anos' })),
      h('td', { style: 'min-width:130px' }, entrada(`${p}.tipo`, { opcoes: L.TIPO_JUROS.map((k) => [k, `${k} (${L.emPortugues(k)})`]) })),
      h('td', { style: 'min-width:80px' }, entrada(`${p}.taxa`, { tipo: 'dec', aria: 'Taxa % ao ano' })),
      valor, mensal,
      h('td', {}, botaoRemover('simulacao.tranches', i)));
  });
  const novaTranche = h('button', { class: 'btn btn--mini', type: 'button' }, '+ Adicionar empréstimo');
  novaTranche.onclick = () => {
    s.tranches.push({ nome: '住宅ローン', modo: 'resto', prazo: 35, tipo: '変動', taxa: 1 });
    marcar('simulacao'); desenhar();
  };

  const planos = L.planosDisponiveis(S.bancos).map((p) => {
    const b = h('button', { class: `btn btn--mini${s.plano === p.chave ? ' btn--ouro' : ''}`, type: 'button' }, p.rotulo);
    b.onclick = () => aplicarPlano(p.chave);
    return b;
  });

  return h('div', { class: 'pilha' },
    cartao('Imóvel', '御検討物件', h('div', { class: 'cred-grade' },
      campo('simulacao.imovel', 'Imóvel / endereço', { jp: '物件名・所在地', classe: 'c2', ph: '岡崎市細川町 第16 2号棟', max: 200 }),
      campo('simulacao.vendedor', 'Vendedor', { jp: '売主', max: 120 }),
      campo('simulacao.tipo', 'Tipo', { opcoes: L.TIPO_IMOVEL }),
      campo('simulacao.area_constr', 'Área construída m²', { jp: '建物面積', tipo: 'dec', saida: 'tsuboC' }),
      campo('simulacao.area_terreno', 'Área terreno m²', { jp: '土地面積', tipo: 'dec', saida: 'tsuboT' }),
      campo('simulacao.preco', 'Preço do imóvel (¥)', { jp: '物件価格（税込）', tipo: 'iene' }),
      campo('simulacao.preco_sem_imposto', 'Preço sem imposto (¥)', { jp: '税抜（仲介手数料の基準）', tipo: 'iene' }),
      campo('simulacao.base_corretagem', 'Base da corretagem', { opcoes: [['sem', 'Preço sem imposto'], ['com', 'Preço com imposto']] }),
      campo('simulacao.taxa_jimu', 'Taxa adm. do banco %', { jp: '事務手数料率', tipo: 'dec', ph: '2,2' }),
      campo('simulacao.proprio', 'Entrada / recursos próprios (¥)', { jp: '自己資金', tipo: 'iene' }))),

    cartao('Custos', '諸費用',
      h('div', { class: 'cred-rolagem' }, h('table', { class: 'cred-tabela cred-tabela--pt' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Item 名目'), h('th', {}, 'Observação 備考'), h('th', {}, 'Pago a 支払先'),
          h('th', { class: 'num' }, 'Valor 金額'), h('th', {}, 'Auto'), h('th', {}))),
        h('tbody', {}, custos))),
      novoCusto,
      soma('Arredondamento (総予算 em ¥10.000)', 'simArred'),
      soma('Total de custos 諸費用合計', 'simCustos'),
      soma('Orçamento total 総予算', 'simTotal', true),
      soma('Recursos próprios 自己資金', 'simProprio'),
      soma('Valor a financiar 借入金額', 'simEmp', true)),

    cartao('Plano de pagamento', '返済計画',
      h('div', { class: 'cred-planos' }, h('span', { class: 'mudo pequeno' }, 'Modelo:'), planos),
      tranches.length ? h('div', { class: 'cred-rolagem' }, h('table', { class: 'cred-tabela cred-tabela--pt' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Empréstimo'), h('th', {}, 'Modo'), h('th', { class: 'num' }, '% / Valor'),
          h('th', { class: 'num' }, 'Prazo (anos)'), h('th', {}, 'Tipo'), h('th', { class: 'num' }, 'Taxa %'),
          h('th', { class: 'num' }, 'Valor'), h('th', { class: 'num' }, 'Parcela 月々'), h('th', {}))),
        h('tbody', {}, tranches))) : null,
      novaTranche,
      S.el.simAlertas,
      soma('Parcela mensal total 月々返済額合計', 'simMensal', true),
      soma('Pagamento anual 年間返済額', 'simAnual'),
      soma('Comparação com o aluguel atual', 'simAluguel'),
      h('p', { class: 'mudo pequeno', style: 'margin:12px 0 0' },
        'O 資金計画書 impresso sai sem endereço e sem nome de imobiliária: só a data, o cliente, o imóvel, os custos e o plano.')));
}

function aplicarPlano(chave) {
  const s = S.f.simulacao;
  if ((s.tranches || []).length && !confirm('Substituir o plano de pagamento atual?')) return;
  s.tranches = L.montarPlano(chave, S.f, S.bancos);
  s.plano = chave;
  if (chave === 'flat9010') {
    const t = s.custos.find((x) => x.k === 'tekigo');
    if (t && !L.num(t.valor)) t.valor = 100000;
  }
  marcar('simulacao');
  desenhar();
}

function pintarSimulacao() {
  const c = S.f;
  const s = c.simulacao;
  const r = L.simulacao(c);
  const por = (k, v) => { if (S.el[k]) S.el[k].textContent = v; };
  por('tsuboC', s.area_constr ? tsubo(s.area_constr) : '');
  por('tsuboT', s.area_terreno ? tsubo(s.area_terreno) : '');
  r.linhas.forEach((l, i) => { if (S.el.custoAuto[i]) S.el.custoAuto[i].value = fmtInt(Math.round(l.calc || 0)); });
  por('simArred', yen(r.arredondamento)); por('simCustos', yen(r.custos)); por('simTotal', yen(r.total));
  por('simProprio', yen(r.proprio)); por('simEmp', yen(r.emprestimo));
  r.tranches.forEach((t, i) => {
    if (S.el.trValor[i]) S.el.trValor[i].textContent = `${yen(t.valor_calc)}${t.extra ? ' (à parte)' : ''}`;
    if (S.el.trMensal[i]) S.el.trMensal[i].textContent = yen(t.mensal);
  });
  por('simMensal', yen(r.mensal)); por('simAnual', yen(r.anual));
  const aluguel = L.num(c.ficha.aluguel);
  por('simAluguel', aluguel
    ? `aluguel ${yen(aluguel)} → parcela ${yen(r.mensal)} (${r.mensal >= aluguel ? '+' : '−'}${yen(Math.abs(r.mensal - aluguel))})`
    : 'preencha o aluguel na Ficha');

  // O plano contra o limite de crédito do banco dele.
  const alertas = [...r.alertas];
  const cr = L.credito(c, S.bancos.lista);
  if (r.preco && cr.renda) {
    const alvo = L.bancoDoPlano(s.plano);
    const ref = cr.bancos.find((b) => b.id === alvo) || cr.bancos.reduce((a, b) => (b.maxEmp > (a?.maxEmp || 0) ? b : a), null);
    if (ref && r.emprestimo > ref.maxEmp) {
      alertas.push(['erro', `借入金額 ${man(r.emprestimo)} passa do limite calculado (${man(ref.maxEmp)} no ${ref.nome}). Revise preço, entrada ou co-devedor.`]);
    } else if (ref && r.emprestimo > ref.maxEmp * 0.8) {
      alertas.push(['aviso', `借入金額 acima de 80% do limite (${man(ref.maxEmp)} no ${ref.nome}) — operação apertada.`]);
    }
  }
  if (!r.tranches.length) alertas.push(['info', 'Escolha um modelo de plano acima para calcular as parcelas.']);
  S.el.simAlertas.replaceChildren(...alertas.map(([t, m]) => h('p', { class: `cred-alerta cred-alerta--${t}` }, m)));
}

/** Refaz os textos calculados da aba aberta, sem tocar nos campos. */
function atualizarSaidas() {
  const c = S.f;
  if (!c) return;
  if (S.aba === 'ficha' || S.aba === 'codevedor') {
    const p = c[S.aba] || {};
    const anos = L.idade(p.nascimento);
    if (S.el.idade) S.el.idade.textContent = anos != null ? `${anos} anos` : '';
    const m = L.mesesDesde(p.admissao);
    if (S.el.tempoEmp) S.el.tempoEmp.textContent = m != null && m >= 0 ? `${Math.floor(m / 12)} anos e ${m % 12} meses de casa` : '';
    if (S.el.divida) S.el.divida.textContent = yen(L.dividaMensal(p, false));
  }
  if (S.aba === 'credito') pintarCredito();
  if (S.aba === 'simulacao') pintarSimulacao();
}

// ── ficha → processo ─────────────────────────────────────────────────────────

async function dialogoProcesso() {
  const c = S.f;
  if (!c.ficha.nome) { avisar('Preencha o nome do cliente na Ficha antes de criar o processo.'); return; }
  const m = await modelos();
  const sugerido = L.bancoDoPlano(c.simulacao.plano);
  const padrao = m.bancos[sugerido] ? sugerido : 'rokin';
  const banco = h('select', {}, Object.entries(m.bancos).map(([k, b]) => h('option', { value: k, selected: k === padrao }, b.nome)));
  const ok = h('button', { class: 'btn btn--ouro', type: 'submit' }, 'Criar processo');
  abrirDialogo(h('form', {
    onsubmit: (ev) => {
      ev.preventDefault();
      acao(ok, async () => {
        await salvarAgora();
        const r = await post('ficha_processo', { ficha_id: c.id, banco: banco.value });
        c.processo_id = r.id;
        dlg.close();
        location.hash = `#/p/${r.id}`;
      });
    },
  },
    h('h2', {}, 'Criar o processo deste cliente'),
    h('p', { class: 'mudo' }, `O processo de ${c.ficha.nome} nasce com o nome, o corretor e a casa do 資金計画書 já preenchidos. É no processo que o cliente acompanha as etapas e os documentos.`),
    h('p', { class: 'mudo pequeno' }, 'O processo fica visível para a equipe inteira; esta ficha continua só com o corretor dela e o administrador.'),
    h('label', { class: 'campo' }, h('span', {}, 'Banco'), banco),
    h('div', { class: 'dlg__btns' },
      h('button', { class: 'btn', type: 'button', onclick: () => dlg.close() }, 'Cancelar'), ok)));
}

// ── bancos e taxas ───────────────────────────────────────────────────────────

async function telaBancos() {
  const d = await get('bancos_credito');
  const edita = admin() && d.disponivel;
  const B = structuredClone(d.bancos);

  const colunas = [
    ['nome', 'Banco', 'texto', 110], ['regra', '返済負担率', 'regra', 150], ['ratio', '% (fixo)', 'dec', 70],
    ['taxa_aprov', '審査金利 %', 'dec', 80], ['taxa_real', '実行金利 %', 'dec', 80], ['prazo_max', 'Prazo máx.', 'dec', 70],
    ['idade_final', 'Idade final', 'dec', 70], ['limite_max', 'Limite ¥', 'iene', 120], ['fator_custos', 'Fator custos', 'dec', 70],
    ['obs', 'Obs.', 'texto', 260],
  ];
  const ler = (tipo, el) => (tipo === 'dec' ? (el.value.trim() === '' ? '' : L.dec(el.value))
    : tipo === 'iene' ? (el.value.trim() === '' ? 0 : L.inteiro(el.value)) : el.value);

  const corpo = h('tbody', {});
  const pintar = () => corpo.replaceChildren(...B.lista.map((b, i) => {
    const ativo = h('input', { type: 'checkbox', checked: b.ativo !== false, disabled: !edita, 'aria-label': `${b.nome} ativo` });
    ativo.onchange = () => { b.ativo = ativo.checked; };
    const remover = h('button', { class: 'cred-x', type: 'button', title: 'Remover banco', 'aria-label': `Remover ${b.nome}` }, '✕');
    remover.onclick = () => { B.lista.splice(i, 1); pintar(); };
    return h('tr', {},
      h('td', { class: 'centro' }, ativo),
      colunas.map(([k, rotulo, tipo, largura]) => {
        let el;
        if (tipo === 'regra') {
          el = h('select', { disabled: !edita, 'aria-label': rotulo }, L.REGRAS.map(([v, l]) => h('option', { value: v, selected: b.regra === v }, l)));
        } else {
          el = h('input', {
            value: tipo === 'dec' ? fmtDec(b[k]) : tipo === 'iene' ? fmtInt(b[k]) : (b[k] ?? ''),
            readonly: !edita, class: tipo === 'texto' ? false : 'num', 'aria-label': rotulo,
            inputmode: tipo === 'dec' ? 'decimal' : tipo === 'iene' ? 'numeric' : false,
            maxlength: k === 'obs' ? 300 : k === 'nome' ? 40 : false,
          });
        }
        el.onchange = () => { b[k] = ler(tipo, el); };
        return h('td', { style: `min-width:${largura}px` }, el);
      }),
      h('td', {}, edita ? remover : null));
  }));
  pintar();

  const conferido = h('input', { type: 'date', value: B.conferido_em || '', readonly: !edita });
  const taxa = (k) => {
    const el = h('input', { class: 'num', inputmode: 'decimal', value: fmtDec(B[k]), readonly: !edita });
    el.onchange = () => { B[k] = el.value.trim() === '' ? '' : L.dec(el.value); };
    return el;
  };
  const financeira = taxa('financeira10');
  const matomeCasa = taxa('matome_casa');
  const matomeRefin = taxa('matome_refin');

  let botoes = null;
  if (edita) {
    const salvar = h('button', { class: 'btn btn--ouro', type: 'button' }, 'Salvar para todos');
    salvar.onclick = () => acao(salvar, async () => {
      B.conferido_em = conferido.value;
      await post('salvar_bancos', { bancos: B });
      avisar('Tabela salva. Vale para todos os corretores.', 'ok');
      telaBancos();
    });
    const novo = h('button', { class: 'btn btn--mini', type: 'button' }, '+ Banco');
    novo.onclick = () => {
      B.lista.push({ id: `b${Date.now()}`, nome: 'Novo', ativo: true, regra: 'fixo', ratio: 35, taxa_aprov: 3, taxa_real: 1, prazo_max: 35, idade_final: 80, limite_max: 0, fator_custos: 1.1, obs: '' });
      pintar();
    };
    const restaurar = h('button', { class: 'btn btn--mini', type: 'button' }, 'Restaurar padrão');
    restaurar.onclick = () => {
      if (!confirm('Voltar a tabela para os valores padrão? As taxas salvas aqui serão descartadas.')) return;
      acao(restaurar, async () => { await post('salvar_bancos', { operacao: 'restaurar' }); telaBancos(); });
    };
    botoes = { salvar, novo, restaurar };
  }

  app.replaceChildren(h('div', { class: 'pilha' },
    h('div', { class: 'barra' }, barraEquipe('credito'), botoes?.salvar),
    h('div', { class: 'cred-cabeca' },
      h('a', { class: 'link', href: '#/credito' }, '← Clientes'),
      h('h1', { class: 'cred-titulo' }, 'Bancos e taxas')),
    h('p', { class: 'alerta' }, 'As taxas mudam todo mês. Confira antes de mostrar números ao cliente. ',
      admin() ? 'O que for salvo aqui vale para o limite por banco, para os planos do 資金計画書 e como juro padrão da simulação de parcelas dos processos.'
        : 'Só o administrador edita esta tabela.'),
    d.disponivel ? null : h('p', { class: 'alerta' }, 'Para salvar alterações falta rodar sql/acompanhamento-credito.sql no Supabase. Até lá valem os valores abaixo.'),
    h('section', { class: 'cartao' }, h('div', { class: 'cred-grade' },
      h('label', { class: 'campo' }, h('span', {}, 'Conferido em'), conferido),
      h('label', { class: 'campo' }, h('span', {}, 'Financeira dos 10% (FLAT35 90/10) %'), financeira),
      h('label', { class: 'campo' }, h('span', {}, 'ROUKIN com まとめトク — casa %'), matomeCasa),
      h('label', { class: 'campo' }, h('span', {}, 'ROUKIN com まとめトク — refinanciamento %'), matomeRefin)),
      h('p', { class: 'mudo pequeno', style: 'margin:0' },
        d.padrao ? 'Valores padrão — ninguém salvou esta tabela ainda.'
          : `Salva em ${fmtDataHora(d.atualizado_em)}${d.atualizado_por ? ` por ${d.atualizado_por}` : ''}.`)),
    h('section', { class: 'cartao' },
      h('div', { class: 'cred-rolagem' }, h('table', { class: 'cred-tabela' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Ativo'), colunas.map((c) => h('th', {}, c[1])), h('th', {}))),
        corpo)),
      edita ? h('div', { class: 'cred-planos', style: 'margin-top:12px' }, botoes.novo, botoes.restaurar) : null),
    h('p', { class: 'mudo pequeno', style: 'margin:0' },
      '返済負担率 FLAT35: 30% até ¥4M de renda, 35% acima. "Faixas": 25% (<3M), 30% (<4M), 35% (<7M), 40%. Prazo = o menor entre o prazo máximo e (idade final − idade). "Limite ¥" 0 = sem teto.')));
}

// ── impressão (A4, em japonês) ───────────────────────────────────────────────
//
// Os dois documentos saem SEM endereço e SEM nome de imobiliária (decisão da
// Easy House, 13/11/2026): data, 融資担当 com celular, e os dados do cliente.

function cabecalhoImpresso(titulo) {
  const r = S.responsavel || {};
  return [
    h('div', { class: 'pg__topo' },
      h('div', {}, L.dataJP(L.hojeJST())),
      h('div', { class: 'direita' },
        r.nome ? h('div', {}, `融資担当　${r.nome}`) : null,
        r.whatsapp ? h('div', {}, `携帯　${r.whatsapp}`) : null)),
    h('h1', {}, titulo),
  ];
}

const simNaoJP = (v) => (v === 'sim' ? 'はい' : v === 'nao' ? 'いいえ' : '');
const comCep = (cep, endereco) => `${cep ? `〒${cep}　` : ''}${endereco || ''}`;

function paginaPessoa(p, titulo) {
  const sec = (texto, colunas) => h('tr', {}, h('td', { class: 'sec', colspan: colunas }, texto));
  const um = (a, b) => h('tr', {}, h('th', {}, a), h('td', { colspan: 3 }, b || ''));
  const dois = (a, b, c, d) => h('tr', {}, h('th', {}, a), h('td', {}, b || ''), h('th', {}, c), h('td', {}, d || ''));
  const anos = L.idade(p.nascimento);
  const familia = (p.familia || []).map((f) => h('tr', {},
    h('td', {}, f.nome || ''), h('td', {}, f.relacao || ''),
    h('td', {}, f.nascimento ? `${L.dataJP(f.nascimento)}（${L.idade(f.nascimento)}歳）` : ''),
    h('td', { class: 'r' }, f.renda ? yen(f.renda) : ''), h('td', {}, f.trabalho || '')));
  const emprestimos = (p.emprestimos || []).map((e) => h('tr', {},
    h('td', {}, e.tipo || ''), h('td', {}, e.finalidade || ''), h('td', {}, e.data ? L.dataJP(e.data) : ''),
    h('td', { class: 'r' }, e.valor ? yen(e.valor) : ''), h('td', { class: 'r' }, e.parcela ? yen(e.parcela) : ''),
    h('td', { class: 'r' }, e.saldo ? yen(e.saldo) : ''), h('td', {}, simNaoJP(e.quitar))));

  return h('div', { class: 'pg' }, cabecalhoImpresso(titulo),
    h('table', {}, h('tbody', {},
      sec('お客様について', 4),
      dois('フリガナ', p.furigana, '通称名', p.alias),
      um('氏名', p.nome),
      dois('生年月日', p.nascimento ? `${L.dataJP(p.nascimento)}${anos != null ? `（${anos}歳）` : ''}` : '', '国籍', p.nacionalidade),
      dois('永住権', L.permanenteJP(p.permanente), '運転免許証', simNaoJP(p.carteira)),
      um('住所', comCep(p.cep, p.endereco)),
      dois('連絡先', p.telefone, 'E-mail', p.email),
      dois('日本での居住期間', p.tempo_japao, '現住所居住期間', p.tempo_residencia),
      um('家賃', p.aluguel ? `${yen(p.aluguel)} / 月` : ''))),
    h('table', {}, h('tbody', {},
      sec('家族構成（同居予定者）', 5),
      h('tr', { class: 'cab' }, ['氏名', '続柄', '生年月日', '年収', '勤務先・学校'].map((t) => h('th', {}, t))),
      familia.length ? familia : h('tr', {}, h('td', { colspan: 5 }, '—')))),
    h('table', {}, h('tbody', {},
      sec('勤務先及び収入について', 4),
      dois('派遣元 会社名', p.haken_nome, '電話番号', p.haken_tel),
      um('派遣元 住所', comCep(p.haken_cep, p.haken_endereco)),
      dois('勤務先 会社名', p.empresa, '電話番号', p.empresa_tel),
      um('勤務先 住所', comCep(p.empresa_cep, p.empresa_endereco)),
      dois('業務内容', p.servico, '入社日', p.admissao ? L.dataJP(p.admissao) : ''),
      dois('雇用形態', L.contratoJP(p.contrato_tipo), '契約期間', p.contrato_prazo),
      dois('年収', p.renda_anual ? yen(p.renda_anual) : '', '給料日', p.dia_pagamento ? `${p.dia_pagamento}日` : ''),
      dois('現在の通勤手段・時間', p.transporte_atual, '引越し後', p.transporte_novo))),
    h('table', {}, h('tbody', {},
      sec('現在の借入状況（クレジットカード分割・リボ・キャッシング・オートローン等）', 7),
      h('tr', { class: 'cab' }, ['種類', '資金使途', '借入日', '借入額', '月額', '残高', '完済予定'].map((t) => h('th', {}, t))),
      emprestimos.length ? emprestimos : h('tr', {}, h('td', { colspan: 7 }, 'なし')))),
    h('table', {}, h('tbody', {},
      sec('産休・育休', 4),
      dois('産休・育休', simNaoJP(p.licenca), '復職予定', p.licenca_retorno ? L.dataJP(p.licenca_retorno) : ''),
      um('期間', p.licenca_periodo))));
}

function paginaSimulacao() {
  const c = S.f;
  const s = c.simulacao;
  const r = L.simulacao(c);
  const area = (v) => (v ? `${Number(v).toLocaleString('ja-JP')}㎡（${(L.dec(v) * 0.3025).toFixed(2)}坪）` : '');
  const custos = r.linhas.filter((l) => l.calc).map((l) => h('tr', {},
    h('td', {}, l.nome || ''), h('td', {}, l.obs || ''), h('td', {}, l.pagar || ''), h('td', { class: 'r' }, yen(l.calc))));
  const plano = r.tranches.map((t) => h('table', { class: 'meia' }, h('tbody', {},
    h('tr', {}, h('td', { class: 'sec', colspan: 2 }, `${t.nome || ''}${t.extra ? '（別途）' : ''}`)),
    h('tr', {}, h('th', {}, '金額'), h('td', { class: 'r' }, yen(t.valor_calc))),
    h('tr', {}, h('th', {}, '借入期間'), h('td', { class: 'r' }, `${fmtDec(t.prazo)}年`)),
    h('tr', {}, h('th', {}, '金利プラン'), h('td', { class: 'r' }, `${t.tipo || ''}　${L.dec(t.taxa).toFixed(3)}%`)),
    h('tr', {}, h('th', {}, '月々'), h('td', { class: 'r' }, h('b', {}, yen(t.mensal)))),
    h('tr', {}, h('th', {}, '年間返済額'), h('td', { class: 'r' }, yen(t.anual))))));

  return h('div', { class: 'pg' }, cabecalhoImpresso('資金計画書'),
    h('p', { class: 'pg__cliente' }, h('b', {}, c.ficha.nome || ''), '　様'),
    h('table', {}, h('tbody', {},
      h('tr', {}, h('th', {}, '御検討物件'), h('td', { colspan: 3 }, s.imovel || '')),
      h('tr', {}, h('th', {}, '建物面積'), h('td', {}, area(s.area_constr)), h('th', {}, '土地面積'), h('td', {}, area(s.area_terreno))),
      h('tr', {}, h('th', {}, '物件価格'), h('td', { class: 'r' }, h('b', {}, yen(r.preco))), h('th', {}, '売主'), h('td', {}, s.vendedor || '')))),
    h('table', {}, h('tbody', {},
      h('tr', { class: 'cab' }, ['名目', '備考', '支払先', '金額'].map((t) => h('th', {}, t))),
      custos,
      r.arredondamento ? h('tr', {}, h('td', {}, '調整額'), h('td', {}, '総予算の端数調整'), h('td', {}), h('td', { class: 'r' }, yen(r.arredondamento))) : null,
      h('tr', {}, h('td', { colspan: 3 }, h('b', {}, '諸費用合計')), h('td', { class: 'r' }, h('b', {}, yen(r.custos + r.arredondamento)))))),
    h('table', {}, h('tbody', {},
      h('tr', {}, h('td', { class: 'sec', colspan: 2 }, '資金計画')),
      h('tr', {}, h('th', {}, '総予算'), h('td', { class: 'r' }, h('b', {}, `約 ${yen(r.total)}`))),
      h('tr', {}, h('th', {}, '自己資金'), h('td', { class: 'r' }, yen(r.proprio))),
      h('tr', {}, h('th', {}, '借入金額'), h('td', { class: 'r' }, h('b', {}, yen(r.emprestimo)))))),
    h('p', { class: 'pg__nota' }, '＊決済時必要資金計画に固定資産税は含まれていません。金利は審査結果・実行時の金利により変動します。'),
    plano.length ? [h('div', { class: 'pg__sub' }, '返済計画'), h('div', { class: 'pg__duas' }, plano)] : null,
    r.tranches.length > 1 ? h('table', {}, h('tbody', {}, h('tr', {},
      h('th', {}, '月々返済額合計'), h('td', { class: 'r' }, h('b', {}, yen(r.mensal))),
      h('th', {}, '年間返済額合計'), h('td', { class: 'r' }, yen(r.anual))))) : null);
}

async function imprimir(tipo) {
  await salvarAgora();
  const c = S.f;
  let area = document.getElementById('impressao');
  if (!area) { area = h('div', { id: 'impressao' }); document.body.append(area); }
  area.replaceChildren(...(tipo === 'sim'
    ? [paginaSimulacao()]
    : [paginaPessoa(c.ficha, 'ローン審査用情報記入シート'),
      c.codevedor.ativo ? paginaPessoa(c.codevedor, 'ローン審査用情報記入シート（連帯）') : null].filter(Boolean)));
  setTimeout(() => window.print(), 60);
}
