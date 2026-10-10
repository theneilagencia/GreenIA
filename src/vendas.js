// Página de vendas e formulário de contato. Só existe na instalação do operador
// (PAGINA_INICIAL=vendas): a de cada cliente abre a própria página, com a marca dele.
import { erro } from './http.js';
import { exec, todos } from './db.js';
import { registrar } from './eventos.js';
import { ehOperador } from './plano.js';

export const FAIXAS = ['até 50', '51 a 200', '201 a 1.000', 'mais de 1.000'];
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i;
const JANELA_MS = 3600e3, MAX_POR_IP = 5;

export function rotasVendas(app, r) {
  const ativa = () => { if (app.paginaInicial !== 'vendas') throw erro(404, 'nao_encontrado', 'Não encontrado.'); };
  const envios = new Map();

  r.post('/api/contato', async ({ req, corpo }) => {
    ativa();
    const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || '?';
    const agora = Date.now(), n = (envios.get(ip) || []).filter(t => t > agora - JANELA_MS);
    if (n.length >= MAX_POR_IP) throw erro(429, 'muitos_contatos', 'Recebemos vários contatos deste endereço. Tente de novo mais tarde.');
    if (corpo.site) return { ok: true };   // campo escondido: robôs preenchem, pessoas não
    const t = (k, max) => String(corpo[k] ?? '').trim().slice(0, max);
    const lead = { nome: t('nome', 120), email: t('email', 200).toLowerCase(), empresa: t('empresa', 160), cargo: t('cargo', 120), pessoas: t('pessoas', 40), mensagem: t('mensagem', 2000) };
    if (lead.nome.length < 2) throw erro(400, 'nome', 'Informe o seu nome.');
    if (!EMAIL.test(lead.email)) throw erro(400, 'email', 'Informe um email válido.');
    if (lead.empresa.length < 2) throw erro(400, 'empresa', 'Informe o nome da empresa.');
    if (lead.pessoas && !FAIXAS.includes(lead.pessoas)) throw erro(400, 'pessoas', 'Escolha uma faixa de pessoas.');
    envios.set(ip, [...n, agora]);
    const { lastInsertRowid } = exec(app.db, 'insert into leads (em, nome, email, empresa, cargo, pessoas, mensagem, ip) values (?, ?, ?, ?, ?, ?, ?, ?)',
      app.agora().toISOString(), lead.nome, lead.email, lead.empresa, lead.cargo, lead.pessoas, lead.mensagem, ip);
    registrar(app, 'lead.created', null, { lead: Number(lastInsertRowid), empresa: lead.empresa });
    const texto = `Novo contato pela página da GreenIA.\n\nNome: ${lead.nome}\nEmail: ${lead.email}\nEmpresa: ${lead.empresa}\nCargo: ${lead.cargo || '-'}\nPessoas: ${lead.pessoas || '-'}\n\n${lead.mensagem || '(sem mensagem)'}`;
    for (const para of app.operadores || []) await app.email.enviar(para, `GreenIA: contato de ${lead.empresa}`, texto).catch(e => app.log('email de contato', e.message));
    return { ok: true };
  }, { publica: true, limiteMb: 0.05 });

  r.get('/api/operador/leads', ({ pessoa }) => {
    if (!ehOperador(app, pessoa)) throw erro(403, 'so_operador', 'Só o operador da plataforma pode fazer isso.');
    return { leads: todos(app.db, 'select id, em, nome, email, empresa, cargo, pessoas, mensagem from leads order by id desc limit 200') };
  });
}
