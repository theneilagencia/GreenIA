import {test} from 'node:test';
import assert from 'node:assert/strict';
import {subir} from './ajuda.js';
import {subirPlataforma} from './ajuda-plataforma.js';
import {lerCookies,criarRoteador} from '../src/http.js';

test('cookies inválidos são descartados sem perder cookies válidos nem aceitar sessão corrompida',()=>{
 const r=lerCookies({headers:{cookie:'teste=%; gl_sessao=%E0%A4; valido=ol%C3%A1; __proto__=x'}});
 assert.equal(r.teste,undefined);assert.equal(r.gl_sessao,undefined);assert.equal(r.valido,'olá');assert.equal(Object.getPrototypeOf(r),null);
 assert.equal(lerCookies({headers:{cookie:'gl_sessao=antigo; gl_sessao=%'}}).gl_sessao,undefined);
});
test('roteador rejeita percentual e UTF-8 malformados com 400 e preserva parâmetros válidos',()=>{
 const r=criarRoteador();r.get('/item/:id',()=>{});
 for(const v of ['%','%ZZ','%E0%A4','%ED%A0%80'])assert.throws(()=>r.achar('GET','/item/'+v),e=>e.status===400);
 assert.equal(r.achar('GET','/item/a%2Fb').params.id,'a/b');assert.equal(r.achar('GET','/item/Jo%C3%A3o').params.id,'João');
});
test('instalação: cookie estranho não interrompe sessão válida; sessão inválida é recusada',async t=>{
 const S=await subir();t.after(()=>S.fechar());const a=await S.cliente().entrar('admin@exemplo.com.br');
 assert.equal((await a.get('/api/eu',{cookie:a.cookie+'; estranho=%'})).status,200);
 assert.equal((await a.get('/api/eu',{cookie:'gl_sessao=%'})).status,401);
 for(const path of ['/api/quick-wins/%','/api/quick-wins/%E0%A4','/arquivo%.js'])assert.equal((await a.get(path)).status,400,path);
 assert.equal((await a.get('/api/saude',{cookie:'teste=%'})).status,200);
});
test('multiempresa: cookie corrompido não derruba console e não amplia acesso',async t=>{
 const S=await subirPlataforma({admins:['ops@operadora.test']});t.after(()=>S.fechar());
 const ops=await S.navegador().entrarConsole('ops@operadora.test');
 const cookies=[...ops.cookies].map(([k,v])=>k+'='+v).join('; ');
 assert.equal((await fetch(S.base+'/api/plataforma/empresas',{headers:{cookie:cookies+'; teste=%'}})).status,200);
 assert.equal((await fetch(S.base+'/api/plataforma/empresas',{headers:{cookie:'gia_p=%'}})).status,401);
 assert.equal((await fetch(S.base+'/api/saude',{headers:{cookie:'gia_t=%; teste=%'}})).status,200);
 for(const path of ['/api/plataforma/homologacoes/%25','/api/plataforma/vetos-sigilo/%25'])assert.equal((await ops.del(path)).status,200,path);
 for(const path of ['/api/plataforma/empresas/%','/api/plataforma/empresas/%E0%A4'])assert.equal((await fetch(S.base+path,{headers:{cookie:cookies}})).status,400,path);
});

test('origem malformada é recusada com 400, origem externa mantém 403 e origem válida permite login',async t=>{
 const A=await subir(),P=await subirPlataforma({admins:['ops@operadora.test']});t.after(()=>A.fechar());t.after(()=>P.fechar());
 for(const [base,path,email] of [[A.base,'/api/login/codigo','admin@exemplo.com.br'],[P.base,'/api/plataforma/login/codigo','ops@operadora.test']]){
  for(const [origin,status] of [['%',400],['null',400],['https://externa.test',403],[base,200]]){
   const r=await fetch(base+path,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({email})});assert.equal(r.status,status,origin);
  }
 }
});
