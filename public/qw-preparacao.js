import { api, esc, toast } from '/comum.js';
import { E } from '/app.js';

const MODOS = { preparar: ['Preparar para revisão', 'Entrega o resultado aqui, sem consultar ou alterar outros sistemas.'], consultar: ['Consultar sem alterar', 'Busca informações autorizadas. Nenhuma alteração é enviada.'], aprovar: ['Consultar e preparar alterações', 'Toda alteração precisa de aprovação antes de ser executada.'] };
export async function carregarPreparacao(W) {
  if (!W.preparacao) {
    try { W.preparacao = await api('/api/quick-wins/assistente/preparacao'); }
    catch (e) { W.erroPreparacao = e.message; return null; }
  }
  W.erroPreparacao = null;
  if (W.id) {
    try { const r = await api(`/api/quick-wins/${W.id}/preparacao`); W.integracoes = r.necessidades; W.pedidosConexao = r.pedidos; }
    catch (e) { W.erroPreparacao = e.message; }
  }
  if (W.preparacao.integracoes && W.operacao?.integracoes?.length) {
    try { W.integracoes = (await api('/api/integracoes/necessidades', { metodo: 'POST', corpo: { necessidades: W.operacao.integracoes, quick_win_id: W.id || null } })).necessidades; }
    catch (e) { W.erroPreparacao = e.message; }
  }
  return W.preparacao;
}
export async function htmlSistemas(W) {
  const d = await carregarPreparacao(W);
  if (!d) return `<section class="qw-preparacao"><h3>Materiais e sistemas</h3><p role="alert">${esc(W.erroPreparacao)}</p><button type="button" class="btn btn-linha" data-prep-atualizar>Tentar novamente</button></section>`;
  return `<section class="qw-preparacao" aria-labelledby="sistemas-titulo"><h3 id="sistemas-titulo">De onde vêm as informações?</h3>
    <p>Você pode enviar arquivos a cada uso e consultar o Conhecimento autorizado da empresa.</p>
    <a class="link-sutil" href="#/conhecimento">Ver materiais da empresa</a>
    ${d.integracoes ? `<details><summary>Usar também um sistema da empresa</summary><p>Escolha uma conexão já preparada. Não é preciso configurar o acesso técnico.</p>
      <label for="qw-sistema">Sistema disponível</label><select class="entrada" id="qw-sistema"><option value="">Escolha um sistema</option>${[...new Set(d.acoes.map(a => a.sistema))].map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('')}</select>
      <div id="qw-acoes-disponiveis"></div>
      <details class="bloco-extra"><summary>Não encontrei o sistema que preciso</summary><p>Descreva a ação. Depois de salvar, você poderá pedir à equipe autorizada que prepare a conexão.</p>
        <label for="qw-sistema-novo">Nome do sistema</label><input class="entrada" id="qw-sistema-novo" maxlength="60" placeholder="Ex.: sistema de fornecedores">
        <label for="qw-acao-nova">O que precisa fazer nesse sistema?</label><select class="entrada" id="qw-acao-nova"><option value="read_data">Consultar informações</option><option value="create_record">Criar um registro</option><option value="update_record">Atualizar um registro</option><option value="send_message">Enviar uma mensagem</option></select>
        <button type="button" class="btn btn-linha bloco-extra" data-prep-necessidade>Adicionar ao trabalho</button>
      </details></details>` : '<p class="dica">Conexões com sistemas não estão liberadas para este perfil. O trabalho pode ser preparado com os materiais autorizados.</p>'}
    <div id="qw-sistemas-escolhidos">${htmlEscolhidos(W)}</div>
    <p class="dica">Adicionar uma ação não autoriza sua execução. As permissões e regras da empresa continuam valendo.</p></section>`;
}
function htmlEscolhidos(W) {
  const ns = W.operacao?.integracoes || [];
  if (!ns.length) return '<p class="dica">Nenhuma ação em sistema externo adicionada.</p>';
  const estados = { disponivel: 'Conexão disponível', requer_aprovacao: 'Disponível com aprovação', configurar: 'Aguardando preparação da conexão', nao_permitido: 'A política da empresa não permite esta ação' };
  return `<ul class="qw-tarefas-preparo">${ns.map(n => { const r = W.integracoes?.find(r => r.id === n.id); return `<li><div><b>${esc(n.sistema || 'Sistema da empresa')}</b><p>${esc(n.acao)}</p><span class="dica">${esc(estados[r?.estado] || 'Será conferido ao salvar')} · ${n.modo === 'read' ? 'Consulta' : 'Alteração'}</span></div><button type="button" class="link-sutil" data-prep-remover="${esc(n.id)}" aria-label="Remover ação: ${esc(n.acao)}">Remover</button></li>`; }).join('')}</ul>
    ${W.erroPreparacao ? `<p role="alert">${esc(W.erroPreparacao)}</p>` : ''}
    ${(W.integracoes || []).some(n => n.estado === 'configurar') ? `<button type="button" class="btn btn-linha" data-prep-pedir>Pedir preparação da conexão</button>` : ''}
    ${(W.pedidosConexao || []).length ? '<p role="status">Pedido registrado. Quem prepara conexões encontra a pendência na Administração. Seu rascunho pode ser retomado em Quick Wins.</p>' : ''}
    <button type="button" class="link-sutil" data-prep-atualizar>Conferir disponibilidade</button>`;
}
export async function htmlPessoasLimites(W) {
  const d = await carregarPreparacao(W);
  if (!d) return '';
  const c = W.controles || {}, pessoas = d.pessoas || [];
  return `<section class="qw-preparacao"><h3>Quem acompanha este trabalho?</h3>
    <label for="qw-responsavel">Responsável pelo trabalho</label><select class="entrada" id="qw-responsavel">${pessoas.map(p => `<option value="${p.id}" ${p.id === W.responsavelId ? 'selected' : ''}>${esc(p.nome)}${p.id === E.eu.id ? ' (você)' : ''}</option>`).join('')}</select>
    <p class="dica">Acompanha o funcionamento e as pendências. Essa escolha não muda as permissões da pessoa. Quem poderá usar será definido na revisão final.</p>
    ${W.operacao?.integracoes?.length ? `<h3>Até onde este trabalho pode ir?</h3><fieldset class="qw-escolhas" aria-label="Ações permitidas no trabalho">${Object.entries(MODOS).map(([k, [t, desc]]) => `<label><input type="radio" name="qw-modo" value="${k}" ${(c.modo || 'preparar') === k ? 'checked' : ''}><span><b>${t}</b><small>${desc}</small></span></label>`).join('')}</fieldset>
      <label for="qw-aprovador">Quem aprova as alterações?</label><select class="entrada" id="qw-aprovador"><option value="">Equipe com permissão de aprovar</option>${pessoas.filter(p => p.aprova).map(p => `<option value="${p.id}" ${p.id === c.aprovador_id ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')}</select>
      <p class="dica">Apenas pessoas já autorizadas podem aprovar. A conferência feita pela IA não substitui essa aprovação.</p>
      <div class="qw-limites"><div><label for="qw-max-acoes">Máximo de ações externas por execução</label><input class="entrada" id="qw-max-acoes" type="number" min="1" max="10" value="${c.max_acoes || 10}"></div><div><label for="qw-max-itens">Máximo de itens por ação</label><input class="entrada" id="qw-max-itens" type="number" min="1" max="100" value="${c.max_registros || 10}"></div></div>
      <p class="dica">O servidor bloqueia entradas acima do limite e não encaminha à IA consultas que retornem mais itens. Alterações em massa sem contagem verificável ficam bloqueadas. Limites de valor, unidade ou categoria exigem uma ação da conexão que consiga validá-los; não são garantidos por uma instrução de texto.</p>` : ''}</section>`;
}
export function guardarPreparacao(W) {
  const $ = id => document.getElementById(id);
  if ($('qw-responsavel')) W.responsavelId = Number($('qw-responsavel').value) || W.responsavelId;
  if ($('qw-aprovador')) W.controles = { modo: document.querySelector('[name="qw-modo"]:checked')?.value || 'preparar', aprovador_id: Number($('qw-aprovador').value) || null,
    max_acoes: Number($('qw-max-acoes').value), max_registros: Number($('qw-max-itens').value) };
}
export function ligarPreparacao(W, { salvar, redesenhar }) {
  const $ = id => document.getElementById(id);
  const adicionar = n => {
    W.operacao ||= { v: 2, origem: 'pessoa', canais: [], entregaveis: [], ferramentas: [], contexto_respostas: [] };
    W.operacao.integracoes ||= [];
    if (W.operacao.integracoes.length >= 10) return toast('Este trabalho pode ter até 10 ações externas.');
    if (n.capability_id && W.operacao.integracoes.some(x => x.capability_id === n.capability_id)) return toast('Esta ação já está no trabalho.');
    const ids = new Set(W.operacao.integracoes.map(x => x.id)); let i = 1; while (ids.has(`n${i}`)) i++;
    W.operacao.integracoes.push({ ...n, id: `n${i}`, depende_de: W.operacao.integracoes.length ? [W.operacao.integracoes.at(-1).id] : [] });
    W.operacaoPessoa = true; W.planoAceito = true; W.controles ||= { modo: 'preparar', max_acoes: 10, max_registros: 10, aprovador_id: null };
    redesenhar();
  };
  $('qw-sistema')?.addEventListener('change', ev => {
    const acoes = (W.preparacao?.acoes || []).filter(a => a.sistema === ev.target.value);
    $('qw-acoes-disponiveis').innerHTML = acoes.length ? `<label for="qw-acao-disponivel">O que este trabalho precisa fazer?</label><select class="entrada" id="qw-acao-disponivel">${acoes.map(a => `<option value="${esc(a.id)}">${esc(a.nome)}${a.estado === 'requer_aprovacao' ? ' (precisa de aprovação)' : ''}</option>`).join('')}</select><button type="button" class="btn btn-linha bloco-extra" id="qw-adicionar-acao">Adicionar ao trabalho</button>` : '';
    $('qw-adicionar-acao')?.addEventListener('click', () => { const a = acoes.find(a => a.id === $('qw-acao-disponivel').value); if (a) adicionar({ acao: a.nome, sistema: a.sistema, categoria: a.categoria, modo: a.modo, capability_id: a.id }); });
  });
  document.querySelector('[data-prep-necessidade]')?.addEventListener('click', () => {
    const sistema = $('qw-sistema-novo').value.trim(), categoria = $('qw-acao-nova').value;
    if (sistema.length < 2) return toast('Informe o nome do sistema.');
    adicionar({ sistema, categoria, modo: categoria === 'read_data' ? 'read' : 'write', acao: `${$('qw-acao-nova').selectedOptions[0].textContent} em ${sistema}` });
  });
  document.querySelectorAll('[data-prep-remover]').forEach(b => b.onclick = () => {
    const id = b.dataset.prepRemover; W.operacao.integracoes = W.operacao.integracoes.filter(n => n.id !== id).map(n => ({ ...n, depende_de: n.depende_de.filter(x => x !== id) })); W.operacaoPessoa = true; redesenhar();
  });
  document.querySelector('[data-prep-pedir]')?.addEventListener('click', async ev => {
    const b = ev.currentTarget; b.disabled = true;
    try { await salvar(); await api(`/api/quick-wins/${W.id}/pedir-conexao`, { metodo: 'POST' }); toast('Pedido registrado. Seu trabalho continua salvo.'); await redesenhar(); }
    catch (e) { toast(e.message); if (b.isConnected) b.disabled = false; }
  });
  document.querySelectorAll('[data-prep-atualizar]').forEach(b => b.onclick = async () => { W.preparacao = null; await redesenhar(); });
}
