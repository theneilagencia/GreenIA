// Extração de texto dos arquivos enviados (bases, arquivos de quick win e anexos). Imagem e página escaneada
// de PDF são lidas por OCR local (ocr.js); o texto lido é tratado como qualquer outro texto extraído: a
// classificação, a governança e a retenção vêm depois, iguais para todos os formatos.
import { estiloDoPdf, estiloDoTema } from './estilo-arquivo.js';
import { inflateRawSync } from 'node:zlib';
import { erro } from './http.js';
import { lerImagens, dimensoes, imagensDoPdf, ErroOcr, LIMITES_OCR, MSG_SEM_TEXTO, MSG_GRANDE, MSG_OCUPADO, MSG_IMAGEM_SEM_TEXTO, MSG_PDF_SEM_TEXTO } from './ocr.js';
import { prepararImagem, lerPaginas, textoDoPdf } from './ocr-paginas.js';

// Conteúdo de fora (anexo, documento) entre marcas; a marca de fechamento dentro do texto é neutralizada.
import { resumoDeCsv, resumoDeTabela } from './planilha.js';

export const delimitar = (tipo, nome, texto) => `<${tipo} nome="${String(nome).replace(/["<>]/g, '')}">\n${String(texto).replace(new RegExp(`</?${tipo}`, 'gi'), m => m.replace('<', '‹'))}\n</${tipo}>`;

export { MSG_SEM_TEXTO };
export const FORMATOS = 'PDF, DOCX, PPTX, XLSX, TXT, MD, CSV, ZIP de projeto de código ou imagem (PNG, JPG, WEBP ou TIFF)';
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

// Projeto de código em .zip: só os arquivos de texto de código e configuração (nada é executado), cada um com o
// caminho como título. Pastas de dependências, binários e segredos (.env) ficam de fora.
const CODIGO = /\.(js|mjs|cjs|jsx|ts|tsx|json|py|java|go|rb|php|cs|c|h|cpp|rs|kt|swift|sql|sh|ya?ml|toml|ini|md|txt|html?|css|scss|vue|svelte|xml|gradle|dockerfile)$|(^|\/)(Dockerfile|Makefile|README[^/]*)$/i;
const FORA = /(^|\/)(node_modules|\.git|dist|build|vendor|\.venv|venv|__pycache__|\.next|coverage)\//;
function projetoZip(b) {
  const z = lerZip(b), partes = [];
  const nomes = [...z.keys()].filter(n => !n.endsWith('/') && !FORA.test(n) && CODIGO.test(n) && !/(^|\/)\.env(\.|$)|package-lock\.json$|yarn\.lock$/.test(n)).sort().slice(0, 200);
  for (const n of nomes) { const t = z.get(n)(); if (!t.includes('\u0000')) partes.push(`### Arquivo: ${n}\n\`\`\`\n${t.replace(/\n?$/, '')}\n\`\`\``); }
  if (!partes.length) throw erro(415, 'formato', 'o .zip não tem arquivos de código ou texto legíveis.');
  return `Projeto compactado com ${partes.length} ${partes.length === 1 ? 'arquivo' : 'arquivos'}:\n\n${partes.join('\n\n')}`;
}

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

