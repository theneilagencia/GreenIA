// Visão geral: como a empresa está usando IA. Leitura em faixas e listas, sem painel de cartões.
import { api, emCreditos, esc, fmtCusto } from '/comum.js';
import { cabecalho, ligarCabecalho } from '/app.js';

const $ = id => document.getElementById(id);
const num = v => Number(v || 0).toLocaleString('pt-BR');
export const ESTADOS = { identificado: 'Identificado', em_configuracao: 'Em configuração', em_teste: 'Em teste', em_uso: 'Em uso', em_avaliacao: 'Em avaliação', aprovado: 'Aprovado', em_expansao: 'Em expansão', descartado: 'Descartado' };
const CLASSES = { rapido: 'Rápido', equilibrado: 'Equilibrado', avancado: 'Avançado', outro: 'Outro' };
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

const faixa = itens => `<div class="indicadores">${itens.map(([rotulo, valor, nota]) => `<div class="indicador"><span>${rotulo}</span><b>${valor}</b>${nota ? `<small>${nota}</small>` : ''}</div>`).join('')}</div>`;
function barras(lista, nome, valor = x => x.custo, fmt = v => fmtCusto(v)) {
  if (!lista.length) return '<p class="dica">Sem uso neste mês.</p>';
  const max = Math.max(...lista.map(valor), 0) || 1;
  return `<div class="barras">${lista.map(x => `<div class="linha"><span class="nome">${esc(nome(x))}</span>
    <span class="trilho"><span style="width:${Math.max(2, valor(x) / max * 100)}%"></span></span><span class="valor">${fmt(valor(x))}</span></div>`).join('')}</div>`;
}

// Créditos com a mesma precisão da tela de Uso: uma casa decimal abaixo de 10.
const creditos = v => { const n = Number(v || 0); return n > 0 && n < 10 && n % 1 ? n.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : num(Math.round(n)); };

