// Quick Wins na tela: ensinar o trabalho à IA (uma etapa por vez), testar como se fosse o uso real, revisar e
// publicar; usar; versões. Nada técnico aparece: sem prompt, modelo, fornecedor, tokens ou JSON. A GreenIA
// sugere; a pessoa confirma. Governança e conferência de qualidade continuam no servidor, iguais.
import { api, esc, ICONE, toast } from '/comum.js';
import { E, cabecalho, ligarCabecalho, recarregarLateral, irPara } from '/app.js';
import { vistaConversa } from '/conversa.js';
import { renderizar, baixarCsv } from '/md.js';
import { aviso, cabecalhoPg, FORMATOS_SAIDA, lerEventos, ligarVerResultado, oQueEnviar, painelQualidade, progressoEtapas, progressoExecucao } from '/qw-ui.js';

const $ = id => document.getElementById(id);
const ACEITOS = '.pdf,.docx,.pptx,.txt,.md,.csv,.xlsx,.png,.jpg,.jpeg,.webp,.tif,.tiff';
const dataCurta = iso => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
const ETAPAS = ['Objetivo', 'Processo', 'Regras', 'Resultado', 'Testar'];
const REVISAR = 5, SUCESSO = 6;
const ORDEM_SAIDAS = ['resumo', 'tabela', 'lista', 'relatorio', 'outro'];
const EXEMPLOS = [
  ['analisar um documento', 'Analisar documentos e apontar pontos de atenção, riscos e o que estiver faltando.', 'analisar_documentos'],
  ['comparar propostas', 'Comparar propostas de fornecedores e mostrar, item por item, o que muda em valor, prazo e condições.', 'comparar_documentos'],
  ['preparar um resumo', 'Preparar um resumo curto de documentos longos, com o que pede decisão.', null],
  ['organizar informações', 'Organizar anotações soltas em uma lista de tarefas com responsável e prazo.', 'organizar_informacoes'],
  ['identificar riscos', 'Identificar riscos em contratos e documentos, mostrando de onde veio cada um.', 'analisar_documentos'],
];

export const lerArquivo = f => new Promise((ok, falha) => {
  if (f.size > 25 * 1024 * 1024) return falha(new Error(`${f.name}: acima de 25 MB. Envie uma versão menor ou só a parte necessária.`));
  const r = new FileReader(); r.onload = () => ok({ nome: f.name, base64: String(r.result).split(',')[1], tamanho: f.size }); r.onerror = () => falha(new Error('Não foi possível ler o arquivo.')); r.readAsDataURL(f);
});

// ---- Criar, testar, revisar e publicar (um só fluxo, uma etapa por vez) -------------------------------------
export const testeQw = qw => assistenteQw(qw.id, { passo: 4 });
export const publicarQw = id => assistenteQw(id, { passo: REVISAR });

