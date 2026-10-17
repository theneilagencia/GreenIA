// Backup em S3 (desligado sem configuração): cifra no cliente, integridade, SSE conferida, expiração CONFERIDA no
// bucket (ciclo de vida + versionamento), registro por banco, alertas e chave-mestra. Tudo contra um S3 falso local.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { subirS3Falso, lifecycleXml, regraLifecycle } from '../scripts/ensaio/s3-falso.js';
import { abrirBanco } from '../src/db.js';
import { fazerBackup, restaurar } from '../src/backup.js';
import { avaliarLifecycle, configS3, listarS3, maisNovosPorBanco, baixarEnvelopeS3, envelopeMaisNovo, decifrarBackup } from '../src/backup-s3.js';
import { abrirEnvelope, impressaoMestra, selarChaveMestra } from '../src/chave-recuperacao.js';
import { criarPlataforma } from '../src/plataforma/servidor.js';
import { backupDaPlataforma, rodadaDevida } from '../src/iniciar.js';
import { avisarBackups, alertaBackup, lerEstado } from '../src/plataforma/backup-estado.js';
import { subirPlataforma } from './ajuda-plataforma.js';

const chaveCifra = () => randomBytes(32).toString('base64');
const pasta = () => mkdtempSync(join(tmpdir(), 'greenia-s3-'));
const SETE = lifecycleXml(regraLifecycle({ dias: 7, prefixo: 'p/' }));

test('ciclo de vida (avaliarLifecycle, compartilhado com src/backup.js): regra ativa por prefixo, dentro do limite, com versões antigas', () => {
  const av = (xml, versionado = false) => avaliarLifecycle(xml, { prefixo: 'greenia/', limiteDias: 7, versionado });
  assert.match(av('').motivo, /nenhuma regra ativa/);
  assert.equal(av(lifecycleXml(regraLifecycle({ dias: 7, prefixo: 'greenia/' }))).ok, true);
  assert.equal(av(lifecycleXml(regraLifecycle({ dias: 7, prefixo: '' }))).ok, true);
  assert.equal(av(lifecycleXml(regraLifecycle({ dias: 7, prefixo: 'outro/' }))).ok, false);
  assert.match(av(lifecycleXml(regraLifecycle({ dias: 30, prefixo: 'greenia/' }))).motivo, /30 dias, mais que o limite de 7/);
  assert.equal(av(lifecycleXml(regraLifecycle({ dias: 7, prefixo: 'greenia/', status: 'Disabled' }))).ok, false);
  assert.match(av(lifecycleXml(regraLifecycle({ dias: 7, prefixo: 'greenia/' })), true).motivo, /versões antigas/);
  assert.match(av(lifecycleXml(regraLifecycle({ dias: 7, ncDias: 1, prefixo: 'greenia/' })), true).motivo, /passa do limite/);
  assert.deepEqual(av(lifecycleXml(regraLifecycle({ dias: 6, ncDias: 1, prefixo: 'greenia/' })), true), { ok: true, expiraDias: 6, antigasDias: 1, versionado: true });
});

test('sem expiração conferida no bucket, nada vai para o S3; o backup local fica e o erro diz por quê', async () => {
  const p = pasta(), db = abrirBanco(join(p, 'g.sqlite'));
  for (const [lifecycle, versionamento, motivo] of [[null, null, /não tem regra de expiração/], [lifecycleXml(regraLifecycle({ dias: 30, prefixo: 'p/' })), null, /30 dias/], [SETE, 'Enabled', /versões antigas/]]) {
    const s3 = await subirS3Falso({ lifecycle, versionamento });
    const env = { ...s3.env('p'), BACKUP_CHAVE_CIFRA: chaveCifra(), S3_LIFECYCLE_DIAS: '7' };   // a declaração não vale como prova
    const e = await fazerBackup(db, { pasta: join(p, 'bk'), destino: env.BACKUP_DESTINO, env });
    assert.match(e.s3Bloqueado, motivo); assert.equal(e.remoto, null);
    assert.ok(existsSync(e.local));
    assert.equal(s3.pedidos.filter(x => x.metodo === 'PUT').length, 0);
    await s3.fechar();
  }
  db.close(); rmSync(p, { recursive: true, force: true });
});

