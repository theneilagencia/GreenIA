// Conferência do caso sintético U05: a data-base vem do material, não do relógio da execução.
const norm = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const celulas = l => l.trim().replace(/^\||\|$/g, '').split('|').map(x => x.replace(/\*\*/g, '').trim());
const data = s => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s.trim()); return m ? Date.UTC(+m[3], +m[2] - 1, +m[1]) : NaN; };
export function verificarFacilitiesQa(material, resultado) {
  const referencia = /Data de extração do relatório:\s*(\d{2}\/\d{2}\/\d{4})/i.exec(material)?.[1];
  const linhas = String(material).split('\n').filter(l => /^\s*\|\s*OS-\d+/.test(l)).map(celulas);
  if (!referencia || !linhas.length) return { falhas: ['Material de facilities sem data-base e registros verificáveis'], esperados: [] };
  const esperados = linhas.filter(l => (data(referencia) - data(l[1])) / 86400000 > 15 && !/concluid|encerrad|cancelad/.test(norm(l[6])));
  const fonte = new Map(esperados.map(l => [l[0], l])); const encontrados = new Set(), falhas = [];
  let grupo = null, cab = [];
  const tipos = new Set(linhas.map(l => norm(l[2])));
  for (const linha of String(resultado).split('\n')) {
    if (/^#{1,6}\s/.test(linha)) { const h = norm(linha.replace(/^#+\s*/, '')); grupo = [...tipos].find(t => h === t) || null; cab = []; continue; }
    if (!/^\s*\|/.test(linha)) continue;
    const c = celulas(linha), id = c.join(' ').match(/\bOS-\d+\b/)?.[0];
    if (!id) { if (!c.every(x => /^:?-+:?$/.test(x))) cab = c.map(norm); continue; }
    encontrados.add(id); const f = fonte.get(id);
    if (!f) { falhas.push(`Facilities: registro fora do filtro solicitado (${id})`); continue; }
    const iTipo = cab.findIndex(x => /tipo.*servico/.test(x));
    if ((iTipo >= 0 ? norm(c[iTipo]) : grupo) !== norm(f[2])) falhas.push(`Facilities: agrupamento por tipo não verificável (${id})`);
    const iResponsavel = cab.findIndex(x => /responsavel/.test(x));
    if (!f[4] && (iResponsavel < 0 || norm(c[iResponsavel] || '') !== 'nao informado')) falhas.push(`Facilities: responsável ausente deve ser sinalizado na linha (${id})`);
  }
  for (const [id] of fonte) if (!encontrados.has(id)) falhas.push(`Facilities: registro elegível omitido (${id})`);
  return { referencia, esperados: [...fonte.keys()], encontrados: [...encontrados], falhas: [...new Set(falhas)] };
}