export async function assistenteQw(id = null, { passo = 0 } = {}) {
  const qw = id ? await api(`/api/quick-wins/${id}`) : null;
  if (qw && (!qw.podeEditar || !qw.v2)) return irPara(`#/qw/${id}`);
  const o = qw?.assistente || {};
  const W = {
    id, qw, passo, maximo: passo, editando: !!qw,
    descricao: o.descricao || '', arquetipo: o.arquetipo || null,
    modoProc: o.como?.modo === 'mostrar' ? 'exemplo' : 'explicar', processo: o.como?.modo === 'explicar' ? o.como.texto || '' : '',
    exemplo: '', exemploNome: '', estruturaAnterior: o.exemplo || null, estruturaSugerida: null,
    sugestao: null, regras: o.regras ? new Set(o.regras) : null, formato: o.formato || null, formatoDescricao: o.formato_descricao || '',
    salvo: qw ? assinatura({ descricao: o.descricao || '', arquetipo: o.arquetipo || null, como: o.como || {}, regras: o.regras || [], formato: o.formato || null, formato_descricao: o.formato_descricao || '' }) : null,
    teste: { modo: 'auto', texto: '', anexo: null, entradaAuto: null }, resultado: null, publicado: null,
  };
  const publicada = qw?.versao;
  $('principal').innerHTML = `${cabecalho('Quick Wins')}
    <div class="pagina"><div class="pg">
      ${cabecalhoPg({ trilha: [['Quick Wins', '#/quick-wins'], ...(qw ? [[qw.nome, `#/qw/${qw.id}`]] : []), [qw ? 'Editar' : 'Criar']], titulo: qw ? 'Editar Quick Win' : 'Criar Quick Win', descricao: 'Ensine ao GreenIA como realizar esse trabalho.' })}
      ${publicada ? aviso(`<b>Versão publicada: v${publicada}.</b> Você está editando a v${publicada + 1}. A equipe continua usando a v${publicada} até você publicar.`) : ''}
      <div id="progresso"></div>
      <div id="etapa"></div>
    </div></div>`;
  ligarCabecalho();
  ligarVerResultado($('etapa'));
  await desenhar(W, { foco: false });
  if (W.passo === 0) $('objetivo')?.focus();
}

const assinatura = a => JSON.stringify(a);
function respostas(W) {
  const como = W.modoProc === 'exemplo'
    ? (W.exemplo || W.estruturaAnterior ? { modo: 'mostrar', exemplo: W.exemplo } : { modo: 'pronto' })
    : W.processo.trim() ? { modo: 'explicar', texto: W.processo.trim() } : { modo: 'pronto' };
  return { descricao: W.descricao, arquetipo: W.arquetipo, como, regras: [...(W.regras || [])], formato: W.formato, formato_descricao: W.formato === 'outro' ? W.formatoDescricao : '' };
}

async function desenhar(W, { foco = true } = {}) {
  $('progresso').innerHTML = W.passo === SUCESSO ? '' : progressoEtapas(ETAPAS, Math.min(W.passo, 5), { concluidas: W.passo >= REVISAR ? 5 : Math.max(W.maximo, W.editando ? 4 : 0) });
  $('progresso').querySelectorAll('[data-ir-etapa]').forEach(b => { b.onclick = () => irEtapa(W, Number(b.dataset.irEtapa)); });
  const el = $('etapa');
  el.innerHTML = '<p class="dica">Carregando…</p>';
  try { el.innerHTML = `<div class="etapa-foco">${await ETAPA_HTML[W.passo](W)}</div>`; }
  catch (e) { el.innerHTML = aviso(esc(e.message), 'erro'); return; }
  ETAPA_LIGAR[W.passo]?.(W);
  el.querySelector('[data-voltar]')?.addEventListener('click', () => irEtapa(W, W.passo - 1));
  if (W.passo !== REVISAR) el.querySelector('[data-continuar]')?.addEventListener('click', () => continuar(W));
  if (foco) { $('pergunta')?.focus(); window.scrollTo?.({ top: 0 }); }
}
async function irEtapa(W, n) {
  if (!guardarEtapa(W)) return;
  W.passo = Math.max(0, n);
  W.maximo = Math.max(W.maximo, W.passo);
  await desenhar(W);
}
function erroEtapa(msg) {
  const e = $('erro-etapa');
  if (!e) return toast(msg, 6000);
  e.innerHTML = aviso(esc(msg), 'erro');
}

// Guarda o que está na tela da etapa atual (voltar e avançar nunca perdem o que a pessoa escreveu).
function guardarEtapa(W) {
  const mudou = (campo, valor) => { if (W[campo] !== valor) { W[campo] = valor; W.sugestao = null; } };
  if (W.passo === 0 && $('objetivo')) mudou('descricao', $('objetivo').value.trim());
  if (W.passo === 1) {
    if ($('processo')) mudou('processo', $('processo').value);
    if ($('exemplo')) mudou('exemplo', $('exemplo').value.trim());
  }
  if (W.passo === 2 && document.querySelector('input[name=regra]')) W.regras = new Set(['nao_inventar', ...[...document.querySelectorAll('input[name=regra]:checked')].map(i => i.value)]);
  if (W.passo === 3) {
    W.formato = document.querySelector('input[name=saida]:checked')?.value || W.formato;
    if ($('formato-descricao')) W.formatoDescricao = $('formato-descricao').value.trim();
  }
  if (W.passo === 4 && $('teste-texto')) W.teste.texto = $('teste-texto').value;
  return true;
}

async function continuar(W) {
  guardarEtapa(W);
  if (W.passo === 0) {
    if (!W.descricao) return erroEtapa('Conte com suas palavras o que a IA deve fazer.');
  }
  if (W.passo === 3) {
    const botao = document.querySelector('[data-continuar]');
    botao.disabled = true; botao.textContent = 'Salvando…';
    try { await salvar(W); } catch (e) { botao.disabled = false; botao.textContent = 'Continuar'; return erroEtapa(e.message); }
  }
  W.passo++;
  W.maximo = Math.max(W.maximo, W.passo);
  await desenhar(W);
}

async function sugerir(W) {
  if (W.sugestao) return W.sugestao;
  const r = respostas(W);
  W.sugestao = await api('/api/quick-wins/assistente/sugerir', { metodo: 'POST', corpo: { descricao: W.descricao, arquetipo: W.arquetipo, como: { modo: r.como.modo, texto: r.como.texto, exemplo: r.como.exemplo } } });
  const sugeridas = W.sugestao.regras.map(x => x.id);
  // Mantém as escolhas anteriores que continuam valendo; "não inventar" sempre.
  W.regras = W.regras ? new Set(['nao_inventar', ...[...W.regras].filter(x => sugeridas.includes(x))]) : new Set(W.sugestao.regras.filter(x => x.marcada).map(x => x.id));
  if (W.regras.size <= 1) W.sugestao.regras.forEach(x => x.marcada && W.regras.add(x.id));
  if (!W.formato || (W.modoProc === 'exemplo' && W.exemplo)) W.formato = W.sugestao.formato.sugerido;
  return W.sugestao;
}

// Salva (cria ou ajusta o rascunho) só quando algo mudou. O rascunho nunca muda a versão publicada.
async function salvar(W) {
  const a = respostas(W), ass = assinatura(a);
  if (W.id && W.salvo === ass) return;
  if (W.id) W.qw = await api(`/api/quick-wins/${W.id}`, { metodo: 'PUT', corpo: { assistente: a } });
  else {
    const areas = E.permQw.areas.slice(0, 1).map(x => x.id);
    W.qw = await api('/api/quick-wins', { metodo: 'POST', corpo: { assistente: a, areas, toda_empresa: !areas.length && E.permQw.todaEmpresa } });
    W.id = W.qw.id;
    history.replaceState(null, '', `#/qw/${W.id}/ajustar`);
    await recarregarLateral();
  }
  W.salvo = ass;
  W.resultado = null;   // o trabalho mudou: o teste anterior não vale mais para esta versão
}

