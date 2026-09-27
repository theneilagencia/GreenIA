// Rotas públicas de cada empresa: marca e landing page (/api/publico) e login por código no ambiente da empresa.
import { erro } from '../http.js';
import { exec, um } from '../db.js';
import { lerConfig } from '../config.js';
import { dominioPermitido } from '../auth.js';
import { ehAdminPlataforma, roleDeSistema } from './rbac.js';
import * as E from './empresas.js';
import { auditar } from './auditoria.js';
import { normEmail, emailValido, enviarCodigo, conferirCodigo, abrirSessao, fecharSessao, lerSessaoBruta, checarCsrf } from './sessao.js';

// Quem pode entrar no ambiente da empresa: admin da plataforma, pessoa com vínculo (ativo ou convidado),
// ou alguém de um domínio permitido pela empresa (entra como membro, se o ambiente estiver ativo).
function acesso(P, c, email) {
  const u = E.acharUsuario(P, email);
  if (u && u.status !== 'ativo') return { ok: false, motivo: 'bloqueado' };
  if (u && ehAdminPlataforma(P.db, u.id)) return { ok: true, u, adminPlataforma: true };
  const v = u && um(P.db, 'select status, role_id from company_users where company_id = ? and user_id = ?', c.id, u.id);
  if (v?.status === 'inativo') return { ok: false, motivo: 'inativo' };
  if (c.status === 'suspensa' || c.status === 'cancelada') return { ok: false, motivo: 'indisponivel' };
  if (v) {
    // Em implantação, só quem administra a empresa entra (a role vale mesmo antes do primeiro acesso).
    if (c.status === 'em_implantacao' && !um(P.db, "select 1 from role_permissions where role_id = ? and permission_key = 'company.manage'", v.role_id)) return { ok: false, motivo: 'implantacao' };
    return { ok: true, u, vinculo: v };
  }
  if (c.status === 'ativa' && dominioPermitido(lerConfig(P.tenant(c.id).db), email)) return { ok: true, u, novo: true };
  return { ok: false, motivo: 'fora' };
}
const MENSAGENS = {
  fora: 'Este email não tem acesso a este ambiente. Peça um convite ao administrador da sua empresa.',
  inativo: 'Seu acesso está desativado. Fale com o administrador da sua empresa.',
  bloqueado: 'Seu acesso está bloqueado. Fale com o administrador.',
  indisponivel: 'O ambiente desta empresa está indisponível no momento.',
  implantacao: 'O ambiente desta empresa ainda está em implantação.',
};

export function rotasAuthEmpresa(P, r) {
  r.post('/api/login/codigo', async ({ corpo, companyId, empresa }) => {
    const email = normEmail(corpo.email);
    if (!emailValido(email)) throw erro(400, 'email_invalido', 'Informe um email válido.');
    const a = acesso(P, empresa, email);
    if (!a.ok) throw erro(403, 'dominio', MENSAGENS[a.motivo]);
    const nome = E.lerMarca(P, companyId)?.display_name || empresa.name;
    await enviarCodigo(P, email, companyId, P.emailDa(companyId), `Seu código de acesso à GreenIA da ${nome}`);
    return { ok: true };
  }, { publica: true });

  r.post('/api/login/entrar', ({ corpo, res, companyId, empresa, origem }) => {
    const email = normEmail(corpo.email);
    conferirCodigo(P, email, companyId, String(corpo.codigo || '').trim());
    const a = acesso(P, empresa, email);
    if (!a.ok) throw erro(403, 'dominio', MENSAGENS[a.motivo]);
    const u = a.u || E.garantirUsuario(P, email);
    if (a.novo) {
      exec(P.db, "insert into company_users (company_id, user_id, role_id, status, created_at, updated_at) values (?, ?, ?, 'ativo', ?, ?) on conflict do nothing", companyId, u.id, roleDeSistema(P.db, 'member').id, P.agora().toISOString(), P.agora().toISOString());
      auditar(P, { usuario: u.id, empresa: companyId, acao: 'user.joined_by_domain', entidade: 'company_user', id: u.id, depois: { email, role: 'member' }, origem });
    } else if (a.vinculo?.status === 'convidado') exec(P.db, "update company_users set status = 'ativo', updated_at = ? where company_id = ? and user_id = ?", P.agora().toISOString(), companyId, u.id);
    P.sincronizarPessoa(companyId, u.id);
    const csrf = abrirSessao(P, res, u.id, companyId);
    if (a.adminPlataforma) auditar(P, { usuario: u.id, empresa: companyId, acao: 'company.accessed', entidade: 'company', id: companyId, origem });
    return { ok: true, csrf };
  }, { publica: true });

  r.post('/api/sair', ({ req, res, cookies, companyId }) => {
    checarCsrf(lerSessaoBruta(P, cookies, companyId) || { csrf: '' }, req);
    fecharSessao(P, res, cookies, companyId);
    return { ok: true };
  }, { publica: true });
}

export function rotasPublicoEmpresa(P, r) {
  // Marca, textos de login e landing page da empresa. Sem sessão; nada sensível.
  r.get('/api/publico', ({ companyId, empresa }) => {
    const b = E.lerMarca(P, companyId);
    const cfg = lerConfig(P.tenant(companyId).db);
    const l = E.lerLanding(P, companyId);
    const publicada = empresa.status === 'ativa' && l.status === 'publicada';
    return {
      multiempresa: true, empresa: b.display_name || empresa.name, logo: b.logo, corMarca: b.primary_color, corSecundaria: b.secondary_color,
      favicon: b.favicon ? '/icone' : null, privacyNote: b.privacy_note || cfg.privacyNote, retencaoDias: cfg.retencaoDias,
      loginTitulo: b.login_title, loginTexto: b.login_text, status: empresa.status,
      aviso: { em_implantacao: 'Este ambiente está em implantação.', suspensa: 'Este ambiente está indisponível no momento.', cancelada: 'Este ambiente foi encerrado.' }[empresa.status] || null,
      landing: publicada ? l.content : null, seo: l.seo,
    };
  }, { publica: true });
}
