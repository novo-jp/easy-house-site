/**
 * GET /imoveis — a busca de apartamentos para alugar, renderizada no servidor.
 *
 * O mesmo desenho de /comprar/imoveis (api/casas-lista.mjs): o HTML já chega
 * com a primeira página de resultados, os filtros como um <form method="get">
 * que funciona sozinho, os chips ativos como links e a paginação como links.
 * O aluguel-busca.js entra por cima só para evitar recarregar a página a
 * cada toque e para abrir o detalhamento de custos — mesma URL, mesma lista
 * (a lógica é a de lib/aluguel-busca.mjs, a mesma da API).
 *
 * Antes esta página era um HTML estático que baixava o acervo inteiro no
 * navegador com a chave pública e só tinha três filtros (cidade fixa em 19
 * botões, quartos e pet). Agora as cidades vêm do acervo real com contagem,
 * e dá para filtrar por custo total, entrada, luva/depósito, estação,
 * disponibilidade e área.
 */

import { createRequire } from 'node:module';
import { carregarAlugueis } from '../lib/aluguel-fonte.mjs';
import { lerFiltros, resolverLocal, buscar, facetas, diagnosticoVazio, filtrosAtivos,
         filtrosParaParams, ORDENS, ORDEM_PADRAO, chave } from '../lib/aluguel-busca.mjs';
import { documento, esc, SITE, ICONE_WA } from '../lib/casas-html.mjs';

const require = createRequire(import.meta.url);
const Cartao = require('../lib/aluguel-cartao.js');

const CAMINHO = '/imoveis';
export const POR_PAGINA_LISTA = 18;
const WHATSAPP = Cartao.WHATSAPP;
const VERSAO = 1;   // ?v= dos arquivos desta página (aluguel.css, aluguel-busca.js, custos.js)

const yenPt = (v) => '¥' + Number(v).toLocaleString('pt-BR');
const diaMes = (iso) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : null);

/* ── Rótulos dos filtros (a mesma tabela que o JS usa: vai no data-rotulos) ── */

export const ROTULOS = {
  q: (v) => `Busca: “${v}”`,
  cidades: (v, r) => `Cidade: ${r.cidade?.[v] || v}`,
  quartos: (v) => (v === '3' ? '3 quartos ou mais' : `${v} quarto${v === '1' ? '' : 's'}`),
  plantas: (v) => `Planta: ${String(v).toUpperCase()}`,
  aluguelMin: (v) => `Aluguel: a partir de ${yenPt(v)}`,
  aluguelMax: (v) => `Aluguel: até ${yenPt(v)}`,
  mensalMax: (v) => `Custo mensal: até ${yenPt(v)}`,
  entradaMax: (v) => `Entrada: até ${yenPt(v)}`,
  areaMin: (v) => `Área: a partir de ${v} m²`,
  estacaoMax: (v) => `Estação: até ${v} min a pé`,
  pet: () => 'Aceita pet',
  internet: () => 'Internet inclusa',
  luva: () => 'Sem luva (礼金)',
  deposito: () => 'Sem depósito (敷金)',
  disponivel: (v) => ({ imediata: 'Entrada imediata', prevista: 'Entrada com data prevista' }[v] || v),
  codigos: (v) => `Código ${v}`
};

const NOMES = {
  q: 'a busca por texto', cidades: 'as cidades', quartos: 'os quartos', plantas: 'a planta',
  aluguelMin: 'o aluguel mínimo', aluguelMax: 'o aluguel máximo', mensalMax: 'o custo mensal máximo',
  entradaMax: 'a entrada máxima', areaMin: 'a área mínima', estacaoMax: 'a distância da estação',
  pet: 'aceita pet', internet: 'internet inclusa', luva: 'sem luva', deposito: 'sem depósito',
  disponivel: 'a disponibilidade'
};

function urlSem(f, ordem, filtro, valor) {
  const g = { ...f };
  if (Array.isArray(g[filtro])) g[filtro] = g[filtro].filter((x) => x !== valor);
  else g[filtro] = null;
  const p = filtrosParaParams(g, ordem, 1);
  return CAMINHO + (p.toString() ? '?' + p : '');
}

