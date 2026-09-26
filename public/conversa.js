// Vista de uma conversa (chat geral ou dentro de um quick win).
import { api, esc, ICONE, toast } from '/comum.js';
import { renderizar, baixarCsv } from '/md.js';
import { E, cabecalho, ligarCabecalho, recarregarLateral, irPara, pedirCiencia } from '/app.js';

const $ = id => document.getElementById(id);
const SUGESTOES_CHAT = ['Resuma um texto em poucos pontos', 'Rascunhe um email curto e cordial', 'Organize estas anotações em uma lista', 'Revise este texto e deixe mais claro'];
const FEEDBACK = [['serviu', 'Serviu'], ['ajustes', 'Serviu com ajustes'], ['nao_serviu', 'Não serviu']];
let C = null;       // estado da conversa aberta
const vistos = new Set();   // mensagens já mostradas (só as novas animam)

export async function vistaConversa({ id = null, qw = null, teste = false } = {}) {
  C = { conv: null, mensagens: [], qw, teste, opcoes: [], modelo: null, anexos: [], enviando: false, tabelas: {}, noFim: true, homologadoPadrao: null };
  if (id) {
    const d = await api(`/api/conversas/${id}`);
    Object.assign(C, { conv: d.conversa, mensagens: d.mensagens });
    d.mensagens.forEach(m => vistos.add(String(m.id)));
    if (d.conversa.quick_win_id && !qw) C.qw = await api(`/api/quick-wins/${d.conversa.quick_win_id}`).catch(() => null);
  }
  await carregarModelos();
  desenhar();
}

