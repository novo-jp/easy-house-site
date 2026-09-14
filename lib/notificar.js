/**
 * Aviso de lead novo por e-mail.
 *
 * Existe porque o funil fazia tudo certo — capturava, gravava, pontuava — e
 * ninguém era avisado. Um lead de prioridade 90 ficou 4 dias sem resposta
 * porque só apareceria para quem abrisse o Supabase por conta própria.
 *
 * Requer as variáveis de ambiente:
 *   RESEND_API_KEY     chave da conta Resend
 *   LEAD_NOTIFY_TO     para quem enviar (pode ser mais de um, separado por vírgula)
 *   LEAD_NOTIFY_FROM   opcional; sem domínio verificado use o padrão abaixo
 *
 * Sem elas não faz nada e devolve { enviado: false }. O lead continua sendo
 * gravado normalmente — o aviso nunca pode derrubar o atendimento.
 *
 * ---
 * O QUE VAI NO E-MAIL
 *
 * Tudo que o cliente preencheu: contato, cidades, prazo, e também renda,
 * dívidas, entrada, situação de residência e a faixa de imóvel calculada.
 *
 * Até 14/09/2026 os dados financeiros ficavam de fora e o corretor tinha
 * que abrir o Supabase pelo código. Na prática isso atrasava a resposta —
 * o e-mail é lido no celular, o banco não. A Easy House decidiu incluir
 * tudo, e a política de privacidade (/privacy) foi atualizada no mesmo
 * commit para dizer exatamente isso ao cliente. O e-mail vai só para a
 * própria equipe (LEAD_NOTIFY_TO); o Resend é o transportador.
 */

const RESEND_URL = 'https://api.resend.com/emails';
const REMETENTE_PADRAO = 'Easy House <onboarding@resend.dev>';

/** Telefone em E.164 vira link de conversa direta. */
function linkWhatsApp(telefone, nome) {
  const numero = String(telefone || '').replace(/\D/g, '');
  if (!numero) return null;
  const texto = `Olá${nome ? ' ' + nome : ''}! Aqui é da Easy House. Recebi sua simulação pelo site e queria te ajudar com os próximos passos.`;
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}

const PRAZOS = {
  asap: 'O quanto antes',
  '3m': 'Nos próximos 3 meses',
  '6m': 'Nos próximos 6 meses',
  '12m': 'Dentro de 1 ano',
  pesquisando: 'Só pesquisando'
};

const RESIDENCIA = {
  japanese: 'Cidadão japonês',
  permanent_resident: 'Residente permanente (永住者)',
  special_permanent_resident: 'Residente permanente especial (特別永住者)',
  spouse_of_japanese: 'Cônjuge de japonês (日本人の配偶者等)',
  long_term_resident: 'Longa permanência (定住者)',
  work_visa: 'Visto de trabalho',
  other: 'Outro',
  unknown: 'Não soube informar'
};

const EMPREGO = {
  seishain: 'Funcionário efetivo (正社員)',
  empreiteira: 'Empreiteira (派遣・請負)',
  autonomo: 'Autônomo (個人事業主)',
  empresario: 'Dono de empresa (法人代表)',
  temporario: 'Temporário / meio período (アルバイト・パート)',
  outro: 'Outro'
};

const TEMPO_EMPREGO = {
  lt1: 'Menos de 1 ano',
  '1to3': 'De 1 a 3 anos',
  gte3: '3 anos ou mais'
};

const yen = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? '¥' + Math.round(n).toLocaleString('ja-JP') : null;
};

