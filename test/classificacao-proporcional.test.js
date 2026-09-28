// Classificação proporcional ao risco. A IA não bloqueia porque encontrou um dado pessoal: ela decide como
// tratar o conteúdo pelo risco, pelo contexto e pelas políticas da empresa.
//   1 conteúdo normal (nomes, cargos, email e telefone de trabalho, CNPJ) → regras gerais
//   2 dado pessoal (CPF, email pessoal, endereço...) → regras gerais por padrão; a empresa pode proteger ou bloquear
//   3 dado pessoal sensível → só com os guardrails
//   4 informação confidencial marcada → só com os guardrails; sem recurso autorizado, nada sai
//   5 credencial/segredo → bloqueio absoluto
// Espião no provedor: nenhuma chamada antes da decisão registrada, depois de um bloqueio, ou com conteúdo
// sigiloso fora de um recurso autorizado com rota fixada.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { subir } from './ajuda.js';
import { openRouterFalso, enviarMensagem } from './openrouter-falso.js';
import { arquivo, docx, pdf, xlsx } from './arquivos.js';
import { salvarConfig } from '../src/config.js';
import { exec, um } from '../src/db.js';
import { POLITICA_SIGILO } from '../src/sigilo.js';
import { MSG_USUARIO } from '../src/avisos-governanca.js';

const EQUILIBRADO = 'anthropic/claude-haiku-4.5', RAPIDO = 'google/gemini-3.5-flash-lite';
const ROTA = f => ({ fornecedor: f, endpoint: f, retencaoZero: true, semTreino: true });
const TECNICO = /open\s*router|anthropic|google\/|gemini|claude|haiku|mistral/i;   // nomes de provedor e modelo (as chaves vazias, como "fornecedor": null, não contam)
let S, OR, admin, ana, areaId;
const violacoes = [];

before(async () => {
  OR = await openRouterFalso();
  const ia = { ...OR.ia, configurada: true, listarModelos: (...a) => OR.ia.listarModelos(...a),
    async *enviar(mensagens, op) {
      const d = um(S.app.db, 'select * from roteamento order by id desc limit 1');
      if (!d) violacoes.push(`sem decisão: ${op.modelo}`);
      else if (d.resultado === 'bloqueado') violacoes.push(`depois de bloqueio: ${op.modelo}`);
      if (op.sigilosa && (!um(S.app.db, 'select homologado from modelos where id = ?', op.modelo)?.homologado || !op.fornecedor)) violacoes.push(`sigiloso fora do autorizado: ${op.modelo}`);
      yield* OR.ia.enviar(mensagens, op);
    } };
  S = await subir({ ia });
  salvarConfig(S.app.db, { dominios: ['exemplo.com.br'], [POLITICA_SIGILO]: true });
  admin = await S.cliente().entrar('admin@exemplo.com.br');
  ana = await S.cliente().entrar('ana@exemplo.com.br');
  areaId = Number(exec(S.app.db, "insert into areas (nome, sigilosa) values ('Comercial', 0)").lastInsertRowid);
  exec(S.app.db, 'insert into area_pessoas (area_id, pessoa_id) values (?, ?)', areaId, ana.pessoa.id);
});
after(async () => {
  await S.fechar(); await OR.fechar();
  assert.deepEqual(violacoes, [], 'nenhuma chamada ao provedor antes da decisão de elegibilidade');
});