function urlCom(f, ordem, mudancas, pagina) {
  const p = filtrosParaParams({ ...f, ...mudancas }, ordem, pagina || 1);
  return CAMINHO + (p.toString() ? '?' + p : '');
}

/* ── Peças da página ─────────────────────────────────────────── */

function opcaoCheck({ nome, valor, rotulo, rotuloJp, total, marcado, desabilitado, motivo, tipo = 'checkbox' }) {
  const id = `f-${nome}-${String(valor).replace(/[^a-z0-9]+/gi, '-') || 'qualquer'}`;
  return `<label class="opcao${marcado ? ' ativa' : ''}${desabilitado ? ' zero' : ''}" for="${id}">
    <input type="${tipo}" id="${id}" name="${esc(nome)}" value="${esc(valor)}"${marcado ? ' checked' : ''}${desabilitado && !marcado ? ' disabled' : ''}/>
    <span class="opcao__txt">${esc(rotulo)}${rotuloJp ? ` <span class="jp" lang="ja">${esc(rotuloJp)}</span>` : ''}</span>
    ${total !== undefined ? `<span class="conta" aria-label="${total} imóveis">${total}</span>` : ''}
    ${desabilitado && !marcado ? `<span class="sr-only">. ${esc(motivo || 'Nenhum imóvel com os filtros atuais')}</span>` : ''}
  </label>`;
}

function chipsAtivos(f, ordem, rot) {
  const ativos = filtrosAtivos(f).filter((k) => k !== 'codigos');
  const chips = [];
  for (const k of ativos) {
    const valores = Array.isArray(f[k]) ? f[k] : [f[k]];
    for (const v of valores) {
      chips.push(`<a class="tag-ativa" href="${esc(urlSem(f, ordem, k, v))}" data-remover="${esc(k)}" data-valor="${esc(v)}" rel="nofollow">
        ${esc(ROTULOS[k](v, rot))} <span class="tag-ativa__x" aria-hidden="true">×</span><span class="sr-only"> — remover este filtro</span></a>`);
    }
  }
  if (!chips.length) return '';
  return `${chips.join('')}<a class="tag-limpar" href="${CAMINHO}" id="limparTudo" rel="nofollow">Limpar tudo</a>`;
}

function paginacao(r, f) {
  if (r.totalPaginas <= 1) return '';
  const link = (n, rotulo, atual) => `<a href="${esc(urlCom(f, r.ordem, {}, n))}" data-pagina="${n}"${atual ? ' aria-current="page"' : ''}${rotulo ? ` aria-label="${esc(rotulo)}"` : ''} rel="nofollow">${rotulo ? (n < r.pagina ? '‹' : '›') : n}</a>`;
  let html = '';
  if (r.pagina > 1) html += link(r.pagina - 1, 'Página anterior');
  const janela = [];
  for (let i = 1; i <= r.totalPaginas; i++) if (i === 1 || i === r.totalPaginas || Math.abs(i - r.pagina) <= 1) janela.push(i);
  let ant = 0;
  for (const n of janela) {
    if (ant && n - ant > 1) html += '<span class="reticencias" aria-hidden="true">…</span>';
    html += link(n, null, n === r.pagina);
    ant = n;
  }
  if (r.pagina < r.totalPaginas) html += link(r.pagina + 1, 'Próxima página');
  return html;
}

