/**
 * lib/casas-cidade.mjs — as páginas regionais de casas à venda, em
 * português e espanhol.
 *
 *   hub        /casas-a-venda                 /es/casas-en-venta
 *   província  /casas-a-venda/aichi           /es/casas-en-venta/aichi
 *   cidade     /casas-a-venda/nishio          /es/casas-en-venta/nishio
 *   novas      /casas-novas                   /es/casas-nuevas
 *   usadas     /casas-usadas                  /es/casas-usadas
 *
 * Origem: a página de cidade nasceu em 31/10/2026 (a lista filtrada é
 * `noindex`, então nenhuma página mirava "casa à venda em Nishio"). No mesmo
 * dia o briefing de SEO Tokai (docs/seo/) pediu a arquitetura completa —
 * província → cidade, casas novas/usadas, e as mesmas páginas em espanhol
 * para o público latino. As URLs do briefing (`/pt/casas-a-venda/aichi/
 * nishio/`) foram mapeadas para as que já existiam, sem prefixo `/pt/` e sem
 * a província no caminho: mudar URL indexada não traz ganho e custa
 * redirecionamento. O mapeamento está em docs/seo/seo_manifest_resolvido.json.
 *
 * O que impede estas páginas de serem doorway pages (a regra de "conteúdo
 * em escala" do Google): o texto que muda de uma página para a outra são os
 * NÚMEROS do acervo daquele lugar — quantas casas, preço, plantas, estações,
 * as casas em si. Duas cidades compartilham ~43% do texto (menu, rodapé,
 * avisos legais); as antigas /simular/<cidade> compartilhavam 99,8%.
 *
 * Gate de publicação (o mesmo do briefing): cidade ou província entra no
 * sitemap só com MINIMO_PARA_SITEMAP casas ou mais. Abaixo disso a página
 * existe (o link da busca não morre) mas sai com `noindex`. Sem nenhuma
 * casa, 404. Gifu hoje cai aqui: o scraper do ATBB não varre a província.
 *
 * Quem serve: `api/casas-lista.mjs`, por rewrite. O plano da Vercel limita o
 * projeto a 12 funções e ele está em 11; estas páginas precisam exatamente do
 * acervo que aquela função já guarda em memória.
 */

import { createRequire } from 'node:module';
import { documento, esc as e, SITE, ICONE_WA } from './casas-html.mjs';
import { chave } from './casas-busca.mjs';
import { navEs, drawerEs, footEs } from './layout-es.mjs';

const require = createRequire(import.meta.url);
const Cartao = require('./casas-cartao.js');

const WHATSAPP = '818028867708';
const LISTA = '/comprar/imoveis';
const FICHA = '/comprar/imoveis';

export const CAMINHOS = {
  pt: { hub: '/casas-a-venda', novas: '/casas-novas', usadas: '/casas-usadas', simulador: '/simular' },
  es: { hub: '/es/casas-en-venta', novas: '/es/casas-nuevas', usadas: '/es/casas-usadas', simulador: '/simular-es' },
};
/** Compatibilidade: a busca e o sitemap importam este nome desde a primeira versão. */
export const CAMINHO_BASE = CAMINHOS.pt.hub;

/** Quantas casas um lugar precisa ter para ser anunciado ao Google. */
export const MINIMO_PARA_SITEMAP = 5;

/** Quantos cards a página mostra antes de mandar para a busca completa. */
const CARDS = 12;

/**
 * As três províncias do escopo (briefing Tokai, 31/10/2026). Fora delas não
 * se cria página local, mesmo que o acervo tenha casa.
 */
export const PROVINCIAS = {
  aichi: { nome: 'Aichi', jp: '愛知県' },
  mie: { nome: 'Mie', jp: '三重県' },
  gifu: { nome: 'Gifu', jp: '岐阜県' },
};

/**
 * Residentes de nacionalidade brasileira, dezembro de 2025.
 * Fonte: 在留外国人統計 (Agência de Imigração / Ministério da Justiça),
 * publicado no e-Stat em 10/07/2026. Conferidos um a um em 31/10/2026 na
 * compilação municipal citada pelo briefing. Não é volume de busca nem
 * estimativa de clientes — é a comunidade que mora na cidade.
 * Nagoya fica de fora de propósito: o total da cidade não foi verificado.
 */
export const BRASILEIROS = {
  '愛知県': 60406, '三重県': 13883, '岐阜県': 12349,
  '豊橋市': 9021, '豊田市': 7273, '岡崎市': 4675, '西尾市': 4107, '碧南市': 2923, '知立市': 2564,
  '安城市': 2005, '豊川市': 3181, '小牧市': 3007, '高浜市': 1585, '半田市': 1866, '刈谷市': 811,
  '大府市': 370, '蒲郡市': 491, '春日井市': 468, '一宮市': 449,
  '鈴鹿市': 3229, '四日市市': 2668, '津市': 2393, '桑名市': 1038, '亀山市': 759,
};
const FONTE_BRASILEIROS = {
  url: 'https://www.e-stat.go.jp/stat-search/files?page=1&layout=datalist&toukei=00250012&tstat=000001018034&cycle=1&year=20250&month=24101212&tclass1=000001060399',
  pt: 'Estatística de residentes estrangeiros (在留外国人統計), dezembro de 2025, publicada no e-Stat em 10/07/2026',
};

/* ═════════════════════════════════════════════════════════════════════════
   Textos
   ═════════════════════════════════════════════════════════════════════════ */