const rodape = (W, { voltar = true, continuar = 'Continuar', extra = '' } = {}) => `<div id="erro-etapa" class="msg-etapa"></div><div class="etapa-rodape">
    ${voltar && W.passo > 0 ? '<button type="button" class="btn btn-texto" data-voltar>Voltar</button>' : '<a class="btn btn-texto" href="#/quick-wins">Cancelar</a>'}
    <div class="direita">${extra}${continuar ? `<button type="button" class="btn btn-verde" data-continuar>${continuar}</button>` : ''}</div></div>`;
const pergunta = (texto, micro, idMicro = 'micro') => `<h3 class="pergunta" id="pergunta" tabindex="-1">${texto}</h3>${micro ? `<p class="micro" id="${idMicro}">${micro}</p>` : ''}`;

const ETAPA_HTML = [
  // 1. Objetivo
  W => `${pergunta('O que você quer que a IA faça?', 'Descreva o trabalho como explicaria para alguém da sua equipe.', 'micro-objetivo')}
    <label class="sr" for="objetivo">O que a IA deve fazer</label>
    <textarea class="campo-amplo" id="objetivo" maxlength="1000" aria-describedby="micro-objetivo" placeholder="Ex.: Analisar propostas comerciais e apontar valores, prazos, riscos e o que estiver faltando">${esc(W.descricao)}</textarea>
    <p class="exemplos">Exemplos: ${EXEMPLOS.map(([t], i) => `<button type="button" data-exemplo="${i}">${esc(t)}</button>`).join('<span class="ponto-sep" aria-hidden="true">·</span>')}</p>
    ${rodape(W)}`,
  // 2. Processo
  W => `${pergunta('O que normalmente precisa ser considerado para fazer isso bem?', W.modoProc === 'exemplo'
      ? 'Mostre um resultado que você considera bom. A GreenIA aprende a estrutura, o nível de detalhe e o tom. O exemplo em si não é guardado.'
      : 'Conte o que precisa ser analisado, conferido ou considerado. Não precisa ser completo.', 'micro-processo')}
    ${W.modoProc === 'exemplo' ? `
      <label class="sr" for="exemplo">Exemplo de um bom resultado</label>
      <textarea class="campo-amplo" id="exemplo" maxlength="8000" aria-describedby="micro-processo" placeholder="Cole aqui um resultado bom (uma tabela, uma lista, um relatório)">${esc(W.exemplo)}</textarea>
      <div class="arquivo-escolhido bloco-extra"><button type="button" class="btn btn-linha btn-pequeno" id="ex-arquivo">${ICONE.clipe} Enviar um arquivo de exemplo</button>
        <input type="file" id="ex-input" hidden accept="${ACEITOS}"><span class="dica" id="ex-nome">${esc(W.exemploNome || (W.estruturaAnterior && !W.exemplo ? 'Um exemplo já foi analisado. Envie outro se quiser trocar.' : ''))}</span></div>
      <p class="bloco-extra"><button type="button" class="link-sutil" id="modo-explicar">Prefiro explicar com minhas palavras</button></p>`
    : `
      <label class="sr" for="processo">O que precisa ser considerado</label>
      <textarea class="campo-amplo menor" id="processo" maxlength="3000" aria-describedby="micro-processo" placeholder="Ex.: Confiro valor, prazo de entrega e multa. Vejo se falta assinatura. Anoto o que precisa de decisão.">${esc(W.processo)}</textarea>
      <p class="dica bloco-extra">Se deixar em branco, a GreenIA segue uma estrutura sugerida para esse tipo de trabalho.</p>
      <p class="exemplos"><button type="button" id="sugerir-estrutura">Ver a estrutura sugerida</button><span class="ponto-sep" aria-hidden="true">·</span><button type="button" id="modo-exemplo">Prefiro mostrar um exemplo de resultado</button></p>
      <div id="estrutura">${W.estruturaSugerida ? htmlEstrutura(W.estruturaSugerida) : ''}</div>`}
    ${rodape(W)}`,
  // 3. Regras
  async W => {
    const s = await sugerir(W);
    return `${pergunta('O que a IA não pode ignorar?', 'Estas regras valem em todas as execuções. Sugerimos as mais importantes para esse trabalho; desmarque o que não fizer sentido.')}
      <ul class="regras-lista">${s.regras.map(r => `<li><label class="${r.travada ? 'travada' : ''}"><input type="checkbox" name="regra" value="${esc(r.id)}" ${r.travada || W.regras.has(r.id) ? 'checked' : ''} ${r.travada ? 'disabled' : ''}>
        <span>${esc(r.rotulo)}</span>${r.travada ? '<span class="tag">Sempre ativa</span>' : ''}</label></li>`).join('')}</ul>
      ${rodape(W)}`;
  },
  // 4. Resultado
  async W => {
    const s = await sugerir(W);
    const sug = s.formato.sugerido;
    return `${pergunta('Como você quer receber a resposta?', '')}
      <p class="saida-motivo"><b>Sugestão da GreenIA:</b> ${esc(s.formato.motivo)}</p>
      <fieldset class="saidas"><legend class="sr">Formato do resultado</legend>
        ${ORDEM_SAIDAS.map(id => `<label class="saida"><input type="radio" name="saida" value="${id}" ${W.formato === id ? 'checked' : ''}>
          <span class="marcado" aria-hidden="true">${ICONE.check}</span>
          <span class="previa ${id}" aria-hidden="true">${'<i></i>'.repeat(id === 'tabela' ? 9 : id === 'outro' ? 1 : 4)}</span>
          <b>${esc(FORMATOS_SAIDA[id].rotulo)}${id === sug ? '<span class="sug">Sugerido</span>' : ''}</b><span class="desc">${esc(FORMATOS_SAIDA[id].desc)}</span></label>`).join('')}
      </fieldset>
      <div id="saida-outro" class="bloco-extra ${W.formato === 'outro' ? '' : 'oculto'}"><label class="legenda" for="formato-descricao">Como o resultado deve vir?</label>
        <input class="entrada" id="formato-descricao" maxlength="200" value="${esc(W.formatoDescricao || s.formato.descricao || '')}" placeholder="Ex.: mensagem pronta para enviar ao cliente, com o que conferir antes"></div>
      ${rodape(W)}`;
  },
  // 5. Testar (também é a tela de teste de um Quick Win já criado)
  async W => {
    if (W.teste.modo === 'auto' && !W.teste.entradaAuto) W.teste.entradaAuto = (await api(`/api/quick-wins/assistente/entrada-teste?arquetipo=${encodeURIComponent(W.qw?.arquetipo || W.sugestao?.arquetipo || '')}`)).texto;
    const r = W.resultado;
    const pronto = r && !r.erro && !r.rodando;
    return `${pergunta('Vamos testar antes de colocar em uso', 'O teste roda o Quick Win completo, com a conferência de qualidade. Nada fica disponível para a equipe ainda.', 'micro-teste')}
      <div class="segmento-sutil" role="group" aria-label="Material do teste">
        ${[['auto', 'Exemplo pronto'], ['colar', 'Colar um texto'], ['arquivo', 'Enviar um arquivo']].map(([v, t]) => `<button type="button" data-material="${v}" aria-pressed="${W.teste.modo === v}">${t}</button>`).join('')}</div>
      <div id="teste-corpo">${W.teste.modo === 'auto' ? `<pre class="previa-texto" aria-label="Material fictício do teste">${esc(W.teste.entradaAuto || '')}</pre><p class="dica bloco-extra">Material fictício, parecido com o do seu trabalho. Nada real é usado.</p>`
        : W.teste.modo === 'colar' ? `<label class="sr" for="teste-texto">Texto do teste</label><textarea class="campo-amplo menor" id="teste-texto" placeholder="Cole um trecho do seu dia a dia">${esc(W.teste.texto)}</textarea>`
        : `<div class="arquivo-escolhido"><button type="button" class="btn btn-linha" id="teste-arquivo">${ICONE.clipe} Escolher arquivo</button><input type="file" id="teste-input" hidden accept="${ACEITOS}"><span class="dica" id="teste-nome">${esc(W.teste.anexo?.nome || 'PDF, Word, planilha ou imagem com texto')}</span></div>`}</div>
      <div id="teste-resultado">${r ? htmlResultado(W) : ''}</div>
      ${rodape(W, { continuar: pronto ? (r.qualidade?.status === 'inconsistente' ? '' : 'Revisar e publicar') : '',
        extra: pronto ? `${r.qualidade?.status === 'inconsistente' ? '<button type="button" class="btn btn-linha" data-revisar-assim>Revisar mesmo assim</button><button type="button" class="btn btn-verde" data-ajustar>Ajustar Quick Win</button>' : ''}<button type="button" class="btn btn-linha" data-testar>Testar de novo</button>`
          : `<button type="button" class="btn btn-verde" data-testar ${r?.rodando ? 'disabled' : ''}>${r?.rodando ? 'Testando…' : 'Testar agora'}</button>` })}`;
  },
  // 6. Revisar e publicar
  async W => {
    if (!W.qw) throw new Error('Crie o Quick Win antes de publicar.');
    const q = W.qw, a = q.assistente || {}, areas = E.permQw.areas;
    const teste = W.resultado?.qualidade || q.ultimo_teste || null;
    const considera = a.como?.modo === 'explicar' && a.como.texto ? esc(a.como.texto.length > 220 ? `${a.como.texto.slice(0, 220)}…` : a.como.texto)
      : a.como?.modo === 'mostrar' ? 'A estrutura do exemplo que você mostrou.' : 'A estrutura sugerida para esse tipo de trabalho.';
    return `${pergunta('Revise e publique', 'Confira o que a equipe vai usar. Você pode ajustar depois; cada publicação vira uma nova versão.')}
      <ul class="resumo-pub" aria-label="Este Quick Win vai">
        <li><span class="r">Nome</span><div><div class="editavel" id="nome-ver"><span class="valor" id="nome-atual">${esc(q.nome)}</span><button type="button" class="link-sutil" id="editar-nome">Editar</button></div>
          <div class="oculto" id="nome-edicao"><label class="sr" for="nome">Nome do Quick Win</label><input class="entrada" id="nome" maxlength="80" value="${esc(q.nome)}"></div></div></li>
        <li><span class="r">Faz</span><div><div class="editavel" id="desc-ver"><span id="desc-atual">${esc(q.para_que_serve)}</span><button type="button" class="link-sutil" id="editar-desc">Editar</button></div>
          <div class="oculto" id="desc-edicao"><label class="sr" for="desc">O que o Quick Win faz</label><textarea class="entrada" id="desc" rows="2" maxlength="200">${esc(q.para_que_serve)}</textarea></div></div></li>
        <li><span class="r">Considera</span><div>${considera}</div></li>
        <li><span class="r">Respeita</span><ul>${(q.regras_rascunho || []).map(r => `<li>${esc(r)}</li>`).join('')}</ul></li>
        <li><span class="r">Entrega</span><div>${esc(FORMATOS_SAIDA[a.formato]?.rotulo || '')}${a.formato === 'outro' && a.formato_descricao ? ` · ${esc(a.formato_descricao)}` : ''}</div></li>
        <li><span class="r">Teste</span><div>${teste ? painelQualidade(teste, { id: 'revisao' }) || '<span class="dica">A IA pediu mais informação no último teste.</span>' : '<span class="dica">Ainda não testado.</span> <button type="button" class="link-sutil" data-ir-teste>Testar agora</button>'}</div></li>
        ${areas.length > 1 || E.permQw.todaEmpresa ? `<li><span class="r">Quem usa</span><div class="opcoes">${areas.map(x => `<label><input type="checkbox" name="area" value="${x.id}" ${q.areas.includes(x.id) ? 'checked' : ''}> ${esc(x.nome)}</label>`).join('')}
          ${E.permQw.todaEmpresa ? `<label><input type="checkbox" id="toda" ${q.toda_empresa ? 'checked' : ''}> Toda a empresa</label>` : ''}</div></li>` : ''}
      </ul>
      ${rodape(W, { continuar: 'Publicar Quick Win' })}`;
  },
  // 7. Publicado
  W => `<div class="sucesso" role="status"><span class="sucesso-icone" aria-hidden="true">${ICONE.check}</span>
      <h2 id="pergunta" tabindex="-1">Quick Win publicado</h2>
      <p>Agora ele está disponível para sua equipe. Versão atual: v${W.publicado.versao}.</p>
      <div class="linha-botoes"><a class="btn btn-verde btn-grande" href="#/qw/${W.id}/usar">Usar agora</a><a class="btn btn-linha btn-grande" href="#/quick-wins">Voltar para Quick Wins</a></div></div>`,
];