function estadoVazio(f, ordem, diag, rot) {
  const acoes = diag.sugestoes.slice(0, 3).map((s) => {
    const vazio = Array.isArray(f[s.filtro]) ? [] : null;
    return `<a class="btn btn--ghost" href="${esc(urlCom(f, ordem, { [s.filtro]: vazio }))}" data-sugestao="${esc(s.filtro)}" rel="nofollow">Remover ${esc(NOMES[s.filtro] || s.filtro)} <span class="conta">+${s.voltariam}</span></a>`;
  }).join('');
  const descricao = filtrosAtivos(f).filter((k) => k !== 'codigos').flatMap((k) => (Array.isArray(f[k]) ? f[k] : [f[k]]).map((v) => ROTULOS[k](v, rot))).join(' · ');
  const msg = 'Olá! Procuro um apartamento para alugar em Aichi' + (descricao ? ' (' + descricao + ')' : '') + ' e não encontrei no site da Easy House. Podem me ajudar a achar algo assim?';
  return `<div class="aviso-vazio" id="avisoVazio" role="status">
    <h2>Nenhum apartamento com todos esses filtros</h2>
    ${descricao ? `<p class="aviso-vazio__filtros">Você pediu: <strong>${esc(descricao)}</strong>.</p>` : ''}
    ${diag.sugestoes.length ? `<p>O que mais está limitando a busca é <strong>${esc(NOMES[diag.sugestoes[0].filtro] || diag.sugestoes[0].filtro)}</strong>: sem esse filtro voltariam ${diag.sugestoes[0].voltariam} imóveis. Você escolhe o que afrouxar — nada muda sozinho.</p>` : ''}
    <div class="aviso-vazio__acoes">${acoes}
      <a class="btn btn--ghost" href="${CAMINHO}" rel="nofollow">Limpar todos os filtros</a></div>
    <p class="aviso-vazio__ajuda">Prefere que a gente procure? A lista tem só o que a busca salva no portal alcança — há imóveis fora dela.
      <a href="https://wa.me/${WHATSAPP}?text=${encodeURIComponent(msg)}" data-cta="busca_vazia_aluguel" rel="nofollow">Pedir ajuda pelo WhatsApp</a> — abre o WhatsApp com a sua busca já descrita.</p>
  </div>`;
}

/* ── Página ──────────────────────────────────────────────────── */