const T = {
  pt: {
    lang: 'pt-BR', moeda: 'pt-BR', skip: 'Ir para o conteúdo',
    inicio: 'Início', casasAVenda: 'Casas à venda',
    casa: (n) => (n === 1 ? 'casa' : 'casas'),
    casaAVenda: (n) => (n === 1 ? 'casa à venda' : 'casas à venda'),
    imovel: (n) => (n === 1 ? 'imóvel' : 'imóveis'),
    aPartirDe: 'a partir de',
    deAte: (a, b) => `de ${a} a ${b}`,
    mediana: 'mediana',
    oQueExiste: (lugar) => `O que existe em ${lugar} hoje`,
    tCasasAVenda: 'Casas à venda', tFaixa: 'Faixa de preço', tMediana: 'Preço mediano',
    tParcela: 'Parcela estimada da mais barata', tArea: 'Área construída (mediana)', tTerreno: 'Terreno (mediana)',
    tVaga: 'Com estacionamento', tNovas: 'Novas (新築)', tUsadas: 'Usadas (中古)',
    tCidades: 'Cidades com casas',
    deTotal: (a, b) => `${a} de ${b}`,
    porMes: '/mês',
    notaNumeros: 'Números do acervo de hoje, recontados a cada atualização. A parcela é estimativa educativa — não é oferta nem aprovação de crédito.',
    verificado: (d) => `Dados verificados na fonte em ${d}.`,
    quantoCusta: (lugar) => `Quanto custa uma casa em ${lugar}`,
    simuleFaixa: 'Descubra qual faixa cabe no seu bolso',
    simuleFaixaNota: '60 segundos, sem documentos.',
    plantasEm: (lugar) => `Plantas disponíveis em ${lugar}`,
    plantaNota: 'No Japão a planta é escrita assim: o número são os quartos, e <span lang="ja">LDK</span> é a sala com cozinha integrada. <span lang="ja">3LDK</span> = três quartos mais sala/cozinha.',
    estacoes: 'Estações mais próximas',
    casasEm: (mostra, total, lugar) => (total > mostra ? `${mostra} das ${total} casas em ${lugar}` : `${total === 1 ? 'A casa' : `As ${total} casas`} em ${lugar}`),
    ordemCasas: 'Da mais barata para a mais cara. Cada uma tem página própria com planta, área, estação e a parcela estimada.',
    verTodas: (n, lugar) => `Ver as ${n} casas em ${lugar}`,
    alugarEm: (lugar) => `Alugar em ${lugar}, para comparar`,
    alugarTxt: (n, lugar, med) => `São ${n} ${n === 1 ? 'apartamento' : 'apartamentos'} para alugar em ${lugar} no acervo de hoje${med ? `, com aluguel mediano de ${med}/mês` : ''}.`,
    alugarParcela: (p) => ` A parcela estimada da casa mais barata é ${p}/mês.`,
    verApartamentos: (lugar) => `Ver apartamentos em ${lugar}`,
    alugarNota: 'Comparar aluguel com parcela ajuda, mas não decide: comprar tem entrada e custos de aquisição que o aluguel não tem. <a href="/quanto-custa-casa-japao">Veja todos os custos da compra</a>.',
    comprarEm: (lugar) => `Comprar em ${lugar} com a Easy House`,
    comprarTxt: 'A gente visita com você, conversa em japonês com o anunciante e com o banco, e explica cada etapa em português. A Easy House não é instituição financeira e não aprova crédito — quem decide é o banco; o que fazemos é preparar e apresentar o seu caso.',
    falarSobre: (lugar) => `Falar sobre ${lugar}`,
    waMsg: (lugar) => `Olá! Quero comprar casa em ${lugar}. Podemos conversar?`,
    ctaFinanciar: 'Quero saber se consigo financiar',
    perguntas: (lugar) => `Perguntas sobre comprar em ${lugar}`,
    pQuanto: (lugar) => `Quanto custa uma casa em ${lugar}?`,
    rQuanto: (min, max, med, p) => `No acervo de hoje, de ${min} a ${max}; metade das casas custa até ${med}.${p ? ` A mais barata dá uma parcela estimada de ${p}/mês — estimativa, não é oferta.` : ''}`,
    pNova: (lugar) => `Tem casa nova em ${lugar}?`,
    rNova: (n, t, u) => (n === 0 ? `Não no momento: as ${t} casas do acervo são usadas (中古).` : n === t ? `Sim — todas as ${t} são novas (新築).` : `Sim: ${n} das ${t} são novas (新築); as outras ${u} são usadas (中古).`),
    pEstacao: (lugar) => `Qual estação fica perto das casas em ${lugar}?`,
    rEstacao: (est, n, min) => `A mais frequente é <span lang="ja">${est}</span> (${n} ${n === 1 ? 'casa' : 'casas'}).${min ? ` Metade das casas fica a até ${min} minutos a pé de uma estação.` : ''}`,
    pFinanciar: (lugar) => `Estrangeiro consegue financiar casa em ${lugar}?`,
    rFinanciar: 'Depende do banco e do seu perfil: visto, tempo de emprego, renda e dívidas atuais. O Flat 35 aceita estrangeiros só com visto permanente (永住者) ou permanente especial (特別永住者); bancos privados têm critérios próprios. A Easy House analisa o seu caso — sem promessa de aprovação.',
    outrasCidades: (prov) => `Outras cidades em ${prov}`,
    entregas: 'Entregas reais',
    comunidade: (lugar, n) => `Moram em ${lugar} ${n} brasileiros`,
    comunidadeData: 'dezembro de 2025',
    fonte: 'Fonte',
    hProv: (p) => `Casas à venda em ${p}`,
    cidadesDe: (p) => `Cidades de ${p} com casas à venda`,
    colCidade: 'Cidade', colCasas: 'Casas', colMediana: 'Mediana', colDesde: 'A partir de',
    maisBaratas: (p) => `As mais baratas de ${p}`,
    pTopCidades: (p) => `Quais cidades de ${p} têm mais casas à venda?`,
    rTopCidades: (lista) => `Hoje: ${lista}. A lista acompanha o acervo e muda toda semana.`,
    hHub: 'Casas à venda em Aichi e Mie',
    subHub: 'Para brasileiros e latinos que querem comprar a casa própria no Japão. Preço, planta e parcela estimada de cada uma, em português.',
    provincias: 'Escolha a província',
    semEstoque: (p) => `${p}: o acervo ainda não inclui casas desta província. Se você quer comprar aqui, fale com a gente.`,
    todasCidades: 'Todas as cidades com casas à venda',
    novaOuUsada: 'Nova ou usada?',
    etapasTitulo: 'Como é a compra, do início às chaves',
    etapasNota: 'São as etapas que a Easy House acompanha com cada cliente. A ordem entre vistoria e assinatura com o banco pode mudar conforme o banco.',
    guiasTitulo: 'Antes de decidir',
    gCustos: 'Quanto custa comprar uma casa no Japão (todos os custos)',
    gFinanc: 'Como funciona o financiamento imobiliário no Japão',
    gSimular: 'Simular quanto posso pagar por mês',
    hNovas: 'Casas novas à venda em Aichi e Mie',
    hUsadas: 'Casas usadas à venda em Aichi e Mie',
    jpNovas: '新築一戸建て', jpUsadas: '中古一戸建て',
    explNovas: 'Casa nova (<span lang="ja">新築</span>) é como o anúncio classifica o imóvel de primeira venda, que nunca foi habitado. Costuma vir com garantia do construtor e equipamentos novos; em troca, o preço por metro quadrado é maior.',
    explUsadas: 'Casa usada (<span lang="ja">中古</span>) já teve morador. O preço costuma ser menor que o de uma nova do mesmo tamanho; em troca, vale olhar com atenção o estado da casa, a idade e o que precisa de reforma — e o banco também avalia o imóvel.',
    porCidade: 'Por cidade',
    verOutroTipo: (tipo) => (tipo === 'novas' ? 'Ver também as casas usadas' : 'Ver também as casas novas'),
    descTipo: (tipo, n, faixa) => `${n} ${tipo === 'novas' ? 'casas novas (新築一戸建て)' : 'casas usadas (中古一戸建て)'} à venda em Aichi e Mie${faixa ? `, ${faixa}` : ''}. Preço, planta e parcela estimada de cada uma, em português.`,
    verFicha: 'Ver detalhes',
    estasEm: 'Você está em',
  },

  es: {
    lang: 'es', moeda: 'es-MX', skip: 'Ir al contenido',
    inicio: 'Inicio', casasAVenda: 'Casas en venta',
    casa: (n) => (n === 1 ? 'casa' : 'casas'),
    casaAVenda: (n) => (n === 1 ? 'casa en venta' : 'casas en venta'),
    imovel: (n) => (n === 1 ? 'vivienda' : 'viviendas'),
    aPartirDe: 'desde',
    deAte: (a, b) => `de ${a} a ${b}`,
    mediana: 'mediana',
    oQueExiste: (lugar) => `Lo que hay en ${lugar} hoy`,
    tCasasAVenda: 'Casas en venta', tFaixa: 'Rango de precios', tMediana: 'Precio mediano',
    tParcela: 'Cuota estimada de la más barata', tArea: 'Área construida (mediana)', tTerreno: 'Terreno (mediana)',
    tVaga: 'Con estacionamiento', tNovas: 'Nuevas (新築)', tUsadas: 'Usadas (中古)',
    tCidades: 'Ciudades con casas',
    deTotal: (a, b) => `${a} de ${b}`,
    porMes: '/mes',
    notaNumeros: 'Números del inventario de hoy, recontados en cada actualización. La cuota es una estimación educativa: no es una oferta ni una aprobación de crédito.',
    verificado: (d) => `Datos verificados en la fuente el ${d}.`,
    quantoCusta: (lugar) => `Cuánto cuesta una casa en ${lugar}`,
    simuleFaixa: 'Descubre qué rango cabe en tu bolsillo',
    simuleFaixaNota: '60 segundos, sin documentos.',
    plantasEm: (lugar) => `Distribuciones disponibles en ${lugar}`,
    plantaNota: 'En Japón la distribución se escribe así: el número son los dormitorios y <span lang="ja">LDK</span> es la sala con cocina integrada. <span lang="ja">3LDK</span> = tres dormitorios más sala/cocina.',
    estacoes: 'Estaciones más cercanas',
    casasEm: (mostra, total, lugar) => (total > mostra ? `${mostra} de las ${total} casas en ${lugar}` : `${total === 1 ? 'La casa' : `Las ${total} casas`} en ${lugar}`),
    ordemCasas: 'De la más barata a la más cara. La ficha completa de cada una está en portugués: precio, distribución, área, estación y cuota estimada.',
    verTodas: (n, lugar) => `Ver las ${n} casas en ${lugar} (en portugués)`,
    alugarEm: (lugar) => `Alquilar en ${lugar}, para comparar`,
    alugarTxt: (n, lugar, med) => `Hay ${n} ${n === 1 ? 'departamento' : 'departamentos'} en alquiler en ${lugar} en el inventario de hoy${med ? `, con alquiler mediano de ${med}/mes` : ''}.`,
    alugarParcela: (p) => ` La cuota estimada de la casa más barata es ${p}/mes.`,
    verApartamentos: (lugar) => `Ver departamentos en ${lugar} (en portugués)`,
    alugarNota: 'Comparar alquiler con cuota ayuda, pero no decide: comprar tiene entrada y gastos de compra que el alquiler no tiene.',
    comprarEm: (lugar) => `Comprar en ${lugar} con Easy House`,
    comprarTxt: 'Visitamos contigo, hablamos en japonés con el vendedor y con el banco, y te explicamos cada etapa en español. Easy House no es una institución financiera y no aprueba créditos: decide el banco; lo que hacemos es preparar y presentar tu caso.',
    falarSobre: (lugar) => `Hablar sobre ${lugar}`,
    waMsg: (lugar) => `¡Hola! Quiero comprar casa en ${lugar}. ¿Podemos hablar?`,
    ctaFinanciar: 'Quiero saber si puedo financiar',
    perguntas: (lugar) => `Preguntas sobre comprar en ${lugar}`,
    pQuanto: (lugar) => `¿Cuánto cuesta una casa en ${lugar}?`,
    rQuanto: (min, max, med, p) => `En el inventario de hoy, de ${min} a ${max}; la mitad de las casas cuesta hasta ${med}.${p ? ` La más barata da una cuota estimada de ${p}/mes: es una estimación, no una oferta.` : ''}`,
    pNova: (lugar) => `¿Hay casas nuevas en ${lugar}?`,
    rNova: (n, t, u) => (n === 0 ? `No por ahora: las ${t} casas del inventario son usadas (中古).` : n === t ? `Sí: las ${t} son nuevas (新築).` : `Sí: ${n} de las ${t} son nuevas (新築); las otras ${u} son usadas (中古).`),
    pEstacao: (lugar) => `¿Qué estación queda cerca de las casas en ${lugar}?`,
    rEstacao: (est, n, min) => `La más frecuente es <span lang="ja">${est}</span> (${n} ${n === 1 ? 'casa' : 'casas'}).${min ? ` La mitad de las casas está a ${min} minutos a pie o menos de una estación.` : ''}`,
    pFinanciar: (lugar) => `¿Un extranjero puede financiar una casa en ${lugar}?`,
    rFinanciar: 'Depende del banco y de tu perfil: visa, tiempo de empleo, ingresos y deudas actuales. Flat 35 acepta extranjeros solo con residencia permanente (永住者) o residencia permanente especial (特別永住者); los bancos privados tienen criterios propios. Easy House analiza tu caso, sin promesa de aprobación.',
    outrasCidades: (prov) => `Otras ciudades en ${prov}`,
    entregas: 'Entregas reales (en portugués)',
    comunidade: null,
    fonte: 'Fuente',
    hProv: (p) => `Casas en venta en ${p}`,
    cidadesDe: (p) => `Ciudades de ${p} con casas en venta`,
    colCidade: 'Ciudad', colCasas: 'Casas', colMediana: 'Mediana', colDesde: 'Desde',
    maisBaratas: (p) => `Las más baratas de ${p}`,
    pTopCidades: (p) => `¿Qué ciudades de ${p} tienen más casas en venta?`,
    rTopCidades: (lista) => `Hoy: ${lista}. La lista sigue al inventario y cambia cada semana.`,
    hHub: 'Casas en venta en Aichi y Mie',
    subHub: 'Para latinos que quieren comprar casa propia en Japón. Precio, distribución y cuota estimada de cada una, con atención en español.',
    provincias: 'Elige la provincia',
    semEstoque: (p) => `${p}: el inventario todavía no incluye casas de esta provincia. Si quieres comprar aquí, escríbenos.`,
    todasCidades: 'Todas las ciudades con casas en venta',
    novaOuUsada: '¿Nueva o usada?',
    etapasTitulo: 'Cómo es la compra, del inicio a las llaves',
    etapasNota: 'Son las etapas que Easy House acompaña con cada cliente. El orden entre la inspección y la firma con el banco puede cambiar según el banco.',
    guiasTitulo: 'Antes de decidir',
    gCustos: null, gFinanc: null,
    gSimular: 'Simular cuánto puedo pagar por mes',
    hNovas: 'Casas nuevas en venta en Aichi y Mie',
    hUsadas: 'Casas usadas en venta en Aichi y Mie',
    jpNovas: '新築一戸建て', jpUsadas: '中古一戸建て',
    explNovas: 'Casa nueva (<span lang="ja">新築</span>) es como el anuncio clasifica la vivienda de primera venta, que nunca fue habitada. Suele venir con garantía del constructor y equipos nuevos; a cambio, el precio por metro cuadrado es mayor.',
    explUsadas: 'Casa usada (<span lang="ja">中古</span>) ya tuvo residentes. El precio suele ser menor que el de una nueva del mismo tamaño; a cambio, conviene revisar con atención el estado, la antigüedad y lo que necesita reforma. El banco también evalúa la vivienda.',
    porCidade: 'Por ciudad',
    verOutroTipo: (tipo) => (tipo === 'novas' ? 'Ver también las casas usadas' : 'Ver también las casas nuevas'),
    descTipo: (tipo, n, faixa) => `${n} ${tipo === 'novas' ? 'casas nuevas (新築一戸建て)' : 'casas usadas (中古一戸建て)'} en venta en Aichi y Mie${faixa ? `, ${faixa}` : ''}. Precio, distribución y cuota estimada de cada una, con atención en español.`,
    verFicha: 'Ver ficha (en portugués)',
    estasEm: 'Estás en',
  },
};

