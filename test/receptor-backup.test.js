// Receptor de backup (serviço privado no Render com disco próprio): o cliente de backup de produção, sem mudança,
// envia os bancos cifrados; o receptor confere a assinatura, guarda em disco, sobrevive a reinício, devolve o mesmo
// conteúdo para a restauração, declara e cumpre a expiração de 7 dias e não apaga nada pela rede.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { criarReceptor } from '../src/receptor-backup.js';
import { backupDaPlataforma } from '../src/iniciar.js';
import { restaurar } from '../src/backup.js';
import { configS3, listarS3, pedirS3, endpointS3 } from '../src/backup-s3.js';
import { subirPlataforma } from './ajuda-plataforma.js';

const CHAVE = 'greenia-backup', SEGREDO = randomBytes(32).toString('base64');
async function subirReceptor(pasta, op = {}) {
  const r = criarReceptor({ pasta, chave: CHAVE, segredo: SEGREDO, log: () => {}, ...op });
  await new Promise(ok => r.servidor.listen(0, '127.0.0.1', ok));
  // Como o Render entrega o endereço interno de um serviço privado: host:porta, sem esquema.
  const hostport = `127.0.0.1:${r.servidor.address().port}`;
  return { ...r, hostport, fechar: () => new Promise(ok => { r.servidor.close(ok); r.servidor.closeAllConnections?.(); }) };
}

test('endereço interno sem esquema vira http://; com esquema fica como está', () => {
  assert.equal(endpointS3('greenia-backup:10000'), 'http://greenia-backup:10000');
  assert.equal(endpointS3('https://s3.exemplo.com/'), 'https://s3.exemplo.com');
});

