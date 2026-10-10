// Controles do trabalho são dados validados e aplicados antes de qualquer efeito externo.
// Ausência do campo preserva os Quick Wins publicados anteriormente.
import { um, todos, json } from '../db.js';
import { erro } from '../http.js';

export function limparControles(c) {
  if (!c || typeof c !== 'object') return null;
  const inteiro = (v, max, padrao) => Number.isInteger(Number(v)) && Number(v) >= 1 && Number(v) <= max ? Number(v) : v == null ? padrao : 1;
  return { modo: ['preparar', 'consultar', 'aprovar'].includes(c.modo) ? c.modo : 'preparar',
    max_acoes: inteiro(c.max_acoes, 10, 10), max_registros: inteiro(c.max_registros, 100, 10),
    aprovador_id: c.aprovador_id == null || c.aprovador_id === '' ? null : Number.isInteger(Number(c.aprovador_id)) && Number(c.aprovador_id) > 0 ? Number(c.aprovador_id) : -1 };
}
export function pessoasDoTrabalho(app) {
  return app.pessoasDoTrabalho ? app.pessoasDoTrabalho() : todos(app.db, 'select id,nome,email,papel from pessoas where ativo = 1')
    .map(p => ({ id: p.id, nome: p.nome, aprova: p.papel === 'admin', prepara: p.papel === 'admin' }));
}
export function validarControles(app, c) {
  if (!c) return;
  if (c.aprovador_id && !pessoasDoTrabalho(app).some(p => p.id === c.aprovador_id && p.aprova))
    throw erro(400, 'aprovador', 'Escolha uma pessoa ativa que já tenha permissão de aprovar. Esta escolha não concede acesso.');
}
export function controlesDoPlano(app, planoId) {
  const p = planoId && um(app.db, 'select estado from integ_planos where id = ? and tenant_id = ?', planoId, app.tenantId);
  return p ? limparControles(json(p.estado, {}).controles) : null;
}
// Contagem conservadora: coleções em qualquer parte da entrada também são limitadas. Não declara conhecer
// quantos registros um endpoint modifica quando isso não pode ser verificado.
function maiorColecao(v, prof = 0) {
  if (prof > 30) return Infinity;
  if (v && typeof v === 'object') { let maior = Array.isArray(v) ? v.length : 0; for (const x of Object.values(v)) maior = Math.max(maior, maiorColecao(x, prof + 1)); return maior; }
  return 0;
}
export function impedimentoControle(c, cap, entrada) {
  if (!c) return null;
  if (c.modo === 'preparar') return 'Este trabalho prepara o resultado, sem acessar sistemas externos.';
  if (c.modo === 'consultar' && cap.modo !== 'read') return 'Este trabalho pode consultar, mas não alterar sistemas.';
  if (cap.modo !== 'read' && cap.efeitos?.bulk) return 'A ação pode alterar vários registros e não permite verificar o limite com segurança. Peça uma ação de registro individual.';
  if (maiorColecao(entrada) > c.max_registros) return `O material ultrapassa o limite de ${c.max_registros} itens por ação.`;
  return null;
}
export const excedeuSaida = (c, saida) => !!c && maiorColecao(saida) > c.max_registros;
