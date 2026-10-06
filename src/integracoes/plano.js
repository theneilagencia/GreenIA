// Quick Win -> capabilities: o que o trabalho precisa fazer fora da GreenIA, se a empresa já tem capability para
// isso, e o plano de execução estruturado (etapas, dependências, mapeamentos, aprovação). Nada aqui conhece setor,
// sistema ou cenário: as necessidades vêm da interpretação (ou, sem IA, de uma leitura genérica do pedido) e são
// casadas com o catálogo da empresa pela categoria e pelo nome do sistema.
import { exec, um, todos, json } from '../db.js';
import { registrar } from '../eventos.js';
import { lerConfig } from '../config.js';
import { CATEGORIAS, classeDaOperacao, efeitosPadrao, classificarRisco } from './riscos.js';
import { decidir } from './politicas.js';
import { ErroIntegracao, lerCapability, lerConector, novoId } from './conectores.js';
import { limparControles } from './controle-qw.js';
import { executarCapability } from './runtime.js';
import { mapear, validarRegras } from './mapeamento.js';

const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const normSistema = s => norm(s).replace(/^(?:sistema|portal|plataforma|api|aplicativo|app|ferramenta|software)\s+(?!(?:de|do|da)\b)/, '');
const contemNome = (nome, parte) => nome === parte || nome.startsWith(`${parte} `) || nome.endsWith(` ${parte}`) || nome.includes(` ${parte} `);
const corta = (s, n) => String(s ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);

import { necessidadesDoPedido, limparNecessidades } from './necessidades.js';
export { necessidadesDoPedido, limparNecessidades };

// ---- Resolução ----------------------------------------------------------------------------------------------
const PARENTES = { read_data: ['search', 'query_database'], search: ['read_data'], create_record: ['write_data'], update_record: ['write_data'], write_data: ['create_record', 'update_record'] };
function candidatos(app, n) {
  const caps = todos(app.db, "select c.id, c.categoria, c.status, k.sistema, k.nome as conector_nome, k.status as conector_status from capabilities c join connectors k on k.id = c.connector_id where c.tenant_id = ? and k.tenant_id = ? and c.status != 'revogada' and k.status != 'REVOKED'", app.tenantId, app.tenantId);
  const sis = normSistema(n.sistema);
  const combina = c => contemNome(normSistema(c.sistema), sis) || contemNome(sis, normSistema(c.sistema)) || contemNome(norm(c.conector_nome), sis);
  const pontua = c => (c.categoria === n.categoria ? 2 : (PARENTES[n.categoria] || []).includes(c.categoria) ? 1 : 0) + (sis && combina(c) ? 2 : 0);
  // Sistema nomeado no pedido ("no ERP") precisa bater com o sistema da integração: categoria igual sozinha não basta.
  const doSistema = c => !sis || combina(c);
  return caps.filter(c => !n.capability_id || c.id === n.capability_id).map(c => ({ ...c, pontos: pontua(c) })).filter(c => c.pontos >= 2 && doSistema(c) && (c.categoria === n.categoria || (PARENTES[n.categoria] || []).includes(c.categoria))).sort((a, b) => b.pontos - a.pontos);
}
// Estado de cada necessidade: disponivel (pode rodar), requer_aprovacao (roda com aprovação), configurar (falta
// integração ativa) ou nao_permitido (a política nega).
export function resolverNecessidades(app, necessidades, { pessoa = null, quickWinId = null } = {}) {
  const cfg = lerConfig(app.db).integracoes || {};
  return limparNecessidades(necessidades).map(n => {
    const lista = candidatos(app, n);
    const ativa = lista.find(c => c.status === 'ativa' && c.conector_status === 'ACTIVE');
    if (ativa) {
      const cap = lerCapability(app, ativa.id), con = lerConector(app, cap.connector_id);
      const d = decidir(cfg.politicas || [], { modo: cap.modo, classe: cap.classe, risco: cap.risco, efeitos: cap.efeitos, categoria: cap.categoria, origem: con.origem, sistema: con.sistema, conector: con.id,
        capability: cap.id, quick_win: quickWinId, papeis: pessoa?.permissoes || [], ambiente: 'producao', conectorAtivo: true });
      return { ...n, capability_id: cap.id, connector_id: con.id, sistema_resolvido: con.sistema, risco: cap.risco, estado: d.decisao === 'DENY' ? 'nao_permitido' : d.decisao === 'REQUIRE_APPROVAL' ? 'requer_aprovacao' : 'disponivel', motivo: d.motivo };
    }
    // Sem capability ativa: o que a política diria para esse tipo de ação (destrutivo, por exemplo, nem vale configurar).
    const classe = n.categoria === 'delete_record' ? 'DESTRUCTIVE' : n.modo === 'read' ? 'SAFE_READ' : 'SIDE_EFFECT';
    const efeitos = efeitosPadrao({ classe, categoria: n.categoria });
    const risco = classificarRisco({ efeitos, classe });
    const d = decidir(cfg.politicas || [], { modo: n.modo, classe, risco, efeitos, categoria: n.categoria, origem: 'configured', sistema: n.sistema, papeis: pessoa?.permissoes || [], ambiente: 'producao', conectorAtivo: true });
    return { ...n, capability_id: null, connector_id: lista[0] ? lerCapability(app, lista[0].id).connector_id : null, risco, estado: d.decisao === 'DENY' ? 'nao_permitido' : 'configurar', motivo: d.decisao === 'DENY' ? d.motivo : lista[0] ? 'A integração existe mas ainda não está ativa.' : 'Nenhuma integração da empresa faz isso ainda.' };
  });
}

