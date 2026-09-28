// APIs do console do operador da plataforma (/api/plataforma/*). Só admins da plataforma; toda ação relevante é auditada.
import { erro } from '../http.js';
import { exec, todos, um } from '../db.js';
import { lerAjuste, salvarAjuste } from './db.js';
import { ehAdminPlataforma, permissoesNaPlataforma, exigir, rolesDaEmpresa, PERMISSOES } from './rbac.js';
import * as E from './empresas.js';
import { auditar, listarAuditoria } from './auditoria.js';
import { normEmail, emailValido, enviarCodigo, conferirCodigo, abrirSessao, fecharSessao, lerSessaoBruta, checarCsrf, definirContexto } from './sessao.js';
import { publicaEmpresa, salvarChaveOpenRouter, removerChaveOpenRouter, origemChaveOpenRouter } from './servidor.js';
import { validarEmail, validarDominio, texto } from './validar.js';
import { verificarDominio, orientacaoDns } from './dominio.js';
import { contaOpenRouter, resumoConsumo, detalheConsumo, limiarSaldo, conferirSaldo } from './consumo.js';
import { alertaEmail, falhasEmail } from './email-falhas.js';
import { aplicarHomologacoesPlataforma } from '../modelos.js';
import { situacaoChave, validarRotacao, salvarRotacao, informarVencimento, conferirChave } from './chave-validade.js';