test('envio: objeto por banco e carimbo, cifrado no cliente, SHA-256 nos metadados, SSE conferida e restauração verificada', async () => {
  const p = pasta(), db = abrirBanco(join(p, 'g.sqlite'));
  db.prepare("insert into areas (nome) values ('Área Secreta do Teste')").run();
  const s3 = await subirS3Falso({ lifecycle: SETE });
  const env = { ...s3.env('p'), BACKUP_CHAVE_CIFRA: chaveCifra(), S3_SSE: 'AES256' };
  const r = await fazerBackup(db, { pasta: join(p, 'bk'), destino: env.BACKUP_DESTINO, env, banco: 'emp_abc', agora: new Date('2026-10-14T06:00:00Z') });
  assert.equal(r.envio.objeto, 'p/emp_abc/greenia-emp_abc-20261014-060000.sqlite.gz.enc');
  assert.equal(r.envio.sse, 'AES256');
  const o = s3.objetos.get(r.envio.objeto);
  assert.equal(o.sse, 'AES256');
  assert.equal(o.meta['x-amz-meta-sha256'], r.sha256);
  assert.equal(o.meta['x-amz-meta-banco'], 'emp_abc');
  assert.ok(!o.corpo.includes(Buffer.from('Área Secreta')) && o.corpo[0] !== 0x1f);   // nem texto nem gzip à vista
  assert.ok(s3.pedidos.some(x => x.metodo === 'HEAD'));                                  // conferência depois do envio
  // Restaura do S3: confere os dois SHA-256 e decifra.
  const x = await restaurar(`s3://${s3.bucket}/${r.envio.objeto}`, join(p, 'r.sqlite'), { env });
  assert.equal(x.tipo, 'empresa');
  const rdb = abrirBanco(join(p, 'r.sqlite')); assert.equal(rdb.prepare('select nome from areas where nome like ?').get('%Secreta%').nome, 'Área Secreta do Teste'); rdb.close();
  // Objeto alterado no bucket: recusado sem tocar no destino.
  s3.estado.corromper = r.envio.objeto;
  await assert.rejects(restaurar(`s3://${s3.bucket}/${r.envio.objeto}`, join(p, 'r2.sqlite'), { env }), e => e.code === 'S3_INTEGRIDADE');
  assert.ok(!existsSync(join(p, 'r2.sqlite')));
  s3.estado.corromper = null;
  // Chave de cifra errada e objeto copiado para outro nome: recusados.
  await assert.rejects(restaurar(`s3://${s3.bucket}/${r.envio.objeto}`, join(p, 'r3.sqlite'), { env: { ...env, BACKUP_CHAVE_CIFRA: chaveCifra() } }), e => e.code === 'BACKUP_DECIFRAR');
  const cfg = configS3(env.BACKUP_DESTINO, env);
  assert.throws(() => decifrarBackup(cfg.cifra, o.corpo, { nomeEsperado: 'p/emp_xyz/outro.enc' }), e => e.code === 'BACKUP_NOME');
  // Cópia .enc baixada para o disco também restaura (com a chave).
  const local = join(p, 'baixado.enc'); (await import('node:fs')).writeFileSync(local, o.corpo);
  assert.equal((await restaurar(local, join(p, 'r4.sqlite'), { env })).tipo, 'empresa');
  // Instabilidade passageira (503 em duas tentativas): o envio tenta de novo e conclui; três seguidas, falha com código.
  s3.estado.falharProximos = 2;
  assert.ok((await fazerBackup(db, { pasta: join(p, 'bk'), destino: env.BACKUP_DESTINO, env, banco: 'emp_abc', agora: new Date('2026-10-14T07:00:00Z') })).s3);
  s3.estado.falharProximos = 3;
  assert.match((await fazerBackup(db, { pasta: join(p, 'bk'), destino: env.BACKUP_DESTINO, env, banco: 'emp_abc', agora: new Date('2026-10-14T08:00:00Z') })).s3Bloqueado, /\(503\)/);
  // Object Lock ligado no bucket: a expiração pode ser impedida, nada é enviado.
  s3.estado.objectLock = 'Enabled';
  assert.match((await fazerBackup(db, { pasta: join(p, 'bk'), destino: env.BACKUP_DESTINO, env, banco: 'emp_abc', agora: new Date('2026-10-14T09:00:00Z') })).s3Bloqueado, /Object Lock/);
  s3.estado.objectLock = null;
  s3.estado.falharProximos = 0;
  // SSE pedida e não confirmada pelo servidor: falha.
  s3.estado.confirmarSse = false;
  await assert.rejects(fazerBackup(db, { pasta: join(p, 'bk'), destino: env.BACKUP_DESTINO, env, banco: 'emp_abc', agora: new Date('2026-10-15T06:00:00Z') }), e => e.code === 'S3_SSE_NAO_CONFIRMADA');
  // DELETE não é usado (e o S3 falso, como a política proposta, recusa).
  assert.ok(!s3.pedidos.some(x => x.metodo === 'DELETE'));
  await s3.fechar(); db.close(); rmSync(p, { recursive: true, force: true });
});

