import { excluirConversa, renomearConversa } from '/historico-conversas.js';
import { detalheExecucao } from '/execucao-detalhe.js';
import { conviteGuia } from '/onboarding.js';
import { htmlComecar, ligarComecar } from '/ajude-comecar.js';
// Vista de uma conversa (chat geral ou dentro de um quick win).
import { api, esc, ICONE, iconeIA, toast } from '/comum.js';
import { renderizar, baixarCsv } from '/md.js';
import { E, cabecalho, ligarCabecalho, recarregarLateral, irPara, pedirCiencia, cartaoBase } from '/app.js';
import { aviso, ligarVerResultado, marcaQw, oQueEnviar, painelIntegracoes, painelQualidade, progressoExecucao } from '/qw-ui.js';
import { htmlArtefatos, ligarArtefatos } from '/artefatos.js';

const $ = id => document.getElementById(id);
const SUGESTOES_CHAT = ['Resuma um texto em poucos pontos', 'Rascunhe um email curto e cordial', 'Organize estas anotações em uma lista', 'Revise este texto e deixe mais claro'];
const ESTADOS = { identificado: 'Identificado', em_configuracao: 'Em configuração', em_teste: 'Em teste', em_uso: 'Em uso', em_avaliacao: 'Em avaliação', aprovado: 'Aprovado', em_expansao: 'Em expansão', descartado: 'Descartado' };
const CLASSES = { rapido: 'Rápido', equilibrado: 'Equilibrado', avancado: 'Avançado' };
const FEEDBACK = [['serviu', 'Serviu'], ['ajustes', 'Serviu com ajustes'], ['nao_serviu', 'Não serviu']];
let C = null;       // estado da conversa aberta
document.addEventListener('greenia:integracao-atualizada', ev => {
  for (const m of C?.mensagens || []) if (m.qualidade?.integracoes?.plano === ev.detail.plano) m.qualidade.integracoes = { ...m.qualidade.integracoes, ...ev.detail };
});
const vistos = new Set();   // mensagens já mostradas (só as novas animam)

// enviarAgora: { texto, anexos } para já executar ao abrir (Quick Win: "Executar" e o teste da criação).
export async function vistaConversa({ id = null, qw = null, teste = false, enviarAgora = null } = {}) {
  // Navegações seguidas: só a última desenha (uma vista antiga não sobrescreve o estado da nova).
  const estado = C = { conv: null, mensagens: [], qw, teste, opcoes: [], modelo: null, anexos: [], enviando: false, tabelas: {}, noFim: true, homologadoPadrao: null };
  if (id) {
    const d = await api(`/api/conversas/${id}`);
    if (C !== estado) return;
    Object.assign(C, { conv: d.conversa, mensagens: d.mensagens });
    d.mensagens.forEach(m => vistos.add(String(m.id)));
    if (d.conversa.quick_win_id && !qw) C.qw = await api(`/api/quick-wins/${d.conversa.quick_win_id}`).catch(() => null);
    if (C !== estado) return;
  }
  await carregarModelos();
  if (C !== estado) return;
  desenhar();
  // Ação explícita de execução do Quick Win ("Executar", teste da criação): o servidor faz a execução completa.
  if (enviarAgora) { $('entrada').value = enviarAgora.texto || ''; C.anexos = enviarAgora.anexos || []; ajustarAltura(); desenharAnexos(); atualizarEnviar(); await enviar(null, { executar: true }); }
}

async function carregarModelos() {
  const q = new URLSearchParams({ sigilosa: C.conv?.sigilosa ? '1' : '0', ...(C.qw ? { quick_win: C.qw.id } : {}) });
  const s = C, m = await api(`/api/modelos?${q}`);
  if (C !== s) return;
  C.opcoes = m.opcoes;
  C.homologadoPadrao = m.homologadoPadrao;
  const preferido = C.conv?.modelo || m.padrao;
  const livres = C.opcoes.filter(o => !o.bloqueado);
  C.modelo = livres.some(o => o.id === preferido) ? preferido : C.conv?.sigilosa ? m.homologadoPadrao : livres[0]?.id || null;
}

