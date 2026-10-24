// Autosserviço: empresa e preços vêm do servidor; somente o webhook libera capacidade.
import { randomUUID } from 'node:crypto';
import { exec, um, todos } from '../db.js';
import { erro } from '../http.js';
import { exigir } from './rbac.js';
import { ITENS_STRIPE } from './stripe-catalogo.js';
import { cotarCobrancaBrl } from './stripe-cambio.js';
import { criarCobrancaStripe, consultarPedidosStripe } from './stripe-pagamentos.js';
import { lerFaturamento, salvarFaturamento, obrigacoesStripe } from './faturamento.js';
import { situacaoPlano } from '../plano.js';

export function rotasCompraStripe(P, r) {
  P.db.exec(`create table if not exists stripe_propostas (
    id text primary key, empresa text not null, usuario text not null, produto text not null,
    moeda text not null, plano text not null, total integer not null, expira text not null)`);
  const habilitado = () => {
    if (!P.stripe || P.stripe.env.STRIPE_EMISSOES === '0') throw erro(503,'stripe_desligado','A contratação está temporariamente indisponível. Converse com a TheNeil.');
  };
  const planoPara = item => {
    const p = todos(P.db,"select id,name,credits,reserve,price_usd from plans where status='ativo'")
      .find(p=>p.name===item.nome && p.credits===item.creditos && p.reserve===item.reserva && Math.round(p.price_usd*100)===item.usd);
    if (!p) throw erro(409,'stripe_catalogo','Este plano precisa de revisão comercial. Converse com a TheNeil.');
    return p;
  };
  r.get('/api/contratacao', ({sessao,companyId,empresa}) => ({
    csrf:sessao.csrf, usuario:sessao.userId, empresa:{id:companyId,nome:empresa.name},
    permitido:sessao.perms.has('billing.manage'), disponivel:!!P.stripe && P.stripe.env.STRIPE_EMISSOES!=='0',
    plano:(()=>{const p=situacaoPlano(P.tenant(companyId));return p && {fase:p.fase,percentual:p.percentual,renova:p.renova,ilimitado:!!p.ilimitado};})(),
    pedidos:sessao.perms.has('billing.manage') && P.stripe ? consultarPedidosStripe(P,companyId) : [],
    forma:lerFaturamento(P,companyId).forma,
  }));
  r.post('/api/contratacao/cotacao', async ({sessao,companyId,empresa,corpo}) => {
    exigir(sessao.perms,'billing.manage'); habilitado();
    const item=ITENS_STRIPE.find(i=>i.chave===corpo.produto), moeda=corpo.moeda;
    if (!item || !['brl','usd'].includes(moeda)) throw erro(400,'compra','Escolha um plano e a moeda.');
    const plano=item.recorrente ? planoPara(item) : {id:empresa.plan_id};
    const tenant=P.tenant(companyId);
    const fim=um(tenant.db,"select 1 from sqlite_master where name='stripe_periodos'") ? um(tenant.db,'select max(fim) fim from stripe_periodos')?.fim : null;
    if(item.recorrente && (plano.id!==empresa.plan_id || moeda==='usd') && fim>P.agora().toISOString())throw erro(409,'plano_vigente','Há um período pago vigente. Contrate um Capacity Pack ou converse com a TheNeil para mudar o plano sem sobrepor períodos.');
    const id='web_'+randomUUID().replaceAll('-','');
    const fx=moeda==='brl' ? await cotarCobrancaBrl(P.db,{pedido:id,empresa:companyId,produto:item.chave,usd_centavos:item.usd,quantidade:1},{...P.stripe.cambio,agora:P.agora()}) : null;
    const total=fx?.total_brl_centavos ?? item.usd;
    const expira=new Date(P.agora().getTime()+15*60000).toISOString();
    exec(P.db,'insert into stripe_propostas values (?,?,?,?,?,?,?,?)',id,companyId,sessao.userId,item.chave,moeda,plano.id,total,expira);
    return {pedido:id,nome:item.nome,moeda,total,creditos:item.creditos,expira,cotacao:fx?.cotacao,
      inicio:item.recorrente && fim>P.agora().toISOString()?fim:null,
      recorrente:item.recorrente && moeda==='usd', inicioAposPagamento:true};
  });
  r.post('/api/contratacao/checkout', async ({sessao,companyId,empresa,corpo,origem}) => {
    exigir(sessao.perms,'billing.manage'); habilitado();
    const q=um(P.db,'select * from stripe_propostas where id=? and empresa=? and usuario=?',String(corpo.pedido||''),companyId,sessao.userId);
    if (!q) throw erro(404,'proposta','Cotação não encontrada.');
    if (corpo.confirmar!==true) throw erro(400,'confirmacao','Confirme as condições antes de continuar.');
    const existente=um(P.db,'select id from stripe_pedidos where id=? and empresa=?',q.id,companyId);
    if (!existente && q.expira<P.agora().toISOString()) throw erro(409,'cotacao_expirada','A cotação expirou. Consulte o valor novamente.');
    const item=ITENS_STRIPE.find(i=>i.chave===q.produto);
    const tenant=P.tenant(companyId);
    const fim=um(tenant.db,"select 1 from sqlite_master where name='stripe_periodos'") ? um(tenant.db,'select max(fim) fim from stripe_periodos')?.fim : null;
    if(!existente && item.recorrente && (q.plano!==empresa.plan_id || q.moeda==='usd') && fim>P.agora().toISOString())throw erro(409,'plano_vigente','Há um período pago vigente. Converse com a TheNeil para mudar o plano ou a moeda sem sobrepor períodos.');
    if (item.recorrente && planoPara(item).id!==q.plano) throw erro(409,'catalogo_alterado','O catálogo mudou. Consulte o valor novamente.');
    if (lerFaturamento(P,companyId).forma!=='stripe') {
      if (obrigacoesStripe(P,companyId).length) throw erro(409,'conciliar','Converse com a TheNeil para conciliar as cobranças existentes.');
      salvarFaturamento(P,companyId,{forma:'stripe',confirmar_stripe:true},sessao.userId,origem);
    }
    // Retorno na origem já validada pelo roteador; nunca aceitar URLs do corpo.
    const host=empresa.custom_domain || new URL(P.urlBase).host;
    const retorno=`${new URL(P.urlBase).protocol}//${host}/planos.html`;
    return criarCobrancaStripe(P,companyId,{pedido:q.id,produto:q.produto,moeda:q.moeda,canal:'checkout'},sessao.userId,{planId:q.plano,retorno});
  });
}
