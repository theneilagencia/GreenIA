// Painel do admin: configurações, uso e custo, eventos, quick wins e limites de gasto.
import { erro, enviarCsv } from './http.js';
import { todos, um } from './db.js';
import { lerConfig, salvarConfig, TIPOS_DADO } from './config.js';
import { registrar } from './eventos.js';
import { areasDoQw } from './quickwins.js';

// Contraste (WCAG) para a checagem automática da cor de marca.
const lum = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255)
  .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)).reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
export const contraste = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

const mesDe = (app, q) => (/^\d{4}-\d{2}$/.test(q || '') ? q : app.agora().toISOString().slice(0, 7));

// Limites: por pessoa por dia, por pessoa por mês e teto mensal da empresa, sobre o custo real.
export function criarLimites(app) {
  return {
    checar(pessoa, cfg) {
      const agora = app.agora().toISOString();
      const mes = agora.slice(0, 7), dia = agora.slice(0, 10);
      if (cfg.tetoMensal > 0 && um(app.db, 'select coalesce(sum(custo), 0) as c from uso where substr(em, 1, 7) = ?', mes).c >= cfg.tetoMensal) {
        registrar(app, 'bloqueio', pessoa.id, { motivo: 'teto_mensal' });
        throw erro(429, 'teto_mensal', 'O teto de gasto de IA deste mês foi atingido. Os envios voltam no próximo mês ou quando o admin aumentar o teto.');
      }
      if (cfg.tetoPessoaMensal > 0 && um(app.db, 'select coalesce(sum(custo), 0) as c from uso where pessoa_id = ? and substr(em, 1, 7) = ?', pessoa.id, mes).c >= cfg.tetoPessoaMensal) {
        registrar(app, 'bloqueio', pessoa.id, { motivo: 'teto_pessoa' });
        throw erro(429, 'teto_pessoa', 'Você atingiu o seu teto de gasto de IA deste mês. Fale com o admin se precisar de mais.');
      }
      if (cfg.limiteDiarioPessoa > 0 && um(app.db, 'select count(*) as n from uso where pessoa_id = ? and substr(em, 1, 10) = ?', pessoa.id, dia).n >= cfg.limiteDiarioPessoa) {
        registrar(app, 'bloqueio', pessoa.id, { motivo: 'limite_diario' });
        throw erro(429, 'limite_diario', `Você chegou ao limite de ${cfg.limiteDiarioPessoa} respostas por dia. Amanhã o limite volta.`);
      }
    },
  };
}

const CAMPOS_CONFIG = ['empresa', 'logo', 'corMarca', 'dominios', 'smtp', 'privacyNote', 'retencaoDias', 'acoesChat', 'tetoMensal', 'tetoPessoaMensal', 'limiteDiarioPessoa'];

function validarConfig(c) {
  const v = {};
  if (c.empresa !== undefined) { v.empresa = String(c.empresa).trim().slice(0, 80); if (!v.empresa) throw erro(400, 'empresa', 'Informe o nome da empresa.'); }
  if (c.logo !== undefined) {
    if (c.logo && !/^data:image\/(png|svg\+xml|jpeg);base64,[A-Za-z0-9+/=]+$/.test(c.logo)) throw erro(400, 'logo', 'O logo precisa ser PNG, JPG ou SVG.');
    if (c.logo.length > 300_000) throw erro(400, 'logo', 'Logo grande demais (máximo 200 KB).');
    v.logo = c.logo;
  }
  if (c.corMarca !== undefined) {
    if (c.corMarca && !/^#[0-9a-fA-F]{6}$/.test(c.corMarca)) throw erro(400, 'cor', 'Cor inválida.');
    // A cor de marca vira fundo de botão com texto claro e texto sobre os fundos claros.
    // Conferida contra o fundo claro mais escuro das telas (areia): 4,5:1 ali vale para todos.
    if (c.corMarca && contraste(c.corMarca, '#F1EAD9') < 4.5) throw erro(400, 'cor', `Contraste de ${contraste(c.corMarca, '#F1EAD9').toFixed(2)}:1 com os fundos claros. O mínimo é 4,5:1: escolha uma cor mais escura.`);
    v.corMarca = c.corMarca || '';
  }
  if (c.dominios !== undefined) {
    v.dominios = [...new Set((Array.isArray(c.dominios) ? c.dominios : String(c.dominios).split(/[\s,;]+/)).map(d => String(d).trim().toLowerCase().replace(/^@/, '')).filter(Boolean))];
    if (v.dominios.some(d => !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d))) throw erro(400, 'dominios', 'Domínio inválido.');
    if (!v.dominios.length) throw erro(400, 'dominios', 'Informe pelo menos um domínio permitido.');
  }
  if (c.smtp !== undefined) v.smtp = { url: String(c.smtp.url || '').trim(), remetente: String(c.smtp.remetente || '').trim() };
  if (c.privacyNote !== undefined) v.privacyNote = String(c.privacyNote).trim().slice(0, 400);
  if (c.retencaoDias !== undefined) { v.retencaoDias = Math.round(Number(c.retencaoDias)); if (!(v.retencaoDias >= 1 && v.retencaoDias <= 3650)) throw erro(400, 'retencao', 'Retenção entre 1 e 3.650 dias.'); }
  if (c.acoesChat !== undefined) v.acoesChat = Object.fromEntries(TIPOS_DADO.map(t => [t, t === 'credencial' ? 'bloquear' : c.acoesChat[t] === 'permitir' ? 'permitir' : 'bloquear']));
  for (const k of ['tetoMensal', 'tetoPessoaMensal', 'limiteDiarioPessoa']) if (c[k] !== undefined) { v[k] = Number(c[k]) || 0; if (v[k] < 0) throw erro(400, k, 'Use zero para sem limite.'); }
  return v;
}