function titulo() {
  if (C.conv) return C.conv.titulo;
  return C.qw ? C.qw.nome : 'Nova conversa';
}

let desenhadoPara = null;
function desenhar() {
  const conv = C.conv, qw = C.qw;
  // Redesenhar (depois de cada resposta, ao mudar o sigilo...) não pode perder o que a pessoa já começou a
  // escrever ou anexar para a próxima mensagem.
  // Só na mesma conversa: abrir outra começa com o campo vazio.
  const rascunho = desenhadoPara === C ? document.getElementById('entrada') : null, texto = rascunho?.value || '', focado = rascunho && document.activeElement === rascunho;
  desenhadoPara = C;
  const sig = !!conv?.sigilosa;
  const modeloAtual = C.opcoes.find(o => o.id === C.modelo);
  const podeTrocar = !qw || qw.pode_trocar || C.opcoes.length > 1;
  $('principal').innerHTML = `
    ${cabecalho(titulo(), conv ? `<button class="icone-btn" id="renomear" title="Renomear" aria-label="Renomear conversa">${ICONE.lapis}</button>
      <button class="icone-btn" id="apagar" title="Excluir conversa" aria-label="Excluir conversa">${ICONE.lixo}</button>` : '')}
    <div class="barra-conversa">
      ${qw ? `<a class="qw-contexto" href="#/qw/${qw.id}" title="Abrir o Quick Win">${marcaQw(qw)}${esc(qw.nome)}</a>${C.teste ? '<span class="dica">Teste · fora da medição</span>' : qw.v2 ? '' : `<span class="dica">${ESTADOS[qw.status] || ''}</span>`}` : ''}
      ${C.opcoes.length > 1 && !qw?.v2 ? `<label class="seletor" title="Opcional: a GreenIA já escolhe sozinha o recurso certo para cada pedido.">Nível
        <select id="modelo" ${podeTrocar ? '' : 'disabled'} aria-describedby="selo-modelo">
          ${C.opcoes.map(o => `<option value="${esc(o.id)}" ${o.id === C.modelo ? 'selected' : ''} ${o.bloqueado ? 'disabled' : ''}>${esc(o.automatico ? 'Automático (recomendado)' : o.nivel || o.nome)}${o.bloqueado ? ' · indisponível até a renovação' : ''}</option>`).join('')}
        </select></label>` : ''}
      <span id="selo-modelo"></span>
      <span class="chave">
        <button class="switch" id="sigilosa" role="switch" aria-checked="${sig}" ${sig ? 'disabled' : ''} aria-label="Esta conversa tem dados sigilosos"><span></span></button>
        <span title="Ligue se a conversa tiver informação confidencial que a GreenIA não reconheceu sozinha. A partir daí, ela usa só os recursos autorizados para esse tipo de dado.">Dados sigilosos</span>
      </span>
      ${sig ? `<span class="selo selo-sigilosa" title="Fica assim até ser apagada, porque o histórico já tem os dados. A GreenIA usa só os recursos autorizados para informação confidencial.">Sigilosa${conv.motivo_sigilosa ? ` · ${esc(conv.motivo_sigilosa)}` : ''}</span>` : ''}
      ${qw && conv && !conv.teste ? `<span class="feedback" role="group" aria-label="Esta conversa serviu?"><span class="dica">Serviu?</span>
        ${FEEDBACK.map(([v, r]) => `<button data-fb="${v}" aria-pressed="${conv.feedback === v}">${r}</button>`).join('')}</span>` : ''}
    </div>
    ${qw?.v2 && C.teste && qw.podeEditar ? `<div class="faixa-teste" role="region" aria-label="Teste do Quick Win">${aviso('<b>Teste do Quick Win.</b> Usa a versão em edição e não entra na medição.', 'info',
      `<a class="btn btn-verde btn-pequeno" href="#/qw/${qw.id}/publicar">Publicar Quick Win</a><a class="btn btn-linha btn-pequeno" href="#/qw/${qw.id}/ajustar">Ajustar</a>`)}</div>` : ''}
    <div class="mensagens" id="msgs"><div class="coluna" id="coluna"></div></div>
    <div class="compositor"><div style="max-width:760px;margin:0 auto">
      <div class="sugestoes" id="sugestoes"></div>
      ${qw?.v2 && C.proximaExecucao ? `<div class="proxima-execucao" role="status"><span>${ICONE.raio}</span><span><b>Nova execução do Quick Win.</b> O próximo envio roda o trabalho completo, com conferência.</span><button type="button" class="btn btn-texto btn-pequeno" id="cancelar-execucao">Cancelar</button></div>` : ''}
      <div class="anexos-pendentes" id="anexos"></div>
      <div class="link-novo oculto" id="link-novo"><label class="sr" for="link-url">Link (https)</label><input class="entrada" id="link-url" type="url" inputmode="url" maxlength="2000" placeholder="https://… (página pública usada como fonte)">
        <button type="button" class="btn btn-linha btn-pequeno" id="link-ok">Adicionar link</button></div>
      <div class="caixa">
        <button class="anexar" id="anexar" aria-label="Anexar arquivo" title="Anexar arquivo (PDF, DOCX, PPTX, XLSX, TXT, MD, CSV ou imagem com texto)">${ICONE.clipe}</button>
        <button class="anexar" id="anexar-link" aria-label="Adicionar link" aria-expanded="false" aria-controls="link-novo" title="Adicionar link como fonte (página pública https)">${ICONE.link || '🔗'}</button>
        <input type="file" id="arquivo" multiple hidden accept=".pdf,.docx,.pptx,.txt,.md,.csv,.xlsx,.png,.jpg,.jpeg,.webp,.tif,.tiff">
        <textarea id="entrada" rows="1" placeholder="${esc(!qw ? 'Pergunte alguma coisa…' : !qw.v2 ? 'Cole o texto ou anexe…' : !C.mensagens.length || C.proximaExecucao ? 'Cole o texto ou anexe o material…' : 'Peça um ajuste, faça uma pergunta ou continue a conversa…')}" aria-label="Mensagem"></textarea>
        ${qw?.v2 && C.mensagens.length ? `<button type="button" class="btn-execucao" id="nova-execucao" aria-pressed="${!!C.proximaExecucao}" aria-label="Nova execução do Quick Win" title="Rodar o Quick Win de novo, com conferência">${ICONE.raio}<span>Nova execução</span></button>` : ''}
        <button class="enviar" id="enviar" aria-label="Enviar" disabled>${ICONE.enviar}</button>
      </div>
      ${qw?.v2 && C.mensagens.length ? `<p class="continuar-caso">Este campo continua o trabalho desta conversa. <a href="#/qw/${qw.id}/usar">Usar em outro caso →</a></p>` : ''}
      <p class="nota-compositor">${qw ? 'Revise antes de usar.' : 'Revise antes de usar. Dado bloqueado pela política não é enviado.'} As conversas ficam salvas por até ${E.retencaoDias} dias sem uso.</p>
    </div></div>
    <div class="sr" aria-live="polite" id="ao-vivo"></div>`;
  ligarCabecalho();
  desenharMensagens();
  ligar();
  if (texto) { $('entrada').value = texto; ajustarAltura(); }
  if (focado) $('entrada').focus();
  desenharAnexos(); atualizarEnviar();
}

