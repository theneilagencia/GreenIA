// Funções puras da GreenIA, sem dependência do runtime do Claude Design.
//
// O runtime (support.js) avalia o <script data-dc-script> com `new Function`
// e não importa arquivos. Por isso o bloco entre os marcadores abaixo é
// copiado literalmente para GreenIA.dc.html. scripts/check-sync.mjs falha se
// as duas cópias divergirem. Edite aqui e rode `node scripts/check-sync.mjs --write`.

// >>> greenia-core
// ---- Typewriter -------------------------------------------------------------
const TYPEWRITER_MAX_MS = 1200;
const TYPEWRITER_FRAME_MS = 1000 / 60;

// Caracteres por quadro para que o texto inteiro apareça em ~maxMs.
function typewriterChunk(length, maxMs = TYPEWRITER_MAX_MS, frameMs = TYPEWRITER_FRAME_MS) {
  const frames = Math.max(1, Math.floor(maxMs / frameMs));
  return Math.max(1, Math.ceil(length / frames));
}

// Quantos caracteres mostrar após `elapsed` ms, tendo mostrado `shown`.
// Avança ao menos um bloco por quadro e nunca fica atrás do relógio, então
// mesmo com quadros lentos o total não passa de maxMs.
function typewriterNext(length, shown, elapsed, chunk, maxMs = TYPEWRITER_MAX_MS) {
  const byClock = Math.ceil(length * Math.min(1, elapsed / maxMs));
  return Math.min(length, Math.max(shown + chunk, byClock));
}

// ---- Dados sensíveis ----------------------------------------------------------
// Primeira camada: roda antes de qualquer chamada ao modelo. A recusa pela
// persona continua como segunda camada.

const SENSITIVE_LABELS = {
  cpf: 'CPF',
  cnpj: 'CNPJ',
  cartao: 'número de cartão',
  bancario: 'dados bancários',
  pix: 'chave PIX',
  credencial: 'senha ou credencial',
  rg: 'RG',
};

function _digits(s) { return String(s).replace(/\D/g, ''); }
function _allSame(d) { return /^(\d)\1*$/.test(d); }

function isValidCPF(value) {
  const d = _digits(value);
  if (d.length !== 11 || _allSame(d)) return false;
  for (const len of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const check = (sum * 10) % 11 % 10;
    if (check !== Number(d[len])) return false;
  }
  return true;
}

function isValidCNPJ(value) {
  const d = _digits(value);
  if (d.length !== 14 || _allSame(d)) return false;
  const weights = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  for (const len of [12, 13]) {
    const w = weights.slice(13 - len);
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * w[i];
    const r = sum % 11;
    if ((r < 2 ? 0 : 11 - r) !== Number(d[len])) return false;
  }
  return true;
}

function isValidLuhn(value) {
  const d = _digits(value);
  if (d.length < 13 || d.length > 19 || _allSame(d)) return false;
  let sum = 0;
  for (let i = 0; i < d.length; i++) {
    let n = Number(d[d.length - 1 - i]);
    if (i % 2 === 1) { n *= 2; if (n > 9) n -= 9; }
    sum += n;
  }
  return sum % 10 === 0;
}

// Minúsculas e sem acento, para casar palavras-chave ("agência", "é").
function _plain(s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }

const _RE = {
  // Delimitadores evitam casar pedaço de um número maior.
  cpf: /(?<![\d.\/-])\d{3}\.?\d{3}\.?\d{3}-?\d{2}(?![\d\/]|[.-]\d)/g,
  cnpj: /(?<![\d.\/-])\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}(?![\d\/]|[.-]\d)/g,
  // 13 a 19 dígitos, com espaço ou hífen opcional entre eles. Não começa após "+"
  // (telefone internacional).
  cartao: /(?<![\d.\/+-])\d(?:[ -]?\d){12,18}(?![\d\/]|[.-]\d)/g,
  agencia: /\bagencia\b\.?\s*(?:n[o°º.]*\s*)?[:\-]?\s*\d{3,5}(?:-?[\dx])?\b/,
  // "ag" sozinho é ambíguo ("ag 2024"): só conta com dígito verificador.
  agCurta: /\bag\b\.?\s*(?:n[o°º.]*\s*)?[:\-]?\s*\d{3,5}-[\dx]\b/,
  conta: /\b(?:conta(?:\s+corrente|\s+poupanca)?|c\/c|cc)\b\.?\s*(?:n[o°º.]*\s*)?[:\-]?\s*(?:\d{3,12}-[\dx]|\d{5,12})\b/,
  uuid: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/g,
  pix: /\bpix\b/,
  // Palavra de credencial + separador + valor com dígito ou símbolo (ou 16+ letras).
  credencial: /\b(?:senha|password|passwd|pwd|token|api[\s_-]?key|secret|segredo|chave de api)\b\s*(?:[:=]|\s(?:e|eh)\s)?\s*(?:(?=\S*[^a-z\s])\S{4,}|[a-z]{16,})/,
  rg: /\brg\b\.?\s*(?:n[o°º.]*\s*)?[:\-]?\s*(\d[\d.]{5,11}(?:-?[\dx])?)\b/,
};

// Lista os tipos de dado sensível encontrados, sem repetir. Não devolve os valores.
function detectSensitive(text) {
  const raw = String(text || '');
  const plain = _plain(raw);
  const found = new Set();

  const cnpjSpans = [];
  for (const m of raw.matchAll(_RE.cnpj)) {
    if (isValidCNPJ(m[0])) { found.add('cnpj'); cnpjSpans.push(_digits(m[0])); }
  }
  for (const m of raw.matchAll(_RE.cpf)) {
    if (isValidCPF(m[0])) found.add('cpf');
  }
  for (const m of raw.matchAll(_RE.cartao)) {
    const d = _digits(m[0]);
    if (cnpjSpans.includes(d)) continue; // CNPJ sem máscara também tem 14 dígitos
    if ((d.length === 12 || d.length === 13) && d.startsWith('55')) continue; // telefone com DDI 55
    if (isValidLuhn(d)) found.add('cartao');
  }
  if (_RE.agencia.test(plain) || _RE.agCurta.test(plain) || _RE.conta.test(plain)) found.add('bancario');
  for (const m of plain.matchAll(_RE.uuid)) {
    const around = plain.slice(Math.max(0, m.index - 60), m.index + m[0].length + 60);
    if (_RE.pix.test(around)) found.add('pix');
  }
  if (_RE.credencial.test(plain)) found.add('credencial');
  const rg = plain.match(_RE.rg);
  if (rg) {
    const n = _digits(rg[1]).length;
    if (n >= 7 && n <= 10) found.add('rg');
  }

  return Object.keys(SENSITIVE_LABELS).filter(k => found.has(k));
}

// "CPF", "CPF e RG", "CPF, RG e chave PIX".
function describeSensitive(types) {
  const names = types.map(t => SENSITIVE_LABELS[t] || t);
  if (names.length <= 1) return names.join('');
  return names.slice(0, -1).join(', ') + ' e ' + names[names.length - 1];
}
// <<< greenia-core

if (typeof module !== 'undefined') {
  module.exports = {
    TYPEWRITER_MAX_MS, TYPEWRITER_FRAME_MS, typewriterChunk, typewriterNext,
    SENSITIVE_LABELS, isValidCPF, isValidCNPJ, isValidLuhn, detectSensitive, describeSensitive,
  };
}