function catalogo(rotas) {
  exec(S.app.db, 'update modelos set homologado = 0, homologacao = null, vetado_plataforma = 0, autorizacao_plataforma = null');
  for (const [id, r] of Object.entries(rotas)) exec(S.app.db, 'update modelos set liberado = 1, homologado = 1, homologacao = ? where id = ?', JSON.stringify(r), id);
}
const reforcada = v => exec(S.app.db, 'update areas set sigilosa = ? where id = ?', Number(v), areaId);
const nova = async (corpo = {}) => (await ana.post('/api/conversas', corpo)).dados.conversa;
async function enviar(texto, extra = {}, conv = null) {
  conv ??= await nova();
  const n = OR.chamadas.length;
  const r = await enviarMensagem(ana, conv.id, { texto, ...extra });
  const c = um(S.app.db, 'select sigilosa, motivo_sigilosa from conversas where id = ?', conv.id);
  return { r, conv, n: OR.chamadas.length - n, ultima: OR.chamadas.at(-1), sigilosa: c.sigilosa, motivo: c.motivo_sigilosa };
}
// Processou normalmente: resposta, uma chamada, conversa não sigilosa, nada técnico para quem usa.
function normal(x, msg) {
  assert.equal(x.r.status, 200, `${msg}: ${JSON.stringify(x.r.erro)}`);
  assert.ok(x.r.texto.length > 0, msg);
  assert.equal(x.n, 1, msg);
  assert.equal(x.sigilosa, 0, `${msg}: não vira sigilosa`);
  assert.doesNotMatch(JSON.stringify({ ...x.r.fim, rota: { ...x.r.fim.rota, explicacao: null } }), TECNICO, msg);
}
// Não saiu nada.
function bloqueado(x, status, msg) {
  assert.equal(x.r.status, status, `${msg}: ${JSON.stringify(x.r.erro || x.r.fim)}`);
  assert.equal(x.n, 0, `${msg}: nada enviado`);
  assert.doesNotMatch(x.r.erro.mensagem, TECNICO, msg);
}

// ------------------------------------------------------------------------------------ Conteúdo normal
test('1-6. conteúdo normal processa, em área normal e reforçada, mesmo sem recurso autorizado para sigilo', async () => {
  catalogo({});   // nenhum recurso autorizado para informação sigilosa
  const institucional = arquivo('institucional.pdf', pdf(Array.from({ length: 80 }, (_, i) => `${i + 1}. Apresentacao institucional: historia, missao, produtos, cobertura nacional e canais de atendimento.`)));
  for (const r of [false, true]) {
    reforcada(r);
    const onde = r ? 'área reforçada' : 'área normal';
    normal(await enviar('Resuma o processo de compras em três linhas.'), `1/2 texto normal, ${onde}`);
    normal(await enviar('Resuma este documento.', { anexos: [institucional] }), `3 PDF institucional, ${onde}`);
    normal(await enviar('João Silva, gerente comercial, ficou responsável por preparar a proposta até sexta-feira.'), `4 nome e cargo, ${onde}`);
    normal(await enviar('Encaminhe a proposta para joao.silva@apymine.com.br e maria@cliente-exemplo.com.br.'), `5 email corporativo, ${onde}`);
    normal(await enviar('Ligue para a central (11) 3456-7890, ramal 204, e peça o orçamento.'), `6 telefone corporativo, ${onde}`);
  }
  reforcada(false);
});

// ------------------------------------------------------------------------------------ Dados pessoais
test('7-9. dado pessoal não bloqueia nem torna a conversa sigilosa por si só, em mensagem, PDF ou área reforçada', async () => {
  catalogo({});
  normal(await enviar('João Silva (joao.silva@gmail.com) confirmou presença na reunião de sexta.'), '7 nome + email pessoal');
  const cadastro = arquivo('cadastro.pdf', pdf(['Cadastro do cliente', 'Nome: Maria Souza', 'CPF 529.982.247-25', 'Email: maria.souza@hotmail.com', 'Telefone: (11) 98765-4321', 'Rua das Flores, 123 - CEP 01310-100']));
  normal(await enviar('Monte um resumo do cadastro.', { anexos: [cadastro] }), '8 dados pessoais em PDF');
  reforcada(true);
  const x = await enviar('Monte um resumo do cadastro.', { anexos: [cadastro] });
  normal(x, '9 dados pessoais em área reforçada');
  assert.ok(!/:free$/.test(x.ultima.model) && x.ultima.provider?.data_collection === 'deny', '9: com a proteção da área (recurso compatível, sem treino)');
  reforcada(false);
  // A decisão fica registrada pelo tipo, nunca pelo valor.
  const ev = um(S.app.db, "select detalhes from eventos where tipo = 'conversation.completed' order by id desc limit 1").detalhes;
  assert.match(ev, /"tipos":\["cpf","email","telefone","cep","endereco"\]/);
  assert.doesNotMatch(ev, /529\.982|maria\.souza/);
});

