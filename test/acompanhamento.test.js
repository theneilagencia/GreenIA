import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {subir} from './ajuda.js';
import {salvarConfig} from '../src/config.js';
import {exec,um,todos} from '../src/db.js';
import {trechosDasBases} from '../src/bases.js';
import {dataVigencia} from '../src/governanca-conhecimento.js';
import {arquivo} from './arquivos.js';
let S,a,g,u,b,A,B,doc,q;
before(async()=>{
 S=await subir();salvarConfig(S.app.db,{dominios:['exemplo.com.br']});a=await S.cliente().entrar('admin@exemplo.com.br');
 A=(await a.post('/api/admin/areas',{nome:'Alfa'})).dados;B=(await a.post('/api/admin/areas',{nome:'Beta'})).dados;
 for(const [email,areas] of [['gestor',[{id:A.id,adminBase:true,responsavel:true}]],['usuario',[{id:A.id}]],['beta',[{id:B.id}]]])await a.post('/api/admin/pessoas',{email:email+'@exemplo.com.br',nome:email,areas});
 g=await S.cliente().entrar('gestor@exemplo.com.br');u=await S.cliente().entrar('usuario@exemplo.com.br');b=await S.cliente().entrar('beta@exemplo.com.br');
 doc=(await g.post('/api/bases/documentos',{area_id:A.id,titulo:'Manual Alfa',arquivo:arquivo('manual.txt','O procedimento exclusivo ALFABUSCA estabelece prazo de vinte dias para reembolso.')})).dados;
 q=(await g.post('/api/quick-wins',{nome:'Reembolso Alfa',areas:[A.id],bases:{modo:'escolhidas',ids:[doc.id]}})).dados;
 await a.post('/api/bases/documentos',{area_id:B.id,titulo:'Privado Beta',arquivo:arquivo('beta.txt','Conteúdo exclusivo de Beta.')});
});
after(async()=>await S.fechar());
test('pendências respeitam bases e responsabilidades; usuário comum não recebe cadastro ou relatos',async()=>{
 const G=(await g.get('/api/acompanhamento')).dados,U=(await u.get('/api/acompanhamento')).dados;
 assert.equal(G.passos.some(x=>x.id==='conhecimento'),true);assert.doesNotMatch(JSON.stringify(G),/Privado Beta|beta@/);assert.deepEqual(U.passos,[]);assert.deepEqual(U.pendencias,[]);
 assert.equal((await u.get('/api/acompanhamento/acessos')).status,403);assert.equal((await g.get('/api/acompanhamento/acessos')).status,403);
});
test('metadados e histórico não revelam conteúdo nem área alheia',async()=>{
 assert.equal((await b.get(`/api/bases/documentos/${doc.id}/governanca`)).status,404);
 const d=(await g.get(`/api/bases/documentos/${doc.id}/governanca`)).dados;
 assert.equal(d.documento.versao,1);assert.doesNotMatch(JSON.stringify(d),/ALFABUSCA/);assert.equal(d.pessoas.some(p=>p.id===b.pessoa.id),false);
});
test('suspensão impede inferência, mantém cadastro e pode ser retomada',async()=>{
 assert.ok(trechosDasBases(S.app.db,'ALFABUSCA',[doc.id]).parte);
 assert.equal((await g.put(`/api/bases/documentos/${doc.id}`,{suspenso:true})).status,200);
 assert.equal(trechosDasBases(S.app.db,'ALFABUSCA',[doc.id]).parte,null);
 assert.equal((await u.get('/api/conhecimento')).dados.documentos.find(d=>d.id===doc.id).suspenso,true);
 assert.equal((await u.put(`/api/bases/documentos/${doc.id}`,{suspenso:false})).status,404);
 await g.put(`/api/bases/documentos/${doc.id}`,{suspenso:false});assert.ok(trechosDasBases(S.app.db,'ALFABUSCA',[doc.id]).parte);
});
test('validade vencida impede inferência e futuro mantém fonte; data inválida não altera arquivo',async()=>{
 assert.equal(dataVigencia(new Date('2026-10-06T01:00:00Z'),'America/Sao_Paulo'),'2026-10-05');assert.equal(dataVigencia(new Date('2026-10-06T03:00:00Z'),'America/Sao_Paulo'),'2026-10-06');
 await g.put(`/api/bases/documentos/${doc.id}`,{validade:'2000-01-01'});assert.equal(trechosDasBases(S.app.db,'ALFABUSCA',[doc.id]).parte,null);
 const antes=um(S.app.db,'select texto from documentos where id = ?',doc.id).texto;
 assert.equal((await g.put(`/api/bases/documentos/${doc.id}`,{validade:'2026-02-30',arquivo:arquivo('outro.txt','Conteúdo novo inválido')})).status,400);
 assert.equal(um(S.app.db,'select texto from documentos where id = ?',doc.id).texto,antes);
 await g.put(`/api/bases/documentos/${doc.id}`,{validade:'2099-12-31'});assert.ok(trechosDasBases(S.app.db,'ALFABUSCA',[doc.id]).parte);
});
test('responsável exige acesso à base e dependências só incluem quick wins gerenciados',async()=>{
 assert.equal((await g.put(`/api/bases/documentos/${doc.id}`,{responsavel_id:b.pessoa.id})).status,400);
 assert.equal((await g.put(`/api/bases/documentos/${doc.id}`,{responsavel_id:u.pessoa.id})).status,200);
 const d=(await g.get(`/api/bases/documentos/${doc.id}/governanca`)).dados;assert.equal(d.documento.responsavel_id,u.pessoa.id);assert.ok(d.dependencias.some(x=>x.id===q.id));
});
test('histórico registra mudanças sem arquivar o texto e exclusão elimina metadados em cascata',async()=>{
 const D=(await g.post('/api/bases/documentos',{area_id:A.id,arquivo:arquivo('curto.txt','Conteúdo de teste para descarte.')})).dados;
 await g.put(`/api/bases/documentos/${D.id}`,{titulo:'Novo título'});
 assert.equal(um(S.app.db,'select count(*) as n from conhecimento_historico where documento_id = ?',D.id).n,2);
 await g.del(`/api/bases/documentos/${D.id}`);assert.equal(um(S.app.db,'select count(*) as n from conhecimento_historico where documento_id = ?',D.id).n,0);
});
test('revisão de acesso registra conferência sem mudar permissões e detecta vínculo posterior',async()=>{
 const antes=um(S.app.db,'select papel from pessoas where id = ?',u.pessoa.id).papel;
 assert.equal((await u.post(`/api/acompanhamento/acessos/${u.pessoa.id}/revisar`,{observacao:'Tentativa sem permissão'})).status,403);
 assert.equal((await a.post(`/api/acompanhamento/acessos/${u.pessoa.id}/revisar`,{observacao:'Conferi áreas e bases'})).status,200);
 let p=(await a.get('/api/acompanhamento/acessos')).dados.pessoas.find(p=>p.id===u.pessoa.id);assert.equal(p.pendente,false);assert.equal(um(S.app.db,'select papel from pessoas where id = ?',u.pessoa.id).papel,antes);
 exec(S.app.db,'update area_pessoas set admin_base = 1 where pessoa_id = ?',u.pessoa.id);p=(await a.get('/api/acompanhamento/acessos')).dados.pessoas.find(p=>p.id===u.pessoa.id);assert.equal(p.pendente,true);
 exec(S.app.db,'update area_pessoas set admin_base = 0 where pessoa_id = ?',u.pessoa.id);
});
test('comparação de versões é restrita e não retorna prompt técnico',async()=>{
 const spec={v:2,objetivo:'Resultado inicial',regras:[],formato_saida:{tipo:'texto'}};
 // Fixtures de versões: a publicação real permanece coberta pela regressão Quick Win 2.0.
 for(let n=1;n<=2;n++)exec(S.app.db,'insert into quick_win_versoes(quick_win_id,numero,especificacao,nome,publicada_em) values (?,?,?,?,?)',q.id,n,JSON.stringify({...spec,objetivo:'Objetivo '+n}),q.nome,new Date().toISOString());
 const r=await g.get(`/api/quick-wins/${q.id}/comparar?antes=1&depois=2`);assert.equal(r.status,200);assert.equal(r.dados.antes.campos.Objetivo,'Objetivo 1');assert.equal(r.dados.depois.campos.Objetivo,'Objetivo 2');
 assert.equal((await u.get(`/api/quick-wins/${q.id}/comparar?antes=1&depois=2`)).status,404);assert.equal((await g.get(`/api/quick-wins/${q.id}/comparar?antes=1&depois=99`)).status,404);
});
test('multiempresa exige permissão granular, mesmo para admin local',async()=>{
 S.app.tenant={companyId:'teste'};
 try{assert.equal((await a.get('/api/acompanhamento/acessos')).status,403);assert.equal((await a.post(`/api/acompanhamento/acessos/${u.pessoa.id}/revisar`,{observacao:'Sem permissão granular'})).status,403);}finally{S.app.tenant=null;}
});
test('impacto de integração respeita ativação, permissão e empresa sem executar ações externas',async()=>{
 const {criarConector,definirCapabilities}=await import('../src/integracoes/conectores.js');
 const {lerConfig}=await import('../src/config.js');const cfg=lerConfig(S.app.db).integracoes;
 const pessoa={id:a.pessoa.id,admin:true};
 try{
  salvarConfig(S.app.db,{integracoes:{ativa:true,pessoas:[]}});
  const c=criarConector(S.app,pessoa,{nome:'Catálogo de QA',sistema:'Catálogo QA',base_url:'https://api.exemplo.test',auth_type:'none',operacoes:[{operation_id:'consultar',metodo:'GET',caminho:'/itens',resumo:'Consultar itens',classe:'SAFE_READ',categoria:'read_data'}]});
  definirCapabilities(S.app,pessoa,c.id,[{operation_id:'consultar'}]);
  exec(S.app.db,'update quick_wins set especificacao = ?,versao_publicada = null where id = ?',JSON.stringify({v:2,operacao:{integracoes:[{id:'consulta',sistema:'Catálogo QA',acao:'Consultar itens',categoria:'read_data',modo:'read'}]}}),q.id);
  const r=await a.get(`/api/acompanhamento/integracoes/${c.id}`);assert.equal(r.status,200);assert.ok(r.dados.quickWins.some(x=>x.id===q.id&&x.vinculado));
  assert.equal((await u.get(`/api/acompanhamento/integracoes/${c.id}`)).status,403);
  const tenant=S.app.tenantId;try{S.app.tenantId='outra-empresa';assert.equal((await a.get(`/api/acompanhamento/integracoes/${c.id}`)).status,404);}finally{S.app.tenantId=tenant;}
  assert.equal(um(S.app.db,'select count(*) as n from connector_runs where connector_id = ?',c.id).n,0);
  salvarConfig(S.app.db,{integracoes:{ativa:false,pessoas:[]}});assert.equal((await a.get(`/api/acompanhamento/integracoes/${c.id}`)).status,404);
 }finally{salvarConfig(S.app.db,{integracoes:cfg});}
});
test('banco existente recebe backup consistente antes das tabelas aditivas; documentos e índice preservados',async()=>{
 const {mkdtempSync,readdirSync,readFileSync,writeFileSync,rmSync}=await import('node:fs');const {join}=await import('node:path');const {tmpdir}=await import('node:os');const {gunzipSync}=await import('node:zlib');const {DatabaseSync}=await import('node:sqlite');const {abrirBanco}=await import('../src/db.js');
 const pasta=mkdtempSync(join(tmpdir(),'greenia-governanca-')),banco=join(pasta,'empresa.sqlite');let db;
 try{db=abrirBanco(banco);exec(db,"insert into pessoas (email,nome) values ('local@teste.com','Local')");exec(db,"insert into documentos (titulo,arquivo,texto,toda_empresa) values ('Legado','legado.txt','Texto original preservado',1)");db.exec('drop table conhecimento_historico;drop table conhecimento_governanca;drop table revisoes_acesso;');db.close();db=abrirBanco(banco);
  assert.equal(um(db,'select texto from documentos').texto,'Texto original preservado');assert.equal(um(db,'select count(*) as n from conhecimento_governanca').n,0);
  const nome=readdirSync(join(pasta,'backups')).find(n=>n.endsWith('.gz'));assert.ok(nome);const copia=join(pasta,'copia.sqlite');writeFileSync(copia,gunzipSync(readFileSync(join(pasta,'backups',nome))));const backup=new DatabaseSync(copia,{readOnly:true});assert.equal(Object.values(backup.prepare('pragma integrity_check').get())[0],'ok');assert.equal(backup.prepare('select texto from documentos').get().texto,'Texto original preservado');assert.equal(backup.prepare("select name from sqlite_master where name = 'conhecimento_governanca'").get(),undefined);backup.close();
 }finally{db?.close();rmSync(pasta,{recursive:true,force:true});}
});
