// Auditoria final de retenção e de arquivos:
//   • "Guardar no histórico = não": o conteúdo é processado (vai inteiro para a IA) e não fica em nenhum ponto
//     indireto: nenhuma tabela, o arquivo do banco (e, por isso, os backups), log, evento, erro, memória do
//     servidor ou arquivo temporário. Vale para texto, PDF, PPTX, imagem e PDF escaneado (OCR), e em erro do
//     provedor, tempo esgotado, nova tentativa, reserva, erro de leitura e erro de OCR;
//   • OCR: só uma forma de ler o arquivo. O texto lido passa pela mesma classificação, governança e retenção;
//     sem texto legível (ou sem OCR), a mensagem é técnica, nunca de política;
//   • a classificação existente continua a mesma (lista de regressão).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { subir } from './ajuda.js';
import { openRouterFalso, enviarMensagem } from './openrouter-falso.js';
import { arquivo, pdf, pptx, pdfEscaneado, jpegDe, imagem } from './arquivos.js';
import { salvarConfig, PADRAO } from '../src/config.js';
import { exec, um, todos } from '../src/db.js';
import { ErroIA } from '../src/ia.js';
import { POLITICA_SIGILO } from '../src/sigilo.js';
import { lerModelos, AUTO } from '../src/modelos.js';
import { detectar, decidir, NIVEL_DO_TIPO } from '../src/filtro.js';
import { lerImagens, MSG_SEM_TEXTO, MSG_IMAGEM_SEM_TEXTO, LIMITES_OCR } from '../src/ocr.js';
import { extrairTexto } from '../src/texto.js';
import { erroDoProvedor, erroParaLog } from '../src/registro-seguro.js';

const EQUILIBRADO = 'anthropic/claude-haiku-4.5', RAPIDO = 'google/gemini-3.5-flash-lite';
const ROTA = f => ({ fornecedor: f, endpoint: f, retencaoZero: true, semTreino: true });
// Marcas do conteúdo: aparecem nos arquivos de teste (inclusive nas imagens) e em nenhum outro lugar.
const MARCAS = /Maria Souza|529\.982\.247-25|52998224725|Cadastro do cliente|Primavera2026/;
// Pasta temporária só deste processo (os outros arquivos de teste rodam em paralelo e usam a do sistema):
// qualquer arquivo temporário criado no envio aparece nela.
const TEMP = mkdtempSync(join(tmpdir(), 'greenia-auditoria-tmp-'));
process.env.TMPDIR = TEMP;
const pasta = mkdtempSync(join(TEMP, '..', 'greenia-auditoria-'));
const banco = join(pasta, 'empresa.sqlite');
let S, OR, admin, ana, modo = null, modoOcr = null;
// O processo de teste já ocupa ~300 MB (servidor, cliente, banco, logs) antes de qualquer leitura; a guarda de
// memória com os valores padrão tem teste próprio (ocr-protecao.test.js), num processo que mede o servidor real.
const FOLGA = { ...LIMITES_OCR, memoriaMaxMb: 4000 };
const logs = [];

before(async () => {
  OR = await openRouterFalso();
  const ia = { ...OR.ia, configurada: true, listarModelos: (...a) => OR.ia.listarModelos(...a),
    async *enviar(mensagens, op) {
      // Provedor que repete o conteúdo recebido no erro (o pior caso), falha uma vez, ou demora e estoura o tempo.
      const eco = String(mensagens.at(-1).content);
      if (modo === 'erro') throw new ErroIA(`O serviço de IA recusou: invalid request: ${eco}`, 400);
      if (modo === 'timeout') { await new Promise(r => setTimeout(r, 30)); throw new ErroIA(`tempo esgotado ao processar: ${eco}`, 504); }
      if (modo === 'uma_falha') { modo = null; throw new ErroIA(`upstream 502: ${eco}`, 502); }
      yield* OR.ia.enviar(mensagens, op);
    } };
  const ocr = imgs => modoOcr ? modoOcr(imgs) : lerImagens(imgs, { limites: FOLGA });
  S = await subir({ ia, ocr, limitesOcr: FOLGA, banco, log: (...a) => logs.push(a.map(x => typeof x === 'string' ? x : x?.stack || String(x)).join(' ')) });
  salvarConfig(S.app.db, { dominios: ['exemplo.com.br'], exigirSemTreino: false, [POLITICA_SIGILO]: true });
  admin = await S.cliente().entrar('admin@exemplo.com.br');
  ana = await S.cliente().entrar('ana@exemplo.com.br');
});
after(async () => { await S.fechar(); await OR.fechar(); rmSync(pasta, { recursive: true, force: true }); rmSync(TEMP, { recursive: true, force: true }); });