function montarHtml({ lead, answers, source, result }) {
  const wa = linkWhatsApp(lead.phone, lead.first_name);
  const cidades = Array.isArray(lead.cities) && lead.cities.length ? lead.cities.join(', ') : '—';
  const prazo = PRAZOS[answers?.purchaseTiming] || '—';
  const campanha = source?.utm_campaign || 'orgânico / direto';

  const linha = (rotulo, valor) => `
    <tr>
      <td style="padding:8px 0;color:#5A6478;font-size:14px;width:150px">${rotulo}</td>
      <td style="padding:8px 0;color:#1B2434;font-size:15px;font-weight:600">${valor}</td>
    </tr>`;

  return `<!doctype html><html><body style="margin:0;background:#F4F7FB;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:24px 20px">
    <p style="margin:0 0 4px;color:#46587F;font-size:12px;letter-spacing:.12em;text-transform:uppercase;font-weight:700">Easy House</p>
    <h1 style="margin:0 0 4px;color:#12224A;font-size:22px">Lead novo: ${lead.first_name || 'sem nome'}</h1>
    <p style="margin:0 0 20px;color:#5A6478;font-size:14px">Prioridade ${lead.internal_score} de 100 · código ${lead.code}</p>

    ${wa ? `<a href="${wa}" style="display:block;background:#25D366;color:#fff;text-decoration:none;text-align:center;padding:16px;border-radius:999px;font-size:16px;font-weight:700;margin-bottom:8px">Responder no WhatsApp agora</a>
    <p style="margin:0 0 22px;text-align:center;color:#5A6478;font-size:13px">Abre a conversa já com a mensagem pronta.</p>` : ''}

    <table style="width:100%;border-collapse:collapse;background:#fff;border-radius:10px;padding:8px 16px" cellpadding="0" cellspacing="0">
      <tr><td colspan="2" style="padding:14px 16px 4px"><table style="width:100%;border-collapse:collapse">
        ${linha('Telefone', lead.phone || '—')}
        ${linha('E-mail', lead.email || '—')}
        ${linha('Idioma', lead.language || 'pt-BR')}
        ${linha('Melhor horário', lead.preferred_time || 'Tanto faz')}
        ${linha('Cidades', cidades)}
        ${linha('Quando pretende comprar', prazo)}
        ${linha('Veio de', campanha)}
      </table></td></tr>
    </table>

    ${blocoFinanceiro(answers, result)}

    <p style="margin:22px 0 0;color:#5A6478;font-size:13px;line-height:1.6">
      Registro completo no Supabase pelo código <strong>${lead.code}</strong>.
    </p>
    <p style="margin:16px 0 0;color:#8A93A6;font-size:12px">
      EASY HOUSE — 株式会社movO · 沖縄県知事(1)第5984号
    </p>
  </div></body></html>`;
}

/** Segunda tabela: o que o cliente informou sobre a própria situação. */
function blocoFinanceiro(answers = {}, result = null) {
  const linha = (rotulo, valor) => valor ? `
      <tr>
        <td style="padding:8px 0;color:#5A6478;font-size:14px;width:150px">${rotulo}</td>
        <td style="padding:8px 0;color:#1B2434;font-size:15px;font-weight:600">${valor}</td>
      </tr>` : '';

  const faixa = result?.propertyRange;
  const faixaTexto = faixa?.min && faixa?.max
    ? `${yen(faixa.min)} a ${yen(faixa.max)}${faixa.center ? ` (centro ${yen(faixa.center)})` : ''}`
    : null;
  const parcela = result?.payment?.used ? `${yen(result.payment.used)}/mês` : null;
  const tempoEmprego = TEMPO_EMPREGO[answers.employmentYears] || answers.employmentYears || null;

  const linhas = [
    linha('Renda anual', yen(answers.annualIncome)),
    linha('Segunda renda (cônjuge)', yen(answers.secondIncome)),
    linha('Dívidas por mês', answers.monthlyDebtPayments != null ? (yen(answers.monthlyDebtPayments) || '¥0') : null),
    linha('Entrada disponível', answers.downPayment != null ? (yen(answers.downPayment) || 'Sem entrada') : null),
    linha('Parcela que quer pagar', yen(answers.desiredMonthlyPayment)),
    linha('Situação de residência', RESIDENCIA[answers.residency] || answers.residency),
    linha('Tipo de emprego', EMPREGO[answers.employmentType] || answers.employmentType),
    linha('Tempo no emprego', tempoEmprego),
    linha('Idade', answers.age ? `${answers.age} anos` : null),
    linha('Faixa de imóvel calculada', faixaTexto),
    linha('Parcela estimada', parcela)
  ].filter(Boolean).join('');

  if (!linhas) return '';
  return `
      <p style="margin:22px 0 6px;color:#46587F;font-size:12px;letter-spacing:.12em;text-transform:uppercase;font-weight:700">Situação financeira informada</p>
      <table style="width:100%;border-collapse:collapse;background:#fff;border-radius:10px;padding:8px 16px" cellpadding="0" cellspacing="0">
        <tr><td colspan="2" style="padding:14px 16px 4px"><table style="width:100%;border-collapse:collapse">
          ${linhas}
        </table></td></tr>
      </table>`;
}

