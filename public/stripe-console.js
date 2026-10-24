// Finanças só no console do operador. Os links abrem a página hospedada pelo Stripe.
export function abrirCobrancasStripe({ empresa, api, modal, esc }) {
  let fecharModal, modo, emissaoPermitida=false;
  const $=id=>document.getElementById(id), endpoint=`/api/plataforma/empresas/${encodeURIComponent(empresa.id)}/cobrancas`;
  const pedido=crypto.randomUUID();
  const produto=(empresa.plano?.name || '').replace('GreenIA ','').toLowerCase();
  const dinheiro=(n,moeda)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:moeda.toUpperCase()}).format(n/100);
  modal(`<div class="modal-topo"><span class="rotulo" id="stripe-ambiente">Verificando ambiente…</span><button class="icone-btn" id="stripe-fechar" aria-label="Fechar">×</button></div>
    <h2>Cobranças da ${esc(empresa.name)}</h2><p class="dica">Em reais, cada nova cobrança usa a PTAX de venda disponível na emissão. O reenvio mantém o valor original.</p>
    <form id="stripe-form"><div class="campo"><label for="stripe-produto">Produto</label><select class="entrada" id="stripe-produto">
      ${['starter','team','business','company'].includes(produto)?`<option value="${esc(produto)}">${esc(empresa.plano.name)}</option>`:''}<option value="capacity_pack">Capacity Pack</option></select></div>
    <div class="grade-2"><div class="campo"><label for="stripe-moeda">Moeda</label><select class="entrada" id="stripe-moeda"><option value="brl">Reais</option><option value="usd">Dólares</option></select></div>
    <div class="campo"><label for="stripe-canal">Pagamento</label><select class="entrada" id="stripe-canal"><option value="checkout">Checkout</option><option value="fatura">Fatura</option></select></div></div>
    <div class="grade-2"><div class="campo"><label for="stripe-qtd">Quantidade de pacotes</label><input class="entrada" id="stripe-qtd" type="number" min="1" max="50" value="1"></div>
    <div class="campo"><label for="stripe-prazo">Vencimento da fatura (dias)</label><input class="entrada" id="stripe-prazo" type="number" min="1" max="90" placeholder="Defina o prazo acordado"></div></div>
    <label id="stripe-renovar-label" class="dica"><input id="stripe-renovar" type="checkbox"> Gerar a próxima fatura mensal após este período pago, com nova cotação</label>
    <p class="dica" id="stripe-regra"></p><p role="alert" class="msg-erro" id="stripe-erro"></p><button class="btn btn-verde" id="stripe-criar" disabled>Gerar link</button></form>
    <div id="stripe-resultado" role="status"></div><h3>Cobranças recentes</h3><div id="stripe-lista" aria-live="polite">Carregando…</div>`, fechar => { fecharModal=fechar; });
  $('stripe-fechar').onclick=()=>fecharModal?.();
  const ajustar=()=>{
    const pack=$('stripe-produto').value==='capacity_pack',fatura=$('stripe-canal').value==='fatura',usd=$('stripe-moeda').value==='usd';
    $('stripe-qtd').disabled=!pack;if(!pack)$('stripe-qtd').value='1';
    $('stripe-prazo').disabled=!fatura;$('stripe-prazo').required=fatura;
    $('stripe-renovar-label').hidden=pack||usd||!fatura;
    if(pack||usd||!fatura)$('stripe-renovar').checked=false;
    $('stripe-regra').textContent=pack?'Compra avulsa. Os créditos entram após a confirmação do pagamento.':usd&&!fatura?'Assinatura mensal em dólar. O Stripe solicitará autorização para pagamentos recorrentes.':'Cobrança de um período mensal. Uma nova emissão será necessária para a próxima renovação.';
  };
  for(const id of ['stripe-produto','stripe-moeda','stripe-canal'])$(id).onchange=ajustar;
  const link=(url,texto)=>`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(texto)}</a>`;
  const carregar=async()=>{
    try {const d=await api(endpoint);if(!$('stripe-lista'))return;
      modo=d.modo;
      emissaoPermitida=d.emissaoPermitida!==false;
      $('stripe-ambiente').textContent=modo==='producao'?'Produção · cobranças reais':'Ambiente de teste';
      $('stripe-criar').textContent=modo==='producao'?'Gerar cobrança real':'Gerar link de teste';
      if(!$('stripe-resultado').querySelector('a'))$('stripe-criar').disabled=!emissaoPermitida;
      if(!emissaoPermitida)$('stripe-regra').textContent='A emissão de novas cobranças está temporariamente pausada. Pagamentos existentes continuam sendo acompanhados.';
      $('stripe-lista').innerHTML=(d.renovacao?`<p class="dica">${d.renovacao.ativa?'Renovação programada para':'Renovação interrompida desde'} ${esc(new Date(d.renovacao.proxima_em).toLocaleDateString('pt-BR'))}${!d.geracaoAutomatica?' · Geração automática pausada na configuração do ambiente.':''}${d.renovacao.ultimo_erro?' · Emissão pendente: confira câmbio e configuração.':''}</p>${d.renovacao.ativa?'<button class="btn btn-pequeno" id="stripe-parar">Parar próximas emissões</button>':'<button class="btn btn-pequeno" id="stripe-retomar">Retomar próximas emissões</button>'}`:'')+(d.pedidos.length?d.pedidos.map(p=>`<p><strong>${esc(p.produto==='capacity_pack'?'Capacity Pack':p.produto)}</strong> · ${esc(dinheiro(p.snapshot.total,p.moeda))} · ${esc(p.estado)}${p.url?` · ${link(p.url,'Abrir pagamento')}`:''}${p.email_enviado_em?` · ${modo==='producao'?'Envio solicitado ao Stripe':'Envio simulado'}`:p.canal==='fatura'&&p.estado==='aguardando'?` · <button class="btn btn-pequeno" data-stripe-enviar="${esc(p.id)}">${modo==='producao'?'Enviar fatura por email':'Simular envio de email'}</button>`:''}</p>`).join(''):'Ainda não há cobranças.');
      for(const botao of $('stripe-lista').querySelectorAll('[data-stripe-enviar]'))botao.onclick=async()=>{
        if(!confirm(modo==='producao'?`Enviar esta fatura ao email de contato da empresa (${empresa.contact_email || 'consulte o cadastro'})?`:'Simular envio no Stripe? O ambiente de teste não entrega emails.'))return;
        botao.disabled=true;
        try{const envio=await api(`${endpoint}/${encodeURIComponent(botao.dataset.stripeEnviar)}/enviar-email`,{metodo:'POST',corpo:{}});$('stripe-resultado').textContent=envio.simulado?'Envio simulado. Nenhum email foi entregue no ambiente de teste.':'Envio solicitado ao Stripe. A entrega deve ser conferida no histórico da fatura.';await carregar();}
        catch(e){$('stripe-erro').textContent=e.message;botao.disabled=false;}
      };
      if($('stripe-parar'))$('stripe-parar').onclick=async()=>{try{await api(endpoint+'/parar-renovacao',{metodo:'POST',corpo:{}});await carregar();}catch(e){$('stripe-erro').textContent=e.message;}};
      if($('stripe-retomar'))$('stripe-retomar').onclick=async()=>{try{await api(endpoint+'/retomar-renovacao',{metodo:'POST',corpo:{}});await carregar();}catch(e){$('stripe-erro').textContent=e.message;}};
    }catch(e){if($('stripe-lista'))$('stripe-lista').textContent=e.message;}
  };
  $('stripe-form').onsubmit=async ev=>{
    ev.preventDefault();if(!modo||!emissaoPermitida)return;const botao=$('stripe-criar');botao.disabled=true;$('stripe-erro').textContent='';
    try {
      const d=await api(endpoint,{metodo:'POST',corpo:{pedido,produto:$('stripe-produto').value,moeda:$('stripe-moeda').value,
        canal:$('stripe-canal').value,quantidade:Number($('stripe-qtd').value),renovar:$('stripe-renovar').checked,...($('stripe-canal').value==='fatura'?{vencimento_dias:Number($('stripe-prazo').value)}:{})}});
      if(!$('stripe-resultado'))return;
      $('stripe-resultado').innerHTML=`<p>${link(d.url,'Abrir pagamento no Stripe')}</p>${d.snapshot?.cotacao?`<p class="dica">USD/BRL ${esc(d.snapshot.cotacao.taxa)} · Banco Central · referência ${esc(d.snapshot.cotacao.data_referencia)}. ${d.snapshot.cotacao.fechamento_anterior?'Último fechamento anterior disponível.':''}</p>`:''}`;
      for(const campo of $('stripe-form').elements)campo.disabled=true;
      await carregar();
    }catch(e){if($('stripe-erro'))$('stripe-erro').textContent=e.message;botao.disabled=!emissaoPermitida;}
  };
  ajustar();carregar();
}
