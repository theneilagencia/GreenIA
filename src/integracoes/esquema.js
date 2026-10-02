// Validação de dados contra um esquema JSON (subconjunto declarativo: type, properties, required, items, enum,
// minLength/maxLength, minimum/maximum, pattern, additionalProperties). Sem $ref remoto, sem código.
const TIPOS = ['object', 'array', 'string', 'number', 'integer', 'boolean', 'null'];
const tipoDe = v => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v === 'number' ? (Number.isInteger(v) ? 'integer' : 'number') : typeof v);
const casa = (esperado, real) => esperado === real || (esperado === 'number' && real === 'integer');

export function validarEsquema(valor, esquema, caminho = '$', erros = [], profundidade = 0) {
  if (!esquema || typeof esquema !== 'object' || erros.length >= 20) return erros;
  if (profundidade > 32) { erros.push({ caminho, erro: 'profundidade' }); return erros; }
  const tipos = [].concat(esquema.type || []).filter(t => TIPOS.includes(t));
  const real = tipoDe(valor);
  if (tipos.length && !tipos.some(t => casa(t, real)) && !(esquema.nullable && valor === null)) { erros.push({ caminho, erro: 'tipo', esperado: tipos.join('|'), recebido: real }); return erros; }
  if (Array.isArray(esquema.enum) && !esquema.enum.some(e => e === valor)) erros.push({ caminho, erro: 'enum' });
  if (real === 'string') {
    if (Number.isInteger(esquema.minLength) && valor.length < esquema.minLength) erros.push({ caminho, erro: 'minLength' });
    if (Number.isInteger(esquema.maxLength) && valor.length > esquema.maxLength) erros.push({ caminho, erro: 'maxLength' });
    if (typeof esquema.pattern === 'string' && esquema.pattern.length <= 200) { try { if (!new RegExp(esquema.pattern, 'u').test(valor)) erros.push({ caminho, erro: 'pattern' }); } catch { /* padrão inválido na especificação: ignorado */ } }
  }
  if (real === 'number' || real === 'integer') {
    if (Number.isFinite(esquema.minimum) && valor < esquema.minimum) erros.push({ caminho, erro: 'minimum' });
    if (Number.isFinite(esquema.maximum) && valor > esquema.maximum) erros.push({ caminho, erro: 'maximum' });
  }
  if (real === 'object') {
    for (const k of Array.isArray(esquema.required) ? esquema.required : []) if (!Object.hasOwn(valor, k)) erros.push({ caminho: `${caminho}.${k}`, erro: 'obrigatorio' });
    const props = esquema.properties && typeof esquema.properties === 'object' ? esquema.properties : {};
    for (const [k, sub] of Object.entries(props)) if (Object.hasOwn(valor, k)) validarEsquema(valor[k], sub, `${caminho}.${k}`, erros, profundidade + 1);
    if (esquema.additionalProperties === false) for (const k of Object.keys(valor)) if (!Object.hasOwn(props, k)) erros.push({ caminho: `${caminho}.${k}`, erro: 'nao_permitido' });
  }
  if (real === 'array' && esquema.items) valor.slice(0, 200).forEach((v, i) => validarEsquema(v, esquema.items, `${caminho}[${i}]`, erros, profundidade + 1));
  return erros;
}

// Gravidade de uma falha de esquema na resposta: campo obrigatório ou tipo errado na raiz é inconsistente; o resto
// (enum, tamanho, padrão, campo extra) é parcial.
export function gravidadeEsquema(erros) {
  if (!erros.length) return null;
  return erros.some(e => (e.erro === 'tipo' && e.caminho.split(/[.[]/).length <= 2) || e.erro === 'obrigatorio') ? 'inconsistente' : 'parcial';
}
