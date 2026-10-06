// Integrações (Integration Builder governado). Telas da Administração:
//   #/integracoes                       lista, aprovações pendentes e métricas
//   #/integracoes/nova                  assistente em 8 passos (sistema, documentação, autenticação, ações,
//                                       permissões, teste, aprovação, publicação)
//   #/integracoes/c/:id                 detalhe de uma integração (status, ações, versões, execuções)
//   #/integracoes/aprovacao/:id         tela de aprovação em linguagem simples ("poderá / não poderá")
// A tela nunca mostra credencial depois de cadastrada (só a máscara) e não pede JSON a quem só configura: a
// documentação da API pode ser colada (OpenAPI, Swagger, GraphQL) ou as ações descritas num formulário simples.
import { api, esc, ocupado, toast, vazioHtml } from '/comum.js';
import { cabecalho, ligarCabecalho, irPara, pode } from '/app.js';

const $ = id => document.getElementById(id);
const pagina = (titulo, html, acoes = '') => { $('principal').innerHTML = `${cabecalho(titulo, acoes)}<div class="pagina"><div class="pagina-dentro">${html}</div></div>`; ligarCabecalho(); };

export const STATUS = { DRAFT: 'Rascunho', DISCOVERED: 'Descoberta', CONFIGURED: 'Configurada', TESTING: 'Em teste', REVIEW_REQUIRED: 'Aguardando aprovação', APPROVED: 'Aprovada', ACTIVE: 'Ativa', PAUSED: 'Pausada', FAILED: 'Falhou no teste', REVOKED: 'Revogada' };
const RISCO = { LOW: 'Baixo', MEDIUM: 'Médio', HIGH: 'Alto', CRITICAL: 'Crítico' };
const CLASSE = { SAFE_READ: 'Só leitura', SIDE_EFFECT: 'Cria ou altera', DESTRUCTIVE: 'Apaga' };
const ESTADO_EXECUCAO = { SUCCESS: 'Concluída', SIMULATED: 'Simulada', PARTIAL: 'Concluída parcialmente', FAILED: 'Não foi possível concluir', BLOCKED: 'Bloqueada', DENIED: 'Negada pela política', APPROVAL_REQUIRED: 'Aguardando autorização', PENDENTE: 'Não executada' };
const EFEITOS_LEGIVEIS = { read: 'consulta informações', write: 'cria ou altera dados', external_side_effect: 'faz alterações em outro sistema', irreversible: 'pode realizar uma ação que não pode ser desfeita', financial: 'envolve valores financeiros', personal_data: 'trata dados pessoais', privileged: 'usa acesso privilegiado', communication: 'envia comunicações', bulk: 'atua sobre vários registros' };
const efeitosLegiveis = lista => (lista || []).map(x => esc(EFEITOS_LEGIVEIS[x] || `Efeito declarado: ${x}`)).join(', ') || 'Nenhum efeito informado';
const AUTH = [['none', 'Sem autenticação'], ['api_key', 'Chave de API'], ['bearer', 'Token (Bearer)'], ['basic', 'Usuário e senha'], ['oauth2_client_credentials', 'OAuth2 (aplicação)'], ['oauth2_authorization_code', 'OAuth2 (login no sistema)'], ['custom_header', 'Cabeçalho personalizado']];
const selo = (t, tipo = '') => `<span class="selo-int ${tipo}">${esc(t)}</span>`;
const seloRisco = r => selo(`Risco ${RISCO[r] || r}`, r === 'LOW' ? 'ok' : r === 'MEDIUM' ? 'atencao' : 'erro');
const seloStatus = s => selo(STATUS[s] || s, s === 'ACTIVE' ? 'ok' : ['FAILED', 'REVOKED'].includes(s) ? 'erro' : ['PAUSED', 'REVIEW_REQUIRED'].includes(s) ? 'atencao' : '');
const ESTILO = `<style>.selo-int{display:inline-block;font-size:12px;padding:2px 8px;border-radius:999px;background:var(--cinza-claro,#eef1ef);margin-right:4px}
.selo-int.ok{background:#e3f4ea;color:#1d6b3e}.selo-int.atencao{background:#fff4dc;color:#8a5a00}.selo-int.erro{background:#fde8e6;color:#9b2318}
.passos-int{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 18px;padding:0;list-style:none}.passos-int li{font-size:13px;padding:4px 10px;border-radius:999px;background:#f1f3f2}.passos-int li.atual{background:#1d6b3e;color:#fff}.passos-int li.feito{background:#e3f4ea}
.lista-int{display:grid;gap:10px}.item-int{border:1px solid #e3e6e4;border-radius:10px;padding:12px 14px}.item-int h3{margin:0 0 4px;font-size:15px}.item-int p{margin:4px 0}
.ok-int{color:#1d6b3e}.erro-int{color:#9b2318}.campo-int{display:grid;gap:4px;margin:10px 0}.campo-int input,.campo-int select,.campo-int textarea{width:100%;max-width:640px}
.linha-op{display:flex;gap:8px;align-items:flex-start;padding:8px 0;border-bottom:1px solid #eef1ef}.linha-op small{display:block;color:#5d6862}</style>`;

