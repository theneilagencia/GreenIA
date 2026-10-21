// HTTP/SigV4 e disco reais locais; ENOSPC injetado somente na escrita de estágio.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {criarReceptor} from '../src/receptor-backup.js';
import {pedirS3} from '../src/backup-s3.js';
const segredo=randomBytes(32).toString('base64');
async function subir(pasta){
 const r=criarReceptor({pasta,chave:'teste',segredo,log:()=>{}});
 await new Promise(ok=>r.servidor.listen(0,'127.0.0.1',ok));
 return {...r,cfg:{endpoint:`http://127.0.0.1:${r.servidor.address().port}`,bucket:'greenia-backups',chave:'teste',segredo,regiao:'us-east-1',timeoutMs:2000},fechar:()=>new Promise(ok=>{r.servidor.close(ok);r.servidor.closeAllConnections();})};
}
for(const etapa of ['dados','metadados'])test(`ENOSPC em ${etapa}: limpa estágio, preserva cópia anterior e aceita nova tentativa`,async()=>{
 const pasta=fs.mkdtempSync(join(tmpdir(),'greenia-enospc-'));const R=await subir(pasta);const original=fs.writeFileSync;
 try{
  const objeto='greenia/empresa-teste/copia.enc';
  await pedirS3(R.cfg,'PUT',{objeto,corpo:Buffer.from('copia anterior cifrada')});
  fs.writeFileSync=function(p,d,...resto){
   if(String(p).startsWith(join(pasta,'objetos')) && String(p).endsWith('.tmp') && (etapa==='dados'?!String(p).endsWith('.json.tmp'):String(p).endsWith('.json.tmp'))){
    original(p,Buffer.from(d).subarray(0,3));throw Object.assign(new Error('disco cheio'),{code:'ENOSPC'});
   }
   return original(p,d,...resto);
  };syncBuiltinESMExports();
  await assert.rejects(pedirS3(R.cfg,'PUT',{objeto,corpo:Buffer.from('nova copia cifrada')}),e=>e.code==='S3_HTTP_507');
  assert.deepEqual(fs.readdirSync(join(pasta,'objetos')).filter(n=>n.endsWith('.tmp')),[]);
  assert.equal((await pedirS3(R.cfg,'GET',{objeto})).corpo.toString(),'copia anterior cifrada');
  fs.writeFileSync=original;syncBuiltinESMExports();
  await pedirS3(R.cfg,'PUT',{objeto,corpo:Buffer.from('nova copia cifrada')});
  assert.equal((await pedirS3(R.cfg,'GET',{objeto})).corpo.toString(),'nova copia cifrada');
 }finally{fs.writeFileSync=original;syncBuiltinESMExports();await R.fechar();fs.rmSync(pasta,{recursive:true,force:true});}
});
test('reinício remove somente estágios reconhecidos e preserva cópias dentro da retenção',async()=>{
 const pasta=fs.mkdtempSync(join(tmpdir(),'greenia-estagio-'));let R=await subir(pasta);
 try{
  const objeto='greenia/empresa-teste/copia.enc';await pedirS3(R.cfg,'PUT',{objeto,corpo:Buffer.from('copia valida')});await R.fechar();R=null;
  const dir=join(pasta,'objetos');const h='a'.repeat(64);
  for(const n of [`${h}.123.tmp`,`${h}.json.tmp`,'outro.tmp'])fs.writeFileSync(join(dir,n),'incompleto');
  R=await subir(pasta);
  assert.equal(fs.existsSync(join(dir,`${h}.123.tmp`)),false);assert.equal(fs.existsSync(join(dir,`${h}.json.tmp`)),false);
  assert.equal(fs.existsSync(join(dir,'outro.tmp')),true);
  assert.equal((await pedirS3(R.cfg,'GET',{objeto})).corpo.toString(),'copia valida');assert.equal(R.uso().objetos,1);
 }finally{if(R)await R.fechar();fs.rmSync(pasta,{recursive:true,force:true});}
});
