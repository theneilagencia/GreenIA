// Auditoria complementar local. Dados fictícios, email/IA simulados, sem produção.
// CHROMIUM_PATH=<binário> node scripts/qa-telas-global.mjs <pasta-de-evidencias>
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {chromium} from 'playwright-core';
import {subirPlataforma} from '../test/ajuda-plataforma.js';
import {salvarConfig} from '../src/config.js';
import {exec} from '../src/db.js';
import {construir} from '../src/quickwin-construtor.js';
const destino=process.argv[2];if(!destino)throw new Error('Informe pasta de evidências.');
mkdirSync(destino,{recursive:true});
const S=await subirPlataforma({paginaInicial:'vendas',admins:['ops@operadora.test']});S.P.urlBase=S.base;
const ops=await S.navegador().entrarConsole('ops@operadora.test');
const empresa=(await ops.post('/api/plataforma/empresas',{name:'Empresa Fictícia QA',slug:'qa-global',status:'ativa',admin_email:'admin@exemplo.test'})).dados;
const app=S.P.tenant(empresa.id);salvarConfig(app.db,{integracoes:{ativa:true,pessoas:[]}});
const a=S.navegador();await a.get('/qa-global');await a.entrarEmpresa('admin@exemplo.test');
const ensino={nome:'Conferência fictícia de fornecedores',descricao:'Conferir documentos fictícios de fornecedores e apontar pendências',regras:['nao_inventar','destacar_ausentes','indicar_fontes'],formato:'resumo'};
const qw=(await a.post('/api/quick-wins',{assistente:ensino,toda_empresa:true,painel_modelo:'fornecedores'})).dados;
const simples=(await a.post('/api/quick-wins',{nome:'Processo fictício sem painel',toda_empresa:true})).dados;
const spec=JSON.stringify(construir(ensino));
const v=exec(app.db,'insert into quick_win_versoes(quick_win_id,numero,especificacao,nome,publicada_em) values(?,1,?,?,?)',qw.id,spec,qw.nome,new Date().toISOString()).lastInsertRowid;
exec(app.db,"update quick_wins set especificacao=?,versao_publicada=?,status='em_uso' where id=?",spec,v,qw.id);
const agora=new Date().toISOString(),pessoa=(await a.get('/api/eu')).dados.pessoa.id;
const c=Number(exec(app.db,'insert into conversas(pessoa_id,quick_win_id,criado_em,atualizado_em) values(?,?,?,?)',pessoa,qw.id,agora,agora).lastInsertRowid);
const m=Number(exec(app.db,"insert into mensagens(conversa_id,papel,texto,criado_em) values(?,'assistant','Fornecedor Fictício | Certidão | Pendente',?)",c,agora).lastInsertRowid);
exec(app.db,"insert into roteamento(em,pessoa_id,conversa_id,resposta_id,quick_win_id,modo,complexidade,resultado,versao,qualidade) values(?,?,?,?,?,'auto','baixa','respondido','qa','{\"status\":\"parcial\"}')",agora,pessoa,c,m,qw.id);
const registro=(await a.post(`/api/quick-wins/${qw.id}/painel/preparar`,{mensagem:m})).dados;
await a.post(`/api/quick-wins/${qw.id}/painel/registros/${registro.id}`,{versao:registro.versao,confirmado:true,cienteParcial:true,escopo:'pessoal',dados:[{fornecedor:'Fornecedor Fictício',documento:'Certidão',situacao:'pendente',pendencia:'Solicitar documento atualizado'}]});
const conector=(await a.post('/api/admin/integracoes',{nome:'Conexão fictícia',sistema:'Sistema Fictício',base_url:'https://api.exemplo.test',auth_type:'none',operacoes:[]})).dados;
const rotas=['nova','conversas',`c/${c}`,'quick-wins','quick-wins/processos','quick-wins/programados','qw/nova','qw/nova/modelos',`qw/${qw.id}`,`qw/${qw.id}/usar`,`qw/${qw.id}/teste`,`qw/${qw.id}/editar`,`qw/${qw.id}/ajustar`,`qw/${qw.id}/atualizar`,`qw/${qw.id}/refinar`,`qw/${qw.id}/publicar`,`qw/${qw.id}/versoes`,`qw/${qw.id}/programacoes`,`qw/${qw.id}/programar`,`qw/${qw.id}/acompanhamento`,`qw/${qw.id}/acompanhamento/registro/${registro.id}`,`qw/${simples.id}/acompanhamento/preparar`,'conhecimento','pendencias','preparacao','revisao-acessos','primeiros-passos','visao-geral','uso','pessoas','pessoas/pessoas','pessoas/grupos','pessoas/criacao','modelos','modelos/roteamento','modelos/historico','politicas','politicas/texto','atividade','integracoes','integracoes/nova','integracoes/aprovacoes','configuracoes','empresa/usuarios','empresa/roles','empresa/marca','empresa/landing','empresa/url','empresa/acessos'];
if(conector.id)rotas.push(`integracoes/c/${conector.id}`,...Array.from({length:8},(_,i)=>`integracoes/c/${conector.id}/passo/${i+1}`));
const consoleRotas=['empresas','usuarios','planos','planos/novo','ambientes','uso','auditoria','configuracoes','encerramentos',...['resumo','usuarios','marca','landing','url','permissoes','auditoria'].map(t=>`empresas/${empresa.id}/${t}`)];
const filtro=process.env.QA_FILTRO?new RegExp(process.env.QA_FILTRO):null;
const incluir=rota=>!filtro||filtro.test(rota);
const nav=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});
const resultados=[],erros=[],pedidos=[];let atual='';
function anexar(page){page.on('pageerror',e=>erros.push({tela:atual,mensagem:e.message}));page.on('response',r=>{if(r.status()>=400)pedidos.push({tela:atual,path:new URL(r.url()).pathname,status:r.status()});});}
function medir(){
 const visivel=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'&&e.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})&&!e.closest('[hidden],[aria-hidden="true"]');};
 const nome=e=>(e.innerText||e.getAttribute('aria-label')||e.id||e.tagName).trim().replace(/\s+/g,' ').slice(0,90);
 const recortado=e=>{for(let a=e.parentElement;a&&a!==document.body;a=a.parentElement)if(/auto|scroll|hidden|clip/.test(getComputedStyle(a).overflowX))return true;return false;};
 const principal=document.querySelector('#principal')||document.body;
 const controles=[...principal.querySelectorAll('button,a,input,select,textarea,summary')].filter(visivel);
 const fora=[...principal.querySelectorAll('*')].filter(e=>visivel(e)&&!recortado(e)&&(e.getBoundingClientRect().right>innerWidth+1||e.getBoundingClientRect().left < -1)).slice(0,8).map(nome);
 const pequenos=controles.filter(e=>!e.closest('p,li,td')&&!['checkbox','radio','hidden'].includes(e.type)&&Math.min(e.getBoundingClientRect().height,e.getBoundingClientRect().width)<32).map(e=>({nome:nome(e),altura:Math.round(e.getBoundingClientRect().height),largura:Math.round(e.getBoundingClientRect().width)}));
 const semNome=controles.filter(e=>e.tagName==='BUTTON'&&!e.innerText.trim()&&!e.getAttribute('aria-label')&&!e.getAttribute('aria-labelledby')&&!e.getAttribute('title')).map(e=>e.outerHTML.slice(0,180));
 const semRotulo=controles.filter(e=>/INPUT|SELECT|TEXTAREA/.test(e.tagName)&&!['hidden','submit','button'].includes(e.type)&&!e.labels?.length&&!e.getAttribute('aria-label')&&!e.getAttribute('aria-labelledby')&&!e.getAttribute('title')).map(e=>({id:e.id,type:e.type,placeholder:e.getAttribute('placeholder')}));
 const h1=document.querySelector('h1'),rect=h1?.getBoundingClientRect();
 const tituloMedidas=h1?{largura:Math.round(rect.width),altura:Math.round(rect.height),linha:parseFloat(getComputedStyle(h1).lineHeight)}:null;
 const texto=principal.innerText;return {url:location.hash,titulo:h1?.innerText||null,tituloMedidas,tituloDocumento:document.title,overflow:document.documentElement.scrollWidth-innerWidth,fora,pequenos,semNome,semRotulo,erroTela:/Não foi possível (abrir|carregar) esta tela|Algo deu errado/.test(texto),texto:texto.slice(0,500)};
}
async function auditar(page,escopo,rota,width){
 atual=`${escopo}/${rota}@${width}`;
 try{await page.goto(`${S.base}/${escopo==='app'?'app#/'+rota:escopo==='console'?'plataforma#/'+rota:rota}`);const redePendente=await page.waitForLoadState('networkidle',{timeout:3000}).then(()=>false,()=>true);await page.waitForFunction(()=>!document.querySelector('#principal[aria-busy="true"]'),null,{timeout:10000});
  const r={escopo,rota,width,redePendente,...await page.evaluate(medir)};resultados.push(r);
  if(width===390&&(r.semRotulo.length||redePendente))writeFileSync(join(destino,`${escopo}-${rota.replaceAll('/','-')}-${width}-ax.yml`),await page.locator('body').ariaSnapshot());
  if(r.overflow>1||r.fora.length||r.erroTela||(width<=390&&r.tituloMedidas&&r.tituloMedidas.largura<100&&r.tituloMedidas.altura>2*r.tituloMedidas.linha)||(width===390&&(r.semRotulo.length||redePendente||/^(qw\/\d+\/acompanhamento|empresa\/landing|configuracoes|integracoes\/nova|empresas\/.*\/resumo)$/.test(rota))))await page.screenshot({path:join(destino,`${escopo}-${rota.replaceAll('/','-')}-${width}.png`),fullPage:true});
 }catch(e){resultados.push({escopo,rota,width,exception:e.message});}
 writeFileSync(join(destino,'telas.json'),JSON.stringify({resultados,erros,pedidos},null,2));
}
try{
 const ctx=await nav.newContext({reducedMotion:'reduce'});await ctx.addCookies([...a.cookies].map(([name,value])=>({name,value,url:S.base})));const page=await ctx.newPage();anexar(page);
 const co=await nav.newContext({reducedMotion:'reduce'});await co.addCookies([...ops.cookies].map(([name,value])=>({name,value,url:S.base})));const cp=await co.newPage();anexar(cp);
 const pc=await nav.newContext({reducedMotion:'reduce'}),pub=await pc.newPage();anexar(pub);
 for(const contexto of [ctx,co,pc])await contexto.route(u=>!u.href.startsWith(S.base),r=>r.abort());
 for(const width of [1280,390,320]){
  for(const alvo of [page,cp,pub])await alvo.setViewportSize({width,height:900});
  for(const rota of rotas.filter(incluir))await auditar(page,'app',rota,width);
  for(const rota of consoleRotas.filter(incluir))await auditar(cp,'console',rota,width);
  for(const rota of ['','qa-global','entrar','encontrar','politica','termos','privacidade','encerramento','plataforma'].filter(incluir))await auditar(pub,'publico',rota,width);
  console.log(`Largura ${width}: ${resultados.length} observações acumuladas.`);
 }
 await page.goto(S.base+'/app#/empresa/landing');await page.getByRole('link',{name:'Ver prévia',exact:true}).waitFor();
 const aberta=page.waitForEvent('popup');await page.getByRole('link',{name:'Ver prévia',exact:true}).click();const previa=await aberta;
 await previa.waitForLoadState('domcontentloaded');await previa.locator('h1').waitFor();
 const preview={url:new URL(previa.url()).pathname+new URL(previa.url()).search,titulo:await previa.locator('h1').innerText(),erros:await previa.locator('[role="alert"]').allTextContents()};
 writeFileSync(join(destino,'previa.json'),JSON.stringify(preview,null,2));await previa.close();
}finally{await nav.close();await S.fechar();}
console.log(JSON.stringify({observacoes:resultados.length,telas:resultados.length/3,falhasDeAberturaOuOverflow:resultados.filter(r=>r.overflow>1||r.fora?.length||r.erroTela||r.exception).length,pageerrors:erros.length,semRotulo:resultados.filter(r=>r.semRotulo?.length).length,alvosPequenos:resultados.filter(r=>r.pequenos?.length).length,cabecalhosComprimidos:resultados.filter(r=>r.escopo==='app'&&r.width<=390&&r.tituloMedidas?.largura<100&&r.tituloMedidas?.altura>2.5*r.tituloMedidas?.linha).length}));
