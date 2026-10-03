// API do Integration Builder. Tudo atrás da flag: INTEGRATION_BUILDER_ENABLED=0 desliga a instalação inteira; por
// empresa, integracoes.ativa (padrão false) e, se preenchida, a lista de pessoas que podem ver. Desligado = 404
// (a rota "não existe" para quem não tem o recurso). Admin: integrations.manage; decisão: integrations.approve.
import { ErroHttp, erro } from '../http.js';
import { lerConfig } from '../config.js';
import { registrar } from '../eventos.js';
import { descobrir } from './descoberta.js';
import { ErroIntegracao, atualizarConector, catalogo, conectorOu404, criarConector, definirCapabilities, listarConectores, resumoConector } from './conectores.js';
import { configurarCredencial, publicar, pausar, retomar, revogar, testarConector } from './ciclo.js';
import { aprovacoesPendentes, decidir, lerAprovacao } from './aprovacoes.js';
import { metricas, runsRecentes } from './runtime.js';
import { criarPlano, executarPlano, lerPlano, necessidadesDoPedido, resolverNecessidades, resumoPlano } from './plano.js';
import { concluirAutorizacao, iniciarAutorizacao } from './oauth.js';
import { criarWebhook, receberWebhook, rotacionarSegredo } from './webhooks.js';
import { POLITICA_PADRAO } from './politicas.js';
import { redigir } from './segredos.js';
import { erroParaLog } from '../registro-seguro.js';

export function integracoesLigadas(app, pessoa = null, env = process.env) {
  if (['0', 'false', 'off'].includes(String(env.INTEGRATION_BUILDER_ENABLED ?? '').toLowerCase())) return false;
  const cfg = lerConfig(app.db).integracoes || {};
  if (cfg.ativa !== true) return false;
  if (pessoa && cfg.pessoas?.length && !cfg.pessoas.includes(String(pessoa.email || '').toLowerCase())) return false;
  return true;
}

// Erros do módulo viram resposta HTTP com mensagem simples (nada de pilha, cabeçalho ou dado de credencial).
async function seguro(app, fn) {
  try { return await fn(); }
  catch (e) {
    if (e instanceof ErroIntegracao) throw erro(e.status || 400, e.codigo, redigir(e.message));
    if (e instanceof ErroHttp) throw e;
    if (e instanceof Error && /especifica|formato|grande demais|caminho inválido|regras|transformação|segredo/i.test(e.message) && !e.stack?.includes('node:internal')) throw erro(400, 'invalido', redigir(e.message).slice(0, 300));
    app.log?.('integracoes', erroParaLog(e));
    throw erro(500, 'erro_integracao', 'Não foi possível concluir a operação da integração.');
  }
}
const pode = (pessoa, perm) => (Array.isArray(pessoa?.permissoes) ? pessoa.permissoes.includes(perm) : pessoa?.admin === true);