/**
 * @returns {Promise<{enviado: boolean, motivo?: string}>}
 */
export async function avisarLeadNovo({ lead, answers, source, result }) {
  const chave = process.env.RESEND_API_KEY;
  const para = process.env.LEAD_NOTIFY_TO;
  if (!chave || !para) return { enviado: false, motivo: 'nao_configurado' };

  const destinatarios = para.split(',').map(e => e.trim()).filter(Boolean);
  if (!destinatarios.length) return { enviado: false, motivo: 'sem_destinatario' };

  try {
    const resp = await fetch(RESEND_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.LEAD_NOTIFY_FROM || REMETENTE_PADRAO,
        to: destinatarios,
        subject: `Lead novo — ${lead.first_name || 'sem nome'} (${lead.code})`,
        html: montarHtml({ lead, answers, source, result })
      })
    });
    if (!resp.ok) {
      console.error('notificar: resposta', resp.status);   // sem corpo: pode ecoar a chave
      return { enviado: false, motivo: 'erro_' + resp.status };
    }
    return { enviado: true };
  } catch {
    console.error('notificar: falha de rede');
    return { enviado: false, motivo: 'rede' };
  }
}

/* ------------------------------------------------------------------------- *
 * Raio-X concluído
 *
 * Chega sem nome e sem telefone, de propósito: o Raio-X não pede contato, e a
 * pessoa é quem decide abrir a conversa. O que este aviso faz é garantir que,
 * quando a mensagem dela chegar no WhatsApp, o consultor já saiba de qual caso
 * se trata em vez de recomeçar as perguntas.
 *
 * Vale a mesma regra do aviso de lead: renda, dívidas, entrada e situação de
 * residência **não** entram no e-mail. Ele atravessa um serviço de terceiro, e
 * /privacy promete que dado financeiro não é compartilhado. Esses campos ficam
 * no banco, acessíveis pelo código.
 * ------------------------------------------------------------------------- */

const RAIOX_ROTULOS = {
  momento: {
    rotulo: 'Momento',
    valores: {
      pesquisando: 'Só pesquisando', organizando: 'Organizando as finanças',
      procurando: 'Procurando imóvel', escolhi: 'Já escolheu um imóvel',
      ja_tentei: 'Já tentou financiamento'
    }
  },
  prazo: {
    rotulo: 'Quando pretende comprar',
    valores: {
      '0_3': 'Nos próximos 3 meses', '4_6': 'Em 4 a 6 meses', '7_12': 'Em 7 a 12 meses',
      '13_24': 'Em 1 a 2 anos', mais_24: 'Daqui a mais de 2 anos', nao_sei: 'Não sabe'
    }
  },
  regiao: {
    rotulo: 'Região',
    valores: {
      aichi: 'Aichi', shizuoka: 'Shizuoka', gunma: 'Gunma', mie: 'Mie',
      gifu: 'Gifu', outra: 'Outra província', nao_sei: 'Não sabe'
    }
  },
  tipo_imovel: {
    rotulo: 'Tipo de imóvel',
    valores: { nova: 'Casa nova', usada: 'Casa usada', indiferente: 'Tanto faz', nao_sei: 'Não sabe' }
  },
  documentos: {
    rotulo: 'Documentos que já localiza',
    valores: {
      gensen: 'Gensen / declaração', imposto: 'Comprovantes de imposto',
      emprego: 'Comprovante de emprego', residencia_doc: 'Comprovante de residência',
      nenhum: 'Nenhum por enquanto', nao_sei: 'Não sabe'
    }
  },
  idioma: {
    rotulo: 'Idioma no atendimento',
    valores: {
      pt: 'Tudo em português', pt_jp: 'Português com termos em japonês',
      leio_jp: 'Lê em japonês', nao_sei: 'Ainda não sabe'
    }
  }
};

function traduzir(campo, valor) {
  const def = RAIOX_ROTULOS[campo];
  if (!def) return null;
  const traduz = (v) => def.valores[v] || String(v);
  const texto = Array.isArray(valor) ? valor.map(traduz).join(', ') : traduz(valor);
  return { rotulo: def.rotulo, texto };
}

