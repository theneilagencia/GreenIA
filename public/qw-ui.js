// Componentes da jornada de Quick Wins: cabeçalho de página, progresso das etapas, estado do Quick Win,
// progresso da execução, conferência de qualidade, avisos, menu de ações e estado vazio. Só HTML e pequenos
// ligadores; os estilos ficam em estilo.css (bloco "Quick Wins"). Nada técnico chega à tela.
import { api, esc, ICONE, toast } from '/comum.js';
import { htmlFontesUsadas } from '/fontes.js';
import { pontosDoResultado, orientacaoConfiguracao, orientacaoIntegracao } from '/resultado-orientacao.js';

// ---- Estado do Quick Win (o que a pessoa entende) -----------------------------------------------------------
const EM_CIRCULACAO = ['em_teste', 'em_uso', 'em_avaliacao', 'aprovado', 'em_expansao'];
export function estadoQw(qw) {
  if (qw.status === 'descartado') return { id: 'arquivado', rotulo: 'Arquivado' };
  if (qw.v2) {
    if (qw.versao && EM_CIRCULACAO.includes(qw.status)) return { id: 'publicado', rotulo: 'Publicado' };
    return qw.ultimo_teste ? { id: 'teste', rotulo: 'Em teste' } : { id: 'rascunho', rotulo: 'Rascunho' };
  }
  if (qw.status === 'em_teste') return { id: 'teste', rotulo: 'Em teste' };
  return EM_CIRCULACAO.includes(qw.status) ? { id: 'publicado', rotulo: 'Publicado' } : { id: 'rascunho', rotulo: 'Rascunho' };
}
export const seloQw = qw => { const e = estadoQw(qw); return `<span class="qw-status qw-status-${e.id}"><span class="qw-ponto" aria-hidden="true"></span>${e.rotulo}</span>`; };
export const iniciais = qw => esc((qw.icone || qw.nome.split(/\s+/).map(p => p[0]).join('').slice(0, 2) || '·').toUpperCase());
export const marcaQw = (qw, tam = '') => `<span class="qw-marca ${tam}" style="--qw-cor:${esc(qw.cor || '#1B7950')}" aria-hidden="true">${iniciais(qw)}</span>`;

// Formatos de resultado, em linguagem de trabalho.
export const FORMATOS_SAIDA = {
  resumo: { rotulo: 'Texto', desc: 'Parágrafos curtos, direto ao ponto.' },
  tabela: { rotulo: 'Tabela', desc: 'Itens lado a lado, em colunas. Dá para baixar em planilha.' },
  lista: { rotulo: 'Lista', desc: 'Um ponto por linha, fácil de conferir.' },
  relatorio: { rotulo: 'Resumo executivo', desc: 'Resumo, pontos de atenção e próximo passo.' },
  outro: { rotulo: 'Do seu jeito', desc: 'Você descreve como o resultado deve vir.' },
};

// O que a pessoa precisa enviar para executar, pelo tipo de trabalho (quando conhecido).
const O_QUE_ENVIAR = {
  responder_clientes: 'Cole a mensagem do cliente e o que você já sabe sobre o caso.',
  preparar_reuniao: 'Envie a pauta, as anotações ou os documentos da reunião.',
  comparar_documentos: 'Envie os documentos que devem ser comparados.',
  organizar_informacoes: 'Cole as anotações ou envie o arquivo que deve ser organizado.',
  criar_relatorio: 'Envie os dados ou documentos do período.',
};
// Com plano (entradas declaradas), o que pedir vem dele: "Envie: 3 propostas de fornecedores".
export const oQueEnviar = qw => (qw?.entregas?.entradas?.length ? `Envie: ${qw.entregas.entradas.join('; ')}.`
  : O_QUE_ENVIAR[qw?.arquetipo] || 'Envie o documento ou descreva o que deseja analisar.');

