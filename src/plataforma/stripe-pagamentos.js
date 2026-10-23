// Pagamentos desligados por padrão; conta e ambiente explícitos para produção.
import { createHmac, timingSafeEqual, createHash } from 'node:crypto';
import { exec, todos, um, json, transacao } from '../db.js';
import { erro, lerBruto, enviarJson } from '../http.js';
import { ITENS_STRIPE, clienteStripe, ambienteStripe } from './stripe-catalogo.js';
import { cotarCobrancaBrl } from './stripe-cambio.js';
import { concederDireitoStripe } from './stripe-direitos.js';
import { situacaoPlano } from '../plano.js';
import { exigirEmpresa, lerPlanoPorId, mudarPlano } from './empresas.js';
import { exigir, permissoesNaPlataforma } from './rbac.js';
import { auditar } from './auditoria.js';
import { lerFaturamento, vigente } from './faturamento.js';

const hash = s => createHash('sha256').update(s).digest('hex');
const idDe = x => typeof x === 'string' ? x : x?.id;
const caminhoId = x => { if (!/^[A-Za-z0-9_]+$/.test(x || '')) throw erro(409, 'stripe_id', 'Identificador Stripe inválido.'); return x; };
const iso = s => new Date(s*1000).toISOString();
export function proximoMesStripe(inicio) {
  const d = new Date(inicio), dia = d.getUTCDate();
  d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth()+1);
  const ultimo = new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();
  d.setUTCDate(Math.min(dia,ultimo)); return d.toISOString();
}

export function verificarAssinaturaStripe(bruto, assinatura, segredo, agora = new Date(), live = false) {
  if (!segredo || typeof assinatura !== 'string' || assinatura.length > 2048) throw erro(400, 'stripe_assinatura', 'Assinatura Stripe inválida.');
  const partes = assinatura.split(',').map(p => p.trim().split('='));
  const ts = partes.filter(([k])=>k==='t');
  if (ts.length !== 1 || !/^\d+$/.test(ts[0][1]) || Math.abs(agora.getTime()/1000-Number(ts[0][1])) > 300) throw erro(400, 'stripe_assinatura', 'Assinatura Stripe expirada ou inválida.');
  const esperado = createHmac('sha256', segredo).update(`${ts[0][1]}.${bruto}`).digest();
  if (!partes.some(([k,v])=>k==='v1' && /^[a-f0-9]{64}$/.test(v || '') && timingSafeEqual(Buffer.from(v,'hex'),esperado))) throw erro(400,'stripe_assinatura','Assinatura Stripe inválida.');
  let e; try { e=JSON.parse(bruto); } catch { throw erro(400,'stripe_json','Evento inválido.'); }
  if (!/^evt_[A-Za-z0-9]+$/.test(e.id || '') || e.livemode !== live || e.account || !e.type || !e.data?.object?.id) throw erro(400,'stripe_evento','Evento incompatível com este ambiente.');
  return e;
}