const nova = async () => (await ana.post('/api/conversas', {})).dados.conversa;
async function enviar(texto, extra = {}, conv = null) {
  conv ??= await nova();
  const n = OR.chamadas.length;
  const r = await enviarMensagem(ana, conv.id, { texto, ...extra });
  return { r, conv, n: OR.chamadas.length - n, enviado: JSON.stringify(OR.chamadas.slice(n).map(c => c.messages)) };
}
const catalogo = rotas => {
  exec(S.app.db, 'update modelos set homologado = 0, homologacao = null, vetado_plataforma = 0, autorizacao_plataforma = null');
  for (const [id, r] of Object.entries(rotas)) exec(S.app.db, 'update modelos set liberado = 1, homologado = 1, homologacao = ? where id = ?', JSON.stringify(r), id);
};
const naoGuardar = tipos => admin.put('/api/admin/config', { naoArmazenar: tipos });

// Todos os pontos em que um conteúdo poderia ficar, conferidos de uma vez.
function banco_() {
  const tabelas = todos(S.app.db, "select name from sqlite_master where type = 'table' and name not like 'sqlite_%'").map(t => t.name);
  return tabelas.map(t => [t, JSON.stringify(todos(S.app.db, `select * from "${t}"`))]);
}
function temporarios() {
  const listar = d => { try { return readdirSync(d); } catch { return []; } };
  // A pasta temporária deste processo inteira; na pasta de trabalho, o que o OCR poderia deixar (dados de idioma, cache).
  return [...listar(tmpdir()), ...listar(process.cwd()).filter(n => /traineddata|tesseract|\.(png|jpe?g|tiff?)$/i.test(n))].sort();
}
// Memória do servidor: caches, mapas e filas presos ao app (exceto o banco e o socket).
function naMemoria(raiz, re) {
  const vistos = new WeakSet(), achados = [];
  const andar = (v, caminho, prof) => {
    if (prof > 7 || v == null) return;
    if (typeof v === 'string') { if (re.test(v)) achados.push(caminho); return; }
    if (typeof v !== 'object' || vistos.has(v) || Buffer.isBuffer(v)) return;
    vistos.add(v);
    if (v instanceof Map) { for (const [k, x] of v) { andar(k, `${caminho}.<chave>`, prof + 1); andar(x, `${caminho}.${String(k)}`, prof + 1); } return; }
    if (v instanceof Set || Array.isArray(v)) { let i = 0; for (const x of v) andar(x, `${caminho}[${i++}]`, prof + 1); return; }
    for (const k of Object.keys(v)) if (!['db', 'servidor', 'email'].includes(k)) andar(v[k], `${caminho}.${k}`, prof + 1);
  };
  andar(raiz, 'app', 0);
  return achados;
}
function semRastro(msg, antes) {
  for (const [t, linhas] of banco_()) assert.doesNotMatch(linhas, MARCAS, `${msg}: tabela ${t}`);
  // O arquivo do banco (e o WAL) em bytes: nem resto em página livre. Backup é cópia deste arquivo.
  for (const f of readdirSync(pasta)) assert.doesNotMatch(readFileSync(join(pasta, f)).toString('latin1'), MARCAS, `${msg}: arquivo ${f}`);
  assert.doesNotMatch(logs.join('\n'), MARCAS, `${msg}: log`);
  assert.deepEqual(naMemoria(S.app, MARCAS), [], `${msg}: memória do servidor`);
  if (antes) assert.deepEqual(temporarios(), antes, `${msg}: arquivos temporários`);
}

