import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {mkdtempSync,rmSync,openSync,closeSync,writeSync,createReadStream} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import {once} from 'node:events';
import {assinarS3} from '../src/backup-s3.js';

test('upload e download de 180 MiB em fluxo: hash idêntico, receptor abaixo de 192 MiB RSS', {timeout:60000}, async()=>{
 const p=mkdtempSync(join(tmpdir(),'greenia-memoria-'));
 const child=fork(new URL('./fixtures/receptor-memoria.mjs',import.meta.url),[],{env:{...process.env,QA_PASTA:join(p,'receptor')},execArgv:['--max-old-space-size=64'],stdio:['ignore','ignore','pipe','ipc']});
 try{
  const [{porta}]=await once(child,'message');
  const f=join(p,'grande.enc'),fd=openSync(f,'wx'),parte=randomBytes(64*1024),h=createHash('sha256');const tamanho=180*1024*1024;
  try{for(let i=0;i<tamanho;i+=parte.length){writeSync(fd,parte);h.update(parte);}}finally{closeSync(fd);}
  const hash=h.digest('hex'),url=`http://127.0.0.1:${porta}/greenia-backups/greenia/grande.enc`;
  const cfg={chave:'memoria-teste',segredo:'segredo-sintetico-memoria',regiao:'us-east-1',url};
  const r=await fetch(url,{method:'PUT',headers:{...assinarS3({...cfg,metodo:'PUT',hashCorpo:hash}),'content-length':String(tamanho)},body:createReadStream(f),duplex:'half'});
  assert.equal(r.status,200,await r.text());
  const g=await fetch(url,{headers:assinarS3({...cfg,metodo:'GET',hashCorpo:createHash('sha256').update('').digest('hex')})});assert.equal(g.status,200);
  const recebido=createHash('sha256');let bytes=0;for await(const parte of g.body){recebido.update(parte);bytes+=parte.length;}
  assert.equal(bytes,tamanho);assert.equal(recebido.digest('hex'),hash);
  child.send('stats');const [{rssMaxKiB}]=await once(child,'message');
  console.log('RECEPTOR_MEMORIA',JSON.stringify({arquivoBytes:tamanho,rssMaxKiB}));
  assert.ok(rssMaxKiB<192*1024,`pico do receptor: ${rssMaxKiB} KiB`);
 }finally{child.disconnect();await once(child,'exit');rmSync(p,{recursive:true,force:true});}
});
