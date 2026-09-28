// Detector de dados sensíveis. Função pura: devolve os tipos encontrados, nunca
// os valores. Regras pensadas para não disparar em datas, valores em reais e
// números de pedido.

const soDigitos = s => s.replace(/\D/g, '');
const repetido = d => /^(\d)\1+$/.test(d);

function cpfValido(d) {
  if (d.length !== 11 || repetido(d)) return false;
  const dv = n => { let s = 0; for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

function cnpjValido(d) {
  if (d.length !== 14 || repetido(d)) return false;
  const dv = n => {
    const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const r = pesos.reduce((s, p, i) => s + p * Number(d[i]), 0) % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(12) === Number(d[12]) && dv(13) === Number(d[13]);
}

function luhn(d) {
  let s = 0;
  for (let i = 0; i < d.length; i++) {
    let n = Number(d[d.length - 1 - i]);
    if (i % 2) { n *= 2; if (n > 9) n -= 9; }
    s += n;
  }
  return s % 10 === 0;
}

// Palavra-chave a até `dist` caracteres antes da posição.
const perto = (texto, pos, re, dist = 40) => re.test(texto.slice(Math.max(0, pos - dist), pos));

const REGRAS = {
  cpf(t) {
    for (const m of t.matchAll(/(?<![\d.\/-])\d{3}\.?\d{3}\.?\d{3}-?\d{2}(?![\d\/-]|\.\d)/g)) if (cpfValido(soDigitos(m[0]))) return true;
    return false;
  },
  cnpj(t) {
    for (const m of t.matchAll(/(?<![\d.\/-])\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}(?![\d\/-]|\.\d)/g)) if (cnpjValido(soDigitos(m[0]))) return true;
    return false;
  },
  cartao(t) {
    // Em grupos de 4 (com espaço ou hífen), ou seguido, perto da palavra cartão.
    for (const m of t.matchAll(/(?<![\d.,])(?:\d{4}[ -]){3}\d{1,7}(?![\d.,])|(?<![\d.,])\d{13,19}(?![\d.,])/g)) {
      const d = soDigitos(m[0]);
      if (d.length < 13 || d.length > 19 || !/^[3-6]/.test(d) || !luhn(d)) continue;
      if (/[ -]/.test(m[0]) || perto(t, m.index, /cart[aã]o|cr[eé]dito|d[eé]bito|card|visa|master/i, 50)) return true;
    }
    return false;
  },
  banco(t) {
    const ag = /(?:ag[eê]ncia|\bag\.?)\s*(?:n[º°o.]?\s*)?:?\s*$/i;
    for (const m of t.matchAll(/\b\d{3,5}(?:-\d)?\b/g)) {
      if (!perto(t, m.index, ag, 25)) continue;
      if (/\bconta\b|\bc\/c\b|\bcc\b/i.test(t.slice(Math.max(0, m.index - 80), m.index + 80))) return true;
    }
    return /\bconta(?:\s+corrente|\s+poupan[çc]a)?\s*(?:n[º°o.]?\s*)?:?\s*\d{3,12}-[\dxX]\b/i.test(t);
  },
  pix(t) {
    for (const m of t.matchAll(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi)) if (perto(t, m.index, /\bpix\b/i, 60)) return true;
    return false;
  },
  credencial(t) {
    if (/\b(?:sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[abp]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,}|glpat-[A-Za-z0-9_-]{16,}|re_[A-Za-z0-9]{20,}|rnd_[A-Za-z0-9]{16,})\b/.test(t)) return true;
    if (/-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/.test(t)) return true;                       // chave privada
    if (/\bBearer\s+[A-Za-z0-9._~+\/-]{20,}=*/.test(t)) return true;                          // token de autorização
    if (/\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/.test(t)) return true;  // JWT
    if (/\b[a-z][a-z0-9+.-]*:\/\/[^\s:@\/]+:[^\s@\/]{3,}@/i.test(t)) return true;             // usuário:senha em URL
    const chave = String.raw`(?:senha|password|passwd|pwd|token|api[\s_-]?key|chave\s+de\s+api|secret|segredo|client[\s_-]?secret)`;
    // palavra-chave seguida de ":" ou "=" e um valor; ou de "é" e um valor com número ou símbolo
    return new RegExp(`\\b${chave}\\s*[:=]\\s*["'\`]?\\S{3,}`, 'i').test(t)
      || new RegExp(`\\b${chave}\\s+(?:é|e|eh)\\s+["'\`]?(?=\\S*[\\d@#$%&*!])\\S{4,}`, 'i').test(t);
  },
  rg(t) {
    return /\bRG\b[^\d\n]{0,15}\d{1,2}\.?\d{3}\.?\d{3}-?[\dxX]\b/i.test(t);
  },
  email(t) {
    return /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/.test(t);
  },
  telefone(t) {
    const ddd = String.raw`(?:1[1-9]|[2-9][1-9])`;
    // Formatado: (DDD) ou +55, ou separador antes dos 4 últimos dígitos.
    if (new RegExp(String.raw`(?:\+55\s?)?\(${ddd}\)\s?9?\d{4}[-\s]?\d{4}(?!\d)`).test(t)) return true;
    if (new RegExp(String.raw`\+55\s?${ddd}\s?9?\d{4}[-\s]?\d{4}(?!\d)`).test(t)) return true;
    if (new RegExp(String.raw`(?<![\d.\/-])${ddd}\s9?\d{4}-\d{4}(?!\d)`).test(t)) return true;
    // Só dígitos, perto de "telefone", "celular", "whatsapp"...
    for (const m of t.matchAll(new RegExp(String.raw`(?<![\d.\/-])${ddd}9?\d{8}(?![\d.\/-])`, 'g'))) {
      if (perto(t, m.index, /tel(?:efone)?|cel(?:ular)?|whats(?:app)?|fone|contato/i, 30)) return true;
    }
    return /(?<![\d.\/-])9\d{4}-\d{4}(?!\d)/.test(t) && /tel(?:efone)?|cel(?:ular)?|whats|fone/i.test(t);
  },
  cep(t) {
    if (/(?<![\d.\/-])\d{5}-\d{3}(?![\d\/-])/.test(t)) return true;
    for (const m of t.matchAll(/(?<![\d.\/-])\d{8}(?![\d.\/-])/g)) if (perto(t, m.index, /\bcep\b/i, 15)) return true;
    return false;
  },
  endereco(t) {
    return /(?:^|[^\wÀ-ú])(?:[Rr]ua|R\.|[Aa]venida|[Aa]v\.|[Tt]ravessa|[Aa]lameda|[Rr]odovia|[Ee]strada|[Pp]raça|[Ll]argo)\s+(?:d[aeo]s?\s+)?[A-ZÀ-Ú][\wÀ-ú.'-]*(?:\s+(?:d[aeo]s?\s+)?[\wÀ-ú.'-]+){0,5}\s*,?\s*(?:n[º°o.]?\s*)?\d{1,5}\b/.test(t);
  },
};