/** Perguntas financeiras do Raio-X, com os rótulos que o cliente viu na tela. */
const RAIOX_FINANCEIRO = {
  residencia: {
    'rotulo': 'Situação de residência',
    valores: {
      'pr': 'Tenho residência permanente',
      'special_pr': 'Tenho residência permanente especial',
      'japones': 'Sou japonês ou japonesa',
      'conjuge_jp': 'Cônjuge de japonês ou de residente permanente',
      'long_term': 'Residente de longo prazo (定住者)',
      'trabalho': 'Visto de trabalho',
      'outro': 'Outra situação',
      'nao_sei': 'Não sabe',
      'nao_dizer': 'Preferiu não dizer',
    }
  },
  conjuge: {
    'rotulo': 'Cônjuge',
    valores: {
      'sim_japones': 'Sim, é japonês ou japonesa',
      'sim_pr': 'Sim, tem residência permanente',
      'nao': 'Não',
      'nao_aplica': 'Não se aplica',
      'nao_sei': 'Não sabe',
      'nao_dizer': 'Preferiu não dizer',
    }
  },
  trabalho: {
    'rotulo': 'Trabalho',
    valores: {
      'seishain': 'Assalariado efetivo (正社員)',
      'contrato': 'Contrato (契約社員)',
      'haken': 'Dispatch ou empreiteira (派遣)',
      'part_time': 'Meio período',
      'autonomo': 'Autônomo',
      'dono': 'Dono de empresa',
      'outro': 'Outro',
      'nao_sei': 'Não sabe',
      'nao_dizer': 'Preferiu não dizer',
    }
  },
  tempo_trabalho: {
    'rotulo': 'Tempo na atividade',
    valores: {
      'menos_6m': 'Menos de 6 meses',
      '6_12m': 'De 6 a 12 meses',
      '1_3a': 'De 1 a 3 anos',
      'mais_3a': '3 anos ou mais',
      'nao_sei': 'Não sabe',
      'nao_dizer': 'Preferiu não dizer',
    }
  },
  renda: {
    'rotulo': 'Renda anual (faixa)',
    valores: {
      'ate_3m': 'Menos de ¥3 milhões',
      '3_5m': '¥3 a ¥5 milhões',
      '5_7m': '¥5 a ¥7 milhões',
      'mais_7m': '¥7 milhões ou mais',
      'nao_sei': 'Não sabe',
      'nao_dizer': 'Preferiu não dizer',
    }
  },
  obrigacoes: {
    'rotulo': 'Parcelas por mês (faixa)',
    valores: {
      'nenhum': 'Nenhum',
      'ate_30k': 'Até ¥30.000',
      '30_60k': '¥30.000 a ¥60.000',
      '60_100k': '¥60.000 a ¥100.000',
      'mais_100k': '¥100.000 ou mais',
      'nao_sei': 'Não sabe',
      'nao_dizer': 'Preferiu não dizer',
    }
  },
  entrada: {
    'rotulo': 'Entrada disponível (faixa)',
    valores: {
      'nao_definido': 'Ainda não defini',
      'ate_1m': 'Menos de ¥1 milhão',
      '1_3m': '¥1 a ¥3 milhões',
      '3_5m': '¥3 a ¥5 milhões',
      'mais_5m': '¥5 milhões ou mais',
      'juntando': 'Ainda estou juntando',
      'nao_sei': 'Não sabe',
      'nao_dizer': 'Preferiu não dizer',
    }
  },
  analise_anterior: {
    'rotulo': 'Avaliação prévia (事前審査)',
    valores: {
      'nao': 'Ainda não',
      'aguardando': 'Sim, e estou aguardando',
      'nao_avancou': 'Sim, e não avançou',
      'nao_sei': 'Não sabe',
      'nao_dizer': 'Preferiu não dizer',
    }
  },
};

