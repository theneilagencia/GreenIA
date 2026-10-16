// Processar protegendo (referência: assistentes de mercado). Quando a mensagem traz um dado pessoal que a política
// manda proteger (CPF, CNPJ, RG, e-mail pessoal, telefone, CEP, cartão, conta, PIX) e a empresa não tem um recurso de
// IA autorizado para dado sigiloso, o pedido não é bloqueado: cada valor vira um marcador ([CPF_1]) em tudo o que sai
// para a IA (mensagem, anexos, histórico, instruções) e o valor real volta só na resposta, para a pessoa. Antes de
// sair, o envio é conferido de novo: se ainda houver um dado protegido, nada é enviado (falha fechada).
// Dado que não dá para mascarar com segurança (dado de saúde, documento confidencial, endereço, registro pessoal
// restrito) continua exigindo o recurso autorizado.
import { cnpjValido, cpfValido, detectar, luhn, PROVEDORES_PESSOAIS } from './filtro.js';
import { ErroIA } from './ia.js';

export const MASCARAVEIS = new Set(['cpf', 'cnpj', 'rg', 'email', 'telefone', 'cep', 'cartao', 'banco', 'pix']);
const ROTULO = { cpf: 'CPF', cnpj: 'CNPJ', rg: 'RG', email: 'EMAIL', telefone: 'TELEFONE', cep: 'CEP', cartao: 'CARTAO', banco: 'CONTA', pix: 'PIX' };
const dig = s => s.replace(/\D/g, '');
const DDD = String.raw`(?:1[1-9]|[2-9][1-9])`;
// [tipo, padrão (com grupo "v" = trecho a trocar), conferência opcional do valor]
const PADROES = [
  ['cartao', /(?<![\d.,])(?<v>(?:\d{4}[ -]){3}\d{1,7}|\d{13,19})(?![\d.,])/g, v => { const d = dig(v); return d.length >= 13 && d.length <= 19 && /^[3-6]/.test(d) && luhn(d); }],
  ['cnpj', /(?<![\d.\/-])(?<v>\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})(?![\d\/-]|\.\d)/g, v => cnpjValido(dig(v))],
  ['cpf', /(?<![\d.\/-])(?<v>\d{3}\.?\d{3}\.?\d{3}-?\d{2})(?![\d\/-]|\.\d)/g, v => cpfValido(dig(v))],
  ['rg', /\bRG\b[^\d\n]{0,15}(?<v>\d{1,2}\.?\d{3}\.?\d{3}-?[\dxX])\b/gi],
  ['email', new RegExp(String.raw`(?<v>\b[A-Za-z0-9._%+-]+@(?:${PROVEDORES_PESSOAIS})\b)`, 'gi')],
  ['pix', /(?<v>\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b)/gi],
  ['telefone', new RegExp(String.raw`(?<v>(?:\+55\s?)?\(${DDD}\)\s?9?\d{4}[-\s]?\d{4}|\+55\s?${DDD}\s?9?\d{4}[-\s]?\d{4}|(?<![\d.\/-])${DDD}\s9?\d{4}-\d{4}|(?<![\d.\/-])9\d{4}-\d{4})(?!\d)`, 'g')],
  ['telefone', new RegExp(String.raw`(?:tel(?:efone)?|cel(?:ular)?|whats(?:app)?|fone|contato)[^\d\n]{0,25}(?<v>(?<![\d.\/-])${DDD}9?\d{8})(?![\d.\/-])`, 'gi')],
  ['cep', /(?<![\d.\/-])(?<v>\d{5}-\d{3})(?![\d\/-])/g],
  ['cep', /\bcep\b[^\d\n]{0,12}(?<v>(?<![\d.\/-])\d{8})(?![\d.\/-])/gi],
  ['banco', /\bconta(?:\s+corrente|\s+poupan[çc]a)?\s*(?:n[º°o.]?\s*)?:?\s*(?<v>\d{3,12}-[\dxX])\b/gi],
  ['banco', /(?:ag[eê]ncia|\bag\.?)\s*(?:n[º°o.]?\s*)?:?\s*(?<v>\d{3,5}(?:-\d)?)\b/gi],
];
const MARCADOR = /\[(CPF|CNPJ|RG|EMAIL|TELEFONE|CEP|CARTAO|CONTA|PIX)_(\d+)\]/g;

export class Mascara {
  constructor() { this.porValor = new Map(); this.porMarcador = new Map(); this.contagem = {}; this.tipos = new Set(); }
  marcador(tipo, valor) {
    const chave = `${tipo}:${valor}`;
    if (this.porValor.has(chave)) return this.porValor.get(chave);
    const r = ROTULO[tipo], n = (this.contagem[r] = (this.contagem[r] || 0) + 1), m = `[${r}_${n}]`;
    this.porValor.set(chave, m); this.porMarcador.set(m, valor); this.tipos.add(tipo);
    return m;
  }
  mascarar(texto) {
    let t = String(texto ?? '');
    for (const [tipo, re, ok] of PADROES) {
      t = t.replace(re, (todo, ...args) => {
        const g = args.at(-1), v = g?.v;
        if (!v || (ok && !ok(v))) return todo;
        return todo.replace(v, this.marcador(tipo, v));
      });
    }
    return t;
  }
  restaurar(texto) { return String(texto ?? '').replace(MARCADOR, m => this.porMarcador.get(m) ?? m); }
  get total() { return this.porMarcador.size; }
}

const textoDe = c => (typeof c === 'string' ? c : Array.isArray(c) ? c.map(p => p?.text || '').join('\n') : '');
export function mascararMensagens(msgs, mascara) {
  return msgs.map(m => ({ ...m, content: typeof m.content === 'string' ? mascara.mascarar(m.content)
    : Array.isArray(m.content) ? m.content.map(p => (p?.type === 'text' ? { ...p, text: mascara.mascarar(p.text) } : p)) : m.content }));
}

// Texto que sai em pedaços (streaming): um marcador cortado entre dois pedaços espera o resto antes de voltar.
async function* restaurando(eventos, mascara) {
  let pend = '';
  for await (const ev of eventos) {
    if (ev?.tipo !== 'texto') { if (pend) { yield { tipo: 'texto', texto: mascara.restaurar(pend) }; pend = ''; } yield ev; continue; }
    pend += ev.texto;
    const i = pend.lastIndexOf('[');
    const corta = i >= 0 && !pend.slice(i).includes(']') && pend.length - i < 24;
    const pronto = corta ? pend.slice(0, i) : pend;
    pend = corta ? pend.slice(i) : '';
    if (pronto) yield { ...ev, texto: mascara.restaurar(pronto) };
  }
  if (pend) yield { tipo: 'texto', texto: mascara.restaurar(pend) };
}

/**
 * IA desta solicitação com o mascaramento: tudo o que sai é mascarado e conferido; o que volta é restaurado.
 * tipos: os tipos protegidos que motivaram o mascaramento (nenhum deles pode sobrar no envio).
 */
export function iaMascarada(ia, mascara, tipos) {
  const conferir = msgs => {
    const fora = mascararMensagens(msgs, mascara);
    const sobra = detectar(fora.map(m => textoDe(m.content)).join('\n')).filter(t => tipos.includes(t));
    if (sobra.length) throw new ErroIA('dado protegido não mascarado');
    return fora;
  };
  return {
    ...ia,
    enviar: (msgs, op) => restaurando(ia.enviar(conferir(msgs), op), mascara),
    ...(ia.gerarImagem ? { gerarImagem: (prompt, op) => ia.gerarImagem(mascara.mascarar(prompt), op) } : {}),
  };
}
