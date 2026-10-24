import { autorizarAdvancedFalso } from './advanced-fixture.js';
// Roteamento no fluxo completo (HTTP → análise → requisitos → governança → seleção → execução →
// auditoria → resposta): a decisão chega ao modelo chamado, ao registro e à tela, sem conteúdo do pedido.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { subir } from './ajuda.js';
import { openRouterFalso, enviarMensagem } from './openrouter-falso.js';
import { lerConfig, salvarConfig } from '../src/config.js';
import { exec, um } from '../src/db.js';
import { AUTOMATICO } from '../src/roteador.js';

const RAPIDO = 'google/gemini-3.5-flash-lite', EQUILIBRADO = 'anthropic/claude-haiku-4.5', AVANCADO = 'anthropic/claude-sonnet-5';
const CONTRATO = 'Analise este contrato e identifique riscos jurídicos, obrigações e possíveis pontos de exposição.';
let S, OR, admin, ana;

before(async () => {
  OR = await openRouterFalso();
  S = await subir({ ia: OR.ia });
  salvarConfig(S.app.db, { dominios: ['exemplo.com.br'] });
  admin = await S.cliente().entrar('admin@exemplo.com.br');
  ana = await S.cliente().entrar('ana@exemplo.com.br');
});
after(async () => { await S.fechar(); await OR.fechar(); });

const liberarClasses = async todosTem => {
  const r = await admin.put('/api/admin/modelos-config', { acessoPerfis: { equilibrado: { todos: todosTem }, avancado: { todos: todosTem } } });
  assert.equal(r.status, 200, JSON.stringify(r.dados));
  if(todosTem) await autorizarAdvancedFalso(S,admin,ana.pessoa,[AVANCADO]);
  else exec(S.app.db,'update advanced_autorizacoes set revogada=1');
};
const conversa = async () => (await ana.post('/api/conversas', {})).dados.conversa;
const ultimaRota = () => { const r = um(S.app.db, 'select * from roteamento order by id desc limit 1'); for (const k of ['requisitos', 'candidatos', 'politicas', 'sinais', 'fallback', 'tipos']) r[k] = JSON.parse(r[k] ?? 'null'); return r; };

test('fluxo completo: pedido simples no Rápido, contrato com riscos no Avançado; o modelo chamado é o decidido', async () => {
  await liberarClasses(true);
  let conv = await conversa();
  let r = await enviarMensagem(ana, conv.id, { texto: "Traduza 'bom dia' para inglês." });
  assert.equal(r.status, 200);
  assert.equal(OR.chamadas.at(-1).model, RAPIDO);
  assert.equal(ultimaRota().classe, 'rapido');

  conv = await conversa();
  r = await enviarMensagem(ana, conv.id, { texto: CONTRATO });
  assert.equal(r.status, 200);
  assert.equal(OR.chamadas.at(-1).model, AVANCADO);
  const rota = ultimaRota();
  assert.equal(rota.modelo, AVANCADO);
  // Quem conversa vê a explicação simples; o registro (e o admin) guarda a técnica.
  assert.match(r.fim.rota.explicacao, /^Nível Avançado, escolhido automaticamente pela GreenIA/);
  assert.doesNotMatch(r.fim.rota.explicacao, /modelo|janela|token|homolog|OpenRouter/i);
  assert.match(rota.explicacao, /^Classe Avançado, escolhida automaticamente pela GreenIA/);
  const tela = (await ana.get(`/api/conversas/${conv.id}`)).dados.mensagens.find(m => m.papel === 'assistant');
  assert.equal(tela.rota_explicacao, r.fim.rota.explicacao);
  assert.equal(tela.fornecedor, null);
});

