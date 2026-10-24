import {test} from 'node:test';
import assert from 'node:assert/strict';
import {conferirCapacidade,recuperarPedido} from '../public/creditos-redirecionamento.js';
test('esgotamento abre planos uma vez por ciclo, preserva pedido e isola sua recuperação',async()=>{
  const nomes=['location','document','fetch','sessionStorage'],antes=Object.fromEntries(nomes.map(n=>[n,Object.getOwnPropertyDescriptor(globalThis,n)]));
  const mapa=new Map(), destinos=[];
  let c={empresa:{id:'a'},usuario:'u',plano:{percentual:100,fase:'reserva',renova:'2026-11-01'}};
  try{
    Object.assign(globalThis,{location:{pathname:'/app',hash:'#/c/123',assign:u=>destinos.push(u)},document:{querySelector:seletor=>seletor==='textarea'?{value:''}:null},sessionStorage:{getItem:k=>mapa.get(k)||null,setItem:(k,v)=>mapa.set(k,v),removeItem:k=>mapa.delete(k)},fetch:async()=>({ok:true,json:async()=>c})});
    globalThis.document.querySelector=seletor=>seletor==='#enviar.interromper'?{}:null;
    await conferirCapacidade();assert.equal(destinos.length,0);
    globalThis.document.querySelector=seletor=>seletor==='textarea'?{value:''}:null;
    await conferirCapacidade({rascunho:{texto:'Pedido não enviado',anexos:[{id:'arquivo'}]}});
    assert.deepEqual(destinos,['/planos.html?motivo=creditos']);
    await conferirCapacidade();assert.equal(destinos.length,1);
    c={...c,empresa:{id:'b'}};assert.equal(await recuperarPedido(),null);
    c={...c,empresa:{id:'a'}};const salvo=await recuperarPedido();assert.equal(salvo.texto,'Pedido não enviado');assert.equal(salvo.anexos[0].id,'arquivo');
    assert.equal(await recuperarPedido(),null);
    c.plano={...c.plano,fase:'esgotado'};await conferirCapacidade();assert.equal(destinos.length,2);
    c.plano={...c.plano,renova:'2026-12-01'};await conferirCapacidade();assert.equal(destinos.length,3);
    c.plano={...c.plano,ilimitado:true};await conferirCapacidade();assert.equal(destinos.length,3);
  }finally{for(const n of nomes){if(antes[n])Object.defineProperty(globalThis,n,antes[n]);else delete globalThis[n];}}
});
