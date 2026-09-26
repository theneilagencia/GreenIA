// Medição simples dos quick wins (seção 6): uso automático por mês, medição
// manual lançada pelo responsável e decisões. Sem "tempo economizado" e sem
// estimativa. E os problemas reportados pelas pessoas (seção 7).
import { erro, enviarCsv } from './http.js';
import { exec, todos, um } from './db.js';
import { registrar } from './eventos.js';
import { podeGerir } from './quickwins.js';

const ORIGENS = ['medido', 'informado'];
const DECISOES = ['manter', 'ajustar', 'descartar', 'ampliar'];
const TIPOS_PROBLEMA = { resposta: 'Resposta errada ou inventada', dado: 'Dado sensível apareceu onde não devia', erro: 'Erro no sistema', outro: 'Outro' };

// Uso automático por mês (últimos 12), sem as conversas de teste. Cada conversa conta como um uso.
export function usoMensal(db, qwId) {
  return todos(db, `select substr(c.criado_em, 1, 7) as mes, count(*) as conversas, count(distinct c.pessoa_id) as pessoas,
      sum(c.sigilosa) as sigilosas,
      sum(case when c.feedback = 'serviu' then 1 else 0 end) as serviu, sum(case when c.feedback = 'ajustes' then 1 else 0 end) as ajustes,
      sum(case when c.feedback = 'nao_serviu' then 1 else 0 end) as nao_serviu, sum(case when c.feedback is null then 1 else 0 end) as sem_feedback,
      (select count(*) from mensagens m join conversas c2 on c2.id = m.conversa_id where c2.quick_win_id = ? and c2.teste = 0 and m.papel = 'user' and substr(m.criado_em, 1, 7) = substr(c.criado_em, 1, 7)) as mensagens,
      (select coalesce(sum(custo), 0) from uso u where u.quick_win_id = ? and u.teste = 0 and substr(u.em, 1, 7) = substr(c.criado_em, 1, 7)) as custo,
      (select coalesce(avg(ms), 0) from uso u where u.quick_win_id = ? and u.teste = 0 and substr(u.em, 1, 7) = substr(c.criado_em, 1, 7)) as ms
    from conversas c where c.quick_win_id = ? and c.teste = 0 and exists (select 1 from mensagens m where m.conversa_id = c.id and m.papel = 'user')
    group by substr(c.criado_em, 1, 7) order by mes desc limit 12`, qwId, qwId, qwId, qwId);
}

// Ponto de partida: sem valor antes, nada é calculado.
export function situacaoMedicao(m) {
  if (m.antes_valor === null || m.antes_valor === undefined) return { situacao: 'sem ponto de partida', variacao: null, percentual: null };
  if (m.depois_valor === null || m.depois_valor === undefined) return { situacao: 'aguardando valor depois', variacao: null, percentual: null };
  const variacao = m.depois_valor - m.antes_valor;
  return { situacao: 'com antes e depois', variacao, percentual: m.antes_valor !== 0 ? (variacao / Math.abs(m.antes_valor)) * 100 : null };
}

function validarMedicao(c) {
  const indicador = String(c.indicador || '').trim().slice(0, 160);
  if (!indicador) throw erro(400, 'indicador', 'Escreva o indicador (ex.: minutos por documento conferido).');
  const lado = k => {
    const bruto = c[`${k}_valor`];
    const valor = bruto === '' || bruto === null || bruto === undefined ? null : Number(String(bruto).replace(',', '.'));
    if (valor !== null && !Number.isFinite(valor)) throw erro(400, k, `Valor ${k} inválido.`);
    const data = valor === null ? null : String(c[`${k}_data`] || '');
    if (valor !== null && !/^\d{4}-\d{2}-\d{2}$/.test(data)) throw erro(400, k, `Informe a data do valor ${k}.`);
    const origem = valor === null ? null : c[`${k}_origem`];
    if (valor !== null && !ORIGENS.includes(origem)) throw erro(400, k, `Diga se o valor ${k} foi medido ou informado.`);
    return [valor, data, origem];
  };
  return { indicador, antes: lado('antes'), depois: lado('depois'), observacao: String(c.observacao || '').slice(0, 1000) };
}

