// Aprovações (humano no circuito): publicação de um conector e execução de uma etapa sensível. A tela mostra em
// linguagem simples o que a integração poderá e não poderá fazer (nada de caixa preta). A aprovação vale só para a
// versão do conector aprovada; versão nova invalida (conectores.js). Execução aprovada vale só para a mesma entrada
// (hash), na mesma etapa.
import { createHash } from 'node:crypto';
import { exec, um, todos, json } from '../db.js';
import { registrar } from '../eventos.js';
import { ErroIntegracao, capabilitiesDe, conectorOu404, mudarStatus, novoId } from './conectores.js';
import { classificarRisco, NIVEIS } from './riscos.js';

const agora = app => app.agora().toISOString();
export const hashEntrada = v => createHash('sha256').update(JSON.stringify(v ?? null)).digest('hex').slice(0, 32);
const camposDe = (e, prefixo = '', prof = 0, out = []) => {
  if (!e || typeof e !== 'object' || prof > 4 || out.length > 40) return out;
  for (const [k, v] of Object.entries(e.properties || {})) { out.push(prefixo + k); camposDe(v, `${prefixo}${k}.`, prof + 1, out); }
  if (e.items) camposDe(e.items, prefixo, prof + 1, out);
  return out;
};
const maior = (a, b) => (NIVEIS.indexOf(a) >= NIVEIS.indexOf(b) ? a : b);

// Resumo da publicação: sistema, hosts, escopos, endpoints, métodos, dados lidos e escritos, efeitos, risco,
// exemplos e o que fica de fora ("não poderá").
export function resumoPublicacao(app, c) {
  const caps = capabilitiesDe(app, c.id).filter(x => x.status !== 'revogada');
  const ops = new Map((c.spec.operacoes || []).map(o => [o.operation_id, o]));
  const usadas = new Set(caps.map(x => x.operation_id));
  const efeitos = [...new Set(caps.flatMap(x => Object.entries(x.efeitos).filter(([, v]) => v).map(([k]) => k)))];
  const NOME_EFEITO = { read: 'lê dados', write: 'grava dados', external_side_effect: 'causa efeito no sistema externo', irreversible: 'não pode ser desfeito', financial: 'envolve dado financeiro',
    personal_data: 'envolve dados pessoais', privileged: 'exige privilégio elevado', communication: 'envia comunicação', bulk: 'mexe em muitos registros' };
  return {
    sistema: c.sistema, tipo: c.tipo, hosts: c.allowed_hosts, autenticacao: c.auth_type, escopos: c.config.escopos || [], versao: c.versao, origem: c.origem,
    risco: caps.reduce((r, x) => maior(x.risco, r), 'LOW'),
    podera: caps.map(x => ({ capability: x.id, frase: x.modo === 'read' ? `ler ${x.nome}` : x.classe === 'DESTRUCTIVE' ? `apagar ${x.nome}` : `criar ou alterar ${x.nome}`, modo: x.modo, risco: x.risco,
      endpoint: `${ops.get(x.operation_id)?.metodo || ''} ${ops.get(x.operation_id)?.caminho || ''}`.trim(), le: camposDe(x.outputs).slice(0, 20), escreve: x.modo === 'write' ? camposDe(x.inputs).slice(0, 20) : [] })),
    nao_podera: [...ops.values()].filter(o => !usadas.has(o.operation_id)).slice(0, 30).map(o => (o.classe === 'DESTRUCTIVE' ? `apagar (${o.resumo || o.operation_id})` : o.classe === 'SAFE_READ' ? `ler ${o.resumo || o.operation_id}` : `alterar ${o.resumo || o.operation_id}`)),
    efeitos: efeitos.map(k => NOME_EFEITO[k] || k),
    exemplos: caps.slice(0, 5).map(x => `${x.modo === 'read' ? 'Consultar' : 'Executar'}: ${x.nome}`),
  };
}

export function solicitarPublicacao(app, pessoa, c) {
  const pend = um(app.db, "select id from integration_approvals where tenant_id = ? and connector_id = ? and tipo = 'publicacao' and status = 'pendente' and connector_versao = ?", app.tenantId, c.id, c.versao);
  if (pend) return lerAprovacao(app, pend.id);
  const id = novoId('apr'), resumo = resumoPublicacao(app, c);
  exec(app.db, `insert into integration_approvals (id, tenant_id, tipo, connector_id, connector_versao, resumo, risco, status, solicitado_por, criado_em) values (?, ?, 'publicacao', ?, ?, ?, ?, 'pendente', ?, ?)`,
    id, app.tenantId, c.id, c.versao, JSON.stringify(resumo), resumo.risco, pessoa?.id ?? null, agora(app));
  registrar(app, 'APPROVAL_REQUESTED', pessoa?.id, { aprovacao: id, tipo: 'publicacao', connector: c.id, versao: c.versao, risco: resumo.risco });
  return lerAprovacao(app, id);
}

