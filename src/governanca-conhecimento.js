import { createHash } from 'node:crypto';
import { exec, todos, um, json } from './db.js';
import { erro } from './http.js';
// Tabelas aditivas; histórico guarda apenas metadados e hash, nunca conteúdo.
export const ESQUEMA_GOV = `create table if not exists conhecimento_governanca (documento_id integer primary key references documentos(id) on delete cascade, responsavel_id integer references pessoas(id) on delete set null, validade text, suspenso integer not null default 0, versao integer not null default 1);
create table if not exists conhecimento_historico (id integer primary key, documento_id integer not null references documentos(id) on delete cascade, versao integer not null, em text not null, pessoa_id integer, mudanca text not null);
create table if not exists revisoes_acesso (pessoa_id integer primary key references pessoas(id) on delete cascade, em text not null, revisado_por integer, assinatura text not null, observacao text not null default '');`;
export function dataVigencia(agora=new Date(),fuso=process.env.PLATAFORMA_FUSO||'America/Sao_Paulo') {const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:fuso,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(agora).map(x=>[x.type,x.value]));return `${p.year}-${p.month}-${p.day}`;}
export const vigenteSql = alias => `not exists (select 1 from conhecimento_governanca kg where kg.documento_id = ${alias}.id and (kg.suspenso = 1 or (kg.validade is not null and kg.validade < '${dataVigencia()}')))`;
export function idsVigentes(db,ids) { return ids.length?todos(db,`select d.id from documentos d where d.id in (${ids.map(()=>'?').join(',')}) and ${vigenteSql('d')}`,...ids).map(d=>d.id):[]; }
export function metadados(db,d) {
 const g=um(db,'select g.*,p.nome as responsavel_nome from conhecimento_governanca g left join pessoas p on p.id = g.responsavel_id where documento_id = ?',d.id);
 return {...d,responsavel_id:g?.responsavel_id??null,responsavel_nome:g?.responsavel_nome||null,validade:g?.validade??null,suspenso:!!g?.suspenso,versao:g?.versao||1,vigente:!g?.suspenso&&(!g?.validade||g.validade>=dataVigencia())};
}
export function validarGovernanca(db,corpo,d) {
 const g={...(um(db,'select * from conhecimento_governanca where documento_id = ?',d.id??-1)||{responsavel_id:d.enviado_por??null,validade:null,suspenso:0,versao:1})};
 if(!d.id && g.responsavel_id && !um(db,'select 1 from pessoas p where p.id = ? and p.ativo = 1 and (? = 1 or exists(select 1 from area_pessoas ap where ap.pessoa_id = p.id and ap.area_id = ?))',g.responsavel_id,d.toda_empresa,d.area_id))g.responsavel_id=null;
 if(corpo.responsavel_id!==undefined) {
  g.responsavel_id=corpo.responsavel_id===null||corpo.responsavel_id===''?null:Number(corpo.responsavel_id);
  if(g.responsavel_id!==null&&!um(db,'select 1 from pessoas p where p.id = ? and p.ativo = 1 and (? = 1 or exists(select 1 from area_pessoas ap where ap.pessoa_id = p.id and ap.area_id = ?))',g.responsavel_id,d.toda_empresa,d.area_id)) throw erro(400,'responsavel','Escolha uma pessoa ativa com acesso à base.');
 }
 if(corpo.validade!==undefined) { g.validade=corpo.validade||null; if(g.validade&&(!/^\d{4}-\d{2}-\d{2}$/.test(g.validade)||Number.isNaN(Date.parse(g.validade))||new Date(g.validade).toISOString().slice(0,10)!==g.validade)) throw erro(400,'validade','Informe uma data de validade válida.'); }
 if(corpo.suspenso!==undefined) { if(typeof corpo.suspenso!=='boolean') throw erro(400,'suspenso','Informe se o documento está suspenso.');g.suspenso=Number(corpo.suspenso); }
 return g;
}
export function guardarGovernanca(app,pessoa,d,g,antes=null) {
 g.versao=antes?(g.versao||1)+1:1;
 exec(app.db,'insert into conhecimento_governanca (documento_id,responsavel_id,validade,suspenso,versao) values (?,?,?,?,?) on conflict(documento_id) do update set responsavel_id=excluded.responsavel_id,validade=excluded.validade,suspenso=excluded.suspenso,versao=excluded.versao',d.id,g.responsavel_id,g.validade,g.suspenso,g.versao);
 const seguro=x=>({titulo:x.titulo,arquivo:x.arquivo,pasta:x.pasta,sigiloso:!!x.sigiloso,responsavel_id:x.responsavel_id??null,validade:x.validade??null,suspenso:!!x.suspenso,conteudo_hash:createHash('sha256').update(x.texto||'').digest('hex')});
 exec(app.db,'insert into conhecimento_historico (documento_id,versao,em,pessoa_id,mudanca) values (?,?,?,?,?)',d.id,g.versao,app.agora().toISOString(),pessoa.id,JSON.stringify({antes:antes?seguro(antes):null,depois:seguro({...d,...g})}));
}
export function dependencias(db,pessoa,d,podeGerirQw) {
 return todos(db,'select * from quick_wins where excluido_em is null').filter(q=>podeGerirQw(db,pessoa,q)).filter(q=>{const b=json(q.bases,{});return b.modo==='escolhidas'?(b.ids||[]).includes(d.id):b.modo==='area'&&(d.toda_empresa||!!um(db,'select 1 from quick_win_areas where quick_win_id = ? and area_id = ?',q.id,d.area_id));}).map(q=>({id:q.id,nome:q.nome,status:q.status}));
}