/** As 7 etapas que a Easy House acompanha com cada cliente (lib/acompanhamento-modelos.json). */
const ETAPAS = {
  pt: [
    ['Escolher sua casa', 'Visite os imóveis e confira bairro, acesso e riscos naturais.'],
    ['Fazer a proposta', 'Enviamos o preço e as condições ao vendedor. Ainda não é o contrato definitivo.'],
    ['Assinar a compra e venda', 'Você recebe a explicação do imóvel antes de assinar e paga o sinal (手付金) combinado.'],
    ['Análise final do banco', 'O banco avalia o seu perfil e o imóvel escolhido. Seu consultor envia a lista exata de documentos.'],
    ['Fazer a vistoria', 'Conferimos a casa e registramos as correções necessárias.'],
    ['Assinar com o banco', 'Depois da aprovação final: valor, prazo, juros e seguro.'],
    ['Receber as chaves', 'Liberação do crédito, pagamento ao vendedor e registro. Chegou o dia da sua casa.'],
  ],
  es: [
    ['Elegir tu casa', 'Visita las viviendas y revisa el barrio, el acceso y los riesgos naturales.'],
    ['Hacer la oferta', 'Enviamos el precio y las condiciones al vendedor. Todavía no es el contrato definitivo.'],
    ['Firmar la compraventa', 'Recibes la explicación de la vivienda antes de firmar y pagas la seña (手付金) acordada.'],
    ['Análisis final del banco', 'El banco evalúa tu perfil y la vivienda elegida. Tu asesor te envía la lista exacta de documentos.'],
    ['Hacer la inspección', 'Revisamos la casa y registramos las correcciones necesarias.'],
    ['Firmar con el banco', 'Después de la aprobación final: monto, plazo, interés y seguro.'],
    ['Recibir las llaves', 'Desembolso del crédito, pago al vendedor y registro. Llegó el día de tu casa.'],
  ],
};

/* ═════════════════════════════════════════════════════════════════════════
   Números
   ═════════════════════════════════════════════════════════════════════════ */

/**
 * Mediana.
 *
 * `zeroVale` existe porque 0 significa coisas opostas conforme o campo: em
 * preço e área é dado ausente, e entra na conta puxando tudo para baixo; em
 * idade é "casa nova", e descartá-lo mente. Nishio tem 54 das 56 casas novas
 * e a mediana de idade saía como 3 anos, calculada sobre as duas usadas.
 */