// ---- Cabeçalho de página ------------------------------------------------------------------------------------
export function cabecalhoPg({ trilha = [], titulo, descricao = '', lado = '', meta = '', tituloAcoes = '' }) {
  return `<div class="pg-cabeca">
    ${trilha.length ? `<nav class="pg-trilha" aria-label="Você está em">${trilha.map(([t, h]) => (h ? `<a href="${h}">${esc(t)}</a>` : `<span>${esc(t)}</span>`)).join('<span class="sep" aria-hidden="true">/</span>')}</nav>` : ''}
    <div class="pg-titulo"><div class="pg-titulo-texto">${tituloAcoes ? `<div class="pg-nome"><h2>${esc(titulo)}</h2>${tituloAcoes}</div>` : `<h2>${esc(titulo)}</h2>`}${meta ? `<div class="pg-meta">${meta}</div>` : ''}${descricao ? `<p class="pg-desc">${descricao}</p>` : ''}</div>${lado ? `<div class="pg-acoes">${lado}</div>` : ''}</div>
  </div>`;
}

// ---- Progresso das etapas (discreto; só a atual domina) -----------------------------------------------------
export function progressoEtapas(etapas, atual, { concluidas = atual } = {}) {
  return `<nav class="passos" aria-label="Etapas">
    <p class="passos-compacto" aria-hidden="true">Etapa ${Math.min(atual + 1, etapas.length)} de ${etapas.length} · ${esc(etapas[Math.min(atual, etapas.length - 1)])}</p>
    <div class="passos-barra" aria-hidden="true"><span style="width:${Math.round((Math.min(atual, etapas.length - 1) + 1) / etapas.length * 100)}%"></span></div>
    <ol>${etapas.map((t, i) => {
      const estado = i === atual ? 'atual' : i < concluidas ? 'feito' : 'depois';
      const conteudo = `<span class="passo-n" aria-hidden="true">${estado === 'feito' ? ICONE.check : i + 1}</span><span class="passo-t">${esc(t)}</span>`;
      return `<li class="passo-${estado}">${estado === 'feito' ? `<button type="button" data-ir-etapa="${i}" aria-label="Voltar para ${esc(t)}">${conteudo}</button>`
        : `<span ${estado === 'atual' ? 'aria-current="step"' : ''}>${conteudo}</span>`}</li>`;
    }).join('')}</ol></nav>`;
}

// ---- Progresso da execução (Analisando · Organizando · Conferindo) ------------------------------------------
const FASES = ['Analisando', 'Organizando', 'Conferindo'];
export const faseDaEtapa = etapa => (!etapa ? 0 : /^(Analisando|Pesquisando)/.test(etapa) ? 0 : /^Organizando/.test(etapa) ? 1 : 2);
export function progressoExecucao(etapa) {
  const f = faseDaEtapa(etapa), ajustando = /^Ajustando/.test(etapa || '');
  return `<div class="exec-progresso" role="status" aria-live="polite" aria-label="${esc(etapa || 'Analisando…')}">
    ${FASES.map((n, i) => `<span class="exec-fase ${i < f ? 'feita' : i === f ? 'ativa' : ''}"><span class="exec-ponto" aria-hidden="true"></span>${i === 2 && ajustando ? 'Ajustando' : i === 0 && /^Pesquisando/.test(etapa || '') ? 'Pesquisando' : n}</span>`).join('<span class="exec-sep" aria-hidden="true"></span>')}
  </div>`;
}

