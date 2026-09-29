// OCR local, para imagem e PDF escaneado. É só uma forma de LER o arquivo: o texto lido segue exatamente o
// mesmo caminho do texto de um arquivo digital (arquivo → OCR → classificação → governança → elegibilidade →
// processamento) e a mesma retenção. Nada de governança acontece aqui.
//
// Onde o conteúdo fica: só na memória. A imagem não sai para outro serviço nem para o disco; os dados do idioma
// vêm do pacote instalado (sem download e sem cache em disco). Cada arquivo é lido num processo de OCR próprio
// (ocr-processo.js), que recebe as imagens pela IPC e acaba no fim do arquivo (inclusive em erro, tempo esgotado,
// cancelamento ou estouro de memória, à força): nada de uma pessoa ou empresa fica disponível para outra, e a
// memória da leitura volta ao sistema.
//
// Proteção da infraestrutura (limites técnicos, não de política). Medido (docs/ocr-memoria.md):
//   • uma leitura por vez no processo inteiro (todas as empresas), com espera curta e sem fila persistente;
//   • limites de tamanho, de páginas e de pixels; imagem acima da resolução de leitura é reduzida antes do OCR;
//   • PDF página a página: cada página é decodificada, reduzida, lida e liberada antes da próxima;
//   • guarda de memória antes de começar e vigilância (servidor + processo de OCR) durante a leitura.
import { deflateSync, crc32 } from 'node:zlib';
import { createRequire } from 'node:module';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const num = (v, padrao) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : padrao);
// Limites centralizados, ajustáveis por variável de ambiente. Só capacidade da infraestrutura.
export function lerLimitesOcr(env = process.env) {
  return {
    simultaneas: Math.max(1, Math.floor(num(env.OCR_SIMULTANEAS, 1))),
    maxImagemMb: num(env.OCR_MAX_IMAGE_MB, 10),
    // PDF com páginas escaneadas. Medido numa instância de 512 MB: até ~20 páginas A4 a 300 dpi (13 MB) com folga;
    // 30 páginas (20 MB) passam do limite de memória. Com 1 GB ou mais, 25 é seguro.
    maxPdfMb: num(env.OCR_MAX_PDF_MB, 15),
    maxPdfPaginas: Math.floor(num(env.OCR_MAX_PDF_PAGINAS, 30)),
    // Pixels entregues ao OCR: ~4 MP (≈ 200 dpi numa A4). Acima disso a imagem é reduzida, em cinza. Medido: mesma
    // precisão a 9, 6, 4 e 2,5 MP na página de teste; menos memória e tempo a cada redução.
    pixelsLeitura: num(env.OCR_PIXELS_LEITURA, 4_000_000),
    // Maior imagem que o servidor aceita decodificar para reduzir (foto de celular de 12 MP, scan A4 de até ~400 dpi).
    // Acima: recusa técnica antes de abrir.
    pixelsEntrada: num(env.OCR_PIXELS_ENTRADA, 24_000_000),
    // Memória total (servidor + processo de OCR) que a leitura não pode ultrapassar. Instância de 512 MB: o maior
    // pico medido foi ~420 MB; 450 deixa ~60 MB de margem, e acima dele o processo de OCR é encerrado na hora.
    memoriaMaxMb: num(env.OCR_MEMORIA_MAX_MB, 450),
    esperaMs: num(env.OCR_ESPERA_MS, 60_000),        // quanto uma leitura espera a vez antes da resposta técnica
    filaMax: Math.floor(num(env.OCR_FILA_MAX, 2)),     // quantas podem esperar (cada uma segura o arquivo na memória)
    // PDF longo: o processo de OCR é trocado a cada N páginas (a memória dele cresce um pouco a cada página e só
    // volta ao sistema quando ele acaba). Medido: +225 MB com 1 página, +287 com 5, +317 com 10.
    paginasPorProcesso: Math.floor(num(env.OCR_PAGINAS_POR_PROCESSO, 3)),
    tempoPaginaMs: num(env.OCR_TEMPO_PAGINA_MS, 60_000),
    tempoTotalMs: num(env.OCR_TEMPO_TOTAL_MS, 240_000),
    metricas: env.OCR_METRICAS !== '0',
  };
}
export const LIMITES_OCR = lerLimitesOcr();