export function paginaLista({ acervo, pedido, r, fac, rot, aluguelOpcoes }) {
  const f = pedido.filtros;
  const ordem = pedido.ordem;
  const temFiltro = filtrosAtivos(f).length > 0 || pedido.pagina > 1 || ordem !== ORDEM_PADRAO;
  const nCidades = fac.cidades.length;

  const titulo = `Apartamentos para alugar em Aichi | ${r.totalAcervo} imóveis com custos em português | EASY HOUSE`;
  const descricao = `Busque entre ${r.totalAcervo} apartamentos para alugar em ${nCidades} cidades de Aichi por aluguel, custo mensal total, entrada, quartos e estação. Sem luva, aceita pet, entrada imediata. A Easy House explica cada custo em português.`;

  const cards = r.itens.map((a, i) => Cartao.cartao(a, { prioridade: i === 0 })).join('');

  const verificado = diaMes(acervo.verificadoEm);
  const avisoJanela = acervo.janelaDias > 7
    ? `<p class="aviso-param" role="status">A última verificação no portal foi em ${esc(verificado || '—')}. Alguns imóveis podem já ter sido alugados — confirmamos cada um antes de qualquer visita.</p>` : '';

  const corpo = `
<main id="main" class="busca busca--aluguel">
  <header class="busca-topo">
    <h1>Encontre seu apartamento em Aichi, <em>com os custos explicados</em></h1>
    <p class="busca-topo__sub">Aluguel, condomínio, vaga, luva, depósito: o total por mês e o total para entrar, em português. Gostou de algum? Chame no WhatsApp que a gente confirma a disponibilidade e cuida do resto em japonês.</p>

    <form class="busca-rapida" method="get" action="${CAMINHO}" id="formBusca" role="search" aria-label="Busca rápida de apartamentos">
      <div class="campo campo--local">
        <label for="campoBusca">Cidade, estação ou nome do prédio</label>
        <input type="search" id="campoBusca" name="q" list="listaLocais" value="${esc(f.q || '')}" autocomplete="off" enterkeyhint="search" placeholder="Ex.: Toyohashi, Okazaki, Nagoya"/>
        <datalist id="listaLocais">
          ${fac.cidades.map((c) => `<option value="${esc(c.valor)}">${esc(c.valor)}${c.jp ? ' — ' + esc(c.jp) : ''}</option>`).join('')}
        </datalist>
      </div>
      <div class="campo">
        <label for="aluguelMaxRapido">Aluguel máximo</label>
        <select id="aluguelMaxRapido" name="aluguelMax">
          <option value="">Qualquer</option>
          ${aluguelOpcoes.map((v) => `<option value="${v}"${f.aluguelMax === v ? ' selected' : ''}>${yenPt(v)}/mês</option>`).join('')}
        </select>
      </div>
      <div class="campo">
        <label for="quartosRapido">Quartos</label>
        <select id="quartosRapido" name="quartos">
          <option value="">Qualquer</option>
          ${['1', '2', '3'].map((q) => `<option value="${q}"${f.quartos.length === 1 && f.quartos[0] === q ? ' selected' : ''}>${q === '3' ? '3 ou mais' : q}</option>`).join('')}
        </select>
      </div>
      ${f.cidades.length ? f.cidades.map((c) => `<input type="hidden" name="cidade" value="${esc(c)}"/>`).join('') : ''}
      <button class="btn btn--gold busca-rapida__btn" type="submit">Buscar apartamentos</button>
      <button class="chip-f busca-rapida__mais" type="button" id="abrirFiltros" aria-haspopup="dialog" aria-expanded="false" aria-controls="painelFiltros">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4"/></svg>
        Mais filtros <span class="conta" id="contaFiltros">${filtrosAtivos(f).filter((k) => k !== 'codigos').length || ''}</span>
      </button>
    </form>
  </header>

  <div class="barra" id="barra">
    <div class="barra__inner">
      <p class="barra__contagem" id="contagem" role="status" aria-live="polite"><strong>${r.total}</strong> ${r.total === 1 ? 'apartamento' : 'apartamentos'}${r.total !== r.totalAcervo ? ` <span class="barra__de">de ${r.totalAcervo}</span>` : ''}${verificado ? ` <span class="barra__de">· lista verificada em ${esc(verificado)}</span>` : ''}</p>
      <form class="barra__ordem" method="get" action="${CAMINHO}" id="formOrdem">
        ${[...filtrosParaParams(f, null, 1).entries()].map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}"/>`).join('')}
        <label for="ordenar">Ordenar</label>
        <select class="ordenar" id="ordenar" name="ordem">
          ${Object.entries(ORDENS).map(([k, o]) => `<option value="${k}"${k === ordem ? ' selected' : ''} title="${esc(o.explica)}">${esc(o.rotulo)}</option>`).join('')}
        </select>
        <button class="btn btn--ghost btn--sm so-sem-js" type="submit">Aplicar</button>
        <p class="ordem__explica" id="ordemExplica">${esc(ORDENS[ordem].explica)}</p>
      </form>
    </div>
    <div class="filtros-ativos" id="filtrosAtivos">${chipsAtivos(f, ordem, rot)}</div>
    ${pedido.ignorados.length ? `<p class="aviso-param" role="status">Parte do endereço não fazia sentido e foi ignorada (${esc(pedido.ignorados.join(', '))}). Mostramos a busca com o que sobrou.</p>` : ''}
    ${pedido.localResolvido ? `<p class="aviso-param" role="status">Entendemos “${esc(pedido.qOriginal || '')}” como uma cidade e trocamos o filtro de cidade.</p>` : ''}
    ${avisoJanela}
  </div>

  <div class="casa-grid" id="resultados" data-pagina="${r.pagina}" data-total-paginas="${r.totalPaginas}">${cards}</div>
  ${r.total === 0 ? estadoVazio(f, ordem, diagnosticoVazio(acervo.itens, f), rot) : ''}
  ${r.totalPaginas > r.pagina ? `<p class="carregar-mais"><a class="btn btn--ghost" id="carregarMais" href="${esc(urlCom(f, ordem, {}, r.pagina + 1))}" rel="nofollow">Carregar mais <span class="conta">${Math.min(r.porPagina, r.total - r.pagina * r.porPagina)}</span></a></p>` : ''}
  <nav class="paginacao" id="paginacao" aria-label="Páginas de resultados">${paginacao(r, f)}</nav>

  <!-- Painel "Mais filtros": um <form> de verdade. Sem JS ele aparece no fim da página; com JS vira um diálogo. -->
  <div class="painel" id="painelFiltros" role="dialog" aria-modal="true" aria-labelledby="tituloFiltros" hidden>
    <div class="painel__fundo" data-fechar-painel></div>
    <form class="painel__corpo" method="get" action="${CAMINHO}" id="formFiltros">
      <div class="painel__pega" aria-hidden="true"></div>
      <div class="painel__topo">
        <h2 id="tituloFiltros">Filtros</h2>
        <button class="painel__fechar" type="button" data-fechar-painel aria-label="Fechar filtros">×</button>
      </div>
      ${f.q ? `<input type="hidden" name="q" value="${esc(f.q)}"/>` : ''}
      <input type="hidden" name="ordem" value="${esc(ordem)}"/>

      <details class="painel__grupo" open>
        <summary><h3>Onde</h3><span class="painel__resumo" data-resumo="onde"></span></summary>
        <div class="campo campo--filtro-cidade">
          <label for="filtroCidade">Procurar cidade na lista</label>
          <input type="search" id="filtroCidade" placeholder="Digite para filtrar a lista" autocomplete="off"/>
        </div>
        <fieldset class="painel__sub" data-cidades>
          <legend>Cidade <span class="conta">${fac.cidades.reduce((s, c) => s + c.total, 0)}</span></legend>
          <div class="painel__opcoes">${fac.cidades.map((c) => opcaoCheck({
            nome: 'cidade', valor: c.chave, rotulo: c.valor, rotuloJp: c.jp, total: c.total,
            marcado: f.cidades.includes(c.chave), desabilitado: c.total === 0,
            motivo: `Nenhum imóvel em ${c.valor} com os filtros atuais`
          })).join('')}</div>
        </fieldset>
        <p class="painel__nota">A lista alcança ${nCidades} cidades de Aichi — as que a busca salva no portal cobre. Cidades sem imóveis para os filtros atuais aparecem apagadas.</p>
      </details>

      <details class="painel__grupo" open>
        <summary><h3>Quanto</h3><span class="painel__resumo" data-resumo="preco"></span></summary>
        <fieldset class="painel__sub">
          <legend>Aluguel <span class="jp" lang="ja">家賃</span></legend>
          <div class="faixa">
            <div class="campo"><label for="aluguelMin">Mínimo (¥/mês)</label><input type="number" id="aluguelMin" name="aluguelMin" value="${f.aluguelMin ?? ''}" inputmode="numeric" min="0" step="5000" placeholder="0"/></div>
            <div class="campo"><label for="aluguelMax">Máximo (¥/mês)</label><input type="number" id="aluguelMax" name="aluguelMax" value="${f.aluguelMax ?? ''}" inputmode="numeric" min="0" step="5000" placeholder="${aluguelOpcoes.at(-1) || ''}"/></div>
          </div>
          <p class="faixa__leitura" id="leituraPreco" aria-live="polite"></p>
        </fieldset>
        <fieldset class="painel__sub">
          <legend>Ou pelo custo mensal total</legend>
          <div class="painel__opcoes">${opcaoCheck({ nome: 'mensalMax', valor: '', rotulo: 'Qualquer', marcado: !f.mensalMax, tipo: 'radio' })}${[50000, 60000, 70000, 80000, 90000].map((v) => opcaoCheck({ nome: 'mensalMax', valor: v, rotulo: `até ${yenPt(v)}/mês`, marcado: f.mensalMax === v, tipo: 'radio' })).join('')}</div>
          <p class="painel__nota">O custo mensal soma aluguel, condomínio, vaga (quando há), empresa garantidora (2,2%) e o suporte 24h — é o que sai da conta todo mês.</p>
        </fieldset>
        <fieldset class="painel__sub">
          <legend>Entrada estimada</legend>
          <div class="painel__opcoes">${opcaoCheck({ nome: 'entradaMax', valor: '', rotulo: 'Qualquer', marcado: !f.entradaMax, tipo: 'radio' })}${[250000, 300000, 400000, 500000].map((v) => opcaoCheck({ nome: 'entradaMax', valor: v, rotulo: `até ${yenPt(v)}`, marcado: f.entradaMax === v, tipo: 'radio' })).join('')}</div>
          <p class="painel__nota">Estimativa com 15 diárias, um mês adiantado, intermediação, garantidora, limpeza, taxa de contrato, chaves, luva e depósito quando o anúncio cobra. <a href="/custo-inicial-aluguel-japao">Como a entrada é calculada</a>.</p>
        </fieldset>
        <fieldset class="painel__sub">
          <legend>Custos de entrada</legend>
          <div class="painel__opcoes">
            ${opcaoCheck({ nome: 'luva', valor: 'sem', rotulo: 'Sem luva', rotuloJp: '礼金なし', total: fac.luva.sem, marcado: f.luva === 'sem', desabilitado: !fac.luva.sem })}
            ${opcaoCheck({ nome: 'deposito', valor: 'sem', rotulo: 'Sem depósito', rotuloJp: '敷金なし', total: fac.deposito.sem, marcado: f.deposito === 'sem', desabilitado: !fac.deposito.sem })}
          </div>
          <p class="painel__nota">Luva (礼金) é um pagamento ao proprietário que não volta. Depósito (敷金) volta no fim, menos reparos.</p>
        </fieldset>
      </details>

      <details class="painel__grupo" ${f.quartos.length || f.plantas.length || f.areaMin ? 'open' : ''}>
        <summary><h3>Tamanho</h3><span class="painel__resumo" data-resumo="tamanho"></span></summary>
        <fieldset class="painel__sub">
          <legend>Quartos</legend>
          <div class="painel__opcoes">${fac.quartos.map((q) => opcaoCheck({ nome: 'quartos', valor: q.valor, rotulo: q.valor === '3' ? '3 ou mais' : q.valor + (q.valor === '1' ? ' quarto' : ' quartos'), total: q.total, marcado: f.quartos.includes(q.valor), desabilitado: q.total === 0 })).join('')}</div>
        </fieldset>
        <fieldset class="painel__sub">
          <legend>Planta <span class="jp" lang="ja">間取り</span></legend>
          <div class="painel__opcoes">${fac.plantas.map((p) => opcaoCheck({ nome: 'planta', valor: p.chave, rotulo: p.valor, total: p.total, marcado: f.plantas.includes(p.chave), desabilitado: p.total === 0 })).join('')}</div>
          <p class="painel__nota">L = sala, D = jantar, K = cozinha, R = quarto e cozinha no mesmo cômodo, S = cômodo extra sem janela. O número é a quantidade de quartos.</p>
        </fieldset>
        <div class="campo"><label for="areaMin">Área mínima (m²)</label><input type="number" id="areaMin" name="areaMin" value="${f.areaMin ?? ''}" inputmode="numeric" min="0" step="5"/></div>
        <p class="painel__nota">${fac.semDado.area} dos resultados atuais não informam a área e continuam aparecendo.</p>
      </details>

      <details class="painel__grupo" ${f.disponivel.length ? 'open' : ''}>
        <summary><h3>Quando</h3><span class="painel__resumo" data-resumo="quando"></span></summary>
        <fieldset class="painel__sub">
          <legend>Disponibilidade <span class="jp" lang="ja">入居可能日</span></legend>
          <div class="painel__opcoes">
            ${opcaoCheck({ nome: 'disponivel', valor: 'imediata', rotulo: 'Entrada imediata', rotuloJp: '即入居可', total: fac.disponivel.imediata, marcado: f.disponivel.includes('imediata'), desabilitado: !fac.disponivel.imediata })}
            ${opcaoCheck({ nome: 'disponivel', valor: 'prevista', rotulo: 'Com data prevista', total: fac.disponivel.prevista, marcado: f.disponivel.includes('prevista'), desabilitado: !fac.disponivel.prevista })}
          </div>
          <p class="painel__nota">“Entrada imediata” é o que o portal informa hoje; a data real depende da assinatura e da vistoria.</p>
        </fieldset>
      </details>

      <details class="painel__grupo" ${f.estacaoMax ? 'open' : ''}>
        <summary><h3>Rotina</h3><span class="painel__resumo" data-resumo="rotina"></span></summary>
        <fieldset class="painel__sub">
          <legend>Estação a pé <span class="jp" lang="ja">徒歩</span></legend>
          <div class="painel__opcoes">${opcaoCheck({ nome: 'estacaoMax', valor: '', rotulo: 'Qualquer', marcado: !f.estacaoMax, tipo: 'radio' })}${[5, 10, 15, 20].map((v) => opcaoCheck({ nome: 'estacaoMax', valor: v, rotulo: `até ${v} min`, marcado: f.estacaoMax === v, tipo: 'radio' })).join('')}</div>
          <p class="painel__nota">${fac.semDado.estacao} dos resultados atuais não informam a caminhada até a estação e continuam aparecendo — ${fac.semDado.onibus} deles chegam de ônibus.</p>
        </fieldset>
        <p class="painel__nota">Todos os anúncios desta lista têm vaga de estacionamento; o valor da vaga aparece em cada card e entra no custo mensal.</p>
      </details>

      <details class="painel__grupo" ${f.pet || f.internet ? 'open' : ''}>
        <summary><h3>Comodidades</h3><span class="painel__resumo" data-resumo="comod"></span></summary>
        <div class="painel__opcoes">
          ${opcaoCheck({ nome: 'pet', valor: 'sim', rotulo: 'Aceita pet', rotuloJp: 'ペット可', total: fac.pet.sim, marcado: f.pet === 'sim', desabilitado: !fac.pet.sim, motivo: 'Nenhum imóvel conferido aceita pet com os filtros atuais' })}
          ${opcaoCheck({ nome: 'internet', valor: 'sim', rotulo: 'Internet inclusa', rotuloJp: 'ネット無料', total: fac.internet.sim, marcado: f.internet === 'sim', desabilitado: !fac.internet.sim, motivo: 'Nenhum imóvel conferido com internet inclusa nos filtros atuais' })}
        </div>
        <p class="painel__nota">Pet e internet só aparecem na página de cada anúncio, que conferimos aos poucos: <span data-pet-verificados>${fac.pet.verificados}</span> de ${r.totalAcervo} já foram conferidos. Os que ainda não foram não entram nestes filtros — se o seu apartamento não aparece, pergunte no WhatsApp que a gente confirma.</p>
      </details>

      <div class="painel__rodape">
        <a class="btn btn--ghost" href="${CAMINHO}" id="limparFiltros">Limpar</a>
        <button class="btn btn--gold" type="submit" id="verResultados">Mostrar <span id="verResultadosN">${r.total}</span> imóveis</button>
      </div>
    </form>
  </div>

  <!-- Detalhamento de custos: preenchido pelo aluguel-busca.js a partir do card -->
  <div class="modal" id="modalCustos" role="dialog" aria-modal="true" aria-labelledby="modalTitulo" hidden>
    <div class="modal__fundo" data-fechar></div>
    <div class="modal__caixa">
      <div class="modal__topo">
        <h2 id="modalTitulo">Quanto custa para entrar</h2>
        <button class="modal__fechar" type="button" data-fechar aria-label="Fechar">✕</button>
      </div>
      <p class="modal__sub" id="modalSub"></p>
      <div id="modalCorpo"></div>
    </div>
  </div>

  <section class="section section--narrow busca-editorial" aria-labelledby="ajuda-t">
    <h2 class="h-section" id="ajuda-t">Como usar esta busca</h2>
    <p class="lead">Os anúncios vêm do portal que as imobiliárias japonesas usam entre si e são verificados todo dia. O valor de “custo mensal” e “entrada estimada” de cada card já soma as taxas que costumam pegar o brasileiro de surpresa — garantidora, limpeza, luva, depósito. Quando você achar um apartamento, mande pelo WhatsApp: a gente confirma a disponibilidade, fecha o orçamento exato e cuida da papelada em japonês.</p>
    <p class="btn-row">
      <a class="btn btn--wa" rel="nofollow" data-cta="rodape_busca_aluguel" href="https://wa.me/${WHATSAPP}?text=${encodeURIComponent('Olá! Quero ajuda para encontrar um apartamento para alugar em Aichi.')}">${ICONE_WA} Falar com a Easy House</a>
      <a class="btn btn--ghost" href="/custo-inicial-aluguel-japao">Quanto custa para entrar num aluguel</a>
      <a class="btn btn--ghost" href="/landingaluguel">Como funciona o aluguel com a Easy House</a>
    </p>
    <p class="busca-editorial__link"><a href="/comprar/imoveis">Prefere comprar? Veja as casas à venda →</a></p>
  </section>
