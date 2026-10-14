import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';
import {abrirPlataforma} from '../src/plataforma/db.js';
import {abrirBanco} from '../src/db.js';
import {fazerBackupLocal,restaurar} from '../src/backup.js';
import {backupDaPlataforma} from '../src/iniciar.js';

test('restauração da plataforma preserva empresas, identidades e configuração em cópia isolada',async()=>{
 const pasta=mkdtempSync(join(tmpdir(),'greenia-plataforma-restore-'));
 const db=abrirPlataforma(join(pasta,'origem.sqlite'));
 try{
  db.prepare('insert into users(id,email,name,created_at) values(?,?,?,?)').run('qa','qa@example.test','QA','2026-10-14');
  db.prepare('insert into companies(id,name,slug,banco,created_at,updated_at) values(?,?,?,?,?,?)').run('qa-empresa','Empresa QA','qa-empresa','empresa.sqlite','2026-10-14','2026-10-14');
  db.prepare('insert into platform_settings(key,value) values(?,?)').run('qa','{"controle":"preservado"}');
  const b=fazerBackupLocal(db,{pasta:join(pasta,'copias')});
  assert.equal(b.sha256,createHash('sha256').update(readFileSync(b.local)).digest('hex'));
  const destino=join(pasta,'restaurado.sqlite');
  const r=await restaurar(b.local,destino,{tipo:'plataforma'});
  assert.equal(r.tipo,'plataforma');assert.equal(r.empresas,1);assert.equal(r.usuarios,1);
  const copia=new DatabaseSync(destino,{readOnly:true});try{assert.equal(copia.prepare("select value from platform_settings where key='qa'").get().value,'{"controle":"preservado"}');}finally{copia.close();}
  const cli=join(pasta,'cli.sqlite');
  const env={...process.env,MULTIEMPRESA:'1',BANCO_PLATAFORMA:cli};
  const texto=execFileSync(process.execPath,['--disable-warning=ExperimentalWarning','scripts/restaurar.js',b.local],{env,encoding:'utf8'});
  assert.match(texto,/Plataforma restaurada/);const cliDb=new DatabaseSync(cli,{readOnly:true});try{assert.equal(cliDb.prepare('select count(*) as n from companies').get().n,1);}finally{cliDb.close();}
  const errado=spawnSync(process.execPath,['--disable-warning=ExperimentalWarning','scripts/restaurar.js',b.local,'--banco'],{env,encoding:'utf8'});
  assert.equal(errado.status,1);assert.match(errado.stderr,/sempre com valor/);
 }finally{db.close();rmSync(pasta,{recursive:true,force:true});}
});
test('rodada de backup registra falha parcial e continua as outras empresas sem declarar sucesso integral',async()=>{
 const logs=[],vistos=[];const plataforma={},a={},b={};
 const P={db:plataforma,tenants:new Map([['a',{db:a}],['b',{db:b}]]),log:s=>logs.push(s)};
 const r=await backupDaPlataforma(P,{pasta:'/tmp/qa-backup',destino:'s3://qa/copias'},async(db,op)=>{vistos.push(op);if(db===a)throw Object.assign(new Error('não imprimir conteúdo'),{code:'ENOSPC'});return {tamanho:100,sha256:'a'.repeat(64)};});
 assert.deepEqual(r,{total:3,concluidos:2,falhas:1,s3:true});assert.equal(vistos.length,3);assert.equal(vistos[2].banco,'b');assert.equal(vistos[2].destino,'s3://qa/copias');assert.equal(vistos[2].pasta,'/tmp/qa-backup/b');
 assert.match(logs.at(-1),/incompleto: 2\/3 bancos; 1 falhas/);assert.doesNotMatch(logs.join('\n'),/backup diário concluído|não imprimir conteúdo/);
 const ok=await backupDaPlataforma(P,{pasta:'/tmp/qa-backup'},async()=>({tamanho:100,sha256:'b'.repeat(64)}));assert.equal(ok.falhas,0);assert.match(logs.at(-1),/concluído: 3\/3 bancos; 0 falhas/);
});
test('tipo incorreto e referências quebradas não substituem o destino da restauração',async()=>{
 const pasta=mkdtempSync(join(tmpdir(),'greenia-restore-guard-'));
 const db=abrirBanco(join(pasta,'empresa.sqlite'));
 try{
  const alvo=join(pasta,'alvo.sqlite');writeFileSync(alvo,'preservar');
  const b=fazerBackupLocal(db,{pasta:join(pasta,'copias')});
  await assert.rejects(restaurar(b.local,alvo,{tipo:'plataforma'}),/plataforma/);
  assert.equal(readFileSync(alvo,'utf8'),'preservar');
  db.exec("pragma foreign_keys=off; insert into pessoas(id,email,nome,papel) values(1,'qa@example.test','QA','usuario'); create table qa_ref(id integer references pessoas(id)); insert into qa_ref values(999)");
  const ruim=join(pasta,'ruim.sqlite');db.exec(`VACUUM INTO '${ruim}'`);
  const gz=join(pasta,'ruim.gz');writeFileSync(gz,gzipSync(readFileSync(ruim)));
  await assert.rejects(restaurar(gz,alvo),/referências/);
  assert.equal(readFileSync(alvo,'utf8'),'preservar');
 }finally{db.close();rmSync(pasta,{recursive:true,force:true});}
});