const htmlEstrutura = passos => `<div class="estrutura"><p>A GreenIA seguiria estes passos:</p><ol>${passos.map(p => `<li>${esc(p)}</li>`).join('')}</ol>
  <button type="button" class="btn btn-linha btn-pequeno" id="usar-estrutura">Usar estes passos e ajustar</button></div>`;

function htmlResultado(W) {
  const r = W.resultado;
  if (r.rodando) return `<div class="resultado">${progressoExecucao(r.etapa)}</div>`;
  if (r.erro) return `<div class="resultado">${aviso(esc(r.erro), 'erro')}</div>`;
  const q = r.qualidade, revisar = q?.status === 'inconsistente';
  const corpo = `<div class="resultado-corpo bolha-ia ${revisar ? 'oculto' : ''}" id="resultado-teste">${r.html}</div>`;
  return `<section class="resultado" aria-label="Resultado do teste">
    <div class="resultado-cabeca"><b>Resultado do teste</b>${r.conversa ? `<a class="link-sutil" href="#/c/${r.conversa}">Continuar como conversa</a>` : ''}</div>
    ${revisar ? `${painelQualidade(q, { id: 'teste' })}<div style="margin-top:12px">${corpo}</div>` : `${corpo}${painelQualidade(q, { id: 'teste' })}`}</section>`;
}

