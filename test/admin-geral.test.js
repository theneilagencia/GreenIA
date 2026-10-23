import {test} from 'node:test';
import assert from 'node:assert/strict';
import {subirPlataforma} from './ajuda-plataforma.js';
import {exec,um,todos} from '../src/db.js';
import {situacaoPlano,checarPlano} from '../src/plano.js';
import {criarCobrancaStripe} from '../src/plataforma/stripe-pagamentos.js';

async function ambiente(op={}) {
  let agora=new Date('2026-10-23T12:00:00Z'),chamadas=0;
  const s=await subirPlataforma({agora:()=>agora,...op});
  const ops=await s.navegador().entrarConsole('ops@theneil.com.br');
  const planos=(await ops.get('/api/plataforma/planos')).dados.planos;
  const p=planos.find(p=>p.name==='GreenIA Starter');
  const criar=async(slug,plano=p.id)=>{
    const r=await ops.post('/api/plataforma/empresas',{name:slug,slug,plan_id:plano,status:'ativa',admin_email:`admin@${slug}.com`,convidar:false});
    assert.equal(r.status,200,JSON.stringify(r.dados));
    // O primeiro acesso aceita o convite sem depender de email externo.
    const n=s.navegador();await n.get('/'+slug);await n.entrarEmpresa(`admin@${slug}.com`);
    return {c:r.dados,admin:n};
  };
  return {...s,ops,p,planos,criar,relogio:d=>agora=new Date(d),chamadas:()=>chamadas};
}
const planoLivre=(extra={})=>({name:'Piloto gratuito',description:'Validação interna',credits:100,reserve:20,price_usd:null,
  features:{quick_wins:true},limits:{max_users:0},rules:{pack_credits:0,pack_price_usd:0},settings:{comercial:{condicao:'gratuito',moeda:'brl',preco:0,renovacao:'mensal'}},...extra});

test('planos gratuitos e externos funcionam sem Stripe e contrato temporário bloqueia IA preservando histórico',async()=>{
  const s=await ambiente();try{
    assert.equal(s.P.stripe,undefined);
    const p=await s.ops.post('/api/plataforma/planos',planoLivre());assert.equal(p.status,200);
    const {c,admin}=await s.criar('piloto',p.dados.id);
    assert.equal(c.faturamento.forma,'sem_cobranca');
    const t=s.P.tenant(c.id);exec(t.db,'insert into uso (em,custo) values (?,?)',s.P.agora().toISOString(),.2);
    assert.equal(situacaoPlano(t).usados,20);
    const f=await s.ops.put(`/api/plataforma/empresas/${c.id}/faturamento`,{forma:'externa',fim:'2026-10-23'});assert.equal(f.status,200);
    checarPlano(t);s.relogio('2026-10-24T00:00:00Z');
    assert.throws(()=>checarPlano(t),e=>e.codigo==='vigencia_vencida');
    assert.equal(um(t.db,'select count(*) n from uso').n,1);
    assert.equal((await admin.get('/api/conversas')).status,200);
    assert.equal(um(s.P.db,'select status from companies where id=?',c.id).status,'ativa');
    assert.equal(um(s.P.db,"select 1 from sqlite_master where name='stripe_pedidos'"),undefined);
  }finally{await s.fechar();}
});

test('cobrança externa em reais guarda moeda separada do USD e rejeita condições inválidas',async()=>{
  const s=await ambiente();try{
    const r=await s.ops.post('/api/plataforma/planos',planoLivre({name:'Contrato externo BRL',settings:{comercial:{condicao:'pago',moeda:'brl',preco:800,renovacao:'mensal'}}}));
    assert.equal(r.status,200,JSON.stringify(r.dados));assert.equal(r.dados.price_usd,null);assert.equal(r.dados.settings.comercial.preco,800);
    const {c}=await s.criar('externa',r.dados.id);assert.equal(c.faturamento.forma,'externa');
    for(const d of [{forma:'inventada'},{fim:'2026-02-30'},{renovacao:'anual'}]) assert.equal((await s.ops.put(`/api/plataforma/empresas/${c.id}/faturamento`,d)).status,400);
    assert.equal((await s.ops.post('/api/plataforma/planos',planoLivre({price_usd:199}))).status,400);
  }finally{await s.fechar();}
});