function mediana(nums, { zeroVale = false } = {}) {
  const v = nums
    .filter((n) => typeof n === 'number' && isFinite(n) && (zeroVale ? n >= 0 : n > 0))
    .sort((a, b) => a - b);
  if (!v.length) return null;
  const meio = Math.floor(v.length / 2);
  return v.length % 2 ? v[meio] : Math.round((v[meio - 1] + v[meio]) / 2);
}

function contar(itens, campo) {
  const m = new Map();
  for (const i of itens) {
    const v = campo(i);
    if (v) m.set(v, (m.get(v) || 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

/** Nova = o que o anúncio classifica como 新築; sem a informação, idade 0. */
export const ehNova = (c) => c.construcaoNova === true || (c.construcaoNova == null && c.idade === 0);

/** Os números de um conjunto de casas — o que diferencia uma página da outra. */
export function estatisticas(casas) {
  const precos = casas.map((c) => c.preco).filter((p) => typeof p === 'number' && p > 0);
  const idades = casas.map((c) => c.idade).filter((i) => typeof i === 'number' && i >= 0);
  const novas = casas.filter(ehNova).length;
  return {
    total: casas.length,
    precoMin: precos.length ? Math.min(...precos) : null,
    precoMax: precos.length ? Math.max(...precos) : null,
    precoMediana: mediana(precos),
    areaConstruida: mediana(casas.map((c) => c.areaConstruida)),
    areaTerreno: mediana(casas.map((c) => c.areaTerreno)),
    idadeMediana: idades.length ? mediana(idades, { zeroVale: true }) : null,
    novas,
    usadas: casas.length - novas,
    comVaga: casas.filter((c) => c.vaga?.vagas > 0).length,
    minutosMediana: mediana(casas.map((c) => c.acesso?.minutosAPe)),
    plantas: contar(casas, (c) => c.planta).slice(0, 6),
    estacoes: contar(casas, (c) => c.acesso?.estacao).slice(0, 5),
  };
}

function faixas(casas, lang) {
  const M = lang === 'es' ? 'millones' : 'milhões';
  const ate = lang === 'es' ? 'Hasta' : 'Até';
  const acima = lang === 'es' ? 'Más de' : 'Acima de';
  const cortes = [20e6, 25e6, 30e6, 35e6, 40e6];
  const rotulos = [
    [`${ate} ¥20 ${M}`, (p) => p < cortes[0]],
    [`¥20 a ¥25 ${M}`, (p) => p >= cortes[0] && p < cortes[1]],
    [`¥25 a ¥30 ${M}`, (p) => p >= cortes[1] && p < cortes[2]],
    [`¥30 a ¥35 ${M}`, (p) => p >= cortes[2] && p < cortes[3]],
    [`¥35 a ¥40 ${M}`, (p) => p >= cortes[3] && p < cortes[4]],
    [`${acima} ¥40 ${M}`, (p) => p >= cortes[4]],
  ];
  const precos = casas.map((c) => c.preco).filter((p) => typeof p === 'number' && p > 0);
  return rotulos.map(([rotulo, teste]) => ({ rotulo, total: precos.filter(teste).length })).filter((f) => f.total > 0);
}

/* ═════════════════════════════════════════════════════════════════════════
   Lugares
   ═════════════════════════════════════════════════════════════════════════ */

export const provinciaDe = (c) => chave(c.prefeitura || '');

/**
 * Slug da cidade na URL. Uma cidade com o nome da província (岐阜市 = Gifu)
 * ganha "-shi", senão /casas-a-venda/gifu seria ao mesmo tempo a província e
 * a cidade.
 */
export function slugCidade(nome) {
  const k = chave(nome);
  return PROVINCIAS[k] ? `${k}-shi` : k;
}

/** Só casas das três províncias do escopo entram nas páginas regionais. */
const noEscopo = (c) => !!PROVINCIAS[provinciaDe(c)];

/**
 * Nome da cidade em japonês, sem o bairro. Em cidades com bairros
 * administrativos o acervo grava o 区 junto (名古屋市港区); a página é da
 * cidade, então o título leva 名古屋市 — não o bairro da primeira casa.
 */
export function cidadeJpSemBairro(jp) {
  const m = /^(.+?市).+区$/.exec(jp || '');
  return m ? m[1] : (jp || null);
}

export function cidadesComPagina(todas, minimo = 1, provincia = null) {
  const m = new Map();
  for (const c of todas) {
    if (!c.cidade || !noEscopo(c)) continue;
    if (provincia && provinciaDe(c) !== provincia) continue;
    const k = slugCidade(c.cidade);
    if (!m.has(k)) m.set(k, { chave: k, nome: c.cidade, nomeJp: cidadeJpSemBairro(c.cidadeJp), prefeitura: c.prefeitura || null, provincia: provinciaDe(c), total: 0, precos: [] });
    const item = m.get(k);
    item.total += 1;
    if (c.preco > 0) item.precos.push(c.preco);
  }
  return [...m.values()]
    .filter((c) => c.total >= minimo)
    .map(({ precos, ...c }) => ({ ...c, mediana: mediana(precos), desde: precos.length ? Math.min(...precos) : null }))
    .sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome));
}

export function acharCidade(todas, slugUrl) {
  const k = chave(slugUrl);
  if (!k || PROVINCIAS[k]) return null;
  const casas = todas.filter((c) => c.cidade && noEscopo(c) && slugCidade(c.cidade) === k);
  if (!casas.length) return null;
  const c0 = casas[0];
  return { chave: k, nome: c0.cidade, nomeJp: cidadeJpSemBairro(c0.cidadeJp), prefeitura: c0.prefeitura || null, provincia: provinciaDe(c0), casas };
}

/** Província pela chave; null se não é uma das três ou não tem casa nenhuma. */
export function acharProvincia(todas, slugUrl) {
  const k = chave(slugUrl);
  if (!PROVINCIAS[k]) return null;
  const casas = todas.filter((c) => provinciaDe(c) === k);
  if (!casas.length) return null;
  return { chave: k, ...PROVINCIAS[k], casas };
}

/* ═════════════════════════════════════════════════════════════════════════
   Pedaços de página
   ═════════════════════════════════════════════════════════════════════════ */

/** Os mesmos dados do /sobre — nada além do que a empresa já publica. */
const ORGANIZACAO = {
  '@type': 'RealEstateAgent',
  '@id': `${SITE}/#organizacao`,
  name: '株式会社EASY HOUSE',
  alternateName: 'EASY HOUSE',
  url: `${SITE}/`,
  telephone: '+81-80-2886-7708',
  email: 'info@easyhouse.homes',
  address: { '@type': 'PostalAddress', streetAddress: '入船町4-37-2', addressLocality: '碧南市', addressRegion: '愛知県', addressCountry: 'JP' },
  availableLanguage: ['pt-BR', 'es', 'en', 'ja'],
};

function fmt(lang) {
  const loc = T[lang].moeda;
  return {
    yen: (v) => (typeof v === 'number' && isFinite(v) ? '¥' + Math.round(v).toLocaleString(loc) : null),
    m2: (v) => (typeof v === 'number' && isFinite(v) && v > 0 ? v.toLocaleString(loc, { maximumFractionDigits: 0 }) + ' m²' : null),
    num: (v) => Number(v).toLocaleString(loc),
    data: (iso) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : null),
  };
}

/** Card em espanhol: mesmas classes do card do portal, só o que a página pode prometer. */
function cartaoEs(c, i) {
  const f = fmt('es');
  const foto = c.fotos && c.fotos[0];
  const href = `${FICHA}/${e(c.slug)}`;
  const fatos = [
    c.planta ? `<li><b>${e(c.planta)}</b></li>` : '',
    f.m2(c.areaConstruida) ? `<li>${e(f.m2(c.areaConstruida))} <span class="fato__rotulo">construida</span></li>` : '',
    f.m2(c.areaTerreno) ? `<li>${e(f.m2(c.areaTerreno))} <span class="fato__rotulo">terreno</span></li>` : '',
    c.acesso?.minutosAPe ? `<li>${c.acesso.minutosAPe} min a pie${c.acesso.estacao ? ` de <span lang="ja">${e(c.acesso.estacao)}</span>` : ''}</li>` : '',
  ].join('');
  const tipo = ehNova(c) ? 'Casa nueva' : (c.ano?.ano ? `Construida en ${c.ano.ano}` : 'Casa usada');
  return `<article class="casa" data-codigo="${e(c.codigo)}">
  <a class="casa__foto" href="${href}" tabindex="-1" aria-hidden="true" hreflang="pt-BR">${foto
    ? `<img src="${e(foto)}" alt="Fachada o ambiente de la casa ${e(c.planta || '')} en ${e(c.cidade || '')}" width="600" height="400" ${i === 0 ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`
    : '<span class="vazio" aria-hidden="true">家</span>'}</a>
  <div class="casa__corpo">
    <p class="casa__preco"><b>${e(f.yen(c.preco) || 'Precio a consultar')}</b>${c.precoMan ? `<small lang="ja">${e(c.precoMan)}</small>` : ''}</p>
    <h3 class="casa__nome">Casa ${e(c.planta || '')} en ${e(c.cidade || '')} <span class="casa__onde"><span lang="ja">${e(c.cidadeJp || '')}</span>${c.prefeitura ? ` · ${e(c.prefeitura)}` : ''}</span></h3>
    ${fatos ? `<ul class="casa__fatos">${fatos}</ul>` : ''}
    ${c.estimativa?.valor ? `<p class="casa__mensal">≈ ${e(f.yen(c.estimativa.valor))}/mes <span class="est">estimación, no es una oferta</span></p>` : ''}
    <p class="casa__meta">${e(tipo)}</p>
    <div class="casa__acoes"><a class="casa__ver" href="${href}" hreflang="pt-BR">${T.es.verFicha}<span aria-hidden="true"> →</span></a></div>
  </div>
</article>`;
}

function cards(casas, lang) {
  const ordenadas = [...casas].sort((a, b) => (a.preco || Infinity) - (b.preco || Infinity)).slice(0, CARDS);
  return ordenadas.map((c, i) => (lang === 'es' ? cartaoEs(c, i) : Cartao.cartao(c, { prioridade: i === 0, titulo: 'h3' }))).join('');
}

function blocoResumo(s, lugar, lang, { parcelaMin, cidades = null } = {}) {
  const t = T[lang]; const f = fmt(lang);
  return `
<div class="info-bloco" id="resumo">
  <h2>${e(t.oQueExiste(lugar))}</h2>
  <table class="info-tabela"><tbody>
    <tr><th scope="row">${t.tCasasAVenda}</th><td>${f.num(s.total)}</td></tr>
    ${cidades ? `<tr><th scope="row">${t.tCidades}</th><td>${cidades}</td></tr>` : ''}
    ${s.precoMin && s.precoMax ? `<tr><th scope="row">${t.tFaixa}</th><td>${e(f.yen(s.precoMin))} – ${e(f.yen(s.precoMax))}</td></tr>` : ''}
    ${s.precoMediana ? `<tr><th scope="row">${t.tMediana}</th><td>${e(f.yen(s.precoMediana))}</td></tr>` : ''}
    ${parcelaMin ? `<tr><th scope="row">${t.tParcela}</th><td>${e(f.yen(parcelaMin))}${t.porMes}</td></tr>` : ''}
    ${s.novas ? `<tr><th scope="row">${t.tNovas}</th><td>${t.deTotal(f.num(s.novas), f.num(s.total))}</td></tr>` : ''}
    ${s.usadas ? `<tr><th scope="row">${t.tUsadas}</th><td>${t.deTotal(f.num(s.usadas), f.num(s.total))}</td></tr>` : ''}
    ${f.m2(s.areaConstruida) ? `<tr><th scope="row">${t.tArea}</th><td>${e(f.m2(s.areaConstruida))}</td></tr>` : ''}
    ${f.m2(s.areaTerreno) ? `<tr><th scope="row">${t.tTerreno}</th><td>${e(f.m2(s.areaTerreno))}</td></tr>` : ''}
    ${s.comVaga ? `<tr><th scope="row">${t.tVaga}</th><td>${t.deTotal(f.num(s.comVaga), f.num(s.total))}</td></tr>` : ''}
  </tbody></table>
  <p class="estimativa-nota">${t.notaNumeros}</p>
</div>`;
}

function blocoFaixas(casas, lugar, lang) {
  const t = T[lang]; const dist = faixas(casas, lang);
  if (dist.length < 2) return '';
  return `
<div class="info-bloco" id="faixas">
  <h2>${e(t.quantoCusta(lugar))}</h2>
  <table class="info-tabela"><tbody>
    ${dist.map((x) => `<tr><th scope="row">${e(x.rotulo)}</th><td>${x.total} ${t.casa(x.total)}</td></tr>`).join('')}
  </tbody></table>
  <p class="estimativa-nota"><a href="${CAMINHOS[lang].simulador}" data-cta="seo_simulador">${t.simuleFaixa}</a> — ${t.simuleFaixaNota}</p>
</div>`;
}

function blocoPlantas(s, lugar, lang) {
  const t = T[lang];
  if (!s.plantas.length) return '';
  return `
<div class="info-bloco" id="plantas">
  <h2>${e(t.plantasEm(lugar))}</h2>
  <table class="info-tabela"><tbody>
    ${s.plantas.map(([p, n]) => `<tr><th scope="row"><span lang="ja">${e(p)}</span></th><td>${n} ${t.casa(n)}</td></tr>`).join('')}
  </tbody></table>
  <p class="estimativa-nota">${t.plantaNota}</p>
</div>`;
}

function blocoEstacoes(s, lang) {
  const t = T[lang];
  if (!s.estacoes.length) return '';
  return `
<div class="info-bloco" id="estacoes">
  <h2>${t.estacoes}</h2>
  <table class="info-tabela"><tbody>
    ${s.estacoes.map(([est, n]) => `<tr><th scope="row" lang="ja">${e(est)}</th><td>${n} ${t.casa(n)}</td></tr>`).join('')}
  </tbody></table>
</div>`;
}

function blocoCasas(casas, lugar, lang, linkTodas) {
  const t = T[lang]; const total = casas.length;
  return `
<div class="info-bloco" id="casas">
  <h2>${e(t.casasEm(Math.min(CARDS, total), total, lugar))}</h2>
  <p class="texto-livre">${t.ordemCasas}</p>
  <div class="casa-grid">${cards(casas, lang)}</div>
  ${total > CARDS && linkTodas ? `<p class="btn-row" style="margin-top:18px"><a class="btn btn--gold" href="${linkTodas}"${lang === 'es' ? ' hreflang="pt-BR"' : ''}>${e(t.verTodas(total, lugar))}</a></p>` : ''}
</div>`;
}

function blocoContato(lugar, lang) {
  const t = T[lang];
  return `
<div class="info-bloco" id="contato">
  <h2>${e(t.comprarEm(lugar))}</h2>
  <p class="texto-livre">${t.comprarTxt}</p>
  <p class="btn-row" style="margin-top:14px">
    <a class="btn btn--wa" href="https://wa.me/${WHATSAPP}?text=${encodeURIComponent(t.waMsg(lugar))}" target="_blank" rel="noopener" data-cta="seo_whatsapp">${ICONE_WA} ${e(t.falarSobre(lugar))}</a>
    <a class="btn btn--ghost" href="${CAMINHOS[lang].simulador}" data-cta="seo_simulador">${t.ctaFinanciar}</a>
  </p>
</div>`;
}

function blocoPerguntas(lugar, qas, lang) {
  if (!qas.length) return '';
  return `
<div class="info-bloco" id="perguntas">
  <h2>${e(T[lang].perguntas(lugar))}</h2>
  ${qas.map(([p, r]) => `<h3>${e(p)}</h3>\n  <p class="texto-livre">${r}</p>`).join('\n  ')}
</div>`;
}

function blocoComunidade(lugarNome, jp, lang) {
  const t = T[lang];
  if (!t.comunidade) return '';
  const n = BRASILEIROS[jp];
  if (!n) return '';
  return `<p class="texto-livre">${e(t.comunidade(lugarNome, fmt(lang).num(n)))} (${t.comunidadeData}). <span class="estimativa-nota">${t.fonte}: <a href="${FONTE_BRASILEIROS.url}" rel="noopener" target="_blank">${e(FONTE_BRASILEIROS.pt)}</a>.</span></p>`;
}

function dataVerificacao(casas) {
  const datas = casas.map((c) => c.verificadoEm).filter((d) => d && /^\d{4}-\d{2}-\d{2}/.test(d)).sort();
  return datas.length ? datas[datas.length - 1] : null;
}

/** hreflang recíproco de uma página que existe nas duas línguas. */
function alternates(ptPath, esPath) {
  return [
    { hreflang: 'pt-BR', href: `${SITE}${ptPath}` },
    { hreflang: 'es', href: `${SITE}${esPath}` },
    { hreflang: 'x-default', href: `${SITE}${ptPath}` },
  ];
}

function casca(lang, { titulo, descricao, url, ptPath, esPath, robots, jsonLd, corpo, imagem }) {
  const extra = lang === 'es'
    ? { lang: 'es', navHtml: navEs, drawerHtml: drawerEs, footHtml: footEs, skipText: T.es.skip }
    : {};
  return documento({
    titulo, descricao, canonical: url, robots, jsonLd, corpo,
    imagem, caminhoAtual: LISTA,
    alternates: alternates(ptPath, esPath),
    scripts: lang === 'pt' ? ['/casas-comum.js?v=11'] : [],
    ...extra,
  });
}

function migalhas(lang, itens) {
  return `<nav class="migalhas" aria-label="${T[lang].estasEm}">
    <ol>${itens.map(([nome, href], i) => (i === itens.length - 1
      ? `<li aria-current="page">${e(nome)}</li>`
      : `<li><a href="${href}">${e(nome)}</a></li>`)).join('')}</ol>
  </nav>`;
}

function breadcrumbLd(itens) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: itens.map(([nome, href], i) => ({ '@type': 'ListItem', position: i + 1, name: nome, item: `${SITE}${href}` })),
  };
}

