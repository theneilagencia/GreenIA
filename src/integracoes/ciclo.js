// Ciclo de vida: credencial, contrato de teste, pedido de aprovação, publicação, pausa e revogação.
// Teste antes de aprovar; aprovação antes de publicar; publicação só da versão testada e aprovada.
import { exec, um, json } from '../db.js';
import { registrar } from '../eventos.js';
import { ErroIntegracao, conectorOu404, capabilitiesDe, mudarStatus, lerConector } from './conectores.js';
import { guardarSegredo, apagarSegredo } from './segredos.js';
import { executarCapability } from './runtime.js';
import { solicitarPublicacao } from './aprovacoes.js';
import { validarRegras } from './mapeamento.js';

const agora = app => app.agora().toISOString();
function valorDe(e, prof = 0) {
  if (!e || prof > 5) return 'exemplo';
  if (Array.isArray(e.enum) && e.enum.length) return e.enum[0];
  const t = [].concat(e.type || 'string')[0];
  if (t === 'integer' || t === 'number') return Number.isFinite(e.minimum) ? e.minimum : 1;
  if (t === 'boolean') return false;
  if (t === 'array') return [valorDe(e.items, prof + 1)];
  if (t === 'object') return Object.fromEntries((e.required || Object.keys(e.properties || {})).slice(0, 30).map(k => [k, valorDe(e.properties?.[k], prof + 1)]));
  return 'exemplo';
}
const amostra = op => ({ ...Object.fromEntries((op.parametros || []).filter(p => p.obrigatorio).map(p => [p.nome, p.em === 'path' ? '1' : valorDe(p.esquema)])), ...(op.request_schema ? valorDe(op.request_schema) : {}) });

// Credencial: o valor vai cifrado para o cofre; o conector guarda a referência. Trocar o valor é rotação (não muda a
// versão); trocar o TIPO de autenticação muda (atualizarConector).
export function configurarCredencial(app, pessoa, id, valor) {
  const c = conectorOu404(app, id);
  if (c.auth_type === 'none') throw new ErroIntegracao(400, 'sem_auth', 'Esta integração não usa credencial.');
  const v = normalizarCredencial(c.auth_type, valor);
  const ref = guardarSegredo(app, { conectorId: c.id, tipo: c.auth_type, valor: v, keyId: c.secret_ref?.key_id || null });
  exec(app.db, 'update connectors set secret_ref = ?, atualizado_em = ? where id = ? and tenant_id = ?', JSON.stringify(ref), agora(app), c.id, app.tenantId);
  registrar(app, c.secret_ref ? 'CONNECTOR_SECRET_ROTATED' : 'CONNECTOR_SECRET_SET', pessoa?.id, { connector: c.id, tipo: c.auth_type });
  return { ok: true };
}
function normalizarCredencial(tipo, v) {
  const s = x => (typeof x === 'string' ? x.trim() : '');
  if (['api_key', 'bearer', 'custom_header'].includes(tipo)) { const x = typeof v === 'string' ? s(v) : s(v?.valor || v?.token); if (!x || /[\r\n]/.test(x)) throw new ErroIntegracao(400, 'credencial', 'Credencial inválida.'); return x; }
  if (tipo === 'basic') { if (!s(v?.usuario) || !s(v?.senha) || /[:\r\n]/.test(v.usuario)) throw new ErroIntegracao(400, 'credencial', 'Informe usuário e senha.'); return { usuario: s(v.usuario), senha: s(v.senha) }; }
  if (tipo.startsWith('oauth2')) { if (!s(v?.client_id) || !s(v?.client_secret)) throw new ErroIntegracao(400, 'credencial', 'Informe client id e client secret.'); return { client_id: s(v.client_id), client_secret: s(v.client_secret) }; }
  throw new ErroIntegracao(400, 'auth_nao_suportada', 'Tipo de autenticação ainda não suportado.');
}

