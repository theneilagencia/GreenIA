// Inventário estático e smoke de barreiras HTTP, exclusivamente local.
// Não comprova regras de negócio das rotas. IA e email simulados, sem credenciais reais.
import {readdirSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {criarApp} from '../src/servidor.js';
import {cliente} from './cliente.js';
import {salvarConfig} from '../src/config.js';
import {subirPlataforma} from '../test/ajuda-plataforma.js';
const destino=process.argv[2];if(!destino)throw new Error('Informe pasta de evidências.');mkdirSync(destino,{recursive:true});
const arquivos=p=>readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?arquivos(join(p,e.name)):e.name.endsWith('.js')?[join(p,e.name)]:[]);
const rotas=arquivos('src').flatMap(p=>[...readFileSync(p,'utf8').matchAll(/\br\.(get|post|put|patch|del)\(\s*(['"])(.*?)\2/g)].map(m=>({metodo:m[1]==='del'?'DELETE':m[1].toUpperCase(),caminho:m[3],arquivo:p,linha:readFileSync(p,'utf8').slice(0,m.index).split('\n').length})));
const app=criarApp({cookieSeguro:false,log:()=>{},adminEmail:'admin@exemplo.test'});salvarConfig(app.db,{integracoes:{ativa:true,pessoas:[]}});
await new Promise(r=>app.servidor.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${app.servidor.address().port}`;
const S=await subirPlataforma({admins:['ops@operadora.test']}),ops=await S.navegador().entrarConsole('ops@operadora.test');
await ops.post('/api/plataforma/empresas',{name:'Empresa Fictícia QA HTTP',slug:'qa-http',status:'ativa',admin_email:'admin@exemplo.test'});
const anonApp=cliente(app,base),anonConsole=S.navegador(),anonEmpresa=S.navegador();await anonEmpresa.get('/qa-http');
const resultados=[];
try{
 for(const rota of rotas){
  const n=rota.caminho.startsWith('/api/plataforma/')?anonConsole:rota.caminho.startsWith('/api/empresa/')?anonEmpresa:anonApp;
  const caminho=rota.caminho.replace(/:\w+/g,'qa-inexistente');
  try{const t=performance.now(),r=await n.req(rota.metodo,caminho,rota.metodo==='GET'?undefined:{});resultados.push({...rota,status:r.status,ms:Math.round(performance.now()-t),codigo:r.dados?.erro||r.dados?.codigo||null,mensagem:typeof r.dados==='object'?r.dados?.mensagem:null});}
  catch(e){resultados.push({...rota,exception:e.message});}
 }
 const robustez=[];
 for(const [nome,path,headers] of [['cookie inválido','/api/saude',{cookie:'teste=%'}],['percentual no parâmetro','/api/quick-wins/%',{}],['método inesperado','/api/saude',{}]]){
  for(const [tipo,url] of [['instalacao',base],['multiempresa',S.base]]){const r=await fetch(url+path,{method:nome==='método inesperado'?'OPTIONS':'GET',headers});robustez.push({nome,tipo,status:r.status,texto:(await r.text()).slice(0,300)});}
 }
 writeFileSync(join(destino,'rotas.json'),JSON.stringify({rotas:resultados,robustez,limite:'Declarações literais, IDs inexistentes, requests anônimos. 401/403/404 são barreiras, não execução funcional.'},null,2));
 console.log(JSON.stringify({declaracoes:resultados.length,erros500:resultados.filter(r=>r.status>=500||r.exception),retornos200:resultados.filter(r=>r.status===200).map(r=>({metodo:r.metodo,caminho:r.caminho})),robustez},null,2));
}finally{app.servidor.close();app.servidor.closeAllConnections?.();app.db.close();await S.fechar();}