function itemListLd(nome, casas) {
  const ordenadas = [...casas].sort((a, b) => (a.preco || Infinity) - (b.preco || Infinity)).slice(0, CARDS);
  return {
    '@type': 'ItemList', name: nome, numberOfItems: casas.length,
    itemListElement: ordenadas.map((c, i) => ({ '@type': 'ListItem', position: i + 1, url: `${SITE}${FICHA}/${c.slug}`, name: c.titulo })),
  };
}

function tabelaCidades(cidades, lang) {
  const t = T[lang]; const f = fmt(lang); const base = CAMINHOS[lang].hub;
  return `<table class="info-tabela">
    <thead><tr><th scope="col">${t.colCidade}</th><th scope="col">${t.colCasas}</th><th scope="col">${t.colMediana}</th><th scope="col">${t.colDesde}</th></tr></thead>
    <tbody>${cidades.map((c) => `<tr><th scope="row"><a href="${base}/${e(c.chave)}">${e(c.nome)}</a>${c.nomeJp ? ` <span class="jp" lang="ja">${e(c.nomeJp)}</span>` : ''}</th><td>${c.total}</td><td>${e(f.yen(c.mediana) || '')}</td><td>${e(f.yen(c.desde) || '')}</td></tr>`).join('')}</tbody>
  </table>`;
}

