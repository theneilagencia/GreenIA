// Extração de texto dos arquivos enviados (bases, arquivos de quick win e anexos). Imagem e página escaneada
// de PDF são lidas por OCR local (ocr.js); o texto lido é tratado como qualquer outro texto extraído: a
// classificação, a governança e a retenção vêm depois, iguais para todos os formatos.
import { inflateRawSync } from 'node:zlib';
import { erro } from './http.js';
import { lerImagens, dimensoes, imagensDoPdf, ErroOcr, LIMITES_OCR, MSG_SEM_TEXTO, MSG_GRANDE, MSG_OCUPADO } from './ocr.js';
import { prepararImagem, lerPaginas, textoDoPdf } from './ocr-paginas.js';

// Conteúdo de fora (anexo, documento) entre marcas; a marca de fechamento dentro do texto é neutralizada.
export const delimitar = (tipo, nome, texto) => `<${tipo} nome="${String(nome).replace(/["<>]/g, '')}">\n${String(texto).replace(new RegExp(`</?${tipo}`, 'gi'), m => m.replace('<', '‹'))}\n</${tipo}>`;

export { MSG_SEM_TEXTO };
export const FORMATOS = 'PDF, DOCX, PPTX, XLSX, TXT, MD, CSV ou imagem (PNG, JPG, WEBP ou TIFF)';
// Limites de upload, no padrão de mercado (anexo de email e ferramentas de IA corporativas): o tamanho
// do arquivo protege o servidor; o texto extraído protege o consumo, porque é ele que vai para o modelo.
// ~2.500 caracteres por página.
export const LIMITES_ARQUIVO = {
  arquivoMb: 25,            // cada arquivo (anexo, documento da base, arquivo de quick win)
  anexosPorMensagem: 5,
  mensagemMb: 30,           // soma dos arquivos de uma mensagem
  anexoCaracteres: 100_000, // texto de um anexo no chat (~40 páginas): vai inteiro para o modelo
  mensagemCaracteres: 150_000,
  historicoAnexosCaracteres: 150_000, // anexos de mensagens antigas reenviados a cada resposta
  documentoCaracteres: 2_000_000,     // base de conhecimento e quick win: entram só os trechos relevantes
};
export const paginasDe = caracteres => Math.max(1, Math.round(caracteres / 2500));
const MAX_ARQUIVO_MB = LIMITES_ARQUIVO.arquivoMb;
const MAX_DESCOMPACTADO = 200 * 1024 * 1024;   // teto contra "bomba de ZIP"

const ehImagem = b => (b[0] === 0x89 && b[1] === 0x50) || (b[0] === 0xff && b[1] === 0xd8) || b.subarray(0, 4).toString() === 'GIF8'
  || (b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP') || (b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a) || (b[0] === 0x4d && b[1] === 0x4d && b[2] === 0x00)
  || /^ftyp(heic|heix|mif1|avif)/.test(b.subarray(4, 12).toString());

// Leitor de ZIP (DOCX e XLSX): diretório central e entradas, com teto real de descompactação.
function lerZip(b) {
  let fim = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) if (b.readUInt32LE(i) === 0x06054b50) { fim = i; break; }
  if (fim < 0) throw erro(400, 'arquivo_invalido', 'Arquivo compactado inválido.');
  const total = b.readUInt16LE(fim + 10);
  let p = b.readUInt32LE(fim + 16), soma = 0;
  const entradas = new Map();
  for (let n = 0; n < total && n < 20000; n++) {
    if (b.readUInt32LE(p) !== 0x02014b50) throw erro(400, 'arquivo_invalido', 'Arquivo compactado inválido.');
    const metodo = b.readUInt16LE(p + 10), tam = b.readUInt32LE(p + 20), nl = b.readUInt16LE(p + 28);
    const local = b.readUInt32LE(p + 42);
    const nome = b.subarray(p + 46, p + 46 + nl).toString('utf8');
    p += 46 + nl + b.readUInt16LE(p + 30) + b.readUInt16LE(p + 32);
    entradas.set(nome, () => {
      const ini = local + 30 + b.readUInt16LE(local + 26) + b.readUInt16LE(local + 28);
      const dados = b.subarray(ini, ini + tam);
      let out;
      try { out = metodo === 0 ? dados : inflateRawSync(dados, { maxOutputLength: MAX_DESCOMPACTADO - soma }); }
      catch { throw erro(413, 'arquivo_grande', 'O conteúdo do arquivo é grande demais depois de descompactado.'); }
      soma += out.length;
      return out.toString('utf8');
    });
  }
  return entradas;
}

