// Captura de uma tela real em instância temporária. Todos os dados são fictícios.
import { subirComNavegador } from './navegador.js';
import { cliente } from './cliente.js';
import { salvarConfig } from '../src/config.js';
import { exec } from '../src/db.js';
const N = await subirComNavegador({ largura:1280, altura:900, empresa:'Empresa Exemplo', dominios:['empresa-exemplo.com.br'], plano:{creditos:10000,reserva:2000} });
try {
  salvarConfig(N.app.db,{empresa:'Empresa Exemplo',dominios:['empresa-exemplo.com.br'],tetoMensal:100});
  const c=await cliente(N.app,N.base).entrar('admin@empresa-exemplo.com.br');
  exec(N.app.db,'update pessoas set nome=? where id=?','Ana · demonstração',c.pessoa.id);
  const t=N.app.agora().toISOString();
  for(let i=0;i<12;i++) exec(N.app.db,'insert into uso(em,pessoa_id,conversa_id,modelo_pedido,modelo_usado,custo,ms) values(?,?,?,?,?,?,?)',t,c.pessoa.id,i+1,'google/gemini-3.5-flash-lite','google/gemini-3.5-flash-lite',1.25,800);
  const p=await N.entrar('admin@empresa-exemplo.com.br');await p.emulateMedia({reducedMotion:'reduce'});
  await p.goto(N.base+'/app#/uso');await p.getByRole('heading',{name:'Uso e créditos',exact:true}).waitFor();
  await p.waitForFunction(()=>!document.getAnimations().some(a=>a.playState==='running'));
  await p.screenshot({path:'/tmp/greenia-gestao-demo.png'});
} finally {await N.fechar();}
