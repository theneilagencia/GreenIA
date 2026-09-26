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

export async function vistaGeral() {
  const v = await api('/api/admin/visao-geral');
  const [ano, mes] = v.mes.split('-');
  const p = v.uso.plano;
  const pendentes = v.implantacao.filter(e => !e.feito);

  const usoMes = p ? faixa([
    ['Créditos usados', num(Math.round(p.usados)), `${p.percentual}% dos ${num(p.creditos)} do plano`],
    ['Previsão para o mês', v.uso.previsao !== null ? num(Math.round(v.uso.previsao)) : 'após o 3º dia', v.uso.previsao !== null && v.uso.previsao > p.creditos ? 'acima do plano' : 'no ritmo atual'],
    ['Pacote extra disponível', num(Math.round(p.pacoteDisponivel)), p.pacoteDisponivel ? 'usado depois do plano' : 'nenhum'],
    ['Renovação', new Date(`${p.renova}T12:00:00`).toLocaleDateString('pt-BR'), p.fase === 'reserva' ? 'hoje só a classe Rápido' : p.fase === 'esgotado' ? 'envio pausado' : ''],
  ]) + `<div class="barra ${p.percentual >= 100 ? 'erro' : p.percentual >= 80 ? 'atencao' : ''}" role="progressbar" aria-label="Créditos do plano usados" aria-valuenow="${p.percentual}" aria-valuemin="0" aria-valuemax="100"><span style="width:${p.percentual}%"></span></div>`
    : faixa([
      [emCreditos() ? 'Créditos usados' : 'Custo de IA no mês', fmtCusto(v.uso.custo), `${num(v.uso.respostas)} respostas`],
      ['Previsão para o mês', v.uso.previsao !== null ? fmtCusto(v.uso.previsao) : 'após o 3º dia', 'no ritmo atual'],
      ['Teto mensal', v.uso.tetoMensal ? fmtCusto(v.uso.tetoMensal) : 'sem teto', ''],
    ]);

  const r = v.resultado, a = v.adocao, av = r.avaliacoes;
  const totalAv = av.serviu + av.ajustes + av.nao_serviu;
  $('principal').innerHTML = `${cabecalho('Visão geral', `<span class="dica">${MESES[Number(mes) - 1]} de ${ano}</span>`)}
    <div class="pagina"><div class="pagina-dentro">
      ${pendentes.length ? `<div class="secao-titulo" style="margin-top:0"><h3>Implantação</h3><span class="dica">${v.implantacao.length - pendentes.length} de ${v.implantacao.length} etapas concluídas</span></div>
        <div class="etapas">${v.implantacao.map((e, i) => `<a class="etapa" href="${e.link}"><span class="passo ${e.feito ? 'feito' : ''}" aria-hidden="true">${e.feito ? '✓' : i + 1}</span>
          <span class="t"><b>${esc(e.nome)}</b><span>${esc(e.texto)}</span></span><span class="dica">${e.feito ? 'Concluída' : 'Pendente'}</span></a>`).join('')}</div>` : ''}

      <div class="secao-titulo" ${pendentes.length ? '' : 'style="margin-top:0"'}><h3>Uso do mês</h3><a class="btn-texto btn-pequeno" href="#/uso">Ver uso e créditos</a></div>
      ${usoMes}

      <div class="secao-titulo"><h3>Atenção</h3></div>
      ${v.atencao.length ? `<div class="lista">${v.atencao.map(x => `<a class="lista-item" href="${x.link}"><span class="principal-texto"><b>${esc(x.texto)}</b></span><span class="dica">Abrir</span></a>`).join('')}</div>`
        : '<div class="lista"><div class="lista-item"><span class="dica">Nada pede ação agora.</span></div></div>'}

      <div class="secao-titulo"><h3>Adoção</h3></div>
      ${faixa([
        ['Pessoas ativas', num(a.pessoasAtivas), `de ${num(a.pessoasCadastradas)} cadastradas`],
        ['Áreas ativas', num(a.areasAtivas), `de ${num(a.areasCadastradas)}`],
        ['Quick wins em circulação', num(a.quickWinsEmCirculacao), 'em teste, em uso ou aprovados'],
        ['Execuções de quick win', num(a.execucoes), `${num(a.conversas)} conversas no total`],
      ])}

      <div class="secao-titulo"><h3>Resultado</h3><a class="btn-texto btn-pequeno" href="#/quick-wins">Ver quick wins</a></div>
      ${faixa([
        ['Em teste', num(r.porStatus.em_teste), ''],
        ['Aprovados ou em expansão', num((r.porStatus.aprovado || 0) + (r.porStatus.em_expansao || 0)), ''],
        ['Descartados', num(r.porStatus.descartado), ''],
        ['Avaliações no mês', num(totalAv), totalAv ? `${Math.round(av.serviu / totalAv * 100)}% serviu, ${Math.round(av.ajustes / totalAv * 100)}% com ajustes` : 'nenhuma ainda'],
        ['Medições com antes e depois', num(r.medicoesCompletas), `${num(r.decisoesNoMes)} decisões no mês`],
      ])}

      <div class="secao-titulo"><h3>Concentração do uso</h3></div>
      <div class="grade-2">
        <div><p class="rotulo">Áreas</p>${barras(v.concentracao.areas, x => x.nome)}</div>
        <div><p class="rotulo">Quick wins</p>${barras(v.concentracao.quickWins, x => x.nome)}</div>
        <div><p class="rotulo">Pessoas</p>${barras(v.concentracao.pessoas, x => x.nome)}</div>
        <div><p class="rotulo">Classes de modelo</p>${barras(v.concentracao.classes, x => CLASSES[x.classe] || x.classe)}</div>
      </div>
      <p class="dica" style="margin-top:14px">${emCreditos() ? 'Valores em créditos.' : 'Valores em dólar, pelo custo informado em cada resposta.'} Conversas de teste de quick win não entram na adoção.</p>
    </div></div>`;
  ligarCabecalho();
}
