// Cálculos conferidos de uma planilha (sem IA): o modelo lê as linhas, mas não soma 120 linhas de cabeça com
// segurança. Homologação real: os desvios linha a linha vinham certos e os totais por categoria vinham errados.
// Aqui, sobre TODAS as linhas: totais, médias, mínimo e máximo (com a linha), vazios, valores fora do padrão,
// somas por categoria e a variação entre as duas primeiras colunas numéricas. Genérico: nenhuma coluna, setor ou
// nome esperado; só tipos (número, categoria, identificador). Vai junto do texto extraído, marcado como conferido.
export const MIN_LINHAS = 10;
const MAX_CATEGORIAS = 20, MAX_CARACTERES = 4000;

// "1.234,50", "1234.5", "R$ 9.773", "-10,9%", "  42 " -> número; texto -> null.
export function numero(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v ?? '').trim().replace(/^R\$\s?/i, '').replace(/%$/, '').replace(/\s/g, '');
  if (!s || !/^[-+]?[\d.,]+$/.test(s)) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^[-+]?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
const fmt = n => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const pct = n => `${n > 0 ? '+' : ''}${n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

// cabecalho: nomes das colunas; linhas: matriz de células (texto ou número). null se não houver o que calcular.
export function resumoDeTabela(cabecalho, linhas) {
  if (!Array.isArray(linhas) || linhas.length < MIN_LINHAS || !cabecalho?.length) return null;
  const cols = cabecalho.map((nome, i) => {
    const vals = linhas.map(l => l[i]);
    const cheios = vals.filter(v => String(v ?? '').trim() !== '');
    const nums = cheios.map(numero).filter(n => n !== null);
    const distintos = new Set(cheios.map(v => String(v).trim()));
    const tipo = cheios.length && nums.length / cheios.length >= 0.8 ? 'numero'
      : distintos.size === cheios.length && cheios.length === linhas.length ? 'id'
      : distintos.size >= 2 && distintos.size <= MAX_CATEGORIAS ? 'categoria' : 'texto';
    return { i, nome: String(nome || `Coluna ${i + 1}`).trim(), tipo, vazios: linhas.length - cheios.length };
  });
  const numericas = cols.filter(c => c.tipo === 'numero');
  if (!numericas.length) return null;
  const idCol = cols.find(c => c.tipo === 'id');
  const rotuloDa = (l, k) => (idCol ? String(linhas[k][idCol.i]).trim() : `linha ${k + 2}`);
  const out = [`Cálculos conferidos pela GreenIA sobre todas as ${linhas.length} linhas de dados (use estes números; não some nem recalcule de cabeça):`];
  for (const c of cols.filter(x => x.vazios)) {
    const quais = linhas.map((l, k) => (String(l[c.i] ?? '').trim() === '' ? rotuloDa(l, k) : null)).filter(Boolean);
    out.push(`- Vazios em "${c.nome}": ${c.vazios} (${quais.slice(0, 12).join(', ')}${quais.length > 12 ? ', ...' : ''}).`);
  }
  for (const c of numericas) {
    const v = linhas.map((l, k) => ({ n: numero(l[c.i]), k })).filter(x => x.n !== null);
    const total = v.reduce((s, x) => s + x.n, 0), min = v.reduce((a, x) => (x.n < a.n ? x : a)), max = v.reduce((a, x) => (x.n > a.n ? x : a));
    out.push(`- "${c.nome}": total ${fmt(total)} (${v.length} valores); média ${fmt(total / v.length)}; mínimo ${fmt(min.n)} (${rotuloDa(null, min.k)}); máximo ${fmt(max.n)} (${rotuloDa(null, max.k)}).`);
    // Fora do padrão: além de 3 intervalos interquartis dos quartis (robusto a poucos extremos).
    const ord = v.map(x => x.n).sort((a, b) => a - b), q = p => ord[Math.floor(p * (ord.length - 1))];
    const iqr = q(0.75) - q(0.25), fora = v.filter(x => iqr > 0 && (x.n > q(0.75) + 3 * iqr || x.n < q(0.25) - 3 * iqr));
    if (fora.length && fora.length <= 10) out.push(`  Fora do padrão em "${c.nome}": ${fora.map(x => `${rotuloDa(null, x.k)} (${fmt(x.n)})`).join(', ')}.`);
  }
  // Variação entre as duas primeiras colunas numéricas (ex.: previsto e realizado), linha a linha: as maiores.
  const [a, b] = numericas;
  if (b) {
    const vari = linhas.map((l, k) => ({ x: numero(l[a.i]), y: numero(l[b.i]), k })).filter(r => r.x !== null && r.y !== null && r.x !== 0)
      .map(r => ({ ...r, p: (r.y / r.x - 1) * 100 })).sort((r, s) => Math.abs(s.p) - Math.abs(r.p));
    if (vari.length) out.push(`- Maiores variações de "${b.nome}" em relação a "${a.nome}": ${vari.slice(0, 8).map(r => `${rotuloDa(null, r.k)} ${pct(r.p)} (${fmt(r.x)} → ${fmt(r.y)})`).join('; ')}.`);
  }
  for (const cat of cols.filter(c => c.tipo === 'categoria').slice(0, 3)) {
    const grupos = new Map();
    linhas.forEach(l => { const g = String(l[cat.i] ?? '').trim() || '(vazio)'; if (!grupos.has(g)) grupos.set(g, []); grupos.get(g).push(l); });
    const linhasCat = [...grupos.entries()].map(([g, ls]) => {
      const somas = numericas.slice(0, 3).map(c => { const v = ls.map(l => numero(l[c.i])).filter(n => n !== null); return { c, total: v.reduce((s, n) => s + n, 0), n: v.length }; });
      // Variação da categoria só nas linhas com os dois valores (comparação de igual para igual).
      const pares = b ? ls.map(l => [numero(l[a.i]), numero(l[b.i])]).filter(([x, y]) => x !== null && y !== null) : [];
      const sx = pares.reduce((t, [x]) => t + x, 0), sy = pares.reduce((t, [, y]) => t + y, 0);
      const varia = sx ? `, variação ${pct((sy / sx - 1) * 100)}${pares.length < ls.length ? ` (nas ${pares.length} linhas com os dois valores)` : ''}` : '';
      return `${g} (${ls.length} linhas): ${somas.map(s => `${s.c.nome} ${fmt(s.total)}${s.n < ls.length ? ` em ${s.n} valores` : ''}`).join('; ')}${varia}`;
    });
    out.push(`- Por "${cat.nome}": ${linhasCat.join(' | ')}.`);
  }
  const texto = out.join('\n');
  return texto.length > MAX_CARACTERES ? `${texto.slice(0, MAX_CARACTERES)}…` : texto;
}

// Texto delimitado (";" ou "," ou tab) -> cabeçalho e linhas, para o mesmo resumo de um CSV.
export function resumoDeCsv(texto) {
  const ls = String(texto || '').replace(/\r/g, '').split('\n').filter(l => l.trim());
  if (ls.length < MIN_LINHAS + 1) return null;
  const sep = [';', '\t', ','].find(s => ls[0].split(s).length >= 2 && ls.slice(1, 6).every(l => l.split(s).length === ls[0].split(s).length));
  if (!sep) return null;
  const partes = ls.map(l => l.split(sep).map(x => x.trim().replace(/^"|"$/g, '')));
  return resumoDeTabela(partes[0], partes.slice(1));
}