export function configurarStripe(P, op = {}) {
  const env = op.env || {};
  if (!env.STRIPE_HABILITADO || env.STRIPE_HABILITADO === '0' || P.isolado) return;
  const ambiente = ambienteStripe(env);
  const api = op.api || clienteStripe(env, op.transporte);
  if (!env.STRIPE_WEBHOOK_SECRET) throw new Error('Configure STRIPE_WEBHOOK_SECRET antes de habilitar pagamentos.');
  const base = new URL(P.urlBase);
  if (base.protocol !== 'https:' && !op.api) throw new Error('O retorno do Stripe precisa usar PLATAFORMA_URL HTTPS.');
  P.db.exec(`create table if not exists stripe_clientes (empresa text not null, moeda text not null, customer text not null unique, primary key(empresa,moeda));
    create table if not exists stripe_pedidos (
      id text primary key, empresa text not null, produto text not null, moeda text not null, quantidade integer not null,
      canal text not null, snapshot text not null, customer text, remoto text unique, subscription text,
      url text, estado text not null default 'preparando', criado_em text not null, ultimo_erro text);
    create unique index if not exists stripe_assinatura on stripe_pedidos(subscription) where subscription is not null;
    create unique index if not exists stripe_plano_aberto on stripe_pedidos(empresa) where produto!='capacity_pack' and estado in ('preparando','aguardando');
    create table if not exists stripe_eventos (id text primary key, tipo text not null, processado_em text not null);
    create table if not exists stripe_pagamentos (id text primary key, pedido text not null, moeda text not null, total integer not null, confirmado_em text not null);
    create table if not exists stripe_renovacoes (empresa text primary key, produto text not null, vencimento integer not null,
      proxima_em text not null, ativa integer not null default 1, pedido_pendente text, ultimo_erro text);
    create table if not exists stripe_pendencias (id text primary key, tipo text not null, criado_em text not null);
    create table if not exists stripe_fatura_envios (pedido text primary key, destinatario text not null, iniciado_em text not null, confirmado_em text);`);
  // Um banco local não pode reutilizar clientes, pedidos ou créditos de outra conta/modo.
  P.db.exec(`create table if not exists stripe_ambiente (id integer primary key check(id=1), modo text not null, conta text not null);`);
  const vinculo = um(P.db,'select * from stripe_ambiente where id=1');
  if (vinculo && (vinculo.modo !== ambiente.modo || vinculo.conta !== ambiente.conta)) throw new Error('Banco de dados vinculado a outra conta ou ambiente Stripe. Use uma base separada e concilie os dados existentes.');
  if (!vinculo) {
    const legado = ['stripe_clientes','stripe_pedidos','stripe_eventos','stripe_pagamentos','stripe_renovacoes'].some(tabela => um(P.db,`select 1 from ${tabela} limit 1`));
    if (legado && (ambiente.live || ambiente.conta)) throw new Error('Histórico Stripe sem vínculo de conta. Concilie os dados existentes antes de vincular outra configuração.');
    exec(P.db,'insert into stripe_ambiente values (1,?,?)',ambiente.modo,ambiente.conta);
  }
  P.stripe = { api, env, ...ambiente, cambio: op.cambio || {}, processando: new Map(), porEmpresa: new Set() };
}

export function consultarPedidosStripe(P, empresa) {
  if (!P.stripe) throw erro(503,'stripe_desligado','O serviço de pagamentos não está configurado.');
  exigirEmpresa(P, empresa);
  return todos(P.db,'select p.id,p.produto,p.moeda,p.quantidade,p.canal,p.estado,p.url,p.criado_em,p.snapshot,e.confirmado_em as email_enviado_em from stripe_pedidos p left join stripe_fatura_envios e on e.pedido=p.id where p.empresa=? order by p.criado_em desc limit 100',empresa)
    .map(p=>({...p,snapshot:json(p.snapshot,{})}));
}

