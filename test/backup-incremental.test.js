import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes, createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { gzipSync, gunzipSync } from 'node:zlib';
import { syncBuiltinESMExports } from 'node:module';
import { criarReceptor } from '../src/receptor-backup.js';
import { configS3, enviarBackupS3, baixarBackupS3, pedirS3, listarS3, maisNovosPorBanco } from '../src/backup-s3.js';
import { fazerBackupLocal } from '../src/backup.js';
import { MAGICO_INCREMENTAL, indiceIncremental } from '../src/backup-incremental-formato.js';
const hash = d => createHash('sha256').update(d).digest('hex');
const DIA = 864e5;
async function fixture() {
 const pasta = fs.mkdtempSync(join(tmpdir(), 'greenia-incremental-'));
 let tempo = Date.UTC(2026,9,1);
 let r;
 const env = { BACKUP_DESTINO:'s3://greenia-backups/greenia', S3_CHAVE:'teste', S3_SEGREDO:randomBytes(32).toString('base64'), BACKUP_CHAVE_CIFRA:randomBytes(32).toString('base64'), BACKUP_INCREMENTAL:'1' };
 const iniciar = async () => {
  r = criarReceptor({pasta:join(pasta,'receptor'),chave:env.S3_CHAVE,segredo:env.S3_SEGREDO,agora:()=>new Date(tempo),relogio:()=>new Date(),log:()=>{}});
  await new Promise(ok=>r.servidor.listen(0,'127.0.0.1',ok));
  env.S3_ENDPOINT=`http://127.0.0.1:${r.servidor.address().port}`;
 };
 const parar = () => new Promise(ok=>{r.servidor.close(ok);r.servidor.closeAllConnections();});
 await iniciar();
 const cfg=()=>configS3(env.BACKUP_DESTINO,env);
 let rodada=0;
 const enviar=(raw,banco='emp_teste',op={})=>enviarBackupS3(cfg(),{banco,carimbo:`202610${String(++rodada).padStart(2,'0')}-060000`,gz:gzipSync(raw,{level:9}),criadoEm:new Date(tempo).toISOString(),verificacao:{resultado:{ok:true}},...op});
 return { pasta,env,cfg,enviar,get r(){return r;},avancar:d=>{tempo+=d*DIA;},reiniciar:async()=>{await parar();await iniciar();},fechar:async()=>{await parar();fs.rmSync(pasta,{recursive:true,force:true});} };
}
test('SQLite real: alteração pontual envia só blocos novos, preserva ambos os pontos e sobrevive a reinício',async()=>{
 const F=await fixture(); const db=new DatabaseSync(join(F.pasta,'origem.sqlite'));
 try {
  db.exec('create table dados(id integer primary key, valor blob)');
  const ins=db.prepare('insert into dados values (?,?)');
  db.exec('begin');for(let i=0;i<1024;i++)ins.run(i,randomBytes(2048));db.exec('commit');
  const copiar=()=>fs.readFileSync(fazerBackupLocal(db,{pasta:join(F.pasta,'locais')}).local);
  const anterior=Buffer.from(db.prepare('select valor from dados where id=500').get().valor);
  const a=await F.enviar(gunzipSync(copiar()));
  const alterado=Buffer.alloc(2048,42);
  db.prepare('update dados set valor=? where id=500').run(alterado);
  const b=await F.enviar(gunzipSync(copiar()));
  assert.ok(b.incremental.reutilizados>0);assert.ok(b.incremental.enviados>0);
  assert.ok(b.incremental.bytesEnviados<a.incremental.bytesEnviados/2,JSON.stringify({a:a.incremental,b:b.incremental}));
  await F.reiniciar();
  for(const [x,esperado] of [[a,anterior],[b,alterado]]){
   const raw=gunzipSync((await baixarBackupS3(F.cfg(),x.objeto)).gz);
   const p=join(F.pasta,'restaurado.sqlite');fs.writeFileSync(p,raw);
   const c=new DatabaseSync(p,{readOnly:true});try{assert.equal(c.prepare('pragma integrity_check').get().integrity_check,'ok');assert.deepEqual(Buffer.from(c.prepare('select valor from dados where id=500').get().valor),esperado);assert.equal(c.prepare('select count(*) n from dados').get().n,1024);}finally{c.close();}
  }
  const lista=maisNovosPorBanco(await listarS3(F.cfg()));assert.equal(lista.get('emp_teste').objeto,b.objeto);
 }finally{db.close();await F.fechar();}
});
test('retenção expira índices antigos, preserva blocos ainda referenciados e coleta só órfãos',async()=>{
 const F=await fixture();try{
  const raw=randomBytes(600000),a=await F.enviar(raw);
  F.avancar(6);const b=await F.enviar(raw);assert.equal(b.incremental.enviados,0);
  F.avancar(2);F.r.expirar();
  await assert.rejects(baixarBackupS3(F.cfg(),a.objeto),e=>e.code==='S3_HTTP_404');
  assert.deepEqual(gunzipSync((await baixarBackupS3(F.cfg(),b.objeto)).gz),raw);
  F.avancar(6);F.r.expirar();assert.equal(F.r.uso().objetos,0);
 }finally{await F.fechar();}
});
test('índice ausente, bloco removido/corrompido e chave errada falham sem aceitar entrega parcial',async()=>{
 const F=await fixture();try{
  const a=await F.enviar(randomBytes(600000));
  await assert.rejects(baixarBackupS3({...F.cfg(),cifra:randomBytes(32)},a.objeto),e=>e.code==='INCREMENTAL_RESTAURACAO');
  const body=(await pedirS3(F.cfg(),'GET',{objeto:a.objeto})).corpo;
  const ref=indiceIncremental(body,a.objeto).refs[0];const p=join(F.pasta,'receptor','objetos',hash(ref));const anterior=fs.readFileSync(p);
  fs.writeFileSync(p,'corrompido');await assert.rejects(baixarBackupS3(F.cfg(),a.objeto),e=>e.code==='INCREMENTAL_RESTAURACAO');
  fs.writeFileSync(p,anterior);fs.rmSync(p);await assert.rejects(baixarBackupS3(F.cfg(),a.objeto),e=>e.code==='INCREMENTAL_RESTAURACAO');

 }finally{await F.fechar();}
});
test('publicação recusa referência ausente ou de outro banco; mesma carga não deduplica entre empresas/chaves',async()=>{
 const F=await fixture();try{
  const raw=randomBytes(300000),a=await F.enviar(raw,'emp_a'),b=await F.enviar(raw,'emp_b');assert.ok(b.incremental.enviados>0);
  const r=await pedirS3(F.cfg(),'GET',{objeto:a.objeto});const j=indiceIncremental(r.corpo,a.objeto);
  for(const refs of [[j.refs[0].replace('emp_a/','emp_b/')],[j.refs[0].replace(/[a-f0-9]{64}\.gz\.enc$/,'a'.repeat(64)+'.gz.enc')]]){
   const corpo=Buffer.concat([MAGICO_INCREMENTAL,Buffer.from(JSON.stringify({...j,refs}))]);
   await assert.rejects(pedirS3(F.cfg(),'PUT',{objeto:a.objeto,corpo,cabecalhos:{'x-amz-meta-sha256-cifrado':hash(corpo)}}),e=>['S3_HTTP_400','S3_HTTP_409'].includes(e.code));
  }
  F.env.BACKUP_CHAVE_CIFRA=randomBytes(32).toString('base64');const c=await F.enviar(raw,'emp_a');assert.ok(c.incremental.enviados>0);
 }finally{await F.fechar();}
});
test('falha no índice não publica cópia; repetição reutiliza blocos confirmados, órfãos expiram',async()=>{
 const F=await fixture();try{
  const cfg=F.cfg(),raw=randomBytes(600000),gz=gzipSync(raw),op={banco:'emp_teste',carimbo:'20261001-060000',gz,criadoEm:new Date().toISOString(),verificacao:{resultado:{ok:true}}};
  const falhar=async(u,o)=>{if(o.method==='PUT'&&String(u).includes('greenia-emp_teste-'))return new Response('indisponível',{status:503});return fetch(u,o);};
  await assert.rejects(enviarBackupS3(cfg,op,falhar),e=>e.code==='S3_HTTP_503');
  assert.equal(maisNovosPorBanco(await listarS3(cfg)).size,0);
  const a=await enviarBackupS3(cfg,op);assert.equal(a.incremental.enviados,0);assert.ok(a.incremental.reutilizados>0);
  assert.deepEqual(gunzipSync((await baixarBackupS3(cfg,a.objeto)).gz),raw);
  // Nova empresa: só blocos, sem índice. Coleta após a margem de upload.
  await assert.rejects(enviarBackupS3(cfg,{...op,banco:'emp_orfa'},async(u,o)=>o.method==='PUT'&&String(u).includes('greenia-emp_orfa-')?new Response('',{status:503}):fetch(u,o)));
  F.avancar(1);F.r.expirar();assert.equal((await listarS3(cfg,'emp_orfa/')).length,0);
  assert.deepEqual(gunzipSync((await baixarBackupS3(cfg,a.objeto)).gz),raw);
 }finally{await F.fechar();}
});
test('ENOSPC no bloco limpa estágio, mantém histórico e não registra índice; repetição recupera',async()=>{
 const F=await fixture(),escrever=fs.writeFileSync;try{
  const raw=randomBytes(300000);const a=await F.enviar(raw);
  fs.writeFileSync=(p,d,...args)=>{if(String(p).startsWith(join(F.pasta,'receptor'))&&String(p).endsWith('.tmp')){escrever(p,Buffer.from(d).subarray(0,3));throw Object.assign(new Error('cheio'),{code:'ENOSPC'});}return escrever(p,d,...args);};syncBuiltinESMExports();
  await assert.rejects(F.enviar(randomBytes(300000)),e=>e.code==='S3_HTTP_507');
  assert.equal(fs.readdirSync(join(F.pasta,'receptor','objetos')).filter(x=>x.endsWith('.tmp')).length,0);
  assert.deepEqual(gunzipSync((await baixarBackupS3(F.cfg(),a.objeto)).gz),raw);
  fs.writeFileSync=escrever;syncBuiltinESMExports();await F.enviar(randomBytes(300000));
 }finally{fs.writeFileSync=escrever;syncBuiltinESMExports();await F.fechar();}
});
test('legado continua restaurável e destino sem capacidade não recebe formato incremental',async()=>{
 const F=await fixture();try{
  F.env.BACKUP_INCREMENTAL='0';const raw=randomBytes(300000),a=await F.enviar(raw);assert.equal(a.incremental,undefined);
  F.env.BACKUP_INCREMENTAL='1';assert.deepEqual(gunzipSync((await baixarBackupS3(F.cfg(),a.objeto)).gz),raw);
  let puts=0;
  await assert.rejects(enviarBackupS3(F.cfg(),{banco:'emp_teste',carimbo:'20261002-060000',gz:gzipSync(raw),verificacao:{resultado:{ok:true}}},async(u,o)=>{if(o.method==='PUT')puts++;return new Response('<Error/>',{status:400});}),e=>e.code==='INCREMENTAL_DESTINO');assert.equal(puts,0);
  await assert.rejects(enviarBackupS3(F.cfg(),{banco:'emp_teste',carimbo:'20261002-060000',gz:gzipSync(raw)}),e=>e.code==='S3_SEM_EXPIRACAO');
 }finally{await F.fechar();}
});

