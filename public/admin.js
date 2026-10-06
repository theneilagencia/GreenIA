import { detalheAuditoria } from '/auditoria-detalhe.js';
import { ligarVisao } from '/preferencias.js';
// Gestão da GreenIA: telas de uso, pessoas, modelos, políticas, atividade,
// configurações e conhecimento, abertas como rotas da aplicação. O servidor confere
// cada permissão; aqui só se escolhe o que mostrar.
import { api, carregandoHtml, emCreditos, esc, fmtCusto, ICONE, ocupado, toast, vazioHtml } from '/comum.js';
import { E, cabecalho, desenharLateral, ligarCabecalho, pode, recarregarBases } from '/app.js';
import { renderizar } from '/md.js';
import { avisoCor } from '/cor.js';
import { abaAreas, abaPessoas, abaGrupos } from '/estrutura.js';

const $ = id => document.getElementById(id);
const S = { get eu() { return E.eu; }, get perm() { return E.permQw; }, get plano() { return E.plano; }, set plano(v) { E.plano = v; }, get operador() { return E.operador; } };
const PERFIS = { rapido: 'Rápido', equilibrado: 'Equilibrado', avancado: 'Avançado' };
// Perfil público para pesquisa externa (mesmos campos de src/quickwin-operacao.js PERFIL_PUBLICO).
const PERFIL_PUBLICO = { nome: 'Nome público', setor: 'Setor', categoria: 'Categoria de produto ou serviço', regiao: 'País ou região', mercado: 'Mercado-alvo' };
const DADOS = { cpf: 'CPF', rg: 'RG', cnpj: 'CNPJ', email: 'Email pessoal (Gmail, Hotmail...)', telefone: 'Telefone', cep: 'CEP', endereco: 'Endereço', cartao: 'Cartão', banco: 'Dados bancários', pix: 'Chave PIX', pessoal_restrito: 'Dado pessoal restrito (disciplinar, remuneração individual)', sensivel: 'Dado pessoal sensível (saúde, biometria, religião...)', confidencial: 'Documento marcado como confidencial' };
// Tratamento proporcional: seguir normalmente, só com proteção (guardrails) ou não enviar.
const ACAO = { permitir: 'Processar normalmente', proteger: 'Só com proteção', bloquear: 'Não enviar' };
const EFEITO = { permitir: 'Segue as regras gerais; a conversa não vira sigilosa', proteger: 'A conversa vira sigilosa: segue só com os guardrails', bloquear: 'Não é enviado; a pessoa vê o motivo' };
const seletorAcao = (nome, rotulo, atual) => `<span class="segmento" role="radiogroup" aria-label="${rotulo}">${Object.entries(ACAO).map(([v, r]) => `<label><input type="radio"${v === 'bloquear' ? ' class="perigo"' : ''} name="${nome}" value="${v}" ${atual === v ? 'checked' : ''}><span>${r}</span></label>`).join('')}</span>`;
const STATUS = { rascunho: 'Rascunho', ativo: 'Ativo', pausado: 'Pausado' };

const us = v => fmtCusto(v || 0);
const porMilhao = p => (p === null || p === undefined ? '—' : `US$ ${(p * 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}`);
const num = v => Number(v || 0).toLocaleString('pt-BR');
// Com plano, a empresa vê o consumo de cada modelo em créditos, nunca o preço.
const colunasPreco = () => (emCreditos() ? ['#Consumo por conversa típica'] : ['#Entrada (1M)', '#Saída (1M)', '#Conversa típica']);
const celulasPreco = x => (emCreditos() ? `<td class="num">${fmtCusto(x.custoConversa, { conversa: true })}</td>`
  : `<td class="num">${porMilhao(x.precoEntrada)}</td><td class="num">${porMilhao(x.precoSaida)}</td><td class="num">${fmtCusto(x.custoConversa)}</td>`);