export async function criarCobrancaStripe(P, empresa, dados, ator) {
  if (!P.stripe) throw erro(503,'stripe_desligado','O serviço de pagamentos não está configurado.');
  const S=P.stripe, c=exigirEmpresa(P,empresa);
  if (lerFaturamento(P,empresa).forma!=='stripe') throw erro(409,'stripe_nao_habilitado','Habilite explicitamente a cobrança Stripe no contrato da empresa antes de emitir.');
  if (vigente(P,empresa).vencido) throw erro(409,'vigencia_vencida','Atualize a vigência do contrato antes de emitir uma nova cobrança.');
  const id=String(dados.pedido || '');
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(id)) throw erro(400,'stripe_pedido','Informe uma referência única de pedido com 8 a 100 caracteres.');
  const item=ITENS_STRIPE.find(p=>p.chave===dados.produto), moeda=dados.moeda, canal=dados.canal;
  const qtd=dados.quantidade ?? 1;
  if (!item || !['usd','brl'].includes(moeda) || !['checkout','fatura'].includes(canal) || !Number.isSafeInteger(qtd) || qtd<1 || qtd>50 || item.recorrente && qtd!==1) throw erro(400,'stripe_compra','Produto, moeda, canal ou quantidade inválidos.');
  if (c.status!=='ativa') throw erro(409,'stripe_empresa','Ative o ambiente antes de iniciar a cobrança.');
  const plano=lerPlanoPorId(P,c.plan_id);
  if (!plano || (item.recorrente && (plano.name!==item.nome || plano.credits!==item.creditos || plano.reserve!==item.reserva || Math.round(plano.price_usd*100)!==item.usd))) throw erro(409,'stripe_plano','Vincule o plano comercial correspondente antes de cobrar.');
  if (!item.recorrente && (plano.rules?.pack_credits!==item.creditos || Math.round(plano.rules?.pack_price_usd*100)!==item.usd)) throw erro(409,'stripe_pacote','O Capacity Pack do plano diverge do catálogo.');
  if (!item.recorrente && situacaoPlano(P.tenant(empresa))?.cobrancaPendente) throw erro(409,'stripe_periodo','Renove o período pago antes de comprar Capacity Packs.');
  const vencimento=dados.vencimento_dias;
  if (canal==='fatura' && !c.contact_email) throw erro(400,'stripe_email','Cadastre o email de contato da empresa antes de emitir uma fatura.');
  const renovar=dados.renovar===true;
  if (renovar && (!item.recorrente || moeda!=='brl' || canal!=='fatura')) throw erro(400,'stripe_renovacao','A renovação por emissão aplica-se a planos BRL pelo canal fatura.');
  if (canal==='fatura' && (!Number.isSafeInteger(vencimento) || vencimento<1 || vencimento>90)) throw erro(400,'stripe_vencimento','Informe o vencimento de 1 a 90 dias.');
  const antigo=um(P.db,'select * from stripe_pedidos where id=?',id);
  if (antigo && (antigo.empresa!==empresa || antigo.produto!==item.chave || antigo.moeda!==moeda || antigo.quantidade!==qtd || antigo.canal!==canal
    || !!json(antigo.snapshot,{}).renovar!==renovar || json(antigo.snapshot,{}).vencimento_dias !== (canal==='fatura'?vencimento:null))) throw erro(409,'stripe_pedido','O pedido já existe com outros dados.');
  if (antigo?.url) return { pedido:id,url:antigo.url,estado:antigo.estado,repetido:true };
  if (S.porEmpresa.has(empresa)) throw erro(409,'stripe_ocupado','Há uma cobrança desta empresa em preparação. Tente novamente com a mesma referência.');
  // Mais de um plano pendente/ativo exige conciliação; pacotes podem ser comprados separadamente.
  if (item.recorrente && !antigo && um(P.db,"select 1 from stripe_pedidos where empresa=? and produto!='capacity_pack' and (estado in ('preparando','aguardando') or (subscription is not null and estado!='cancelado'))",empresa)) throw erro(409,'stripe_existente','Já existe cobrança de plano. Concilie o período ou a assinatura antes de iniciar outra.');
  S.porEmpresa.add(empresa);
  try {
    let p=antigo;
    if (!p) {
      const momento=P.agora().toISOString();
      const tenant=P.tenant(empresa);
      const temPeriodos=um(tenant.db,"select 1 from sqlite_master where name='stripe_periodos'");
      const ultimoFim=temPeriodos ? um(tenant.db,'select max(fim) fim from stripe_periodos')?.fim : null;
      const inicio=item.recorrente && ultimoFim && ultimoFim>momento ? ultimoFim : momento;
      const fx=moeda==='brl' ? await cotarCobrancaBrl(P.db,{pedido:id,empresa,produto:item.chave,usd_centavos:item.usd,quantidade:qtd},{...S.cambio,agora:P.agora()}) : null;
      const snapshot={total:fx?.total_brl_centavos ?? item.usd*qtd,usd_centavos:item.usd*qtd,creditos:item.creditos,reserva:item.reserva,
        inicio,fim:proximoMesStripe(inicio),cotacao:fx?.cotacao || null,plan_id:c.plan_id,renovar,vencimento_dias:canal==='fatura'?vencimento:null};
      exec(P.db,'insert into stripe_pedidos (id,empresa,produto,moeda,quantidade,canal,snapshot,criado_em) values (?,?,?,?,?,?,?,?)',id,empresa,item.chave,moeda,qtd,canal,JSON.stringify(snapshot),momento);
      p=um(P.db,'select * from stripe_pedidos where id=?',id);
    }
    const snapshot=json(p.snapshot,{});
    if (Date.parse(p.criado_em)+23*3600000<P.agora().getTime() && !p.remoto) throw erro(409,'stripe_conciliar','Pedido antigo sem retorno remoto: concilie pelo metadata antes de repetir a criação.');
    let customer=um(P.db,'select customer from stripe_clientes where empresa=? and moeda=?',empresa,moeda)?.customer;
    if (!customer) {
      const x=await S.api('POST','/v1/customers',{name:c.legal_name || c.name,...(c.contact_email?{email:c.contact_email}:{}),metadata:{greenia_company:empresa,greenia_currency:moeda}},`greenia_customer_${hash(empresa+moeda)}`);
      customer=caminhoId(x.id);
      exec(P.db,'insert into stripe_clientes values (?,?,?)',empresa,moeda,customer);
    } else if (canal==='fatura') {
      // O cliente pode ter sido criado antes de o contato ser cadastrado ou atualizado.
      await S.api('POST',`/v1/customers/${customer}`,{email:c.contact_email},`greenia_customer_email_${hash(id+customer+c.contact_email)}`);
    }
    exec(P.db,'update stripe_pedidos set customer=? where id=?',customer,id);
    const metadata={greenia_order:id,greenia_company:empresa};
    const desc=`${item.nome}${snapshot.cotacao?` | USD/BRL ${snapshot.cotacao.taxa} | BCB ${snapshot.cotacao.data_referencia}`:''}`;
    let remoto;
    if (canal==='checkout') {
      if (p.remoto) remoto=await S.api('GET',`/v1/checkout/sessions/${caminhoId(p.remoto)}`);
      else {
        const assinatura=item.recorrente && moeda==='usd';
        remoto=await S.api('POST','/v1/checkout/sessions',{mode:assinatura?'subscription':'payment',customer,client_reference_id:id,metadata,
          integration_identifier:`greenia_checkout_${Array.from(createHash('sha256').update(id).digest().subarray(0,8),b=>String.fromCharCode(97+b%26)).join('')}`,
          success_url:`${baseUrl(P)}/plataforma`,cancel_url:`${baseUrl(P)}/plataforma`,
          expires_at:Math.floor(Date.parse(p.criado_em)/1000)+1800,
          line_items:[{quantity:1,price_data:{currency:moeda,unit_amount:snapshot.total,product_data:{name:desc},...(assinatura?{recurring:{interval:'month'}}:{})}}],
          ...(assinatura?{subscription_data:{metadata}}:{invoice_creation:{enabled:true,invoice_data:{metadata}}}),
          adaptive_pricing:{enabled:false},allow_promotion_codes:false},`greenia_checkout_${hash(id)}`);
      }
    } else {
      const invoice=p.remoto?{id:p.remoto}:await S.api('POST','/v1/invoices',{customer,currency:moeda,collection_method:'send_invoice',days_until_due:vencimento,
        auto_advance:false,pending_invoice_items_behavior:'exclude',metadata},`greenia_invoice_${hash(id)}`);
      exec(P.db,'update stripe_pedidos set remoto=? where id=?',invoice.id,id);
      // Repetir é seguro dentro da janela de idempotência; após 23h exige conciliação antes do item.
      if (Date.parse(p.criado_em)+23*3600000<P.agora().getTime()) throw erro(409,'stripe_conciliar','Concilie esta invoice antiga antes de continuar a emissão.');
      await S.api('POST','/v1/invoiceitems',{customer,invoice:invoice.id,currency:moeda,amount:snapshot.total,description:desc,metadata},`greenia_item_${hash(id)}`);
      remoto=await S.api('POST',`/v1/invoices/${caminhoId(invoice.id)}/finalize`,{auto_advance:false},`greenia_finalize_${hash(id)}`);
    }
    const url=canal==='checkout'?remoto.url:remoto.hosted_invoice_url;
    const host=new URL(url).hostname;
    if (!['checkout.stripe.com','invoice.stripe.com'].includes(host) || new URL(url).protocol!=='https:') throw erro(502,'stripe_url','O Stripe não retornou um link de pagamento válido.');
    exec(P.db,"update stripe_pedidos set remoto=?,url=?,estado='aguardando',ultimo_erro=null where id=?",remoto.id,url,id);
    auditar(P,{usuario:ator,empresa,acao:'billing.created',entidade:'stripe_order',id,depois:{moeda,total:snapshot.total,canal},origem:{painel:'stripe',modo:S.modo}});
    return {pedido:id,url,estado:'aguardando',snapshot};
  } finally { S.porEmpresa.delete(empresa); }
}
const baseUrl=P=>P.urlBase.replace(/\/$/,'');

