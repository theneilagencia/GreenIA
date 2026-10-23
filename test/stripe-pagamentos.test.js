import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { subirPlataforma } from './ajuda-plataforma.js';
import { exec, um, todos } from '../src/db.js';
import { situacaoPlano, checarPlano } from '../src/plano.js';
import { criarCobrancaStripe, processarEventoStripe, verificarAssinaturaStripe, proximoMesStripe, rodadaRenovacoesStripe, configurarStripe } from '../src/plataforma/stripe-pagamentos.js';
import { concederDireitoStripe } from '../src/plataforma/stripe-direitos.js';

const segredo='whsec_teste_local';
const evento=(id,tipo,recurso)=>({id:`evt_${id}`,type:tipo,livemode:false,data:{object:{id:recurso}}});
function stripeFalso(live=false) {
  const objetos=new Map(), chaves=new Map(), chamadas=[]; let n=0;
  const api=async(metodo,path,dados={},key)=>{
    chamadas.push({metodo,path,dados,key});
    if (metodo==='GET') { const r=objetos.get(path.split('/').at(-1)); if(!r)throw new Error('objeto não existe: '+path);return structuredClone(r); }
    if(chaves.has(key))return structuredClone(chaves.get(key));
    let r;
    if(path==='/v1/customers')r={id:`cus_${++n}`,livemode:live};
    else if(path.startsWith('/v1/customers/'))r={...objetos.get(path.split('/').at(-1)),...dados};
    else if(path==='/v1/checkout/sessions')r={id:`cs_${++n}`,livemode:live,...dados,amount_total:dados.line_items[0].price_data.unit_amount,currency:dados.line_items[0].price_data.currency,status:'open',payment_status:'unpaid',url:`https://checkout.stripe.com/c/pay/test${n}`};
    else if(path==='/v1/invoices')r={id:`in_${++n}`,livemode:live,...dados,status:'draft',lines:{data:[],has_more:false}};
    else if(path==='/v1/invoiceitems') {r={id:`ii_${++n}`,livemode:live};const inv=objetos.get(dados.invoice);inv.total=dados.amount;inv.lines.data.push({amount:dados.amount});}
    else if(path.endsWith('/finalize')) {r={...objetos.get(path.split('/')[3]),status:'open',hosted_invoice_url:`https://invoice.stripe.com/i/test${n}`};}
    else throw new Error('rota inesperada: '+path);
    objetos.set(r.id,r);chaves.set(key,r);return structuredClone(r);
  };
  return {api,objetos,chamadas};
}
async function ambiente(op={}) {
  const falso=stripeFalso(op.modo==='producao');let agora=new Date('2026-10-22T18:00:00Z');
  const S=await subirPlataforma({agora:()=>agora,stripe:{env:{STRIPE_HABILITADO:op.modo || 'teste',STRIPE_WEBHOOK_SECRET:segredo,...(op.modo==='producao'?{STRIPE_ACCOUNT_ID:'acct_liveGreenia'}:{})},api:falso.api,
    cambio:{transporte:async()=>({ok:true,json:async()=>({value:[{cotacaoVenda:5,dataHoraCotacao:'2026-10-22 13:08:00.000'}]})})}},...op});
  const ops=await S.navegador().entrarConsole('ops@theneil.com.br');
  const planos=(await ops.get('/api/plataforma/planos')).dados.planos;
  const plano=planos.find(p=>p.name==='GreenIA Starter');
  const criar=async(nome='Empresa A',slug='empresa-a')=>{
    const c=await ops.post('/api/plataforma/empresas',{name:nome,slug,plan_id:plano.id,admin_email:`ana@${slug}.com`,contact_email:`financeiro@${slug}.com`});
    assert.equal(c.status,200,JSON.stringify(c.dados));
    await ops.post(`/api/plataforma/empresas/${c.dados.id}/status`,{status:'ativa'});
    assert.equal((await ops.put(`/api/plataforma/empresas/${c.dados.id}/faturamento`,{forma:'stripe',confirmar_stripe:true})).status,200);
    return c.dados;
  };
  const A=await criar();
  return {...S,ops,A,falso,criar,relogio:d=>agora=new Date(d),criarPedido:(d)=>criarCobrancaStripe(S.P,A.id,d,'teste')};
}
const compra=(id,extra={})=>({pedido:id,produto:'starter',moeda:'brl',canal:'checkout',...extra});

