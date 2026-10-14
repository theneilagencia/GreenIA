// Backup consistente com o servidor no ar, retenção local, envio para S3 só com a expiração conferida no bucket
// (assinatura conferida contra o exemplo oficial da AWS) e restauração conferida.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { subir } from './ajuda.js';
import { abrirBanco, migrar, um } from '../src/db.js';
import { assinarS3, avaliarLifecycle, fazerBackup, restaurar } from '../src/backup.js';

let S, pasta;
before(async () => {
  pasta = mkdtempSync(join(tmpdir(), 'greenia-backup-'));
  S = await subir({ banco: join(pasta, 'greenia.sqlite') });
  const admin = await S.cliente().entrar('admin@exemplo.com.br');
  await admin.post('/api/admin/areas', { nome: 'Área Alfa' });
});
after(() => S.fechar());

test('assinatura SigV4 igual ao exemplo da documentação da AWS (GET Object)', () => {
  const h = assinarS3({
    metodo: 'GET', url: 'https://examplebucket.s3.amazonaws.com/test.txt', cabecalhos: { range: 'bytes=0-9' },
    hashCorpo: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', chave: 'AKIAIOSFODNN7EXAMPLE',
    segredo: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', regiao: 'us-east-1', agora: new Date('2013-05-24T00:00:00Z'),
  });
  assert.match(h.authorization, /Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41$/);
});