export async function rotaIntegracoes(h) {
  let m;
  if (h === '#/integracoes') return vistaLista();
  if (h === '#/integracoes/nova') return assistente({ passo: 1 });
  if ((m = /^#\/integracoes\/c\/([\w-]+)$/.exec(h))) return vistaConector(m[1]);
  if ((m = /^#\/integracoes\/c\/([\w-]+)\/passo\/(\d)$/.exec(h))) return assistente({ id: m[1], passo: Number(m[2]) });
  if ((m = /^#\/integracoes\/aprovacao\/([\w-]+)$/.exec(h))) return vistaAprovacao(m[1]);
  return irPara('#/integracoes');
}

async function vistaLista() {
  const d = await api('/api/admin/integracoes');
  const conectores = d.conectores.length ? `<div class="lista-int">${d.conectores.map(c => `<a class="item-int" href="#/integracoes/c/${esc(c.id)}" style="text-decoration:none;color:inherit">
      <h3>${esc(c.nome)} ${seloStatus(c.status)}</h3><p>${esc(c.sistema)} · versão ${c.versao} · ${c.capabilities.length} ${c.capabilities.length === 1 ? 'ação' : 'ações'}</p>
      <p>${c.capabilities.slice(0, 4).map(x => selo(x.frase || x.nome, x.modo === 'read' ? 'ok' : 'atencao')).join('')}</p></a>`).join('')}</div>`
    : vazioHtml({ icone: 'link', titulo: 'Nenhuma integração ainda', texto: 'Conecte um sistema da empresa para que Quick Wins possam consultar dados e, com aprovação, registrar resultados.' });
  const pend = d.pendentes.length ? `<h2>Aprovações pendentes</h2><div class="lista-int">${d.pendentes.map(a => `<a class="item-int" href="#/integracoes/aprovacao/${esc(a.id)}" style="text-decoration:none;color:inherit">
      <h3>${a.tipo === 'publicacao' ? 'Publicar integração' : 'Executar ação'}: ${esc(a.resumo.sistema || '')} ${seloRisco(a.risco)}</h3><p>${esc(a.tipo === 'publicacao' ? `${(a.resumo.podera || []).length} ações para revisar` : a.resumo.acao || '')}</p></a>`).join('')}</div>` : '';
  const mt = d.metricas || {};
  pagina('Integrações', `${ESTILO}<p class="lead">Sistemas externos que os Quick Wins podem usar, sempre pela GreenIA: credenciais no cofre, política da empresa e aprovação para qualquer escrita.</p>
    ${pend}<h2>Integrações da empresa</h2>${conectores}
    <h2>Uso</h2><p class="dica">${Number(mt.execucoes || 0)} execuções · ${mt.taxa_sucesso ?? '—'}% de sucesso · ${Number(mt.falhas || 0)} falhas · ${Number(mt.bloqueios || 0)} bloqueadas pela política · ${Number(mt.aprovacoes?.pendentes || 0)} aprovações pendentes</p>`,
  pode('integrations.manage') ? '<a class="btn btn-verde" href="#/integracoes/nova" style="margin-left:auto">Nova integração</a>' : '');
}

// ---- Assistente --------------------------------------------------------------------------------------------
const PASSOS = ['Sistema', 'Documentação', 'Autenticação', 'Ações', 'Permissões', 'Teste', 'Aprovação', 'Publicar'];
let W = null;   // rascunho do assistente (só na memória da página; credencial nunca fica aqui depois de enviada)
const trilha = n => `<ol class="passos-int">${PASSOS.map((p, i) => `<li class="${i + 1 === n ? 'atual' : i + 1 < n ? 'feito' : ''}">${i + 1}. ${p}</li>`).join('')}</ol>`;

async function assistente({ id = null, passo }) {
  if (!pode('integrations.manage')) return irPara('#/integracoes');
  if (id) { W = { ...(W?.id === id ? W : {}), id, conector: await api(`/api/admin/integracoes/${encodeURIComponent(id)}`) }; }
  else if (passo === 1 && (!W || W.id)) W = { nome: '', sistema: '', tipo: 'REST', base_url: '', operacoes: [], avisos: [] };
  if (!W) return irPara('#/integracoes/nova');
  const tela = [null, passoSistema, passoDocumentacao, passoAutenticacao, passoAcoes, passoPermissoes, passoTeste, passoAprovacao, passoPublicar][passo];
  if (!tela) return irPara('#/integracoes');
  if (passo > 3 && !W.id) return irPara('#/integracoes/nova');
  await tela();
}
const moldura = (n, corpo, botoes) => pagina('Nova integração', `${ESTILO}${trilha(n)}${corpo}<div class="linha-botoes" style="margin-top:18px">${botoes}</div>`);

function passoSistema() {
  moldura(1, `<h2>Qual sistema a GreenIA vai acessar?</h2>
    <label class="campo-int">Nome da integração<input id="i-nome" maxlength="80" value="${esc(W.nome)}" placeholder="Ex.: CRM de vendas"></label>
    <label class="campo-int">Sistema<input id="i-sistema" maxlength="80" value="${esc(W.sistema)}" placeholder="Ex.: CRM, ERP, Helpdesk"></label>
    <label class="campo-int">Tipo de conexão<select id="i-tipo">${[['REST', 'API REST'], ['GraphQL', 'API GraphQL'], ['Webhook', 'Webhook (o sistema avisa a GreenIA)']].map(([v, t]) => `<option value="${v}"${W.tipo === v ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
    <p class="dica">Banco de dados, SFTP, e-mail e automação de navegador ainda não podem ser conectados por aqui: pedem configuração da equipe técnica.</p>`,
  '<a class="btn-texto" href="#/integracoes">Cancelar</a><button class="btn btn-verde" id="seguir">Continuar</button>');
  $('seguir').onclick = () => {
    W.nome = $('i-nome').value.trim(); W.sistema = $('i-sistema').value.trim(); W.tipo = $('i-tipo').value;
    if (!W.nome || !W.sistema) return toast('Informe o nome e o sistema.');
    W.passo = 2; passoDocumentacao();
  };
}

function passoDocumentacao() {
  const ops = W.operacoes || [];
  moldura(2, `<h2>Como a API funciona?</h2>
    <label class="campo-int">Endereço da API<input id="i-base" maxlength="300" value="${esc(W.base_url)}" placeholder="https://api.exemplo.com/v1"></label>
    <p class="dica">A GreenIA só acessa os endereços autorizados aqui. Endereços internos da rede (localhost, IPs privados) ficam bloqueados.</p>
    <label class="campo-int"><span><input type="checkbox" id="i-interna" ${W.rede_privada ? 'checked' : ''}> O sistema fica na rede interna da empresa (só funciona se a empresa autorizou rede interna nas Configurações)</span></label>
    <details ${ops.length ? '' : 'open'}><summary>Tenho a documentação da API (OpenAPI, Swagger ou GraphQL)</summary>
      <label class="campo-int">Cole a documentação<textarea id="i-doc" rows="6" placeholder="Cole aqui o conteúdo do arquivo openapi.json"></textarea></label>
      <p class="dica">A documentação é só lida para descobrir as ações possíveis: nada nela é executado.</p>
      <button class="btn" id="ler-doc">Ler documentação</button></details>
    <details><summary>Prefiro descrever uma ação</summary>
      <div class="campo-int">Ação<select id="m-metodo"><option value="GET">Consultar (GET)</option><option value="POST">Criar (POST)</option><option value="PATCH">Atualizar (PATCH)</option><option value="PUT">Substituir (PUT)</option><option value="DELETE">Apagar (DELETE)</option></select></div>
      <label class="campo-int">Caminho<input id="m-caminho" placeholder="/clientes"></label>
      <label class="campo-int">O que faz<input id="m-resumo" placeholder="Listar clientes"></label>
      <button class="btn" id="add-op">Adicionar ação</button></details>
    <h3>Ações encontradas (${ops.length})</h3>
    ${ops.length ? ops.map(o => `<div class="linha-op"><span>${selo(CLASSE[o.classe] || o.classe, o.classe === 'SAFE_READ' ? 'ok' : o.classe === 'DESTRUCTIVE' ? 'erro' : 'atencao')}</span><span>${esc(o.resumo || o.operation_id)}<small>${esc(o.metodo)} ${esc(o.caminho || o.graphql?.campo || '')}</small></span></div>`).join('') : '<p class="dica">Nenhuma ação ainda.</p>'}
    ${(W.avisos || []).map(a => `<p class="dica">⚠ ${esc(a)}</p>`).join('')}`,
  '<button class="btn-texto" id="voltar">Voltar</button><button class="btn btn-verde" id="seguir">Continuar</button>');
  const guardarBase = () => { W.base_url = $('i-base').value.trim(); W.rede_privada = $('i-interna').checked; };
  $('voltar').onclick = () => { guardarBase(); passoSistema(); };
  $('ler-doc').onclick = e => ocupado(e.target, async () => {
    guardarBase();
    try {
      const d = await api('/api/admin/integracoes/descobrir', { metodo: 'POST', corpo: { especificacao: $('i-doc').value } });
      W.operacoes = d.operacoes; W.avisos = d.avisos || []; W.formato = d.formato; W.auth_sugerida = d.auth?.[0]?.tipo;
      if (!W.base_url && d.base_url) W.base_url = d.base_url;
      passoDocumentacao();
    } catch (err) { toast(err.message); }
  });
  $('add-op').onclick = e => ocupado(e.target, async () => {
    guardarBase();
    const caminho = $('m-caminho').value.trim(), resumo = $('m-resumo').value.trim(), metodo = $('m-metodo').value;
    if (!caminho.startsWith('/')) return toast('O caminho começa com "/".');
    try {
      const d = await api('/api/admin/integracoes/descobrir', { metodo: 'POST', corpo: { especificacao: { sistema: W.sistema, base_url: W.base_url, operacoes: [{ operation_id: `${metodo.toLowerCase()}_${caminho}`, metodo, caminho, resumo }] } } });
      const novas = d.operacoes.filter(o => !W.operacoes.some(x => x.operation_id === o.operation_id));
      W.operacoes = [...W.operacoes, ...novas]; W.formato = W.formato || 'manual';
      passoDocumentacao();
    } catch (err) { toast(err.message); }
  });
  $('seguir').onclick = () => { guardarBase(); if (!W.base_url) return toast('Informe o endereço da API.'); if (!W.operacoes.length) return toast('Adicione ao menos uma ação.'); passoAutenticacao(); };
}

function camposCredencial(tipo) {
  if (tipo === 'none') return '<p class="dica">Sem credencial.</p>';
  if (tipo === 'basic') return '<label class="campo-int">Usuário<input id="c-usuario" autocomplete="off"></label><label class="campo-int">Senha<input id="c-senha" type="password" autocomplete="new-password"></label>';
  if (tipo.startsWith('oauth2')) return `<label class="campo-int">Client ID<input id="c-cid" autocomplete="off"></label><label class="campo-int">Client secret<input id="c-csec" type="password" autocomplete="new-password"></label>
    <label class="campo-int">Endereço do token<input id="c-token" placeholder="https://auth.exemplo.com/oauth/token" value="${esc(W.config?.token_url || '')}"></label>
    ${tipo === 'oauth2_authorization_code' ? `<label class="campo-int">Endereço de autorização<input id="c-auth" value="${esc(W.config?.auth_url || '')}"></label>` : ''}
    <label class="campo-int">Permissões pedidas (escopos, separados por espaço)<input id="c-escopos" value="${esc((W.config?.escopos || []).join(' '))}" placeholder="leitura"></label>`;
  return `${['api_key', 'custom_header'].includes(tipo) ? `<label class="campo-int">Nome do cabeçalho<input id="c-cab" value="${esc(W.config?.cabecalho_auth || 'X-API-Key')}"></label>` : ''}<label class="campo-int">${tipo === 'bearer' ? 'Token' : 'Chave'}<input id="c-valor" type="password" autocomplete="new-password"></label>`;
}
function passoAutenticacao() {
  const c = W.conector;
  const tipo = W.auth_type || c?.auth_type || (AUTH.some(([v]) => v === W.auth_sugerida) ? W.auth_sugerida : 'api_key');
  moldura(3, `<h2>Como a GreenIA se identifica no sistema?</h2>
    <label class="campo-int">Autenticação<select id="a-tipo">${AUTH.map(([v, t]) => `<option value="${v}"${v === tipo ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
    <div id="a-campos">${camposCredencial(tipo)}</div>
    ${c?.credencial ? `<p class="dica">Credencial cadastrada: ${esc(c.credencial.mascara || '••••')}. Preencha só se for trocar.</p>` : ''}
    <p class="dica">A credencial vai cifrada para o cofre da empresa. Depois de salva, ninguém a vê de novo: nem a tela, nem a IA, nem os registros.</p>`,
  `${W.id ? '' : '<button class="btn-texto" id="voltar">Voltar</button>'}<button class="btn btn-verde" id="seguir">Salvar e continuar</button>`);
  if ($('voltar')) $('voltar').onclick = () => passoDocumentacao();
  $('a-tipo').onchange = () => { W.auth_type = $('a-tipo').value; $('a-campos').innerHTML = camposCredencial(W.auth_type); };
  $('seguir').onclick = e => ocupado(e.target, async () => {
    const t = $('a-tipo').value, v = id_ => $(id_)?.value?.trim() || '';
    const config = W.id ? {} : { rede_privada: !!W.rede_privada };
    if (['api_key', 'custom_header'].includes(t)) config.cabecalho_auth = v('c-cab') || 'X-API-Key';
    if (t.startsWith('oauth2')) { config.token_url = v('c-token'); if (t === 'oauth2_authorization_code') config.auth_url = v('c-auth'); config.escopos = v('c-escopos').split(/\s+/).filter(Boolean); }
    let valor = null;
    if (['api_key', 'bearer', 'custom_header'].includes(t) && v('c-valor')) valor = v('c-valor');
    if (t === 'basic' && v('c-usuario')) valor = { usuario: v('c-usuario'), senha: $('c-senha').value };
    if (t.startsWith('oauth2') && v('c-cid')) valor = { client_id: v('c-cid'), client_secret: $('c-csec').value };
    try {
      if (!W.id) {
        const hosts = (() => { try { return [new URL(W.base_url).hostname]; } catch { return []; } })();
        const r = await api('/api/admin/integracoes', { metodo: 'POST', corpo: { nome: W.nome, sistema: W.sistema, tipo: W.tipo, base_url: W.base_url, allowed_hosts: hosts, auth_type: t, operacoes: W.operacoes, formato: W.formato, config } });
        W.id = r.id;
      } else if (t !== c.auth_type || Object.keys(config).length) await api(`/api/admin/integracoes/${W.id}`, { metodo: 'PATCH', corpo: { auth_type: t, config } });
      if (valor) await api(`/api/admin/integracoes/${W.id}/credencial`, { metodo: 'PUT', corpo: { valor } });
      W.auth_type = null;
      irPara(`#/integracoes/c/${W.id}/passo/4`);
    } catch (err) { toast(err.message); }
  });
}

async function passoAcoes() {
  const c = W.conector, ativas = new Set(c.capabilities.map(x => x.operation_id || x.id));
  const escolhidas = new Set(c.capabilities.map(x => x.nome));
  moldura(4, `<h2>O que a GreenIA poderá fazer nesse sistema?</h2>
    <p class="dica">Escolha só o necessário. Consultar é o padrão; criar ou alterar sempre passa pela política da empresa; apagar fica bloqueado pela política padrão.</p>
    ${c.operacoes.map((o, i) => `<label class="linha-op"><input type="checkbox" data-op="${esc(o.operation_id)}" ${escolhidas.has(o.resumo || o.operation_id) || ativas.has(o.operation_id) ? 'checked' : ''}>
      <span>${esc(o.resumo || o.operation_id)} ${selo(CLASSE[o.classe] || o.classe, o.classe === 'SAFE_READ' ? 'ok' : o.classe === 'DESTRUCTIVE' ? 'erro' : 'atencao')} ${seloRisco(o.risco)}
      <small>${esc(o.metodo)} ${esc(o.caminho || '')}${Object.entries(o.efeitos || {}).filter(([, v]) => v).length ? ' · ' + Object.entries(o.efeitos).filter(([, v]) => v).map(([k]) => esc(k)).join(', ') : ''}</small></span></label>`).join('')}`,
  '<button class="btn btn-verde" id="seguir">Salvar e continuar</button>');
  $('seguir').onclick = e => ocupado(e.target, async () => {
    const escolhas = [...document.querySelectorAll('[data-op]')].filter(x => x.checked).map(x => ({ operation_id: x.dataset.op }));
    if (!escolhas.length) return toast('Escolha ao menos uma ação.');
    try { await api(`/api/admin/integracoes/${W.id}/capabilities`, { metodo: 'PUT', corpo: { escolhas } }); irPara(`#/integracoes/c/${W.id}/passo/5`); } catch (err) { toast(err.message); }
  });
}

function passoPermissoes() {
  const c = W.conector, cfg = c.config || {};
  moldura(5, `<h2>Limites e permissões</h2>
    <div class="lista-int">${c.capabilities.map(x => `<div class="item-int"><b>${esc(x.frase || x.nome)}</b> ${seloRisco(x.risco)}<p class="dica">${x.modo === 'read' ? 'Leitura: liberada quando o risco é baixo ou médio.' : x.classe === 'DESTRUCTIVE' ? 'Apagar: bloqueado pela política padrão.' : 'Escrita: cada execução pede aprovação de quem pode aprovar.'}</p></div>`).join('')}</div>
    <label class="campo-int">Tempo máximo por chamada (segundos)<input id="p-tempo" type="number" min="1" max="60" value="${Math.round((cfg.timeout_ms || 10000) / 1000)}"></label>
    <label class="campo-int">Chamadas por minuto (no máximo)<input id="p-limite" type="number" min="1" max="600" value="${cfg.limite_minuto || 60}"></label>
    <label class="campo-int"><span><input type="checkbox" id="p-sensivel" ${cfg.sistema_sensivel ? 'checked' : ''}> Sistema sensível (financeiro, RH, dados pessoais): risco sobe um nível</span></label>
    <p class="dica">Endereços autorizados: ${c.hosts.map(esc).join(', ') || '—'}.</p>`,
  '<button class="btn btn-verde" id="seguir">Salvar e continuar</button>');
  $('seguir').onclick = e => ocupado(e.target, async () => {
    const config = { timeout_ms: Math.min(60, Math.max(1, Number($('p-tempo').value) || 10)) * 1000, limite_minuto: Math.min(600, Math.max(1, Number($('p-limite').value) || 60)), sistema_sensivel: $('p-sensivel').checked };
    try {
      const mudou = config.timeout_ms !== cfg.timeout_ms || config.limite_minuto !== cfg.limite_minuto || !!config.sistema_sensivel !== !!cfg.sistema_sensivel;
      if (mudou) await api(`/api/admin/integracoes/${W.id}`, { metodo: 'PATCH', corpo: { config } });
      irPara(`#/integracoes/c/${W.id}/passo/6`);
    } catch (err) { toast(err.message); }
  });
}

const NOMES_TESTE = { credencial: 'Credencial', autenticacao: 'Autenticação', conectividade: 'Conexão', esquema: 'Formato da resposta', mapeamento: 'Mapeamento de campos', tempo_limite: 'Tempo limite', repeticao: 'Repetição segura', paginacao: 'Paginação', erros: 'Erros', limite_de_taxa: 'Limite de chamadas', efeitos: 'Escritas simuladas' };
function passoTeste() {
  const c = W.conector;
  const r = W.teste;
  moldura(6, `<h2>Teste antes de aprovar</h2>
    <p class="dica">Consultas rodam de verdade, em modo teste. Escritas são só simuladas: nada muda no sistema externo.</p>
    ${r ? `<p class="${r.passou ? 'ok-int' : 'erro-int'}"><b>${r.passou ? '✓ Passou no teste' : '✕ Não passou no teste'}</b></p>
      <div class="lista-int">${r.itens.map(i => `<div class="linha-op"><span class="${i.ok ? 'ok-int' : 'erro-int'}">${i.ok ? '✓' : '✕'}</span><span>${esc(NOMES_TESTE[i.id] || i.id)}<small>${esc(i.detalhe)}</small></span></div>`).join('')}</div>
      <h3>Ações</h3>${r.resultados.map(x => `<div class="linha-op"><span>${selo(ESTADO_EXECUCAO[x.status] || x.status, ['SUCCESS', 'SIMULATED'].includes(x.status) ? 'ok' : 'erro')}</span><span>${esc(x.nome || x.capability)}<small>${x.ms != null ? `${x.ms} ms` : ''}${x.erro ? ` · ${esc(x.erro)}` : ''}${x.motivo ? ` · ${esc(x.motivo)}` : ''}</small></span></div>`).join('')}` : `<p>Status: ${seloStatus(c.status)}</p>`}`,
  `<button class="btn${r?.passou ? '' : ' btn-verde'}" id="testar">${r ? 'Testar de novo' : 'Testar agora'}</button>${r?.passou ? '<button class="btn btn-verde" id="seguir">Continuar</button>' : ''}`);
  $('testar').onclick = e => ocupado(e.target, async () => {
    try { W.teste = await api(`/api/admin/integracoes/${W.id}/testar`, { metodo: 'POST', corpo: {} }); W.aprovacao = W.teste.aprovacao?.id || null; W.conector = await api(`/api/admin/integracoes/${W.id}`); passoTeste(); } catch (err) { toast(err.message); }
  });
  if ($('seguir')) $('seguir').onclick = () => irPara(`#/integracoes/c/${W.id}/passo/7`);
}

async function passoAprovacao() {
  const d = await api('/api/admin/integracoes/aprovacoes');
  const a = d.pendentes.find(x => x.tipo === 'publicacao' && x.connector_id === W.id);
  if (!a) {
    const c = W.conector;
    moldura(7, `<h2>Aprovação</h2><p>${c.status === 'APPROVED' || c.status === 'ACTIVE' ? '✓ Esta versão já foi aprovada.' : 'Não há pedido de aprovação: rode o teste primeiro.'}</p>`,
      c.status === 'APPROVED' ? '<button class="btn btn-verde" id="seguir">Continuar</button>' : `<a class="btn" href="#/integracoes/c/${esc(W.id)}/passo/6">Ir para o teste</a>`);
    if ($('seguir')) $('seguir').onclick = () => irPara(`#/integracoes/c/${W.id}/passo/8`);
    return;
  }
  moldura(7, telaAprovacao(a), botoesAprovacao());
  ligarAprovacao(a, () => irPara(`#/integracoes/c/${W.id}/passo/8`));
}

function passoPublicar() {
  const c = W.conector;
  moldura(8, `<h2>Publicar</h2><p>Status: ${seloStatus(c.status)} · versão ${c.versao}</p>
    <p class="dica">Ao publicar, as ações aprovadas ficam disponíveis para os Quick Wins da empresa. Só a versão testada e aprovada é publicada; mudar a integração depois exige novo teste e nova aprovação.</p>`,
  c.status === 'ACTIVE' ? `<a class="btn btn-verde" href="#/integracoes/c/${esc(c.id)}">Ver integração</a>` : `<button class="btn btn-verde" id="publicar" ${c.status === 'APPROVED' ? '' : 'disabled'}>Publicar</button>`);
  if ($('publicar')) $('publicar').onclick = e => ocupado(e.target, async () => {
    try { await api(`/api/admin/integracoes/${c.id}/publicar`, { metodo: 'POST' }); toast('Integração publicada.'); W = null; irPara(`#/integracoes/c/${c.id}`); } catch (err) { toast(err.message); }
  });
}

// ---- Aprovação (linguagem simples) ---------------------------------------------------------------------------
function telaAprovacao(a) {
  const r = a.resumo || {};
  if (a.tipo === 'execucao') return `<h2>Executar uma ação em ${esc(r.sistema)}?</h2>
    <p>${esc(r.acao)} ${seloRisco(a.risco)}</p><p class="dica">Efeitos: ${efeitosLegiveis(r.efeitos)}.</p>
    <p class="dica">A autorização vale para esta ação e estes dados. Aprovar não realiza a gravação: ela será retomada no trabalho de quem pediu.</p>
    <h3>Dados que serão enviados</h3>${Object.entries(r.dados || {}).map(([k, v]) => `<div class="linha-op"><b>${esc(({ userId: 'Identificador do usuário', customerId: 'Identificador do cliente', title: 'Título', body: 'Conteúdo', email: 'Email', amount: 'Valor' })[k] || k.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' '))}</b><span>${esc(v && typeof v === 'object' ? JSON.stringify(v, null, 2) : v)}</span></div>`).join('') || '<p class="dica">Nenhum.</p>'}`;
  return `<h2>Revisar a integração com ${esc(r.sistema)}</h2>
    <p>${seloRisco(r.risco)} versão ${Number(r.versao) || ''} · ${esc(AUTH.find(([v]) => v === r.autenticacao)?.[1] || r.autenticacao || '')}</p>
    <h3>Esta integração poderá</h3><ul>${(r.podera || []).map(p => `<li>${esc(p.frase)} ${seloRisco(p.risco)}<br><small class="dica">${esc(p.endpoint)}${p.le?.length ? ` · lê: ${p.le.slice(0, 8).map(esc).join(', ')}` : ''}${p.escreve?.length ? ` · grava: ${p.escreve.slice(0, 8).map(esc).join(', ')}` : ''}</small></li>`).join('')}</ul>
    <h3>Esta integração não poderá</h3><ul>${(r.nao_podera || []).length ? r.nao_podera.map(x => `<li>${esc(x)}</li>`).join('') : '<li>fazer nada além das ações acima</li>'}<li>acessar endereços fora de: ${(r.hosts || []).map(esc).join(', ')}</li></ul>
    <h3>Efeitos</h3><p>${efeitosLegiveis(r.efeitos)}.</p>
    ${(r.escopos || []).length ? `<p class="dica">Permissões pedidas ao sistema: ${r.escopos.map(esc).join(', ')}</p>` : ''}
    <h3>Exemplos</h3><ul>${(r.exemplos || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;
}
const botoesAprovacao = () => (pode('integrations.approve') ? '<button class="btn" id="negar">Negar</button><button class="btn btn-verde" id="aprovar">Aprovar</button>' : '<p class="dica">Quem tem permissão de aprovar integrações precisa revisar este pedido.</p>');
function ligarAprovacao(a, depois) {
  const decidir = aprovar => e => ocupado(e.target, async () => {
    try { await api(`/api/admin/integracoes/aprovacoes/${a.id}/decidir`, { metodo: 'POST', corpo: { aprovar } }); toast(aprovar ? 'Aprovado.' : 'Negado.'); depois(aprovar); } catch (err) { toast(err.message); }
  });
  if ($('aprovar')) $('aprovar').onclick = decidir(true);
  if ($('negar')) $('negar').onclick = decidir(false);
}
async function vistaAprovacao(id) {
  const destino = new URLSearchParams(location.hash.split('?')[1] || '').get('voltar');
  const voltar = /^#\/c\/\d+$/.test(destino || '') ? destino : '#/integracoes';
  const d = await api('/api/admin/integracoes/aprovacoes');
  const a = d.pendentes.find(x => x.id === id);
  if (!a) { toast('Esta aprovação já foi decidida.'); return irPara(voltar); }
  pagina('Aprovação', `${ESTILO}${telaAprovacao(a)}<div class="linha-botoes" style="margin-top:18px"><a class="btn-texto" href="${esc(voltar)}">${voltar === '#/integracoes' ? 'Voltar' : 'Voltar ao trabalho'}</a>${botoesAprovacao()}</div>`);
  ligarAprovacao(a, () => irPara(voltar));
}

// ---- Detalhe -------------------------------------------------------------------------------------------------
async function vistaConector(id) {
  const c = await api(`/api/admin/integracoes/${encodeURIComponent(id)}`);
  const acoes = [];
  if (pode('integrations.manage') && c.status !== 'REVOKED') {
    acoes.push(`<a class="btn" href="#/integracoes/c/${esc(c.id)}/passo/3">Credencial</a>`, `<a class="btn" href="#/integracoes/c/${esc(c.id)}/passo/4">Ações</a>`, `<a class="btn" href="#/integracoes/c/${esc(c.id)}/passo/6">Testar</a>`);
    if (c.status === 'APPROVED') acoes.push(`<a class="btn btn-verde" href="#/integracoes/c/${esc(c.id)}/passo/8">Publicar</a>`);
    if (c.status === 'ACTIVE') acoes.push('<button class="btn" data-acao="pausar">Pausar</button>');
    if (c.status === 'PAUSED') acoes.push('<button class="btn" data-acao="retomar">Retomar</button>');
    acoes.push('<button class="btn" data-acao="revogar">Revogar</button>');
  }
  const mt = c.metricas || {};
  let impacto;try {impacto=await api(`/api/acompanhamento/integracoes/${c.id}`);}catch(e){impacto={erro:e.message};}
  pagina(c.nome, `${ESTILO}<p>${seloStatus(c.status)} ${esc(c.sistema)} · versão ${c.versao}${c.aprovado_versao ? ` (aprovada: ${c.aprovado_versao})` : ''} · ${esc(AUTH.find(([v]) => v === c.auth_type)?.[1] || c.auth_type)}${c.credencial ? ` · credencial ${esc(c.credencial.mascara || 'cadastrada')}` : ''}</p>
    <p class="dica">Endereços autorizados: ${c.hosts.map(esc).join(', ') || '—'}</p>
    <div class="linha-botoes">${acoes.join('')}</div>
    <details class="qw-acompanhamento"><summary>Quick Wins que dependem desta integração</summary><p class="dica">Vínculos refletem a configuração publicada, ou o rascunho se ainda não publicado. Uso anterior vem dos registros de execução. Só aparecem tarefas que você gerencia.</p>${impacto.erro?`<p>${esc(impacto.erro)}</p>`:impacto.quickWins.length?impacto.quickWins.map(q=>`<p><a href="#/qw/${q.id}">${esc(q.nome)}</a> · ${q.vinculado?'configuração vinculada':'uso anterior registrado'}</p>`).join(''):'<p>Nenhum vínculo ou uso anterior registrado.</p>'}</details><h2>Ações disponíveis</h2>${c.capabilities.length ? c.capabilities.map(x => `<div class="linha-op"><span>${selo(x.status === 'ativa' ? '✓ ativa' : x.status, x.status === 'ativa' ? 'ok' : '')}</span><span>${esc(x.frase || x.nome)} ${seloRisco(x.risco)}<small>${esc(CLASSE[x.classe] || x.classe)}</small></span></div>`).join('') : '<p class="dica">Nenhuma ação escolhida.</p>'}
    <h2>Uso</h2><p class="dica">${Number(mt.execucoes || 0)} execuções · ${mt.taxa_sucesso ?? '—'}% de sucesso · ${Number(mt.falhas || 0)} falhas · ${Number(mt.repeticoes || 0)} repetições · ${Number(mt.bloqueios || 0)} bloqueadas · tempo médio ${mt.latencia_media_ms ?? '—'} ms</p>
    ${(c.execucoes || []).length ? `<div class="lista-int">${c.execucoes.slice(0, 15).map(x => `<div class="linha-op"><span>${selo(ESTADO_EXECUCAO[x.status] || x.status, ['SUCCESS', 'SIMULATED'].includes(x.status) ? 'ok' : ['FAILED', 'BLOCKED'].includes(x.status) ? 'erro' : 'atencao')}</span><span>${esc(c.capabilities.find(k => k.id === x.capability_id)?.nome || x.operation_id || '')}<small>${esc(x.modo || '')} · ${esc(new Date(x.criado_em).toLocaleString('pt-BR'))}${x.erro_codigo ? ` · ${esc(x.erro_codigo)}` : ''}</small></span></div>`).join('')}</div>` : ''}
    <h2>Versões</h2>${(c.versoes || []).map(v => `<div class="linha-op"><b>v${v.versao}</b><span>${esc(v.motivo || '')}<small>${esc(new Date(v.criado_em).toLocaleString('pt-BR'))}</small></span></div>`).join('')}`,
  '<a class="btn-texto" href="#/integracoes" style="margin-left:auto">Todas as integrações</a>');
  for (const b of document.querySelectorAll('[data-acao]')) b.onclick = e => ocupado(e.target, async () => {
    const a = b.dataset.acao;
    if (a === 'revogar' && !confirm('Revogar apaga a credencial e desliga todas as ações desta integração. Continuar?')) return;
    try { await api(`/api/admin/integracoes/${c.id}/${a}`, { metodo: 'POST' }); vistaConector(c.id); } catch (err) { toast(err.message); }
  });
}