test('fatura exige contato antes da rede e atualiza email de cliente Stripe existente',async()=>{
  const s=await ambiente();try{
    await s.ops.put(`/api/plataforma/empresas/${s.A.id}`,{contact_email:''});
    await assert.rejects(s.criarPedido(compra('pedido_sememail',{canal:'fatura',vencimento_dias:7})),e=>e.status===400&&e.codigo==='stripe_email');
    assert.equal(s.falso.chamadas.length,0);
    await s.criarPedido(compra('pedido_cliente',{produto:'capacity_pack'}));
    await s.ops.put(`/api/plataforma/empresas/${s.A.id}`,{contact_email:'financeiro@example.com'});
    await s.criarPedido(compra('pedido_fatura',{canal:'fatura',vencimento_dias:7}));
    const atualizacao=s.falso.chamadas.find(x=>x.metodo==='POST'&&x.path.startsWith('/v1/customers/'));
    assert.equal(atualizacao.dados.email,'financeiro@example.com');
    assert.ok(atualizacao.key);
  }finally{await s.fechar();}
});
function pagarCheckout(s,id) { const r=s.falso.objetos.get(id);r.status='complete';r.payment_status='paid';return r; }
function registrarUso(t,custo,em=t.agora().toISOString()) {
  // As demais colunas são opcionais na tabela de uso.
  exec(t.db,'insert into uso (em,custo) values (?,?)',em,custo);
}

test('assinatura exige corpo bruto íntegro, timestamp recente, modo teste e conta própria',()=>{
  const agora=new Date('2026-10-22T18:00:00Z'),ts=Math.floor(agora.getTime()/1000);
  const e=evento('assinatura','invoice.paid','in_1'),body=JSON.stringify(e);
  const ass=b=>`t=${ts},v1=${createHmac('sha256',segredo).update(`${ts}.${b}`).digest('hex')}`;
  assert.equal(verificarAssinaturaStripe(body,ass(body),segredo,agora).id,e.id);
  assert.throws(()=>verificarAssinaturaStripe(body+' ',ass(body),segredo,agora));
  assert.throws(()=>verificarAssinaturaStripe(body,ass(body),segredo,new Date(agora.getTime()+301000)));
  for(const mudanca of [{livemode:true},{account:'acct_outro'}]) {
    const b=JSON.stringify({...e,...mudanca});assert.throws(()=>verificarAssinaturaStripe(b,ass(b),segredo,agora));
  }
});

test('sandbox desligado por padrão e restauração isolada impede efeitos externos',async()=>{
  const s=await ambiente({stripe:{env:{}}});
  try {assert.equal(s.P.stripe,undefined);assert.equal((await s.ops.get(`/api/plataforma/empresas/${s.A.id}/cobrancas`)).status,503);}
  finally{await s.fechar();}
  const isolado=await ambiente({isolado:true});try{assert.equal(isolado.P.stripe,undefined);}finally{await isolado.fechar();}
});

test('rotas financeiras exigem sessão de plataforma e CSRF; empresa não pode emitir cobrança',async()=>{
  const s=await ambiente();try{
    assert.equal((await s.navegador().post(`/api/plataforma/empresas/${s.A.id}/cobrancas`,compra('pedido_auth'))).status,401);
    assert.equal((await s.ops.post(`/api/plataforma/empresas/${s.A.id}/cobrancas`,compra('pedido_auth'),{'x-csrf':'errado'})).status,403);
    const empresa=s.navegador();await empresa.get('/empresa-a');await empresa.entrarEmpresa('ana@empresa-a.com');
    assert.equal((await empresa.post(`/api/plataforma/empresas/${s.A.id}/cobrancas`,compra('pedido_auth'))).status,401);
    assert.equal(s.falso.chamadas.length,0);
  }finally{await s.fechar();}
});

