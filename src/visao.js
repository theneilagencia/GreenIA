// Visão geral: como a empresa está usando IA. Uso do mês, adoção, resultado,
// concentração, pontos de atenção e o roteiro de implantação. Só admin.
// Os custos saem em dólar aqui e viram créditos na saída para quem não é operador.
import { todos, um } from './db.js';
import { lerConfig } from './config.js';
import { situacaoPlano } from './plano.js';
import { homologadoPadrao, lerModelos } from './modelos.js';

import { EM_CIRCULACAO } from './quickwins.js';

export function visaoGeral(app) {
  const db = app.db, agora = app.agora(), mes = agora.toISOString().slice(0, 7);
  const cfg = lerConfig(db);
  const noMes = "substr(u.em, 1, 7) = ?";
  const custoMes = um(db, `select coalesce(sum(custo), 0) as c, count(*) as n from uso u where ${noMes}`, mes);
  const diasMes = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() + 1, 0)).getUTCDate();
  const dia = agora.getUTCDate() + agora.getUTCHours() / 24;
  const plano = situacaoPlano(app);

  const uso = {
    custo: custoMes.c, respostas: custoMes.n,
    previsao: dia >= 3 ? custoMes.c / dia * diasMes : null,        // projeção linear, a partir do terceiro dia
    plano,
    tetoMensal: cfg.tetoMensal || null,
  };

  const adocao = {
    pessoasAtivas: um(db, `select count(distinct pessoa_id) as n from uso u where ${noMes}`, mes).n,
    pessoasCadastradas: um(db, 'select count(*) as n from pessoas where ativo = 1').n,
    areasAtivas: um(db, `select count(distinct ap.area_id) as n from uso u join area_pessoas ap on ap.pessoa_id = u.pessoa_id where ${noMes}`, mes).n,
    areasCadastradas: um(db, 'select count(*) as n from areas').n,
    quickWinsEmCirculacao: um(db, `select count(*) as n from quick_wins where status in (${EM_CIRCULACAO.map(() => '?').join(',')})`, ...EM_CIRCULACAO).n,
    execucoes: um(db, `select count(distinct conversa_id) as n from uso u where ${noMes} and u.quick_win_id is not null and u.teste = 0`, mes).n,
    conversas: um(db, `select count(distinct conversa_id) as n from uso u where ${noMes} and u.teste = 0`, mes).n,
  };

  const porStatus = Object.fromEntries(todos(db, 'select status, count(*) as n from quick_wins group by status').map(x => [x.status, x.n]));
  const fb = um(db, `select sum(case when feedback = 'serviu' then 1 else 0 end) as serviu, sum(case when feedback = 'ajustes' then 1 else 0 end) as ajustes,
    sum(case when feedback = 'nao_serviu' then 1 else 0 end) as nao_serviu from conversas where substr(atualizado_em, 1, 7) = ? and teste = 0`, mes);
  const resultado = {
    porStatus,
    avaliacoes: { serviu: fb.serviu || 0, ajustes: fb.ajustes || 0, nao_serviu: fb.nao_serviu || 0 },
    medicoesCompletas: um(db, 'select count(*) as n from medicoes where antes_valor is not null and depois_valor is not null').n,
    decisoesNoMes: um(db, "select count(*) as n from decisoes where substr(em, 1, 7) = ?", mes).n,
  };

  const topo = (sql, ...p) => todos(db, `${sql} order by custo desc limit 5`, ...p);
  const concentracao = {
    areas: topo(`select a.nome, count(distinct u.conversa_id) as conversas, coalesce(sum(u.custo), 0) as custo from uso u join area_pessoas ap on ap.pessoa_id = u.pessoa_id join areas a on a.id = ap.area_id where ${noMes} group by a.id`, mes),
    quickWins: topo(`select q.id, q.nome, count(distinct u.conversa_id) as conversas, coalesce(sum(u.custo), 0) as custo from uso u join quick_wins q on q.id = u.quick_win_id where ${noMes} and u.teste = 0 group by q.id`, mes),
    pessoas: topo(`select p.nome, count(distinct u.conversa_id) as conversas, coalesce(sum(u.custo), 0) as custo from uso u join pessoas p on p.id = u.pessoa_id where ${noMes} group by p.id`, mes),
    classes: topo(`select coalesce(m.perfil, 'outro') as classe, count(*) as respostas, coalesce(sum(u.custo), 0) as custo from uso u left join modelos m on m.id = u.modelo_pedido where ${noMes} group by 1`, mes),
  };

  // Pontos de atenção: só o que pede ação.
  const atencao = [];
  const semAvaliacao = todos(db, `select q.id, q.nome, count(*) as n from conversas c join quick_wins q on q.id = c.quick_win_id
    where c.teste = 0 and c.feedback is null and substr(c.atualizado_em, 1, 7) = ? and exists (select 1 from mensagens m where m.conversa_id = c.id and m.papel = 'assistant')
    group by q.id having n >= 3 order by n desc limit 5`, mes);
  for (const q of semAvaliacao) atencao.push({ tipo: 'sem_avaliacao', texto: `${q.nome}: ${q.n} conversas sem avaliação neste mês`, link: `#/qw/${q.id}` });
  const semDono = todos(db, `select id, nome from quick_wins where responsavel_id is null and status in (${EM_CIRCULACAO.map(() => '?').join(',')}) limit 5`, ...EM_CIRCULACAO);
  for (const q of semDono) atencao.push({ tipo: 'sem_responsavel', texto: `${q.nome} está em circulação sem responsável`, link: `#/qw/${q.id}/editar` });
  const emAvaliacao = todos(db, "select id, nome from quick_wins where status = 'em_avaliacao' and not exists (select 1 from decisoes d where d.quick_win_id = quick_wins.id and d.em > quick_wins.atualizado_em) limit 5");
  for (const q of emAvaliacao) atencao.push({ tipo: 'decisao', texto: `${q.nome} está em avaliação e aguarda decisão`, link: `#/qw/${q.id}` });
  if (plano && ['aviso', 'pacote', 'reserva', 'esgotado'].includes(plano.fase)) atencao.push({ tipo: 'creditos', texto: { aviso: `Créditos do mês em ${plano.percentual}%`, pacote: 'Os créditos do plano acabaram: em uso o pacote extra', reserva: 'Os créditos do mês acabaram: só a classe Rápido até a renovação', esgotado: 'Créditos e reserva do mês esgotados: envio pausado até a renovação' }[plano.fase], link: '#/uso' });
  if (!plano && cfg.tetoMensal && custoMes.c >= cfg.tetoMensal * 0.8) atencao.push({ tipo: 'creditos', texto: 'Consumo acima de 80% do teto mensal', link: '#/configuracoes' });
  const bloqueios = um(db, "select count(*) as n from eventos where tipo = 'policy.blocked' and substr(em, 1, 7) = ?", mes).n;
  if (bloqueios) atencao.push({ tipo: 'politica', texto: `${bloqueios} ${bloqueios === 1 ? 'envio bloqueado' : 'envios bloqueados'} pelas regras de dados neste mês`, link: '#/atividade' });
  const modelos = lerModelos(db).filter(m => m.liberado);
  for (const m of modelos.filter(m => m.aviso && !m.aviso.startsWith('Preço'))) atencao.push({ tipo: 'modelo', texto: `${m.nome}: ${m.aviso}`, link: '#/modelos' });
  const homologados = modelos.filter(m => m.homologado);
  if (!homologadoPadrao(db, cfg)) atencao.push({ tipo: 'modelo', texto: 'Nenhum modelo homologado disponível: conversas sigilosas não podem ser enviadas', link: '#/modelos' });
  else if (homologados.length < 2) atencao.push({ tipo: 'modelo', texto: 'Só um modelo homologado. O recomendado são dois, de fabricantes diferentes', link: '#/politicas' });
  if (app.ia.configurada === false) atencao.push({ tipo: 'ia', texto: 'A IA está desligada: falta a chave de acesso aos modelos no servidor', link: '#/configuracoes' });
  const problemas = um(db, 'select count(*) as n from problemas where resolvido = 0').n;
  if (problemas) atencao.push({ tipo: 'problema', texto: `${problemas} ${problemas === 1 ? 'problema reportado em aberto' : 'problemas reportados em aberto'}`, link: '#/atividade' });

  // Roteiro de implantação: a GreenIA começa configurada para a empresa.
  const implantacao = [
    { id: 'organizacao', nome: 'Organização', texto: 'Nome da empresa e domínios de email', feito: cfg.empresa !== 'Sua empresa' && cfg.dominios.length > 0, link: '#/configuracoes' },
    { id: 'marca', nome: 'Marca', texto: 'Logo e cor da empresa', feito: !!(cfg.logo || cfg.corMarca), link: '#/configuracoes' },
    { id: 'areas', nome: 'Áreas', texto: 'Estrutura de áreas com responsáveis', feito: um(db, 'select count(*) as n from area_pessoas where responsavel = 1').n > 0, link: '#/pessoas' },
    { id: 'pessoas', nome: 'Pessoas', texto: 'Pessoas cadastradas nas áreas', feito: um(db, 'select count(*) as n from area_pessoas').n > 1, link: '#/pessoas' },
    { id: 'politicas', nome: 'Políticas', texto: 'Regras de dados revisadas e um modelo homologado', feito: um(db, "select count(*) as n from eventos where tipo in ('config.changed', 'policy.updated')").n > 0 && homologados.length > 0, link: '#/politicas' },
    { id: 'conhecimento', nome: 'Conhecimento', texto: 'Primeiros documentos das áreas', feito: um(db, 'select count(*) as n from documentos where quick_win_id is null').n > 0, link: '#/conhecimento' },
    { id: 'quickwin', nome: 'Primeiro quick win', texto: 'Um uso recorrente configurado', feito: um(db, 'select count(*) as n from quick_wins').n > 0, link: '#/qw/nova' },
    { id: 'publicar', nome: 'Publicar', texto: 'Quick win disponível para a equipe testar', feito: adocao.quickWinsEmCirculacao > 0, link: '#/quick-wins' },
  ];

  return { mes, uso, adocao, resultado, concentracao, atencao, implantacao };
}

export function rotasVisao(app, r) {
  r.get('/api/admin/visao-geral', () => visaoGeral(app), { admin: true });
}