// Mensagens técnicas (limite de leitura ou de capacidade). Nunca falam de política, dado ou segurança, e nunca
// revelam fornecedor, memória ou infraestrutura.
export const MSG_SEM_TEXTO = 'Este arquivo não contém texto que o GreenIA consiga ler neste momento.';
export const MSG_GRANDE = 'Este arquivo é grande demais para ser processado com segurança neste momento. Tente um arquivo menor ou divida o documento em partes.';
export const MSG_OCUPADO = 'A leitura de imagens e PDFs escaneados está ocupada agora. Tente de novo em alguns instantes.';
export const OCR_PAGINAS = LIMITES_OCR.maxPdfPaginas;

/** Recusa ou falha técnica do OCR. motivo: grande | memoria | ocupado | tempo | cancelado | erro | indisponivel */
export class ErroOcr extends Error {
  constructor(motivo) { super(motivo); this.motivo = motivo; }
}

const CONFIANCA_MINIMA = 30;            // abaixo disso, o que foi "lido" é ruído
// Custo estimado de uma leitura (medido, com margem; docs/ocr-memoria.md), somado à memória do servidor. O OCR
// roda num processo à parte, que acaba no fim do arquivo. Nele, a imagem grande é decodificada e reduzida antes
// de o tesseract subir: numa imagem, os dois custos não se somam; num PDF, a página seguinte é decodificada com o
// tesseract já aberto.
const PROCESSO_MB = 50;                 // Node do processo de OCR
const TESSERACT_MB = 130;               // tesseract com o idioma
const BYTES_POR_PIXEL = 9;              // imagem lida (cópias no processo + estruturas do tesseract)
const BYTES_DECODIFICAR = 3.5;          // decodificar uma imagem grande (pixels crus + cópias do leitor)
const COPIAS_DO_PDF = 2.5;              // o PDF vai por cópia ao processo de OCR e o leitor de PDF monta outra
const estimativaMb = (meta, L) => {
  const leitura = TESSERACT_MB + ((meta.pixels || L.pixelsLeitura) * BYTES_POR_PIXEL) / 1048576;
  const decodificar = ((meta.pixelsDecodificar || 0) * BYTES_DECODIFICAR) / 1048576;
  return PROCESSO_MB + (meta.tipo === 'pdf' ? leitura + decodificar + (meta.bytes * COPIAS_DO_PDF) / 1048576 : Math.max(leitura, decodificar));
};
export const rssMb = () => Math.round(process.memoryUsage().rss / 1048576);

// Sem o pacote (instalação sem a dependência), o OCR fica indisponível e o arquivo recebe a mensagem técnica.
let disponivel;
function ocrDisponivel() {
  if (disponivel === undefined) {
    try { const req = createRequire(import.meta.url); req.resolve('tesseract.js'); req.resolve('@tesseract.js-data/por'); disponivel = true; } catch { disponivel = false; }
  }
  return disponivel;
}
const PROCESSO = fileURLToPath(new URL('./ocr-processo.js', import.meta.url));

// ------------------------------------------------------------------ Concorrência (processo inteiro)
// Uma vaga por leitura, para o processo todo: duas empresas ou duas pessoas não começam OCR ao mesmo tempo
// além do limite. Quem chega espera a vez (só na memória, com prazo) ou recebe a resposta técnica.
const estado = { emUso: 0, fila: [], maxEmUso: 0 };
export const estadoOcr = () => ({ emUso: estado.emUso, esperando: estado.fila.length, maxEmUso: estado.maxEmUso });
export const zerarMaxOcr = () => { estado.maxEmUso = estado.emUso; };

function vaga(L, sinal) {
  const ocupar = () => { estado.emUso++; estado.maxEmUso = Math.max(estado.maxEmUso, estado.emUso); };
  if (estado.emUso < L.simultaneas) { ocupar(); return Promise.resolve(); }
  if (estado.fila.length >= L.filaMax) return Promise.reject(new ErroOcr('ocupado'));
  return new Promise((ok, falha) => {
    const item = { ok: () => { limpar(); ocupar(); ok(); } };
    const sair = motivo => { const i = estado.fila.indexOf(item); if (i >= 0) estado.fila.splice(i, 1); limpar(); falha(new ErroOcr(motivo)); };
    const relogio = setTimeout(() => sair('ocupado'), L.esperaMs);
    const cancelar = () => sair('cancelado');
    sinal?.addEventListener('abort', cancelar, { once: true });
    const limpar = () => { clearTimeout(relogio); sinal?.removeEventListener('abort', cancelar); };
    estado.fila.push(item);
  });
}
function liberarVaga() {
  estado.emUso--;
  const prox = estado.fila.shift();
  if (prox) prox.ok();
}