test('checkout BRL cota no servidor, mantém quantidade de créditos e repete sem criar nova cobrança',async()=>{
  const s=await ambiente();try{
    const a=await s.criarPedido(compra('pedido_brl01'));
    assert.equal(a.snapshot.total,99500);assert.equal(a.snapshot.creditos,2000);
    const b=await s.criarPedido(compra('pedido_brl01'));assert.equal(b.url,a.url);
    assert.equal(s.falso.chamadas.filter(x=>x.path==='/v1/checkout/sessions'&&x.metodo==='POST').length,1);
    const sess=s.falso.chamadas.find(x=>x.path==='/v1/checkout/sessions').dados;
    assert.equal(sess.adaptive_pricing.enabled,false);assert.equal(sess.line_items[0].quantity,1);
    assert.equal(situacaoPlano(s.P.tenant(s.A.id)).creditos,2000);
    assert.equal(um(s.P.db,'select count(*) n from stripe_pagamentos').n,0);
  }finally{await s.fechar();}
});

test('evento pendente não concede; confirmação repetida concede um período, preservando virada do mês',async()=>{
  const s=await ambiente();try{
    await s.criarPedido(compra('pedido_pago01'));
    const p=um(s.P.db,'select * from stripe_pedidos');
    await processarEventoStripe(s.P,evento('pendente','checkout.session.completed',p.remoto));
    const t=s.P.tenant(s.A.id);assert.equal(um(t.db,"select 1 from sqlite_master where name='stripe_periodos'"),undefined);
    pagarCheckout(s,p.remoto);
    await processarEventoStripe(s.P,evento('sucesso','checkout.session.async_payment_succeeded',p.remoto));
    await processarEventoStripe(s.P,evento('sucesso','checkout.session.async_payment_succeeded',p.remoto));
    await processarEventoStripe(s.P,evento('outroevento','checkout.session.completed',p.remoto));
    assert.equal(um(t.db,'select count(*) n from stripe_periodos').n,1);
    registrarUso(t,19);assert.equal(situacaoPlano(t).usados,1900);
    s.relogio('2026-11-01T12:00:00Z');assert.equal(situacaoPlano(t).usados,1900);
    s.relogio('2026-11-22T18:00:00Z');assert.throws(()=>checarPlano(t),e=>e.status===402);
    assert.equal(um(s.P.db,'select status from companies where id=?',s.A.id).status,'ativa');
  }finally{await s.fechar();}
});

test('Customer, total ou moeda divergentes não concedem capacidade e permitem reprocessar após conciliação',async()=>{
  for(const mudanca of [{customer:'cus_errado'},{amount_total:1},{currency:'usd'}]) {
    const s=await ambiente();try{
      await s.criarPedido(compra('pedido_diverge'));const p=um(s.P.db,'select * from stripe_pedidos');
      Object.assign(pagarCheckout(s,p.remoto),mudanca);
      await assert.rejects(processarEventoStripe(s.P,evento('diverge','checkout.session.completed',p.remoto)));
      assert.equal(um(s.P.db,'select count(*) n from stripe_pagamentos').n,0);
      assert.equal(um(s.P.db,'select count(*) n from stripe_eventos').n,0);
    }finally{await s.fechar();}
  }
});

test('Capacity Pack confirmado uma vez, sem nova reserva; reserva restringe a classe e saldo acumula',async()=>{
  const s=await ambiente();try{
    await s.criarPedido(compra('pedido_plano01'));const p=um(s.P.db,'select * from stripe_pedidos');pagarCheckout(s,p.remoto);
    await processarEventoStripe(s.P,evento('pagoPlano','checkout.session.completed',p.remoto));
    await s.criarPedido(compra('pedido_pacote01',{produto:'capacity_pack',quantidade:2}));
    const pack=um(s.P.db,"select * from stripe_pedidos where produto='capacity_pack'");pagarCheckout(s,pack.remoto);
    await processarEventoStripe(s.P,evento('pagoPack','checkout.session.completed',pack.remoto));
    await processarEventoStripe(s.P,evento('pagoPack2','checkout.session.completed',pack.remoto));
    const t=s.P.tenant(s.A.id);assert.equal(um(t.db,"select count(*) n from pacotes where origem='stripe'").n,1);
    assert.equal(situacaoPlano(t).pacoteDisponivel,4000);assert.equal(situacaoPlano(t).reserva,400);
    registrarUso(t,30);assert.equal(situacaoPlano(t).pacoteDisponivel,3000);assert.equal(situacaoPlano(t).fase,'pacote');
  }finally{await s.fechar();}
});