// Formatos de data/hora embutidos do Excel (ids da especificação) e, nos personalizados, códigos com dia, mês, ano
// ou hora fora de aspas e colchetes de cor.
const DATAS_EMBUTIDAS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);
const ehFormatoDeData = codigo => /[dmyhs]/i.test(String(codigo).replace(/"[^"]*"|\\.|\[(?![hms]+\])[^\]]*\]/gi, '').replace(/General/gi, ''));
// Número de série do Excel (dias desde 30/12/1899) -> "dd/mm/aaaa" (e "hh:mm" quando tem hora).
function dataDoExcel(serie) {
  const n = Number(serie);
  if (!Number.isFinite(n) || n < 1 || n > 2958465) return null;
  const ms = Math.round((n - 25569) * 86400000), d = new Date(ms), dd = String(d.getUTCDate()).padStart(2, '0'), mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const hora = n % 1 ? ` ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}` : '';
  return n < 1 && hora ? hora.trim() : `${dd}/${mm}/${d.getUTCFullYear()}${hora}`;
}

function xlsx(b) {
  const z = lerZip(b);
  const compart = z.get('xl/sharedStrings.xml') ? [...z.get('xl/sharedStrings.xml')().matchAll(/<si>([\s\S]*?)<\/si>/g)]
    .map(m => entidades([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t => t[1]).join(''))) : [];
  const livro = z.get('xl/workbook.xml')?.() || '';
  // Abas na ordem do livro, cada uma com o próprio arquivo (pela relação r:id), não pelo número do arquivo.
  const relacoes = new Map([...(z.get('xl/_rels/workbook.xml.rels')?.() || '').matchAll(/<Relationship\b[^>]*>/g)].map(m => [/Id="([^"]+)"/.exec(m[0])?.[1], /Target="([^"]+)"/.exec(m[0])?.[1]]));
  const abas = [...livro.matchAll(/<sheet\b[^>]*>/g)].map(m => ({ nome: entidades(/name="([^"]+)"/.exec(m[0])?.[1] || ''), alvo: relacoes.get(/r:id="([^"]+)"/.exec(m[0])?.[1]) }))
    .map(a => ({ ...a, arquivo: a.alvo ? (a.alvo.startsWith('/') ? a.alvo.slice(1) : `xl/${a.alvo}`).replace(/\/\.\//g, '/') : null }));
  const porNumero = [...z.keys()].filter(k => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort((a, c) => parseInt(a.match(/\d+/)) - parseInt(c.match(/\d+/)));
  const folhasDoLivro = abas.filter(a => a.arquivo && z.get(a.arquivo));
  const folhas = folhasDoLivro.length ? folhasDoLivro.map(a => a.arquivo) : porNumero;
  const nomes = folhasDoLivro.length ? folhasDoLivro.map(a => a.nome) : abas.map(a => a.nome);
  // Estilos: quais índices de estilo (s="n") são data, para mostrar a data em vez do número de série.
  const estilos = z.get('xl/styles.xml')?.() || '';
  const personalizados = new Map([...estilos.matchAll(/<numFmt\b[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g)].map(m => [Number(m[1]), entidades(m[2])]));
  const xfs = /<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/.exec(estilos)?.[1] || '';
  const estiloData = [...xfs.matchAll(/<xf\b[^>]*?(?:\/>|>)/g)].map(m => { const id = Number(/numFmtId="(\d+)"/.exec(m[0])?.[1] || 0); return DATAS_EMBUTIDAS.has(id) || (personalizados.has(id) && ehFormatoDeData(personalizados.get(id))); });
  const col = ref => [...ref.replace(/\d+/g, '')].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
  return folhas.map((f, i) => {
    const linhas = [...z.get(f)().matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map(r => {
      const cel = [];
      for (const c of r[1].matchAll(/<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const v = /<v>([\s\S]*?)<\/v>/.exec(c[3] || '')?.[1] ?? /<t[^>]*>([\s\S]*?)<\/t>/.exec(c[3] || '')?.[1] ?? '';
        // Fórmula: vai junto do valor (quem audita precisa dela); sem valor guardado no arquivo, só a fórmula, em vez
        // de uma célula que pareceria vazia (QA em produção: impostos "em branco" que eram =B7*0.6).
        const f = /<f\b[^>]*>([\s\S]*?)<\/f>/.exec(c[3] || '')?.[1];
        const estilo = Number(/\bs="(\d+)"/.exec(c[2])?.[1] ?? -1);
        const data = !/t="(s|str|inlineStr|b|e)"/.test(c[2]) && v !== '' && estiloData[estilo] ? dataDoExcel(v) : null;
        const valor = /t="s"/.test(c[2]) ? compart[Number(v)] ?? '' : data ?? entidades(v);
        cel[col(c[1])] = f ? (valor !== '' ? `${valor} (=${entidades(f).slice(0, 200)})` : `=${entidades(f).slice(0, 200)}`) : valor;
      }
      return Array.from(cel, x => x ?? '');
    }).filter(l => l.join('').trim());
    // Planilha com muitas linhas: os cálculos conferidos (totais, por categoria, extremos) vão junto (planilha.js).
    const largura = Math.max(0, ...linhas.map(l => l.length));
    const resumo = resumoDeTabela(linhas[0] || [], linhas.slice(1).map(l => Array.from({ length: largura }, (_, k) => l[k] ?? '')));
    return `# Planilha: ${nomes[i] || `Planilha ${i + 1}`}\n${linhas.map(l => l.join(';')).join('\n')}${resumo ? `\n\n${resumo}` : ''}`;
  }).join('\n\n').trim();
}

// Imagem a partir da qual o PDF é tratado como escaneado (páginas inteiras em imagem). Logotipos e ícones de um PDF
// digital ficam abaixo disso, e o PDF segue sem passar pelo OCR.
const PIXELS_DE_PAGINA = 1_000_000;
// Maior PDF cujo texto digital é lido (o limite do envio é 42 MB); o OCR continua com os limites de ocr.js.
const LIMITE_PDF_TEXTO_MB = 45;
const PAGINA_NAO_LIDA = '[Esta página só tem imagem e não foi lida. O texto dela não está no material.]';

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
  // OCR só das páginas sem texto. Se o OCR não couber (tamanho, páginas, memória, tempo) ou não ler nada, e o PDF
  // tiver texto digital em outras páginas (apresentação com fotos, relatório com anexos escaneados), segue com esse
  // texto e marca as páginas não lidas, em vez de recusar o arquivo inteiro.
  const completarComOcr = async (paginas, total) => {
    const escaneadas = escaneadasDe(paginas);
    if (!escaneadas.length) return montar(paginas, total);
    const comTexto = paginas.length - escaneadas.length;
    try {
      conferir(escaneadas);
      const lidos = await sessao(ocr, { ...meta, paginas: escaneadas.length }, ler => ler.pdf(b, escaneadas));
      escaneadas.forEach((i, k) => { paginas[i] = lidos[k]; });
      if (comTexto && semTexto(escaneadas.map(i => paginas[i]).join(''))) throw new ErroOcr('erro');
    } catch (e) {
      if (!comTexto || !(e instanceof ErroOcr || TECNICOS.has(e?.codigo))) throw e;
      escaneadas.forEach(i => { if (!String(paginas[i] || '').trim()) paginas[i] = PAGINA_NAO_LIDA; });
      return montar(paginas, total);
    }
    return legivelOuAviso(montar(paginas, total), escaneadas.length);
  };
  if (maiorImagem < PIXELS_DE_PAGINA) {
    // PDF digital: texto no próprio processo, como sempre. Página sem texto com imagem pequena vai para o OCR.
    const { paginas, total } = await textoDoPdf(b);
    if (!imagens.length) return montar(paginas, total);
    return completarComOcr(paginas, total);
  }
  // PDF com imagens grandes (escaneado ou apresentação): o texto digital primeiro, num processo de vida curta e com a
  // guarda de memória só da leitura de texto (sem o custo do OCR, que talvez nem seja preciso).
  if (b.length > LIMITE_PDF_TEXTO_MB * 1048576) throw new ErroOcr('grande');
  const { paginas, total } = await sessao(ocr, { tipo: 'texto_pdf', bytes: b.length, pixels: 0, pixelsDecodificar: 0, ...op }, ler => ler.textoPdf(b));
  return completarComOcr(paginas, total);
}

// PDF que passou pelo OCR e não tem texto legível em página nenhuma: aviso de que o conteúdo visual não é
// interpretado (sem OCR, o PDF vazio continua com o aviso geral de arquivo sem texto).
const semTexto = t => !t.replace(/\[(Página|Slide) \d+\]/g, '').trim();
function legivelOuAviso(texto, escaneadas) {
  if (escaneadas && semTexto(texto)) throw erro(422, 'sem_texto', MSG_PDF_SEM_TEXTO);
  return texto;
}

// Imagem: tamanho, dimensões e formato conferidos antes do OCR, pelo cabeçalho. Acima da resolução de leitura, a
// imagem é decodificada e reduzida (em cinza) no processo de OCR, antes do tesseract subir.
async function imagem(b, ocr, op) {
  const L = op.limites, d = dimensoes(b), px = d ? d.largura * d.altura : null;
  if (b.length > L.maxImagemMb * 1048576 || (px && px > L.pixelsEntrada)) throw new ErroOcr('grande');
  const reduzir = px && px > L.pixelsLeitura;
  if (reduzir && !['png', 'jpeg'].includes(d.formato)) throw new ErroOcr('grande');   // sem como reduzir com segurança
  const texto = await sessao(ocr, { tipo: `imagem/${d?.formato || 'desconhecida'}`, bytes: b.length, pixels: px ? Math.min(px, L.pixelsLeitura) : null, pixelsDecodificar: reduzir ? px : 0, ...op }, ler => ler.imagem(b));
  // O OCR rodou e nada saiu legível (foto, gráfico, exame de imagem): aviso de que o conteúdo visual não é lido.
  if (!String(texto || '').trim()) throw erro(422, 'sem_texto', MSG_IMAGEM_SEM_TEXTO);
  return texto;
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
      if (ext === 'zip') texto = projetoZip(b);
      else if (!['docx', 'xlsx', 'pptx'].includes(ext)) throw erro(415, 'formato', `arquivo compactado não aceito. Use ${FORMATOS}.`);
      else texto = ext === 'xlsx' ? xlsx(b) : ext === 'pptx' ? pptx(b) : docx(b);
    }
    else if (['txt', 'md', 'csv'].includes(ext)) {
      if (b.subarray(0, 4096).includes(0)) throw erro(415, 'formato', 'não é um arquivo de texto.');
      texto = decodificar(b);
      if (ext === 'csv') { const resumo = resumoDeCsv(texto); if (resumo) texto = `${texto.trim()}\n\n${resumo}`; }
    } else throw erro(415, 'formato', `formato não aceito. Use ${FORMATOS}.`);
  } catch (e) {
    if (e instanceof ErroOcr) throw erroDeOcr(e);
    if (e.status) throw TECNICOS.has(e.codigo) ? e : erro(e.status, e.codigo, `${nome}: ${e.message}`);
    throw erro(400, 'arquivo_invalido', `${nome}: não foi possível ler o arquivo.`);
  }
  if (semTexto(texto)) throw erro(422, 'sem_texto', MSG_SEM_TEXTO);
  if (texto.length > maxCaracteres) throw erro(413, 'texto_grande', onde === 'anexo'
    ? `${nome}: tem cerca de ${paginasDe(texto.length)} páginas de texto. No chat, cada anexo pode ter até ${paginasDe(maxCaracteres)} páginas, porque vai inteiro para a IA e consome créditos a cada resposta. Envie só a parte necessária, ou coloque o documento na base de conhecimento, que usa apenas os trechos relevantes.`
    : `${nome}: tem cerca de ${paginasDe(texto.length)} páginas de texto; o máximo é ${paginasDe(maxCaracteres)} páginas por documento. Divida o arquivo em partes.`);
  // Estilo do material (cores e fontes), para "no mesmo layout". Falha aqui nunca impede a leitura do texto.
  let estilo = null;
  try {
    if (b.subarray(0, 4).toString() === '%PDF') estilo = estiloDoPdf(b);
    else if (ext === 'pptx' || ext === 'docx') estilo = estiloDoTema(lerZip(b).get(ext === 'pptx' ? 'ppt/theme/theme1.xml' : 'word/theme/theme1.xml')?.());
  } catch { estilo = null; }
  return { nome, texto, bytes: b.length, ...(estilo ? { estilo } : {}) };
}