// Contrato de teste: autenticação, conectividade, esquema, mapeamento, tempo limite, repetição, paginação, erros,
// limite de taxa e efeitos (escrita simulada). Leituras rodam de verdade em modo teste; escritas, não.
export async function testarConector(app, pessoa, id, { exemplos = {}, lookup } = {}) {
  let c = conectorOu404(app, id);
  if (!['CONFIGURED', 'FAILED', 'TESTING'].includes(c.status)) throw new ErroIntegracao(409, 'status', 'Configure a integração (capabilities e credencial) antes de testar.');
  const caps = capabilitiesDe(app, c.id).filter(x => x.status !== 'revogada');
  if (!caps.length) throw new ErroIntegracao(400, 'sem_capabilities', 'Escolha ao menos uma ação (capability) para esta integração.');
  if (!c.base_url) throw new ErroIntegracao(400, 'base_url', 'Informe o endereço da API.');
  if (c.status !== 'TESTING') c = mudarStatus(app, c, 'TESTING', pessoa?.id);
  const itens = [];
  const chk = (id_, ok, detalhe = '', obrigatorio = true) => itens.push({ id: id_, ok, detalhe, obrigatorio });
  chk('credencial', c.auth_type === 'none' || !!c.secret_ref, c.auth_type === 'none' ? 'sem autenticação' : c.secret_ref ? 'cadastrada' : 'falta cadastrar a credencial');
  const ops = new Map((c.spec.operacoes || []).map(o => [o.operation_id, o]));
  const resultados = [];
  for (const cap of caps) {
    const op = ops.get(cap.operation_id);
    // Escrita sem exemplo: amostra sintética a partir do esquema (só para o ensaio; nunca é enviada).
    const ex = exemplos?.[cap.operation_id] && typeof exemplos[cap.operation_id] === 'object' ? exemplos[cap.operation_id] : op && op.classe !== 'SAFE_READ' ? amostra(op) : {};
    const faltam = (op?.parametros || []).filter(p => p.obrigatorio && ex[p.nome] === undefined).map(p => p.nome);
    if (op?.classe === 'SAFE_READ' && faltam.length) { resultados.push({ capability: cap.id, status: 'NAO_TESTADA', motivo: `faltam exemplos: ${faltam.join(', ')}` }); continue; }
    const r = await executarCapability(app, { capabilityId: cap.id, entrada: ex, pessoa, modo: 'teste', lookup });
    resultados.push({ capability: cap.id, nome: cap.nome, modo: cap.modo, status: r.status, http_status: r.http_status ?? null, erro: r.erro?.codigo || null, ms: r.ms ?? null, tentativas: r.tentativas ?? 0, ...(r.simulacao ? { simulacao: r.simulacao } : {}) });
  }
  const leituras = resultados.filter(r => r.modo === 'read');
  const leiturasFeitas = leituras.filter(r => ['SUCCESS', 'PARTIAL', 'FAILED'].includes(r.status));
  const okLeitura = leiturasFeitas.filter(r => r.status === 'SUCCESS' || r.status === 'PARTIAL');
  chk('autenticacao', !leiturasFeitas.some(r => r.erro === 'credencial_invalida' || r.erro === 'credencial_ausente'), leiturasFeitas.some(r => r.erro === 'credencial_invalida') ? 'credencial recusada pelo sistema' : 'ok');
  chk('conectividade', !leituras.length || okLeitura.length > 0, leituras.length ? `${okLeitura.length} de ${leituras.length} leituras responderam` : 'sem leitura para testar (escritas simuladas)', leituras.length > 0);
  chk('esquema', !resultados.some(r => r.erro === 'resposta_fora_do_esquema' || r.erro === 'resposta_nao_json'), resultados.some(r => r.erro === 'resposta_fora_do_esquema') ? 'resposta fora do formato declarado' : 'ok');
  let mapOk = true;
  for (const cap of caps) for (const r of ['entrada', 'saida']) { const m = um(app.db, 'select regras from capability_mappings where capability_id = ? and tenant_id = ? and direcao = ? order by versao desc limit 1', cap.id, app.tenantId, r); if (m) { try { validarRegras(json(m.regras, [])); } catch { mapOk = false; } } }
  chk('mapeamento', mapOk, mapOk ? 'ok' : 'regra de mapeamento inválida');
  chk('tempo_limite', c.config.timeout_ms > 0 && c.config.timeout_ms <= 60000, `${c.config.timeout_ms} ms`);
  chk('repeticao', true, 'destrutivo nunca repete sem idempotência; leitura repete até ' + c.config.max_tentativas + ' vez(es)');
  chk('paginacao', true, (c.spec.operacoes || []).some(o => o.paginacao) ? 'paginação detectada' : 'sem paginação declarada', false);
  chk('erros', !resultados.some(r => r.erro === 'erro_no_sistema_externo' || r.erro === 'tempo_esgotado' || r.erro === 'destino_bloqueado' || r.erro === 'host_nao_autorizado'),
    resultados.filter(r => r.erro).map(r => r.erro).join(', ') || 'nenhum erro');
  chk('limite_de_taxa', c.config.limite_minuto > 0, `${c.config.limite_minuto} por minuto`);
  chk('efeitos', !resultados.some(r => r.modo === 'write' && !['SIMULATED', 'SUCCESS', 'PARTIAL'].includes(r.status)) && (c.config.teste_escrita || !resultados.some(r => r.modo === 'write' && r.status !== 'SIMULATED')), 'escritas simuladas no teste (nada mudou no sistema externo)');
  const passou = itens.filter(i => i.obrigatorio).every(i => i.ok) && !resultados.some(r => r.status === 'FAILED');
  registrar(app, 'CONNECTOR_TESTED', pessoa?.id, { connector: c.id, versao: c.versao, passou, itens: itens.map(i => `${i.id}:${i.ok ? 'ok' : 'falha'}`), capabilities: resultados.length });
  c = lerConector(app, c.id);
  let aprovacao = null;
  if (passou) { c = mudarStatus(app, c, 'REVIEW_REQUIRED', pessoa?.id); aprovacao = solicitarPublicacao(app, pessoa, c); }
  else mudarStatus(app, c, 'FAILED', pessoa?.id, { motivo: 'teste' });
  return { passou, itens, resultados, aprovacao: aprovacao ? { id: aprovacao.id, resumo: aprovacao.resumo } : null };
}