test('configuração: sem chave de cifra, com chave inválida ou igual à chave-mestra, o S3 não é usado', () => {
  const base = { S3_ENDPOINT: 'http://127.0.0.1:1', S3_CHAVE: 'a', S3_SEGREDO: 'b' };
  assert.equal(configS3('', base), null);
  assert.throws(() => configS3('s3://bucket-x/p', base), e => e.code === 'S3_SEM_CHAVE_CIFRA');
  assert.throws(() => configS3('s3://bucket-x/p', { ...base, BACKUP_CHAVE_CIFRA: 'curta' }), e => e.code === 'S3_CHAVE_CIFRA_INVALIDA');
  const k = randomBytes(32);
  assert.throws(() => configS3('s3://bucket-x/p', { ...base, BACKUP_CHAVE_CIFRA: k.toString('base64') }, { mestra: k }), e => e.code === 'S3_CHAVE_CIFRA_IGUAL_MESTRA');
  assert.throws(() => configS3('s3://bucket-x/p', { BACKUP_CHAVE_CIFRA: k.toString('base64') }), e => e.code === 'S3_CONFIG');
  assert.throws(() => configS3('http://x', base), e => e.code === 'S3_DESTINO_INVALIDO');
  // A mensagem de erro nunca traz a chave.
  try { configS3('s3://bucket-x/p', { ...base, BACKUP_CHAVE_CIFRA: 'curta' }); } catch (e) { assert.doesNotMatch(e.message, /curta/); }
});

test('rodada multiempresa com S3: todos os bancos, ciclo de vida conferido uma vez, registro por banco, envelope da chave-mestra e listagem paginada', async () => {
  const p = pasta();
  const S = await subirPlataforma({ banco: join(p, 'plataforma.sqlite'), pastaEmpresas: join(p, 'empresas') });
  try {
    const ops = await S.navegador().entrarConsole('ops@theneil.com.br');
    const plano = (await ops.get('/api/plataforma/planos')).dados.planos[0];
    for (const slug of ['empresa-um', 'empresa-dois']) assert.equal((await ops.post('/api/plataforma/empresas', { name: `Empresa ${slug}`, slug, plan_id: plano.id })).status, 200);
    const s3 = await subirS3Falso({ lifecycle: lifecycleXml(regraLifecycle({ dias: 6, ncDias: 1, prefixo: 'g/' })), versionamento: 'Enabled', maxChaves: 2 });
    const segredo = randomBytes(24).toString('base64url');
    const env = { ...s3.env('g'), BACKUP_CHAVE_CIFRA: chaveCifra(), BACKUP_ENVELOPE_SEGREDO: segredo };
    const logs = []; S.P.log = s => logs.push(String(s));
    const r = await backupDaPlataforma(S.P, { pasta: join(p, 'backups'), destino: env.BACKUP_DESTINO, env, manter: 7 });
    assert.deepEqual([r.total, r.concluidos, r.falhas, r.s3, r.ciclo.ok, r.ciclo.expiraDias, r.ciclo.antigasDias], [3, 3, 0, true, true, 6, 1]);
    assert.equal(s3.pedidos.filter(x => x.query === 'lifecycle').length, 1);
    assert.equal(r.envelope, impressaoMestra(S.P.mestra()));
    const est = lerEstado(S.P);
    assert.equal(Object.keys(est.bancos).length, 3);
    assert.ok(Object.values(est.bancos).every(b => b.ultimo_local && b.ultimo_remoto && /^[0-9a-f]{64}$/.test(b.sha256) && !b.falha));
    const aud = S.P.db.prepare("select action, entity_id, after from audit_log where action like 'backup.%' order by id").all();
    assert.equal(aud.filter(a => a.action === 'backup.completed').length, 3);
    assert.equal(aud.at(-1).action, 'backup.run');
    // Nenhum log ou auditoria traz chave, segredo ou credencial do S3.
    const tudo = logs.join('\n') + JSON.stringify(aud);
    for (const s of [env.BACKUP_CHAVE_CIFRA, segredo, env.S3_SEGREDO, S.P.mestra().toString('base64')]) assert.ok(!tudo.includes(s));
    // Listagem com paginação (2 por página) e o mais novo por banco; envelope recuperável com o segredo certo.
    const cfg = configS3(env.BACKUP_DESTINO, env);
    const itens = await listarS3(cfg);
    assert.equal(itens.length, 4);
    assert.equal(maisNovosPorBanco(itens).size, 3);
    const env2 = await baixarEnvelopeS3(cfg, envelopeMaisNovo(itens).objeto);
    assert.ok(abrirEnvelope(env2, segredo).equals(S.P.mestra()));
    assert.throws(() => abrirEnvelope(env2, 'segredo-errado-com-mais-de-32-caracteres!!'), e => e.code === 'ENVELOPE_SEGREDO');
    assert.ok(!JSON.stringify(env2).includes(S.P.mestra().toString('base64')));
    await s3.fechar();
  } finally { await S.fechar(); rmSync(p, { recursive: true, force: true }); }
});

