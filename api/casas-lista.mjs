/**
 * GET /comprar/imoveis — a busca de casas à venda, renderizada no servidor.
 *
 * Antes era um HTML estático com a grade vazia: sem JavaScript não havia um
 * único imóvel na página, e o Google recebia uma casca. Agora o HTML já chega
 * com a primeira página de resultados, os filtros como um <form method="get">
 * que funciona sozinho, os chips ativos como links e a paginação como links.
 * O casas-busca.js entra por cima só para deixar tudo mais rápido: mesma URL,
 * mesma lista (a lógica é a de lib/casas-busca.mjs, a mesma da API).
 *
 * Metadados vêm do acervo real: se a base só tem Aichi e Mie, o título diz
 * Aichi e Mie — nunca promete província sem imóvel.
 */

import { createRequire } from 'node:module';
import { carregarCasas, casasConfig, financingConfig } from '../lib/casas-fonte.mjs';
import { lerFiltros, resolverLocal, buscar, facetas, diagnosticoVazio, filtrosAtivos,
         filtrosParaParams, ORDENS, ORDEM_PADRAO, chave } from '../lib/casas-busca.mjs';
import { documento, esc, SITE, ICONE_WA } from '../lib/casas-html.mjs';

const require = createRequire(import.meta.url);
const Cartao = require('../lib/casas-cartao.js');

const CAMINHO = '/comprar/imoveis';
export const POR_PAGINA_LISTA = 18;

/* ── Rótulos dos filtros (a mesma tabela que o JS usa: vai no data-rotulos) ── */

const yenPt = (v) => '¥' + Number(v).toLocaleString('pt-BR');
const man = (v) => (Number(v) / 10000).toLocaleString('pt-BR') + ' 万円';

export const ROTULOS = {
  q: (v) => `Busca: “${v}”`,
  prefeituras: (v, r) => `Província: ${r.prefeitura?.[v] || v}`,
  cidades: (v, r) => `Cidade: ${r.cidade?.[v] || v}`,
  plantas: (v) => `Planta: ${String(v).toUpperCase()}`,
  precoMin: (v) => `Preço: a partir de ${yenPt(v)}`,
  precoMax: (v) => `Preço: até ${yenPt(v)}`,
  mensalMax: (v) => `Parcela estimada: até ${yenPt(v)}/mês`,
  areaMin: (v) => `Área construída: a partir de ${v} m²`,
  terrenoMin: (v) => `Terreno: a partir de ${v} m²`,
  anoMin: (v) => `Construída a partir de ${v}`,
  estacaoMax: (v) => `Estação: até ${v} min a pé`,
  estado: (v) => (v === 'novo' ? 'Casa nova' : 'Casa usada'),
  entrega: (v) => ({ imediata: 'Entrega imediata', prevista: 'Entrega prevista', combinar: 'Entrega a combinar' }[v] || v),
  estacionamento: () => 'Com estacionamento',
  fotos: () => 'Só com fotos do imóvel',
  codigos: (v) => `Código ${v}`
};

/** URL da busca com UM valor removido de um filtro (para o "×" do chip funcionar sem JS). */
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

