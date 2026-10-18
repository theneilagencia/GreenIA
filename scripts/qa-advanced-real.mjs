import { CURADORIA_ADVANCED } from '../src/advanced.js';
// Só prepara a empresa FICTÍCIA de QA. Os limites vêm do catálogo consultado, nunca de uma fixture ampliada.
export function selecionarRotaQa(modelos, agora = Date.now(), { pesquisaWeb = false, limiteReservaUsd = 2 } = {}) {
  if (![2, 3].includes(limiteReservaUsd)) throw new Error('A reserva do QA deve ser 2 ou 3, informada explicitamente.');
  const candidatas = [];
  for (const m of modelos) {
    const c = m.atributos?.catalogo;
    if (!CURADORIA_ADVANCED.some(x => x.id === m.id) || m.perfil !== 'avancado' || m.vetadoPlataforma || !m.noCatalogo || !c?.consultadoEm || agora - Date.parse(c.consultadoEm) > 48 * 3600000 || !Number.isFinite(Date.parse(c.consultadoEm))) continue;
    if (!c.parametros?.includes('max_tokens') || !c.parametros?.includes('tools') || !(Number.isFinite(c.contexto) && c.contexto >= 200000) || !(Number.isFinite(c.maxSaida) && c.maxSaida >= 32768)) continue;
    for (const rota of c.rotas || []) {
      if (!rota.id || !rota.parametros?.includes('max_tokens') || !rota.parametros?.includes('tools') || !(Number.isFinite(rota.contexto) && rota.contexto >= 200000) || !(Number.isFinite(rota.maxSaida) && rota.maxSaida >= 32768) || ![c.entrada, c.saida, rota.entrada, rota.saida].every(n => Number.isFinite(n) && n > 0)) continue;
      const entrada = Math.max(c.entrada, rota.entrada, ...(c.precosAlternativos || []).map(p => Number(p.prompt)));
      const saida = Math.max(c.saida, rota.saida, ...(c.precosAlternativos || []).map(p => Number(p.completion)));
      const estimativa = 20000 * entrada + 32768 * saida;
      const estimativaPesquisa = (Math.min(c.contexto, rota.contexto) - 32768) * entrada + 32768 * saida + 0.007;
      if (![estimativa, estimativaPesquisa].every(v => Number.isFinite(v) && v > 0) || pesquisaWeb && estimativaPesquisa > limiteReservaUsd) continue;
      candidatas.push({ modelo: m.id, provedor: rota.id, estimativa, estimativaPesquisa });
    }
  }
  return candidatas.sort((a, b) => a.estimativa - b.estimativa || a.modelo.localeCompare(b.modelo))[0] || null;
}
export async function prepararAdvancedQa(ana, modelos, pessoaId, { pesquisaWeb = false, limiteReservaUsd = 2 } = {}) {
  const conferir = (r, etapa) => { if (r.status !== 200) throw new Error(`${etapa}: HTTP ${r.status}, ${r.dados?.erro || 'sem código'}`); return r.dados; };
  const rota = selecionarRotaQa(modelos, Date.now(), { pesquisaWeb, limiteReservaUsd });
  if (!rota || rota.estimativa > limiteReservaUsd) return { pendente: pesquisaWeb ? `Nenhuma rota Advanced atual permite a reserva integral de pesquisa dentro dos US$ ${limiteReservaUsd} do QA. Não iniciar inferências nem alterar limites.` : 'Nenhuma rota Advanced atual elegível dentro do orçamento de preparação; não há autorização positiva a testar.' };
  conferir(await ana.put('/api/admin/advanced/config', { limiteMensalUsd: limiteReservaUsd }), 'Orçamento fictício');
  conferir(await ana.put('/api/admin/modelos/' + encodeURIComponent(rota.modelo), { liberado: true }), 'Habilitação local');
  conferir(await ana.put('/api/admin/advanced/modelos/' + encodeURIComponent(rota.modelo), { aprovado: true, provedores: [rota.provedor], justificativa: 'QA isolado de dados fictícios: rota do catálogo atual, sem suspender controles de dados, retenção ou treino.' }), 'Revisão local de rota');
  const a = conferir(await ana.post('/api/admin/advanced/autorizacoes', { pessoa_id: pessoaId, modelos: [rota.modelo], provedores: [rota.provedor], limite_usd: limiteReservaUsd, limite_chamada_usd: limiteReservaUsd, saida_tokens: 32768, pesquisa_web: true, expira_em: new Date(Date.now() + 3600000).toISOString() }), 'Autorização local');
  conferir(await ana.put('/api/admin/modelos-config', { padroes: { avancado: rota.modelo } }), 'Padrão local Advanced');
  return { ...rota, limiteReservaUsd, id: a.id, escopo: 'somente empresa fictícia e dados sintéticos desta rodada' };
}