// Envio separado da emissão: só uma ação explícita do operador envia email.
export async function enviarFaturaStripe(P,empresa,pedido,ator) {
  const S=P.stripe;
  if (!S) throw erro(503,'stripe_desligado','Pagamentos indisponíveis.');
  const c=exigirEmpresa(P,empresa);
  const p=um(P.db,'select * from stripe_pedidos where id=? and empresa=?',pedido,empresa);
  if (!p) throw erro(404,'stripe_pedido','Cobrança não encontrada nesta empresa.');
  if (p.canal!=='fatura' || p.estado!=='aguardando' || !p.remoto) throw erro(409,'stripe_envio','Somente faturas emitidas e em aberto podem ser enviadas.');
  if (lerFaturamento(P,empresa).forma!=='stripe') throw erro(409,'stripe_nao_habilitado','A cobrança Stripe não está habilitada para esta empresa.');
  if (S.porEmpresa.has(empresa)) throw erro(409,'stripe_ocupado','Há uma operação em andamento. Tente novamente.');
  S.porEmpresa.add(empresa);
  try {
    let envio=um(P.db,'select * from stripe_fatura_envios where pedido=?',pedido);
    if (envio?.confirmado_em) return {ok:true,repetido:true,simulado:!S.live};
    if (envio && Date.parse(envio.iniciado_em)+23*3600000<P.agora().getTime()) throw erro(409,'stripe_conciliar','Concilie o envio anterior no Stripe antes de tentar novamente.');
    const inv=await S.api('GET',`/v1/invoices/${caminhoId(p.remoto)}`);
    const snapshot=json(p.snapshot,{});
    if (inv.livemode!==S.live || idDe(inv.customer)!==p.customer || inv.metadata?.greenia_order!==p.id
      || inv.metadata?.greenia_company!==empresa || inv.currency!==p.moeda || inv.total!==snapshot.total) throw erro(409,'stripe_vinculo','A fatura diverge do pedido. Conciliação necessária.');
    if (inv.status!=='open' || inv.collection_method!=='send_invoice') throw erro(409,'stripe_envio','A fatura não está aberta para pagamento manual.');
    if (!inv.customer_email || inv.customer_email!==c.contact_email || envio && envio.destinatario!==inv.customer_email) throw erro(409,'stripe_email','O email da fatura diverge do contato atual. Concilie o destinatário antes de enviar.');
    if (!envio) exec(P.db,'insert into stripe_fatura_envios (pedido,destinatario,iniciado_em) values (?,?,?)',pedido,inv.customer_email,P.agora().toISOString());
    await S.api('POST',`/v1/invoices/${caminhoId(p.remoto)}/send`,{},`greenia_send_${hash(pedido)}`);
    exec(P.db,'update stripe_fatura_envios set confirmado_em=? where pedido=?',P.agora().toISOString(),pedido);
    auditar(P,{usuario:ator,empresa,acao:'billing.invoice_sent',entidade:'stripe_order',id:pedido,depois:{simulado:!S.live},origem:{painel:'stripe',modo:S.modo}});
    return {ok:true,simulado:!S.live};
  } finally { S.porEmpresa.delete(empresa); }
}