test('v3: tarefa simples fica na menor classe suficiente mesmo com preferência por qualidade', async () => {
  await liberarClasses(true);
  await admin.put('/api/admin/modelos-config', { roteamento: { ativo: true, preferencia: 'qualidade' } });
  const conv = await conversa();
  const r = await enviarMensagem(ana, conv.id, { texto: 'Reescreva esta frase de forma mais curta: a reunião foi concluída com sucesso.' });
  assert.equal(r.status, 200);
  assert.equal(OR.chamadas.at(-1).model, RAPIDO);
  const rota = ultimaRota();
  assert.equal(rota.classe_necessaria, 'rapido');
  assert.equal(rota.classe, 'rapido');
  assert.equal(rota.requisitos.calibracao.menorNivelSuficiente, 1);
  assert.equal(rota.requisitos.calibracao.acimaDaMenorClasse, false);
  assert.match(rota.motivo_escolha, /menor_classe_suficiente|menor_custo|unico_que_atende/);
  await admin.put('/api/admin/modelos-config', { roteamento: { ativo: true, preferencia: 'equilibrio' } });
});

test('auditoria: reconstrói a decisão (requisitos, candidatos, motivo, preferência, resultado) sem guardar conteúdo', async () => {
  const conv = await conversa();
  const segredo = 'Projeto Aurora com margem de 37 por cento';
  assert.equal((await enviarMensagem(ana, conv.id, { texto: `Resuma: ${segredo}`, anexos: [] })).status, 200);
  const rota = ultimaRota();
  for (const campo of ['versao', 'em', 'origem', 'classe_pedida', 'classe_necessaria', 'classe', 'modelo', 'modo', 'complexidade', 'preferencia', 'motivo_escolha', 'resultado', 'explicacao'])
    assert.ok(rota[campo] !== null && rota[campo] !== undefined && rota[campo] !== '', campo);
  assert.equal(rota.versao, '3.3');
  assert.equal(rota.classe_pedida, 'auto');
  assert.equal(rota.preferencia, 'equilibrio');
  assert.equal(rota.resultado, 'respondido');
  assert.ok(rota.janela_minima > 0 && rota.janela_desejada >= rota.janela_minima);
  assert.ok(rota.requisitos.dimensoes.geral >= 1 && rota.requisitos.determinantes.length);
  assert.ok(rota.requisitos.calibracao && rota.requisitos.calibracao.nivelSelecionado >= 1, 'v3 registra calibração sem conteúdo');
  assert.ok(rota.candidatos.length >= 3 && rota.candidatos.every(c => c.status && Array.isArray(c.motivos)));
  assert.ok(rota.politicas.includes('fornecedor_sem_treino'));
  const linha = JSON.stringify(um(S.app.db, 'select * from roteamento where id = ?', rota.id));
  assert.ok(!linha.includes('Aurora') && !linha.includes('37 por cento'), 'nenhum trecho do pedido');
  const tela = (await admin.get('/api/admin/roteamento')).dados;
  assert.ok(!JSON.stringify(tela).includes('Aurora'));
  assert.ok(!('custo_estimado' in tela.decisoes[0]) && !('custo_real' in tela.decisoes[0]), 'sem valores em dólar');
  assert.ok(tela.resumo.calibracao.observadas >= 1);
  assert.ok(tela.resumo.calibracao.taxaMenorClasseSuficiente === null || (tela.resumo.calibracao.taxaMenorClasseSuficiente >= 0 && tela.resumo.calibracao.taxaMenorClasseSuficiente <= 100));
});

test('sem acesso à capacidade necessária: bloqueia antes da inferência e registra solicitação',async()=>{
 await liberarClasses(false);
 try {const conv=await conversa(),n=OR.chamadas.length;
 const r=await enviarMensagem(ana,conv.id,{texto:CONTRATO});assert.equal(r.status,403);assert.equal(r.erro.erro,'advanced_necessario');assert.equal(OR.chamadas.length,n);assert.equal(ultimaRota().resultado,'bloqueado');
 }finally{await liberarClasses(true);}
});

test('classe escolhida pela pessoa não reduz capacidade exigida',async()=>{
 const conv=await conversa(),n=OR.chamadas.length;
 const r=await enviarMensagem(ana,conv.id,{texto:CONTRATO,modelo:'classe:rapido'});
 assert.equal(r.status,200);assert.equal(OR.chamadas.length,n+1);assert.equal(OR.chamadas.at(-1).model,AVANCADO);
});