test('fatura BRL tem item vinculado explicitamente; invoice.paid libera e nova renovação usa nova cotação',async()=>{
  const s=await ambiente();try{
    const a=await s.criarPedido(compra('pedido_invoice01',{canal:'fatura',vencimento_dias:5}));
    const p=um(s.P.db,'select * from stripe_pedidos');const inv=s.falso.objetos.get(p.remoto);
    Object.assign(inv,{status:'paid',amount_paid:99500,amount_remaining:0});
    await processarEventoStripe(s.P,evento('pagoInvoice','invoice.paid',p.remoto));
    assert.equal(um(s.P.tenant(s.A.id).db,'select count(*) n from stripe_periodos').n,1);
    assert.equal(s.falso.chamadas.find(x=>x.path==='/v1/invoiceitems').dados.invoice,p.remoto);
    assert.equal(s.falso.chamadas.find(x=>x.path==='/v1/invoices').dados.pending_invoice_items_behavior,'exclude');
    s.relogio('2026-11-22T18:00:00Z');
    s.P.stripe.cambio.transporte=async()=>({ok:true,json:async()=>({value:[{cotacaoVenda:5.5,dataHoraCotacao:'2026-11-22 13:08:00.000'}]})});
    const b=await s.criarPedido(compra('pedido_invoice02',{canal:'fatura',vencimento_dias:5}));
    assert.equal(a.snapshot.total,99500);assert.equal(b.snapshot.total,109450);
  }finally{await s.fechar();}
});

test('USD Checkout cria assinatura e invoice paga renova pelo período canônico, mesmo fora de ordem',async()=>{
  const s=await ambiente();try{
    await s.criarPedido(compra('pedido_usd01',{moeda:'usd'}));const p=um(s.P.db,'select * from stripe_pedidos');
    const cs=s.falso.objetos.get(p.remoto);assert.equal(cs.mode,'subscription');
    const sub={id:'sub_test1',livemode:false,status:'active',customer:p.customer,metadata:{greenia_order:p.id,greenia_company:p.empresa}};
    s.falso.objetos.set(sub.id,sub);
    const inicio=Math.floor(s.P.agora().getTime()/1000),fim=inicio+31*86400;
    const inv={id:'in_subscription',livemode:false,status:'paid',customer:p.customer,currency:'usd',total:19900,amount_paid:19900,amount_remaining:0,
      parent:{subscription_details:{subscription:sub.id}},billing_reason:'subscription_create',lines:{has_more:false,data:[{quantity:1,period:{start:inicio,end:fim}}]}};
    s.falso.objetos.set(inv.id,inv);
    await processarEventoStripe(s.P,evento('usdPaid','invoice.paid',inv.id));
    assert.equal(situacaoPlano(s.P.tenant(s.A.id)).renova,'2026-11-22');
    await assert.rejects(s.criarPedido(compra('pedido_usd02',{moeda:'usd'})),/Já existe/);
    s.relogio('2026-11-22T18:00:00Z');
    const renovada={...inv,id:'in_renew',billing_reason:'subscription_cycle',lines:{has_more:false,data:[{quantity:1,period:{start:fim,end:fim+30*86400}}]}};
    s.falso.objetos.set(renovada.id,renovada);await processarEventoStripe(s.P,evento('usdRenew','invoice.paid',renovada.id));
    assert.equal(situacaoPlano(s.P.tenant(s.A.id)).cobrancaPendente,false);
    assert.equal(um(s.P.tenant(s.A.id).db,'select count(*) n from stripe_periodos').n,2);
  }finally{await s.fechar();}
});

test('reutilização de pedido entre empresas é recusada; cotação indisponível não gera cobrança',async()=>{
  const s=await ambiente();try{
    await s.criarPedido(compra('pedido_cross01'));const b=await s.criar('Empresa B','empresa-b');
    await assert.rejects(criarCobrancaStripe(s.P,b.id,compra('pedido_cross01'),'teste'),/outros dados/);
    s.P.stripe.cambio.transporte=async()=>{throw new Error('offline');};
    await assert.rejects(criarCobrancaStripe(s.P,b.id,compra('pedido_cross02'),'teste'),/indisponível/);
    assert.equal(um(s.P.db,'select count(*) n from stripe_pedidos where empresa=?',b.id).n,0);
  }finally{await s.fechar();}
});