async function carregarModelos() {
  const q = new URLSearchParams({ sigilosa: C.conv?.sigilosa ? '1' : '0', ...(C.qw ? { quick_win: C.qw.id } : {}) });
  const m = await api(`/api/modelos?${q}`);
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

function desenhar() {
  const conv = C.conv, qw = C.qw;
  const sig = !!conv?.sigilosa;
  const modeloAtual = C.opcoes.find(o => o.id === C.modelo);
  const podeTrocar = !qw || qw.pode_trocar || C.opcoes.length > 1;
  $('principal').innerHTML = `
    ${cabecalho(titulo(), conv ? `<button class="icone-btn" id="renomear" title="Renomear" aria-label="Renomear conversa">${ICONE.lapis}</button>
      <button class="icone-btn" id="apagar" title="Apagar" aria-label="Apagar conversa">${ICONE.lixo}</button>` : '')}
    <div class="barra-conversa">
      ${qw ? `<span class="selo" style="background:${esc(qw.cor)}1f;color:var(--ink)"><span class="cor" style="width:9px;height:9px;border-radius:3px;background:${esc(qw.cor)}"></span>${esc(qw.nome)}</span>` : ''}
      <label class="seletor">Modelo
        <select id="modelo" ${podeTrocar ? '' : 'disabled'} aria-describedby="selo-modelo">
          ${C.opcoes.map(o => `<option value="${esc(o.id)}" ${o.id === C.modelo ? 'selected' : ''} ${o.bloqueado ? 'disabled' : ''}>${esc(o.nome)}${o.homologado ? ' · Homologado' : ''}${o.bloqueado ? ' · indisponível até a renovação' : ''}</option>`).join('')}
        </select></label>
      <span id="selo-modelo">${modeloAtual?.homologado ? `<span class="selo">${ICONE.escudo} Homologado</span>` : ''}</span>
      <span class="chave">
        <button class="switch" id="sigilosa" role="switch" aria-checked="${sig}" ${sig ? 'disabled' : ''} aria-label="Esta conversa tem dados sigilosos"><span></span></button>
        <span>Esta conversa tem dados sigilosos</span>
      </span>
      <span class="dica">${sig ? `Sigilosa: ${esc(conv.motivo_sigilosa || '')}. Fica assim até ser apagada, porque o histórico já tem os dados.` : 'Se houver dado sigiloso que o sistema não reconhece, ligue esta opção.'}</span>
      ${sig ? '<span class="selo selo-sigilosa">Sigilosa · só modelos homologados</span>' : ''}
      ${qw && conv && !conv.teste ? `<span class="feedback" role="group" aria-label="Esta conversa serviu?"><span class="dica">Serviu?</span>
        ${FEEDBACK.map(([v, r]) => `<button data-fb="${v}" aria-pressed="${conv.feedback === v}">${r}</button>`).join('')}</span>` : ''}
    </div>
    <div class="mensagens" id="msgs"><div class="coluna" id="coluna"></div></div>
    <div class="compositor"><div style="max-width:760px;margin:0 auto">
      <div class="sugestoes" id="sugestoes"></div>
      <div class="anexos-pendentes" id="anexos"></div>
      <div class="caixa">
        <button class="anexar" id="anexar" aria-label="Anexar arquivo" title="Anexar arquivo (PDF, DOCX, TXT, MD, CSV, XLSX)">${ICONE.clipe}</button>
        <input type="file" id="arquivo" multiple hidden accept=".pdf,.docx,.txt,.md,.csv,.xlsx">
        <textarea id="entrada" rows="1" placeholder="${qw ? 'Cole o texto ou anexe…' : 'Pergunte alguma coisa…'}" aria-label="Mensagem"></textarea>
        <button class="enviar" id="enviar" aria-label="Enviar" disabled>${ICONE.enviar}</button>
      </div>
      <p class="nota-compositor">${qw ? 'Revise antes de usar.' : 'Revise antes de usar. Dado bloqueado pela política não é enviado.'} As conversas ficam salvas por até ${E.retencaoDias} dias sem uso.</p>
    </div></div>
    <div class="sr" aria-live="polite" id="ao-vivo"></div>`;
  ligarCabecalho();
  desenharMensagens();
  ligar();
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
  const { html, tabelas } = m.carregando ? { html: esc(m.texto).replace(/\n/g, '<br>') + '<span class="cursor"></span>', tabelas: [] } : renderizar(m.texto);
  C.tabelas[m.id] = tabelas;
  const fontes = (m.fontes || []).length ? `<div class="fontes"><b>Fontes</b>${m.fontes.map(f => `<span class="selo">${ICONE.doc} ${esc(f)}</span>`).join('')}</div>` : '';
  return `<div class="resposta${anim}" data-msg="${m.id}">
    <span class="sim"><img src="/assets/greenia-symbol-forest.svg" width="18" height="18" alt="" aria-hidden="true"></span>
    <div class="resposta-corpo"><div class="bolha-ia${m.erro ? ' aviso-bolha' : ''}">${html}</div>
      ${m.carregando || m.erro ? '' : `<div class="rodape-resposta">${C.qw ? '<span class="revise">Revise antes de usar</span>' : ''}
        <button type="button" data-copiar="${m.id}">Copiar</button>${m.modelo ? `<span>Respondido por ${esc(C.opcoes.find(o => o.id === m.modelo)?.nome || m.modelo)}${m.fornecedor ? ` · fornecedor ${esc(m.fornecedor)}` : ''}</span>` : ''}</div>${fontes}`}
    </div></div>`;
}

function desenharMensagens() {
  const vazio = !C.mensagens.length;
  const boasVindas = C.qw
    ? `<div class="boas-vindas"><span class="passo" style="margin:0 auto;background:${esc(C.qw.cor)};color:#fff">${esc((C.qw.icone || C.qw.nome[0] || '').slice(0, 2))}</span>
        <h2>${esc(C.qw.nome)}</h2><p>${esc(C.qw.para_que_serve)}</p></div>`
    : `<div class="boas-vindas"><img src="/assets/greenia-symbol-forest.svg" width="56" height="56" alt="" aria-hidden="true">
        <h2>Olá. Sou a GreenIA.</h2><p>Posso resumir, rascunhar, conferir e organizar. Por onde começamos?</p></div>`;
  const corte = C.conv?.cortada ? '<div class="linha-aviso">As primeiras mensagens desta conversa não estão mais sendo consideradas.</div>' : '';
  $('coluna').innerHTML = (vazio ? boasVindas : corte) + C.mensagens.map(htmlMensagem).join('') + (C.pensando ? '<div class="resposta"><span class="sim"><img src="/assets/greenia-symbol-forest.svg" width="18" height="18" alt=""></span><span class="pensando" aria-label="Pensando"><span></span><span></span><span></span></span></div>' : '');
  sugestoes();
  rolarSeNoFim();
}

function rolarSeNoFim() { if (C.noFim) $('msgs').scrollTop = $('msgs').scrollHeight; }
function ajustarAltura() { const t = $('entrada'); t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 220) + 'px'; t.style.overflowY = t.scrollHeight > 220 ? 'auto' : 'hidden'; }
function atualizarEnviar() { $('enviar').disabled = C.enviando || (!$('entrada').value.trim() && !C.anexos.length); }

