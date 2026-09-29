// Componentes da jornada de Quick Wins: cabeçalho de página, progresso das etapas, estado do Quick Win,
// progresso da execução, conferência de qualidade, avisos, menu de ações e estado vazio. Só HTML e pequenos
// ligadores; os estilos ficam em estilo.css (bloco "Quick Wins"). Nada técnico chega à tela.
import { esc, ICONE } from '/comum.js';

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
export const oQueEnviar = qw => O_QUE_ENVIAR[qw?.arquetipo] || 'Envie o documento ou descreva o que deseja analisar.';

// ---- Cabeçalho de página ------------------------------------------------------------------------------------
export function cabecalhoPg({ trilha = [], titulo, descricao = '', lado = '', meta = '' }) {
  return `<div class="pg-cabeca">
    ${trilha.length ? `<nav class="pg-trilha" aria-label="Você está em">${trilha.map(([t, h]) => (h ? `<a href="${h}">${esc(t)}</a>` : `<span>${esc(t)}</span>`)).join('<span class="sep" aria-hidden="true">/</span>')}</nav>` : ''}
    <div class="pg-titulo"><div class="pg-titulo-texto"><h2>${esc(titulo)}</h2>${meta ? `<div class="pg-meta">${meta}</div>` : ''}${descricao ? `<p class="pg-desc">${descricao}</p>` : ''}</div>${lado ? `<div class="pg-acoes">${lado}</div>` : ''}</div>
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
export const faseDaEtapa = etapa => (!etapa ? 0 : /^Analisando/.test(etapa) ? 0 : /^Organizando/.test(etapa) ? 1 : 2);
export function progressoExecucao(etapa) {
  const f = faseDaEtapa(etapa), ajustando = /^Ajustando/.test(etapa || '');
  return `<div class="exec-progresso" role="status" aria-live="polite" aria-label="${esc(etapa || 'Analisando…')}">
    ${FASES.map((n, i) => `<span class="exec-fase ${i < f ? 'feita' : i === f ? 'ativa' : ''}"><span class="exec-ponto" aria-hidden="true"></span>${i === 2 && ajustando ? 'Ajustando' : n}</span>`).join('<span class="exec-sep" aria-hidden="true"></span>')}
  </div>`;
}

// ---- Conferência de qualidade -------------------------------------------------------------------------------
// aprovado/corrigido: positivo e discreto. parcial: neutro, nunca linguagem de aprovação. inconsistente: pontos
// para revisar, com o resultado atrás de "Ver resultado". pergunta: nada (não houve resultado a conferir).
export function painelQualidade(q, { id = '', podeAjustar = false, ajustarHref = '' } = {}) {
  if (!q || q.status === 'pergunta') return '';
  if (q.status === 'aprovado' || q.status === 'corrigido') {
    const itens = (q.itens || []).filter(i => i.conferido && i.ok);
    return `<section class="qc qc-ok" role="status" aria-label="Conferência de qualidade">
      <div class="qc-topo"><span class="qc-icone" aria-hidden="true">${ICONE.check}</span><div>
        <b class="qc-titulo">Resultado conferido</b>
        <p>${q.status === 'corrigido' ? 'Ajustamos o resultado automaticamente para atender às regras deste Quick Win.' : 'A resposta atendeu às regras definidas para este Quick Win.'}</p></div></div>
      ${itens.length ? `<ul class="qc-itens">${itens.map(i => `<li><span aria-hidden="true">${ICONE.check}</span>${esc(i.rotulo)}</li>`).join('')}</ul>` : ''}
    </section>`;
  }
  if (q.status === 'parcial') return `<section class="qc qc-parcial" role="status" aria-label="Conferência de qualidade">
      <div class="qc-topo"><span class="qc-icone" aria-hidden="true">◐</span><div>
        <b class="qc-titulo">Conferência incompleta</b>
        <p>A conferência completa não pôde ser feita agora. Revise antes de usar.</p></div></div></section>`;
  return `<section class="qc qc-revisar" role="alert" aria-label="Conferência de qualidade">
      <div class="qc-topo"><span class="qc-icone" aria-hidden="true">!</span><div>
        <b class="qc-titulo">Encontramos pontos para revisar</b>
        <p>O resultado não atendeu a todas as regras deste Quick Win. Confira antes de usar.</p></div></div>
      ${(q.problemas || []).length ? `<ul class="qc-pontos">${q.problemas.map(p => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}
      <div class="qc-acoes"><button type="button" class="btn btn-linha btn-pequeno" data-ver-resultado="${esc(id)}" aria-expanded="false" aria-controls="resultado-${esc(id)}">Ver resultado</button>
        ${podeAjustar && ajustarHref ? `<a class="btn btn-texto btn-pequeno" href="${ajustarHref}">Ajustar Quick Win</a>` : ''}</div>
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
export const menuAcoes = (itens, rotulo = 'Mais ações') => (itens.length ? `<details class="menu-acoes"><summary class="icone-btn" aria-label="${esc(rotulo)}" title="${esc(rotulo)}">${PONTOS}</summary>
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
