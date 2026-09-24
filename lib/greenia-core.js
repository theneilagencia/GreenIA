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
  lista: 'lista com dados pessoais',
  email: 'email',
  telefone: 'telefone',
  cep: 'CEP',
  endereco: 'endereço',
  nome: 'nome de pessoa',
};

// O que fazer com cada tipo antes de enviar ao modelo:
// - bloquear: não envia; a pessoa precisa tirar o dado.
// - avisar: pergunta "Enviar mesmo assim?"; só envia com confirmação.
// - mascarar: troca o valor por [TIPO] e envia.
// - permitir_com_registro: envia como está e registra o tipo na auditoria
//   (no servidor; no navegador equivale a permitir).
// - permitir: envia como está.
// Email e telefone ficam em avisar porque aparecem em tarefas Verdes comuns,
// como redigir um email para um colega.
const DATA_ACTIONS = ['bloquear', 'avisar', 'mascarar', 'permitir_com_registro', 'permitir'];
const DATA_POLICY = {
  cpf: 'bloquear',
  cnpj: 'bloquear',
  cartao: 'bloquear',
  bancario: 'bloquear',
  pix: 'bloquear',
  credencial: 'bloquear',
  rg: 'bloquear',
  lista: 'bloquear',
  email: 'avisar',
  telefone: 'avisar',
  cep: 'avisar',
  endereco: 'avisar',
  nome: 'avisar',
};
// Credenciais são bloqueadas em qualquer política.
const ALWAYS_BLOCKED = ['credencial'];

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

// Minúsculas e sem acento, para casar palavras-chave ("agência", "é"). Mantém um
// caractere para cada caractere do original, para as posições valerem nos dois.
function _plain(s) {
  let out = '';
  for (const c of String(s || '')) {
    const d = c.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const low = (d || ' ').toLowerCase();
    out += low.length === c.length ? low : (c.toLowerCase().length === c.length ? c.toLowerCase() : c);
  }
  return out;
}

const _RE = {
  // Delimitadores evitam casar pedaço de um número maior.
  cpf: /(?<![\d.\/-])\d{3}\.?\d{3}\.?\d{3}-?\d{2}(?![\d\/]|[.-]\d)/g,
  cnpj: /(?<![\d.\/-])\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}(?![\d\/]|[.-]\d)/g,
  // 13 a 19 dígitos, com espaço ou hífen opcional entre eles. Não começa após "+"
  // (telefone internacional).
  cartao: /(?<![\d.\/+-])\d(?:[ -]?\d){12,18}(?![\d\/]|[.-]\d)/g,
  agencia: /\bagencia\b\.?\s*(?:n[o°º.]*\s*)?[:\-]?\s*\d{3,5}(?:-?[\dx])?\b/g,
  // "ag" sozinho é ambíguo ("ag 2024"): só conta com dígito verificador.
  agCurta: /\bag\b\.?\s*(?:n[o°º.]*\s*)?[:\-]?\s*\d{3,5}-[\dx]\b/g,
  conta: /\b(?:conta(?:\s+corrente|\s+poupanca)?|c\/c|cc)\b\.?\s*(?:n[o°º.]*\s*)?[:\-]?\s*(?:\d{3,12}-[\dx]|\d{5,12})\b/g,
  uuid: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/g,
  pix: /\bpix\b/,
  // Palavra de credencial + separador + valor com dígito ou símbolo (ou 16+ letras).
  credencial: /\b(?:senha|password|passwd|pwd|token|api[\s_-]?key|secret|segredo|chave de api)\b\s*(?:[:=]|\s(?:e|eh)\s)?\s*(?:(?=\S*[^a-z\s])\S{4,}|[a-z]{16,})/g,
  rg: /\brg\b\.?\s*(?:n[o°º.]*\s*)?[:\-]?\s*(\d[\d.]{5,11}(?:-?[\dx])?)\b/g,
  email: /(?<![\w.+-])[a-z0-9][\w.+-]*@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}(?![\w-])/gi,
  // Telefone brasileiro. Formas aceitas:
  //  - com +55: +55 11 98765-4321, +5511987654321, +55 (11) 3456-7890
  //  - com DDD separado: (11) 98765-4321, 11 98765-4321, (11)3456-7890, 11 3456-7890
  //  - celular sem máscara com DDD: 11987654321 (11 dígitos, terceiro dígito 9)
  //  - celular sem DDD com hífen: 98765-4321
  // Fixo sem DDD (3456-7890) só conta perto de "tel", "fone", "celular" etc.,
  // para não casar intervalos como "2024-2025".
  telefone: new RegExp([
    String.raw`\+55[\s-]?\(?[1-9]\d\)?[\s-]?9?\d{4}[\s-]?\d{4}`,
    String.raw`\([1-9]\d\)\s?9?\d{4}[\s-]?\d{4}`,
    String.raw`[1-9]\d[\s-]9?\d{4}[\s-]\d{4}`,
    String.raw`[1-9]\d9\d{8}`,
    String.raw`9\d{4}-\d{4}`,
  ].map(p => String.raw`(?<![\w+(])` + p + String.raw`(?![\w-])`).join('|'), 'g'),
  telefoneFixo: /\b(?:tel|telefone|fone|celular|cel|whats(?:app)?|contato)\b[^\d\n]{0,12}([2-5]\d{3}-\d{4})(?![\w-])/g,
  cep: /(?<![\d.-])\d{5}-?\d{3}(?![\d-])/g,
  cepContexto: /\b(?:cep|rua|avenida|av|bairro|endereco|logradouro|cidade)\b/,
  // Logradouro + nome + número ("Rua das Flores, 120", "Av. Paulista 1000").
  endereco: /\b(?:rua|r\.|avenida|av\.?|travessa|trav\.|rodovia|rod\.|alameda|al\.|praca|pca\.?|estrada|largo)\s+(?=[^\n,]*[a-z])[a-z0-9][^\n,\d]{1,60}?,?\s*(?:n[o°º.]*\s*)?\d{1,5}\b/g,
  // Marcadores de nome de pessoa (o nome em si é conferido com maiúsculas no texto original).
  nomeMarcador: /(?:\bnome(?:\s+completo)?\s*:|\b(?:colaborador|colaboradora|funcionario|funcionaria|cliente|paciente|candidato|candidata)\b\s*:?|\b(?:sr|sra|srta)\.)/g,
};