// ------------------------------------------------------------------ Métricas (só números técnicos)
const ultimas = [];
let registrarMetrica = null;
/** Onde as métricas vão (o log do servidor). Nunca recebem conteúdo: só tamanhos, tempos, memória e resultado. */
export function configurarOcr({ log } = {}) { if (log) registrarMetrica = log; }
export const metricasOcr = () => ultimas.slice();
function medir(m, L) {
  ultimas.push(m); if (ultimas.length > 50) ultimas.shift(); if (process.env.DBG_OCR) console.error('OCRDBG', JSON.stringify(m));
  if (L.metricas && registrarMetrica) registrarMetrica('ocr', JSON.stringify(m));
}

/**
 * Sessão de OCR: pega a vaga, confere a memória, sobe o processo de OCR, entrega `ler` e encerra tudo no fim.
 * Cada página tem prazo; a sessão tem prazo total; a memória (servidor + OCR) é vigiada durante a leitura.
 * @param {{ tipo: string, bytes: number, paginas?: number, pixels?: number, sinal?: AbortSignal, limites?: object }} meta
 * @param {(ler: { imagem: (b: Buffer) => Promise<string>, pdf: (b: Buffer, indices: number[]) => Promise<string[]> }) => Promise<any>} fn
 */
export async function sessaoOcr(meta, fn) {
  const L = meta.limites || LIMITES_OCR;
  const m = { tipo: meta.tipo, bytes: meta.bytes, paginas: meta.paginas ?? 1, pixels: meta.pixels ?? null, rss_antes: rssMb(), rss_pico: null, rss_depois: null, ms: null, resultado: null, motivo: null };
  const inicio = Date.now();
  let filho = null, rssFilho = 0, vigia = null, relogioTotal = null, falhou = null, comVaga = false;
  const pendentes = new Map();
  const matar = () => { try { filho?.kill('SIGKILL'); } catch { /* já saiu */ } };
  const abortar = motivo => {
    if (falhou) return;
    falhou = new ErroOcr(motivo);
    matar();
    for (const p of pendentes.values()) p.falha(falhou);
    pendentes.clear();
  };
  const cancelar = () => abortar('cancelado');
  // O processo de OCR acaba (e a memória dele volta ao sistema): pedido educado, depois à força.
  let subindo = null;
  const encerrarFilho = async () => {
    const f = filho;
    if (f && f.exitCode === null && f.signalCode === null) {
      await new Promise(ok => { f.once('exit', ok); try { f.send({ t: 'fim' }); } catch { ok(); } setTimeout(() => { try { f.kill('SIGKILL'); } catch { /* já saiu */ } ok(); }, 2000).unref(); });
    }
    filho = null; subindo = null; rssFilho = 0;
  };
  try {
    if (!ocrDisponivel()) throw new ErroOcr('indisponivel');
    if (meta.sinal?.aborted) throw new ErroOcr('cancelado');
    await vaga(L, meta.sinal);
    comVaga = true;
    // Guarda de memória: só começa se a leitura estimada (processo de OCR + pixels lidos + imagem a decodificar,
    // quando houver) couber abaixo do limite operacional.
    const estimada = estimativaMb(meta, L);
    m.rss_antes = rssMb();
    if (m.rss_antes + estimada > L.memoriaMaxMb) throw new ErroOcr('memoria');
    m.rss_pico = m.rss_antes;
    meta.sinal?.addEventListener('abort', cancelar, { once: true });
    // Vigilância: memória do servidor + a do processo de OCR, a cada 50 ms.
    vigia = setInterval(() => { const r = rssMb() + rssFilho; m.rss_pico = Math.max(m.rss_pico, r); if (r > L.memoriaMaxMb) abortar('memoria'); }, 50);
    relogioTotal = setTimeout(() => abortar('tempo'), L.tempoTotalMs);
    // O processo sobe na primeira leitura: quem chama pode decodificar e reduzir a imagem antes, já com a vaga.
    let seq = 0;
    const subir = () => (subindo ??= new Promise((ok, falha) => {
      filho = fork(PROCESSO, [], { serialization: 'advanced', stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
        env: { PATH: process.env.PATH, MALLOC_ARENA_MAX: process.env.MALLOC_ARENA_MAX || '2', NODE_OPTIONS: '' }, execArgv: ['--disable-warning=ExperimentalWarning'] });
      filho.on('message', x => {
        if (x?.t === 'rss') rssFilho = x.rss;
        else if (x?.t === 'pronto') { rssFilho = x.rss; ok(); }
        else if (x?.t === 'pagina') pendentes.get(x.id)?.pagina();
        else if (x?.t === 'lido' || x?.t === 'falha') { const p = pendentes.get(x.id); pendentes.delete(x.id); p?.[x.t === 'lido' ? 'ok' : 'falha'](x.t === 'lido' ? x : new ErroOcr(x.motivo === 'grande' ? 'grande' : 'erro')); }
      });
      const este = filho;
      filho.on('exit', () => { if (filho !== este) return; rssFilho = 0; const e = falhou || new ErroOcr('erro'); falha(e); for (const p of pendentes.values()) p.falha(e); pendentes.clear(); });
      filho.on('error', () => abortar('erro'));
    }));
    // Pedido ao processo de OCR, com prazo por página (renovado a cada página lida do PDF).
    const pedir = (msg, prazoMs) => new Promise((ok, falha) => {
      const id = ++seq;
      let relogio = setTimeout(() => abortar('tempo'), prazoMs);
      pendentes.set(id, {
        ok: x => { clearTimeout(relogio); ok(x); },
        falha: e => { clearTimeout(relogio); falha(e); },
        pagina: () => { clearTimeout(relogio); relogio = setTimeout(() => abortar('tempo'), L.tempoPaginaMs); },
      });
      filho.send({ ...msg, id, pixelsLeitura: L.pixelsLeitura });
    });
    const chamar = async (msg, prazoMs) => {
      if (falhou) throw falhou;
      await subir();
      if (falhou) throw falhou;
      try { return await pedir(msg, prazoMs); } catch (e) { throw falhou || (e instanceof ErroOcr ? e : new ErroOcr('erro')); }
    };
    // textoPdf(bytes): texto digital de cada página. imagem(b): lê uma imagem (reduzida no processo de OCR, se
    // passar da resolução de leitura).
    // pdf(bytes, indices): lê as páginas escaneadas, uma por vez, e devolve o texto de cada uma.
    const ler = {
      // Texto digital do PDF num processo de vida curta (a memória do leitor de PDF volta ao sistema em seguida).
      textoPdf: async pdf => { const r = await chamar({ t: 'texto_pdf', pdf }, L.tempoPaginaMs); await encerrarFilho(); return r; },
      imagem: async img => (await chamar({ t: 'imagem', img }, L.tempoPaginaMs)).texto,
      pdf: async (pdf, indices) => {
        const textos = [];
        for (let k = 0; k < indices.length; k += L.paginasPorProcesso) {
          if (k) await encerrarFilho();   // troca o processo de OCR entre os lotes de páginas
          textos.push(...(await chamar({ t: 'pdf', pdf, indices: indices.slice(k, k + L.paginasPorProcesso) }, L.tempoPaginaMs)).textos);
        }
        return textos;
      },
    };
    const r = await fn(ler);
    if (falhou) throw falhou;
    m.resultado = 'ok';
    return r;
  } catch (e) {
    m.resultado = 'recusado'; m.motivo = e instanceof ErroOcr ? e.motivo : (e?.codigo || 'erro');
    throw e instanceof ErroOcr || e?.status ? e : new ErroOcr('erro');
  } finally {
    clearInterval(vigia); clearTimeout(relogioTotal);
    meta.sinal?.removeEventListener('abort', cancelar);
    falhou ??= new ErroOcr('encerrado');
    await encerrarFilho();
    if (comVaga) liberarVaga();
    m.ms = Date.now() - inicio;
    m.rss_depois = rssMb();
    medir(m, L);
  }
}