// Executa o teste aqui mesmo: conversa de teste (fora da medição), execução explícita, etapas e conferência.
async function testar(W) {
  guardarEtapa(W);
  const texto = W.teste.modo === 'auto' ? W.teste.entradaAuto : W.teste.modo === 'colar' ? W.teste.texto.trim() : 'Faça o trabalho com o arquivo anexado.';
  if (W.teste.modo === 'colar' && !texto) return erroEtapa('Cole um texto para o teste ou use o exemplo pronto.');
  if (W.teste.modo === 'arquivo' && !W.teste.anexo) return erroEtapa('Escolha um arquivo para o teste ou use o exemplo pronto.');
  W.resultado = { rodando: true, etapa: null };
  await desenhar(W, { foco: false });
  try {
    const conv = (await api('/api/conversas', { metodo: 'POST', corpo: { quick_win_id: W.id, teste: true } })).conversa;
    const r = await api(`/api/conversas/${conv.id}/mensagens`, { metodo: 'POST', corpo: { texto, anexos: W.teste.modo === 'arquivo' ? [W.teste.anexo] : [], executar_quick_win: true }, bruto: true });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).mensagem || 'Não foi possível testar agora.');
    let saida = '', fim = null, falha = null;
    await lerEventos(r, ev => {
      if (ev.t === 'etapa') { W.resultado.etapa = ev.v; const t = $('teste-resultado'); if (t) t.innerHTML = htmlResultado(W); }
      if (ev.t === 'texto') saida += ev.v;
      if (ev.t === 'fim') fim = ev;
      if (ev.t === 'erro') falha = ev.mensagem;
    });
    if (falha) throw new Error(falha);
    const { html, tabelas } = renderizar(saida);
    W.resultado = { html, tabelas, qualidade: fim?.qualidade || null, conversa: conv.id };
    W.qw = await api(`/api/quick-wins/${W.id}`);
  } catch (e) { W.resultado = { erro: e.message }; }
  await desenhar(W, { foco: false });
  $('teste-resultado')?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
}

