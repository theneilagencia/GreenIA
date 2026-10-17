// QF-05: por que o design pela IA cai no motor clássico em produção. Lê só os metadados dos eventos visual.produced
// (motor, motivo e códigos da conferência do design), nunca o conteúdo das peças.
export default async function (c) {
  const r = await c.api('GET', '/api/admin/eventos?tipo=visual.produced&limite=60');
  const lista = r.dados?.eventos || r.dados || [];
  const resumo = {};
  for (const e of Array.isArray(lista) ? lista : []) {
    const d = typeof e.detalhes === 'string' ? JSON.parse(e.detalhes) : e.detalhes || e;
    const k = `${d.motor || '?'}|${d.motivo_classico || '-'}|${d.detalhe_classico || '-'}`;
    resumo[k] = (resumo[k] || 0) + 1;
  }
  c.salvar('22-design', { status: r.status, resumo });
  c.log('eventos', r.status, JSON.stringify(resumo).slice(0, 1500));
}
