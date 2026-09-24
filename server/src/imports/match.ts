// Importação na execução: para cada conjunto de dados que o assistente declara,
// tenta os mapeamentos do tenant nos arquivos enviados e fica com o que entrega
// os campos obrigatórios com menos erros. O assistente não sabe de onde o
// arquivo veio; só o schema normalizado que espera.
import type { InputFile, ReadDoc, ReviewFlag } from '../blocks/types.ts';
import { globMatch } from '../blocks/values.ts';
import { aplicarMapeamento, serveParaArquivo, type ErroImportacao, type RegistroImportado } from './apply.ts';
import type { ConjuntoDados, MapeamentoAtivo } from './schema.ts';

export interface Importado {
  conjunto: string;
  mapeamento: { slug: string; nome: string; versao: number };
  registros: RegistroImportado[];
  erros: ErroImportacao[];
}

// Mapeamentos que podem servir ao conjunto: entregam todos os campos obrigatórios
// (e, se o assistente limitou, estão na lista dele).
export function candidatos(c: ConjuntoDados, maps: MapeamentoAtivo[]): MapeamentoAtivo[] {
  const obrig = c.campos.filter(f => f.obrigatorio).map(f => f.campo);
  return maps.filter(m => (!c.mapeamentos.length || c.mapeamentos.includes(m.slug))
    && obrig.every(f => m.config.campos.some(x => x.campo === f)));
}

export async function importarConjuntos(conjuntos: ConjuntoDados[], files: InputFile[], docs: ReadDoc[], maps: MapeamentoAtivo[]) {
  const flags: ReviewFlag[] = [];
  const resumo: { arquivo: string; conjunto: string; mapeamento: string; versao: number; registros: number; errosDeLinha: number }[] = [];
  for (const c of conjuntos) {
    const cands = candidatos(c, maps);
    const obrig = c.campos.filter(f => f.obrigatorio).map(f => f.campo);
    for (const d of docs) {
      if (d.dados && Object.keys(d.dados).length) continue;             // já é de um leitor especializado
      if (c.arquivo ? !globMatch(c.arquivo, d.name) : !['xlsx', 'csv', 'texto'].includes(d.kind)) continue;
      const f = files.find(x => x.id === d.fileId);
      if (!f) continue;
      const tentaveis = cands.filter(m => serveParaArquivo(m.config, d.name));
      let melhor: Importado | null = null;
      for (const m of tentaveis) {
        const r = await aplicarMapeamento(f.bytes, d.name, m.config);
        if (!r.registros.length || r.erros.some(e => e.linha === undefined)) continue;
        if (r.registros.some(x => obrig.some(k => x.dados[k] === null || x.dados[k] === undefined))) continue;
        const cand: Importado = { conjunto: c.id, mapeamento: { slug: m.slug, nome: m.nome, versao: m.versao }, registros: r.registros, erros: r.erros };
        // Menos linhas com erro; empate: mais registros; depois o slug (determinístico).
        if (!melhor || cand.erros.length < melhor.erros.length || (cand.erros.length === melhor.erros.length && cand.registros.length > melhor.registros.length)) melhor = cand;
      }
      if (!melhor) {
        if (c.arquivo) flags.push({ reason: tentaveis.length ? `nenhum mapeamento de importação leu ${c.nome} neste arquivo` : `nenhum mapeamento de importação do tenant serve para ${c.nome} neste tipo de arquivo`, ref: d.name });
        continue;
      }
      (d.importado ??= {})[c.id] = melhor;
      for (const e of melhor.erros) flags.push({ reason: `linha fora da importação (${e.campo ?? ''}: ${e.motivo})`, ref: `${d.name}${e.linha ? ` › linha ${e.linha}` : ''}` });
      resumo.push({ arquivo: d.name, conjunto: c.id, mapeamento: melhor.mapeamento.nome, versao: melhor.mapeamento.versao, registros: melhor.registros.length, errosDeLinha: melhor.erros.length });
    }
  }
  // Planilha ou CSV que nenhum conjunto aproveitou: avisa, para não parecer lido.
  if (conjuntos.length) for (const d of docs) {
    if ((d.kind === 'xlsx' || d.kind === 'csv') && !d.importado && !(d.dados && Object.keys(d.dados).length)) flags.push({ reason: 'nenhum mapeamento de importação do tenant leu este arquivo', ref: d.name });
  }
  return { flags, resumo };
}