async function aplicarPagamento(P,p,comprovante,total,moeda,periodo) {
  const snapshot=json(p.snapshot,{});
  if (total!==snapshot.total || moeda!==p.moeda) throw erro(409,'stripe_valor','Pagamento divergente do pedido. Conciliação necessária.');
  if (um(P.db,'select 1 from stripe_pagamentos where id=?',comprovante)) return {repetido:true};
  const t=P.tenant(p.empresa), anterior=situacaoPlano(t);
  // Cobrança avulsa: iniciar na confirmação ou no fim do período atual, se a renovação foi antecipada.
  const inicio=snapshot.inicio>P.agora().toISOString()?snapshot.inicio:P.agora().toISOString();
  const efeito=concederDireitoStripe(t,{comprovante,produto:p.produto,inicio:periodo?.inicio || inicio,fim:periodo?.fim || proximoMesStripe(inicio),
    creditos:snapshot.creditos,reserva:snapshot.reserva,quantidade:p.quantidade,moeda,total},anterior);
  if (p.produto!=='capacity_pack' && exigirEmpresa(P,p.empresa).plan_id!==snapshot.plan_id) mudarPlano(P,p.empresa,snapshot.plan_id,null,{painel:'stripe'});
  transacao(P.db,()=>{
    exec(P.db,'insert or ignore into stripe_pagamentos values (?,?,?,?,?)',comprovante,p.id,moeda,total,P.agora().toISOString());
    exec(P.db,"update stripe_pedidos set estado='pago' where id=?",p.id);
    if (snapshot.renovar && p.moeda==='brl' && p.produto!=='capacity_pack') {
      const fimPago=um(t.db,'select fim from stripe_periodos where comprovante=?',comprovante)?.fim;
      if (!fimPago) throw erro(409,'stripe_periodo','Concilie o período pago antes de programar a renovação.');
      // Um pagamento antigo recebido fora de ordem nunca retrocede a próxima emissão.
      exec(P.db,`insert into stripe_renovacoes (empresa,produto,vencimento,proxima_em) values (?,?,?,?)
        on conflict(empresa) do update set proxima_em=max(stripe_renovacoes.proxima_em,excluded.proxima_em),
        pedido_pendente=case when excluded.proxima_em>=stripe_renovacoes.proxima_em then null else stripe_renovacoes.pedido_pendente end,
        ultimo_erro=null`,p.empresa,p.produto,snapshot.vencimento_dias,fimPago);
    }
    auditar(P,{empresa:p.empresa,acao:'billing.paid',entidade:'stripe_payment',id:comprovante,depois:{pedido:p.id,moeda,total},origem:{painel:'stripe'}});
  });
  return efeito;
}

