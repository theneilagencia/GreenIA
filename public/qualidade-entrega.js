// A exigência vem do pedido atual. Uma correção pontual não herda por si só o
// custo de uma produção completa; o roteador trata a continuidade separadamente.
const normal = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export function exigeAltaQualidade(texto) {
  const t = normal(texto);
  if (/\b(troqu\w*|corrij\w*|corrig\w*|alter\w*|mude|substitu\w*)\b[^.\n]{0,35}\b(titulo|data|nome|ortografia)\b/.test(t) && !/\b(design|layout|todos|todas|reorganiz\w*|refa[cç]a|reescrev\w*)\b/.test(t)) return false;
  const produzir = /\b(cri\w*|gere|gerar|mont\w*|fa[cç]a|fazer|quero|preciso|entreg\w*|refa[cç]a|refazer|redesenh\w*|melhor\w*|reorganiz\w*|ajust\w*|elabor\w*|prepar\w*)\b/.test(t);
  const exige = /\b(altissim[oa] (nivel|qualidade)|alto nivel|alta qualidade|premium|excelencia|profissional|pront[oa] para (apresentar|publicar|o cliente)|padrao executivo)\b/g;
  let m;
  while ((m = exige.exec(t))) {
    if (/\b(sem|nao precisa (ser|de)|dispensa|nao quero)\s*$/.test(t.slice(Math.max(0, m.index - 40), m.index))) continue;
    if (produzir) return true;
  }
  return produzir && /\b(design|layout|visual)\b/.test(t) && /\b(mais proxim[oa] possivel|fiel|identic[oa])\b/.test(t);
}

export const NOTA_ALTA_QUALIDADE = '\nPADRÃO DE ENTREGA EXIGIDO: produza o material final completo, com narrativa clara, hierarquia visual, conteúdo específico e acabamento para uso profissional. Use os anexos como fontes; referências de design emprestam o visual, não os fatos. Preserve datas, valores, nomes, marcas e escopo do cliente. Ajuste apenas o que foi pedido. Não substitua a entrega por um roteiro, um resumo do que faria ou uma promessa de geração. Não aumente o número de slides sem necessidade autorizada. Não invente informações para preencher lacunas. A plataforma só confirma o arquivo depois de gerá-lo e validá-lo.';

export const NOTA_FIDELIDADE = '\nCUMPRIMENTO DO PEDIDO: execute a tarefa solicitada com o contexto e os recursos autorizados disponíveis. Entregue o resultado concreto, completo no escopo pedido; quando houver pedido de produção, uma descrição do que faria não substitui a produção. Preserve requisitos, restrições, números e conteúdo das fontes. Separe material de conteúdo de referências apenas visuais. Não amplie ou reduza o escopo sem necessidade. Se faltar um dado indispensável, pergunte de forma específica; se um recurso estiver indisponível, explique a limitação com precisão. Nunca afirme ter criado, alterado, conferido ou publicado algo que a execução não confirmou.';