function sugestoes() {
  const lista = C.qw ? C.qw.sugestoes || [] : SUGESTOES_CHAT;
  $('sugestoes').innerHTML = C.mensagens.length ? '' : lista.map(s => `<button type="button">${esc(s)}</button>`).join('');
  $('sugestoes').querySelectorAll('button').forEach(b => { b.onclick = () => { $('entrada').value = b.textContent; ajustarAltura(); $('entrada').focus(); atualizarEnviar(); }; });
}

function htmlMensagem(m) {
  const anim = vistos.has(String(m.id)) || m.carregando ? '' : ' anim';
  if (!m.carregando) vistos.add(String(m.id));
  if (m.papel === 'user') {
    return `<div class="bolha-eu${anim}">${esc(m.texto)}${(m.anexos || []).length ? `<div>${m.anexos.map(a => `<span class="anexo-chip">${ICONE.doc} ${esc(a)}</span>`).join('')}</div>` : ''}</div>`;
  }
  if (m.papel === 'aviso') return `<div class="linha-aviso${anim}">${esc(m.texto)}</div>`;
  const { html, tabelas } = m.carregando ? { html: esc(m.texto).replace(/\n/g, '<br>') + '<span class="cursor"></span>', tabelas: [] } : renderizar(m.texto, { csvHref: Number.isInteger(m.id) && m.guardado !== false ? i => `/api/conversas/${C.conv.id}/mensagens/${m.id}/tabelas/${i}/csv` : undefined });
  C.tabelas[m.id] = tabelas;
  // Execução do Quick Win: resultado primeiro e conferência logo abaixo, secundária. Mensagens seguintes: normais.
  const execucao = !m.carregando && !!m.qualidade && m.qualidade.status !== 'pergunta';
  const revisar = execucao && m.qualidade.status === 'inconsistente';
  const qc = execucao ? painelQualidade(m.qualidade, { id: m.id, podeAjustar: !!C.qw?.podeEditar, ajustarHref: C.qw ? `#/qw/${C.qw.id}/ajustar` : '' }) : '';
  const integracoes = execucao ? painelIntegracoes(m.qualidade.integracoes) : '';
  // Fontes: documentos da empresa (título) e, quando houve pesquisa na internet, os endereços consultados.
  const fontes = (m.fontes || []).length ? `<div class="fontes"><b>Fontes</b>${m.fontes.map(f => (f && typeof f === 'object' && /^https?:\/\//.test(f.url || '')
    ? `<a class="selo" href="${esc(f.url)}" target="_blank" rel="noopener noreferrer">${esc(f.titulo || f.url)}</a>` : `<span class="selo">${ICONE.doc} ${esc(f)}</span>`)).join('')}</div>` : '';
  return `<div class="resposta${anim}" data-msg="${m.id}">
    <span class="sim"><img src="${iconeIA()}" width="16" height="16" alt="" aria-hidden="true"></span>
    <div class="resposta-corpo">${execucao ? `<span class="rotulo-execucao">${ICONE.raio} Resultado do Quick Win</span>` : ''}${integracoes}${htmlArtefatos(m.artefatos)}${revisar ? qc : ''}<div class="bolha-ia${m.erro ? ' aviso-bolha' : ''}${revisar ? ' oculto' : ''}" id="resultado-${esc(m.id)}">${html}</div>${revisar ? '' : qc}
      ${m.carregando || m.erro ? '' : `<div class="rodape-resposta">${C.qw ? '<span class="revise">Revise antes de usar</span>' : ''}
        <button type="button" data-copiar="${m.id}">Copiar</button>${execucao && C.qw?.v2 && C.qw.podeEditar && C.qw.status !== 'descartado' ? `<a class="link-sutil" href="#/qw/${C.qw.id}/refinar/${C.conv?.id}/${m.id}">Refinar Quick Win</a>` : ''}${!C.qw?.v2 && (m.modelo || m.classe || m.rota_modo) ? `<span>${(m.rota_modo === 'externo' ? 'Escolha automática' : `Nível ${esc(CLASSES[m.classe] || 'Rápido')}${m.rota_modo === 'automatico' ? ' · escolha automática' : ''}`)}</span>` : ''}</div>
        ${m.rota_explicacao && !C.qw?.v2 ? `<details class="rota-motivo"><summary>Por que esta escolha?</summary>${esc(m.rota_explicacao_simples || m.rota_explicacao)}</details>` : ''}${fontes}${detalheExecucao(m)}`}
    </div></div>`;
}