export async function processarEventoStripe(P,e) {
  const S=P.stripe;
  if (!S) throw erro(503,'stripe_desligado','Pagamentos indisponíveis.');
  if (e.livemode !== S.live || e.account) throw erro(400,'stripe_evento','Evento incompatível com este ambiente.');
  if (um(P.db,'select 1 from stripe_eventos where id=?',e.id)) return {repetido:true};
  if (S.processando.has(e.id)) return S.processando.get(e.id);
  const trabalho=(async()=>{
    let efeito={ignorado:true};
    if (['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed','checkout.session.expired'].includes(e.type)) {
      const s=await S.api('GET',`/v1/checkout/sessions/${caminhoId(e.data.object.id)}`);
      const p=um(P.db,'select * from stripe_pedidos where remoto=?',s.id);
      if (p) {
        if (s.livemode!==S.live || idDe(s.customer)!==p.customer || s.metadata?.greenia_order!==p.id || s.client_reference_id!==p.id) throw erro(409,'stripe_vinculo','Vínculo da cobrança divergente.');
        if (s.mode==='subscription' && s.subscription) exec(P.db,'update stripe_pedidos set subscription=? where id=?',idDe(s.subscription),p.id);
        if (s.mode==='payment' && s.payment_status==='paid') efeito=await aplicarPagamento(P,p,s.id,s.amount_total,s.currency);
        else if (s.status==='expired' && p.estado!=='pago') exec(P.db,"update stripe_pedidos set estado='expirado' where id=?",p.id);
        else if (e.type==='checkout.session.async_payment_failed' && p.estado!=='pago') exec(P.db,"update stripe_pedidos set estado='falhou' where id=?",p.id);
      }
    } else if (e.type==='invoice.paid') {
      const inv=await S.api('GET',`/v1/invoices/${caminhoId(e.data.object.id)}`);
      if (inv.livemode!==S.live) throw erro(409,'stripe_modo','Fatura incompatível com este ambiente.');
      const subId=idDe(inv.parent?.subscription_details?.subscription || inv.subscription);
      let p=um(P.db,'select * from stripe_pedidos where remoto=?',inv.id),periodo;
      if (subId) {
        const sub=await S.api('GET',`/v1/subscriptions/${caminhoId(subId)}`);
        p=um(P.db,'select * from stripe_pedidos where id=?',sub.metadata?.greenia_order || '');
        if (p) {
          if (sub.livemode!==S.live || p.moeda!=='usd' || p.produto==='capacity_pack' || p.canal!=='checkout' || (p.subscription && p.subscription!==subId)
            || idDe(sub.customer)!==p.customer || sub.metadata?.greenia_company!==p.empresa) throw erro(409,'stripe_assinatura','Assinatura divergente.');
          const linha=inv.lines?.data?.[0];
          if (inv.lines?.has_more || inv.lines?.data?.length!==1 || linha.quantity!==1 || linha.parent?.subscription_item_details?.proration || linha.proration
            || !['subscription_create','subscription_cycle'].includes(inv.billing_reason)) throw erro(409,'stripe_proporcional','Invoice com ajustes exige conciliação manual.');
          if (!Number.isSafeInteger(linha.period?.start) || !Number.isSafeInteger(linha.period?.end) || linha.period.end<=linha.period.start
            || linha.period.end-linha.period.start>32*86400 || linha.period.end-linha.period.start<27*86400) throw erro(409,'stripe_periodo','Período de assinatura inválido.');
          periodo={inicio:iso(linha.period.start),fim:iso(linha.period.end)};
          exec(P.db,'update stripe_pedidos set subscription=? where id=?',subId,p.id);
        }
      }
      if (p && inv.status==='paid' && inv.amount_remaining===0 && inv.total===inv.amount_paid) {
        if (idDe(inv.customer)!==p.customer || (!subId && inv.metadata?.greenia_order!==p.id)) throw erro(409,'stripe_vinculo','Cliente ou pedido da invoice divergente.');
        efeito=await aplicarPagamento(P,p,inv.id,inv.amount_paid,inv.currency,periodo);
      }
    } else if (e.type==='customer.subscription.deleted') {
      const sub=await S.api('GET',`/v1/subscriptions/${caminhoId(e.data.object.id)}`);
      const p=um(P.db,'select * from stripe_pedidos where subscription=?',sub.id);
      if (p && sub.status==='canceled' && sub.livemode===S.live && idDe(sub.customer)===p.customer) exec(P.db,"update stripe_pedidos set estado='cancelado' where id=?",p.id);
    } else if (['charge.refunded','charge.dispute.created','invoice.payment_failed'].includes(e.type)) {
      // Não apagar dados ou inventar estorno de capacidade já consumida. Operador concilia o caso.
      exec(P.db,'insert or ignore into stripe_pendencias values (?,?,?)',e.id,e.type,P.agora().toISOString());
      efeito={conciliacao:true};
    }
    exec(P.db,'insert or ignore into stripe_eventos values (?,?,?)',e.id,e.type,P.agora().toISOString());
    return efeito;
  })();
  S.processando.set(e.id,trabalho);
  try {return await trabalho;} finally {S.processando.delete(e.id);}
}

