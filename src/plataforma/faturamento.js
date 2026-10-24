// Condições do contrato no controle da plataforma. Nenhuma operação chama o Stripe.
import { erro } from '../http.js';
import { exec, um, json } from '../db.js';
import { auditar } from './auditoria.js';

export const FORMAS_COBRANCA = { sem_cobranca: 'Sem cobrança', externa: 'Cobrança externa', stripe: 'Stripe' };
const temTabela = (P, nome) => !!um(P.db, "select 1 from sqlite_master where type='table' and name=?", nome);
export function obrigacoesStripe(P, empresa) {
  if (!temTabela(P, 'stripe_pedidos')) return [];
  const lista=P.db.prepare(`select id,estado,canal,subscription from stripe_pedidos where empresa=?
    and (estado in ('preparando','aguardando') or (subscription is not null and estado!='cancelado'))`).all(empresa);
  const t=P.tenants?.get(empresa);
  if (t&&um(t.db,"select 1 from sqlite_master where name='stripe_periodos'")) {
    const p=um(t.db,'select comprovante from stripe_periodos where fim>? limit 1',P.agora().toISOString());
    if(p) lista.push({id:p.comprovante,estado:'periodo_pago'});
  }
  return lista;
}
export function lerFaturamento(P, empresa) {
  const c=um(P.db,'select faturamento from companies where id=?',empresa);
  if (!c) throw erro(404,'empresa','Empresa não encontrada.');
  const f=json(c.faturamento,{});
  const legadoStripe=!f.forma&&temTabela(P,'stripe_pedidos')&&um(P.db,'select 1 from stripe_pedidos where empresa=? limit 1',empresa);
  return { forma: legadoStripe ? 'stripe' : 'externa', renovacao:'mensal', inicio:null, fim:null, ...f };
}
export function validarComercial(dados, anterior={}) {
  const d={...anterior,...dados};
  if (!['gratuito','pago'].includes(d.condicao)) throw erro(400,'condicao','Escolha plano gratuito ou pago.');
  if (!['usd','brl'].includes(d.moeda)) throw erro(400,'moeda','Escolha reais ou dólares.');
  if (!['mensal','nenhuma'].includes(d.renovacao)) throw erro(400,'renovacao','Regra de renovação inválida.');
  const preco=d.condicao==='gratuito'?0:Number(d.preco);
  if (!Number.isFinite(preco)||preco<0||preco>10000000||d.condicao==='pago'&&preco<=0) throw erro(400,'preco','Informe um preço válido para o plano.');
  return {condicao:d.condicao,moeda:d.moeda,preco:Math.round(preco*100)/100,renovacao:d.renovacao};
}
export function salvarFaturamento(P,empresa,dados,ator,origem) {
  const antes=lerFaturamento(P,empresa), d={...antes,...dados};
  if (!FORMAS_COBRANCA[d.forma]||!['mensal','nenhuma'].includes(d.renovacao)) throw erro(400,'faturamento','Forma de cobrança ou renovação inválida.');
  let fim=null;
  if (d.fim) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.fim)||!Number.isFinite(Date.parse(d.fim))||new Date(d.fim).toISOString().slice(0,10)!==d.fim) throw erro(400,'vigencia','Informe uma data de término válida.');
    fim=d.fim;
  }
  const mudanca=d.forma!==antes.forma||d.renovacao!==antes.renovacao||fim!==antes.fim;
  if (mudanca&&obrigacoesStripe(P,empresa).length) throw erro(409,'stripe_conciliar','Há assinatura ou cobrança Stripe pendente. Concilie no provedor antes de alterar o contrato. Nenhuma cobrança foi cancelada.');
  if (d.forma==='stripe'&&antes.forma!=='stripe'&&dados.confirmar_stripe!==true) throw erro(400,'stripe_confirmacao','Confirme a habilitação do Stripe. A habilitação não cria cobrança nem libera créditos.');
  const t=P.tenant(empresa);
  if (d.renovacao!==antes.renovacao&&um(t.db,'select 1 from uso limit 1')) throw erro(409,'ciclo_em_uso','Há consumo registrado. Preserve o ciclo atual; a mudança de renovação exige conciliação para não recalcular saldos anteriores.');
  if (mudanca&&antes.forma==='stripe'&&d.forma!=='stripe'&&um(t.db,"select 1 from sqlite_master where name='stripe_controle'")) throw erro(409,'stripe_conciliar','A empresa já possui créditos controlados por pagamentos. Concilie períodos e saldos antes de mudar a forma de cobrança.');
  const depois={...antes,forma:d.forma,renovacao:d.renovacao,inicio:antes.inicio||P.agora().toISOString(),fim};
  exec(P.db,'update companies set faturamento=?,updated_at=? where id=?',JSON.stringify(depois),P.agora().toISOString(),empresa);
  P.aplicarAoTenant(empresa);
  auditar(P,{usuario:ator,empresa,acao:'company.billing_changed',entidade:'company',id:empresa,antes,depois,origem});
  return depois;
}
export function vigente(P,empresa) {
  const f=lerFaturamento(P,empresa);
  return { ...f, vencido: !!f.fim && P.agora().toISOString().slice(0,10)>f.fim };
}

export function agendarPlano(P,empresa,planId,ator,origem) {
  const antes=lerFaturamento(P,empresa);
  if (obrigacoesStripe(P,empresa).length) throw erro(409,'stripe_conciliar','Concilie as cobranças Stripe antes de agendar outro plano.');
  if (!um(P.db,"select 1 from plans where id=? and status='ativo'",planId)) throw erro(400,'plan_id','Escolha um plano ativo.');
  if (antes.renovacao!=='mensal') throw erro(409,'ciclo','Este contrato não possui próximo ciclo mensal.');
  const d=P.agora(),em=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,1)).toISOString();
  const depois={...antes,plano_pendente:{id:planId,em}};
  exec(P.db,'update companies set faturamento=?,updated_at=? where id=?',JSON.stringify(depois),d.toISOString(),empresa);
  auditar(P,{usuario:ator,empresa,acao:'company.plan_scheduled',entidade:'company',id:empresa,antes,depois,origem});
  return depois;
}
export function aplicarPlanoAgendado(P,empresa,mudar) {
  const f=lerFaturamento(P,empresa),p=f.plano_pendente;
  if (!p||p.em>P.agora().toISOString()||obrigacoesStripe(P,empresa).length) return;
  if (!um(P.db,"select 1 from plans where id=? and status='ativo'",p.id)) return;
  mudar(P,empresa,p.id,null,{agendamento:true});
  delete f.plano_pendente;
  exec(P.db,'update companies set faturamento=? where id=?',JSON.stringify(f),empresa);
}