export function rotasIntegracoes(app, r) {
  const gate = pessoa => { if (!integracoesLigadas(app, pessoa)) throw erro(404, 'nao_encontrado', 'Não encontrado.'); };
  const adm = { admin: true };

  // ---- Admin: catálogo, conectores, ciclo de vida ----------------------------------------------------------
  r.get('/api/admin/integracoes', ({ pessoa }) => { gate(pessoa); return seguro(app, () => ({
    conectores: listarConectores(app).map(c => resumoConector(app, c)), catalogo: catalogo(app), pendentes: aprovacoesPendentes(app).map(a => ({ id: a.id, tipo: a.tipo, connector_id: a.connector_id, risco: a.risco, resumo: a.resumo, criado_em: a.criado_em })),
    metricas: metricas(app), politica: (lerConfig(app.db).integracoes?.politicas?.length ? lerConfig(app.db).integracoes.politicas : POLITICA_PADRAO) })); }, adm);
  r.post('/api/admin/integracoes/descobrir', ({ pessoa, corpo }) => { gate(pessoa); return seguro(app, () => {
    const d = descobrir(corpo.especificacao);
    registrar(app, 'CONNECTOR_DISCOVERY', pessoa?.id, { formato: d.formato, operacoes: d.operacoes.length });
    return d;
  }); }, { ...adm, limiteMb: 2 });
  r.post('/api/admin/integracoes', ({ pessoa, corpo }) => { gate(pessoa); return seguro(app, () => resumoConector(app, criarConector(app, pessoa, { ...corpo, origem: corpo.origem === 'generated' ? 'generated' : corpo.origem === 'admin' ? 'admin' : 'configured' }), { detalhes: true })); }, { ...adm, limiteMb: 2 });
  r.get('/api/admin/integracoes/aprovacoes', ({ pessoa }) => { gate(pessoa); return seguro(app, () => ({ pendentes: aprovacoesPendentes(app) })); }, adm);
  r.post('/api/admin/integracoes/aprovacoes/:id/decidir', ({ pessoa, params, corpo }) => { gate(pessoa); return seguro(app, () => decidir(app, pessoa, params.id, { aprovar: corpo.aprovar === true, motivo: corpo.motivo })); }, adm);
  r.post('/api/admin/integracoes/webhooks', ({ pessoa, corpo }) => { gate(pessoa); return seguro(app, () => {
    if (corpo.conector) conectorOu404(app, corpo.conector);
    return criarWebhook(app, pessoa, { conectorId: corpo.conector || null, evento: corpo.evento, filtros: corpo.filtros, quickWinId: Number(corpo.quick_win_id) || null });
  }); }, adm);
  r.post('/api/admin/integracoes/webhooks/:id/rotacionar', ({ pessoa, params }) => { gate(pessoa); return seguro(app, () => rotacionarSegredo(app, pessoa, params.id)); }, adm);
  r.get('/api/admin/integracoes/:id', ({ pessoa, params }) => { gate(pessoa); return seguro(app, () => { const c = conectorOu404(app, params.id); return { ...resumoConector(app, c, { detalhes: true }), metricas: metricas(app, c.id), execucoes: runsRecentes(app, c.id) }; }); }, adm);
  r.patch('/api/admin/integracoes/:id', ({ pessoa, params, corpo }) => { gate(pessoa); return seguro(app, () => { const x = atualizarConector(app, pessoa, params.id, corpo); return { ...resumoConector(app, x.conector, { detalhes: true }), versao_nova: x.versaoNova }; }); }, { ...adm, limiteMb: 2 });
  // Credencial: entra e não volta (a resposta só confirma; a tela mostra a máscara).
  r.put('/api/admin/integracoes/:id/credencial', ({ pessoa, params, corpo }) => { gate(pessoa); return seguro(app, () => configurarCredencial(app, pessoa, params.id, corpo.valor)); }, adm);
  r.put('/api/admin/integracoes/:id/capabilities', ({ pessoa, params, corpo }) => { gate(pessoa); return seguro(app, () => ({ capabilities: definirCapabilities(app, pessoa, params.id, corpo.escolhas) })); }, adm);
  r.post('/api/admin/integracoes/:id/testar', ({ pessoa, params, corpo }) => { gate(pessoa); return seguro(app, () => testarConector(app, pessoa, params.id, { exemplos: corpo.exemplos, lookup: app.dnsLookup })); }, adm);
  r.post('/api/admin/integracoes/:id/publicar', ({ pessoa, params }) => { gate(pessoa); return seguro(app, () => resumoConector(app, publicar(app, pessoa, params.id))); }, adm);
  r.post('/api/admin/integracoes/:id/pausar', ({ pessoa, params }) => { gate(pessoa); return seguro(app, () => resumoConector(app, pausar(app, pessoa, params.id))); }, adm);
  r.post('/api/admin/integracoes/:id/retomar', ({ pessoa, params }) => { gate(pessoa); return seguro(app, () => resumoConector(app, retomar(app, pessoa, params.id))); }, adm);
  r.post('/api/admin/integracoes/:id/revogar', ({ pessoa, params }) => { gate(pessoa); return seguro(app, () => resumoConector(app, revogar(app, pessoa, params.id))); }, adm);
  r.post('/api/admin/integracoes/:id/oauth/iniciar', ({ pessoa, params, req }) => { gate(pessoa); return seguro(app, () => iniciarAutorizacao(app, pessoa, params.id, { origem: origemDe(req) })); }, adm);

  // ---- Pessoa: OAuth (retorno), necessidades do Quick Win, planos e execução ---------------------------------
  r.get('/api/integracoes/oauth/retorno', async ({ pessoa, query, res }) => {
    gate(pessoa);
    let ok = true;
    try { await concluirAutorizacao(app, pessoa, { state: query.state, code: query.code }); } catch { ok = false; }
    // Nunca devolve token: só volta para a tela de integrações, com o resultado.
    res.writeHead(302, { location: `/app#/integracoes${ok ? '' : '?oauth=erro'}`, 'cache-control': 'no-store' });
    res.end();
  });
  r.post('/api/integracoes/necessidades', ({ pessoa, corpo }) => { gate(pessoa); return seguro(app, () => {
    const necessidades = Array.isArray(corpo.necessidades) ? corpo.necessidades : necessidadesDoPedido(corpo.descricao);
    return { necessidades: resolverNecessidades(app, necessidades, { pessoa, quickWinId: Number(corpo.quick_win_id) || null }) };
  }); });
  r.post('/api/integracoes/planos', ({ pessoa, corpo }) => { gate(pessoa); return seguro(app, () => {
    const necessidades = Array.isArray(corpo.necessidades) ? corpo.necessidades : necessidadesDoPedido(corpo.descricao);
    return resumoPlano(app, criarPlano(app, pessoa, { quickWinId: Number(corpo.quick_win_id) || null, conversaId: Number(corpo.conversa_id) || null, necessidades, gatilho: corpo.gatilho }));
  }); });
  r.get('/api/integracoes/planos/:id', ({ pessoa, params }) => { gate(pessoa); return seguro(app, () => {
    const p = lerPlano(app, params.id);
    if (!p || (p.pessoa_id && p.pessoa_id !== pessoa.id && !pode(pessoa, 'integrations.manage'))) throw new ErroIntegracao(404, 'nao_encontrado', 'Plano não encontrado.');
    return resumoPlano(app, p);
  }); });
  r.post('/api/integracoes/planos/:id/executar', ({ pessoa, params, corpo }) => { gate(pessoa); return seguro(app, () => {
    const p = lerPlano(app, params.id);
    if (!p || (p.pessoa_id && p.pessoa_id !== pessoa.id)) throw new ErroIntegracao(404, 'nao_encontrado', 'Plano não encontrado.');
    return executarPlano(app, pessoa, p.id, { entrada: corpo.entrada || {}, resultado: corpo.resultado || {}, dados: corpo.dados || {} }, { lookup: app.dnsLookup });
  }); }, { limiteMb: 1 });
  r.get('/api/integracoes/aprovacoes/:id', ({ pessoa, params }) => { gate(pessoa); return seguro(app, () => {
    const a = lerAprovacao(app, params.id);
    if (!a || (a.solicitado_por !== pessoa.id && !pode(pessoa, 'integrations.approve'))) throw new ErroIntegracao(404, 'nao_encontrado', 'Aprovação não encontrada.');
    return { id: a.id, tipo: a.tipo, status: a.status, risco: a.risco, resumo: a.resumo, criado_em: a.criado_em, decidido_em: a.decidido_em };
  }); });

  // ---- Webhook de entrada (público, verificado por assinatura) -------------------------------------------
  r.post('/api/integracoes/webhooks/:id', ({ params, req, corpo }) => {
    if (!integracoesLigadas(app)) throw erro(404, 'nao_encontrado', 'Não encontrado.');
    return seguro(app, () => receberWebhook(app, params.id, { cabecalhos: req.headers, corpoBruto: String(corpo || '') }));
  }, { publica: true, bruto: true, limiteMb: 1 });
}
function origemDe(req) {
  const proto = req.headers['x-forwarded-proto'] === 'https' || req.socket?.encrypted ? 'https' : 'http';
  return `${proto}://${String(req.headers.host || '').replace(/[^\w.:-]/g, '')}`;
}
