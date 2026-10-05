// Runtime central dos conectores. O Quick Win nunca chama HTTP externo: toda chamada passa por executarCapability:
// capability -> política -> aprovação -> modo teste -> entrada (esquema) -> limite de taxa -> idempotência ->
// autenticação (cofre) -> rede segura (allowlist, SSRF, tempo limite) -> repetição só quando segura -> validação da
// resposta (esquema) -> mapeamento -> auditoria (só metadados, sem segredo e sem conteúdo).
import { createHash } from 'node:crypto';
import { exec, um, todos } from '../db.js';
import { registrar } from '../eventos.js';
import { lerConfig } from '../config.js';
import { buscaSegura, ErroRede } from './rede.js';
import { redePrivadaDe } from './conectores.js';
import { lerSegredo, redigir, valoresSecretos } from './segredos.js';
import { validarEsquema, gravidadeEsquema } from './esquema.js';
import { mapear } from './mapeamento.js';
import { decidir as decidirPolitica } from './politicas.js';
import { TIPOS_EXECUTAVEIS } from './riscos.js';
import { ErroIntegracao, conectorOu404, lerCapability, mapeamento, novoId } from './conectores.js';
import { execucaoAprovada, solicitarExecucao } from './aprovacoes.js';
import { tokenDeAcesso } from './oauth.js';

// ---- Limite de taxa (janela de 60 s, em memória por processo) ---------------------------------------------------
const janelas = new Map();
function dentroDoLimite(chave, limite, agora) {
  const l = (janelas.get(chave) || []).filter(t => agora - t < 60_000);
  if (l.length >= limite) { janelas.set(chave, l); return false; }
  l.push(agora); janelas.set(chave, l);
  if (janelas.size > 5000) for (const k of [...janelas.keys()].slice(0, 1000)) janelas.delete(k);
  return true;
}
export const limparLimites = () => janelas.clear();

const espera = ms => new Promise(ok => setTimeout(ok, ms));
const agoraIso = app => app.agora().toISOString();

// ---- Montagem da requisição ----------------------------------------------------------------------------------
// Valor de parâmetro de caminho: nunca "." ou "..", sem controle; codificado (a barra vira %2F).
function valorDeCaminho(v) {
  const s = String(v ?? '');
  if (!s || s.includes('..') || /[/\\\u0000-\u001f]/.test(s) || s === '.' || /%2e|%2f|%5c/i.test(s) || s.length > 512) throw new ErroIntegracao(400, 'parametro_invalido', 'Parâmetro de caminho inválido.');
  return encodeURIComponent(s);
}
function montarRequisicao(c, op, entrada) {
  const e = entrada && typeof entrada === 'object' ? entrada : {};
  const faltam = op.parametros.filter(p => p.obrigatorio && (e[p.nome] === undefined || e[p.nome] === null || e[p.nome] === '')).map(p => p.nome);
  if (faltam.length) throw new ErroIntegracao(400, 'entrada_incompleta', `Faltam dados para a operação: ${faltam.join(', ')}.`);
  let caminho = op.caminho || '';
  for (const p of op.parametros.filter(x => x.em === 'path')) caminho = caminho.split(`{${p.nome}}`).join(valorDeCaminho(e[p.nome]));
  if (/\{[^}]+\}/.test(caminho) || caminho.split('/').some(s => s === '..' || s === '.')) throw new ErroIntegracao(400, 'caminho_invalido', 'Caminho da operação inválido.');
  const base = new URL(c.base_url);
  const url = new URL(base.toString().replace(/\/$/, '') + (caminho.startsWith('/') ? caminho : `/${caminho}`));
  // O caminho final continua no mesmo host da base (nada de "//outro-host" ou "@").
  if (url.host !== base.host || url.protocol !== base.protocol) throw new ErroIntegracao(400, 'caminho_invalido', 'O caminho saiu do endereço da integração.');
  for (const p of op.parametros.filter(x => x.em === 'query')) if (e[p.nome] !== undefined && e[p.nome] !== null) url.searchParams.set(p.nome, String(e[p.nome]).slice(0, 2000));
  const cabecalhos = { accept: 'application/json' };
  for (const p of op.parametros.filter(x => x.em === 'header')) if (e[p.nome] !== undefined) cabecalhos[p.nome] = String(e[p.nome]);
  let corpo = null, esquemaErros = [];
  if (op.graphql) {
    const vars = Object.fromEntries(op.parametros.map(p => [p.nome, e[p.nome]]).filter(([, v]) => v !== undefined));
    const decl = op.parametros.length ? `(${op.parametros.map(p => `$${p.nome}: String${p.obrigatorio ? '!' : ''}`).join(', ')})` : '';
    const args = op.parametros.length ? `(${op.parametros.map(p => `${p.nome}: $${p.nome}`).join(', ')})` : '';
    corpo = JSON.stringify({ query: `${op.graphql.tipo} ${decl} { ${op.graphql.campo}${args} }`, variables: vars });
    cabecalhos['content-type'] = 'application/json';
  } else if (op.metodo !== 'GET' && op.metodo !== 'DELETE') {
    const dados = e.corpo !== undefined ? e.corpo : Object.fromEntries(Object.entries(e).filter(([k]) => !op.parametros.some(p => p.nome === k)));
    if (op.request_schema) esquemaErros = validarEsquema(dados, op.request_schema);
    if (esquemaErros.length) throw new ErroIntegracao(400, 'entrada_fora_do_esquema', `Os dados não seguem o formato da operação (${esquemaErros.slice(0, 3).map(x => `${x.caminho}: ${x.erro}`).join('; ')}).`);
    corpo = JSON.stringify(dados);
    if (corpo.length > 512 * 1024) throw new ErroIntegracao(413, 'payload_grande', 'Dados grandes demais para enviar.');
    cabecalhos['content-type'] = 'application/json';
  }
  return { url: url.toString(), metodo: op.metodo, cabecalhos, corpo };
}

