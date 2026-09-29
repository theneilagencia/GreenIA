// Leitura de imagens: ruído não vai para a IA, texto de lado é lido e a pessoa entende quando a imagem não tem
// texto. (1) Filtro de legibilidade pela confiança do tesseract (página e palavras); (2) rotação (90°, 270°, 180°)
// quando a primeira leitura sai ilegível; (3) mensagem própria para imagem ou PDF escaneado sem texto legível,
// explicando que o conteúdo visual (fotos, gráficos, exames, radiografias) não é interpretado. Nada disso muda a
// governança: o texto lido segue pela mesma classificação, e o que é descartado nunca é enviado.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { extrairTexto } from '../src/texto.js';
import { avaliarLeitura, girar, LIMITES_OCR, MSG_SEM_TEXTO, MSG_GRANDE, MSG_OCUPADO, MSG_IMAGEM_SEM_TEXTO, MSG_PDF_SEM_TEXTO } from '../src/ocr.js';
import { arquivo, imagem, pdfEscaneado, jpegDe, pdf } from './arquivos.js';
import { subir } from './ajuda.js';
import { openRouterFalso, enviarMensagem } from './openrouter-falso.js';
import { salvarConfig } from '../src/config.js';

const L = { ...LIMITES_OCR, memoriaMaxMb: 4000 };   // o processo de teste ocupa mais que o servidor sozinho
const ler = (nome, b) => extrairTexto(arquivo(nome, b), { limitesOcr: L, onde: 'anexo', maxCaracteres: 100_000 });
const recusa = async (p, mensagem) => { const e = await p.then(() => null, x => x); assert.ok(e, 'deveria recusar'); assert.deepEqual([e.status, e.codigo, e.message], [422, 'sem_texto', mensagem]); };
const palavras = lista => ({ blocks: [{ paragraphs: [{ lines: [{ words: lista.map(([text, confidence]) => ({ text, confidence })) }] }] }] });

// ------------------------------------------------------------------------------------ (1) Legibilidade
test('avaliação de legibilidade: texto real passa; ruído (mesmo com confiança de página acima do antigo mínimo de 30) não', () => {
  const real = avaliarLeitura({ confidence: 94, ...palavras([['Reunião', 96], ['comercial', 95], ['com', 97], ['o', 90], ['cliente', 96]]) });
  assert.equal(real.legivel, true);
  // Uma radiografia fotografada de lado: confiança de página 30 a 47, poucas palavras confiáveis.
  const ruido = avaliarLeitura({ confidence: 45, ...palavras([['AAB', 30], ['xq', 25], ['RTE', 41], ['ok', 80], ['ZXW', 35], ['lmn', 28]]) });
  assert.equal(ruido.legivel, false, 'só uma palavra confiável em seis');
  assert.equal(avaliarLeitura({ confidence: 30, ...palavras([['Texto', 95]]) }).legivel, false, 'confiança da página baixa demais');
  assert.equal(avaliarLeitura({ confidence: 95, blocks: [] }).legivel, false, 'nada lido');
  assert.equal(avaliarLeitura({}).legivel, false);
  assert.equal(avaliarLeitura({ confidence: 90, ...palavras([['|', 99], ['—', 99]]) }).legivel, false, 'só símbolos não contam como texto');
  // Texto curto e confiável (legenda, etiqueta): passa.
  assert.equal(avaliarLeitura({ confidence: 91, ...palavras([['Figura', 93], ['3', 90]]) }).legivel, true);
});

// ------------------------------------------------------------------------------------ (2) Rotação dos pixels
test('girar: 90° horário, 270°, 180° e volta completa, em cinza', () => {
  // 3 colunas × 2 linhas:  1 2 3 / 4 5 6
  const img = { data: Buffer.from([1, 2, 3, 4, 5, 6]), width: 3, height: 2, channels: 1 };
  const g90 = girar(img, 90), g270 = girar(img, 270), g180 = girar(img, 180);
  assert.deepEqual([g90.width, g90.height, [...g90.data]], [2, 3, [4, 1, 5, 2, 6, 3]]);
  assert.deepEqual([g270.width, g270.height, [...g270.data]], [2, 3, [3, 6, 2, 5, 1, 4]]);
  assert.deepEqual([g180.width, g180.height, [...g180.data]], [3, 2, [6, 5, 4, 3, 2, 1]]);
  assert.deepEqual([...girar(girar(img, 90), 270).data], [...img.data], 'ida e volta');
  assert.deepEqual([...girar(img, 360).data], [...img.data]);
  assert.throws(() => girar({ data: Buffer.alloc(12), width: 2, height: 2, channels: 3 }, 90), TypeError);
});