/**
 * Leitor padrão: recebe imagens e devolve o texto de cada uma, na ordem, numa única sessão.
 * Devolve null quando o OCR não está disponível. @param {Buffer[]} imagens @returns {Promise<string[] | null>}
 */
export async function lerImagens(imagens, meta = {}) {
  try {
    return await sessaoOcr({ tipo: 'imagem', bytes: imagens.reduce((t, b) => t + b.length, 0), ...meta }, async ler => {
      const out = [];
      for (const img of imagens) out.push(await ler.imagem(img));
      return out;
    });
  } catch (e) {
    if (e instanceof ErroOcr && e.motivo === 'indisponivel') return null;
    throw e;
  }
}
lerImagens.sessao = sessaoOcr;   // PDF: uma sessão para o arquivo inteiro, página a página

// ------------------------------------------------------------------ Imagens: dimensões, decodificação e redução

/** Largura e altura pelo cabeçalho, sem decodificar. null se o formato não for reconhecido. */
export function dimensoes(b) {
  if (b.length > 24 && b[0] === 0x89 && b.subarray(1, 4).toString() === 'PNG') return { formato: 'png', largura: b.readUInt32BE(16), altura: b.readUInt32BE(20) };
  if (b[0] === 0xff && b[1] === 0xd8) {
    for (let i = 2; i + 9 < b.length;) {
      if (b[i] !== 0xff) { i++; continue; }
      const mk = b[i + 1];
      if (mk === 0xd8 || mk === 0x01 || (mk >= 0xd0 && mk <= 0xd7)) { i += 2; continue; }
      if ((mk >= 0xc0 && mk <= 0xcf) && ![0xc4, 0xc8, 0xcc].includes(mk)) return { formato: 'jpeg', altura: b.readUInt16BE(i + 5), largura: b.readUInt16BE(i + 7) };
      i += 2 + b.readUInt16BE(i + 2);
    }
    return null;
  }
  if (b.subarray(0, 4).toString() === 'GIF8') return { formato: 'gif', largura: b.readUInt16LE(6), altura: b.readUInt16LE(8) };
  if (b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP') {
    const f = b.subarray(12, 16).toString();
    if (f === 'VP8X') return { formato: 'webp', largura: 1 + b.readUIntLE(24, 3), altura: 1 + b.readUIntLE(27, 3) };
    if (f === 'VP8L') { const v = b.readUInt32LE(21); return { formato: 'webp', largura: (v & 0x3fff) + 1, altura: ((v >> 14) & 0x3fff) + 1 }; }
    if (f === 'VP8 ') return { formato: 'webp', largura: b.readUInt16LE(26) & 0x3fff, altura: b.readUInt16LE(28) & 0x3fff };
    return null;
  }
  const le = b[0] === 0x49 && b[1] === 0x49, be = b[0] === 0x4d && b[1] === 0x4d;
  if (le || be) {
    const u16 = o => (le ? b.readUInt16LE(o) : b.readUInt16BE(o)), u32 = o => (le ? b.readUInt32LE(o) : b.readUInt32BE(o));
    const ifd = u32(4); if (ifd + 2 > b.length) return null;
    let largura = null, altura = null;
    for (let k = 0, n = u16(ifd); k < n && ifd + 2 + k * 12 + 12 <= b.length; k++) {
      const e = ifd + 2 + k * 12, tag = u16(e), tipo = u16(e + 2), v = tipo === 3 ? u16(e + 8) : u32(e + 8);
      if (tag === 256) largura = v; if (tag === 257) altura = v;
    }
    return largura && altura ? { formato: 'tiff', largura, altura } : null;
  }
  return null;
}

