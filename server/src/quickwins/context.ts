// Contexto de quick win de uma execução. Cada execução pertence a no máximo um
// quick win, para nenhuma ser contada duas vezes. Quando o assistente está em
// mais de um quick win ativo, a pessoa escolhe; sem escolha, vale a área de
// quem executa, se ela apontar um só quick win.
import type { Tx } from '../db/pool.ts';

export interface ActiveQuickWin { id: string; titulo: string; areaIds: string[]; areas: string }

// Quick wins em implantação ou medição que usam o assistente (os que a pessoa enxerga).
export async function activeQuickWinsFor(tx: Tx, assistantId: string): Promise<ActiveQuickWin[]> {
  return (await tx.query(
    `select q.id, q.title,
            array(select qa.area_id from quick_win_areas qa where qa.quick_win_id = q.id) as area_ids,
            (select string_agg(ar.name, ', ' order by ar.name) from quick_win_areas qa join areas ar on ar.id = qa.area_id where qa.quick_win_id = q.id) as areas
     from quick_wins q
     where q.stage in ('em_implantacao', 'em_medicao')
       and exists (select 1 from quick_win_resources r where r.quick_win_id = q.id and r.assistant_id = $1)
     order by q.created_at`, [assistantId])).rows.map(r => ({ id: r.id, titulo: r.title, areaIds: r.area_ids ?? [], areas: r.areas ?? '' }));
}

export type RunContext = { quickWinId: string | null; areaId?: string } | { error: 'escolha_o_quick_win' | 'quick_win_nao_serve'; opcoes: { id: string; titulo: string; areas: string }[] };

// requested: id escolhido; null = fora dos quick wins, escolhido pela pessoa;
// undefined = sem escolha. eligible: áreas pelas quais a pessoa pode usar o assistente.
export function resolveRunQuickWin(list: ActiveQuickWin[], runArea: string | null, requested: string | null | undefined, eligible: string[]): RunContext {
  const view = (qs: ActiveQuickWin[]) => qs.map(q => ({ id: q.id, titulo: q.titulo, areas: q.areas }));
  if (requested === null) return { quickWinId: null };
  if (requested) {
    const q = list.find(x => x.id === requested);
    if (!q) return { error: 'quick_win_nao_serve', opcoes: view(list) };
    // A execução passa para uma área do quick win escolhido, se a pessoa usa o assistente por ela.
    const areaId = runArea && q.areaIds.includes(runArea) ? runArea : q.areaIds.find(a => eligible.includes(a));
    return { quickWinId: q.id, ...(areaId ? { areaId } : {}) };
  }
  const byArea = runArea ? list.filter(q => q.areaIds.includes(runArea)) : [];
  if (byArea.length === 1) return { quickWinId: byArea[0].id };
  if (byArea.length > 1) return { error: 'escolha_o_quick_win', opcoes: view(byArea) };
  // A área da execução não aponta nenhum; se a pessoa também usa o assistente pela área de algum quick win, ela escolhe.
  const reachable = list.filter(q => q.areaIds.some(a => eligible.includes(a)));
  if (reachable.length) return { error: 'escolha_o_quick_win', opcoes: view(reachable) };
  return { quickWinId: null };                                         // fora dos quick wins
}