test('franquia sem renovação não se recompõe na virada e mudança de regra com consumo é recusada',async()=>{
  const s=await ambiente();try{
    const p=(await s.ops.post('/api/plataforma/planos',planoLivre({settings:{comercial:{condicao:'gratuito',moeda:'usd',preco:0,renovacao:'nenhuma'}}}))).dados;
    const {c}=await s.criar('unica',p.id),t=s.P.tenant(c.id);
    exec(t.db,'insert into uso (em,custo) values (?,?)',s.P.agora().toISOString(),1.2);
    assert.throws(()=>checarPlano(t),e=>e.codigo==='plano_esgotado');s.relogio('2026-11-01T12:00:00Z');
    assert.equal(situacaoPlano(t).usados,120);assert.throws(()=>checarPlano(t),e=>e.codigo==='plano_esgotado');
    await s.ops.entrarConsole('ops@theneil.com.br');
    assert.equal((await s.ops.put(`/api/plataforma/empresas/${c.id}/faturamento`,{renovacao:'mensal'})).status,409);
  }finally{await s.fechar();}
});

test('visão global filtra vínculos da mesma empresa e perfil, sem limite silencioso de 300 pessoas',async()=>{
  const s=await ambiente();try{
    const a=(await s.criar('empresa-a')).c,b=(await s.criar('empresa-b')).c;
    const u=(await s.ops.post(`/api/plataforma/empresas/${a.id}/usuarios`,{email:'ana@example.com',name:'Ana',status:'ativo',role_key:'member',convidar:false})).dados;
    await s.ops.post(`/api/plataforma/empresas/${b.id}/usuarios`,{email:u.email,role_key:'manager',status:'ativo',convidar:false});
    const buscar=async(q)=>(await s.ops.get('/api/plataforma/usuarios?'+q)).dados;
    assert.equal((await buscar(`empresa=${a.id}&perfil=role_manager&busca=ana`)).total,0);
    const r=await buscar(`empresa=${b.id}&perfil=role_manager&situacao=ativo&busca=ana`);
    assert.equal(r.total,1);assert.equal(r.usuarios[0].empresas[0].plano,'GreenIA Starter');
    for(let i=0;i<310;i++)exec(s.P.db,"insert into users values (?,?,?,'ativo',?)",`usr_extra_${i}`,`extra${i}@example.com`,'Extra',s.P.agora().toISOString());
    const pagina=await buscar('busca=extra&pagina=6');assert.equal(pagina.total,310);assert.equal(pagina.usuarios.length,10);
    assert.equal(JSON.stringify(r).includes('conversas'),false);
  }finally{await s.fechar();}
});

test('bloqueio global e desativação preservam o último administrador ativo, inclusive com substituto bloqueado',async()=>{
  const s=await ambiente();try{
    const {c}=await s.criar('admins');const admin=(await s.ops.get(`/api/plataforma/empresas/${c.id}/usuarios`)).dados.usuarios[0];
    assert.equal((await s.ops.put(`/api/plataforma/usuarios/${admin.id}`,{status:'bloqueado'})).status,409);
    const outro=(await s.ops.post(`/api/plataforma/empresas/${c.id}/usuarios`,{email:'outro@example.com',role_key:'company_admin',status:'ativo',convidar:false})).dados;
    assert.equal((await s.ops.put(`/api/plataforma/usuarios/${outro.id}`,{status:'bloqueado'})).status,200);
    assert.equal((await s.ops.put(`/api/plataforma/empresas/${c.id}/usuarios/${admin.id}`,{status:'inativo'})).status,409);
    assert.equal((await s.ops.del(`/api/plataforma/empresas/${c.id}/usuarios/${admin.id}`)).status,409);
    assert.equal((await s.ops.put(`/api/plataforma/usuarios/${admin.id}`,{status:'bloqueado'})).status,409);
  }finally{await s.fechar();}
});

test('admin local não lê lista geral, condições ou perfis de outra empresa e CSRF continua obrigatório',async()=>{
  const s=await ambiente();try{
    const {c,admin}=await s.criar('isolada');
    for(const url of ['/api/plataforma/usuarios',`/api/plataforma/empresas/${c.id}/faturamento`,`/api/plataforma/empresas/${c.id}/usuarios`])assert.notEqual((await admin.get(url)).status,200);
    assert.equal((await s.ops.post(`/api/plataforma/empresas/${c.id}/plano`,{plan_id:s.p.id},{'x-csrf':'errado'})).status,403);
    assert.notEqual((await admin.put(`/api/plataforma/empresas/${c.id}/faturamento`,{forma:'sem_cobranca'})).status,200);
  }finally{await s.fechar();}
});

