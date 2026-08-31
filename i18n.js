/**
 * EASY HOUSE — textos do simulador em português e espanhol
 *
 * Existe uma página por idioma (`/simular` e `/simular-es`), mas **um só
 * funil**. Duplicar `simular.js` teria sido mais rápido e teria criado a pior
 * dívida possível: toda correção no funil precisaria ser feita duas vezes, e a
 * segunda seria esquecida.
 *
 * O idioma vem do `lang` do documento. Uma página é pt-BR ou es; não há troca
 * no meio do caminho, porque o tráfego chega de um anúncio já no idioma certo.
 *
 * ---
 * TEXTOS DO MOTOR
 *
 * `lib/financing.js` roda no navegador e no servidor e devolve frases prontas
 * em português — notas, avisos e o aviso legal. Traduzi-las no motor exigiria
 * passar idioma por toda a cadeia, inclusive no `api/lead.mjs`, que recalcula
 * sem saber de onde veio a pessoa. Aqui elas são traduzidas na apresentação.
 *
 * Traduzir por texto exato é frágil: muda uma vírgula no motor e a frase volta
 * a sair em português, sem erro nenhum. Por isso `tests/i18n.test.mjs` roda
 * cenários do motor e falha se aparecer qualquer frase sem tradução.
 */

const DICT = {
  'pt-BR': {
    'btn.calcular': 'Calcular minha faixa de compra',
    'btn.continuar': 'Continuar',
    'btn.primeiroCenario': 'Ver meu primeiro cenário',
    'btn.completar': 'Completar dados da minha simulação',
    'btn.simulacaoCompleta': 'Ver minha simulação completa',
    'btn.verSimulacao': 'Ver minha simulação',
    'btn.enviando': 'Enviando…',

    'erro.escolhaOpcao': 'Escolha uma opção para continuar.',
    'erro.submitSufixo': ' Você ainda pode ver sua simulação abaixo.',

    'badge.analisePersonalizada': 'Análise personalizada recomendada',
    'badge.infoAdicionais': 'Informações adicionais necessárias',
    'badge.calculada': 'Simulação calculada',

    'prelim.semRange': 'Seu caso tem características que precisam ser analisadas individualmente.',
    'prelim.intro': 'Com uma parcela de aproximadamente {parcela}, você pode comprar um imóvel entre {min} e {max}.',
    'prelim.proximaEtapa': 'Para ver se esse valor também combina com sua renda e com suas dívidas atuais, complete a próxima etapa.',

    'row.parcelaMes': 'Valor da parcela por mês',
    'row.tempoPagar': 'Tempo para pagar',
    'row.juros': 'Juros',
    'row.tipoFinanciamento': 'Tipo de financiamento',
    'row.cidadeEscolhida': 'Cidade escolhida',
    'row.anosParcelas': '{anos} anos ({meses} parcelas)',
    'row.anos': '{anos} anos',
    'row.parcelaEstimada': 'Parcela estimada',
    'row.totalParcelas': 'Total de parcelas',
    'row.parcelaDesejada': 'Parcela que você deseja',
    'row.estimativaRenda': 'Estimativa pela renda',
    'row.precisaValidacao': 'Precisa de validação',
    'row.valorImovel': 'Valor estimado do imóvel',
    'row.despesas': 'Despesas estimadas ({pct}%)',
    'row.custoTotal': 'Custo total estimado',
    'row.entrada': 'Entrada',
    'row.valorFinanciado': 'Valor financiado',
    'row.aluguelAtual': 'Aluguel atual',
    'row.parcelaFinanciamento': 'Parcela estimada do financiamento',

    'res.casoIndividual': 'Seu caso possui características que precisam ser analisadas individualmente pela Easy House.',
    'res.parcelasAtuais': 'Suas parcelas atuais',
    'res.analisarDividas': 'Quero analisar minhas dívidas junto com a casa',
    'res.imoveis': 'Imóveis',
    'res.cidadesEscolhidas': 'Cidades que você escolheu: {cidades}.',
    'res.leveCodigo': 'Leve o seu código no WhatsApp: o corretor já vê a faixa estimada desta simulação e traz opções compatíveis.',
    'res.legalDespesas': ' Para esta simulação consideramos despesas equivalentes a aproximadamente {pct}% do valor do imóvel. A composição e a possibilidade de financiar essas despesas dependem do imóvel e da instituição financeira.',
    'res.legalConfig': ' Configuração de taxas versão {versao}, vigente desde {data}.',
    'res.aluguelNota': 'A parcela não inclui imposto imobiliário, seguro, manutenção e outros custos da casa própria. A Easy House calcula o custo mensal total quando conhecer o imóvel.',

    'exp.seishain': 'Como você trabalha como funcionário efetivo',
    'exp.haken3': 'Como você trabalha por empreiteira há 3 anos ou mais',
    'exp.hakenMenos': 'Como você trabalha por empreiteira há menos de 3 anos',
    'exp.autonomo': 'Como você trabalha como autônomo',
    'exp.empresario': 'Como você é dono de empresa',
    'exp.temporario': 'Como você tem contrato temporário',
    'exp.outro': 'Pelas informações que você enviou',
    'exp.produto': '{trabalho}, utilizamos inicialmente o {produto} configurado pela Easy House. ',
    'exp.prazo': 'Com sua idade, o prazo usado foi de {anos} anos. ',
    'exp.baseRenda': 'A parcela considerada veio da estimativa pela renda, já descontando suas parcelas atuais.',
    'exp.baseComparada': 'A parcela desejada foi comparada com a capacidade estimada após considerar suas parcelas atuais.',
    'exp.baseDesejada': 'O cenário foi calculado a partir da parcela que você deseja pagar.',

    'renda.helpAutonomo': 'Informe a renda declarada, não o faturamento total.',
    'renda.tipAutonomo': '<strong>Autônomo ou empresa:</strong> use o valor declarado no 確定申告. Faturamento é o total que entrou; despesas são os custos do trabalho; renda declarada é o que sobra depois das despesas — é esse número que o banco analisa.',
    'renda.helpAssalariado': 'Se possível, use o valor do seu último 源泉徴収票.',
    'renda.tipAssalariado': '<strong>Dica:</strong> o 源泉徴収票 é o comprovante que a empresa entrega no fim do ano. Use o valor bruto anual, incluindo bônus.',

    'q.tempoEmpresa': 'Há quanto tempo você trabalha na empresa atual?',
    'q.tempoEmpreiteira': 'Há quanto tempo você trabalha por empreiteira?',

    'variante.headlineB': 'Veja quais casas podem caber na parcela que você deseja pagar',
    'variante.sublineB': 'Responda algumas perguntas simples e receba uma estimativa da faixa de imóvel compatível com o seu perfil.',

    'consent.marketing': 'Aceite de recebimento de novidades e novos imóveis',

    'wa.abertura': 'Olá! Fiz a simulação no site da Easy House.',
    'wa.aberturaTopo': 'Olá! Estou no simulador da Easy House.',
    'wa.codigo': 'Meu código é {codigo}.',
    'wa.cidades': 'Tenho interesse em imóveis em {cidades}.',
    'wa.fechoPreliminary': 'Já vi meu poder de compra aproximado e gostaria de conversar sobre as opções.',
    'wa.fechoLead': 'Prefiro continuar por aqui, se possível.',
    'wa.fechoResult': 'Gostaria de confirmar minha pré-análise.',
    'wa.fechoTopo': 'Prefiro falar com uma pessoa em vez de responder o simulador.',
    'wa.fechoPadrao': 'Gostaria de falar com um corretor.',

    'imoveis.mensagem': 'Temos imóveis disponíveis na região, o corretor irá lhe apresentar as opções que se enquadram.'
  },

  es: {
    'btn.calcular': 'Calcular mi rango de compra',
    'btn.continuar': 'Continuar',
    'btn.primeiroCenario': 'Ver mi primer escenario',
    'btn.completar': 'Completar los datos de mi simulación',
    'btn.simulacaoCompleta': 'Ver mi simulación completa',
    'btn.verSimulacao': 'Ver mi simulación',
    'btn.enviando': 'Enviando…',

    'erro.escolhaOpcao': 'Elige una opción para continuar.',
    'erro.submitSufixo': ' De todos modos puedes ver tu simulación abajo.',

    'badge.analisePersonalizada': 'Se recomienda un análisis personalizado',
    'badge.infoAdicionais': 'Se necesita más información',
    'badge.calculada': 'Simulación calculada',

    'prelim.semRange': 'Tu caso tiene características que necesitan analizarse de forma individual.',
    'prelim.intro': 'Con una cuota de aproximadamente {parcela}, puedes comprar una vivienda entre {min} y {max}.',
    'prelim.proximaEtapa': 'Para ver si ese valor también encaja con tus ingresos y con tus deudas actuales, completa la siguiente etapa.',

    'row.parcelaMes': 'Cuota mensual',
    'row.tempoPagar': 'Plazo de pago',
    'row.juros': 'Interés',
    'row.tipoFinanciamento': 'Tipo de financiamiento',
    'row.cidadeEscolhida': 'Ciudad elegida',
    'row.anosParcelas': '{anos} años ({meses} cuotas)',
    'row.anos': '{anos} años',
    'row.parcelaEstimada': 'Cuota estimada',
    'row.totalParcelas': 'Total de cuotas',
    'row.parcelaDesejada': 'Cuota que deseas pagar',
    'row.estimativaRenda': 'Estimación por ingresos',
    'row.precisaValidacao': 'Necesita validación',
    'row.valorImovel': 'Valor estimado de la vivienda',
    'row.despesas': 'Gastos estimados ({pct}%)',
    'row.custoTotal': 'Costo total estimado',
    'row.entrada': 'Pago inicial',
    'row.valorFinanciado': 'Monto financiado',
    'row.aluguelAtual': 'Alquiler actual',
    'row.parcelaFinanciamento': 'Cuota estimada del financiamiento',

    'res.casoIndividual': 'Tu caso tiene características que la Easy House necesita analizar de forma individual.',
    'res.parcelasAtuais': 'Tus cuotas actuales',
    'res.analisarDividas': 'Quiero analizar mis deudas junto con la casa',
    'res.imoveis': 'Viviendas',
    'res.cidadesEscolhidas': 'Ciudades que elegiste: {cidades}.',
    'res.leveCodigo': 'Lleva tu código al WhatsApp: el asesor ya ve el rango estimado de esta simulación y te muestra opciones compatibles.',
    'res.legalDespesas': ' Para esta simulación consideramos gastos equivalentes a aproximadamente {pct}% del valor de la vivienda. Su composición y la posibilidad de financiarlos dependen del inmueble y de la institución financiera.',
    'res.legalConfig': ' Configuración de tasas versión {versao}, vigente desde {data}.',
    'res.aluguelNota': 'La cuota no incluye el impuesto inmobiliario, el seguro, el mantenimiento ni los demás costos de la casa propia. La Easy House calcula el costo mensual total cuando conoce la vivienda.',

    'exp.seishain': 'Como trabajas como empleado fijo',
    'exp.haken3': 'Como trabajas por empresa contratista desde hace 3 años o más',
    'exp.hakenMenos': 'Como trabajas por empresa contratista desde hace menos de 3 años',
    'exp.autonomo': 'Como trabajas de forma independiente',
    'exp.empresario': 'Como eres dueño de una empresa',
    'exp.temporario': 'Como tienes contrato temporal',
    'exp.outro': 'Según la información que enviaste',
    'exp.produto': '{trabalho}, usamos inicialmente el {produto} configurado por la Easy House. ',
    'exp.prazo': 'Con tu edad, el plazo usado fue de {anos} años. ',
    'exp.baseRenda': 'La cuota considerada vino de la estimación por ingresos, ya descontando tus cuotas actuales.',
    'exp.baseComparada': 'La cuota que deseas se comparó con la capacidad estimada después de considerar tus cuotas actuales.',
    'exp.baseDesejada': 'El escenario se calculó a partir de la cuota que deseas pagar.',

    'renda.helpAutonomo': 'Informa el ingreso declarado, no la facturación total.',
    'renda.tipAutonomo': '<strong>Independiente o empresa:</strong> usa el valor declarado en el 確定申告. La facturación es todo lo que entró; los gastos son los costos del trabajo; el ingreso declarado es lo que queda después de los gastos — ese es el número que el banco analiza.',
    'renda.helpAssalariado': 'Si puedes, usa el valor de tu último 源泉徴収票.',
    'renda.tipAssalariado': '<strong>Consejo:</strong> el 源泉徴収票 es el comprobante que la empresa entrega a fin de año. Usa el valor bruto anual, incluyendo bonos.',

    'q.tempoEmpresa': '¿Hace cuánto tiempo trabajas en la empresa actual?',
    'q.tempoEmpreiteira': '¿Hace cuánto tiempo trabajas por empresa contratista?',

    'variante.headlineB': 'Mira qué casas pueden caber en la cuota que deseas pagar',
    'variante.sublineB': 'Responde algunas preguntas simples y recibe una estimación del rango de vivienda compatible con tu perfil.',

    'consent.marketing': 'Acepto recibir novedades y nuevas propiedades',

    'wa.abertura': '¡Hola! Hice la simulación en el sitio de Easy House.',
    'wa.aberturaTopo': '¡Hola! Estoy en el simulador de Easy House.',
    'wa.codigo': 'Mi código es {codigo}.',
    'wa.cidades': 'Me interesan viviendas en {cidades}.',
    'wa.fechoPreliminary': 'Ya vi mi rango de compra aproximado y me gustaría conversar sobre las opciones.',
    'wa.fechoLead': 'Prefiero seguir por aquí, si es posible.',
    'wa.fechoResult': 'Me gustaría confirmar mi preanálisis.',
    'wa.fechoTopo': 'Prefiero hablar con una persona en vez de responder el simulador.',
    'wa.fechoPadrao': 'Me gustaría hablar con un asesor.',

    'imoveis.mensagem': 'Tenemos viviendas disponibles en la región; el asesor te presentará las opciones que se ajusten a tu caso.'
  }
};

