// Quick wins: portfólio (o ciclo de adoção), página do quick win e configuração.
// Um quick win é uma unidade operacional de adoção de IA: problema, responsável,
// instruções, conhecimento, classe de modelo, uso, avaliação, resultado e decisão.
import { api, emCreditos, esc, fmtCusto, ICONE, ocupado, toast } from '/comum.js';
import { E, cabecalho, ligarCabecalho, recarregarLateral, irPara, trocarPara } from '/app.js';
import { vistaConversa } from '/conversa.js';
import { assistenteQw, publicarQw, versoesQw, usarQw, testeQw } from '/quickwin2.js';
import { aviso, cabecalhoPg, confirmarExclusao, escolherComoCriar, estadoQw, estadoVazio, FORMATOS_SAIDA, ligarMenus, marcaQw, menuAcoes, seloQw } from '/qw-ui.js';
import { secaoMedicao } from '/medicao.js';
import { confirmar } from '/admin-ui.js';
import { renomearConversa, excluirConversa } from '/historico-conversas.js';
import { montarFontes } from '/fontes.js';

const $ = id => document.getElementById(id);
const FEEDBACK = { serviu: 'Serviu', ajustes: 'Serviu com ajustes', nao_serviu: 'Não serviu' };
const FORMATOS = { texto: 'Texto', lista: 'Lista', tabela: 'Tabela (baixa em planilha)', checklist: 'Checklist' };
const DADOS = { cpf: 'CPF', rg: 'RG', cnpj: 'CNPJ', email: 'Email pessoal (Gmail, Hotmail...)', telefone: 'Telefone', cep: 'CEP', endereco: 'Endereço', cartao: 'Cartão', banco: 'Dados bancários', pix: 'Chave PIX', pessoal_restrito: 'Dado pessoal restrito (disciplinar, remuneração individual)', sensivel: 'Dado pessoal sensível (saúde, biometria, religião...)', confidencial: 'Documento marcado como confidencial' };
// Tratamento proporcional: seguir normalmente, só com proteção (guardrails) ou não enviar.
const ACAO = { permitir: 'Processar normalmente', proteger: 'Só com proteção', bloquear: 'Não enviar' };
const EFEITO = { permitir: 'Segue as regras gerais; a conversa não vira sigilosa', proteger: 'A conversa vira sigilosa: segue só com os guardrails', bloquear: 'Não é enviado; a pessoa vê o motivo' };
const seletorAcao = (nome, rotulo, atual) => `<span class="segmento" role="radiogroup" aria-label="${rotulo}">${Object.entries(ACAO).map(([v, r]) => `<label><input type="radio"${v === 'bloquear' ? ' class="perigo"' : ''} name="${nome}" value="${v}" ${atual === v ? 'checked' : ''}><span>${r}</span></label>`).join('')}</span>`;
const CORES = ['#1B7950', '#0F6E8C', '#5B4B8A', '#8C621D', '#7A3E2E', '#2F6B3B', '#3E5C76', '#9B4029'];
export const ESTADOS = { identificado: 'Identificado', em_configuracao: 'Em configuração', em_teste: 'Em teste', em_uso: 'Em uso', em_avaliacao: 'Em avaliação', aprovado: 'Aprovado', em_expansao: 'Em expansão', descartado: 'Descartado' };
const EXPLICA = { identificado: 'Uso possível registrado, ainda sem configuração', em_configuracao: 'Sendo configurado; só quem gere usa', em_teste: 'Em piloto: só quem gerencia vê e usa até publicar',
  em_uso: 'Disponível e em uso no dia a dia', em_avaliacao: 'Em uso, aguardando decisão', aprovado: 'Decisão tomada: manter', em_expansao: 'Decisão tomada: levar para mais áreas', descartado: 'Fora de circulação; o histórico fica' };
const EM_CIRCULACAO = ['em_teste', 'em_uso', 'em_avaliacao', 'aprovado', 'em_expansao'];
export const seloEstado = st => `<span class="selo ${st === 'descartado' ? 'selo-cinza' : EM_CIRCULACAO.includes(st) ? 'selo-verde' : ''}">${ESTADOS[st] || st}</span>`;
const LISTA_CURTA = 6;   // até aqui a biblioteca cabe numa tela e não precisa de busca
const dataCurta = iso => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });

export async function rotaQuickWin(hash) {
  let m;
  if (hash === '#/quick-wins/processos') return (await import('/paineis.js')).escolherProcesso();
  if ((m = /^#\/qw\/(\d+)\/acompanhamento\/preparar$/.exec(hash))) return (await import('/paineis.js')).escolherProcesso(Number(m[1]));
  if ((m = /^#\/qw\/(\d+)\/acompanhamento\/registro\/(\d+)$/.exec(hash))) return (await import('/paineis.js')).conferirRegistro(Number(m[1]), { registro: Number(m[2]) });
  if ((m = /^#\/qw\/(\d+)\/acompanhamento\/resultado\/(\d+)$/.exec(hash))) return (await import('/paineis.js')).conferirRegistro(Number(m[1]), { mensagem: Number(m[2]) });
  if ((m = /^#\/qw\/(\d+)\/acompanhamento(?:\?pagina=(\d+))?$/.exec(hash))) return (await import('/paineis.js')).painelNegocio(Number(m[1]));
  if (hash === '#/quick-wins/programados') return (await import('/qw-programacao.js')).listaProgramadas();
  if ((m = /^#\/qw\/(\d+)\/programacoes$/.exec(hash))) return (await import('/qw-programacao.js')).listaProgramadas(Number(m[1]));
  if ((m = /^#\/qw\/(\d+)\/programar(?:\/([\w-]+))?$/.exec(hash))) return (await import('/qw-programacao.js')).formularioProgramacao(Number(m[1]), m[2]);
  if (hash === '#/quick-wins') return listaQuickWins();
  if (hash === '#/qw/nova') return assistenteQw();
  if (hash === '#/qw/nova/modelos') return novaOrigem();
  // Quick Win sugerido numa conversa ("crie um agente que..."): o assistente começa com o nome e a descrição.
  if ((m = /^#\/qw\/nova\/da-conversa\/(\d+)\/(\d+)$/.exec(hash))) {
    const inicial = await api(`/api/conversas/${m[1]}/mensagens/${m[2]}/quick-win-sugerido`).catch(() => null);
    return assistenteQw(null, inicial ? { inicial } : {});
  }
  if ((m = /^#\/qw\/nova\/modelo\/(\d+)$/.exec(hash))) return comModelo(Number(m[1]));
  if ((m = /^#\/qw\/(\d+)\/refinar(?:\/(\d+)(?:\/(\d+))?)?$/.exec(hash))) return assistenteQw(Number(m[1]), { refinar: true, conversaId: m[2] ? Number(m[2]) : null, mensagemId: m[3] ? Number(m[3]) : null });
  if ((m = /^#\/qw\/(\d+)\/ajustar$/.exec(hash))) return assistenteQw(Number(m[1]));
  if ((m = /^#\/qw\/(\d+)\/atualizar$/.exec(hash))) return assistenteQw(Number(m[1]), { atualizar: true });
  if ((m = /^#\/qw\/(\d+)\/publicar$/.exec(hash))) return publicarQw(Number(m[1]));
  if ((m = /^#\/qw\/(\d+)\/versoes$/.exec(hash))) return versoesQw(Number(m[1]));
  if ((m = /^#\/qw\/(\d+)\/editar$/.exec(hash))) return configurar(Number(m[1]));
  if ((m = /^#\/qw\/(\d+)\/teste$/.exec(hash))) { const q = await api(`/api/quick-wins/${m[1]}`); return q.v2 ? testeQw(q) : usarQw(q.id, { testar: true }); }
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
  // Em preparo: só quem gerencia vê (quem só usa vê o que está publicado).
  const prontos = ativos.filter(q => q.estado.id === 'publicado'), preparo = ativos.filter(q => q.estado.id !== 'publicado' && q.podeEditar);
  // Criar é um botão só: os caminhos (descrever, modelo, processo pronto, continuar) abrem quando a pessoa pede.
  // Com a biblioteca vazia, a ação fica no estado vazio (uma ação principal por tela).
  const cta = E.podeCriarQw && ativos.length ? `<button type="button" class="btn btn-verde" data-criar-qw aria-haspopup="dialog">${ICONE.mais} Criar Quick Win</button>` : '';
  const cont = st => (port?.quickWins || []).filter(q => q.status === st).length;
  const idBloco = t => `t-${t.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-')}`;   // um id por título (o tamanho do título colidia)
  const bloco = (titulo, lista) => (lista.length ? `<section class="qw-bloco" aria-labelledby="${idBloco(titulo)}">
      <div class="qw-lista-cabeca"><h2 id="${idBloco(titulo)}">${esc(titulo)}</h2></div>
      <ul class="qw-lista">${lista.map(itemQw).join('')}</ul></section>` : '');
  // Lista curta não mostra busca: ela aparece quando a lista passa de uma tela.
  const comBusca = itens.length > LISTA_CURTA;
  $('principal').innerHTML = `${cabecalho('Quick Wins')}
    <div class="pagina"><div class="pg larga qw-biblioteca">
      ${cabecalhoPg({ titulo: 'Quick Wins', descricao: 'Tarefas prontas que sua equipe executa com a IA, seguindo regras definidas.', lado: `<a class="btn btn-linha" href="#/quick-wins/programados">Agendados</a>${cta}` })}
      ${!ativos.length ? estadoVazio({
        titulo: E.podeCriarQw ? 'Crie um trabalho que sua equipe poderá repetir com segurança.' : 'Ainda não há Quick Wins disponíveis para você.',
        texto: E.podeCriarQw ? '' : 'Quando alguém da sua área publicar um Quick Win, ele aparece aqui.',
        cta: E.podeCriarQw ? `<button type="button" class="btn btn-verde btn-grande" data-criar-qw aria-haspopup="dialog">Criar meu primeiro Quick Win</button>` : '',
      }) : ''}
      ${comBusca ? `<div class="filtros-biblioteca"><div class="campo"><label for="buscar-qw">Encontrar uma tarefa</label><input class="entrada" type="search" id="buscar-qw" placeholder="Nome ou o que precisa fazer" aria-describedby="contagem-qw"></div><span class="dica" id="contagem-qw" role="status">${prontos.length + preparo.length} ${prontos.length + preparo.length === 1 ? 'tarefa disponível na lista' : 'tarefas na lista'}</span></div><p class="dica oculto" id="qw-busca-vazia">Nenhuma tarefa encontrada. Tente outra palavra.</p>` : ''}
      <div id="qw-prontos">${bloco(gere ? 'Publicados' : 'Disponíveis para você', prontos)}${!prontos.length && ativos.length ? '<p class="dica">Nenhum Quick Win publicado ainda.</p>' : ''}</div>
      ${preparo.length ? `<details class="qw-bloco qw-grupo" id="qw-preparacoes" aria-labelledby="t-em-preparo"${prontos.length ? '' : ' open'}><summary><h2 id="t-em-preparo">Em preparo (${preparo.length})</h2></summary><ul class="qw-lista">${preparo.map(itemQw).join('')}</ul></details>` : ''}
      ${arquivados.length ? `<details class="qw-acompanhamento qw-arquivados"><summary>Arquivados (${arquivados.length})</summary><ul class="qw-lista" style="margin-top:14px">${arquivados.map(itemQw).join('')}</ul></details>` : ''}
      ${port?.quickWins.length ? `<details class="qw-acompanhamento"><summary>Uso e decisão de todos os Quick Wins</summary>
        <div class="ciclo" style="margin-top:16px">
          <div><b>Identificar</b><span>${cont('identificado')} identificados</span></div>
          <div><b>Testar</b><span>${cont('em_configuracao') + cont('em_teste')} em configuração ou teste</span></div>
          <div><b>Medir</b><span>${cont('em_uso') + cont('em_avaliacao')} em uso ou avaliação</span></div>
          <div><b>Decidir</b><span>${cont('aprovado')} aprovados, ${cont('descartado')} descartados</span></div>
          <div><b>Ampliar</b><span>${cont('em_expansao')} em expansão</span></div>
        </div>
        <div class="tabela-rolagem" style="margin-top:14px"><table class="tabela tabela-empilha"><thead><tr><th>Quick Win</th><th>Onde</th><th>Responsável</th>
          <th class="num">Execuções no mês</th><th class="num">${emCreditos() ? 'Créditos no mês' : 'Custo no mês'}</th><th class="num">Por execução</th><th class="num">Serviu</th><th>Antes e depois</th></tr></thead><tbody>
          ${port.quickWins.map(q => `<tr><td data-r="Quick Win"><a href="#/qw/${q.id}"><b>${esc(q.nome)}</b></a></td>
            <td data-r="Onde">${esc(q.onde || '')}</td><td data-r="Responsável">${q.responsavel ? esc(q.responsavel) : '<span class="dica">sem responsável</span>'}</td>
            <td class="num" data-r="Execuções">${q.execucoes}</td><td class="num" data-r="${emCreditos() ? 'Créditos' : 'Custo'}">${fmtCusto(q.custo)}</td><td class="num" data-r="Por execução">${q.custoPorExecucao === null ? '—' : fmtCusto(q.custoPorExecucao)}</td>
            <td class="num" data-r="Serviu">${q.aceitacao === null ? '<span class="dica">sem avaliação</span>' : `${q.aceitacao}% de ${q.avaliadas}`}</td>
            <td data-r="Antes e depois">${q.medicoes ? `${q.medicoes} com antes e depois` : '<span class="dica">nenhuma</span>'}</td></tr>`).join('')}
        </tbody></table></div></details>` : ''}
    </div></div>`;
  ligarCabecalho();
  ligarMenus();
  // "Continuar uma preparação": abre o grupo Em preparo e leva o foco até ele.
  const irPreparacoes = () => { const el = $('qw-preparacoes'); if (el) { el.open = true; el.tabIndex = -1; el.scrollIntoView({ block: 'start' }); el.focus({ preventScroll: true }); } };
  document.querySelectorAll('[data-criar-qw]').forEach(b => { b.onclick = () => escolherComoCriar({ continuar: preparo.length ? irPreparacoes : null }); });
  const normalizarBusca = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  $('buscar-qw')?.addEventListener('input', ev => {
    const termo = normalizarBusca(ev.target.value.trim());
    let n = 0;
    for (const li of document.querySelectorAll('.qw-item')) {
      li.hidden = !normalizarBusca(li.querySelector('.qw-item-link')?.textContent).includes(termo);
      if (!li.hidden && (termo || !li.closest('.qw-arquivados'))) n++;
    }
    for (const bloco of document.querySelectorAll('.qw-bloco')) bloco.hidden = ![...bloco.querySelectorAll('.qw-item')].some(li => !li.hidden);
    if ($('qw-preparacoes') && termo) $('qw-preparacoes').open = [...$('qw-preparacoes').querySelectorAll('.qw-item')].some(li => !li.hidden);
    const arquivo = document.querySelector('details.qw-acompanhamento:has(.qw-lista)');
    if (arquivo) arquivo.open = !!termo && [...arquivo.querySelectorAll('.qw-item')].some(li => !li.hidden);
    $('contagem-qw').textContent = `${n} ${n === 1 ? 'tarefa encontrada' : 'tarefas encontradas'}${termo ? ', incluindo arquivadas' : ''}`;
    $('qw-busca-vazia').classList.toggle('oculto', n > 0);
  });
}

// Uma linha da biblioteca: marca, nome, descrição, estado e, quando faz sentido, a versão. Clicar abre o Quick Win;
// a única ação na linha é Usar. Editar, agendar, duplicar, arquivar e excluir ficam em "Mais ações", na página dele.
const usarHref = q => `#/qw/${q.id}/usar`;
function itemQw(q) {
  const e = q.estado || estadoQw(q);
  const meta = q.v2 && q.versao ? `v${q.versao}${q.podeEditar && q.rascunho_alterado ? ' · alterações em rascunho' : ''}` : '';
  const podeUsar = e.id === 'publicado' || (q.podeEditar && e.id !== 'arquivado');
  return `<li class="qw-item">${marcaQw(q)}
    <a class="qw-item-link" href="#/qw/${q.id}"><span class="qw-item-nome">${esc(q.nome)}</span><span class="qw-item-desc">${esc(q.para_que_serve || '')}</span></a>
    <div class="qw-item-lado">${meta ? `<span class="qw-item-meta">${esc(meta)}</span>` : ''}${seloQw(q)}</div>
    <div class="qw-item-acoes">${podeUsar ? `<a class="btn btn-linha btn-pequeno" href="${usarHref(q)}" aria-label="Usar ${esc(q.nome)}">Usar</a>` : ''}</div></li>`;
}
function acoesQw(q) {
  const e = q.estado || estadoQw(q), out = [];
  // Ações de "Mais ações" na página do Quick Win (a página filtra o que já está à vista).
  if (q.podeEditar && q.v2 && q.versao && e.id === 'publicado') out.push({ rotulo: 'Agendar', href: `#/qw/${q.id}/programar` });
  if (q.podeEditar && e.id !== 'arquivado') out.push({ rotulo: 'Editar', href: q.v2 ? `#/qw/${q.id}/ajustar` : `#/qw/${q.id}/editar` });
  if (q.podeEditar && q.v2 && e.id !== 'arquivado') out.push({ rotulo: 'Testar', href: `#/qw/${q.id}/teste` });
  if (q.v2 && q.versao && e.id === 'publicado') out.push({ rotulo: 'Ver agendamentos', href: `#/qw/${q.id}/programacoes` });
  // Quick Win antigo (sem plano de operação): a GreenIA sugere a estrutura; nada muda até a pessoa publicar.
  if (q.podeEditar && !q.v2 && e.id !== 'arquivado') out.push({ rotulo: 'Atualizar para Quick Win inteligente', href: `#/qw/${q.id}/atualizar` });
  if (E.podeCriarQw) out.push({ rotulo: 'Duplicar', acao: 'duplicar', id: q.id });
  if (q.podeEditar && q.v2 && q.versao) out.push({ rotulo: 'Ver versões', href: `#/qw/${q.id}/versoes` });
  if (q.podeEditar && q.v2) out.push({ rotulo: 'Acesso e dados', href: `#/qw/${q.id}/editar` });
  if (q.podeEditar && e.id !== 'arquivado') out.push({ rotulo: 'Arquivar', acao: 'arquivar', id: q.id, perigo: true });
  if (q.podeEditar && e.id === 'arquivado') out.push({ rotulo: 'Restaurar em preparo', acao: 'restaurar', id: q.id });
  if (q.podeEditar) out.push({ rotulo: 'Excluir Quick Win', acao: 'excluir', id: q.id, perigo: true });
  return out;
}
// Excluir: modal próprio (digitar o nome); o servidor confere a permissão e preserva o histórico.
export async function excluirQw(q) {
  if (!await confirmarExclusao(q)) return false;
  await api(`/api/quick-wins/${q.id}`, { metodo: 'DELETE' });
  await recarregarLateral();
  toast('Quick Win excluído. As execuções anteriores continuam guardadas.');
  irPara('#/quick-wins');
  return true;
}
function ligarAcoesQw(raiz, itens, recarregar) {
  // O conteúdo muda na navegação, mas #principal permanece. Ligar aos botões
  // desta tela evita acumular ações de bibliotecas e detalhes anteriores.
  raiz.querySelectorAll('[data-acao]').forEach(b => b.addEventListener('click', async () => {
    if (b.disabled) return;
    const q = itens.find(x => String(x.id) === b.dataset.id);
    if (!q) return;
    b.disabled = true;
    b.closest('details')?.removeAttribute('open');
    try {
      if (b.dataset.acao === 'duplicar') {
        const areas = q.areas?.length ? q.areas : E.permQw.areas.slice(0, 1).map(a => a.id);
        const novo = await api('/api/quick-wins', { metodo: 'POST', corpo: { duplicar_de: q.id, areas, toda_empresa: !areas.length && E.permQw.todaEmpresa } });
        await recarregarLateral();
        toast('Cópia criada como rascunho.');
        irPara(`#/qw/${novo.id}`);
      }
      if (b.dataset.acao === 'excluir') await excluirQw(q);
      if (b.dataset.acao === 'arquivar') {
        if (!await confirmar({ titulo: `Arquivar o Quick Win “${q.nome}”?`, texto: ['Ele sai da lista da equipe.', 'O histórico fica guardado, e você pode restaurá-lo depois em “Mais ações”.'], botao: 'Arquivar Quick Win', perigo: true })) return;
        await api(`/api/quick-wins/${q.id}`, { metodo: 'PUT', corpo: { status: 'descartado' } });
        await recarregarLateral();
        toast('Quick Win arquivado.');
        recarregar(q.id);
      }
      if (b.dataset.acao === 'restaurar') {
        if (!await confirmar({ titulo: `Restaurar o Quick Win “${q.nome}”?`, texto: ['Ele volta como “em preparo”, com o histórico preservado.', 'Revise antes de colocar em uso para a equipe.'], botao: 'Restaurar Quick Win' })) return;
        await api(`/api/quick-wins/${q.id}`, { metodo: 'PUT', corpo: { status: 'em_configuracao' } });
        await recarregarLateral();
        toast('Quick Win restaurado em preparo. Revise antes de colocar em uso.');
        recarregar(q.id);
      }
    } catch (e) { toast(e.message, 6000); }
    finally { b.disabled = false; }
  }));
}

// Página do Quick Win, no padrão "caminho claro": nome, uma linha do que ele faz e UMA ação principal (Usar quando
// publicado; Testar e publicar quando em preparo). Editar instruções fica ao lado, discreto; o resto em "Mais ações".
// Abaixo: suas execuções, os detalhes (recolhidos) e, para quem gerencia, os Resultados.
async function paginaQuickWin(id) {
  const [qw, lista] = await Promise.all([api(`/api/quick-wins/${id}`), api(`/api/conversas?quick_win=${id}`)]);
  const e = estadoQw(qw);
  const gere = qw.podeEditar && e.id !== 'arquivado';
  const publicado = e.id === 'publicado';
  const principal = publicado ? `<a class="btn btn-verde" href="${usarHref(qw)}">Usar</a>` : gere ? `<a class="btn btn-verde" href="#/qw/${id}/teste">Testar e publicar</a>` : '';
  const editar = gere ? `<a class="btn btn-texto qw-acao-secundaria" href="${qw.v2 ? `#/qw/${id}/ajustar` : `#/qw/${id}/editar`}">Editar instruções</a>` : '';
  // Mais ações: primeiro o que se faz com o trabalho (agendar, refinar, publicar), depois gestão e, no fim, o perigo.
  const extras = [
    ...(gere && qw.v2 && publicado ? [{ rotulo: 'Refinar Quick Win', href: `#/qw/${id}/refinar` }] : []),
    ...(gere && !publicado ? [{ rotulo: 'Publicar para a equipe', href: `#/qw/${id}/publicar` }] : []),
  ];
  const acoes = acoesQw(qw).filter(a => a.rotulo !== 'Editar' && !(a.rotulo === 'Testar' && !publicado));
  const fim = acoes.findIndex(a => !['Agendar', 'Ver agendamentos'].includes(a.rotulo));
  const menu = [...acoes.slice(0, fim < 0 ? acoes.length : fim), ...extras, ...(fim < 0 ? [] : acoes.slice(fim))];
  const meta = [seloQw(qw), qw.v2 && qw.versao ? `<span>Versão publicada: v${qw.versao}</span>` : '', qw.v2 && qw.versao && qw.podeEditar && qw.rascunho_alterado ? `<span>Rascunho em edição: v${qw.versao + 1}</span>` : '',
    qw.sigiloso ? '<span class="selo selo-sigilosa">Trata dados sigilosos</span>' : '', gere && !publicado ? '<span>Ainda não está disponível para a equipe.</span>' : ''].filter(Boolean).join('');
  const secao = (rotulo, conteudo) => (conteudo ? `<div class="secao"><div class="secao-rotulo">${rotulo}</div><div class="secao-conteudo">${conteudo}</div></div>` : '');
  const regras = qw.v2 ? qw.regras : null;
  // No máximo um aviso, e só com ação: há alterações em rascunho que a equipe ainda não recebeu.
  const avisoRascunho = qw.v2 && qw.versao && qw.podeEditar && qw.rascunho_alterado && e.id !== 'arquivado'
    ? aviso(`<b>Há alterações em rascunho (v${qw.versao + 1}).</b> A equipe continua usando a v${qw.versao} até você publicar.`, 'info', `<a class="btn btn-linha btn-pequeno" href="#/qw/${id}/teste">Testar e publicar</a>`) : '';
  const detalhes = [
    qw.v2 && qw.podeEditar && qw.assistente?.descricao ? secao('Orientação completa', esc(qw.assistente.descricao)) : '',
    !qw.v2 && qw.objetivo ? secao('Objetivo', esc(qw.objetivo)) : '',
    !qw.v2 && qw.problema ? secao('Problema que resolve', esc(qw.problema)) : '',
    qw.v2 ? secao('Regras', (regras || []).length ? `<ul>${regras.map(r => `<li>${esc(r)}</li>`).join('')}</ul>` : '') : '',
    qw.entregas?.entregaveis?.length ? secao('Entrega', `<ul>${qw.entregas.entregaveis.map(t => `<li>${esc(t)}</li>`).join('')}</ul>${qw.entregas.pesquisa ? '<span class="dica">Pesquisa na internet antes de escrever, quando a empresa libera.</span>' : ''}`)
      : secao('Formato do resultado', qw.v2 ? esc(FORMATOS_SAIDA[qw.formato_saida]?.rotulo || '') : esc(FORMATOS[qw.formato] || '')),
    !qw.v2 && (qw.sugestoes || []).filter(Boolean).length ? secao('Pedidos sugeridos', `<ul>${qw.sugestoes.filter(Boolean).map(s => `<li>${esc(s)}</li>`).join('')}</ul>`) : '',
    qw.v2 && qw.podeEditar ? secao('Último teste', qw.ultimo_teste ? `${esc(RESUMO_TESTE[qw.ultimo_teste.status] || '')}<span class="dica">${dataCurta(qw.ultimo_teste.em)}</span>` : '<span class="dica">Ainda não testado.</span>') : '',
    qw.v2 ? secao('Versão publicada', qw.versao ? `v${qw.versao}${qw.podeEditar ? ` <a class="link-sutil" href="#/qw/${id}/versoes" style="margin-left:8px">Ver versões</a>` : ''}` : '<span class="dica">Ainda não publicado.</span>') : '',
    !qw.v2 ? secao('Estado', `${ESTADOS[qw.status]} <span class="dica">${EXPLICA[qw.status]}</span>`) : '',
    !qw.v2 ? secao('Responsável', qw.responsavel ? esc(qw.responsavel.nome) : '<span class="dica">Sem responsável</span>') : '',
  ].join('');
  // Resultados: um link (ver ou preparar os do processo) e "Uso e decisão" recolhido. A explicação fica na Ajuda.
  const linkProcesso = qw.painel ? `<a class="btn btn-linha" href="#/qw/${id}/acompanhamento">Ver resultados do processo</a>`
    : gere ? `<a class="btn btn-texto qw-acao-secundaria" href="#/qw/${id}/acompanhamento/preparar">Preparar resultados do processo</a>` : '';
  const execucao = c => `<li>
          <a class="execucao" href="#/c/${c.id}"><b>${esc(c.titulo)}</b><span>${dataCurta(c.atualizado_em)} · ${c.feedback ? FEEDBACK[c.feedback] : c.tem_resposta ? 'Sem avaliação' : 'sem resposta'}${c.sigilosa ? ' · Sigilosa' : ''}</span></a>
          ${menuAcoes([{ rotulo: 'Renomear', dados: { renomear: c.id } }, { rotulo: 'Excluir', dados: { apagar: c.id }, perigo: true }], `Mais ações para ${c.titulo}`)}</li>`;
  $('principal').innerHTML = `${cabecalho(qw.nome)}
    <div class="pagina"><div class="pg qw-detalhe">
      ${cabecalhoPg({ trilha: [['Quick Wins', '#/quick-wins'], [qw.nome]], titulo: qw.nome, meta, descricao: esc(qw.para_que_serve || ''), tituloAcoes: qw.podeEditar ? '<button type="button" class="btn btn-texto qw-nome-acao" id="qw-editar-nome" aria-controls="qw-nome-form" aria-expanded="false">Editar nome</button>' : '',
        lado: `${principal}${editar}${menuAcoes(menu, 'Mais ações')}` })}
      ${qw.podeEditar ? `<form class="qw-renomear" id="qw-nome-form" hidden><label class="legenda" for="qw-nome">Nome do Quick Win</label><input class="entrada" id="qw-nome" maxlength="80" required value="${esc(qw.nome)}" aria-describedby="qw-nome-ajuda"><p class="dica" id="qw-nome-ajuda">As regras, os agendamentos e o histórico de versões continuam os mesmos.</p><div class="linha-botoes"><button type="submit" class="btn btn-verde" id="qw-nome-salvar">Salvar nome</button><button type="button" class="btn btn-texto" id="qw-nome-cancelar">Cancelar</button></div><p id="qw-nome-erro" role="alert"></p></form>` : ''}
      ${avisoRascunho}
      <section class="qw-bloco" aria-labelledby="t-exec"><div class="qw-lista-cabeca"><h2 id="t-exec">Suas execuções</h2></div>
        ${lista.conversas.length ? `<ul class="execucoes">${lista.conversas.map(execucao).join('')}</ul>` : '<p class="dica">Nenhuma execução ainda.</p>'}
      </section>
      ${detalhes ? `<details class="qw-bloco qw-detalhes"><summary>Detalhes</summary><div class="secoes">${detalhes}</div></details>` : ''}
      ${linkProcesso || qw.podeEditar ? `<section class="qw-bloco qw-resultados" aria-labelledby="t-resultados"><div class="qw-lista-cabeca"><h2 id="t-resultados">Resultados</h2></div>
        ${linkProcesso ? `<div class="qw-resultados-processo">${linkProcesso}</div>` : ''}
        ${qw.podeEditar ? '<details class="qw-uso-decisao"><summary>Uso e decisão</summary><section id="medicao-qw" aria-label="Uso e decisão"></section></details>' : ''}
      </section>` : ''}
    </div></div>`;
  ligarCabecalho();
  ligarMenus();
  $('qw-editar-nome')?.addEventListener('click', () => { $('qw-nome-form').hidden=false; $('qw-editar-nome').setAttribute('aria-expanded','true'); $('qw-nome').focus(); });
  $('qw-nome-cancelar')?.addEventListener('click', () => { $('qw-nome').value=qw.nome; $('qw-nome-erro').textContent=''; $('qw-nome-form').hidden=true; $('qw-editar-nome').setAttribute('aria-expanded','false'); $('qw-editar-nome').focus(); });
  $('qw-nome-form')?.addEventListener('submit', ev => { ev.preventDefault(); const nome=$('qw-nome').value.trim(); if(!nome){$('qw-nome-erro').textContent='Escreva um nome para este Quick Win.';$('qw-nome').focus();return;} const rota=location.hash;ocupado($('qw-nome-salvar'),async()=>{try{await api(`/api/quick-wins/${id}`,{metodo:'PUT',corpo:{nome}});if(location.hash===rota){await paginaQuickWin(id);toast('Nome salvo. O catálogo já mostra o novo nome.');}await recarregarLateral();}catch(err){if(location.hash===rota){$('qw-nome-erro').textContent=`Não foi possível salvar o nome. O texto foi mantido para tentar novamente. ${err.message}`;}}}); });
  ligarAcoesQw($('principal'), [{ ...qw, estado: e }], () => paginaQuickWin(id));
  if (qw.podeEditar) {
    const alvoMedicao = $('medicao-qw');
    secaoMedicao(alvoMedicao, id).catch(err => { if (alvoMedicao?.isConnected) alvoMedicao.innerHTML = `<p class="dica">${esc(err.message)}</p>`; });
  }
  const conversaDo = b => lista.conversas.find(c => String(c.id) === (b.dataset.renomear || b.dataset.apagar));
  document.querySelectorAll('[data-renomear]').forEach(b => { b.onclick = () => {
    const atual = conversaDo(b); b.closest('details')?.removeAttribute('open');
    if (atual) renomearConversa(atual, () => paginaQuickWin(id));
  }; });
  document.querySelectorAll('[data-apagar]').forEach(b => { b.onclick = () => {
    const atual = conversaDo(b); b.closest('details')?.removeAttribute('open');
    if (atual) excluirConversa(atual, () => paginaQuickWin(id));
  }; });
}
const RESUMO_TESTE = { aprovado: 'Resultado conferido', corrigido: 'Resultado conferido, com ajuste automático', parcial: '◐ Conferência incompleta', inconsistente: 'Pontos para revisar', pergunta: 'A IA pediu mais informação' };

// Criar a partir de um modelo ou duplicando um existente. Escolher um modelo não cria nada: mostra a prévia, e
// "Usar este modelo" abre o assistente já preenchido; o Quick Win só é criado quando a pessoa continua.
async function novaOrigem() {
  const { modelos, podeOcultar } = await api('/api/quick-wins/modelos-iniciais');
  const minhas = E.permQw.areas;
  const existentes = E.quickWins;
  $('principal').innerHTML = `${cabecalho('Começar de um modelo')}
    <div class="pagina"><div class="pg qw-modelos">
      ${cabecalhoPg({ trilha: [['Quick Wins', '#/quick-wins'], ['Começar de um modelo']], titulo: 'Começar de um modelo', descricao: 'Escolha um modelo para ver como ele funciona. Nada é criado antes de você continuar.' })}
      <section class="qw-bloco" aria-labelledby="t-modelos"><div class="qw-lista-cabeca"><h2 id="t-modelos">Modelos</h2></div>
        <div class="lista">${modelos.map(m => `<button type="button" class="lista-item" data-modelo="${m.indice}" aria-controls="qw-previa" aria-expanded="false">${marcaQw({ cor: m.cor, icone: m.icone, nome: m.nome })}
          <span class="principal-texto"><b>${esc(m.nome)}</b><span>${esc(m.para_que_serve)}</span></span></button>`).join('') || '<span class="dica">Nenhum modelo disponível.</span>'}</div>
        <section class="qw-previa" id="qw-previa" aria-labelledby="qw-previa-titulo" tabindex="-1" hidden></section>
      </section>
      ${existentes.length ? `<section class="qw-bloco" aria-labelledby="t-duplicar"><div class="qw-lista-cabeca"><h2 id="t-duplicar">Duplicar um existente</h2></div><p class="dica">A cópia fica em preparo, com instruções, arquivos e configuração. Nunca as conversas.</p>
        <fieldset class="campo"><legend class="legenda">Para qual área vai a cópia</legend><div class="opcoes">${minhas.map((a, i) => `<label><input type="checkbox" name="area" value="${a.id}" ${i === 0 ? 'checked' : ''}> ${esc(a.nome)}</label>`).join('') || '<span class="dica">Você não pode criar Quick Wins em nenhuma área.</span>'}
          ${E.permQw.todaEmpresa ? '<label><input type="checkbox" id="toda"> Toda a empresa</label>' : ''}</div></fieldset>
        <div class="lista">${existentes.map(q => `<button type="button" class="lista-item" data-duplicar="${q.id}">${marcaQw(q)}
        <span class="principal-texto"><b>Duplicar ${esc(q.nome)}</b></span></button>`).join('')}</div></section>` : ''}
    </div></div>`;
  ligarCabecalho();
  const previa = $('qw-previa');
  document.querySelectorAll('[data-modelo]').forEach(b => { b.onclick = () => {
    const m = modelos.find(x => String(x.indice) === b.dataset.modelo);
    document.querySelectorAll('[data-modelo]').forEach(x => x.setAttribute('aria-expanded', String(x === b)));
    previa.innerHTML = `<h3 id="qw-previa-titulo">${esc(m.nome)}</h3><p>${esc(m.para_que_serve)}</p>
      <div class="secoes"><div class="secao"><div class="secao-rotulo">O que a IA faz</div><div class="secao-conteudo">${esc(m.instrucoes)}</div></div>
      <div class="secao"><div class="secao-rotulo">Formato do resultado</div><div class="secao-conteudo">${esc(FORMATOS[m.formato] || 'Texto')}</div></div>
      ${(m.sugestoes || []).length ? `<div class="secao"><div class="secao-rotulo">Exemplos de pedido</div><div class="secao-conteudo"><ul>${m.sugestoes.map(t => `<li>${esc(t)}</li>`).join('')}</ul></div></div>` : ''}</div>
      <div class="linha-botoes"><a class="btn btn-verde" href="#/qw/nova/modelo/${m.indice}">Usar este modelo</a><button type="button" class="btn btn-texto" id="qw-previa-fechar">Escolher outro</button>${podeOcultar ? `<button type="button" class="btn btn-texto" data-ocultar="${m.indice}" aria-label="Ocultar o modelo ${esc(m.nome)} do catálogo da empresa">Ocultar do catálogo</button>` : ''}</div>`;
    previa.hidden = false;
    previa.focus();
    $('qw-previa-fechar').onclick = () => { previa.hidden = true; b.setAttribute('aria-expanded', 'false'); b.focus(); };
    previa.querySelector('[data-ocultar]')?.addEventListener('click', ocultar);
  }; });
  async function ocultar(ev) {
    try { await api(`/api/quick-wins/modelos-iniciais/${ev.currentTarget.dataset.ocultar}/ocultar`, { metodo: 'POST', corpo: {} }); toast('Modelo oculto do catálogo da empresa. Os Quick Wins já criados a partir dele continuam.'); novaOrigem(); }
    catch (e) { toast(e.message, 6000); }
  }
  document.querySelectorAll('[data-duplicar]').forEach(b => { b.onclick = async () => {
    const toda = $('toda')?.checked || false;
    const areasSel = [...document.querySelectorAll('input[name=area]:checked')].map(i => Number(i.value));
    b.disabled = true;
    try {
      const q = await api('/api/quick-wins', { metodo: 'POST', corpo: { duplicar_de: Number(b.dataset.duplicar), toda_empresa: toda, areas: areasSel } });
      await recarregarLateral();
      toast('Cópia criada em preparo.');
      irPara(`#/qw/${q.id}`);
    } catch (e) { b.disabled = false; toast(e.message, 6000); }
  }; });
}
// Usar um modelo: abre o assistente do formato atual já preenchido com o modelo (nada é criado aqui).
async function comModelo(indice) {
  const { modelos } = await api('/api/quick-wins/modelos-iniciais');
  const m = modelos.find(x => x.indice === indice);
  if (!m) { toast('Este modelo não está mais disponível. Escolha outro.', 'info'); return trocarPara('#/qw/nova/modelos'); }
  return assistenteQw(null, { inicial: { nome: m.nome, descricao: [m.para_que_serve, m.instrucoes].filter(Boolean).join('\n') } });
}

// Configuração em seções recolhíveis, em linguagem simples. O estado não se escolhe aqui: ele muda com Testar,
// Publicar e a decisão registrada em "Uso e decisão" (a API continua aceitando o estado, para quem a usa direto).
const NOMES_CORES = { '#1B7950': 'Verde', '#0F6E8C': 'Azul-petróleo', '#5B4B8A': 'Roxo', '#8C621D': 'Ocre', '#7A3E2E': 'Terracota', '#2F6B3B': 'Verde-musgo', '#3E5C76': 'Azul-ardósia', '#9B4029': 'Vermelho-tijolo' };
async function configurar(id) {
  const [qw, { areas }, est, bases, pessoas] = await Promise.all([api(`/api/quick-wins/${id}`), api('/api/areas'), api(`/api/quick-wins/${id}/estimativas`), api('/api/bases/documentos'),
    E.eu.admin ? api('/api/admin/pessoas').then(r => r.pessoas) : Promise.resolve(null)]);
  if (!qw.podeEditar) { toast('Só quem gerencia este Quick Win pode configurá-lo.', 'info'); return trocarPara(`#/qw/${id}`); }
  // Áreas que a pessoa pode usar, mais as que o Quick Win já tem.
  const nomes = new Map([...areas, ...E.permQw.areas].map(a => [a.id, a.nome]));
  const minhas = [...new Set([...E.permQw.areas.map(a => a.id), ...qw.areas])].map(id => ({ id, nome: nomes.get(id) || `Área ${id}` }));
  const sug = [...qw.sugestoes, '', '', '', ''].slice(0, 4);
  const radio = (nome, valor, atual, rotulo) => `<label><input type="radio" name="${nome}" value="${valor}" ${atual === valor ? 'checked' : ''}> ${rotulo}</label>`;
  const e = estadoQw(qw);
  // Uma seção recolhível; as que concentram o essencial vêm abertas.
  const secaoCfg = (chave, titulo, html, { aberta = false, oculta = false } = {}) => `<details class="grupo-form qw-cfg-secao${oculta ? ' oculto' : ''}" data-secao="${chave}"${aberta ? ' open' : ''}><summary><h2>${titulo}</h2></summary><div class="qw-cfg-corpo">${html}</div></details>`;
  // O estado aparece no selo. Só quando falta publicar há um aviso, com a ação que resolve ("Salvar e testar" já está na barra).
  const avisoEstado = e.id === 'publicado' || e.id === 'arquivado' ? ''
    : aviso(`<b>Estado: ${esc(ESTADOS[qw.status] || e.rotulo)}.</b> Ainda não está disponível para a equipe.`, 'info', `<a class="btn btn-linha btn-pequeno" href="#/qw/${id}/publicar">Publicar para a equipe</a>`);
  $('principal').innerHTML = `${cabecalho('Configurar Quick Win')}
    <div class="pagina"><form class="pg qw-config" id="form-qw" novalidate>
      ${cabecalhoPg({ trilha: [['Quick Wins', '#/quick-wins'], [qw.nome, `#/qw/${id}`], ['Configurar']], titulo: 'Configurar Quick Win', descricao: 'Vale para as próximas execuções. Campos com * são obrigatórios.', meta: seloQw(qw) })}
      ${avisoEstado}
      ${secaoCfg('identificacao', 'Identificação', `
        <div class="campo"><label for="nome">Nome *</label><input class="entrada" id="nome" value="${esc(qw.nome)}" maxlength="80" required aria-required="true" aria-describedby="erro-nome"><p class="msg-erro oculto" id="erro-nome"></p></div>
        <div class="campo"><label for="para">Para que serve</label><input class="entrada" id="para" value="${esc(qw.para_que_serve)}" maxlength="200" aria-describedby="para-ajuda"><span class="ajuda" id="para-ajuda">Uma frase. Aparece para quem vai usar.</span></div>
        <fieldset class="campo" aria-describedby="erro-areas"><legend class="legenda">Quem pode usar *</legend><div class="opcoes qw-opcoes-toque">${minhas.map(a => `<label><input type="checkbox" name="area" value="${a.id}" ${qw.areas.includes(a.id) ? 'checked' : ''}> ${esc(a.nome)}</label>`).join('')}
          ${E.permQw.todaEmpresa || qw.toda_empresa ? `<label><input type="checkbox" id="toda" ${qw.toda_empresa ? 'checked' : ''}> Toda a empresa</label>` : ''}</div><p class="msg-erro oculto" id="erro-areas"></p></fieldset>`, { aberta: true })}
      ${secaoCfg('aparencia', 'Ícone e cor', `
        <div class="duas-col">
          <div class="campo"><label for="icone">Ícone (até 2 letras)</label><input class="entrada" id="icone" value="${esc(qw.icone)}" maxlength="2"></div>
          <fieldset class="campo"><legend class="legenda">Cor</legend><div class="qw-cores">${CORES.map(c => `<label class="qw-cor"><input type="radio" name="cor" value="${c}" ${qw.cor.toLowerCase() === c.toLowerCase() ? 'checked' : ''}><span class="qw-cor-amostra" style="--qw-cor:${c}" aria-hidden="true"></span><span class="sr">${NOMES_CORES[c]}</span></label>`).join('')}</div></fieldset>
        </div>`)}
      ${qw.v2 ? `<div class="grupo-form"><h2>O que a IA deve fazer</h2><p class="lead">Para mudar o trabalho, use <a href="#/qw/${id}/ajustar">Editar instruções</a>.</p></div>` : ''}
      ${secaoCfg('instrucoes', 'O que a IA deve fazer', `
        <div class="campo"><label for="instrucoes">Instruções</label><textarea class="entrada" id="instrucoes" rows="7" aria-describedby="instrucoes-ajuda">${esc(qw.instrucoes)}</textarea><span class="ajuda" id="instrucoes-ajuda">Em português comum. Valem para todas as conversas deste Quick Win.</span></div>
        <fieldset class="campo"><legend class="legenda">Formato preferido da resposta</legend><div class="opcoes qw-opcoes-toque">${Object.entries(FORMATOS).map(([v, r]) => radio('formato', v, qw.formato, r)).join('')}</div></fieldset>
        <div class="campo"><span class="legenda">Sugestões de início (até 4)</span>${sug.map((s, i) => `<input class="entrada" style="margin-bottom:6px" data-sugestao value="${esc(s)}" placeholder="Ex.: Confira estes dois documentos e liste as diferenças" aria-label="Sugestão ${i + 1}">`).join('')}</div>
        <div class="duas-col">
          <div class="campo"><label for="ex-entrada">Exemplo de entrada (opcional)</label><textarea class="entrada" id="ex-entrada" rows="3">${esc(qw.exemplo_entrada)}</textarea></div>
          <div class="campo"><label for="ex-saida">Exemplo de saída (opcional)</label><textarea class="entrada" id="ex-saida" rows="3">${esc(qw.exemplo_saida)}</textarea></div>
        </div>`, { aberta: true, oculta: qw.v2 })}
      ${secaoCfg('proposito', 'Propósito e resultado', `
        <div class="campo"><label for="problema">Problema</label><textarea class="entrada" id="problema" rows="2" maxlength="2000" placeholder="O que hoje toma tempo, gera erro ou depende de uma pessoa">${esc(qw.problema || '')}</textarea></div>
        <div class="campo"><label for="objetivo">Objetivo</label><input class="entrada" id="objetivo" maxlength="2000" value="${esc(qw.objetivo || '')}" placeholder="Ex.: conferir um pedido em até 10 minutos"></div>
        <div class="campo"><label for="processo">Como é feito hoje</label><textarea class="entrada" id="processo" rows="2" maxlength="2000" aria-describedby="processo-ajuda">${esc(qw.processo_atual || '')}</textarea><span class="ajuda" id="processo-ajuda">Serve de ponto de partida para comparar antes e depois.</span></div>
        <div class="campo"><label for="responsavel">Responsável</label>${pessoas ? `<select class="entrada" id="responsavel"><option value="">sem responsável</option>${pessoas.filter(p => p.ativo).map(p => `<option value="${p.id}" ${qw.responsavel?.id === p.id ? 'selected' : ''}>${esc(p.nome)} · ${esc(p.email)}</option>`).join('')}</select>`
          : `<div class="linha-botoes"><span>${qw.responsavel ? esc(qw.responsavel.nome) : 'sem responsável'}</span>${qw.responsavel?.id !== E.eu.id ? '<label class="dica qw-opcao-toque"><input type="checkbox" id="assumir"> assumir como responsável</label>' : ''}</div>`}
          <span class="ajuda">Quem responde pelo resultado e pelas decisões deste Quick Win.</span></div>
        <div class="campo"><label for="resultado">Resultado observado</label><textarea class="entrada" id="resultado" rows="2" maxlength="2000" aria-describedby="resultado-ajuda">${esc(qw.resultado || '')}</textarea><span class="ajuda" id="resultado-ajuda">O que mudou no trabalho. Os números entram em “Uso e decisão”, com o antes e o depois.</span></div>`)}
      ${secaoCfg('bases', 'Arquivos e bases', `
        <div class="campo" id="fontes-qw"></div>
        <fieldset class="campo"><legend class="legenda">Bases de conhecimento</legend><div class="opcoes qw-opcoes-toque">
          ${radio('bases', 'nenhuma', qw.bases.modo, 'Nenhuma')}${radio('bases', 'area', qw.bases.modo, 'A da área')}${radio('bases', 'escolhidas', qw.bases.modo, 'Escolher documentos')}</div>
          <div class="opcoes qw-opcoes-toque" id="bases-escolhidas" style="margin-top:8px">${bases.documentos.map(d => `<label><input type="checkbox" name="base" value="${d.id}" ${qw.bases.ids.includes(d.id) ? 'checked' : ''}> ${esc(d.titulo)}</label>`).join('') || '<span class="dica">Nenhum documento de base disponível.</span>'}</div></fieldset>`)}
      ${secaoCfg('nivel', 'Nível', `
        <div class="campo"><label for="modelo">Nível</label><select class="entrada" id="modelo" aria-describedby="nivel-ajuda">
          <optgroup label="Níveis">${est.modelos.filter(m => m.classe).map(m => `<option value="${esc(m.id)}" ${m.id === qw.modelo ? 'selected' : ''}>${esc(m.nome)}${E.eu.admin ? ` · ${esc(m.modelo)}` : ''}${m.homologado ? ' · aprovado para dados sigilosos' : ''} · ${fmtCusto(m.custo, { conversa: true })} por conversa típica</option>`).join('')}</optgroup>
          ${E.eu.admin ? `<optgroup label="Modelo técnico específico">${est.modelos.filter(m => !m.classe).map(m => `<option value="${esc(m.id)}" ${m.id === qw.modelo ? 'selected' : ''}>${esc(m.nome)}${m.homologado ? ' · aprovado para dados sigilosos' : ''}</option>`).join('')}</optgroup>` : ''}
        </select>
          <span class="ajuda" id="nivel-ajuda">O nível define o equilíbrio entre custo e capacidade. O modelo por trás de cada nível é escolhido pela empresa e pode mudar sem alterar este Quick Win. Quem usa pode usar este nível mesmo sem acesso a ele no dia a dia.</span></div>
        <label class="opcoes qw-opcao-toque"><span><input type="checkbox" id="pode-trocar" ${qw.pode_trocar ? 'checked' : ''}> Quem usa pode trocar de nível (dentro dos níveis liberados para a pessoa)</span></label>`, { oculta: qw.v2 })}
      ${secaoCfg('dados', 'Dados e sigilo', `
        <fieldset class="campo"><legend class="legenda">Classificação</legend><div class="opcoes qw-opcoes-toque">${radio('sigiloso', '0', qw.sigiloso ? '1' : '0', 'Sem dados sigilosos')}${radio('sigiloso', '1', qw.sigiloso ? '1' : '0', 'Trata informações sigilosas (todas as conversas nascem sigilosas e seguem só com os guardrails de proteção)')}</div></fieldset>
        <div class="campo"><span class="legenda">O que fazer quando o sistema encontrar cada tipo de dado</span>
          <div class="tabela-rolagem"><table class="tabela qw-tabela-dados"><thead><tr><th>Tipo</th><th>Regra</th></tr></thead><tbody>
          ${Object.entries(DADOS).map(([t, r]) => `<tr><td>${r}</td><td>${seletorAcao(`dado-${t}`, r, qw.dados[t])}</td></tr>`).join('')}
          <tr><td>Senhas, chaves de acesso e outros segredos</td><td class="dica">Bloqueados quando reconhecidos (regra de segurança da GreenIA)</td></tr></tbody></table></div></div>`)}
      <p class="msg-erro oculto" id="erro-qw" role="alert" tabindex="-1"></p>
      <div class="linha-botoes qw-config-barra">
        <button class="btn btn-verde" id="salvar">Salvar</button>
        <button type="button" class="btn btn-linha" id="testar">Salvar e testar</button>
      </div>
      <section class="qw-zona-perigo" aria-labelledby="t-excluir"><h2 id="t-excluir">Excluir Quick Win</h2><p class="dica">As execuções anteriores continuam guardadas. Para só tirar de circulação, use Arquivar na página do Quick Win.</p>
        <button type="button" class="btn btn-perigo" id="excluir">Excluir Quick Win…</button></section>
    </form></div>`;
  ligarCabecalho();
  const mostrarBases = () => { $('bases-escolhidas').classList.toggle('oculto', document.querySelector('input[name=bases]:checked')?.value !== 'escolhidas'); };
  document.querySelectorAll('input[name=bases]').forEach(r => { r.onchange = mostrarBases; });
  mostrarBases();
  const valor = n => document.querySelector(`input[name="${n}"]:checked`)?.value;
  // Erro junto do campo: a seção abre, o campo recebe o foco e a mensagem fica ligada a ele.
  const erroCampo = (campo, msg) => {
    const el = $(`erro-${campo}`), alvo = campo === 'areas' ? document.querySelector('input[name=area], #toda') : $(campo);
    if (!el || !alvo) return false;
    el.textContent = msg; el.classList.remove('oculto');
    alvo.closest('details')?.setAttribute('open', '');
    alvo.setAttribute('aria-invalid', 'true');
    alvo.focus();
    return true;
  };
  const limparErros = () => {
    for (const el of document.querySelectorAll('#form-qw .msg-erro')) { el.textContent = ''; el.classList.add('oculto'); }
    for (const el of document.querySelectorAll('#form-qw [aria-invalid]')) el.removeAttribute('aria-invalid');
  };
  const salvar = async () => {
    limparErros();
    const areasSel = [...document.querySelectorAll('input[name=area]:checked')].map(i => Number(i.value)), toda = $('toda')?.checked || false;
    if (!$('nome').value.trim()) return !erroCampo('nome', 'Dê um nome ao Quick Win.');
    if (!toda && !areasSel.length) return !erroCampo('areas', 'Escolha pelo menos uma área.');
    const corpo = {
      nome: $('nome').value, icone: $('icone').value, cor: valor('cor') || qw.cor, para_que_serve: $('para').value, instrucoes: $('instrucoes').value,
      formato: valor('formato'), sugestoes: [...document.querySelectorAll('[data-sugestao]')].map(i => i.value), exemplo_entrada: $('ex-entrada').value, exemplo_saida: $('ex-saida').value,
      bases: { modo: valor('bases'), ids: [...document.querySelectorAll('input[name=base]:checked')].map(i => Number(i.value)) },
      modelo: $('modelo').value, pode_trocar: $('pode-trocar').checked, sigiloso: valor('sigiloso') === '1',
      dados: Object.fromEntries(Object.keys(DADOS).map(t => [t, valor(`dado-${t}`)])),
      toda_empresa: toda, areas: areasSel,
      problema: $('problema').value, objetivo: $('objetivo').value, processo_atual: $('processo').value, resultado: $('resultado').value,
      // Quick Win 2.0: o trabalho vem da especificação; este formulário cuida só de acesso, dados e ciclo.
      ...(qw.v2 ? { instrucoes: undefined, formato: undefined, modelo: undefined, pode_trocar: undefined, sugestoes: undefined, exemplo_entrada: undefined, exemplo_saida: undefined } : {}),
      ...($('responsavel') ? { responsavel_id: $('responsavel').value ? Number($('responsavel').value) : null } : $('assumir')?.checked ? { responsavel_id: E.eu.id } : {}),
    };
    try {
      await api(`/api/quick-wins/${id}`, { metodo: 'PUT', corpo });
      await recarregarLateral();
      return true;
    } catch (e) {
      if (['nome', 'areas'].includes(e.erro) && erroCampo(e.erro, e.message)) return false;
      $('erro-qw').textContent = e.message; $('erro-qw').classList.remove('oculto'); $('erro-qw').focus();
      return false;
    }
  };
  $('form-qw').onsubmit = async ev => { ev.preventDefault(); if (await salvar()) toast('Quick Win salvo.'); };
  $('testar').onclick = async () => { if (await salvar()) irPara(`#/qw/${id}/teste`); };
  $('excluir').onclick = async () => { try { await excluirQw(qw); } catch (e) { toast(e.message, 6000); } };
  montarFontes($('fontes-qw'), { idAtual: id, obterId: async () => id });
}