export async function vistaGeral() {
  // A preparação do ambiente tem uma só fonte (a tela Preparar o ambiente); aqui fica o resumo com link.
  const [v, prep] = await Promise.all([api('/api/admin/visao-geral'), api('/api/acompanhamento').catch(() => null)]);
  const [ano, mes] = v.mes.split('-');
  const p = v.uso.plano;
  const passos = prep?.passos || [];
  const prontos = passos.filter(x => x.pronto).length, faltam = passos.filter(x => !x.pronto && !x.opcional);

  const usoMes = p?.ilimitado ? faixa([
    ['Créditos usados', creditos(p.usados), 'plano sem limite de créditos'],
    ['Previsão para o mês', v.uso.previsao !== null ? num(Math.round(v.uso.previsao)) : 'após o 3º dia', 'no ritmo atual'],
    ['Plano', 'Ilimitado', 'sem teto de créditos'],
    ['Novo ciclo', new Date(`${p.renova}T12:00:00`).toLocaleDateString('pt-BR'), ''],
  ]) : p ? faixa([
    ['Créditos usados no ciclo', creditos(p.usados), `${p.usados > 0 && p.percentual < 1 ? 'menos de 1%' : `${p.percentual}%`} dos ${num(p.creditos)} do plano`],
    ['Previsão para o mês', v.uso.previsao !== null ? num(Math.round(v.uso.previsao)) : 'após o 3º dia', v.uso.previsao !== null && v.uso.previsao > p.creditos ? 'acima do plano' : 'no ritmo atual'],
    ['Créditos adicionais disponíveis', num(Math.round(p.pacoteDisponivel)), p.pacoteDisponivel ? 'Capacity Pack · usado depois do plano' : 'nenhum'],
    ['Renovação', new Date(`${p.renova}T12:00:00`).toLocaleDateString('pt-BR'), p.fase === 'reserva' ? 'hoje só o nível Rápido' : p.fase === 'esgotado' ? 'envio pausado' : ''],
  ]) + `<div class="barra ${p.percentual >= 100 ? 'erro' : p.percentual >= 80 ? 'atencao' : ''}" role="progressbar" aria-label="Créditos do plano usados" aria-valuenow="${p.percentual}" aria-valuemin="0" aria-valuemax="100"><span style="width:${p.percentual}%"></span></div>`
    : faixa([
      [emCreditos() ? 'Créditos usados' : 'Custo de IA no mês', fmtCusto(v.uso.custo), `${num(v.uso.respostas)} respostas`],
      ['Previsão para o mês', v.uso.previsao !== null ? fmtCusto(v.uso.previsao) : 'após o 3º dia', 'no ritmo atual'],
      ['Teto mensal', v.uso.tetoMensal ? fmtCusto(v.uso.tetoMensal) : 'sem teto', ''],
    ]);

  const r = v.resultado, a = v.adocao, av = r.avaliacoes;
  const totalAv = av.serviu + av.ajustes + av.nao_serviu;
  const registros = v.atencao.filter(x => ['governanca', 'politica'].includes(x.tipo));
  const atuais = v.atencao.filter(x => !['governanca', 'politica'].includes(x.tipo));
  const listaAtencao = itens => `<div class="lista">${itens.map(x => `<a class="lista-item" href="${esc(x.link)}"><span class="principal-texto"><b>${esc(x.texto)}</b>${x.acao ? `<br><span class="dica">${esc(x.acao)}</span>` : ''}</span><span class="dica">Abrir</span></a>`).join('')}</div>`;
  $('principal').innerHTML = `${cabecalho('Visão geral', `<span class="dica">${MESES[Number(mes) - 1]} de ${ano}</span>`)}
    <div class="pagina"><div class="pagina-dentro">
      ${passos.length ? `<div class="secao-titulo" style="margin-top:0"><h2>Preparar o ambiente</h2><span class="dica">${prontos} de ${passos.length} ${prontos === 1 ? 'pronto' : 'prontos'}</span><a class="btn-texto btn-pequeno" href="#/preparacao">Ver todos os passos</a></div>
        ${faltam.length ? `<div class="lista">${faltam.map(x => `<div class="lista-item"><span class="principal-texto"><b>${esc(x.titulo)}</b><br><span class="dica">Falta fazer</span></span><a class="btn btn-linha btn-pequeno" href="${esc(x.href)}">Fazer agora</a></div>`).join('')}</div>`
          : '<p class="dica">Tudo pronto. Os passos continuam em Preparar o ambiente para conferir quando algo mudar.</p>'}` : ''}

      <div class="secao-titulo"><h2>Atenção agora</h2><a class="btn-texto btn-pequeno" href="#/pendencias">Ver pendências</a></div>
      ${atuais.length ? listaAtencao(atuais)
        : '<div class="lista"><div class="lista-item"><span class="dica">Nada pede ação agora.</span></div></div>'}
      ${registros.length ? `<details class="qw-acompanhamento"><summary>Registros anteriores de governança (${registros.length})</summary><p class="dica">Ocorrências registradas, que podem já ter sido tratadas. Bloqueios de dados correspondem a este mês; alertas de governança, aos últimos 7 dias. Confira o estado atual antes de alterar configurações.</p>${listaAtencao(registros)}</details>` : ''}

      <div class="secao-titulo"><h2>Uso do mês</h2><a class="btn-texto btn-pequeno" href="#/uso">Ver uso e créditos</a></div>
      ${usoMes}${p && !p.ilimitado && v.uso.previsao > p.creditos ? '<div class="faixa-aviso atencao"><p>No ritmo atual, o uso pode ultrapassar os créditos do plano. Confira o consumo antes de ajustar limites.</p><a class="btn btn-linha" href="#/uso">Conferir uso e créditos</a></div>' : ''}

      <div class="secao-titulo"><h2>Adoção</h2></div>
      ${faixa([
        ['Pessoas ativas', num(a.pessoasAtivas), `de ${num(a.pessoasCadastradas)} cadastradas`],
        ['Áreas ativas', num(a.areasAtivas), `de ${num(a.areasCadastradas)}`],
        ['Quick Wins em circulação', num(a.quickWinsEmCirculacao), 'em teste, em uso ou aprovados'],
        ['Execuções de Quick Win', num(a.execucoes), `${num(a.conversas)} conversas no total`],
      ])}

      <div class="secao-titulo"><h2>Resultados</h2><a class="btn-texto btn-pequeno" href="#/quick-wins">Ver Quick Wins</a></div>
      <p class="dica">Estados vêm do cadastro dos Quick Wins. Avaliações são informadas pelos usuários; medições de benefício são registradas pela equipe.</p>${faixa([
        ['Em teste', num(r.porStatus.em_teste), ''],
        ['Aprovados ou em expansão', num((r.porStatus.aprovado || 0) + (r.porStatus.em_expansao || 0)), ''],
        ['Descartados', num(r.porStatus.descartado), ''],
        ['Avaliações no mês', num(totalAv), totalAv ? `${Math.round(av.serviu / totalAv * 100)}% serviu, ${Math.round(av.ajustes / totalAv * 100)}% com ajustes` : 'nenhuma ainda'],
        ['Medições com antes e depois', num(r.medicoesCompletas), `${num(r.decisoesNoMes)} decisões no mês`],
      ])}

      <div class="secao-titulo"><h2>Concentração do uso</h2></div>
      <div class="grade-2">
        <div><p class="rotulo">Áreas</p>${barras(v.concentracao.areas, x => x.nome)}</div>
        <div><p class="rotulo">Quick Wins</p>${barras(v.concentracao.quickWins, x => x.nome)}</div>
        <div><p class="rotulo">Pessoas</p>${barras(v.concentracao.pessoas, x => x.nome)}</div>
        <div><p class="rotulo">Níveis de IA</p>${barras(v.concentracao.classes, x => CLASSES[x.classe] || x.classe)}</div>
      </div>
      <p class="dica" style="margin-top:14px">${emCreditos() ? 'Valores em créditos.' : 'Valores em dólar, pelo custo informado em cada resposta.'} Conversas de teste de Quick Win não entram na adoção.</p>
    </div></div>`;
  ligarCabecalho();
}