// Duas ou mais palavras com inicial maiúscula, aceitando "de", "da", "dos"... no meio.
const _NOME = /^\s*((?:[A-ZÀ-Ý][a-zà-ÿ']+)(?:\s+(?:(?:de|da|do|das|dos|e)\s+)?[A-ZÀ-Ý][a-zà-ÿ']+)+)/;
// Palavras que indicam empresa, não pessoa ("cliente Repet Soluções Ambientais").
const _EMPRESA = /\b(?:ltda|s\.?a\.?|sa|me|eireli|inc|corp|group|grupo|holding|solucoes|ambientais|industria|industrias|comercio|servicos|tecnologia|engenharia|consultoria|transportes|logistica|construtora|associacao|instituto|fundacao|banco|cooperativa|companhia|cia)\b/;

// Lista de ocorrências { type, start, end } (posições no texto original).
function findSensitive(text) {
  const raw = String(text || '');
  const plain = _plain(raw);
  const out = [];
  const add = (type, start, end) => out.push({ type, start, end });

  const cnpjDigits = [];
  for (const m of raw.matchAll(_RE.cnpj)) {
    if (isValidCNPJ(m[0])) { add('cnpj', m.index, m.index + m[0].length); cnpjDigits.push(_digits(m[0])); }
  }
  const cpfSpans = [];
  for (const m of raw.matchAll(_RE.cpf)) {
    if (isValidCPF(m[0])) { add('cpf', m.index, m.index + m[0].length); cpfSpans.push(m.index); }
  }
  for (const m of raw.matchAll(_RE.cartao)) {
    const d = _digits(m[0]);
    if (cnpjDigits.includes(d)) continue; // CNPJ sem máscara também tem 14 dígitos
    if ((d.length === 12 || d.length === 13) && d.startsWith('55')) continue; // telefone com DDI 55
    if (isValidLuhn(d)) add('cartao', m.index, m.index + m[0].length);
  }
  for (const re of [_RE.agencia, _RE.agCurta, _RE.conta]) {
    for (const m of plain.matchAll(re)) add('bancario', m.index, m.index + m[0].length);
  }
  for (const m of plain.matchAll(_RE.uuid)) {
    const around = plain.slice(Math.max(0, m.index - 60), m.index + m[0].length + 60);
    if (_RE.pix.test(around)) add('pix', m.index, m.index + m[0].length);
  }
  for (const m of plain.matchAll(_RE.credencial)) add('credencial', m.index, m.index + m[0].length);
  for (const m of plain.matchAll(_RE.rg)) {
    const n = _digits(m[1]).length;
    if (n >= 7 && n <= 10) add('rg', m.index, m.index + m[0].length);
  }
  for (const m of raw.matchAll(_RE.email)) add('email', m.index, m.index + m[0].length);
  for (const m of raw.matchAll(_RE.telefone)) {
    if (cpfSpans.includes(m.index)) continue; // 11 dígitos que são CPF válido: fica como CPF
    add('telefone', m.index, m.index + m[0].length);
  }
  for (const m of plain.matchAll(_RE.telefoneFixo)) {
    const start = m.index + m[0].length - m[1].length;
    add('telefone', start, m.index + m[0].length);
  }
  for (const m of raw.matchAll(_RE.cep)) {
    if (cpfSpans.includes(m.index)) continue;
    const before = plain.slice(Math.max(0, m.index - 40), m.index);
    if (_RE.cepContexto.test(before)) add('cep', m.index, m.index + m[0].length);
  }
  for (const m of plain.matchAll(_RE.endereco)) add('endereco', m.index, m.index + m[0].length);
  for (const m of plain.matchAll(_RE.nomeMarcador)) {
    const after = m.index + m[0].length;
    const n = raw.slice(after).match(_NOME);
    if (!n) continue;
    if (_EMPRESA.test(_plain(n[1]))) continue;
    const start = after + n[0].length - n[1].length;
    add('nome', start, start + n[1].length);
  }

  // Texto colado que parece tabela (3+ linhas com o mesmo separador, na mesma
  // quantidade) e contém algum dado pessoal: vira "lista com dados pessoais".
  if (out.length && _looksLikeTable(raw)) add('lista', 0, raw.length);
  return out;
}