export function rotasPlataforma(P, r) {
  const perms = s => permissoesNaPlataforma(P.db, s.userId);
  const precisa = (s, chave) => exigir(perms(s), chave);

  // ------------------------------------------------ Login do console
  r.post('/api/plataforma/login/codigo', async ({ corpo }) => {
    const email = normEmail(corpo.email);
    if (!emailValido(email)) throw erro(400, 'email_invalido', 'Informe um email válido.');
    const u = E.acharUsuario(P, email);
    // Resposta igual para quem não é admin: não revela quem tem acesso ao console.
    if (!u || u.status !== 'ativo' || !ehAdminPlataforma(P.db, u.id)) throw erro(403, 'sem_acesso', 'Este email não tem acesso ao console da plataforma.');
    try { await enviarCodigo(P, email, 'plataforma', P.email, 'Seu código de acesso ao console da GreenIA'); }
    catch (x) {
      const e = x.causa || x;
      if (e.status) throw e;
      // Falha do servidor de email: mostra o motivo (sem endereço nem senha) para quem configura.
      const motivo = String(e.message || e).replace(/\S+:\/\/\S+/g, '[endereço]').slice(0, 240);
      P.log(`email do console falhou: ${motivo}`);
      throw erro(502, 'email_falhou', `O servidor de email recusou o envio: ${motivo}`);
    }
    // Sem SMTP em produção o código só vai para o log do servidor: avisa em vez de fingir que enviou.
    if (P.avisarSemEmail && !P.lerSmtp().url) throw erro(503, 'email_nao_configurado', 'O envio de email não está configurado no servidor. Configure SMTP_URL e SMTP_REMETENTE nas variáveis do servidor; até lá, o código aparece no log do servidor, na linha "[email simulado]".');
    return { ok: true };
  }, { publica: true });

  r.post('/api/plataforma/login/entrar', ({ corpo, res, origem }) => {
    const email = normEmail(corpo.email);
    conferirCodigo(P, email, 'plataforma', String(corpo.codigo || '').trim());
    const u = E.acharUsuario(P, email);
    if (!u || u.status !== 'ativo' || !ehAdminPlataforma(P.db, u.id)) throw erro(403, 'sem_acesso', 'Este email não tem acesso ao console da plataforma.');
    const csrf = abrirSessao(P, res, u.id, null);
    auditar(P, { usuario: u.id, acao: 'platform.login', entidade: 'user', id: u.id, origem });
    return { ok: true, csrf };
  }, { publica: true });

  r.post('/api/plataforma/sair', ({ req, res, cookies }) => {
    checarCsrf(lerSessaoBruta(P, cookies, null) || { csrf: '' }, req);
    fecharSessao(P, res, cookies, null);
    return { ok: true };
  }, { publica: true });

  r.get('/api/plataforma/eu', ({ sessao }) => ({
    usuario: { id: sessao.userId, email: sessao.email, name: sessao.name }, csrf: sessao.csrf, permissoes: [...perms(sessao)],
    // Aviso de vencimento ou rotação da chave do OpenRouter, para o topo do console (sem chamar o OpenRouter).
    alertaChave: perms(sessao).has('platform.settings.manage') || perms(sessao).has('platform.companies.manage') ? alertaDaChave() : null,
    // Envio de email falhando (códigos de acesso não chegam): motivo real, sem segredos.
    alertaEmail: perms(sessao).has('platform.settings.manage') ? alertaEmail(P) : null,
    catalogo: { permissoes: Object.entries(PERMISSOES).map(([k, [d, s]]) => ({ key: k, description: d, scope: s })), recursos: E.RECURSOS, limites: E.LIMITES, concessoes: E.CONCESSOES, status: E.STATUS_EMPRESA, camposMarca: E.CAMPOS_MARCA },
  }));

  // ------------------------------------------------ Empresas
  const resumoEmpresa = c => {
    const plano = E.lerPlanoPorId(P, c.plan_id);
    let uso = null;
    try { uso = E.usoDaEmpresa(P, c.id); } catch { /* ambiente ainda abrindo */ }
    return { ...publicaEmpresa(P, c.id), plano: plano ? { id: plano.id, name: plano.name, credits: plano.credits } : null,
      usuarios: um(P.db, "select count(*) as n from company_users where company_id = ? and status != 'inativo'", c.id).n,
      admins: todos(P.db, "select u.email from company_users cu join users u on u.id = cu.user_id join role_permissions rp on rp.role_id = cu.role_id and rp.permission_key = 'company.manage' where cu.company_id = ? and cu.status != 'inativo'", c.id).map(x => x.email),
      creditosUsados: uso?.plano?.usados ?? null, percentual: uso?.plano?.percentual ?? null, custoUsd: uso?.custoUsd ?? null, created_at: c.created_at, updated_at: c.updated_at };
  };

  r.get('/api/plataforma/empresas', ({ sessao, query }) => {
    precisa(sessao, 'platform.companies.manage');
    const q = String(query.busca || '').toLowerCase();
    return { empresas: todos(P.db, 'select * from companies order by name').filter(c => !q || c.name.toLowerCase().includes(q) || c.slug.includes(q)).map(resumoEmpresa) };
  });

  r.post('/api/plataforma/empresas', ({ sessao, corpo, origem }) => {
    precisa(sessao, 'platform.companies.manage');
    const c = E.criarEmpresa(P, corpo, sessao.userId, origem);
    if (corpo.admin_email) E.criarMembro(P, c.id, { email: corpo.admin_email, name: corpo.admin_name, role_key: 'company_admin' }, sessao.userId, origem, { convidar: corpo.convidar !== false });
    return resumoEmpresa(E.lerEmpresa(P, c.id));
  }, { limiteMb: 3 });

  r.get('/api/plataforma/empresas/:id', ({ sessao, params }) => {
    precisa(sessao, 'platform.companies.manage');
    const c = E.exigirEmpresa(P, params.id);
    return {
      empresa: { ...c, ...resumoEmpresa(c), banco: undefined }, marca: E.lerMarca(P, c.id), landing: E.lerLanding(P, c.id),
      concessoes: E.concessoes(P, c.id), podeEditar: E.podeEditar(P, c.id), ambiente: E.ambienteDaEmpresa(P, c), uso: E.usoDaEmpresa(P, c.id),
      usuarios: E.listarMembros(P, c.id), roles: rolesDaEmpresa(P.db, c.id), dns: orientacaoDns(P),
    };
  });

  r.put('/api/plataforma/empresas/:id', ({ sessao, params, corpo, origem }) => { precisa(sessao, 'platform.companies.manage'); return resumoEmpresa(E.atualizarEmpresa(P, params.id, corpo, sessao.userId, origem)); });
  r.post('/api/plataforma/empresas/:id/status', ({ sessao, params, corpo, origem }) => { precisa(sessao, 'platform.companies.manage'); return resumoEmpresa(E.mudarStatus(P, params.id, corpo.status, sessao.userId, origem)); });
  r.post('/api/plataforma/empresas/:id/plano', ({ sessao, params, corpo, origem }) => { precisa(sessao, 'platform.plans.manage'); return resumoEmpresa(E.mudarPlano(P, params.id, corpo.plan_id || null, sessao.userId, origem)); });
  r.put('/api/plataforma/empresas/:id/url', ({ sessao, params, corpo, origem }) => { precisa(sessao, 'platform.companies.manage'); return resumoEmpresa(E.mudarUrl(P, params.id, corpo, sessao.userId, origem)); });
  r.put('/api/plataforma/empresas/:id/marca', ({ sessao, params, corpo, origem }) => { precisa(sessao, 'platform.companies.manage'); return E.salvarMarca(P, params.id, corpo, sessao.userId, origem); }, { limiteMb: 2 });
  r.put('/api/plataforma/empresas/:id/landing', ({ sessao, params, corpo, origem }) => { precisa(sessao, 'platform.companies.manage'); return E.salvarLanding(P, params.id, corpo, sessao.userId, origem); }, { limiteMb: 3 });
  r.put('/api/plataforma/empresas/:id/concessoes', ({ sessao, params, corpo, origem }) => { precisa(sessao, 'platform.companies.manage'); return E.salvarConcessoes(P, params.id, corpo, sessao.userId, origem); });

  r.post('/api/plataforma/empresas/:id/usuarios', ({ sessao, params, corpo, origem }) => { precisa(sessao, 'platform.users.manage'); return E.criarMembro(P, params.id, corpo, sessao.userId, origem, { convidar: corpo.convidar !== false }); });
  r.put('/api/plataforma/empresas/:id/usuarios/:uid', ({ sessao, params, corpo, origem }) => { precisa(sessao, 'platform.users.manage'); return E.atualizarMembro(P, params.id, params.uid, corpo, sessao.userId, origem); });
  r.del('/api/plataforma/empresas/:id/usuarios/:uid', ({ sessao, params, origem }) => { precisa(sessao, 'platform.users.manage'); return E.removerMembro(P, params.id, params.uid, sessao.userId, origem); });

  r.post('/api/plataforma/empresas/:id/pacotes', ({ sessao, params, corpo, origem }) => {
    precisa(sessao, 'platform.plans.manage');
    return { plano: E.liberarPacoteNaEmpresa(P, params.id, corpo, sessao.userId, origem, sessao.email) };
  });

  r.post('/api/plataforma/empresas/:id/dominio/verificar', async ({ sessao, params, origem }) => { precisa(sessao, 'platform.companies.manage'); E.exigirEmpresa(P, params.id); return verificarDominio(P, params.id, { ator: sessao.userId, origem }); });

  // Exportação: cópia íntegra do banco da empresa, para entregar ao cliente ou guardar.
  r.get('/api/plataforma/empresas/:id/exportar', ({ sessao, params, res, origem }) => {
    precisa(sessao, 'platform.companies.manage');
    const { nome, dados } = E.exportarEmpresa(P, params.id);
    auditar(P, { usuario: sessao.userId, empresa: params.id, acao: 'company.exported', entidade: 'company', id: params.id, depois: { arquivo: nome, bytes: dados.length }, origem });
    res.writeHead(200, { 'content-type': 'application/gzip', 'content-disposition': `attachment; filename="${nome}"`, 'content-length': dados.length, 'cache-control': 'no-store' });
    res.end(dados);
  });

  r.post('/api/plataforma/empresas/:id/excluir', ({ sessao, params, corpo, origem }) => { precisa(sessao, 'platform.companies.manage'); return E.excluirEmpresa(P, params.id, corpo.confirmacao, sessao.userId, origem); });

  // Entrar no ambiente da empresa como admin da plataforma: abre uma sessão da empresa e registra na auditoria.
  r.post('/api/plataforma/empresas/:id/entrar', ({ sessao, params, res, origem }) => {
    precisa(sessao, 'platform.companies.manage');
    const c = E.exigirEmpresa(P, params.id);
    P.sincronizarPessoa(c.id, sessao.userId);
    abrirSessao(P, res, sessao.userId, c.id, 'plataforma');
    definirContexto(P, res, c.id);
    auditar(P, { usuario: sessao.userId, empresa: c.id, acao: 'company.accessed', entidade: 'company', id: c.id, origem });
    return { ok: true, url: '/app#/visao-geral' };
  });

  // ------------------------------------------------ Planos
  r.get('/api/plataforma/planos', ({ sessao }) => { precisa(sessao, 'platform.companies.manage'); return { planos: E.listarPlanos(P) }; });
  r.post('/api/plataforma/planos', ({ sessao, corpo, origem }) => { precisa(sessao, 'platform.plans.manage'); return E.salvarPlano(P, corpo, sessao.userId, origem); });
  r.put('/api/plataforma/planos/:id', ({ sessao, params, corpo, origem }) => { precisa(sessao, 'platform.plans.manage'); return E.salvarPlano(P, corpo, sessao.userId, origem, params.id); });

  // ------------------------------------------------ Usuários (todas as empresas) e admins da plataforma
  r.get('/api/plataforma/usuarios', ({ sessao, query }) => {
    precisa(sessao, 'platform.users.manage');
    const q = String(query.busca || '').toLowerCase();
    const usuarios = todos(P.db, 'select id, email, name, status, created_at from users order by email').filter(u => !q || u.email.includes(q) || u.name.toLowerCase().includes(q)).slice(0, 300)
      .map(u => ({ ...u, adminPlataforma: ehAdminPlataforma(P.db, u.id) || !!um(P.db, 'select 1 from platform_members where user_id = ?', u.id),
        empresas: todos(P.db, 'select c.id, c.name, c.slug, r.name as role, cu.status from company_users cu join companies c on c.id = cu.company_id join roles r on r.id = cu.role_id where cu.user_id = ? order by c.name', u.id) }));
    return { usuarios };
  });

  r.put('/api/plataforma/usuarios/:id', ({ sessao, params, corpo, origem }) => {
    precisa(sessao, 'platform.users.manage');
    const u = um(P.db, 'select * from users where id = ?', params.id);
    if (!u) throw erro(404, 'usuario', 'Usuário não encontrado.');
    if (params.id === sessao.userId && corpo.status === 'bloqueado') throw erro(409, 'proprio', 'Você não pode bloquear o próprio acesso.');
    const status = corpo.status === 'bloqueado' ? 'bloqueado' : corpo.status === 'ativo' ? 'ativo' : u.status;
    const name = corpo.name !== undefined ? texto(corpo.name, 120, 'name', { obrigatorio: true }) : u.name;
    exec(P.db, 'update users set status = ?, name = ? where id = ?', status, name, u.id);
    if (status === 'bloqueado') exec(P.db, 'delete from sessions where user_id = ?', u.id);
    for (const c of todos(P.db, 'select company_id from company_users where user_id = ?', u.id)) P.sincronizarPessoa(c.company_id, u.id);
    auditar(P, { usuario: sessao.userId, acao: status !== u.status ? (status === 'bloqueado' ? 'user.blocked' : 'user.unblocked') : 'user.updated', entidade: 'user', id: u.id, antes: { status: u.status, name: u.name }, depois: { status, name }, origem });
    P.aoMudarAdmins();
    return { ok: true };
  });

  r.post('/api/plataforma/admins', ({ sessao, corpo, origem }) => {
    precisa(sessao, 'platform.users.manage');
    const u = E.garantirUsuario(P, validarEmail(corpo.email), texto(corpo.name, 120, 'name'));
    exec(P.db, "insert into platform_members (user_id, role) values (?, 'platform_admin') on conflict (user_id) do nothing", u.id);
    auditar(P, { usuario: sessao.userId, acao: 'platform.admin_added', entidade: 'user', id: u.id, depois: { email: u.email }, origem });
    P.aoMudarAdmins();
    return { ok: true };
  });

  r.del('/api/plataforma/admins/:id', ({ sessao, params, origem }) => {
    precisa(sessao, 'platform.users.manage');
    if (params.id === sessao.userId) throw erro(409, 'proprio', 'Você não pode tirar o próprio acesso ao console.');
    if (um(P.db, 'select count(*) as n from platform_members').n <= 1) throw erro(409, 'ultimo_admin', 'A plataforma precisa de pelo menos um administrador.');
    exec(P.db, 'delete from platform_members where user_id = ?', params.id);
    exec(P.db, 'delete from sessions where user_id = ? and company_id is null', params.id);
    auditar(P, { usuario: sessao.userId, acao: 'platform.admin_removed', entidade: 'user', id: params.id, origem });
    P.aoMudarAdmins();
    return { ok: true };
  });

  // ------------------------------------------------ Ambientes, uso e auditoria
  r.get('/api/plataforma/ambientes', ({ sessao }) => {
    precisa(sessao, 'platform.companies.manage');
    return { ambientes: todos(P.db, 'select * from companies order by name').map(c => ({ ...publicaEmpresa(P, c.id), ...E.ambienteDaEmpresa(P, c), ultimoUso: E.usoDaEmpresa(P, c.id).ultimoUso })) };
  });

  r.get('/api/plataforma/uso', ({ sessao }) => {
    precisa(sessao, 'platform.companies.manage');
    const linhas = todos(P.db, 'select * from companies order by name').map(c => {
      const u = E.usoDaEmpresa(P, c.id), plano = E.lerPlanoPorId(P, c.plan_id);
      const receita = plano?.price_usd ?? null, custo = u.custoUsd * 1.055;
      return { ...publicaEmpresa(P, c.id), plano: plano?.name || null, creditos: plano?.credits || 0, usados: u.plano?.usados ?? null, percentual: u.plano?.percentual ?? null, fase: u.plano?.fase || null,
        pessoasAtivas: u.pessoasAtivas, conversas: u.conversas, custoUsd: u.custoUsd, receitaUsd: receita, margemUsd: receita !== null ? receita - custo : null };
    });
    return { mes: P.agora().toISOString().slice(0, 7), empresas: linhas };
  });

  // Consumo de IA: conta no OpenRouter, total da plataforma por dia e cada empresa.
  r.get('/api/plataforma/consumo', async ({ sessao, query }) => {
    precisa(sessao, 'platform.companies.manage');
    const [conta, resumo] = [await contaOpenRouter(P, { forcar: !!query.forcar }), resumoConsumo(P)];
    const saldo = conta.saldo ?? conta.chave?.restante ?? null;
    const chaveConfig = origemChaveOpenRouter(P);
    return { conta, chaveConfig, validadeChave: situacaoChave(P, chaveConfig), ...resumo, alerta: { limiarUsd: limiarSaldo(P), abaixo: saldo !== null && saldo < limiarSaldo(P), diasRestantes: saldo !== null && resumo.media7 > 0 ? Math.floor(saldo / resumo.media7) : null } };
  });
  r.get('/api/plataforma/empresas/:id/consumo', ({ sessao, params }) => {
    precisa(sessao, 'platform.companies.manage');
    const d = detalheConsumo(P, params.id);
    if (!d) throw erro(404, 'empresa', 'Empresa não encontrada.');
    return d;
  });
  // Aviso do topo do console: só com o estado persistido (recusa, validação, vencimento), sem chamar o
  // OpenRouter e sem depender de cache: continua valendo depois de reiniciar.
  function alertaDaChave() {
    const cfg = origemChaveOpenRouter(P);
    if (!cfg.id) return null;
    const v = situacaoChave(P, cfg);
    return ['atencao', 'critico', 'erro'].includes(v.nivel) ? { nivel: v.nivel, codigo: v.codigo, rotulo: v.rotulo, texto: v.texto } : null;
  }
  // Dados sigilosos: a operadora define o mínimo para todas as empresas. Autoriza modelos (valem sem configuração
  // da empresa) e veta modelos (nenhuma empresa consegue homologá-los). A empresa só acrescenta dentro disso.
  const lerHom = () => lerAjuste(P.db, 'homologacoes_plataforma', []) || [];
  const lerVetos = () => lerAjuste(P.db, 'vetos_sigilo_plataforma', []) || [];
  const reaplicar = () => {
    for (const [cid, t] of P.tenants) { try { aplicarHomologacoesPlataforma(t.db, lerHom(), P.agora(), lerVetos()); } catch (e) { P.log('sigilo da plataforma', cid, e.message); } }
  };
  const idValido = id => { if (!/^[a-z0-9._~-]+\/[a-z0-9._:-]+$/.test(id)) throw erro(400, 'id', 'Informe o id do modelo no OpenRouter (fornecedor/modelo).'); return id; };
  r.get('/api/plataforma/homologacoes', ({ sessao }) => { precisa(sessao, 'platform.settings.manage'); return { homologacoes: lerHom(), vetos: lerVetos() }; });
  r.post('/api/plataforma/homologacoes', ({ sessao, corpo, origem }) => {
    precisa(sessao, 'platform.settings.manage');
    const id = idValido(String(corpo.id || '').trim()), perfil = String(corpo.perfil || 'rapido'), fornecedor = String(corpo.fornecedor || '').trim(), justificativa = String(corpo.justificativa || '').trim();
    if (/:free$/.test(id) || id === 'openrouter/free' || id === 'openrouter/auto') throw erro(400, 'nao_homologavel', 'Modelos gratuitos e o Automático do OpenRouter não podem ser autorizados para dados sigilosos.');
    if (lerVetos().some(v => v.id === id)) throw erro(409, 'vetado', 'Este modelo está vetado para dados sigilosos. Retire o veto antes de autorizar.');
    if (!['rapido', 'equilibrado', 'avancado'].includes(perfil)) throw erro(400, 'perfil', 'Classe inválida.');
    if (!fornecedor) throw erro(400, 'fornecedor', 'Informe o fornecedor fixado no OpenRouter.');
    if (corpo.semTreino !== true || corpo.retencaoZero !== true) throw erro(400, 'garantias', 'Confirme que o fornecedor não treina com os dados e não guarda nada (retenção zero).');
    if (justificativa.length < 10) throw erro(400, 'justificativa', 'Escreva a justificativa da autorização.');
    const item = { id, nome: String(corpo.nome || '').trim().slice(0, 120) || id, perfil, fornecedor, endpoint: String(corpo.endpoint || fornecedor).trim(), retencaoZero: true, semTreino: true, justificativa: justificativa.slice(0, 500), em: P.agora().toISOString(), por: sessao.email };
    salvarAjuste(P.db, 'homologacoes_plataforma', [...lerHom().filter(h => h.id !== id), item]);
    reaplicar();
    auditar(P, { usuario: sessao.userId, acao: 'platform.model_certified', entidade: 'platform_settings', depois: { modelo: id, perfil, fornecedor }, origem });
    return { homologacoes: lerHom(), vetos: lerVetos() };
  });
  r.del('/api/plataforma/homologacoes/:id', ({ sessao, params, origem }) => {
    precisa(sessao, 'platform.settings.manage');
    const id = decodeURIComponent(params.id);
    salvarAjuste(P.db, 'homologacoes_plataforma', lerHom().filter(h => h.id !== id));
    reaplicar();
    auditar(P, { usuario: sessao.userId, acao: 'platform.model_uncertified', entidade: 'platform_settings', antes: { modelo: id }, origem });
    return { homologacoes: lerHom(), vetos: lerVetos() };
  });
  r.post('/api/plataforma/vetos-sigilo', ({ sessao, corpo, origem }) => {
    precisa(sessao, 'platform.settings.manage');
    const id = idValido(String(corpo.id || '').trim()), motivo = String(corpo.motivo || '').trim();
    if (motivo.length < 10) throw erro(400, 'motivo', 'Escreva o motivo do veto.');
    if (lerHom().some(h => h.id === id)) throw erro(409, 'autorizado', 'Este modelo está autorizado pela plataforma. Retire a autorização antes de vetar.');
    salvarAjuste(P.db, 'vetos_sigilo_plataforma', [...lerVetos().filter(v => v.id !== id), { id, motivo: motivo.slice(0, 500), em: P.agora().toISOString(), por: sessao.email }]);
    reaplicar();
    auditar(P, { usuario: sessao.userId, acao: 'platform.model_vetoed', entidade: 'platform_settings', depois: { modelo: id }, origem });
    return { homologacoes: lerHom(), vetos: lerVetos() };
  });
  r.del('/api/plataforma/vetos-sigilo/:id', ({ sessao, params, origem }) => {
    precisa(sessao, 'platform.settings.manage');
    const id = decodeURIComponent(params.id);
    salvarAjuste(P.db, 'vetos_sigilo_plataforma', lerVetos().filter(v => v.id !== id));
    reaplicar();
    auditar(P, { usuario: sessao.userId, acao: 'platform.model_unvetoed', entidade: 'platform_settings', antes: { modelo: id }, origem });
    return { homologacoes: lerHom(), vetos: lerVetos() };
  });
  // Troca preventiva (política da plataforma) e vencimento real informado por outra fonte. O vencimento
  // informado vale só para a chave em uso; se o OpenRouter informar o dele, o do OpenRouter prevalece.
  r.put('/api/plataforma/openrouter/chave/validade', async ({ sessao, corpo, origem }) => {
    precisa(sessao, 'platform.settings.manage');
    const cfg = origemChaveOpenRouter(P);
    if (!cfg.id) throw erro(409, 'sem_chave', 'Informe a chave antes de configurar o vencimento.');
    const campos = {};
    if (corpo.expiraEm !== undefined) {
      if (corpo.expiraEm !== null && corpo.expiraEm !== '' && (typeof corpo.expiraEm !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(corpo.expiraEm) || Number.isNaN(Date.parse(corpo.expiraEm))))
        throw erro(400, 'expira_em', 'Informe a data de vencimento no formato AAAA-MM-DD.');
      campos.expiraEm = corpo.expiraEm || null;
    }
    if (corpo.rotacaoDias !== undefined) {
      const n = validarRotacao(corpo.rotacaoDias);
      if (n === null) throw erro(400, 'rotacao', 'A troca preventiva deve ser um número inteiro de dias, entre 7 e 730.');
      campos.rotacaoDias = n;
    }
    if (!Object.keys(campos).length) throw erro(400, 'vazio', 'Nada para alterar.');
    // Mudar o prazo não reinicia a contagem: vale a partir da data de início da chave.
    if (campos.rotacaoDias !== undefined) salvarRotacao(P, campos.rotacaoDias);
    if (campos.expiraEm !== undefined) informarVencimento(P, cfg, campos.expiraEm);
    auditar(P, { usuario: sessao.userId, acao: 'platform.openrouter_key_policy', entidade: 'platform_settings', depois: { chave: cfg.mascara, ...campos }, origem });
    await conferirChave(P, cfg).catch(e => P.log('aviso de chave', e.message));
    return { validadeChave: situacaoChave(P, cfg) };
  });
  // Chave do OpenRouter pelo console: testada no OpenRouter antes de salvar, guardada cifrada,
  // vale na hora para todas as empresas e nunca volta para a tela (só a máscara).
  r.put('/api/plataforma/openrouter/chave', async ({ sessao, corpo, origem }) => {
    precisa(sessao, 'platform.settings.manage');
    const chave = String(corpo.chave || '').trim();
    if (!/^sk-[A-Za-z0-9_-]{20,200}$/.test(chave)) throw erro(400, 'chave', 'Cole a chave completa do OpenRouter (começa com sk-or-).');
    const teste = await P.criarIA(chave).conta().catch(() => null);
    if (!teste?.chave || teste.chave.erro) {
      const st = teste?.chave?.erro;
      throw erro(400, 'chave_recusada', st === 401 || st === 403 ? 'O OpenRouter recusou esta chave: confira se ela foi copiada inteira e se não foi desativada.' : 'Não foi possível confirmar a chave no OpenRouter agora. Tente de novo em instantes.');
    }
    const nome = String(teste.chave.label || '').slice(0, 80);
    // Ordem: validar no OpenRouter (acima) → persistir → ler a conta de novo (estado e vencimento do
    // provedor da chave NOVA) → conferir avisos (estágios da chave nova começam do zero) → responder.
    salvarChaveOpenRouter(P, chave, { nome, por: sessao.email });
    auditar(P, { usuario: sessao.userId, acao: 'platform.openrouter_key_set', entidade: 'platform_settings', depois: { chave: origemChaveOpenRouter(P).mascara, nome }, origem });
    const conta = await contaOpenRouter(P, { forcar: true });
    const cfg = origemChaveOpenRouter(P);
    await conferirChave(P, cfg).catch(e => P.log('aviso de chave', e.message));
    P.aoTrocarIA?.();
    return { chaveConfig: cfg, conta, validadeChave: situacaoChave(P, cfg) };
  });
  r.del('/api/plataforma/openrouter/chave', async ({ sessao, origem }) => {
    precisa(sessao, 'platform.settings.manage');
    const antes = origemChaveOpenRouter(P);
    if (antes.origem !== 'console') throw erro(409, 'sem_chave', 'Não há chave salva no console para remover.');
    removerChaveOpenRouter(P);
    auditar(P, { usuario: sessao.userId, acao: 'platform.openrouter_key_removed', entidade: 'platform_settings', antes: { chave: antes.mascara }, origem });
    await contaOpenRouter(P, { forcar: true }).catch(() => null);
    const cfg = origemChaveOpenRouter(P);
    P.aoTrocarIA?.();
    return { chaveConfig: cfg, validadeChave: situacaoChave(P, cfg) };
  });

  r.put('/api/plataforma/consumo/alerta', async ({ sessao, corpo, origem }) => {
    precisa(sessao, 'platform.settings.manage');
    const v = Number(corpo.limiarUsd);
    if (!Number.isFinite(v) || v < 0 || v > 100000) throw erro(400, 'limiar', 'Informe um valor em dólares entre 0 e 100.000.');
    const antes = limiarSaldo(P);
    salvarAjuste(P.db, 'alerta_saldo_usd', Math.round(v * 100) / 100);
    auditar(P, { usuario: sessao.userId, acao: 'platform.balance_alert_changed', entidade: 'platform_settings', antes: { limiarUsd: antes }, depois: { limiarUsd: v }, origem });
    await conferirSaldo(P).catch(() => null);
    return { limiarUsd: limiarSaldo(P) };
  });

  r.get('/api/plataforma/auditoria', ({ sessao, query }) => {
    precisa(sessao, 'platform.audit.read');
    return listarAuditoria(P, { empresa: query.empresa || null, acao: query.acao || null, pagina: Math.max(0, Number(query.pagina) || 0) });
  });

  // ------------------------------------------------ Configurações gerais
  r.get('/api/plataforma/configuracoes', ({ sessao }) => {
    precisa(sessao, 'platform.settings.manage');
    const smtp = lerAjuste(P.db, 'smtp', { url: '', remetente: '' });
    return {
      nome: lerAjuste(P.db, 'nome', 'GreenIA'), subdominio_base: lerAjuste(P.db, 'subdominio_base', P.subdominioBase), host: P.hostPlataforma, url_base: P.urlBase,
      slugs_reservados: lerAjuste(P.db, 'slugs_reservados', []), plano_padrao: lerAjuste(P.db, 'plano_padrao', null),
      smtp: { configurado: !!(smtp.url || P.smtpPadrao?.url), remetente: smtp.remetente || P.smtpPadrao?.remetente || '', porVariavel: !smtp.url && !!P.smtpPadrao?.url, falhas: falhasEmail(P).slice(0, 10) }, admins: todos(P.db, 'select u.id, u.email, u.name from platform_members m join users u on u.id = m.user_id order by u.email'),
      leads: lerAjuste(P.db, 'leads', []).slice(0, 50),
    };
  });

  r.put('/api/plataforma/configuracoes', ({ sessao, corpo, origem }) => {
    precisa(sessao, 'platform.settings.manage');
    const antes = { nome: lerAjuste(P.db, 'nome', 'GreenIA'), subdominio_base: lerAjuste(P.db, 'subdominio_base', P.subdominioBase), slugs_reservados: lerAjuste(P.db, 'slugs_reservados', []), plano_padrao: lerAjuste(P.db, 'plano_padrao', null) };
    const depois = { ...antes };
    if (corpo.nome !== undefined) depois.nome = texto(corpo.nome, 60, 'nome', { obrigatorio: true });
    if (corpo.subdominio_base !== undefined) depois.subdominio_base = corpo.subdominio_base ? validarDominio(corpo.subdominio_base) : '';
    if (corpo.slugs_reservados !== undefined) depois.slugs_reservados = [...new Set(String(corpo.slugs_reservados).split(/[\s,;]+/).map(s => s.trim().toLowerCase()).filter(s => /^[a-z0-9-]{2,40}$/.test(s)))];
    if (corpo.plano_padrao !== undefined) { if (corpo.plano_padrao && !E.lerPlanoPorId(P, corpo.plano_padrao)) throw erro(400, 'plano_padrao', 'Plano inválido.'); depois.plano_padrao = corpo.plano_padrao || null; }
    for (const [k, v] of Object.entries(depois)) salvarAjuste(P.db, k, v);
    if (corpo.smtp && (corpo.smtp.url !== undefined || corpo.smtp.remetente !== undefined)) {
      const atual = lerAjuste(P.db, 'smtp', { url: '', remetente: '' });
      salvarAjuste(P.db, 'smtp', { url: corpo.smtp.url !== undefined ? String(corpo.smtp.url).trim() : atual.url, remetente: corpo.smtp.remetente !== undefined ? String(corpo.smtp.remetente).trim().slice(0, 200) : atual.remetente });
      depois.smtp = 'alterado';
    }
    auditar(P, { usuario: sessao.userId, acao: 'platform.settings_changed', entidade: 'platform_settings', antes, depois, origem });
    return { ok: true };
  });

  r.post('/api/plataforma/smtp/teste', async ({ sessao }) => {
    precisa(sessao, 'platform.settings.manage');
    try { await P.email.enviar(sessao.email, 'Teste de email da plataforma GreenIA', 'O envio de email da plataforma está funcionando.'); }
    catch (e) { throw erro(502, 'smtp', `O servidor de email recusou: ${String(e.message).slice(0, 200)}`); }
    return { ok: true, para: sessao.email };
  });

}