test('índice corrompido suspende coleta de blocos; corrupção de bloco é detectada e reparada em nova cópia',async()=>{
 const F=await fixture();try{
  const raw=randomBytes(300000),a=await F.enviar(raw),p=join(F.pasta,'receptor','objetos',hash(a.objeto));
  const corpo=fs.readFileSync(p),ref=indiceIncremental(corpo,a.objeto).refs[0],bloco=join(F.pasta,'receptor','objetos',hash(ref));
  fs.writeFileSync(bloco,'alterado');
  await assert.rejects(baixarBackupS3(F.cfg(),a.objeto),e=>e.code==='INCREMENTAL_RESTAURACAO');
  const b=await F.enviar(raw);assert.equal(b.incremental.enviados,1);
  assert.deepEqual(gunzipSync((await baixarBackupS3(F.cfg(),a.objeto)).gz),raw);
  assert.deepEqual(gunzipSync((await baixarBackupS3(F.cfg(),b.objeto)).gz),raw);
  fs.writeFileSync(p,'índice danificado');F.avancar(2);F.r.expirar();assert.ok(fs.existsSync(bloco));
 }finally{await F.fechar();}
});
test('blocos repetidos preservam ordem e múltiplos pontos independem dos índices anteriores',async()=>{
 const F=await fixture();try{
  const raw=Buffer.concat([Buffer.alloc(262144,42),Buffer.alloc(262144,42),Buffer.alloc(200,7)]);
  const a=await F.enviar(raw);assert.equal(a.incremental.enviados,2);assert.equal(a.incremental.reutilizados,1);
  const b=await F.enviar(raw);assert.equal(b.incremental.enviados,0);
  fs.rmSync(join(F.pasta,'receptor','objetos',hash(a.objeto)));fs.rmSync(join(F.pasta,'receptor','objetos',hash(a.objeto)+'.json'));
  assert.deepEqual(gunzipSync((await baixarBackupS3(F.cfg(),b.objeto)).gz),raw);
 }finally{await F.fechar();}
});