function desenharMensagens() {
  const vazio = !C.mensagens.length;
  const boasVindas = C.qw
    ? `<div class="boas-vindas"><span class="passo" style="margin:0 auto;background:${esc(C.qw.cor)};color:#fff">${esc((C.qw.icone || C.qw.nome[0] || '').slice(0, 2))}</span>
        <h2>${esc(C.qw.nome)}</h2><p>${esc(C.qw.para_que_serve)}</p>${C.qw.v2 ? `<p class="o-que-enviar">${esc(oQueEnviar(C.qw))}</p>` : ''}</div>`
    : `<div class="boas-vindas"><img src="${iconeIA()}" width="32" height="32" alt="" aria-hidden="true">
        <h2>Como a GreenIA pode ajudar hoje</h2><p>Crie, analise, planeje, consulte o conhecimento ou execute um processo da empresa.</p><div class="comecar-convite"><button type="button" class="btn btn-verde" id="me-ajude-comecar" aria-expanded="false" aria-controls="ajude-comecar">Me ajude a começar</button><span>Escolha seu objetivo e receba orientação para o próximo passo.</span></div>${htmlComecar()}<div class="caminhos-inicio"><a class="caminho-inicio" href="#/quick-wins"><b>Usar uma tarefa pronta</b><span>Quick Wins: envie o material e siga um trabalho já configurado.</span><span class="caminho-acao">Ver Quick Wins →</span></a><button type="button" class="caminho-inicio" id="comecar-pedido"><b>Fazer um pedido</b><span>Conte seu objetivo, o contexto e o resultado que precisa receber.</span><span class="caminho-acao">Escrever meu pedido →</span></button></div>${conviteGuia()}${cartaoBase()}</div>`;
  const corte = C.conv?.cortada ? '<div class="linha-aviso">As primeiras mensagens desta conversa não estão mais sendo consideradas.</div>' : '';
  $('coluna').innerHTML = (vazio ? boasVindas : corte) + C.mensagens.map(htmlMensagem).join('') + (C.pensando ? `<div class="resposta"><span class="sim"><img src="${iconeIA()}" width="16" height="16" alt=""></span>${C.execucao ? progressoExecucao(C.etapa) : '<span class="pensando" aria-label="Pensando"><span></span><span></span><span></span></span>'}</div>` : '');
  sugestoes();
  ligarComecar({ estado: C, aplicar: texto => {
    if ($('entrada').value.trim() && !confirm('Substituir o pedido que você já começou a escrever? Os anexos serão mantidos.')) return false;
    $('entrada').value = texto; ajustarAltura(); atualizarEnviar(); return true;
  } });
  $('comecar-pedido')?.addEventListener('click', () => $('entrada').focus());
  // Artefatos visuais: visualizar, baixar e editar. Uma edição cria nova versão; a conversa é relida do servidor.
  ligarArtefatos($('coluna'), { aoMudar: () => recarregarConversa(false) });
  rolarSeNoFim();
}