const entidades = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d))).replace(/&amp;/g, '&');

function docx(b) {
  const z = lerZip(b);
  const doc = z.get('word/document.xml');
  if (!doc) throw erro(400, 'arquivo_invalido', 'Este DOCX não tem conteúdo de texto.');
  return entidades(doc()
    .replace(/<w:tab\/>/g, '\t').replace(/<w:br\/>/g, '\n').replace(/<\/w:p>/g, '\n').replace(/<\/w:tc>/g, '\t')
    .replace(/<[^>]+>/g, '')).replace(/\n{3,}/g, '\n\n').trim();
}

// XLSX: cada planilha vira linhas separadas por ";", com o nome da planilha no topo.
// PPTX: o texto de cada slide, na ordem, com "[Slide N]" (e as notas, quando houver).
function pptx(b) {
  const z = lerZip(b);
  const num = n => Number(/(\d+)\.xml$/.exec(n)?.[1] || 0);
  const slides = [...z.keys()].filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, c) => num(a) - num(c));
  if (!slides.length) throw erro(400, 'arquivo_invalido', 'Este PPTX não tem slides com texto.');
  const texto = x => entidades(x.replace(/<\/a:p>/g, '\n').replace(/<a:br\/>/g, '\n').replace(/<[^>]+>/g, '')).replace(/\n{2,}/g, '\n').trim();
  return slides.map(n => {
    const notas = z.get(`ppt/notesSlides/notesSlide${num(n)}.xml`);
    return `[Slide ${num(n)}]\n${texto(z.get(n)())}${notas ? `\nNotas: ${texto(notas())}` : ''}`;
  }).join('\n\n').trim();
}