function montarHtmlRaioX({ codigo, resumo, prioridade, totalConfirmar, origem }) {
  const linha = (rotulo, valor) => `
    <tr>
      <td style="padding:8px 0;color:#5A6478;font-size:14px;width:190px">${rotulo}</td>
      <td style="padding:8px 0;color:#1B2434;font-size:15px;font-weight:600">${valor}</td>
    </tr>`;

  const linhas = Object.entries(resumo || {})
    .map(([campo, valor]) => traduzir(campo, valor))
    .filter(Boolean)
    .map(({ rotulo, texto }) => linha(rotulo, texto))
    .join('');

  const campanha = origem?.utm_campaign || 'orgânico / direto';
  const pagina = origem?.landing || '—';

  return `<!doctype html><html><body style="margin:0;background:#F4F7FB;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:24px 20px">
    <p style="margin:0 0 4px;color:#46587F;font-size:12px;letter-spacing:.12em;text-transform:uppercase;font-weight:700">Easy House</p>
    <h1 style="margin:0 0 4px;color:#12224A;font-size:22px">Raio-X concluído: ${codigo}</h1>
    <p style="margin:0 0 20px;color:#5A6478;font-size:14px">
      Prioridade ${prioridade} de 100 · ${totalConfirmar} ${totalConfirmar === 1 ? 'ponto' : 'pontos'} a confirmar
    </p>

    <p style="margin:0 0 18px;padding:14px 16px;background:#FFF6E5;border-radius:10px;color:#6B4E16;font-size:14px;line-height:1.6">
      Esta pessoa <strong>não deixou telefone</strong> — o Raio-X não pede contato.
      Se ela abrir o WhatsApp, vai mandar o código <strong>${codigo}</strong>.
      Busque por ele antes de responder e comece de onde ela parou.
    </p>

    <table style="width:100%;border-collapse:collapse;background:#fff;border-radius:10px" cellpadding="0" cellspacing="0">
      <tr><td style="padding:14px 16px 4px"><table style="width:100%;border-collapse:collapse">
        ${linhas || linha('Respostas', 'ver no painel')}
        ${linha('Página', pagina)}
        ${linha('Veio de', campanha)}
      </table></td></tr>
    </table>

    ${blocoFinanceiroRaioX(resumo)}

    <p style="margin:22px 0 0;color:#5A6478;font-size:13px;line-height:1.6">
      Registro completo na tabela <strong>raiox</strong> do Supabase pelo código <strong>${codigo}</strong>.
    </p>
    <p style="margin:16px 0 0;color:#8A93A6;font-size:12px">
      EASY HOUSE — 株式会社movO · 沖縄県知事(1)第5984号
    </p>
  </div></body></html>`;
}

/**
 * @returns {Promise<{enviado: boolean, motivo?: string}>}
 */
function blocoFinanceiroRaioX(resumo = {}) {
  const linha = (rotulo, valor) => valor ? `
      <tr>
        <td style="padding:8px 0;color:#5A6478;font-size:14px;width:150px">${rotulo}</td>
        <td style="padding:8px 0;color:#1B2434;font-size:15px;font-weight:600">${valor}</td>
      </tr>` : '';
  const linhas = Object.entries(RAIOX_FINANCEIRO).map(([campo, def]) => {
    const v = resumo[campo];
    if (v === undefined || v === null || v === '') return '';
    const lista = Array.isArray(v) ? v : [v];
    return linha(def.rotulo, lista.map((x) => def.valores[x] || x).join(', '));
  }).filter(Boolean).join('');
  if (!linhas) return '';
  return `
      <p style="margin:22px 0 6px;color:#46587F;font-size:12px;letter-spacing:.12em;text-transform:uppercase;font-weight:700">Situação informada</p>
      <table style="width:100%;border-collapse:collapse;background:#fff;border-radius:10px;padding:8px 16px" cellpadding="0" cellspacing="0">
        <tr><td colspan="2" style="padding:14px 16px 4px"><table style="width:100%;border-collapse:collapse">
          ${linhas}
        </table></td></tr>
      </table>`;
}

export async function avisarRaioXNovo({ codigo, resumo, prioridade, totalConfirmar, origem }) {
  const chave = process.env.RESEND_API_KEY;
  const para = process.env.LEAD_NOTIFY_TO;
  if (!chave || !para) return { enviado: false, motivo: 'nao_configurado' };

  const destinatarios = para.split(',').map(e => e.trim()).filter(Boolean);
  if (!destinatarios.length) return { enviado: false, motivo: 'sem_destinatario' };

  try {
    const resp = await fetch(RESEND_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.LEAD_NOTIFY_FROM || REMETENTE_PADRAO,
        to: destinatarios,
        subject: `Raio-X concluído — ${codigo} (prioridade ${prioridade})`,
        html: montarHtmlRaioX({ codigo, resumo, prioridade, totalConfirmar, origem })
      })
    });
    if (!resp.ok) {
      console.error('notificar raio-x: resposta', resp.status);
      return { enviado: false, motivo: 'erro_' + resp.status };
    }
    return { enviado: true };
  } catch {
    console.error('notificar raio-x: falha de rede');
    return { enviado: false, motivo: 'rede' };
  }
}
