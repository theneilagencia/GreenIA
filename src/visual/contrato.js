// Contrato universal do artefato visual. Um Quick Win não "faz social media" nem "faz apresentação": um entregável
// dele pode precisar de um ARTEFATO VISUAL, e este contrato descreve qualquer um deles da mesma forma.
//
// visual_artifact (gravado no entregável como `visual` e, depois da execução, na tabela artefatos_visuais):
//   { tipo, rotulo, objetivo, publico, formato, dimensoes {w, h}, orientacao, paginas, hierarquia,
//     identidade_visual (resolvida, com a origem de cada campo), assets [], composicao (plano visual),
//     restricoes [], criterios [], exportacoes [] }
//
// O TIPO é semântico e extensível: o registro abaixo só guarda TRAÇOS (formato padrão, se é multipágina, se tem
// capa, se é peça de impacto, como o conteúdo vira páginas). O motor lê os traços, nunca o nome do tipo. Tipo
// desconhecido vira `custom`, com o rótulo que veio, sem mudança de código.
const limpar = (s, max) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Formatos de página. Unidade: px (96 por polegada). pdf: pontos por px; png: escala da exportação.
// corpo/minimo: tamanho do texto de corpo e o menor tamanho legível naquele formato (base da tipografia e do QA).
export const FORMATOS = {
  a4: { rotulo: 'A4 retrato', w: 794, h: 1123, pdf: 0.75, png: 2, corpo: 13, minimo: 9 },
  a4_paisagem: { rotulo: 'A4 paisagem', w: 1123, h: 794, pdf: 0.75, png: 2, corpo: 13, minimo: 9 },
  '16:9': { rotulo: 'Tela 16:9', w: 1280, h: 720, pdf: 0.75, png: 1.5, corpo: 21, minimo: 14 },
  '1:1': { rotulo: 'Quadrado 1:1', w: 1080, h: 1080, pdf: 0.5, png: 1, corpo: 32, minimo: 22 },
  '4:5': { rotulo: 'Vertical 4:5', w: 1080, h: 1350, pdf: 0.5, png: 1, corpo: 32, minimo: 22 },
  '9:16': { rotulo: 'Vertical 9:16', w: 1080, h: 1920, pdf: 0.5, png: 1, corpo: 36, minimo: 24 },
  '1.91:1': { rotulo: 'Horizontal 1.91:1', w: 1200, h: 628, pdf: 0.5, png: 1, corpo: 24, minimo: 16 },
};
const APELIDOS_FORMATO = { a4_retrato: 'a4', retrato: 'a4', vertical_a4: 'a4', paisagem: 'a4_paisagem', landscape: 'a4_paisagem', a4_horizontal: 'a4_paisagem', '16x9': '16:9', slide: '16:9', tela: '16:9',
  quadrado: '1:1', '1x1': '1:1', square: '1:1', '4x5': '4:5', vertical: '4:5', '9x16': '9:16', story: '9:16', stories: '9:16', '1.91x1': '1.91:1', horizontal: '1.91:1', banner: '1.91:1' };
export const formatoValido = f => { const k = norm(f).replace(/\s+/g, '_'); return FORMATOS[f] ? f : FORMATOS[k] ? k : APELIDOS_FORMATO[k] || null; };

// Traços do tipo:
//  multipagina: o artefato tem várias páginas; capa: começa com capa; impacto: peça de leitura rápida (pouco texto,
//  título grande, chamada); fluxo: 'secao' (uma seção por página, como slides) ou 'continuo' (as seções correm pelas
//  páginas, como um documento); foco: o bloco que o tipo valoriza quando o conteúdo permite (grafico, diagrama,
//  linha_tempo, tabela, cartoes, indicadores).
export const TIPOS = {
  presentation: { rotulo: 'Apresentação', formato: '16:9', multipagina: true, capa: true, fluxo: 'secao' },
  one_page: { rotulo: 'One-page', formato: 'a4', multipagina: false },
  report: { rotulo: 'Relatório visual', formato: 'a4', multipagina: true, capa: true, fluxo: 'continuo' },
  infographic: { rotulo: 'Infográfico', formato: 'a4', multipagina: false, foco: 'indicadores' },
  diagram: { rotulo: 'Diagrama', formato: 'a4_paisagem', multipagina: false, foco: 'diagrama' },
  process_map: { rotulo: 'Mapa de processo', formato: 'a4_paisagem', multipagina: false, foco: 'diagrama' },
  dashboard: { rotulo: 'Dashboard', formato: 'a4_paisagem', multipagina: false, foco: 'grafico' },
  comparison: { rotulo: 'Comparativo', formato: 'a4_paisagem', multipagina: false, foco: 'tabela' },
  checklist: { rotulo: 'Checklist visual', formato: 'a4', multipagina: false, foco: 'checklist' },
  timeline: { rotulo: 'Cronograma', formato: 'a4_paisagem', multipagina: false, foco: 'linha_tempo' },
  poster: { rotulo: 'Cartaz', formato: 'a4', multipagina: false, impacto: true },
  cover: { rotulo: 'Capa', formato: 'a4', multipagina: false, impacto: true },
  // Imagem final: a imagem gerada É a peça (texto, logo e chamada compostos por cima, de forma determinística).
  image: { rotulo: 'Imagem final', formato: '1:1', multipagina: false, impacto: true, imagemFinal: true },
  social_post: { rotulo: 'Peça para redes sociais', formato: '1:1', multipagina: false, impacto: true },
  carousel: { rotulo: 'Carrossel', formato: '4:5', multipagina: true, capa: true, impacto: true, fluxo: 'secao' },
  ad: { rotulo: 'Anúncio', formato: '1:1', multipagina: false, impacto: true },
  training_material: { rotulo: 'Material de treinamento', formato: '16:9', multipagina: true, capa: true, fluxo: 'secao' },
  proposal: { rotulo: 'Proposta', formato: 'a4', multipagina: true, capa: true, fluxo: 'continuo' },
  document: { rotulo: 'Documento', formato: 'a4', multipagina: true, capa: false, fluxo: 'continuo' },
  custom: { rotulo: 'Artefato visual', formato: 'a4', multipagina: null },
};
// Nomes que o pedido ou a IA usam para os tipos conhecidos (qualquer outro vira custom).
const APELIDOS_TIPO = { apresentacao: 'presentation', slides: 'presentation', deck: 'presentation', pitch: 'presentation', onepage: 'one_page', one_pager: 'one_page', pagina_unica: 'one_page',
  resumo_visual: 'one_page', pagina_executiva: 'one_page', relatorio: 'report', relatorio_visual: 'report', infografico: 'infographic', fluxograma: 'diagram', flowchart: 'diagram', diagrama: 'diagram',
  mapa_de_processo: 'process_map', processo: 'process_map', painel: 'dashboard', comparativo: 'comparison', matriz: 'comparison', matrix: 'comparison', comparacao: 'comparison', cronograma: 'timeline',
  linha_do_tempo: 'timeline', cartaz: 'poster', capa: 'cover', post: 'social_post', social: 'social_post', peca: 'social_post', arte: 'social_post', carrossel: 'carousel', anuncio: 'ad',
  imagem: 'image', imagem_final: 'image', imagem_pronta: 'image', treinamento: 'training_material', training: 'training_material', proposta: 'proposal', documento: 'document', guia: 'training_material', manual: 'document' };
