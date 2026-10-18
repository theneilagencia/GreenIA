// Executar SOMENTE no Shell do serviço existente. Não inicializa a instalação de produção.
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, mkdirSync, rmSync, chmodSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { lerChaveMestraExistente } from '../src/chave-recuperacao.js';
import { decifrar } from '../src/plataforma/segredo.js';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const candidato = process.env.QA_COMMIT;
if (!/^[a-f0-9]{40}$/.test(candidato || '')) throw new Error('QA_COMMIT deve identificar a candidata imutável baixada para /tmp.');
if (raiz === '/app' || !raiz.startsWith('/tmp/')) throw new Error('Execute a cópia temporária da candidata em /tmp, nunca /app.');
const banco = resolve(process.env.BANCO_PLATAFORMA || '/app/dados/plataforma.sqlite');
let chave = null, db;
try {
  db = new DatabaseSync(banco, { readOnly: true });
  const r = db.prepare("select value from platform_settings where key = 'openrouter_chave'").get();
  if (r) {
    const mestra = lerChaveMestraExistente({ env: process.env, arquivo: join(dirname(banco), '.chave-mestra') });
    if (mestra) chave = decifrar(mestra, JSON.parse(r.value).cifrado);
    if (!chave) throw new Error('A chave configurada no console não pôde ser aberta. Nenhuma alteração foi feita.');
  } else chave = process.env.OPENROUTER_API_KEY || null;
} finally { db?.close(); }
if (!chave || !/^sk-[A-Za-z0-9_-]{20,200}$/.test(chave)) throw new Error('Nenhuma chave válida disponível no serviço. Não cole segredos no chat.');

const temporario = mkdtempSync(join(tmpdir(), 'greenia-qa-real-')); chmodSync(temporario, 0o700);
const saida = join(raiz, 'qa-candidato-saida'); mkdirSync(saida, { recursive: true, mode: 0o700 });
// Lista explícita: não herda banco, SMTP, agendamentos, integrações ou segredos do serviço.
const env = { PATH: process.env.PATH, LANG: 'C.UTF-8', TMPDIR: temporario, NODE_ENV: 'test', DESIGN_IA: '1',
  QA_KEY_FD: '3', QA_PARTES: 'homologacao', QA_COMMIT: candidato, QA_MAX_CHAMADAS: '180', QA_PARAR_CUSTO_USD: '2',
  CHROMIUM_PATH: process.env.CHROMIUM_PATH || '/usr/bin/chromium', RENDER_GIT_COMMIT: candidato };
if (process.env.QA_CASOS) {
  if (!/^[a-z0-9,-]+$/.test(process.env.QA_CASOS)) throw new Error('Seleção de casos inválida.');
  env.QA_CASOS = process.env.QA_CASOS;
}
let filho;
try {
  filho = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', join(raiz, 'scripts/qa-candidato.mjs')], {
    cwd: raiz, env, stdio: ['ignore', 'inherit', 'inherit', 'pipe'],
  });
  // Segredo só em memória e no banco temporário cifrado; nunca em argv, relatório ou arquivo de chave.
  filho.stdio[3].on('error', () => {}); filho.stdio[3].end(chave); chave = null;
  let forcar;
  const prazo = setTimeout(() => { filho.kill('SIGTERM'); forcar = setTimeout(() => filho.kill('SIGKILL'), 5000); }, 45 * 60 * 1000);
  const parar = () => filho.kill('SIGTERM');
  process.once('SIGINT', parar); process.once('SIGTERM', parar);
  try {
    const codigo = await new Promise((ok, falha) => { filho.once('error', falha); filho.once('exit', (c, sinal) => ok(sinal ? 2 : c)); });
    process.exitCode = codigo ?? 2;
  } finally { clearTimeout(prazo); clearTimeout(forcar); process.removeListener('SIGINT', parar); process.removeListener('SIGTERM', parar); }
} finally { chave = null; rmSync(temporario, { recursive: true, force: true }); }
console.log('Relatórios e materiais fictícios:', saida);
console.log('Não é uma liberação de produção. Custos pendentes e falhas exigem análise.');