test('webhook HTTP usa assinatura e endpoint de empresa não contorna isolamento',async()=>{
  const s=await ambiente({subdominioBase:'plataforma.teste'});try{
    const visitante=s.navegador();const e=evento('httpWebhook','invoice.payment_failed','in_failed');
    const b=JSON.stringify(e),ts=Math.floor(s.P.agora().getTime()/1000);
    const assinatura=`t=${ts},v1=${createHmac('sha256',segredo).update(`${ts}.${b}`).digest('hex')}`;
    assert.equal((await visitante.post('/api/stripe/webhook',e)).status,400);
    assert.equal((await visitante.post('/api/stripe/webhook',e,{'stripe-signature':assinatura})).status,200);
    assert.equal(um(s.P.db,'select count(*) n from stripe_pendencias').n,1);
    const outro=s.navegador('empresa-a.plataforma.teste');
    assert.notEqual((await outro.post('/api/stripe/webhook',e,{'stripe-signature':assinatura})).status,200);
  }finally{await s.fechar();}
});

test('datas mensais respeitam fim de mês e ano bissexto',()=>{
  assert.equal(proximoMesStripe('2026-01-31T18:00:00.000Z'),'2026-02-28T18:00:00.000Z');
  assert.equal(proximoMesStripe('2028-01-31T18:00:00.000Z'),'2028-02-29T18:00:00.000Z');
});

test('migração preserva saldo legado sem cobrar duas vezes o uso anterior com o mesmo timestamp',async()=>{
  const s=await ambiente();try{
    const t=s.P.tenant(s.A.id);
    exec(t.db,"insert into pacotes (em,creditos,origem,produto) values (?,1000,'console','capacity_pack')",s.P.agora().toISOString());
    registrarUso(t,25);assert.equal(situacaoPlano(t).pacoteDisponivel,500);
    await s.criarPedido(compra('pedido_migracao'));const p=um(s.P.db,'select * from stripe_pedidos');pagarCheckout(s,p.remoto);
    await processarEventoStripe(s.P,evento('migracao','checkout.session.completed',p.remoto));
    assert.equal(situacaoPlano(t).usados,0);assert.equal(situacaoPlano(t).pacoteDisponivel,500);
    registrarUso(t,21);assert.equal(situacaoPlano(t).pacoteDisponivel,400);
  }finally{await s.fechar();}
});

test('reprocessamento após efeito local persistido não duplica crédito se o registro central faltava',async()=>{
  const s=await ambiente();try{
    await s.criarPedido(compra('pedido_restart'));const p=um(s.P.db,'select * from stripe_pedidos');const r=pagarCheckout(s,p.remoto),snap=JSON.parse(p.snapshot),t=s.P.tenant(s.A.id);
    concederDireitoStripe(t,{comprovante:r.id,produto:'starter',inicio:snap.inicio,fim:snap.fim,creditos:2000,reserva:400,moeda:'brl',total:snap.total},situacaoPlano(t));
    assert.equal(um(s.P.db,'select count(*) n from stripe_pagamentos').n,0);
    await processarEventoStripe(s.P,evento('restart','checkout.session.completed',p.remoto));
    assert.equal(um(t.db,'select count(*) n from stripe_periodos').n,1);
    assert.equal(um(s.P.db,'select count(*) n from stripe_pagamentos').n,1);
  }finally{await s.fechar();}
});

test('cancelamento de assinatura preserva período pago; reembolso vira pendência sem apagar histórico',async()=>{
  const s=await ambiente();try{
    await s.criarPedido(compra('pedido_cancel'));const p=um(s.P.db,'select * from stripe_pedidos');pagarCheckout(s,p.remoto);
    await processarEventoStripe(s.P,evento('antesCancel','checkout.session.completed',p.remoto));
    const sub={id:'sub_cancel',livemode:false,status:'canceled',customer:p.customer};
    s.falso.objetos.set(sub.id,sub);exec(s.P.db,'update stripe_pedidos set subscription=? where id=?',sub.id,p.id);
    await processarEventoStripe(s.P,evento('cancelado','customer.subscription.deleted',sub.id));
    await processarEventoStripe(s.P,evento('reembolso','charge.refunded','ch_refund'));
    assert.equal(situacaoPlano(s.P.tenant(s.A.id)).cobrancaPendente,false);
    assert.equal(um(s.P.db,'select status from companies where id=?',s.A.id).status,'ativa');
    assert.equal(um(s.P.db,'select count(*) n from stripe_pendencias').n,1);
  }finally{await s.fechar();}
});

