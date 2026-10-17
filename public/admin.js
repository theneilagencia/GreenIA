import { EXEMPLOS_TRABALHO } from '/trabalhos.js';
import { painelAdvancedAdmin } from '/advanced.js';
import { nomeEvento } from '/jornadas.js';
import { corpoAuditoria, resumoAuditoria } from '/auditoria-detalhe.js';
import { ligarVisao } from '/preferencias.js';
// Gestão da GreenIA: telas de uso, pessoas, modelos, políticas, atividade,
// configurações e conhecimento, abertas como rotas da aplicação. O servidor confere
// cada permissão; aqui só se escolhe o que mostrar.
import { api, carregandoHtml, emCreditos, esc, fmtCusto, ICONE, ocupado, toast, vazioHtml } from '/comum.js';
import { E, ABAS_EMPRESA, cabecalho, desenharLateral, ligarCabecalho, pode, recarregarBases, trocarPara } from '/app.js';
import { renderizar } from '/md.js';
import { avisoCor } from '/cor.js';
import { abaAreas, abaPessoas, abaGrupos } from '/estrutura.js';
import { botaoRevelar, confirmar, ligarLinhas, painelLateral, revelarAte, topoTela, vigiarAlteracoes } from '/admin-ui.js';
import { fecharComEscape } from '/acessibilidade.js';
import { campoData, lerData } from '/data-br.js';

const $ = id => document.getElementById(id);
const S = { get eu() { return E.eu; }, get perm() { return E.permQw; }, get plano() { return E.plano; }, set plano(v) { E.plano = v; }, get operador() { return E.operador; } };
const PERFIS = { rapido: 'Rápido', equilibrado: 'Equilibrado', avancado: 'Advanced' };
// Perfil público para pesquisa externa (mesmos campos de src/quickwin-operacao.js PERFIL_PUBLICO).
const PERFIL_PUBLICO = { nome: 'Nome público', setor: 'Setor', categoria: 'Categoria de produto ou serviço', regiao: 'País ou região', mercado: 'Mercado-alvo' };
const DADOS = { cpf: 'CPF', rg: 'RG', cnpj: 'CNPJ', email: 'Email pessoal (Gmail, Hotmail...)', telefone: 'Telefone', cep: 'CEP', endereco: 'Endereço', cartao: 'Cartão', banco: 'Dados bancários', pix: 'Chave PIX', pessoal_restrito: 'Dado pessoal restrito (disciplinar, remuneração individual)', sensivel: 'Dado pessoal sensível (saúde, biometria, religião...)', confidencial: 'Documento marcado como confidencial' };
// Tratamento proporcional: seguir normalmente, só com proteção (guardrails) ou não enviar.
const ACAO = { permitir: 'Processar normalmente', proteger: 'Só com proteção', bloquear: 'Não enviar' };
const EFEITO = { permitir: 'Segue as regras gerais; a conversa não vira sigilosa', proteger: 'A conversa vira sigilosa: segue só com as proteções autorizadas', bloquear: 'Não é enviado; a pessoa vê o motivo' };
// Uma escolha por tipo de dado (lista), com o efeito ao lado: menos alvos na tela que três opções por linha.
const seletorAcao = (nome, rotulo, atual) => `<select class="entrada adm-regra" id="${nome}" name="${nome}" aria-label="Regra para ${rotulo}">${Object.entries(ACAO).map(([v, r]) => `<option value="${v}" ${atual === v ? 'selected' : ''}>${r}</option>`).join('')}</select>`;
const STATUS = { rascunho: 'Rascunho', ativo: 'Ativo', pausado: 'Pausado' };

const us = v => fmtCusto(v || 0);
const porMilhao = p => (p === null || p === undefined ? '—' : `US$ ${(p * 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}`);
const num = v => Number(v || 0).toLocaleString('pt-BR');
// Com plano, a empresa vê o consumo de cada modelo em créditos, nunca o preço.
const colunasPreco = () => (emCreditos() ? ['#Consumo por conversa típica'] : ['#Entrada (1M)', '#Saída (1M)', '#Conversa típica']);
const celulasPreco = x => (emCreditos() ? `<td class="num">${fmtCusto(x.custoConversa, { conversa: true })}</td>`
  : `<td class="num">${porMilhao(x.precoEntrada)}</td><td class="num">${porMilhao(x.precoSaida)}</td><td class="num">${fmtCusto(x.custoConversa)}</td>`);
// No cartão do catálogo, o consumo (ou o preço, sem plano) aparece como dado, com o rótulo ao lado do valor.
const metaPreco = x => (emCreditos() ? `<div><dt>Consumo por conversa típica</dt><dd>${fmtCusto(x.custoConversa, { conversa: true })}</dd></div>`
  : `<div><dt>Entrada (1M)</dt><dd>${porMilhao(x.precoEntrada)}</dd></div><div><dt>Saída (1M)</dt><dd>${porMilhao(x.precoSaida)}</dd></div><div><dt>Conversa típica</dt><dd>${fmtCusto(x.custoConversa)}</dd></div>`);