async function publicar(W) {
  const corpo = { nome: $('nome').value.trim() || W.qw.nome, para_que_serve: $('desc').value.trim() || W.qw.para_que_serve };
  if (document.querySelector('input[name=area]') || $('toda')) { corpo.areas = [...document.querySelectorAll('input[name=area]:checked')].map(i => Number(i.value)); corpo.toda_empresa = $('toda')?.checked || false; }
  const b = document.querySelector('[data-continuar]');
  b.disabled = true; b.textContent = 'Publicando…';
  try {
    W.publicado = await api(`/api/quick-wins/${W.id}/publicar`, { metodo: 'POST', corpo });
    W.qw = W.publicado;
    await recarregarLateral();
    W.passo = SUCESSO;
    await desenhar(W);
  } catch (e) { b.disabled = false; b.textContent = 'Publicar Quick Win'; erroEtapa(e.message); }
}

const ETAPA_LIGAR = [
  W => {
    document.querySelectorAll('[data-exemplo]').forEach(b => { b.onclick = () => {
      const [, texto, arq] = EXEMPLOS[Number(b.dataset.exemplo)];
      $('objetivo').value = texto; W.arquetipo = arq; W.descricao = texto; W.sugestao = null; $('objetivo').focus();
    }; });
    $('objetivo').addEventListener('input', () => { W.arquetipo = null; });
    $('objetivo').addEventListener('keydown', ev => { if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) continuar(W); });
  },
  W => {
    const trocar = modo => { guardarEtapa(W); W.modoProc = modo; W.sugestao = null; desenhar(W, { foco: false }).then(() => $(modo === 'exemplo' ? 'exemplo' : 'processo')?.focus()); };
    $('modo-exemplo')?.addEventListener('click', () => trocar('exemplo'));
    $('modo-explicar')?.addEventListener('click', () => trocar('explicar'));
    $('sugerir-estrutura')?.addEventListener('click', async () => {
      try {
        guardarEtapa(W);
        const s = await api('/api/quick-wins/assistente/sugerir', { metodo: 'POST', corpo: { descricao: W.descricao, arquetipo: W.arquetipo } });
        W.estruturaSugerida = s.estruturaPronta;
        $('estrutura').innerHTML = htmlEstrutura(W.estruturaSugerida);
        ligarUsarEstrutura(W);
      } catch (e) { erroEtapa(e.message); }
    });
    ligarUsarEstrutura(W);
    if ($('ex-arquivo')) {
      $('ex-arquivo').onclick = () => $('ex-input').click();
      $('ex-input').onchange = async ev => {
        const f = ev.target.files[0]; if (!f) return;
        $('ex-nome').textContent = 'Lendo o exemplo…';
        try {
          const r = await api('/api/quick-wins/assistente/exemplo', { metodo: 'POST', corpo: { arquivo: await lerArquivo(f) } });
          W.exemplo = r.texto; W.exemploNome = f.name; $('exemplo').value = r.texto; $('ex-nome').textContent = `${f.name}: exemplo lido.`;
        } catch (e) { $('ex-nome').textContent = ''; erroEtapa(e.message); }
      };
    }
  },
  null,
  W => {
    document.querySelectorAll('input[name=saida]').forEach(r => { r.onchange = () => { W.formato = r.value; $('saida-outro').classList.toggle('oculto', r.value !== 'outro'); }; });
  },
  W => {
    document.querySelectorAll('[data-material]').forEach(b => { b.onclick = () => { guardarEtapa(W); W.teste.modo = b.dataset.material; W.resultado = W.resultado?.rodando ? W.resultado : null; desenhar(W, { foco: false }); }; });
    document.querySelectorAll('[data-testar]').forEach(b => { b.onclick = () => testar(W); });
    document.querySelector('[data-ajustar]')?.addEventListener('click', () => irEtapa(W, 0));
    document.querySelector('[data-revisar-assim]')?.addEventListener('click', () => irEtapa(W, REVISAR));
    if ($('teste-arquivo')) {
      $('teste-arquivo').onclick = () => $('teste-input').click();
      $('teste-input').onchange = async ev => { const f = ev.target.files[0]; if (!f) return; try { W.teste.anexo = await lerArquivo(f); $('teste-nome').textContent = f.name; } catch (e) { erroEtapa(e.message); } };
    }
    document.querySelectorAll('#teste-resultado [data-csv]').forEach(b => { b.onclick = () => baixarCsv(W.resultado.tabelas[Number(b.dataset.csv)], `${(W.qw?.nome || 'resultado').replace(/[^\wÀ-ú -]/g, '')}.csv`); });
  },
  W => {
    const editar = (ver, edicao, campo) => { $(ver).classList.add('oculto'); $(edicao).classList.remove('oculto'); $(campo).focus(); };
    $('editar-nome').onclick = () => editar('nome-ver', 'nome-edicao', 'nome');
    $('editar-desc').onclick = () => editar('desc-ver', 'desc-edicao', 'desc');
    document.querySelector('[data-ir-teste]')?.addEventListener('click', () => irEtapa(W, 4));
    document.querySelector('[data-continuar]').onclick = () => publicar(W);
  },
];
function ligarUsarEstrutura(W) {
  $('usar-estrutura')?.addEventListener('click', () => {
    $('processo').value = W.estruturaSugerida.map((p, i) => `${i + 1}. ${p}`).join('\n');
    W.processo = $('processo').value;
    $('processo').focus();
  });
}

