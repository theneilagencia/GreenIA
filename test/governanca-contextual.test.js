// Governança contextual: "como processar este conteúdo com segurança?", e não "como impedir".
// Detectar um dado determina os controles; não significa bloquear. Hard block só para credenciais e segredos.
//   conteúdo exige um nível de proteção (1 comum · 2 dado pessoal / área reforçada · 3 sigiloso)
//   recurso oferece um nível, calculado da rota real (1 qualquer · 2 fornecedor fixo, sem treino · 3 guardrails)
//   só é elegível o recurso que atende ao nível exigido; sem nenhum, nada sai (nunca um recurso incompatível)
// Retenção é separada do processamento: um tipo pode ser processado e não ficar guardado.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { subir } from './ajuda.js';
import { openRouterFalso, enviarMensagem } from './openrouter-falso.js';
import { arquivo, pdf, pptx } from './arquivos.js';
import { lerConfig, salvarConfig } from '../src/config.js';
import { exec, um, todos } from '../src/db.js';
import { POLITICA_SIGILO, protecaoDoRecurso, capacidadesDeDados } from '../src/sigilo.js';
import { lerModelos } from '../src/modelos.js';
import { MSG_USUARIO } from '../src/avisos-governanca.js';

const EQUILIBRADO = 'anthropic/claude-haiku-4.5', RAPIDO = 'google/gemini-3.5-flash-lite';
const GRATUITO = 'meta-llama/llama-3.3-70b-instruct:free';
const ROTA = f => ({ fornecedor: f, endpoint: f, retencaoZero: true, semTreino: true });
const TECNICO = /open\s*router|anthropic|google\/|gemini|claude|haiku|mistral/i;
let S, OR, admin, ana, areaId;
const violacoes = [];

before(async () => {
  OR = await openRouterFalso();
  const ia = { ...OR.ia, configurada: true, listarModelos: (...a) => OR.ia.listarModelos(...a),
    async *enviar(mensagens, op) {
      const d = um(S.app.db, 'select * from roteamento order by id desc limit 1');
      if (!d || d.resultado === 'bloqueado') violacoes.push(`chamada fora de ordem: ${op.modelo}`);
      const m = lerModelos(S.app.db).find(x => x.id === op.modelo);
      if (!m?.liberado) violacoes.push(`recurso não liberado: ${op.modelo}`);
      if (op.sigilosa && (!m?.homologado || !op.fornecedor)) violacoes.push(`sigiloso fora do autorizado: ${op.modelo}`);
      yield* OR.ia.enviar(mensagens, op);
    } };
  S = await subir({ ia });
  salvarConfig(S.app.db, { dominios: ['exemplo.com.br'], exigirSemTreino: false, [POLITICA_SIGILO]: true });
  admin = await S.cliente().entrar('admin@exemplo.com.br');
  ana = await S.cliente().entrar('ana@exemplo.com.br');
  exec(S.app.db, "insert or ignore into modelos (id, nome, fornecedor, contexto) values (?, 'Gratuito', 'meta', 128000)", GRATUITO);
  exec(S.app.db, "update modelos set liberado = 1, perfil = 'rapido', preco_entrada = 0, preco_saida = 0 where id = ?", GRATUITO);
  areaId = Number(exec(S.app.db, "insert into areas (nome, sigilosa) values ('Comercial', 1)").lastInsertRowid);   // proteção reforçada
  exec(S.app.db, 'insert into area_pessoas (area_id, pessoa_id) values (?, ?)', areaId, ana.pessoa.id);
});
after(async () => { await S.fechar(); await OR.fechar(); assert.deepEqual(violacoes, []); });