// Uso agregado do mês (conversas de teste não contam).
function uso(app, mes) {
  const base = "from uso u where u.teste = 0 and substr(u.em, 1, 7) = ?";
  const soma = `count(*) as respostas, count(distinct u.conversa_id) as conversas, coalesce(sum(u.custo), 0) as custo, coalesce(sum(u.economia), 0) as economia, coalesce(avg(u.ms), 0) as ms`;
  return {
    mes,
    totais: um(app.db, `select ${soma}, count(distinct u.pessoa_id) as pessoas ${base}`, mes),
    porTipo: todos(app.db, `select case when u.sigilosa = 1 then 'sigilosa' else 'normal' end as tipo, ${soma} ${base} group by u.sigilosa`, mes),
    porModelo: todos(app.db, `select u.modelo_usado as modelo, u.fornecedor, ${soma} ${base} group by u.modelo_usado, u.fornecedor order by custo desc`, mes),
    porPessoa: todos(app.db, `select p.nome, p.email, ${soma} ${base.replace('from uso u', 'from uso u join pessoas p on p.id = u.pessoa_id')} group by u.pessoa_id order by custo desc`, mes),
    porQuickWin: todos(app.db, `select coalesce(q.nome, 'Chat geral') as quick_win, ${soma} ${base.replace('from uso u', 'from uso u left join quick_wins q on q.id = u.quick_win_id')} group by u.quick_win_id order by custo desc`, mes),
    // Quick win: pelas áreas dele. Chat: pelas áreas de quem usou (quem está em várias áreas conta em cada uma).
    porArea: todos(app.db, `select a.nome as area, count(*) as respostas, count(distinct x.conversa_id) as conversas, coalesce(sum(x.custo), 0) as custo from (
        select u.*, qa.area_id from uso u join quick_win_areas qa on qa.quick_win_id = u.quick_win_id where u.teste = 0 and substr(u.em, 1, 7) = ?
        union all select u.*, ap.area_id from uso u join area_pessoas ap on ap.pessoa_id = u.pessoa_id where u.quick_win_id is null and u.teste = 0 and substr(u.em, 1, 7) = ?
      ) x join areas a on a.id = x.area_id group by a.id order by custo desc`, mes, mes),
  };
}

