// Motor de políticas das integrações: ALLOW, DENY ou REQUIRE_APPROVAL. As regras são DADOS (por empresa, na
// configuração), avaliadas em ordem; a primeira que casa decide. O motor não conhece sistema, setor nem cenário.
//
// regra = { quando: { modo, classe, risco: [..], efeito, categoria, origem, sistema, conector, capability, quick_win,
//                     papel, ambiente, dados }, decisao, motivo }
// Invariantes (acima de qualquer regra): conector que não está ativo -> DENY; operação destrutiva ou risco crítico
// nunca é ALLOW (no máximo REQUIRE_APPROVAL, se a empresa escreveu essa regra; sem regra, DENY); escrita de conector
// gerado nunca é ALLOW sem aprovação.
export const DECISOES = ['ALLOW', 'DENY', 'REQUIRE_APPROVAL'];
const CAMPOS = ['modo', 'classe', 'risco', 'efeito', 'categoria', 'origem', 'sistema', 'conector', 'capability', 'quick_win', 'papel', 'ambiente', 'dados'];

// Regras iniciais (dados, editáveis pela empresa). Leitura de risco baixo/médio passa; escrita, comunicação, dado
// pessoal ou financeiro pedem aprovação; destrutivo e crítico são negados.
export const POLITICA_PADRAO = [
  { quando: { classe: 'DESTRUCTIVE' }, decisao: 'DENY', motivo: 'Operação que apaga ou desfaz não roda automaticamente.' },
  { quando: { risco: ['CRITICAL'] }, decisao: 'DENY', motivo: 'Risco crítico.' },
  { quando: { efeito: 'financial' }, decisao: 'REQUIRE_APPROVAL', motivo: 'Envolve dado ou efeito financeiro.' },
  { quando: { efeito: 'personal_data' }, decisao: 'REQUIRE_APPROVAL', motivo: 'Envolve dados pessoais.' },
  { quando: { efeito: 'communication' }, decisao: 'REQUIRE_APPROVAL', motivo: 'Dispara comunicação para fora.' },
  { quando: { modo: 'write' }, decisao: 'REQUIRE_APPROVAL', motivo: 'Muda dados num sistema externo.' },
  { quando: { modo: 'read', risco: ['LOW', 'MEDIUM'] }, decisao: 'ALLOW', motivo: 'Leitura de risco baixo ou médio.' },
  { quando: {}, decisao: 'REQUIRE_APPROVAL', motivo: 'Sem regra específica: precisa de aprovação.' },
];

export function validarPolitica(regras) {
  if (!Array.isArray(regras) || regras.length > 100) throw new Error('A política precisa ser uma lista de até 100 regras.');
  return regras.map((r, i) => {
    if (!DECISOES.includes(r?.decisao)) throw new Error(`Regra ${i + 1}: decisão inválida.`);
    const q = r.quando && typeof r.quando === 'object' ? r.quando : {};
    const desconhecidos = Object.keys(q).filter(k => !CAMPOS.includes(k));
    if (desconhecidos.length) throw new Error(`Regra ${i + 1}: campo desconhecido (${desconhecidos.join(', ')}).`);
    const limpo = Object.fromEntries(Object.entries(q).map(([k, v]) => [k, Array.isArray(v) ? v.map(x => String(x).slice(0, 80)).slice(0, 20) : String(v).slice(0, 80)]));
    return { quando: limpo, decisao: r.decisao, motivo: String(r.motivo || '').slice(0, 200) };
  });
}

const bate = (regra, valor) => (Array.isArray(regra) ? regra.includes(valor) : regra === valor);
function casa(quando, ctx) {
  for (const [k, v] of Object.entries(quando)) {
    if (k === 'efeito') { if (!(Array.isArray(v) ? v : [v]).some(e => ctx.efeitos?.[e] === true)) return false; continue; }
    if (k === 'papel') { if (!(Array.isArray(v) ? v : [v]).some(p => (ctx.papeis || []).includes(p))) return false; continue; }
    if (k === 'dados') { if (!(Array.isArray(v) ? v : [v]).some(d => (ctx.dados || []).includes(d))) return false; continue; }
    if (!bate(v, ctx[k] == null ? null : String(ctx[k]))) return false;
  }
  return true;
}

// ctx = { modo, classe, risco, efeitos, categoria, origem, sistema, conector, capability, quick_win, papeis, ambiente,
//         dados, conectorAtivo }
export function decidir(regras, ctx) {
  if (ctx.conectorAtivo === false) return { decisao: 'DENY', motivo: 'O conector não está ativo.', regra: 'invariante' };
  const lista = regras?.length ? regras : POLITICA_PADRAO;
  const i = lista.findIndex(r => casa(r.quando || {}, ctx));
  let d = i >= 0 ? { decisao: lista[i].decisao, motivo: lista[i].motivo || '', regra: i } : { decisao: 'REQUIRE_APPROVAL', motivo: 'Sem regra aplicável.', regra: 'padrao' };
  const destrutivo = ctx.classe === 'DESTRUCTIVE' || ctx.efeitos?.irreversible === true;
  if ((destrutivo || ctx.risco === 'CRITICAL') && d.decisao === 'ALLOW') d = { decisao: 'DENY', motivo: 'Operação destrutiva ou de risco crítico nunca é liberada sem aprovação explícita.', regra: 'invariante' };
  if (ctx.modo === 'write' && ctx.origem === 'generated' && d.decisao === 'ALLOW') d = { decisao: 'REQUIRE_APPROVAL', motivo: 'Escrita por conector gerado sempre passa por aprovação.', regra: 'invariante' };
  return d;
}