// ------------------------------------------------------------------------------------ Sensível e confidencial
test('10-13. dado sensível e informação confidencial: só com guardrails; sem recurso autorizado ou com a opção desligada, nada sai', async () => {
  catalogo({ [EQUILIBRADO]: ROTA('Anthropic') });
  let x = await enviar('Organize o laudo médico do colaborador por data.');
  assert.equal(x.r.status, 200);
  assert.deepEqual([x.sigilosa, x.motivo], [1, 'dado:sensivel'], '10 dado sensível → guardrails');
  assert.deepEqual([x.ultima.model, x.ultima.provider.only?.[0]], [EQUILIBRADO, 'Anthropic']);
  x = await enviar('Resuma o relatório CONFIDENCIAL da diretoria sobre a aquisição.');
  assert.equal(x.r.status, 200, '11 confidencial + recurso autorizado → processa');
  assert.deepEqual([x.sigilosa, x.motivo, x.ultima.model], [1, 'dado:confidencial', EQUILIBRADO]);
  catalogo({});
  x = await enviar('Resuma o relatório CONFIDENCIAL da diretoria sobre a aquisição.');
  bloqueado(x, 409, '12 confidencial + nenhum recurso autorizado');
  assert.equal(x.r.erro.mensagem, MSG_USUARIO.sigilo);
  salvarConfig(S.app.db, { [POLITICA_SIGILO]: false });
  catalogo({ [EQUILIBRADO]: ROTA('Anthropic') });
  x = await enviar('Resuma o relatório CONFIDENCIAL da diretoria sobre a aquisição.');
  bloqueado(x, 409, '13 confidencial + opção desligada');
  assert.equal(x.r.erro.mensagem, MSG_USUARIO.sigilo_desligado);
  salvarConfig(S.app.db, { [POLITICA_SIGILO]: true });
});

// ------------------------------------------------------------------------------------ Segredos
test('14-17. credenciais e segredos: bloqueio absoluto, em mensagem e em PDF, com qualquer configuração', async () => {
  catalogo({ [EQUILIBRADO]: ROTA('Anthropic') });
  salvarConfig(S.app.db, { acoesChat: { credencial: 'permitir' } });   // tentativa de liberar: ignorada
  reforcada(true);
  bloqueado(await enviar('Use a api_key = sk-abcdefghijklmnopqrstuvwxyz123456 no sistema.'), 422, '14 API key');
  bloqueado(await enviar('O acesso é senha: Primavera2026'), 422, '15 senha');
  bloqueado(await enviar('Authorization: Bearer abcdefghijklmnopqrstuvwxyz0123456789'), 422, '16 token');
  bloqueado(await enviar('Veja o arquivo.', { anexos: [arquivo('config.pdf', pdf(['token=ghp_abcdefghijklmnopqrstuvwxyz12']))] }), 422, '17 segredo em PDF');
  reforcada(false);
});

