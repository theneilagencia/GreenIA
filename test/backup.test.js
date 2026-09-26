// Backup consistente com o servidor no ar, retenção local, envio para S3
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
import { assinarS3, fazerBackup, restaurar } from '../src/backup.js';

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

test('backup com o servidor no ar, retenção local, envio ao S3 e restauração com conferência', async () => {
  const recebidos = [];
  const s3 = createServer((req, res) => { const p = []; req.on('data', d => p.push(d)); req.on('end', () => { recebidos.push({ metodo: req.method, url: req.url, auth: req.headers.authorization, corpo: Buffer.concat(p) }); res.end(req.method === 'GET' ? recebidos[0].corpo : ''); }); });
  await new Promise(r => s3.listen(0, '127.0.0.1', r));
  const env = { S3_ENDPOINT: `http://127.0.0.1:${s3.address().port}`, S3_CHAVE: 'chave', S3_SEGREDO: 'segredo', S3_REGIAO: 'sa-east-1' };
  const bk = join(pasta, 'backups');
  const dias = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04'];
  let r;
  for (const d of dias) r = await fazerBackup(S.app.db, { pasta: bk, destino: 's3://greenia-backups/empresa', manter: 3, agora: new Date(`${d}T03:00:00Z`), env });
  assert.equal(readdirSync(bk).length, 3);
  assert.ok(!readdirSync(bk).some(f => f.includes('20260901')));
  assert.equal(recebidos[0].metodo, 'PUT');
  assert.match(recebidos.at(-1).url, /^\/greenia-backups\/empresa\/greenia-20260904-030000\.sqlite\.gz$/);
  assert.match(recebidos[0].auth, /Credential=chave\/\d{8}\/sa-east-1\/s3\/aws4_request/);
  // Restaura num banco novo, a partir do arquivo local e do S3.
  const novo = join(pasta, 'restaurado.sqlite');
  const x = await restaurar(r.local, novo);
  assert.ok(x.pessoas >= 1 && x.eventos >= 1);
  const db = abrirBanco(novo);
  assert.equal(um(db, 'select nome from areas').nome, 'Área Alfa');
  db.close();
  const y = await restaurar('s3://greenia-backups/empresa/greenia-20260901-030000.sqlite.gz', novo, { env });
  assert.ok(y.anterior && existsSync(y.anterior));
  s3.close();
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