const CADASTRO = ['Cadastro do cliente', 'Maria Souza', 'CPF 529.982.247-25'];
const FORMATOS = {
  texto: () => ({ texto: `Monte a ficha: ${CADASTRO.join(', ')}.` }),
  'PDF com texto': () => ({ texto: 'Monte a ficha do cliente do anexo.', anexos: [arquivo('ficha.pdf', pdf(CADASTRO))] }),
  PPTX: () => ({ texto: 'Monte a ficha do cliente do anexo.', anexos: [arquivo('ficha.pptx', pptx([CADASTRO]))] }),
  imagem: () => ({ texto: 'Monte a ficha do cliente do anexo.', anexos: [arquivo('ficha.png', imagem('cadastro.png'))] }),
  'PDF escaneado': () => ({ texto: 'Monte a ficha do cliente do anexo.', anexos: [arquivo('ficha.pdf', pdfEscaneado([jpegDe('cadastro.jpg')]))] }),
};

// ------------------------------------------------------------------------------------ Retenção
test('guardar = não: texto, PDF, PPTX, imagem e PDF escaneado são processados por inteiro e não deixam rastro', async () => {
  const antes = temporarios();
  assert.equal((await naoGuardar(['cpf'])).status, 200);
  try {
    for (const [nome, corpo] of Object.entries(FORMATOS)) {
      const { texto, ...extra } = corpo();
      const x = await enviar(texto, extra);
      assert.equal(x.r.status, 200, `${nome}: ${JSON.stringify(x.r.erro)}`);
      assert.equal(x.n, 1, `${nome}: uma chamada`);
      // Processar é processar: a IA recebe o conteúdo real (inclusive o lido por OCR), sem anonimização.
      assert.match(x.enviado, /Maria Souza/, `${nome}: o conteúdo foi para a IA`);
      assert.match(x.enviado, /529\.982\.247-25/, `${nome}: sem anonimização`);
      assert.doesNotMatch(x.enviado, /não guardado/, `${nome}: a IA não recebe o marcador de retenção no lugar do conteúdo`);
      assert.ok(x.r.texto.length > 0, `${nome}: resposta entregue`);
      const d = (await ana.get(`/api/conversas/${x.conv.id}`)).dados;
      assert.equal(d.conversa.titulo, 'Conversa', `${nome}: título neutro`);
      assert.match(JSON.stringify(d.mensagens), /não ficam guardados no histórico/, `${nome}: aviso na conversa`);
      assert.equal(um(S.app.db, 'select count(*) n from anexos where conversa_id = ?', x.conv.id).n, 0, `${nome}: sem anexo guardado`);
      semRastro(`guardar = não, ${nome}`, antes);
    }
  } finally { await naoGuardar([]); }
});

test('guardar = sim: o mesmo conteúdo fica no histórico, com o texto lido por OCR como anexo', async () => {
  for (const [nome, corpo] of Object.entries(FORMATOS)) {
    const { texto, ...extra } = corpo();
    const x = await enviar(texto, extra);
    assert.equal(x.r.status, 200, nome);
    const d = (await ana.get(`/api/conversas/${x.conv.id}`)).dados;
    const guardado = JSON.stringify(d.mensagens) + (todos(S.app.db, 'select texto from anexos where conversa_id = ?', x.conv.id).map(a => a.texto).join('\n'));
    assert.match(guardado, /Maria Souza/, `${nome}: guardado conforme a política`);
    assert.match(guardado, /529\.982\.247-25/, `${nome}: guardado sem anonimização`);
    exec(S.app.db, 'delete from conversas where id = ?', x.conv.id);   // limpa para as próximas conferências de rastro
  }
  for (const t of ['anexos', 'mensagens', 'roteamento', 'uso']) exec(S.app.db, `delete from ${t} where conversa_id not in (select id from conversas)`);
  exec(S.app.db, 'pragma wal_checkpoint(truncate)');   // com secure_delete, o apagado não fica no arquivo
});