export function rotasAdmin(app, r) {
  app.limites = criarLimites(app);

  r.get('/api/admin/config', () => {
    const c = lerConfig(app.db);
    return Object.fromEntries(CAMPOS_CONFIG.map(k => [k, c[k]]));
  }, { admin: true });

  r.put('/api/admin/config', ({ pessoa, corpo }) => {
    const v = validarConfig(corpo);
    salvarConfig(app.db, v);
    registrar(app, 'config_alterada', pessoa.id, { campos: Object.keys(v) });
    if ('retencaoDias' in v) app.aoMudarModelos?.();
    return { ok: true };
  }, { admin: true, limiteMb: 1 });

  r.post('/api/admin/smtp/teste', async ({ pessoa }) => {
    try { await app.email.enviar(pessoa.email, 'Teste de email da GreenIA', 'Se você recebeu esta mensagem, o envio de email está funcionando.'); }
    catch (e) { throw erro(502, 'smtp', `O servidor de email recusou: ${String(e.message).slice(0, 200)}`); }
    return { ok: true, para: pessoa.email };
  }, { admin: true });

  r.get('/api/admin/uso', ({ query, res }) => {
    const u = uso(app, mesDe(app, query.mes));
    if (query.formato !== 'csv') return u;
    const cab = ['respostas', 'conversas', 'custo', 'economia'];
    const blocos = [['Por modelo', u.porModelo, 'modelo'], ['Por quick win', u.porQuickWin, 'quick_win'], ['Por área', u.porArea, 'area'], ['Por pessoa', u.porPessoa, 'email'], ['Por tipo', u.porTipo, 'tipo']];
    const linhas = [['recorte', 'item', ...cab]];
    for (const [nome, lista, chave] of blocos) for (const l of lista) linhas.push([nome, l[chave], ...cab.map(c => l[c] ?? '')]);
    enviarCsv(res, `greenia-uso-${u.mes}.csv`, linhas);
  }, { admin: true });

  r.get('/api/admin/eventos', ({ query, res }) => {
    const cond = [], p = [];
    if (query.tipo) { cond.push('e.tipo = ?'); p.push(query.tipo); }
    if (query.pessoa) { cond.push('p.email like ?'); p.push(`%${query.pessoa}%`); }
    if (/^\d{4}-\d{2}-\d{2}$/.test(query.de || '')) { cond.push('e.em >= ?'); p.push(query.de); }
    if (/^\d{4}-\d{2}-\d{2}$/.test(query.ate || '')) { cond.push('e.em < ?'); p.push(`${query.ate}T99`); }
    const where = cond.length ? `where ${cond.join(' and ')}` : '';
    const sql = `select e.id, e.em, e.tipo, p.email as pessoa, e.detalhes from eventos e left join pessoas p on p.id = e.pessoa_id ${where} order by e.id desc`;
    if (query.formato === 'csv') return enviarCsv(res, 'greenia-eventos.csv', [['id', 'quando', 'tipo', 'pessoa', 'detalhes'], ...todos(app.db, sql, ...p).map(e => [e.id, e.em, e.tipo, e.pessoa, e.detalhes])]);
    const pagina = Math.max(0, Number(query.pagina) || 0);
    return { eventos: todos(app.db, `${sql} limit 100 offset ?`, ...p, pagina * 100), total: um(app.db, `select count(*) as n from eventos e left join pessoas p on p.id = e.pessoa_id ${where}`, ...p).n,
      tipos: todos(app.db, 'select distinct tipo from eventos order by tipo').map(t => t.tipo) };
  }, { admin: true });

  r.get('/api/admin/quick-wins', ({ query }) => {
    const mes = mesDe(app, query.mes);
    const areas = new Map(todos(app.db, 'select id, nome from areas').map(a => [a.id, a.nome]));
    return { quickWins: todos(app.db, `select q.id, q.nome, q.cor, q.status, q.sigiloso, q.toda_empresa, q.modelo, p.email as criado_por, q.atualizado_em,
        (select count(distinct conversa_id) from uso u where u.quick_win_id = q.id and u.teste = 0 and substr(u.em, 1, 7) = ?) as conversas,
        (select coalesce(sum(custo), 0) from uso u where u.quick_win_id = q.id and u.teste = 0 and substr(u.em, 1, 7) = ?) as custo
      from quick_wins q left join pessoas p on p.id = q.criado_por order by q.nome`, mes, mes)
      .map(q => ({ ...q, sigiloso: !!q.sigiloso, toda_empresa: !!q.toda_empresa, areas: areasDoQw(app.db, q.id).map(a => areas.get(a)) })) };
  }, { admin: true });

  r.get('/api/admin/quick-wins-permissoes', () => lerConfig(app.db).criarQuickWin, { admin: true });

  r.put('/api/admin/quick-wins-permissoes', ({ pessoa, corpo }) => {
    const ids = l => [...new Set((l || []).map(Number).filter(Boolean))];
    const v = { responsaveis: corpo.responsaveis !== false, pessoas: ids(corpo.pessoas), grupos: ids(corpo.grupos),
      todaEmpresa: { pessoas: ids(corpo.todaEmpresa?.pessoas), grupos: ids(corpo.todaEmpresa?.grupos) } };
    salvarConfig(app.db, { criarQuickWin: v });
    registrar(app, 'permissao_quick_win', pessoa.id, { responsaveis: v.responsaveis, pessoas: v.pessoas.length, grupos: v.grupos.length });
    return v;
  }, { admin: true });
}