function rolarSeNoFim() { const msgs = $('msgs'); if (C?.noFim && msgs) msgs.scrollTop = msgs.scrollHeight; }
function ajustarAltura() { const t = $('entrada'); t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 220) + 'px'; t.style.overflowY = t.scrollHeight > 220 ? 'auto' : 'hidden'; }
function atualizarEnviar() { $('enviar').disabled = C.enviando || (!$('entrada').value.trim() && !C.anexos.length); }

function desenharAnexos() {
  // Papel do material (fontes): material da execução (padrão), só referência de estilo ou fonte principal.
  const papel = (a, i) => `<select class="papel-anexo" data-papel-anexo="${i}" aria-label="Como usar ${esc(a.nome)}">${[['', 'Material'], ['REFERENCE', 'Só referência'], ['REQUIRED_SOURCE', 'Fonte principal']].map(([v, r]) => `<option value="${v}" ${(a.papel || '') === v ? 'selected' : ''}>${r}</option>`).join('')}</select>`;
  $('anexos').innerHTML = C.anexos.map((a, i) => `<span class="anexo-chip">${a.link ? ICONE.link : ICONE.doc} ${esc(a.nome)}${papel(a, i)}<button type="button" data-tirar="${i}" aria-label="Tirar ${esc(a.nome)}">×</button></span>`).join('');
  $('anexos').querySelectorAll('[data-papel-anexo]').forEach(s => { s.onchange = () => { C.anexos[Number(s.dataset.papelAnexo)].papel = s.value || undefined; }; });
  $('anexos').querySelectorAll('[data-tirar]').forEach(b => { b.onclick = () => { C.anexos.splice(Number(b.dataset.tirar), 1); desenharAnexos(); atualizarEnviar(); }; });
}