// ------------------------------------------------------------------------------------ Erros forçados
test('guardar = não com erros: provedor que repete o pedido, tempo esgotado, nova tentativa, reserva, leitor e OCR', async () => {
  const antes = temporarios();
  assert.equal((await naoGuardar(['cpf', 'sensivel'])).status, 200);
  try {
    // 1. Erro do provedor que ecoa o conteúdo: quem usa recebe a mensagem simples; o registro, só o status.
    for (const m of ['erro', 'timeout']) {
      modo = m;
      const x = await enviar('Monte a ficha: Maria Souza, CPF 529.982.247-25.', { anexos: [arquivo('ficha.png', imagem('cadastro.png'))] });
      modo = null;
      assert.ok(x.r.falha, m);
      assert.doesNotMatch(JSON.stringify(x.r.eventos), MARCAS, `${m}: nada do conteúdo volta no erro`);
      const ev = JSON.parse(um(S.app.db, "select detalhes from eventos where tipo = 'ai.failed' order by id desc limit 1").detalhes);
      assert.match(ev.erro, /^status \d+$/, `${m}: só o status`);
      semRastro(`erro forçado: ${m}`, antes);
    }
    // 2. Nova tentativa (conversa sigilosa: outro recurso autorizado, pelo roteador) e reserva do fornecedor.
    catalogo({ [EQUILIBRADO]: ROTA('anthropic'), [RAPIDO]: ROTA('google') });
    modo = 'uma_falha';
    const x = await enviar('Organize por data o laudo médico do colaborador; diagnóstico: depressão. Paciente Maria Souza, CPF 529.982.247-25.');
    assert.equal(x.r.status, 200);
    assert.ok(x.r.fim, 'a nova tentativa respondeu');
    assert.equal(x.n, 1, 'a primeira falhou antes do serviço; a nova tentativa, por outro recurso autorizado, respondeu');
    assert.ok(um(S.app.db, "select 1 from eventos where tipo = 'ai.failed' and detalhes like '%nova_rota%' and detalhes like '%status 502%'"));
    semRastro('nova tentativa', antes);
    catalogo({});
    const sonda = await enviar('Resuma em uma linha: o tempo hoje está bom.');
    const principal = um(S.app.db, 'select modelo from roteamento where conversa_id = ?', sonda.conv.id).modelo;
    const perfil = um(S.app.db, 'select perfil from modelos where id = ?', principal).perfil;
    // Reserva com a mesma proteção do principal (o roteador descarta uma reserva que o conteúdo não permite).
    const nivel = lerModelos(S.app.db).find(m => m.id === principal).protecao;
    const reserva = lerModelos(S.app.db).find(m => m.id !== principal && m.id !== AUTO && (m.protecao ?? 0) >= nivel)?.id;
    if (reserva) exec(S.app.db, 'update modelos set liberado = 1, perfil = ? where id = ?', perfil, reserva);
    assert.ok(reserva, 'há outro recurso da mesma classe para ser a reserva');
    {
      assert.equal((await admin.put(`/api/admin/modelos/${encodeURIComponent(principal)}`, { reserva })).status, 200);
      OR.falhar.add(principal);
      const y = await enviar('Resuma em uma linha a ficha: Maria Souza, CPF 529.982.247-25.', {}, sonda.conv);
      OR.falhar.clear();
      assert.equal(y.r.status, 200);
      assert.equal(y.r.fim?.reserva, true, 'a reserva respondeu');
      semRastro('reserva', antes);
    }
    // 3. Erro de leitura: arquivo corrompido com o conteúdo dentro; a resposta de erro não repete o conteúdo.
    const corrompido = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> Maria Souza CPF 529.982.247-25 lixo', 'latin1');
    const p = await enviar('Leia o anexo.', { anexos: [arquivo('ficha.pdf', corrompido)] });
    assert.equal(p.n, 0);
    assert.doesNotMatch(JSON.stringify(p.r.erro), MARCAS);
    // 4. OCR com erro (mensagem repetindo o que leu) e OCR sem resultado: mensagem técnica, nada enviado.
    for (const falha of [async () => { throw new Error('falhou ao ler: Maria Souza 529.982.247-25'); }, async () => null]) {
      modoOcr = falha;
      const o = await enviar('Leia a imagem.', { anexos: [arquivo('ficha.png', imagem('cadastro.png'))] });
      modoOcr = null;
      assert.deepEqual([o.r.status, o.n, o.r.erro.mensagem], [422, 0, MSG_SEM_TEXTO]);
    }
    semRastro('erros de leitura e de OCR', antes);
  } finally { modo = null; modoOcr = null; OR.falhar.clear(); catalogo({}); await naoGuardar([]); }
});

