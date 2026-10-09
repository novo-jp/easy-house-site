/**
 * Cria o PRIMEIRO administrador do painel de acompanhamento.
 *
 * Os demais (corretores, outros admins) são criados pelo próprio painel, na
 * aba Equipe. Este script existe só porque alguém precisa entrar primeiro.
 *
 *   node scripts/criar-admin-painel.mjs
 *
 * Lê SUPABASE_URL e SUPABASE_SERVICE_KEY do .env.local. A senha é gerada aqui
 * e aparece UMA vez neste terminal — troque-a no primeiro acesso.
 */
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';

for (const linha of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const { sb, normalizarUsuario, gerarSenha, criarContaAuth, apagarContaAuth } =
  await import('../lib/painel-sessao.mjs');

const rl = createInterface({ input: process.stdin, output: process.stdout });
const nome = (await rl.question('Seu nome (aparece para os clientes): ')).trim();
const usuario = normalizarUsuario(await rl.question('Usuário para entrar (ex.: kousuke): '));
const whatsapp = (await rl.question('WhatsApp (opcional, ex.: 818028867708): ')).trim();
rl.close();

if (!nome || !usuario) {
  console.error('\nNome e usuário são obrigatórios (usuário: 3–40 letras, números, ponto, hífen ou _).');
  process.exit(1);
}

const senha = gerarSenha();
let userId;
try {
  userId = await criarContaAuth(usuario, senha);
  await sb('acomp_usuario', {
    method: 'POST',
    body: { user_id: userId, usuario, nome, papel: 'admin', whatsapp: whatsapp || null },
  });
} catch (e) {
  if (userId) await apagarContaAuth(userId);
  console.error('\nNão foi possível criar:', e.message === 'usuario_existe' ? 'esse usuário já existe.' : e.message);
  process.exit(1);
}

console.log(`
Administrador criado.

  Endereço : https://easyhouse.homes/acompanhamento
  Usuário  : ${usuario}
  Senha    : ${senha}

Entre e troque a senha em "Trocar senha" (no alto da página).
`);
