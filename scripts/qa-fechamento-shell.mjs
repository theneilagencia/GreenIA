// Somente no Shell existente. Não publica, não muda acesso, não grava nos bancos ativos.
// Testes: IA falsa e banco em memória; financeiro: banco da plataforma somente leitura + GET de recibos.
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, readdirSync, lstatSync, symlinkSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const CANDIDATA = '4117ee2b08ac33be26c65605f947274460b64811';
const REPO = 'https://raw.githubusercontent.com/theneilagencia/GreenIA';
const ARQUIVOS = {
  'test/producao-visual.test.js': '0553fd836fd760d70fbe4ed93131c67dc4da35ac70a483ded747f0132927010f',
  'test/ajuda.js': '7aa660c9a2c8e8930cf8f010fe848ceb0b0c4636c0b1b5b9705b0c9ed0089108',
  'test/openrouter-falso.js': 'b85f314af43473ad4b329190b848d40cfefefda3fed735b9c222905d8beb7f30',
  'test/zip-leitor.js': 'b1978aa3ab6a0198865700b8152ff6d1bc78f1bb11013a119698775d93f642df',
  'scripts/cliente.js': 'd4320c2e8f14b644f296b57311763f85026544874a8e37503abfcec356d5aa06',
  'scripts/qa-inventario-final.mjs': '40f0df97bd188b97b974f5226b3e3171da74b65904cb464f527f2c7883b273a4',
  'scripts/qa-consultar-recibo.mjs': '650b873d8beeb052484c743289e521cd16b5710cd50d5b66157e45f5ddba06eb',
};
const sha = b => createHash('sha256').update(b).digest('hex');
const guardar = (p, d) => writeFileSync(p, d, { flag: 'wx', mode: 0o600 });