// ------------------------------------------------------------------------------------ Fallback e caminhos
test('18-22. sem recurso elegível, créditos no fim, nova tentativa, API e anexos: a mesma governança, nunca recurso não autorizado', async () => {
  // 18: nenhum recurso liberado → nada sai.
  const liberados = um(S.app.db, 'select group_concat(id) ids from modelos where liberado = 1').ids.split(',');
  exec(S.app.db, 'update modelos set liberado = 0');
  try { bloqueado(await enviar('Resuma o processo de compras.'), 503, '18 nenhum recurso elegível'); }
  finally { for (const id of liberados) exec(S.app.db, 'update modelos set liberado = 1 where id = ?', id); }
  catalogo({ [EQUILIBRADO]: ROTA('Anthropic') });
  // 21: pedir um recurso não autorizado pela API é só preferência.
  let x = await enviar('Resuma o relatório CONFIDENCIAL da diretoria.', { modelo: RAPIDO });
  assert.deepEqual([x.r.status, x.ultima.model], [200, EQUILIBRADO], '21 API');
  // 20: nova tentativa na mesma conversa passa por tudo de novo.
  await ana.patch(`/api/conversas/${x.conv.id}`, { feedback: 'nao_serviu' });
  const y = await enviar('Tente de novo, com mais detalhe.', { modelo: RAPIDO }, x.conv);
  assert.deepEqual([y.r.status, y.ultima.model, y.ultima.provider.only?.[0]], [200, EQUILIBRADO, 'Anthropic'], '20 nova tentativa');
  // 22: anexo confidencial segue a mesma regra da mensagem; segredo em planilha bloqueia.
  x = await enviar('Resuma o anexo.', { anexos: [arquivo('memo.docx', docx(['CONFIDENCIAL', 'Plano de aquisição do concorrente']))] });
  assert.deepEqual([x.sigilosa, x.motivo, x.ultima.model], [1, 'dado:confidencial', EQUILIBRADO], '22 anexo confidencial');
  bloqueado(await enviar('Resuma a planilha.', { anexos: [arquivo('acessos.xlsx', xlsx([['sistema', 'acesso'], ['erp', 'senha: Primavera2026']]))] }), 422, '22 segredo em planilha');
  // 19: créditos no fim: a reserva do plano (só Rápido) não usa recurso não autorizado para continuar.
  const OR2 = await openRouterFalso({ custo: 0.04 });
  const S2 = await subir({ ia: OR2.ia, plano: { creditos: 1, reserva: 100, precoUsd: 100 } });
  try {
    salvarConfig(S2.app.db, { [POLITICA_SIGILO]: true });
    const adm = await S2.cliente().entrar('admin@exemplo.com.br');
    const c = async () => (await adm.post('/api/conversas', {})).dados.conversa;
    assert.equal((await enviarMensagem(adm, (await c()).id, { texto: 'Olá' })).status, 200);
    exec(S2.app.db, 'update modelos set homologado = 0, homologacao = null');
    exec(S2.app.db, 'update modelos set homologado = 1, homologacao = ? where id = ?', JSON.stringify(ROTA('Anthropic')), EQUILIBRADO);
    const n = OR2.chamadas.length;
    assert.equal((await enviarMensagem(adm, (await c()).id, { texto: 'Resuma o relatório CONFIDENCIAL.' })).status, 409);
    assert.equal(OR2.chamadas.length, n, '19 créditos no fim: nada vai ao não autorizado');
    // Conteúdo com dado pessoal comum continua atendido na reserva.
    assert.equal((await enviarMensagem(adm, (await c()).id, { texto: 'João Silva (joao@gmail.com) ficou com a proposta.' })).status, 200);
  } finally { await S2.fechar(); await OR2.fechar(); }
});

// ------------------------------------------------------------------------------------ Histórico
test('23-25. histórico: processado fica com mensagem, anexo e resposta; bloqueado registra a tentativa sem conteúdo e sem marcar a conversa', async () => {
  catalogo({});
  const conv = await nova();
  const doc = arquivo('ata.pdf', pdf(['Ata da reuniao comercial', 'Decisao: lancar o plano anual em novembro']));
  normal(await enviar('Resuma a ata.', { anexos: [doc] }, conv), '23');
  let d = (await ana.get(`/api/conversas/${conv.id}`)).dados;   // "recarregar"
  assert.deepEqual(d.mensagens.map(m => m.papel), ['user', 'assistant']);
  assert.deepEqual(d.mensagens[0].anexos, ['ata.pdf']);
  const x = await enviar('Resuma o relatório CONFIDENCIAL da diretoria.', { anexos: [arquivo('memo.pdf', pdf(['CONFIDENCIAL', 'Aquisição']))] }, conv);
  bloqueado(x, 409, '24');
  d = (await ana.get(`/api/conversas/${conv.id}`)).dados;
  assert.deepEqual(d.mensagens.map(m => m.papel), ['user', 'assistant', 'aviso'], '24 a tentativa aparece');
  assert.doesNotMatch(JSON.stringify(d.mensagens.slice(2)), /diretoria|Aquisi/);
  assert.equal(um(S.app.db, 'select count(*) n from anexos where conversa_id = ?', conv.id).n, 1, '24 anexo bloqueado não é guardado');
  assert.equal(d.conversa.sigilosa, false, '25 bloqueio não torna a conversa sigilosa');
});

