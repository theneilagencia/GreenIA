import { esc } from '/comum.js';

// Verificação e cadastro acontecem na mesma página. O cliente digita o código;
// não há criação de empresa, acesso ou pagamento pela simples visita.
let geracao=0;
export async function abrirAdesao(host,produto,concluir) {
  const atual=++geracao;
  let sessao,ocupado=false;
  const status=mensagem=>{if(atual===geracao && host.querySelector('[role="status"]'))host.querySelector('[role="status"]').textContent=mensagem;};
  async function chamar(etapa,corpo) {
    const r=await fetch('/api/adesao'+etapa,{method:corpo?'POST':'GET',credentials:'same-origin',
      headers:corpo?{'content-type':'application/json','x-csrf':sessao.csrf}:{},body:corpo?JSON.stringify(corpo):undefined});
    const d=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(d.mensagem||'Não foi possível continuar a contratação. Tente novamente.');
    if(atual!==geracao)throw new Error('Seleção de plano substituída.');
    return d;
  }
  function tela(conteudo) {
    host.innerHTML=`<h2 id="adesao-titulo">${produto==='capacity_pack'?'Contratar capacidade adicional':'Contratar o GreenIA'}</h2><p>Confirme seu email para vincular o pagamento à empresa correta. Você revisará o valor antes de abrir o pagamento seguro no Stripe.</p><div role="status" aria-live="polite"></div>${conteudo}`;
    host.scrollIntoView({behavior:'smooth',block:'start'});
    const titulo=host.querySelector('h2');titulo.tabIndex=-1;titulo.focus({preventScroll:true});
  }
  function ligar(formulario,acao) {
    const form=host.querySelector(formulario);
    form.onsubmit=async e=>{e.preventDefault();if(ocupado)return;ocupado=true;const botao=form.querySelector('button[type="submit"]');botao.disabled=true;
      try{await acao(new FormData(form));}catch(e){status(e.message);}finally{ocupado=false;if(botao.isConnected)botao.disabled=false;}};
  }
  function email() {
    tela('<form id="adesao-email"><label for="adesao-email-campo">Email de trabalho</label><input id="adesao-email-campo" type="email" name="email" autocomplete="email" maxlength="200" required><p><button type="submit" class="btn btn-verde">Continuar contratação</button></p></form><p>Já é cliente? Use o email vinculado à sua empresa. <a href="/privacidade">Política de Privacidade</a></p>');
    ligar('#adesao-email',async f=>{const endereco=String(f.get('email')).trim();await chamar('/codigo',{email:endereco});codigo(endereco);});
  }
  function codigo(endereco) {
    tela(`<p>Enviamos um código para <strong>${esc(endereco)}</strong>. Ele vale por 10 minutos. Confira também o spam.</p><form id="adesao-codigo"><label for="adesao-codigo-campo">Código recebido por email</label><input id="adesao-codigo-campo" name="codigo" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required><p><button type="submit" class="btn btn-verde">Verificar email e continuar</button></p></form><button type="button" class="btn btn-linha" id="adesao-outro-email">Corrigir email ou pedir novo código</button>`);
    host.querySelector('#adesao-outro-email').onclick=email;
    host.querySelector('#adesao-codigo-campo').focus({preventScroll:true});
    ligar('#adesao-codigo',async f=>{const d=await chamar('/verificar',{codigo:f.get('codigo')});sessao.verificado=true;sessao.empresas=d.empresas;empresa();});
  }
  function empresa() {
    const empresas=sessao.empresas || [];
    if(empresas.length) {
      const permitidas=empresas.filter(e=>e.permitido);
      if(!permitidas.length){tela('<p>Seu email já está vinculado a uma empresa. Peça ao administrador com permissão financeira para contratar o plano ou Capacity Pack.</p><a class="btn btn-linha" href="/encontrar">Entrar no meu ambiente</a>');return;}
      tela(`<form id="adesao-empresa"><label for="adesao-empresa-campo">Empresa da contratação</label><select id="adesao-empresa-campo" name="empresa">${permitidas.map(e=>`<option value="${esc(e.id)}">${esc(e.nome)}</option>`).join('')}</select><p><button type="submit" class="btn btn-verde">Revisar contratação</button></p></form>`);
      ligar('#adesao-empresa',async f=>{await chamar('/empresa',{empresa:f.get('empresa')});await concluir(produto);});return;
    }
    if(produto==='capacity_pack'){tela('<p>O Capacity Pack amplia um plano existente. Escolha um dos quatro planos para iniciar a contratação da sua empresa.</p><a class="btn btn-linha" href="#comparar-planos">Comparar planos</a>');return;}
    tela('<form id="adesao-cadastro"><label for="adesao-nome">Seu nome</label><input id="adesao-nome" name="nome" autocomplete="name" minlength="2" maxlength="120" required><label for="adesao-empresa-nome">Nome da empresa</label><input id="adesao-empresa-nome" name="nome_empresa" autocomplete="organization" minlength="2" maxlength="80" required><label for="adesao-documento">CNPJ ou documento da empresa (opcional)</label><input id="adesao-documento" name="documento" maxlength="40"><p><label><input type="checkbox" name="confirmar" required> Estou autorizado a cadastrar esta empresa e administrar sua contratação.</label></p><p>O cadastro não libera créditos. O uso de IA começa após a confirmação do pagamento.</p><p><button type="submit" class="btn btn-verde">Revisar valor e forma de pagamento</button></p></form>');
    ligar('#adesao-cadastro',async f=>{await chamar('/empresa',{nome:f.get('nome'),nome_empresa:f.get('nome_empresa'),documento:f.get('documento'),produto,confirmar_cadastro:f.get('confirmar')==='on'});await concluir(produto);});
  }
  tela('<p>Preparando contratação…</p>');
  try{sessao=await chamar('');if(sessao.verificado)empresa();else email();}
  catch(e){if(atual!==geracao)return;tela('<p>Não foi possível abrir a contratação.</p><button type="button" class="btn btn-linha" id="adesao-tentar">Tentar novamente</button>');status(e.message);host.querySelector('#adesao-tentar').onclick=()=>abrirAdesao(host,produto,concluir);}
}
