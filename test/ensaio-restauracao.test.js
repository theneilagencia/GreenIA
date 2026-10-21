// Ensaio de restauração (versão rápida do scripts/ensaio-restauracao.mjs): origem sintética multiempresa, backup real
// (local + S3 falso com expiração conferida), restauração numa pasta nova, aplicação isolada em 127.0.0.1, validações,
// RTO/RPO medidos e descarte. Também confere as travas: destino ocupado ou dentro da origem, caminho de empresa fora
// da cópia e conexão externa bloqueada.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import * as F from '../scripts/ensaio/s3-falso.js';
import { bloquearRedeExterna, conferirDestino, ensaiar, ensaioSintetico, montarOrigemSintetica, descartar } from '../src/ensaio-restauracao.js';
import { backupDaPlataforma } from '../src/iniciar.js';
import { assinarS3 } from '../src/backup-s3.js';

test('ensaio sintético completo: restaura do S3 falso, valida integridade, marcadores, isolamento, credenciais e app; mede RTO/RPO; descarta', async () => {
  const r = await ensaioSintetico(F);
  const e = r.ensaio;
  assert.equal(e.ok, true, JSON.stringify(e.falhas));
  const nomes = e.verificacoes.map(v => v.nome);
  for (const n of ['integridade plataforma', 'credenciais de conectores decifram com a chave recuperada', 'isolamento: empresa A não vê dados da B (nem B os da A)',
    'isolamento: sessão da empresa A não abre o ambiente da B', 'escrita posterior ao backup não está na cópia (janela do RPO)', 'nenhuma conexão externa durante o ensaio',
    'origem intocada (SHA-256 dos bancos e da chave antes e depois)', 'chave-mestra recuperada confere com a impressão digital do banco restaurado'])
    assert.ok(nomes.includes(n), n);
  assert.ok(e.verificacoes.filter(v => /^login na empresa/.test(v.nome)).length === 2);
  assert.ok(e.verificacoes.filter(v => /^abre um Quick Win/.test(v.nome)).length === 2);
  assert.equal(e.bancos.length, 3);
  assert.deepEqual(e.credenciais, { total: 2, decifradas: 2 });
  assert.equal(e.chave.origem, 'envelope S3');
  assert.ok(e.rto_ms > 0 && e.rto_ms < 60e3);
  assert.ok(e.rpo.rpo_s >= 0 && e.rpo.rpo_s < 120);
  assert.equal(r.backup.ciclo.ok, true);
  assert.ok(r.descarte.length && r.descarte.every(d => d.removida));
  assert.ok(!existsSync(r.raiz));
  // Nada de chave em claro no relatório.
  assert.doesNotMatch(JSON.stringify(r), /BACKUP_CHAVE_CIFRA|"mestra"/);
});

test('recupera backup de endpoint fora da lista de isolamento antes de subir a cópia isolada', async () => {
  // O destino lógico é externo à lista permitida. Apenas o transporte do teste
  // o encaminha e assina para o S3 falso local; nenhum serviço real é acessado.
  const originalFetch = globalThis.fetch;
  let endpoint, credenciaisFalsas;
  globalThis.fetch = (entrada, op) => {
    const u = new URL(entrada);
    if (u.hostname !== 's3.ensaio.invalid') return originalFetch(entrada, op);
    const url = endpoint + u.pathname + u.search;
    const cabecalhos = Object.fromEntries(Object.entries(op.headers).filter(([k]) => !['authorization', 'x-amz-date', 'x-amz-content-sha256', 'host'].includes(k)));
    const headers = assinarS3({ metodo: op.method, url, cabecalhos, hashCorpo: op.headers['x-amz-content-sha256'], chave: credenciaisFalsas.S3_CHAVE, segredo: credenciaisFalsas.S3_SEGREDO, regiao: credenciaisFalsas.S3_REGIAO });
    return originalFetch(url, { ...op, headers });
  };
  try {
    const r = await ensaioSintetico({ ...F, subirS3Falso: async op => {
      const s3 = await F.subirS3Falso(op); endpoint = s3.endpoint; credenciaisFalsas = s3.env();
      return { ...s3, env: prefixo => ({ ...s3.env(prefixo), S3_ENDPOINT: 'http://s3.ensaio.invalid' }) };
    } });
    assert.equal(r.ensaio.ok, true, JSON.stringify(r.ensaio.falhas));
    assert.equal(r.ensaio.chave.origem, 'envelope S3');
    assert.equal(r.ensaio.bancos.length, 3);
    assert.ok(r.ensaio.verificacoes.some(v => v.nome === 'aplicação escuta só em 127.0.0.1' && v.ok));
    assert.equal(r.ensaio.rede_bloqueada, 0);
    assert.ok(r.descarte.every(d => d.removida));
  } finally { globalThis.fetch = originalFetch; }
});