// ---- Conferência de qualidade -------------------------------------------------------------------------------
// aprovado/corrigido: positivo e discreto. parcial: neutro, nunca linguagem de aprovação. inconsistente: pontos
// para revisar, com o resultado atrás de "Ver resultado". pergunta: nada (não houve resultado a conferir).
export const painelQualidade = (q, opcoes = {}) => painelQualidadeBase(q, opcoes) + (q && q.status !== 'pergunta' ? htmlAcoes(q, opcoes) + htmlFontesUsadas(q) : '');
// Ações dos avisos causados por configuração: link para a tela (e o campo) onde se libera ou ajusta. Quem não tem a
// permissão também pode abrir o link; a tela e o servidor verificam o acesso antes de exibir ou salvar dados.
function htmlAcoes(q, { podeAjustar = false, resolverPesquisa = false } = {}) {
  const acoes = q?.acoes || [];
  if (!acoes.length) return '';
  const podeMudar = a => !a.permissao || (a.permissao === 'quick_win' ? podeAjustar : !!window.__greeniaPode?.(a.permissao));
  return `<div class="qc-acoes qc-limitacoes">${acoes.map(a => {
    const o = orientacaoConfiguracao(a);
    return `<section class="qc-limitacao"><b>${esc(o.aconteceu)}</b><p>${esc(o.impacto)}</p><p><strong>O que fazer:</strong> ${esc(o.fazer)}</p>${podeMudar(a) ? resolverPesquisa && a.motivo === 'pesquisa_area_reforcada' ? '<button type="button" class="btn btn-linha btn-pequeno" data-resolver-pesquisa>Ver como liberar a pesquisa</button>' : `<a class="btn btn-linha btn-pequeno" href="${esc(a.href)}">${esc(a.rotulo)} →</a>` : `<p class="dica">Você não pode alterar esta configuração. Quem administra a empresa pode revisar ${esc(a.onde)}.</p><button type="button" class="btn btn-linha btn-pequeno" data-relatar-limitacao="${esc(a.motivo)}" data-local-limitacao="${esc(a.onde)}">Solicitar revisão ao administrador</button>`}</section>`;
  }).join('')}</div>`;
}
function painelQualidadeBase(q, { id = '', podeAjustar = false, ajustarHref = '', podeMelhorar = false } = {}) {
  if (!q || q.status === 'pergunta') return '';
  if (q.status === 'aprovado' || q.status === 'corrigido') {
    const itens = (q.itens || []).filter(i => i.conferido && i.ok);
    return `<section class="qc qc-ok" role="status" aria-label="Conferência de qualidade">
      <div class="qc-topo"><span class="qc-icone" aria-hidden="true">${ICONE.check}</span><div>
        <b class="qc-titulo">Resultado conferido</b>
        <p>${q.status === 'corrigido' ? 'Ajustamos a resposta automaticamente para atender às regras deste Quick Win.' : 'A resposta foi conferida pelas regras deste Quick Win.'} Revise antes de usar.${q.integracoes?.passos?.length ? ' Acompanhe as ações no sistema externo no painel de execução.' : ''}</p></div></div>
      ${itens.length || q.pesquisa?.feita ? `<ul class="qc-itens">${itens.map(i => `<li><span aria-hidden="true">${ICONE.check}</span>${esc(i.rotulo)}</li>`).join('')}${q.pesquisa?.feita ? `<li><span aria-hidden="true">${ICONE.check}</span>Pesquisa na internet com ${q.pesquisa.fontes} ${q.pesquisa.fontes === 1 ? 'fonte' : 'fontes'}</li>` : ''}</ul>` : ''}
    </section>`;
  }
  // Parcial com motivo (pesquisa não feita, entregável faltando): o motivo aparece; sem motivo, o texto genérico.
  if (q.status === 'parcial') return `<section class="qc qc-parcial" role="status" aria-label="Conferência de qualidade">
      <div class="qc-topo"><span class="qc-icone" aria-hidden="true">◐</span><div>
        <b class="qc-titulo">${(q.avisos || []).length ? 'Resultado parcial' : 'Conferência incompleta'}</b>
        ${(q.avisos || []).length ? q.avisos.map(a => `<p>${esc(a)}</p>`).join('') : '<p>A conferência completa não pôde ser feita agora. Revise antes de usar.</p>'}<p><strong>Próximo passo:</strong> ${(q.acoes || []).length ? 'Veja abaixo a causa e a ação para resolver a limitação.' : 'Confira os dados no material original. Se faltar conteúdo, envie o que falta nesta conversa. Se a conferência não terminou, repita o teste antes de publicar.'}</p></div></div></section>`;
  const pontos = pontosDoResultado(q);
  return `<section class="qc qc-revisar" role="alert" aria-label="Conferência de qualidade">
      <div class="qc-topo"><span class="qc-icone" aria-hidden="true">!</span><div>
        <b class="qc-titulo">Encontramos pontos para revisar</b>
        <p>O resultado está disponível, mas precisa dos ajustes abaixo antes de ser usado.</p></div></div>
      ${pontos.length ? `<ul class="qc-pontos qc-orientacoes">${pontos.slice(0,3).map(p => `<li><b>${esc(p.titulo)}</b><p>${esc(p.observacao)}</p><p><strong>Como melhorar:</strong> ${esc(p.fazer)}</p></li>`).join('')}</ul><details class="qc-diagnostico"><summary>Ver diagnóstico completo${pontos.length>3 ? ` · ${pontos.length} pontos` : ''}</summary><ul>${pontos.map(p=>`<li>${esc(p.detalhe)}</li>`).join('')}</ul></details>` : '<p>Confira o resultado com o material enviado e explique o que esperava receber.</p>'}
      <div class="qc-acoes">${podeAjustar && ajustarHref ? `<a class="btn btn-verde btn-pequeno" href="${esc(ajustarHref)}">Refinar Quick Win</a>` : ''}${podeMelhorar ? `<button type="button" class="btn ${podeAjustar && ajustarHref ? 'btn-linha' : 'btn-verde'} btn-pequeno" data-melhorar-resultado="${esc(id)}">Preparar pedido de melhoria</button>` : ''}<button type="button" class="btn btn-linha btn-pequeno" data-ver-resultado="${esc(id)}" aria-expanded="false" aria-controls="resultado-${esc(id)}">Ver resultado</button></div><p class="dica">${podeAjustar && ajustarHref ? 'Refinar ajusta o rascunho a partir deste caso; publicar continua sendo uma decisão separada. ' : ''}${podeMelhorar ? 'Preparar o pedido preenche a conversa para você conferir e enviar. Isso não muda o Quick Win da equipe.' : ''}</p>
    </section>`;
}
// "Ver resultado" de uma conferência com pontos para revisar (delegado, em qualquer página).
export function ligarVerResultado(raiz) {
  raiz.addEventListener('click', ev => {
    const b = ev.target.closest('[data-ver-resultado]');
    if (!b) return;
    const alvo = document.getElementById(`resultado-${b.dataset.verResultado}`);
    if (!alvo) return;
    const aberto = alvo.classList.toggle('oculto') === false;
    b.setAttribute('aria-expanded', String(aberto));
    b.textContent = aberto ? 'Esconder resultado' : 'Ver resultado';
  });
}

