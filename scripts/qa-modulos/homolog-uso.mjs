// Homologação (Etapa 5): fotografia do consumo da empresa e dos bloqueios (para provar "nenhum débito" na negação).
export default async function (c, rotulo = 'agora') {
  const u = (await c.api('GET', '/api/admin/uso')).dados || {};
  const ev = (await c.api('GET', '/api/admin/eventos?prefixo=policy.')).dados?.eventos || [];
  const ai = (await c.api('GET', '/api/admin/eventos?prefixo=ai.')).dados?.eventos || [];
  const resumo = { rotulo, respostasIA: ai.filter(e => /completed|concluid/.test(e.tipo)).length, bloqueios: ev.filter(e => e.tipo === 'policy.blocked').map(e => JSON.parse(e.detalhes || '{}').motivo), uso: JSON.stringify(u).slice(0, 600) };
  c.salvar(`homolog-uso-${rotulo}`, { resumo, uso: u });
  c.log('uso', JSON.stringify(resumo).slice(0, 900));
}