function desenharAnexos() {
  $('anexos').innerHTML = C.anexos.map((a, i) => `<span class="anexo-chip">${ICONE.doc} ${esc(a.nome)}<button type="button" data-tirar="${i}" aria-label="Tirar ${esc(a.nome)}">×</button></span>`).join('');
  $('anexos').querySelectorAll('[data-tirar]').forEach(b => { b.onclick = () => { C.anexos.splice(Number(b.dataset.tirar), 1); desenharAnexos(); atualizarEnviar(); }; });
}

function ligar() {
  const t = $('entrada');
  t.addEventListener('input', () => { ajustarAltura(); atualizarEnviar(); });
  t.addEventListener('keydown', ev => { if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) { ev.preventDefault(); if (!$('enviar').disabled) enviar(); } });
  $('enviar').onclick = () => enviar();
  $('msgs').addEventListener('scroll', () => { const m = $('msgs'); C.noFim = m.scrollHeight - m.scrollTop - m.clientHeight < 40; });
  $('modelo').onchange = ev => { C.modelo = ev.target.value; desenhar(); };
  $('sigilosa').onclick = async () => {
    if (!confirm('Ligar esta opção torna a conversa sigilosa até ela ser apagada. Ela passa a usar só modelos homologados. Continuar?')) return;
    await garantirConversa();
    const d = await api(`/api/conversas/${C.conv.id}`, { metodo: 'PATCH', corpo: { sigilosa: true } });
    C.conv = d.conversa; C.mensagens = d.mensagens;
    await carregarModelos(); desenhar(); recarregarLateral();
  };
  $('anexar').onclick = () => $('arquivo').click();
  $('arquivo').onchange = async ev => {
    for (const f of ev.target.files) {
      if (f.size > 20 * 1024 * 1024) { toast(`${f.name}: acima de 20 MB.`); continue; }
      const base64 = await new Promise(res => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.readAsDataURL(f); });
      C.anexos.push({ nome: f.name, base64 });
    }
    ev.target.value = '';
    desenharAnexos(); atualizarEnviar();
  };
  $('coluna').addEventListener('click', ev => {
    const cp = ev.target.closest('[data-copiar]');
    if (cp) { const m = C.mensagens.find(x => String(x.id) === cp.dataset.copiar); navigator.clipboard?.writeText(m.texto).then(() => toast('Resposta copiada.')); }
    const csv = ev.target.closest('[data-csv]');
    if (csv) baixarCsv(C.tabelas[csv.closest('[data-msg]').dataset.msg][Number(csv.dataset.csv)], `${(C.qw?.nome || 'tabela').replace(/[^\wÀ-ú -]/g, '')}.csv`);
  });
  document.querySelectorAll('[data-fb]').forEach(b => { b.onclick = () => darFeedback(b.dataset.fb); });
  const ren = $('renomear'), apg = $('apagar');
  if (ren) ren.onclick = async () => {
    const novo = prompt('Novo nome da conversa:', C.conv.titulo);
    if (!novo) return;
    C.conv = (await api(`/api/conversas/${C.conv.id}`, { metodo: 'PATCH', corpo: { titulo: novo } })).conversa;
    desenhar(); recarregarLateral();
  };
  if (apg) apg.onclick = async () => {
    if (!confirm('Apagar esta conversa e os anexos? Não dá para desfazer.')) return;
    await api(`/api/conversas/${C.conv.id}`, { metodo: 'DELETE' });
    toast('Conversa apagada.');
    await recarregarLateral();
    irPara(C.qw ? `#/qw/${C.qw.id}` : '#/nova');
  };
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

