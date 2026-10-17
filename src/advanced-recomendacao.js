// Recomendações para aprovação: não aprovam provedores nem aumentam orçamento.
import { createHash } from 'node:crypto';
import { um,todos,json } from './db.js';
import { lerConfig } from './config.js';
import { avaliarRecurso,politicaSigiloLigada } from './sigilo.js';
export function recomendarAdvanced(app,pedido,ajuste={}) {
 const cfg=lerConfig(app.db),em=app.agora().toISOString();
 const req=json(pedido.requisitos,{}),conv=um(app.db,'select sigilosa from conversas where id = ?',pedido.conversa_id);
 const impedir=(codigo,motivo)=>({disponivel:false,codigo,motivo,acao:codigo==='advanced_orcamento'?'Revisar limite de consumo':'Revisar proteção e disponibilidade'});
 if(!conv)return impedir('advanced_indisponivel','A conversa deste pedido não está mais disponível.');
 if(conv.sigilosa&&!politicaSigiloLigada(cfg))return impedir('advanced_seguranca','A política da empresa não permite processar este conteúdo. Liberar Advanced não remove essa restrição.');
 const saida=32768,candidatos=[];let disponiveis=0,aprovados=0;
 for(const m of todos(app.db,"select * from modelos where perfil = 'avancado' and liberado = 1 and no_catalogo = 1 and vetado_plataforma = 0")) {
  const a=json(m.atributos,{}),met=a.catalogo,cap=json(m.capacidades,{});
  if(!met?.rotas?.length||!met.consultadoEm||Date.parse(em)-Date.parse(met.consultadoEm)>48*3600e3)continue;
  if(Object.entries(req.capacidade||{}).some(([k,n])=>(cap[k]||3)<n))continue;
  disponiveis++;
  if(!a.advanced?.aprovado||!a.advanced.provedores?.length)continue;
  aprovados++;
  const sig=conv.sigilosa?avaliarRecurso({id:m.id,liberado:true,vetadoPlataforma:false,homologacaoEmpresa:m.homologado?json(m.homologacao,null):null,autorizacaoPlataforma:json(m.autorizacao_plataforma,null)},cfg):null;
  if(sig&&!sig.elegivel)continue;
  for(const rota of met.rotas){
   if(!a.advanced.provedores.includes(rota.id)||sig&&sig.rota.endpoint!==rota.id||!rota.parametros?.includes('max_tokens')||rota.maxSaida<saida||rota.contexto<(req.janelaMinima||0)+saida)continue;
   const entrada=Math.max(m.preco_entrada||0,rota.entrada||0,...(met.precosAlternativos||[]).map(p=>Number(p.prompt)));
   const saidaPreco=Math.max(m.preco_saida||0,rota.saida||0,...(met.precosAlternativos||[]).map(p=>Number(p.completion)));
   const estimativa=entrada*Math.max(8000,req.janelaDesejada||req.janelaMinima||8000)+saidaPreco*saida;
   if(Number.isFinite(estimativa)&&estimativa>0)candidatos.push({modelo:m.id,provedor:rota.id,estimativa});
  }
 }
 if(!candidatos.length){
  if(!disponiveis)return impedir('advanced_indisponivel','Não há um recurso habilitado e disponível no catálogo atual com a capacidade necessária. A equipe responsável precisa revisar a disponibilidade. Seu pedido está guardado.');
  if(aprovados&&!conv.sigilosa)return impedir('advanced_indisponivel','As rotas aprovadas não oferecem agora o contexto e os limites necessários para este pedido. A equipe responsável precisa revisar a disponibilidade. Liberar acesso sozinho não resolve essa limitação.');
  return impedir('advanced_seguranca','Ainda não há um recurso disponível com a proteção necessária aprovada pela empresa. A equipe responsável precisa revisar essa proteção antes da liberação. O pedido está guardado.');
 }
 candidatos.sort((a,b)=>a.estimativa-b.estimativa||a.modelo.localeCompare(b.modelo));
 const escolhido=candidatos[0];
 const gasto=um(app.db,'select coalesce(sum(coalesce(custo,reservado)),0) n from advanced_consumo where em >= ?',em.slice(0,7)+'-01').n;
 const restante=Math.max(0,(cfg.advanced?.limiteMensalUsd||0)-gasto);
 const tetoGeral=cfg.tetoMensal>0?Math.max(0,cfg.tetoMensal-um(app.db,'select coalesce(sum(custo),0) n from uso where em >= ?',em.slice(0,7)+'-01').n):Infinity;
 const saldo=Math.min(restante,tetoGeral);
 const porChamada=Math.ceil(escolhido.estimativa*1.25*100)/100;
 const sugerido=Math.ceil(porChamada*4*100)/100;
 const total=ajuste.limite_usd===undefined?Math.min(sugerido,saldo):Number(ajuste.limite_usd);
 const dias=ajuste.dias===undefined?1:Number(ajuste.dias);
 if(!Number.isFinite(total)||total<porChamada||total>saldo)return impedir('advanced_orcamento',`O limite de consumo disponível não comporta a capacidade recomendada. Reveja o limite Advanced antes de aprovar; a entrega não será reduzida automaticamente.`);
 if(!Number.isInteger(dias)||dias<1||dias>30)return impedir('advanced_autorizacao','Escolha uma validade de 1 a 30 dias.');
 const configuracao={pessoa_id:pedido.pessoa_id,conversa_id:pedido.conversa_id,modelos:[escolhido.modelo],provedores:[escolhido.provedor],limite_usd:total,limite_chamada_usd:Math.min(total,porChamada),saida_tokens:saida,expira_em:new Date(app.agora().getTime()+dias*864e5).toISOString()};
 // Não inclui a hora de expiração variável: só os parâmetros que mudam a decisão vista pelo administrador.
 const versao=createHash('sha256').update(JSON.stringify({pedido:pedido.id,modelo:escolhido.modelo,provedor:escolhido.provedor,total,porChamada,dias,politica:cfg.advanced})).digest('hex');
 return {disponivel:true,versao,titulo:'Liberar Advanced para concluir este pedido',motivo:'O GreenIA escolheu a opção de menor consumo entre os recursos adequados e já aprovados pela empresa.',alcance:'Somente este pedido e seus ajustes nesta conversa',validadeDias:dias,limite:total,estimativa:escolhido.estimativa,execucaoAutomatica:false,configuracao};
}