export async function receberWebhookStripe(P,req,res) {
  if (!P.stripe) throw erro(503,'stripe_desligado','Pagamentos indisponíveis.');
  const bruto=await lerBruto(req,1);
  const evento=verificarAssinaturaStripe(bruto,req.headers['stripe-signature'],P.stripe.env.STRIPE_WEBHOOK_SECRET,P.agora(),P.stripe.live);
  await processarEventoStripe(P,evento);
  enviarJson(res,200,{recebido:true});
}

export function rotasStripe(P,r) {
  const permitir=s=>exigir(permissoesNaPlataforma(P.db,s.userId),'platform.plans.manage');
  r.get('/api/plataforma/empresas/:id/cobrancas',({sessao,params})=>{permitir(sessao);const pedidos=consultarPedidosStripe(P,params.id);return {pedidos,modo:P.stripe.modo,geracaoAutomatica:P.stripe.env.STRIPE_RENOVACOES==='1',renovacao:um(P.db,'select * from stripe_renovacoes where empresa=?',params.id)};});
  r.post('/api/plataforma/empresas/:id/cobrancas',({sessao,params,corpo})=>{permitir(sessao);return criarCobrancaStripe(P,params.id,corpo,sessao.userId);});
  r.post('/api/plataforma/empresas/:id/cobrancas/:pedido/enviar-email',({sessao,params})=>{permitir(sessao);return enviarFaturaStripe(P,params.id,params.pedido,sessao.userId);});
  r.post('/api/plataforma/empresas/:id/cobrancas/parar-renovacao',({sessao,params})=>{
    permitir(sessao);if(!P.stripe)throw erro(503,'stripe_desligado','Pagamentos indisponíveis.');exigirEmpresa(P,params.id);
    exec(P.db,'update stripe_renovacoes set ativa=0 where empresa=?',params.id);
    auditar(P,{usuario:sessao.userId,empresa:params.id,acao:'billing.renewal_stopped',entidade:'company',id:params.id,origem:{painel:'plataforma'}});
    return {ok:true};
  });
  r.post('/api/plataforma/empresas/:id/cobrancas/retomar-renovacao',({sessao,params})=>{
    permitir(sessao);if(!P.stripe)throw erro(503,'stripe_desligado','Pagamentos indisponíveis.');exigirEmpresa(P,params.id);
    exec(P.db,'update stripe_renovacoes set ativa=1 where empresa=?',params.id);
    auditar(P,{usuario:sessao.userId,empresa:params.id,acao:'billing.renewal_resumed',entidade:'company',id:params.id,origem:{painel:'plataforma'}});
    return {ok:true};
  });
}