async function enviar(reenvio = null) {
  const texto = reenvio?.texto ?? $('entrada').value.trim();
  const anexos = reenvio?.anexos ?? C.anexos;
  if (!texto && !anexos.length) return;
  C.enviando = true; atualizarEnviar();
  try { await garantirConversa(); } catch (e) { toast(e.message); C.enviando = false; atualizarEnviar(); return; }
  if (!reenvio) {
    C.mensagens.push({ id: 'eu' + Date.now(), papel: 'user', texto, anexos: anexos.map(a => a.nome) });
    $('entrada').value = ''; C.anexos = []; ajustarAltura(); desenharAnexos();
  }
  C.pensando = true; C.noFim = true; desenharMensagens();
  const r = await api(`/api/conversas/${C.conv.id}/mensagens`, { metodo: 'POST', corpo: { texto, anexos, modelo: C.modelo }, bruto: true });
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    C.pensando = false;
    if (r.status === 428) {
      // A política mudou: registra ciência e reenvia.
      C.enviando = false;
      await pedirCiencia();
      await new Promise(ok => { const t = setInterval(() => { if (!document.querySelector('#dar-ciencia')) { clearInterval(t); ok(); } }, 300); });
      return enviar({ texto, anexos });
    }
    if (r.status === 409 && d.erro === 'precisa_homologado' && d.sugestao) {
      // A conversa virou sigilosa: avisa e reenvia com o modelo homologado.
      C.mensagens.push({ id: 'av' + Date.now(), papel: 'aviso', texto: d.mensagem });
      C.modelo = d.sugestao.id;
      await recarregarConversa(false);
      return enviar({ texto, anexos });
    }
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
      if (ev.t === 'texto') {
        if (C.pensando) { C.pensando = false; C.mensagens.push(resposta); }
        resposta.texto += ev.v;
      }
      if (ev.t === 'erro') { C.pensando = false; if (!C.mensagens.includes(resposta)) C.mensagens.push(resposta); Object.assign(resposta, { texto: ev.mensagem, erro: true, carregando: false }); }
      if (ev.t === 'fim') Object.assign(resposta, { id: ev.id, modelo: ev.modelo, fornecedor: ev.fornecedor, fontes: ev.fontes, carregando: false });
    }
    // Durante o streaming, atualiza só a bolha da resposta.
    const bolha = resposta.carregando && document.querySelector(`[data-msg="${resposta.id}"] .bolha-ia`);
    if (bolha) { bolha.innerHTML = esc(resposta.texto).replace(/\n/g, '<br>') + '<span class="cursor"></span>'; rolarSeNoFim(); } else desenharMensagens();
  }
  $('ao-vivo').textContent = resposta.erro ? resposta.texto : 'Resposta pronta.';
  C.enviando = false;
  await recarregarConversa(true);
  recarregarLateral();
}

async function recarregarConversa(redesenharTudo) {
  const d = await api(`/api/conversas/${C.conv.id}`);
  const sigAntes = C.conv.sigilosa;
  C.conv = d.conversa;
  if (redesenharTudo) { C.mensagens = d.mensagens; d.mensagens.forEach(m => vistos.add(String(m.id))); }
  if (sigAntes !== d.conversa.sigilosa) await carregarModelos();
  const noFim = C.noFim;
  desenhar();
  C.noFim = noFim; rolarSeNoFim();
}