async function autenticar(app, c, cabecalhos) {
  if (c.auth_type === 'none') return { cabecalhos, segredos: [], sensiveis: ['authorization'] };
  const s = lerSegredo(app, c.secret_ref);
  if (s == null) throw new ErroIntegracao(400, 'credencial_ausente', 'A integração está sem credencial.');
  const out = { ...cabecalhos };
  let sensiveis = ['authorization'];
  if (c.auth_type === 'api_key' || c.auth_type === 'custom_header') {
    const nome = c.config.cabecalho_auth || (c.auth_type === 'api_key' ? 'X-API-Key' : null);
    if (!nome) throw new ErroIntegracao(400, 'credencial_config', 'Informe o nome do cabeçalho da credencial.');
    out[nome] = typeof s === 'string' ? s : s.valor; sensiveis = [nome, 'authorization'];
  } else if (c.auth_type === 'bearer') out.authorization = `Bearer ${typeof s === 'string' ? s : s.token}`;
  else if (c.auth_type === 'basic') out.authorization = `Basic ${Buffer.from(`${s.usuario}:${s.senha}`).toString('base64')}`;
  else if (c.auth_type.startsWith('oauth2')) out.authorization = `Bearer ${await tokenDeAcesso(app, c)}`;
  else throw new ErroIntegracao(400, 'auth_nao_suportada', 'Tipo de autenticação ainda não suportado.');
  return { cabecalhos: out, segredos: valoresSecretos(s), sensiveis };
}