// ------------------------------------------------------------------------------------ Quick win comercial
test('quick win "reunião → plano de ação": transcrição com nomes, cargos e emails corporativos, em área reforçada, sem recurso autorizado para sigilo', async () => {
  catalogo({});
  reforcada(true);
  const q = (await admin.post('/api/quick-wins', { nome: 'Reunião → Plano de ação', areas: [areaId] })).dados;
  assert.equal((await admin.put(`/api/quick-wins/${q.id}`, { status: 'em_uso', formato: 'tabela',
    instrucoes: 'Transforme a reunião num plano de ação: decisões, tarefas, responsáveis e prazos. Não invente informações.' })).status, 200);
  const conv = await nova({ quick_win_id: q.id });
  const transcricao = [
    'Reunião comercial — 28/09',
    'Participantes: Carla Mendes (gerente de marketing, carla.mendes@apymine.com.br), Bruno Alves (diretor comercial, bruno.alves@apymine.com.br),',
    'Diego Rocha (coordenador de operações, diego.rocha@apymine.com.br) e Ana Lima (analista financeira, ana.lima@apymine.com.br).',
    'Carla: a campanha precisa estar pronta até 15/10. Eu fico com as peças.',
    'Bruno: preciso da tabela de preços final para treinar o time. Ana fecha a tabela até 03/10.',
    'Diego: o estoque inicial chega dia 10/10; o fornecedor da embalagem ainda não foi escolhido.',
    'Decisão: o lançamento será online, sem evento presencial.',
  ].join('\n');
  const x = await enviar(`Analise a transcrição desta reunião e transforme-a em um plano de ação com decisões, tarefas, responsáveis e prazos. Não invente informações.\n\n${transcricao}`, {}, conv);
  normal(x, 'quick win comercial');
  const d = (await ana.get(`/api/conversas/${conv.id}`)).dados;
  assert.deepEqual(d.mensagens.map(m => m.papel), ['user', 'assistant'], 'histórico preservado');
  assert.match(d.mensagens[0].texto, /carla\.mendes@apymine\.com\.br/, 'nada precisou ser tirado do texto');
  assert.equal(d.conversa.sigilosa, false);
  const semTexto = JSON.stringify({ ...d, mensagens: d.mensagens.map(({ texto, ...m }) => m) });
  assert.doesNotMatch(semTexto, TECNICO, 'nenhum provedor ou modelo para quem usa');
  reforcada(false);
});

test('empresas que já existiam: regras antigas viram as proporcionais; o "bloquear" escolhido pela empresa continua valendo', async () => {
  const { lerConfig, acoesDoQuickWin } = await import('../src/config.js');
  // Formato antigo: sem acoesVersao, "permitir" queria dizer "processar com proteção".
  exec(S.app.db, "delete from config where chave in ('acoesChat', 'acoesVersao')");
  exec(S.app.db, "insert into config (chave, valor) values ('acoesChat', ?)", JSON.stringify({ cpf: 'bloquear', cnpj: 'permitir', email: 'permitir', banco: 'permitir', credencial: 'permitir' }));
  const a = lerConfig(S.app.db).acoesChat;
  assert.deepEqual([a.cpf, a.cnpj, a.email, a.banco, a.sensivel, a.confidencial, a.credencial], ['bloquear', 'permitir', 'permitir', 'proteger', 'proteger', 'proteger', 'bloquear']);
  // Quick win com regras no formato antigo: a mesma conversão; no formato atual (_v 2), vale o que está gravado.
  assert.equal(acoesDoQuickWin(JSON.stringify({ email: 'permitir', cpf: 'bloquear' }), lerConfig(S.app.db)).email, 'permitir');
  assert.equal(acoesDoQuickWin(JSON.stringify({ email: 'proteger', _v: 2 }), lerConfig(S.app.db)).email, 'proteger');
  // Salvar pela tela grava o formato atual.
  assert.equal((await admin.put('/api/admin/config', { acoesChat: { ...a, email: 'proteger', cpf: 'talvez' } })).status, 200);
  const b = lerConfig(S.app.db).acoesChat;
  assert.deepEqual([b.email, b.cpf, b.credencial], ['proteger', 'bloquear', 'bloquear'], 'valor desconhecido vale bloquear (fail closed)');
  salvarConfig(S.app.db, { acoesChat: {} });   // volta ao padrão para os demais testes
});