test('nova tentativa na mesma conversa sobe a partir da classe usada antes', async () => {
  const conv = await conversa();
  assert.equal((await enviarMensagem(ana, conv.id, { texto: 'Liste os itens do pedido.' })).status, 200);
  assert.equal(ultimaRota().classe, 'rapido');
  assert.equal((await enviarMensagem(ana, conv.id, { texto: 'Não resolveu, a lista está errada.' })).status, 200);
  const rota = ultimaRota();
  assert.equal(rota.requisitos.dimensoes.nova_tentativa, 2);
  assert.equal(rota.sinais.anterior, 'rapido');
  assert.equal(OR.chamadas.at(-1).model, EQUILIBRADO);
});

test('roteamento desligado não autoriza padrão insuficiente',async()=>{
 await admin.put('/api/admin/modelos-config',{roteamento:{ativo:false}});
 try {const conv=await conversa(),n=OR.chamadas.length;const r=await enviarMensagem(ana,conv.id,{texto:CONTRATO});assert.equal(r.status,503);assert.equal(OR.chamadas.length,n);assert.equal(ultimaRota().resultado,'bloqueado');}
 finally{await admin.put('/api/admin/modelos-config',{roteamento:{ativo:true}});}
});

test('decisão bloqueada também é registrada; nada é enviado nem gravado como mensagem', async () => {
  const conv = await conversa();
  await ana.patch(`/api/conversas/${conv.id}`, { sigilosa: true });   // sem nenhum homologado nesta instalação
  const n = OR.chamadas.length;
  const r = await enviarMensagem(ana, conv.id, { texto: CONTRATO });
  assert.equal(r.status, 409);
  assert.equal(OR.chamadas.length, n);
  const rota = ultimaRota();
  assert.equal(rota.resultado, 'bloqueado');
  assert.equal(rota.modelo, null);
  assert.equal(rota.mensagem_id, null);
  assert.ok(rota.candidatos.every(c => c.motivos.includes('nao_homologado')));
  assert.equal(um(S.app.db, "select count(*) as n from mensagens where conversa_id = ? and papel = 'user'", conv.id).n, 0);
});

test('falha na análise do pedido: responde com a exigência padrão e a governança intacta', async () => {
  S.app.analisarPedido = () => { throw new Error('regex quebrada'); };
  try {
    const conv = await conversa();
    const r = await enviarMensagem(ana, conv.id, { texto: CONTRATO });
    assert.equal(r.status, 200);
    const rota = ultimaRota();
    assert.equal(rota.sinais.analiseFalhou, true);
    assert.deepEqual(rota.requisitos.determinantes, ['analise_indisponivel']);
    assert.equal(rota.classe_necessaria, 'equilibrado');
    assert.equal(OR.chamadas.at(-1).model, EQUILIBRADO);
  } finally { delete S.app.analisarPedido; }
});

test('reserva de execução: só vai ao fornecedor se passar pelas regras; o uso da reserva fica no registro', async () => {
  exec(S.app.db, 'update modelos set reserva = ? where id = ?', RAPIDO, AVANCADO);   // reserva de classe inferior
  let conv = await conversa();
  assert.equal((await enviarMensagem(ana, conv.id, { texto: CONTRATO })).status, 200);
  assert.ok(!OR.chamadas.at(-1).models, 'reserva inferior não é enviada');
  assert.equal(ultimaRota().reserva, 'descartada:reserva_de_classe_inferior');
  exec(S.app.db, "insert or replace into modelos (id, nome, fornecedor, liberado, perfil, preco_entrada, preco_saida, contexto) values ('x/avancado-2', 'Avançado 2', 'x', 1, 'avancado', 0.000003, 0.000015, 200000)");
  exec(S.app.db, 'update modelos set reserva = ? where id = ?', 'x/avancado-2', AVANCADO);
  await autorizarAdvancedFalso(S,admin,ana.pessoa,[AVANCADO,'x/avancado-2']);
  OR.falhar.add(AVANCADO);
  try {
    conv=await conversa();const n=OR.chamadas.length;
    const r=await enviarMensagem(ana,conv.id,{texto:CONTRATO});
    assert.equal(r.status,200);assert.ok(r.falha,'Advanced não delega troca ao fornecedor');
    assert.ok(OR.chamadas.slice(n).every(c=>!c.models&&c.model===AVANCADO));
  }finally{OR.falhar.delete(AVANCADO);exec(S.app.db,'update modelos set reserva=null where id=?',AVANCADO);exec(S.app.db,"delete from modelos where id='x/avancado-2'");}

});