function xlsx(b) {
  const z = lerZip(b);
  const compart = z.get('xl/sharedStrings.xml') ? [...z.get('xl/sharedStrings.xml')().matchAll(/<si>([\s\S]*?)<\/si>/g)]
    .map(m => entidades([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t => t[1]).join(''))) : [];
  const livro = z.get('xl/workbook.xml')?.() || '';
  const nomes = [...livro.matchAll(/<sheet [^>]*name="([^"]+)"/g)].map(m => entidades(m[1]));
  const folhas = [...z.keys()].filter(k => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort((a, c) => parseInt(a.match(/\d+/)) - parseInt(c.match(/\d+/)));
  const col = ref => [...ref.replace(/\d+/g, '')].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
  return folhas.map((f, i) => {
    const linhas = [...z.get(f)().matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map(r => {
      const cel = [];
      for (const c of r[1].matchAll(/<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const v = /<v>([\s\S]*?)<\/v>/.exec(c[3] || '')?.[1] ?? /<t[^>]*>([\s\S]*?)<\/t>/.exec(c[3] || '')?.[1] ?? '';
        cel[col(c[1])] = /t="s"/.test(c[2]) ? compart[Number(v)] ?? '' : entidades(v);
      }
      return Array.from(cel, x => x ?? '').join(';');
    }).filter(l => l.replace(/;/g, '').trim());
    return `# Planilha: ${nomes[i] || `Planilha ${i + 1}`}\n${linhas.join('\n')}`;
  }).join('\n\n').trim();
}

// Imagem a partir da qual o PDF é tratado como escaneado (páginas inteiras em imagem). Logotipos e ícones de um PDF
// digital ficam abaixo disso, e o PDF segue sem passar pelo OCR.
const PIXELS_DE_PAGINA = 1_000_000;

// Página com texto: o texto dela. Página sem texto e com imagem (escaneada): OCR, uma página por vez, no processo
// de OCR (ocr.js). Aqui só se confere o que dá para conferir sem decodificar nada: tamanho, páginas e a resolução
// das imagens (pelos dicionários do PDF). Num PDF com imagem de página, até o texto digital é lido num processo
// de vida curta, para a memória do leitor de PDF não ficar no servidor.
async function pdf(b, ocr, op) {
  const L = op.limites, imagens = imagensDoPdf(b);
  const maiorImagem = imagens.length ? Math.max(...imagens.map(x => x.largura * x.altura)) : 0;
  const montar = (paginas, total) => paginas.map((t, i) => (total > 1 ? `[Página ${i + 1}]\n${t}` : t)).join('\n\n');
  const escaneadasDe = paginas => paginas.map((t, i) => t.replace(/\s/g, '').length < 15 ? i : -1).filter(i => i >= 0);
  // Tamanho do arquivo não basta (um PDF pequeno pode ter muitas páginas ou imagens enormes): páginas e pixels
  // também são conferidos, antes de decodificar qualquer imagem.
  const conferir = escaneadas => {
    if (b.length > L.maxPdfMb * 1048576 || escaneadas.length > L.maxPdfPaginas || maiorImagem > L.pixelsEntrada) throw new ErroOcr('grande');
  };
  const meta = { tipo: 'pdf', bytes: b.length, pixels: Math.min(maiorImagem, L.pixelsLeitura), pixelsDecodificar: maiorImagem, ...op };
  if (maiorImagem < PIXELS_DE_PAGINA) {
    // PDF digital: como sempre. Se sobrar página sem texto com imagem pequena, ela vai para o OCR.
    const { paginas, total } = await textoDoPdf(b);
    const escaneadas = imagens.length ? escaneadasDe(paginas) : [];
    if (escaneadas.length) {
      conferir(escaneadas);
      const lidos = await sessao(ocr, { ...meta, paginas: escaneadas.length }, ler => ler.pdf(b, escaneadas));
      escaneadas.forEach((i, k) => { paginas[i] = lidos[k]; });
    }
    return montar(paginas, total);
  }
  if (b.length > L.maxPdfMb * 1048576 || maiorImagem > L.pixelsEntrada) throw new ErroOcr('grande');
  return sessao(ocr, meta, async ler => {
    const { paginas, total } = await ler.textoPdf(b);
    const escaneadas = escaneadasDe(paginas);
    conferir(escaneadas);
    if (escaneadas.length) {
      const lidos = await ler.pdf(b, escaneadas);
      escaneadas.forEach((i, k) => { paginas[i] = lidos[k]; });
    }
    return montar(paginas, total);
  });
}

// Imagem: tamanho, dimensões e formato conferidos antes do OCR, pelo cabeçalho. Acima da resolução de leitura, a
// imagem é decodificada e reduzida (em cinza) no processo de OCR, antes do tesseract subir.
async function imagem(b, ocr, op) {
  const L = op.limites, d = dimensoes(b), px = d ? d.largura * d.altura : null;
  if (b.length > L.maxImagemMb * 1048576 || (px && px > L.pixelsEntrada)) throw new ErroOcr('grande');
  const reduzir = px && px > L.pixelsLeitura;
  if (reduzir && !['png', 'jpeg'].includes(d.formato)) throw new ErroOcr('grande');   // sem como reduzir com segurança
  return sessao(ocr, { tipo: `imagem/${d?.formato || 'desconhecida'}`, bytes: b.length, pixels: px ? Math.min(px, L.pixelsLeitura) : null, pixelsDecodificar: reduzir ? px : 0, ...op }, ler => ler.imagem(b));
}

// Sessão do leitor padrão (vaga, guarda de memória, processo de OCR). Um leitor injetado (testes) recebe as
// mesmas imagens preparadas pelo mesmo código, uma a uma, neste processo.
function sessao(ocr, meta, fn) {
  if (ocr.sessao) return ocr.sessao(meta, fn);
  const px = meta.limites.pixelsLeitura, um = async img => (await porOcr(ocr, [img]))[0];
  return fn({ textoPdf: textoDoPdf, imagem: async b => um(await prepararImagem(b, px)), pdf: (bytes, indices) => lerPaginas(bytes, indices, px, um) });
}

// Recusas e falhas do OCR em mensagens técnicas: capacidade (grande, memória, ocupado) ou leitura (sem texto,
// erro, tempo, indisponível). Nunca uma mensagem de política.
function erroDeOcr(e) {
  const motivo = e instanceof ErroOcr ? e.motivo : 'erro';
  if (motivo === 'grande' || motivo === 'memoria') return erro(413, 'ocr_grande', MSG_GRANDE);
  if (motivo === 'ocupado') return erro(503, 'ocr_ocupado', MSG_OCUPADO);
  return erro(422, 'sem_texto', MSG_SEM_TEXTO);
}
const TECNICOS = new Set(['sem_texto', 'ocr_grande', 'ocr_ocupado']);

// Leitor injetado: sem resultado ou com erro, mensagem técnica.
async function porOcr(ocr, imagens) {
  let lidos;
  try { lidos = await ocr(imagens); } catch (e) { throw erroDeOcr(e); }
  if (!lidos) throw erro(422, 'sem_texto', MSG_SEM_TEXTO);
  return lidos;
}

const decodificar = b => {
  const u = b.toString('utf8');
  return u.includes('�') ? b.toString('latin1') : u.replace(/^﻿/, '');
};

/** Extrai o texto de um arquivo enviado em base64. @returns {Promise<{nome: string, texto: string}>} */
export async function extrairTexto({ nome, base64 }, { maxCaracteres = LIMITES_ARQUIVO.documentoCaracteres, onde = 'documento', ocr = lerImagens, sinal = null, limitesOcr = LIMITES_OCR } = {}) {
  nome = String(nome || 'arquivo').slice(0, 200);
  const b = Buffer.from(String(base64 || ''), 'base64');
  if (!b.length) throw erro(400, 'vazio', `${nome}: arquivo vazio.`);
  if (b.length > MAX_ARQUIVO_MB * 1024 * 1024) throw erro(413, 'arquivo_grande', `${nome}: acima de ${MAX_ARQUIVO_MB} MB.`);
  const ext = (nome.split('.').pop() || '').toLowerCase();
  let texto;
  try {
    const op = { sinal, limites: limitesOcr };
    if (ehImagem(b)) texto = await imagem(b, ocr, op);
    else if (b.subarray(0, 4).toString() === '%PDF') texto = await pdf(b, ocr, op);
    else if (b[0] === 0x50 && b[1] === 0x4b) {
      // Zip só como DOCX, XLSX ou PPTX: outro conteúdo compactado não é aceito.
      if (!['docx', 'xlsx', 'pptx'].includes(ext)) throw erro(415, 'formato', `arquivo compactado não aceito. Use ${FORMATOS}.`);
      texto = ext === 'xlsx' ? xlsx(b) : ext === 'pptx' ? pptx(b) : docx(b);
    }
    else if (['txt', 'md', 'csv'].includes(ext)) {
      if (b.subarray(0, 4096).includes(0)) throw erro(415, 'formato', 'não é um arquivo de texto.');
      texto = decodificar(b);
    } else throw erro(415, 'formato', `formato não aceito. Use ${FORMATOS}.`);
  } catch (e) {
    if (e instanceof ErroOcr) throw erroDeOcr(e);
    if (e.status) throw TECNICOS.has(e.codigo) ? e : erro(e.status, e.codigo, `${nome}: ${e.message}`);
    throw erro(400, 'arquivo_invalido', `${nome}: não foi possível ler o arquivo.`);
  }
  if (!texto.replace(/\[(Página|Slide) \d+\]/g, '').trim()) throw erro(422, 'sem_texto', MSG_SEM_TEXTO);
  if (texto.length > maxCaracteres) throw erro(413, 'texto_grande', onde === 'anexo'
    ? `${nome}: tem cerca de ${paginasDe(texto.length)} páginas de texto. No chat, cada anexo pode ter até ${paginasDe(maxCaracteres)} páginas, porque vai inteiro para a IA e consome créditos a cada resposta. Envie só a parte necessária, ou coloque o documento na base de conhecimento, que usa apenas os trechos relevantes.`
    : `${nome}: tem cerca de ${paginasDe(texto.length)} páginas de texto; o máximo é ${paginasDe(maxCaracteres)} páginas por documento. Divida o arquivo em partes.`);
  return { nome, texto, bytes: b.length };
}