/* ═════════════════════════════════════════════════════════════════════════
   Páginas
   ═════════════════════════════════════════════════════════════════════════ */

export function paginaCidade({ cidade, casas, alugueis = [], todas = null, lang = 'pt' }) {
  const t = T[lang]; const f = fmt(lang); const C = CAMINHOS[lang];
  const ptPath = `${CAMINHOS.pt.hub}/${cidade.chave}`;
  const esPath = `${CAMINHOS.es.hub}/${cidade.chave}`;
  const url = `${SITE}${lang === 'es' ? esPath : ptPath}`;
  const s = estatisticas(casas);
  const nome = cidade.nome;
  const provChave = cidade.provincia || chave(cidade.prefeitura || '');
  const prov = PROVINCIAS[provChave];
  const provNome = prov?.nome || cidade.prefeitura || '';
  const local = [nome, provNome].filter(Boolean).join(', ');
  const em = lang === 'es' ? 'en' : 'em';
  const ordenadas = [...casas].sort((a, b) => (a.preco || Infinity) - (b.preco || Infinity));
  const parcelaMin = ordenadas.find((c) => c.estimativa?.valor)?.estimativa?.valor ?? null;

  const titulo = `${s.total} ${t.casaAVenda(s.total)} ${em} ${nome}, ${provNome}`
    + `${s.precoMin ? ` ${t.aPartirDe} ${f.yen(s.precoMin)}` : ''} | Easy House`;
  const descricao = `${s.total} ${t.casaAVenda(s.total)} ${em} ${local}`
    + `${s.precoMin && s.precoMax ? `, ${t.deAte(f.yen(s.precoMin), f.yen(s.precoMax))}` : ''}`
    + `${s.precoMediana ? ` (${t.mediana} ${f.yen(s.precoMediana)})` : ''}.`
    + (lang === 'es'
      ? ' Precio, distribución y cuota estimada de cada una, con atención en español de Easy House.'
      : ' Preço, planta e parcela estimada de cada uma, em português, com atendimento da Easy House.');

  const qas = [];
  if (s.precoMin && s.precoMax && s.precoMediana) qas.push([t.pQuanto(nome), t.rQuanto(f.yen(s.precoMin), f.yen(s.precoMax), f.yen(s.precoMediana), parcelaMin ? f.yen(parcelaMin) : null)]);
  qas.push([t.pNova(nome), t.rNova(s.novas, s.total, s.usadas)]);
  if (s.estacoes.length) qas.push([t.pEstacao(nome), t.rEstacao(e(s.estacoes[0][0]), s.estacoes[0][1], s.minutosMediana)]);
  qas.push([t.pFinanciar(nome), `${t.rFinanciar} <a href="${C.simulador}" data-cta="seo_simulador">${t.ctaFinanciar}</a>.`]);

  // Aluguel na mesma cidade (o acervo de aluguel é só de Aichi, e só em português).
  const alu = alugueis.filter((a) => a.cidade && slugCidade(a.cidade) === cidade.chave);
  const aluMed = mediana(alu.map((a) => a.aluguel));
  const blocoAluguel = alu.length ? `
<div class="info-bloco" id="aluguel">
  <h2>${e(t.alugarEm(nome))}</h2>
  <p class="texto-livre">${e(t.alugarTxt(alu.length, nome, aluMed ? f.yen(aluMed) : null))}${parcelaMin ? e(t.alugarParcela(f.yen(parcelaMin))) : ''}</p>
  <p class="btn-row"><a class="btn btn--ghost" href="/imoveis?cidade=${e(cidade.chave)}"${lang === 'es' ? ' hreflang="pt-BR"' : ''}>${e(t.verApartamentos(nome))}</a></p>
  <p class="estimativa-nota">${t.alugarNota}</p>
</div>` : '';

  const irmas = todas && provChave
    ? cidadesComPagina(todas, MINIMO_PARA_SITEMAP, provChave).filter((c) => c.chave !== cidade.chave)
    : [];
  const blocoIrmas = irmas.length ? `
<div class="info-bloco" id="outras">
  <h2>${e(t.outrasCidades(provNome))}</h2>
  <p class="cidades-links">${irmas.map((c) => `<a href="${C.hub}/${e(c.chave)}">${e(c.nome)} <span class="cidades-links__n">${c.total}</span></a>`).join('\n    ')}</p>
  <p class="btn-row"><a class="btn btn--ghost" href="${C.hub}/${provChave}">${e(t.hProv(provNome))}</a></p>
</div>` : '';

  const crumbs = [[t.inicio, lang === 'es' ? C.hub : '/'], [t.casasAVenda, C.hub], ...(prov ? [[provNome, `${C.hub}/${provChave}`]] : []), [nome, lang === 'es' ? esPath : ptPath]];
  const verificado = dataVerificacao(casas);

  const corpo = `
<main id="main">
  ${migalhas(lang, crumbs)}
  <header class="ficha-topo">
    <h1>${e(lang === 'es' ? `Casas en venta en ${nome}` : `Casas à venda em ${nome}`)}${cidade.nomeJp ? ` <span lang="ja">(${e(cidade.nomeJp)})</span>` : ''}</h1>
    <p class="ficha-local">${e(local)}</p>
    <p class="ficha-preco">${s.total} ${t.imovel(s.total)}${s.precoMin ? ` · ${t.aPartirDe} <strong>${e(f.yen(s.precoMin))}</strong>` : ''}</p>
    ${blocoComunidade(nome, cidade.nomeJp, lang)}
  </header>
  ${blocoResumo(s, nome, lang, { parcelaMin })}
  ${blocoCasas(casas, nome, lang, `${LISTA}?cidade=${e(chave(nome))}`)}
  ${blocoFaixas(casas, nome, lang)}
  ${blocoPlantas(s, nome, lang)}
  ${blocoEstacoes(s, lang)}
  ${blocoAluguel}
  ${blocoPerguntas(nome, qas, lang)}
  ${blocoContato(nome, lang)}
  ${blocoIrmas}
  ${verificado ? `<p class="estimativa-nota" style="text-align:center">${e(t.verificado(f.data(verificado)))}</p>` : ''}
</main>`;

  return casca(lang, {
    titulo, descricao, url, ptPath, esPath, corpo,
    robots: s.total < MINIMO_PARA_SITEMAP ? 'noindex, follow' : null,
    imagem: ordenadas[0]?.fotos?.[0],
    jsonLd: { '@context': 'https://schema.org', '@graph': [ORGANIZACAO, breadcrumbLd(crumbs), itemListLd(`${t.casasAVenda} ${nome}`, casas)] },
  });
}