/**
 * Frases que o motor devolve prontas.
 *
 * Chave = texto exato em português. Para as que trazem número interpolado, a
 * chave é uma expressão regular e o valor é uma função.
 */
const MOTOR_EXATO = {
  'Não foi possível estimar um prazo para esta idade dentro das regras configuradas.':
    'No fue posible estimar un plazo para esta edad dentro de las reglas configuradas.',

  'As regras de comprometimento de renda desta modalidade ainda não foram configuradas pela Easy House. A capacidade pela renda precisa de validação.':
    'Las reglas de compromiso de ingresos de esta modalidad todavía no fueron configuradas por la Easy House. La capacidad por ingresos necesita validación.',

  'A parcela que você deseja pagar está acima do cenário calculado com base na renda e nas parcelas atuais. Por segurança, utilizamos o menor valor na simulação.':
    'La cuota que deseas pagar está por encima del escenario calculado con base en los ingresos y las cuotas actuales. Por seguridad, usamos el valor menor en la simulación.',

  'Calculamos isso só com o valor da parcela que você quer pagar. Ainda não sabemos se isso cabe na sua renda e nas suas dívidas atuais.':
    'Calculamos esto solo con el valor de la cuota que quieres pagar. Todavía no sabemos si eso cabe en tus ingresos y en tus deudas actuales.',

  'Com as parcelas atuais informadas, o cenário calculado não deixa margem para a parcela da casa. Vale conversar sobre organizar as dívidas antes.':
    'Con las cuotas actuales informadas, el escenario calculado no deja margen para la cuota de la casa. Vale la pena conversar sobre organizar las deudas antes.',

  'Você informou parcelas atuais. Dependendo da composição das dívidas e da análise da instituição, pode existir a possibilidade de reunir alguns empréstimos ao financiamento da casa. Isso precisa ser analisado individualmente.':
    'Informaste que tienes cuotas actuales. Según la composición de las deudas y el análisis de la institución, puede existir la posibilidad de reunir algunos préstamos con el financiamiento de la casa. Esto necesita analizarse de forma individual.',

  'Simulação inicial de referência. Não representa aprovação de financiamento. Taxa, prazo, limite e enquadramento dependem da análise da instituição financeira.':
    'Simulación inicial de referencia. No representa una aprobación de financiamiento. La tasa, el plazo, el límite y la modalidad dependen del análisis de la institución financiera.',

  'Diferença entre seu aluguel atual e o custo mensal total estimado':
    'Diferencia entre tu alquiler actual y el costo mensual total estimado',

  'Diferença entre seu aluguel atual e a parcela estimada':
    'Diferencia entre tu alquiler actual y la cuota estimada',

  // Rótulos vindos de financing-config.json
  'Cenário bancário': 'Escenario bancario',
  'Análise conjunta de dívidas': 'Análisis conjunto de deudas',
  'Flat 35': 'Flat 35',
  '2,9% ao ano (taxa fixa de referência)': '2,9% anual (tasa fija de referencia)',
  '1,4% ao ano (taxa de referência)': '1,4% anual (tasa de referencia)'
};

