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

// Provedores de email de uso pessoal. Os demais domínios são tratados como email corporativo (conteúdo normal).
const PROVEDORES_PESSOAIS = String.raw`(?:gmail|googlemail|hotmail|outlook|live|msn|yahoo|ymail|icloud|me|mac|aol|proton(?:mail)?|pm|gmx|zoho|yandex|uol|bol|terra|ig|globo(?:mail)?|r7|oi|zipmail)\.(?:com|me|net)(?:\.br)?|(?:uol|bol|terra|ig|globo|oi)\.com\.br`;
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
    // Frase de recuperação de carteira (seed phrase / mnemônico): o rótulo seguido de 12 ou mais palavras.
    if (/\b(?:seed phrase|recovery phrase|mnemonic|frase semente|frase de recupera[cç][aã]o|palavras de recupera[cç][aã]o|mnem[oô]nic[oa])\b[^\n]{0,20}?(?:\b[a-z]{3,8}\b[\s,]+){11,}\b[a-z]{3,8}\b/i.test(t)) return true;
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
  // Só email PESSOAL (provedores de uso pessoal). Email corporativo é conteúdo normal de trabalho.
  email(t) {
    return new RegExp(String.raw`\b[A-Za-z0-9._%+-]+@(?:${PROVEDORES_PESSOAIS})\b`, 'i').test(t);
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

// Dado pessoal sensível e marcação explícita de confidencialidade: reconhecidos em qualquer área, pelo contexto
// (termos compostos, não palavras soltas: "diagnóstico de vendas" não é dado de saúde).
const semAcento = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
REGRAS.sensivel = t => /\b(?:laudo medico|prontuario|atestado medico|cid[- ]?10|cid[- ]?[a-z]\d{2}(?:\.\d)?\b|exame (?:medico|admissional|demissional|toxicologico)|diagnostico (?:medico|clinico|de (?:cancer|depressao|ansiedade|hiv|diabetes))|soropositiv|hiv positivo|dados biometricos|biometria (?:facial|digital)|orientacao sexual|conviccao religiosa|religiao d[oa] (?:colaborador|funcionari|candidat|empregad)|filiacao (?:sindical|partidaria)|opiniao politica d[oa]|origem racial|origem etnica)/.test(semAcento(t));
REGRAS.confidencial = t => /\b(?:estritamente confidencial|documento confidencial|informacao confidencial|confidencial\s*[-–:|]|^\s*confidencial\s*$|classificacao:\s*confidencial)|\bconfidencial\b(?=[^\n]{0,3}$)/m.test(semAcento(t))
  || /\bCONFIDENCIAL\b/.test(t);

// Dado pessoal restrito: registro sobre uma pessoa específica em processo interno (disciplina, desligamento,
// remuneração individual, avaliação individual). É o conteúdo, e não o departamento: "reunião de RH", "plano de
// férias", "feedback sobre a apresentação" ou "salário de mercado" são conteúdo comum.
REGRAS.pessoal_restrito = t => {
  const s = semAcento(t);
  if (/\b(?:advertencia disciplinar|suspensao disciplinar|processo disciplinar|medida disciplinar|justa causa|holerite|contracheque|folha de pagamento)\b/.test(s)) return true;
  if (/\b(?:recebeu|aplicada?|aplicou|levou) (?:uma )?(?:advertencia|suspensao)\b/.test(s)) return true;
  if (/\b(?:salario|remuneracao|desligamento|demissao|avaliacao de desempenho) d[oa] (?:colaborador|funcionari|empregad|analista|gerente|candidat)/.test(s)) return true;
  return /\b(?:sal[aá]rio|remunera[cç][aã]o) (?:d[oa]|de) [A-ZÀ-Ú][a-zà-ú]+[^.\n]{0,40}R\$\s?\d/.test(t);   // "salário do João é R$ 8.000"
};

export const TIPOS = Object.keys(REGRAS);
// Nível de risco de cada tipo (a decisão é da política da empresa; o nível orienta o padrão):
//   1 conteúdo normal · 2 dado pessoal · 3 dado pessoal sensível · 4 informação confidencial · 5 credencial/segredo
// CPF x CNPJ (regra formal, com teste próprio em test/cnpj.test.js):
//   • CPF é de pessoa física: dado pessoal (nível 2), com os controles de dado pessoal.
//   • CNPJ é de pessoa jurídica: identificação de empresa (nível 1). Não herda os controles de dado pessoal e não
//     bloqueia o processamento. Não existe regra que transforme um CNPJ em dado pessoal.
//   • Um documento com CNPJ pode ter também dados de pessoas físicas (CPF, email pessoal, telefone...): cada um é
//     classificado pelo próprio conteúdo, independentemente do CNPJ ao lado.
export const NIVEL_DO_TIPO = { cnpj: 1, cpf: 2, rg: 2, email: 2, telefone: 2, cep: 2, endereco: 2, cartao: 2, banco: 2, pix: 2, pessoal_restrito: 2, sensivel: 3, confidencial: 4, credencial: 5 };
// Classificação (o que o dado É). O tratamento (proteger ou não enviar) é política da empresa, com uma exceção:
// credenciais e segredos nunca são enviados, por regra de segurança da GreenIA (não é uma afirmação da LGPD).
// "Dado pessoal sensível" (saúde, origem racial, religião, biometria...) não é reconhecido por padrão de texto:
// fica na marcação da conversa ou do quick win como sigilosa e, nas áreas com proteção reforçada, nos sinais de
// detectarReforcado (abaixo).
export const CATEGORIAS = {
  cpf: 'identificacao', rg: 'identificacao', cnpj: 'identificacao_empresa',
  cartao: 'financeiro', banco: 'financeiro', pix: 'financeiro',
  email: 'pessoal', telefone: 'pessoal', cep: 'pessoal', endereco: 'pessoal',
  pessoal_restrito: 'pessoal', sensivel: 'sensivel', confidencial: 'confidencial', credencial: 'segredo',
};
export const NOMES_CATEGORIA = { identificacao: 'dado de identificação pessoal', identificacao_empresa: 'identificação de empresa', financeiro: 'dado financeiro',
  pessoal: 'dado pessoal', sensivel: 'dado pessoal sensível', confidencial: 'informação confidencial', segredo: 'credencial ou segredo' };
export const ROTULOS = { cpf: 'CPF', cnpj: 'CNPJ', cartao: 'cartão', banco: 'dados bancários', pix: 'chave PIX', credencial: 'senha ou credencial',
  rg: 'RG', email: 'email pessoal', telefone: 'telefone', cep: 'CEP', endereco: 'endereço', pessoal_restrito: 'dado pessoal restrito', sensivel: 'dado pessoal sensível', confidencial: 'marcação de confidencial' };

// Proteção reforçada (áreas com política de sigilo): além dos padrões gerais, a GreenIA procura sinais de
// conteúdo que exige tratamento sigiloso e que não tem formato fixo. Só o conteúdo em que eles aparecem vira
// sigiloso; o resto segue as regras gerais da empresa. Termos inteiros, sem acento e sem diferença de caixa.
// Na área reforçada, entram também marcações mais leves e registros de pessoas em processos internos (os
// tipos acima valem em qualquer área). Sinais específicos: "desligamento de sistemas" ou "salário de mercado" não
// são registro de pessoa.
const REFORCO = {
  marcacao: /\b(?:uso (?:estritamente )?interno|uso restrito|estritamente reservad[oa]|nao (?:divulgar|distribuir)|acordo de confidencialidade|nda\b|sigilos[oa]\b)/,
};
export const TIPOS_REFORCO = Object.keys(REFORCO);
export const ROTULOS_REFORCO = { marcacao: 'marcação de uso interno' };
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
//   "permitir" = processar normalmente, pelas regras gerais (a presença do dado não torna a conversa sigilosa);
//   "proteger" = processar só com os guardrails de informação sigilosa (a conversa passa a ser sigilosa);
//   "bloquear" = não enviar. Ação ausente ou desconhecida vale "bloquear" (fail closed).
// Credencial é sempre bloqueada, independentemente de área, autorização, modelo ou configuração.
export const ACOES = ['permitir', 'proteger', 'bloquear'];
export function decidir(tipos, acoes) {
  const acao = t => (t === 'credencial' ? 'bloquear' : ACOES.includes(acoes?.[t]) ? acoes[t] : 'bloquear');
  return { bloqueados: tipos.filter(t => acao(t) === 'bloquear'), protegidos: tipos.filter(t => acao(t) === 'proteger'), normais: tipos.filter(t => acao(t) === 'permitir') };
}