export function paginaProvincia({ provincia, casas, lang = 'pt' }) {
  const t = T[lang]; const f = fmt(lang); const C = CAMINHOS[lang];
  const ptPath = `${CAMINHOS.pt.hub}/${provincia.chave}`;
  const esPath = `${CAMINHOS.es.hub}/${provincia.chave}`;
  const url = `${SITE}${lang === 'es' ? esPath : ptPath}`;
  const s = estatisticas(casas);
  const nome = provincia.nome;
  const em = lang === 'es' ? 'en' : 'em';
  const cidades = cidadesComPagina(casas, 1, provincia.chave);
  const ordenadas = [...casas].sort((a, b) => (a.preco || Infinity) - (b.preco || Infinity));
  const parcelaMin = ordenadas.find((c) => c.estimativa?.valor)?.estimativa?.valor ?? null;

  const titulo = `${f.num(s.total)} ${t.casaAVenda(s.total)} ${em} ${nome} (${provincia.jp})${s.precoMin ? ` ${t.aPartirDe} ${f.yen(s.precoMin)}` : ''} | Easy House`;
  const descricao = `${f.num(s.total)} ${t.casaAVenda(s.total)} ${em} ${cidades.length} ${lang === 'es' ? 'ciudades de' : 'cidades de'} ${nome}`
    + `${s.precoMin && s.precoMax ? `, ${t.deAte(f.yen(s.precoMin), f.yen(s.precoMax))}` : ''}.`
    + (lang === 'es' ? ' Casas nuevas y usadas con precio, distribución y cuota estimada, con atención en español.' : ' Casas novas e usadas com preço, planta e parcela estimada, em português.');

  const top = cidades.slice(0, 3).map((c) => `${c.nome} (${c.total})`).join(', ');
  const qas = [
    [t.pTopCidades(nome), e(t.rTopCidades(top))],
    ...(s.precoMin && s.precoMax && s.precoMediana ? [[t.pQuanto(nome), t.rQuanto(f.yen(s.precoMin), f.yen(s.precoMax), f.yen(s.precoMediana), parcelaMin ? f.yen(parcelaMin) : null)]] : []),
    [t.pNova(nome), t.rNova(s.novas, s.total, s.usadas)],
    [t.pFinanciar(nome), `${t.rFinanciar} <a href="${C.simulador}" data-cta="seo_simulador">${t.ctaFinanciar}</a>.`],
  ];

  const crumbs = [[t.inicio, lang === 'es' ? C.hub : '/'], [t.casasAVenda, C.hub], [nome, lang === 'es' ? esPath : ptPath]];
  const verificado = dataVerificacao(casas);

  const corpo = `
<main id="main">
  ${migalhas(lang, crumbs)}
  <header class="ficha-topo">
    <h1>${e(t.hProv(nome))} <span lang="ja">(${e(provincia.jp)})</span></h1>
    <p class="ficha-preco">${f.num(s.total)} ${t.imovel(s.total)} · ${cidades.length} ${lang === 'es' ? 'ciudades' : 'cidades'}${s.precoMin ? ` · ${t.aPartirDe} <strong>${e(f.yen(s.precoMin))}</strong>` : ''}</p>
    ${blocoComunidade(nome, provincia.jp, lang)}
  </header>
  ${blocoResumo(s, nome, lang, { parcelaMin, cidades: cidades.length })}
  <div class="info-bloco" id="cidades">
    <h2>${e(t.cidadesDe(nome))}</h2>
    ${tabelaCidades(cidades, lang)}
  </div>
  <div class="info-bloco" id="casas">
    <h2>${e(t.maisBaratas(nome))}</h2>
    <p class="texto-livre">${t.ordemCasas}</p>
    <div class="casa-grid">${cards(casas, lang)}</div>
  </div>
  ${blocoFaixas(casas, nome, lang)}
  ${blocoPlantas(s, nome, lang)}
  ${blocoPerguntas(nome, qas, lang)}
  ${blocoContato(nome, lang)}
  ${verificado ? `<p class="estimativa-nota" style="text-align:center">${e(t.verificado(f.data(verificado)))}</p>` : ''}
</main>`;

  return casca(lang, {
    titulo, descricao, url, ptPath, esPath, corpo,
    robots: s.total < MINIMO_PARA_SITEMAP ? 'noindex, follow' : null,
    imagem: ordenadas[0]?.fotos?.[0],
    jsonLd: {
      '@context': 'https://schema.org',
      '@graph': [ORGANIZACAO, breadcrumbLd(crumbs), {
        '@type': 'ItemList', name: t.cidadesDe(nome), numberOfItems: cidades.length,
        itemListElement: cidades.map((c, i) => ({ '@type': 'ListItem', position: i + 1, url: `${SITE}${C.hub}/${c.chave}`, name: c.nome })),
      }],
    },
  });
}

