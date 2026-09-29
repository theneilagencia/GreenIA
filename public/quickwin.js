// Quick wins: portfólio (o ciclo de adoção), página do quick win e configuração.
// Um quick win é uma unidade operacional de adoção de IA: problema, responsável,
// instruções, conhecimento, classe de modelo, uso, avaliação, resultado e decisão.
import { api, emCreditos, esc, fmtCusto, ICONE, toast } from '/comum.js';
import { E, cabecalho, ligarCabecalho, recarregarLateral, irPara } from '/app.js';
import { vistaConversa } from '/conversa.js';
import { assistenteQw, publicarQw, versoesQw, usarQw, testeQw } from '/quickwin2.js';
import { aviso, cabecalhoPg, estadoQw, estadoVazio, FORMATOS_SAIDA, ligarMenus, marcaQw, menuAcoes, seloQw } from '/qw-ui.js';
import { secaoMedicao } from '/medicao.js';

const $ = id => document.getElementById(id);
const FEEDBACK = { serviu: 'Serviu', ajustes: 'Serviu com ajustes', nao_serviu: 'Não serviu' };
const FORMATOS = { texto: 'Texto', lista: 'Lista', tabela: 'Tabela (baixa em CSV)', checklist: 'Checklist' };
const DADOS = { cpf: 'CPF', rg: 'RG', cnpj: 'CNPJ', email: 'Email pessoal (Gmail, Hotmail...)', telefone: 'Telefone', cep: 'CEP', endereco: 'Endereço', cartao: 'Cartão', banco: 'Dados bancários', pix: 'Chave PIX', pessoal_restrito: 'Dado pessoal restrito (disciplinar, remuneração individual)', sensivel: 'Dado pessoal sensível (saúde, biometria, religião...)', confidencial: 'Documento marcado como confidencial' };
// Tratamento proporcional: seguir normalmente, só com proteção (guardrails) ou não enviar.
const ACAO = { permitir: 'Processar normalmente', proteger: 'Só com proteção', bloquear: 'Não enviar' };
const EFEITO = { permitir: 'Segue as regras gerais; a conversa não vira sigilosa', proteger: 'A conversa vira sigilosa: segue só com os guardrails', bloquear: 'Não é enviado; a pessoa vê o motivo' };
const seletorAcao = (nome, rotulo, atual) => `<span class="segmento" role="radiogroup" aria-label="${rotulo}">${Object.entries(ACAO).map(([v, r]) => `<label><input type="radio"${v === 'bloquear' ? ' class="perigo"' : ''} name="${nome}" value="${v}" ${atual === v ? 'checked' : ''}><span>${r}</span></label>`).join('')}</span>`;
const CORES = ['#1B7950', '#0F6E8C', '#5B4B8A', '#8C621D', '#7A3E2E', '#2F6B3B', '#3E5C76', '#9B4029'];
export const ESTADOS = { identificado: 'Identificado', em_configuracao: 'Em configuração', em_teste: 'Em teste', em_uso: 'Em uso', em_avaliacao: 'Em avaliação', aprovado: 'Aprovado', em_expansao: 'Em expansão', descartado: 'Descartado' };
const EXPLICA = { identificado: 'Uso possível registrado, ainda sem configuração', em_configuracao: 'Sendo configurado; só quem gere usa', em_teste: 'Disponível para a área, em piloto',
  em_uso: 'Disponível e em uso no dia a dia', em_avaliacao: 'Em uso, aguardando decisão', aprovado: 'Decisão tomada: manter', em_expansao: 'Decisão tomada: levar para mais áreas', descartado: 'Fora de circulação; o histórico fica' };
const EM_CIRCULACAO = ['em_teste', 'em_uso', 'em_avaliacao', 'aprovado', 'em_expansao'];
const CLASSES = { rapido: 'Rápido', equilibrado: 'Equilibrado', avancado: 'Avançado' };
export const seloEstado = st => `<span class="selo ${st === 'descartado' ? 'selo-cinza' : EM_CIRCULACAO.includes(st) ? 'selo-verde' : ''}">${ESTADOS[st] || st}</span>`;
const classeDoQw = modelo => (/^classe:/.test(modelo || '') ? CLASSES[modelo.slice(7)] : modelo ? 'Modelo específico' : 'Sem classe');
const dataCurta = iso => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });

