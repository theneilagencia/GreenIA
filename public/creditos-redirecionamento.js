export function deveAbrirPlanos(plano) {
  return !!plano && !plano.ilimitado && (Number(plano.percentual)>=100 || plano.fase==='esgotado');
}
export async function conferirCapacidade({rascunho}={}) {
  if(!['/app','/app/'].includes(location.pathname))return;
  // Não interromper um pedido que ainda está sendo escrito.
  if(!rascunho && document.querySelector('textarea')?.value.trim())return;
  try {
    const r=await fetch('/api/contratacao',{credentials:'same-origin'});if(!r.ok)return;
    const c=await r.json();if(!deveAbrirPlanos(c.plano))return;
    const chave=`greenia:capacidade:${c.empresa.id}:${c.usuario}:${c.plano.renova}:${c.plano.fase==='esgotado'?'fim':'franquia'}`;
    if(sessionStorage.getItem(chave))return;
    if(rascunho)sessionStorage.setItem('greenia:pedido-interrompido',JSON.stringify({empresa:c.empresa.id,usuario:c.usuario,hash:location.hash,...rascunho}));
    sessionStorage.setItem('greenia:voltar-capacidade',location.hash);
    sessionStorage.setItem(chave,'1');location.assign('/planos.html?motivo=creditos');
  }catch{/* O uso do produto não depende da disponibilidade do painel de contratação. */}
}

export async function recuperarPedido() {
  try {
    const salvo=JSON.parse(sessionStorage.getItem('greenia:pedido-interrompido')||'null');
    if(!salvo || salvo.hash!==location.hash)return null;
    const r=await fetch('/api/contratacao',{credentials:'same-origin'});if(!r.ok)return null;
    const c=await r.json();if(c.empresa.id!==salvo.empresa || c.usuario!==salvo.usuario)return null;
    sessionStorage.removeItem('greenia:pedido-interrompido');return salvo;
  }catch{return null;}
}