function opcaoCheck({ nome, valor, rotulo, total, marcado, desabilitado, motivo, lang, tipo = 'checkbox' }) {
  const id = `f-${nome}-${String(valor).replace(/[^a-z0-9]+/gi, '-') || 'qualquer'}`;
  return `<label class="opcao${marcado ? ' ativa' : ''}${desabilitado ? ' zero' : ''}" for="${id}">
    <input type="${tipo}" id="${id}" name="${esc(nome)}" value="${esc(valor)}"${marcado ? ' checked' : ''}${desabilitado && !marcado ? ' disabled' : ''}/>
    <span class="opcao__txt"${lang ? ` lang="${lang}"` : ''}>${esc(rotulo)}</span>
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
      const texto = ROTULOS[k](v, rot);
      chips.push(`<a class="tag-ativa" href="${esc(urlSem(f, ordem, k, v))}" data-remover="${esc(k)}" data-valor="${esc(v)}" rel="nofollow">
        ${esc(texto)} <span class="tag-ativa__x" aria-hidden="true">×</span><span class="sr-only"> — remover este filtro</span></a>`);
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

function estadoVazio(f, ordem, diag, rot, total) {
  const nomes = {
    q: 'a busca por texto', prefeituras: 'a província', cidades: 'as cidades', plantas: 'a planta',
    precoMin: 'o preço mínimo', precoMax: 'o preço máximo', mensalMax: 'a parcela máxima',
    areaMin: 'a área mínima', terrenoMin: 'o terreno mínimo', anoMin: 'o ano mínimo',
    estacaoMax: 'a distância da estação', estado: 'novo/usado', entrega: 'a entrega',
    estacionamento: 'o estacionamento', fotos: 'só com fotos'
  };
  const acoes = diag.sugestoes.slice(0, 3).map((s) => {
    const vazio = Array.isArray(f[s.filtro]) ? [] : null;
    return `<a class="btn btn--ghost" href="${esc(urlCom(f, ordem, { [s.filtro]: vazio }))}" data-sugestao="${esc(s.filtro)}" rel="nofollow">Remover ${esc(nomes[s.filtro] || s.filtro)} <span class="conta">+${s.voltariam}</span></a>`;
  }).join('');
  const descricao = filtrosAtivos(f).filter((k) => k !== 'codigos').flatMap((k) => (Array.isArray(f[k]) ? f[k] : [f[k]]).map((v) => ROTULOS[k](v, rot))).join(' · ');
  const msg = 'Olá! Procuro uma casa no Japão' + (descricao ? ' (' + descricao + ')' : '') + ' e não encontrei no site da Easy House. Podem me ajudar a achar algo assim?';
  return `<div class="aviso-vazio" id="avisoVazio" role="status">
    <h2>Nenhuma casa com todos esses filtros</h2>
    ${descricao ? `<p class="aviso-vazio__filtros">Você pediu: <strong>${esc(descricao)}</strong>.</p>` : ''}
    ${diag.sugestoes.length ? `<p>O que mais está limitando a busca é <strong>${esc(nomes[diag.sugestoes[0].filtro] || diag.sugestoes[0].filtro)}</strong>: sem esse filtro voltariam ${diag.sugestoes[0].voltariam} imóveis. Você escolhe o que afrouxar — nada muda sozinho.</p>` : ''}
    <div class="aviso-vazio__acoes">${acoes}
      <a class="btn btn--ghost" href="${CAMINHO}" rel="nofollow">Limpar todos os filtros</a></div>
    <p class="aviso-vazio__ajuda">Prefere que a gente procure? Há imóveis que ainda não estão no site.
      <a href="https://wa.me/${casasConfig.whatsapp.numero}?text=${encodeURIComponent(msg)}" data-cta="busca_vazia" rel="nofollow">Pedir ajuda pelo WhatsApp</a> — abre o WhatsApp com a sua busca já descrita.</p>
  </div>`;
}

/* ── Página ──────────────────────────────────────────────────── */

export function paginaLista({ todas, pedido, r, fac, rot, precoOpcoes, agora }) {
  const f = pedido.filtros;
  const ordem = pedido.ordem;
  const provincias = fac.prefeituras.filter((p) => p.total || true).map((p) => p.valor);
  const provTexto = provincias.length > 1 ? provincias.slice(0, -1).join(', ') + ' e ' + provincias.at(-1) : (provincias[0] || 'Japão');
  const temFiltro = filtrosAtivos(f).length > 0 || pedido.pagina > 1 || ordem !== ORDEM_PADRAO;

  const titulo = `Casas à venda em ${provTexto} | ${r.totalAcervo} imóveis em português | EASY HOUSE`;
  const descricao = `Busque entre ${r.totalAcervo} casas à venda em ${provTexto} por cidade, preço e planta. Fotos, terreno, área construída e uma estimativa mensal, em português, pela Easy House.`;

  // cidades agrupadas por província, com contagem para os filtros atuais
  const porProv = new Map();
  for (const c of fac.cidades) {
    const p = c.prefeitura || 'Outras';
    if (!porProv.has(p)) porProv.set(p, []);
    porProv.get(p).push(c);
  }
  const grupoCidades = [...porProv.entries()].map(([prov, cids]) => `
    <fieldset class="painel__sub" data-provincia="${esc(chave(prov))}">
      <legend>${esc(prov)} <span class="conta">${cids.reduce((a, b) => a + b.total, 0)}</span></legend>
      <div class="painel__opcoes">${cids.map((c) => opcaoCheck({
        nome: 'cidade', valor: c.chave, rotulo: c.valor, total: c.total,
        marcado: f.cidades.includes(c.chave), desabilitado: c.total === 0,
        motivo: f.prefeituras.length && !f.prefeituras.includes(chave(prov)) ? `${c.valor} fica em ${prov}, fora da província escolhida` : undefined
      })).join('')}</div>
    </fieldset>`).join('');

  const cards = r.itens.map((c, i) => Cartao.cartao(c, { prioridade: i === 0, titulo: 'h2' })).join('');

  const est = casasConfig.estimativa;
  const produto = financingConfig?.[est?.produto ?? 'flat35'];
  const premissas = produto ? `${produto.rateDisplayLabel || ''} · ${est.prazoAnos} anos · entrada ${Math.round((est.entradaPercentual || 0) * 100)}%`.replace(/^ · /, '') : null;

  const corpo = `
<main id="main" class="busca">
  <header class="busca-topo">
    <h1>Encontre sua casa no Japão, <em>sem se perder no japonês</em></h1>
    <p class="busca-topo__sub">Pesquise por cidade, preço e tamanho. A Easy House explica os detalhes em português.</p>

    <form class="busca-rapida" method="get" action="${CAMINHO}" id="formBusca" role="search" aria-label="Busca rápida de casas">
      <div class="campo campo--local">
        <label for="campoBusca">Cidade, estação ou código</label>
        <input type="search" id="campoBusca" name="q" list="listaLocais" value="${esc(f.q || '')}" autocomplete="off" enterkeyhint="search" placeholder="Ex.: Toyota, Okazaki, Kariya"/>
        <datalist id="listaLocais">
          ${fac.prefeituras.map((p) => `<option value="${esc(p.valor)}">${esc(p.valor)} (província)</option>`).join('')}
          ${fac.cidades.map((c) => `<option value="${esc(c.valor)}">${esc(c.valor)}${c.prefeitura ? ' — ' + esc(c.prefeitura) : ''}</option>`).join('')}
        </datalist>
      </div>
      <div class="campo">
        <label for="precoMaxRapido">Preço máximo</label>
        <select id="precoMaxRapido" name="precoMax">
          <option value="">Qualquer</option>
          ${precoOpcoes.map((v) => `<option value="${v}"${f.precoMax === v ? ' selected' : ''} title="${man(v)}">${yenPt(v)}</option>`).join('')}
        </select>
      </div>
      <div class="campo">
        <label for="plantaRapida">Planta</label>
        <select id="plantaRapida" name="planta">
          <option value="">Qualquer</option>
          ${fac.plantas.filter((p) => p.total > 0 || f.plantas.includes(p.chave)).map((p) => `<option value="${esc(p.chave)}"${f.plantas.length === 1 && f.plantas[0] === p.chave ? ' selected' : ''} lang="ja">${esc(p.valor)}</option>`).join('')}
        </select>
      </div>
      ${f.cidades.length ? f.cidades.map((c) => `<input type="hidden" name="cidade" value="${esc(c)}"/>`).join('') : ''}
      ${f.prefeituras.length ? f.prefeituras.map((c) => `<input type="hidden" name="prefeitura" value="${esc(c)}"/>`).join('') : ''}
      <button class="btn btn--gold busca-rapida__btn" type="submit">Buscar casas</button>
      <button class="chip-f busca-rapida__mais" type="button" id="abrirFiltros" aria-haspopup="dialog" aria-expanded="false" aria-controls="painelFiltros">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4"/></svg>
        Mais filtros <span class="conta" id="contaFiltros">${filtrosAtivos(f).filter((k) => k !== 'codigos').length || ''}</span>
      </button>
    </form>
  </header>

  <div class="barra" id="barra">
    <div class="barra__inner">
      <p class="barra__contagem" id="contagem" role="status" aria-live="polite"><strong>${r.total}</strong> ${r.total === 1 ? 'imóvel' : 'imóveis'}${r.total !== r.totalAcervo ? ` <span class="barra__de">de ${r.totalAcervo}</span>` : ''}</p>
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
    ${pedido.localResolvido ? `<p class="aviso-param" role="status">Entendemos “${esc(pedido.qOriginal || '')}” como um lugar e trocamos o filtro de cidade.</p>` : ''}
  </div>

  <div class="casa-grid" id="resultados" data-pagina="${r.pagina}" data-total-paginas="${r.totalPaginas}">${cards}</div>
  ${r.total === 0 ? estadoVazio(f, ordem, diagnosticoVazio(todas, f), rot, r.total) : ''}
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
        <fieldset class="painel__sub">
          <legend>Província</legend>
          <div class="painel__opcoes">${fac.prefeituras.map((p) => opcaoCheck({ nome: 'prefeitura', valor: p.chave, rotulo: p.valor, total: p.total, marcado: f.prefeituras.includes(p.chave), desabilitado: p.total === 0 })).join('')}</div>
        </fieldset>
        <div class="campo campo--filtro-cidade">
          <label for="filtroCidade">Procurar cidade na lista</label>
          <input type="search" id="filtroCidade" placeholder="Digite para filtrar a lista" autocomplete="off"/>
        </div>
        ${grupoCidades}
        <p class="painel__nota">Cidades sem imóveis para os filtros atuais aparecem apagadas e dizem o motivo.</p>
      </details>

      <details class="painel__grupo" open>
        <summary><h3>Preço</h3><span class="painel__resumo" data-resumo="preco"></span></summary>
        <div class="faixa">
          <div class="campo"><label for="precoMin">Mínimo (¥)</label><input type="number" id="precoMin" name="precoMin" value="${f.precoMin ?? ''}" inputmode="numeric" min="0" step="500000" placeholder="0"/></div>
          <div class="campo"><label for="precoMax">Máximo (¥)</label><input type="number" id="precoMax" name="precoMax" value="${f.precoMax ?? ''}" inputmode="numeric" min="0" step="500000" placeholder="${precoOpcoes.at(-1)}"/></div>
        </div>
        <p class="faixa__leitura" id="leituraPreco" aria-live="polite"></p>
        ${premissas ? `
        <fieldset class="painel__sub painel__sub--parcela">
          <legend>Ou por parcela estimada</legend>
          <div class="painel__opcoes">${opcaoCheck({ nome: 'mensalMax', valor: '', rotulo: 'Qualquer', marcado: !f.mensalMax, tipo: 'radio' })}${[50000, 70000, 100000, 130000].map((v) => opcaoCheck({ nome: 'mensalMax', valor: v, rotulo: `até ${yenPt(v)}/mês`, marcado: f.mensalMax === v, tipo: 'radio' })).join('')}</div>
          <p class="painel__nota">Estimativa educativa com ${esc(premissas)}, sobre o preço cheio. Não é oferta nem aprovação: as condições dependem da análise de cada instituição. <a href="/simular">Ajustar premissas no simulador</a>.</p>
        </fieldset>` : ''}
      </details>

      <details class="painel__grupo" ${f.plantas.length ? 'open' : ''}>
        <summary><h3>Planta e tamanho</h3><span class="painel__resumo" data-resumo="tamanho"></span></summary>
        <fieldset class="painel__sub">
          <legend>Planta <span class="jp" lang="ja">間取り</span></legend>
          <div class="painel__opcoes">${fac.plantas.map((p) => opcaoCheck({ nome: 'planta', valor: p.chave, rotulo: p.valor, total: p.total, marcado: f.plantas.includes(p.chave), desabilitado: p.total === 0, lang: 'ja' })).join('')}</div>
          <p class="painel__nota">L = sala, D = jantar, K = cozinha, S = quarto extra sem janela. O número é a quantidade de quartos.</p>
        </fieldset>
        <div class="faixa">
          <div class="campo"><label for="areaMin">Área construída mín. (m²)</label><input type="number" id="areaMin" name="areaMin" value="${f.areaMin ?? ''}" inputmode="numeric" min="0"/></div>
          <div class="campo"><label for="terrenoMin">Terreno mín. (m²)</label><input type="number" id="terrenoMin" name="terrenoMin" value="${f.terrenoMin ?? ''}" inputmode="numeric" min="0"/></div>
        </div>
      </details>

      <details class="painel__grupo" ${f.estado || f.entrega.length || f.anoMin ? 'open' : ''}>
        <summary><h3>Imóvel</h3><span class="painel__resumo" data-resumo="imovel"></span></summary>
        <fieldset class="painel__sub">
          <legend>Estado</legend>
          <div class="painel__opcoes">
            ${opcaoCheck({ nome: 'estado', valor: '', rotulo: 'Novas e usadas', marcado: !f.estado, tipo: 'radio' })}
            ${opcaoCheck({ nome: 'estado', valor: 'novo', rotulo: 'Só casas novas', total: fac.estado.novo, marcado: f.estado === 'novo', desabilitado: !fac.estado.novo, tipo: 'radio' })}
            ${opcaoCheck({ nome: 'estado', valor: 'usado', rotulo: 'Só casas usadas', total: fac.estado.usado, marcado: f.estado === 'usado', desabilitado: !fac.estado.usado, tipo: 'radio' })}
          </div>
        </fieldset>
        <fieldset class="painel__sub">
          <legend>Entrega <span class="jp" lang="ja">引渡し</span></legend>
          <div class="painel__opcoes">
            ${opcaoCheck({ nome: 'entrega', valor: 'imediata', rotulo: 'Imediata', total: fac.entrega.imediata, marcado: f.entrega.includes('imediata'), desabilitado: !fac.entrega.imediata })}
            ${opcaoCheck({ nome: 'entrega', valor: 'prevista', rotulo: 'Prevista (obra)', total: fac.entrega.prevista, marcado: f.entrega.includes('prevista'), desabilitado: !fac.entrega.prevista })}
            ${opcaoCheck({ nome: 'entrega', valor: 'combinar', rotulo: 'A combinar', total: fac.entrega.combinar, marcado: f.entrega.includes('combinar'), desabilitado: !fac.entrega.combinar })}
          </div>
        </fieldset>
        <div class="campo"><label for="anoMin">Construída a partir de (ano)</label><input type="number" id="anoMin" name="anoMin" value="${f.anoMin ?? ''}" inputmode="numeric" min="1950" max="2030"/></div>
      </details>

      <details class="painel__grupo" ${f.estacionamento || f.estacaoMax ? 'open' : ''}>
        <summary><h3>Rotina</h3><span class="painel__resumo" data-resumo="rotina"></span></summary>
        <fieldset class="painel__sub">
          <legend>Estacionamento <span class="jp" lang="ja">駐車場</span></legend>
          <div class="painel__opcoes">${opcaoCheck({ nome: 'estacionamento', valor: 'com', rotulo: 'Com estacionamento', total: fac.estacionamento.com, marcado: f.estacionamento === 'com' })}</div>
          <p class="painel__nota">${fac.semDado.estacionamento} dos resultados atuais não informam estacionamento e continuam aparecendo. O número de vagas quase nunca vem no anúncio, por isso não é filtro.</p>
        </fieldset>
        <fieldset class="painel__sub">
          <legend>Estação a pé <span class="jp" lang="ja">徒歩</span></legend>
          <div class="painel__opcoes">${opcaoCheck({ nome: 'estacaoMax', valor: '', rotulo: 'Qualquer', marcado: !f.estacaoMax, tipo: 'radio' })}${[10, 15, 20, 30].map((v) => opcaoCheck({ nome: 'estacaoMax', valor: v, rotulo: `até ${v} min`, marcado: f.estacaoMax === v, tipo: 'radio' })).join('')}</div>
          <p class="painel__nota">${fac.semDado.estacao} dos resultados atuais não informam a caminhada e continuam aparecendo.</p>
        </fieldset>
      </details>

      <details class="painel__grupo" ${f.fotos ? 'open' : ''}>
        <summary><h3>Transparência</h3><span class="painel__resumo" data-resumo="transp"></span></summary>
        <div class="painel__opcoes">${opcaoCheck({ nome: 'fotos', valor: 'reais', rotulo: 'Só com fotos do imóvel', total: fac.fotos.reais, marcado: f.fotos === 'reais' })}</div>
        <p class="painel__nota">${r.totalAcervo - fac.fotos.reais} anúncios não liberam as fotos para publicação; neles a imagem é a ficha da Easy House e as fotos vão por WhatsApp. Todos os anúncios têm a data em que foram verificados na origem.</p>
      </details>

      <div class="painel__rodape">
        <a class="btn btn--ghost" href="${CAMINHO}" id="limparFiltros">Limpar</a>
        <button class="btn btn--gold" type="submit" id="verResultados">Mostrar <span id="verResultadosN">${r.total}</span> imóveis</button>
      </div>
    </form>
  </div>

  <section class="section section--narrow busca-editorial" aria-labelledby="ajuda-t">
    <h2 class="h-section" id="ajuda-t">Como usar esta busca</h2>
    <p class="lead">Os anúncios vêm do sistema que as imobiliárias japonesas usam entre si e são verificados toda semana. Quando você achar uma casa, mande pelo WhatsApp: a gente confirma a disponibilidade, explica os custos e o que seria possível no seu caso — em português.</p>
    <p class="btn-row">
      <a class="btn btn--wa" rel="nofollow" data-cta="rodape_busca" href="https://wa.me/${casasConfig.whatsapp.numero}?text=${encodeURIComponent('Olá! Quero ajuda para encontrar uma casa no Japão.')}">${ICONE_WA} Falar com a Easy House</a>
      <a class="btn btn--ghost" href="/simular">Simular minha faixa de compra</a>
      <a class="btn btn--ghost" href="/favoritos">Meus favoritos <span data-contador-favoritos hidden></span></a>
    </p>
    <p class="busca-editorial__link"><a href="/quanto-custa-casa-japao">Quanto custa comprar uma casa no Japão →</a></p>
  </section>
</main>

<div class="comparar-bandeja" id="bandejaComparar" role="region" aria-label="Imóveis marcados para comparar" hidden>
  <p><strong id="bandejaN">0</strong> para comparar <span class="bandeja__dica">(até 3)</span></p>
  <a class="btn btn--gold btn--sm" id="bandejaIr" href="/comparar">Comparar</a>
  <button class="btn btn--ghost btn--sm" type="button" id="bandejaLimpar">Limpar</button>
</div>`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `Casas à venda em ${provTexto}`,
    description: descricao,
    url: `${SITE}${CAMINHO}`,
    isPartOf: { '@type': 'WebSite', name: 'EASY HOUSE', url: `${SITE}/` },
    mainEntity: { '@type': 'ItemList', numberOfItems: r.total,
      itemListElement: r.itens.slice(0, 10).map((c, i) => ({ '@type': 'ListItem', position: i + 1, url: `${SITE}/comprar/imoveis/${c.slug}`, name: c.titulo })) }
  };

  return documento({
    titulo, descricao,
    canonical: `${SITE}${CAMINHO}`,
    imagem: `${SITE}/images/opt/consultoria-1024.jpg`,
    // Combinações de filtro não entram no índice; a página base, sim.
    robots: temFiltro ? 'noindex, follow' : null,
    jsonLd, corpo,
    caminhoAtual: CAMINHO,
    classeBody: 'pagina-busca',
    scripts: ['/casas-busca.js?v=11'],
    preconnect: ['https://igtqdhesorahhdyvsjrl.supabase.co'],
    head: `<script id="dadosBusca" type="application/json">${JSON.stringify({
      total: r.total, totalAcervo: r.totalAcervo, pagina: r.pagina, totalPaginas: r.totalPaginas, ordem,
      filtros: f, rotulos: rot, precoOpcoes
    }).replace(/</g, '\\u003c')}</script>`
  });
}

/** Opções do select "preço máximo": passos de 500万円 que existem no acervo. */
function opcoesDePreco(limites) {
  const min = limites.precoMin ?? 10_000_000, max = limites.precoMax ?? 50_000_000;
  const passo = 5_000_000;
  const out = [];
  for (let v = Math.ceil(min / passo) * passo; v <= Math.ceil(max / passo) * passo; v += passo) out.push(v);
  return out;
}

export default async function handler(req, res) {
  const url = new URL(req.url, `https://${req.headers.host || 'easyhouse.homes'}`);
  try {
    const todas = await carregarCasas();
    const bruto = lerFiltros(url.searchParams);
    if (!url.searchParams.get('porPagina')) bruto.porPagina = POR_PAGINA_LISTA;   // 18: menos página longa no celular
    const pedido = resolverLocal(bruto, todas);
    if (pedido.localResolvido) pedido.qOriginal = url.searchParams.get('q');
    const r = buscar(todas, pedido);
    const fac = facetas(todas, pedido.filtros);
    const rot = {
      prefeitura: Object.fromEntries(fac.prefeituras.map((p) => [p.chave, p.valor])),
      cidade: Object.fromEntries(fac.cidades.map((c) => [c.chave, c.valor])),
      planta: Object.fromEntries(fac.plantas.map((p) => [p.chave, p.valor]))
    };
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=3600');
    return res.status(200).send(paginaLista({ todas, pedido, r, fac, rot, precoOpcoes: opcoesDePreco(r.limites), agora: new Date() }));
  } catch (err) {
    console.error('[casas-lista]', err);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).send(documento({
      titulo: 'Casas à venda no Japão | EASY HOUSE',
      descricao: 'Não foi possível carregar os imóveis agora. Tente de novo em instantes.',
      canonical: `${SITE}${CAMINHO}`, robots: 'noindex', caminhoAtual: CAMINHO,
      corpo: `<main id="main"><div class="indisponivel"><h1>Não conseguimos carregar os imóveis agora</h1>
        <p>Foi uma falha nossa, não sua. Tente de novo em alguns instantes.</p>
        <p class="btn-row" style="justify-content:center"><a class="btn btn--gold" href="${CAMINHO}">Tentar de novo</a></p></div></main>`
    }));
  }
}