const dataHora = iso => (iso ? new Date(iso.replace(' ', 'T') + (iso.length === 19 ? 'Z' : '')).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
const lerDataUrl = f => new Promise(ok => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.readAsDataURL(f); });
const falhar = e => toast(e.message || 'Algo deu errado.', 6000);
const caixas = (nome, lista, marcados = []) => `<div class="caixas">${lista.map(i => `<label><input type="checkbox" name="${nome}" value="${i.id}" ${marcados.includes(i.id) ? 'checked' : ''}> ${esc(i.nome || i.email)}</label>`).join('') || '<span class="dica">Nada para escolher ainda.</span>'}</div>`;
const marcados = nome => [...document.querySelectorAll(`input[name="${nome}"]:checked`)].map(i => Number(i.value));
const tabela = (cab, linhas, vazio = 'Nada por aqui ainda.') => `<div class="tabela-rolagem"><table class="tabela"><thead><tr>${cab.map(c => `<th${c.startsWith('#') ? ' class="num"' : ''}>${esc(c.replace(/^#/, ''))}</th>`).join('')}</tr></thead>
  <tbody>${linhas.length ? linhas.join('') : `<tr><td colspan="${cab.length}" class="dica">${vazio}</td></tr>`}</tbody></table></div>`;


// ---------------------------------------------------------------- Áreas e pessoas
// ---------------------------------------------------------------- Quick wins
async function abaCriacaoQw() {
  const [perm, { pessoas }, { grupos }] = await Promise.all([api('/api/admin/quick-wins-permissoes'), api('/api/admin/pessoas'), api('/api/admin/grupos')]);
  $('conteudo').innerHTML = `<p class="lead">Quem cria um quick win configura instruções, conhecimento e classe de modelo, e acompanha uso e resultado. O responsável da área também gere os quick wins da área.</p>
    <form class="grupo-form" id="perm-qw"><h3>Quem pode criar quick wins</h3>
      <label class="opcoes"><span><input type="checkbox" id="perm-resp" ${perm.responsaveis ? 'checked' : ''}> Responsáveis de área, nas áreas em que são responsáveis</span></label>
      <div class="duas-col"><div><span class="legenda">Grupos autorizados (nas áreas de que fazem parte)</span>${caixas('perm-grupos', grupos, perm.grupos)}</div>
        <div><span class="legenda">Pessoas autorizadas</span>${caixas('perm-pessoas', pessoas, perm.pessoas)}</div></div>
      <h3>Quem pode criar quick win para a empresa toda</h3><p class="dica">Além do admin.</p>
      <div class="duas-col"><div><span class="legenda">Grupos</span>${caixas('perm-tg', grupos, perm.todaEmpresa.grupos)}</div><div><span class="legenda">Pessoas</span>${caixas('perm-tp', pessoas, perm.todaEmpresa.pessoas)}</div></div>
      <button class="btn btn-verde btn-pequeno" style="margin:6px 0 14px">Salvar permissões</button></form>`;
  $('perm-qw').onsubmit = async ev => {
    ev.preventDefault();
    try {
      await api('/api/admin/quick-wins-permissoes', { metodo: 'PUT', corpo: { responsaveis: $('perm-resp').checked, grupos: marcados('perm-grupos'), pessoas: marcados('perm-pessoas'),
        todaEmpresa: { grupos: marcados('perm-tg'), pessoas: marcados('perm-tp') } } });
      toast('Permissões salvas.');
    } catch (e) { falhar(e); }
  };
}

// ---------------------------------------------------------------- Modelos de IA
const NOMES_CAP = { geral: 'Geral', raciocinio: 'Raciocínio', programacao: 'Programação', precisao: 'Precisão', leitura_longa: 'Leitura longa' };
const NIVEL_CLASSE = { rapido: 1, equilibrado: 2, avancado: 3 };
function editorCapacidades(x) {
  const c = x.capacidades || {}, base = NIVEL_CLASSE[x.perfil] || 1;
  const resumo = Object.keys(c).length ? Object.entries(c).map(([k, v]) => `${NOMES_CAP[k]} ${v}`).join(', ') : `da classe (${base})`;
  return `<details><summary class="dica" style="cursor:pointer">${esc(resumo)}</summary><div class="duas-col" style="margin-top:6px">${Object.entries(NOMES_CAP).map(([k, n]) => `<label class="dica">${n}
    <select data-cap="${esc(x.id)}" data-dim="${k}"><option value="">da classe (${base})</option>${[1, 2, 3].map(v => `<option value="${v}" ${c[k] === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label>`).join('')}</div></details>`;
}
async function abaModelos() {
  const [m, { grupos }, { areas }, gov, sig] = await Promise.all([api('/api/admin/modelos'), api('/api/admin/grupos'), api('/api/admin/areas'), api('/api/admin/governanca'), api('/api/admin/sigilo')]);
  const cfg = m.config;
  const liberados = m.modelos.filter(x => x.liberado);
  const homologados = liberados.filter(x => x.homologado);
  const opcao = (lista, sel, vazio = '') => `${vazio ? `<option value="">${vazio}</option>` : ''}${lista.map(x => `<option value="${esc(x.id)}" ${x.id === sel ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}`;
  const padrao = m.modelos.find(x => x.id === m.homologadoPadrao);
  const acesso = p => { const a = cfg.acessoPerfis[p] || {}; return `<div class="editor"><b>${PERFIS[p]}</b>
    <label class="opcoes"><span><input type="checkbox" id="todos-${p}" ${a.todos ? 'checked' : ''}> Todas as pessoas</span></label>
    <div class="duas-col"><div><span class="legenda">Grupos</span>${caixas(`ac-g-${p}`, grupos, a.grupos || [])}</div><div><span class="legenda">Áreas</span>${caixas(`ac-a-${p}`, areas, a.areas || [])}</div></div></div>`; };
  const recomendado = gov.modo !== 'manual';
  const cartaoGov = `<div class="editor" id="governanca"><span class="editor-titulo">Como a empresa usa a IA</span>
    <p class="editor-desc">${esc(gov.valeSempre)}</p>
    <div class="escolhas" role="radiogroup" aria-label="Como a empresa usa a IA">
      <label class="escolha"><input type="radio" name="gov" value="recomendado" ${recomendado ? 'checked' : ''}>
        <span class="escolha-titulo">Seguir recomendações da GreenIA <span class="selo-recomendado">Recomendado</span></span>
        <span class="escolha-desc">A GreenIA escolhe e mantém os recursos de cada nível. Não é preciso entender de modelos.</span></label>
      <label class="escolha"><input type="radio" name="gov" value="manual" ${recomendado ? '' : 'checked'}>
        <span class="escolha-titulo">Configurar manualmente</span>
        <span class="escolha-desc">Você ajusta modelos e acesso abaixo. Qualquer ajuste abaixo passa a empresa para este modo.</span></label>
    </div></div>`;
  $('conteudo').innerHTML = `${cartaoGov}<p class="lead">As pessoas trabalham com classes: Rápido, Equilibrado e Avançado. Cada nível pode reunir vários modelos. A GreenIA escolhe entre os liberados conforme a tarefa, a capacidade, o contexto, o consumo, as regras de dados e o desempenho observado quando há amostra suficiente. No Automático, ela também escolhe o nível adequado. O modelo padrão serve como preferência, sem fixar todas as respostas nele.</p>
    <div class="tabela-rolagem"><table class="tabela tabela-empilha"><thead><tr><th>Classe</th><th>Modelos do nível</th><th>Alternativa se falhar</th><th>Consumo por conversa típica</th><th>Quem usa no dia a dia</th></tr></thead><tbody>
      ${Object.entries(PERFIS).map(([k, v]) => { const x = m.modelos.find(y => y.id === cfg.padroes[k]); const r = x && m.modelos.find(y => y.id === x.reserva); const a = cfg.acessoPerfis[k] || {}; const pool = liberados.filter(y => y.perfil === k && y.noCatalogo);
        return `<tr><td data-r="Classe"><b>${v}</b></td><td data-r="Modelos do nível"><b>${pool.length} ${pool.length === 1 ? 'modelo disponível' : 'modelos disponíveis'}</b><br><span class="dica">${pool.map(y => esc(y.nome)).join(' · ') || 'Nenhum modelo disponível'}${x ? `<br>Preferência: ${esc(x.nome)}` : ''}</span></td>
          <td data-r="Reserva">${r ? esc(r.nome) : pool.length > 1 ? '<span class="dica">Seleção automática no mesmo nível, quando elegível. Em sigilo, nova conferência das regras.</span>' : '<span class="dica">Sem alternativa no nível</span>'}</td><td data-r="Consumo">${x ? fmtCusto(x.custoConversa, { conversa: true }) : '—'}</td>
          <td data-r="Quem usa">${k === 'rapido' || a.todos ? 'Todas as pessoas' : (a.grupos || []).length + (a.areas || []).length ? 'Grupos e áreas escolhidos' : 'Só pelo quick win'}</td></tr>`; }).join('')}
    </tbody></table></div>
    <p class="dica">O consumo depende do modelo selecionado; a estimativa acima é do modelo de preferência. Configure modelos e capacidades no catálogo abaixo. O roteamento registra a escolha e suas alternativas, sem guardar o conteúdo do pedido.</p>
    <h3>Catálogo técnico</h3>
    ${!sig.ativo ? '<div class="faixa-aviso"><b>Informações sigilosas: desligado.</b> Hoje elas não são enviadas para recursos de IA. Para permitir o processamento com guardrails de proteção, ligue a opção em <a href="#/politicas">Políticas de IA → Informações sigilosas</a>.</div>'
      : padrao ? `<div class="faixa-aviso ok"><b>Informações sigilosas: ligado.</b> Recurso autorizado disponível para todas as pessoas: ${esc(padrao.nome)}. Ninguém precisa escolher.</div>`
      : `<div class="faixa-aviso erro"><b>Informações sigilosas: ligado, mas sem recurso autorizado.</b> Essas conversas são bloqueadas com segurança: nada é enviado e você recebe um aviso. ${recomendado
        ? 'O modo recomendado já está ativo. Solicite ao administrador da plataforma uma rota autorizada para dados sigilosos, com fornecedor definido, não uso para treino e retenção zero comprovados.'
        : 'Verifique com o administrador da plataforma se há uma rota autorizada no modo recomendado, ou homologue um modelo abaixo com fornecedor definido, não uso para treino e retenção zero comprovados.'}</div>`}
    ${m.modelos.filter(x => x.aviso).map(x => `<div class="faixa-aviso atencao">${esc(x.nome)}: ${esc(x.aviso)}</div>`).join('')}
    ${tabela(['Modelo', 'Classe', ...colunasPreco(), '#Contexto', 'Liberado', 'Reserva', 'Dados sigilosos', 'Capacidades'], m.modelos.map(x => `<tr>
      <td style="min-width:190px"><b>${esc(x.nome)}</b><br><span class="dica">${esc(x.id)}</span></td>
      <td><select data-perfil="${esc(x.id)}" aria-label="Perfil de ${esc(x.nome)}">${Object.entries(PERFIS).map(([k, v]) => `<option value="${k}" ${x.perfil === k ? 'selected' : ''}>${v}</option>`).join('')}</select></td>
      ${celulasPreco(x)}<td class="num">${x.contexto ? num(x.contexto) : '—'}</td>
      <td><input type="checkbox" data-liberado="${esc(x.id)}" ${x.liberado ? 'checked' : ''} aria-label="${esc(x.nome)} liberado"></td>
      <td><select data-reserva="${esc(x.id)}" aria-label="Reserva de ${esc(x.nome)}">${opcao(liberados.filter(r => r.id !== x.id && r.perfil === x.perfil), x.reserva, 'sem reserva')}</select></td>
      <td>${x.homologacaoEmpresa ? `<span class="selo">${ICONE.escudo} Homologado pela empresa</span><br><span class="dica">${esc(x.homologacaoEmpresa.fornecedor || '')} · ${esc(x.homologacaoEmpresa.quem || '')} · ${dataHora(x.homologacaoEmpresa.em)}</span><br><button class="btn-texto btn-pequeno" data-retirar="${esc(x.id)}">Retirar</button>` : ''}
        ${x.autorizacaoPlataforma ? `<span class="selo">${ICONE.escudo} Autorizado pela plataforma</span><br>` : ''}
        ${x.liberado && x.dados ? `<span class="dica">Pode receber: ${['conteúdo comum', x.dados.dadosPessoais && 'dados pessoais', x.dados.sensiveis && 'dados sensíveis e confidenciais'].filter(Boolean).join(', ')} · treino: ${esc(x.dados.semTreino)} · retenção zero: ${esc(x.dados.retencaoZero)}${x.dados.regiao ? ` · região: ${esc(x.dados.regiao)}` : ''}</span>
        <details class="atributos"><summary class="dica">Atributos de dados</summary><div class="linha-botoes" style="flex-wrap:wrap;gap:6px;margin-top:6px">
          <label class="dica">Uso para treino <select class="entrada" data-attr="semTreino" data-modelo="${esc(x.id)}">${[['', 'conforme a rota'], ['true', 'não treina (contrato)'], ['false', 'pode treinar']].map(([v, r]) => `<option value="${v}" ${String(x.atributos?.semTreino ?? '') === v ? 'selected' : ''}>${r}</option>`).join('')}</select></label>
          <label class="dica">Dados pessoais <select class="entrada" data-attr="dadosPessoais" data-modelo="${esc(x.id)}">${[['', 'conforme os atributos'], ['permitido', 'permitido'], ['proibido', 'proibido']].map(([v, r]) => `<option value="${v}" ${(x.atributos?.dadosPessoais ?? '') === v ? 'selected' : ''}>${r}</option>`).join('')}</select></label>
          <label class="dica">Região <input class="entrada" data-attr="regiao" data-modelo="${esc(x.id)}" value="${esc(x.atributos?.regiao || '')}" maxlength="60" style="width:120px"></label>
          <button type="button" class="btn btn-linha btn-pequeno" data-salvar-attr="${esc(x.id)}">Salvar atributos</button></div></details><br>` : ''}
        ${x.homologado ? '<span class="dica">Recebe informação sigilosa (guardrails atendidos)</span>' : (x.homologacaoEmpresa || x.autorizacaoPlataforma) ? `<span class="dica">Não recebe informação sigilosa: ${esc((x.sigiloTexto || []).join('; '))}</span>` : ''}
        ${x.homologacaoEmpresa ? '' : x.vetadoPlataforma ? '<span class="dica">Proibido pela plataforma para dados sigilosos</span>' : x.liberado ? `<br><button class="btn btn-linha btn-pequeno" data-homologar="${esc(x.id)}">Homologar</button>` : '<span class="dica">libere antes</span>'}</td>
      <td>${editorCapacidades(x)}</td></tr>`))}
    <p class="dica">Capacidades: por padrão, cada modelo vale o nível da classe dele em tudo. Informe só quando um modelo foge disso (por exemplo, um Equilibrado forte em programação, ou um Avançado fraco em leitura de documentos longos). O roteamento compara essas capacidades com o que cada pedido exige; a classe continua valendo para acesso, plano e quick win.</p>
    <h3>Adicionar do catálogo de modelos</h3>
    <form class="filtros" id="busca-modelo"><div class="campo"><label for="q-modelo">Buscar por nome ou id</label><input class="entrada" id="q-modelo" placeholder="ex.: claude, gemini, gpt"></div><button class="btn btn-linha btn-pequeno">Buscar</button></form>
    <div id="resultado-busca"></div>
    <details><summary class="dica" style="cursor:pointer">Adicionar pelo id, sem o catálogo</summary>
      <form class="filtros" id="add-manual" style="margin-top:10px"><div class="campo"><label for="id-manual">Identificador do modelo</label><input class="entrada" id="id-manual" placeholder="fornecedor/modelo" pattern="[a-z0-9._~-]+/[a-z0-9._:-]+" required></div>
        <div class="campo"><label for="perfil-manual">Perfil</label><select class="entrada" id="perfil-manual">${Object.entries(PERFIS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
        <button class="btn btn-linha btn-pequeno">Adicionar e liberar</button></form></details>
    <form id="cfg-modelos">
      <h3>Modelo de cada classe</h3>
      <div class="duas-col">
        <div class="campo"><label for="pd-chat">Chat</label><select class="entrada" id="pd-chat">${opcao(liberados, cfg.padroes.chat)}</select></div>
        <div class="campo"><label for="pd-homologado">Homologado padrão (conversas sigilosas)</label><select class="entrada" id="pd-homologado">${opcao(homologados, cfg.padroes.homologado, 'o primeiro disponível para todos')}</select></div>
        ${Object.entries(PERFIS).map(([k, v]) => `<div class="campo"><label for="pd-${k}">${v}</label><select class="entrada" id="pd-${k}">${opcao(liberados.filter(x => x.perfil === k), cfg.padroes[k], 'nenhum')}</select></div>`).join('')}
      </div>
      <h3>Quem usa cada classe no dia a dia</h3>
      <p class="dica">${PERFIS.rapido}: todas as pessoas, sempre. No quick win, quem usa pode usar a classe dele mesmo sem acesso a ela no dia a dia.</p>
      ${acesso('equilibrado')}${acesso('avancado')}
      <h3>Classes que podem ser escolhidas em quick win</h3>
      <div class="opcoes">${Object.entries(PERFIS).map(([k, v]) => `<label><input type="checkbox" name="perfis-qw" value="${k}" ${cfg.perfisQuickWin.includes(k) ? 'checked' : ''}> ${v}</label>`).join('')}</div>
      <h3>Privacidade e roteamento</h3>
      <label class="opcoes"><span><input type="checkbox" id="sem-treino" ${cfg.exigirSemTreino ? 'checked' : ''}> Em conversas normais, usar só fornecedores que não treinam com os dados</span></label>
      <p class="dica">Conversas sigilosas sempre usam fornecedor fixado e retenção zero, com esta opção ligada ou não.</p>
      <label class="opcoes"><span><input type="checkbox" id="automatico" ${cfg.automatico ? 'checked' : ''}> Oferecer também o "Automático do serviço de IA" no seletor (o serviço de IA escolhe qualquer modelo do mercado, fora das classes e das regras de roteamento da empresa; nunca recebe informação sigilosa)</span></label>
      <p class="dica">O recomendado é o roteamento da GreenIA, em Modelos → Roteamento: ele escolhe entre os modelos liberados aqui, respeitando acesso, sigilo e plano, e registra o motivo de cada escolha.</p>
      <div class="linha-botoes" style="margin:18px 0"><button class="btn btn-verde">Salvar configuração de modelos</button></div>
    </form>`;

  const salvarModelo = async (id, corpo, msg) => { try { await api(`/api/admin/modelos/${encodeURIComponent(id)}`, { metodo: 'PUT', corpo }); toast(msg); } catch (e) { falhar(e); } abaModelos(); };
  $('conteudo').onchange = ev => {
    const t = ev.target;
    if (t.dataset.perfil) salvarModelo(t.dataset.perfil, { perfil: t.value }, 'Perfil alterado.');
    if (t.dataset.liberado) salvarModelo(t.dataset.liberado, { liberado: t.checked }, t.checked ? 'Modelo liberado.' : 'Modelo retirado da lista liberada.');
    if (t.dataset.reserva) salvarModelo(t.dataset.reserva, { reserva: t.value || null }, 'Reserva salva.');
    if (t.dataset.cap) {
      const caps = Object.fromEntries([...document.querySelectorAll(`[data-cap="${CSS.escape(t.dataset.cap)}"]`)].filter(e => e.value).map(e => [e.dataset.dim, Number(e.value)]));
      salvarModelo(t.dataset.cap, { capacidades: caps }, 'Capacidades salvas.');
    }
    if (t.id === 'sem-treino' && !t.checked && !confirm('Desligar esta opção permite fornecedores que guardam ou treinam com os dados nas conversas normais. A mudança fica no registro de eventos. Continuar?')) t.checked = true;
  };
  document.querySelectorAll('input[name="gov"]').forEach(t => { t.onchange = async () => {
      if (t.value === 'recomendado' && !confirm('Seguir as recomendações troca os ajustes manuais de modelos, níveis e roteamento pelas recomendações da GreenIA. As autorizações para dados sigilosos continuam valendo. Continuar?')) { abaModelos(); return; }
      try { await api('/api/admin/governanca', { metodo: 'PUT', corpo: { modo: t.value } }); toast(t.value === 'recomendado' ? 'A empresa segue as recomendações da GreenIA.' : 'Configuração manual ligada.'); abaModelos(); } catch (e) { falhar(e); }
  }; });
  $('conteudo').onclick = async ev => {
    const t = ev.target.closest('button');
    if (!t) return;
    if (t.dataset.homologar) homologar(m.modelos.find(x => x.id === t.dataset.homologar));
    if (t.dataset.salvarAttr) {
      const id = t.dataset.salvarAttr, v = k => document.querySelector(`[data-attr="${k}"][data-modelo="${CSS.escape(id)}"]`)?.value || '';
      const atributos = { semTreino: v('semTreino') === '' ? null : v('semTreino') === 'true', dadosPessoais: v('dadosPessoais') || null, regiao: v('regiao') || null };
      try { await api(`/api/admin/modelos/${encodeURIComponent(id)}`, { metodo: 'PUT', corpo: { atributos } }); toast('Atributos salvos.'); abaModelos(); } catch (e) { falhar(e); }
    }
    if (t.dataset.retirar && confirm('Retirar a homologação? Conversas sigilosas abertas passam para o homologado padrão, com aviso.')) {
      try { await api(`/api/admin/modelos/${encodeURIComponent(t.dataset.retirar)}/homologar`, { metodo: 'DELETE' }); toast('Homologação retirada. A política ganhou nova versão.'); abaModelos(); } catch (e) { falhar(e); }
    }
    if (t.dataset.liberarCatalogo) {
      const perfil = document.querySelector(`[data-perfil-catalogo="${CSS.escape(t.dataset.liberarCatalogo)}"]`).value;
      salvarModelo(t.dataset.liberarCatalogo, { liberado: true, perfil }, 'Modelo liberado.');
    }
  };
  $('busca-modelo').onsubmit = async ev => {
    ev.preventDefault();
    $('resultado-busca').innerHTML = '<p class="dica">Buscando…</p>';
    const { modelos } = await api(`/api/admin/modelos/catalogo?busca=${encodeURIComponent($('q-modelo').value)}`);
    $('resultado-busca').innerHTML = modelos.length ? tabela(['Modelo', ...colunasPreco(), '#Contexto', 'Perfil', ''], modelos.map(x => `<tr>
      <td><b>${esc(x.nome)}</b><br><span class="dica">${esc(x.id)}</span></td>${celulasPreco(x)}<td class="num">${num(x.contexto)}</td>
      <td><select data-perfil-catalogo="${esc(x.id)}">${Object.entries(PERFIS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></td>
      <td><button class="btn btn-linha btn-pequeno" data-liberar-catalogo="${esc(x.id)}">Liberar</button></td></tr>`))
      : '<div class="faixa-aviso atencao">O catálogo de modelos não respondeu ou não achou nada. Tente de novo em instantes; se continuar, a equipe da plataforma verifica. Dá para adicionar pelo identificador logo abaixo.</div>';
  };
  $('add-manual').onsubmit = ev => { ev.preventDefault(); salvarModelo($('id-manual').value.trim(), { liberado: true, perfil: $('perfil-manual').value }, 'Modelo adicionado e liberado.'); };
  $('cfg-modelos').onsubmit = async ev => {
    ev.preventDefault();
    const ac = p => ({ todos: $(`todos-${p}`).checked, grupos: marcados(`ac-g-${p}`), areas: marcados(`ac-a-${p}`) });
    try {
      await api('/api/admin/modelos-config', { metodo: 'PUT', corpo: {
        padroes: { chat: $('pd-chat').value, homologado: $('pd-homologado').value || null, rapido: $('pd-rapido').value || null, equilibrado: $('pd-equilibrado').value || null, avancado: $('pd-avancado').value || null },
        acessoPerfis: { equilibrado: ac('equilibrado'), avancado: ac('avancado') },
        perfisQuickWin: [...document.querySelectorAll('input[name=perfis-qw]:checked')].map(i => i.value),
        exigirSemTreino: $('sem-treino').checked, automatico: $('automatico').checked } });
      toast('Configuração salva.'); abaModelos();
    } catch (e) { falhar(e); }
  };
}

function homologar(modelo) {
  $('modal').innerHTML = `<div class="modal-fundo" id="fundo-h"><form class="modal" role="dialog" aria-modal="true" aria-labelledby="t-h" id="form-h">
    <div class="modal-topo"><div class="rotulo">Homologar para dados sigilosos</div><button type="button" class="icone-btn" id="fechar-h" aria-label="Fechar">${ICONE.fechar}</button></div>
    <h2 id="t-h">${esc(modelo.nome)}</h2>
    <div class="campo"><label for="h-forn">Fornecedor fixado</label><input class="entrada" id="h-forn" required placeholder="ex.: google-vertex, amazon-bedrock, azure">
      <span class="ajuda">Use o nome do fornecedor como aparece na lista de fornecedores do modelo. As chamadas sigilosas vão só para ele, sem cair para outro.</span></div>
    <label class="opcoes"><span><input type="checkbox" id="h-treino" required> Conferi que este fornecedor não treina com os dados</span></label>
    <label class="opcoes"><span><input type="checkbox" id="h-zdr" required> Conferi que este fornecedor tem retenção zero (não guarda os dados)</span></label>
    <div class="campo" style="margin-top:12px"><label for="h-just">Justificativa</label><textarea class="entrada" id="h-just" required minlength="10" placeholder="Onde conferiu, contrato, data da verificação"></textarea></div>
    <p class="msg-erro oculto" id="h-erro" role="alert"></p>
    <div class="linha-botoes"><button class="btn btn-verde">Homologar</button><button type="button" class="btn-texto" id="cancelar-h">Cancelar</button></div>
    <p class="dica">Fica registrado quem homologou, a data, o fornecedor e a justificativa. A política ganha nova versão.</p></form></div>`;
  const fechar = () => { $('modal').innerHTML = ''; };
  $('fechar-h').onclick = fechar; $('cancelar-h').onclick = fechar;
  $('h-forn').focus();
  $('form-h').onsubmit = async ev => {
    ev.preventDefault();
    try {
      await api(`/api/admin/modelos/${encodeURIComponent(modelo.id)}/homologar`, { metodo: 'POST', corpo: { fornecedor: $('h-forn').value.trim(), semTreino: $('h-treino').checked, retencaoZero: $('h-zdr').checked, justificativa: $('h-just').value } });
      fechar(); toast('Modelo homologado. A política ganhou nova versão.'); abaModelos();
    } catch (e) { $('h-erro').textContent = e.message; $('h-erro').classList.remove('oculto'); }
  };
}

// ---------------------------------------------------------------- Política
async function abaPolitica() {
  const [p, v] = await Promise.all([api('/api/politica'), api('/api/admin/politica/versoes')]);
  $('conteudo').innerHTML = `<p class="lead">O texto é da empresa. A plataforma acrescenta no fim a seção sobre dados sigilosos, gerada da configuração atual. A cada nova versão, as pessoas registram ciência no próximo acesso.</p>
    <div class="faixa-aviso ok">Versão ${p.versao}, de ${dataHora(p.atualizada_em)}. Ciência registrada por ${v.versoes[0]?.ciencias ?? 0} de ${v.pessoas} pessoas ativas.</div>
    <form id="form-pol"><div class="campo"><label for="pol-texto">Texto da empresa (títulos com ##, listas com -)</label><textarea class="entrada" id="pol-texto" rows="16">${esc(p.texto)}</textarea></div>
      <div class="linha-botoes"><button class="btn btn-verde">Publicar nova versão</button><a class="btn-texto" href="/politica" target="_blank">Ver como as pessoas veem</a></div></form>
    <h3>Seção automática (não editável)</h3>
    <div class="bolha-ia">${renderizar(p.secao).html}</div>
    <h3>Versões</h3>
    ${tabela(['Versão', 'Publicada em', 'Por', '#Ciências'], v.versoes.map(x => `<tr><td>${x.versao}</td><td>${dataHora(x.criado_em)}</td><td>${esc(x.por || (x.versao === 1 ? 'instalação (texto padrão)' : 'automática (mudança de configuração)'))}</td><td class="num">${x.ciencias} de ${v.pessoas}</td></tr>`))}`;
  $('form-pol').onsubmit = async ev => {
    ev.preventDefault();
    if (!confirm('Publicar uma nova versão? Todas as pessoas vão registrar ciência de novo no próximo acesso.')) return;
    try { await api('/api/admin/politica', { metodo: 'PUT', corpo: { texto: $('pol-texto').value } }); toast('Nova versão publicada.'); abaPolitica(); } catch (e) { falhar(e); }
  };
}

// ---------------------------------------------------------------- Uso e custo
async function abaUso(mes = new Date().toISOString().slice(0, 7)) {
  const u = await api(`/api/admin/uso?mes=${mes}`);
  const t = u.totais;
  const tipo = k => u.porTipo.find(x => x.tipo === k) || { conversas: 0, custo: 0 };
  const col = emCreditos() ? '#Créditos' : '#Custo';
  const linhas = (lista, rotulo) => lista.map(x => `<tr><td>${rotulo(x)}</td><td class="num">${num(x.conversas)}</td><td class="num">${num(x.respostas)}</td><td class="num">${us(x.custo)}</td></tr>`);
  $('conteudo').innerHTML = `${await blocoPlano(u.pacotes)}<p class="lead">${emCreditos() ? 'Créditos consumidos em cada resposta, conforme o modelo e o tamanho do pedido.' : 'Custo real informado pelo serviço de IA em cada resposta.'} Testes de quick win aparecem à parte: ficam fora dos recortes abaixo, mas consomem créditos do plano.</p>
    <div class="filtros"><div class="campo"><label for="mes">Mês</label><input class="entrada" type="month" id="mes" value="${u.mes}"></div>
      <a class="btn btn-linha btn-pequeno" href="/api/admin/uso?mes=${u.mes}&formato=csv">Baixar CSV</a></div>
    <div class="indicadores">
      <div class="indicador"><span>${emCreditos() ? 'Créditos usados' : 'Custo de IA'}</span><b>${us(t.custo)}</b></div>
      <div class="indicador"><span>Conversas</span><b>${num(t.conversas)}</b><small>${num(t.respostas)} respostas</small></div>
      <div class="indicador"><span>Pessoas que usaram</span><b>${num(t.pessoas)}</b></div>
      <div class="indicador"><span>Economia com cache</span><b>${us(t.economia)}</b></div>
      <div class="indicador"><span>Tempo médio de resposta</span><b>${(t.ms / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} s</b></div>
      <div class="indicador"><span>Conversas normais</span><b>${num(tipo('normal').conversas)}</b><small>${us(tipo('normal').custo)}</small></div>
      <div class="indicador"><span>Conversas sigilosas</span><b>${num(tipo('sigilosa').conversas)}</b><small>${us(tipo('sigilosa').custo)}</small></div>
      ${u.testes?.respostas ? `<div class="indicador"><span>Testes de quick win</span><b>${us(u.testes.custo)}</b><small>${num(u.testes.conversas)} testes · contam no plano</small></div>` : ''}
    </div>
    <h3>Tendência</h3><p class="dica">Seis meses até o mês escolhido.</p>
    ${barrasMes(u.tendencia, u.mes)}
    <h3>Por classe</h3><p class="dica">A classe pedida em cada resposta. Rápido para o dia a dia, Avançado para análises longas.</p>
    ${tabela(['Classe', '#Conversas', '#Respostas', col], linhas(u.porClasse, x => esc(NOME_CLASSE[x.classe] || 'Outro')))}
    <h3>Por área</h3><p class="dica">Quick wins contam nas áreas deles; o chat, nas áreas de quem usou. Quem está em várias áreas conta em cada uma.</p>
    ${tabela(['Área', '#Conversas', '#Respostas', col], linhas(u.porArea, x => esc(x.area)))}
    <h3>Por quick win</h3><p class="dica">Cada conversa iniciada num quick win é uma execução. Sem avaliação: execuções em que ninguém disse se a resposta serviu.</p>
    ${tabela(['Quick win', '#Execuções', emCreditos() ? '#Créditos por execução' : '#Custo por execução', '#Sem avaliação', col],
      u.porQuickWin.map(x => `<tr><td>${x.id ? `<a href="#/qw/${x.id}">${esc(x.quick_win)}</a>` : esc(x.quick_win)}</td><td class="num">${num(x.execucoes)}</td><td class="num">${x.id ? us(x.custoPorExecucao) : '–'}</td><td class="num">${x.id ? num(x.semAvaliacao) : '–'}</td><td class="num">${us(x.custo)}</td></tr>`))}
    <h3>Por pessoa</h3>${tabela(['Pessoa', '#Conversas', '#Respostas', col], linhas(u.porPessoa, x => `${esc(x.nome)} <span class="dica">${esc(x.email)}</span>`))}
    <h3>Por modelo</h3>${tabela(['Modelo que respondeu', '#Conversas', '#Respostas', col], linhas(u.porModelo, x => `${esc(x.modelo)}${x.fornecedor ? ` <span class="dica">via ${esc(x.fornecedor)}</span>` : ''}`))}`;
  ligarVisao('uso',$('mes').closest('.filtros'),()=>({mes:$('mes').value}),v=>{if(/^\d{4}-\d{2}$/.test(v.mes))abaUso(v.mes);});
  $('mes').onchange = ev => abaUso(ev.target.value);
}

// ---------------------------------------------------------------- Plano (empresa com plano contratado)
const dataBr = iso => new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR');
const NOME_CLASSE = { rapido: 'Rápido', equilibrado: 'Equilibrado', avancado: 'Avançado' };
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
  let html = `<h3 style="margin-top:0">Plano</h3>
    <div class="indicadores">
      <div class="indicador"><span>Créditos do mês</span><b>${p.ilimitado ? 'Ilimitado' : num(p.creditos)}</b></div>
      <div class="indicador"><span>Usados</span><b>${num(Math.round(p.usados))}</b><small>${p.ilimitado ? 'sem limite no plano' : `${p.percentual}% do plano`}</small></div>
      ${p.pacoteDisponivel > 0 ? `<div class="indicador"><span>Créditos adicionais disponíveis</span><b>${num(Math.round(p.pacoteDisponivel))}</b></div>` : ''}
      <div class="indicador"><span>Renovação</span><b>${dataBr(p.renova)}</b></div>
    </div>
    ${p.ilimitado ? '' : `<div class="barra" role="progressbar" aria-label="Créditos do plano usados" aria-valuenow="${p.percentual}" aria-valuemin="0" aria-valuemax="100"><span style="width:${p.percentual}%"></span></div>`}
    <p class="dica">Os créditos do plano renovam todo dia 1. ${p.fase === 'reserva' || p.fase === 'esgotado' ? esc(p.mensagem) : 'Ao atingir o limite contratado, a GreenIA pode atender solicitações elegíveis na classe Rápido, dentro da reserva operacional do plano. Esgotada a reserva, novas mensagens pausam até a renovação ou a liberação de um Capacity Pack.'}</p>`;
  if (pacotes.length) html += `<h3>Créditos adicionais (Capacity Packs)</h3><p class="dica">Usados depois dos créditos do plano, do mais antigo para o mais novo. Sem validade, ficam até serem usados.</p>
    ${tabela(['Liberado em', 'Tipo', '#Créditos', 'Validade', 'Origem', 'Observação'], pacotes.map(x => `<tr><td data-r="Liberado em">${dataBr(x.em.slice(0, 10))}</td><td data-r="Tipo">${{ capacity_pack: 'Capacity Pack', pacote_legado_10000: 'Pacote adicional', cortesia: 'Cortesia' }[x.produto] || 'Créditos adicionais'}</td><td class="num" data-r="Créditos">${num(x.creditos)}</td>
      <td data-r="Validade">${x.validade ? dataBr(x.validade) : 'sem validade'}</td><td data-r="Origem">${ORIGEM[x.origem] || esc(x.origem)}</td><td data-r="Observação">${esc(x.observacao) || '<span class="dica">–</span>'}</td></tr>`))}`;
  return html;
}
// ---------------------------------------------------------------- Eventos
async function abaEventos(filtro = {}, pagina = 0) {
  const q = new URLSearchParams(Object.entries(filtro).filter(([, v]) => v));
  const [d, { problemas }] = await Promise.all([api(`/api/admin/eventos?${q}&pagina=${pagina}`), api('/api/admin/problemas')]);
  const abertos = problemas.filter(p => !p.resolvido).length;
  $('conteudo').innerHTML = `<p class="lead">${abertos ? `${abertos} em aberto.` : 'Nenhum problema em aberto.'} Cada um também chega por email.</p>
    ${tabela(['Quando', 'Pessoa', 'Tipo', 'Descrição', 'Resolvido'], problemas.map(p => `<tr><td style="white-space:nowrap">${dataHora(p.em)}</td><td>${esc(p.nome || '')}<br><span class="dica">${esc(p.email || '')}</span></td><td>${esc(p.tipo)}</td>
      <td style="white-space:pre-wrap;word-break:break-word">${esc(p.descricao)}</td><td><input type="checkbox" data-problema="${p.id}" ${p.resolvido ? 'checked' : ''} aria-label="Resolvido"></td></tr>`), 'Ninguém reportou problema.')}
    <h2 style="margin-top:32px">Eventos</h2>
    <p class="lead">Registro só de inclusão: logins, mudanças de configuração, uso (sem conteúdo), bloqueios, conversas sigilosas, exclusões.</p>
    <form class="filtros" id="filtro-ev">
      <div class="campo"><label for="ev-tipo">Tipo</label><select class="entrada" id="ev-tipo"><option value="">Todos</option>${d.tipos.map(t => `<option ${t === filtro.tipo ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></div>
      <div class="campo"><label for="ev-pessoa">Pessoa (email)</label><input class="entrada" id="ev-pessoa" value="${esc(filtro.pessoa || '')}"></div>
      <div class="campo"><label for="ev-de">De</label><input class="entrada" type="date" id="ev-de" value="${esc(filtro.de || '')}"></div>
      <div class="campo"><label for="ev-ate">Até</label><input class="entrada" type="date" id="ev-ate" value="${esc(filtro.ate || '')}"></div>
      <button class="btn btn-linha btn-pequeno">Filtrar</button>
      <a class="btn btn-linha btn-pequeno" href="/api/admin/eventos?${q}&formato=csv">Baixar CSV</a></form>
    <p class="dica">${num(d.total)} eventos.</p>
    ${tabela(['Quando', 'Tipo', 'Pessoa', 'Detalhes'], d.eventos.map(e => `<tr><td style="white-space:nowrap">${dataHora(e.em)}</td><td>${esc(e.tipo)}</td><td>${esc(e.pessoa || '—')}</td>
      <td>${detalheAuditoria(e)}</td></tr>`), 'Nenhum evento com esses filtros.')}
    <div class="linha-botoes" style="margin-top:12px">${pagina > 0 ? '<button class="btn btn-linha btn-pequeno" id="ev-ant">Anteriores</button>' : ''}${(pagina + 1) * 100 < d.total ? '<button class="btn btn-linha btn-pequeno" id="ev-prox">Mais antigos</button>' : ''}</div>`;
  const ler = () => ({ tipo: $('ev-tipo').value, pessoa: $('ev-pessoa').value, de: $('ev-de').value, ate: $('ev-ate').value });
  ligarVisao('atividade',$('filtro-ev').parentElement,ler,v=>abaEventos(v));
  $('filtro-ev').onsubmit = ev => { ev.preventDefault(); abaEventos(ler()); };
  if ($('ev-ant')) $('ev-ant').onclick = () => abaEventos(filtro, pagina - 1);
  if ($('ev-prox')) $('ev-prox').onclick = () => abaEventos(filtro, pagina + 1);
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
  const caixa = (n, titulo, porque, corpo, extra = '') => `<section class="cfg-caixa"${extra}><div class="cfg-topo"><span class="url-num">${n}</span><div><h3>${titulo}</h3><p class="dica">${porque}</p></div></div>${corpo}</section>`;
  const limite = (id, rotulo, explica, valor, sufixo, passo = 1) => `<div class="cfg-limite"><label class="cfg-liga"><input type="checkbox" data-liga="${id}" ${valor > 0 ? 'checked' : ''}> <span><b>${rotulo}</b><small>${explica}</small></span></label>
    <div class="cfg-valor ${valor > 0 ? '' : 'oculto'}" id="v-${id}"><input class="entrada" type="number" min="1" step="${passo}" id="${id}" value="${valor > 0 ? valor : ''}" inputmode="numeric"><span class="dica">${sufixo}</span></div></div>`;
  $('conteudo').innerHTML = `<form id="form-cfg" class="cfg">
      <p class="lead">Ajustes gerais do ambiente. Cada bloco explica para que serve; o que não for mexido continua como está.</p>
      ${multi ? '<div class="faixa-aviso ok">Nome, logomarca, cores e aviso de privacidade ficam em <a href="#/empresa/marca">Marca e identidade visual</a>.</div>' : ''}
      ${multi ? '' : caixa('·', 'Empresa', 'Como a empresa aparece para as pessoas.', `
        <div class="campo"><label for="c-empresa">Nome da empresa</label><input class="entrada" id="c-empresa" value="${esc(c.empresa)}" required maxlength="80"></div>
        <div class="campo"><span class="legenda">Logo</span><div class="linha-botoes"><span id="c-logo-prev">${logo ? `<img src="${esc(logo)}" alt="Logo atual" style="max-height:48px">` : '<span class="dica">Sem logo.</span>'}</span>
          <label class="btn btn-linha btn-pequeno" style="cursor:pointer">Escolher arquivo<input type="file" id="c-logo" hidden accept=".png,.jpg,.jpeg,.svg"></label><button type="button" class="btn-texto btn-pequeno" id="c-logo-tirar">Remover</button></div>
          <span class="ajuda">PNG, JPG ou SVG, até 200 KB.</span></div>
        <div class="campo"><label for="c-cor">Cor de marca (botões principais)</label><div class="linha-botoes"><input type="color" id="c-cor" value="${esc(c.corMarca || '#1B7950')}">
          <label class="dica"><input type="checkbox" id="c-cor-usar" ${c.corMarca ? 'checked' : ''}> usar a cor de marca</label></div>
          <span class="ajuda">Usada nos botões (com texto branco por cima) e nos links. Precisa ser escura o bastante para o texto ser lido.</span><div class="aviso-cor" id="c-contraste" aria-live="polite"></div></div>
        <div class="campo"><label for="c-priv">Aviso de privacidade (aparece no login e no chat)</label><textarea class="entrada" id="c-priv" rows="2">${esc(c.privacyNote)}</textarea></div>`)}
      ${caixa(1, 'Quem pode entrar', multi ? 'Pessoas com email destes domínios entram sozinhas, como membros. Quem tem outro email só entra se for convidado em <a href="#/empresa/usuarios">Usuários</a>.' : 'Só entram pessoas com email destes domínios.', `
        <div class="campo"><label for="c-dom-novo">Domínios de email da empresa</label>
          <div class="chips-entrada" id="c-chips"></div>
          <div class="linha-botoes"><input class="entrada" id="c-dom-novo" placeholder="suaempresa.com.br" autocomplete="off" inputmode="url" style="max-width:320px"><button type="button" class="btn btn-linha btn-pequeno" id="c-dom-add">Adicionar</button></div>
          <span class="ajuda">O domínio é o que vem depois do @. Exemplo: para <b>ana@suaempresa.com.br</b>, adicione <b>suaempresa.com.br</b>.${multi ? ' Sem nenhum domínio, só entra quem for convidado.' : ''}</span></div>`)}
      ${caixa(2, 'Envio de emails', 'A GreenIA manda por email o código de acesso, convites e avisos de uso. ' + (multi ? 'Se não configurar nada, os emails saem pelo servidor da plataforma, e isso já funciona.' : 'Sem isso, os códigos de acesso não chegam.'), `
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
      ${caixa(3, 'Por quanto tempo guardar as conversas', 'Conversas paradas por mais tempo que isso são apagadas sozinhas. Quanto menor, menos dados guardados.', `
        <div class="chips-opcoes" role="radiogroup" aria-label="Retenção">${RETENCOES.map(([d, n]) => `<label class="chip-opcao"><input type="radio" name="ret" value="${d}" ${c.retencaoDias === d ? 'checked' : ''}><span>${n}</span></label>`).join('')}
          <label class="chip-opcao"><input type="radio" name="ret" value="outro" ${RETENCOES.some(([d]) => d === c.retencaoDias) ? '' : 'checked'}><span>Outro</span></label></div>
        <div class="campo ${RETENCOES.some(([d]) => d === c.retencaoDias) ? 'oculto' : ''}" id="c-ret-outro"><label for="c-ret">Dias sem uso</label><input class="entrada" type="number" id="c-ret" min="1" max="3650" value="${c.retencaoDias}" style="max-width:160px"></div>`)}
      ${caixa(4, 'Limites de uso', `Opcional. Servem para evitar exageros; ${emCreditos() ? 'valem dentro do plano contratado' : 'valem sobre o custo real da IA'}. Deixe desmarcado para não limitar.`, `
        ${limite('c-teto', 'Limite do mês para a empresa toda', 'Quando a empresa inteira chegar a esse total no mês, as novas mensagens ficam bloqueadas até o mês seguinte.', c.tetoMensal, un, emCreditos() ? 1 : 0.01)}
        ${limite('c-teto-p', 'Limite do mês por pessoa', 'Cada pessoa pode usar até esse total no mês. Útil para ninguém consumir o plano sozinho.', c.tetoPessoaMensal, un, emCreditos() ? 1 : 0.01)}
        ${limite('c-dia', 'Limite de respostas por pessoa por dia', 'Quantas respostas da IA cada pessoa pode pedir por dia.', c.limiteDiarioPessoa, 'respostas por dia')}`)}
      ${caixa(5, 'Identidade visual das peças', 'Apresentações, páginas executivas, infográficos e outras peças que os Quick Wins produzem seguem estas regras. Tudo é opcional: sem regra, a GreenIA usa um visual neutro e profissional. O logo e a cor principal vêm ' + (multi ? 'de <a href="#/empresa/marca">Marca e identidade visual</a>.' : 'do bloco Empresa, acima.'), `
        <div class="grade-2">${CORES_VISUAIS.map(([k, r]) => `<div class="campo"><span class="legenda">${r}</span><div class="linha-botoes"><input type="color" id="iv-${k}" value="${esc(iv.cores?.[k] || PADRAO_VISUAL[k])}" aria-label="${r}">
          <label class="dica"><input type="checkbox" data-iv-usar="${k}" ${iv.cores?.[k] ? 'checked' : ''}> regra da marca</label></div></div>`).join('')}</div>
        <div class="grade-2"><div class="campo"><label for="iv-tit">Fonte dos títulos</label><select class="entrada" id="iv-tit"><option value="">Padrão</option><option value="sans" ${iv.tipografia?.titulos === 'sans' ? 'selected' : ''}>Sem serifa (moderna)</option><option value="serif" ${iv.tipografia?.titulos === 'serif' ? 'selected' : ''}>Com serifa (editorial)</option></select></div>
          <div class="campo"><label for="iv-cantos">Cantos</label><select class="entrada" id="iv-cantos"><option value="">Padrão</option>${[[0, 'Retos'], [6, 'Suaves'], [14, 'Arredondados']].map(([v, r]) => `<option value="${v}" ${iv.cantos === v ? 'selected' : ''}>${r}</option>`).join('')}</select></div></div>
        <div class="campo"><span class="legenda">Logo para fundo escuro (versão clara)</span><div class="linha-botoes"><span id="iv-logo-prev">${iv.logoClaro ? `<img src="${esc(iv.logoClaro)}" alt="Logo claro" style="max-height:40px;background:#1F3A5F;padding:4px;border-radius:4px">` : '<span class="dica">Sem versão clara: nas capas escuras o logo vai num selo claro.</span>'}</span>
          <label class="btn btn-linha btn-pequeno" style="cursor:pointer">Escolher arquivo<input type="file" id="iv-logo" hidden accept=".png,.jpg,.jpeg,.svg,.webp"></label><button type="button" class="btn-texto btn-pequeno" id="iv-logo-tirar">Remover</button></div></div>
        <div class="campo"><label for="iv-proibidas">Cores que nunca podem ser usadas</label><input class="entrada" id="iv-proibidas" placeholder="#FF0000, #00FF00" value="${esc((iv.coresProibidas || []).join(', '))}"><span class="ajuda">Códigos de cor separados por vírgula.</span></div>
        <div class="campo"><label for="iv-regras">Regras visuais e tom (uma por linha)</label><textarea class="entrada" id="iv-regras" rows="3" placeholder="Ex.: sempre em português formal; destacar segurança primeiro">${esc([...(iv.regras || []), ...(iv.tom ? [`Tom: ${iv.tom}`] : [])].join('\n'))}</textarea></div>
        <label class="opcoes"><span><input type="checkbox" id="iv-imagens" ${c.producaoVisual?.imagens?.ativa ? 'checked' : ''}> Permitir gerar imagens ilustrativas para as peças. Ligado, só o tema da peça (nunca o conteúdo, números ou nomes) vai para o modelo de imagem; não roda em conversa sigilosa, em área com proteção reforçada, com dado que a política manda proteger nem na reserva do plano. Desligado, as peças usam tipografia, formas, gráficos e as imagens que vocês enviarem.</span></label>`)}
      ${caixa(6, 'Integrações com sistemas da empresa', 'Permite que os Quick Wins leiam dados dos sistemas da empresa (CRM, ERP e outros) e, com aprovação, gravem resultados neles.', `
        <label class="opcoes"><span><input type="checkbox" id="cfg-integracoes" ${c.integracoes?.ativa ? 'checked' : ''}> Ligar as integrações para toda a empresa. Ligado, aparece em Administração o menu Integrações, onde cada sistema é cadastrado, testado e aprovado antes de ser usado; credenciais ficam guardadas cifradas e nunca vão para a IA, e gravações dependem de aprovação. Desligado, o menu some e os Quick Wins funcionam normalmente, sem acessar sistemas; nada do que já foi cadastrado é apagado.</span></label>`, ' id="cfg-bloco-integracoes"')}
      <div class="cfg-salvar"><span class="dica" id="c-sujo"></span><button class="btn btn-verde">Salvar configurações</button></div>
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
  const sujo = () => { $('c-sujo').textContent = 'Há alterações não salvas.'; };
  $('form-cfg').addEventListener('input', sujo);

  const salvar = async () => {
    await api('/api/admin/config', { metodo: 'PUT', corpo: {
      ...(multi ? {} : { empresa: $('c-empresa').value, logo, corMarca: $('c-cor-usar').checked ? $('c-cor').value : '', privacyNote: $('c-priv').value }),
      dominios, smtp: lerEmail(), retencaoDias: Number($('c-ret').value),
      tetoMensal: valorLimite('c-teto'), tetoPessoaMensal: valorLimite('c-teto-p'), limiteDiarioPessoa: valorLimite('c-dia'),
      identidadeVisual: lerIdentidade(), producaoVisual: { imagens: { ativa: $('iv-imagens').checked } },
      // Integrações: liga ou desliga para a empresa toda (sem lista de pessoas).
      integracoes: { ativa: $('cfg-integracoes').checked, pessoas: [] } } });
    $('c-sujo').textContent = '';
    // O menu Integrações aparece ou some na hora, conforme o servidor (que também respeita a chave de emergência).
    const eu = await api('/api/eu').catch(() => null);
    if (eu) { E.integracoes = !!eu.integracoes; desenharLateral(); }
  };
  $('c-smtp-teste').onclick = ev => ocupado(ev.currentTarget, async () => {
    $('c-teste-res').textContent = '';
    try { await salvar(); const r = await api('/api/admin/smtp/teste', { metodo: 'POST' }); $('c-teste-res').textContent = r.via === 'empresa' ? `Enviado pelo email da empresa para ${r.para}. Confira a caixa de entrada e o spam.` : `Enviado pelo email da plataforma para ${r.para} (a empresa ainda não tem email próprio configurado).`; toast('Email de teste enviado.'); }
    catch (e) { $('c-teste-res').textContent = e.message; falhar(e); }
  });
  $('form-cfg').onsubmit = async ev => {
    ev.preventDefault();
    await ocupado(ev.submitter, async () => { try { await salvar(); toast('Configurações salvas.'); abaConfig(); } catch (e) { falhar(e); } });
  };
}

// ---------------------------------------------------------------- Conhecimento
// Para todos: que conhecimento a IA pode usar. Para quem gere áreas: envio e organização.
async function abaConhecimento() {
  await recarregarBases();
  await (await import('/conhecimento.js')).vistaConhecimento();
}

// ---------------------------------------------------------------- Políticas de IA
// Uma página responde: o que pode ser enviado, por quem, para qual modelo e em qual contexto.
async function abaPoliticas() {
  const [c, m, { areas }, { grupos }, sig] = await Promise.all([api('/api/admin/config'), api('/api/admin/modelos'), api('/api/admin/areas'), api('/api/admin/grupos'), api('/api/admin/sigilo')]);
  const homologados = m.modelos.filter(x => x.liberado && x.homologado);
  const fabricantes = new Set(homologados.map(x => x.id.split('/')[0]));
  const nomes = (ids, lista) => ids.map(id => lista.find(x => x.id === id)?.nome).filter(Boolean).join(', ');
  const quem = p => { const a = m.config.acessoPerfis[p] || {}; return a.todos ? 'Todas as pessoas' : [nomes(a.grupos || [], grupos), nomes(a.areas || [], areas)].filter(Boolean).join(' · ') || 'Ninguém no dia a dia (só pelo quick win)'; };
  $('conteudo').innerHTML = `<p class="lead">As regras que valem para toda conversa: o que pode ser enviado, por quem e em qual contexto. O servidor aplica estas regras antes de qualquer envio, na mensagem e nos anexos.</p>
    <div class="secao-titulo"><h3>Informações sigilosas</h3></div>
    <div class="editor" id="sigilo-politica"><div class="linha-switch">
      <button type="button" class="switch" id="sigilo-ativo" role="switch" aria-checked="${sig.ativo}" aria-labelledby="sigilo-titulo"><span></span></button>
      <label class="ls-titulo" id="sigilo-titulo" for="sigilo-ativo">Permitir processamento de informações sigilosas com guardrails de proteção</label>
      <span class="estado ${sig.ativo ? 'on' : ''}">${sig.ativo ? 'ON' : 'OFF'}</span>
      <p class="ls-desc">Quando ativado, a GreenIA permite o uso de IA com informações sigilosas aplicando automaticamente os guardrails de proteção antes de cada processamento.
        ${sig.ativo ? 'Sem um recurso autorizado disponível, nada é enviado e você é avisado.' : 'Desligado, informações sigilosas não são enviadas para recursos de IA.'}</p>
    </div></div>
    <form id="form-dados"><div class="secao-titulo"><h3>Tipos de dado reconhecidos</h3><span class="dica">Vale para o chat e é o padrão de cada quick win novo</span></div>
      <div class="tabela-rolagem"><table class="tabela tabela-empilha"><thead><tr><th>Tipo de dado</th><th>Regra</th><th>Efeito</th><th>Guardar no histórico</th></tr></thead><tbody>
        ${Object.entries(DADOS).map(([k, v]) => `<tr><td data-r="Tipo"><b>${v}</b></td><td data-r="Regra">${seletorAcao(`d-${k}`, v, c.acoesChat[k])}</td>
          <td data-r="Efeito" class="dica">${EFEITO[c.acoesChat[k]] || EFEITO.bloquear}</td>
          <td data-r="Guardar no histórico"><label class="dica"><input type="checkbox" data-guardar="${k}" ${(c.naoArmazenar || []).includes(k) ? '' : 'checked'}> guardar</label></td></tr>`).join('')}
        <tr><td data-r="Tipo"><b>Senhas, chaves de acesso e outros segredos</b></td><td data-r="Regra">Bloqueados quando reconhecidos</td><td data-r="Efeito" class="dica">Regra de segurança da GreenIA; não depende da opção acima e não pode ser alterada</td></tr>
        <tr><td data-r="Tipo"><b>Informação estratégica sem marcação</b></td><td data-r="Regra">Marcação manual</td><td data-r="Efeito" class="dica">Nomes, cargos, emails e telefones de trabalho são conteúdo normal. Estratégia sem marcação não é adivinhada: a pessoa marca a conversa como sigilosa, ou o documento é marcado como sigiloso</td></tr>
      </tbody></table></div>
      <label class="opcoes" style="margin-top:12px"><span><input type="checkbox" id="protecao-pessoais" ${c.protecaoDadosPessoais !== false ? 'checked' : ''}> Dados pessoais processados normalmente só vão para recursos com modelo definido (não gratuito nem automático) em que o não uso para treino foi declarado pelo admin, comprovado na rota autorizada ou é pedido em cada chamada, e não vão para recursos em que o admin proibiu dados pessoais. O pedido em cada chamada limita o roteamento aos fornecedores que o serviço de acesso a modelos classifica como não coletando os dados, pelas políticas que eles informam: é um filtro, não uma garantia contratual. A conversa não vira sigilosa.</span></label>
      <label class="opcoes" style="margin-top:12px"><span><input type="checkbox" id="pesquisa-web" ${c.pesquisaWeb?.ativa ? 'checked' : ''}> Permitir que Quick Wins pesquisem na internet (por exemplo, "temas em alta"). Ligado, o pedido de pesquisa sai para o serviço de busca do provedor de IA e as fontes aparecem no resultado. A pesquisa não roda em conversa sigilosa, em área com proteção reforçada nem com dado que a política manda proteger. Desligado, esses Quick Wins entregam um resultado parcial, sem pesquisa.</span></label>
      <fieldset class="perfil-publico" style="margin-top:10px;border:0;padding:0"><legend><b>Perfil público para pesquisas na internet</b></legend>
        <p class="dica">Só o que já é público. É o único contexto da empresa que pode ir para a busca na internet: documentos, anexos e instruções internas nunca vão. Em branco, o Quick Win pergunta o mercado quando a pesquisa precisar.</p>
        ${Object.entries(PERFIL_PUBLICO).map(([k, r]) => `<div class="campo"><label for="perfil-${k}">${r}</label><input class="entrada" id="perfil-${k}" maxlength="80" value="${esc(c.pesquisaWeb?.perfil?.[k] || '')}"></div>`).join('')}
      </fieldset>
      <p class="dica">"Guardar no histórico": sem a marca, a mensagem é processada normalmente, mas o conteúdo, os anexos e a resposta não ficam guardados. Poder processar não é o mesmo que poder guardar.</p>
      <div class="linha-botoes" style="margin-top:10px"><button class="btn btn-verde btn-pequeno">Salvar regras de dados</button></div></form>

    <div class="secao-titulo"><h3>Conversas sigilosas</h3><a class="btn-texto btn-pequeno" href="#/modelos">Gerir modelos homologados</a></div>
    ${homologados.length < 2 || fabricantes.size < 2 ? `<div class="faixa-aviso atencao">${homologados.length ? `Há ${homologados.length === 1 ? 'um modelo homologado' : 'modelos homologados de um só fabricante'}.` : 'Nenhum modelo homologado: conversas sigilosas não podem ser enviadas.'} O recomendado são dois modelos homologados, de fabricantes diferentes, para que as conversas sigilosas continuem se um sair do ar.</div>` : ''}
    <div class="tabela-rolagem"><table class="tabela tabela-empilha"><thead><tr><th>Quando uma conversa vira sigilosa</th><th>Situação atual</th></tr></thead><tbody>
      <tr><td data-r="Gatilho">Área com proteção reforçada: conteúdo com marcação de confidencialidade, dado pessoal sensível ou dado de pessoas em processo interno</td><td data-r="Situação">${areas.filter(a => a.sigilosa).map(a => esc(a.nome)).join(', ') || '<span class="dica">nenhuma</span>'}</td></tr>
      <tr><td data-r="Gatilho">Quick win que trata dados sigilosos</td><td data-r="Situação">definido em cada quick win</td></tr>
      <tr><td data-r="Gatilho">Tipo de dado marcado como "Só com proteção"</td><td data-r="Situação">${Object.entries(c.acoesChat).filter(([k, v]) => v === 'proteger' && DADOS[k]).map(([k]) => DADOS[k]).join(', ') || '<span class="dica">nenhum</span>'}</td></tr>
      <tr><td data-r="Gatilho">Documento sigiloso usado na resposta</td><td data-r="Situação">marcado no envio do documento</td></tr>
      <tr><td data-r="Gatilho">Marcação manual pela pessoa</td><td data-r="Situação">sempre disponível no chat</td></tr>
    </tbody></table></div>
    <p class="dica">Conversa sigilosa segue só por recursos que passam em todos os guardrails: autorizados, com o fornecedor fixado, retenção zero e ausência de uso para treino comprovadas. Se o recurso cair, a GreenIA procura outro que passe nos mesmos guardrails; se não houver, nada é enviado.</p>
    ${homologados.length ? `<div class="tabela-rolagem" style="margin-top:10px"><table class="tabela"><thead><tr><th>Modelo homologado</th><th>Classe</th><th>Fornecedor fixado</th><th>Homologado por</th></tr></thead><tbody>
      ${homologados.map(x => `<tr><td>${esc(x.nome)}</td><td>${PERFIS[x.perfil] || ''}</td><td>${esc(x.homologacao?.fornecedor || '')}</td><td>${esc(x.homologacao?.quem || '')} · ${dataHora(x.homologacao?.em)}</td></tr>`).join('')}</tbody></table></div>` : ''}

    <div class="secao-titulo"><h3>Quem usa cada classe de modelo</h3><a class="btn-texto btn-pequeno" href="#/modelos">Alterar</a></div>
    <div class="tabela-rolagem"><table class="tabela tabela-empilha"><thead><tr><th>Classe</th><th>Quem usa no dia a dia</th></tr></thead><tbody>
      <tr><td data-r="Classe"><b>Rápido</b></td><td data-r="Quem">Todas as pessoas</td></tr>
      <tr><td data-r="Classe"><b>Equilibrado</b></td><td data-r="Quem">${esc(quem('equilibrado'))}</td></tr>
      <tr><td data-r="Classe"><b>Avançado</b></td><td data-r="Quem">${esc(quem('avancado'))}</td></tr>
    </tbody></table></div>
    <p class="dica">Dentro de um quick win, quem usa pode usar a classe definida para ele, mesmo sem acesso a ela no dia a dia.</p>

    <div class="secao-titulo"><h3>Fornecedores e retenção</h3><a class="btn-texto btn-pequeno" href="#/configuracoes">Alterar retenção</a></div>
    <div class="tabela-rolagem"><table class="tabela tabela-empilha"><tbody>
      <tr><td data-r="Regra">Conversas normais</td><td data-r="Situação">${m.config.exigirSemTreino ? 'Só fornecedores que não treinam com os dados' : 'Qualquer fornecedor liberado (a exigência de não treinar está desligada)'}</td></tr>
      <tr><td data-r="Regra">Histórico das conversas</td><td data-r="Situação">Guardado nesta instalação e apagado depois de ${c.retencaoDias} dias sem uso</td></tr>
      <tr><td data-r="Regra">Anexos</td><td data-r="Situação">Só o texto extraído fica guardado, junto com a conversa</td></tr>
    </tbody></table></div>`;
  $('sigilo-ativo').onclick = async () => {
    const ativo = !sig.ativo;
    if (ativo && !confirm('Ligar o processamento de informações sigilosas com guardrails de proteção? A GreenIA só usará recursos autorizados que atendem aos guardrails.')) return;
    try { await api('/api/admin/sigilo', { metodo: 'PUT', corpo: { ativo } }); toast(ativo ? 'Processamento protegido ligado.' : 'Processamento de informações sigilosas desligado.'); abaPoliticas(); } catch (e) { falhar(e); }
  };
  $('form-dados').onsubmit = async ev => {
    ev.preventDefault();
    try {
      await api('/api/admin/config', { metodo: 'PUT', corpo: { acoesChat: Object.fromEntries(Object.keys(DADOS).map(k => [k, document.querySelector(`input[name="d-${k}"]:checked`).value])),
        naoArmazenar: Object.keys(DADOS).filter(k => !document.querySelector(`[data-guardar="${k}"]`).checked), protecaoDadosPessoais: $('protecao-pessoais').checked, pesquisaWeb: { ativa: $('pesquisa-web').checked, perfil: Object.fromEntries(Object.keys(PERFIL_PUBLICO).map(k => [k, $(`perfil-${k}`).value])) } } });
      toast('Regras de dados salvas.'); abaPoliticas();
    } catch (e) { falhar(e); }
  };
}

// ---------------------------------------------------------------- Roteamento
const COMPLEXIDADE = { simples: 'Simples', intermediaria: 'Intermediária', complexa: 'Complexa' };
const MODO = { automatico: 'Automático', manual: 'Escolhida pela pessoa', quick_win: 'Definida pelo quick win', padrao: 'Padrão da empresa (roteamento desligado)', externo: 'Automático do serviço de IA' };
const STATUS_CAND = { escolhido: 'escolhido', preterido: 'atendia; menor utilidade', insuficiente: 'capacidade abaixo da exigida', excluido: 'fora pelas regras' };
const MOTIVO_CAND = { capacidade_insuficiente: 'capacidade abaixo da exigida', nao_homologado: 'não homologado (conversa sigilosa)', plano_na_reserva: 'reserva do plano (só Rápido)',
  gratuito_treina_com_dados: 'gratuito: treina com os dados', protecao_insuficiente: 'sem a proteção que o conteúdo exige', sem_acesso_a_classe: 'a pessoa não tem acesso à classe', contexto_insuficiente: 'o conteúdo não cabe na janela' };
const RESULTADO = { respondido: 'respondido', respondido_pela_reserva: 'respondido pela reserva', falha_na_execucao: 'falha na execução', bloqueado: 'bloqueado antes do envio', enviado: 'em andamento' };
const FALLBACK = { abaixo_do_necessario: 'abaixo do necessário (regras ou permissões)', abaixo_do_necessario_por_escolha: 'abaixo do necessário (escolha manual)',
  trocado_por_falta_de_contexto: 'trocado por falta de janela', trocado_pela_reserva_do_plano: 'trocado pela reserva do plano', sem_modelo: 'nenhum modelo permitido' };
const TIPO_TAREFA = { edicao: 'edição e formatação', classificacao: 'classificação', traducao: 'tradução', extracao: 'extração', sintese: 'síntese', redacao: 'redação', analise: 'análise', programacao: 'programação', raciocinio: 'raciocínio', consulta: 'consulta' };
const PREFERENCIAS = [['economia', 'Economia', 'O modelo de menor consumo que atende ao que o pedido exige. Nunca abaixo do necessário.'],
  ['equilibrio', 'Equilíbrio', 'Recomendado: atende ao que o pedido exige e prefere o modelo padrão de cada classe quando custa até cerca de 2 vezes o mais barato.'],
  ['qualidade', 'Qualidade', 'Em tarefas que não são simples, usa uma classe acima do mínimo. Maior consumo, menos risco de resposta fraca.']];
function barrasDist(titulo, dist, nomes) {
  const total = Object.values(dist).reduce((a, b) => a + b, 0);
  const linhas = Object.entries(nomes).filter(([k]) => dist[k]).map(([k, nome]) => { const n = dist[k], pct = Math.round(n / total * 100);
    return `<div class="rt-linha" title="${esc(nome)}: ${num(n)} ${n === 1 ? 'decisão' : 'decisões'} (${pct}%)"><span>${esc(nome)}</span><div class="barra"><span style="width:${pct}%"></span></div><b>${pct}%</b></div>`; });
  return `<div class="or-card"><span class="or-rotulo">${esc(titulo)}</span>${linhas.join('') || '<p class="or-sub">Sem decisões ainda.</p>'}</div>`;
}
async function abaRoteamento() {
  const d = await api('/api/admin/roteamento');
  const c = d.config, r = d.resumo;
  $('conteudo').innerHTML = `<p class="lead">Antes de cada resposta, a GreenIA analisa o pedido e calcula o que ele exige: capacidade (raciocínio, programação, precisão, leitura de grande volume, nova tentativa) e janela de contexto. Sigilo, plano e acesso das pessoas só tiram modelos da lista; entre os que atendem e são permitidos, a escolha pesa consumo, margem de capacidade e o modelo padrão de cada classe, conforme a preferência abaixo. Cada decisão fica registrada com os motivos.</p>
    <form id="cfg-rota" class="editor">
      <label class="opcoes"><span><input type="checkbox" id="rota-ativo" ${c.ativo ? 'checked' : ''}> Roteamento automático ligado (a opção "Automático" é o padrão das conversas)</span></label>
      <p class="dica">Desligado, cada conversa usa a classe do modelo de chat, e a pessoa troca de classe à mão.</p>
      <span class="legenda">Preferência da empresa</span>
      <div class="rt-pref">${PREFERENCIAS.map(([k, n, dica]) => `<label><input type="radio" name="rota-pref" value="${k}" ${c.preferencia === k ? 'checked' : ''}><span><b>${n}</b><small>${dica}</small></span></label>`).join('')}</div>
      <div class="linha-botoes" style="margin-top:12px"><button class="btn btn-verde">Salvar roteamento</button></div>
    </form>
    <h3>Últimos 30 dias</h3>
    <div class="or-grade">
      <div class="or-card"><span class="or-rotulo">Decisões</span><b class="or-numero">${num(r.decisoes)}</b><span class="or-sub">respostas com a escolha registrada</span></div>
      <div class="or-card"><span class="or-rotulo">Consumo realizado</span><b class="or-numero">${fmtCusto(r.consumo.realizado.custo)}</b><span class="or-sub">medido nas respostas${r.realizadoSobreEstimado ? `; a estimativa do roteador acerta ${Math.round(Math.min(r.realizadoSobreEstimado, 1 / r.realizadoSobreEstimado) * 100)}%` : ''}</span></div>
      <div class="or-card destaque"><span class="or-rotulo">Consumo evitado (estimativa)</span><b class="or-numero">${r.consumoEvitadoEstimadoPercentual === null ? '—' : `${r.consumoEvitadoEstimadoPercentual}%`}</b><span class="or-sub">referência hipotética: se tudo fosse para a classe Avançado. Não é economia medida.</span></div>
      <div class="or-card"><span class="or-rotulo">Abaixo do necessário</span><b class="or-numero">${num(r.limitadas + r.abaixoPorEscolha)}</b><span class="or-sub">${num(r.limitadas)} por regras ou permissões, ${num(r.abaixoPorEscolha)} por escolha manual</span></div>
      <div class="or-card"><span class="or-rotulo">Fora do roteador</span><b class="or-numero">${num(r.foraDoRoteador.externo + r.foraDoRoteador.bloqueadas)}</b><span class="or-sub">${num(r.foraDoRoteador.externo)} no Automático do serviço de IA, ${num(r.foraDoRoteador.bloqueadas)} bloqueadas antes do envio</span></div>
    </div>
    <div class="or-grade">${barrasDist('Complexidade dos pedidos', r.porComplexidade, COMPLEXIDADE)}${barrasDist('Classe exigida pelo pedido', r.porNecessaria, PERFIS)}${barrasDist('Classe usada', r.porClasse, PERFIS)}${barrasDist('Como a classe foi definida', r.porModo, MODO)}</div>
    <h3>Classificação dos pedidos</h3>
    <p class="dica">Quanto cada tipo de pedido aparece e como se sai. "Consulta" é o pedido sem tipo reconhecido: se ele for muito frequente ou concentrar "não serviu" e pedidos refeitos, a classificação precisa melhorar.</p>
    ${tabela(['Tipo principal', '#Pedidos', '#% do total', '#Não serviu', '#Refeitos', '#Tipo decidiu a exigência'], r.classificacao.map(c => `<tr><td>${esc(TIPO_TAREFA[c.tipo] || c.tipo)}</td>
      <td class="num">${num(c.n)}</td><td class="num">${c.percentual ?? '—'}%</td><td class="num">${c.naoServiuPercentual == null ? '—' : `${c.naoServiuPercentual}%`}</td>
      <td class="num">${c.refeitoPercentual ?? 0}%</td><td class="num">${c.tipoDecidiuPercentual ?? 0}%</td></tr>`), 'Sem pedidos ainda.')}
    <h3>Tempo de resposta por modelo</h3>
    <p class="dica">Só observação: o tempo não entra na escolha. Primeiro trecho é o que a pessoa sente; total inclui a resposta inteira.</p>
    ${tabela(['Modelo', '#Respostas', '#Primeiro trecho', '#Total'], r.latencia.map(l => `<tr><td>${esc(l.modelo)}</td><td class="num">${num(l.n)}</td>
      <td class="num">${l.primeiroTokenMs == null ? '—' : `${(l.primeiroTokenMs / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} s`}</td><td class="num">${(l.totalMs / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} s</td></tr>`), 'Sem respostas ainda.')}
    <h3>Decisões recentes</h3>
    <p class="dica">Cada registro guarda só critérios, regras e candidatos. O texto das conversas não fica aqui.</p>
    ${tabela(['Quando', 'Pessoa', 'Pedido', 'Exigida', 'Usada', 'Por quê'], d.decisoes.map(x => `<tr>
      <td style="white-space:nowrap">${dataHora(x.em)}<br><span class="dica">${esc(RESULTADO[x.resultado] || x.resultado || '')}</span></td><td>${esc(x.pessoa || '—')}${x.quick_win ? `<br><span class="dica">${esc(x.quick_win)}</span>` : ''}</td>
      <td>${esc(x.tipos.map(t => TIPO_TAREFA[t] || t).join(', '))}<br><span class="dica">${COMPLEXIDADE[x.complexidade] || ''} · janela ${num(x.janela_minima)} tokens${x.sigilosa ? ' · sigilosa' : ''}</span></td>
      <td>${PERFIS[x.classe_necessaria] || '—'}</td><td><b>${PERFIS[x.classe] || (x.modo === 'externo' ? 'Serviço de IA' : '—')}</b><br><span class="dica">${esc(x.modelo_usado || x.modelo || '')}</span>${x.fallback ? `<br><span class="selo selo-ambar">${esc(FALLBACK[x.fallback.tipo] || x.fallback.tipo)}</span>` : ''}</td>
      <td style="min-width:260px">${esc(x.explicacao)}<details><summary class="dica" style="cursor:pointer">Requisitos, candidatos e critérios</summary>
        <p class="dica">${esc(MODO[x.modo] || x.modo)} · preferência ${esc(x.preferencia || '—')} · requisitos: ${esc(Object.entries(x.requisitos.dimensoes || {}).map(([k, n]) => `${k} ${n}`).join(', ') || '—')}</p>
        <ul class="dica">${x.candidatos.map(k => `<li>${esc(k.id)} (${PERFIS[k.classe] || k.classe}): ${esc(STATUS_CAND[k.status] || k.status)}${k.motivos?.length ? ` · ${esc(k.motivos.map(m => MOTIVO_CAND[m] || m).join(', '))}` : ''}${k.custo != null ? ` · ${fmtCusto(k.custo)}` : ''}</li>`).join('')}</ul>
        <span class="dica">Regras: ${esc(x.politicas.join(', ') || '—')} · escolha: ${esc(x.motivo_escolha || '—')}${x.reserva ? ` · reserva: ${esc(x.reserva)}` : ''} · versão ${esc(x.versao)}</span></details></td></tr>`), 'Nenhuma decisão registrada ainda.')}`;
  $('cfg-rota').onsubmit = async ev => {
    ev.preventDefault();
    try {
      await api('/api/admin/modelos-config', { metodo: 'PUT', corpo: { roteamento: { ativo: $('rota-ativo').checked, preferencia: document.querySelector('input[name=rota-pref]:checked')?.value } } });
      toast('Roteamento salvo.'); abaRoteamento();
    } catch (e) { falhar(e); }
  };
}

// ---------------------------------------------------------------- Histórico de modelos
async function abaHistoricoModelos() {
  const d = await api('/api/admin/eventos?prefixo=model.');
  $('conteudo').innerHTML = `<p class="lead">Toda alteração de modelos fica registrada: liberação, classe, reserva, homologação e troca do modelo de cada classe.</p>
    ${tabela(['Quando', 'O que mudou', 'Quem', 'Detalhes'], d.eventos.map(e => `<tr><td style="white-space:nowrap">${dataHora(e.em)}</td><td>${esc(NOMES_EVENTO[e.tipo] || e.tipo)}</td><td>${esc(e.pessoa || 'sistema')}</td>
      <td>${detalheAuditoria(e)}</td></tr>`), 'Nenhuma alteração registrada ainda.')}`;
}
const NOMES_EVENTO = { 'model.pool_expanded': 'Modelos do nível ampliados', 'model.changed': 'Modelo alterado', 'model.certified': 'Modelo homologado', 'model.uncertified': 'Homologação retirada', 'model.config_changed': 'Classes e acesso alterados', 'model.price_changed': 'Preço variou mais de 20%' };

// ---------------------------------------------------------------- rotas
const TELAS = {
  uso: { titulo: 'Uso e créditos', perm: 'usage.read', fn: abaUso },
  pessoas: { titulo: 'Pessoas e áreas', perm: 'user.read', sub: [['', 'Áreas', abaAreas], ['pessoas', 'Pessoas', abaPessoas], ['grupos', 'Grupos de permissão', abaGrupos], ['criacao', 'Quem cria quick wins', abaCriacaoQw]] },
  modelos: { titulo: 'Modelos', perm: 'models.manage', sub: [['', 'Classes e modelos', abaModelos], ['roteamento', 'Roteamento', abaRoteamento], ['historico', 'Histórico', abaHistoricoModelos]] },
  politicas: { titulo: 'Políticas de IA', perm: 'policy.manage', sub: [['', 'Regras de uso', abaPoliticas], ['texto', 'Texto da política', abaPolitica]] },
  atividade: { titulo: 'Atividade', perm: 'audit.read', fn: abaEventos },
  configuracoes: { titulo: 'Configurações', perm: 'settings.manage', fn: abaConfig },
  conhecimento: { titulo: 'Conhecimento', fn: abaConhecimento, todos: true },
};

export async function rotaGestao(id, sub = '') {
  const t = TELAS[id];
  if (!t || (!t.todos && !pode(t.perm))) { location.hash = '#/nova'; return; }
  const atual = t.sub ? (t.sub.find(x => x[0] === (sub || '')) || t.sub[0]) : null;
  document.getElementById('principal').innerHTML = `${cabecalho(t.titulo)}<div class="pagina"><div class="pagina-dentro">
    ${t.sub ? `<nav class="subnav" aria-label="${esc(t.titulo)}">${t.sub.map(x => `<a href="#/${id}${x[0] ? `/${x[0]}` : ''}" ${x === atual ? 'aria-current="page"' : ''}>${x[1]}</a>`).join('')}</nav>` : ''}
    <div id="conteudo">${carregandoHtml()}</div></div></div>`;
  ligarCabecalho();
  $('conteudo').onclick = null; $('conteudo').onchange = null;
  const conteudo = $('conteudo');
  try { await (atual ? atual[2] : t.fn)(); } catch (e) {
    if (!conteudo.isConnected) return;
    conteudo.innerHTML = `<div class="faixa-aviso erro" role="alert"><strong>Não foi possível carregar esta tela.</strong><p>${esc(e.message || 'Verifique sua conexão e tente novamente.')}</p><button type="button" class="btn" id="tentar-carregar">Tentar novamente</button></div>`;
    $('tentar-carregar').onclick = () => rotaGestao(id, sub);
  }
}
