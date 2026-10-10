// Segredos guardados no banco da plataforma (hoje, a chave do OpenRouter informada no console),
// cifrados com AES-256-GCM. A chave-mestra vem de CHAVE_MESTRA; sem ela, é gerada uma vez num
// arquivo ao lado do banco (fora dos backups do banco), com permissão só do dono.
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

export function chaveMestra({ env = process.env, pasta = 'dados' } = {}) {
  if (env.CHAVE_MESTRA) return createHash('sha256').update(env.CHAVE_MESTRA).digest();
  const arquivo = join(pasta, '.chave-mestra');
  if (!existsSync(arquivo)) { mkdirSync(dirname(arquivo), { recursive: true }); writeFileSync(arquivo, randomBytes(32).toString('base64'), { mode: 0o600 }); }
  return Buffer.from(readFileSync(arquivo, 'utf8').trim(), 'base64');
}

export function cifrar(mestra, texto) {
  const iv = randomBytes(12), c = createCipheriv('aes-256-gcm', mestra, iv);
  const dados = Buffer.concat([c.update(String(texto), 'utf8'), c.final()]);
  return { v: 1, iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), dados: dados.toString('base64') };
}

export function decifrar(mestra, s) {
  if (!s?.dados) return null;
  try {
    const d = createDecipheriv('aes-256-gcm', mestra, Buffer.from(s.iv, 'base64'));
    d.setAuthTag(Buffer.from(s.tag, 'base64'));
    return Buffer.concat([d.update(Buffer.from(s.dados, 'base64')), d.final()]).toString('utf8');
  } catch { return null; }   // chave-mestra trocada ou dado corrompido: o segredo precisa ser informado de novo
}

// Para mostrar na tela: começo reconhecível e os 4 últimos caracteres, nunca a chave.
export const mascarar = chave => (chave ? `${String(chave).slice(0, String(chave).startsWith('sk-or-v1-') ? 9 : 5)}…${String(chave).slice(-4)}` : null);