// S3 falso: guarda os objetos e responde às consultas de configuração do bucket (lifecycle, versioning, object-lock).
async function s3Falso(bucket = {}) {
  const recebidos = [], objetos = new Map();
  const srv = createServer((req, res) => {
    const p = []; req.on('data', d => p.push(d));
    req.on('end', () => {
      const corpo = Buffer.concat(p), u = new URL(req.url, 'http://x');
      recebidos.push({ metodo: req.method, url: req.url, auth: req.headers.authorization, corpo });
      const consulta = ['lifecycle', 'versioning', 'object-lock'].find(q => u.searchParams.has(q));
      if (consulta) {
        const v = bucket[consulta];
        if (v == null) { res.statusCode = consulta === 'versioning' ? 200 : 404; return res.end(consulta === 'versioning' ? '<VersioningConfiguration/>' : '<Error/>'); }
        if (typeof v === 'number') { res.statusCode = v; return res.end('<Error/>'); }
        return res.end(v);
      }
      if (req.method === 'PUT') { objetos.set(u.pathname, corpo); return res.end(''); }
      if (!objetos.has(u.pathname)) { res.statusCode = 404; return res.end(''); }
      res.end(objetos.get(u.pathname));
    });
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const env = { S3_ENDPOINT: `http://127.0.0.1:${srv.address().port}`, S3_CHAVE: 'chave', S3_SEGREDO: 'segredo', S3_REGIAO: 'sa-east-1' };
  return { srv, env, recebidos, objetos, puts: () => recebidos.filter(x => x.metodo === 'PUT') };
}
const regra = ({ prefixo = '', dias = 7, antigas = null, status = 'Enabled', extraFiltro = '' } = {}) =>
  `<Rule><ID>r</ID><Filter>${extraFiltro ? `<And><Prefix>${prefixo}</Prefix>${extraFiltro}</And>` : `<Prefix>${prefixo}</Prefix>`}</Filter><Status>${status}</Status>`
  + (dias ? `<Expiration><Days>${dias}</Days></Expiration>` : '') + (antigas ? `<NoncurrentVersionExpiration><NoncurrentDays>${antigas}</NoncurrentDays></NoncurrentVersionExpiration>` : '') + '</Rule>';
const lifecycle = (...r) => `<LifecycleConfiguration>${r.join('')}</LifecycleConfiguration>`;

test('backup com o servidor no ar, retenção local, envio ao S3 (expiração conferida no bucket) e restauração com conferência', async () => {
  const s3 = await s3Falso({ lifecycle: lifecycle(regra({ prefixo: 'empresa/', dias: 7 })) });
  const { env } = s3;
  const bk = join(pasta, 'backups');
  const dias = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04'];
  let r;
  for (const d of dias) r = await fazerBackup(S.app.db, { pasta: bk, destino: 's3://greenia-backups/empresa', manter: 3, agora: new Date(`${d}T03:00:00Z`), env });
  assert.equal(readdirSync(bk).length, 3);
  assert.ok(!readdirSync(bk).some(f => f.includes('20260901')));
  assert.equal(s3.puts().length, 4);
  assert.deepEqual(r.s3, { ok: true, expiraDias: 7, antigasDias: null, versionado: false });
  // Antes de cada envio, a regra é lida no próprio bucket.
  assert.ok(s3.recebidos.some(x => x.metodo === 'GET' && x.url === '/greenia-backups?lifecycle'));
  assert.match(s3.puts().at(-1).url, /^\/greenia-backups\/empresa\/greenia-20260904-030000\.sqlite\.gz$/);
  assert.match(s3.puts()[0].auth, /Credential=chave\/\d{8}\/sa-east-1\/s3\/aws4_request/);
  // Restaura num banco novo, a partir do arquivo local e do S3.
  const novo = join(pasta, 'restaurado.sqlite');
  const x = await restaurar(r.local, novo);
  assert.ok(x.pessoas >= 1 && x.eventos >= 1);
  const db = abrirBanco(novo);
  assert.equal(um(db, 'select nome from areas').nome, 'Área Alfa');
  db.close();
  const y = await restaurar('s3://greenia-backups/empresa/greenia-20260901-030000.sqlite.gz', novo, { env });
  assert.ok(y.anterior && existsSync(y.anterior));
  s3.srv.close();
});

test('S3 bloqueado sem expiração verificada no bucket: a cópia fica só no disco local, com o motivo', async () => {
  const casos = [
    [{}, /não tem regra de expiração/],
    [{ lifecycle: 403 }, /não foi possível ler a regra de expiração do bucket \(403\)/],
    [{ lifecycle: lifecycle(regra({ dias: 30 })) }, /expira em 30 dias, mais que o limite de 7/],
    [{ lifecycle: lifecycle(regra({ dias: 7, status: 'Disabled' })) }, /nenhuma regra ativa/],
    [{ lifecycle: lifecycle(regra({ prefixo: 'outro/', dias: 1 })) }, /nenhuma regra ativa de expiração cobre o prefixo "empresa\/"/],
    [{ lifecycle: lifecycle(regra({ dias: 1, extraFiltro: '<Tag><Key>a</Key><Value>b</Value></Tag>' })) }, /nenhuma regra ativa/],
    [{ lifecycle: lifecycle(regra({ dias: 7 })), versioning: '<VersioningConfiguration><Status>Enabled</Status></VersioningConfiguration>' }, /versionamento e sem expiração das versões antigas/],
    [{ lifecycle: lifecycle(regra({ dias: 5, antigas: 5 })), versioning: '<VersioningConfiguration><Status>Suspended</Status></VersioningConfiguration>' }, /mais versões antigas \(5 dias\) passa do limite de 7/],
    [{ lifecycle: lifecycle(regra({ dias: 7 })), 'object-lock': '<ObjectLockConfiguration><ObjectLockEnabled>Enabled</ObjectLockEnabled></ObjectLockConfiguration>' }, /Object Lock/],
    [{ lifecycle: lifecycle(regra({ dias: 7 })), versioning: 500 }, /versionamento do bucket \(500\)/],
  ];
  const bk = join(pasta, 'backups-s3-bloqueado');
  for (const [bucket, motivo] of casos) {
    const s3 = await s3Falso(bucket);
    const r = await fazerBackup(S.app.db, { pasta: bk, destino: 's3://greenia-backups/empresa', manter: 3, env: { ...s3.env, S3_LIFECYCLE_DIAS: '7' } });
    assert.equal(r.remoto, null, JSON.stringify(bucket));
    assert.match(r.s3Bloqueado, motivo);
    assert.equal(s3.puts().length, 0, 'nada vai ao bucket; a variável declarada não libera o envio');
    assert.ok(existsSync(r.local), 'a cópia local continua sendo feita');
    s3.srv.close();
  }
  // Bucket fora do ar: bloqueado, sem derrubar o backup local.
  const r = await fazerBackup(S.app.db, { pasta: bk, destino: 's3://b/p', manter: 3, env: { S3_ENDPOINT: 'http://127.0.0.1:1', S3_CHAVE: 'c', S3_SEGREDO: 's' } });
  assert.match(r.s3Bloqueado, /não foi possível consultar o bucket/);
  // Versionado com as duas expirações dentro do limite: liberado.
  const ok = await s3Falso({ lifecycle: lifecycle(regra({ dias: 6, antigas: 1 })), versioning: '<VersioningConfiguration><Status>Enabled</Status></VersioningConfiguration>', 'object-lock': 501 });
  const r2 = await fazerBackup(S.app.db, { pasta: bk, destino: 's3://greenia-backups/empresa', manter: 3, env: ok.env });
  assert.ok(r2.remoto);
  assert.deepEqual(r2.s3, { ok: true, expiraDias: 6, antigasDias: 1, versionado: true });
  ok.srv.close();
});

test('regra de expiração: prefixo coberto, menor prazo entre as regras e versões antigas retidas por contagem não valem', () => {
  assert.equal(avaliarLifecycle(lifecycle(regra({ prefixo: '', dias: 3 }), regra({ prefixo: 'empresa/', dias: 30 })), { prefixo: 'empresa/plataforma/' }).expiraDias, 3);
  assert.equal(avaliarLifecycle(lifecycle('<Rule><Prefix>empresa/</Prefix><Status>Enabled</Status><Expiration><Days>2</Days></Expiration></Rule>'), { prefixo: 'empresa/emp_a/' }).ok, true, 'formato antigo (Prefix fora do Filter)');
  const comContagem = lifecycle('<Rule><Filter/><Status>Enabled</Status><Expiration><Days>3</Days></Expiration><NoncurrentVersionExpiration><NoncurrentDays>1</NoncurrentDays><NewerNoncurrentVersions>5</NewerNoncurrentVersions></NoncurrentVersionExpiration></Rule>');
  assert.match(avaliarLifecycle(comContagem, { prefixo: 'x/', versionado: true }).motivo, /sem expiração das versões antigas/);
  assert.equal(avaliarLifecycle(lifecycle(regra({ dias: 9 })), { limiteDias: 10 }).ok, true);
  assert.equal(avaliarLifecycle('', {}).ok, false);
});

test('restauração recusa arquivo corrompido ou que não é da GreenIA, sem mexer no banco atual', async () => {
  const lixo = join(pasta, 'lixo.sqlite.gz');
  writeFileSync(lixo, gzipSync(Buffer.from('não é um banco')));
  const alvo = join(pasta, 'alvo.sqlite');
  writeFileSync(alvo, 'original');
  await assert.rejects(restaurar(lixo, alvo));
  const outro = join(pasta, 'outro.sqlite');
  const d = new DatabaseSync(outro); d.exec('create table x (a)'); d.close();
  writeFileSync(lixo, gzipSync(readFileSync(outro)));
  await assert.rejects(restaurar(lixo, alvo), /não é um banco da GreenIA/);
  assert.equal(readFileSync(alvo, 'utf8'), 'original');
});

test('migração: cada mudança de estrutura roda uma vez, em ordem; uma falha não deixa pela metade', () => {
  const db = abrirBanco(':memory:');
  db.exec('pragma user_version = 0');
  const lista = ['alter table areas add column extra text', "update areas set extra = 'x'"];
  migrar(db, lista);
  migrar(db, lista);
  assert.equal(db.prepare('pragma user_version').get().user_version, 2);
  assert.throws(() => migrar(db, [...lista, 'alter table areas add column extra2 text', 'isto não é sql']));
  assert.equal(db.prepare('pragma user_version').get().user_version, 3);
  db.close();
});

test('migração 1: banco da versão anterior ganha os oito estados do quick win, responsável e tipo de medição', () => {
  const arq = join(pasta, 'antigo.sqlite');
  const d = new DatabaseSync(arq);
  d.exec(`create table config (chave text primary key, valor text not null);
    create table pessoas (id integer primary key, email text unique not null, nome text not null, papel text not null default 'pessoa', ativo integer not null default 1, ciencia_versao integer, criado_em text);
    create table quick_wins (id integer primary key, nome text not null, cor text not null default '#1B7950', icone text not null default '', para_que_serve text not null default '', instrucoes text not null default '',
      toda_empresa integer not null default 0, bases text not null default '{}', modelo text, pode_trocar integer not null default 0, formato text not null default 'texto', sugestoes text not null default '[]',
      exemplo_entrada text not null default '', exemplo_saida text not null default '', sigiloso integer not null default 0, dados text not null default '{}',
      status text not null default 'rascunho' check (status in ('rascunho','ativo','pausado')), criado_por integer, criado_em text not null default (datetime('now')), atualizado_em text not null default (datetime('now')));
    create table medicoes (id integer primary key, quick_win_id integer not null references quick_wins(id) on delete cascade, indicador text not null, antes_valor real, antes_data text, antes_origem text,
      depois_valor real, depois_data text, depois_origem text, observacao text not null default '', criado_por integer, atualizado_em text not null);
    insert into pessoas (id, email, nome) values (7, 'ana@exemplo.com.br', 'Ana');
    insert into quick_wins (id, nome, status, criado_por) values (1, 'A', 'ativo', 7), (2, 'B', 'rascunho', 7), (3, 'C', 'pausado', 7);
    insert into medicoes (quick_win_id, indicador, atualizado_em) values (1, 'minutos', '2026-09-01');`);
  d.close();
  const db = abrirBanco(arq);
  assert.deepEqual(db.prepare('select id, status, responsavel_id from quick_wins order by id').all().map(q => [q.id, q.status, q.responsavel_id]),
    [[1, 'em_uso', 7], [2, 'em_configuracao', 7], [3, 'em_configuracao', 7]]);
  assert.equal(db.prepare('select tipo from medicoes').get().tipo, 'outro');
  assert.equal(db.prepare('pragma foreign_key_check').all().length, 0);
  db.close();
});