test('ensaio a partir de uma pasta local de backups (sem S3), com a chave-mestra do arquivo', async () => {
  const raiz = mkdtempSync(join(tmpdir(), 'greenia-ensaio-local-'));
  try {
    const O = await montarOrigemSintetica(join(raiz, 'origem'));
    O.P.log = () => {};
    await backupDaPlataforma(O.P, { pasta: join(raiz, 'origem', 'backups'), env: {} });
    await new Promise(r => { O.P.servidor.close(r); O.P.servidor.closeAllConnections?.(); });
    for (const t of O.P.tenants.values()) t.db.close();
    O.P.db.close();
    const e = await ensaiar({ fonte: { tipo: 'local', pasta: join(raiz, 'origem', 'backups') }, destino: join(raiz, 'restaurado'), chave: { arquivo: join(raiz, 'origem', '.chave-mestra') },
      esperado: { empresas: O.empresas }, proibidos: [join(raiz, 'origem')] });
    assert.equal(e.ok, true, JSON.stringify(e.falhas));
    assert.equal(e.chave.origem, 'arquivo .chave-mestra');
    // A mesma cópia (caminhos já remapeados) sobe com ENSAIO_ISOLADO=1 em 127.0.0.1, sem tarefas nem rede externa.
    const filho = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'src/iniciar.js'], { env: { PATH: process.env.PATH, ENSAIO_ISOLADO: '1', BANCO_PLATAFORMA: join(raiz, 'restaurado', 'plataforma.sqlite'), PORT: '0' } });
    try {
      let saida = '';
      const porta = await new Promise((ok, falha) => {
        const t = setTimeout(() => falha(new Error('não subiu: ' + saida)), 20e3);
        filho.stdout.on('data', d => { saida += d; const m = /ENSAIO ISOLADO em http:\/\/127\.0\.0\.1:(\d+)/.exec(saida); if (m) { clearTimeout(t); ok(Number(m[1])); } });
        filho.stderr.on('data', d => { saida += d; });
      });
      assert.equal((await fetch(`http://127.0.0.1:${porta}/api/saude`)).status, 200);
      assert.match(saida, /sem chave-mestra/);   // a chave não foi copiada para a pasta do ensaio
    } finally { filho.kill('SIGTERM'); }
    // Sem a chave certa, o ensaio reprova (credenciais ilegíveis, impressão diferente).
    const sem = await ensaiar({ fonte: { tipo: 'local', pasta: join(raiz, 'origem', 'backups') }, destino: join(raiz, 'restaurado-2'), chave: {}, esperado: { empresas: O.empresas } });
    assert.equal(sem.ok, false);
    assert.ok(sem.falhas.includes('chave-mestra recuperada confere com a impressão digital do banco restaurado'));
    assert.ok(sem.falhas.includes('credenciais de conectores decifram com a chave recuperada'));
  } finally { descartar([raiz]); }
});

test('travas: destino ocupado, dentro da origem ou no disco de produção; rede externa bloqueada no processo', async () => {
  const raiz = mkdtempSync(join(tmpdir(), 'greenia-ensaio-trava-'));
  try {
    mkdirSync(join(raiz, 'ocupado')); writeFileSync(join(raiz, 'ocupado', 'x'), '1');
    assert.throws(() => conferirDestino(join(raiz, 'ocupado')), e => e.code === 'ENSAIO_DESTINO_OCUPADO');
    assert.throws(() => conferirDestino(join(raiz, 'origem', 'dentro'), { proibidos: [join(raiz, 'origem')] }), e => e.code === 'ENSAIO_DESTINO_PROIBIDO');
    assert.throws(() => conferirDestino('/app/dados/ensaio'), e => e.code === 'ENSAIO_DESTINO_PROIBIDO');
    const rede = bloquearRedeExterna();
    try {
      await assert.rejects(fetch('https://example.com/'));
      assert.ok(rede.tentativas.length >= 1);
      assert.ok(rede.tentativas.every(t => !['127.0.0.1', 'localhost', '::1'].includes(t.host)));
    } finally { rede.desfazer(); }
  } finally { descartar([raiz]); }
});

test('ENSAIO_ISOLADO=1 recusa subir se algum banco de empresa aponta para fora da cópia', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'greenia-ensaio-iso-'));
  try {
    const db = new DatabaseSync(join(raiz, 'plataforma.sqlite'));
    db.exec("create table companies (id text, banco text); insert into companies values ('emp_x', '/app/dados/empresas/emp_x.sqlite')");
    db.close();
    const r = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', 'src/iniciar.js'], { env: { PATH: process.env.PATH, ENSAIO_ISOLADO: '1', BANCO_PLATAFORMA: join(raiz, 'plataforma.sqlite'), PORT: '0' }, encoding: 'utf8', timeout: 20e3 });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /apontam para fora/);
  } finally { rmSync(raiz, { recursive: true, force: true }); }
});