</main>`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Apartamentos para alugar em Aichi',
    description: descricao,
    url: `${SITE}${CAMINHO}`,
    isPartOf: { '@type': 'WebSite', name: 'EASY HOUSE', url: `${SITE}/` },
    mainEntity: { '@type': 'ItemList', numberOfItems: r.total,
      itemListElement: r.itens.slice(0, 10).map((a, i) => ({ '@type': 'ListItem', position: i + 1, name: `${a.titulo} — ${a.cidade || 'Aichi'}` })) }
  };

  return documento({
    titulo, descricao,
    canonical: `${SITE}${CAMINHO}`,
    imagem: `${SITE}/images/opt/equipe-imovel-900.jpg`,
    robots: temFiltro ? 'noindex, follow' : null,
    jsonLd, corpo,
    caminhoAtual: CAMINHO,
    classeBody: 'pagina-busca pagina-aluguel',
    scripts: [`/custos.js?v=${VERSAO + 2}`, `/lib/aluguel-cartao.js?v=${VERSAO}`, `/aluguel-busca.js?v=${VERSAO}`],
    preconnect: ['https://image.eheya.net'],
    head: `<link rel="stylesheet" href="/aluguel.css?v=${VERSAO}"/>
<script id="dadosBusca" type="application/json">${JSON.stringify({
      total: r.total, totalAcervo: r.totalAcervo, pagina: r.pagina, totalPaginas: r.totalPaginas, ordem,
      filtros: f, rotulos: rot, aluguelOpcoes, itens: r.itens, verificadoEm: acervo.verificadoEm
    }).replace(/</g, '\\u003c')}</script>`
  });
}

/** Opções do select "aluguel máximo": passos de ¥10.000 dentro do que existe no acervo. */
function opcoesDeAluguel(limites) {
  const min = limites.aluguelMin ?? 30000, max = limites.aluguelMax ?? 90000;
  const passo = 10000;
  const out = [];
  for (let v = Math.ceil(min / passo) * passo; v <= Math.ceil(max / passo) * passo; v += passo) out.push(v);
  return out;
}

export default async function handler(req, res) {
  const url = new URL(req.url, `https://${req.headers.host || 'easyhouse.homes'}`);
  try {
    const acervo = await carregarAlugueis();
    const bruto = lerFiltros(url.searchParams);
    if (!url.searchParams.get('porPagina')) bruto.porPagina = POR_PAGINA_LISTA;
    const pedido = resolverLocal(bruto, acervo.itens);
    if (pedido.localResolvido) pedido.qOriginal = url.searchParams.get('q');
    const r = buscar(acervo.itens, pedido);
    const fac = facetas(acervo.itens, pedido.filtros);
    const rot = {
      cidade: Object.fromEntries(fac.cidades.map((c) => [c.chave, c.valor])),
      planta: Object.fromEntries(fac.plantas.map((p) => [p.chave, p.valor]))
    };
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=3600');
    return res.status(200).send(paginaLista({ acervo, pedido, r, fac, rot, aluguelOpcoes: opcoesDeAluguel(r.limites) }));
  } catch (err) {
    console.error('[aluguel-lista]', err);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).send(documento({
      titulo: 'Apartamentos para alugar em Aichi | EASY HOUSE',
      descricao: 'Não foi possível carregar os imóveis agora. Tente de novo em instantes.',
      canonical: `${SITE}${CAMINHO}`, robots: 'noindex', caminhoAtual: CAMINHO,
      corpo: `<main id="main"><div class="indisponivel"><h1>Não conseguimos carregar os apartamentos agora</h1>
        <p>Foi uma falha nossa, não sua. Tente de novo em alguns instantes.</p>
        <p class="btn-row" style="justify-content:center"><a class="btn btn--gold" href="${CAMINHO}">Tentar de novo</a>
        <a class="btn btn--wa" href="https://wa.me/${WHATSAPP}?text=${encodeURIComponent('Olá! Quero ajuda para encontrar um apartamento para alugar em Aichi.')}">Falar no WhatsApp</a></p></div></main>`
    }));
  }
}
