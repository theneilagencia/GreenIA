import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {subirComNavegador} from '../scripts/navegador.js';
import {cliente} from '../scripts/cliente.js';
import {exec} from '../src/db.js';
import {construir} from '../src/quickwin-construtor.js';

test('detalhe publicado: nome junto ao título, ações em outra linha e edição contida em todas as larguras',async()=>{
  const N=await subirComNavegador();try{
    const a=await cliente(N.app,N.base).entrar('admin@empresa-exemplo.com.br');
    const ensino={nome:'Analisar documentos',descricao:'Analisar documentos e destacar riscos sem inventar informações',regras:['nao_inventar','destacar_ausentes','indicar_fontes','identificar_riscos','preservar_numeros'],formato:'resumo'};
    const q=(await a.post('/api/quick-wins',{assistente:ensino,toda_empresa:true})).dados;
    const spec=JSON.stringify(construir(ensino));
    const v=exec(N.app.db,'insert into quick_win_versoes(quick_win_id,numero,especificacao,nome,publicada_em) values(?,1,?,?,?)',q.id,spec,q.nome,new Date().toISOString()).lastInsertRowid;
    exec(N.app.db,"update quick_wins set especificacao=?,versao_publicada=?,status='em_uso' where id=?",spec,v,q.id);
    const p=await N.entrar('admin@empresa-exemplo.com.br');
    const erros=[];p.on('pageerror',e=>erros.push(e.message));
    const capturas=process.env.QW_VISUAL_DIR;if(capturas)await mkdir(capturas,{recursive:true});
    for(const width of [1440,1280,1024,768,390,320]){
      await p.setViewportSize({width,height:width<600?844:1000});
      await p.goto(`${N.base}/app#/qw/${q.id}`);await p.getByRole('button',{name:'Editar nome',exact:true}).waitFor();
      assert.equal(await p.getByRole('link',{name:'Usar',exact:true}).count(),1);
      assert.equal(await p.getByRole('link',{name:'Agendar',exact:true}).count(),1);
      assert.equal(await p.getByRole('link',{name:'Editar instruções',exact:true}).count(),1);
      const medidas=await p.evaluate(()=>{
        const title=document.querySelector('.pg-nome h2').getBoundingClientRect();
        const name=document.querySelector('#qw-editar-nome').getBoundingClientRect();
        const meta=document.querySelector('.pg-meta').getBoundingClientRect();
        const actions=document.querySelector('.pg-acoes').getBoundingClientRect();
        return {semExcesso:document.documentElement.scrollWidth<=innerWidth,nomeAoLado:name.left>=title.right+5,acoesAbaixo:actions.top>=meta.bottom+12};
      });
      assert.deepEqual(medidas,{semExcesso:true,nomeAoLado:true,acoesAbaixo:true},`hierarquia em ${width}px`);
      if(width<600)assert.ok(await p.evaluate(()=>document.querySelector('.cabeca h1').getBoundingClientRect().left-document.querySelector('#menu').getBoundingClientRect().right>=9),'Menu separado do título');
      if(capturas&&[1440,390].includes(width))await p.screenshot({path:`${capturas}/detalhe-${width}.png`,fullPage:true,animations:'disabled'});
      await p.getByRole('button',{name:'Editar nome',exact:true}).click();
      assert.equal(await p.locator('#qw-nome').evaluate(el=>el===document.activeElement),true);
      assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      if(capturas&&[1440,390].includes(width))await p.screenshot({path:`${capturas}/editar-${width}.png`,fullPage:true,animations:'disabled'});
      await p.getByRole('button',{name:'Cancelar',exact:true}).click();
      assert.equal(await p.locator('#qw-editar-nome').evaluate(el=>el===document.activeElement),true);
    }
    await a.put(`/api/quick-wins/${q.id}`,{nome:'Resumo das verificações e decisões semanais de fornecedores e contratos da equipe'});
    await p.reload();await p.getByRole('button',{name:'Editar nome',exact:true}).waitFor();
    assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'nome longo em 320px');
    await p.setViewportSize({width:1280,height:900});
    let liberar, iniciou;
    const pendente=new Promise(r=>{liberar=r;});const requisicao=new Promise(r=>{iniciou=r;});
    await p.route(`**/api/quick-wins/${q.id}/medicao`,async r=>{iniciou();await pendente;await r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({mensagem:'Falha temporária de QA.'})});});
    await p.reload();await p.getByRole('button',{name:'Editar nome',exact:true}).waitFor();await requisicao;
    try {
      await p.getByRole('link',{name:'Nova conversa',exact:true}).click();await p.waitForSelector('#entrada');
    } finally { liberar(); }
    await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    assert.deepEqual(erros,[]);
  }finally{await N.fechar();}
});
