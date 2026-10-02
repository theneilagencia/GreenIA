// O processo sobe de verdade pelo ponto de entrada (npm start) e responde na saúde.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { subir } from './ajuda.js';
import { enviarMensagem } from './openrouter-falso.js';
import { criarIndisponivel } from '../src/ia.js';
import { MSG_USUARIO } from '../src/avisos-governanca.js';

async function subirProcesso(extra) {
  const porta = 20000 + Math.floor(Math.random() * 20000);
  const env = { ...process.env, PORTA: String(porta), HOST: '127.0.0.1', BANCO: join(mkdtempSync(join(tmpdir(), 'greenia-')), 'g.sqlite'), OPENROUTER_API_KEY: '', NODE_ENV: 'development', ...extra };
  const p = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'src/iniciar.js'], { env, stdio: 'pipe' });
  let saida = '';
  p.stdout.on('data', d => { saida += d; });
  p.stderr.on('data', d => { saida += d; });
  let ok = false;
  for (let i = 0; i < 50 && !ok; i++) {
    await new Promise(r => setTimeout(r, 100));
    ok = await fetch(`http://127.0.0.1:${porta}/api/saude`).then(r => r.ok).catch(() => false);
  }
  const saude = ok ? await fetch(`http://127.0.0.1:${porta}/api/saude`).then(r => r.json()) : null;
  const fim = new Promise(r => p.on('exit', r));
  p.kill('SIGTERM');
  return { ok, saida, saude, codigo: await fim };
}

test('npm start: sobe, responde em /api/saude e para com SIGTERM', async () => {
  const r = await subirProcesso({});
  assert.ok(r.ok, r.saida);
  assert.equal(r.codigo, 0);
});

test('produção sem OPENROUTER_API_KEY: sobe com a IA desligada e avisa, sem cair na simulada', async () => {
  const r = await subirProcesso({ NODE_ENV: 'production', COOKIE_SEGURO: '0' });
  assert.ok(r.ok, r.saida);
  const { design, ...saude } = r.saude;
  assert.deepEqual(saude, { ok: true, ia: false, versao: null });
  assert.equal(typeof design, 'boolean');   // o navegador do design pela IA existe nesta máquina?   // versao: o commit publicado (RENDER_GIT_COMMIT), nulo fora do Render
  assert.match(r.saida, /IA está desligada/);
});

test('com a IA desligada, a mensagem volta com o aviso claro e o admin sabe pelo /api/eu', async () => {
  const S = await subir({ ia: criarIndisponivel() });
  const admin = await S.cliente().entrar('admin@exemplo.com.br');
  assert.equal((await admin.get('/api/eu')).dados.iaConfigurada, false);
  const c = (await admin.post('/api/conversas', {})).dados.conversa;
  try {
    const r = await enviarMensagem(admin, c.id, { texto: 'Olá' });
    // Quem conversa recebe uma mensagem simples; o detalhe técnico (falta a chave) fica no console e no /api/eu.
    assert.equal(r.falha.mensagem, MSG_USUARIO.ia_fora);
    assert.doesNotMatch(r.falha.mensagem, /OPENROUTER|chave|servidor/i);
  } finally { await S.fechar(); }
});