test('troca agendada preserva pacotes consumidos e não duplica franquia, mesmo após reaplicar',async()=>{
  const s=await ambiente();try{
    const {c}=await s.criar('saldo'),t=s.P.tenant(c.id),team=s.planos.find(p=>p.name==='GreenIA Team');
    exec(t.db,"insert into pacotes(em,creditos,origem) values (?,1000,'console')",s.P.agora().toISOString());
    exec(t.db,'insert into uso (em,custo) values (?,25)',s.P.agora().toISOString());
    assert.equal(situacaoPlano(t).pacoteDisponivel,500);
    assert.equal((await s.ops.post(`/api/plataforma/empresas/${c.id}/plano`,{plan_id:team.id})).status,409);
    assert.equal((await s.ops.post(`/api/plataforma/empresas/${c.id}/plano`,{plan_id:team.id,vigencia:'proximo_ciclo'})).status,200);
    assert.equal(situacaoPlano(t).creditos,2000);s.relogio('2026-11-01T00:00:00Z');
    assert.equal(situacaoPlano(t).creditos,5000);assert.equal(situacaoPlano(t).pacoteDisponivel,500);assert.equal(situacaoPlano(t).usados,0);
    assert.equal(situacaoPlano(t).pacoteDisponivel,500);assert.equal(um(t.db,'select count(*) n from pacotes').n,1);
    await s.ops.entrarConsole('ops@theneil.com.br');
    assert.equal((await s.ops.get(`/api/plataforma/empresas/${c.id}`)).dados.empresa.plano.id,team.id);
  }finally{await s.fechar();}
});

test('Stripe habilitado no servidor não recebe chamadas de planos gratuitos ou cobrança externa; exige opção explícita',async()=>{
  let chamadas=0;
  const s=await ambiente({stripe:{env:{STRIPE_HABILITADO:'teste',STRIPE_WEBHOOK_SECRET:'whsec_local'},api:async()=>{chamadas++;throw Error('não deveria chamar');}}});
  try{
    const p=(await s.ops.post('/api/plataforma/planos',planoLivre())).dados;
    const {c}=await s.criar('gratis',p.id);
    await s.ops.put(`/api/plataforma/empresas/${c.id}/faturamento`,{forma:'externa'});
    assert.equal((await s.ops.put(`/api/plataforma/empresas/${c.id}/faturamento`,{forma:'stripe'})).status,400);
    await assert.rejects(criarCobrancaStripe(s.P,c.id,{pedido:'pedido_12345',produto:'starter',moeda:'usd',canal:'checkout'},'teste'),e=>e.codigo==='stripe_nao_habilitado');
    assert.equal(chamadas,0);
    assert.equal((await s.ops.put(`/api/plataforma/empresas/${c.id}/faturamento`,{forma:'stripe',confirmar_stripe:true})).status,200);
    assert.equal(chamadas,0);
    assert.equal(um(s.P.db,'select count(*) n from stripe_pedidos').n,0);
  }finally{await s.fechar();}
});

test('auditoria registra cadastro global, vínculo, contrato e agendamento com antes/depois',async()=>{
  const s=await ambiente();try{
    const {c}=await s.criar('auditoria-geral');
    const u=(await s.ops.post(`/api/plataforma/empresas/${c.id}/usuarios`,{email:'pessoa@example.com',name:'Antes',convidar:false})).dados;
    await s.ops.put(`/api/plataforma/usuarios/${u.id}`,{name:'Depois',email:'novo@example.com'});
    await s.ops.put(`/api/plataforma/empresas/${c.id}/usuarios/${u.id}`,{role_id:'role_manager',status:'ativo'});
    await s.ops.put(`/api/plataforma/empresas/${c.id}/faturamento`,{fim:'2026-12-31'});
    await s.ops.post(`/api/plataforma/empresas/${c.id}/plano`,{plan_id:s.planos.find(p=>p.name==='GreenIA Team').id,vigencia:'proximo_ciclo'});
    const rows=todos(s.P.db,'select * from audit_log');
    for(const a of ['user.updated','user.role_changed','company.billing_changed','company.plan_scheduled'])assert.ok(rows.some(x=>x.action===a&&x.user_id));
    const atualizacao=rows.find(x=>x.action==='user.updated'&&x.entity_id===u.id);assert.equal(JSON.parse(atualizacao.before).name,'Antes');assert.equal(JSON.parse(atualizacao.after).name,'Depois');
    assert.equal(um(s.P.tenant(c.id).db,'select email from pessoas where user_id=?',u.id).email,'novo@example.com');
  }finally{await s.fechar();}
});

