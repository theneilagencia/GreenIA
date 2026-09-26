// Extração de texto dos arquivos enviados (bases, arquivos de quick win e
// anexos). Sem OCR: imagem e PDF escaneado são recusados com orientação.
import { inflateRawSync } from 'node:zlib';
import { extractText, getDocumentProxy } from 'unpdf';
import { erro } from './http.js';

export const MSG_IMAGEM = 'Este arquivo parece ser uma imagem. Envie a versão em texto ou em PDF digital';
const MAX_ARQUIVO_MB = 20;
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

async function pdf(b) {
  const doc = await getDocumentProxy(new Uint8Array(b));
  const { text, totalPages } = await extractText(doc, { mergePages: false });
  const paginas = text.map(t => t.trim());
  // Pouco texto por página: é escaneado (imagem), e não há OCR nesta versão.
  if (paginas.join('').replace(/\s/g, '').length < 30 * Math.max(1, totalPages) / 2) throw erro(415, 'imagem', MSG_IMAGEM);
  return paginas.map((t, i) => (totalPages > 1 ? `[Página ${i + 1}]\n${t}` : t)).join('\n\n');
}

const decodificar = b => {
  const u = b.toString('utf8');
  return u.includes('�') ? b.toString('latin1') : u.replace(/^﻿/, '');
};

/** Extrai o texto de um arquivo enviado em base64. @returns {Promise<{nome: string, texto: string}>} */
export async function extrairTexto({ nome, base64 }) {
  nome = String(nome || 'arquivo').slice(0, 200);
  const b = Buffer.from(String(base64 || ''), 'base64');
  if (!b.length) throw erro(400, 'vazio', `${nome}: arquivo vazio.`);
  if (b.length > MAX_ARQUIVO_MB * 1024 * 1024) throw erro(413, 'arquivo_grande', `${nome}: acima de ${MAX_ARQUIVO_MB} MB.`);
  if (ehImagem(b)) throw erro(415, 'imagem', MSG_IMAGEM);
  const ext = (nome.split('.').pop() || '').toLowerCase();
  let texto;
  try {
    if (b.subarray(0, 4).toString() === '%PDF') texto = await pdf(b);
    else if (b[0] === 0x50 && b[1] === 0x4b) texto = ext === 'xlsx' ? xlsx(b) : docx(b);
    else if (['txt', 'md', 'csv'].includes(ext)) {
      if (b.subarray(0, 4096).includes(0)) throw erro(415, 'formato', 'não é um arquivo de texto.');
      texto = decodificar(b);
    } else throw erro(415, 'formato', 'formato não aceito. Use PDF com texto, DOCX, TXT, MD, CSV ou XLSX.');
  } catch (e) {
    if (e.status) throw e.codigo === 'imagem' ? e : erro(e.status, e.codigo, `${nome}: ${e.message}`);
    throw erro(400, 'arquivo_invalido', `${nome}: não foi possível ler o arquivo.`);
  }
  if (!texto.trim()) throw erro(415, 'imagem', MSG_IMAGEM);
  return { nome, texto };
}