function _looksLikeTable(raw) {
  const lines = raw.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 3) return false;
  for (const sep of ['\t', ';', '|', ',']) {
    const counts = lines.map(l => l.split(sep).length - 1).filter(c => c > 0);
    if (counts.length < 3) continue;
    const freq = {};
    for (const c of counts) freq[c] = (freq[c] || 0) + 1;
    if (Math.max(...Object.values(freq)) >= 3) return true;
  }
  return false;
}

// Lista os tipos de dado sensível encontrados, sem repetir, em ordem fixa.
// Não devolve os valores.
function detectSensitive(text) {
  const found = new Set(findSensitive(text).map(f => f.type));
  return Object.keys(SENSITIVE_LABELS).filter(k => found.has(k));
}

// Decide o que fazer com o texto a partir dos tipos detectados e da política.
// Precedência: bloquear > avisar > mascarar > permitir_com_registro > permitir.
function decideAction(types, policy = DATA_POLICY) {
  const by = { bloquear: [], avisar: [], mascarar: [], permitir_com_registro: [], permitir: [] };
  for (const t of types) {
    let a = ALWAYS_BLOCKED.includes(t) ? 'bloquear' : (policy[t] || 'bloquear');
    if (!DATA_ACTIONS.includes(a)) a = 'bloquear'; // política inválida: o mais seguro
    by[a].push(t);
  }
  const action = by.bloquear.length ? 'bloquear' : by.avisar.length ? 'avisar' : by.mascarar.length ? 'mascarar'
    : by.permitir_com_registro.length ? 'permitir_com_registro' : 'permitir';
  return { action, block: by.bloquear, warn: by.avisar, mask: by.mascarar, log: by.permitir_com_registro, allow: by.permitir };
}

// Troca os valores dos tipos pedidos por [TIPO] ("[CPF]", "[EMAIL]").
function maskSensitive(text, types) {
  const raw = String(text || '');
  const spans = findSensitive(raw)
    .filter(f => types.includes(f.type) && f.type !== 'lista')
    .sort((a, b) => a.start - b.start || b.end - a.end);
  let out = '';
  let pos = 0;
  for (const f of spans) {
    if (f.start < pos) continue; // sobreposto a um trecho já mascarado
    out += raw.slice(pos, f.start) + '[' + (SENSITIVE_LABELS[f.type] || f.type).toUpperCase() + ']';
    pos = f.end;
  }
  return out + raw.slice(pos);
}