test('alertas: falha por banco, conjunto atrasado (26 h) e S3 recusado viram aviso no console e email aos admins (um por dia)', async () => {
  const p = pasta();
  let agora = new Date('2026-10-14T06:00:00Z');
  const S = await subirPlataforma({ banco: join(p, 'plataforma.sqlite'), pastaEmpresas: join(p, 'empresas'), agora: () => agora });
  try {
    const ops = await S.navegador().entrarConsole('ops@theneil.com.br');
    const plano = (await ops.get('/api/plataforma/planos')).dados.planos[0];
    const A = (await ops.post('/api/plataforma/empresas', { name: 'Empresa A', slug: 'emp-a', plan_id: plano.id })).dados;
    S.P.backup = { hora: '06:00', pasta: join(p, 'backups'), s3: true };
    // Bucket sem regra de expiração: cada banco falha na etapa S3 (o local é feito).
    const s3 = await subirS3Falso({});
    const env = { ...s3.env('g'), BACKUP_CHAVE_CIFRA: chaveCifra() };
    const r = await backupDaPlataforma(S.P, { pasta: S.P.backup.pasta, destino: env.BACKUP_DESTINO, env });
    assert.equal(r.s3Bloqueados, 2); assert.equal(r.falhas, 0); assert.equal(r.ciclo.ok, false);
    assert.equal(readdirSync(join(p, 'backups', A.id)).length, 1);
    const antes = S.P.email.enviados.length;
    const c = await avisarBackups(S.P);
    assert.ok(c.problemas.some(x => x.banco === A.id && x.tipo === 'falha' && /S3_SEM_EXPIRACAO/.test(x.texto)));
    const emails = S.P.email.enviados.slice(antes);
    assert.ok(emails.some(m => m.para === 'ops@theneil.com.br' && /Backups com problema/.test(m.assunto)));
    assert.ok(!emails.some(m => m.texto.includes(env.BACKUP_CHAVE_CIFRA) || m.texto.includes(env.S3_SEGREDO)));
    // Mesmo conjunto de problemas: não repete o email no mesmo dia; o console mostra o aviso.
    await avisarBackups(S.P);
    assert.equal(S.P.email.enviados.length, antes + emails.length);
    const eu = (await ops.get('/api/plataforma/eu')).dados;
    assert.ok(eu.alertaBackup.total >= 2);
    assert.ok(S.P.db.prepare("select count(*) as n from audit_log where action = 'backup.alert'").get().n === 1);
    // Bucket corrigido: rodada limpa, sem aviso.
    s3.estado.lifecycle = SETE.replace('p/', 'g/');
    agora = new Date('2026-10-15T06:00:00Z');
    const limpa = await backupDaPlataforma(S.P, { pasta: S.P.backup.pasta, destino: env.BACKUP_DESTINO, env, agora });
    assert.equal(limpa.falhas, 0); assert.equal(limpa.s3Bloqueados, undefined);
    assert.equal((await avisarBackups(S.P)).problemas.length, 0);
    assert.equal(alertaBackup(S.P), null);
    // 27 h sem rodada: todos os bancos atrasados.
    agora = new Date('2026-10-16T09:30:00Z');
    const atraso = await avisarBackups(S.P);
    assert.equal(atraso.problemas.filter(x => x.tipo === 'atrasado').length, 2);
    assert.ok(atraso.avisou);
    await s3.fechar();
  } finally { await S.fechar(); rmSync(p, { recursive: true, force: true }); }
});