// PNG de 8 bits sem entrelaçamento, decodificado sem biblioteca (só para reduzir uma imagem grande antes do OCR).
// O resultado é reaproveitado no mesmo buffer (sem cópia extra): a memória máxima é a de uma imagem crua.
export function decodificarPng(b, { inflar }) {
  let p = 8, w, h, profundidade, cor, entrelacada, paleta = null;
  const idat = [];
  while (p + 8 <= b.length) {
    const tam = b.readUInt32BE(p), tipo = b.subarray(p + 4, p + 8).toString('latin1'), d = b.subarray(p + 8, p + 8 + tam);
    if (tipo === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); profundidade = d[8]; cor = d[9]; entrelacada = d[12]; }
    else if (tipo === 'PLTE') paleta = d;
    else if (tipo === 'IDAT') idat.push(d);
    else if (tipo === 'IEND') break;
    p += 12 + tam;
  }
  const canais = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[cor];
  if (!w || !h || profundidade !== 8 || entrelacada || !canais || (cor === 3 && !paleta)) return null;
  const linha = w * canais;
  const cru = inflar(Buffer.concat(idat), (linha + 1) * h);
  idat.length = 0;
  // Desfiltra no próprio buffer, compactando as linhas (tira o byte de filtro de cada uma).
  for (let y = 0; y < h; y++) {
    const f = cru[y * (linha + 1)], o = y * (linha + 1) + 1, dst = y * linha, ant = (y - 1) * linha;
    for (let x = 0; x < linha; x++) {
      const a = x >= canais ? cru[dst + x - canais] : 0, c = y > 0 ? cru[ant + x] : 0, ac = y > 0 && x >= canais ? cru[ant + x - canais] : 0;
      let v = cru[o + x];
      if (f === 1) v += a; else if (f === 2) v += c; else if (f === 3) v += (a + c) >> 1;
      else if (f === 4) { const pp = a + c - ac, pa = Math.abs(pp - a), pb = Math.abs(pp - c), pc = Math.abs(pp - ac); v += pa <= pb && pa <= pc ? a : pb <= pc ? c : ac; }
      cru[dst + x] = v & 0xff;
    }
  }
  const data = cru.subarray(0, linha * h);
  if (cor === 3) {   // paleta: vira cinza direto
    const cinza = Buffer.alloc(w * h);
    for (let i = 0; i < w * h; i++) { const k = data[i] * 3; cinza[i] = (paleta[k] * 77 + paleta[k + 1] * 150 + paleta[k + 2] * 29) >> 8; }
    return { data: cinza, width: w, height: h, channels: 1 };
  }
  return { data, width: w, height: h, channels: canais };
}

