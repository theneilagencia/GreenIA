// Visão geral: a primeira tela da Administração responde "o que faço agora?". No alto, UM próximo passo (da
// preparação do ambiente ou do que pede atenção), com um botão. A preparação inteira (antes "Preparar o ambiente")
// fica logo abaixo, recolhida, e some da frente quando tudo está pronto. Depois, mais calmos, os números do mês.
import { api, emCreditos, esc, fmtCusto } from '/comum.js';
import { cabecalho, ligarCabecalho, pode } from '/app.js';
import { botaoRevelar, topoTela } from '/admin-ui.js';

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

// Cartão do próximo passo: uma frase, uma explicação curta e uma ação.
const cartaoProximo = ({ rotulo, titulo, texto, href, botao }) => `<section class="adm-proximo" aria-labelledby="adm-proximo-titulo">
  <div class="adm-proximo-texto"><span class="adm-proximo-rotulo">${esc(rotulo)}</span><h2 id="adm-proximo-titulo">${esc(titulo)}</h2>${texto ? `<p>${esc(texto)}</p>` : ''}</div>
  <a class="btn btn-verde" href="${esc(href)}">${esc(botao)}</a></section>`;

export async function vistaGeral() {
  // A preparação do ambiente tem uma só fonte (/api/acompanhamento). Os números do mês exigem usage.read.
  const verUso = pode('usage.read');
  const [v, prep] = await Promise.all([verUso ? api('/api/admin/visao-geral') : null, api('/api/acompanhamento').catch(() => null)]);
  const passos = prep?.passos || [];
  const prontos = passos.filter(x => x.pronto).length, faltam = passos.filter(x => !x.pronto && !x.opcional);
  const atencao = v?.atencao || [];
  const registros = atencao.filter(x => ['governanca', 'politica'].includes(x.tipo));
  const atuais = atencao.filter(x => !['governanca', 'politica'].includes(x.tipo));
  const [ano, mes] = (v?.mes || new Date().toISOString().slice(0, 7)).split('-');

  // 1. O que fazer agora: o primeiro passo que falta da preparação; sem passo pendente, a primeira coisa que pede atenção.
  const proximo = faltam[0];
  const topoCartao = proximo ? cartaoProximo({ rotulo: `Próximo passo · ${passos.indexOf(proximo) + 1} de ${passos.length}`, titulo: proximo.titulo, texto: proximo.descricao, href: proximo.href, botao: proximo.botao || 'Fazer agora' })
    : atuais[0] ? cartaoProximo({ rotulo: 'Pede atenção agora', titulo: atuais[0].texto, texto: atuais[0].acao || '', href: atuais[0].link, botao: atuais[0].botao || 'Resolver' })
      : '<p class="adm-tudo-certo">Tudo em ordem. Nada pede ação agora.</p>';
  const outrasAtencoes = proximo ? atuais : atuais.slice(1);
  const abrirPassos = new URLSearchParams(location.hash.split('?')[1] || '').get('passos') === '1';
  const listaAtencao = itens => `<div class="lista">${itens.map(x => `<a class="lista-item" href="${esc(x.link)}"><span class="principal-texto"><b>${esc(x.texto)}</b>${x.acao ? `<span class="dica">${esc(x.acao)}</span>` : ''}</span><span class="dica">Abrir</span></a>`).join('')}</div>`;

  const preparacao = passos.length ? `<div class="secao-titulo adm-preparacao-topo" id="preparacao"><h2>Preparar o ambiente <span class="dica">${prontos} de ${passos.length} ${prontos === 1 ? 'pronto' : 'prontos'}</span></h2>
      ${botaoRevelar('prep-passos', prontos === passos.length ? 'Conferir os passos' : 'Ver todos os passos', abrirPassos)}</div>
    <ol class="acomp-passos adm-passos" id="prep-passos" ${abrirPassos ? '' : 'hidden'}>${passos.map((p, i) => `<li><span class="passo${p.pronto ? ' feito' : ''}" aria-hidden="true">${i + 1}</span><div><h3>${esc(p.titulo)}</h3><p>${esc(p.descricao)}</p>
      <span class="selo${p.pronto ? ' selo-verde' : ''}">${p.pronto ? 'Pronto' : p.opcional ? 'Opcional, se o trabalho precisar' : 'Falta fazer'}</span></div>
      <a class="btn btn-linha btn-pequeno" href="${esc(p.href)}">${p.pronto ? 'Conferir' : 'Fazer agora'}</a></li>`).join('')}</ol>` : '';

  let numeros = '';
  if (v) {
    const p = v.uso.plano;
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
    // Um aviso só, e só com ação: o uso pode passar dos créditos do plano.
    const acimaDoPlano = p && !p.ilimitado && v.uso.previsao > p.creditos;
    numeros = `
      <div class="secao-titulo"><h2>Uso do mês</h2><a class="btn-texto btn-pequeno" href="#/uso">Ver uso e créditos</a></div>
      ${usoMes}${acimaDoPlano ? '<div class="faixa-aviso atencao"><p>No ritmo atual, o uso pode ultrapassar os créditos do plano.</p><a class="btn btn-linha" href="#/uso">Conferir uso e créditos</a></div>' : ''}

      <div class="secao-titulo"><h2>Adoção</h2></div>
      ${faixa([
        ['Pessoas ativas', num(a.pessoasAtivas), `de ${num(a.pessoasCadastradas)} cadastradas`],
        ['Áreas ativas', num(a.areasAtivas), `de ${num(a.areasCadastradas)}`],
        ['Quick Wins em circulação', num(a.quickWinsEmCirculacao), 'em teste, em uso ou aprovados'],
        ['Execuções de Quick Win', num(a.execucoes), `${num(a.conversas)} conversas no total`],
      ])}

      <div class="secao-titulo"><h2>Resultados</h2><a class="btn-texto btn-pequeno" href="#/quick-wins">Ver Quick Wins</a></div>
      ${faixa([
        ['Em teste', num(r.porStatus.em_teste), ''],
        ['Aprovados ou em expansão', num((r.porStatus.aprovado || 0) + (r.porStatus.em_expansao || 0)), ''],
        ['Descartados', num(r.porStatus.descartado), ''],
        ['Avaliações no mês', num(totalAv), totalAv ? `${Math.round(av.serviu / totalAv * 100)}% serviu, ${Math.round(av.ajustes / totalAv * 100)}% com ajustes` : 'nenhuma ainda'],
        ['Medições com antes e depois', num(r.medicoesCompletas), `${num(r.decisoesNoMes)} decisões no mês`],
      ])}

      <div class="secao-titulo"><h2>Concentração do uso</h2><span class="dica">${emCreditos() ? 'em créditos' : 'em dólar'}</span></div>
      <div class="grade-2">
        <div><p class="rotulo">Áreas</p>${barras(v.concentracao.areas, x => x.nome)}</div>
        <div><p class="rotulo">Quick Wins</p>${barras(v.concentracao.quickWins, x => x.nome)}</div>
        <div><p class="rotulo">Pessoas</p>${barras(v.concentracao.pessoas, x => x.nome)}</div>
        <div><p class="rotulo">Níveis de IA</p>${barras(v.concentracao.classes, x => CLASSES[x.classe] || x.classe)}</div>
      </div>`;
  }

  $('principal').innerHTML = `${cabecalho('Visão geral')}
    <div class="pagina"><div class="pagina-dentro adm-visao">
      ${topoTela(v ? `O que fazer agora e como a empresa usa a IA em ${MESES[Number(mes) - 1]} de ${ano}.` : 'O que fazer agora para preparar o ambiente.')}
      ${topoCartao}
      ${preparacao}
      ${outrasAtencoes.length || registros.length ? `<div class="secao-titulo"><h2>Também pede atenção</h2><a class="btn-texto btn-pequeno" href="#/pendencias">Ver pendências</a></div>
        ${outrasAtencoes.length ? listaAtencao(outrasAtencoes) : ''}
        ${registros.length ? `<div class="adm-mais">${botaoRevelar('registros-governanca', `Registros anteriores de governança (${registros.length})`)}</div>
          <div id="registros-governanca" hidden><p class="dica">Ocorrências que podem já ter sido tratadas: confira o estado atual antes de alterar configurações.</p>${listaAtencao(registros)}</div>` : ''}` : ''}
      ${numeros}
    </div></div>`;
  ligarCabecalho();
  if (abrirPassos) $('preparacao')?.scrollIntoView({ block: 'start' });
}