export function paginaHub({ todas, lang = 'pt' }) {
  const t = T[lang]; const f = fmt(lang); const C = CAMINHOS[lang];
  const ptPath = CAMINHOS.pt.hub; const esPath = CAMINHOS.es.hub;
  const url = `${SITE}${lang === 'es' ? esPath : ptPath}`;
  const casas = todas.filter(noEscopo);
  const s = estatisticas(casas);
  const cidades = cidadesComPagina(casas, MINIMO_PARA_SITEMAP);

  const provs = Object.entries(PROVINCIAS).map(([k, p]) => {
    const cs = casas.filter((c) => provinciaDe(c) === k);
    return { chave: k, ...p, total: cs.length, mediana: mediana(cs.map((c) => c.preco)), cidades: cidadesComPagina(cs, 1, k).length };
  });

  const titulo = lang === 'es'
    ? `Casas en venta en Aichi y Mie para latinos: ${f.num(s.total)} viviendas | Easy House`
    : `Casas à venda em Aichi e Mie para brasileiros: ${f.num(s.total)} imóveis | Easy House`;
  const descricao = lang === 'es'
    ? `${f.num(s.total)} casas en venta en Aichi y Mie, nuevas y usadas, ${t.deAte(f.yen(s.precoMin), f.yen(s.precoMax))}. Busca por ciudad y habla en español con Easy House.`
    : `${f.num(s.total)} casas à venda em Aichi e Mie, novas e usadas, ${t.deAte(f.yen(s.precoMin), f.yen(s.precoMax))}. Busque por cidade e fale em português com a Easy House.`;

  const cartaoProv = (p) => (p.total
    ? `<a class="card card-link" href="${C.hub}/${p.chave}">
        <h3>${e(p.nome)} <span lang="ja">${e(p.jp)}</span></h3>
        <p>${f.num(p.total)} ${t.casaAVenda(p.total)} · ${p.cidades} ${lang === 'es' ? 'ciudades' : 'cidades'}${p.mediana ? ` · ${t.mediana} ${e(f.yen(p.mediana))}` : ''}</p>
      </a>`
    : `<div class="card"><h3>${e(p.nome)} <span lang="ja">${e(p.jp)}</span></h3><p>${e(t.semEstoque(p.nome))}</p>
        <p><a href="https://wa.me/${WHATSAPP}?text=${encodeURIComponent(t.waMsg(p.nome))}" target="_blank" rel="noopener" data-cta="seo_whatsapp">WhatsApp</a></p></div>`);

  const guias = [
    t.gCustos ? `<li><a href="/quanto-custa-casa-japao">${t.gCustos}</a></li>` : '',
    t.gFinanc ? `<li><a href="/financiamento-imovel-japao">${t.gFinanc}</a></li>` : '',
    `<li><a href="${C.simulador}" data-cta="seo_simulador">${t.gSimular}</a></li>`,
    `<li><a href="/entregas"${lang === 'es' ? ' hreflang="pt-BR"' : ''}>${t.entregas}</a></li>`,
  ].join('');

  const crumbs = [[t.inicio, lang === 'es' ? esPath : '/'], [t.casasAVenda, lang === 'es' ? esPath : ptPath]];
  const corpo = `
<main id="main">
  ${migalhas(lang, crumbs)}
  <header class="ficha-topo">
    <h1>${e(t.hHub)}</h1>
    <p class="texto-livre">${e(t.subHub)}</p>
  </header>
  <div class="info-bloco" id="provincias">
    <h2>${t.provincias}</h2>
    <div class="grid grid--3">${provs.map(cartaoProv).join('')}</div>
  </div>
  <div class="info-bloco" id="cidades">
    <h2>${t.todasCidades}</h2>
    <p class="cidades-links">${cidades.map((c) => `<a href="${C.hub}/${e(c.chave)}">${e(c.nome)} <span class="cidades-links__n">${c.total}</span></a>`).join('\n    ')}</p>
  </div>
  <div class="info-bloco" id="tipo">
    <h2>${t.novaOuUsada}</h2>
    <p class="btn-row">
      <a class="btn btn--ghost" href="${C.novas}">${lang === 'es' ? 'Casas nuevas' : 'Casas novas'} (${f.num(s.novas)})</a>
      <a class="btn btn--ghost" href="${C.usadas}">Casas usadas (${f.num(s.usadas)})</a>
    </p>
  </div>
  <div class="info-bloco" id="etapas">
    <h2>${t.etapasTitulo}</h2>
    <ol class="texto-livre">${ETAPAS[lang].map(([tt, d]) => `<li><strong>${e(tt)}</strong> — ${e(d)}</li>`).join('')}</ol>
    <p class="estimativa-nota">${t.etapasNota}</p>
  </div>
  <div class="info-bloco" id="guias">
    <h2>${t.guiasTitulo}</h2>
    <ul class="texto-livre">${guias}</ul>
  </div>
  ${blocoContato(lang === 'es' ? 'Aichi o Mie' : 'Aichi ou Mie', lang)}
</main>`;

  return casca(lang, {
    titulo, descricao, url, ptPath, esPath, corpo,
    jsonLd: { '@context': 'https://schema.org', '@graph': [ORGANIZACAO, breadcrumbLd(crumbs)] },
  });
}

export function paginaTipo({ tipo, todas, lang = 'pt' }) {
  const t = T[lang]; const f = fmt(lang); const C = CAMINHOS[lang];
  const ptPath = CAMINHOS.pt[tipo]; const esPath = CAMINHOS.es[tipo];
  const url = `${SITE}${lang === 'es' ? esPath : ptPath}`;
  const casas = todas.filter(noEscopo).filter((c) => (tipo === 'novas' ? ehNova(c) : !ehNova(c)));
  const s = estatisticas(casas);
  const h1 = tipo === 'novas' ? t.hNovas : t.hUsadas;
  const jp = tipo === 'novas' ? t.jpNovas : t.jpUsadas;
  const faixa = s.precoMin && s.precoMax ? t.deAte(f.yen(s.precoMin), f.yen(s.precoMax)) : null;
  const ordenadas = [...casas].sort((a, b) => (a.preco || Infinity) - (b.preco || Infinity));
  const parcelaMin = ordenadas.find((c) => c.estimativa?.valor)?.estimativa?.valor ?? null;
  const cidades = cidadesComPagina(casas, 1);
  const lugar = lang === 'es' ? 'Aichi y Mie' : 'Aichi e Mie';

  const titulo = `${h1} (${jp}): ${f.num(s.total)} ${t.imovel(s.total)} | Easy House`;
  const descricao = t.descTipo(tipo, f.num(s.total), faixa);

  const crumbs = [[t.inicio, lang === 'es' ? C.hub : '/'], [t.casasAVenda, C.hub], [h1, lang === 'es' ? esPath : ptPath]];
  const corpo = `
<main id="main">
  ${migalhas(lang, crumbs)}
  <header class="ficha-topo">
    <h1>${e(h1)} <span lang="ja">(${e(jp)})</span></h1>
    <p class="ficha-preco">${f.num(s.total)} ${t.imovel(s.total)}${s.precoMin ? ` · ${t.aPartirDe} <strong>${e(f.yen(s.precoMin))}</strong>` : ''}</p>
    <p class="texto-livre">${tipo === 'novas' ? t.explNovas : t.explUsadas}</p>
  </header>
  ${blocoResumo(s, lugar, lang, { parcelaMin, cidades: cidades.length })}
  <div class="info-bloco" id="cidades">
    <h2>${t.porCidade}</h2>
    ${tabelaCidades(cidades, lang)}
  </div>
  <div class="info-bloco" id="casas">
    <h2>${e(t.maisBaratas(lugar))}</h2>
    <p class="texto-livre">${t.ordemCasas}</p>
    <div class="casa-grid">${cards(casas, lang)}</div>
    <p class="btn-row" style="margin-top:18px"><a class="btn btn--ghost" href="${tipo === 'novas' ? C.usadas : C.novas}">${t.verOutroTipo(tipo)}</a></p>
  </div>
  ${blocoFaixas(casas, lugar, lang)}
  ${blocoPlantas(s, lugar, lang)}
  ${blocoContato(lugar, lang)}
</main>`;

  return casca(lang, {
    titulo, descricao, url, ptPath, esPath, corpo,
    robots: s.total < MINIMO_PARA_SITEMAP ? 'noindex, follow' : null,
    imagem: ordenadas[0]?.fotos?.[0],
    jsonLd: { '@context': 'https://schema.org', '@graph': [ORGANIZACAO, breadcrumbLd(crumbs), itemListLd(h1, casas)] },
  });
}

/**
 * Todas as URLs regionais indexáveis, nas duas línguas, para o sitemap.
 * Mesmo gate das páginas: abaixo do mínimo, fora do sitemap.
 */
export function urlsRegionais(todas) {
  const casas = todas.filter(noEscopo);
  const urls = [];
  const par = (pt, es) => { urls.push({ loc: `${SITE}${pt}`, alternates: alternates(pt, es) }); urls.push({ loc: `${SITE}${es}`, alternates: alternates(pt, es) }); };
  par(CAMINHOS.pt.hub, CAMINHOS.es.hub);
  for (const k of Object.keys(PROVINCIAS)) {
    if (casas.filter((c) => provinciaDe(c) === k).length >= MINIMO_PARA_SITEMAP) par(`${CAMINHOS.pt.hub}/${k}`, `${CAMINHOS.es.hub}/${k}`);
  }
  for (const c of cidadesComPagina(casas, MINIMO_PARA_SITEMAP)) par(`${CAMINHOS.pt.hub}/${c.chave}`, `${CAMINHOS.es.hub}/${c.chave}`);
  if (casas.filter(ehNova).length >= MINIMO_PARA_SITEMAP) par(CAMINHOS.pt.novas, CAMINHOS.es.novas);
  if (casas.filter((c) => !ehNova(c)).length >= MINIMO_PARA_SITEMAP) par(CAMINHOS.pt.usadas, CAMINHOS.es.usadas);
  return urls;
}