test('erro do provedor com guardar = sim: o registro de diagnóstico não guarda o trecho do pedido', async () => {
  modo = 'erro';
  const x = await enviar('Monte a ficha: Maria Souza, CPF 529.982.247-25, cliente desde 2019.');
  modo = null;
  assert.ok(x.r.falha);
  const ev = JSON.parse(um(S.app.db, "select detalhes from eventos where tipo = 'ai.failed' order by id desc limit 1").detalhes);
  assert.match(ev.erro, /^status 400/);
  assert.match(ev.erro, /recusou/, 'o diagnóstico continua útil para o admin');
  assert.doesNotMatch(ev.erro, MARCAS);
  exec(S.app.db, 'delete from conversas where id = ?', x.conv.id);
  for (const t of ['mensagens', 'roteamento', 'uso']) exec(S.app.db, `delete from ${t} where conversa_id not in (select id from conversas)`);
  exec(S.app.db, 'pragma wal_checkpoint(truncate)');
});

test('sanitização: exceção e erro do provedor saem sem o conteúdo', () => {
  const e = Object.assign(new TypeError('valor inválido: Maria Souza 529.982.247-25'), { codigo: 'x' });
  assert.doesNotMatch(erroParaLog(e), MARCAS);
  assert.match(erroParaLog(e), /TypeError \(x\)\n\s+at /);
  const pedido = 'Resuma o cadastro do cliente Maria Souza, que mora na Rua das Flores 120.';
  assert.equal(erroDoProvedor(new ErroIA(`falhou: ${pedido}`, 502), { guardar: false, conteudo: pedido }), 'status 502');
  const r = erroDoProvedor(new ErroIA(`O serviço de IA recusou: ${pedido}`, 400), { conteudo: pedido });
  assert.match(r, /^status 400: O serviço de IA recusou: \[trecho do pedido omitido\]/);
  assert.doesNotMatch(r, /Maria|Flores/);
  assert.equal(erroDoProvedor(new ErroIA('recusou: CPF 529.982.247-25', 400), { conteudo: 'outro' }), 'status 400 [mensagem do provedor omitida]');
});

// ------------------------------------------------------------------------------------ Segredos
test('segredos em texto, PDF, PPTX, imagem e PDF escaneado (OCR): bloqueados antes de qualquer envio, sem guardar', async () => {
  const segredo = ['Acesso ao servidor', 'senha: Primavera2026'];
  const casos = {
    texto: { texto: segredo.join('\n') },
    PDF: { texto: 'Veja o anexo.', anexos: [arquivo('acesso.pdf', pdf(segredo))] },
    PPTX: { texto: 'Veja o anexo.', anexos: [arquivo('acesso.pptx', pptx([segredo]))] },
    imagem: { texto: 'Veja o anexo.', anexos: [arquivo('acesso.png', imagem('segredo.png'))] },
    'PDF escaneado': { texto: 'Veja o anexo.', anexos: [arquivo('acesso.pdf', pdfEscaneado([jpegDe('segredo.jpg')]))] },
  };
  for (const [nome, { texto, ...extra }] of Object.entries(casos)) {
    const x = await enviar(texto, extra);
    assert.deepEqual([x.r.status, x.n, x.r.erro.erro], [422, 0, 'dado_bloqueado'], nome);
    assert.match(x.r.erro.mensagem, /Por segurança, este envio foi bloqueado: a mensagem ou um anexo tem uma senha, chave de acesso ou outro segredo/, nome);
    assert.match(JSON.stringify((await ana.get(`/api/conversas/${x.conv.id}`)).dados.mensagens), /Uma mensagem não foi enviada/, nome);
  }
  semRastro('segredos');
});

// ------------------------------------------------------------------------------------ OCR = mesma governança
test('OCR não é atalho: imagem com dado sensível segue a mesma política do texto digitado', async () => {
  // Sem recurso autorizado para conteúdo sigiloso: o texto digitado e a imagem recebem a mesma decisão.
  catalogo({});
  const digitado = await enviar('Laudo medico do colaborador. Diagnostico: depressao');
  const lido = await enviar('Veja o anexo.', { anexos: [arquivo('laudo.png', imagem('laudo.png'))] });
  const escaneado = await enviar('Veja o anexo.', { anexos: [arquivo('laudo.pdf', pdfEscaneado([jpegDe('laudo.jpg')]))] });
  assert.deepEqual([lido.r.status, lido.n, lido.r.erro?.erro], [digitado.r.status, digitado.n, digitado.r.erro?.erro]);
  assert.deepEqual([escaneado.r.status, escaneado.n, escaneado.r.erro?.erro], [digitado.r.status, digitado.n, digitado.r.erro?.erro]);
  assert.equal(digitado.n, 0, 'nada enviado sem recurso autorizado');
  // Com recurso autorizado: processa, e a conversa vira sigilosa, como no texto.
  catalogo({ [EQUILIBRADO]: ROTA('anthropic') });
  const ok = await enviar('Organize por data.', { anexos: [arquivo('laudo.png', imagem('laudo.png'))] });
  assert.equal(ok.r.status, 200);
  assert.equal(um(S.app.db, 'select sigilosa from conversas where id = ?', ok.conv.id).sigilosa, 1);
  catalogo({});
});

