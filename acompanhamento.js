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
  const fmtPct = (n, casas = 2) =>
    `${Number(n).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;
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
    const cliente = estado.eu?.papel === 'cliente';
    // No celular do cliente o topo leva só o que ele usa: falar com o
    // consultor e a conta. Trocar senha e sair ficam dentro de "Conta".
    document.getElementById('topoConta').hidden = !cliente;
    document.getElementById('topoSenha').hidden = cliente;
    document.getElementById('topoSair').hidden = cliente;
    document.getElementById('topoQuem').hidden = cliente;
    if (!cliente) document.getElementById('topoWa').hidden = true;
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
    if (alvo.dataset.acao === 'conta') dialogoConta();
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
    const m = hash.match(/^#\/p\/([0-9a-f-]{36})(?:\/([a-z]+))?$/i);
    const equipe = estado.eu.papel !== 'cliente';
    document.body.classList.remove('modo-cliente');
    estado.cli = null;

    try {
      if (m && !equipe) return await telaCliente(m[1], { aba: m[2] });
      if (m && m[2] === 'cliente') return await telaCliente(m[1], { previa: true });
      if (m) return await telaProcesso(m[1]);
      if (equipe && hash === '#/equipe') return await telaEquipe();
      if (equipe) return await telaLista();

      const meus = await get('meus_processos');
      if (meus.length === 1) {
        history.replaceState(null, '', `#/p/${meus[0].id}`);
        return await telaCliente(meus[0].id);
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
      equipe ? h('div', { class: 'barra' },
        h('a', { class: 'link voltar', href: '#/' }, '← Todos os processos'),
        h('a', { class: 'btn btn--mini', href: `#/p/${id}/cliente` }, 'Ver como o cliente vê')) : null,
      capa(ctx, etapasOrd),
      equipe ? gestao(ctx, etapasOrd) : consultor(ctx),
      blocoSimulacao(ctx),
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
      secao('Simulação de parcelas', formSimulacao(ctx), !ctx.d.simulacao || ctx.d.simulacao.desatualizada),
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
    // Mostra como o número vai aparecer: "26990" vira "¥26,990 — faltam zeros?"
    const precoLido = h('small', { class: 'mudo pequeno' });
    const lerPreco = () => {
      const n = Number(String(c.casa_preco_yen.value).replace(/[^\d]/g, ''));
      precoLido.textContent = !n ? '' : n < 1_000_000 ? `= ${fmtYen(n)} — faltam os zeros? Digite o valor inteiro.` : `= ${fmtYen(n)}`;
      precoLido.style.color = n && n < 1_000_000 ? 'var(--erro)' : '';
    };
    c.casa_preco_yen.addEventListener('input', lerPreco);
    lerPreco();
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
        h('label', { class: 'campo' }, h('span', {}, 'Preço (¥)'), c.casa_preco_yen, precoLido)),
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

  // ── simulação de parcelas ────────────────────────────────────────────────

  /**
   * Mostra uma simulação já calculada. É a mesma visualização para o cliente
   * e para a prévia do corretor: o que ele vê enquanto digita é exatamente o
   * que o cliente vai ver.
   */
  function vistaSimulacao(r, { previa = false } = {}) {
    const flat = r.emprestimos.length > 1;
    const um = r.emprestimos[0];
    const prazo = `${r.prazo_anos} anos (${r.prazo_meses} meses)`;
    const juros = flat
      ? `FLAT35 ${fmtPct(r.emprestimos[0].juros_anual)} e financeira ${fmtPct(r.emprestimos[1].juros_anual)} ao ano`
      : `juros de ${fmtPct(um.juros_anual)} ao ano (${fmtPct(um.juros_mensal, 4)} ao mês)`;

    const linhas = r.linhas.filter((l) => l.valor);
    return h('div', { class: 'simul' },
      h('div', { class: 'simul__parcela' },
        h('span', {}, previa ? 'Parcela mensal — prévia' : 'Parcela mensal estimada'),
        h('strong', {}, fmtYen(r.parcela)),
        h('small', {}, `${prazo} · ${juros}`)),
      h('p', { class: 'simul__aviso' },
        h('strong', {}, 'Os juros podem mudar até a aprovação final. '),
        'Esta é uma simulação: a taxa, e com ela o valor da parcela, só fica definida quando o banco aprova o financiamento.'),
      h('div', { class: 'simul__soma' },
        h('div', {}, h('span', {}, 'Casa'), h('b', {}, fmtYen(r.preco))),
        h('div', {}, h('span', {}, 'Taxas'), h('b', {}, fmtYen(r.taxas))),
        h('div', { class: 'total' }, h('span', {}, 'Total financiado'), h('b', {}, fmtYen(r.total)))),
      flat ? h('table', { class: 'simul__tabela' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Empréstimo'), h('th', {}, 'Valor'), h('th', {}, 'Juros a.a.'), h('th', {}, 'Parcela'))),
        h('tbody', {}, r.emprestimos.map((e) => h('tr', {},
          h('td', {}, `${e.rotulo} (${Math.round(e.percentual * 100)}%)`),
          h('td', {}, fmtYen(e.valor)), h('td', {}, fmtPct(e.juros_anual)), h('td', {}, fmtYen(e.parcela))))),
        h('tfoot', {}, h('tr', {}, h('td', {}, 'Total'), h('td', {}, fmtYen(r.total)), h('td', {}), h('td', {}, fmtYen(r.parcela))))) : null,
      h('details', { class: 'simul__detalhe', open: previa },
        h('summary', {}, 'Ver o detalhe das taxas'),
        h('table', { class: 'simul__tabela', style: 'margin-top:10px' },
          h('tbody', {}, linhas.map((l) => h('tr', {},
            h('td', {}, l.rotulo, previa && l.automatica ? h('span', { class: 'auto' }, 'fórmula') : null),
            h('td', {}, fmtYen(l.valor))))),
          h('tfoot', {},
            h('tr', {}, h('td', {}, 'Soma das taxas'), h('td', {}, fmtYen(r.soma_taxas_exata))),
            h('tr', {}, h('td', {}, 'Taxas no financiamento'), h('td', {}, fmtYen(r.taxas))))),
        h('p', { class: 'simul__rodape', style: 'margin-top:8px' },
          'As taxas entram no financiamento arredondadas para cima, de ¥10.000 em ¥10.000.')));
  }

  function blocoSimulacao(ctx) {
    const s = ctx.d.simulacao;
    // Simulação feita para o outro tipo de banco (privado × FLAT35) não vai
    // para o cliente: a conta é outra. A equipe vê, com o aviso.
    if (!s || (s.desatualizada && !ctx.equipe)) return null;
    return h('section', { class: 'cartao pilha', 'aria-labelledby': 'tit-simul' },
      h('div', { class: 'simul__topo' },
        h('p', { class: 'sobre' }, 'Simulação de financiamento'),
        h('h2', { id: 'tit-simul' }, 'Sua parcela')),
      s.desatualizada ? h('p', { class: 'alerta' },
        'Esta simulação foi feita para o outro tipo de banco e não aparece para o cliente. Refaça em Gestão do processo → Simulação de parcelas.') : null,
      vistaSimulacao(s.resultado),
      h('p', { class: 'simul__rodape' },
        `Atualizada em ${fmtData(s.atualizado_em)}${s.atualizado_por ? ` por ${s.atualizado_por}` : ''}. Valores podem sofrer alterações.`));
  }

  let libSimulacao = null;
  const carregarLibSimulacao = () => (libSimulacao ||= import('/lib/acompanhamento-simulacao.mjs?v=1'));

  function formSimulacao(ctx) {
    const m = ctx.d.simulacao_modelo;
    if (!m?.campos) return h('p', { class: 'mudo' }, 'Escolha o banco do processo para simular.');
    const salva = ctx.d.simulacao && !ctx.d.simulacao.desatualizada ? ctx.d.simulacao.entrada : null;
    const base = salva || m.padrao;

    const campo = (rotulo, el, dica) => h('label', { class: 'campo' },
      h('span', {}, rotulo), el, dica ? h('small', { class: 'mudo pequeno' }, dica) : null);
    const ienes = (v, ph) => h('input', { inputmode: 'numeric', value: v ?? '', placeholder: ph || '0' });

    const preco = ienes(base.preco ?? ctx.d.processo.casa_preco_yen, '24900000');
    const prazo = h('input', { inputmode: 'decimal', value: base.prazo_anos ?? '' });
    const juros = m.campos.juros.map((j) => [j.chave, j, h('input', { inputmode: 'decimal', value: base[j.chave] ?? '' })]);
    const fixas = m.campos.taxas.filter((t) => !t.auto).map((t) => [t.chave, t, ienes(base.taxas?.[t.chave])]);
    const autos = m.campos.taxas.filter((t) => t.auto).map((t) => [t.chave, t, ienes(base.ajustes?.[t.chave], 'automático')]);

    const coletar = () => ({
      preco: preco.value,
      prazo_anos: prazo.value,
      ...Object.fromEntries(juros.map(([k, , el]) => [k, el.value])),
      taxas: Object.fromEntries(fixas.map(([k, , el]) => [k, el.value])),
      ajustes: Object.fromEntries(autos.map(([k, , el]) => [k, el.value])),
    });

    const previa = h('div', { class: 'simul__previa' }, h('p', { class: 'mudo pequeno', style: 'margin:0' }, 'Preencha o preço da casa para ver a prévia.'));
    const atualizarPrevia = async () => {
      try {
        const lib = await carregarLibSimulacao();
        const r = lib.calcular(lib.validarEntrada(coletar(), m.caminho));
        previa.replaceChildren(vistaSimulacao(r, { previa: true }));
      } catch (e) {
        previa.replaceChildren(h('p', { class: 'mudo pequeno', style: 'margin:0' }, e.message || 'Confira os números.'));
      }
    };

    const salvar = h('button', { class: 'btn btn--ouro', type: 'submit' }, salva ? 'Atualizar simulação' : 'Publicar simulação');
    let remover = null;
    if (ctx.d.simulacao) {
      remover = h('button', { class: 'btn btn--perigo', type: 'button' }, 'Remover');
      remover.onclick = () => {
        if (!confirm('Remover a simulação? O cliente deixa de ver a parcela.')) return;
        acao(remover, async () => {
          await post('simulacao', { processo_id: ctx.id, operacao: 'remover' });
          ctx.recarregar();
        });
      };
    }

    const form = h('form', {
      oninput: atualizarPrevia,
      onsubmit: (ev) => {
        ev.preventDefault();
        acao(salvar, async () => {
          await post('simulacao', { processo_id: ctx.id, entrada: coletar() });
          avisar('Simulação publicada para o cliente.', 'ok');
          ctx.recarregar();
        });
      },
    },
      h('p', { class: 'mudo pequeno', style: 'margin:0 0 14px' },
        m.caminho === 'flat35'
          ? 'Modelo FLAT35: o total é dividido em 90% pelo FLAT35 e 10% por uma financeira, cada um com a sua taxa — como na aba FLAT da planilha.'
          : 'Modelo banco privado: um empréstimo só, pela casa + taxas — como na aba Privado da planilha.'),
      h('div', { class: 'grade2' },
        campo('Preço da casa (¥)', preco),
        campo('Prazo (anos)', prazo),
        juros.map(([, j, el]) => campo(`${j.rotulo} — % ao ano`, el, 'Ex.: 1,79'))),
      h('p', { class: 'sobre', style: 'margin:6px 0 12px' }, 'Taxas'),
      h('div', { class: 'grade2' },
        fixas.map(([, t, el]) => campo(`${t.rotulo} (¥)`, el)),
        autos.map(([, t, el]) => campo(`${t.rotulo} (¥)`, el, 'Vazio = fórmula da planilha'))),
      h('p', { class: 'sobre', style: 'margin:6px 0 12px' }, 'Como o cliente vai ver'),
      previa,
      h('div', { class: 'dlg__btns', style: 'justify-content:flex-start' }, salvar, remover));

    atualizarPrevia();
    return form;
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

  // ── tela do cliente (celular) ──────────────────────────────────────────────
  //
  // O cliente abre isto no celular, quase sempre para responder a duas
  // perguntas: "em que pé está?" e "o que eu preciso fazer?". A tela antiga
  // era uma página só, de 7,5 telas de altura, com a etapa atual depois de
  // quase 4 telas de rolagem. Aqui são quatro abas fixas embaixo, ao alcance
  // do polegar, e a primeira responde as duas perguntas sem rolar.
  //
  // Os dados vêm uma vez; trocar de aba e marcar documento não espera o
  // servidor (a marcação é otimista e desfaz sozinha se falhar).

  const SVG = 'http://www.w3.org/2000/svg';
  const ICONES = {
    inicio: 'M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
    etapas: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
    documentos: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6',
    parcela: 'M6 3h12v18H6zM9 7h6M9 11h.01M12 11h.01M15 11h.01M9 14.5h.01M12 14.5h.01M15 14.5h.01M9 18h.01M12 18h.01M15 18h.01',
    check: 'M5 12.5 10 17 19 7',
    whatsapp: 'M20.5 11.6a8.5 8.5 0 0 1-12.6 7.4L3.5 20.5l1.5-4.3a8.5 8.5 0 1 1 15.5-4.6z',
    seta: 'M9 6l6 6-6 6',
  };
  function icone(nome, tam = 22) {
    const s = document.createElementNS(SVG, 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('width', tam); s.setAttribute('height', tam);
    s.setAttribute('aria-hidden', 'true'); s.setAttribute('focusable', 'false');
    const p = document.createElementNS(SVG, 'path');
    p.setAttribute('d', ICONES[nome]);
    p.setAttribute('fill', 'none'); p.setAttribute('stroke', 'currentColor');
    p.setAttribute('stroke-width', '1.8'); p.setAttribute('stroke-linecap', 'round'); p.setAttribute('stroke-linejoin', 'round');
    s.append(p);
    return s;
  }

  const ABAS = [
    { chave: 'inicio', rotulo: 'Início' },
    { chave: 'etapas', rotulo: 'Etapas' },
    { chave: 'documentos', rotulo: 'Documentos' },
    { chave: 'parcela', rotulo: 'Parcela' },
  ];

  /** "CASTELO NOVO REGINALDO" → "Castelo Novo Reginaldo" — nome em caixa alta grita no celular. */
  const nomeBonito = (n) => String(n || '').toLowerCase()
    .replace(/(^|\s|-)(\p{L})/gu, (m, a, b) => a + b.toUpperCase())
    // "Maria da Silva", não "Maria Da Silva"
    .replace(/(?<=\s)(Da|De|Do|Das|Dos|E)(?=\s)/g, (p) => p.toLowerCase());
  /** Preço abaixo de ¥1 milhão é digitação errada (faltaram zeros), não preço de casa. */
  const precoValido = (n) => Number(n) >= 1_000_000;

  function esqueleto() {
    return h('div', { class: 'cli', 'aria-busy': 'true' },
      h('div', { class: 'esq esq--titulo' }), h('div', { class: 'esq esq--cartao' }),
      h('div', { class: 'esq esq--cartao esq--alto' }), h('div', { class: 'esq esq--cartao' }));
  }

  async function telaCliente(id, { aba, previa = false } = {}) {
    app.replaceChildren(esqueleto());
    const d = await get('processo', { id });
    // A equipe recebe as notas internas; na prévia elas não aparecem.
    if (previa) d.notas = d.notas.filter((n) => !n.interna);
    estado.cli = {
      id, d, previa, carregadoEm: Date.now(), abrirEtapa: null,
      aba: ABAS.some((a) => a.chave === aba) ? aba : 'inicio',
    };
    document.body.classList.add('modo-cliente');
    if (!previa) {
      const wa = document.getElementById('topoWa');
      const msg = `Olá, ${d.consultor.nome}! Sou ${nomeBonito(d.processo.cliente_nome)} e tenho uma dúvida sobre o meu processo.`;
      wa.href = `https://wa.me/${d.consultor.whatsapp}?text=${encodeURIComponent(msg)}`;
      wa.replaceChildren(icone('whatsapp', 18), h('span', {}, 'WhatsApp'));
      wa.hidden = false;
    }
    desenharCliente();
  }

  function irPara(aba, extra = {}) {
    const c = estado.cli;
    Object.assign(c, { aba }, extra);
    // replaceState: trocar de aba não empilha histórico nem dispara hashchange
    // (que buscaria tudo de novo no servidor).
    if (!c.previa) history.replaceState(null, '', `#/p/${c.id}${aba === 'inicio' ? '' : `/${aba}`}`);
    desenharCliente();
    window.scrollTo(0, 0);
    if (extra.abrirEtapa) {
      requestAnimationFrame(() => document.getElementById(`etp-${extra.abrirEtapa}`)?.scrollIntoView({ block: 'start' }));
    }
  }

  function desenharCliente(manterRolagem = false) {
    const y = window.scrollY;
    const c = estado.cli;
    const telas = { inicio: abaInicio, etapas: abaEtapas, documentos: abaDocumentos, parcela: abaParcela };
    app.replaceChildren(h('div', { class: 'cli' },
      c.previa ? h('div', { class: 'cli-previa' },
        h('span', {}, 'Prévia: é assim que o cliente vê.'),
        h('a', { href: `#/p/${c.id}` }, 'Voltar à gestão')) : null,
      telas[c.aba](c.d),
      barraAbas(c.d)));
    if (manterRolagem) window.scrollTo(0, y);
  }

  function resumoCliente(d) {
    const etapas = [...d.etapas].sort((a, b) => a.ordem - b.ordem);
    const atual = etapas.find((e) => e.chave === d.etapa_atual) || null;
    const proxima = atual ? etapas.slice(etapas.indexOf(atual) + 1).find((e) => !e.concluida_em) || null : null;
    const docsDe = (g) => d.documentos.filter((x) => x.grupo === g);
    const pendentes = (g) => docsDe(g).filter((x) => x.status === 'pendente');
    return { etapas, atual, proxima, docsDe, pendentes, feitas: etapas.filter((e) => e.concluida_em).length };
  }

  function barraAbas(d) {
    const r = resumoCliente(d);
    const faltam = r.atual ? r.pendentes(r.atual.chave).length : 0;
    return h('nav', { class: 'abas-cli', 'aria-label': 'Seções' }, ABAS.map((a) => {
      const atual = estado.cli.aba === a.chave;
      return h('button', {
        type: 'button', class: 'abas-cli__item', 'aria-current': atual ? 'page' : false,
        onclick: () => { if (!atual) irPara(a.chave); },
      },
        h('span', { class: 'abas-cli__icone' }, icone(a.chave),
          a.chave === 'documentos' && faltam ? h('span', { class: 'abas-cli__selo', 'aria-label': `${faltam} pendentes` }, String(faltam)) : null),
        h('span', {}, a.rotulo));
    }));
  }

  // ── Início: em que pé está e o que fazer agora ─────────────────────────────

  function abaInicio(d) {
    const r = resumoCliente(d);
    const p = d.processo;
    const quem = estado.cli.previa ? p.cliente_nome : (estado.eu.nome || p.cliente_nome);

    const casa = (p.casa_foto_url || p.casa_titulo) ? h('div', { class: 'cli-casa' },
      p.casa_foto_url ? h('img', { src: p.casa_foto_url, alt: '', class: 'cli-casa__foto' }) : h('div', { class: 'cli-casa__foto cli-casa__foto--vazia' }, icone('inicio', 28)),
      h('div', { class: 'cli-casa__info' },
        h('strong', {}, p.casa_titulo || 'Sua casa'),
        precoValido(p.casa_preco_yen) ? h('span', { class: 'cli-casa__preco' }, fmtYen(p.casa_preco_yen)) : null,
        h('span', { class: 'chip chip--ouro' }, p.banco_nome))) : null;

    const progresso = h('div', { class: 'cli-progresso' },
      h('div', { class: 'cli-progresso__topo' },
        h('strong', {}, r.atual ? `Etapa ${r.atual.ordem} de ${r.etapas.length}` : 'Tudo concluído'),
        h('span', { class: 'mudo pequeno' }, `${r.feitas} de ${r.etapas.length} concluídas`)),
      h('div', { class: 'progresso__linha', role: 'img', 'aria-label': `${r.feitas} de ${r.etapas.length} etapas concluídas` },
        r.etapas.map((e) => h('span', { class: `progresso__seg${e.concluida_em ? ' feito' : (e === r.atual ? ' agora' : '')}` }))));

    let agora;
    if (r.atual) {
      const docs = r.docsDe(r.atual.chave);
      const falta = docs.filter((x) => x.status === 'pendente');
      const orient = d.orientacoes?.[r.atual.chave] || [];
      agora = h('section', { class: 'cli-card cli-card--agora', 'aria-labelledby': 'cli-agora' },
        h('p', { class: 'sobre' }, 'Agora'),
        h('h2', { id: 'cli-agora' }, r.atual.titulo),
        r.atual.descricao ? h('p', { class: 'mudo' }, r.atual.descricao) : null,
        r.atual.data_prevista ? h('p', { class: 'etapa__quando' }, `📅 ${fmtDataHora(r.atual.data_prevista)}`) : null,
        orient.length ? h('ul', { class: 'orientacao' }, orient.map((o) => h('li', {}, o))) : null,
        falta.length ? h('div', { class: 'cli-falta' },
          h('p', {}, h('strong', {}, falta.length === 1 ? 'Falta 1 documento' : `Faltam ${falta.length} documentos`), ' para esta etapa:'),
          h('ul', {}, falta.slice(0, 4).map((x) => h('li', {}, x.nome))),
          falta.length > 4 ? h('p', { class: 'mudo pequeno' }, `e mais ${falta.length - 4}`) : null)
          : (docs.length ? h('p', { class: 'cli-ok' }, icone('check', 18), 'Seus documentos desta etapa estão prontos.') : null),
        docs.length ? h('button', { type: 'button', class: 'btn btn--ouro btn--bloco', onclick: () => irPara('documentos') },
          falta.length ? 'Marcar meus documentos' : 'Ver documentos') : null,
        d.guia && d.guia.etapa === r.atual.chave
          ? h('button', { type: 'button', class: 'btn btn--bloco', onclick: () => irPara('etapas', { abrirEtapa: r.atual.chave }) }, `Ver o guia do ${p.banco_nome}`)
          : null);
    } else {
      agora = h('section', { class: 'cli-card cli-card--agora' },
        h('p', { class: 'sobre' }, 'Concluído'),
        h('h2', {}, 'Chegou o dia da sua casa!'),
        h('p', { class: 'mudo' }, 'Depois das chaves: orientação para mudança, água, luz, gás e os próximos passos.'));
    }

    const depois = r.proxima ? (() => {
      const prep = r.pendentes(r.proxima.chave).length;
      return h('button', { type: 'button', class: 'cli-card cli-linha', onclick: () => irPara('etapas', { abrirEtapa: r.proxima.chave }) },
        h('span', {},
          h('span', { class: 'sobre' }, 'Depois'),
          h('strong', { class: 'cli-linha__titulo' }, r.proxima.titulo),
          prep ? h('span', { class: 'mudo pequeno' }, `Se quiser se adiantar, já dá para preparar ${prep === 1 ? '1 documento' : `${prep} documentos`}.`) : null),
        icone('seta', 20));
    })() : null;

    const notas = d.notas.slice(0, 2);
    const novidades = notas.length ? h('section', { class: 'cli-card' },
      h('p', { class: 'sobre' }, 'Recado do consultor'),
      h('ul', { class: 'notas' }, notas.map((n) => h('li', { class: 'nota' },
        h('p', {}, n.texto),
        h('small', {}, [fmtData(n.criado_em), n.autor].filter(Boolean).join(' · ')))))) : null;

    const s = d.simulacao;
    const parcela = s ? h('button', { type: 'button', class: 'cli-card cli-linha cli-linha--escura', onclick: () => irPara('parcela') },
      h('span', {},
        h('span', { class: 'cli-linha__rotulo' }, 'Parcela mensal estimada'),
        h('strong', { class: 'cli-linha__valor' }, fmtYen(s.resultado.parcela)),
        h('span', { class: 'cli-linha__aviso' }, 'Os juros podem mudar até a aprovação final.')),
      icone('seta', 20)) : null;

    const consultorCard = estado.cli.previa ? null : h('section', { class: 'cli-card cli-consultor' },
      h('span', {}, h('span', { class: 'sobre' }, 'Seu consultor'), h('strong', {}, d.consultor.nome)),
      h('a', {
        class: 'btn btn--wa', target: '_blank', rel: 'noopener',
        href: `https://wa.me/${d.consultor.whatsapp}?text=${encodeURIComponent(`Olá, ${d.consultor.nome}! Sou ${nomeBonito(p.cliente_nome)} e tenho uma dúvida sobre o meu processo.`)}`,
      }, icone('whatsapp', 18), 'Conversar'));

    return h('div', { class: 'cli-pilha' },
      h('header', { class: 'cli-ola' }, h('p', { class: 'sobre' }, 'Pré-avaliação aprovada'), h('h1', {}, `Olá, ${nomeBonito(quem)}`)),
      casa, progresso, agora, depois, parcela, novidades, consultorCard);
  }

  // ── Etapas: a linha do tempo inteira, com a atual aberta ───────────────────

  function abaEtapas(d) {
    const r = resumoCliente(d);
    const abrir = estado.cli.abrirEtapa;
    return h('div', { class: 'cli-pilha' },
      h('header', { class: 'cli-ola' }, h('p', { class: 'sobre' }, 'Seu caminho até as chaves'), h('h1', {}, 'Etapas')),
      h('p', { class: 'mudo', style: 'margin:0' }, 'Você não precisa decorar. Nós avisamos o próximo passo — e você pode abrir qualquer etapa para ver o que vem.'),
      h('ol', { class: 'etapas' }, r.etapas.map((e) => {
        const sit = e.concluida_em ? 'feita' : (e === r.atual ? 'agora' : 'proxima');
        const docs = r.docsDe(e.chave);
        const prontos = docs.filter((x) => x.status !== 'pendente').length;
        const notas = d.notas.filter((n) => n.etapa_chave === e.chave);
        const orient = d.orientacoes?.[e.chave] || [];
        const aberta = abrir ? abrir === e.chave : sit === 'agora';
        return h('li', { id: `etp-${e.chave}` }, h('details', { class: `etapa ${sit}`, open: aberta },
          h('summary', {},
            h('span', { class: 'etapa__num', 'aria-hidden': 'true' }, e.concluida_em ? '✓' : String(e.ordem)),
            h('span', { class: 'etapa__titulo' }, h('h3', {}, e.titulo),
              h('span', { class: 'etapa__estado' }, { feita: `Concluída em ${fmtData(e.concluida_em)}`, agora: 'Agora', proxima: 'Próxima' }[sit])),
            h('span', { class: 'etapa__seta', 'aria-hidden': 'true' }, '▾')),
          h('div', { class: 'etapa__corpo' },
            e.descricao ? h('p', { class: 'etapa__desc' }, e.descricao) : null,
            orient.length ? h('ul', { class: 'orientacao' }, orient.map((o) => h('li', {}, o))) : null,
            e.data_prevista ? h('p', { class: 'etapa__quando' }, `📅 ${fmtDataHora(e.data_prevista)}`) : null,
            docs.length ? h('button', { type: 'button', class: 'cli-linha cli-linha--mini', onclick: () => irPara('documentos') },
              h('span', {}, h('strong', {}, 'Documentos desta etapa'), h('span', { class: 'mudo pequeno' }, `${prontos} de ${docs.length} prontos`)),
              icone('seta', 18)) : null,
            d.guia && d.guia.etapa === e.chave ? blocoGuia({ d }) : null,
            notas.length ? h('ul', { class: 'notas' }, notas.map((n) => h('li', { class: 'nota' },
              h('p', {}, n.texto), h('small', {}, [fmtData(n.criado_em), n.autor].filter(Boolean).join(' · '))))) : null,
            e.chave === 'chaves' ? h('p', { class: 'mudo pequeno', style: 'margin:0' }, 'Depois das chaves: orientação para mudança, água, luz, gás e próximos passos.') : null)));
      })));
  }

  // ── Documentos: tudo num lugar, marcar com um toque ────────────────────────

  async function alternarDoc(doc) {
    if (estado.cli.previa || doc.status === 'entregue') return;
    const antes = doc.status;
    doc.status = antes === 'pendente' ? 'pronto' : 'pendente';
    desenharCliente(true);                       // muda na hora, sem esperar a rede
    try {
      await post('documento', { operacao: 'status', documento_id: doc.id, status: doc.status });
    } catch (e) {
      doc.status = antes;                        // não gravou: volta como estava
      desenharCliente(true);
      avisar(e.message || 'Não consegui salvar. Tente de novo.');
    }
  }

  function linhaDoc(doc) {
    const travado = doc.status === 'entregue' || estado.cli.previa;
    return h('li', {}, h('button', {
      type: 'button', class: `cli-doc ${doc.status}`, disabled: travado,
      'aria-pressed': doc.status !== 'pendente' ? 'true' : 'false',
      onclick: () => alternarDoc(doc),
    },
      h('span', { class: 'cli-doc__marca', 'aria-hidden': 'true' }, doc.status !== 'pendente' ? icone('check', 16) : null),
      h('span', { class: 'cli-doc__nome' }, h('strong', {}, doc.nome), doc.detalhe ? h('small', {}, doc.detalhe) : null),
      h('span', { class: 'doc__selo' }, ROTULO_STATUS[doc.status])));
  }

  function abaDocumentos(d) {
    const r = resumoCliente(d);
    const todos = d.documentos;
    const n = (st) => todos.filter((x) => x.status === st).length;

    const grupo = (titulo, docs, { destaque = false, sempre = false, vazio = null } = {}) => (docs.length || sempre)
      ? h('section', { class: `cli-grupo${destaque ? ' cli-grupo--agora' : ''}` },
        h('h2', { class: 'cli-grupo__titulo' }, titulo),
        docs.length ? h('ul', { class: 'cli-docs' }, docs.map(linhaDoc)) : h('p', { class: 'docs__vazio' }, vazio))
      : null;

    const futuras = r.etapas.filter((e) => !e.concluida_em && e !== r.atual);
    const feitas = r.etapas.filter((e) => e.concluida_em);
    const docsFeitas = feitas.flatMap((e) => r.docsDe(e.chave));

    return h('div', { class: 'cli-pilha' },
      h('header', { class: 'cli-ola' }, h('p', { class: 'sobre' }, 'Toque para marcar o que você já tem'), h('h1', {}, 'Documentos')),
      h('div', { class: 'cli-contagem' },
        h('span', {}, h('b', {}, String(n('pendente'))), 'a preparar'),
        h('span', { class: 'pronto' }, h('b', {}, String(n('pronto'))), 'já tenho'),
        h('span', { class: 'entregue' }, h('b', {}, String(n('entregue'))), 'entregues')),
      h('p', { class: 'mudo pequeno', style: 'margin:0' }, 'Quem confirma a entrega ao banco ou ao vendedor é o seu consultor. Espere a lista dele antes de tirar certidões na prefeitura.'),
      r.atual ? grupo(`Agora · ${r.atual.titulo}`, r.docsDe(r.atual.chave), { destaque: true }) : null,
      futuras.map((e) => grupo(`${e.ordem}. ${e.titulo}`, r.docsDe(e.chave))),
      grupo('Outros documentos', r.docsDe('outros'), { sempre: true, vazio: 'Se o banco ou o vendedor pedir algo a mais, aparece aqui.' }),
      grupo('Pré-avaliação — tenha à mão', r.docsDe('ter_em_maos')),
      docsFeitas.length ? h('details', { class: 'cli-grupo cli-grupo--feitas' },
        h('summary', {}, `Etapas concluídas (${docsFeitas.length} documentos)`),
        feitas.map((e) => grupo(e.titulo, r.docsDe(e.chave)))) : null,
      h('ul', { class: 'lembretes' }, d.lembretes.map((l) => h('li', {}, l))));
  }

  // ── Parcela ────────────────────────────────────────────────────────────────

  function abaParcela(d) {
    const s = d.simulacao;
    return h('div', { class: 'cli-pilha' },
      h('header', { class: 'cli-ola' }, h('p', { class: 'sobre' }, 'Simulação de financiamento'), h('h1', {}, 'Sua parcela')),
      s ? vistaSimulacao(s.resultado) : h('section', { class: 'cli-card' },
        h('h2', {}, 'Ainda não há simulação'),
        h('p', { class: 'mudo' }, 'Quando o seu consultor publicar a simulação das parcelas, ela aparece aqui.')),
      s ? h('p', { class: 'simul__rodape' },
        `Atualizada em ${fmtData(s.atualizado_em)}${s.atualizado_por ? ` por ${s.atualizado_por}` : ''}. Valores podem sofrer alterações.`) : null,
      h('div', { class: 'avisos' }, d.avisos.map((a) => h('div', { class: 'aviso' }, h('strong', {}, a.titulo), h('p', {}, a.texto)))),
      h('p', { class: 'legal' }, d.aviso_legal));
  }

  // Voltou para o app depois de um tempo: busca de novo, em silêncio, para
  // mostrar o que o consultor atualizou enquanto o celular estava no bolso.
  document.addEventListener('visibilitychange', async () => {
    const c = estado.cli;
    if (document.visibilityState !== 'visible' || !c || c.previa) return;
    if (Date.now() - c.carregadoEm < 60_000) return;
    try {
      const d = await get('processo', { id: c.id });
      if (estado.cli !== c) return;
      c.d = d; c.carregadoEm = Date.now();
      desenharCliente(true);
    } catch { /* sem rede: fica com o que tem */ }
  });

  function dialogoConta() {
    const sair = h('button', { class: 'btn btn--perigo btn--bloco', type: 'button' }, 'Sair');
    sair.onclick = async () => {
      await post('logout').catch(() => {});
      dlg.close();
      estado.eu = null; estado.cli = null;
      document.body.classList.remove('modo-cliente');
      document.getElementById('topoWa').hidden = true;
      atualizarTopo();
      history.replaceState(null, '', location.pathname);
      telaLogin();
    };
    abrirDialogo(h('div', { class: 'pilha' },
      h('div', {}, h('p', { class: 'sobre' }, 'Sua conta'), h('h2', { style: 'margin-top:6px' }, nomeBonito(estado.eu.nome)),
        h('p', { class: 'mudo pequeno', style: 'margin:4px 0 0' }, `Usuário: ${estado.eu.usuario}`)),
      h('button', { class: 'btn btn--bloco', type: 'button', onclick: () => dialogoTrocarSenha() }, 'Trocar senha'),
      sair,
      h('button', { class: 'link', type: 'button', onclick: () => dlg.close() }, 'Fechar')));
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