export function tipoDe(t) {
  const k = norm(t).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return TIPOS[k] ? k : APELIDOS_TIPO[k] || 'custom';
}

export const EXPORTACOES = { pdf: { rotulo: 'PDF', mime: 'application/pdf' }, png: { rotulo: 'PNG', mime: 'image/png' }, jpg: { rotulo: 'JPG', mime: 'image/jpeg' }, svg: { rotulo: 'SVG', mime: 'image/svg+xml' } };
// Formatos editáveis que a arquitetura reserva para o futuro: declarados como não suportados (nunca simulados).
export const EXPORTACOES_FUTURAS = ['pptx', 'docx'];
export const MAX_PAGINAS = 24;

// Especificação visual de um entregável (vinda da interpretação, da pessoa ou do plano heurístico) -> só valores
// conhecidos e limites. `tipo` desconhecido vira custom com o rótulo original.
export function limparVisual(v) {
  if (!v || typeof v !== 'object') return null;
  const bruto = limpar(v.tipo, 40);
  const tipo = tipoDe(bruto || 'custom');
  const out = { tipo };
  const rotulo = limpar(v.rotulo, 60) || (tipo === 'custom' && bruto ? limpar(bruto.replace(/[_-]+/g, ' '), 60) : '');
  if (rotulo) out.rotulo = rotulo;
  const formato = formatoValido(v.formato);
  if (formato) out.formato = formato;
  const paginas = Math.round(Number(v.paginas));
  if (paginas >= 1) out.paginas = Math.min(MAX_PAGINAS, paginas);
  const publico = limpar(v.publico, 120).replace(/[<>]/g, '');
  if (publico) out.publico = publico;
  const estilo = limpar(v.estilo, 160).replace(/[<>]/g, '');
  if (estilo) out.estilo = estilo;
  // Imagem como parte da peça: 'conceitual' (ilustração ou foto ilustrativa; pode ser gerada, se a empresa liberar)
  // ou 'real' (foto do produto, da equipe, do local: nunca gerada; sem ela, espaço reservado explícito).
  if (v.imagem === true || v.imagem === 'conceitual') out.imagem = 'conceitual';
  else if (v.imagem === 'real') out.imagem = 'real';
  const desc = limpar(v.imagemDescricao, 80).replace(/[<>]/g, '');
  if (out.imagem && desc) out.imagemDescricao = desc;
  const exp = [...new Set((Array.isArray(v.exportacoes) ? v.exportacoes : []).map(x => norm(x)).filter(x => EXPORTACOES[x]))];
  if (exp.length) out.exportacoes = exp;
  return out;
}

// Traços efetivos de um artefato (tipo + especificação + conteúdo): o motor lê só isto.
export function tracos(visual, { secoes = 1 } = {}) {
  const t = TIPOS[visual?.tipo] || TIPOS.custom;
  const formato = visual?.formato && FORMATOS[visual.formato] ? visual.formato : t.formato;
  let multipagina = t.multipagina;
  if (visual?.paginas > 1) multipagina = true;
  else if (visual?.paginas === 1) multipagina = false;
  if (multipagina === null) multipagina = secoes > 4;
  return { tipo: visual?.tipo || 'custom', rotulo: visual?.rotulo || t.rotulo, formato, dim: FORMATOS[formato], multipagina, capa: multipagina && !!t.capa,
    impacto: !!t.impacto, imagemFinal: !!t.imagemFinal, fluxo: t.fluxo || (FORMATOS[formato].w > FORMATOS[formato].h * 1.2 ? 'secao' : 'continuo'), foco: t.foco || null, paginas: visual?.paginas || null };
}

export const exportacoesPadrao = tr => (tr.imagemFinal ? ['png', 'jpg'] : tr.multipagina ? ['pdf', 'png'] : tr.impacto ? ['png', 'jpg', 'pdf'] : ['pdf', 'png']);