/**
 * Mensagens que o servidor devolve prontas, em português.
 *
 * `api/lead.mjs` responde igual para as duas páginas — ele não sabe (nem
 * precisa saber) de onde a pessoa veio. Quem traduz é quem mostra.
 */
const SERVIDOR_EXATO = {
  'Falha no envio': 'Error al enviar',
  'Método não permitido': 'Método no permitido',
  'Muitas tentativas. Aguarde um minuto.': 'Demasiados intentos. Espera un minuto.',
  'Muitas requisições. Tente novamente em instantes.': 'Demasiadas solicitudes. Inténtalo de nuevo en unos instantes.',
  'Corpo inválido': 'Solicitud inválida',
  'Dados incompletos': 'Faltan datos',
  'Não foi possível calcular agora.': 'No fue posible calcular ahora.',
  'Não foi possível registrar agora. Fale conosco pelo WhatsApp.':
    'No fue posible registrar ahora. Habla con nosotros por WhatsApp.'
};

const MOTOR_PADRAO = [
  {
    re: /^O prazo estimado \((\d+) anos\) está abaixo do mínimo configurado para esta modalidade\. O caso precisa de análise personalizada\.$/,
    es: m => `El plazo estimado (${m[1]} años) está por debajo del mínimo configurado para esta modalidad. El caso necesita un análisis personalizado.`
  },
  {
    re: /^Esta simulação considerou (\d+)% da segunda renda\. A instituição financeira poderá utilizar outro percentual após analisar os documentos\.$/,
    es: m => `Esta simulación consideró ${m[1]}% del segundo ingreso. La institución financiera podrá usar otro porcentaje después de analizar los documentos.`
  }
];