// Execução: a etapa mostra sistema, ação, campos e valores (só para quem aprova, na empresa), sem segredo.
export function solicitarExecucao(app, pessoa, { c, cap, entrada, planoId, passoId }) {
  const h = hashEntrada(entrada);
  const existente = todos(app.db, "select id, resumo from integration_approvals where tenant_id = ? and tipo = 'execucao' and plano_id is ? and passo_id is ? and capability_id = ? and status = 'pendente'", app.tenantId, planoId ?? null, passoId ?? null, cap.id)
    .find(a => json(a.resumo, {}).hash === h);
  if (existente) return lerAprovacao(app, existente.id);
  const id = novoId('apr');
  const previa = Object.fromEntries(Object.entries(entrada && typeof entrada === 'object' ? entrada : {}).slice(0, 30).map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v).slice(0, 200) : String(v).slice(0, 200)]));
  const resumo = { sistema: c.sistema, acao: cap.nome, modo: cap.modo, classe: cap.classe, risco: cap.risco, efeitos: Object.keys(cap.efeitos).filter(k => cap.efeitos[k]), dados: previa, hash: h, versao: c.versao };
  exec(app.db, `insert into integration_approvals (id, tenant_id, tipo, connector_id, connector_versao, capability_id, plano_id, passo_id, resumo, risco, status, solicitado_por, criado_em)
    values (?, ?, 'execucao', ?, ?, ?, ?, ?, ?, ?, 'pendente', ?, ?)`, id, app.tenantId, c.id, c.versao, cap.id, planoId ?? null, passoId ?? null, JSON.stringify(resumo), cap.risco, pessoa?.id ?? null, agora(app));
  registrar(app, 'APPROVAL_REQUESTED', pessoa?.id, { aprovacao: id, tipo: 'execucao', connector: c.id, capability: cap.id, risco: cap.risco });
  return lerAprovacao(app, id);
}

export function lerAprovacao(app, id) {
  const a = um(app.db, 'select * from integration_approvals where id = ? and tenant_id = ?', String(id), app.tenantId);
  return a ? { ...a, resumo: json(a.resumo, {}) } : null;
}
export const aprovacoesPendentes = app => todos(app.db, "select id from integration_approvals where tenant_id = ? and status = 'pendente' order by criado_em desc limit 100", app.tenantId).map(r => lerAprovacao(app, r.id));

// Decisão. Quem decide precisa da permissão de aprovar (verificada na rota); fica registrado quem pediu e quem decidiu.
export function decidir(app, pessoa, id, { aprovar, motivo = '' }) {
  const a = lerAprovacao(app, id);
  if (!a) throw new ErroIntegracao(404, 'nao_encontrado', 'Aprovação não encontrada.');
  if (a.status !== 'pendente') throw new ErroIntegracao(409, 'decidida', `Esta aprovação já está ${a.status}.`);
  const c = conectorOu404(app, a.connector_id);
  if (a.connector_versao !== c.versao) {
    exec(app.db, "update integration_approvals set status = 'invalidada', motivo = 'o conector mudou de versão', decidido_em = ? where id = ? and tenant_id = ?", agora(app), a.id, app.tenantId);
    throw new ErroIntegracao(409, 'versao_mudou', 'O conector mudou depois do pedido: revise a versão nova.');
  }
  const status = aprovar ? 'aprovada' : 'negada';
  exec(app.db, 'update integration_approvals set status = ?, decidido_por = ?, motivo = ?, decidido_em = ? where id = ? and tenant_id = ?', status, pessoa?.id ?? null, String(motivo).slice(0, 300), agora(app), a.id, app.tenantId);
  registrar(app, aprovar ? 'APPROVAL_GRANTED' : 'APPROVAL_DENIED', pessoa?.id, { aprovacao: a.id, tipo: a.tipo, connector: c.id, versao: c.versao, mesma_pessoa: a.solicitado_por === pessoa?.id });
  if (a.tipo === 'publicacao') {
    if (aprovar) {
      exec(app.db, 'update connectors set aprovado_versao = ? where id = ? and tenant_id = ?', c.versao, c.id, app.tenantId);
      mudarStatus(app, c, 'APPROVED', pessoa?.id);
      registrar(app, 'CONNECTOR_APPROVED', pessoa?.id, { connector: c.id, versao: c.versao });
    } else mudarStatus(app, c, 'CONFIGURED', pessoa?.id, { motivo: 'aprovação negada' });
  }
  return lerAprovacao(app, a.id);
}

// Aprovação de execução válida para esta etapa e esta entrada (mesma versão do conector).
export function execucaoAprovada(app, { c, cap, planoId, passoId, entrada }) {
  // A decisão vale para ESTA entrada (hash): a de outra entrada da mesma etapa não conta.
  const h = hashEntrada(entrada);
  const lista = todos(app.db, "select id, status, resumo from integration_approvals where tenant_id = ? and tipo = 'execucao' and capability_id = ? and plano_id is ? and passo_id is ? and connector_versao = ? order by criado_em desc",
    app.tenantId, cap.id, planoId ?? null, passoId ?? null, c.versao).filter(a => json(a.resumo, {}).hash === h);
  const a = lista.find(x => x.status === 'aprovada') || lista.find(x => x.status === 'negada') || lista[0];
  return a ? { status: a.status, id: a.id, mesmaEntrada: true } : null;
}
export { classificarRisco };
