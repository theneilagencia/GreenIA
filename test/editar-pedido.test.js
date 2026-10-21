import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { subir } from './ajuda.js';
import { openRouterFalso, enviarMensagem } from './openrouter-falso.js';
import { exec, todos, um } from '../src/db.js';
import { salvarConfig } from '../src/config.js';
import { pptx, MIMES } from '../src/escritorio.js';
let S, OR, ana, outra, conv, alvo;
before(async () => {
  OR = await openRouterFalso({ responder: () => 'Resposta completa ao pedido atual.' });
  S = await subir({ ia: OR.ia });
  salvarConfig(S.app.db, { dominios: ['exemplo.com.br'] });
  ana = await S.cliente().entrar('ana@exemplo.com.br');
  outra = await S.cliente().entrar('outra@exemplo.com.br');
  conv = (await ana.post('/api/conversas', {})).dados.conversa;
  for (const [papel, texto] of [['user','CONTEXTO_ANTES'],['assistant','RESPOSTA_ANTES'],['user','PEDIDO_ANTIGO'],['assistant','RESPOSTA_ANTIGA'],['user','FUTURO_NAO_USAR']]) {
    const id = Number(exec(S.app.db, 'insert into mensagens (conversa_id,papel,texto,criado_em) values (?,?,?,?)', conv.id,papel,texto,new Date().toISOString()).lastInsertRowid);
    if (texto === 'PEDIDO_ANTIGO') alvo = id;
  }
  const a = Number(exec(S.app.db, 'insert into anexos (conversa_id,mensagem_id,nome,texto,papel) values (?,?,?,?,?)', conv.id,alvo,'origem.pptx','MATERIAL_ORIGINAL','conteudo').lastInsertRowid);
  exec(S.app.db, 'insert into anexos_arquivos (anexo_id,mime,dados) values (?,?,?)', a,MIMES.pptx,pptx('# Material original\n\nConteúdo completo'));
});
after(async () => { await S?.fechar(); await OR?.fechar(); });
test('edição preserva original, anexo nativo e contexto anterior, sem usar respostas futuras', async () => {
  const original = todos(S.app.db,'select * from mensagens where conversa_id = ?',conv.id);
  const n = OR.chamadas.length;
  const r = await ana.post(`/api/conversas/${conv.id}/mensagens/${alvo}/editar`, {});
  assert.equal(r.status,200,JSON.stringify(r.dados));
  const nova = r.dados.conversa.id;
  assert.notEqual(nova,conv.id);
  assert.equal(OR.chamadas.length,n,'criar versão não chama IA');
  assert.deepEqual(todos(S.app.db,'select * from mensagens where conversa_id = ?',conv.id),original);
  const msgs = todos(S.app.db,'select texto from mensagens where conversa_id = ? order by id',nova).map(x=>x.texto);
  assert.deepEqual(msgs,['CONTEXTO_ANTES','RESPOSTA_ANTES','Material anexado ao pedido editado.']);
  assert.ok(um(S.app.db,'select f.dados from anexos_arquivos f join anexos a on a.id=f.anexo_id where a.conversa_id=?',nova).dados.length);
  const envio = await enviarMensagem(ana,nova,{texto:'PEDIDO_EDITADO: responda em duas frases.'});
  assert.ok(envio.fim,JSON.stringify(envio));
  const chamadas = JSON.stringify(OR.chamadas.slice(n));
  assert.match(chamadas,/CONTEXTO_ANTES/); assert.match(chamadas,/MATERIAL_ORIGINAL/); assert.match(chamadas,/PEDIDO_EDITADO/);
  assert.doesNotMatch(chamadas,/PEDIDO_ANTIGO|RESPOSTA_ANTIGA|FUTURO_NAO_USAR/);
});
test('edição respeita dono, tipo da mensagem e retenção', async () => {
  const rota = `/api/conversas/${conv.id}/mensagens/${alvo}/editar`;
  assert.equal((await outra.post(rota,{})).status,404);
  assert.equal((await ana.post(`/api/conversas/${conv.id}/mensagens/${alvo+1}/editar`,{})).status,404);
  exec(S.app.db,'update mensagens set texto=? where id=?','[Conteúdo processado e não guardado, pela política de retenção da empresa.]',alvo);
  assert.equal((await ana.post(rota,{})).status,409);
});
