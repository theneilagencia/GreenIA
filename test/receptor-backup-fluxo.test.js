import {test} from 'node:test';
import assert from 'node:assert/strict';
import {request} from 'node:http';
import {mkdtempSync,rmSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {criarReceptor} from '../src/receptor-backup.js';
import {pedirS3,assinarS3} from '../src/backup-s3.js';
const hash=b=>createHash('sha256').update(b).digest('hex');
async function fixture(maxBytes=1024*1024){
 const pasta=mkdtempSync(join(tmpdir(),'greenia-fluxo-')),r=criarReceptor({pasta,chave:'teste',segredo:'segredo-sintetico',maxBytes,log:()=>{}});
 await new Promise(ok=>r.servidor.listen(0,'127.0.0.1',ok));
 const cfg={endpoint:`http://127.0.0.1:${r.servidor.address().port}`,bucket:'greenia-backups',chave:'teste',segredo:'segredo-sintetico',regiao:'us-east-1',timeoutMs:2000};
 return{pasta,r,cfg,fechar:async()=>{await new Promise(ok=>{r.servidor.close(ok);r.servidor.closeAllConnections();});rmSync(pasta,{recursive:true,force:true});}};
}
test('hash incorreto e upload acima do limite não substituem cópia nem deixam estágio',async()=>{
 const F=await fixture(16);try{
  const objeto='greenia/teste/a.enc',url=F.cfg.endpoint+'/'+F.cfg.bucket+'/'+objeto;
  await pedirS3(F.cfg,'PUT',{objeto,corpo:Buffer.from('anterior')});
  for(const [corpo,h,status] of [[Buffer.from('errado'),hash('outro'),400],[Buffer.alloc(17),hash(Buffer.alloc(17)),413]]){
   const r=await fetch(url,{method:'PUT',body:corpo,headers:assinarS3({...F.cfg,url,metodo:'PUT',hashCorpo:h})});assert.equal(r.status,status);await r.arrayBuffer();
   assert.equal((await pedirS3(F.cfg,'GET',{objeto})).corpo.toString(),'anterior');
   assert.equal(readdirSync(join(F.pasta,'objetos')).filter(x=>x.endsWith('.tmp')).length,0);
  }
 }finally{await F.fechar();}
});
test('upload concorrente recebe 503; cópia anterior é legível até a publicação completa',async()=>{
 const F=await fixture();let req;try{
  const objeto='greenia/teste/a.enc',url=F.cfg.endpoint+'/'+F.cfg.bucket+'/'+objeto,corpo=Buffer.alloc(32768,42);
  await pedirS3(F.cfg,'PUT',{objeto,corpo:Buffer.from('anterior')});
  const fim=new Promise((ok,no)=>{req=request(url,{method:'PUT',headers:{...assinarS3({...F.cfg,url,metodo:'PUT',hashCorpo:hash(corpo)}),'content-length':String(corpo.length)}},r=>{r.resume();r.on('end',()=>ok(r.statusCode));});req.on('error',no);});
  req.write(corpo.subarray(0,1024));
  for(let i=0;i<100&&!readdirSync(join(F.pasta,'objetos')).some(x=>x.endsWith('.tmp'));i++)await new Promise(ok=>setTimeout(ok,10));
  assert.ok(readdirSync(join(F.pasta,'objetos')).some(x=>x.endsWith('.tmp')));
  await assert.rejects(pedirS3(F.cfg,'PUT',{objeto:'greenia/teste/b.enc',corpo:Buffer.from('concorrente')}),e=>e.code==='S3_HTTP_503');
  assert.equal((await pedirS3(F.cfg,'GET',{objeto})).corpo.toString(),'anterior');
  req.end(corpo.subarray(1024));assert.equal(await fim,200);
  assert.deepEqual((await pedirS3(F.cfg,'GET',{objeto})).corpo,corpo);
  assert.equal(readdirSync(join(F.pasta,'objetos')).filter(x=>x.endsWith('.tmp')).length,0);
 }finally{req?.destroy();await F.fechar();}
});