test('sem texto legível ou sem OCR: mensagem técnica de leitura, nunca de segurança ou de política', async () => {
  // Imagem que passou pelo OCR sem texto legível: aviso de que o conteúdo visual não é lido. PDF vazio: aviso geral.
  for (const [nome, b, msg] of [['foto.png', imagem('sem-texto.png'), MSG_IMAGEM_SEM_TEXTO], ['vazio.pdf', pdf([]), MSG_SEM_TEXTO]]) {
    const x = await enviar('Veja o anexo.', { anexos: [arquivo(nome, b)] });
    assert.deepEqual([x.r.status, x.n, x.r.erro.mensagem], [422, 0, msg], nome);
    assert.doesNotMatch(x.r.erro.mensagem, /segurança|política|sigilo|anonimi|bloque|proteç/i);
  }
  modoOcr = async () => null;   // OCR indisponível nesta instalação
  const x = await enviar('Veja o anexo.', { anexos: [arquivo('ata.png', imagem('reuniao.png'))] });
  modoOcr = null;
  assert.deepEqual([x.r.status, x.r.erro.mensagem], [422, MSG_SEM_TEXTO]);
});

test('OCR: tempo esgotado encerra a leitura sem deixar worker nem arquivo', async () => {
  const antes = temporarios();
  await assert.rejects(lerImagens([imagem('reuniao.png')], { limites: { ...FOLGA, tempoPaginaMs: 1 } }), e => e.motivo === 'tempo');
  const lido = await lerImagens([imagem('reuniao.png')], { limites: FOLGA });
  assert.match(lido[0], /Carla Mendes, gerente de marketing/);
  assert.deepEqual(temporarios(), antes);
});

// ------------------------------------------------------------------------------------ Arquivos
test('arquivos: PDF com texto, PDF escaneado, PPTX e imagem viram texto pelo mesmo caminho', async () => {
  const ata = ['Reuniao comercial - cliente Grupo Horizonte', 'Carla Mendes, gerente de marketing: campanha ate 15/10'];
  const lidos = [];   // um por vez: leituras simultâneas esperam a vaga do OCR (limite de concorrência)
  for (const [nome, b] of [['ata.pdf', pdf(ata)], ['ata.pptx', pptx([ata])], ['ata.png', imagem('reuniao.png')], ['ata.jpg', imagem('reuniao.jpg')],
    ['ata.pdf', pdfEscaneado([jpegDe('reuniao.jpg'), jpegDe('cadastro.jpg')])]]) lidos.push(await extrairTexto(arquivo(nome, b), { limitesOcr: FOLGA }));
  for (const l of lidos) assert.match(l.texto, /Carla Mendes, gerente de marketing: campanha ate 15\/10/, l.nome);
  assert.match(lidos[4].texto, /\[Página 2\]\nCadastro do cliente\nMaria Souza\nCPF 529\.982\.247-25/, 'PDF escaneado de várias páginas, na ordem');
  assert.deepEqual(detectar(lidos[4].texto), detectar('Carla Mendes, gerente de marketing: campanha ate 15/10\nCadastro do cliente, Maria Souza, CPF 529.982.247-25'), 'mesma classificação do texto digital');
});