export function rotasMedicao(app, r) {
  const gerido = (pessoa, id) => {
    const q = um(app.db, 'select * from quick_wins where id = ?', Number(id));
    if (!q || !podeGerir(app.db, pessoa, q)) throw erro(404, 'quick_win', 'Quick win não encontrado.');
    return q;
  };
  const lerMedicoes = qwId => todos(app.db, `select m.*, p.email as por from medicoes m left join pessoas p on p.id = m.criado_por where m.quick_win_id = ? order by m.id`, qwId)
    .map(m => ({ ...m, ...situacaoMedicao(m) }));
  const lerDecisoes = qwId => todos(app.db, 'select d.id, d.decisao, d.motivo, d.em, p.email as por from decisoes d left join pessoas p on p.id = d.pessoa_id where d.quick_win_id = ? order by d.id desc', qwId);

  r.get('/api/quick-wins/:id/medicao', ({ pessoa, params }) => {
    const q = gerido(pessoa, params.id);
    return { usoMensal: usoMensal(app.db, q.id), medicoes: lerMedicoes(q.id), decisoes: lerDecisoes(q.id) };
  });

  r.post('/api/quick-wins/:id/medicoes', ({ pessoa, params, corpo }) => {
    const q = gerido(pessoa, params.id);
    const v = validarMedicao(corpo);
    const id = Number(exec(app.db, `insert into medicoes (quick_win_id, indicador, antes_valor, antes_data, antes_origem, depois_valor, depois_data, depois_origem, observacao, criado_por, atualizado_em)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, q.id, v.indicador, ...v.antes, ...v.depois, v.observacao, pessoa.id, app.agora().toISOString()).lastInsertRowid);
    registrar(app, 'medicao_registrada', pessoa.id, { quick_win: q.id, medicao: id, antes: v.antes[0] !== null, depois: v.depois[0] !== null });
    return { medicoes: lerMedicoes(q.id) };
  });

  r.put('/api/quick-wins/:id/medicoes/:m', ({ pessoa, params, corpo }) => {
    const q = gerido(pessoa, params.id);
    if (!um(app.db, 'select 1 from medicoes where id = ? and quick_win_id = ?', Number(params.m), q.id)) throw erro(404, 'medicao', 'Medição não encontrada.');
    const v = validarMedicao(corpo);
    exec(app.db, `update medicoes set indicador = ?, antes_valor = ?, antes_data = ?, antes_origem = ?, depois_valor = ?, depois_data = ?, depois_origem = ?, observacao = ?, atualizado_em = ? where id = ?`,
      v.indicador, ...v.antes, ...v.depois, v.observacao, app.agora().toISOString(), Number(params.m));
    registrar(app, 'medicao_alterada', pessoa.id, { quick_win: q.id, medicao: Number(params.m) });
    return { medicoes: lerMedicoes(q.id) };
  });

  r.del('/api/quick-wins/:id/medicoes/:m', ({ pessoa, params }) => {
    const q = gerido(pessoa, params.id);
    exec(app.db, 'delete from medicoes where id = ? and quick_win_id = ?', Number(params.m), q.id);
    registrar(app, 'medicao_removida', pessoa.id, { quick_win: q.id, medicao: Number(params.m) });
    return { medicoes: lerMedicoes(q.id) };
  });

  r.post('/api/quick-wins/:id/decisoes', ({ pessoa, params, corpo }) => {
    const q = gerido(pessoa, params.id);
    if (!DECISOES.includes(corpo.decisao)) throw erro(400, 'decisao', 'Escolha manter, ajustar, descartar ou ampliar.');
    const motivo = String(corpo.motivo || '').trim().slice(0, 1000);
    if (motivo.length < 5) throw erro(400, 'motivo', 'Escreva por que decidiu assim.');
    exec(app.db, 'insert into decisoes (quick_win_id, decisao, motivo, pessoa_id, em) values (?, ?, ?, ?, ?)', q.id, corpo.decisao, motivo, pessoa.id, app.agora().toISOString());
    registrar(app, 'decisao_quick_win', pessoa.id, { quick_win: q.id, decisao: corpo.decisao });
    return { decisoes: lerDecisoes(q.id) };
  });

  // Tudo em CSV: uso por mês, medições e decisões.
  r.get('/api/quick-wins/:id/medicao.csv', ({ pessoa, params, res }) => {
    const q = gerido(pessoa, params.id);
    const linhas = [['bloco', 'mês ou indicador', 'conversas', 'mensagens', 'pessoas', 'serviu', 'com ajustes', 'não serviu', 'sem feedback', 'sigilosas', 'custo (US$)', 'tempo médio (s)']];
    for (const u of usoMensal(app.db, q.id)) linhas.push(['uso', u.mes, u.conversas, u.mensagens, u.pessoas, u.serviu, u.ajustes, u.nao_serviu, u.sem_feedback, u.sigilosas, u.custo.toFixed(4), (u.ms / 1000).toFixed(1)]);
    linhas.push([], ['bloco', 'indicador', 'antes', 'data antes', 'origem antes', 'depois', 'data depois', 'origem depois', 'situação', 'variação', 'observação', 'lançado por']);
    for (const m of lerMedicoes(q.id)) linhas.push(['medição', m.indicador, m.antes_valor, m.antes_data, m.antes_origem, m.depois_valor, m.depois_data, m.depois_origem, m.situacao, m.variacao ?? '', m.observacao, m.por]);
    linhas.push([], ['bloco', 'decisão', 'motivo', 'quando', 'quem']);
    for (const d of lerDecisoes(q.id)) linhas.push(['decisão', d.decisao, d.motivo, d.em, d.por]);
    enviarCsv(res, `quick-win-${q.id}-medicao.csv`, linhas);
  });

  // Problemas reportados: gravados e enviados por email aos admins. O evento não leva a descrição.
  r.post('/api/problemas', async ({ pessoa, corpo }) => {
    const tipo = TIPOS_PROBLEMA[corpo.tipo] ? corpo.tipo : 'outro';
    const descricao = String(corpo.descricao || '').trim().slice(0, 4000);
    if (descricao.length < 5) throw erro(400, 'descricao', 'Descreva o problema.');
    const id = Number(exec(app.db, 'insert into problemas (pessoa_id, tipo, descricao, em) values (?, ?, ?, ?)', pessoa.id, tipo, descricao, app.agora().toISOString()).lastInsertRowid);
    registrar(app, 'problema_reportado', pessoa.id, { problema: id, tipo });
    const admins = todos(app.db, "select email from pessoas where papel = 'admin' and ativo = 1").map(a => a.email);
    for (const a of admins) {
      await app.email.enviar(a, `GreenIA: problema reportado (${TIPOS_PROBLEMA[tipo]})`, `${pessoa.nome} (${pessoa.email}) reportou um problema.\n\nTipo: ${TIPOS_PROBLEMA[tipo]}\n\n${descricao}\n\nVeja no painel do admin, aba Eventos.`)
        .catch(e => app.log('email de problema', e.message));
    }
    return { ok: true, id };
  });

  r.get('/api/problemas/tipos', () => ({ tipos: TIPOS_PROBLEMA }));

  r.get('/api/admin/problemas', () => ({
    problemas: todos(app.db, 'select pr.id, pr.tipo, pr.descricao, pr.em, pr.resolvido, p.nome, p.email from problemas pr left join pessoas p on p.id = pr.pessoa_id order by pr.id desc limit 200')
      .map(p => ({ ...p, tipo: TIPOS_PROBLEMA[p.tipo], resolvido: !!p.resolvido })),
  }), { admin: true });

  r.put('/api/admin/problemas/:id', ({ pessoa, params, corpo }) => {
    exec(app.db, 'update problemas set resolvido = ? where id = ?', Number(!!corpo.resolvido), Number(params.id));
    registrar(app, 'problema_atualizado', pessoa.id, { problema: Number(params.id), resolvido: !!corpo.resolvido });
    return { ok: true };
  }, { admin: true });
}