function ligar() {
  const t = $('entrada');
  t.addEventListener('input', () => { ajustarAltura(); atualizarEnviar(); });
  t.addEventListener('keydown', ev => { if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) { ev.preventDefault(); if (!$('enviar').disabled) enviar(); } });
  $('enviar').onclick = () => enviar();
  const estado = C;
  $('msgs').addEventListener('scroll', ev => { const m = ev.currentTarget; if (C === estado && m.isConnected) C.noFim = m.scrollHeight - m.scrollTop - m.clientHeight < 40; });
  if ($('modelo')) $('modelo').onchange = ev => { C.modelo = ev.target.value; desenhar(); };
  $('sigilosa').onclick = async () => {
    if (!confirm('Ligar esta opção torna a conversa sigilosa até ela ser apagada. A GreenIA passa a usar só os recursos autorizados para informação confidencial. Continuar?')) return;
    await garantirConversa();
    const d = await api(`/api/conversas/${C.conv.id}`, { metodo: 'PATCH', corpo: { sigilosa: true } });
    C.conv = d.conversa; C.mensagens = d.mensagens;
    await carregarModelos(); desenhar(); recarregarLateral();
  };
  $('anexar').onclick = () => $('arquivo').click();
  $('anexar-link').onclick = () => { const c = $('link-novo'); c.classList.toggle('oculto'); $('anexar-link').setAttribute('aria-expanded', String(!c.classList.contains('oculto'))); if (!c.classList.contains('oculto')) $('link-url').focus(); };
  const addLink = () => {
    const url = $('link-url').value.trim();
    if (!/^https:\/\/\S+$/i.test(url)) return toast('Use um link que comece com https://', 6000);
    if (C.anexos.filter(a => a.link).length >= 3) return toast('Até 3 links por mensagem.', 6000);
    let nome = url; try { const u = new URL(url); nome = u.host + u.pathname; } catch { /* mostra o texto digitado */ }
    C.anexos.push({ link: true, url, nome: nome.slice(0, 80), tamanho: 0 });
    $('link-url').value = ''; $('link-novo').classList.add('oculto'); $('anexar-link').setAttribute('aria-expanded', 'false');
    desenharAnexos(); atualizarEnviar();
  };
  $('link-ok').onclick = addLink;
  $('link-url').onkeydown = ev => { if (ev.key === 'Enter') { ev.preventDefault(); addLink(); } };
  $('arquivo').onchange = async ev => {
    // O campo pode ser redesenhado enquanto os arquivos são lidos (a resposta anterior terminou): a lista e o
    // elemento ficam guardados antes da leitura, e o anexo entra no campo atual.
    const campo = ev.target, arquivos = [...campo.files];
    for (const f of arquivos) {
      if (C.anexos.length >= 5) { toast('Até 5 anexos por mensagem. Envie os demais na próxima.', 6000); break; }
      if (f.size > 25 * 1024 * 1024) { toast(`${f.name}: acima de 25 MB. Envie uma versão menor ou só a parte necessária.`, 6000); continue; }
      if (C.anexos.reduce((t, a) => t + a.tamanho, 0) + f.size > 30 * 1024 * 1024) { toast('Os anexos desta mensagem passariam de 30 MB. Envie em mais de uma mensagem.', 6000); break; }
      const base64 = await new Promise(res => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.readAsDataURL(f); });
      C.anexos.push({ nome: f.name, base64, tamanho: f.size });
    }
    campo.value = '';
    desenharAnexos(); atualizarEnviar();
  };
  $('coluna').addEventListener('click', ev => {
    const cp = ev.target.closest('[data-copiar]');
    if (cp) { const m = C.mensagens.find(x => String(x.id) === cp.dataset.copiar); navigator.clipboard?.writeText(m.texto).then(() => toast('Resposta copiada.')); }
    const csv = ev.target.closest('[data-csv]');
    if (csv && csv.tagName !== 'A') baixarCsv(C.tabelas[csv.closest('[data-msg]').dataset.msg][Number(csv.dataset.csv)], `${(C.qw?.nome || 'tabela').replace(/[^\wÀ-ú -]/g, '')}.csv`);
  });
  ligarVerResultado($('coluna'));
  const alternar = v => { C.proximaExecucao = v; desenhar(); $('entrada').focus(); };
  $('nova-execucao')?.addEventListener('click', () => alternar(!C.proximaExecucao));
  $('cancelar-execucao')?.addEventListener('click', () => alternar(false));
  document.querySelectorAll('[data-fb]').forEach(b => { b.onclick = () => darFeedback(b.dataset.fb); });
  const ren = $('renomear'), apg = $('apagar');
  if (ren) ren.onclick = () => { const estado=C; renomearConversa(estado.conv, async c => { if(C!==estado)return; C.conv = c; desenhar(); }); };
  if (apg) apg.onclick = () => { if (C.enviando) return toast('Aguarde a resposta terminar antes de excluir.'); excluirConversa(C.conv); };

}

