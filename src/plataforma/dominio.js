// Domínio próprio de uma empresa: conferência do DNS e, quando configurado, cadastro automático
// no provedor de hospedagem (Render), que emite o certificado. Sem provedor, a plataforma confere
// o DNS e mostra o que falta; o cadastro no provedor fica manual.
import { promises as dnsPadrao } from 'node:dns';
import { exec, um, todos } from '../db.js';
import { auditar } from './auditoria.js';
import { lerAjuste } from './db.js';

// O domínio está certo quando é um CNAME para o endereço da plataforma (ou para o do provedor),
// ou quando aponta para os mesmos IPs da plataforma.
export async function conferirDns(P, dominio) {
  const dns = P.dns || dnsPadrao;
  const alvos = [P.hostPlataforma, lerAjuste(P.db, 'subdominio_base', P.subdominioBase), ...(P.provedorDominios?.alvos || [])].filter(Boolean).map(a => a.toLowerCase());
  if (!alvos.length) return { ok: false, mensagem: 'Defina PLATAFORMA_HOST para a plataforma saber para onde o domínio deve apontar.' };
  try {
    const cnames = (await dns.resolveCname(dominio).catch(() => [])).map(c => c.toLowerCase().replace(/\.$/, ''));
    if (cnames.some(c => alvos.some(a => c === a || c.endsWith(`.${a}`)))) return { ok: true, mensagem: `CNAME para ${cnames[0]}.` };
    const [meus, deles] = await Promise.all([Promise.all(alvos.map(a => dns.resolve4(a).catch(() => []))).then(l => l.flat()), dns.resolve4(dominio).catch(() => [])]);
    if (deles.length && deles.some(ip => meus.includes(ip))) return { ok: true, mensagem: `Aponta para ${deles.join(', ')}.` };
    if (cnames.length || deles.length) return { ok: false, mensagem: `O domínio aponta para ${cnames[0] || deles.join(', ')}, não para ${alvos[0]}. Ajuste o CNAME.` };
    return { ok: false, mensagem: `Não encontramos registro para ${dominio}. Crie um CNAME apontando para ${alvos[0]}.` };
  } catch (e) {
    return { ok: false, mensagem: `Falha ao consultar o DNS: ${String(e.message).slice(0, 120)}` };
  }
}

export async function verificarDominio(P, companyId, { ator = null, origem = { painel: 'sistema' } } = {}) {
  const c = um(P.db, 'select id, custom_domain, domain_status from companies where id = ?', companyId);
  if (!c?.custom_domain) return { status: '', mensagem: 'Sem domínio próprio.' };
  const r = await conferirDns(P, c.custom_domain);
  let mensagem = r.mensagem;
  if (r.ok && P.provedorDominios) {
    // DNS certo: pede ao provedor para conferir e emitir o certificado.
    try { await P.provedorDominios.verificar(c.custom_domain); } catch (e) { mensagem += ` O provedor ainda não confirmou: ${String(e.message).slice(0, 120)}`; }
  }
  const status = r.ok ? 'verificado' : 'pendente';
  exec(P.db, 'update companies set domain_status = ?, domain_checked_at = ?, domain_message = ? where id = ?', status, P.agora().toISOString(), mensagem, companyId);
  if (status !== c.domain_status || ator) auditar(P, { usuario: ator, empresa: companyId, acao: 'company.domain_checked', entidade: 'company', id: companyId, antes: { status: c.domain_status }, depois: { status, dominio: c.custom_domain, mensagem }, origem });
  return { status, mensagem, verificadoEm: P.agora().toISOString() };
}

// Ao trocar o domínio: tira o antigo do provedor e cadastra o novo. Falha no provedor não impede a troca;
// fica registrada na mensagem do domínio e na auditoria.
export async function sincronizarProvedor(P, companyId, antigo, novo) {
  if (!P.provedorDominios) return;
  const erros = [];
  if (antigo) await P.provedorDominios.remover(antigo).catch(e => erros.push(`remover ${antigo}: ${e.message}`));
  if (novo) await P.provedorDominios.adicionar(novo).catch(e => erros.push(`cadastrar ${novo}: ${e.message}`));
  if (erros.length) {
    exec(P.db, 'update companies set domain_message = ? where id = ?', `O provedor recusou: ${erros.join('; ').slice(0, 300)}`, companyId);
    auditar(P, { empresa: companyId, acao: 'company.domain_provider_failed', entidade: 'company', id: companyId, depois: { erros }, origem: { painel: 'sistema' } });
  } else if (novo) auditar(P, { empresa: companyId, acao: 'company.domain_provider_added', entidade: 'company', id: companyId, depois: { dominio: novo }, origem: { painel: 'sistema' } });
}

export const pendentes = P => todos(P.db, "select id from companies where custom_domain is not null and domain_status != 'verificado'").map(c => c.id);

// Provedor Render: cadastra e confere domínios do serviço pela API (RENDER_API_KEY e RENDER_SERVICE_ID).
export function criarProvedorRender({ chave, servico, fetch: f = fetch, alvo = '' }) {
  const base = `https://api.render.com/v1/services/${encodeURIComponent(servico)}/custom-domains`;
  const chamar = async (metodo, caminho = '', corpo) => {
    const r = await f(base + caminho, { method: metodo, headers: { authorization: `Bearer ${chave}`, accept: 'application/json', ...(corpo ? { 'content-type': 'application/json' } : {}) }, body: corpo ? JSON.stringify(corpo) : undefined });
    if (r.status === 404 && metodo === 'DELETE') return null;
    if (!r.ok) { const t = await r.text().catch(() => ''); throw new Error(`Render respondeu ${r.status}${t ? `: ${t.slice(0, 160)}` : ''}`); }
    return r.status === 204 ? null : r.json().catch(() => null);
  };
  return {
    nome: 'Render', alvos: alvo ? [alvo] : [],
    adicionar: async nome => { try { return await chamar('POST', '', { name: nome }); } catch (e) { if (/409|already/i.test(e.message)) return null; throw e; } },
    remover: nome => chamar('DELETE', `/${encodeURIComponent(nome)}`),
    verificar: nome => chamar('POST', `/${encodeURIComponent(nome)}/verify`),
  };
}
