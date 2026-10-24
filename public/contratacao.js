// A visita nunca cria cobrança. A confirmação explícita ocorre antes do Checkout hospedado.
import { esc } from '/comum.js';
const host=document.getElementById('contratacao');
let contexto, proposta, ocupado=false;
const moeda=(n,m)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:m.toUpperCase()}).format(n/100);
async function chamar(path,corpo) {
  const r=await fetch('/api/contratacao'+path,{method:corpo?'POST':'GET',credentials:'same-origin',headers:corpo?{'content-type':'application/json','x-csrf':contexto.csrf}:{},body:corpo?JSON.stringify(corpo):undefined});
  const d=await r.json(); if(!r.ok) throw Object.assign(new Error(d.mensagem||'Entre no ambiente da sua empresa para contratar.'),{status:r.status}); return d;
}
const aviso=t=>{host.querySelector('[role="status"]').textContent=t;};
function mostrar() {
  host.innerHTML=`<h2>Contratação para ${esc(contexto.empresa.nome)}</h2><p>A capacidade é compartilhada pela empresa. ${contexto.permitido?'Revise o valor antes de seguir para o pagamento.':'Peça ao administrador da empresa para contratar capacidade.'}</p><p><a href="/app">Voltar ao GreenIA</a></p><label>Moeda do pagamento <select id="compra-moeda"><option value="brl">Reais (conversão na emissão)</option><option value="usd">Dólares</option></select></label><div role="status" aria-live="polite"></div><div id="compra-revisao" tabindex="-1"></div><div id="compra-pendentes"></div>`;
  const voltar=sessionStorage.getItem('greenia:voltar-capacidade');
  if(voltar?.startsWith('#/'))host.querySelector('a[href="/app"]').href='/app'+voltar;
  host.querySelector('#compra-moeda').onchange=()=>{proposta=null;host.querySelector('#compra-revisao').replaceChildren();aviso('Escolha o plano para consultar o valor na moeda selecionada.');};
  const pendentes=host.querySelector('#compra-pendentes');
  for(const p of contexto.pedidos.filter(p=>p.estado==='aguardando' && p.url)) {
    const url=new URL(p.url); if(!['checkout.stripe.com','invoice.stripe.com'].includes(url.hostname)||url.protocol!=='https:')continue;
    const a=document.createElement('a');a.href=url.href;a.textContent='Retomar pagamento pendente · '+p.produto;a.className='btn btn-linha';pendentes.append(a);
  }
  if(!contexto.disponivel) aviso('Contratação temporariamente indisponível. Converse com a TheNeil.');
}
async function escolher(produto) {
  host.scrollIntoView({behavior:'smooth',block:'start'});
  if(!contexto?.permitido || !contexto.disponivel) return;
  if(ocupado)return;ocupado=true;proposta=null;host.querySelector('#compra-revisao').replaceChildren();aviso('Consultando valor…');
  try {
    const p=await chamar('/cotacao',{produto,moeda:host.querySelector('#compra-moeda').value});proposta=p;
    host.querySelector('#compra-revisao').innerHTML=`<h3>${esc(p.nome)} · ${moeda(p.total,p.moeda)}</h3><p>${Number(p.creditos).toLocaleString('pt-BR')} créditos. ${p.recorrente?'Assinatura mensal em dólares, com renovação e cobrança automática.':'Pagamento único. Uma nova contratação será necessária para renovar ou ampliar a capacidade.'}</p>${p.cotacao?`<p>PTAX venda BCB: ${esc(p.cotacao.taxa)} · referência ${esc(p.cotacao.data_referencia)}. Valor fixado nesta emissão.</p>`:''}<p>${p.inicio?'O novo período começa em '+esc(new Date(p.inicio).toLocaleDateString('pt-BR'))+'. Os créditos do período atual permanecem sujeitos aos limites vigentes.':'A capacidade será liberada após a confirmação do pagamento.'} Uma assinatura ativa ou cobrança pendente pode exigir conciliação com a TheNeil.</p><label><input type="checkbox" id="compra-confirmar"> Confirmo a contratação para ${esc(contexto.empresa.nome)} pelo valor e condições acima${contexto.forma!=='stripe'?' e autorizo habilitar a cobrança pelo Stripe para a empresa':''}.</label><p><button type="button" class="btn btn-verde" id="compra-pagar">Continuar para pagamento no Stripe</button></p>`;
    host.querySelector('#compra-pagar').onclick=pagar;host.querySelector('#compra-revisao').focus({preventScroll:true});aviso('Revise as condições. A cotação vale por 15 minutos.');
  } catch(e){aviso(e.message);}finally{ocupado=false;}
}
async function pagar() {
  if(ocupado)return;if(!host.querySelector('#compra-confirmar').checked)return aviso('Confirme as condições para continuar.');
  ocupado=true;const b=host.querySelector('#compra-pagar');b.disabled=true;aviso('Preparando pagamento seguro…');
  try {const p=await chamar('/checkout',{pedido:proposta.pedido,confirmar:true});const u=new URL(p.url);if(u.protocol!=='https:'||u.hostname!=='checkout.stripe.com')throw new Error('Endereço de pagamento inválido.');location.assign(u.href);}
  catch(e){aviso(e.message);b.disabled=false;ocupado=false;}
}
async function iniciar() {
  try {contexto=await chamar('');mostrar();
    for(const a of document.querySelectorAll('[data-compra]')) {if(!contexto.disponivel)continue;a.textContent=contexto.permitido?(a.dataset.compra==='capacity_pack'?'Contratar Capacity Pack':'Escolher este plano'):'Ver como contratar';a.setAttribute('aria-label',a.textContent+' · '+a.dataset.compra);a.addEventListener('click',e=>{e.preventDefault();escolher(a.dataset.compra);});}
    const q=new URLSearchParams(location.search),pedido=q.get('pedido');
    if(q.get('motivo')==='creditos')aviso('A franquia da empresa terminou. Confira a reserva e a capacidade adicional com seu administrador. O histórico continua disponível.');
    if(q.get('pagamento')==='cancelado')aviso('Você voltou do pagamento. Nenhuma capacidade foi liberada por este retorno.');
    if(pedido && q.get('pagamento')==='retorno') {
      let tentativas=0;
      const conferir=async()=>{try{const c=await chamar(''),p=c.pedidos.find(p=>p.id===pedido);if(p?.estado==='pago'){aviso('Pagamento confirmado. A capacidade está disponível. Volte ao GreenIA.');return;}aviso('Aguardando confirmação do pagamento. A atualização depende da confirmação segura do Stripe.');if(++tentativas<20)setTimeout(conferir,3000);}catch(e){aviso(e.message);}};
      await conferir();
    }
  } catch(e) {
    host.innerHTML='<h2>Já utiliza o GreenIA?</h2><p>Entre no ambiente da sua empresa para contratar com segurança. Se ainda não possui um ambiente, converse com a TheNeil pelos links dos planos.</p>';
    const a=document.createElement('a');a.className='btn btn-linha';a.href=e.status===404?'/encontrar':'/entrar';a.textContent='Entrar para contratar';a.onclick=()=>{sessionStorage.setItem('greenia:contratar','1');};host.append(a);
  }
}
iniciar();