// ------------------------------------------------------------------------------------ OCR real
test('regressão: imagens de pé continuam lidas como antes', async () => {
  assert.match((await ler('ata.png', imagem('reuniao.png'))).texto, /Reuniao comercial/);
  assert.match((await ler('ata.jpg', imagem('reuniao.jpg'))).texto, /Reuniao comercial/);
  assert.match((await ler('ficha.png', imagem('cadastro.png'))).texto, /Cadastro do cliente/);
  assert.equal((await ler('pagina.png', imagem('a4.png'))).texto.split('\n').filter(l => /^Item \d+/.test(l)).length, 44);
});

test('rotação: foto de lado (PNG e JPEG) e PDF escaneado de uma página de lado são lidos', async () => {
  assert.match((await ler('de-lado.png', imagem('reuniao-girada.png'))).texto, /Reuniao comercial - cliente Grupo Horizonte/);
  assert.match((await ler('de-lado.jpg', imagem('reuniao-girada.jpg'))).texto, /Reuniao comercial - cliente Grupo Horizonte/);
  assert.match((await ler('de-lado.pdf', pdfEscaneado([jpegDe('reuniao-girada.jpg')]))).texto, /Reuniao comercial/);
});

test('radiografia sintética (confiança de página acima do antigo mínimo): o ruído é descartado e as etiquetas de lado são lidas', async () => {
  const { texto } = await ler('raiox.jpg', imagem('raiox-sintetico.jpg'));
  assert.match(texto, /CLAVICULA AXIAL/);
  assert.match(texto, /PACIENTE FICTICIO/);
  assert.ok(texto.length < 200, 'só as etiquetas, sem o ruído das bordas');
});

// ------------------------------------------------------------------------------------ (3) Mensagem
test('imagem sem texto legível e PDF escaneado sem texto legível: mensagem própria, técnica, sem jargão', async () => {
  await recusa(ler('foto.png', imagem('sem-texto.png')), MSG_IMAGEM_SEM_TEXTO);
  await recusa(ler('ruido.jpg', imagem('ruido.jpg')), MSG_IMAGEM_SEM_TEXTO);
  await recusa(ler('ruido.pdf', pdfEscaneado([jpegDe('ruido.jpg')])), MSG_PDF_SEM_TEXTO);
  // PDF digital vazio continua com o aviso geral (não passou pelo OCR).
  await recusa(ler('vazio.pdf', pdf([])), MSG_SEM_TEXTO);
  for (const m of [MSG_IMAGEM_SEM_TEXTO, MSG_PDF_SEM_TEXTO]) {
    assert.match(m, /não interpreta o conteúdo visual, como fotos, gráficos, exames ou radiografias/);
    assert.doesNotMatch(m, /pessoa|sens[ií]ve|anonimi|sigil|pol[ií]tica|remova|mem[oó]ria|render|servidor|fornecedor|modelo|tesseract|ocr/i);
  }
  assert.doesNotMatch(MSG_GRANDE + MSG_OCUPADO + MSG_SEM_TEXTO, /radiografia/, 'as outras mensagens não mudaram');
});

// ------------------------------------------------------------------------------------ Chat: governança intacta
let S, OR, ana;
before(async () => {
  OR = await openRouterFalso();
  S = await subir({ ia: { ...OR.ia, configurada: true, listarModelos: (...a) => OR.ia.listarModelos(...a) }, limitesOcr: L });
  salvarConfig(S.app.db, { dominios: ['exemplo.com.br'] });
  ana = await S.cliente().entrar('ana@exemplo.com.br');
});
after(async () => { await S.fechar(); await OR.fechar(); });
async function enviar(nome, b) {
  const conv = (await ana.post('/api/conversas', {})).dados.conversa;
  const n = OR.chamadas.length;
  const r = await enviarMensagem(ana, conv.id, { texto: 'Leia o anexo.', anexos: [arquivo(nome, b)] });
  return { r, chamadas: OR.chamadas.length - n, enviado: JSON.stringify(OR.chamadas.slice(n)) };
}

test('chat: imagem só com ruído não chama a IA e mostra a mensagem própria', async () => {
  const x = await enviar('ruido.jpg', imagem('ruido.jpg'));
  assert.deepEqual([x.r.status, x.chamadas, x.r.erro?.mensagem], [422, 0, MSG_IMAGEM_SEM_TEXTO]);
});

test('chat: senha numa imagem de lado agora é lida e bloqueada como credencial (antes saía ruído)', async () => {
  const x = await enviar('acesso.png', imagem('segredo-girado.png'));
  assert.equal(x.r.status, 422);
  assert.equal(x.r.erro.erro, 'dado_bloqueado');
  assert.equal(x.chamadas, 0, 'nada foi enviado');
  assert.doesNotMatch(JSON.stringify(x.r.erro), /Primavera2026/);
});

test('chat: foto de lado com texto comum é lida e enviada normalmente', async () => {
  const x = await enviar('ata.png', imagem('reuniao-girada.png'));
  assert.equal(x.r.status, 200, JSON.stringify(x.r.erro));
  assert.equal(x.chamadas, 1);
  assert.match(x.enviado, /Reuniao comercial/);
});