export async function rotaQuickWin(hash) {
  let m;
  if (hash === '#/quick-wins') return listaQuickWins();
  if (hash === '#/qw/nova') return assistenteQw();
  if (hash === '#/qw/nova/modelos') return novaOrigem();
  if ((m = /^#\/qw\/(\d+)\/ajustar$/.exec(hash))) return assistenteQw(Number(m[1]));
  if ((m = /^#\/qw\/(\d+)\/publicar$/.exec(hash))) return publicarQw(Number(m[1]));
  if ((m = /^#\/qw\/(\d+)\/versoes$/.exec(hash))) return versoesQw(Number(m[1]));
  if ((m = /^#\/qw\/(\d+)\/editar$/.exec(hash))) return configurar(Number(m[1]));
  if ((m = /^#\/qw\/(\d+)\/teste$/.exec(hash))) { const q = await api(`/api/quick-wins/${m[1]}`); return q.v2 ? testeQw(q) : vistaConversa({ qw: q, teste: true }); }
  if ((m = /^#\/qw\/(\d+)\/usar$/.exec(hash))) return usarQw(Number(m[1]));
  if ((m = /^#\/qw\/(\d+)\/nova$/.exec(hash))) return vistaConversa({ qw: await api(`/api/quick-wins/${m[1]}`) });
  if ((m = /^#\/qw\/(\d+)$/.exec(hash))) return paginaQuickWin(Number(m[1]));
  irPara('#/nova');
}

// Biblioteca: os trabalhos prontos que a pessoa pode executar e, para quem gere, os que estão em preparo.
// O acompanhamento de uso (ciclo de adoção, custo, avaliação) fica recolhido, para quem precisa dele.
async function listaQuickWins() {
  const gere = E.eu.admin || E.eu.areas.some(a => a.responsavel) || E.podeCriarQw;
  const [{ quickWins }, port] = await Promise.all([api('/api/quick-wins'), gere ? api('/api/quick-wins/portfolio') : Promise.resolve(null)]);
  // Estado de publicação e versão vêm do detalhe de cada um (lista curta por empresa).
  const detalhes = await Promise.all(quickWins.map(q => api(`/api/quick-wins/${q.id}`).catch(() => ({ ...q }))));
  const ordem = { publicado: 0, teste: 1, rascunho: 2, arquivado: 3 };
  const itens = detalhes.map(q => ({ ...q, estado: estadoQw(q) })).sort((a, b) => ordem[a.estado.id] - ordem[b.estado.id] || a.nome.localeCompare(b.nome, 'pt-BR'));
  const ativos = itens.filter(q => q.estado.id !== 'arquivado'), arquivados = itens.filter(q => q.estado.id === 'arquivado');
  const prontos = ativos.filter(q => q.estado.id === 'publicado'), preparo = ativos.filter(q => q.estado.id !== 'publicado');
  const cta = E.podeCriarQw ? `<a class="btn btn-verde" href="#/qw/nova">${ICONE.mais} Criar Quick Win</a>` : '';
  const cont = st => (port?.quickWins || []).filter(q => q.status === st).length;
  const bloco = (titulo, lista, dica = '') => (lista.length ? `<section class="qw-bloco" aria-labelledby="t-${titulo.length}">
      <div class="qw-lista-cabeca"><h3 id="t-${titulo.length}">${esc(titulo)}</h3>${dica ? `<span class="dica">${esc(dica)}</span>` : ''}</div>
      <ul class="qw-lista">${lista.map(itemQw).join('')}</ul></section>` : '');
  $('principal').innerHTML = `${cabecalho('Quick Wins')}
    <div class="pagina"><div class="pg larga">
      ${cabecalhoPg({ titulo: 'Quick Wins', descricao: 'Trabalhos que sua equipe pode executar com a IA seguindo regras definidas.', lado: ativos.length ? cta : '' })}
      ${!ativos.length ? estadoVazio({
        titulo: E.podeCriarQw ? 'Crie um trabalho que sua equipe poderá repetir com segurança.' : 'Ainda não há Quick Wins disponíveis para você.',
        texto: E.podeCriarQw ? 'Descreva o que precisa ser feito, defina as regras e teste antes de colocar em uso.' : 'Quando alguém da sua área publicar um Quick Win, ele aparece aqui.',
        cta: E.podeCriarQw ? `<a class="btn btn-verde btn-grande" href="#/qw/nova">Criar meu primeiro Quick Win</a>` : '',
        exemplos: E.podeCriarQw ? [['Analisar propostas', 'Aponta valores, prazos, riscos e o que falta.'], ['Comparar documentos', 'Mostra item por item o que não bate.'], ['Preparar reuniões', 'Monta pauta, pontos de atenção e perguntas.']] : [],
      }) : ''}
      ${bloco(gere ? 'Publicados' : 'Disponíveis para você', prontos)}
      ${bloco('Em preparo', preparo, 'Só quem gerencia vê e usa')}
      ${arquivados.length ? `<details class="qw-acompanhamento"><summary>Arquivados (${arquivados.length})</summary><ul class="qw-lista" style="margin-top:14px">${arquivados.map(itemQw).join('')}</ul></details>` : ''}
      ${port?.quickWins.length ? `<details class="qw-acompanhamento"><summary>Acompanhamento de uso</summary>
        <div class="ciclo" style="margin-top:16px">
          <div><b>Identificar</b><span>${cont('identificado')} identificados</span></div>
          <div><b>Testar</b><span>${cont('em_configuracao') + cont('em_teste')} em configuração ou teste</span></div>
          <div><b>Medir</b><span>${cont('em_uso') + cont('em_avaliacao')} em uso ou avaliação</span></div>
          <div><b>Decidir</b><span>${cont('aprovado')} aprovados, ${cont('descartado')} descartados</span></div>
          <div><b>Ampliar</b><span>${cont('em_expansao')} em expansão</span></div>
        </div>
        <div class="tabela-rolagem" style="margin-top:14px"><table class="tabela tabela-empilha"><thead><tr><th>Quick Win</th><th>Onde</th><th>Responsável</th>
          <th class="num">Execuções no mês</th><th class="num">${emCreditos() ? 'Créditos no mês' : 'Custo no mês'}</th><th class="num">Por execução</th><th class="num">Serviu</th><th>Medição</th></tr></thead><tbody>
          ${port.quickWins.map(q => `<tr><td data-r="Quick Win"><a href="#/qw/${q.id}"><b>${esc(q.nome)}</b></a></td>
            <td data-r="Onde">${esc(q.onde || '')}</td><td data-r="Responsável">${q.responsavel ? esc(q.responsavel) : '<span class="dica">sem responsável</span>'}</td>
            <td class="num" data-r="Execuções">${q.execucoes}</td><td class="num" data-r="${emCreditos() ? 'Créditos' : 'Custo'}">${fmtCusto(q.custo)}</td><td class="num" data-r="Por execução">${q.custoPorExecucao === null ? '—' : fmtCusto(q.custoPorExecucao)}</td>
            <td class="num" data-r="Serviu">${q.aceitacao === null ? '<span class="dica">sem avaliação</span>' : `${q.aceitacao}% de ${q.avaliadas}`}</td>
            <td data-r="Medição">${q.medicoes ? `${q.medicoes} com antes e depois` : '<span class="dica">nenhuma</span>'}</td></tr>`).join('')}
        </tbody></table></div></details>` : ''}
    </div></div>`;
  ligarCabecalho();
  ligarMenus();
  ligarAcoesQw($('principal'), itens, listaQuickWins);
}

// Uma linha da biblioteca: marca, nome, descrição, estado e, quando faz sentido, a versão.
const usarHref = q => (q.v2 ? `#/qw/${q.id}/usar` : `#/qw/${q.id}/nova`);
function itemQw(q) {
  const e = q.estado || estadoQw(q);
  const meta = q.v2 && q.versao ? `v${q.versao}${q.podeEditar && q.rascunho_alterado ? ' · alterações em rascunho' : ''}` : '';
  const podeUsar = e.id === 'publicado' || (q.podeEditar && e.id !== 'arquivado');
  return `<li class="qw-item">${marcaQw(q)}
    <a class="qw-item-link" href="#/qw/${q.id}"><span class="qw-item-nome">${esc(q.nome)}</span><span class="qw-item-desc">${esc(q.para_que_serve || '')}</span></a>
    <div class="qw-item-lado">${meta ? `<span class="qw-item-meta">${esc(meta)}</span>` : ''}${seloQw(q)}</div>
    <div class="qw-item-acoes">${podeUsar ? `<a class="btn btn-linha btn-pequeno" href="${usarHref(q)}" aria-label="Usar ${esc(q.nome)}">Usar</a>` : ''}
      ${menuAcoes(acoesQw(q), `Mais ações para ${q.nome}`)}</div></li>`;
}
function acoesQw(q, { naPagina = false } = {}) {
  const e = q.estado || estadoQw(q), out = [];
  if (!naPagina) out.push({ rotulo: 'Abrir', href: `#/qw/${q.id}` });
  if (q.podeEditar && e.id !== 'arquivado') out.push({ rotulo: 'Editar', href: q.v2 ? `#/qw/${q.id}/ajustar` : `#/qw/${q.id}/editar` });
  if (q.podeEditar && q.v2 && e.id !== 'arquivado') out.push({ rotulo: 'Testar', href: `#/qw/${q.id}/teste` });
  if (E.podeCriarQw) out.push({ rotulo: 'Duplicar', acao: 'duplicar', id: q.id });
  if (q.podeEditar && q.v2 && q.versao) out.push({ rotulo: 'Ver versões', href: `#/qw/${q.id}/versoes` });
  if (q.podeEditar && q.v2) out.push({ rotulo: 'Acesso e dados', href: `#/qw/${q.id}/editar` });
  if (q.podeEditar && e.id !== 'arquivado') out.push({ rotulo: 'Arquivar', acao: 'arquivar', id: q.id, perigo: true });
  return out;
}
function ligarAcoesQw(raiz, itens, recarregar) {
  raiz.addEventListener('click', async ev => {
    const b = ev.target.closest('[data-acao]');
    if (!b) return;
    const q = itens.find(x => String(x.id) === b.dataset.id);
    if (!q) return;
    b.closest('details')?.removeAttribute('open');
    try {
      if (b.dataset.acao === 'duplicar') {
        const areas = q.areas?.length ? q.areas : E.permQw.areas.slice(0, 1).map(a => a.id);
        const novo = await api('/api/quick-wins', { metodo: 'POST', corpo: { duplicar_de: q.id, areas, toda_empresa: !areas.length && E.permQw.todaEmpresa } });
        await recarregarLateral();
        toast('Cópia criada como rascunho.');
        irPara(`#/qw/${novo.id}`);
      }
      if (b.dataset.acao === 'arquivar') {
        if (!confirm(`Arquivar "${q.nome}"? Ele sai da lista da equipe; o histórico fica guardado.`)) return;
        await api(`/api/quick-wins/${q.id}`, { metodo: 'PUT', corpo: { status: 'descartado' } });
        await recarregarLateral();
        toast('Quick Win arquivado.');
        recarregar(q.id);
      }
    } catch (e) { toast(e.message, 6000); }
  });
}

// Detalhe: o que ele faz, regras, formato, último teste e versão. Ações principais: Usar e Editar.
async function paginaQuickWin(id) {
  const [qw, lista] = await Promise.all([api(`/api/quick-wins/${id}`), api(`/api/conversas?quick_win=${id}`)]);
  const e = estadoQw(qw);
  const podeUsar = e.id === 'publicado' || (qw.podeEditar && e.id !== 'arquivado');
  const editar = qw.podeEditar && e.id !== 'arquivado' ? `<a class="btn btn-linha" href="${qw.v2 ? `#/qw/${id}/ajustar` : `#/qw/${id}/editar`}">Editar</a>` : '';
  const meta = [seloQw(qw), qw.v2 && qw.versao ? `<span>Versão publicada: v${qw.versao}</span>` : '', qw.v2 && qw.versao && qw.podeEditar && qw.rascunho_alterado ? `<span>Rascunho em edição: v${qw.versao + 1}</span>` : '',
    qw.sigiloso ? '<span class="selo selo-sigilosa">Trata dados sigilosos</span>' : ''].filter(Boolean).join('');
  const secao = (rotulo, conteudo) => (conteudo ? `<div class="secao"><div class="secao-rotulo">${rotulo}</div><div class="secao-conteudo">${conteudo}</div></div>` : '');
  const regras = qw.v2 ? qw.regras : null;
  const aviso2 = !qw.v2 || !qw.podeEditar || e.id === 'arquivado' ? ''
    : !qw.versao ? aviso('<b>Ainda não está disponível para a equipe.</b> Teste e publique quando estiver pronto.', 'info', `<a class="btn btn-linha btn-pequeno" href="#/qw/${id}/teste">Testar</a><a class="btn btn-verde btn-pequeno" href="#/qw/${id}/publicar">Publicar</a>`)
    : qw.rascunho_alterado ? aviso(`<b>Há alterações em rascunho (v${qw.versao + 1}).</b> A equipe continua usando a v${qw.versao} até você publicar.`, 'info', `<a class="btn btn-linha btn-pequeno" href="#/qw/${id}/ajustar">Continuar editando</a><a class="btn btn-verde btn-pequeno" href="#/qw/${id}/teste">Testar e publicar</a>`) : '';
  $('principal').innerHTML = `${cabecalho('Quick Wins')}
    <div class="pagina"><div class="pg">
      ${cabecalhoPg({ trilha: [['Quick Wins', '#/quick-wins'], [qw.nome]], titulo: qw.nome, meta,
        lado: `${podeUsar ? `<a class="btn btn-verde" href="${usarHref(qw)}">Usar</a>` : ''}${editar}${menuAcoes(acoesQw(qw, { naPagina: true }).filter(a => a.rotulo !== 'Editar'), 'Mais ações')}` })}
      ${aviso2}
      <div class="secoes">
        ${secao('O que ele faz', `${esc(qw.para_que_serve || '')}${qw.v2 && qw.podeEditar && qw.assistente?.descricao ? `<span class="dica">Pedido original: ${esc(qw.assistente.descricao)}</span>` : !qw.v2 && qw.objetivo ? `<span class="dica">Objetivo: ${esc(qw.objetivo)}</span>` : ''}`)}
        ${!qw.v2 && qw.problema ? secao('Problema que resolve', esc(qw.problema)) : ''}
        ${qw.v2 ? secao('Regras', (regras || []).length ? `<ul>${regras.map(r => `<li>${esc(r)}</li>`).join('')}</ul>` : '') : ''}
        ${secao('Formato do resultado', qw.v2 ? esc(FORMATOS_SAIDA[qw.formato_saida]?.rotulo || '') : esc(FORMATOS[qw.formato] || ''))}
        ${qw.v2 && qw.podeEditar ? secao('Último teste', qw.ultimo_teste ? `${esc(RESUMO_TESTE[qw.ultimo_teste.status] || '')}<span class="dica">${dataCurta(qw.ultimo_teste.em)}</span>` : '<span class="dica">Ainda não testado.</span>') : ''}
        ${qw.v2 ? secao('Versão publicada', qw.versao ? `v${qw.versao}${qw.podeEditar ? ` <a class="link-sutil" href="#/qw/${id}/versoes" style="margin-left:8px">Ver versões</a>` : ''}` : '<span class="dica">Ainda não publicado.</span>') : ''}
        ${!qw.v2 ? secao('Estado', `${ESTADOS[qw.status]} <span class="dica">${EXPLICA[qw.status]}</span>`) : ''}
        ${!qw.v2 ? secao('Responsável', qw.responsavel ? esc(qw.responsavel.nome) : '<span class="dica">Sem responsável</span>') : ''}
      </div>
      ${!qw.v2 && (qw.sugestoes || []).length ? `<section class="qw-bloco"><div class="qw-lista-cabeca"><h3>Para começar</h3></div><div class="sugestoes">${qw.sugestoes.map((s, i) => `<button type="button" data-sug="${i}">${esc(s)}</button>`).join('')}</div></section>` : ''}
      <section class="qw-bloco" aria-labelledby="t-exec"><div class="qw-lista-cabeca"><h3 id="t-exec">Suas execuções</h3><span class="dica">Só você vê. Ficam salvas por até ${E.retencaoDias} dias sem uso.</span></div>
        ${lista.conversas.length ? `<ul class="execucoes">${lista.conversas.map(c => `<li>
          <a class="execucao" href="#/c/${c.id}"><b>${esc(c.titulo)}</b><span>${dataCurta(c.atualizado_em)} · ${c.feedback ? FEEDBACK[c.feedback] : c.tem_resposta ? 'sem retorno ainda' : 'sem resposta'}${c.sigilosa ? ' · Sigilosa' : ''}</span></a>
          <button class="icone-btn" data-renomear="${c.id}" aria-label="Renomear ${esc(c.titulo)}" title="Renomear">${ICONE.lapis}</button>
          <button class="icone-btn" data-apagar="${c.id}" aria-label="Apagar ${esc(c.titulo)}" title="Apagar">${ICONE.lixo}</button></li>`).join('')}</ul>`
          : `<p class="dica">Nenhuma execução ainda.${podeUsar ? ` <a class="link-sutil" href="${usarHref(qw)}">Usar agora</a>` : ''}</p>`}
      </section>
      ${qw.podeEditar && !qw.v2 ? '<section id="medicao-qw" class="qw-bloco" aria-label="Medição"></section>' : ''}
    </div></div>`;
  ligarCabecalho();
  ligarMenus();
  ligarAcoesQw($('principal'), [{ ...qw, estado: e }], () => paginaQuickWin(id));
  if (qw.podeEditar && !qw.v2) secaoMedicao($('medicao-qw'), id).catch(err => { $('medicao-qw').innerHTML = `<p class="dica">${esc(err.message)}</p>`; });
  document.querySelectorAll('[data-sug]').forEach(b => { b.onclick = async () => { await vistaConversa({ qw }); const t = $('entrada'); t.value = b.textContent; t.dispatchEvent(new Event('input')); t.focus(); history.replaceState(null, '', `#/qw/${id}/nova`); }; });
  document.querySelectorAll('[data-renomear]').forEach(b => { b.onclick = async () => {
    const atual = lista.conversas.find(c => String(c.id) === b.dataset.renomear);
    const novo = prompt('Novo nome da conversa:', atual.titulo);
    if (novo) { await api(`/api/conversas/${atual.id}`, { metodo: 'PATCH', corpo: { titulo: novo } }); paginaQuickWin(id); }
  }; });
  document.querySelectorAll('[data-apagar]').forEach(b => { b.onclick = async () => {
    if (!confirm('Apagar esta conversa e os anexos? Não dá para desfazer.')) return;
    await api(`/api/conversas/${b.dataset.apagar}`, { metodo: 'DELETE' }); toast('Conversa apagada.'); paginaQuickWin(id);
  }; });
}
const RESUMO_TESTE = { aprovado: 'Resultado conferido', corrigido: 'Resultado conferido, com ajuste automático', parcial: '◐ Conferência incompleta', inconsistente: 'Pontos para revisar', pergunta: 'A IA pediu mais informação' };

// Criar: do zero, de um modelo inicial ou duplicando um existente.
async function novaOrigem() {
  const { modelos } = await api('/api/quick-wins/modelos-iniciais');
  const minhas = E.permQw.areas;
  const existentes = E.quickWins;
  $('principal').innerHTML = `${cabecalho('Registrar quick win')}
    <div class="pagina"><div class="pagina-dentro">
      <p class="lead">Comece de um modelo pronto ou duplique um Quick Win existente. Prefere descrever o trabalho com suas palavras? <a href="#/qw/nova">Criar em 5 etapas</a>.</p>
      <div class="grupo-form"><h3>Para qual área</h3>
        <div class="opcoes">${minhas.map((a, i) => `<label><input type="checkbox" name="area" value="${a.id}" ${i === 0 ? 'checked' : ''}> ${esc(a.nome)}</label>`).join('') || '<span class="dica">Você não pode criar quick wins em nenhuma área.</span>'}
        ${E.permQw.todaEmpresa ? '<label><input type="checkbox" id="toda"> Toda a empresa</label>' : ''}</div><p></p></div>
      <h3>Começar do zero</h3><div class="linha-botoes"><button class="btn btn-verde" id="do-zero">Quick win em branco</button></div>
      <h3>Começar de um modelo</h3><div class="lista">${modelos.map((m, i) => `<button class="lista-item" data-modelo="${i}"><span class="passo" style="background:${esc(m.cor)};color:#fff;margin:0;width:32px;height:32px;font-size:13px">${esc(m.icone)}</span>
        <span class="principal-texto"><b>${esc(m.nome)}</b><span>${esc(m.para_que_serve)}</span></span></button>`).join('')}</div>
      ${existentes.length ? `<h3>Duplicar um existente</h3><div class="lista">${existentes.map(q => `<button class="lista-item" data-duplicar="${q.id}"><span class="cor" style="width:12px;height:12px;border-radius:3px;background:${esc(q.cor)}"></span>
        <span class="principal-texto"><b>${esc(q.nome)}</b><span>Copia instruções, arquivos e configuração. Nunca as conversas.</span></span></button>`).join('')}</div>` : ''}
    </div></div>`;
  ligarCabecalho();
  const criar = async extra => {
    const toda = $('toda')?.checked || false;
    const areasSel = [...document.querySelectorAll('input[name=area]:checked')].map(i => Number(i.value));
    try {
      const q = await api('/api/quick-wins', { metodo: 'POST', corpo: { ...extra, toda_empresa: toda, areas: areasSel } });
      await recarregarLateral();
      irPara(`#/qw/${q.id}/editar`);
    } catch (e) { toast(e.message); }
  };
  $('do-zero').onclick = () => criar({ nome: 'Novo quick win' });
  document.querySelectorAll('[data-modelo]').forEach(b => { b.onclick = () => criar({ modelo_inicial: Number(b.dataset.modelo) }); });
  document.querySelectorAll('[data-duplicar]').forEach(b => { b.onclick = () => criar({ duplicar_de: Number(b.dataset.duplicar) }); });
}

// Configuração numa tela só, em linguagem simples.
async function configurar(id) {
  const [qw, { areas }, est, bases, pessoas] = await Promise.all([api(`/api/quick-wins/${id}`), api('/api/areas'), api(`/api/quick-wins/${id}/estimativas`), api('/api/bases/documentos'),
    E.eu.admin ? api('/api/admin/pessoas').then(r => r.pessoas) : Promise.resolve(null)]);
  if (!qw.podeEditar) return irPara(`#/qw/${id}`);
  // Áreas que a pessoa pode usar, mais as que o quick win já tem.
  const nomes = new Map([...areas, ...E.permQw.areas].map(a => [a.id, a.nome]));
  const minhas = [...new Set([...E.permQw.areas.map(a => a.id), ...qw.areas])].map(id => ({ id, nome: nomes.get(id) || `Área ${id}` }));
  const sug = [...qw.sugestoes, '', '', '', ''].slice(0, 4);
  const radio = (nome, valor, atual, rotulo) => `<label><input type="radio" name="${nome}" value="${valor}" ${atual === valor ? 'checked' : ''}> ${rotulo}</label>`;
  $('principal').innerHTML = `${cabecalho(`Configurar: ${qw.nome}`)}
    <div class="pagina"><form class="pagina-dentro" id="form-qw" novalidate>
      <p class="lead">Tudo em uma tela. As mudanças valem para as próximas mensagens de todas as conversas deste quick win.</p>
      <div class="grupo-form"><h3>Identificação</h3>
        <div class="campo"><label for="nome">Nome</label><input class="entrada" id="nome" value="${esc(qw.nome)}" maxlength="80" required></div>
        <div class="duas-col">
          <div class="campo"><label for="icone">Ícone (até 2 letras)</label><input class="entrada" id="icone" value="${esc(qw.icone)}" maxlength="2"></div>
          <div class="campo"><span class="legenda">Cor</span><div class="opcoes">${CORES.map(c => `<label title="${c}"><input type="radio" name="cor" value="${c}" ${qw.cor.toLowerCase() === c.toLowerCase() ? 'checked' : ''}><span style="display:inline-block;width:20px;height:20px;border-radius:6px;background:${c}"></span></label>`).join('')}</div></div>
        </div>
        <div class="campo"><span class="legenda">Áreas</span><div class="opcoes">${minhas.map(a => `<label><input type="checkbox" name="area" value="${a.id}" ${qw.areas.includes(a.id) ? 'checked' : ''}> ${esc(a.nome)}</label>`).join('')}
          ${E.permQw.todaEmpresa || qw.toda_empresa ? `<label><input type="checkbox" id="toda" ${qw.toda_empresa ? 'checked' : ''}> Toda a empresa</label>` : ''}</div></div>
        <div class="campo"><label for="para">Para que serve</label><input class="entrada" id="para" value="${esc(qw.para_que_serve)}" maxlength="200"><span class="ajuda">Uma frase. Aparece para quem vai usar.</span></div>
      </div>
      <div class="grupo-form"><h3>Propósito</h3>
        <div class="campo"><label for="problema">Problema</label><textarea class="entrada" id="problema" rows="2" maxlength="2000" placeholder="O que hoje toma tempo, gera erro ou depende de uma pessoa">${esc(qw.problema || '')}</textarea></div>
        <div class="campo"><label for="objetivo">Objetivo</label><input class="entrada" id="objetivo" maxlength="2000" value="${esc(qw.objetivo || '')}" placeholder="Ex.: conferir um pedido em até 10 minutos"></div>
        <div class="campo"><label for="processo">Como é feito hoje</label><textarea class="entrada" id="processo" rows="2" maxlength="2000">${esc(qw.processo_atual || '')}</textarea><span class="ajuda">Serve de ponto de partida para a medição.</span></div>
        <div class="campo"><label for="responsavel">Responsável</label>${pessoas ? `<select class="entrada" id="responsavel"><option value="">sem responsável</option>${pessoas.filter(p => p.ativo).map(p => `<option value="${p.id}" ${qw.responsavel?.id === p.id ? 'selected' : ''}>${esc(p.nome)} · ${esc(p.email)}</option>`).join('')}</select>`
          : `<div class="linha-botoes"><span>${qw.responsavel ? esc(qw.responsavel.nome) : 'sem responsável'}</span>${qw.responsavel?.id !== E.eu.id ? '<label class="dica"><input type="checkbox" id="assumir"> assumir como responsável</label>' : ''}</div>`}
          <span class="ajuda">Quem responde pelo resultado e pelas decisões deste quick win.</span></div>
      </div>
      ${qw.v2 ? `<div class="grupo-form"><h3>O que a IA deve fazer</h3><p class="lead">O trabalho deste Quick Win é montado pela GreenIA a partir das suas respostas. Para mudar o que ele faz, use <a href="#/qw/${id}/ajustar">Ajustar Quick Win</a>.</p></div>` : ''}
      <div class="grupo-form${qw.v2 ? ' oculto' : ''}"><h3>O que a IA deve fazer</h3>
        <div class="campo"><label for="instrucoes">Instruções</label><textarea class="entrada" id="instrucoes" rows="7">${esc(qw.instrucoes)}</textarea><span class="ajuda">Em português comum. Valem para todas as conversas deste quick win.</span></div>
        <div class="campo"><span class="legenda">Formato preferido da resposta</span><div class="opcoes">${Object.entries(FORMATOS).map(([v, r]) => radio('formato', v, qw.formato, r)).join('')}</div></div>
        <div class="campo"><span class="legenda">Sugestões de início (até 4)</span>${sug.map((s, i) => `<input class="entrada" style="margin-bottom:6px" data-sugestao value="${esc(s)}" placeholder="Ex.: Confira estes dois documentos e liste as diferenças" aria-label="Sugestão ${i + 1}">`).join('')}</div>
        <div class="duas-col">
          <div class="campo"><label for="ex-entrada">Exemplo de entrada (opcional)</label><textarea class="entrada" id="ex-entrada" rows="3">${esc(qw.exemplo_entrada)}</textarea></div>
          <div class="campo"><label for="ex-saida">Exemplo de saída (opcional)</label><textarea class="entrada" id="ex-saida" rows="3">${esc(qw.exemplo_saida)}</textarea></div>
        </div>
      </div>
      <div class="grupo-form"><h3>Arquivos e bases</h3>
        <div class="campo"><span class="legenda">Arquivos deste quick win</span><span class="ajuda">Modelos, checklists, tabelas de regras, exemplos. Entram em todas as conversas.</span>
          <div class="lista" style="margin-top:8px">${qw.arquivos.map(a => `<div class="lista-item"><span class="principal-texto"><b>${esc(a.titulo)}</b><span>${esc(a.arquivo)} · ${a.caracteres.toLocaleString('pt-BR')} caracteres${a.sigiloso ? ' · sigiloso' : ''}</span></span>
            <button type="button" class="icone-btn" data-tirar-arquivo="${a.id}" aria-label="Remover ${esc(a.titulo)}">${ICONE.lixo}</button></div>`).join('') || '<div class="lista-item"><span class="dica">Nenhum arquivo ainda.</span></div>'}</div>
          <div class="linha-botoes" style="margin-top:10px"><button type="button" class="btn btn-linha btn-pequeno" id="add-arquivo">${ICONE.clipe} Adicionar arquivo</button>
            <label class="dica"><input type="checkbox" id="arquivo-sigiloso"> marcar como sigiloso</label>
            <input type="file" id="arquivo-qw" hidden accept=".pdf,.docx,.pptx,.txt,.md,.csv,.xlsx,.png,.jpg,.jpeg,.webp,.tif,.tiff"></div></div>
        <div class="campo"><span class="legenda">Bases de conhecimento</span><div class="opcoes">
          ${radio('bases', 'nenhuma', qw.bases.modo, 'Nenhuma')}${radio('bases', 'area', qw.bases.modo, 'A da área')}${radio('bases', 'escolhidas', qw.bases.modo, 'Escolher documentos')}</div>
          <div class="opcoes" id="bases-escolhidas" style="margin-top:8px">${bases.documentos.map(d => `<label><input type="checkbox" name="base" value="${d.id}" ${qw.bases.ids.includes(d.id) ? 'checked' : ''}> ${esc(d.titulo)}</label>`).join('') || '<span class="dica">Nenhum documento de base disponível.</span>'}</div></div>
      </div>
      <div class="grupo-form${qw.v2 ? ' oculto' : ''}"><h3>Classe de modelo</h3>
        <div class="campo"><label for="modelo">Classe</label><select class="entrada" id="modelo">
          <optgroup label="Classes">${est.modelos.filter(m => m.classe).map(m => `<option value="${esc(m.id)}" ${m.id === qw.modelo ? 'selected' : ''}>${esc(m.nome)}${E.eu.admin ? ` · ${esc(m.modelo)}` : ''}${m.homologado ? ' · homologado' : ''} · ${fmtCusto(m.custo, { conversa: true })} por conversa típica</option>`).join('')}</optgroup>
          ${E.eu.admin ? `<optgroup label="Modelo técnico específico">${est.modelos.filter(m => !m.classe).map(m => `<option value="${esc(m.id)}" ${m.id === qw.modelo ? 'selected' : ''}>${esc(m.nome)}${m.homologado ? ' · homologado' : ''}</option>`).join('')}</optgroup>` : ''}
        </select>
          <span class="ajuda">A classe define o equilíbrio entre custo e capacidade. O modelo por trás de cada classe é escolhido pela empresa e pode mudar sem alterar este quick win. Quem usa pode usar esta classe mesmo sem acesso a ela no dia a dia.</span></div>
        <label class="opcoes"><span><input type="checkbox" id="pode-trocar" ${qw.pode_trocar ? 'checked' : ''}> Quem usa pode trocar de classe (dentro das classes liberadas para a pessoa)</span></label><p></p>
      </div>
      <div class="grupo-form"><h3>Dados e sigilo</h3>
        <div class="campo"><span class="legenda">Classificação</span><div class="opcoes">${radio('sigiloso', '0', qw.sigiloso ? '1' : '0', 'Sem dados sigilosos')}${radio('sigiloso', '1', qw.sigiloso ? '1' : '0', 'Trata informações sigilosas (todas as conversas nascem sigilosas e seguem só com os guardrails de proteção)')}</div></div>
        <div class="campo"><span class="legenda">O que fazer quando o sistema encontrar cada tipo de dado</span>
          <div class="tabela-rolagem"><table class="tabela"><thead><tr><th>Tipo</th><th>Regra</th></tr></thead><tbody>
          ${Object.entries(DADOS).map(([t, r]) => `<tr><td>${r}</td><td>${seletorAcao(`dado-${t}`, r, qw.dados[t])}</td></tr>`).join('')}
          <tr><td>Senhas, chaves de acesso e outros segredos</td><td class="dica">Nunca enviados (regra de segurança da GreenIA)</td></tr></tbody></table></div></div>
      </div>
      <div class="grupo-form"><h3>Estado e resultado</h3>
        <div class="campo"><span class="legenda">Estado</span><div class="caixas" style="max-height:none;flex-direction:column;gap:8px">${Object.entries(ESTADOS).map(([k, v]) => `<label><input type="radio" name="status" value="${k}" ${qw.status === k ? 'checked' : ''}> <b style="font-weight:500">${v}</b> <span class="dica">${EXPLICA[k]}</span></label>`).join('')}</div>
          <span class="ajuda">Manter, ajustar, descartar ou ampliar também mudam o estado, pela decisão registrada na página do quick win.</span></div>
        <div class="campo"><label for="resultado">Resultado observado</label><textarea class="entrada" id="resultado" rows="2" maxlength="2000">${esc(qw.resultado || '')}</textarea><span class="ajuda">O que mudou no trabalho. Os números entram na medição de antes e depois.</span></div></div>
      <p class="msg-erro oculto" id="erro-qw" role="alert"></p>
      <div class="linha-botoes" style="position:sticky;bottom:0;background:var(--paper);padding:12px 0;border-top:1px solid var(--line)">
        <button class="btn btn-verde" id="salvar">Salvar</button>
        <button type="button" class="btn btn-linha" id="testar">Salvar e testar</button>
        <a class="btn btn-texto" href="#/qw/${id}">Voltar</a>
        <button type="button" class="btn btn-perigo btn-pequeno" id="excluir" style="margin-left:auto">Excluir quick win</button>
      </div>
    </form></div>`;
  ligarCabecalho();
  const mostrarBases = () => { $('bases-escolhidas').classList.toggle('oculto', document.querySelector('input[name=bases]:checked')?.value !== 'escolhidas'); };
  document.querySelectorAll('input[name=bases]').forEach(r => { r.onchange = mostrarBases; });
  mostrarBases();
  const valor = n => document.querySelector(`input[name="${n}"]:checked`)?.value;
  const salvar = async () => {
    const corpo = {
      nome: $('nome').value, icone: $('icone').value, cor: valor('cor') || qw.cor, para_que_serve: $('para').value, instrucoes: $('instrucoes').value,
      formato: valor('formato'), sugestoes: [...document.querySelectorAll('[data-sugestao]')].map(i => i.value), exemplo_entrada: $('ex-entrada').value, exemplo_saida: $('ex-saida').value,
      bases: { modo: valor('bases'), ids: [...document.querySelectorAll('input[name=base]:checked')].map(i => Number(i.value)) },
      modelo: $('modelo').value, pode_trocar: $('pode-trocar').checked, sigiloso: valor('sigiloso') === '1',
      dados: Object.fromEntries(Object.keys(DADOS).map(t => [t, valor(`dado-${t}`)])), status: valor('status'),
      toda_empresa: $('toda')?.checked || false, areas: [...document.querySelectorAll('input[name=area]:checked')].map(i => Number(i.value)),
      problema: $('problema').value, objetivo: $('objetivo').value, processo_atual: $('processo').value, resultado: $('resultado').value,
      // Quick Win 2.0: o trabalho vem da especificação; este formulário cuida só de acesso, dados e ciclo.
      ...(qw.v2 ? { instrucoes: undefined, formato: undefined, modelo: undefined, pode_trocar: undefined, sugestoes: undefined, exemplo_entrada: undefined, exemplo_saida: undefined } : {}),
      ...($('responsavel') ? { responsavel_id: $('responsavel').value ? Number($('responsavel').value) : null } : $('assumir')?.checked ? { responsavel_id: E.eu.id } : {}),
    };
    try {
      await api(`/api/quick-wins/${id}`, { metodo: 'PUT', corpo });
      $('erro-qw').classList.add('oculto');
      await recarregarLateral();
      return true;
    } catch (e) { $('erro-qw').textContent = e.message; $('erro-qw').classList.remove('oculto'); return false; }
  };
  $('form-qw').onsubmit = async ev => { ev.preventDefault(); if (await salvar()) toast('Quick win salvo.'); };
  $('testar').onclick = async () => { if (await salvar()) irPara(`#/qw/${id}/teste`); };
  $('excluir').onclick = async () => {
    if (!confirm('Excluir este quick win e o histórico de medição e decisões? Para manter o histórico, use o estado Descartado.')) return;
    await api(`/api/quick-wins/${id}`, { metodo: 'DELETE' }); await recarregarLateral(); irPara('#/quick-wins');
  };
  $('add-arquivo').onclick = () => $('arquivo-qw').click();
  $('arquivo-qw').onchange = async ev => {
    const f = ev.target.files[0];
    if (!f) return;
    const base64 = await new Promise(res => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.readAsDataURL(f); });
    try { await api(`/api/quick-wins/${id}/arquivos`, { metodo: 'POST', corpo: { arquivo: { nome: f.name, base64 }, sigiloso: $('arquivo-sigiloso').checked } }); toast('Arquivo adicionado.'); configurar(id); }
    catch (e) { toast(e.message, 6000); }
  };
  document.querySelectorAll('[data-tirar-arquivo]').forEach(b => { b.onclick = async () => {
    await api(`/api/quick-wins/${id}/arquivos/${b.dataset.tirarArquivo}`, { metodo: 'DELETE' }); configurar(id);
  }; });
}