test('Automático externo nunca recebe conteúdo, mesmo ligado em configuração antiga',async()=>{
 await admin.put('/api/admin/modelos-config',{automatico:true});
 try {const conv=await conversa(),n=OR.chamadas.length;
 const r=await enviarMensagem(ana,conv.id,{texto:'Olá',modelo:'openrouter/auto'});
 assert.equal(r.status,200);assert.ok(OR.chamadas.slice(n).every(c=>c.model!=='openrouter/auto'&&!c.models?.includes('openrouter/auto')));assert.equal(ultimaRota().modo,'automatico');
 }finally{await admin.put('/api/admin/modelos-config',{automatico:false});}
});

test('admin: Automático é o padrão; liga, desliga e muda a preferência; a preferência chega à decisão', async () => {
  const m = (await ana.get('/api/modelos')).dados;
  assert.equal(m.padrao, AUTOMATICO);
  assert.equal(m.opcoes[0].id, AUTOMATICO);
  assert.equal((await ana.put('/api/admin/modelos-config', { roteamento: { ativo: false } })).status, 403);
  assert.equal((await admin.put('/api/admin/modelos-config', { roteamento: { ativo: true, preferencia: 'qualidade' } })).status, 200);
  assert.deepEqual(lerConfig(S.app.db).roteamento, { ativo: true, preferencia: 'qualidade' });
  const conv = await conversa();
  assert.equal((await enviarMensagem(ana, conv.id, { texto: 'Compare estas duas propostas de fornecedores e aponte as diferenças.' })).status, 200);
  const rota = ultimaRota();
  assert.equal(rota.preferencia, 'qualidade');
  assert.equal(rota.classe_necessaria, 'equilibrado');
  assert.equal(rota.classe, 'avancado', 'Qualidade permite margem de capacidade quando já autorizada');
  assert.equal(rota.motivo_escolha, 'margem_de_capacidade');
  await admin.put('/api/admin/modelos-config', { roteamento: { ativo: true, preferencia: 'equilibrio' } });
  assert.equal((await ana.get('/api/admin/roteamento')).status, 403);
});

test('feedback "não serviu" vale só para a próxima mensagem; a tentativa fica ligada à anterior; latência registrada', async () => {
  const conv = await conversa();
  assert.equal((await enviarMensagem(ana, conv.id, { texto: 'Liste os itens do pedido.' })).status, 200);
  const primeira = ultimaRota();
  assert.ok(primeira.ms_total >= 0 && primeira.ms_primeiro_token >= 0 && primeira.ms_primeiro_token <= primeira.ms_total, 'latência: primeiro trecho e total');
  await ana.patch(`/api/conversas/${conv.id}`, { feedback: 'nao_serviu', motivo: 'Faltou o item Aurora' });
  assert.equal(um(S.app.db, 'select feedback from roteamento where id = ?', primeira.id).feedback, 'nao_serviu', 'o feedback fica na decisão da resposta');
  assert.ok(!JSON.stringify(um(S.app.db, 'select * from roteamento where id = ?', primeira.id)).includes('Aurora'), 'o motivo escrito não vai para o roteamento');
  // Próxima mensagem: conta como nova tentativa, ligada à anterior.
  assert.equal((await enviarMensagem(ana, conv.id, { texto: 'Liste de novo, por favor.' })).status, 200);
  const segunda = ultimaRota();
  assert.equal(segunda.requisitos.dimensoes.nova_tentativa, 2);
  assert.equal(segunda.sinais.insatisfacaoFonte, 'feedback');
  assert.equal(segunda.nova_tentativa_de, primeira.id);
  assert.equal(um(S.app.db, 'select refeito from roteamento where id = ?', primeira.id).refeito, 1);
  // Terceira mensagem, sem nova reclamação: o "não serviu" antigo não vale mais (não sobe para sempre).
  assert.equal((await enviarMensagem(ana, conv.id, { texto: 'Agora traduza a lista para o inglês.' })).status, 200);
  const terceira = ultimaRota();
  assert.equal(terceira.requisitos.dimensoes.nova_tentativa, undefined);
  assert.equal(terceira.classe_necessaria, 'rapido');
});