// ---- Aviso em linha, estado vazio e menu de ações -----------------------------------------------------------
export const aviso = (html, tipo = 'info', acoes = '') => `<div class="aviso-linha aviso-${tipo}" role="${tipo === 'erro' ? 'alert' : 'status'}"><div>${html}</div>${acoes ? `<div class="aviso-acoes">${acoes}</div>` : ''}</div>`;

export const estadoVazio = ({ titulo, texto, cta = '', exemplos = [] }) => `<div class="qw-vazio">
    <span class="qw-vazio-icone" aria-hidden="true">${ICONE.raio}</span>
    <h2>${esc(titulo)}</h2><p>${esc(texto)}</p>${cta}
    ${exemplos.length ? `<ul class="qw-vazio-exemplos" aria-label="Exemplos">${exemplos.map(([t, d]) => `<li><b>${esc(t)}</b><span>${esc(d)}</span></li>`).join('')}</ul>` : ''}
  </div>`;

// Menu "…" acessível: <details> nativo (teclado e leitor de tela), fecha ao clicar fora ou com Esc.
export const menuAcoes = (itens, rotulo = 'Mais ações') => (itens.length ? `<details class="menu-acoes"><summary class="icone-btn" aria-label="${esc(rotulo)}">${PONTOS}<span>Mais ações</span></summary>
  <div class="menu-lista" role="menu">${itens.map(i => (i.href ? `<a role="menuitem" href="${i.href}">${esc(i.rotulo)}</a>` : `<button type="button" role="menuitem" data-acao="${esc(i.acao)}" data-id="${esc(i.id ?? '')}"${i.perigo ? ' class="perigo"' : ''}>${esc(i.rotulo)}</button>`)).join('')}</div></details>` : '');