export async function rodadaRenovacoesStripe(P) {
  const S=P.stripe;
  if (!S || S.env.STRIPE_RENOVACOES!=='1' || P.isolado || P.publicacaoControlada?.ativa || S.renovando) return {emitidas:0};
  S.renovando=true;let emitidas=0;
  try {
    const lista=todos(P.db,`select r.* from stripe_renovacoes r join companies c on c.id=r.empresa
      where r.ativa=1 and c.status='ativa' and r.proxima_em<=? and r.pedido_pendente is null`,P.agora().toISOString());
    for(const r of lista) {
      const pedido=`renovacao_${hash(r.empresa+'|'+r.proxima_em)}`;
      try {
        const resultado=await criarCobrancaStripe(P,r.empresa,{pedido,produto:r.produto,moeda:'brl',canal:'fatura',quantidade:1,vencimento_dias:r.vencimento,renovar:true},null);
        exec(P.db,'update stripe_renovacoes set pedido_pendente=?,ultimo_erro=null where empresa=? and proxima_em=?',pedido,r.empresa,r.proxima_em);
        if(!resultado.repetido)emitidas++;
      } catch {
        // Falha de câmbio/API: não avançar o período, não cobrar zero e não liberar capacidade.
        exec(P.db,"update stripe_renovacoes set ultimo_erro='emissao_pendente' where empresa=?",r.empresa);
      }
    }
    return {emitidas};
  } finally {S.renovando=false;}
}
