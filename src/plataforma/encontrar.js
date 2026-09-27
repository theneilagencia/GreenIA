// "Encontre o seu ambiente": quem chega pelo endereço da plataforma informa o email de trabalho
// e recebe, por email, o link de entrada de cada empresa em que tem acesso. A resposta é sempre a
// mesma, com ou sem cadastro, para não revelar quais emails ou empresas existem.
import { enviarJson, lerCorpo } from '../http.js';
import { todos } from '../db.js';
import { lerAjuste } from './db.js';

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i;
const JANELA_MS = 3600e3, MAX_POR_IP = 10, MAX_POR_EMAIL = 3;
export const RESPOSTA = 'Se este email tiver acesso a algum ambiente, enviamos o link de entrada. Confira a caixa de entrada e o spam.';

// Link de entrada: domínio próprio só depois de verificado; senão subdomínio ou caminho.
export function linkDeEntrada(P, c, origem) {
  if (c.custom_domain && c.domain_status === 'verificado') return `https://${c.custom_domain}/entrar`;
  const sub = lerAjuste(P.db, 'subdominio_base', P.subdominioBase || '');
  if (sub) return `https://${c.slug}.${sub}/entrar`;
  return `${P.urlBase || origem}/${c.slug}/entrar`;
}

export function ambientesDoEmail(P, email) {
  return todos(P.db, `select c.id, c.name, c.slug, c.custom_domain, c.domain_status, coalesce(nullif(b.display_name, ''), c.name) as nome
    from users u join company_users cu on cu.user_id = u.id join companies c on c.id = cu.company_id left join branding b on b.company_id = c.id
    where u.email = ? and u.status = 'ativo' and cu.status in ('ativo', 'convidado') and c.status in ('ativa', 'em_implantacao')
    order by nome`, email);
}

export function criarEncontrar(P) {
  const porIp = new Map(), porEmail = new Map();
  const recentes = (mapa, chave, agora) => (mapa.get(chave) || []).filter(t => t > agora - JANELA_MS);
  return async function encontrar(req, res) {
    const corpo = await lerCorpo(req, 0.01);
    const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || '?';
    const agora = Date.now(), nIp = recentes(porIp, ip, agora);
    if (nIp.length >= MAX_POR_IP) return enviarJson(res, 429, { erro: 'muitos_pedidos', mensagem: 'Recebemos vários pedidos deste endereço. Tente de novo mais tarde.' });
    if (corpo.site) return enviarJson(res, 200, { ok: true, mensagem: RESPOSTA });   // campo escondido: robôs preenchem
    const email = String(corpo.email ?? '').trim().toLowerCase().slice(0, 254);
    if (!EMAIL.test(email)) return enviarJson(res, 400, { erro: 'email', mensagem: 'Informe um email válido.' });
    porIp.set(ip, [...nIp, agora]);
    // Por email, o excesso é ignorado em silêncio: evita encher a caixa de alguém sem revelar nada.
    const nEmail = recentes(porEmail, email, agora);
    if (nEmail.length < MAX_POR_EMAIL) {
      porEmail.set(email, [...nEmail, agora]);
      const ambientes = ambientesDoEmail(P, email);
      const admin = !!todos(P.db, "select 1 from platform_members m join users u on u.id = m.user_id where u.email = ? and u.status = 'ativo'", email).length;
      if (ambientes.length || admin) {
        const origem = `${req.headers['x-forwarded-proto'] === 'https' || P.cookieSeguro ? 'https' : 'http'}://${req.headers.host}`;
        const nome = lerAjuste(P.db, 'nome', 'GreenIA');
        const linhas = [...(admin ? [`Console da plataforma: ${P.urlBase || origem}/plataforma`] : []), ...ambientes.map(c => `${c.nome}: ${linkDeEntrada(P, c, origem)}`)];
        const texto = `Você pediu o endereço do seu ambiente ${nome}.\n\n${linhas.length > 1 ? 'Você tem acesso a estes ambientes:' : 'Este é o seu acesso:'}\n\n${linhas.join('\n')}\n\nAbra o link e entre com este email (${email}). Um código de acesso chega na hora.\n\nSe não foi você quem pediu, ignore esta mensagem.`;
        P.email.enviar(email, `Seu acesso à ${nome}`, texto).catch(e => P.log('encontrar ambiente', e.message));
      }
    }
    enviarJson(res, 200, { ok: true, mensagem: RESPOSTA });
  };
}