export async function preparar({ raiz, obter = fetch }) {
  const pasta = mkdtempSync(join(tmpdir(), 'greenia-fechamento-final-'));
  guardar(join(pasta, 'package.json'), '{"type":"module"}\n');
  for (const [nome, esperado] of Object.entries(ARQUIVOS)) {
    const r = await obter(`${REPO}/${CANDIDATA}/${nome}`, { redirect: 'error', signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw new Error(`Download de teste falhou (${r.status}): ${nome}`);
    const b = Buffer.from(await r.arrayBuffer());
    if (b.length > 1024 * 1024 || sha(b) !== esperado) throw new Error(`Arquivo de teste divergente: ${nome}`);
    mkdirSync(dirname(join(pasta, nome)), { recursive: true, mode: 0o700 });
    guardar(join(pasta, nome), b);
  }
  // Arquivos de produção somente referenciados; nada é copiado sobre /app.
  for (const nome of ['src', 'public', 'node_modules', 'modelos-quick-win.json']) {
    if (!existsSync(join(raiz, nome))) throw new Error(`Dependência da candidata ausente: ${nome}`);
    symlinkSync(join(raiz, nome), join(pasta, nome));
  }
  return pasta;
}

async function testar(pasta) {
  const casa = join(pasta, 'chrome-home'); mkdirSync(casa, { mode: 0o700 });
  // Não herda SMTP, chaves, BANCO, MULTIEMPRESA, PORT nem configurações da aplicação ativa.
  const env = { PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin', HOME: casa, TMPDIR: pasta,
    CHROMIUM_PATH: '/usr/bin/chromium', DESIGN_IA: '0' };
  return await new Promise(resolveTeste => {
    let saida = '', excedeu = false, expirou = false, inicio = Date.now();
    const args = ['--disable-warning=ExperimentalWarning', '--test', '--test-reporter=tap',
      '--test-name-pattern=execução com artefato|no mesmo layout', 'test/producao-visual.test.js'];
    const proc = spawn(process.execPath, args, { cwd: pasta, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const matar = () => { if (proc.pid) { try { process.kill(-proc.pid, 'SIGKILL'); } catch { proc.kill('SIGKILL'); } } };
    const timer = setTimeout(() => { expirou = true; matar(); }, 180000);
    const coletar = b => { if (saida.length + b.length > 2 * 1024 * 1024) { excedeu = true; matar(); } else saida += b.toString(); };
    proc.stdout.on('data', coletar); proc.stderr.on('data', coletar);
    proc.on('error', () => { clearTimeout(timer); resolveTeste({ aprovado: false, motivo: 'Não foi possível iniciar os testes' }); });
    proc.on('close', (codigo, sinal) => {
      clearTimeout(timer); guardar(join(pasta, 'powerpoint.tap'), saida);
      const numero = n => { const m = new RegExp(`^# ${n} (\\d+)$`, 'm').exec(saida); return m ? Number(m[1]) : null; };
      const nomes = [...saida.matchAll(/^ok \d+ - (.+)$/gm)].map(m => m[1]).filter(n => !n.includes('# SKIP'));
      const pass = numero('pass'), fail = numero('fail'), cancelados = numero('cancelled'), ignorados = numero('skipped');
      return resolveTeste({ aprovado: codigo === 0 && pass === 2 && fail === 0 && cancelados === 0 && nomes.length === 2 && !expirou && !excedeu,
        codigo, sinal, passaram: pass, falharam: fail, cancelados, ignorados, casos: nomes, expirou, excedeu,
        duracaoMs: Date.now() - inicio, inferencia: 'simulada', banco: 'em memória', log: join(pasta, 'powerpoint.tap') });
    });
  });
}

async function financeiro(pasta, raiz) {
  const { SELOS, reconciliar } = await import(pathToFileURL(join(pasta, 'scripts/qa-inventario-final.mjs')).href);
  const { consultarGeracao } = await import(pathToFileURL(join(pasta, 'scripts/qa-consultar-recibo.mjs')).href);
  const esperados = new Set([...SELOS, '669c0c9f9cf9dd0af3a8b6b0a74e2d6c2b7f325c6b40953924b87c868d3f396b']);
  const rodadas = [], vistos = new Set();
  function visitar(p, nivel = 0) {
    if (nivel > 5) return;
    for (const e of readdirSync(p, { withFileTypes: true })) {
      const f = join(p, e.name); if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) { visitar(f, nivel + 1); continue; }
      if (!e.isFile() || e.name !== 'relatorio.json' || lstatSync(f).size > 32 * 1024 * 1024) continue;
      const b = readFileSync(f), h = sha(b); if (!esperados.has(h) || vistos.has(h)) continue;
      vistos.add(h); const r = JSON.parse(b);
      rodadas.push({ sha256: h, recibos: r.recibos || [] });
    }
  }
  visitar('/app/dados/qa-preservado-8IqDo0');
  const anterior = reconciliar(rodadas, esperados);
  if (anterior.hashesAusentes.length) return { completo: false, motivo: 'Relatórios preservados incompletos', inventario: anterior };
  const pendentes = new Map();
  for (const r of rodadas) for (const c of r.recibos) if (c.custo == null && c.geracao && !pendentes.has(c.geracao)) pendentes.set(c.geracao, c);
  if (pendentes.size > 5) throw new Error('Mais de cinco consultas pendentes; nenhuma consulta iniciada');
  const consultas = [];
  if (pendentes.size) {
    const { DatabaseSync } = await import('node:sqlite');
    const { lerChaveMestraExistente } = await import(pathToFileURL(join(raiz, 'src/chave-recuperacao.js')).href);
    const { decifrar } = await import(pathToFileURL(join(raiz, 'src/plataforma/segredo.js')).href);
    let db, chave = null, mestra = null;
    try {
      db = new DatabaseSync('/app/dados/plataforma.sqlite', { readOnly: true });
      const r = db.prepare("select value from platform_settings where key = 'openrouter_chave'").get();
      if (!r) throw new Error('Credencial do console indisponível');
      mestra = lerChaveMestraExistente({ env: process.env, arquivo: '/app/dados/.chave-mestra' });
      chave = decifrar(mestra, JSON.parse(r.value).cifrado); db.close(); db = null;
      for (const c of pendentes.values()) consultas.push({ geracao: c.geracao, ...(await consultarGeracao(c, chave)) });
    } finally { db?.close(); chave = null; mestra = null; }
  }
  const recibosNovos = new Map(consultas.filter(c => c.comprovado).map(c => [c.id, c]));
  const complementadas = rodadas.map(r => ({ ...r, recibos: r.recibos.map(c => {
    const novo = recibosNovos.get(c.geracao); return c.custo == null && novo ? { ...c, custo: novo.custoUsd } : c;
  }) }));
  const atual = reconciliar(complementadas, esperados);
  return { completo: atual.totalHistoricoUsd != null, consultas, inventario: atual,
    originaisAlterados: false, novasInferencias: 0, faturaConferida: false,
    aviso: 'Tentativa sem ID não recebe ID por aproximação nem custo zero; subtotal não equivale à conciliação de fatura' };
}

export async function executar({ raiz = '/app', somentePreparar = false, obter = fetch } = {}) {
  if (!somentePreparar && (raiz !== '/app' || process.env.RENDER_GIT_COMMIT !== CANDIDATA)) throw new Error('Execute apenas no Shell da candidata implantada; versão divergente');
  const pasta = await preparar({ raiz: resolve(raiz), obter });
  if (somentePreparar) return { preparado: true, pasta, executado: false, bancoAcessado: false };
  const resultado = { candidata: CANDIDATA, criadoEm: new Date().toISOString(), pasta, liberacaoProducao: false };
  console.log('Testando somente os dois casos pendentes de PowerPoint, com IA falsa e banco em memória.');
  resultado.powerpoint = await testar(pasta);
  console.log('POWERPOINT', JSON.stringify(resultado.powerpoint));
  try { resultado.financeiro = await financeiro(pasta, raiz); }
  catch { resultado.financeiro = { completo: false, motivo: 'Consulta não concluída; preservar pendências e conferir arquivos/credencial no servidor' }; }
  guardar(join(pasta, 'relatorio.json'), JSON.stringify(resultado, null, 2) + '\n');
  console.log('FECHAMENTO_PARCIAL_INICIO\n' + JSON.stringify(resultado, null, 2) + '\nFECHAMENTO_PARCIAL_FIM');
  console.log('SHA256_RELATORIO', sha(readFileSync(join(pasta, 'relatorio.json'))));
  console.log('Esta execução não testa sessões de Membro em produção, restauração do S3 ou conciliação de fatura.');
  return resultado;
}