function catalogo(rotas) {
  exec(S.app.db, 'update modelos set homologado = 0, homologacao = null, vetado_plataforma = 0, autorizacao_plataforma = null');
  for (const [id, r] of Object.entries(rotas)) exec(S.app.db, 'update modelos set liberado = 1, homologado = 1, homologacao = ? where id = ?', JSON.stringify(r), id);
}
const reforcada = v => exec(S.app.db, 'update areas set sigilosa = ? where id = ?', Number(v), areaId);
const nova = async () => (await ana.post('/api/conversas', {})).dados.conversa;
async function enviar(texto, extra = {}, conv = null) {
  conv ??= await nova();
  const n = OR.chamadas.length;
  const r = await enviarMensagem(ana, conv.id, { texto, ...extra });
  return { r, conv, n: OR.chamadas.length - n, ultima: OR.chamadas.at(-1), sigilosa: um(S.app.db, 'select sigilosa from conversas where id = ?', conv.id).sigilosa,
    rota: um(S.app.db, 'select * from roteamento where conversa_id = ? order by id desc limit 1', conv.id) };
}
function processa(x, msg) {
  assert.equal(x.r.status, 200, `${msg}: ${JSON.stringify(x.r.erro)}`);
  assert.equal(x.n, 1, msg);
  assert.ok(x.r.texto.length > 0, msg);
  assert.equal(x.sigilosa, 0, `${msg}: continua normal`);
  assert.doesNotMatch(JSON.stringify({ ...x.r.fim, rota: { ...x.r.fim.rota, explicacao: null } }), TECNICO, msg);
}

test('recursos: nível de proteção calculado dos atributos da rota real, não de uma chave binária', () => {
  catalogo({ [EQUILIBRADO]: ROTA('Anthropic') });
  const cfg = lerConfig(S.app.db);
  const m = id => lerModelos(S.app.db).find(x => x.id === id);
  assert.equal(protecaoDoRecurso(m(GRATUITO), cfg), 1, 'gratuito: só conteúdo comum');
  assert.equal(protecaoDoRecurso(m(RAPIDO), cfg), 2, 'fornecedor fixo: também dado pessoal');
  assert.equal(protecaoDoRecurso(m(EQUILIBRADO), cfg), 3, 'guardrails atendidos: também sensível e confidencial');
  assert.deepEqual([capacidadesDeDados(m(RAPIDO), cfg).dadosPessoais, capacidadesDeDados(m(RAPIDO), cfg).confidenciais], [true, false]);
  assert.equal(capacidadesDeDados(m(EQUILIBRADO), cfg).retencaoZero, 'comprovada');
  assert.equal(protecaoDoRecurso({ ...m(RAPIDO), liberado: false }, cfg), 0, 'não liberado: nada');
});

test('dados pessoais e identificadores: processam com os controles proporcionais, sem bloqueio nem conversa sigilosa', async () => {
  catalogo({});   // nenhum recurso autorizado para informação sigilosa
  reforcada(false);
  for (const [texto, msg] of [
    ['João Silva ficou responsável por preparar a proposta para o cliente até sexta-feira.', 'nome'],
    ['A gerente comercial conduz a negociação com o fornecedor.', 'cargo'],
    ['Envie o resumo para joao.silva@gmail.com e para a equipe@apymine.com.br.', 'email'],
    ['O contato do fornecedor é (11) 98765-4321.', 'telefone'],
    ['Confira o cadastro do CPF 529.982.247-25 antes de emitir a nota.', 'CPF'],
    ['O fornecedor é a Exemplo Ltda, CNPJ 11.222.333/0001-81.', 'CNPJ'],
  ]) {
    const x = await enviar(texto);
    processa(x, msg);
    if (msg !== 'nome' && msg !== 'cargo' && msg !== 'CNPJ') {
      assert.notEqual(x.ultima.model, GRATUITO, `${msg}: dado pessoal só em recurso com proteção de dados`);
      assert.equal(x.ultima.provider?.data_collection, 'deny', `${msg}: pedido sem treino`);
      assert.ok(JSON.parse(x.rota.politicas).includes('dados_pessoais_protegidos'), msg);
    }
  }
  // A classificação fica registrada pelo tipo, nunca pelo valor.
  const ev = todos(S.app.db, "select detalhes from eventos where tipo = 'conversation.completed' order by id desc limit 6").map(e => e.detalhes).join('|');
  assert.match(ev, /"tipos":\["cpf"\]/);
  assert.match(ev, /"tipos":\["cnpj"\]/);
  assert.doesNotMatch(ev, /529\.982|11\.222\.333/);
});