function registrarRun(app, run) {
  exec(app.db, `insert into connector_runs (id, tenant_id, connector_id, connector_versao, capability_id, operation_id, plano_id, passo_id, modo, idempotency_key, status, http_status, ms, bytes, tentativas, erro_codigo, pessoa_id, quick_win_id, criado_em)
    values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, run.id, app.tenantId, run.connector_id, run.versao, run.capability_id, run.operation_id, run.plano_id ?? null, run.passo_id ?? null,
  run.modo, run.idempotency_key ?? null, run.status, run.http_status ?? null, run.ms ?? null, run.bytes ?? null, run.tentativas ?? 0, run.erro_codigo ?? null, run.pessoa_id ?? null, run.quick_win_id ?? null, agoraIso(app));
}
const atualizarRun = (app, id, r) => exec(app.db, 'update connector_runs set status = ?, http_status = ?, ms = ?, bytes = ?, tentativas = ?, erro_codigo = ? where id = ? and tenant_id = ?',
  r.status, r.http_status ?? null, r.ms ?? null, r.bytes ?? null, r.tentativas ?? 0, r.erro_codigo ?? null, id, app.tenantId);

// Resultado: { status: SUCCESS|PARTIAL|FAILED|BLOCKED|APPROVAL_REQUIRED|SIMULATED, dados?, erro?, http_status?, aprovacao?, run_id }
export async function executarCapability(app, { capabilityId, entrada = {}, pessoa = null, modo = 'real', planoId = null, passoId = null, quickWinId = null, idempotencyKey = null, lookup } = {}) {
  const cap = lerCapability(app, capabilityId);
  if (!cap) throw new ErroIntegracao(404, 'nao_encontrado', 'Capability não encontrada.');
  const c = conectorOu404(app, cap.connector_id);
  const op = (c.spec.operacoes || []).find(o => o.operation_id === cap.operation_id);
  const base = { capability: cap.id, connector: c.id, operacao: cap.operation_id, modo };
  if (!op) return { ...base, status: 'FAILED', erro: { codigo: 'operacao_ausente', mensagem: 'A operação não existe mais nesta versão.' } };
  if (!TIPOS_EXECUTAVEIS.includes(c.tipo)) return { ...base, status: 'BLOCKED', erro: { codigo: 'tipo_sem_runtime', mensagem: `Conector ${c.tipo} ainda não executa nesta versão.` } };
  const teste = modo === 'teste';
  const ativo = c.status === 'ACTIVE' && c.aprovado_versao === c.versao && cap.status === 'ativa';
  if (!teste && !ativo) {
    registrar(app, 'CONNECTOR_BLOCKED', pessoa?.id, { ...base, motivo: 'inativo', status: c.status });
    return { ...base, status: 'BLOCKED', erro: { codigo: 'conector_inativo', mensagem: 'A integração não está ativa (precisa de teste, aprovação e publicação).' } };
  }
  if (teste && !['CONFIGURED', 'TESTING', 'REVIEW_REQUIRED', 'APPROVED', 'ACTIVE', 'FAILED'].includes(c.status)) return { ...base, status: 'BLOCKED', erro: { codigo: 'status', mensagem: 'A integração não está pronta para teste.' } };

  // Mapeamento de entrada (DSL segura), quando a capability tem.
  const regrasEntrada = mapeamento(app, cap.id, 'entrada');
  let dados = entrada;
  if (regrasEntrada) { const m = mapear(entrada, regrasEntrada); if (m.erros.length) return { ...base, status: 'FAILED', erro: { codigo: 'mapeamento', mensagem: `Mapeamento da entrada falhou: ${m.erros.slice(0, 3).map(x => `${x.campo} (${x.erro})`).join(', ')}.` } }; dados = m.dados; }

  // Política (fora do modo teste): ALLOW, DENY ou REQUIRE_APPROVAL.
  if (!teste) {
    const cfg = lerConfig(app.db).integracoes || {};
    const d = decidirPolitica(cfg.politicas || [], { modo: cap.modo, classe: cap.classe, risco: cap.risco, efeitos: cap.efeitos, categoria: cap.categoria, origem: c.origem, sistema: c.sistema,
      conector: c.id, capability: cap.id, quick_win: quickWinId, papeis: pessoa?.permissoes || (pessoa?.admin ? ['admin'] : []), ambiente: 'producao', conectorAtivo: ativo });
    if (d.decisao === 'DENY') {
      registrar(app, 'CONNECTOR_BLOCKED', pessoa?.id, { ...base, motivo: 'politica', regra: d.regra });
      return { ...base, status: 'BLOCKED', erro: { codigo: 'politica', mensagem: d.motivo || 'A política da empresa não permite esta operação.' } };
    }
    if (d.decisao === 'REQUIRE_APPROVAL') {
      const a = execucaoAprovada(app, { c, cap, planoId, passoId, entrada: dados });
      if (a?.status === 'negada' && a.mesmaEntrada) return { ...base, status: 'BLOCKED', erro: { codigo: 'aprovacao_negada', mensagem: 'A execução foi negada na aprovação.' }, aprovacao: a.id };
      if (!(a?.status === 'aprovada' && a.mesmaEntrada)) {
        const nova = solicitarExecucao(app, pessoa, { c, cap, entrada: dados, planoId, passoId });
        return { ...base, status: 'APPROVAL_REQUIRED', aprovacao: nova.id, motivo: d.motivo };
      }
    }
  }

  // Modo teste: escrita é simulada (monta e confere a requisição, não envia), salvo autorização explícita da
  // empresa para escrever em sandbox (teste_escrita).
  let req;
  try { req = montarRequisicao(c, op, dados); } catch (e) { if (e instanceof ErroIntegracao) return { ...base, status: 'FAILED', erro: { codigo: e.codigo, mensagem: e.message } }; throw e; }
  if (teste && op.classe !== 'SAFE_READ' && !c.config.teste_escrita) {
    return { ...base, status: 'SIMULATED', simulacao: { metodo: req.metodo, caminho: new URL(req.url).pathname, campos: req.corpo ? Object.keys(JSON.parse(req.corpo)).slice(0, 30) : [] } };
  }

  // Limite de taxa: empresa, conector e operação.
  const t = Date.now(), cfgEmp = lerConfig(app.db).integracoes || {};
  if (!dentroDoLimite(`t:${app.tenantId}`, cfgEmp.limite_minuto_empresa || 300, t) || !dentroDoLimite(`c:${app.tenantId}:${c.id}`, c.config.limite_minuto || 60, t) || !dentroDoLimite(`o:${app.tenantId}:${c.id}:${op.operation_id}`, Math.max(1, Math.ceil((c.config.limite_minuto || 60) / 2)), t)) {
    registrar(app, 'CONNECTOR_RATE_LIMITED', pessoa?.id, base);
    return { ...base, status: 'BLOCKED', erro: { codigo: 'limite_de_taxa', mensagem: 'Limite de chamadas por minuto atingido. Tente de novo em instantes.' } };
  }

  // Idempotência: operação com efeito leva chave; a mesma chave com sucesso não é enviada de novo.
  const efeito = op.classe !== 'SAFE_READ';
  const chave = efeito ? (idempotencyKey || createHash('sha256').update(JSON.stringify([c.id, op.operation_id, planoId, passoId, dados])).digest('hex').slice(0, 40)) : null;
  if (chave) {
    const anterior = um(app.db, "select id, status, http_status from connector_runs where tenant_id = ? and connector_id = ? and operation_id = ? and idempotency_key = ?", app.tenantId, c.id, op.operation_id, chave);
    if (anterior && ['SUCCESS', 'PARTIAL'].includes(anterior.status)) return { ...base, status: anterior.status, duplicado_evitado: true, run_id: anterior.id, http_status: anterior.http_status };
    if (anterior && anterior.status === 'EM_ANDAMENTO') return { ...base, status: 'BLOCKED', erro: { codigo: 'em_andamento', mensagem: 'Esta mesma operação já está em andamento.' } };
    if (anterior) exec(app.db, 'delete from connector_runs where id = ? and tenant_id = ?', anterior.id, app.tenantId);   // falhou antes: pode tentar de novo
    if (c.config.cabecalho_idempotencia) req.cabecalhos[c.config.cabecalho_idempotencia] = chave;
  }
  const runId = novoId('run');
  registrarRun(app, { id: runId, connector_id: c.id, versao: c.versao, capability_id: cap.id, operation_id: op.operation_id, plano_id: planoId, passo_id: passoId, modo, idempotency_key: chave, status: 'EM_ANDAMENTO', pessoa_id: pessoa?.id, quick_win_id: quickWinId });

  let autent;
  try { autent = await autenticar(app, c, req.cabecalhos); }
  catch (e) {
    const codigo = e instanceof ErroIntegracao ? e.codigo : 'credencial';
    atualizarRun(app, runId, { status: 'FAILED', erro_codigo: codigo });
    registrar(app, 'CONNECTOR_FAILED', pessoa?.id, { ...base, run: runId, erro: codigo });
    return { ...base, status: 'FAILED', run_id: runId, erro: { codigo, mensagem: e instanceof ErroIntegracao ? e.message : 'Falha na credencial.' } };
  }

  // Repetição só quando segura: leitura, ou escrita idempotente (com chave). Destrutiva sem garantia: nunca.
  const repetivel = op.classe === 'SAFE_READ' || (op.idempotente && chave) || (efeito && chave && c.config.cabecalho_idempotencia && op.classe !== 'DESTRUCTIVE');
  const max = repetivel ? c.config.max_tentativas : 0;
  const ini = Date.now();
  let resp = null, erro = null, tentativas = 0;
  for (;;) {
    tentativas++;
    try {
      resp = await buscaSegura({ url: req.url, metodo: req.metodo, cabecalhos: autent.cabecalhos, corpo: req.corpo, hosts: c.allowed_hosts, redePrivada: redePrivadaDe(app, c),
        tempoMs: c.config.timeout_ms, sensiveis: autent.sensiveis, ...(lookup ? { lookup } : {}) });
      erro = null;
      if (!c.config.status_repetiveis.includes(resp.status) || tentativas > max) break;
    } catch (e) {
      erro = e instanceof ErroRede ? { codigo: e.codigo, mensagem: e.message } : { codigo: 'conexao', mensagem: 'Falha de conexão.' };
      const transitorio = ['tempo_esgotado', 'conexao', 'dns'].includes(erro.codigo);
      if (!transitorio || tentativas > max) break;
    }
    const ra = Number(resp?.cabecalhos?.['retry-after']);
    await espera(Math.min(5000, Number.isFinite(ra) && ra > 0 ? ra * 1000 : c.config.backoff_ms * 2 ** (tentativas - 1)));
  }
  const ms = Date.now() - ini;
  const fim = (status, extra = {}) => {
    atualizarRun(app, runId, { status, http_status: resp?.status, ms, bytes: resp?.bytes, tentativas, erro_codigo: extra.erro?.codigo });
    if (!teste) exec(app.db, 'update connectors set ultima_validacao = ? where id = ? and tenant_id = ?', agoraIso(app), c.id, app.tenantId);
    // Auditoria: só metadados (nada de corpo, cabeçalho ou segredo).
    registrar(app, status === 'SUCCESS' || status === 'PARTIAL' ? 'CAPABILITY_EXECUTED' : 'CONNECTOR_FAILED', pessoa?.id,
      { ...base, versao: c.versao, run: runId, status, http_status: resp?.status ?? null, ms, bytes: resp?.bytes ?? 0, tentativas, ...(extra.erro ? { erro: extra.erro.codigo } : {}), ...(planoId ? { plano: planoId, passo: passoId } : {}) });
    if (!teste) registrar(app, 'CONNECTOR_USED', pessoa?.id, { connector: c.id, capability: cap.id, status });
    return { ...base, status, run_id: runId, http_status: resp?.status ?? null, ms, tentativas, ...extra };
  };
  if (erro) return fim('FAILED', { erro: { codigo: erro.codigo, mensagem: redigir(erro.mensagem, autent.segredos) } });
  if (resp.status >= 400) {
    const codigo = resp.status === 401 || resp.status === 403 ? 'credencial_invalida' : resp.status === 429 ? 'limite_externo' : resp.status >= 500 ? 'erro_no_sistema_externo' : 'pedido_recusado';
    return fim('FAILED', { erro: { codigo, mensagem: `O sistema externo respondeu ${resp.status}.` } });
  }
  // Resposta: JSON validado contra o esquema da operação; fora do esquema não segue em silêncio.
  let corpo = null;
  const texto = resp.corpo.toString('utf8');
  if (texto.trim()) { try { corpo = JSON.parse(texto); } catch { return fim('FAILED', { erro: { codigo: 'resposta_nao_json', mensagem: 'A resposta não veio no formato esperado.' } }); } }
  if (op.graphql && corpo?.errors?.length) return fim('FAILED', { erro: { codigo: 'graphql', mensagem: 'A API GraphQL devolveu erro.' } });
  const util = op.graphql ? corpo?.data?.[op.graphql.campo] : corpo;
  const erros = op.response_schema ? validarEsquema(util, op.response_schema) : [];
  const gravidade = gravidadeEsquema(erros);
  if (gravidade === 'inconsistente') return fim('FAILED', { erro: { codigo: 'resposta_fora_do_esquema', mensagem: `A resposta não segue o formato declarado (${erros.slice(0, 3).map(x => `${x.caminho}: ${x.erro}`).join('; ')}).` }, inconsistente: true });
  const regrasSaida = mapeamento(app, cap.id, 'saida');
  // A resposta já tem limite de bytes. Remover segredos não pode mudar sua
  // cardinalidade antes do mapeamento e do cálculo de totais do Quick Win.
  let saida = redigir(util, autent.segredos, 0, Infinity);
  if (regrasSaida) { const m = mapear(saida, regrasSaida); saida = m.dados; if (m.erros.length) return fim('PARTIAL', { dados: saida, avisos: m.erros.map(x => `${x.campo}: ${x.erro}`) }); }
  return fim(gravidade === 'parcial' ? 'PARTIAL' : 'SUCCESS', { dados: saida, ...(gravidade ? { avisos: erros.slice(0, 5).map(x => `${x.caminho}: ${x.erro}`) } : {}) });
}

// Métricas por conector (a partir dos runs; nada de conteúdo).
export function metricas(app, conectorId = null) {
  const onde = conectorId ? 'and connector_id = ?' : '';
  const p = conectorId ? [app.tenantId, conectorId] : [app.tenantId];
  const r = um(app.db, `select count(*) as total, sum(status = 'SUCCESS') as sucesso, sum(status = 'PARTIAL') as parcial, sum(status = 'FAILED') as falhas,
    sum(case when tentativas > 1 then tentativas - 1 else 0 end) as repeticoes, avg(ms) as latencia_media, max(ms) as latencia_max from connector_runs where tenant_id = ? and modo = 'real' ${onde}`, ...p);
  const aprov = um(app.db, `select sum(status = 'aprovada') as aprovadas, sum(status = 'negada') as negadas, sum(status = 'pendente') as pendentes from integration_approvals where tenant_id = ? ${conectorId ? 'and connector_id = ?' : ''}`, ...p);
  const bloqueios = um(app.db, `select count(*) as n from eventos where tipo = 'CONNECTOR_BLOCKED' ${conectorId ? "and json_extract(detalhes, '$.connector') = ?" : ''}`, ...(conectorId ? [conectorId] : [])).n;
  return { execucoes: r.total || 0, taxa_sucesso: r.total ? Math.round(((r.sucesso || 0) + (r.parcial || 0)) / r.total * 1000) / 10 : null, falhas: r.falhas || 0, repeticoes: r.repeticoes || 0,
    latencia_media_ms: r.latencia_media ? Math.round(r.latencia_media) : null, latencia_max_ms: r.latencia_max || null, aprovacoes: { aprovadas: aprov.aprovadas || 0, negadas: aprov.negadas || 0, pendentes: aprov.pendentes || 0 }, bloqueios };
}
export const runsRecentes = (app, conectorId) => todos(app.db, 'select id, capability_id, operation_id, modo, status, http_status, ms, tentativas, erro_codigo, criado_em from connector_runs where tenant_id = ? and connector_id = ? order by criado_em desc limit 50', app.tenantId, conectorId);