export const TIPOS = Object.keys(REGRAS);
// Classificação (o que o dado É). O tratamento (proteger ou não enviar) é política da empresa, com uma exceção:
// credenciais e segredos nunca são enviados, por regra de segurança da GreenIA (não é uma afirmação da LGPD).
// "Dado pessoal sensível" (saúde, origem racial, religião, biometria...) não é reconhecido por padrão de texto:
// fica na marcação da conversa ou do quick win como sigilosa e, nas áreas com proteção reforçada, nos sinais de
// detectarReforcado (abaixo).
export const CATEGORIAS = {
  cpf: 'identificacao', rg: 'identificacao', cnpj: 'identificacao_empresa',
  cartao: 'financeiro', banco: 'financeiro', pix: 'financeiro',
  email: 'pessoal', telefone: 'pessoal', cep: 'pessoal', endereco: 'pessoal',
  credencial: 'segredo',
};
export const NOMES_CATEGORIA = { identificacao: 'dado de identificação pessoal', identificacao_empresa: 'identificação de empresa', financeiro: 'dado financeiro',
  pessoal: 'dado pessoal', segredo: 'credencial ou segredo' };
export const ROTULOS = { cpf: 'CPF', cnpj: 'CNPJ', cartao: 'cartão', banco: 'dados bancários', pix: 'chave PIX', credencial: 'senha ou credencial',
  rg: 'RG', email: 'email', telefone: 'telefone', cep: 'CEP', endereco: 'endereço' };

// Proteção reforçada (áreas com política de sigilo): além dos padrões gerais, a GreenIA procura sinais de
// conteúdo que exige tratamento sigiloso e que não tem formato fixo. Só o conteúdo em que eles aparecem vira
// sigiloso; o resto segue as regras gerais da empresa. Termos inteiros, sem acento e sem diferença de caixa.
const semAcento = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const REFORCO = {
  // Documento marcado como confidencial por quem o escreveu.
  marcacao: /\b(?:confidencial|sigiloso|sigilosa|estritamente reservad[oa]|uso (?:estritamente )?interno|uso restrito|nao (?:divulgar|compartilhar|distribuir)|acordo de confidencialidade|nda)\b/,
  // Dados pessoais sensíveis (saúde, biometria, crença, origem, vida sexual, filiação sindical).
  dado_sensivel: /\b(?:diagnostico|prontuario|laudo medico|atestado medico|cid[- ]?10|exame (?:medico|admissional|demissional)|biometri[ac]|orientacao sexual|convicc?ao religiosa|filiacao (?:sindical|partidaria)|origem racial|etnia)\b/,
  // Dados de pessoas em processos internos (remuneração individual, desligamento, disciplina).
  pessoas: /\b(?:folha de pagamento|holerite|contracheque|salario de|remuneracao de|desligamento de|advertencia disciplinar|processo disciplinar)\b/,
};
export const TIPOS_REFORCO = Object.keys(REFORCO);
export const ROTULOS_REFORCO = { marcacao: 'marcação de confidencialidade', dado_sensivel: 'dado pessoal sensível', pessoas: 'dado de pessoas em processo interno' };
/** @param {string} texto @returns {string[]} sinais de conteúdo sigiloso (proteção reforçada) */
export function detectarReforcado(texto) {
  const t = semAcento(texto);
  return TIPOS_REFORCO.filter(k => REFORCO[k].test(t));
}

/** @param {string} texto @returns {string[]} tipos encontrados */
export function detectar(texto) {
  const t = String(texto || '');
  return TIPOS.filter(tipo => REGRAS[tipo](t));
}

// Decide o que fazer com os tipos encontrados, dadas as ações configuradas pela empresa:
//   "permitir" = processar com proteção (a conversa passa a ser sigilosa e só segue por rota autorizada);
//   "bloquear" = não enviar. Ação ausente ou desconhecida vale "bloquear" (fail closed).
// Credencial é sempre bloqueada, independentemente da política de informação sigilosa.
export function decidir(tipos, acoes) {
  const bloqueados = tipos.filter(t => t === 'credencial' || acoes?.[t] !== 'permitir');   // só 'permitir' explícito libera
  const permitidos = tipos.filter(t => !bloqueados.includes(t));
  return { bloqueados, permitidos };
}