test('a política da empresa é a autoridade: sem a proteção de dados pessoais, vale o recurso que ela liberou', async () => {
  salvarConfig(S.app.db, { protecaoDadosPessoais: false });
  try {
    const x = await enviar('Resuma o cadastro do CPF 529.982.247-25.', { modelo: GRATUITO });
    processa(x, 'política desligada');
    assert.equal(x.ultima.model, GRATUITO, 'a empresa decidiu que dado pessoal segue as regras gerais');
  } finally { salvarConfig(S.app.db, { protecaoDadosPessoais: true }); }
  // Com a proteção (padrão), o mesmo pedido pelo gratuito é só preferência: vai a um recurso compatível.
  const y = await enviar('Resuma o cadastro do CPF 529.982.247-25.', { modelo: GRATUITO });
  assert.equal(y.r.status, 200);
  assert.notEqual(y.ultima.model, GRATUITO);
});

test('documentos e contexto: PDF, PPTX, reunião, RH sem conteúdo sensível, contrato e relatório processam, também em área reforçada', async () => {
  catalogo({});
  reforcada(true);
  const docs = [
    ['PDF com nome', arquivo('ata.pdf', pdf(['Ata: Carla Mendes conduziu a reuniao e Bruno Alves apresentou os numeros.']))],
    ['PDF com email', arquivo('contatos.pdf', pdf(['Contato comercial: carla.mendes@apymine.com.br', 'Contato pessoal: bruno@gmail.com']))],
    ['PDF com vários dados pessoais', arquivo('cadastro.pdf', pdf(['Maria Souza, CPF 529.982.247-25', 'maria@hotmail.com, (11) 98765-4321', 'Rua das Flores, 123, CEP 01310-100']))],
    ['PPTX da apresentação', arquivo('apresentacao.pptx', pptx([['Plano comercial 2027', 'Meta: crescer 20%'], ['Responsáveis: Carla e Bruno', 'Prazo: 15/10']]))],
    ['documento de RH sem conteúdo sensível', arquivo('rh.pdf', pdf(['Plano de ferias da equipe comercial', 'Contratacao de dois analistas em novembro', 'Onboarding dos novos colaboradores com o gerente da area', 'Calendario de avaliacao anual e treinamentos']))],
    ['contrato', arquivo('contrato.pdf', pdf(['Contrato de prestacao de servicos', 'Contratante: Exemplo Ltda, CNPJ 11.222.333/0001-81', 'Vigencia de 12 meses, reajuste anual pelo IPCA', 'Rescisao com aviso previo de 30 dias']))],
    ['relatório interno', arquivo('relatorio.pdf', pdf(['Relatorio interno de vendas do trimestre', 'Receita cresceu 12%, com destaque para a regiao Sul', 'Proximos passos: revisar precos e ampliar o time']))],
  ];
  for (const [msg, doc] of docs) processa(await enviar('Analise este documento e resuma os pontos principais.', { anexos: [doc] }), msg);
  // Pedido que envolve pessoas não é bloqueado por envolver pessoas, nem por termos de RH.
  processa(await enviar('Organize as tarefas mencionadas na reunião entre os membros da equipe: o gerente cuida da contratação, o RH das férias e da avaliação dos funcionários, e o colaborador novo do onboarding.'), 'termos de RH');
  reforcada(false);
});