function testeDaVersao(app, c) {
  const r = um(app.db, "select detalhes from eventos where tipo = 'CONNECTOR_TESTED' and json_extract(detalhes, '$.connector') = ? order by id desc limit 1", c.id);
  const d = r ? json(r.detalhes, {}) : null;
  return d && d.versao === c.versao && d.passou === true;
}

export function publicar(app, pessoa, id) {
  const c = conectorOu404(app, id);
  if (c.status !== 'APPROVED' || c.aprovado_versao !== c.versao) throw new ErroIntegracao(409, 'nao_aprovado', 'Só a versão testada e aprovada pode ser publicada.');
  if (!testeDaVersao(app, c)) throw new ErroIntegracao(409, 'sem_teste', 'Esta versão não passou no teste.');
  exec(app.db, "update capabilities set status = 'ativa', versao = ? where connector_id = ? and tenant_id = ? and status != 'revogada'", c.versao, c.id, app.tenantId);
  return mudarStatus(app, c, 'ACTIVE', pessoa?.id, { capabilities: capabilitiesDe(app, c.id).filter(x => x.status === 'ativa').length });
}
export function pausar(app, pessoa, id) { return mudarStatus(app, conectorOu404(app, id), 'PAUSED', pessoa?.id); }
export function retomar(app, pessoa, id) {
  const c = conectorOu404(app, id);
  if (c.aprovado_versao !== c.versao) throw new ErroIntegracao(409, 'nao_aprovado', 'Esta versão não está aprovada.');
  return mudarStatus(app, c, 'ACTIVE', pessoa?.id);
}
export function revogar(app, pessoa, id) {
  const c = conectorOu404(app, id);
  const r = mudarStatus(app, c, 'REVOKED', pessoa?.id);
  exec(app.db, "update capabilities set status = 'revogada' where connector_id = ? and tenant_id = ?", c.id, app.tenantId);
  exec(app.db, "update integration_approvals set status = 'invalidada', motivo = 'integração revogada', decidido_em = ? where connector_id = ? and tenant_id = ? and status = 'pendente'", agora(app), c.id, app.tenantId);
  if (c.secret_ref) { apagarSegredo(app, c.secret_ref); exec(app.db, 'update connectors set secret_ref = null where id = ? and tenant_id = ?', c.id, app.tenantId); }
  return r;
}
