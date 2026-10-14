// Homologação (Etapa 6): programa o Quick Win sintético para daqui a alguns minutos (horário de Brasília) e ativa.
// Uso: rodar homolog-programar <A|B> [minutos=6]. Aviso vai para o email do próprio admin de homologação.
export default async function (c, letra = 'A', minutos = '6') {
  const L = String(letra).toUpperCase(), h = c.estado.homolog?.[L];
  if (!h?.quick_win) { c.log('SEM_QUICK_WIN'); return; }
  const alvo = new Date(Date.now() + Number(minutos) * 60e3);
  const hora = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false }).format(alvo);
  const corpo = { nome: `Programação sintética ${L}`, tipo: 'horario', agenda: { frequencia: 'diaria', hora, fuso: 'America/Sao_Paulo' },
    entrada: `Pontos fictícios de homologação (${h.marca}): equipe concluiu três revisões; próximo passo é conferir as pendências.`, limite_creditos: 50, max_dia: 1 };
  const r = await c.api('POST', `/api/quick-wins/${h.quick_win}/programacoes`, corpo);
  c.log('criar', r.status, JSON.stringify(r.dados).slice(0, 300));
  if (r.status !== 200) return;
  const a = await c.api('POST', `/api/quick-wins/${h.quick_win}/programacoes/${r.dados.id}/estado`, { ativa: true });
  c.log('ativar', a.status, JSON.stringify(a.dados).slice(0, 300));
  h.programacao = r.dados.id; h.programadaPara = hora;
  c.salvar(`homolog-programar-${L}`, { programacao: r.dados.id, hora, fuso: 'America/Sao_Paulo', criadaEm: new Date().toISOString(), ativar: a.status, proxima: a.dados?.proxima || r.dados?.proxima || null });
}