function detectar() {
  if (typeof document === 'undefined') return 'pt-BR';
  const l = (document.documentElement.lang || 'pt-BR').toLowerCase();
  return l.startsWith('es') ? 'es' : 'pt-BR';
}

export const LANG = detectar();

function interpolar(texto, vars) {
  if (!vars) return texto;
  return texto.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : ''));
}

/** Texto da interface. Sem tradução, cai no português — nunca fica vazio. */
export function t(chave, vars) {
  const texto = DICT[LANG]?.[chave] ?? DICT['pt-BR'][chave];
  if (texto == null) {
    console.warn('i18n: chave sem texto:', chave);
    return chave;
  }
  return interpolar(texto, vars);
}

/** Frase que já chega pronta em português — do motor financeiro ou do servidor. */
export function tm(frase) {
  if (LANG === 'pt-BR' || !frase) return frase;
  const exata = MOTOR_EXATO[frase] || SERVIDOR_EXATO[frase];
  if (exata) return exata;
  for (const p of MOTOR_PADRAO) {
    const m = p.re.exec(frase);
    if (m) return p.es(m);
  }
  console.warn('i18n: frase do motor sem tradução:', frase);
  return frase;
}

/** Usado pelo teste para checar cobertura sem depender do navegador. */
export const _interno = { DICT, MOTOR_EXATO, MOTOR_PADRAO, SERVIDOR_EXATO };
