const EM_CIRCULACAO = ['em_teste', 'em_uso', 'em_avaliacao', 'aprovado', 'em_expansao'];
export function estadoQw(qw) {
  if (qw.status === 'descartado') return { id: 'arquivado', rotulo: 'Arquivado' };
  if (qw.v2) {
    if (qw.versao && EM_CIRCULACAO.includes(qw.status)) return { id: 'publicado', rotulo: 'Publicado' };
    return qw.ultimo_teste ? { id: 'teste', rotulo: 'Em teste' } : { id: 'rascunho', rotulo: 'Rascunho' };
  }
  if (qw.status === 'em_teste') return { id: 'teste', rotulo: 'Em teste' };
  return EM_CIRCULACAO.includes(qw.status) ? { id: 'publicado', rotulo: 'Publicado' } : { id: 'rascunho', rotulo: 'Rascunho' };
}