test('agenda: a rodada do dia roda depois da hora mesmo após reinício, e uma vez só', async () => {
  let agora = new Date(2026, 9, 14, 5, 0);
  const P = criarPlataforma({ log: () => {}, agora: () => agora });
  assert.equal(rodadaDevida(P, '06:00'), false);
  agora = new Date(2026, 9, 14, 9, 0);   // processo voltou às 9h: a rodada das 6h ainda é devida
  assert.equal(rodadaDevida(P, '06:00'), 'diaria');
  await backupDaPlataforma(P, { pasta: join(mkdtempSync(join(tmpdir(), 'greenia-ag-')), 'b') });
  assert.equal(rodadaDevida(P, '06:00'), false);
  agora = new Date(2026, 9, 15, 6, 0, 30);
  assert.equal(rodadaDevida(P, '06:00'), 'diaria');
  P.db.close();
});

test('agenda: rodada incompleta (S3 fora do ar) se repete depois de 1 h, no máximo 3 vezes, e a diária recomeça a contagem', async () => {
  let agora = new Date(2026, 9, 15, 6, 0, 30);
  const P = criarPlataforma({ log: () => {}, agora: () => agora });
  const destino = join(mkdtempSync(join(tmpdir(), 'greenia-rep-')), 'b');
  const falhaS3 = async () => { throw Object.assign(new Error('sem S3'), { code: 'S3_CONFIG', etapa: 's3' }); };
  const rodar = repeticao => backupDaPlataforma(P, { pasta: destino, repeticao }, falhaS3);
  await rodar(false);
  assert.equal(lerEstado(P).rodada.tentativas, 1);
  agora = new Date(2026, 9, 15, 6, 50);
  assert.equal(rodadaDevida(P, '06:00'), false);   // menos de 1 h
  for (const [h, n] of [[7, 2], [8, 3], [9, 4]]) {
    agora = new Date(2026, 9, 15, h, 1);
    assert.equal(rodadaDevida(P, '06:00'), 'repeticao');
    await rodar(true);
    assert.equal(lerEstado(P).rodada.tentativas, n);
  }
  agora = new Date(2026, 9, 15, 11, 0);
  assert.equal(rodadaDevida(P, '06:00'), false);   // 3 repetições: espera a diária
  agora = new Date(2026, 9, 16, 6, 0, 30);
  assert.equal(rodadaDevida(P, '06:00'), 'diaria');
  await backupDaPlataforma(P, { pasta: destino });   // S3 voltou: rodada completa
  assert.equal(lerEstado(P).rodada.tentativas, 1);
  agora = new Date(2026, 9, 16, 8, 0);
  assert.equal(rodadaDevida(P, '06:00'), false);   // completa não repete
  P.db.close();
});

test('chave-mestra: impressão digital no banco; chave diferente na volta vira alerta e auditoria, sem trocar o registro', async () => {
  const p = pasta();
  const k1 = randomBytes(32), k2 = randomBytes(32);
  const P1 = criarPlataforma({ banco: join(p, 'plataforma.sqlite'), log: () => {}, chaveMestra: k1 });
  const reg = JSON.parse(P1.db.prepare("select value from platform_settings where key = 'chave_mestra_impressao'").get().value);
  assert.equal(reg.impressao, impressaoMestra(k1));
  assert.ok(!reg.impressao.includes(k1.toString('hex').slice(0, 12)));
  P1.db.close();
  const logs = [];
  const P2 = criarPlataforma({ banco: join(p, 'plataforma.sqlite'), log: s => logs.push(String(s)), chaveMestra: k2 });
  assert.equal(P2.alertaChaveMestra.esperada, impressaoMestra(k1));
  assert.equal(JSON.parse(P2.db.prepare("select value from platform_settings where key = 'chave_mestra_impressao'").get().value).impressao, impressaoMestra(k1));
  assert.equal(P2.db.prepare("select count(*) as n from audit_log where action = 'master_key.mismatch'").get().n, 1);
  P2.backup = { hora: '06:00', pasta: join(p, 'b') };
  assert.ok((await avisarBackups(P2)).problemas.some(x => x.tipo === 'chave_mestra'));
  assert.ok(!logs.join('\n').includes(k1.toString('base64')) && !logs.join('\n').includes(k2.toString('base64')));
  P2.db.close();
  // Envelope: abre só com o segredo; formato não carrega a chave em claro.
  const e = selarChaveMestra(k1, 'um-segredo-de-envelope-bem-comprido-123');
  assert.ok(!JSON.stringify(e).includes(k1.toString('base64')));
  assert.ok(abrirEnvelope(e, 'um-segredo-de-envelope-bem-comprido-123').equals(k1));
  assert.throws(() => abrirEnvelope({ ...e, impressao: impressaoMestra(k2) }, 'um-segredo-de-envelope-bem-comprido-123'));
  rmSync(p, { recursive: true, force: true });
});
