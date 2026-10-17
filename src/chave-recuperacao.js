// Recuperação da chave-mestra (a que cifra a chave do OpenRouter salva no console e os segredos dos conectores).
//
// A chave-mestra NUNCA vai em claro para um backup, um log ou uma auditoria. O que existe:
// - Impressão digital: HMAC-SHA256 da chave com um rótulo fixo (não revela a chave). Fica no banco da plataforma e,
//   portanto, em todo backup dele. Na restauração, a chave informada é conferida por ela.
// - Envelope selado (opcional): a chave cifrada com AES-256-GCM sob uma chave derivada (scrypt) de
//   BACKUP_ENVELOPE_SEGREDO, um segredo separado da chave-mestra e de BACKUP_CHAVE_CIFRA, guardado fora do servidor
//   (cofre de senhas de quem opera). Sem esse segredo, o envelope não abre.
// Caminhos de recuperação: (1) CHAVE_MESTRA guardada no cofre e informada como variável no serviço novo;
// (2) arquivo .chave-mestra restaurado de um snapshot do disco; (3) envelope + BACKUP_ENVELOPE_SEGREDO.
// Em todos, a impressão digital precisa conferir com a do banco da plataforma restaurado.
import { createCipheriv, createDecipheriv, createHmac, randomBytes, scryptSync } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';

export const ROTULO = 'greenia/impressao-chave-mestra/v1';
export const impressaoMestra = mestra => 'cm1-' + createHmac('sha256', mestra).update(ROTULO).digest('hex').slice(0, 24);

const SCRYPT = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const FORMATO = 'greenia-chave-mestra-v1';

export function segredoEnvelopeDe(env = {}) {
  const s = String(env.BACKUP_ENVELOPE_SEGREDO || '');
  if (!s) return null;
  if (s.length < 32) throw Object.assign(new Error('BACKUP_ENVELOPE_SEGREDO precisa de pelo menos 32 caracteres.'), { code: 'ENVELOPE_SEGREDO_CURTO' });
  if (env.CHAVE_MESTRA && s === env.CHAVE_MESTRA) throw Object.assign(new Error('BACKUP_ENVELOPE_SEGREDO precisa ser diferente de CHAVE_MESTRA.'), { code: 'ENVELOPE_SEGREDO_IGUAL' });
  if (env.BACKUP_CHAVE_CIFRA && s === env.BACKUP_CHAVE_CIFRA) throw Object.assign(new Error('BACKUP_ENVELOPE_SEGREDO precisa ser diferente de BACKUP_CHAVE_CIFRA.'), { code: 'ENVELOPE_SEGREDO_IGUAL' });
  return s;
}

export function selarChaveMestra(mestra, segredo, { agora = new Date() } = {}) {
  if (!Buffer.isBuffer(mestra) || mestra.length !== 32) throw new Error('chave-mestra inválida');
  const sal = randomBytes(16), iv = randomBytes(12), impressao = impressaoMestra(mestra);
  const k = scryptSync(segredo, sal, 32, SCRYPT);
  const c = createCipheriv('aes-256-gcm', k, iv);
  c.setAAD(Buffer.from(`${FORMATO}:${impressao}`));
  const dados = Buffer.concat([c.update(mestra), c.final()]);
  return { formato: FORMATO, kdf: 'scrypt', N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, sal: sal.toString('base64'), iv: iv.toString('base64'),
    tag: c.getAuthTag().toString('base64'), dados: dados.toString('base64'), impressao, criado_em: agora.toISOString() };
}

export function abrirEnvelope(env, segredo) {
  const e = typeof env === 'string' ? JSON.parse(env) : env;
  if (e?.formato !== FORMATO || e.kdf !== 'scrypt') throw Object.assign(new Error('Envelope de chave-mestra em formato desconhecido.'), { code: 'ENVELOPE_FORMATO' });
  let mestra;
  try {
    const k = scryptSync(segredo, Buffer.from(e.sal, 'base64'), 32, { N: e.N, r: e.r, p: e.p, maxmem: SCRYPT.maxmem });
    const d = createDecipheriv('aes-256-gcm', k, Buffer.from(e.iv, 'base64'));
    d.setAAD(Buffer.from(`${FORMATO}:${e.impressao}`));
    d.setAuthTag(Buffer.from(e.tag, 'base64'));
    mestra = Buffer.concat([d.update(Buffer.from(e.dados, 'base64')), d.final()]);
  } catch { throw Object.assign(new Error('O envelope não abriu: BACKUP_ENVELOPE_SEGREDO diferente ou envelope alterado.'), { code: 'ENVELOPE_SEGREDO' }); }
  if (impressaoMestra(mestra) !== e.impressao) throw Object.assign(new Error('A chave do envelope não confere com a impressão digital dele.'), { code: 'ENVELOPE_IMPRESSAO' });
  return mestra;
}

// A chave como a aplicação a usa (mesma regra de src/plataforma/segredo.js), sem criar arquivo novo.
export function lerChaveMestraExistente({ env = {}, arquivo = null } = {}) {
  if (env.CHAVE_MESTRA) return createHash('sha256').update(env.CHAVE_MESTRA).digest();
  if (arquivo && existsSync(arquivo)) return Buffer.from(readFileSync(arquivo, 'utf8').trim(), 'base64');
  return null;
}

// Grava a chave recuperada como arquivo .chave-mestra (permissão só do dono). Nunca imprime a chave.
export function gravarChaveMestra(arquivo, mestra) {
  if (existsSync(arquivo)) throw Object.assign(new Error(`Já existe ${arquivo}: não é sobrescrito.`), { code: 'CHAVE_EXISTE' });
  mkdirSync(dirname(arquivo), { recursive: true });
  writeFileSync(arquivo, mestra.toString('base64'), { mode: 0o600, flag: 'wx' });
}