const dataHora = iso => (iso ? new Date(iso.replace(' ', 'T') + (iso.length === 19 ? 'Z' : '')).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
const lerDataUrl = f => new Promise(ok => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.readAsDataURL(f); });
const falhar = e => toast(e.message || 'Algo deu errado.', 6000);
const caixas = (nome, lista, marcados = []) => `<div class="caixas">${lista.map(i => `<label><input type="checkbox" name="${nome}" value="${i.id}" ${marcados.includes(i.id) ? 'checked' : ''}> ${esc(i.nome || i.email)}</label>`).join('') || '<span class="dica">Nada para escolher ainda.</span>'}</div>`;
const marcados = nome => [...document.querySelectorAll(`input[name="${nome}"]:checked`)].map(i => Number(i.value));
const tabela = (cab, linhas, vazio = 'Nada por aqui ainda.') => `<div class="tabela-rolagem"><table class="tabela"><thead><tr>${cab.map(c => (c ? `<th${c.startsWith('#') ? ' class="num"' : ''}>${esc(c.replace(/^#/, ''))}</th>` : '<th><span class="sr">Ações</span></th>')).join('')}</tr></thead>
  <tbody>${linhas.length ? linhas.join('') : `<tr><td colspan="${cab.length}" class="dica">${vazio}</td></tr>`}</tbody></table></div>`;


// ---------------------------------------------------------------- Áreas e pessoas
// ---------------------------------------------------------------- Quick wins
async function abaCriacaoQw() {
  const [perm, { pessoas }, { grupos }] = await Promise.all([api('/api/admin/quick-wins-permissoes'), api('/api/admin/pessoas'), api('/api/admin/grupos')]);
  // Lista de pessoas com busca: com muitas pessoas, a busca filtra as caixas sem perder as já marcadas.
  const pessoasComBusca = (nome, marcadas, id) => `<label class="legenda" for="busca-${id}">Pessoas</label>
    <input class="entrada entrada-pequena adm-busca-caixas" id="busca-${id}" type="search" placeholder="Buscar por nome ou email" data-filtra="${nome}" autocomplete="off">
    <div class="caixas-rolagem">${caixas(nome, pessoas, marcadas)}</div>`;
  // A permissão para a empresa toda é a mais rara: fica recolhida, a não ser que já tenha alguém.
  const todaEmpresa = perm.todaEmpresa.grupos.length + perm.todaEmpresa.pessoas.length > 0;
  $('conteudo').innerHTML = `${topoTela('Quem pode criar Quick Wins, além de quem administra a empresa.')}
    <form class="grupo-form" id="perm-qw">
      <section class="adm-escopo"><h2>Nas áreas de cada pessoa</h2>
        <p class="dica">Quem estiver aqui cria Quick Wins só para as áreas de que faz parte.</p>
        <label class="opcoes"><span><input type="checkbox" id="perm-resp" ${perm.responsaveis ? 'checked' : ''}> Responsáveis de área, nas áreas em que são responsáveis</span></label>
        <div class="duas-col"><div><span class="legenda">Grupos autorizados</span>${caixas('perm-grupos', grupos, perm.grupos)}</div>
          <div>${pessoasComBusca('perm-pessoas', perm.pessoas, 'areas')}</div></div></section>
      <div class="adm-mais">${botaoRevelar('perm-toda-empresa', 'Para a empresa toda', todaEmpresa)}</div>
      <section class="adm-escopo" id="perm-toda-empresa" ${todaEmpresa ? '' : 'hidden'}><h2>Para a empresa toda</h2>
        <p class="dica">Quem estiver aqui cria Quick Wins que valem para todas as áreas. Quem administra a empresa já pode.</p>
        <div class="duas-col"><div><span class="legenda">Grupos</span>${caixas('perm-tg', grupos, perm.todaEmpresa.grupos)}</div><div>${pessoasComBusca('perm-tp', perm.todaEmpresa.pessoas, 'empresa')}</div></div></section>
      <div class="linha-botoes"><button class="btn btn-verde btn-pequeno">Salvar permissões</button></div></form>`;
  const vig = vigiarAlteracoes($('perm-qw'), { barra: $('perm-qw').querySelector('.linha-botoes') });
  $('perm-qw').addEventListener('input', ev => {
    const busca = ev.target.closest('[data-filtra]');
    if (!busca) return;
    const q = busca.value.trim().toLowerCase();
    for (const l of busca.parentElement.querySelectorAll(`input[name="${busca.dataset.filtra}"]`)) { const r = l.closest('label'); r.style.display = q && !r.textContent.toLowerCase().includes(q) ? 'none' : ''; }
  });
  $('perm-qw').onsubmit = async ev => {
    ev.preventDefault();
    try {
      await api('/api/admin/quick-wins-permissoes', { metodo: 'PUT', corpo: { responsaveis: $('perm-resp').checked, grupos: marcados('perm-grupos'), pessoas: marcados('perm-pessoas'),
        todaEmpresa: { grupos: marcados('perm-tg'), pessoas: marcados('perm-tp') } } });
      vig.limpar(); toast('Permissões salvas.');
    } catch (e) { falhar(e); }
  };
}

// ---------------------------------------------------------------- Modelos de IA
const NOMES_CAP = { geral: 'Geral', raciocinio: 'Raciocínio', programacao: 'Programação', precisao: 'Precisão', leitura_longa: 'Leitura longa' };
const NIVEL_CLASSE = { rapido: 1, equilibrado: 2, avancado: 3 };
const idDom = id => esc(id).replace(/[^\w-]/g, '-');
const opcaoModelos = (lista, sel, vazio = '') => `${vazio ? `<option value="">${vazio}</option>` : ''}${lista.map(x => `<option value="${esc(x.id)}" ${x.id === sel ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}`;

const exemplosDeTrabalho = () => `<section class="trabalho-exemplos" aria-labelledby="trabalho-exemplos-titulo"><div class="trabalho-secao"><h2 id="trabalho-exemplos-titulo">Um pedido, os recursos certos</h2><p>Alguns exemplos do que sua equipe pode fazer.</p></div><div class="trabalho-grade">${EXEMPLOS_TRABALHO.map(([titulo,texto,icone])=>`<article class="trabalho-exemplo"><span class="trabalho-icone">${ICONE[icone]}</span><h3>${titulo}</h3><p>${texto}</p></article>`).join('')}</div><p class="trabalho-nota">${ICONE.escudo} Os recursos necessários variam conforme os arquivos e as etapas de cada pedido.</p></section>`;

// Modelos, aba principal: o que a empresa decide. Modo (recomendado ou manual), os níveis e quem usa cada um.
// O catálogo técnico (cada modelo, aprovação para dados sigilosos, capacidades, adicionar) é a aba Catálogo técnico.
async function abaModelos() {
  const [m, { grupos }, { areas }, gov, sig, sug] = await Promise.all([api('/api/admin/modelos'), api('/api/admin/grupos'), api('/api/admin/areas'), api('/api/admin/governanca'), api('/api/admin/sigilo'),
    api('/api/admin/modelos/sugestao').catch(() => null)]);
  const cfg = m.config;
  const liberados = m.modelos.filter(x => x.liberado);
  const homologados = liberados.filter(x => x.homologado);
  const padrao = m.modelos.find(x => x.id === m.homologadoPadrao);
  const acesso = p => { const a = cfg.acessoPerfis[p] || {}; return `<div class="editor"><b>${PERFIS[p]}</b>
    <label class="opcoes"><span><input type="checkbox" id="todos-${p}" ${a.todos ? 'checked' : ''}> Todas as pessoas</span></label>
    <div class="duas-col"><div><span class="legenda">Grupos</span>${caixas(`ac-g-${p}`, grupos, a.grupos || [])}</div><div><span class="legenda">Áreas</span>${caixas(`ac-a-${p}`, areas, a.areas || [])}</div></div></div>`; };
  const recomendado = gov.modo !== 'manual';
  const cartaoGov = `<div class="editor" id="governanca"><span class="editor-titulo">Como a empresa usa a IA</span>
    <div class="escolhas" role="radiogroup" aria-label="Como a empresa usa a IA" data-sem-alteracao>
      <label class="escolha"><input type="radio" name="gov" value="recomendado" ${recomendado ? 'checked' : ''}>
        <span class="escolha-titulo">Deixar o GreenIA escolher conforme o trabalho <span class="selo-recomendado">Recomendado</span></span>
        <span class="escolha-desc">Sua equipe descreve o que precisa fazer. O GreenIA escolhe os recursos adequados para cada pedido, respeitando os acessos e o limite de consumo definidos pela empresa.</span></label>
      <label class="escolha"><input type="radio" name="gov" value="manual" ${recomendado ? '' : 'checked'}>
        <span class="escolha-titulo">Configurar manualmente</span>
        <span class="escolha-desc">Você ajusta níveis, acesso e modelos.</span></label>
    </div></div>`;
  // No máximo um aviso, e só quando pede ação: sigilo ligado sem nenhum recurso autorizado.
  // Com a Sugestão da GreenIA resolvendo, o aviso leva ao fluxo de um clique (Políticas de IA), não ao catálogo técnico.
  const sugerir = ['aplicar', 'parcial'].includes(sug?.sigilo.situacao);
  const aviso = sig.ativo && !padrao ? `<div class="faixa-aviso erro"><b>Conversas sigilosas bloqueadas: falta um recurso aprovado para dados sigilosos.</b> ${sugerir
    ? 'A GreenIA já separou os modelos para o uso da empresa. <a href="#/politicas?sugestao=1">Aprovar os modelos sugeridos</a>'
    : recomendado ? 'Solicite ao administrador da plataforma uma rota autorizada, com fornecedor definido, sem uso para treino e com retenção zero.'
      : 'Aprove um modelo em <a href="#/modelos/catalogo">Catálogo técnico</a> ou peça ao administrador da plataforma uma rota autorizada.'}</div>` : '';
  // Sugestão para os níveis: em palavras simples, nível por nível; um botão só quando há o que mudar.
  const niveisSug = sug?.niveis;
  const blocoSugestao = niveisSug ? `<section class="editor adm-sug-niveis" id="sugestao-niveis" aria-labelledby="sug-niveis-titulo">
    <div class="adm-sug-niveis-topo"><h2 id="sug-niveis-titulo" class="editor-titulo">Sugestão para a sua empresa</h2>
      ${niveisSug.segue ? `<span class="selo selo-verde">${ICONE.escudo} Sua configuração já segue a sugestão</span>` : `<button type="button" class="btn ${recomendado ? 'btn-verde' : 'btn-linha'} btn-pequeno" id="sug-niveis-usar">Usar a sugestão</button>`}</div>
    <p class="dica">${esc(sug.uso.frase)}</p>
    <ul class="adm-sug-niveis-lista">${niveisSug.itens.map(i => `<li data-nivel="${i.nivel}"><b>${esc(i.nome)}</b><span>${esc(i.texto)}</span>${i.segue ? '' : '<span class="tag tag-ambar">Muda</span>'}</li>`).join('')}</ul></section>` : '';
  $('conteudo').innerHTML = `${topoTela('Defina os acessos da equipe. A plataforma escolhe os recursos conforme o trabalho de cada pedido.')}
    <form id="cfg-modelos">
    ${cartaoGov}${aviso}${exemplosDeTrabalho()}<details><summary>Detalhes da configuração de IA</summary>${blocoSugestao}
    <h2>Níveis</h2>
    <div class="tabela-rolagem"><table class="tabela tabela-empilha"><thead><tr><th>Nível</th><th>Modelos do nível</th><th>Alternativa se falhar</th><th>Consumo por conversa típica</th><th>Quem usa no dia a dia</th></tr></thead><tbody>
      ${Object.entries(PERFIS).map(([k, v]) => { const x = m.modelos.find(y => y.id === cfg.padroes[k]); const r = x && m.modelos.find(y => y.id === x.reserva); const a = cfg.acessoPerfis[k] || {}; const pool = liberados.filter(y => y.perfil === k && y.noCatalogo);
        return `<tr><td data-r="Nível"><b>${v}</b></td><td data-r="Modelos do nível"><b>${pool.length} ${pool.length === 1 ? 'modelo disponível' : 'modelos disponíveis'}</b><br><span class="dica">${pool.map(y => esc(y.nome)).join(' · ') || 'Nenhum modelo disponível'}${x ? `<br>Preferência: ${esc(x.nome)}` : ''}</span></td>
          <td data-r="Alternativa se falhar">${r ? esc(r.nome) : pool.length > 1 ? '<span class="dica">Seleção automática no mesmo nível, quando elegível. Em sigilo, nova conferência das regras.</span>' : '<span class="dica">Sem alternativa no nível</span>'}</td><td data-r="Consumo">${x ? fmtCusto(x.custoConversa, { conversa: true }) : '—'}</td>
          <td data-r="Quem usa">${k === 'avancado' ? 'Somente com liberação administrativa e limite de consumo' : k === 'rapido' || a.todos ? 'Todas as pessoas' : (a.grupos || []).length + (a.areas || []).length ? 'Grupos e áreas escolhidos' : 'Só pelo Quick Win'}</td></tr>`; }).join('')}
    </tbody></table></div>
    </details><div class="secao-titulo"><h2>Ajustes opcionais de acesso</h2>${recomendado ? botaoRevelar('modelos-manuais', 'Ajustar manualmente') : ''}</div>
    <div id="modelos-manuais" ${recomendado ? 'hidden' : ''}>
    ${recomendado ? '<p class="dica">Salvar um ajuste aqui passa a empresa para o modo manual. As regras de sigilo continuam valendo.</p>' : ''}
      <p class="dica">${PERFIS.rapido}: todas as pessoas, sempre.</p>
      ${acesso('equilibrado')}<p>O Advanced usa as liberações recomendadas para cada trabalho, no painel abaixo. Configurar um Quick Win não concede esse acesso.</p>
      <h3>Níveis que podem ser escolhidos em Quick Win</h3>
      <div class="opcoes">${Object.entries(PERFIS).map(([k, v]) => `<label><input type="checkbox" name="perfis-qw" value="${k}" ${cfg.perfisQuickWin.includes(k) ? 'checked' : ''}> ${v}</label>`).join('')}</div>
      <div class="adm-mais">${botaoRevelar('modelos-mais', 'Mais opções')}</div>
      <div id="modelos-mais" hidden>
        <h3>Modelo de cada nível</h3>
        <div class="duas-col">
          <div class="campo"><label for="pd-chat">Chat</label><select class="entrada" id="pd-chat">${opcaoModelos(liberados, cfg.padroes.chat)}</select></div>
          <div class="campo"><label for="pd-homologado">Homologado padrão (aprovado para conversas sigilosas)</label><select class="entrada" id="pd-homologado">${opcaoModelos(homologados, cfg.padroes.homologado, 'o primeiro disponível para todos')}</select></div>
          ${Object.entries(PERFIS).map(([k, v]) => `<div class="campo"><label for="pd-${k}">${v}</label><select class="entrada" id="pd-${k}">${opcaoModelos(liberados.filter(x => x.perfil === k), cfg.padroes[k], 'nenhum')}</select></div>`).join('')}
        </div>
        <h3>Privacidade</h3>
        <label class="opcoes"><span><input type="checkbox" id="sem-treino" ${cfg.exigirSemTreino ? 'checked' : ''}> Em conversas normais, usar só fornecedores que não treinam com os dados</span></label>
        <label class="opcoes"><span><input type="checkbox" id="automatico" ${cfg.automatico ? 'checked' : ''}> Oferecer também o "Automático do serviço de IA" no seletor</span></label>
      </div>
    </div>
    <div class="linha-botoes" id="modelos-salvar" ${recomendado ? 'hidden' : ''}><button class="btn btn-verde">Salvar configuração de modelos</button></div>
    </form>`;

  $('sug-niveis-usar')?.addEventListener('click', async ev => {
    const botao = ev.currentTarget;
    if (!await confirmar({ titulo: 'Usar a sugestão para os níveis?', texto: niveisSug.confirmacao, botao: 'Usar a sugestão' })) return;
    await ocupado(botao, async () => {
      try { await api('/api/admin/modelos/sugestao/aplicar', { metodo: 'POST', corpo: { parte: 'niveis' } }); toast('Pronto: os níveis seguem a sugestão.'); await abaModelos(); } catch (e) { falhar(e); }
    });
  });
  $('conteudo').onchange = ev => {
    const t = ev.target;
    if (t.id === 'sem-treino' && !t.checked) confirmar({ titulo: 'Permitir fornecedores que treinam com os dados?', texto: 'Desligada, esta opção permite, nas conversas normais, fornecedores que guardam ou treinam com os dados. A mudança vale ao salvar e fica no registro de eventos.', botao: 'Desligar a exigência', perigo: true }).then(ok => { if (!ok) t.checked = true; });
  };
  document.querySelectorAll('input[name="gov"]').forEach(t => { t.onchange = async () => {
      if (t.value === 'recomendado' && !await confirmar({ titulo: 'Seguir as recomendações da GreenIA?', texto: 'Os ajustes manuais de modelos, níveis e escolha automática são trocados pelas recomendações. As aprovações para dados sigilosos continuam valendo.', botao: 'Seguir as recomendações' })) { abaModelos(); return; }
      // Evita salvar o formulário antigo enquanto a escolha está sendo aplicada.
      document.querySelectorAll('#conteudo input, #conteudo select, #conteudo button').forEach(e => { e.disabled = true; });
      try { await api('/api/admin/governanca', { metodo: 'PUT', corpo: { modo: t.value } }); toast(t.value === 'recomendado' ? 'A empresa segue as recomendações da GreenIA.' : 'Configuração manual ligada.'); }
      catch (e) { falhar(e); }
      finally { await abaModelos(); }
  }; });
  $('cfg-modelos').onsubmit = async ev => {
    ev.preventDefault();
    const ac = p => ({ todos: $(`todos-${p}`).checked, grupos: marcados(`ac-g-${p}`), areas: marcados(`ac-a-${p}`) });
    try {
      await api('/api/admin/modelos-config', { metodo: 'PUT', corpo: {
        padroes: { chat: $('pd-chat').value, homologado: $('pd-homologado').value || null, rapido: $('pd-rapido').value || null, equilibrado: $('pd-equilibrado').value || null, avancado: $('pd-avancado').value || null },
        acessoPerfis: { equilibrado: ac('equilibrado'), avancado: cfg.acessoPerfis.avancado },
        perfisQuickWin: [...document.querySelectorAll('input[name=perfis-qw]:checked')].map(i => i.value),
        exigirSemTreino: $('sem-treino').checked, automatico: $('automatico').checked } });
      toast('Configuração salva.'); abaModelos();
    } catch (e) { falhar(e); }
  };
  // O formulário cobre a tela inteira, para a barra de salvar ficar presa ao pé da tela; no modo recomendado, ela só
  // aparece depois de "Ajustar manualmente".
  await painelAdvancedAdmin($('conteudo'));
  vigiarAlteracoes($('cfg-modelos'), { barra: $('modelos-salvar') });
  document.querySelector('[aria-controls="modelos-manuais"]')?.addEventListener('click', () => setTimeout(() => { $('modelos-salvar').hidden = $('modelos-manuais').hidden; }));
}

// ---------------------------------------------------------------- Catálogo técnico
// Lista compacta de modelos (um ponto de parada no teclado); cada modelo abre no painel lateral, onde ficam nível,
// reserva, liberação, atributos de dados, capacidades e a aprovação para dados sigilosos. Cada mudança salva na hora.
async function abaCatalogo(abrirId = null) {
  const [m, gov] = await Promise.all([api('/api/admin/modelos'), api('/api/admin/governanca')]);
  const liberados = m.modelos.filter(x => x.liberado);
  const recomendado = gov.modo !== 'manual';
  const sigiloModelo = x => (x.homologado ? '<span class="tag tag-verde">Recebe dados sigilosos</span>' : x.homologacaoEmpresa || x.autorizacaoPlataforma ? '<span class="tag tag-ambar">Aprovação com pendência</span>' : '<span class="dica">—</span>');
  $('conteudo').innerHTML = `${topoTela('Cada modelo, o nível dele e a aprovação para dados sigilosos. Clique num modelo para ajustar.', botaoRevelar('add-modelo', 'Adicionar modelo').replace('btn-linha', 'btn-verde'))}
    ${recomendado ? '<p class="dica">No modo recomendado, a GreenIA cuida dos modelos. Alterar um modelo aqui passa a empresa para o modo manual.</p>' : ''}
    <section id="add-modelo" class="editor adm-add-modelo" hidden aria-labelledby="add-modelo-titulo"><h2 id="add-modelo-titulo" class="editor-titulo">Adicionar modelo</h2>
      <form class="filtros" id="busca-modelo"><div class="campo"><label for="q-modelo">Buscar no catálogo por nome ou id</label><input class="entrada" id="q-modelo" placeholder="ex.: claude, gemini, gpt"></div><button class="btn btn-linha btn-pequeno">Buscar</button></form>
      <div id="resultado-busca"></div>
      <h3>Adicionar pelo identificador, sem o catálogo</h3>
      <form class="filtros" id="add-manual"><div class="campo"><label for="id-manual">Identificador do modelo</label><input class="entrada" id="id-manual" placeholder="fornecedor/modelo" pattern="[a-z0-9._~-]+/[a-z0-9._:-]+" required></div>
        <div class="campo"><label for="perfil-manual">Nível</label><select class="entrada" id="perfil-manual">${Object.entries(PERFIS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
        <button class="btn btn-linha btn-pequeno">Adicionar e liberar</button></form></section>
    ${tabela(['Modelo', 'Nível', 'Situação', 'Dados sigilosos'], m.modelos.map((x, i) => `<tr data-registro="${i}" aria-label="${esc(`${x.nome}. Enter abre o detalhe.`)}">
      <td><span class="adm-registro-nome">${esc(x.nome)}</span><br><span class="dica adm-modelo-id">${esc(x.id)}</span></td><td>${PERFIS[x.perfil] || '—'}</td>
      <td>${x.liberado ? '<span class="tag tag-verde"><i></i>Liberado</span>' : '<span class="tag"><i></i>Fora da lista</span>'}${x.aviso ? ' <span class="tag tag-ambar">Atenção</span>' : ''}</td><td>${sigiloModelo(x)}</td></tr>`), 'Nenhum modelo ainda.').replace('class="tabela"', 'class="tabela adm-registros"')}`;

  // Depois de salvar, a lista volta atualizada e o painel reabre com o modelo, se a pessoa ainda não o fechou.
  const recarregar = async id => { await abaCatalogo(document.querySelector('#modal .px') ? id : null); };
  const salvarModelo = async (id, corpo, msg) => { try { await api(`/api/admin/modelos/${encodeURIComponent(id)}`, { metodo: 'PUT', corpo }); toast(msg); } catch (e) { falhar(e); } recarregar(id); };
  const abrir = x => {
    painelLateral({ migalha: 'Catálogo técnico', titulo: x.nome, corpo: `<p class="dica adm-modelo-id">${esc(x.id)}</p>
      ${x.aviso ? `<div class="faixa-aviso atencao">${esc(x.aviso)}</div>` : ''}
      <dl class="adm-modelo-dados">${metaPreco(x)}<div><dt>Tamanho do conteúdo</dt><dd>${x.contexto ? num(x.contexto) : '—'}</dd></div></dl>
      <div class="adm-modelo-campos">
        <label class="adm-modelo-campo"><span>Nível</span><select class="entrada" data-perfil="${esc(x.id)}" aria-label="Nível de ${esc(x.nome)}">${Object.entries(PERFIS).map(([k, v]) => `<option value="${k}" ${x.perfil === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <label class="adm-modelo-campo"><span>Reserva</span><select class="entrada" data-reserva="${esc(x.id)}" aria-label="Reserva de ${esc(x.nome)}">${opcaoModelos(liberados.filter(r => r.id !== x.id && r.perfil === x.perfil), x.reserva, 'sem reserva')}</select></label>
        <label class="adm-marca adm-modelo-liberado"><input type="checkbox" data-liberado="${esc(x.id)}" ${x.liberado ? 'checked' : ''} aria-label="${esc(x.nome)} liberado"> <span>Liberado</span></label>
      </div>
      <section class="px-secao adm-modelo-sigilo"><h3>Dados sigilosos</h3>
        ${x.homologacaoEmpresa ? `<span class="selo">${ICONE.escudo} Homologado pela empresa</span> <span class="dica">aprovado para dados sigilosos</span><span class="dica">${esc(x.homologacaoEmpresa.fornecedor || '')} · ${esc(x.homologacaoEmpresa.quem || '')} · ${dataHora(x.homologacaoEmpresa.em)}</span>` : ''}
        ${x.autorizacaoPlataforma ? `<span class="selo">${ICONE.escudo} Autorizado pela plataforma</span>` : ''}
        ${x.liberado && x.dados ? `<p class="dica">Pode receber: ${['conteúdo comum', x.dados.dadosPessoais && 'dados pessoais', x.dados.sensiveis && 'dados sensíveis e confidenciais'].filter(Boolean).join(', ')} · treino: ${esc(x.dados.semTreino)} · retenção zero: ${esc(x.dados.retencaoZero)}${x.dados.regiao ? ` · região: ${esc(x.dados.regiao)}` : ''}</p>` : ''}
        ${x.homologado ? '<p class="dica">Recebe informação sigilosa (proteções obrigatórias atendidas)</p>' : (x.homologacaoEmpresa || x.autorizacaoPlataforma) ? `<p class="dica">Não recebe informação sigilosa: ${esc((x.sigiloTexto || []).join('; '))}</p>` : ''}
        ${x.homologacaoEmpresa || !x.vetadoPlataforma ? '' : '<p class="dica">Proibido pela plataforma para dados sigilosos</p>'}
        ${!x.homologacaoEmpresa && !x.vetadoPlataforma && !x.liberado ? '<p class="dica">Libere o modelo antes de aprovar para dados sigilosos</p>' : ''}
        ${x.homologacaoEmpresa ? `<div class="linha-botoes"><button type="button" class="btn btn-perigo btn-pequeno" data-retirar="${esc(x.id)}">Retirar aprovação</button></div>`
          : !x.vetadoPlataforma && x.liberado ? `<div class="linha-botoes"><button type="button" class="btn btn-linha btn-pequeno" data-homologar="${esc(x.id)}">Aprovar para dados sigilosos</button></div>` : ''}</section>
      ${x.liberado && x.dados ? `<section class="px-secao"><h3>Atributos de dados</h3><div class="adm-atributos">
          <label class="dica">Uso para treino <select class="entrada" data-attr="semTreino" data-modelo="${esc(x.id)}">${[['', 'conforme a rota'], ['true', 'não treina (contrato)'], ['false', 'pode treinar']].map(([v, r]) => `<option value="${v}" ${String(x.atributos?.semTreino ?? '') === v ? 'selected' : ''}>${r}</option>`).join('')}</select></label>
          <label class="dica">Dados pessoais <select class="entrada" data-attr="dadosPessoais" data-modelo="${esc(x.id)}">${[['', 'conforme os atributos'], ['permitido', 'permitido'], ['proibido', 'proibido']].map(([v, r]) => `<option value="${v}" ${(x.atributos?.dadosPessoais ?? '') === v ? 'selected' : ''}>${r}</option>`).join('')}</select></label>
          <label class="dica">Região <input class="entrada" data-attr="regiao" data-modelo="${esc(x.id)}" value="${esc(x.atributos?.regiao || '')}" maxlength="60"></label>
          <button type="button" class="btn btn-linha btn-pequeno" data-salvar-attr="${esc(x.id)}">Salvar atributos</button></div></section>` : ''}
      <section class="px-secao"><h3>Capacidades</h3><p class="dica">Em branco, vale o nível do modelo (${NIVEL_CLASSE[x.perfil] || 1}).</p>
        <div class="duas-col">${Object.entries(NOMES_CAP).map(([k, n]) => `<label class="dica">${n}
          <select class="entrada" data-cap="${esc(x.id)}" data-dim="${k}"><option value="">do nível (${NIVEL_CLASSE[x.perfil] || 1})</option>${[1, 2, 3].map(v => `<option value="${v}" ${(x.capacidades || {})[k] === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label>`).join('')}</div></section>` });
    const px = document.querySelector('#modal .px');
    px.addEventListener('change', ev => {
      const t = ev.target;
      if (t.dataset.perfil) salvarModelo(t.dataset.perfil, { perfil: t.value }, 'Nível alterado.');
      if (t.dataset.liberado) salvarModelo(t.dataset.liberado, { liberado: t.checked }, t.checked ? 'Modelo liberado.' : 'Modelo retirado da lista liberada.');
      if (t.dataset.reserva) salvarModelo(t.dataset.reserva, { reserva: t.value || null }, 'Reserva salva.');
      if (t.dataset.cap) {
        const caps = Object.fromEntries([...px.querySelectorAll(`[data-cap="${CSS.escape(t.dataset.cap)}"]`)].filter(e => e.value).map(e => [e.dataset.dim, Number(e.value)]));
        salvarModelo(t.dataset.cap, { capacidades: caps }, 'Capacidades salvas.');
      }
    });
    px.addEventListener('click', async ev => {
      const t = ev.target.closest('button');
      if (!t) return;
      if (t.dataset.homologar) homologar(x, () => recarregar(x.id));
      if (t.dataset.salvarAttr) {
        const v = k => px.querySelector(`[data-attr="${k}"]`)?.value || '';
        const atributos = { semTreino: v('semTreino') === '' ? null : v('semTreino') === 'true', dadosPessoais: v('dadosPessoais') || null, regiao: v('regiao') || null };
        try { await api(`/api/admin/modelos/${encodeURIComponent(x.id)}`, { metodo: 'PUT', corpo: { atributos } }); toast('Atributos salvos.'); recarregar(x.id); } catch (e) { falhar(e); }
      }
      if (t.dataset.retirar && await confirmar({ titulo: `Retirar a aprovação de ${x.nome}?`, texto: 'O modelo deixa de receber dados sigilosos. Conversas sigilosas abertas passam para o homologado padrão, com aviso. A política ganha nova versão.', botao: 'Retirar aprovação', perigo: true })) {
        try { await api(`/api/admin/modelos/${encodeURIComponent(x.id)}/homologar`, { metodo: 'DELETE' }); toast('Homologação retirada. A política ganhou nova versão.'); recarregar(x.id); } catch (e) { falhar(e); }
      }
    });
  };
  ligarLinhas(document.querySelector('#conteudo .adm-registros'), i => { const x = m.modelos[Number(i)]; if (x) abrir(x); });
  if (abrirId) { const x = m.modelos.find(y => y.id === abrirId); if (x) abrir(x); }

  $('conteudo').onclick = ev => {
    const t = ev.target.closest('button[data-liberar-catalogo]');
    if (!t) return;
    const perfil = document.querySelector(`[data-perfil-catalogo="${CSS.escape(t.dataset.liberarCatalogo)}"]`).value;
    salvarModelo(t.dataset.liberarCatalogo, { liberado: true, perfil }, 'Modelo liberado.');
  };
  $('busca-modelo').onsubmit = async ev => {
    ev.preventDefault();
    $('resultado-busca').innerHTML = '<p class="dica">Buscando…</p>';
    const { modelos } = await api(`/api/admin/modelos/catalogo?busca=${encodeURIComponent($('q-modelo').value)}`);
    $('resultado-busca').innerHTML = modelos.length ? tabela(['Modelo', ...colunasPreco(), '#Tamanho do conteúdo', 'Nível', ''], modelos.map(x => `<tr>
      <td><b>${esc(x.nome)}</b><br><span class="dica">${esc(x.id)}</span></td>${celulasPreco(x)}<td class="num">${num(x.contexto)}</td>
      <td><select data-perfil-catalogo="${esc(x.id)}" aria-label="Nível de ${esc(x.nome)}">${Object.entries(PERFIS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></td>
      <td><button class="btn btn-linha btn-pequeno" data-liberar-catalogo="${esc(x.id)}">Liberar</button></td></tr>`))
      : '<p class="dica">O catálogo de modelos não respondeu ou não achou nada. Tente de novo em instantes, ou adicione pelo identificador logo abaixo.</p>';
  };
  $('add-manual').onsubmit = ev => { ev.preventDefault(); salvarModelo($('id-manual').value.trim(), { liberado: true, perfil: $('perfil-manual').value }, 'Modelo adicionado e liberado.'); };
}

function homologar(modelo, depois = () => {}) {
  $('modal').insertAdjacentHTML('beforeend', `<div class="modal-fundo" id="fundo-h"><form class="modal" role="dialog" aria-modal="true" aria-labelledby="t-h" id="form-h">
    <div class="modal-topo"><div class="rotulo">Aprovar para dados sigilosos (homologar)</div><button type="button" class="icone-btn" id="fechar-h" aria-label="Fechar">${ICONE.fechar}</button></div>
    <h2 id="t-h">${esc(modelo.nome)}</h2>
    <div class="campo"><label for="h-forn">Fornecedor fixado</label><input class="entrada" id="h-forn" required placeholder="ex.: google-vertex, amazon-bedrock, azure">
      <span class="ajuda">Use o nome do fornecedor como aparece na lista de fornecedores do modelo. As chamadas sigilosas vão só para ele, sem cair para outro.</span></div>
    <label class="opcoes"><span><input type="checkbox" id="h-treino" required> Conferi a documentação e as condições contratuais desta rota: não usar o conteúdo para treino</span></label>
    <label class="opcoes"><span><input type="checkbox" id="h-zdr" required> Conferi a documentação e as condições contratuais desta rota: retenção zero do conteúdo</span></label>
    <div class="campo" style="margin-top:12px"><label for="h-just">Justificativa</label><textarea class="entrada" id="h-just" required minlength="10" placeholder="Onde conferiu, contrato, data da verificação"></textarea></div>
    <p class="msg-erro oculto" id="h-erro" role="alert"></p>
    <div class="linha-botoes"><button class="btn btn-verde">Aprovar para dados sigilosos</button><button type="button" class="btn-texto" id="cancelar-h">Cancelar</button></div>
    <p class="dica">A GreenIA aplica os filtros de fornecedor, treino e retenção na chamada. Eles não substituem a comprovação das condições contratuais do provedor e não eliminam os metadados operacionais.</p>
    <p class="dica">Fica registrado quem homologou, a data, o fornecedor e a justificativa. A política ganha nova versão.</p></form></div>`);
  const fechar = () => { soltarEsc(); $('fundo-h')?.remove(); };
  const soltarEsc = fecharComEscape($('form-h'), fechar);
  $('fechar-h').onclick = fechar; $('cancelar-h').onclick = fechar;
  $('h-forn').focus();
  $('form-h').onsubmit = async ev => {
    ev.preventDefault();
    try {
      await api(`/api/admin/modelos/${encodeURIComponent(modelo.id)}/homologar`, { metodo: 'POST', corpo: { fornecedor: $('h-forn').value.trim(), semTreino: $('h-treino').checked, retencaoZero: $('h-zdr').checked, justificativa: $('h-just').value } });
      fechar(); toast('Modelo homologado. A política ganhou nova versão.'); depois();
    } catch (e) { $('h-erro').textContent = e.message; $('h-erro').classList.remove('oculto'); }
  };
}

// ---------------------------------------------------------------- Política
async function abaPolitica() {
  const [p, v] = await Promise.all([api('/api/politica'), api('/api/admin/politica/versoes')]);
  $('conteudo').innerHTML = `${topoTela(`Versão ${p.versao}, de ${dataHora(p.atualizada_em)}. Ciência registrada por ${v.versoes[0]?.ciencias ?? 0} de ${v.pessoas} pessoas ativas.`)}
    <form id="form-pol"><h2>Editar o texto</h2><div class="adm-pol-editor">
        <div class="campo"><label for="pol-texto">Texto da empresa</label><textarea class="entrada" id="pol-texto" rows="18" aria-describedby="pol-ajuda">${esc(p.texto)}</textarea>
          <span class="ajuda" id="pol-ajuda">Para um título, comece a linha com ##. Para um item de lista, comece com -. A prévia ao lado mostra como fica.</span></div>
        <div class="campo"><span class="legenda" id="pol-previa-rotulo">Prévia</span><div class="bolha-ia adm-pol-previa" id="pol-previa" role="region" tabindex="0" aria-labelledby="pol-previa-rotulo">${renderizar(p.texto).html}</div></div></div>
      <div class="linha-botoes"><button class="btn btn-verde">Publicar nova versão</button><a class="btn-texto" href="/politica" target="_blank">Ver a política publicada</a></div></form>
    <div class="secao-titulo"><h2>Seção automática</h2>${botaoRevelar('pol-secao', 'Ver a seção automática')}</div>
    <div id="pol-secao" hidden><p class="dica">Gerada da configuração atual e acrescentada no fim do texto. Não é editável.</p><div class="bolha-ia">${renderizar(p.secao).html}</div></div>
    <h2>Versões</h2>
    ${tabela(['Versão', 'Publicada em', 'Por', '#Ciências'], v.versoes.map(x => `<tr><td>${x.versao}</td><td>${dataHora(x.criado_em)}</td><td>${esc(x.por || (x.versao === 1 ? 'instalação (texto padrão)' : 'automática (mudança de configuração)'))}</td><td class="num">${x.ciencias} de ${v.pessoas}</td></tr>`))}`;
  const vig = vigiarAlteracoes($('form-pol'), { barra: $('form-pol').querySelector('.linha-botoes') });
  $('pol-texto').oninput = () => { $('pol-previa').innerHTML = renderizar($('pol-texto').value).html; };
  $('form-pol').onsubmit = async ev => {
    ev.preventDefault();
    if (!await confirmar({ titulo: 'Publicar uma nova versão da política?', texto: `Todas as ${v.pessoas} pessoas ativas vão registrar ciência de novo no próximo acesso.`, botao: 'Publicar nova versão' })) return;
    try { await api('/api/admin/politica', { metodo: 'PUT', corpo: { texto: $('pol-texto').value } }); vig.limpar(); toast('Nova versão publicada.'); abaPolitica(); } catch (e) { falhar(e); }
  };
}

// ---------------------------------------------------------------- Uso e custo
async function abaUso(mes = new Date().toISOString().slice(0, 7)) {
  const u = await api(`/api/admin/uso?mes=${mes}`);
  const t = u.totais;
  const tipo = k => u.porTipo.find(x => x.tipo === k) || { conversas: 0, custo: 0 };
  const col = emCreditos() ? '#Créditos' : '#Custo';
  const linhas = (lista, rotulo) => lista.map(x => `<tr><td>${rotulo(x)}</td><td class="num">${num(x.conversas)}</td><td class="num">${num(x.respostas)}</td><td class="num">${us(x.custo)}</td></tr>`);
  $('conteudo').innerHTML = `${topoTela(`${emCreditos() ? 'Créditos consumidos' : 'Custo de IA'} pela empresa: o saldo do plano e o uso de cada mês.`)}${await blocoPlano(u.pacotes)}
    <h2>Uso no mês</h2>
    <div class="filtros"><div class="campo"><label for="mes">Mês</label><select class="entrada" id="mes">${opcoesMes(u.mes)}</select></div>
      <a class="btn btn-linha btn-pequeno" href="/api/admin/uso?mes=${u.mes}&formato=csv">Baixar planilha</a></div>
    <div class="indicadores">
      <div class="indicador"><span>${emCreditos() ? 'Total de créditos no mês escolhido' : 'Custo total no mês escolhido'}</span><b>${us(t.custo + (u.testes?.custo || 0))}</b><small>Inclui uso e testes</small></div><div class="indicador"><span>Uso fora dos testes</span><b>${us(t.custo)}</b></div>
      <div class="indicador"><span>Conversas</span><b>${num(t.conversas)}</b><small>${num(t.respostas)} respostas</small></div>
      <div class="indicador"><span>Pessoas que usaram</span><b>${num(t.pessoas)}</b></div>
      <div class="indicador"><span>Economia com cache</span><b>${us(t.economia)}</b></div>
      <div class="indicador"><span>Tempo médio de resposta</span>${t.ms > 0 ? `<b>${(t.ms / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} s</b>` : '<b>—</b><small>ainda sem dados suficientes</small>'}</div>
      <div class="indicador"><span>Conversas normais</span><b>${num(tipo('normal').conversas)}</b><small>${us(tipo('normal').custo)}</small></div>
      <div class="indicador"><span>Conversas sigilosas</span><b>${num(tipo('sigilosa').conversas)}</b><small>${us(tipo('sigilosa').custo)}</small></div>
      ${u.testes?.respostas ? `<div class="indicador"><span>Testes de Quick Win</span><b>${us(u.testes.custo)}</b><small>${num(u.testes.conversas)} testes · contam no plano</small></div>` : ''}
    </div>
    <details class="uso-detalhes"><summary><h2 class="adm-resumo-titulo">Ver detalhes do consumo por tarefa, pessoa e recurso</h2></summary><h3>Tendência</h3><p class="dica">Seis meses até o mês escolhido.</p>
    ${barrasMes(u.tendencia, u.mes)}
    <h3>Por nível</h3><p class="dica">O nível pedido em cada resposta. Rápido para o dia a dia, Avançado para análises longas.</p>
    ${tabela(['Nível', '#Conversas', '#Respostas', col], linhas(u.porClasse, x => esc(NOME_CLASSE[x.classe] || 'Outro')))}
    <h3>Por área</h3><p class="dica">Quick Wins contam nas áreas deles; o chat, nas áreas de quem usou. Quem está em várias áreas conta em cada uma.</p>
    ${tabela(['Área', '#Conversas', '#Respostas', col], linhas(u.porArea, x => esc(x.area)))}
    <h3>Por Quick Win</h3><p class="dica">Cada conversa iniciada num Quick Win é uma execução. Sem avaliação: execuções em que ninguém disse se a resposta serviu.</p>
    ${tabela(['Quick Win', '#Execuções', emCreditos() ? '#Créditos por execução' : '#Custo por execução', '#Sem avaliação', col],
      u.porQuickWin.map(x => `<tr><td>${x.id ? `<a href="#/qw/${x.id}">${esc(x.quick_win)}</a>` : esc(x.quick_win)}</td><td class="num">${num(x.execucoes)}</td><td class="num">${x.id ? us(x.custoPorExecucao) : '–'}</td><td class="num">${x.id ? num(x.semAvaliacao) : '–'}</td><td class="num">${us(x.custo)}</td></tr>`))}
    <h3>Por pessoa</h3>${tabela(['Pessoa', '#Conversas', '#Respostas', col], linhas(u.porPessoa, x => `${esc(x.nome)} <span class="dica">${esc(x.email)}</span>`))}
    <h3>Por modelo</h3>${tabela(['Modelo que respondeu', '#Conversas', '#Respostas', col], linhas(u.porModelo, x => `${esc(x.modelo)}${x.fornecedor ? ` <span class="dica">via ${esc(x.fornecedor)}</span>` : ''}`))}</details>`;
  ligarVisao('uso',$('mes').closest('.filtros'),()=>({mes:$('mes').value}),v=>{if(/^\d{4}-\d{2}$/.test(v.mes))abaUso(v.mes);});
  $('mes').onchange = ev => abaUso(ev.target.value);
}
// Mês em português (o seletor nativo de mês segue o idioma do navegador): os últimos 24 meses.
const NOMES_MES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
function opcoesMes(atual) {
  const hoje = new Date(), lista = Array.from({ length: 24 }, (_, i) => new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - i, 1)).toISOString().slice(0, 7));
  if (!lista.includes(atual)) lista.push(atual);
  return lista.map(k => `<option value="${k}" ${k === atual ? 'selected' : ''}>${NOMES_MES[Number(k.slice(5)) - 1]} de ${k.slice(0, 4)}</option>`).join('');
}
// Créditos com a mesma precisão em todo lugar (como fmtCusto): uma casa decimal abaixo de 10.
const creditos = v => { const n = Number(v || 0); return n > 0 && n < 10 && n % 1 ? n.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : num(Math.round(n)); };
const percentualPlano = p => (p.usados > 0 && p.percentual < 1 ? 'menos de 1%' : `${p.percentual}%`);

// ---------------------------------------------------------------- Plano (empresa com plano contratado)
const dataBr = iso => new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR');
const NOME_CLASSE = { rapido: 'Rápido', equilibrado: 'Equilibrado', avancado: 'Advanced' };
const MES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
function barrasMes(lista, ate) {
  const [a, m] = ate.split('-').map(Number);
  const meses = Array.from({ length: 6 }, (_, i) => new Date(Date.UTC(a, m - 6 + i, 1)).toISOString().slice(0, 7));
  const por = Object.fromEntries(lista.map(x => [x.mes, x]));
  const max = Math.max(...lista.map(x => x.custo), 0) || 1;
  return `<div class="barras">${meses.map(k => { const x = por[k] || { custo: 0, conversas: 0 };
    return `<div class="linha"><span class="nome">${MES_CURTO[Number(k.slice(5)) - 1]} ${k.slice(0, 4)}</span><span class="trilho"><span style="width:${x.custo ? Math.max(2, x.custo / max * 100) : 0}%"></span></span>
      <span class="valor">${us(x.custo)} <span class="dica">${num(x.conversas)} conv.</span></span></div>`; }).join('')}</div>`;
}
const ORIGEM = { painel: 'Painel do operador', console: 'Console do operador', manual: 'Liberação manual' };
async function blocoPlano(pacotes = []) {
  const p = S.plano;
  if (!p) return '';
  let html = `<h2 style="margin-top:0">Plano <span class="dica">ciclo atual, renova em ${dataBr(p.renova)}</span></h2>
    <div class="indicadores">
      <div class="indicador"><span>Créditos do ciclo</span><b>${p.ilimitado ? 'Ilimitado' : num(p.creditos)}</b></div>
      <div class="indicador"><span>Usados no ciclo</span><b>${creditos(p.usados)}</b><small>${p.ilimitado ? 'sem limite no plano' : `${percentualPlano(p)} do plano`}</small></div>
      ${p.pacoteDisponivel > 0 ? `<div class="indicador"><span>Créditos adicionais disponíveis</span><b>${num(Math.round(p.pacoteDisponivel))}</b></div>` : ''}
      <div class="indicador"><span>Renovação</span><b>${dataBr(p.renova)}</b></div>
    </div>
    ${p.ilimitado ? '' : `<div class="barra" role="progressbar" aria-label="Créditos do plano usados" aria-valuenow="${p.percentual}" aria-valuemin="0" aria-valuemax="100"><span style="width:${p.percentual}%"></span></div>`}
    <p class="dica">Os créditos do plano renovam todo dia 1.${p.fase === 'reserva' || p.fase === 'esgotado' ? ` ${esc(p.mensagem)}` : ''}</p>`;
  if (pacotes.length) html += `<h2>Créditos adicionais (Capacity Packs)</h2><p class="dica">Usados depois dos créditos do plano, do mais antigo para o mais novo.</p>
    ${tabela(['Liberado em', 'Tipo', '#Créditos', 'Validade', 'Origem', 'Observação'], pacotes.map(x => `<tr><td data-r="Liberado em">${dataBr(x.em.slice(0, 10))}</td><td data-r="Tipo">${{ capacity_pack: 'Capacity Pack', pacote_legado_10000: 'Pacote adicional', cortesia: 'Cortesia' }[x.produto] || 'Créditos adicionais'}</td><td class="num" data-r="Créditos">${num(x.creditos)}</td>
      <td data-r="Validade">${x.validade ? dataBr(x.validade) : 'sem validade'}</td><td data-r="Origem">${ORIGEM[x.origem] || esc(x.origem)}</td><td data-r="Observação">${esc(x.observacao) || '<span class="dica">–</span>'}</td></tr>`))}`;
  return html;
}
// ---------------------------------------------------------------- Eventos
// Registros (Atividade e Histórico de modelos): a linha mostra quando, o quê, quem e o resumo; o detalhe inteiro
// abre no painel lateral, um por vez. A lista tem um só ponto de parada no teclado (setas andam, Enter abre).
function tabelaRegistros(eventos, { nome = e => nomeEvento(e.tipo), quem = e => e.pessoa || '—', vazio, migalha }) {
  const html = tabela(['Quando', 'O que aconteceu', 'Pessoa', 'Resumo'], eventos.map((e, i) => `<tr data-registro="${i}" aria-label="${esc(`${nome(e)}, ${dataHora(e.em)}. Enter abre o detalhe.`)}">
    <td style="white-space:nowrap">${dataHora(e.em)}</td><td><span class="adm-registro-nome">${esc(nome(e))}</span></td><td class="adm-email">${esc(quem(e))}</td>
    <td class="dica adm-registro-resumo">${resumoAuditoria(e) || '—'}</td></tr>`), vazio).replace('class="tabela"', 'class="tabela adm-registros"');
  const ligar = () => ligarLinhas(document.querySelector('#conteudo .adm-registros'), i => {
    const e = eventos[Number(i)];
    if (e) painelLateral({ migalha, titulo: nome(e), corpo: `<p class="dica">${dataHora(e.em)} · ${esc(quem(e))}</p>${corpoAuditoria(e)}` });
  });
  return { html, ligar };
}

async function abaEventos(filtro = {}, pagina = 0) {
  const q = new URLSearchParams(Object.entries(filtro).filter(([, v]) => v));
  const d = await api(`/api/admin/eventos?${q}&pagina=${pagina}`);
  const filtrando = [...q.keys()].length > 0;
  const reg = tabelaRegistros(d.eventos, { vazio: 'Nenhum evento com esses filtros.', migalha: 'Atividade' });
  // Filtros fechados até a pessoa pedir; com filtro aplicado, ficam abertos para mostrar o que está valendo.
  $('conteudo').innerHTML = `${topoTela('O que mudou no ambiente, sem o conteúdo das conversas. Clique num registro para ver o detalhe.',
      `${botaoRevelar('filtro-ev', filtrando ? 'Filtros aplicados' : 'Filtrar', filtrando)}<a class="btn btn-texto btn-pequeno" href="/api/admin/eventos?${q}&formato=csv">Baixar planilha</a>`)}
    <form class="filtros" id="filtro-ev" ${filtrando ? '' : 'hidden'}>
      <div class="campo"><label for="ev-tipo">Tipo</label><select class="entrada" id="ev-tipo"><option value="">Todos</option>${d.tipos.map(t => `<option value="${esc(t)}" ${t === filtro.tipo ? 'selected' : ''}>${esc(nomeEvento(t))}</option>`).join('')}</select></div>
      <div class="campo"><label for="ev-pessoa">Pessoa (email)</label><input class="entrada" id="ev-pessoa" value="${esc(filtro.pessoa || '')}"></div>
      <div class="campo"><label for="ev-de">De</label>${campoData({ id: 'ev-de', valor: filtro.de, rotulo: 'a data inicial' })}</div>
      <div class="campo"><label for="ev-ate">Até</label>${campoData({ id: 'ev-ate', valor: filtro.ate, rotulo: 'a data final' })}</div>
      <button class="btn btn-linha btn-pequeno">Aplicar filtros</button>${filtrando ? '<button type="button" class="btn-texto btn-pequeno" id="ev-limpar">Limpar filtros</button>' : ''}</form>
    <p class="dica" id="ev-total">${num(d.total)} ${d.total === 1 ? 'evento' : 'eventos'}.</p>
    ${reg.html}
    <div class="linha-botoes" style="margin-top:12px">${pagina > 0 ? '<button class="btn btn-linha btn-pequeno" id="ev-ant">Anteriores</button>' : ''}${(pagina + 1) * 100 < d.total ? '<button class="btn btn-linha btn-pequeno" id="ev-prox">Mais antigos</button>' : ''}</div>`;
  reg.ligar();
  // Datas digitadas em dd/mm/aaaa; a API recebe aaaa-mm-dd, como antes. Data inválida não filtra: o campo avisa.
  const ler = () => ({ tipo: $('ev-tipo').value, pessoa: $('ev-pessoa').value, de: lerData($('ev-de')) || '', ate: lerData($('ev-ate')) || '' });
  ligarVisao('atividade',$('filtro-ev'),ler,v=>abaEventos(v));
  $('filtro-ev').onsubmit = ev => {
    ev.preventDefault();
    const ruim = ['ev-de', 'ev-ate'].map($).find(el => lerData(el) === null);
    if (ruim) { ruim.reportValidity(); ruim.focus(); return; }
    abaEventos(ler());
  };
  if ($('ev-limpar')) $('ev-limpar').onclick = () => abaEventos();
  if ($('ev-ant')) $('ev-ant').onclick = () => abaEventos(filtro, pagina - 1);
  if ($('ev-prox')) $('ev-prox').onclick = () => abaEventos(filtro, pagina + 1);
}

// Problemas reportados pelas pessoas (Reportar problema, na lateral): marcar como resolvido é a única ação.
async function abaProblemas() {
  const { problemas } = await api('/api/admin/problemas');
  const abertos = problemas.filter(p => !p.resolvido).length;
  $('conteudo').innerHTML = `${topoTela(abertos ? `${abertos} ${abertos === 1 ? 'problema em aberto' : 'problemas em aberto'}. Marque cada um como resolvido quando tratar.` : 'Nenhum problema em aberto.')}
    ${tabela(['Quando', 'Pessoa', 'Tipo', 'Descrição', 'Resolvido'], problemas.map(p => `<tr><td style="white-space:nowrap">${dataHora(p.em)}</td><td>${esc(p.nome || '')}<br><span class="dica">${esc(p.email || '')}</span></td><td>${esc(p.tipo)}</td>
      <td style="white-space:pre-wrap;word-break:break-word">${esc(p.descricao)}</td><td><label class="adm-marca"><input type="checkbox" data-problema="${p.id}" ${p.resolvido ? 'checked' : ''}> <span>Resolvido</span></label></td></tr>`), 'Ninguém reportou problema.')}`;
  document.querySelectorAll('[data-problema]').forEach(c => { c.onchange = () => api(`/api/admin/problemas/${c.dataset.problema}`, { metodo: 'PUT', corpo: { resolvido: c.checked } }).then(() => toast(c.checked ? 'Marcado como resolvido.' : 'Reaberto.')).catch(falhar); });
}

// ---------------------------------------------------------------- Configurações
// Provedores de email mais comuns: servidor e porta já preenchidos, e onde conseguir a senha.
const PROVEDORES_EMAIL = {
  google: { nome: 'Google Workspace / Gmail', servidor: 'smtp.gmail.com', porta: 465, ajuda: 'Use o email completo e uma <b>senha de app</b> de 16 letras, não a senha normal: ligue a verificação em duas etapas da conta e crie a senha em <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener">myaccount.google.com/apppasswords</a>. Pode colar com ou sem os espaços. Em contas Google Workspace, o administrador do Google precisa permitir senhas de app.' },
  microsoft: { nome: 'Microsoft 365 / Outlook', servidor: 'smtp.office365.com', porta: 587, ajuda: 'O administrador do Microsoft 365 precisa liberar o <b>SMTP autenticado</b> para esta caixa.' },
  kinghost: { nome: 'KingHost', servidor: 'smtp.kinghost.net', porta: 465, ajuda: 'Use o email completo e a senha da caixa, a mesma do webmail.' },
  locaweb: { nome: 'Locaweb', servidor: 'email-ssl.com.br', porta: 465, ajuda: 'Use o email completo e a senha da caixa.' },
  zoho: { nome: 'Zoho Mail', servidor: 'smtp.zoho.com', porta: 465, ajuda: 'Use o email completo e a senha (ou senha de app, se tiver verificação em duas etapas).' },
  outro: { nome: 'Outro servidor', servidor: '', porta: 465, ajuda: 'Peça ao responsável pelo email da empresa o <b>servidor SMTP</b> e a <b>porta</b> (normalmente 465 ou 587).' },
};
// Senha da caixa de email: o campo nasce somente leitura para o navegador não preencher sozinho a senha de
// login da conta; ao focar, libera a digitação.
document.addEventListener('focusin', ev => { if (ev.target?.id === 'c-senha') ev.target.removeAttribute('readonly'); });
const provedorDe = smtp => smtp.modo === 'api' ? smtp.api : smtp.modo === 'smtp' ? (Object.entries(PROVEDORES_EMAIL).find(([k, p]) => k !== 'outro' && p.servidor === smtp.servidor)?.[0] || 'outro') : '';
const nomeDoRemetente = r => (/^\s*(.*?)\s*</.exec(r || '')?.[1] || 'GreenIA').replace(/^"|"$/g, '');
const RETENCOES = [[30, '30 dias'], [90, '90 dias'], [180, '6 meses'], [365, '1 ano']];

const CORES_VISUAIS = [['primaria', 'Cor principal'], ['secundaria', 'Cor secundária'], ['destaque', 'Cor de destaque'], ['texto', 'Cor do texto']];
const PADRAO_VISUAL = { primaria: '#1F3A5F', secundaria: '#3A7CA5', destaque: '#D9822B', texto: '#18212B' };
async function abaConfig() {
  const c = await api('/api/admin/config');
  let logo = c.logo;
  const iv = c.identidadeVisual?.regras || {};
  let logoClaro = iv.logoClaro || '';
  const multi = !!E.plataforma, un = emCreditos() ? 'créditos' : 'US$';
  let dominios = [...c.dominios];
  const smtp = c.smtp || {};
  let prov = provedorDe(smtp);
  // Cada bloco abre e fecha; o "Editar" e a seta mostram que ele abre. Links ficam no corpo, nunca dentro do título clicável.
  const caixa = (n, titulo, porque, corpo, extra = '') => `<details class="cfg-caixa"${extra}><summary class="cfg-topo"><span class="url-num">${n}</span><div><h2>${titulo}</h2><p class="dica">${porque}</p></div><span class="cfg-abrir" aria-hidden="true"><span class="cfg-abrir-fechado">Editar</span><span class="cfg-abrir-aberto">Fechar</span></span></summary>${corpo}</details>`;
  const limite = (id, rotulo, explica, valor, sufixo, passo = 1) => `<div class="cfg-limite"><label class="cfg-liga"><input type="checkbox" data-liga="${id}" ${valor > 0 ? 'checked' : ''}> <span><b>${rotulo}</b><small>${explica}</small></span></label>
    <div class="cfg-valor ${valor > 0 ? '' : 'oculto'}" id="v-${id}"><input class="entrada" type="number" min="1" step="${passo}" id="${id}" value="${valor > 0 ? valor : ''}" inputmode="numeric"><span class="dica">${sufixo}</span></div></div>`;
  $('conteudo').innerHTML = `<form id="form-cfg" class="cfg">
      ${topoTela('Ajustes gerais do ambiente. Abra só o bloco que quiser mudar; o resto continua como está.')}
      ${multi ? '' : caixa('·', 'Empresa', 'Como a empresa aparece para as pessoas.', `
        <div class="campo"><label for="c-empresa">Nome da empresa</label><input class="entrada" id="c-empresa" value="${esc(c.empresa)}" required maxlength="80"></div>
        <div class="campo"><span class="legenda">Logo</span><div class="linha-botoes"><span id="c-logo-prev">${logo ? `<img src="${esc(logo)}" alt="Logo atual" style="max-height:48px">` : '<span class="dica">Sem logo.</span>'}</span>
          <label class="btn btn-linha btn-pequeno" style="cursor:pointer">Escolher arquivo<input type="file" id="c-logo" class="sr" accept=".png,.jpg,.jpeg,.svg"></label><button type="button" class="btn-texto btn-pequeno" id="c-logo-tirar">Remover</button></div>
          <span class="ajuda">PNG, JPG ou SVG, até 200 KB.</span></div>
        <div class="campo"><label for="c-cor">Cor de marca (botões principais)</label><div class="linha-botoes"><input type="color" id="c-cor" value="${esc(c.corMarca || '#1B7950')}">
          <label class="dica"><input type="checkbox" id="c-cor-usar" ${c.corMarca ? 'checked' : ''}> usar a cor de marca</label></div>
          <span class="ajuda">Usada nos botões (com texto branco por cima) e nos links. Precisa ser escura o bastante para o texto ser lido.</span><div class="aviso-cor" id="c-contraste" aria-live="polite"></div></div>
        <div class="campo"><label for="c-priv">Aviso de privacidade (aparece no login e no chat)</label><textarea class="entrada" id="c-priv" rows="2">${esc(c.privacyNote)}</textarea></div>`)}
      ${caixa(1, 'Quem pode entrar', 'Domínios de email que entram sem convite.', `
        ${multi ? '<p class="dica">Para convidar quem tem outro email, use <a href="#/pessoas?convidar=1">Convidar pessoa, em Pessoas</a>.</p>' : ''}
        <div class="campo"><label for="c-dom-novo">Domínios de email da empresa</label>
          <div class="chips-entrada" id="c-chips"></div>
          <div class="linha-botoes"><input class="entrada" id="c-dom-novo" placeholder="suaempresa.com.br" autocomplete="off" inputmode="url" style="max-width:320px"><button type="button" class="btn btn-linha btn-pequeno" id="c-dom-add">Adicionar</button></div>
          <span class="ajuda">O domínio é o que vem depois do @. Exemplo: para <b>ana@suaempresa.com.br</b>, adicione <b>suaempresa.com.br</b>.${multi ? ' Sem nenhum domínio, só entra quem for convidado.' : ''}</span></div>`)}
      ${caixa(2, 'Envio de emails', 'Por onde saem os códigos de acesso, convites e avisos.', `
        <div class="campo"><span class="legenda">Por onde os emails saem</span>
          <div class="opcoes-email" role="radiogroup" aria-label="Provedor de email">
            ${multi ? `<label class="opcao"><input type="radio" name="prov" value="" ${prov === '' ? 'checked' : ''}><span><b>Servidor da plataforma</b><small>Recomendado. Nada a configurar.</small></span></label>` : ''}
            ${Object.entries(PROVEDORES_EMAIL).map(([k, p]) => `<label class="opcao"><input type="radio" name="prov" value="${k}" ${prov === k ? 'checked' : ''}><span><b>${p.nome}</b><small>${k === 'outro' ? 'Servidor e porta informados por você' : 'Servidor já preenchido'}</small></span></label>`).join('')}
            <label class="opcao"><input type="radio" name="prov" value="resend" ${prov === 'resend' ? 'checked' : ''}><span><b>Resend</b><small>Serviço de envio por chave de API</small></span></label>
            <label class="opcao"><input type="radio" name="prov" value="brevo" ${prov === 'brevo' ? 'checked' : ''}><span><b>Brevo</b><small>Serviço de envio por chave de API</small></span></label>
          </div></div>
        <div id="email-campos"></div>
        ${(() => { if (multi && !prov) return ''; const st = (c.smtp || {}).situacao || {}; return st.falha
          ? `<div class="faixa-aviso erro"><b>O email da empresa falhou em ${esc(dataHora(st.falha.em))}.</b> ${esc(st.falha.motivo)}${st.falha.caiuNaPlataforma ? ' Enquanto isso, as mensagens saem pelo email da plataforma.' : ''}</div>`
          : st.ultimoOk ? `<div class="faixa-aviso ok"><b>Funcionando.</b> Último envio pelo email da empresa em ${esc(dataHora(st.ultimoOk))}.</div>` : ''; })()}
        <div class="linha-botoes cfg-teste"><button type="button" class="btn btn-linha btn-pequeno" id="c-smtp-teste">Salvar e enviar um email de teste para mim</button><span class="dica" id="c-teste-res"></span></div>`)}
      ${caixa(3, 'Por quanto tempo guardar as conversas', 'Conversas paradas por mais tempo são apagadas sozinhas.', `
        <div class="chips-opcoes" role="radiogroup" aria-label="Retenção">${RETENCOES.map(([d, n]) => `<label class="chip-opcao"><input type="radio" name="ret" value="${d}" ${c.retencaoDias === d ? 'checked' : ''}><span>${n}</span></label>`).join('')}
          <label class="chip-opcao"><input type="radio" name="ret" value="outro" ${RETENCOES.some(([d]) => d === c.retencaoDias) ? '' : 'checked'}><span>Outro</span></label></div>
        <div class="campo ${RETENCOES.some(([d]) => d === c.retencaoDias) ? 'oculto' : ''}" id="c-ret-outro"><label for="c-ret">Dias sem uso</label><input class="entrada" type="number" id="c-ret" min="1" max="3650" value="${c.retencaoDias}" style="max-width:160px"></div>`)}
      ${caixa(4, 'Limites de uso', 'Opcional: tetos por mês e por pessoa.', `
        ${limite('c-teto', 'Limite do mês para a empresa toda', 'Quando a empresa inteira chegar a esse total no mês, as novas mensagens ficam bloqueadas até o mês seguinte.', c.tetoMensal, un, emCreditos() ? 1 : 0.01)}
        ${limite('c-teto-p', 'Limite do mês por pessoa', 'Cada pessoa pode usar até esse total no mês. Útil para ninguém consumir o plano sozinho.', c.tetoPessoaMensal, un, emCreditos() ? 1 : 0.01)}
        ${limite('c-dia', 'Limite de respostas por pessoa por dia', 'Quantas respostas da IA cada pessoa pode pedir por dia.', c.limiteDiarioPessoa, 'respostas por dia')}`)}
      ${caixa(5, 'Identidade visual das peças', 'Cores, fontes e regras das peças que os Quick Wins produzem.', `
        <p class="dica">O logo e a cor principal vêm ${multi ? 'de <a href="#/empresa/marca">Marca e endereço, aba Marca</a>' : 'do bloco Empresa, acima'}.</p>
        <div class="grade-2">${CORES_VISUAIS.map(([k, r]) => `<div class="campo"><span class="legenda">${r}</span><div class="linha-botoes"><input type="color" id="iv-${k}" value="${esc(iv.cores?.[k] || PADRAO_VISUAL[k])}" aria-label="${r}">
          <label class="dica"><input type="checkbox" data-iv-usar="${k}" ${iv.cores?.[k] ? 'checked' : ''}> regra da marca</label></div></div>`).join('')}</div>
        <div class="grade-2"><div class="campo"><label for="iv-tit">Fonte dos títulos</label><select class="entrada" id="iv-tit"><option value="">Padrão</option><option value="sans" ${iv.tipografia?.titulos === 'sans' ? 'selected' : ''}>Sem serifa (moderna)</option><option value="serif" ${iv.tipografia?.titulos === 'serif' ? 'selected' : ''}>Com serifa (editorial)</option></select></div>
          <div class="campo"><label for="iv-cantos">Cantos</label><select class="entrada" id="iv-cantos"><option value="">Padrão</option>${[[0, 'Retos'], [6, 'Suaves'], [14, 'Arredondados']].map(([v, r]) => `<option value="${v}" ${iv.cantos === v ? 'selected' : ''}>${r}</option>`).join('')}</select></div></div>
        <div class="campo"><span class="legenda">Logo para fundo escuro (versão clara)</span><div class="linha-botoes"><span id="iv-logo-prev">${iv.logoClaro ? `<img src="${esc(iv.logoClaro)}" alt="Logo claro" style="max-height:40px;background:#1F3A5F;padding:4px;border-radius:4px">` : '<span class="dica">Sem versão clara: nas capas escuras o logo vai num selo claro.</span>'}</span>
          <label class="btn btn-linha btn-pequeno" style="cursor:pointer">Escolher arquivo<input type="file" id="iv-logo" class="sr" accept=".png,.jpg,.jpeg,.svg,.webp"></label><button type="button" class="btn-texto btn-pequeno" id="iv-logo-tirar">Remover</button></div></div>
        <div class="campo"><label for="iv-proibidas">Cores que nunca podem ser usadas</label><input class="entrada" id="iv-proibidas" placeholder="#FF0000, #00FF00" value="${esc((iv.coresProibidas || []).join(', '))}"><span class="ajuda">Códigos de cor separados por vírgula.</span></div>
        <div class="campo"><label for="iv-regras">Regras visuais e tom (uma por linha)</label><textarea class="entrada" id="iv-regras" rows="3" placeholder="Ex.: sempre em português formal; destacar segurança primeiro">${esc([...(iv.regras || []), ...(iv.tom ? [`Tom: ${iv.tom}`] : [])].join('\n'))}</textarea></div>
        <label class="opcoes"><span><input type="checkbox" id="iv-imagens" ${c.producaoVisual?.imagens?.ativa ? 'checked' : ''}> Permitir gerar imagens ilustrativas para as peças</span></label>`)}
      ${caixa(6, 'Integrações com sistemas da empresa', 'Quick Wins usando CRM, ERP e outros sistemas, com aprovação.', `
        <label class="opcoes"><span><input type="checkbox" id="cfg-integracoes" ${c.integracoes?.ativa ? 'checked' : ''}> Ligar as integrações para toda a empresa</span></label>`, ' id="cfg-bloco-integracoes"')}
      <div class="cfg-salvar"><span class="dica adm-sujo" id="c-sujo"></span><button class="btn btn-verde">Salvar configurações</button></div>
    </form>`;

  // Domínios em etiquetas
  const desenharChips = () => { $('c-chips').innerHTML = dominios.length ? dominios.map((d, i) => `<span class="chip">${esc(d)}<button type="button" aria-label="Remover ${esc(d)}" data-tira="${i}">×</button></span>`).join('') : '<span class="dica">Nenhum domínio ainda.</span>'; };
  const addDominio = () => { const v = $('c-dom-novo').value.trim().toLowerCase().replace(/^.*@/, '').replace(/^https?:\/\//, '').replace(/\/.*$/, ''); if (!v) return; if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(v)) { toast('Domínio inválido. Exemplo: suaempresa.com.br', 6000); return; } if (!dominios.includes(v)) dominios.push(v); $('c-dom-novo').value = ''; desenharChips(); sujo(); };
  $('c-chips').onclick = ev => { const b = ev.target.closest('[data-tira]'); if (b) { dominios.splice(Number(b.dataset.tira), 1); desenharChips(); sujo(); } };
  $('c-dom-add').onclick = addDominio;
  $('c-dom-novo').onkeydown = ev => { if (ev.key === 'Enter' || ev.key === ',') { ev.preventDefault(); addDominio(); } };
  desenharChips();

  // Email: campos conforme o provedor escolhido
  const desenharEmail = () => {
    const alvo = $('email-campos');
    if (!prov) { alvo.innerHTML = '<p class="dica">Os emails saem pelo servidor da plataforma, com o nome da sua empresa.</p>'; return; }
    const nome = nomeDoRemetente(smtp.remetente);
    if (prov === 'resend' || prov === 'brevo') {
      const guardada = smtp.modo === 'api' && smtp.api === prov && smtp.temChave;
      alvo.innerHTML = `<div class="faixa-aviso">${prov === 'resend' ? 'No <a href="https://resend.com" target="_blank" rel="noopener">Resend</a>' : 'No <a href="https://www.brevo.com" target="_blank" rel="noopener">Brevo</a>'}, adicione e verifique o domínio da empresa (registros de DNS que o serviço mostra) e crie uma chave de API.</div>
        <div class="grade-2"><div class="campo"><label for="c-chave">Chave de API</label><input class="entrada" id="c-chave" type="password" autocomplete="new-password" placeholder="${guardada ? '•••••••• (guardada; deixe em branco para manter)' : 'Cole a chave aqui'}"></div>
        <div class="campo"><label for="c-rem-email">Email que aparece como remetente</label><input class="entrada" id="c-rem-email" type="email" value="${esc(/<([^>]+)>/.exec(smtp.remetente || '')?.[1] || '')}" placeholder="nao-responda@suaempresa.com.br"><span class="ajuda">Precisa ser do domínio verificado no serviço.</span></div>
        <div class="campo"><label for="c-rem-nome">Nome do remetente</label><input class="entrada" id="c-rem-nome" value="${esc(nome)}"></div></div>`;
    } else {
      const p = PROVEDORES_EMAIL[prov], mesmo = smtp.modo === 'smtp';
      alvo.innerHTML = `<div class="faixa-aviso">${p.ajuda}</div>
        <div class="grade-2"><div class="campo"><label for="c-usu">Email que envia</label><input class="entrada" id="c-usu" type="email" autocomplete="off" value="${esc(mesmo ? smtp.usuario : '')}" placeholder="nao-responda@suaempresa.com.br"><span class="ajuda">Uma caixa de email da empresa. Os emails saem em nome dela.</span></div>
        <div class="campo"><label for="c-senha">Senha dessa caixa</label><input class="entrada" id="c-senha" type="password" autocomplete="new-password" data-lpignore="true" data-1p-ignore readonly placeholder="${mesmo && smtp.temSenha ? '•••••••• (guardada; deixe em branco para manter)' : 'Senha da caixa de email'}"><span class="ajuda">Fica guardada no servidor e nunca é mostrada de novo.</span></div>
        <div class="campo"><label for="c-rem-nome">Nome do remetente</label><input class="entrada" id="c-rem-nome" value="${esc(nome)}"><span class="ajuda">Como aparece na caixa de entrada. Ex.: GreenIA, ou IA da Sua Empresa.</span></div></div>
        <details class="cfg-avancado" ${prov === 'outro' ? 'open' : ''}><summary>Servidor e porta${prov === 'outro' ? '' : ' (já preenchidos)'}</summary>
          <div class="grade-2"><div class="campo"><label for="c-serv">Servidor SMTP</label><input class="entrada" id="c-serv" value="${esc(mesmo && prov === provedorDe(smtp) ? smtp.servidor : p.servidor)}" placeholder="smtp.suaempresa.com.br"></div>
          <div class="campo"><label for="c-porta">Porta</label><input class="entrada" id="c-porta" type="number" value="${esc(mesmo && prov === provedorDe(smtp) ? smtp.porta : p.porta)}" style="max-width:120px"><span class="ajuda">465 (SSL) ou 587 (TLS).</span></div></div></details>`;
    }
  };
  document.querySelectorAll('input[name="prov"]').forEach(r => r.onchange = () => { prov = r.value; desenharEmail(); sujo(); });
  desenharEmail();
  const lerEmail = () => {
    if (!prov) return { modo: '' };
    const nome = ($('c-rem-nome')?.value || 'GreenIA').trim();
    if (prov === 'resend' || prov === 'brevo') return { modo: 'api', api: prov, chave: $('c-chave').value, remetente: `${nome} <${$('c-rem-email').value.trim()}>` };
    const usu = $('c-usu').value.trim();
    return { modo: 'smtp', servidor: $('c-serv').value.trim(), porta: Number($('c-porta').value), usuario: usu, senha: $('c-senha').value, remetente: `${nome} <${usu}>` };
  };

  // Retenção e limites
  document.querySelectorAll('input[name="ret"]').forEach(r => r.onchange = () => { $('c-ret-outro').classList.toggle('oculto', r.value !== 'outro' || !r.checked); if (r.value !== 'outro') $('c-ret').value = r.value; sujo(); });
  document.querySelectorAll('[data-liga]').forEach(ch => ch.onchange = () => { $(`v-${ch.dataset.liga}`).classList.toggle('oculto', !ch.checked); if (ch.checked) $(ch.dataset.liga).focus(); sujo(); });
  const valorLimite = id => (document.querySelector(`[data-liga="${id}"]`).checked ? Number($(id).value) || 0 : 0);

  // Empresa (instalação única)
  if (!multi) {
    const mostrarContraste = () => {
      avisoCor($('c-contraste'), $('c-cor').value, sug => { $('c-cor').value = sug; $('c-cor-usar').checked = true; mostrarContraste(); });
    };
    $('c-cor').oninput = mostrarContraste; mostrarContraste();
    $('c-logo').onchange = async ev => { const f = ev.target.files[0]; if (!f) return; logo = await lerDataUrl(f); $('c-logo-prev').innerHTML = `<img src="${esc(logo)}" alt="Logo novo" style="max-height:48px">`; };
    $('c-logo-tirar').onclick = () => { logo = ''; $('c-logo-prev').innerHTML = '<span class="dica">Sem logo.</span>'; };
  }
  $('iv-logo').onchange = async ev => { const f = ev.target.files[0]; if (!f) return; logoClaro = await lerDataUrl(f); $('iv-logo-prev').innerHTML = `<img src="${esc(logoClaro)}" alt="Logo claro novo" style="max-height:40px;background:#1F3A5F;padding:4px;border-radius:4px">`; sujo(); };
  $('iv-logo-tirar').onclick = () => { logoClaro = ''; $('iv-logo-prev').innerHTML = '<span class="dica">Sem versão clara.</span>'; sujo(); };
  // Identidade visual: só o que foi marcado como regra vai para a regra da empresa (nada é inventado).
  const lerIdentidade = () => {
    const linhas = $('iv-regras').value.split('\n').map(x => x.trim()).filter(Boolean);
    const tom = linhas.find(l => /^tom\s*:/i.test(l))?.replace(/^tom\s*:\s*/i, '') || '';
    const regras = { cores: Object.fromEntries(CORES_VISUAIS.filter(([k]) => document.querySelector(`[data-iv-usar="${k}"]`).checked).map(([k]) => [k, $(`iv-${k}`).value.toUpperCase()])),
      tipografia: $('iv-tit').value ? { titulos: $('iv-tit').value } : {}, ...($('iv-cantos').value !== '' ? { cantos: Number($('iv-cantos').value) } : {}),
      ...(logoClaro ? { logoClaro } : {}), coresProibidas: $('iv-proibidas').value.split(/[\s,;]+/).filter(Boolean), regras: linhas.filter(l => !/^tom\s*:/i.test(l)), tom };
    return { regras, preferencias: c.identidadeVisual?.preferencias || {} };
  };
  const vig = vigiarAlteracoes($('form-cfg'), { barra: $('form-cfg').querySelector('.cfg-salvar'), cliques: '[data-tira], #c-logo-tirar, #iv-logo-tirar' });
  // Só fica aberto o bloco que a pessoa está mudando: abrir outro bloco fecha os que ela abriu e não alterou.
  const caixasCfg = [...document.querySelectorAll('#form-cfg .cfg-caixa')];
  const alterou = ev => ev.target.closest?.('.cfg-caixa')?.setAttribute('data-alterado', '');
  $('form-cfg').addEventListener('input', alterou); $('form-cfg').addEventListener('change', alterou);
  for (const d of caixasCfg) d.querySelector(':scope > summary').addEventListener('click', () => {
    if (!d.open) for (const o of caixasCfg) if (o !== d && o.open && !o.hasAttribute('data-alterado')) o.open = false;
  });
  function sujo() { vig.marcar(); }

  const salvar = async () => {
    const efeitos = [];
    if (JSON.stringify(dominios) !== JSON.stringify(c.dominios)) efeitos.push('Domínios de acesso: a alteração afeta quem pode entrar na empresa.');
    if (Number($('c-ret').value) !== c.retencaoDias) efeitos.push('Prazo de conservação das conversas: o servidor pode apagar conteúdo quando vencer o novo prazo.');
    if ($('cfg-integracoes').checked !== !!c.integracoes?.ativa) efeitos.push('Acesso às integrações: a alteração vale para a empresa toda.');
    if (efeitos.length && !await confirmar({ titulo: 'Salvar estas alterações?', texto: efeitos, botao: 'Salvar alterações' })) return false;
    await api('/api/admin/config', { metodo: 'PUT', corpo: {
      ...(multi ? {} : { empresa: $('c-empresa').value, logo, corMarca: $('c-cor-usar').checked ? $('c-cor').value : '', privacyNote: $('c-priv').value }),
      dominios, smtp: lerEmail(), retencaoDias: Number($('c-ret').value),
      tetoMensal: valorLimite('c-teto'), tetoPessoaMensal: valorLimite('c-teto-p'), limiteDiarioPessoa: valorLimite('c-dia'),
      identidadeVisual: lerIdentidade(), producaoVisual: { imagens: { ativa: $('iv-imagens').checked } },
      // Integrações: liga ou desliga para a empresa toda (sem lista de pessoas).
      integracoes: { ativa: $('cfg-integracoes').checked, pessoas: [] } } });
    vig.limpar();
    // O menu Integrações aparece ou some na hora, conforme o servidor (que também respeita a chave de emergência).
    const eu = await api('/api/eu').catch(() => null);
    if (eu) { E.integracoes = !!eu.integracoes; desenharLateral(); }
    return true;
  };
  $('c-smtp-teste').onclick = ev => ocupado(ev.currentTarget, async () => {
    $('c-teste-res').textContent = '';
    try { if (!await salvar()) return; const r = await api('/api/admin/smtp/teste', { metodo: 'POST' }); $('c-teste-res').textContent = r.via === 'empresa' ? `Enviado pelo email da empresa para ${r.para}. Confira a caixa de entrada e o spam.` : `Enviado pelo email da plataforma para ${r.para} (a empresa ainda não tem email próprio configurado).`; toast('Email de teste enviado.'); }
    catch (e) { $('c-teste-res').textContent = e.message; falhar(e); }
  });
  $('form-cfg').onsubmit = async ev => {
    ev.preventDefault();
    await ocupado(ev.submitter, async () => { try { if (!await salvar()) return; toast('Configurações salvas.'); abaConfig(); } catch (e) { falhar(e); } });
  };
}

// ---------------------------------------------------------------- Conhecimento
// Para todos: que conhecimento a IA pode usar. Para quem gere áreas: envio e organização.
async function abaConhecimento() {
  const conteudo = $('conteudo');
  await recarregarBases();
  const tela = await import('/conhecimento.js');
  // A pessoa já foi para outra tela enquanto as bases carregavam: não desenha numa tela que não existe mais.
  if (!conteudo?.isConnected) return;
  await tela.vistaConhecimento();
}

// ---------------------------------------------------------------- Sugestão da GreenIA (modelos)
// Para quem não conhece modelos: a GreenIA olha o uso da empresa e a política de dados e sugere dois modelos, de
// fabricantes diferentes, para dados sigilosos. Um botão aprova; os fatos técnicos ficam em "Ver detalhes"; o
// caminho técnico (Catálogo técnico) continua em "Escolher outro modelo".
const CUSTO = { 'econômico': 'Custo econômico', 'médio': 'Custo médio', alto: 'Custo alto' };
function cartaoSugestao(sug) {
  const g = sug.sigilo, pendentes = g.sugeridos.filter(x => x.acao === 'aprovar');
  return `<section class="adm-sugestao" id="sugestao-modelos" aria-labelledby="sug-titulo">
    <span class="adm-sugestao-rotulo">Sugestão da GreenIA</span>
    <h2 id="sug-titulo">${esc(g.titulo)}</h2>
    <p class="adm-sugestao-porque">${esc(sug.porque)}</p>
    ${g.sugeridos.length ? `<div class="grade-cartoes adm-sugestao-modelos">${g.sugeridos.map(x => `<article class="cartao sem-seta adm-sug-modelo" data-modelo="${esc(x.id)}">
      <h3 class="cartao-titulo">${esc(x.nome)}</h3>
      <p class="cartao-texto">${esc(x.fabricante)}${x.nivel ? ` · nível ${esc(x.nivel)}` : ''}</p>
      <ul class="adm-sug-motivos">${x.motivos.map(t => `<li>${esc(t)}</li>`).join('')}<li class="adm-sug-garantia">${ICONE.escudo}<span>${esc(x.garantia)}</span></li></ul>
      <p class="cartao-meta"><span class="tag">${esc(CUSTO[x.custo] || x.custo)}</span>${x.jaAprovado ? '<span class="tag tag-verde">Já aprovado</span>' : ''}</p></article>`).join('')}</div>` : ''}
    ${g.oQueFazer ? `<p class="adm-sugestao-fazer">${esc(g.oQueFazer)}</p>` : ''}
    <div class="adm-sugestao-acoes">${pendentes.length ? '<button type="button" class="btn btn-verde" id="sug-aprovar">Aprovar a sugestão</button>' : ''}
      ${g.sugeridos.length ? '<button type="button" class="btn btn-texto" id="sug-detalhes">Ver detalhes</button>' : ''}
      <a class="btn btn-texto" href="#/modelos/catalogo">Escolher outro modelo</a></div></section>`;
}
const MOTIVO_FORA = { proibido_pela_plataforma: 'proibido pela plataforma para dados sigilosos', sem_rota_conferida: 'sem rota com garantias conferidas', acima_do_teto_do_nivel: 'consumo acima do que o nível permite',
  fora_do_catalogo: 'fora do catálogo do serviço de IA' };
function detalhesSugestao(sug) {
  const g = sug.sigilo;
  const sim = v => (v ? 'comprovada' : 'não comprovada');
  painelLateral({ migalha: 'Sugestão da GreenIA', titulo: 'Detalhes da sugestão', corpo: `
    <section class="px-secao"><h3>Como a sugestão foi feita</h3><p>${esc(sug.uso.frase)}</p><p>${esc(sug.politica.frase)}</p><p class="dica">${esc(g.modoTexto)}</p></section>
    ${g.sugeridos.map(x => `<section class="px-secao"><h3>${esc(x.nome)}</h3><dl class="adm-sug-dados">
      <div><dt>Fabricante</dt><dd>${esc(x.fabricante)}</dd></div><div><dt>Nível</dt><dd>${esc(x.nivel || '—')}</dd></div>
      <div><dt>Fornecedor fixado</dt><dd>${esc(x.detalhes.fornecedor || '—')}</dd></div><div><dt>Rota (endpoint)</dt><dd>${esc(x.detalhes.endpoint || '—')}</dd></div>
      <div><dt>Retenção zero</dt><dd>${sim(x.detalhes.retencaoZero)}</dd></div><div><dt>Sem uso para treino</dt><dd>${sim(x.detalhes.semTreino)}</dd></div>
      <div><dt>Garantias</dt><dd>${esc(x.detalhes.origem)}${x.detalhes.conferidaEm ? `, em ${dataHora(x.detalhes.conferidaEm)}` : ''}</dd></div></dl>
      <p class="dica">${esc(x.oQueAcontece)}${x.detalhes.registro ? ` ${esc(x.detalhes.registro)}` : ''}</p></section>`).join('')}
    ${g.descartados.length ? `<section class="px-secao"><h3>Ficaram de fora</h3><ul>${g.descartados.map(d => `<li>${esc(d.nome || d.id)}: ${esc(MOTIVO_FORA[d.motivo] || 'não atende às proteções obrigatórias')}</li>`).join('')}</ul></section>` : ''}
    <section class="px-secao"><h3>Prefere escolher?</h3><p class="dica">No Catálogo técnico, cada modelo pode ser aprovado à mão, informando o fornecedor e conferindo as garantias.</p>
      <a class="btn btn-linha btn-pequeno" href="#/modelos/catalogo">Escolher outro modelo</a></section>` });
}
function ligarSugestao(sug, depois) {
  if (!sug) return;
  $('sug-detalhes')?.addEventListener('click', () => detalhesSugestao(sug));
  $('sug-aprovar')?.addEventListener('click', async ev => {
    const botao = ev.currentTarget, n = sug.sigilo.pendentes.length;
    if (!await confirmar({ titulo: n === 1 ? 'Aprovar o modelo sugerido?' : `Aprovar os ${n} modelos sugeridos?`, texto: sug.sigilo.confirmacao, botao: 'Aprovar a sugestão' })) return;
    await ocupado(botao, async () => {
      try {
        const r = await api('/api/admin/modelos/sugestao/aplicar', { metodo: 'POST', corpo: { parte: 'sigilo' } });
        toast('Modelos aprovados para dados sigilosos. A política ganhou nova versão.');
        await depois(r.sugestao.sigilo.aprovados.length);
      } catch (e) { falhar(e); }
    });
  });
}

// ---------------------------------------------------------------- Políticas de IA
// Uma página responde: o que pode ser enviado, por quem, para qual modelo e em qual contexto. Primeiro as decisões
// principais (sigilo e regra de cada tipo de dado); o que é raro fica em "Mais opções" e o resumo do que está em
// vigor, em "Ver as regras em vigor".
async function abaPoliticas({ sucesso = '' } = {}) {
  const [c, m, { areas }, { grupos }, sig, sug] = await Promise.all([api('/api/admin/config'), api('/api/admin/modelos'), api('/api/admin/areas'), api('/api/admin/grupos'), api('/api/admin/sigilo'),
    api('/api/admin/modelos/sugestao').catch(() => null)]);
  const homologados = m.modelos.filter(x => x.liberado && x.homologado);
  const nomes = (ids, lista) => ids.map(id => lista.find(x => x.id === id)?.nome).filter(Boolean).join(', ');
  const quem = p => { const a = m.config.acessoPerfis[p] || {}; return a.todos ? 'Todas as pessoas' : [nomes(a.grupos || [], grupos), nomes(a.areas || [], areas)].filter(Boolean).join(' · ') || 'Ninguém no dia a dia (só pelo Quick Win)'; };
  // No lugar do antigo aviso (sigilo ligado e menos de dois modelos aprovados de fabricantes diferentes): a Sugestão
  // da GreenIA, calma, com um botão só. Depois de aprovar, só a confirmação de que ficou pronto.
  const aviso = sucesso ? `<p class="adm-sugestao-pronto" role="status" id="sugestao-modelos">${ICONE.escudo}<span>${esc(sucesso)}</span></p>`
    : sig.ativo && sug && sug.sigilo.situacao !== 'pronto' ? cartaoSugestao(sug) : '';
  $('conteudo').innerHTML = `${topoTela('O que pode ser enviado para a IA, em qual contexto. Vale para mensagens e anexos.')}
    ${aviso}
    <div class="secao-titulo"><h2>Informações sigilosas</h2></div>
    <div class="editor" id="sigilo-politica"><div class="linha-switch">
      <button type="button" class="switch" id="sigilo-ativo" role="switch" aria-checked="${sig.ativo}" aria-labelledby="sigilo-titulo"><span></span></button>
      <label class="ls-titulo" id="sigilo-titulo" for="sigilo-ativo">Permitir processamento de informações sigilosas com proteções obrigatórias de dados</label>
      <span class="estado ${sig.ativo ? 'on' : ''}">${sig.ativo ? 'Ligado' : 'Desligado'}</span>
      <p class="ls-desc">${sig.ativo ? 'Sem um recurso autorizado disponível, os dados pessoais reconhecidos (CPF, CNPJ, RG, emails e telefones pessoais, CEP, cartão, dados bancários e chave PIX) saem trocados por marcadores e voltam só na resposta; outras informações sigilosas não são enviadas e a pessoa é avisada.' : 'Hoje informações sigilosas não são enviadas para recursos de IA. Os dados pessoais reconhecidos (CPF, CNPJ, RG, emails e telefones pessoais, CEP, cartão, dados bancários e chave PIX) saem trocados por marcadores e voltam só na resposta.'}</p>
    </div></div>
    <form id="form-dados"><div class="secao-titulo"><h2>Tipos de dado reconhecidos</h2><span class="dica">Vale para o chat e é o padrão de cada Quick Win novo</span></div>
      <div class="tabela-rolagem"><table class="tabela tabela-empilha"><thead><tr><th>Tipo de dado</th><th>Regra</th><th>Efeito</th></tr></thead><tbody>
        ${Object.entries(DADOS).map(([k, v]) => `<tr><td data-r="Tipo"><b>${v}</b></td><td data-r="Regra">${seletorAcao(`d-${k}`, v, c.acoesChat[k])}</td>
          <td data-r="Efeito" class="dica" data-efeito="${k}" aria-live="polite">${EFEITO[c.acoesChat[k]] || EFEITO.bloquear}</td></tr>`).join('')}
        <tr><td data-r="Tipo"><b>Senhas, chaves de acesso e outros segredos</b></td><td data-r="Regra">Bloqueados quando reconhecidos</td><td data-r="Efeito" class="dica">Regra de segurança da GreenIA, sempre ligada</td></tr>
        <tr><td data-r="Tipo"><b>Informação estratégica sem marcação</b></td><td data-r="Regra">Marcação manual</td><td data-r="Efeito" class="dica">A pessoa marca a conversa ou o documento como sigiloso</td></tr>
      </tbody></table></div>
      <div class="adm-mais">${botaoRevelar('politicas-mais', 'Mais opções')}</div>
      <div id="politicas-mais" hidden>
        <h3>Guardar no histórico</h3>
        <p class="dica">Desmarcado, a mensagem é processada, mas o conteúdo, os anexos e a resposta não ficam guardados.</p>
        <div class="caixas adm-guardar">${Object.entries(DADOS).map(([k, v]) => `<label class="adm-marca"><input type="checkbox" aria-label="Guardar ${esc(v)} no histórico" data-guardar="${k}" ${(c.naoArmazenar || []).includes(k) ? '' : 'checked'}> <span>${v}</span></label>`).join('')}</div>
        <h3>Dados pessoais e pesquisa na internet</h3>
        <label class="opcoes"><span><input type="checkbox" id="protecao-pessoais" ${c.protecaoDadosPessoais !== false ? 'checked' : ''}> Enviar dados pessoais só para recursos que não treinam com eles</span></label>
        <label class="opcoes"><span><input type="checkbox" id="pesquisa-web" ${c.pesquisaWeb?.ativa ? 'checked' : ''}> Permitir que Quick Wins pesquisem na internet (por exemplo, "temas em alta")</span></label>
        <fieldset class="perfil-publico" style="margin-top:10px;border:0;padding:0"><legend><b>Perfil público para pesquisas na internet</b></legend>
          <p class="dica">Só o que já é público. Em branco, o Quick Win pergunta o mercado quando a pesquisa precisar.</p>
          ${Object.entries(PERFIL_PUBLICO).map(([k, r]) => `<div class="campo"><label for="perfil-${k}">${r}</label><input class="entrada" id="perfil-${k}" maxlength="80" value="${esc(c.pesquisaWeb?.perfil?.[k] || '')}"></div>`).join('')}
        </fieldset>
        <h3>Código e sites</h3>
        <p class="dica">Conversar sobre programação, explicar código e mostrar exemplos é sempre permitido. Cada operação abaixo depende também do perfil da pessoa (Pessoas › Perfis). Desmarcada aqui, fica proibida para todos.</p>
        <div class="caixas">${[['projeto', 'Criar sites e aplicativos'], ['executar', 'Executar código'], ['repositorio', 'Acessar repositórios de código'], ['publicar', 'Publicar projetos']].map(([k, r]) => `<label class="adm-marca"><input type="checkbox" data-desenvolvimento="${k}" ${c.desenvolvimento?.[k] === false ? '' : 'checked'}> <span>${r}</span></label>`).join('')}</div>
      </div>
      <div class="linha-botoes" style="margin-top:10px"><button class="btn btn-verde btn-pequeno">Salvar regras de dados</button></div></form>

    <div class="secao-titulo"><h2>Repositórios e sites publicados</h2></div>
    <div id="codigo-admin" class="cfg">${carregandoHtml()}</div>

    <div class="secao-titulo"><h2>Regras em vigor</h2>${botaoRevelar('politicas-vigor', 'Ver as regras em vigor')}</div>
    <div id="politicas-vigor" hidden>
    <div class="secao-titulo"><h3>Conversas sigilosas</h3><a class="btn-texto btn-pequeno" href="#/modelos/catalogo">Gerir modelos aprovados para dados sigilosos</a></div>
    <div class="tabela-rolagem"><table class="tabela tabela-empilha"><thead><tr><th>Quando uma conversa vira sigilosa</th><th>Situação atual</th></tr></thead><tbody>
      <tr><td data-r="Gatilho">Área com proteção reforçada: conteúdo com marcação de confidencialidade, dado pessoal sensível ou dado de pessoas em processo interno</td><td data-r="Situação">${areas.filter(a => a.sigilosa).map(a => esc(a.nome)).join(', ') || '<span class="dica">nenhuma</span>'}</td></tr>
      <tr><td data-r="Gatilho">Quick Win que trata dados sigilosos</td><td data-r="Situação">definido em cada Quick Win</td></tr>
      <tr><td data-r="Gatilho">Tipo de dado marcado como "Só com proteção"</td><td data-r="Situação">${Object.entries(c.acoesChat).filter(([k, v]) => v === 'proteger' && DADOS[k]).map(([k]) => DADOS[k]).join(', ') || '<span class="dica">nenhum</span>'}</td></tr>
      <tr><td data-r="Gatilho">Documento sigiloso usado na resposta</td><td data-r="Situação">marcado no envio do documento</td></tr>
      <tr><td data-r="Gatilho">Marcação manual pela pessoa</td><td data-r="Situação">sempre disponível no chat</td></tr>
    </tbody></table></div>
    ${homologados.length ? `<div class="tabela-rolagem" style="margin-top:10px"><table class="tabela"><thead><tr><th>Modelo homologado</th><th>Nível</th><th>Fornecedor fixado</th><th>Homologado por</th></tr></thead><tbody>
      ${homologados.map(x => `<tr><td>${esc(x.nome)}</td><td>${PERFIS[x.perfil] || ''}</td><td>${esc(x.homologacao?.fornecedor || '')}</td><td>${esc(x.homologacao?.quem || '')} · ${dataHora(x.homologacao?.em)}</td></tr>`).join('')}</tbody></table></div>` : ''}
    <div class="secao-titulo"><h3>Quem usa cada nível</h3><a class="btn-texto btn-pequeno" href="#/modelos">Alterar</a></div>
    <div class="tabela-rolagem"><table class="tabela tabela-empilha"><thead><tr><th>Nível</th><th>Quem usa no dia a dia</th></tr></thead><tbody>
      <tr><td data-r="Nível"><b>Rápido</b></td><td data-r="Quem usa">Todas as pessoas</td></tr>
      <tr><td data-r="Nível"><b>Equilibrado</b></td><td data-r="Quem usa">${esc(quem('equilibrado'))}</td></tr>
      <tr><td data-r="Nível"><b>Avançado</b></td><td data-r="Quem usa">${esc(quem('avancado'))}</td></tr>
    </tbody></table></div>
    <div class="secao-titulo"><h3>Fornecedores e retenção</h3><a class="btn-texto btn-pequeno" href="#/configuracoes?foco=c-ret">Alterar retenção</a></div>
    <div class="tabela-rolagem"><table class="tabela tabela-empilha"><tbody>
      <tr><td data-r="Regra">Conversas normais</td><td data-r="Situação">${m.config.exigirSemTreino ? 'Só fornecedores que não treinam com os dados' : 'Qualquer fornecedor liberado (a exigência de não treinar está desligada)'}</td></tr>
      <tr><td data-r="Regra">Histórico das conversas</td><td data-r="Situação">Guardado nesta instalação e apagado depois de ${c.retencaoDias} dias sem uso</td></tr>
      <tr><td data-r="Regra">Anexos</td><td data-r="Situação">Só o texto extraído fica guardado, junto com a conversa</td></tr>
    </tbody></table></div></div>`;
  ligarSugestao(sug, async n => { await abaPoliticas({ sucesso: `Pronto: ${n} ${n === 1 ? 'modelo aprovado' : 'modelos aprovados'} para dados sigilosos.` }); });
  if (sucesso) $('sugestao-modelos')?.scrollIntoView({ block: 'center' });   // no celular, o botão ficava lá embaixo
  else if (new URLSearchParams(location.hash.split('?')[1] || '').get('sugestao') === '1') { $('sugestao-modelos')?.scrollIntoView({ block: 'start' }); $('sug-aprovar')?.focus({ preventScroll: true }); }
  $('sigilo-ativo').onclick = async () => {
    const ativo = !sig.ativo;
    if (ativo && !await confirmar({ titulo: 'Ligar o processamento de informações sigilosas?', texto: 'Informações sigilosas passam a ser processadas, só por recursos autorizados que atendem às proteções obrigatórias de dados.', botao: 'Ligar com proteções' })) return;
    try { await api('/api/admin/sigilo', { metodo: 'PUT', corpo: { ativo } }); toast(ativo ? 'Processamento protegido ligado.' : 'Processamento de informações sigilosas desligado.'); abaPoliticas(); } catch (e) { falhar(e); }
  };
  const vig = vigiarAlteracoes($('form-dados'), { barra: $('form-dados').querySelector('.linha-botoes') });
  // Uma ação principal por tela: com a sugestão na frente, Salvar só vira a ação principal quando há alteração.
  const salvar = $('form-dados').querySelector('.linha-botoes .btn');
  if ($('sug-aprovar')) { salvar.classList.replace('btn-verde', 'btn-linha'); $('form-dados').addEventListener('input', () => salvar.classList.replace('btn-linha', 'btn-verde'), { once: true }); $('form-dados').addEventListener('change', () => salvar.classList.replace('btn-linha', 'btn-verde'), { once: true }); }
  // O efeito acompanha a regra escolhida na hora, antes de salvar.
  $('form-dados').addEventListener('change', ev => { const r = ev.target.closest('select[name^="d-"]'); if (r) $('form-dados').querySelector(`[data-efeito="${r.name.slice(2)}"]`).textContent = EFEITO[r.value]; });
  $('form-dados').onsubmit = async ev => {
    ev.preventDefault();
    try {
      await api('/api/admin/config', { metodo: 'PUT', corpo: { acoesChat: Object.fromEntries(Object.keys(DADOS).map(k => [k, document.querySelector(`select[name="d-${k}"]`).value])),
        naoArmazenar: Object.keys(DADOS).filter(k => !document.querySelector(`[data-guardar="${k}"]`).checked), protecaoDadosPessoais: $('protecao-pessoais').checked, pesquisaWeb: { ativa: $('pesquisa-web').checked, perfil: Object.fromEntries(Object.keys(PERFIL_PUBLICO).map(k => [k, $(`perfil-${k}`).value])) },
        desenvolvimento: Object.fromEntries([...document.querySelectorAll('[data-desenvolvimento]')].filter(x => !x.checked).map(x => [x.dataset.desenvolvimento, false])) } });
      vig.limpar(); toast('Regras de dados salvas.'); abaPoliticas();
    } catch (e) { falhar(e); }
  };
  codigoAdmin();
}

// Código e sites: a conexão com o GitHub (token cifrado no servidor; nunca volta para a tela) e os repositórios
// liberados; os sites publicados pela empresa, com o botão de tirar do ar.
async function codigoAdmin() {
  const caixa = $('codigo-admin');
  if (!caixa) return;
  let d;
  try { d = await api('/api/admin/codigo'); } catch (e) { caixa.innerHTML = `<p class="dica">${esc(e.message || 'Não foi possível carregar.')}</p>`; return; }
  const r = d.repositorios;
  caixa.innerHTML = `<form id="form-repos">
      <h3>Repositórios de código (GitHub)</h3>
      <p class="dica">Quem tem "Acessar repositórios de código" no perfil pode pedir no chat para ler um destes repositórios ou propor alterações. Alterações sempre viram um Pull Request num branch novo, para revisão: nada é gravado direto no branch principal. Use um token de acesso fino (fine-grained) só com estes repositórios, com leitura de conteúdo e escrita de conteúdo e de pull requests.</p>
      <p>${r.conectado ? `Conectado${r.conta ? ` como <b>${esc(r.conta)}</b>` : ''}.` : 'Nenhum repositório conectado.'}</p>
      <div class="campo"><label for="repo-token">${r.conectado ? 'Trocar o token (deixe em branco para manter)' : 'Token do GitHub'}</label><input class="entrada" id="repo-token" type="password" autocomplete="off" spellcheck="false"></div>
      <div class="campo"><label for="repo-lista">Repositórios liberados (um por linha, no formato dono/nome)</label><textarea class="entrada" id="repo-lista" rows="3" spellcheck="false">${esc((r.repos || []).join('\n'))}</textarea></div>
      <div class="linha-botoes"><button class="btn btn-verde btn-pequeno">Salvar conexão</button>${r.conectado ? ' <button type="button" class="btn btn-linha btn-pequeno" id="repo-desconectar">Desconectar</button>' : ''}</div>
    </form>
    <h3>Sites publicados</h3>
    ${d.sites.length ? `<ul class="lista-simples">${d.sites.map(s => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.url)}</a> · ${esc(s.pessoa || 'Pessoa')} · ${esc(new Date(s.criado_em).toLocaleDateString('pt-BR'))} <button type="button" class="btn btn-linha btn-pequeno" data-tirar-site="${esc(s.token)}">Tirar do ar</button></li>`).join('')}</ul>` : '<p class="dica">Nenhum site publicado.</p>'}`;
  $('form-repos').onsubmit = async ev => {
    ev.preventDefault();
    const b = ev.submitter || $('form-repos').querySelector('.btn-verde');
    try {
      b.disabled = true;
      await api('/api/admin/codigo/repositorios', { metodo: 'PUT', corpo: { token: $('repo-token').value.trim() || undefined, repos: $('repo-lista').value.split(/\s+/).filter(Boolean) } });
      toast('Conexão com o GitHub salva e conferida.'); codigoAdmin();
    } catch (e) { b.disabled = false; toast(e.message || 'Não foi possível salvar.', 8000); }
  };
  $('repo-desconectar')?.addEventListener('click', async () => {
    if (!await confirmar({ titulo: 'Desconectar o GitHub?', texto: 'O token é apagado e ninguém mais consegue ler ou alterar repositórios pelo chat até uma nova conexão.', botao: 'Desconectar', perigo: true })) return;
    try { await api('/api/admin/codigo/repositorios', { metodo: 'DELETE' }); toast('GitHub desconectado.'); codigoAdmin(); } catch (e) { toast(e.message); }
  });
  caixa.querySelectorAll('[data-tirar-site]').forEach(b => b.onclick = async () => {
    b.disabled = true;
    try { await api(`/api/sites/${b.dataset.tirarSite}/despublicar`, { metodo: 'POST', corpo: {} }); toast('Site tirado do ar.'); codigoAdmin(); } catch (e) { b.disabled = false; toast(e.message); }
  });
}

// ---------------------------------------------------------------- Roteamento
const COMPLEXIDADE = { simples: 'Simples', intermediaria: 'Intermediária', complexa: 'Complexa' };
const MODO = { automatico: 'Automático', manual: 'Escolhido pela pessoa', quick_win: 'Definido pelo Quick Win', padrao: 'Padrão da empresa (escolha automática desligada)', externo: 'Automático do serviço de IA' };
const STATUS_CAND = { escolhido: 'escolhido', preterido: 'atendia; menor utilidade', insuficiente: 'capacidade abaixo da exigida', excluido: 'fora pelas regras' };
const MOTIVO_CAND = { capacidade_insuficiente: 'capacidade abaixo da exigida', nao_homologado: 'não homologado (conversa sigilosa)', plano_na_reserva: 'reserva do plano (só Rápido)',
  gratuito_treina_com_dados: 'gratuito: treina com os dados', protecao_insuficiente: 'sem a proteção que o conteúdo exige', sem_acesso_a_classe: 'a pessoa não tem acesso ao nível', contexto_insuficiente: 'o conteúdo é grande demais para o modelo' };
const RESULTADO = { respondido: 'respondido', respondido_pela_reserva: 'respondido pela reserva', falha_na_execucao: 'falha na execução', bloqueado: 'bloqueado antes do envio', enviado: 'em andamento' };
const FALLBACK = { abaixo_do_necessario: 'abaixo do necessário (regras ou permissões)', abaixo_do_necessario_por_escolha: 'abaixo do necessário (escolha manual)',
  trocado_por_falta_de_contexto: 'trocado: conteúdo grande demais', trocado_pela_reserva_do_plano: 'trocado pela reserva do plano', sem_modelo: 'nenhum modelo permitido' };
const TIPO_TAREFA = { edicao: 'edição e formatação', classificacao: 'classificação', traducao: 'tradução', extracao: 'extração', sintese: 'síntese', redacao: 'redação', analise: 'análise', programacao: 'programação', raciocinio: 'raciocínio', consulta: 'consulta' };
const PREFERENCIAS = [['economia', 'Menor consumo adequado', 'Seleciona o recurso de menor consumo entre os que conseguem executar o pedido.'],
  ['equilibrio', 'Seleção recomendada', 'Considera as etapas, os recursos já aprovados pela empresa e o consumo estimado.'],
  ['qualidade', 'Capacidade adicional em tarefas com várias etapas', 'Pode usar recursos de maior capacidade em pedidos com análise ou execução em várias etapas. Continua dependendo dos acessos e do orçamento disponíveis.']];
function barrasDist(titulo, dist, nomes) {
  const total = Object.values(dist).reduce((a, b) => a + b, 0);
  const linhas = Object.entries(nomes).filter(([k]) => dist[k]).map(([k, nome]) => { const n = dist[k], pct = Math.round(n / total * 100);
    return `<div class="rt-linha" title="${esc(nome)}: ${num(n)} ${n === 1 ? 'decisão' : 'decisões'} (${pct}%)"><span>${esc(nome)}</span><div class="barra"><span style="width:${pct}%"></span></div><b>${pct}%</b></div>`; });
  return `<div class="or-card cartao sem-seta"><span class="or-rotulo">${esc(titulo)}</span>${linhas.join('') || '<p class="or-sub">Sem decisões ainda.</p>'}</div>`;
}
async function abaRoteamento() {
  const consulta=new URLSearchParams(location.hash.split('?')[1]||'');
  const d=await api('/api/admin/roteamento?'+new URLSearchParams({pagina:consulta.get('pagina')||'1',limite:'20',situacao:consulta.get('situacao')||''}));
  const c=d.config,r=d.resumo,a=r.atencao||{},pg=d.paginacao||{pagina:1,paginas:1,total:d.decisoes.length};
  const tituloPagina=document.querySelector('.cabeca h1');if(tituloPagina)tituloPagina.textContent='Escolha automática';
  $('conteudo').innerHTML = `${topoTela('')}
    <form id="cfg-rota" class="trabalho-config">
      <section class="trabalho-principal" aria-labelledby="rota-titulo">
        <div class="trabalho-config-topo"><span class="trabalho-icone trabalho-icone-destaque">${ICONE.camadas}</span><span class="trabalho-recomendado">Recomendado</span></div>
        <h2 id="rota-titulo">Deixar o GreenIA escolher os recursos</h2>
        <p class="trabalho-descricao">Sua equipe descreve o trabalho. O GreenIA escolhe os recursos dentro dos acessos e do limite de consumo da empresa.</p>
        <div class="trabalho-ativacao"><div><strong id="rota-switch-rotulo">Escolha automática de recursos</strong><p>Você mantém o controle dos acessos e do consumo.</p></div><div class="trabalho-switch-estado"><span id="rota-estado" role="status">${c.ativo?'Ativado':'Desativado'}</span><button type="button" id="rota-switch" class="switch" role="switch" aria-labelledby="rota-switch-rotulo" aria-checked="${!!c.ativo}"><span></span></button><input id="rota-ativo" type="checkbox" hidden ${c.ativo?'checked':''}></div></div><p class="trabalho-pendente" id="rota-pendente" role="status" hidden>Alteração pendente. Salve para aplicar.</p><a class="trabalho-link" id="rota-manual" href="#/modelos" ${c.ativo?'hidden':''}>Ver os recursos definidos pela empresa ${ICONE.seta}</a>
      </section>
      ${exemplosDeTrabalho()}
      <details id="rota-ajustes" class="trabalho-detalhes"><summary><span class="trabalho-icone">${ICONE.engrenagem}</span><span><strong>Limites e preferências de consumo</strong><small id="rota-resumo">${esc(PREFERENCIAS.find(([k])=>k===c.preferencia)?.[1]||'Seleção recomendada')} · limites da empresa preservados</small></span><span class="trabalho-chevron">${ICONE.chevron}</span></summary><div class="trabalho-detalhes-corpo"><p>A plataforma avalia cada pedido. Ajuste a preferência somente se sua empresa precisar.</p>
      <div class="rt-pref">${PREFERENCIAS.map(([k,n,dica])=>`<label><input type="radio" name="rota-pref" value="${k}" ${c.preferencia===k?'checked':''}><span><b>${n}</b><small>${dica}</small></span></label>`).join('')}</div><a class="trabalho-link" href="#/configuracoes">Revisar limites da empresa ${ICONE.seta}</a></div></details>
      <div id="rota-feedback" class="trabalho-feedback" role="status" aria-live="polite"></div>
      <div class="linha-botoes trabalho-salvar" hidden><button type="button" class="btn btn-linha" id="rota-descartar">Descartar</button><button type="submit" class="btn btn-verde">Salvar alterações</button></div>
    </form>
    <section class="trabalho-resumo" aria-labelledby="resumo-rota-titulo"><div class="trabalho-secao"><h2 id="resumo-rota-titulo">Uso nos últimos 30 dias</h2><p>Escolhas da plataforma com resposta registrada.</p></div>
      <div class="trabalho-metricas"><div><span>Decisões registradas</span><strong>${num(r.decisoes)}</strong><small>Com resposta · últimos 30 dias</small></div><div><span>${emCreditos()?'Créditos utilizados':'Consumo realizado'}</span><strong>${fmtCusto(r.consumo.realizado.custo)}</strong><small>Nas decisões com resposta · últimos 30 dias</small></div></div>
      <details class="trabalho-detalhes trabalho-atencao"><summary><span class="trabalho-icone">${ICONE.atividade}</span><span><strong>Registros para acompanhar</strong><small>Bloqueios, escolhas e capacidade utilizada</small></span><span class="trabalho-chevron">${ICONE.chevron}</span></summary><div class="trabalho-detalhes-corpo"><ul class="trabalho-casos">
        <li><span><strong>${num(a.bloqueios||0)} envios bloqueados</strong><small>Registros impedidos antes da execução.</small></span><a href="#/modelos/roteamento?situacao=bloqueado">Consultar</a></li>
        <li><span><strong>${num(a.respostasAbaixo||0)} respostas abaixo da capacidade indicada</strong><small>Classificação histórica do roteador; não é uma avaliação do conteúdo.</small></span><a href="#/modelos/roteamento?situacao=abaixo">Consultar</a></li>
        <li><span><strong>${num(a.roteamentoExterno||0)} registros de roteamento externo</strong><small>Exigem análise individual; esta contagem não confirma desvio de política.</small></span><a href="#/modelos/roteamento?situacao=externo">Consultar</a></li>
      </ul><p>${num(a.alternativasIniciadas||0)} alternativas iniciadas após aceite e ${num(a.manuais||0)} respostas com escolha manual registrada. São situações diferentes de uma execução com capacidade insuficiente.</p></div></details>
      <details class="trabalho-detalhes"><summary><span class="trabalho-icone">${ICONE.grafico}</span><span><strong>Como ler estes números</strong><small>Escopo e cobertura dos registros</small></span><span class="trabalho-chevron">${ICONE.chevron}</span></summary><div class="trabalho-detalhes-corpo"><p>As duas medidas principais contam decisões classificadas como respondidas pelo roteador GreenIA. Registros antigos sem status usam sua classificação histórica de resposta. Excluem testes, bloqueios e roteamento externo; não representam todos os lançamentos da empresa.</p><p>A estimativa de consumo evitado está suspensa: o cenário hipotético não comprova economia nem resultado equivalente.</p><p>Alternativas iniciadas são contadas pelos eventos de início após aceite; não comprovam conclusão. Escolhas manuais, bloqueios e registros externos possuem contagens separadas.</p></div></details>
    </section>
    <details class="trabalho-detalhes uso-detalhes"><summary><span class="trabalho-icone">${ICONE.lista}</span><span><strong>Diagnóstico detalhado</strong><small>Classificação, tempos e critérios</small></span><span class="trabalho-chevron">${ICONE.chevron}</span></summary><div class="trabalho-detalhes-corpo">
    <p class="dica">${r.realizadoSobreEstimado ? `Consumo estimado antes de cada resposta × consumo medido: ${Math.round(Math.min(r.realizadoSobreEstimado, 1 / r.realizadoSobreEstimado) * 100)}% de proximidade.` : 'Ainda sem amostra para comparar o consumo estimado com o medido.'}</p>
    <div class="or-grade grade-cartoes adm-resumo-rota">${barrasDist('Complexidade dos pedidos', r.porComplexidade, COMPLEXIDADE)}${barrasDist('Nível exigido pelo pedido', r.porNecessaria, PERFIS)}${barrasDist('Nível usado', r.porClasse, PERFIS)}${barrasDist('Como o nível foi definido', r.porModo, MODO)}</div>
    <h3>Classificação dos pedidos</h3>
    <p class="dica">Quanto cada tipo de pedido aparece e como se sai. "Consulta" é o pedido sem tipo reconhecido: se ele for muito frequente ou concentrar "não serviu" e pedidos refeitos, a classificação precisa melhorar.</p>
    ${tabela(['Tipo principal', '#Pedidos', '#% do total', '#Não serviu', '#Refeitos', '#Tipo decidiu a exigência'], r.classificacao.map(c => `<tr><td>${esc(TIPO_TAREFA[c.tipo] || c.tipo)}</td>
      <td class="num">${num(c.n)}</td><td class="num">${c.percentual ?? '—'}%</td><td class="num">${c.naoServiuPercentual == null ? '—' : `${c.naoServiuPercentual}%`}</td>
      <td class="num">${c.refeitoPercentual ?? 0}%</td><td class="num">${c.tipoDecidiuPercentual ?? 0}%</td></tr>`), 'Sem pedidos ainda.')}
    <h3>Tempo de resposta por modelo</h3>
    <p class="dica">Só observação: o tempo não entra na escolha. Primeiro trecho é o que a pessoa sente; total inclui a resposta inteira.</p>
    ${tabela(['Modelo', '#Respostas', '#Primeiro trecho', '#Total'], r.latencia.map(l => `<tr><td>${esc(l.modelo)}</td><td class="num">${num(l.n)}</td>
      <td class="num">${l.primeiroTokenMs == null ? '—' : `${(l.primeiroTokenMs / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} s`}</td><td class="num">${(l.totalMs / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} s</td></tr>`), 'Sem respostas ainda.')}
    </div></details>
    <section class="trabalho-historico" id="historico-rota"><div class="trabalho-historico-topo"><div class="trabalho-secao"><h2>Decisões recentes</h2><p>${pg.filtro?'Filtro dos últimos 30 dias':'Histórico de decisões'} · ${num(pg.total)} registros</p></div><label class="trabalho-filtro">Mostrar<select class="entrada" id="rota-filtro"><option value="">Todos os registros</option><option value="bloqueado" ${pg.filtro==='bloqueado'?'selected':''}>Envios bloqueados</option><option value="abaixo" ${pg.filtro==='abaixo'?'selected':''}>Capacidade abaixo da indicada</option><option value="manual" ${pg.filtro==='manual'?'selected':''}>Escolha manual</option><option value="externo" ${pg.filtro==='externo'?'selected':''}>Roteamento externo</option></select></label></div>
    ${tabela(['Quando','Tipo de trabalho','Escolha realizada','Motivo'],d.decisoes.map((x,i)=>`<tr data-registro="${i}" aria-label="${esc(`Decisão de ${dataHora(x.em)}. Enter abre os detalhes.`)}"><td data-r="Quando">${dataHora(x.em)}</td><td data-r="Trabalho">${esc(x.tipos.map(t=>TIPO_TAREFA[t]||t).join(', ')||'Consulta')}</td><td data-r="Escolha"><strong>${esc(RESULTADO[x.resultado]||x.resultado||'Registrada')}</strong><br><span class="dica">${esc(MODO[x.modo]||x.modo)}</span></td><td data-r="Motivo" class="trabalho-motivo"><span>${esc(x.explicacao||'Motivo não registrado.')}</span></td></tr>`),'Nenhum registro para este filtro.').replace('class="tabela"','class="tabela tabela-decisoes adm-registros"')}
    <nav class="trabalho-paginacao" aria-label="Páginas do histórico"><button class="btn btn-linha" id="rota-anterior" ${pg.pagina<=1?'disabled':''}>Anterior</button><span>Página ${pg.pagina} de ${pg.paginas}</span><button class="btn btn-linha" id="rota-proxima" ${pg.pagina>=pg.paginas?'disabled':''}>Próxima</button></nav></section>`;
  const irHistorico=(pagina,filtro=pg.filtro)=>{location.hash='/modelos/roteamento?'+new URLSearchParams({pagina:String(pagina),situacao:filtro||''});};
  $('rota-filtro').onchange=e=>irHistorico(1,e.target.value);
  $('rota-anterior').onclick=()=>irHistorico(pg.pagina-1);$('rota-proxima').onclick=()=>irHistorico(pg.pagina+1);
  // Requisitos, candidatos e critérios de uma decisão: no painel lateral, uma por vez.
  ligarLinhas(document.querySelector('#conteudo .tabela-decisoes'), i => {
    const x = d.decisoes[Number(i)];
    if (!x) return;
    painelLateral({ migalha: 'Decisões recentes', titulo: `Decisão de ${dataHora(x.em)}`, corpo: `<p>${esc(x.explicacao)}</p>
      <section class="px-secao"><h3>Requisitos</h3><p class="dica">${esc(MODO[x.modo] || x.modo)} · preferência ${esc(x.preferencia || '—')} · requisitos: ${esc(Object.entries(x.requisitos.dimensoes || {}).map(([k, n]) => `${k} ${n}`).join(', ') || '—')}</p></section>
      <section class="px-secao"><h3>Candidatos</h3><ul class="dica">${x.candidatos.map(k => `<li>${esc(k.id)} (${PERFIS[k.classe] || k.classe}): ${esc(STATUS_CAND[k.status] || k.status)}${k.motivos?.length ? ` · ${esc(k.motivos.map(m => MOTIVO_CAND[m] || m).join(', '))}` : ''}${k.custo != null ? ` · ${fmtCusto(k.custo)}` : ''}</li>`).join('')}</ul></section>
      <section class="px-secao"><h3>Critérios</h3><p class="dica">Regras: ${esc(x.politicas.join(', ') || '—')} · escolha: ${esc(x.motivo_escolha || '—')}${x.reserva ? ` · reserva: ${esc(x.reserva)}` : ''} · versão ${esc(x.versao)}</p></section>` });
  });
  const form=$('cfg-rota'),barra=form.querySelector('.trabalho-salvar'),feedback=$('rota-feedback');
  const vig=vigiarAlteracoes(form,{barra});
  let salvo={ativo:!!c.ativo,preferencia:c.preferencia},salvando=false;
  const atual=()=>({ativo:$('rota-ativo').checked,preferencia:form.querySelector('input[name=rota-pref]:checked')?.value});
  const atualizar=()=>{const a=atual(),mudou=JSON.stringify(a)!==JSON.stringify(salvo);barra.hidden=!mudou;$('rota-pendente').hidden=!mudou;$('rota-manual').hidden=a.ativo;vig.limpar();if(mudou)vig.marcar();$('rota-estado').textContent=a.ativo?'Ativado':'Desativado';$('rota-switch').setAttribute('aria-checked',String(a.ativo));$('rota-resumo').textContent=(PREFERENCIAS.find(([k])=>k===a.preferencia)?.[1]||'Seleção recomendada')+' · limites da empresa preservados';};
  $('rota-switch').onclick=async e=>{const b=e.currentTarget;if(salvando||b.disabled)return;b.disabled=true;try{const ativar=!$('rota-ativo').checked;if(!ativar&&!await confirmar({titulo:'Desativar a escolha automática?',texto:'Os próximos pedidos usarão a configuração manual da empresa. A plataforma continuará verificando permissões, segurança e consumo; trabalhos sem recursos adequados poderão ficar bloqueados. A mudança só será aplicada ao salvar.',botao:'Desativar escolha automática'}))return;$('rota-ativo').checked=ativar;atualizar();feedback.textContent='';}finally{b.disabled=false;}};
  $('rota-descartar').onclick=()=>{$('rota-ativo').checked=salvo.ativo;form.querySelectorAll('input[name=rota-pref]').forEach(x=>x.checked=x.value===salvo.preferencia);atualizar();feedback.textContent='Alterações descartadas.';};
  form.addEventListener('change',()=>{atualizar();feedback.textContent='';});
  form.onsubmit=async ev=>{ev.preventDefault();if(salvando)return;salvando=true;const b=barra.querySelector('button[type=submit]'),dados=atual();b.disabled=true;$('rota-descartar').disabled=true;b.textContent='Salvando…';form.setAttribute('aria-busy','true');form.querySelectorAll('input, #rota-switch').forEach(x=>x.disabled=true);feedback.textContent='';try{
    await api('/api/admin/modelos-config',{metodo:'PUT',corpo:{roteamento:dados}});salvo=dados;atualizar();feedback.setAttribute('role','status');feedback.textContent='Alterações salvas. A configuração já está em uso.';toast('Alterações salvas.');
  }catch(e){feedback.setAttribute('role','alert');feedback.textContent=`Não foi possível salvar. ${e.message} Seus ajustes foram mantidos; tente novamente.`;}finally{salvando=false;b.disabled=false;$('rota-descartar').disabled=false;b.textContent='Salvar alterações';form.removeAttribute('aria-busy');form.querySelectorAll('input, #rota-switch').forEach(x=>x.disabled=false);}};
  atualizar();
}

// ---------------------------------------------------------------- Histórico de modelos
async function abaHistoricoModelos() {
  const d = await api('/api/admin/eventos?prefixo=model.');
  const reg = tabelaRegistros(d.eventos, { nome: e => NOMES_EVENTO[e.tipo] || nomeEvento(e.tipo), quem: e => e.pessoa || 'sistema', vazio: 'Nenhuma alteração registrada ainda.', migalha: 'Histórico de modelos' });
  $('conteudo').innerHTML = `${topoTela('Toda alteração de modelos fica registrada. Clique num registro para ver o detalhe.')}${reg.html}`;
  reg.ligar();
}
const NOMES_EVENTO = { 'model.pool_expanded': 'Modelos do nível ampliados', 'model.changed': 'Modelo alterado', 'model.certified': 'Modelo homologado', 'model.uncertified': 'Homologação retirada', 'model.config_changed': 'Níveis e acesso alterados', 'model.price_changed': 'Preço variou mais de 20%', 'model.suggestion_applied': 'Sugestão de modelos aplicada' };

// ---------------------------------------------------------------- rotas
const TELAS = {
  uso: { titulo: 'Uso e créditos', perm: 'usage.read', fn: abaUso },
  // Pessoas: uma tela com abas. Cada aba aparece só para quem tem a permissão da tela que ela substitui
  // (o servidor confere de novo em cada rota): Perfis é role.manage, Quem cria Quick Wins lê uma rota de company.manage.
  pessoas: { titulo: 'Pessoas', perm: () => pode('user.read') || (!!E.plataforma && pode('role.manage')), abas: true, sub: [
    ['', 'Pessoas', abaPessoas, () => pode('user.read')],
    ['areas', 'Áreas', abaAreas, () => pode('user.read')],
    ['grupos', 'Grupos', abaGrupos, () => pode('user.read')],
    ['perfis', 'Perfis', async () => (await import('/empresa.js')).telaRoles(), () => !!E.plataforma && pode('role.manage')],
    ['criacao', 'Quem cria Quick Wins', abaCriacaoQw, () => pode('company.manage')]] },
  // Modelos: a aba principal é o que a empresa decide (níveis e quem usa); o catálogo técnico fica numa aba própria.
  modelos: { titulo: 'Modelos', perm: 'models.manage', abas: true, sub: [['', 'Níveis e acesso', abaModelos], ['catalogo', 'Catálogo técnico', abaCatalogo], ['roteamento', 'Escolha automática', abaRoteamento], ['historico', 'Histórico', abaHistoricoModelos]] },
  politicas: { titulo: 'Políticas de IA', perm: 'policy.manage', abas: true, sub: [['', 'Regras de uso', abaPoliticas], ['texto', 'Texto da política', abaPolitica]] },
  atividade: { titulo: 'Atividade', perm: 'audit.read', abas: true, sub: [['', 'Eventos', abaEventos], ['problemas', 'Problemas reportados', abaProblemas],
    ['suporte', 'Acessos do suporte', async () => (await import('/empresa.js')).telaAcessos(), () => !!E.plataforma]] },
  // Marca e endereço (multiempresa): três telas raras numa só, com abas, cada uma com a permissão dela.
  empresa: { titulo: 'Marca e endereço', perm: () => !!E.plataforma && ABAS_EMPRESA().length > 0, abas: true, sub: [
    ['marca', 'Marca', async () => (await import('/empresa.js')).telaMarca(), () => pode('branding.manage')],
    ['landing', 'Página de apresentação', async () => (await import('/empresa.js')).telaLanding(), () => pode('landing_page.manage')],
    ['url', 'URL e domínio', async () => (await import('/empresa.js')).telaUrl(), () => pode('url.manage')]] },
  configuracoes: { titulo: 'Configurações', perm: 'settings.manage', fn: abaConfig },
  conhecimento: { titulo: 'Conhecimento', fn: abaConhecimento, todos: true },
};

export async function rotaGestao(id, sub = '') {
  const t = TELAS[id];
  if (!t || (!t.todos && !(typeof t.perm === 'function' ? t.perm() : pode(t.perm)))) { location.hash = '#/nova'; return; }
  const subs = t.sub?.filter(x => !x[3] || x[3]());
  if (subs && !subs.length) { location.hash = '#/nova'; return; }
  const atual = subs ? subs.find(x => x[0] === (sub || '')) : null;
  // Aba que esta pessoa não pode ver (ou que não existe): vai para a primeira que ela pode, sem rastro no histórico.
  if (subs && !atual) { trocarPara(`#/${id}${subs[0]?.[0] ? `/${subs[0][0]}` : ''}`); return; }
  const titulo = typeof t.titulo === 'function' ? t.titulo() : t.titulo;
  const idAba = x => `aba-${id}-${x[0] || 'inicio'}`;
  const navegacao = !subs ? '' : t.abas
    ? `<div class="subnav abas" role="tablist" aria-label="${esc(titulo)}">${subs.map(x => `<a role="tab" id="${idAba(x)}" href="#/${id}${x[0] ? `/${x[0]}` : ''}" aria-controls="conteudo" aria-selected="${x === atual}" tabindex="${x === atual ? 0 : -1}" ${x === atual ? 'aria-current="page"' : ''}>${x[1]}</a>`).join('')}</div>`
    : `<nav class="subnav" aria-label="${esc(titulo)}">${subs.map(x => `<a href="#/${id}${x[0] ? `/${x[0]}` : ''}" ${x === atual ? 'aria-current="page"' : ''}>${x[1]}</a>`).join('')}</nav>`;
  document.getElementById('principal').innerHTML = `${cabecalho(titulo)}<div class="pagina"><div class="pagina-dentro">
    ${navegacao}
    <div id="conteudo"${t.abas ? ` role="tabpanel" aria-labelledby="${idAba(atual)}" tabindex="-1"` : ''}>${carregandoHtml()}</div></div></div>`;
  ligarCabecalho();
  if (t.abas) ligarAbas(atual && idAba(atual));
  $('conteudo').onclick = null; $('conteudo').onchange = null;
  const conteudo = $('conteudo');
  try {
    await (atual ? atual[2] : t.fn)();
    // Link direto para um campo recolhido (?foco=): abre o bloco ou o "Mais opções" em que ele está.
    const foco = new URLSearchParams(location.hash.split('?')[1] || '').get('foco');
    if (foco && /^[a-z0-9-]+$/.test(foco)) revelarAte(document.getElementById(foco));
  } catch (e) {
    if (!conteudo.isConnected) return;
    conteudo.innerHTML = `<div class="faixa-aviso erro" role="alert"><strong>Não foi possível carregar esta tela.</strong><p>${esc(e.message || 'Verifique sua conexão e tente novamente.')}</p><button type="button" class="btn" id="tentar-carregar">Tentar novamente</button></div>`;
    $('tentar-carregar').onclick = () => rotaGestao(id, sub);
  }
}

// Abas com teclado (padrão tablist): setas, Home e End mudam de aba; o foco fica na aba escolhida depois da troca.
let focarAba = false;
function ligarAbas(idAtual) {
  const lista = document.querySelector('.subnav.abas');
  if (!lista) return;
  if (focarAba) { focarAba = false; document.getElementById(idAtual)?.focus(); }
  lista.addEventListener('keydown', ev => {
    const abas = [...lista.querySelectorAll('[role=tab]')], i = abas.indexOf(document.activeElement);
    if (i < 0) return;
    const alvo = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: abas.length - 1 }[ev.key];
    if (alvo === undefined) return;
    ev.preventDefault();
    const a = abas[(alvo + abas.length) % abas.length];
    a.focus();
    focarAba = true;
    location.hash = a.getAttribute('href');
  });
}