test('conteúdo sensível e confidencial: controles adicionais; sem recurso compatível, não envia e explica em linguagem simples', async () => {
  catalogo({ [EQUILIBRADO]: ROTA('Anthropic') });
  let x = await enviar('Organize o laudo médico do colaborador por data.');
  assert.deepEqual([x.r.status, x.sigilosa, x.ultima.model, x.ultima.provider.only?.[0]], [200, 1, EQUILIBRADO, 'Anthropic'], 'sensível → guardrails');
  x = await enviar('Resuma o relatório CONFIDENCIAL da diretoria.');
  assert.deepEqual([x.r.status, x.sigilosa, x.ultima.model], [200, 1, EQUILIBRADO], 'confidencial → requisitos adicionais');
  catalogo({});
  x = await enviar('Resuma o relatório CONFIDENCIAL da diretoria.');
  assert.deepEqual([x.r.status, x.n, x.sigilosa], [409, 0, 0], 'nenhum recurso compatível → não envia, sem marcar a conversa');
  assert.equal(x.r.erro.mensagem, 'Esta informação não pode ser processada com os recursos atualmente disponíveis para esta área. Nenhum conteúdo foi enviado. O administrador foi informado.');
  assert.equal(MSG_USUARIO.sigilo, x.r.erro.mensagem);
  assert.doesNotMatch(x.r.erro.mensagem, /remova|retire|tire|evite|não coloque|anonimi/i, 'nunca ensina a limpar o texto');
});

test('segredos: senha, API key, token e segredo em PDF ou PPTX são bloqueados sempre', async () => {
  catalogo({ [EQUILIBRADO]: ROTA('Anthropic') });
  for (const [texto, extra] of [
    ['senha: Primavera2026', {}], ['api_key = sk-abcdefghijklmnopqrstuvwxyz123456', {}], ['Authorization: Bearer abcdefghijklmnopqrstuvwxyz0123456789', {}],
    ['Veja o arquivo.', { anexos: [arquivo('acesso.pdf', pdf(['token=ghp_abcdefghijklmnopqrstuvwxyz12']))] }],
    ['Veja a apresentação.', { anexos: [arquivo('acesso.pptx', pptx([['Servidor de produção', 'password: Casa@12345']]))] }],
  ]) {
    const x = await enviar(texto, extra);
    assert.deepEqual([x.r.status, x.n], [422, 0], texto);
    assert.doesNotMatch(x.r.erro.mensagem, /tire o dado|remova/i);
  }
});

test('fallback: nunca um recurso incompatível ou não autorizado; sem compatível, nada sai; nova tentativa e API repetem a avaliação', async () => {
  catalogo({});
  // Só o gratuito liberado: conteúdo comum segue nele; dado pessoal não (incompatível), e nada é enviado.
  const antes = um(S.app.db, 'select group_concat(id) ids from modelos where liberado = 1 and id <> ?', GRATUITO).ids.split(',');
  exec(S.app.db, 'update modelos set liberado = 0 where id <> ?', GRATUITO);
  try {
    const comum = await enviar('Resuma o processo de compras.');
    assert.deepEqual([comum.r.status, comum.ultima.model], [200, GRATUITO]);
    const pessoal = await enviar('Resuma o cadastro do CPF 529.982.247-25.');
    assert.deepEqual([pessoal.r.status, pessoal.n, pessoal.sigilosa], [503, 0, 0], 'sem recurso compatível: não envia');
    assert.doesNotMatch(pessoal.r.erro.mensagem, TECNICO);
  } finally { for (const id of antes) exec(S.app.db, 'update modelos set liberado = 1 where id = ?', id); }
  // O recurso compatível cai: a reserva configurada só entra se também for compatível.
  await admin.put(`/api/admin/modelos/${encodeURIComponent(RAPIDO)}`, { reserva: GRATUITO });
  OR.falhar.add(RAPIDO);
  try {
    const x = await enviar('Resuma o cadastro do CPF 529.982.247-25.', { modelo: 'classe:rapido' });
    assert.ok(OR.chamadas.slice(-x.n).every(c => ![c.model, ...(c.models || [])].includes(GRATUITO)), 'a reserva incompatível não recebe o dado pessoal');
  } finally { OR.falhar.clear(); await admin.put(`/api/admin/modelos/${encodeURIComponent(RAPIDO)}`, { reserva: null }); }
  // Nova tentativa e API: a mesma avaliação.
  catalogo({ [EQUILIBRADO]: ROTA('Anthropic') });
  const a = await enviar('Resuma o relatório CONFIDENCIAL.', { modelo: GRATUITO });
  await ana.patch(`/api/conversas/${a.conv.id}`, { feedback: 'nao_serviu' });
  const b = await enviar('Tente de novo.', { modelo: 'openrouter/auto' }, a.conv);
  for (const y of [a, b]) assert.deepEqual([y.r.status, y.ultima.model, y.ultima.provider.only?.[0]], [200, EQUILIBRADO, 'Anthropic']);
});