// "CPF", "CPF e RG", "CPF, RG e chave PIX".
function describeSensitive(types) {
  const names = types.map(t => SENSITIVE_LABELS[t] || t);
  if (names.length <= 1) return names.join('');
  return names.slice(0, -1).join(', ') + ' e ' + names[names.length - 1];
}

// ---- Busca na base de conhecimento --------------------------------------------

const KB_STOPWORDS = new Set([
  'a', 'o', 'os', 'as', 'de', 'da', 'do', 'das', 'dos', 'e', 'em', 'um', 'uma', 'para', 'por', 'com',
  'no', 'na', 'nos', 'nas', 'que', 'se', 'ao', 'aos', 'como', 'qual', 'quais', 'quanto', 'quantos',
  'quantas', 'quando', 'onde', 'meu', 'minha', 'sobre', 'ou', 'mais', 'tem', 'ser', 'fazer', 'posso',
  'quero', 'preciso', 'pode', 'sao', 'esta', 'isso', 'essa', 'esse', 'ela', 'ele', 'voce', 'nao',
]);

// Stemming leve de plural em português. Aplicado à consulta e aos documentos.
function stemPt(t) {
  if (t.length <= 3) return t;
  if (t.endsWith('oes')) return t.slice(0, -3) + 'ao';   // aprovações -> aprovacao
  if (t.endsWith('ais')) return t.slice(0, -3) + 'al';   // gerais -> geral
  if (t.endsWith('eis')) return t.slice(0, -3) + 'el';   // papéis -> papel
  if (t.endsWith('ns')) return t.slice(0, -2) + 'm';     // viagens -> viagem
  if (/[rsz]es$/.test(t)) return t.slice(0, -2);         // gestores -> gestor, meses -> mes
  if (t.endsWith('s') && !t.endsWith('ss')) return t.slice(0, -1); // dias -> dia
  return t;
}

// Minúsculas, sem acento, sem stopwords, tokens de 3+ letras, com stemming.
function tokenizePt(s) {
  return String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(t => t.length > 2 && !KB_STOPWORDS.has(t))
    .map(stemPt);
}

const KB_TITLE_WEIGHT = 3;
const KB_BODY_WEIGHT = 1;
// Um termo só no corpo não basta; precisa de dois no corpo ou um no título.
const KB_MIN_SCORE = 2;

// Documentos relevantes para a consulta, do mais para o menos relevante (até 3).
// Compara por token inteiro, então "dia" não casa com "diária".
function retrieve(kb, query) {
  const terms = [...new Set(tokenizePt(query))];
  if (!terms.length) return [];
  return kb
    .map(d => {
      const title = new Set(tokenizePt(d.title));
      const body = new Set(tokenizePt(d.text));
      let score = 0;
      for (const t of terms) {
        if (title.has(t)) score += KB_TITLE_WEIGHT;
        if (body.has(t)) score += KB_BODY_WEIGHT;
      }
      return { d, score };
    })
    .filter(x => x.score >= KB_MIN_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(x => x.d);
}

// Pergunta de seguimento ("e para internacional?"): se a última mensagem sozinha
// não achar nada, busca de novo somando a mensagem anterior do usuário.
function retrieveForTurn(kb, lastUserText, previousUserText) {
  const hits = retrieve(kb, lastUserText);
  if (hits.length || !previousUserText) return hits;
  return retrieve(kb, previousUserText + ' ' + lastUserText);
}
// <<< greenia-core

if (typeof module !== 'undefined') {
  module.exports = {
    TYPEWRITER_MAX_MS, TYPEWRITER_FRAME_MS, typewriterChunk, typewriterNext,
    SENSITIVE_LABELS, DATA_ACTIONS, DATA_POLICY, ALWAYS_BLOCKED,
    isValidCPF, isValidCNPJ, isValidLuhn, findSensitive, detectSensitive, decideAction, maskSensitive, describeSensitive,
    KB_MIN_SCORE, stemPt, tokenizePt, retrieve, retrieveForTurn,
  };
}
