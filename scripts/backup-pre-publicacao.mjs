// Cópias consistentes compactadas. A candidata só inicia após verificar todas as cópias persistidas.
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, mkdtempSync, statSync, statfsSync, copyFileSync, rmSync, readFileSync, writeFileSync, createReadStream, createWriteStream, readdirSync, lstatSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { createGzip, createGunzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';

const RESERVA = 16 * 1024 * 1024;
async function sha256(arquivo) {
  const h = createHash('sha256');
  for await (const bloco of createReadStream(arquivo)) h.update(bloco);
  return h.digest('hex');
}
function conferir(arquivo) {
  const db = new DatabaseSync(arquivo, { readOnly: true });
  try { if (db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw new Error('Cópia não íntegra'); }
  finally { db.close(); }
}
// Retém a publicação atual e a anterior mais recente. Só conjuntos completos
// reconhecidos são elegíveis; holds, links e arquivos desconhecidos são preservados.
export async function limparPublicacoes(pasta, { atual, manter = 2, aplicar = true } = {}) {
  if (!Number.isInteger(manter) || manter < 2 || manter > 10) throw new Error('Retenção de publicações inválida');
  const raiz = resolve(pasta), conjuntos = [], alertas = [];
  if (!existsSync(raiz) || lstatSync(raiz).isSymbolicLink()) return { removidos: 0, bytes: 0, alertas: ['pasta ausente ou simbólica'] };
  for (const nome of readdirSync(raiz)) {
    const dir = join(raiz, nome);
    try {
      if (!/^[a-f0-9]{40}$/.test(nome) || !lstatSync(dir).isDirectory() || lstatSync(dir).isSymbolicLink() || existsSync(join(dir, 'HOLD.json'))) throw new Error();
      const nomes = readdirSync(dir), manifesto = join(dir, 'manifesto.json');
      if (lstatSync(manifesto).isSymbolicLink()) throw new Error();
      const texto = readFileSync(manifesto, 'utf8'), m = JSON.parse(texto);
      if (m.publicacao !== nome || m.formato !== 'sqlite.gz' || !Array.isArray(m.copias) || !m.copias.length) throw new Error();
      const esperados = new Set(['manifesto.json', ...m.copias.map(c => c.copia)]);
      if (esperados.size !== m.copias.length + 1 || nomes.length !== esperados.size || nomes.some(n => !esperados.has(n))) throw new Error();
      let bytes = statSync(manifesto).size;
      for (const c of m.copias) {
        if (!/^banco-\d+\.sqlite\.gz$/.test(c.copia) || !/^[a-f0-9]{64}$/.test(c.sha256)) throw new Error();
        const arquivo = join(dir, c.copia), st = lstatSync(arquivo);
        if (!st.isFile() || st.isSymbolicLink() || st.size !== c.bytes || await sha256(arquivo) !== c.sha256) throw new Error();
        bytes += st.size;
      }
      conjuntos.push({ nome, dir, bytes, texto, em: statSync(dir).mtimeMs });
    } catch { alertas.push(nome); }
  }
  // Não descarta nada se a cópia protegida não tiver sido integralmente validada.
  if (!conjuntos.some(c => c.nome === atual)) return { removidos: 0, bytes: 0, alertas: [...alertas, 'publicação atual não validada'] };
  conjuntos.sort((a, b) => b.em - a.em || a.nome.localeCompare(b.nome));
  const protegidos = new Set([atual, ...conjuntos.filter(c => c.nome !== atual).slice(0, manter - 1).map(c => c.nome)]);
  let removidos = 0, bytes = 0;
  for (const c of conjuntos.filter(c => !protegidos.has(c.nome))) {
    // Reconfere identidade e hold imediatamente antes de remover o conjunto.
    if (lstatSync(c.dir).isSymbolicLink() || existsSync(join(c.dir, 'HOLD.json')) || readFileSync(join(c.dir, 'manifesto.json'), 'utf8') !== c.texto) { alertas.push(c.nome); continue; }
    if (aplicar) rmSync(c.dir, { recursive: true });
    removidos++; bytes += c.bytes;
  }
  return { removidos, bytes, alertas, aplicar };
}
async function reterPublicacoes(raiz, publicacao, env) {
  if (!publicacao) return;
  const r = await limparPublicacoes(join(raiz, 'backups-publicacao'), { atual: publicacao, manter: Number(env.BACKUP_PUBLICACOES_MANTER || 2) });
  console.log('BACKUP_PUBLICACOES_RETENCAO', JSON.stringify({ removidos: r.removidos, bytes: r.bytes, alertas: r.alertas.length }));
}
export async function backupPrePublicacao(env = process.env, { espaco = statfsSync, temporarios = tmpdir() } = {}) {
  const plataforma = resolve(env.BANCO_PLATAFORMA || '/app/dados/plataforma.sqlite');
  if (!existsSync(plataforma)) throw new Error('Banco da plataforma ausente; publicação controlada interrompida');
  const raiz = dirname(plataforma), bancos = new Set([plataforma]);
  const p = new DatabaseSync(plataforma, { readOnly: true });
  try { for (const c of p.prepare('SELECT banco FROM companies').all()) {
    const arquivo = resolve(c.banco), rel = relative(raiz, arquivo);
    if (rel.startsWith('..') || !existsSync(arquivo)) throw new Error('Banco de empresa fora da pasta ou indisponível');
    bancos.add(arquivo);
  } } finally { p.close(); }
  const legado = resolve(env.BANCO || '/app/dados/greenia.sqlite'); if (existsSync(legado)) bancos.add(legado);
  const publicacao = /^[a-f0-9]{40}$/.test(env.RENDER_GIT_COMMIT || '') ? env.RENDER_GIT_COMMIT : null;
  const fixo = publicacao ? join(raiz, 'backups-publicacao', publicacao) : null;
  if (fixo && existsSync(fixo)) {
    // Snapshot anterior à primeira inicialização desta versão, não um novo backup diário.
    const m = JSON.parse(readFileSync(join(fixo, 'manifesto.json'), 'utf8'));
    if (m.publicacao !== publicacao || m.formato !== 'sqlite.gz' || m.copias.length !== bancos.size ||
        new Set(m.copias.map(c => c.origem)).size !== bancos.size) throw new Error('Manifesto anterior inválido');
    for (const c of m.copias) {
      if (!bancos.has(c.origem) || !/^banco-\d+\.sqlite\.gz$/.test(c.copia) || await sha256(join(fixo, c.copia)) !== c.sha256) throw new Error('Backup anterior divergente');
    }
    await reterPublicacoes(raiz, publicacao, env);
    console.log('BACKUP_PRE_PUBLICACAO_REUTILIZADO', m.copias.length, 'bancos', fixo);
    return { destino: fixo, copias: m.copias, reutilizado: true };
  }
  const livre = pasta => { const fs = espaco(pasta); return fs.bavail * fs.bsize; };
  const trabalho = mkdtempSync(join(temporarios, 'greenia-backup-publicacao-'));
  let destino, concluido = false;
  try {
    const copias = [];
    for (const arquivo of bancos) {
      const tamanho = statSync(arquivo).size + (existsSync(arquivo + '-wal') ? statSync(arquivo + '-wal').size : 0);
      if (livre(trabalho) < tamanho * 2 + RESERVA) throw new Error('Espaço temporário insuficiente para verificar a cópia pré-publicação');
      const nome = `banco-${copias.length}.sqlite.gz`, bruto = join(trabalho, 'copia.sqlite'), gz = join(trabalho, nome);
      const db = new DatabaseSync(arquivo, { readOnly: true });
      try { db.prepare('VACUUM INTO ?').run(bruto); } finally { db.close(); }
      conferir(bruto);
      const sha256Banco = await sha256(bruto);
      await pipeline(createReadStream(bruto), createGzip({ level: 9 }), createWriteStream(gz, { flags: 'wx', mode: 0o600 }));
      rmSync(bruto);
      await pipeline(createReadStream(gz), createGunzip(), createWriteStream(bruto, { flags: 'wx', mode: 0o600 }));
      if (await sha256(bruto) !== sha256Banco) throw new Error('Compactação não preservou o banco');
      conferir(bruto);
      rmSync(bruto);
      copias.push({ origem: arquivo, copia: nome, formato: 'sqlite.gz', bytes: statSync(gz).size, sha256: await sha256(gz), sha256Banco });
    }
    const necessarios = copias.reduce((s, c) => s + c.bytes, 0), disponiveis = livre(raiz);
    if (disponiveis < necessarios + RESERVA) throw new Error(`Espaço persistente insuficiente: disponíveis=${disponiveis}, cópias compactadas=${necessarios}, reserva=${RESERVA}`);
    const novo = fixo || join(raiz, 'backups-publicacao', new Date().toISOString().replace(/[:.]/g, '-') + '-' + process.pid);
    mkdirSync(dirname(novo), { recursive: true, mode: 0o700 });
    mkdirSync(novo, { mode: 0o700 });
    destino = novo;
    for (const c of copias) {
      copyFileSync(join(trabalho, c.copia), join(destino, c.copia));
      if (await sha256(join(destino, c.copia)) !== c.sha256) throw new Error('Cópia persistida divergente');
    }
    writeFileSync(join(destino, 'manifesto.json'), JSON.stringify({ publicacao, anterior: '3cbef4b9b78292edfec62dbfb7b1b333b1675a74', formato: 'sqlite.gz', reservaBytes: RESERVA, copias }, null, 2), { mode: 0o600, flag: 'wx' });
    concluido = true;
    await reterPublicacoes(raiz, publicacao, env);
    console.log('BACKUP_PRE_PUBLICACAO_OK', copias.length, 'bancos', necessarios, 'bytes compactados', destino);
    return { destino, copias };
  } finally {
    // Remove apenas arquivos desta tentativa incompleta; nunca backups anteriores ou bancos originais.
    if (destino && !concluido) rmSync(destino, { recursive: true, force: true });
    rmSync(trabalho, { recursive: true, force: true });
  }
}
if (process.argv[1] && import.meta.url === new URL('file://' + resolve(process.argv[1])).href) await backupPrePublicacao();