test('retenção separada do processamento: guardar, processar sem guardar e bloqueio sem guardar', async () => {
  catalogo({});
  // Processamento e retenção permitidos: mensagem, anexo e resposta ficam no histórico.
  const guardada = await enviar('Resuma o cadastro.', { anexos: [arquivo('cadastro.pdf', pdf(['Maria Souza, CPF 529.982.247-25']))] });
  processa(guardada, 'guarda');
  let d = (await ana.get(`/api/conversas/${guardada.conv.id}`)).dados;
  assert.deepEqual(d.mensagens.map(m => m.papel), ['user', 'assistant']);
  assert.match(d.mensagens[0].texto, /Resuma o cadastro/);
  assert.equal(um(S.app.db, 'select texto from anexos where conversa_id = ?', guardada.conv.id).texto.includes('529.982.247-25'), true);
  // A empresa não guarda CPF: processa normalmente (a pessoa recebe a resposta), mas nada do conteúdo fica.
  assert.equal((await admin.put('/api/admin/config', { naoArmazenar: ['cpf'] })).status, 200);
  try {
    const x = await enviar('Resuma o cadastro de Maria Souza.', { anexos: [arquivo('cadastro.pdf', pdf(['Maria Souza, CPF 529.982.247-25']))] });
    processa(x, 'processa sem guardar');
    d = (await ana.get(`/api/conversas/${x.conv.id}`)).dados;
    const guardado = JSON.stringify(d) + JSON.stringify(todos(S.app.db, 'select * from anexos where conversa_id = ?', x.conv.id)) + JSON.stringify(todos(S.app.db, 'select * from mensagens where conversa_id = ?', x.conv.id));
    assert.doesNotMatch(guardado, /Maria Souza|529\.982|cadastro\.pdf/, 'nem mensagem, nem anexo, nem resposta, nem título');
    assert.match(guardado, /não ficam guardados no histórico/);
    assert.equal(d.conversa.titulo, 'Conversa');
    // Mensagem seguinte, sem o tipo: volta a ser guardada.
    await enviar('Obrigado, agora liste os próximos passos.', {}, x.conv);
    assert.match(JSON.stringify((await ana.get(`/api/conversas/${x.conv.id}`)).dados), /liste os próximos passos/);
  } finally { await admin.put('/api/admin/config', { naoArmazenar: [] }); }
  // Bloqueio: não guarda o conteúdo proibido nem o anexo.
  const b = await enviar('Veja o arquivo.', { anexos: [arquivo('acesso.pdf', pdf(['senha: Primavera2026']))] });
  assert.equal(b.r.status, 422);
  assert.equal(um(S.app.db, 'select count(*) n from anexos where conversa_id = ?', b.conv.id).n, 0);
  assert.doesNotMatch(JSON.stringify(todos(S.app.db, 'select texto from mensagens where conversa_id = ?', b.conv.id)), /Primavera|Veja o arquivo/);
});

test('regressão crítica: PDF institucional de ~9.500 caracteres, área reforçada, sem recurso para confidencial, opção ON ou OFF → processa', async () => {
  catalogo({});
  reforcada(true);
  const linhas = [];
  for (let i = 1; linhas.join(' ').length < 9500; i++) linhas.push(`${i}. Apresentacao institucional: historia, missao, produtos, cobertura por UF e canais de atendimento ao cliente.`);
  for (const ligada of [true, false]) {
    salvarConfig(S.app.db, { [POLITICA_SIGILO]: ligada });
    const x = await enviar('Analise este arquivo e faça um resumo.', { anexos: [arquivo('institucional.pdf', pdf(linhas))] });
    processa(x, `opção ${ligada ? 'ON' : 'OFF'}`);
    assert.equal(x.rota.sigilosa, 0);
  }
  salvarConfig(S.app.db, { [POLITICA_SIGILO]: true });
  reforcada(false);
});