/**
 * Pixels (de um PDF ou de uma imagem decodificada) em tons de cinza, reduzidos por média de área até caber em
 * `maxPixels`. Cinza e resolução de leitura bastam para o OCR em português e usam bem menos memória.
 */
export function reduzirParaLeitura({ data, width, height, channels }, maxPixels) {
  const escala = Math.min(1, Math.sqrt(maxPixels / (width * height)));
  const W = Math.max(1, Math.floor(width * escala)), H = Math.max(1, Math.floor(height * escala));
  const out = Buffer.alloc(W * H), soma = new Float64Array(W), conta = new Uint32Array(W);
  const lum = i => {
    if (channels === 1) return data[i];
    if (channels === 2) return 255 - ((255 - data[i]) * data[i + 1]) / 255;   // sobre fundo branco
    const v = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
    return channels === 4 ? 255 - ((255 - v) * data[i + 3]) / 255 : v;
  };
  let oy = 0;
  for (let y = 0; y < height; y++) {
    const destino = Math.min(H - 1, Math.floor(y * H / height));
    if (destino !== oy) { for (let x = 0; x < W; x++) { out[oy * W + x] = conta[x] ? soma[x] / conta[x] : 255; soma[x] = 0; conta[x] = 0; } oy = destino; }
    for (let x = 0, i = y * width * channels; x < width; x++, i += channels) { const ox = Math.min(W - 1, Math.floor(x * W / width)); soma[ox] += lum(i); conta[ox]++; }
  }
  for (let x = 0; x < W; x++) out[oy * W + x] = conta[x] ? soma[x] / conta[x] : 255;
  return { data: out, width: W, height: H, channels: 1 };
}

// Pixels em PNG, sem biblioteca de imagem.
export function pngDePixels({ data, width, height, channels }) {
  const tipo = { 1: 0, 2: 4, 3: 2, 4: 6 }[channels];
  if (tipo === undefined || !width || !height) return null;
  const linha = width * channels;
  const cru = Buffer.alloc((linha + 1) * height);
  const px = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  for (let y = 0; y < height; y++) px.copy(cru, y * (linha + 1) + 1, y * linha, (y + 1) * linha);
  const bloco = (nome, conteudo) => {
    const tam = Buffer.alloc(4); tam.writeUInt32BE(conteudo.length);
    const nc = Buffer.concat([Buffer.from(nome, 'latin1'), conteudo]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(nc) >>> 0);
    return Buffer.concat([tam, nc, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = tipo;
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), bloco('IHDR', ihdr), bloco('IDAT', deflateSync(cru, { level: 1 })), bloco('IEND', Buffer.alloc(0))]);
}

/**
 * Imagens de um PDF por página, sem decodificar: largura e altura de cada imagem, lidas dos dicionários
 * (o dicionário de um stream de imagem nunca fica comprimido dentro de um object stream).
 */
export function imagensDoPdf(b) {
  const s = b.toString('latin1'), out = [];
  for (const m of s.matchAll(/\/Subtype\s*\/Image/g)) {
    const ini = s.lastIndexOf('<<', m.index), fim = s.indexOf('stream', m.index);
    const dic = s.slice(Math.max(0, ini - 400), fim < 0 ? m.index + 600 : Math.min(fim, m.index + 1200));
    const w = Number(/\/Width\s+(\d+)/.exec(dic)?.[1]), h = Number(/\/Height\s+(\d+)/.exec(dic)?.[1]);
    if (w && h) out.push({ largura: w, altura: h });
  }
  return out;
}