test('assinatura ou fatura pendente bloqueia troca de plano e cobrança sem cancelar nem chamar o provedor',async()=>{
  let chamadas=0;
  const s=await ambiente({stripe:{env:{STRIPE_HABILITADO:'teste',STRIPE_WEBHOOK_SECRET:'whsec_local'},api:async()=>{chamadas++;throw Error('rede inesperada');}}});
  try{
    const {c}=await s.criar('pendente');
    assert.equal((await s.ops.put(`/api/plataforma/empresas/${c.id}/faturamento`,{forma:'stripe',confirmar_stripe:true})).status,200);
    exec(s.P.db,`insert into stripe_pedidos(id,empresa,produto,moeda,quantidade,canal,snapshot,criado_em,estado) values (?,?,'starter','brl',1,'fatura','{}',?,'aguardando')`,'pedido_pendente',c.id,s.P.agora().toISOString());
    assert.equal((await s.ops.put(`/api/plataforma/empresas/${c.id}/faturamento`,{forma:'externa'})).status,409);
    assert.equal((await s.ops.post(`/api/plataforma/empresas/${c.id}/plano`,{plan_id:s.planos.find(p=>p.name==='GreenIA Team').id})).status,409);
    assert.equal((await s.ops.get(`/api/plataforma/empresas/${c.id}/faturamento`)).dados.obrigacoes[0].estado,'aguardando');
    assert.equal(um(s.P.db,'select estado from stripe_pedidos').estado,'aguardando');assert.equal(chamadas,0);
  }finally{await s.fechar();}
});

test('edição do plano conserva a franquia dos meses anteriores e pacote remanescente',async()=>{
  const s=await ambiente();try{
    const {c}=await s.criar('edicao-plano'),t=s.P.tenant(c.id);
    exec(t.db,"insert into pacotes(em,creditos,origem) values (?,1000,'console')",s.P.agora().toISOString());
    exec(t.db,'insert into uso(em,custo) values (?,25)',s.P.agora().toISOString());
    assert.equal(situacaoPlano(t).pacoteDisponivel,500);
    assert.equal((await s.ops.put(`/api/plataforma/planos/${s.p.id}`,{credits:3000})).status,409);
    s.relogio('2026-11-01T12:00:00Z');await s.ops.entrarConsole('ops@theneil.com.br');
    assert.equal((await s.ops.put(`/api/plataforma/planos/${s.p.id}`,{credits:2100})).status,200);
    assert.equal(situacaoPlano(t).creditos,2100);assert.equal(situacaoPlano(t).pacoteDisponivel,500);
  }finally{await s.fechar();}
});

test('franquia única respeita pacote já consumido e sua validade original',async()=>{
  const s=await ambiente();try{
    const p=(await s.ops.post('/api/plataforma/planos',planoLivre({settings:{comercial:{condicao:'gratuito',moeda:'usd',preco:0,renovacao:'nenhuma'}}}))).dados;
    const {c}=await s.criar('pacote-unico',p.id),t=s.P.tenant(c.id);
    exec(t.db,"insert into pacotes(em,creditos,origem,validade) values (?,50,'console','2026-10-24')",s.P.agora().toISOString());
    exec(t.db,'insert into uso(em,custo) values (?,1.4)',s.P.agora().toISOString());
    assert.equal(situacaoPlano(t).pacoteDisponivel,10);assert.equal(situacaoPlano(t).naReserva,0);
    s.relogio('2026-11-01T12:00:00Z');assert.equal(situacaoPlano(t).pacoteDisponivel,0);assert.equal(situacaoPlano(t).naReserva,0);
    exec(t.db,"insert into pacotes(em,creditos,origem) values (?,50,'console')",s.P.agora().toISOString());
    assert.equal(situacaoPlano(t).pacoteDisponivel,50);
  }finally{await s.fechar();}
});
