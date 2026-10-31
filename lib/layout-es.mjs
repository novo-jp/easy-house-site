/**
 * lib/layout-es.mjs — menu, gaveta e rodapé das páginas em espanhol.
 *
 * Derivados de `casas-layout.json` (o layout em português), trocando só os
 * textos e os destinos: o logo, as classes e a estrutura continuam os mesmos,
 * e o CSS do portal serve sem mudança. Cada troca é conferida — se o layout
 * em português mudar e uma frase deixar de existir, o módulo falha ao
 * carregar em vez de publicar um menu meio em português.
 *
 * Destinos: só páginas que existem em espanhol (casas en venta, nuevas,
 * usadas, simulador). Para o que só existe em português, o link diz isso
 * ("Português") em vez de mandar a pessoa para uma página que ela não lê
 * sem aviso.
 */
import { readFileSync } from 'node:fs';

const L = JSON.parse(readFileSync(new URL('./casas-layout.json', import.meta.url), 'utf8'));

export const CAMINHOS_ES = {
  hub: '/es/casas-en-venta',
  nuevas: '/es/casas-nuevas',
  usadas: '/es/casas-usadas',
  simulador: '/simular-es',
};

const WA_ES = 'https://wa.me/818028867708?text=' + encodeURIComponent('¡Hola! Quiero hablar con Easy House.');

function trocar(html, pares, onde) {
  let out = html;
  for (const [de, para] of pares) {
    if (de instanceof RegExp) {
      if (!de.test(out)) throw new Error(`layout-es: padrão ${de} não encontrado em ${onde}`);
      out = out.replace(de, para);
    } else {
      if (!out.includes(de)) throw new Error(`layout-es: "${de.slice(0, 60)}" não encontrado em ${onde}`);
      out = out.split(de).join(para);
    }
  }
  return out;
}

export const navEs = trocar(L.nav, [
  // O logo leva ao início em espanhol: "/" redireciona para uma página em português.
  ['<a href="/" class="nav__brand"', `<a href="${CAMINHOS_ES.hub}" class="nav__brand"`],
  ['aria-label="Menu principal"', 'aria-label="Menú principal"'],
  ['— página inicial"', '— página de inicio"'],
  [/<div class="nav__links">[\s\S]*?<\/div>/, `<div class="nav__links">
    <a href="${CAMINHOS_ES.hub}">Casas en venta</a>
    <a href="${CAMINHOS_ES.nuevas}">Casas nuevas</a>
    <a href="${CAMINHOS_ES.usadas}">Casas usadas</a>
    <a href="${CAMINHOS_ES.simulador}">Simulador</a>
    <a href="/casas-a-venda" lang="pt-BR" hreflang="pt-BR">Português</a>
  </div>`],
  [/href="https:\/\/wa\.me\/818028867708\?text=[^"]*"/, `href="${WA_ES}"`],
  ['Falar no WhatsApp', 'Hablar por WhatsApp'],
  ['aria-label="Abrir menu"', 'aria-label="Abrir menú"'],
], 'nav');

const SETA = '<span class="arrow" aria-hidden="true">→</span>';
export const drawerEs = trocar(L.drawer, [
  [/<div class="nav__drawer" id="navDrawer">[\s\S]*?(?=\s*<a class="drawer-cta")/, `<div class="nav__drawer" id="navDrawer">
  <a href="${CAMINHOS_ES.hub}">Casas en venta en Aichi y Mie ${SETA}</a>
  <a href="${CAMINHOS_ES.nuevas}">Casas nuevas ${SETA}</a>
  <a href="${CAMINHOS_ES.usadas}">Casas usadas ${SETA}</a>
  <a href="${CAMINHOS_ES.simulador}">Simular mi cuota ${SETA}</a>
  <a href="/casas-a-venda" lang="pt-BR" hreflang="pt-BR">Ver en portugués ${SETA}</a>`],
  [/href="https:\/\/wa\.me\/818028867708\?text=[^"]*"/, `href="${WA_ES}"`],
  ['Falar no WhatsApp', 'Hablar por WhatsApp'],
], 'drawer');

export const footEs = trocar(L.foot, [
  [/<p class="foot__desc">[\s\S]*?<\/p>/, '<p class="foot__desc">Inmobiliaria en Japón para quien quiere comprar su casa en Aichi o Mie. Atención en español, portugués, inglés y japonés.</p>'],
  ['<p class="foot__col-title">Serviços</p>', '<p class="foot__col-title">Servicios</p>'],
  [/(<p class="foot__col-title">Servicios<\/p>\s*<div class="foot__links">)[\s\S]*?(<\/div>)/, `$1
        <a href="${CAMINHOS_ES.hub}">Casas en venta</a>
        <a href="${CAMINHOS_ES.nuevas}">Casas nuevas</a>
        <a href="${CAMINHOS_ES.usadas}">Casas usadas</a>
        <a href="${CAMINHOS_ES.simulador}">Simular mi cuota</a>
      $2`],
  ['<p class="foot__col-title">Contato</p>', '<p class="foot__col-title">Contacto</p>'],
  ['<p class="foot__col-title">Institucional</p>', '<p class="foot__col-title">Institucional</p>'],
  ['<a href="/sobre">Sobre a Easy House</a>', '<a href="/sobre" lang="pt-BR">Sobre Easy House (en portugués)</a>'],
  ['<a href="/terms">Termos de uso</a>', '<a href="/terms">Términos de uso</a>'],
  ['<a href="/privacy">Privacidade</a>', '<a href="/privacy">Privacidad</a>'],
  ['© EASY HOUSE · Atendimento em português no Japão', '© EASY HOUSE · Atención en español en Japón'],
], 'foot');