async function darFeedback(valor) {
  let motivo = null;
  if (valor === 'nao_serviu') motivo = prompt('Quer contar por quê? (opcional)') || null;
  C.conv = (await api(`/api/conversas/${C.conv.id}`, { metodo: 'PATCH', corpo: { feedback: valor, motivo } })).conversa;
  document.querySelectorAll('[data-fb]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.fb === valor)));
  toast('Obrigado pelo retorno.');
}

async function garantirConversa() {
  if (C.conv) return;
  C.conv = (await api('/api/conversas', { metodo: 'POST', corpo: { quick_win_id: C.qw?.id, teste: C.teste } })).conversa;
  history.replaceState(null, '', `#/c/${C.conv.id}`);   // não dispara hashchange
}

// Sem feedback numa conversa com resposta: lembrete discreto ao sair.
export function lembreteAoSair() {
  if (C?.qw && C.conv && !C.conv.teste && !C.conv.feedback && C.mensagens.some(m => m.papel === 'assistant')) toast('Esta conversa serviu? Dê seu retorno no topo da conversa quando puder.', 5000);
}

async function enviar(reenvio = null, { executar = false } = {}) {
  // "Nova execução" (explícita) vale só para o próximo envio.
  if (C.proximaExecucao) {
    executar = true; C.proximaExecucao = false;
    document.querySelector('.proxima-execucao')?.remove(); $('nova-execucao')?.setAttribute('aria-pressed', 'false');
  }
  const texto = reenvio?.texto ?? $('entrada').value.trim();
  const anexos = reenvio?.anexos ?? C.anexos;
  if (!texto && !anexos.length) return;
  C.enviando = true; atualizarEnviar();
  try { await garantirConversa(); } catch (e) { toast(e.message); C.enviando = false; atualizarEnviar(); return; }
  if (!reenvio) {
    C.mensagens.push({ id: 'eu' + Date.now(), papel: 'user', texto, anexos: anexos.map(a => a.nome) });
    $('entrada').value = ''; C.anexos = []; ajustarAltura(); desenharAnexos();
  }
  C.pensando = true; C.etapa = null; C.execucao = false; C.noFim = true; desenharMensagens();
  // Quick Win 2.0: quem usa não escolhe modelo; o roteamento da GreenIA decide.
  const arquivos = anexos.filter(a => !a.link), links = anexos.filter(a => a.link).map(a => ({ url: a.url, ...(a.papel ? { papel: a.papel } : {}) }));
  const r = await api(`/api/conversas/${C.conv.id}/mensagens`, { metodo: 'POST', corpo: { texto, anexos: arquivos, ...(links.length ? { links } : {}), ...(C.qw?.v2 ? (executar ? { executar_quick_win: true } : {}) : { modelo: C.modelo }) }, bruto: true });
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    C.pensando = false;
    if (r.status === 428) {
      // A política mudou: registra ciência e reenvia.
      C.enviando = false;
      await pedirCiencia();
      await new Promise(ok => { const t = setInterval(() => { if (!document.querySelector('#dar-ciencia')) { clearInterval(t); ok(); } }, 300); });
      return enviar({ texto, anexos }, { executar });
    }
    // Bloqueio (sigilo sem recurso autorizado, nada disponível): a conversa pode ter virado sigilosa no servidor.
    if (r.status === 409 || r.status === 503) await recarregarConversa(false).catch(() => {});
    C.mensagens = C.mensagens.filter(m => !(m.papel === 'user' && String(m.id).startsWith('eu') && m.texto === texto));
    if (!reenvio) { $('entrada').value = texto; C.anexos = anexos; desenharAnexos(); ajustarAltura(); }
    C.mensagens.push({ id: 'er' + Date.now(), papel: 'assistant', texto: d.mensagem || 'Não foi possível enviar.', erro: true });
    C.enviando = false; desenharMensagens(); atualizarEnviar();
    return;
  }
  const resposta = { id: 'ia' + Date.now(), papel: 'assistant', texto: '', carregando: true };
  const leitor = r.body.getReader();
  const dec = new TextDecoder();
  let resto = '';
  for (;;) {
    const { value, done } = await leitor.read();
    if (done) break;
    resto += dec.decode(value, { stream: true });
    const linhas = resto.split('\n');
    resto = linhas.pop();
    for (const l of linhas.filter(Boolean)) {
      const ev = JSON.parse(l);
      if (ev.t === 'inicio' && ev.cortada && C.conv) C.conv.cortada = true;
      if (ev.t === 'inicio' && ev.qualidade) C.execucao = true;
      if (ev.t === 'etapa' && C.pensando) { C.etapa = ev.v; $('ao-vivo').textContent = ev.v; }
      if (ev.t === 'texto') {
        if (C.pensando) { C.pensando = false; C.mensagens.push(resposta); }
        resposta.texto += ev.v;
      }
      if (ev.t === 'erro') { C.pensando = false; if (!C.mensagens.includes(resposta)) C.mensagens.push(resposta); Object.assign(resposta, { texto: ev.mensagem, erro: true, carregando: false }); }
      if (ev.t === 'fim') Object.assign(resposta, { id: ev.id, guardado: ev.guardado, modelo: ev.modelo, classe: ev.classe, fornecedor: ev.fornecedor, fontes: ev.fontes, qualidade: ev.qualidade, artefatos: ev.artefatos, rota_modo: ev.rota?.modo, rota_explicacao: ev.rota?.explicacao, rota_explicacao_simples: ev.rota?.explicacao_simples, carregando: false });
    }
    // Durante o streaming, atualiza só a bolha da resposta.
    const bolha = resposta.carregando && document.querySelector(`[data-msg="${resposta.id}"] .bolha-ia`);
    if (bolha) { bolha.innerHTML = esc(resposta.texto).replace(/\n/g, '<br>') + '<span class="cursor"></span>'; rolarSeNoFim(); } else desenharMensagens();
  }
  C.etapa = null; C.execucao = false;
  $('ao-vivo').textContent = resposta.erro ? resposta.texto : resposta.qualidade ? 'Pronto.' : 'Resposta pronta.';
  C.enviando = false;
  await recarregarConversa(true);
  recarregarLateral();
}

async function recarregarConversa(redesenharTudo) {
  const atual = C;
  let d;
  try { d = await api(`/api/conversas/${atual.conv.id}`); }
  catch (e) { if (e.name === 'AbortError') return; throw e; }
  if (C !== atual || !$('coluna')) return;
  const sigAntes = C.conv.sigilosa;
  C.conv = d.conversa;
  if (redesenharTudo) { C.mensagens = d.mensagens; d.mensagens.forEach(m => vistos.add(String(m.id))); }
  if (sigAntes !== d.conversa.sigilosa) await carregarModelos();
  const noFim = C.noFim;
  desenhar();
  C.noFim = noFim; rolarSeNoFim();
}
