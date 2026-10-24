// A conferência vale para o trabalho e as fontes que foram testados, não para
// qualquer rascunho futuro do mesmo Quick Win. O histórico continua preservado.
import { createHash } from 'node:crypto';
import { json, todos, um } from './db.js';
import { retratoFontes } from './fontes.js';

export function assinaturaTeste(db, q) {
  return createHash('sha256').update(JSON.stringify({
    especificacao: json(q.especificacao, null), bases: json(q.bases, null), dados: json(q.dados, null),
    sigiloso: !!q.sigiloso,
    areas: todos(db, 'select area_id from quick_win_areas where quick_win_id = ? order by area_id', q.id),
    fontes: retratoFontes({ db }, q),
  })).digest('hex');
}

export function testeAtual(db, q) {
  const teste = um(db, 'select qualidade, em from roteamento where quick_win_id = ? and teste = 1 and qualidade is not null order by id desc limit 1', q.id);
  return teste && json(teste.qualidade, {})?.assinatura_teste === assinaturaTeste(db, q) ? teste : null;
}