test('geração mensal BRL exige habilitação e aceite; nova cotação sem duplicar nem liberar antes de pagar',async()=>{
  const s=await ambiente();try{
    await s.criarPedido(compra('pedido_auto01',{canal:'fatura',vencimento_dias:5,renovar:true}));
    const p=um(s.P.db,'select * from stripe_pedidos'),inv=s.falso.objetos.get(p.remoto);
    Object.assign(inv,{status:'paid',amount_paid:99500,amount_remaining:0});
    await processarEventoStripe(s.P,evento('autoPago','invoice.paid',inv.id));
    const t=s.P.tenant(s.A.id);assert.equal(um(s.P.db,'select proxima_em from stripe_renovacoes').proxima_em,'2026-11-22T18:00:00.000Z');
    s.relogio('2026-11-22T18:00:00Z');
    assert.equal((await rodadaRenovacoesStripe(s.P)).emitidas,0);
    s.P.stripe.env.STRIPE_RENOVACOES='1';
    s.P.stripe.cambio.transporte=async()=>({ok:true,json:async()=>({value:[{cotacaoVenda:5.5,dataHoraCotacao:'2026-11-22 13:08:00.000'}]})});
    assert.equal((await rodadaRenovacoesStripe(s.P)).emitidas,1);
    assert.equal((await rodadaRenovacoesStripe(s.P)).emitidas,0);
    const nova=um(s.P.db,'select * from stripe_pedidos where id!=?',p.id);
    assert.equal(JSON.parse(nova.snapshot).total,109450);
    assert.equal(um(t.db,'select count(*) n from stripe_periodos').n,1);
    assert.throws(()=>checarPlano(t),e=>e.status===402);
    const outra=s.falso.objetos.get(nova.remoto);Object.assign(outra,{status:'paid',amount_paid:109450,amount_remaining:0});
    await processarEventoStripe(s.P,evento('autoRenovou','invoice.paid',outra.id));
    assert.equal(situacaoPlano(t).cobrancaPendente,false);
    assert.equal(um(s.P.db,'select proxima_em from stripe_renovacoes').proxima_em,'2026-12-22T18:00:00.000Z');
    await s.ops.entrarConsole('ops@theneil.com.br');
    assert.equal((await s.ops.post(`/api/plataforma/empresas/${s.A.id}/cobrancas/parar-renovacao`,{})).status,200);
    assert.equal((await s.ops.post(`/api/plataforma/empresas/${s.A.id}/cobrancas/retomar-renovacao`,{})).status,200);
    assert.equal(um(s.P.db,'select ativa from stripe_renovacoes').ativa,1);
    await s.ops.post(`/api/plataforma/empresas/${s.A.id}/cobrancas/parar-renovacao`,{});
    s.relogio('2026-12-22T18:00:00Z');assert.equal((await rodadaRenovacoesStripe(s.P)).emitidas,0);
  }finally{await s.fechar();}
});

test('falha de câmbio na geração mensal preserva próxima data e tenta novamente sem emissão vazia',async()=>{
  const s=await ambiente();try{
    await s.criarPedido(compra('pedido_auto02',{canal:'fatura',vencimento_dias:5,renovar:true}));
    const p=um(s.P.db,'select * from stripe_pedidos'),inv=s.falso.objetos.get(p.remoto);
    Object.assign(inv,{status:'paid',amount_paid:99500,amount_remaining:0});
    await processarEventoStripe(s.P,evento('autoFalhaPago','invoice.paid',inv.id));
    s.relogio('2026-11-22T18:00:00Z');s.P.stripe.env.STRIPE_RENOVACOES='1';
    s.P.stripe.cambio.transporte=async()=>{throw new Error('sem cotação');};
    assert.equal((await rodadaRenovacoesStripe(s.P)).emitidas,0);
    assert.equal(um(s.P.db,'select count(*) n from stripe_pedidos').n,1);
    assert.equal(um(s.P.db,'select ultimo_erro from stripe_renovacoes').ultimo_erro,'emissao_pendente');
    assert.equal(um(s.P.db,'select proxima_em from stripe_renovacoes').proxima_em,'2026-11-22T18:00:00.000Z');
  }finally{await s.fechar();}
});