// ---- Plano de execução -------------------------------------------------------------------------------------
function ordemTopologica(passos) {
  const ids = new Set(passos.map(p => p.id)), visit = new Map(), out = [];
  const ir = p => {
    if (visit.get(p.id) === 1) throw new ErroIntegracao(400, 'ciclo', 'O plano tem dependência circular.');
    if (visit.get(p.id) === 2) return;
    visit.set(p.id, 1);
    for (const d of p.depende_de) { if (!ids.has(d)) throw new ErroIntegracao(400, 'dependencia', `Etapa ${p.id} depende de uma etapa que não existe (${d}).`); ir(passos.find(x => x.id === d)); }
    visit.set(p.id, 2); out.push(p);
  };
  passos.forEach(ir);
  return out;
}
// Conferência de tipos entre etapas: um campo "passos.<id>.<campo>" precisa existir na saída declarada da etapa.
function conferirLigacoes(passos) {
  const avisos = [];
  for (const p of passos) for (const r of p.entrada || []) {
    const m = /^passos\.([\w-]+)\.(.+)$/.exec(r.de || '');
    if (!m) continue;
    const origem = passos.find(x => x.id === m[1]);
    if (!origem) { avisos.push(`${p.id}: origem ${m[1]} não existe`); continue; }
    if (!p.depende_de.includes(m[1])) avisos.push(`${p.id}: usa a saída de ${m[1]} sem depender dela`);
    const saida = origem.saida_esquema;
    if (saida) {
      let e = saida;
      for (const k of m[2].split('.')) { e = e?.type?.includes?.('array') || e?.type === 'array' ? e.items : e; e = e?.properties?.[k]; if (!e) break; }
      if (!e) avisos.push(`${p.id}: o campo ${m[2]} não está na saída de ${m[1]}`);
    }
  }
  return avisos;
}
export function criarPlano(app, pessoa, { quickWinId = null, conversaId = null, necessidades, controles = null, gatilho = 'manual' }) {
  const resolvidas = resolverNecessidades(app, necessidades, { pessoa, quickWinId });
  const passos = resolvidas.map(n => {
    const cap = n.capability_id ? lerCapability(app, n.capability_id) : null;
    return { id: n.id, acao: n.acao, sistema: n.sistema_resolvido || n.sistema, categoria: n.categoria, modo: n.modo, capability_id: n.capability_id, connector_id: n.connector_id, operation_id: cap?.operation_id || null,
      entrada: n.entrada ? validarRegras(n.entrada) : null, depende_de: n.depende_de.filter(d => resolvidas.some(x => x.id === d)), aprovacao: n.estado === 'requer_aprovacao', estado_inicial: n.estado,
      saida_esquema: cap?.outputs || null, compensacao: null };
  });
  ordemTopologica(passos);
  const avisos = conferirLigacoes(passos);
  const id = novoId('pln'), t = app.agora().toISOString();
  const estado = { ...(controles ? { controles: limparControles(controles) } : {}), passos: Object.fromEntries(passos.map(p => [p.id, { status: p.estado_inicial === 'nao_permitido' ? 'BLOCKED' : p.estado_inicial === 'configurar' ? 'BLOCKED' : 'PENDENTE', motivo: p.estado_inicial === 'configurar' ? 'falta configurar a integração' : p.estado_inicial === 'nao_permitido' ? 'a política não permite' : null }])), avisos, saidas: {} };
  exec(app.db, 'insert into integ_planos (id, tenant_id, quick_win_id, conversa_id, pessoa_id, gatilho, passos, estado, status, criado_em, atualizado_em) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    id, app.tenantId, quickWinId, conversaId, pessoa?.id ?? null, ['manual', 'scheduled', 'event', 'webhook'].includes(gatilho) ? gatilho : 'manual', JSON.stringify(passos), JSON.stringify(estado), 'pronto', t, t);
  registrar(app, 'PLAN_CREATED', pessoa?.id, { plano: id, quick_win: quickWinId, passos: passos.length, gatilho });
  return lerPlano(app, id);
}
export function lerPlano(app, id) {
  const p = um(app.db, 'select * from integ_planos where id = ? and tenant_id = ?', String(id), app.tenantId);
  return p ? { ...p, passos: json(p.passos, []), estado: json(p.estado, {}) } : null;
}

// Executa as etapas prontas, em ordem. contexto = { entrada: {...}, resultado: {...} } (dados do Quick Win).
// Etapa com dependência que falhou ou foi bloqueada: BLOCKED. Dependência aguardando aprovação: espera.
export async function executarPlano(app, pessoa, id, contexto = {}, op = {}) {
  const p = lerPlano(app, id);
  if (!p) throw new ErroIntegracao(404, 'nao_encontrado', 'Plano não encontrado.');
  if (p.pessoa_id && pessoa && p.pessoa_id !== pessoa.id && !pessoa.admin) throw new ErroIntegracao(404, 'nao_encontrado', 'Plano não encontrado.');
  const estado = p.estado, saidas = estado.saidas || {};
  const controle = limparControles(estado.controles);
  if (controle && p.passos.length > controle.max_acoes) {
    for (const passo of p.passos) if (!['SUCCESS', 'PARTIAL'].includes(estado.passos[passo.id].status)) estado.passos[passo.id] = { status: 'BLOCKED', motivo: `Este trabalho permite no máximo ${controle.max_acoes} ações externas por execução.` };
  }
  for (const passo of ordemTopologica(p.passos)) {
    const st = estado.passos[passo.id];
    if (['SUCCESS', 'PARTIAL', 'FAILED', 'BLOCKED'].includes(st.status)) continue;
    if (op.apenas && passo.modo !== op.apenas) continue;   // fase da execução (ex.: só leituras antes da IA)
    const deps = passo.depende_de.map(d => estado.passos[d].status);
    if (deps.some(s => s === 'FAILED' || s === 'BLOCKED')) { estado.passos[passo.id] = { status: 'BLOCKED', motivo: 'uma etapa anterior não foi concluída' }; continue; }
    if (deps.some(s => !['SUCCESS', 'PARTIAL'].includes(s))) continue;   // espera (aprovação pendente)
    const fonte = { entrada: contexto.entrada || {}, resultado: contexto.resultado || {}, passos: saidas };
    // Etapa que aguardava aprovação: executa com a MESMA entrada que foi aprovada (guardada no plano, na empresa).
    const pendente = estado.pendentes?.[passo.id];
    let entrada = contexto.dados?.[passo.id] || pendente || {};
    if (passo.entrada && !(pendente && !contexto.dados?.[passo.id])) { const m = mapear(fonte, passo.entrada); if (m.erros.length) { estado.passos[passo.id] = { status: 'FAILED', motivo: `dados de entrada: ${m.erros.slice(0, 3).map(x => x.campo).join(', ')}` }; continue; } entrada = m.dados; }
    pessoa = app.pessoaDaProgramacao?.(p.conversa_id,pessoa) || pessoa;
    const r = await executarCapability(app, { capabilityId: passo.capability_id, entrada, pessoa, modo: 'real', planoId: p.id, passoId: passo.id, quickWinId: p.quick_win_id, lookup: op.lookup });
    estado.passos[passo.id] = { status: r.status, http_status: r.http_status ?? null, erro: r.erro || null, aprovacao: r.aprovacao || null, run: r.run_id || null, ...(r.duplicado_evitado ? { duplicado_evitado: true } : {}) };
    if (r.dados !== undefined) saidas[passo.id] = r.dados;
    estado.pendentes = estado.pendentes || {};
    if (r.status === 'APPROVAL_REQUIRED') estado.pendentes[passo.id] = entrada; else delete estado.pendentes[passo.id];
  }
  // Compensação: escrita concluída seguida de falha numa etapa dependente vira SUGESTÃO para uma pessoa (nunca automática).
  const ops = p.passos;
  estado.compensacoes = ops.filter(x => x.modo === 'write' && ['SUCCESS', 'PARTIAL'].includes(estado.passos[x.id].status) && ops.some(y => y.depende_de.includes(x.id) && ['FAILED', 'BLOCKED'].includes(estado.passos[y.id].status)))
    .map(x => ({ passo: x.id, acao: x.acao, sugestao: 'Uma etapa seguinte falhou: confira se o que foi criado ou alterado aqui precisa ser desfeito.' }));
  estado.saidas = saidas;
  const sts = Object.values(estado.passos).map(s => s.status);
  const status = sts.every(s => s === 'SUCCESS' || s === 'PARTIAL') ? 'concluido' : sts.some(s => s === 'APPROVAL_REQUIRED' || s === 'PENDENTE') ? 'aguardando_aprovacao'
    : sts.some(s => s === 'SUCCESS' || s === 'PARTIAL') ? 'parcial' : sts.every(s => s === 'BLOCKED') ? 'bloqueado' : 'falhou';
  exec(app.db, 'update integ_planos set estado = ?, status = ?, atualizado_em = ? where id = ? and tenant_id = ?', JSON.stringify(estado), status, app.agora().toISOString(), p.id, app.tenantId);
  registrar(app, 'PLAN_EXECUTED', pessoa?.id, { plano: p.id, status, passos: Object.fromEntries(Object.entries(estado.passos).map(([k, v]) => [k, v.status])) });
  return resumoPlano(app, lerPlano(app, p.id));
}
// O que a tela mostra: etapa, sistema, ação, status, aprovação e resultado (sem dados brutos para quem não pediu).
export function resumoPlano(app, p) {
  return { id: p.id, status: p.status, atualizado_em: p.atualizado_em, gatilho: p.gatilho, quick_win_id: p.quick_win_id, avisos: p.estado.avisos || [], compensacoes: p.estado.compensacoes || [],
    passos: p.passos.map(x => ({ id: x.id, acao: x.acao, sistema: x.sistema, modo: x.modo, depende_de: x.depende_de, status: p.estado.passos?.[x.id]?.status, motivo: p.estado.passos?.[x.id]?.motivo || p.estado.passos?.[x.id]?.erro?.mensagem || null,
      aprovacao: p.estado.passos?.[x.id]?.aprovacao || null,
      aprovador: p.estado.controles?.aprovador_id ? um(app.db, 'select nome from pessoas where id = ?', p.estado.controles.aprovador_id)?.nome || 'Pessoa responsável pela aprovação' : null,
      aprovacao_status: p.estado.passos?.[x.id]?.aprovacao ? um(app.db, 'select status from integration_approvals where id = ? and tenant_id = ?', p.estado.passos[x.id].aprovacao, app.tenantId)?.status || null : null,
      http_status: p.estado.passos?.[x.id]?.http_status ?? null, tem_resultado: p.estado.saidas?.[x.id] !== undefined })) };
}
export { classeDaOperacao };
