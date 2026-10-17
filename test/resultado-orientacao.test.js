import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pontosDoResultado,pedidoMelhoria,orientacaoIntegracao} from '../public/resultado-orientacao.js';
import {necessidadesDoPedido} from '../src/integracoes/necessidades.js';
test('etapa editorial e pesquisa na internet não viram sistema externo; sistema explicitamente nomeado permanece',()=>{
  assert.deepEqual(necessidadesDoPedido('Pesquise tendências na Fase Zero e escreva a newsletter.'),[]);
  assert.deepEqual(necessidadesDoPedido('Pesquise tendências na Internet.'),[]);
  assert.equal(necessidadesDoPedido('Consulte clientes no sistema Fase Zero.')[0].modo,'read');
  assert.equal(necessidadesDoPedido('Registre o cliente no CRM.')[0].modo,'write');
});
test('diagnóstico editorial oferece ajuste concreto e preserva a evidência completa',()=>{
  const q={problemas:['Faltou parte do que foi pedido. Falta plano de ação com responsáveis, prazos e KPIs mensuráveis. (critério: Plano confirmado)','Faltou parte do que foi pedido. Tom e construção narrativa contêm marcas de IA: repetição de frases. (critério: Linguagem natural)']};
  const pontos=pontosDoResultado(q);
  assert.match(pontos[0].fazer,/responsáveis, prazos e indicadores/);
  assert.match(pontos[1].fazer,/simplificar a linguagem/);
  assert.equal(pontos[1].titulo,'A linguagem precisa de ajuste');
  assert.doesNotMatch(pontos[1].observacao,/critério|marcas de IA|Faltou parte/);
  assert.equal(pontos[0].detalhe,q.problemas[0]);
  assert.doesNotMatch(pontos[0].observacao,/critério/);
  assert.match(pedidoMelhoria(q),/material já enviado/);
  assert.match(pedidoMelhoria(q),/Não invente informações nem faça ações em sistemas externos/);
});
test('consulta bloqueada não é descrita como gravação bloqueada pela qualidade',()=>{
  const o=orientacaoIntegracao({modo:'read',status:'BLOCKED',motivo:'falta configurar a integração'},{motivo:'resultado_nao_conferido'});
  assert.match(o.impacto,/dados desta consulta não foram obtidos/);
  assert.match(o.fazer,/não crie uma conexão para uma etapa editorial/);
  assert.equal(o.destino,'conexao');
  const escrita=orientacaoIntegracao({modo:'write',status:'BLOCKED'},{motivo:'resultado_nao_conferido'});
  assert.equal(escrita.destino,'resultado');assert.match(escrita.impacto,/Nenhuma alteração/);
});
test('negação, falha, resultado parcial e aprovação nunca propõem repetir efeito incerto',()=>{
  assert.match(orientacaoIntegracao({modo:'write',status:'FAILED'}).fazer,/antes de tentar novamente/);
  assert.match(orientacaoIntegracao({modo:'write',status:'PARTIAL'}).fazer,/evitar repetir alterações/);
  assert.match(orientacaoIntegracao({modo:'write',status:'DENIED'}).fazer,/regra/);
  assert.match(orientacaoIntegracao({modo:'write',status:'APPROVAL_REQUIRED',aprovacao_status:'negada'}).fazer,/não tente contornar/);
});