test('produção emite checkout e fatura BRL, aceita apenas eventos live e não duplica créditos',async()=>{
  const s=await ambiente({modo:'producao'});try{
    assert.equal((await s.ops.get('/api/plataforma/eu')).dados.stripeModo,'producao');
    assert.equal((await s.ops.get('/api/plataforma/eu')).dados.stripeTeste,false);
    await s.criarPedido(compra('pedido_live_pack',{produto:'capacity_pack'}));
    const p=um(s.P.db,'select * from stripe_pedidos where id=?','pedido_live_pack');
    pagarCheckout(s,p.remoto);
    const e={...evento('livepack','checkout.session.completed',p.remoto),livemode:true};
    await assert.rejects(processarEventoStripe(s.P,{...e,livemode:false}),/incompatível/);
    assert.equal(todos(s.P.db,'select * from stripe_pagamentos').length,0);
    await processarEventoStripe(s.P,e);await processarEventoStripe(s.P,e);
    assert.equal(todos(s.P.db,'select * from stripe_pagamentos').length,1);
    await s.criarPedido(compra('pedido_live_fatura',{canal:'fatura',vencimento_dias:7}));
    const f=um(s.P.db,'select * from stripe_pedidos where id=?','pedido_live_fatura');
    const inv=s.falso.objetos.get(f.remoto);
    Object.assign(inv,{status:'paid',amount_remaining:0,amount_paid:inv.total});
    await processarEventoStripe(s.P,{...evento('liveinvoice','invoice.paid',inv.id),livemode:true});
    assert.equal(todos(s.P.db,'select * from stripe_pagamentos').length,2);
    assert.equal((await s.ops.get(`/api/plataforma/empresas/${s.A.id}/cobrancas`)).dados.modo,'producao');
  }finally{await s.fechar();}
});

test('não permite reutilizar o banco Stripe entre contas ou ambientes',async()=>{
  const s=await ambiente();try{
    for(const env of [
      {STRIPE_HABILITADO:'producao',STRIPE_ACCOUNT_ID:'acct_liveGreenia'},
      {STRIPE_HABILITADO:'teste',STRIPE_ACCOUNT_ID:'acct_outro'},
    ])assert.throws(()=>configurarStripe(s.P,{env:{...env,STRIPE_WEBHOOK_SECRET:segredo},api:s.falso.api}),/outra conta ou ambiente/);
    assert.equal(um(s.P.db,'select modo from stripe_ambiente').modo,'teste');
  }finally{await s.fechar();}
});

test('webhook live exige assinatura íntegra e recusa eventos de teste e Connect',()=>{
  const agora=new Date(),ts=Math.floor(agora.getTime()/1000);
  for(const extra of [{livemode:true},{livemode:false},{livemode:true,account:'acct_connect'}]){
    const b=JSON.stringify({...evento('webhooklive','invoice.paid','in_live'),...extra});
    const ass=`t=${ts},v1=${createHmac('sha256',segredo).update(`${ts}.${b}`).digest('hex')}`;
    if(extra.livemode && !extra.account)assert.equal(verificarAssinaturaStripe(b,ass,segredo,agora,true).livemode,true);
    else assert.throws(()=>verificarAssinaturaStripe(b,ass,segredo,agora,true),/incompatível/);
  }
});


test('endpoint HTTP de produção processa evento live assinado e rejeita evento de teste',async()=>{
  const s=await ambiente({modo:'producao'});try{
    for(const live of [false,true]){
      const e={...evento(live?'liveHttp':'testHttp','invoice.payment_failed','in_failed'),livemode:live};
      const b=JSON.stringify(e),ts=Math.floor(s.P.agora().getTime()/1000);
      const assinatura=`t=${ts},v1=${createHmac('sha256',segredo).update(`${ts}.${b}`).digest('hex')}`;
      assert.equal((await s.navegador().post('/api/stripe/webhook',e,{'stripe-signature':assinatura})).status,live?200:400);
    }
    assert.equal(um(s.P.db,'select count(*) n from stripe_pendencias').n,1);
  }finally{await s.fechar();}
});