// ---- Usar: o que enviar → Executar → resultado (na conversa) ------------------------------------------------
export async function usarQw(id) {
  const qw = await api(`/api/quick-wins/${id}`);
  if (!qw.v2) return irPara(`#/qw/${id}/nova`);
  const teste = !qw.versao;
  if (teste && !qw.podeEditar) return irPara(`#/qw/${id}`);
  const anexos = [];
  $('principal').innerHTML = `${cabecalho('Quick Wins')}
    <div class="pagina"><div class="pg">
      ${cabecalhoPg({ trilha: [['Quick Wins', '#/quick-wins'], [qw.nome, `#/qw/${id}`], ['Usar']], titulo: qw.nome, descricao: esc(qw.para_que_serve || '') })}
      ${teste ? aviso('<b>Ainda não publicado.</b> Esta execução é um teste e não entra na medição.') : ''}
      <form class="usar-caixa" id="executar" novalidate>
        <label class="pergunta" for="entrada-qw" id="pergunta" style="display:block;font-size:20px">${esc(oQueEnviar(qw))}</label>
        <textarea class="campo-amplo" id="entrada-qw" placeholder="Cole o texto aqui ou anexe o arquivo"></textarea>
        <div class="anexos-pendentes" id="anexos-qw" style="margin-top:10px"></div>
        <div id="erro-exec"></div>
        <div class="rodape-usar"><button type="button" class="btn btn-linha" id="anexar-qw">${ICONE.clipe} Anexar arquivo</button><input type="file" id="arquivo-qw" hidden multiple accept="${ACEITOS}">
          <button type="submit" class="btn btn-verde btn-grande" id="executar-btn">Executar</button></div>
      </form>
    </div></div>`;
  ligarCabecalho();
  const desenharAnexos = () => {
    $('anexos-qw').innerHTML = anexos.map((a, i) => `<span class="anexo-chip">${ICONE.doc} ${esc(a.nome)}<button type="button" data-tirar="${i}" aria-label="Tirar ${esc(a.nome)}">×</button></span>`).join('');
    $('anexos-qw').querySelectorAll('[data-tirar]').forEach(b => { b.onclick = () => { anexos.splice(Number(b.dataset.tirar), 1); desenharAnexos(); }; });
  };
  $('anexar-qw').onclick = () => $('arquivo-qw').click();
  $('arquivo-qw').onchange = async ev => {
    for (const f of [...ev.target.files]) {
      if (anexos.length >= 5) { toast('Até 5 anexos por vez.', 6000); break; }
      try { anexos.push(await lerArquivo(f)); } catch (e) { toast(e.message, 6000); }
    }
    ev.target.value = ''; desenharAnexos();
  };
  $('executar').onsubmit = async ev => {
    ev.preventDefault();
    const texto = $('entrada-qw').value.trim();
    if (!texto && !anexos.length) { $('erro-exec').innerHTML = aviso('Cole um texto ou anexe um arquivo.', 'erro'); $('entrada-qw').focus(); return; }
    await vistaConversa({ qw, teste, enviarAgora: { texto: texto || 'Faça o trabalho com o arquivo anexado.', anexos: [...anexos] } });
  };
  $('entrada-qw').focus();
}

// ---- Versões ------------------------------------------------------------------------------------------------
export async function versoesQw(id) {
  const [qw, { versoes }] = await Promise.all([api(`/api/quick-wins/${id}`), api(`/api/quick-wins/${id}/versoes`)]);
  $('principal').innerHTML = `${cabecalho('Quick Wins')}
    <div class="pagina"><div class="pg">
      ${cabecalhoPg({ trilha: [['Quick Wins', '#/quick-wins'], [qw.nome, `#/qw/${id}`], ['Versões']], titulo: 'Versões', descricao: 'Cada publicação vira uma versão. A equipe usa sempre a versão atual.' })}
      ${qw.rascunho_alterado && qw.versao ? aviso(`<b>Rascunho em edição: v${qw.versao + 1}.</b> Ainda não publicado.`, 'info', `<a class="btn btn-linha btn-pequeno" href="#/qw/${id}/teste">Testar nova versão</a><a class="btn btn-verde btn-pequeno" href="#/qw/${id}/publicar">Publicar</a>`) : ''}
      <ul class="execucoes">${versoes.map(v => `<li><div class="execucao" style="padding:14px 4px;display:flex;flex-direction:column;flex:1"><b>v${v.numero}${v.atual ? ' · Versão atual' : ''}</b>
        <span class="dica">${dataCurta(v.publicada_em)}${v.publicada_por ? ` · ${esc(v.publicada_por)}` : ''}${v.teste ? ` · teste ${v.teste === 'inconsistente' ? 'com pontos para revisar' : v.teste === 'parcial' ? 'com conferência incompleta' : 'conferido'}` : ''}</span></div>
        ${v.atual ? '' : `<button type="button" class="btn btn-linha btn-pequeno" data-restaurar="${v.numero}">Restaurar esta versão</button>`}</li>`).join('') || '<li><span class="dica" style="padding:14px 4px">Ainda não publicado.</span></li>'}</ul>
    </div></div>`;
  ligarCabecalho();
  document.querySelectorAll('[data-restaurar]').forEach(b => { b.onclick = async () => {
    if (!confirm(`Voltar para a v${b.dataset.restaurar}? Quem usa passa a receber essa versão agora, e o rascunho passa a ser ela.`)) return;
    await api(`/api/quick-wins/${id}/versoes/${b.dataset.restaurar}/restaurar`, { metodo: 'POST', corpo: {} });
    toast(`v${b.dataset.restaurar} é a versão atual.`); versoesQw(id);
  }; });
}
