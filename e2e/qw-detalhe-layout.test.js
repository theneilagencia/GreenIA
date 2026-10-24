import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {subirComNavegador} from '../scripts/navegador.js';
import {cliente} from '../scripts/cliente.js';
import {exec} from '../src/db.js';
import {construir} from '../src/quickwin-construtor.js';

test('detalhe publicado: nome junto ao título, ação principal à direita (abaixo no celular) e edição contida em todas as larguras',async()=>{
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
      assert.equal(await p.getByRole('link',{name:'Editar instruções',exact:true}).count(),1);
      // Uma ação principal; Agendar e o resto ficam em "Mais ações".
      assert.equal(await p.locator('.pg-acoes .btn-verde').count(),1);
      await p.locator('.pg-acoes summary[aria-label="Mais ações"]').click();
      assert.equal(await p.getByRole('menuitem',{name:'Agendar',exact:true}).count(),1);
      await p.keyboard.press('Escape');
      const medidas=await p.evaluate(()=>{
        const title=document.querySelector('.pg-nome h2').getBoundingClientRect();
        const name=document.querySelector('#qw-editar-nome').getBoundingClientRect();
        const texto=document.querySelector('.pg-titulo-texto').getBoundingClientRect();
        const actions=document.querySelector('.pg-acoes').getBoundingClientRect();
        // As ações nunca disputam espaço com o nome: ficam à direita do bloco do título ou inteiras abaixo dele.
        const aDireita=actions.left>=texto.right-1, abaixo=actions.top>=texto.bottom-1;
        return {semExcesso:document.documentElement.scrollWidth<=innerWidth,nomeAoLado:name.left>=title.right+5,separadas:aDireita||abaixo,aDireita};
      });
      assert.deepEqual({...medidas,aDireita:undefined},{semExcesso:true,nomeAoLado:true,separadas:true,aDireita:undefined},`hierarquia em ${width}px`);
      if(width>=1280)assert.equal(medidas.aDireita,true,`ação principal à direita do cabeçalho em ${width}px`);
      if(width<=390)assert.equal(medidas.aDireita,false,`no celular, ações abaixo do nome em ${width}px`);
      // Menu separado do título: ao lado, com folga, ou (telas estreitas) o título na linha de baixo.
      if(width<600)assert.ok(await p.evaluate(()=>{const h=document.querySelector('.cabeca h1').getBoundingClientRect(),m=document.querySelector('#menu').getBoundingClientRect();return h.left-m.right>=9||h.top>=m.bottom;}),'Menu separado do título');
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