const PONTOS = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>';
let menusLigados = false;
export function ligarMenus() {
  if (menusLigados) return;
  menusLigados = true;
  document.addEventListener('click', ev => { document.querySelectorAll('details.menu-acoes[open]').forEach(d => { if (!d.contains(ev.target)) d.open = false; }); });
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape') document.querySelectorAll('details.menu-acoes[open]').forEach(d => { d.open = false; d.querySelector('summary')?.focus(); }); });
}

// ---- Leitura da resposta em linhas JSON (execução) ----------------------------------------------------------
export async function lerEventos(resposta, aoEvento) {
  const leitor = resposta.body.getReader(), dec = new TextDecoder();
  let resto = '';
  for (;;) {
    const { value, done } = await leitor.read();
    if (done) break;
    resto += dec.decode(value, { stream: true });
    const linhas = resto.split('\n');
    resto = linhas.pop();
    for (const l of linhas.filter(Boolean)) aoEvento(JSON.parse(l));
  }
  if (resto.trim()) aoEvento(JSON.parse(resto));
}

// ---- Resultado por entregável (e por canal, quando há) ------------------------------------------------------
// O resultado de um Quick Win com vários entregáveis vem com um título por entregável ("## Riscos", "## LinkedIn ·
// Copy"). Aqui ele é separado em cartões (um por entregável, cada um copiável), agrupados por canal só quando há
// canal. As fontes da pesquisa ficam num bloco próprio. porSecao: separar mesmo sem canal (vários entregáveis).
// Sem títulos que separem, devolve null (resultado comum, num bloco só).
export function separarPorCanal(texto, { porSecao = false } = {}) {
  const ls = String(texto || '').replace(/\r/g, '').split('\n'), pecas = [];
  let atual = null, antes = [];
  for (const l of ls) {
    const m = /^\s*#{1,2}\s+(.+?)\s*$/.exec(l);
    if (m) { atual = { titulo: m[1].replace(/[*_]/g, ''), linhas: [] }; pecas.push(atual); continue; }
    (atual ? atual.linhas : antes).push(l);
  }
  const fontes = pecas.find(p => /^fontes da pesquisa$/i.test(p.titulo));
  const resto = pecas.filter(x => x !== fontes);
  const comCanal = resto.some(p => p.titulo.includes(' · '));
  if (!comCanal && !(porSecao && resto.length >= 2)) return null;
  const grupos = new Map();
  for (const p of resto) {
    const [canal, peca] = comCanal ? (p.titulo.includes(' · ') ? p.titulo.split(' · ') : ['Geral', p.titulo]) : ['', p.titulo];
    if (!grupos.has(canal)) grupos.set(canal, []);
    grupos.get(canal).push({ titulo: peca, canal, texto: p.linhas.join('\n').trim() });
  }
  return { introducao: antes.join('\n').trim(), grupos: [...grupos.entries()].map(([canal, itens]) => ({ canal, itens })), fontesTexto: fontes ? fontes.linhas.join('\n').trim() : '' };
}
// renderizar: o do md.js. As tabelas de cada cartão ficam em sep.tabelas, na ordem dos botões "Baixar em CSV".
export function htmlPorCanal(sep, renderizar, fontes = []) {
  const web = (fontes || []).filter(f => f && typeof f === 'object' && f.url);
  const tabelas = [];
  const ren = t => { const r = renderizar(t), base = tabelas.length; tabelas.push(...(r.tabelas || [])); return r.html.replace(/data-csv="(\d+)"/g, (_, n) => `data-csv="${base + Number(n)}"`); };
  const html = `<div class="qw-canais">
    ${sep.introducao ? `<div class="qw-canais-intro">${ren(sep.introducao)}</div>` : ''}
    ${sep.grupos.length > 1 ? `<div class="segmento-sutil qw-canais-filtro" role="group" aria-label="Mostrar">
      <button type="button" data-canal="*" aria-pressed="true">Tudo</button>${sep.grupos.map(g => `<button type="button" data-canal="${esc(g.canal)}" aria-pressed="false">${esc(g.canal)}</button>`).join('')}</div>` : ''}
    ${sep.grupos.map(g => `<section class="qw-canal" data-grupo="${esc(g.canal)}" aria-label="${esc(g.canal || 'Entregáveis')}">${g.canal ? `<h4 class="qw-canal-nome">${esc(g.canal)}</h4>` : ''}
      ${g.itens.map((it, i) => `<article class="qw-peca"><div class="qw-peca-cabeca"><b>${esc(it.titulo)}</b>${/^Briefing \(/.test(it.texto) ? '<span class="tag">Briefing</span>' : ''}
        <button type="button" class="link-sutil" data-copiar-peca="${esc(g.canal)}|${i}">Copiar</button></div>
        <div class="qw-peca-corpo">${ren(it.texto)}</div></article>`).join('')}</section>`).join('')}
    ${web.length ? `<section class="qw-fontes" aria-label="Fontes da pesquisa"><b>Fontes da pesquisa</b><ul>${web.map(f => `<li><a href="${esc(f.url)}" target="_blank" rel="noopener noreferrer">${esc(f.titulo || f.url)}</a></li>`).join('')}</ul></section>`
      : sep.fontesTexto ? `<section class="qw-fontes" aria-label="Fontes citadas"><b>Fontes citadas</b>${ren(sep.fontesTexto)}</section>` : ''}
  </div>`;
  sep.tabelas = tabelas;
  return html;
}
export function ligarPorCanal(raiz, sep, aviso = () => {}) {
  raiz.querySelectorAll('[data-canal]').forEach(b => { b.onclick = () => {
    raiz.querySelectorAll('[data-canal]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    raiz.querySelectorAll('[data-grupo]').forEach(g => g.classList.toggle('oculto', b.dataset.canal !== '*' && g.dataset.grupo !== b.dataset.canal));
  }; });
  raiz.querySelectorAll('[data-copiar-peca]').forEach(b => { b.onclick = async () => {
    const [canal, i] = b.dataset.copiarPeca.split('|');
    const it = sep.grupos.find(g => g.canal === canal)?.itens[Number(i)];
    try { await navigator.clipboard.writeText(it?.texto || ''); aviso('Copiado.'); } catch { aviso('Não foi possível copiar. Selecione o texto e copie.'); }
  }; });
}

// ---- Excluir Quick Win (modal próprio, sem alerta do navegador) ---------------------------------------------
// Pede o nome do Quick Win para confirmar. Resolve true só quando a pessoa confirma.
export function confirmarExclusao(qw) {
  return new Promise(resolve => {
    const anterior = document.activeElement;
    const fundo = document.createElement('div');
    fundo.className = 'modal-fundo';
    fundo.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="excluir-titulo" aria-describedby="excluir-texto">
      <h2 id="excluir-titulo">Excluir este Quick Win?</h2>
      <p id="excluir-texto">Esta ação remove o Quick Win do catálogo da empresa. As execuções anteriores e seus registros continuam preservados.</p>
      <label class="legenda" for="excluir-nome">Para confirmar, digite o nome: <b>${esc(qw.nome)}</b></label>
      <input class="entrada" id="excluir-nome" autocomplete="off" spellcheck="false">
      <div class="modal-acoes"><button type="button" class="btn btn-texto" data-cancelar>Cancelar</button>
        <button type="button" class="btn btn-perigo" data-confirmar disabled>Excluir Quick Win</button></div></div>`;
    document.body.appendChild(fundo);
    const campo = fundo.querySelector('#excluir-nome'), ok = fundo.querySelector('[data-confirmar]');
    const igual = () => campo.value.trim().toLowerCase() === String(qw.nome).trim().toLowerCase();
    const fechar = v => { fundo.remove(); document.removeEventListener('keydown', tecla, true); anterior?.focus?.(); resolve(v); };
    const tecla = ev => {
      if (ev.key === 'Escape') { ev.preventDefault(); fechar(false); }
      if (ev.key === 'Tab') {   // foco preso no modal
        const f = [...fundo.querySelectorAll('input, button:not([disabled])')];
        if (ev.shiftKey && document.activeElement === f[0]) { ev.preventDefault(); f.at(-1).focus(); }
        else if (!ev.shiftKey && document.activeElement === f.at(-1)) { ev.preventDefault(); f[0].focus(); }
      }
    };
    document.addEventListener('keydown', tecla, true);
    campo.oninput = () => { ok.disabled = !igual(); };
    campo.onkeydown = ev => { if (ev.key === 'Enter' && igual()) fechar(true); };
    fundo.querySelector('[data-cancelar]').onclick = () => fechar(false);
    ok.onclick = () => igual() && fechar(true);
    fundo.onclick = ev => { if (ev.target === fundo) fechar(false); };
    campo.focus();
  });
}

// Integrações executadas pelo Quick Win: cada etapa com o status (sucesso, parcial, falha, bloqueada pela política
// ou aguardando aprovação). Nada de dado técnico: só sistema, ação e o que aconteceu.
const STATUS_INTEG = { SUCCESS: ['✓', 'concluída'], PARTIAL: ['⚠', 'parcial'], FAILED: ['✕', 'falhou'], BLOCKED: ['✕', 'bloqueada'], APPROVAL_REQUIRED: ['⏸', 'aguardando aprovação'], SIMULATED: ['✓', 'simulada'], DENIED: ['✕', 'negada pela política'] };
export function painelIntegracoes(integ, { refinarHref = '' } = {}) {
  if (!integ?.passos?.length) return '';
  const pendentes = integ.passos.filter(p => p.status === 'APPROVAL_REQUIRED');
  const autorizadas = pendentes.filter(p => p.aprovacao_status === 'aprovada');
  const aguardando = pendentes.filter(p => !p.aprovacao_status || p.aprovacao_status === 'pendente');
  const concluida = integ.passos.every(p => p.status === 'SUCCESS');
  const simulada = integ.passos.every(p => p.status === 'SIMULATED');
  const temEscrita = integ.passos.some(p=>p.modo==='write');
  const impedida = temEscrita && integ.motivo === 'resultado_nao_conferido';
  const titulo = impedida ? 'Alterações no sistema não realizadas' : concluida ? temEscrita ? 'Ações no sistema concluídas' : 'Consultas concluídas' : simulada ? 'Simulação concluída · nenhuma ação real' : autorizadas.length ? aguardando.length ? 'Autorização parcial · outras etapas aguardam decisão' : 'Autorização recebida · falta executar' : aguardando.length ? 'Aguardando autorização' : temEscrita ? 'Ações no sistema precisam de atenção' : 'Não foi possível concluir todas as consultas';
  const geral = impedida ? '<p class="dica">As gravações em sistemas externos não foram feitas: o resultado não passou na conferência.</p>' : '';
  const data = integ.atualizado_em && !Number.isNaN(Date.parse(integ.atualizado_em)) ? `<time class="dica" datetime="${esc(integ.atualizado_em)}">Atualizado em ${esc(new Date(integ.atualizado_em).toLocaleString('pt-BR'))}</time>` : '';
  const voltar = /^#\/c\/\d+$/.test(location.hash) ? `?voltar=${encodeURIComponent(location.hash)}` : '';
  return `<section class="painel-integracoes" aria-label="Estado atual das ações externas"><div class="integ-resumo"><b>${titulo}</b>${data}</div><p class="dica">${temEscrita ? 'A conferência do texto não autoriza alterações no sistema. A aprovação continua obrigatória quando exigida.' : 'Estas etapas consultam dados; não fazem alterações em sistemas externos.'}</p>${geral}<ol>${integ.passos.map(p => { const [s, t] = STATUS_INTEG[p.status] || ['•', 'não executada'];
    const estado = p.status === 'APPROVAL_REQUIRED' && p.aprovacao_status === 'aprovada' ? 'autorizada · falta executar' : p.status === 'APPROVAL_REQUIRED' && ['negada', 'invalidada'].includes(p.aprovacao_status) ? p.aprovacao_status === 'negada' ? 'autorização negada' : 'autorização invalidada · revise o pedido' : t;
    const o = orientacaoIntegracao(p, integ);
    const podeConfigurar = !!window.__greeniaPode?.('integrations.manage');
    const local = /^[\w-]{1,80}$/.test(p.connector_id || '') ? `#/integracoes/c/${p.connector_id}` : '#/integracoes';
    const acao = o.destino === 'conexao' || o.destino === 'politica' ? podeConfigurar ? `<a class="btn btn-linha btn-pequeno" href="${local}">Revisar ${o.destino==='politica' ? 'regras da integração' : 'conexão e ação'}</a>` : `<p class="dica">Quem administra as integrações pode avaliar este impedimento.</p><button type="button" class="btn btn-linha btn-pequeno" data-relatar-limitacao="${esc(p.modo==='read' ? 'Consulta não concluída' : 'Ação não concluída')}" data-local-limitacao="Integrações">Solicitar revisão ao administrador</button>` : '';
    return `<li><span aria-hidden="true">${s}</span><div><b>${esc(p.sistema || 'Sistema externo')} · ${p.modo === 'read' ? 'Consulta' : 'Alteração no sistema'}</b><span class="integ-estado">${esc(estado)}</span><p>${esc(o.impacto)}</p>${o.fazer ? `<p><strong>O que fazer:</strong> ${esc(o.fazer)}</p>` : ''}${acao}<details><summary>Ver ação e motivo</summary><p>${esc(p.acao)}</p>${p.motivo ? `<p>Motivo registrado: ${esc(p.motivo)}</p>` : ''}${p.aprovador && p.status === 'APPROVAL_REQUIRED' ? `<p class="dica">Quem aprova: ${esc(p.aprovador)}</p>` : ''}</details></div></li>`; }).join('')}</ol>
    ${impedida && refinarHref ? `<a class="btn btn-linha btn-pequeno" href="${esc(refinarHref)}">Refinar Quick Win a partir deste resultado</a>` : ''}
    ${!impedida && pendentes.length ? `<p class="dica">A gravação depende de autorização humana. Atualize o estado depois da decisão; nada será executado ao atualizar.</p><div class="linha-botoes">${integ.plano ? `<button type="button" class="btn btn-linha btn-pequeno" data-integ-atualizar="${esc(integ.plano)}">Atualizar autorização</button>` : ''}${pendentes.filter(p => p.aprovacao && p.aprovacao_status !== 'aprovada' && (!p.aprovacao_status || p.aprovacao_status === 'pendente') && window.__greeniaPode?.('integrations.approve')).map(p => `<a class="btn btn-linha btn-pequeno" href="#/integracoes/aprovacao/${encodeURIComponent(p.aprovacao)}${voltar}">Revisar solicitação</a>`).join('')}${autorizadas.length && integ.plano ? `<button type="button" class="btn btn-verde btn-pequeno" data-integ-executar="${esc(integ.plano)}">Executar etapas aprovadas</button>` : ''}</div>` : ''}<div class="integ-erro" role="alert"></div></section>`;
}
// Retomar o plano depois da aprovação: só executa o que foi aprovado (o servidor confere a aprovação e a entrada).
document.addEventListener('click', async e => {
  const b = e.target.closest?.('[data-integ-executar],[data-integ-atualizar]');
  if (!b) return;
  b.disabled = true;
  try {
    const atualizar = !!b.dataset.integAtualizar;
    const id = b.dataset.integAtualizar || b.dataset.integExecutar;
    const r = await api(`/api/integracoes/planos/${encodeURIComponent(id)}${atualizar ? '' : '/executar'}`, atualizar ? {} : { metodo: 'POST', corpo: {} });
    const painel = b.closest('.painel-integracoes');
    document.dispatchEvent(new CustomEvent('greenia:integracao-atualizada', { detail: { plano: r.id, status: r.status, atualizado_em: r.atualizado_em, passos: r.passos } }));
    if (painel) {
      painel.outerHTML = painelIntegracoes({ plano: r.id, status: r.status, atualizado_em: r.atualizado_em, passos: r.passos });
      document.querySelector(`[data-integ-atualizar="${CSS.escape(id)}"]`)?.focus({ preventScroll: true });
    }
    toast(atualizar ? 'Estado da autorização atualizado. Nenhuma ação foi executada.' : 'Estado da execução atualizado.');
  } catch (err) { const el = b.closest('.painel-integracoes')?.querySelector('.integ-erro'); if (el) el.textContent = err.message; b.disabled = false; }
});
