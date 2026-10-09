/* acompanhamento.js — painel do processo de compra.
 *
 * Uma página só para cliente e equipe: o que muda é o papel de quem entrou.
 * Rotas pelo hash:  #/            lista (equipe) ou o processo do cliente
 *                   #/p/<id>      um processo
 *                   #/equipe      membros da equipe (admin)
 *
 * Tudo que vem do banco entra na página por textContent (ver h()). Nada de
 * innerHTML com dado: nome de cliente, nota do corretor ou nome de documento
 * nunca podem virar marcação.
 */
(() => {
  'use strict';

  const app = document.getElementById('app');
  const dlg = document.getElementById('dlg');
  const estado = { eu: null, equipe: [], modelos: null, abertas: new Set() };

  const ROTULO_STATUS = { pendente: 'A preparar', pronto: 'Já tenho', entregue: 'Entregue' };
  const ROTULO_PAPEL = { admin: 'Administrador', corretor: 'Corretor', cliente: 'Cliente' };

  // ── construção de elementos ────────────────────────────────────────────────

  /** h('div', { class: 'x', onclick: fn }, 'texto', filho) — texto vira textContent. */
  function h(tag, attrs, ...filhos) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === false || v === null || v === undefined) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
    for (const f of filhos.flat(Infinity)) {
      if (f === null || f === undefined || f === false) continue;
      el.append(f instanceof Node ? f : document.createTextNode(String(f)));
    }
    return el;
  }

  // ── API ────────────────────────────────────────────────────────────────────

  class ErroApi extends Error {
    constructor(status, msg) { super(msg); this.status = status; }
  }

  async function chamar(url, opcoes) {
    let r;
    try { r = await fetch(url, { credentials: 'same-origin', ...opcoes }); }
    catch { throw new ErroApi(0, 'Sem conexão. Confira a internet e tente de novo.'); }
    const dados = await r.json().catch(() => ({}));
    if (r.status === 401 && estado.eu) {
      estado.eu = null;
      atualizarTopo();
      telaLogin('Sua sessão expirou. Entre de novo.');
    }
    if (!r.ok) throw new ErroApi(r.status, dados.erro || 'Algo deu errado.');
    return dados;
  }

  const get = (acao, params = {}) =>
    chamar(`/api/painel?${new URLSearchParams({ acao, ...params })}`, { method: 'GET' });

  const post = (acao, dados = {}) =>
    chamar('/api/painel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Painel': '1' },
      body: JSON.stringify({ acao, ...dados }),
    });

  // ── formatação ─────────────────────────────────────────────────────────────

  const fmtData = (iso) => iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
  const fmtDataHora = (iso) => iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
  const fmtYen = (n) => (n || n === 0) ? `¥${Number(n).toLocaleString('ja-JP')}` : '';
  const paraInputLocal = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  };

  /** "Vera Akemy Ｓａｎｔｏｓ" → "vera.akemy.santos" */
  function sugerirUsuario(nome) {
    return String(nome || '')
      .normalize('NFKC').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().trim()
      .replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '')
      .slice(0, 30) || 'cliente';
  }

  // ── avisos rápidos ─────────────────────────────────────────────────────────

  function avisar(msg, tipo = 'erro') {
    const t = h('div', { class: `toast toast--${tipo}`, role: tipo === 'erro' ? 'alert' : 'status' }, msg);
    document.body.append(t);
    setTimeout(() => t.remove(), tipo === 'erro' ? 6000 : 3000);
  }

  /** Roda uma ação de botão: trava o botão, mostra erro, recarrega se pedir. */
  async function acao(botao, fn) {
    if (botao) botao.disabled = true;
    try { return await fn(); }
    catch (e) { avisar(e.message || 'Algo deu errado.'); return undefined; }
    finally { if (botao) botao.disabled = false; }
  }

  // ── topo ───────────────────────────────────────────────────────────────────

  function atualizarTopo() {
    const nav = document.getElementById('topoAcoes');
    nav.hidden = !estado.eu;
    if (estado.eu) {
      document.getElementById('topoQuem').textContent =
        `${estado.eu.nome}${estado.eu.papel !== 'cliente' ? ` · ${ROTULO_PAPEL[estado.eu.papel]}` : ''}`;
    }
  }

  document.getElementById('topoAcoes').addEventListener('click', async (ev) => {
    const alvo = ev.target.closest('[data-acao]');
    if (!alvo) return;
    if (alvo.dataset.acao === 'sair') {
      await post('logout').catch(() => {});
      estado.eu = null;
      atualizarTopo();
      history.replaceState(null, '', location.pathname);
      telaLogin();
    }
    if (alvo.dataset.acao === 'trocar-senha') dialogoTrocarSenha();
  });

  // ── login ──────────────────────────────────────────────────────────────────

  function telaLogin(mensagem) {
    const erro = h('p', { class: 'erro', role: 'alert' }, mensagem || '');
    const usuario = h('input', { name: 'usuario', autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false', required: true });
    const senha = h('input', { name: 'senha', type: 'password', autocomplete: 'current-password', required: true });
    const botao = h('button', { class: 'btn btn--ouro', type: 'submit' }, 'Entrar');

    const form = h('form', {
      class: 'cartao login',
      onsubmit: async (ev) => {
        ev.preventDefault();
        erro.textContent = '';
        botao.disabled = true;
        try {
          await post('login', { usuario: usuario.value, senha: senha.value });
          estado.eu = await get('eu');
          atualizarTopo();
          history.replaceState(null, '', location.pathname);
          rota();
        } catch (e) {
          erro.textContent = e.message;
          senha.value = '';
          senha.focus();
        } finally {
          botao.disabled = false;
        }
      },
    },
      h('p', { class: 'sobre' }, 'Easy House'),
      h('h1', {}, 'Acompanhe a compra da sua casa'),
      h('p', { class: 'mudo' }, 'Entre com o usuário e a senha que o seu consultor enviou.'),
      h('label', { class: 'campo' }, h('span', {}, 'Usuário'), usuario),
      h('label', { class: 'campo' }, h('span', {}, 'Senha'), senha),
      erro,
      botao,
      h('p', { class: 'mudo pequeno', style: 'margin:16px 0 0' },
        'Esqueceu a senha? Fale com o seu consultor pelo WhatsApp — ele cria uma nova.'),
    );
    app.replaceChildren(form);
    usuario.focus();
  }

  // ── roteamento ─────────────────────────────────────────────────────────────

  async function rota() {
    if (!estado.eu) return telaLogin();
    const hash = location.hash;
    const m = hash.match(/^#\/p\/([0-9a-f-]{36})$/i);
    const equipe = estado.eu.papel !== 'cliente';

    try {
      if (m) return await telaProcesso(m[1]);
      if (equipe && hash === '#/equipe') return await telaEquipe();
      if (equipe) return await telaLista();

      const meus = await get('meus_processos');
      if (meus.length === 1) {
        history.replaceState(null, '', `#/p/${meus[0].id}`);
        return await telaProcesso(meus[0].id);
      }
      if (!meus.length) {
        return app.replaceChildren(h('div', { class: 'cartao' },
          h('h2', {}, 'Ainda não há processo ligado ao seu acesso'),
          h('p', { class: 'mudo' }, 'Fale com o seu consultor da Easy House.')));
      }
      app.replaceChildren(h('div', { class: 'pilha' },
        h('h1', {}, 'Seus processos'),
        h('ul', { class: 'lista' }, meus.map((p) =>
          h('li', {}, h('a', { class: 'item', href: `#/p/${p.id}` }, h('span', { class: 'item__nome' }, p.cliente_nome)))))));
    } catch (e) {
      if (e.status === 401) return;
      app.replaceChildren(h('div', { class: 'cartao' }, h('h2', {}, 'Não foi possível abrir'), h('p', { class: 'mudo' }, e.message),
        h('a', { class: 'btn', href: '#/' }, 'Voltar')));
    }
  }
  window.addEventListener('hashchange', rota);

  // ── lista de processos (equipe) ────────────────────────────────────────────

  function barraEquipe(atual) {
    const abas = [h('a', { class: 'aba', href: '#/', 'aria-current': atual === 'processos' ? 'page' : false }, 'Processos')];
    abas.push(h('a', { class: 'aba', href: '#/equipe', 'aria-current': atual === 'equipe' ? 'page' : false }, 'Equipe'));
    return h('nav', { class: 'abas', 'aria-label': 'Seções' }, abas);
  }

  async function carregarApoio() {
    if (!estado.modelos) estado.modelos = await get('modelos');
    estado.equipe = await get('equipe');
  }

  async function telaLista() {
    const [processos] = await Promise.all([get('processos'), carregarApoio()]);
    const ativos = processos.filter((p) => !p.arquivado);
    const arquivados = processos.filter((p) => p.arquivado);

    const item = (p) => h('li', {},
      h('a', { class: `item${p.arquivado ? ' arquivado' : ''}`, href: `#/p/${p.id}` },
        h('span', { class: 'item__nome' }, p.cliente_nome),
        h('span', { class: 'item__etapa' }, p.concluido ? 'Concluído ✓' : `${p.etapa_ordem}/${p.etapas_total} · ${p.etapa_titulo}`),
        h('span', { class: 'item__meta' },
          [p.banco_nome, p.corretor, p.lead_code, `atualizado ${fmtData(p.atualizado_em)}`].filter(Boolean).join(' · '))));

    app.replaceChildren(h('div', { class: 'pilha' },
      h('div', { class: 'barra' },
        barraEquipe('processos'),
        h('button', { class: 'btn btn--ouro', type: 'button', onclick: dialogoNovoProcesso }, '+ Novo processo')),
      ativos.length
        ? h('ul', { class: 'lista' }, ativos.map(item))
        : h('div', { class: 'cartao' }, h('h2', {}, 'Nenhum processo ainda'),
          h('p', { class: 'mudo' }, 'Quando a pré-avaliação de um cliente for aprovada, crie o processo dele aqui.')),
      arquivados.length ? h('details', {},
        h('summary', { class: 'mudo', style: 'cursor:pointer' }, `Arquivados (${arquivados.length})`),
        h('ul', { class: 'lista', style: 'margin-top:10px' }, arquivados.map(item))) : null,
    ));
  }

  function opcoesBanco(selecionado) {
    return Object.entries(estado.modelos.bancos).map(([k, b]) =>
      h('option', { value: k, selected: k === selecionado }, b.nome));
  }

  function opcoesCorretor(selecionado) {
    return [h('option', { value: '' }, '— sem corretor —'),
      ...estado.equipe.filter((m) => m.ativo).map((m) =>
        h('option', { value: m.user_id, selected: m.user_id === selecionado }, m.nome))];
  }

  function dialogoNovoProcesso() {
    const nome = h('input', { required: true, maxlength: 120 });
    const banco = h('select', {}, opcoesBanco('rokin'));
    const lead = h('input', { placeholder: 'EH-XXXXXX', maxlength: 20 });
    const corretor = h('select', {}, opcoesCorretor(estado.eu.papel === 'corretor' ? estado.equipe.find((m) => m.usuario === estado.eu.usuario)?.user_id : ''));
    const erro = h('p', { class: 'erro', role: 'alert' });
    const ok = h('button', { class: 'btn btn--ouro', type: 'submit' }, 'Criar processo');

    abrirDialogo(h('form', {
      onsubmit: async (ev) => {
        ev.preventDefault();
        await acao(ok, async () => {
          const r = await post('criar_processo', {
            cliente_nome: nome.value, banco: banco.value, lead_code: lead.value, corretor_id: corretor.value || null,
          });
          dlg.close();
          location.hash = `#/p/${r.id}`;
        });
      },
    },
      h('h2', {}, 'Novo processo'),
      h('p', { class: 'mudo pequeno' }, 'As etapas e a lista de documentos saem do modelo do banco escolhido. Dá para ajustar depois.'),
      h('label', { class: 'campo' }, h('span', {}, 'Nome do cliente'), nome),
      h('label', { class: 'campo' }, h('span', {}, 'Banco'), banco),
      h('div', { class: 'grade2' },
        h('label', { class: 'campo' }, h('span', {}, 'Código do lead (opcional)'), lead),
        h('label', { class: 'campo' }, h('span', {}, 'Corretor'), corretor)),
      erro,
      h('div', { class: 'dlg__btns' },
        h('button', { class: 'btn', type: 'button', onclick: () => dlg.close() }, 'Cancelar'), ok),
    ));
    nome.focus();
  }

  // ── processo ───────────────────────────────────────────────────────────────

  async function telaProcesso(id, manterRolagem = false) {
    const y = window.scrollY;
    const equipe = estado.eu.papel !== 'cliente';
    const tarefas = [get('processo', { id })];
    if (equipe) tarefas.push(carregarApoio());
    const [d] = await Promise.all(tarefas);

    const recarregar = () => telaProcesso(id, true);
    const ctx = { d, equipe, recarregar, id };

    const etapasOrd = [...d.etapas].sort((a, b) => a.ordem - b.ordem);
    const docsDe = (grupo) => d.documentos.filter((x) => x.grupo === grupo);

    app.replaceChildren(h('div', { class: 'pilha' },
      equipe ? h('a', { class: 'link voltar', href: '#/' }, '← Todos os processos') : null,
      capa(ctx, etapasOrd),
      equipe ? gestao(ctx, etapasOrd) : consultor(ctx),
      blocoDocs(ctx, 'ter_em_maos', 'Tenha à mão',
        'Documentos já usados na pré-avaliação. Deixe por perto: o banco pode pedir de novo.'),
      h('section', { 'aria-labelledby': 'tit-etapas', class: 'pilha' },
        h('h2', { id: 'tit-etapas' }, 'Seu caminho até as chaves'),
        h('p', { class: 'mudo', style: 'margin:-8px 0 0' }, 'Você não precisa decorar. Nós avisamos o próximo passo — mas pode abrir as próximas etapas e ir preparando os documentos.'),
        h('ol', { class: 'etapas' }, etapasOrd.map((e) => etapa(ctx, e, docsDe(e.chave))))),
      blocoDocs(ctx, 'outros', 'Outros documentos',
        'Pedidos a mais do banco ou do vendedor aparecem aqui.', true),
      atualizacoes(ctx),
      rodape(ctx),
    ));
    if (manterRolagem) window.scrollTo(0, y);
  }

  function capa({ d }, etapas) {
    const p = d.processo;
    const atual = etapas.find((e) => e.chave === d.etapa_atual);
    const feitas = etapas.filter((e) => e.concluida_em).length;

    const casa = h('figure', { class: 'casa', style: 'margin:0' },
      p.casa_foto_url
        ? h('img', { class: 'casa__foto', src: p.casa_foto_url, alt: p.casa_titulo ? `Foto: ${p.casa_titulo}` : 'Foto da casa escolhida' })
        : h('div', { class: 'casa__vazia' }, 'A foto da casa escolhida aparece aqui.'),
      (p.casa_titulo || p.casa_endereco || p.casa_preco_yen) ? h('figcaption', { class: 'casa__info' },
        p.casa_titulo ? h('strong', {}, p.casa_titulo) : null,
        p.casa_endereco ? h('span', { class: 'mudo pequeno' }, p.casa_endereco) : null,
        p.casa_preco_yen ? h('span', { class: 'casa__preco' }, fmtYen(p.casa_preco_yen)) : null,
        p.casa_url ? h('a', { href: p.casa_url, target: '_blank', rel: 'noopener' }, 'Ver o anúncio') : null,
      ) : null);

    return h('section', { class: 'capa' },
      h('div', { class: 'capa__texto' },
        h('p', { class: 'sobre' }, 'Pré-avaliação aprovada'),
        h('h1', {}, p.cliente_nome),
        h('p', { class: 'mudo', style: 'margin:0' }, 'A Easy House orienta você em cada etapa.'),
        h('div', { class: 'chips' },
          h('span', { class: 'chip chip--ouro' }, p.banco_nome),
          d.processo.arquivado ? h('span', { class: 'chip' }, 'Arquivado') : null),
        h('div', { class: 'progresso' },
          h('div', { class: 'progresso__linha', role: 'img', 'aria-label': `${feitas} de ${etapas.length} etapas concluídas` },
            etapas.map((e) => h('span', { class: `progresso__seg${e.concluida_em ? ' feito' : (e.chave === d.etapa_atual ? ' agora' : '')}` }))),
          h('p', { class: 'progresso__txt' },
            atual ? `Etapa ${atual.ordem} de ${etapas.length}: ${atual.titulo}` : 'Todas as etapas concluídas — chegou o dia da sua casa!'))),
      casa);
  }

  function consultor({ d }) {
    const msg = `Olá, ${d.consultor.nome}! Sou ${d.processo.cliente_nome} e tenho uma dúvida sobre o meu processo.`;
    return h('section', { class: 'cartao consultor' },
      h('div', {},
        h('p', { class: 'sobre', style: 'margin:0' }, 'Seu consultor'),
        h('strong', { style: 'font-size:1.1rem' }, d.consultor.nome)),
      h('a', {
        class: 'btn btn--wa', target: '_blank', rel: 'noopener',
        href: `https://wa.me/${d.consultor.whatsapp}?text=${encodeURIComponent(msg)}`,
      }, 'Falar no WhatsApp'));
  }

  // ── etapas ─────────────────────────────────────────────────────────────────

  function etapa(ctx, e, docs) {
    const { d, equipe } = ctx;
    const situacao = e.concluida_em ? 'feita' : (e.chave === d.etapa_atual ? 'agora' : 'proxima');
    const textoSituacao = {
      feita: `Concluída em ${fmtData(e.concluida_em)}`,
      agora: 'Etapa atual',
      proxima: 'Próxima',
    }[situacao];

    const aberta = estado.abertas.has(e.id) || (situacao === 'agora' && !estado.abertas.has(`fechada:${e.id}`));
    const notas = d.notas.filter((n) => n.etapa_chave === e.chave);
    const guia = d.guia && d.guia.etapa === e.chave ? blocoGuia(ctx) : null;

    const det = h('details', {
      class: `etapa ${situacao}`, open: aberta,
      ontoggle: () => {
        if (det.open) { estado.abertas.add(e.id); estado.abertas.delete(`fechada:${e.id}`); }
        else { estado.abertas.delete(e.id); estado.abertas.add(`fechada:${e.id}`); }
      },
    },
      h('summary', {},
        h('span', { class: 'etapa__num', 'aria-hidden': 'true' }, e.concluida_em ? '✓' : String(e.ordem)),
        h('span', { class: 'etapa__titulo' },
          h('h3', {}, e.titulo),
          h('span', { class: 'etapa__estado' }, textoSituacao)),
        h('span', { class: 'etapa__seta', 'aria-hidden': 'true' }, '▾')),
      h('div', { class: 'etapa__corpo' },
        e.descricao ? h('p', { class: 'etapa__desc' }, e.descricao) : null,
        (d.orientacoes?.[e.chave] || []).length
          ? h('ul', { class: 'orientacao' }, d.orientacoes[e.chave].map((o) => h('li', {}, o))) : null,
        e.data_prevista ? h('p', { class: 'etapa__quando' }, h('span', { 'aria-hidden': 'true' }, '📅'), `Agendado: ${fmtDataHora(e.data_prevista)}`) : null,
        situacao === 'proxima' && docs.some((x) => x.status === 'pendente')
          ? h('p', { class: 'antecipe' }, 'Se quiser se adiantar, já pode ir preparando estes documentos.') : null,
        docs.length || equipe ? listaDocs(ctx, docs, e.chave) : null,
        guia,
        notas.length ? h('ul', { class: 'notas' }, notas.map((n) => nota(ctx, n))) : null,
        e.chave === 'chaves' ? h('p', { class: 'mudo pequeno', style: 'margin:0' }, 'Depois das chaves: orientação para mudança, água/luz/gás e próximos passos.') : null,
        equipe ? acoesEtapa(ctx, e) : null,
      ));
    return h('li', {}, det);
  }

  function acoesEtapa(ctx, e) {
    const data = h('input', { type: 'datetime-local', value: paraInputLocal(e.data_prevista) });
    const btnData = h('button', { class: 'btn btn--mini', type: 'button' }, 'Salvar data');
    btnData.onclick = () => acao(btnData, async () => {
      await post('etapa', { etapa_id: e.id, operacao: 'data', data: data.value ? new Date(data.value).toISOString() : null });
      avisar('Data salva.', 'ok');
      ctx.recarregar();
    });

    const principal = e.concluida_em
      ? h('button', { class: 'btn btn--mini', type: 'button' }, 'Reabrir etapa')
      : h('button', { class: 'btn btn--ouro btn--mini', type: 'button' }, 'Concluir etapa');
    principal.onclick = () => acao(principal, async () => {
      await post('etapa', { etapa_id: e.id, operacao: e.concluida_em ? 'reabrir' : 'concluir' });
      ctx.recarregar();
    });

    return h('div', { class: 'etapa__acoes' },
      principal,
      h('label', { class: 'campo' }, h('span', {}, 'Data agendada'), data),
      btnData);
  }

  // ── documentos ─────────────────────────────────────────────────────────────

  function blocoDocs(ctx, grupo, titulo, explicacao, semprePresente = false) {
    const docs = ctx.d.documentos.filter((x) => x.grupo === grupo);
    if (!docs.length && !ctx.equipe && !semprePresente) return null;
    return h('section', { class: 'cartao' },
      h('h2', {}, titulo),
      h('p', { class: 'mudo pequeno', style: 'margin:6px 0 14px' }, explicacao),
      listaDocs(ctx, docs, grupo, 'Nenhum por enquanto.'));
  }

  function listaDocs(ctx, docs, grupo, vazio) {
    const { equipe } = ctx;
    const itens = docs.map((doc) => {
      const travado = !equipe && doc.status === 'entregue';
      const marcado = doc.status !== 'pendente';
      const btn = h('button', {
        class: 'doc__btn', type: 'button',
        'aria-pressed': marcado ? 'true' : 'false',
        'aria-label': travado ? `${doc.nome}: entregue` : `${doc.nome}: ${marcado ? 'desmarcar' : 'marcar como já tenho'}`,
        disabled: travado,
      }, '✓');
      btn.onclick = () => acao(btn, async () => {
        const novo = doc.status === 'pendente' ? 'pronto' : (doc.status === 'pronto' ? 'pendente' : 'pronto');
        await post('documento', { operacao: 'status', documento_id: doc.id, status: novo });
        ctx.recarregar();
      });

      let controles = h('span', { class: 'doc__selo' }, ROTULO_STATUS[doc.status]);
      if (equipe) {
        const sel = h('select', { 'aria-label': `Situação de ${doc.nome}` },
          Object.entries(ROTULO_STATUS).map(([k, r]) => h('option', { value: k, selected: k === doc.status }, r)));
        sel.onchange = () => acao(sel, async () => {
          await post('documento', { operacao: 'status', documento_id: doc.id, status: sel.value });
          ctx.recarregar();
        });
        const rem = h('button', { class: 'link', type: 'button', 'aria-label': `Remover ${doc.nome}` }, 'remover');
        rem.onclick = () => {
          if (!confirm(`Remover "${doc.nome}" da lista?`)) return;
          acao(rem, async () => {
            await post('documento', { operacao: 'remover', documento_id: doc.id });
            ctx.recarregar();
          });
        };
        controles = h('span', { class: 'doc__equipe' }, sel, rem);
      }

      return h('li', { class: `doc ${doc.status}` },
        btn,
        h('span', { class: 'doc__nome' }, h('strong', {}, doc.nome), doc.detalhe ? h('small', {}, doc.detalhe) : null),
        controles);
    });

    let adicionar = null;
    if (equipe) {
      const nome = h('input', { placeholder: 'Adicionar documento…', maxlength: 160, 'aria-label': 'Nome do documento' });
      const btn = h('button', { class: 'btn btn--mini', type: 'submit' }, 'Adicionar');
      adicionar = h('form', {
        class: 'add-doc',
        onsubmit: (ev) => {
          ev.preventDefault();
          if (!nome.value.trim()) return;
          acao(btn, async () => {
            await post('documento', { operacao: 'adicionar', processo_id: ctx.id, grupo, nome: nome.value });
            ctx.recarregar();
          });
        },
      }, nome, btn);
    }

    return h('div', { class: 'docs' },
      docs.length ? h('ul', {}, itens) : (vazio ? h('p', { class: 'docs__vazio' }, vazio) : null),
      adicionar);
  }

  // ── guia do banco ──────────────────────────────────────────────────────────

  function blocoGuia(ctx) {
    const g = ctx.d.guia;
    const extras = ctx.d.processo.extras || {};
    return h('div', { class: 'guia' },
      h('h4', {}, g.titulo),
      h('dl', {}, g.itens.map((it) => [
        h('dt', {}, it.titulo),
        h('dd', {},
          it.texto || null,
          it.lista ? h('ul', {}, it.lista.map((l) => h('li', {}, l))) : null,
          it.campo && extras[it.campo]
            ? h('div', {}, h('span', { class: 'mudo pequeno' }, `${it.rotulo_campo}: `), h('code', { class: 'guia__campo' }, extras[it.campo]))
            : null),
      ])),
      h('p', { class: 'guia__nota' }, g.importante),
      h('p', { class: 'guia__nota', style: 'margin-top:4px' }, `Base: ${g.fonte}`));
  }

  // ── notas ──────────────────────────────────────────────────────────────────

  function nota(ctx, n) {
    let remover = null;
    if (ctx.equipe) {
      remover = h('button', { class: 'link', type: 'button', style: 'margin-left:8px;font-size:.8rem' }, 'apagar');
      remover.onclick = () => {
        if (!confirm('Apagar esta atualização?')) return;
        acao(remover, async () => { await post('nota', { operacao: 'remover', nota_id: n.id }); ctx.recarregar(); });
      };
    }
    return h('li', { class: `nota${n.interna ? ' interna' : ''}` },
      h('p', {}, n.texto),
      h('small', {}, [fmtDataHora(n.criado_em), n.autor, n.interna ? 'só a equipe vê' : null].filter(Boolean).join(' · ')),
      remover);
  }

  function atualizacoes(ctx) {
    const gerais = ctx.d.notas.filter((n) => !n.etapa_chave);
    if (!gerais.length) return null;
    return h('section', { class: 'cartao' },
      h('h2', { style: 'margin-bottom:12px' }, 'Atualizações'),
      h('ul', { class: 'notas' }, gerais.map((n) => nota(ctx, n))));
  }

  function rodape({ d }) {
    return h('section', { class: 'pilha', 'aria-label': 'Para seguir com tranquilidade' },
      h('h2', {}, 'Para seguir com tranquilidade'),
      h('div', { class: 'avisos' }, d.avisos.map((a) => h('div', { class: 'aviso' }, h('strong', {}, a.titulo), h('p', {}, a.texto)))),
      h('ul', { class: 'lembretes' }, d.lembretes.map((l) => h('li', {}, l))),
      h('p', { class: 'legal' }, d.aviso_legal));
  }

  // ── gestão (só equipe) ─────────────────────────────────────────────────────

  function gestao(ctx, etapas) {
    return h('section', { class: 'cartao pilha', 'aria-label': 'Gestão do processo' },
      h('h2', {}, 'Gestão do processo'),
      h('p', { class: 'mudo pequeno', style: 'margin:-10px 0 0' }, 'Só a equipe vê este quadro. O cliente vê o restante da página.'),
      secao('Acesso do cliente', acessoCliente(ctx), !ctx.d.acessos.length),
      secao('Dados e casa escolhida', formDados(ctx)),
      secao('Foto da casa', formFoto(ctx)),
      ctx.d.guia ? secao(`Dados do ${ctx.d.processo.banco_nome}`, formGuia(ctx)) : null,
      secao('Nova atualização para o cliente', formNota(ctx, etapas), true));
  }

  const secao = (titulo, corpo, aberta = false) =>
    h('details', { open: aberta }, h('summary', { style: 'cursor:pointer;font-weight:700' }, titulo), h('div', { style: 'padding-top:14px' }, corpo));

  function formDados(ctx) {
    const p = ctx.d.processo;
    const c = {
      cliente_nome: h('input', { value: p.cliente_nome, maxlength: 120, required: true }),
      banco: h('select', {}, opcoesBanco(p.banco)),
      lead_code: h('input', { value: p.lead_code || '', maxlength: 20 }),
      corretor_id: h('select', {}, opcoesCorretor(p.corretor_id)),
      casa_titulo: h('input', { value: p.casa_titulo || '', maxlength: 160, placeholder: 'Casa 4LDK em Okazaki' }),
      casa_endereco: h('input', { value: p.casa_endereco || '', maxlength: 240 }),
      casa_preco_yen: h('input', { value: p.casa_preco_yen ?? '', inputmode: 'numeric', placeholder: '25800000' }),
      casa_url: h('input', { value: p.casa_url || '', type: 'url', placeholder: 'https://easyhouse.homes/comprar/imoveis/…' }),
    };
    const arquivado = h('input', { type: 'checkbox', checked: !!p.arquivado });
    const btn = h('button', { class: 'btn btn--ouro', type: 'submit' }, 'Salvar');

    return h('form', {
      onsubmit: (ev) => {
        ev.preventDefault();
        if (c.banco.value !== p.banco && !confirm(
          'Trocar o banco muda a ordem das etapas (no FLAT35 a análise vem antes da compra e venda). O que já foi concluído e os documentos continuam. Trocar?')) return;
        acao(btn, async () => {
          const campos = Object.fromEntries(Object.entries(c).map(([k, el]) => [k, el.value]));
          campos.corretor_id = campos.corretor_id || null;
          campos.arquivado = arquivado.checked;
          await post('editar_processo', { processo_id: ctx.id, campos });
          avisar('Salvo.', 'ok');
          ctx.recarregar();
        });
      },
    },
      h('div', { class: 'grade2' },
        h('label', { class: 'campo' }, h('span', {}, 'Nome do cliente'), c.cliente_nome),
        h('label', { class: 'campo' }, h('span', {}, 'Banco'), c.banco),
        h('label', { class: 'campo' }, h('span', {}, 'Código do lead'), c.lead_code),
        h('label', { class: 'campo' }, h('span', {}, 'Corretor'), c.corretor_id),
        h('label', { class: 'campo' }, h('span', {}, 'Casa (título)'), c.casa_titulo),
        h('label', { class: 'campo' }, h('span', {}, 'Preço (¥)'), c.casa_preco_yen)),
      h('label', { class: 'campo' }, h('span', {}, 'Endereço'), c.casa_endereco),
      h('label', { class: 'campo' }, h('span', {}, 'Link do anúncio (opcional)'), c.casa_url),
      h('label', { class: 'marcar' }, arquivado, 'Arquivar (some da lista principal; o cliente continua com acesso se o login estiver ativo)'),
      btn);
  }

  function formFoto(ctx) {
    const arquivo = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', 'aria-label': 'Escolher foto' });
    const status = h('p', { class: 'mudo pequeno', style: 'margin:8px 0 0' },
      'JPG, PNG ou WebP. A foto é reduzida antes de enviar e fica em armazenamento privado — só quem tem login neste processo vê.');
    arquivo.onchange = () => acao(arquivo, async () => {
      const f = arquivo.files[0];
      if (!f) return;
      status.textContent = 'Preparando a foto…';
      const imagem = await reduzirFoto(f);
      status.textContent = 'Enviando…';
      await post('foto', { processo_id: ctx.id, imagem });
      avisar('Foto atualizada.', 'ok');
      ctx.recarregar();
    }).finally(() => { arquivo.value = ''; });
    return h('div', {}, arquivo, status);
  }

  /** Reduz para no máx. 1600 px e JPEG — cabe no limite da Vercel e carrega rápido no celular. */
  async function reduzirFoto(f) {
    const url = URL.createObjectURL(f);
    try {
      const img = await new Promise((ok, falha) => {
        const i = new Image();
        i.onload = () => ok(i);
        i.onerror = () => falha(new Error('Não consegui abrir esta imagem. Use JPG ou PNG (fotos HEIC do iPhone: exporte como JPG).'));
        i.src = url;
      });
      const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * k);
      c.height = Math.round(img.naturalHeight * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', 0.85);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function formGuia(ctx) {
    const campos = ctx.d.guia.itens.filter((i) => i.campo);
    const inputs = Object.fromEntries(campos.map((i) => [i.campo, h('input', { value: ctx.d.processo.extras?.[i.campo] || '', maxlength: 120 })]));
    const btn = h('button', { class: 'btn btn--mini', type: 'submit' }, 'Salvar');
    return h('form', {
      onsubmit: (ev) => {
        ev.preventDefault();
        acao(btn, async () => {
          const extras = Object.fromEntries(Object.entries(inputs).map(([k, el]) => [k, el.value]));
          await post('editar_processo', { processo_id: ctx.id, campos: { extras } });
          avisar('Salvo.', 'ok');
          ctx.recarregar();
        });
      },
    },
      campos.map((i) => h('label', { class: 'campo' }, h('span', {}, i.rotulo_campo), inputs[i.campo])),
      h('p', { class: 'mudo pequeno', style: 'margin:0 0 12px' }, 'Aparece para o cliente dentro da etapa do pedido oficial. Senha do banco não se guarda aqui.'),
      btn);
  }

  function formNota(ctx, etapas) {
    const texto = h('textarea', { maxlength: 2000, required: true, placeholder: 'Ex.: Proposta enviada ao vendedor. Aguardando resposta até sexta.' });
    const etapa = h('select', {},
      h('option', { value: '' }, 'Geral (fora das etapas)'),
      etapas.map((e) => h('option', { value: e.chave, selected: e.chave === ctx.d.etapa_atual }, `${e.ordem}. ${e.titulo}`)));
    const interna = h('input', { type: 'checkbox' });
    const btn = h('button', { class: 'btn btn--ouro', type: 'submit' }, 'Publicar');
    return h('form', {
      onsubmit: (ev) => {
        ev.preventDefault();
        acao(btn, async () => {
          await post('nota', { processo_id: ctx.id, texto: texto.value, etapa_chave: etapa.value || null, interna: interna.checked });
          avisar(interna.checked ? 'Nota interna salva.' : 'Atualização publicada para o cliente.', 'ok');
          ctx.recarregar();
        });
      },
    },
      h('label', { class: 'campo' }, h('span', {}, 'Texto'), texto),
      h('label', { class: 'campo' }, h('span', {}, 'Mostrar na etapa'), etapa),
      h('label', { class: 'marcar' }, interna, 'Nota interna (o cliente não vê)'),
      btn);
  }

  function acessoCliente(ctx) {
    const lista = h('ul', { class: 'acessos' }, ctx.d.acessos.map((a) => {
      const nova = h('button', { class: 'btn btn--mini', type: 'button' }, 'Nova senha');
      nova.onclick = () => {
        if (!confirm(`Gerar uma nova senha para ${a.usuario}? A atual deixa de funcionar.`)) return;
        acao(nova, async () => {
          const r = await post('redefinir_senha', { user_id: a.user_id });
          mostrarCredenciais({ titulo: 'Nova senha gerada', nome: a.nome, ...r, cliente: true });
        });
      };
      const ativo = h('button', { class: `btn btn--mini${a.ativo ? ' btn--perigo' : ''}`, type: 'button' }, a.ativo ? 'Desativar' : 'Reativar');
      ativo.onclick = () => {
        if (a.ativo && !confirm(`Desativar o acesso de ${a.usuario}? A pessoa sai na hora.`)) return;
        acao(ativo, async () => { await post('ativo', { user_id: a.user_id, ativo: !a.ativo }); ctx.recarregar(); });
      };
      return h('li', { class: 'acesso' },
        h('span', {},
          h('code', {}, a.usuario), ' ',
          h('span', { class: 'mudo pequeno' }, a.ativo
            ? (a.ultimo_acesso ? `último acesso ${fmtDataHora(a.ultimo_acesso)}` : 'ainda não entrou')
            : 'desativado')),
        h('span', { class: 'acesso__btns' }, nova, ativo));
    }));

    const usuario = h('input', { value: sugerirUsuario(ctx.d.processo.cliente_nome), maxlength: 40, autocapitalize: 'none', spellcheck: 'false' });
    const nome = h('input', { value: ctx.d.processo.cliente_nome, maxlength: 120 });
    const btn = h('button', { class: 'btn btn--ouro', type: 'submit' }, 'Criar acesso');

    return h('div', {},
      ctx.d.acessos.length ? lista : h('p', { class: 'mudo pequeno', style: 'margin:0 0 12px' }, 'O cliente ainda não tem login.'),
      h('form', {
        onsubmit: (ev) => {
          ev.preventDefault();
          acao(btn, async () => {
            const r = await post('criar_acesso', { processo_id: ctx.id, usuario: usuario.value, nome: nome.value });
            mostrarCredenciais({ titulo: 'Acesso criado', nome: nome.value, ...r, cliente: true });
            ctx.recarregar();
          });
        },
      },
        h('p', { class: 'mudo pequeno', style: 'margin:0 0 10px' },
          ctx.d.acessos.length ? 'Outro acesso para o mesmo processo (ex.: o cônjuge):' : 'A senha é gerada automaticamente e mostrada uma única vez.'),
        h('div', { class: 'grade2' },
          h('label', { class: 'campo' }, h('span', {}, 'Usuário'), usuario),
          h('label', { class: 'campo' }, h('span', {}, 'Nome'), nome)),
        btn));
  }

  // ── equipe (membros) ───────────────────────────────────────────────────────

  async function telaEquipe() {
    await carregarApoio();
    const admin = estado.eu.papel === 'admin';

    const linhas = estado.equipe.map((m) => {
      const eu = m.usuario === estado.eu.usuario;
      let btns = null;
      if (admin && !eu) {
        const nova = h('button', { class: 'btn btn--mini', type: 'button' }, 'Nova senha');
        nova.onclick = () => {
          if (!confirm(`Gerar nova senha para ${m.usuario}?`)) return;
          acao(nova, async () => {
            const r = await post('redefinir_senha', { user_id: m.user_id });
            mostrarCredenciais({ titulo: 'Nova senha gerada', nome: m.nome, ...r });
          });
        };
        const at = h('button', { class: `btn btn--mini${m.ativo ? ' btn--perigo' : ''}`, type: 'button' }, m.ativo ? 'Desativar' : 'Reativar');
        at.onclick = () => {
          if (m.ativo && !confirm(`Desativar ${m.nome}?`)) return;
          acao(at, async () => { await post('ativo', { user_id: m.user_id, ativo: !m.ativo }); telaEquipe(); });
        };
        btns = h('span', { class: 'acesso__btns' }, nova, at);
      }
      return h('li', { class: 'acesso' },
        h('span', {},
          h('strong', {}, m.nome), ' ', h('code', { class: 'mudo' }, m.usuario), h('br'),
          h('span', { class: 'mudo pequeno' }, [ROTULO_PAPEL[m.papel], m.whatsapp ? `WhatsApp ${m.whatsapp}` : null,
            m.ativo ? (m.ultimo_acesso ? `último acesso ${fmtDataHora(m.ultimo_acesso)}` : 'ainda não entrou') : 'desativado',
            eu ? 'você' : null].filter(Boolean).join(' · '))),
        btns);
    });

    let form = null;
    if (admin) {
      const nome = h('input', { required: true, maxlength: 120 });
      const usuario = h('input', { required: true, maxlength: 40, autocapitalize: 'none', spellcheck: 'false' });
      nome.oninput = () => { if (!usuario.dataset.mexido) usuario.value = sugerirUsuario(nome.value); };
      usuario.oninput = () => { usuario.dataset.mexido = '1'; };
      const papel = h('select', {}, h('option', { value: 'corretor' }, 'Corretor'), h('option', { value: 'admin' }, 'Administrador'));
      const whatsapp = h('input', { inputmode: 'tel', placeholder: '81 80 1234 5678', maxlength: 30 });
      const btn = h('button', { class: 'btn btn--ouro', type: 'submit' }, 'Criar membro');
      form = h('form', {
        class: 'cartao',
        onsubmit: (ev) => {
          ev.preventDefault();
          acao(btn, async () => {
            const r = await post('criar_membro', { nome: nome.value, usuario: usuario.value, papel: papel.value, whatsapp: whatsapp.value });
            mostrarCredenciais({ titulo: 'Membro criado', nome: nome.value, ...r });
            telaEquipe();
          });
        },
      },
        h('h2', { style: 'margin-bottom:12px' }, 'Adicionar à equipe'),
        h('div', { class: 'grade2' },
          h('label', { class: 'campo' }, h('span', {}, 'Nome'), nome),
          h('label', { class: 'campo' }, h('span', {}, 'Usuário'), usuario),
          h('label', { class: 'campo' }, h('span', {}, 'Papel'), papel),
          h('label', { class: 'campo' }, h('span', {}, 'WhatsApp (o cliente vê)'), whatsapp)),
        h('p', { class: 'mudo pequeno', style: 'margin:0 0 12px' }, 'Corretor: cria processos e acessos de clientes. Administrador: também gerencia a equipe.'),
        btn);
    }

    app.replaceChildren(h('div', { class: 'pilha' },
      h('div', { class: 'barra' }, barraEquipe('equipe')),
      h('section', { class: 'cartao' }, h('h2', { style: 'margin-bottom:12px' }, 'Equipe'), h('ul', { class: 'acessos' }, linhas)),
      form));
  }

  // ── diálogos ───────────────────────────────────────────────────────────────

  function abrirDialogo(conteudo) {
    dlg.replaceChildren(conteudo);
    if (!dlg.open) dlg.showModal();
  }

  function mostrarCredenciais({ titulo, nome, usuario, senha, cliente }) {
    const endereco = `${location.origin}/acompanhamento`;
    const mensagem = cliente
      ? `Olá, ${nome}!\n\nSeu acesso ao acompanhamento da compra da sua casa:\n${endereco}\n\nUsuário: ${usuario}\nSenha: ${senha}\n\nNo primeiro acesso, troque a senha em "Trocar senha" (no alto da página).\n\nEASY HOUSE`
      : `Olá, ${nome}!\n\nSeu acesso ao painel de acompanhamento da Easy House:\n${endereco}\n\nUsuário: ${usuario}\nSenha: ${senha}\n\nTroque a senha no primeiro acesso.`;
    const copiar = h('button', { class: 'btn btn--ouro', type: 'button' }, 'Copiar mensagem');
    copiar.onclick = async () => {
      try { await navigator.clipboard.writeText(mensagem); copiar.textContent = 'Copiado ✓'; }
      catch { avisar('Não consegui copiar. Selecione o usuário e a senha à mão.'); }
    };
    abrirDialogo(h('div', {},
      h('h2', {}, titulo),
      h('p', { class: 'mudo' }, `Para ${nome}. Envie pelo WhatsApp.`),
      h('div', { class: 'credenciais' },
        h('div', {}, h('span', { class: 'mudo' }, 'Usuário'), h('code', {}, usuario)),
        h('div', {}, h('span', { class: 'mudo' }, 'Senha'), h('code', {}, senha))),
      h('p', { class: 'alerta' }, 'A senha não será mostrada de novo. Se perder, gere uma nova.'),
      h('div', { class: 'dlg__btns' },
        h('button', { class: 'btn', type: 'button', onclick: () => dlg.close() }, 'Fechar'),
        copiar)));
  }

  function dialogoTrocarSenha() {
    const atual = h('input', { type: 'password', autocomplete: 'current-password', required: true });
    const nova = h('input', { type: 'password', autocomplete: 'new-password', required: true, minlength: 8 });
    const conf = h('input', { type: 'password', autocomplete: 'new-password', required: true, minlength: 8 });
    const erro = h('p', { class: 'erro', role: 'alert' });
    const btn = h('button', { class: 'btn btn--ouro', type: 'submit' }, 'Trocar');
    abrirDialogo(h('form', {
      onsubmit: async (ev) => {
        ev.preventDefault();
        erro.textContent = '';
        if (nova.value !== conf.value) { erro.textContent = 'As duas senhas novas não são iguais.'; return; }
        btn.disabled = true;
        try {
          await post('trocar_senha', { atual: atual.value, nova: nova.value });
          dlg.close();
          avisar('Senha trocada.', 'ok');
        } catch (e) {
          erro.textContent = e.message;
        } finally { btn.disabled = false; }
      },
    },
      h('h2', {}, 'Trocar senha'),
      h('label', { class: 'campo' }, h('span', {}, 'Senha atual'), atual),
      h('label', { class: 'campo' }, h('span', {}, 'Senha nova (mín. 8 caracteres)'), nova),
      h('label', { class: 'campo' }, h('span', {}, 'Repita a senha nova'), conf),
      erro,
      h('div', { class: 'dlg__btns' },
        h('button', { class: 'btn', type: 'button', onclick: () => dlg.close() }, 'Cancelar'), btn)));
    atual.focus();
  }

  // ── início ─────────────────────────────────────────────────────────────────

  (async () => {
    try {
      estado.eu = await get('eu');
    } catch {
      estado.eu = null;
    }
    atualizarTopo();
    rota();
  })();
})();
