// Orientação local: prepara um rascunho; nunca envia pedidos ou executa integrações.
import { esc } from '/comum.js';
const caminhos = [
  { titulo: 'Criar e comunicar', descricao: 'Preparar conteúdos, propostas, apresentações e mensagens.', pergunta: 'O que você quer criar e para quem?', exemplo: 'Preparar uma proposta para um cliente, com escopo, etapas e pontos a confirmar.', pedido: 'Ajude a criar o material descrito abaixo. Considere o público e o objetivo. Não invente fatos, valores ou compromissos.' },
  { titulo: 'Analisar e decidir', descricao: 'Comparar informações, analisar documentos e apoiar decisões.', pergunta: 'O que você precisa analisar ou comparar?', exemplo: 'Comparar duas propostas, destacando diferenças, riscos e informações que faltam.', pedido: 'Analise o caso abaixo. Separe fatos de hipóteses, compare as alternativas e destaque riscos e informações que faltam. A decisão final será humana.' },
  { titulo: 'Planejar e organizar', descricao: 'Estruturar projetos, atividades e planos de ação.', pergunta: 'O que você precisa planejar ou organizar?', exemplo: 'Organizar um projeto em etapas, com atividades, dependências e prazos a confirmar.', pedido: 'Estruture um plano para o caso abaixo. Organize etapas, atividades e dependências. Sinalize responsáveis e prazos que ainda precisam ser definidos.' },
  { titulo: 'Consultar o conhecimento da empresa', descricao: 'Encontrar respostas com base nos materiais disponíveis.', pergunta: 'O que você quer saber sobre a empresa?', exemplo: 'Encontrar a orientação disponível para um procedimento interno e indicar a fonte.', pedido: 'Responda à pergunta abaixo com base nos materiais da empresa disponíveis nesta conversa. Indique as fontes utilizadas. Se não houver informação suficiente, explique o que falta, sem inventar uma resposta.' },
  { titulo: 'Executar processos da empresa', descricao: 'Usar Quick Wins com etapas, documentos e integrações autorizadas.' }
];
export function htmlComecar() {
  return '<section id="ajude-comecar" class="ajude-comecar oculto" aria-labelledby="comecar-titulo"></section>';
}
export function ligarComecar({ estado, aplicar }) {
  const raiz = document.getElementById('ajude-comecar');
  const abrir = document.getElementById('me-ajude-comecar');
  if (!raiz || !abrir) return;
  const s = estado.inicio ||= { aberto: false, caminho: null, respostas: {} };
  const foco = () => raiz.querySelector('#comecar-titulo')?.focus();
  function desenhar() {
    raiz.classList.toggle('oculto', !s.aberto);
    raiz.parentElement.classList.toggle('inicio-orientado', s.aberto);
    document.getElementById('sugestoes')?.classList.toggle('oculto', s.aberto);
    abrir.setAttribute('aria-expanded', String(s.aberto));
    if (!s.aberto) { raiz.innerHTML = ''; return; }
    const c = caminhos[s.caminho];
    raiz.innerHTML = c ? `<span class="dica">Passo 2 de 2 · Prepare seu trabalho</span><h3 id="comecar-titulo" tabindex="-1">${esc(c.titulo)}</h3>${s.caminho === 4 ? `<p>Escolha uma tarefa no catálogo, confira o que ela faz e envie o material solicitado. Você verá os Quick Wins disponíveis para seu acesso.</p><p>Integrações dependem das permissões e aprovações da empresa. Abrir o catálogo não executa nenhuma ação.</p><a class="btn btn-verde" href="#/quick-wins">Escolher um Quick Win</a>` : `<form id="comecar-form"><label for="comecar-objetivo">${esc(c.pergunta)}</label><textarea class="entrada" id="comecar-objetivo" rows="3" maxlength="4000" required placeholder="${esc(c.exemplo)}">${esc(s.respostas[s.caminho] || '')}</textarea><p id="comecar-material">${s.caminho === 3 ? 'A IA consulta os materiais autorizados para você. Confira as fontes da resposta. ' : ''}Se precisar, anexe o material pelo clipe após preparar o pedido. Revise a resposta antes de usar.</p>${s.caminho === 3 ? '<a class="btn btn-linha" href="#/conhecimento">Ver conhecimento disponível</a>' : ''}<button type="submit" class="btn btn-verde">Preparar meu pedido</button></form><p class="dica">Você poderá revisar e editar antes de enviar. Esta ajuda não usa créditos.</p>`}<div class="linha-botoes"><button type="button" class="btn btn-texto" id="comecar-voltar">Escolher outro caminho</button><button type="button" class="btn btn-texto" id="comecar-fechar">Fechar ajuda</button></div>` : `<span class="dica">Passo 1 de 2 · Escolha um caminho</span><h3 id="comecar-titulo" tabindex="-1">Qual trabalho você precisa resolver?</h3><p>Escolha entre os cinco caminhos. Vamos ajudar a preparar o próximo passo.</p><div class="comecar-caminhos">${caminhos.map((c, i) => `<button type="button" class="caminho-inicio" data-comecar="${i}"><b>${esc(c.titulo)}</b><span>${esc(c.descricao)}</span><span class="caminho-acao">${i === 4 ? 'Encontrar uma tarefa pronta' : 'Preparar meu pedido'} →</span></button>`).join('')}</div><button type="button" class="btn btn-texto" id="comecar-fechar">Fechar ajuda</button>`;
    raiz.querySelectorAll('[data-comecar]').forEach(b => b.onclick = () => { s.caminho = Number(b.dataset.comecar); desenhar(); foco(); });
    raiz.querySelector('#comecar-voltar')?.addEventListener('click', () => { s.caminho = null; desenhar(); foco(); });
    raiz.querySelector('#comecar-fechar').onclick = () => { s.aberto = false; desenhar(); abrir.focus(); };
    const campo = raiz.querySelector('#comecar-objetivo');
    if (campo) campo.oninput = () => { s.respostas[s.caminho] = campo.value; };
    raiz.querySelector('#comecar-form')?.addEventListener('submit', ev => {
      ev.preventDefault(); const texto = campo.value.trim();
      if (!texto) { campo.setCustomValidity('Conte o que você precisa fazer.'); campo.reportValidity(); campo.oninput = () => { campo.setCustomValidity(''); s.respostas[s.caminho] = campo.value; }; return; }
      if (!aplicar(`${c.pedido}\n\nMeu objetivo e contexto:\n${texto}`)) return;
      s.aberto = false; desenhar(); document.getElementById('entrada').focus();
    });
  }
  abrir.onclick = () => { s.aberto = !s.aberto; desenhar(); if (s.aberto) foco(); };
  desenhar();
}
