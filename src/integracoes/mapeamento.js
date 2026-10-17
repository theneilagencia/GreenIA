// Mapeamento de dados entre etapas e sistemas: origem -> transformações -> destino. DSL declarativa com funções
// da allowlist; nada de eval, Function, template executável ou JavaScript vindo do usuário ou da IA.
// regra = { de: 'cliente.nome' | null, para: 'customer.name', transformar: [{ op: 'trim' }, ...], padrao?: valor }
const PROIBIDAS = new Set(['__proto__', 'prototype', 'constructor']);
const segmentos = caminho => {
  const s = String(caminho || '').split('.').filter(Boolean);
  if (!s.length || s.length > 12 || s.some(x => PROIBIDAS.has(x) || !/^[\w-]{1,64}$|^\d+$/.test(x))) throw new Error(`caminho inválido: ${String(caminho).slice(0, 60)}`);
  return s;
};
export function ler(obj, caminho) {
  let v = obj;
  for (const k of segmentos(caminho)) { if (v == null || typeof v !== 'object' || !Object.hasOwn(v, k)) return undefined; v = v[k]; }
  return v;
}
export function escrever(obj, caminho, valor) {
  const s = segmentos(caminho);
  let o = obj;
  s.slice(0, -1).forEach((k, i) => { if (!Object.hasOwn(o, k) || typeof o[k] !== 'object' || o[k] === null) o[k] = /^\d+$/.test(s[i + 1]) ? [] : {}; o = o[k]; });
  o[s.at(-1)] = valor;
  return obj;
}

const datas = {
  'iso': d => d.toISOString(), 'data': d => d.toISOString().slice(0, 10),
  'dd/mm/aaaa': d => `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`,
  'mm/dd/yyyy': d => `${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}/${d.getUTCFullYear()}`,
};
const paraData = v => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(v)); const d = m ? new Date(Date.UTC(+m[3], +m[2] - 1, +m[1])) : new Date(v); if (Number.isNaN(d.getTime())) throw new Error('data inválida'); return d; };
// Funções permitidas. Cada uma recebe o valor e os parâmetros declarados (dados, nunca código).
export const TRANSFORMACOES = {
  trim: v => (typeof v === 'string' ? v.trim() : v),
  minusculas: v => (typeof v === 'string' ? v.toLowerCase() : v),
  maiusculas: v => (typeof v === 'string' ? v.toUpperCase() : v),
  texto: v => (v == null ? v : String(v)),
  numero: v => { if (v == null || v === '') return v; const s = String(v).trim(); const n = Number(/,\d{1,2}$/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')); if (!Number.isFinite(n)) throw new Error('número inválido'); return n; },
  inteiro: v => { const n = TRANSFORMACOES.numero(v); return n == null ? n : Math.trunc(n); },
  booleano: v => (typeof v === 'boolean' ? v : /^(sim|true|1|yes)$/i.test(String(v))),
  data: (v, p = {}) => (v == null ? v : (datas[p.formato] || datas.iso)(paraData(v))),
  enum: (v, p = {}) => { const m = p.mapa && typeof p.mapa === 'object' ? p.mapa : {}; if (Object.hasOwn(m, String(v))) return m[String(v)]; if (Object.hasOwn(p, 'senao')) return p.senao; throw new Error(`valor fora do mapa: ${String(v).slice(0, 40)}`); },
  juntar: (v, p = {}) => (Array.isArray(v) ? v.map(String).join(typeof p.separador === 'string' ? p.separador.slice(0, 5) : ', ') : v),
  dividir: (v, p = {}) => (typeof v === 'string' ? v.split(typeof p.separador === 'string' && p.separador ? p.separador.slice(0, 5) : ',').map(s => s.trim()).filter(Boolean) : v),
  limitar: (v, p = {}) => (typeof v === 'string' ? v.slice(0, Math.min(10000, Number(p.max) || 255)) : v),
};

export function validarRegras(regras) {
  if (!Array.isArray(regras) || regras.length > 200) throw new Error('regras de mapeamento inválidas');
  return regras.map(r => {
    if (!r || typeof r !== 'object') throw new Error('regra inválida');
    if (r.de != null) segmentos(r.de);
    segmentos(r.para);
    const ts = Array.isArray(r.transformar) ? r.transformar : [];
    for (const t of ts) if (!t || !Object.hasOwn(TRANSFORMACOES, t.op)) throw new Error(`transformação não permitida: ${String(t?.op).slice(0, 30)}`);
    const padrao = Object.hasOwn(r, 'padrao') ? r.padrao : undefined;
    if (padrao !== undefined && !['string', 'number', 'boolean'].includes(typeof padrao) && padrao !== null) throw new Error('padrão só pode ser valor simples');
    return { de: r.de ?? null, para: r.para, transformar: ts.map(t => ({ op: t.op, ...(t.formato ? { formato: String(t.formato) } : {}), ...(t.mapa ? { mapa: t.mapa } : {}), ...(Object.hasOwn(t, 'senao') ? { senao: t.senao } : {}), ...(t.separador ? { separador: t.separador } : {}), ...(t.max ? { max: t.max } : {}) })), ...(padrao !== undefined ? { padrao } : {}) };
  });
}

// Aplica as regras; erro de transformação vira erro do campo (não derruba o resto), e o resultado diz quais faltaram.
export function mapear(origem, regras) {
  const out = {}, erros = [];
  for (const r of validarRegras(regras)) {
    try {
      let v = r.de == null ? undefined : ler(origem, r.de);
      if (v === undefined && Object.hasOwn(r, 'padrao')) v = r.padrao;
      if (v === undefined) { erros.push({ campo: r.para, erro: 'ausente' }); continue; }
      for (const t of r.transformar) v = TRANSFORMACOES[t.op](v, t);
      escrever(out, r.para, v);
    } catch (e) { erros.push({ campo: r.para, erro: String(e.message).slice(0, 80) }); }
  }
  return { dados: out, erros };
}