// ------------------------------------------------------------------------------------ Quick win
test('quick win "reunião → plano de ação": PDF e imagem com nomes, cargos, emails, clientes, tarefas, decisões, valores e prazos', async () => {
  const q = (await admin.post('/api/quick-wins', { nome: 'Reunião → Plano de ação' })).dados;
  await admin.put(`/api/quick-wins/${q.id}`, { status: 'em_uso', instrucoes: 'Transforme a reunião num plano de ação. Não invente informações.' });
  const ata = arquivo('reuniao.pdf', pdf([
    'Reuniao comercial - clientes Grupo Horizonte e Mercado Bom Preco',
    'Carla Mendes, gerente de marketing (carla.mendes@exemplo.com.br): campanha pronta ate 15/10.',
    'Bruno Alves, diretor comercial (bruno.alves@exemplo.com.br): proposta de R$ 120.000 ate 03/10.',
    'Tarefa: Diego Rocha, coordenador de operacoes, confirma o estoque inicial ate 10/10.',
    'Decisao: lancamento online, sem evento presencial; orcamento de midia R$ 40.000.']));
  for (const anexo of [ata, arquivo('reuniao.png', imagem('reuniao.png'))]) {
    const conv = (await ana.post('/api/conversas', { quick_win_id: q.id })).dados.conversa;
    const x = await enviar('Analise esta reunião e monte um plano de ação.', { anexos: [anexo] }, conv);
    assert.equal(x.r.status, 200, `${anexo.nome}: ${JSON.stringify(x.r.erro)}`);
    assert.equal(x.n, 1);
    assert.match(x.enviado, /Carla Mendes, gerente de marketing/, `${anexo.nome}: sem anonimização`);
    assert.match(x.enviado, /R\$ 40\.000/, `${anexo.nome}: valores preservados`);
    assert.equal(um(S.app.db, 'select sigilosa from conversas where id = ?', conv.id).sigilosa, 0, `${anexo.nome}: conteúdo comum não vira sigiloso`);
    assert.doesNotMatch(JSON.stringify((await ana.get(`/api/conversas/${conv.id}`)).dados), /remova|retire|anonimi|não pode ser processad/i);
  }
});

// ------------------------------------------------------------------------------------ Classificação (regressão)
test('classificação preservada: lista de regressão com as ações padrão', () => {
  const casos = [
    ['Carla Mendes, gerente de marketing, conduziu a reunião.', [], 'comum'],
    ['Contato: maria.souza@hotmail.com', ['email'], 'pessoal'],
    ['Telefone (11) 98765-4321', ['telefone'], 'pessoal'],
    ['CPF 529.982.247-25', ['cpf'], 'pessoal'],
    ['CNPJ 11.222.333/0001-81', ['cnpj'], 'identificação de empresa (processa normalmente)'],
    ['O salário da Maria Souza é R$ 8.500,00', ['pessoal_restrito'], 'pessoal restrito'],
    ['Advertência disciplinar aplicada ao colaborador João Lima por atraso', ['pessoal_restrito'], 'pessoal restrito'],
    ['Diagnóstico médico do colaborador: depressão', ['sensivel'], 'sensível'],
    ['Documento confidencial: plano de aquisição', ['confidencial'], 'proteção total'],
    ['senha: Primavera2026', ['credencial'], 'bloqueio'],
    ['api_key=sk-abcdefghijklmnopqrstuvwxyz123456', ['credencial'], 'bloqueio'],
    ['token: ghp_abcdefghijklmnopqrstuvwxyz0123456789', ['credencial'], 'bloqueio'],
    ['-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBg\n-----END PRIVATE KEY-----', ['credencial'], 'bloqueio'],
    ['seed phrase: abandon ability able about above absent absorb abstract absurd abuse access accident', ['credencial'], 'bloqueio'],
    ['https://admin:Segredo123@servidor.exemplo.com/db', ['credencial'], 'bloqueio'],
  ];
  for (const [texto, tipos, nivel] of casos) {
    const t = detectar(texto);
    assert.deepEqual(t, tipos, texto);
    const d = decidir(t, PADRAO.acoesChat);
    if (nivel === 'comum') assert.deepEqual(d, { bloqueados: [], protegidos: [], normais: [] });
    if (/^pessoal|identificação/.test(nivel)) assert.deepEqual([d.bloqueados, d.protegidos], [[], []], `${texto}: processa normalmente`);
    if (/^pessoal/.test(nivel)) assert.ok(NIVEL_DO_TIPO[t[0]] >= 2, `${texto}: controles de dado pessoal`);
    if (nivel === 'sensível' || nivel === 'proteção total') assert.deepEqual(d.protegidos, tipos, `${texto}: só com proteção`);
    if (nivel === 'bloqueio') assert.deepEqual(d.bloqueados, ['credencial'], `${texto}: nunca sai`);
  }
});
