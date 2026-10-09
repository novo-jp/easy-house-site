/**
 * Gera uma senha nova para um usuário do painel de acompanhamento.
 *
 *   node scripts/nova-senha-painel.mjs easyhouse
 *
 * Para clientes e corretores, o caminho normal é o próprio painel ("Nova
 * senha"). Este script existe para quando o administrador fica sem acesso e
 * não há outro admin para gerar a senha dele. A senha aparece UMA vez, só
 * neste terminal.
 */
import { readFileSync } from 'node:fs';

for (const linha of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const { sb, normalizarUsuario, gerarSenha, trocarSenhaAuth } = await import('../lib/painel-sessao.mjs');

const usuario = normalizarUsuario(process.argv[2]);
if (!usuario) {
  console.error('Uso: node scripts/nova-senha-painel.mjs <usuario>');
  process.exit(1);
}

const [perfil] = await sb(`acomp_usuario?select=user_id,nome,papel,ativo&usuario=eq.${usuario}`);
if (!perfil) {
  console.error(`Usuário "${usuario}" não existe no painel.`);
  process.exit(1);
}

const senha = gerarSenha();
await trocarSenhaAuth(perfil.user_id, senha);
await sb(`acomp_login_falha?usuario=eq.${usuario}`, { method: 'DELETE' });   // destrava, se estava travado
if (!perfil.ativo) await sb(`acomp_usuario?user_id=eq.${perfil.user_id}`, { method: 'PATCH', body: { ativo: true } });

console.log(`
Senha nova para ${perfil.nome} (${perfil.papel}).

  Endereço : https://easyhouse.homes/acompanhamento
  Usuário  : ${usuario}
  Senha    : ${senha}

A senha anterior deixou de funcionar. Troque esta em "Trocar senha" ao entrar.
`);