test('rodada de produção para o receptor: todos os bancos, em disco, após reinício, restauração idêntica e cifrada', async () => {
  const p = mkdtempSync(join(tmpdir(), 'greenia-receptor-'));
  const S = await subirPlataforma({ banco: join(p, 'plataforma.sqlite'), pastaEmpresas: join(p, 'empresas') });
  let R = await subirReceptor(join(p, 'receptor'));
  try {
    const ops = await S.navegador().entrarConsole('ops@theneil.com.br');
    const plano = (await ops.get('/api/plataforma/planos')).dados.planos[0];
    for (const slug of ['empresa-um', 'empresa-dois']) assert.equal((await ops.post('/api/plataforma/empresas', { name: `Empresa ${slug}`, slug, plan_id: plano.id })).status, 200);
    const env = { BACKUP_DESTINO: 's3://greenia-backups/greenia', S3_ENDPOINT: R.hostport, S3_CHAVE: CHAVE, S3_SEGREDO: SEGREDO, BACKUP_CHAVE_CIFRA: randomBytes(32).toString('base64') };
    const r = await backupDaPlataforma(S.P, { pasta: join(p, 'backups'), destino: env.BACKUP_DESTINO, env, manter: 7 });
    assert.deepEqual([r.total, r.concluidos, r.falhas, r.s3, r.ciclo.ok, r.ciclo.expiraDias], [3, 3, 0, true, true, 7]);
    // Em disco, cifrado: nenhum arquivo do receptor começa como SQLite/gzip nem contém o nome de uma empresa.
    const arquivos = readdirSync(join(p, 'receptor', 'objetos')).filter(n => !n.endsWith('.json'));
    assert.equal(arquivos.length, 3);
    for (const a of arquivos) { const b = readFileSync(join(p, 'receptor', 'objetos', a)); assert.ok(!b.subarray(0, 16).toString('latin1').startsWith('SQLite format') && !(b[0] === 0x1f && b[1] === 0x8b)); }
    // Reinício do receptor: os objetos continuam lá e voltam idênticos (hash conferido pelo cliente).
    await R.fechar(); R = await subirReceptor(join(p, 'receptor'));
    const env2 = { ...env, S3_ENDPOINT: R.hostport };
    const itens = await listarS3(configS3(env2.BACKUP_DESTINO, env2));
    assert.equal(itens.length, 3);
    const plataforma = itens.find(i => /\/plataforma\//.test(i.objeto));
    const x = await restaurar(`s3://greenia-backups/${plataforma.objeto}`, join(p, 'restaurado.sqlite'), { env: env2, tipo: 'plataforma' });
    assert.equal(x.tipo, 'plataforma');
    // Sem a chave de cifra certa, a cópia não abre.
    await assert.rejects(restaurar(`s3://greenia-backups/${plataforma.objeto}`, join(p, 'r2.sqlite'), { tipo: 'plataforma', env: { ...env2, BACKUP_CHAVE_CIFRA: randomBytes(32).toString('base64') } }), e => e.code === 'BACKUP_DECIFRAR');
  } finally { await R.fechar(); await S.fechar(); rmSync(p, { recursive: true, force: true }); }
});

test('segurança: assinatura errada, segredo errado, pedido velho e DELETE são recusados; /saude não expõe nomes', async () => {
  const p = mkdtempSync(join(tmpdir(), 'greenia-receptor-'));
  const R = await subirReceptor(join(p, 'receptor'));
  try {
    const cfg = { endpoint: endpointS3(R.hostport), bucket: 'greenia-backups', chave: CHAVE, segredo: SEGREDO, regiao: 'us-east-1', timeoutMs: 5000 };
    assert.equal((await pedirS3(cfg, 'PUT', { objeto: 'greenia/x/a.enc', corpo: Buffer.from('cifrado') })).status, 200);
    await assert.rejects(pedirS3({ ...cfg, segredo: 'outro-segredo' }, 'GET', { objeto: 'greenia/x/a.enc' }), e => /403/.test(e.code));
    await assert.rejects(pedirS3({ ...cfg, chave: 'outra-chave' }, 'GET', { objeto: 'greenia/x/a.enc' }), e => /403/.test(e.code));
    await assert.rejects(pedirS3(cfg, 'DELETE', { objeto: 'greenia/x/a.enc' }), e => /403/.test(e.code));
    // Pedido assinado há 20 min: recusado (repetição de pedido capturado).
    const velho = criarReceptor({ pasta: join(p, 'receptor'), chave: CHAVE, segredo: SEGREDO, log: () => {}, agora: () => new Date(Date.now() + 20 * 60e3) });
    await new Promise(ok => velho.servidor.listen(0, '127.0.0.1', ok));
    await assert.rejects(pedirS3({ ...cfg, endpoint: `http://127.0.0.1:${velho.servidor.address().port}` }, 'GET', { objeto: 'greenia/x/a.enc' }), e => /403/.test(e.code));
    velho.servidor.close();
    // Chave de objeto com ../ não vira caminho no disco.
    await pedirS3(cfg, 'PUT', { objeto: 'greenia/../../fora.enc', corpo: Buffer.from('x') }).catch(() => null);
    assert.deepEqual(readdirSync(p).sort(), ['receptor']);
    const saude = await (await fetch(`http://${R.hostport}/saude`)).json();
    assert.deepEqual([saude.ok, saude.dias], [true, 7]);
    assert.ok(saude.objetos >= 1);
    assert.doesNotMatch(JSON.stringify(saude), /greenia\//);
  } finally { await R.fechar(); rmSync(p, { recursive: true, force: true }); }
});

test('expiração: declara 7 dias no ciclo de vida e apaga do disco o que passou do prazo', async () => {
  const p = mkdtempSync(join(tmpdir(), 'greenia-receptor-'));
  let agora = new Date();
  const R = await subirReceptor(join(p, 'receptor'), { agora: () => agora, relogio: () => new Date() });
  try {
    const cfg = { endpoint: endpointS3(R.hostport), bucket: 'greenia-backups', chave: CHAVE, segredo: SEGREDO, regiao: 'us-east-1', timeoutMs: 5000 };
    const lc = await pedirS3(cfg, 'GET', { query: 'lifecycle' });
    assert.match(lc.corpo.toString(), /<Status>Enabled<\/Status><Expiration><Days>7<\/Days>/);
    await pedirS3(cfg, 'PUT', { objeto: 'greenia/plataforma/antigo.enc', corpo: Buffer.from('a') });
    agora = new Date(agora.getTime() + 3 * 864e5);
    await pedirS3(cfg, 'PUT', { objeto: 'greenia/plataforma/novo.enc', corpo: Buffer.from('b') });
    agora = new Date(agora.getTime() + 4 * 864e5 + 60e3);   // o antigo passou de 7 dias; o novo tem 4
    assert.equal(R.expirar(), 1);
    assert.deepEqual(R.uso().objetos, 1);
    assert.throws(() => criarReceptor({ pasta: join(p, 'x'), chave: CHAVE, segredo: SEGREDO, dias: 30 }), /entre 1 e 7/);
  } finally { await R.fechar(); rmSync(p, { recursive: true, force: true }); }
});
