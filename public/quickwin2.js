// Quick Wins 2.0 na tela: criar em até 5 etapas numa página só (uma pergunta por vez), testar, publicar,
// versões e o uso simples (entrada → Executar → resultado). Nada técnico aparece: sem prompt, modelo,
// fornecedor, tokens ou JSON. A GreenIA sugere e a pessoa só confirma.
import { api, esc, ICONE, toast } from '/comum.js';
import { E, cabecalho, ligarCabecalho, recarregarLateral, irPara } from '/app.js';
import { vistaConversa } from '/conversa.js';

const $ = id => document.getElementById(id);
const FEEDBACK = { serviu: 'Serviu', ajustes: 'Serviu com ajustes', nao_serviu: 'Não serviu' };
const ACEITOS = '.pdf,.docx,.pptx,.txt,.md,.csv,.xlsx,.png,.jpg,.jpeg,.webp,.tif,.tiff';
const dataCurta = iso => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });

export const lerArquivo = f => new Promise((ok, falha) => {
  if (f.size > 25 * 1024 * 1024) return falha(new Error(`${f.name}: acima de 25 MB. Envie uma versão menor ou só a parte necessária.`));
  const r = new FileReader(); r.onload = () => ok({ nome: f.name, base64: String(r.result).split(',')[1], tamanho: f.size }); r.onerror = () => falha(new Error('Não foi possível ler o arquivo.')); r.readAsDataURL(f);
});

// Resumo da conferência (o mesmo da conversa): só frases simples, com ✓ e texto (nunca só cor).
export function htmlResumoTeste(q) {
  if (!q) return '<p class="dica">Ainda não testado.</p>';
  if (q.status === 'inconsistente') return `<p class="qualidade-linha"><b>Teste com inconsistência.</b> ${esc((q.problemas || []).join(' '))}</p>`;
  if (q.status === 'parcial') return '<p class="qualidade-linha"><b>Teste feito, conferência incompleta.</b> A conferência completa não pôde ser feita agora. Revise antes de usar.</p>';
  const itens = (q.itens || []).filter(i => i.conferido && i.ok);
  return `<ul class="qualidade-itens"><li><b>Teste concluído ✓</b></li>${itens.map(i => `<li>${esc(i.rotulo)} ✓</li>`).join('')}</ul>`;
}

// ---- Criação e ajuste (5 etapas) ----------------------------------------------------------------------------
const ETAPAS = ['O que você quer que a IA faça?', 'Como você normalmente faz isso?', 'Regras importantes', 'Como o resultado deve ser entregue?', 'Testar'];

export async function assistenteQw(id = null) {
  const qw = id ? await api(`/api/quick-wins/${id}`) : null;
  if (qw && !qw.podeEditar) return irPara(`#/qw/${id}`);
  const o = qw?.assistente || {};
  const W = {
    id, passo: 0, descricao: o.descricao || '', arquetipo: o.arquetipo || null,
    como: { modo: o.como?.modo || null, texto: o.como?.texto || '', exemplo: '', exemploNome: '', estruturaAnterior: o.exemplo || null },
    sugestao: null, regras: new Set(o.regras || []), formato: o.formato || null, formatoDescricao: o.formato_descricao || '', teste: { modo: 'auto', texto: '', anexo: null },
  };
  const { sugestoes } = await api('/api/quick-wins/assistente/sugerir', { metodo: 'POST', corpo: { descricao: '' } });
  $('principal').innerHTML = `${cabecalho(qw ? `Ajustar: ${qw.nome}` : 'Criar Quick Win')}
    <div class="pagina"><div class="pagina-dentro assistente" id="assistente">
      <p class="lead">${qw ? 'Mude o que precisar. O time continua usando a versão atual até você publicar a nova.' : 'Descreva o trabalho com suas palavras. A GreenIA monta o resto e você só confere.'}</p>
      <p class="dica" id="progresso" aria-live="polite"></p>
      <ol class="qw-etapas" id="etapas"></ol>
      ${qw ? '' : '<p class="dica" style="margin-top:18px">Prefere partir de um Quick Win pronto ou duplicar um existente? <a href="#/qw/nova/modelos">Ver opções prontas</a>.</p>'}
    </div></div>`;
  ligarCabecalho();

  const resumoDe = i => {
    if (i === 0) return esc(W.descricao || W.sugestao?.nome || sugestoes.find(x => x.id === W.arquetipo)?.rotulo || '');
    if (i === 1) return { explicar: 'Você explicou como faz.', mostrar: W.como.exemploNome ? `Exemplo: ${esc(W.como.exemploNome)}` : 'Você mostrou um exemplo.', pronto: 'Estrutura sugerida pela GreenIA.' }[W.como.modo] || 'Estrutura sugerida pela GreenIA.';
    if (i === 2) return esc([...W.regras].map(r => W.sugestao?.regras.find(x => x.id === r)?.rotulo).filter(Boolean).join(' · '));
    if (i === 3) return esc(W.sugestao?.formato.opcoes.find(x => x.id === W.formato)?.rotulo || '');
    return '';
  };
  const corpoDe = i => {
    if (i === 0) return `
      <label class="legenda" for="descricao">Escreva com suas palavras</label>
      <textarea class="entrada" id="descricao" rows="3" maxlength="1000" placeholder="Ex.: Analisar propostas comerciais e apontar riscos e o que falta">${esc(W.descricao)}</textarea>
      <p class="dica" id="dica-sug">Ou escolha um ponto de partida:</p>
      <div class="chips" role="group" aria-labelledby="dica-sug">${sugestoes.map(x => `<button type="button" class="chip" data-arq="${x.id}" aria-pressed="${W.arquetipo === x.id}">${esc(x.rotulo)}</button>`).join('')}</div>`;
    if (i === 1) return `
      <fieldset class="cartoes-opcao"><legend class="sr">Como você faz</legend>
        ${[['explicar', 'Explicar', 'Conte o passo a passo'], ['mostrar', 'Mostrar', 'Envie um exemplo de resultado bom'], ['pronto', 'Começar pronto', 'Use a estrutura sugerida']].map(([v, r, d]) => `
          <label class="cartao-opcao"><input type="radio" name="como" value="${v}" ${W.como.modo === v ? 'checked' : ''}><span><b>${r}</b><span>${d}</span></span></label>`).join('')}
      </fieldset>
      <div id="como-corpo"></div>
      <p class="dica">Nada aqui é obrigatório: se preferir, só continue.</p>`;
    if (i === 2) return `
      <p class="dica">A GreenIA escolheu estas regras para o seu trabalho. Tire o que não fizer sentido.</p>
      <fieldset class="regras"><legend class="sr">Regras</legend>
        ${W.sugestao.regras.map(r => `<label><input type="checkbox" name="regra" value="${r.id}" ${W.regras.has(r.id) || r.travada ? 'checked' : ''} ${r.travada ? 'disabled' : ''}> ${esc(r.rotulo)}${r.travada ? ' <span class="dica">(sempre ligada)</span>' : ''}</label>`).join('')}
      </fieldset>`;
    if (i === 3) return `
      <p class="sugerido" id="motivo-formato"><b>Sugestão:</b> ${esc(W.sugestao.formato.motivo)}</p>
      <fieldset class="cartoes-opcao"><legend class="sr">Formato</legend>
        ${W.sugestao.formato.opcoes.map(f => `<label class="cartao-opcao"><input type="radio" name="formato" value="${f.id}" ${W.formato === f.id ? 'checked' : ''}><span><b>${esc(f.rotulo)}</b>${f.id === W.sugestao.formato.sugerido ? '<span>Sugerido</span>' : ''}</span></label>`).join('')}
      </fieldset>
      <div id="formato-outro" class="${W.formato === 'outro' ? '' : 'oculto'}"><label class="legenda" for="formato-descricao">Como deve ser? (opcional)</label>
        <input class="entrada" id="formato-descricao" maxlength="200" value="${esc(W.formatoDescricao || W.sugestao.formato.descricao || '')}" placeholder="Ex.: mensagem pronta para enviar"></div>`;
    return `
      <p class="dica">O teste roda o Quick Win completo, com a conferência de qualidade. Não entra na medição.</p>
      <fieldset class="cartoes-opcao"><legend class="sr">Material do teste</legend>
        ${[['auto', 'Usar um exemplo automático', 'A GreenIA gera um material fictício'], ['colar', 'Colar um texto', 'Cole um trecho do seu dia a dia'], ['anexar', 'Anexar um arquivo', 'PDF, Word, planilha ou imagem com texto']].map(([v, r, d]) => `
          <label class="cartao-opcao"><input type="radio" name="teste" value="${v}" ${W.teste.modo === v ? 'checked' : ''}><span><b>${r}</b><span>${d}</span></span></label>`).join('')}
      </fieldset>
      <div id="teste-corpo"></div>`;
  };
  const botoesDe = i => i === 4 ? '<button type="button" class="btn btn-verde" data-avancar>Testar agora</button>'
    : i === 3 ? `<button type="button" class="btn btn-verde" data-avancar>${W.formato === W.sugestao?.formato.sugerido ? 'Usar o sugerido' : 'Continuar'}</button>`
    : i === 1 && !W.como.modo ? '<button type="button" class="btn btn-verde" data-avancar>Continuar</button> <button type="button" class="btn btn-texto" data-pular>Pular</button>'
    : '<button type="button" class="btn btn-verde" data-avancar>Continuar</button>';

  function desenhar(foco = true) {
    $('progresso').textContent = `Etapa ${W.passo + 1} de ${ETAPAS.length}: ${ETAPAS[W.passo]}`;
    $('etapas').innerHTML = ETAPAS.map((t, i) => i < W.passo
      ? `<li class="qw-etapa feita"><div><b>${t}</b><span>${resumoDe(i) || '—'}</span></div><button type="button" class="btn btn-texto btn-pequeno" data-voltar="${i}" aria-label="Alterar: ${t}">Alterar</button></li>`
      : i === W.passo ? `<li class="qw-etapa atual"><h2 tabindex="-1" id="titulo-etapa"><span class="passo-n" aria-hidden="true">${i + 1}</span> ${t}</h2>${corpoDe(i)}<p class="msg-erro oculto" id="erro-etapa" role="alert"></p><div class="linha-botoes">${botoesDe(i)}</div></li>`
      : `<li class="qw-etapa futura" aria-hidden="true"><span class="passo-n">${i + 1}</span> ${t}</li>`).join('');
    ligarEtapa();
    if (foco) $('titulo-etapa')?.focus();
  }
  const erroEtapa = msg => { const e = $('erro-etapa'); e.textContent = msg; e.classList.remove('oculto'); };

  function ligarEtapa() {
    document.querySelectorAll('[data-voltar]').forEach(b => { b.onclick = () => { W.passo = Number(b.dataset.voltar); desenhar(); }; });
    document.querySelectorAll('[data-pular]').forEach(b => { b.onclick = () => { W.como.modo = 'pronto'; avancar(); }; });
    document.querySelector('[data-avancar]').onclick = () => avancar().catch(e => erroEtapa(e.message));
    if (W.passo === 0) {
      document.querySelectorAll('[data-arq]').forEach(b => { b.onclick = () => {
        W.arquetipo = W.arquetipo === b.dataset.arq ? null : b.dataset.arq;
        document.querySelectorAll('[data-arq]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.arq === W.arquetipo)));
      }; });
      $('descricao').addEventListener('keydown', ev => { if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) document.querySelector('[data-avancar]').click(); });
    }
    if (W.passo === 1) {
      const corpo = () => {
        const m = document.querySelector('input[name=como]:checked')?.value || null;
        W.como.modo = m;
        $('como-corpo').innerHTML = m === 'explicar' ? `<label class="legenda" for="como-texto">Como você faz hoje, passo a passo</label><textarea class="entrada" id="como-texto" rows="5" maxlength="3000" placeholder="1. Abro a proposta.\n2. Confiro valor, prazo e multa.\n3. Anoto o que falta.">${esc(W.como.texto)}</textarea>`
          : m === 'mostrar' ? `<div class="linha-botoes"><button type="button" class="btn btn-linha" id="ex-arquivo">${ICONE.clipe} Enviar um exemplo</button><input type="file" id="ex-input" hidden accept="${ACEITOS}"><span class="dica" id="ex-nome">${esc(W.como.exemploNome || (W.como.estruturaAnterior ? 'Exemplo já analisado. Envie outro se quiser trocar.' : ''))}</span></div>
              <label class="legenda" for="ex-texto" style="margin-top:10px">Ou cole o exemplo aqui</label><textarea class="entrada" id="ex-texto" rows="4" maxlength="8000">${esc(W.como.exemplo)}</textarea>`
          : m === 'pronto' ? `<div class="estrutura-pronta"><b>A GreenIA vai seguir estes passos:</b><ol id="passos-prontos"><li class="dica">Carregando…</li></ol></div>` : '';
        const botao = document.querySelector('[data-avancar]');
        if (botao) { botao.parentElement.innerHTML = botoesDe(1); ligarBotoes(); }
        if (m === 'mostrar') {
          $('ex-arquivo').onclick = () => $('ex-input').click();
          $('ex-input').onchange = async ev => {
            const f = ev.target.files[0]; if (!f) return;
            $('ex-nome').textContent = 'Lendo o exemplo…';
            try {
              const r = await api('/api/quick-wins/assistente/exemplo', { metodo: 'POST', corpo: { arquivo: await lerArquivo(f) } });
              W.como.exemplo = r.texto; W.como.exemploNome = f.name; $('ex-texto').value = r.texto; $('ex-nome').textContent = `${f.name}: exemplo lido.`;
            } catch (e) { $('ex-nome').textContent = ''; erroEtapa(e.message); }
          };
        }
        if (m === 'pronto') api('/api/quick-wins/assistente/sugerir', { metodo: 'POST', corpo: { descricao: W.descricao, arquetipo: W.arquetipo } })
          .then(s => { if ($('passos-prontos')) $('passos-prontos').innerHTML = s.estruturaPronta.map(p => `<li>${esc(p)}</li>`).join(''); }).catch(() => {});
      };
      const ligarBotoes = () => {
        document.querySelector('[data-avancar]').onclick = () => avancar().catch(e => erroEtapa(e.message));
        document.querySelectorAll('[data-pular]').forEach(b => { b.onclick = () => { W.como.modo = 'pronto'; avancar().catch(e => erroEtapa(e.message)); }; });
      };
      document.querySelectorAll('input[name=como]').forEach(r => { r.onchange = corpo; });
      corpo();
    }
    if (W.passo === 3) {
      document.querySelectorAll('input[name=formato]').forEach(r => { r.onchange = () => {
        W.formato = r.value; $('formato-outro').classList.toggle('oculto', r.value !== 'outro');
        document.querySelector('[data-avancar]').textContent = W.formato === W.sugestao.formato.sugerido ? 'Usar o sugerido' : 'Continuar';
      }; });
    }
    if (W.passo === 4) {
      const corpo = () => {
        W.teste.modo = document.querySelector('input[name=teste]:checked')?.value || 'auto';
        $('teste-corpo').innerHTML = W.teste.modo === 'colar' ? `<label class="legenda" for="teste-texto">Texto do teste</label><textarea class="entrada" id="teste-texto" rows="5">${esc(W.teste.texto)}</textarea>`
          : W.teste.modo === 'anexar' ? `<div class="linha-botoes"><button type="button" class="btn btn-linha" id="teste-arquivo">${ICONE.clipe} Escolher arquivo</button><input type="file" id="teste-input" hidden accept="${ACEITOS}"><span class="dica" id="teste-nome">${esc(W.teste.anexo?.nome || '')}</span></div>`
          : '<p class="dica">Material fictício, parecido com o do seu trabalho. Nada real é usado.</p>';
        if (W.teste.modo === 'anexar') {
          $('teste-arquivo').onclick = () => $('teste-input').click();
          $('teste-input').onchange = async ev => { const f = ev.target.files[0]; if (!f) return; try { W.teste.anexo = await lerArquivo(f); $('teste-nome').textContent = f.name; } catch (e) { erroEtapa(e.message); } };
        }
      };
      document.querySelectorAll('input[name=teste]').forEach(r => { r.onchange = corpo; });
      corpo();
    }
  }

  const sugerir = async () => {
    W.sugestao = await api('/api/quick-wins/assistente/sugerir', { metodo: 'POST', corpo: { descricao: W.descricao, arquetipo: W.arquetipo, como: { modo: W.como.modo, texto: W.como.texto, exemplo: W.como.exemplo } } });
    if (!W.regras.size || W.regras.size === 1) W.regras = new Set(W.sugestao.regras.filter(r => r.marcada).map(r => r.id));
    // Regras que a pessoa já tinha escolhido e continuam no catálogo sugerido; "não inventar" sempre.
    W.regras.add('nao_inventar');
    if (!W.formato || W.como.modo === 'mostrar') W.formato = W.sugestao.formato.sugerido;
  };

  async function salvar() {
    const assistente = { descricao: W.descricao, arquetipo: W.arquetipo, como: { modo: W.como.modo || 'pronto', texto: W.como.texto, exemplo: W.como.exemplo },
      regras: [...W.regras], formato: W.formato, formato_descricao: W.formato === 'outro' ? W.formatoDescricao : '' };
    if (W.id) return api(`/api/quick-wins/${W.id}`, { metodo: 'PUT', corpo: { assistente } });
    const areas = E.permQw.areas.slice(0, 1).map(a => a.id);
    return api('/api/quick-wins', { metodo: 'POST', corpo: { assistente, areas, toda_empresa: !areas.length && E.permQw.todaEmpresa } });
  }

  async function avancar() {
    if (W.passo === 0) {
      W.descricao = $('descricao').value.trim();
      if (!W.descricao && !W.arquetipo) return erroEtapa('Escreva o que a IA deve fazer ou escolha um ponto de partida.');
      if (!W.descricao && W.arquetipo === 'outro') return erroEtapa('Conte com suas palavras o que a IA deve fazer.');
    }
    if (W.passo === 1) {
      if (W.como.modo === 'explicar') W.como.texto = $('como-texto')?.value.trim() || '';
      if (W.como.modo === 'mostrar') W.como.exemplo = $('ex-texto')?.value.trim() || '';
      await sugerir();
    }
    if (W.passo === 0 && !W.sugestao) await sugerir();
    if (W.passo === 2) W.regras = new Set(['nao_inventar', ...[...document.querySelectorAll('input[name=regra]:checked')].map(i => i.value)]);
    if (W.passo === 3) { W.formato = document.querySelector('input[name=formato]:checked')?.value || W.sugestao.formato.sugerido; W.formatoDescricao = $('formato-descricao')?.value.trim() || ''; }
    if (W.passo === 4) return testar();
    W.passo++;
    desenhar();
  }

  async function testar() {
    const botao = document.querySelector('[data-avancar]');
    botao.disabled = true; botao.textContent = 'Preparando o teste…';
    try {
      if (W.teste.modo === 'colar') { W.teste.texto = $('teste-texto').value.trim(); if (!W.teste.texto) throw new Error('Cole um texto para o teste ou use o exemplo automático.'); }
      if (W.teste.modo === 'anexar' && !W.teste.anexo) throw new Error('Escolha um arquivo para o teste ou use o exemplo automático.');
      const q = await salvar();
      W.id = q.id;
      await recarregarLateral();
      const texto = W.teste.modo === 'auto' ? (await api(`/api/quick-wins/assistente/entrada-teste?arquetipo=${encodeURIComponent(q.arquetipo || '')}`)).texto
        : W.teste.modo === 'colar' ? W.teste.texto : 'Faça o trabalho com o arquivo anexado.';
      history.replaceState(null, '', `#/qw/${q.id}/teste`);
      await vistaConversa({ qw: q, teste: true, enviarAgora: { texto, anexos: W.teste.modo === 'anexar' ? [W.teste.anexo] : [] } });
    } catch (e) { botao.disabled = false; botao.textContent = 'Testar agora'; erroEtapa(e.message); }
  }

  if (qw) { await sugerir().catch(() => {}); }
  desenhar(false);
  $('descricao')?.focus();
}

// ---- Publicar -----------------------------------------------------------------------------------------------
export async function publicarQw(id) {
  const qw = await api(`/api/quick-wins/${id}`);
  if (!qw.podeEditar || !qw.v2) return irPara(`#/qw/${id}`);
  const areas = E.permQw.areas;
  let nome = qw.nome, desc = qw.para_que_serve;
  $('principal').innerHTML = `${cabecalho('Publicar Quick Win')}
    <div class="pagina"><div class="pagina-dentro publicar">
      <section class="grupo-form" aria-labelledby="t-nome"><h3 id="t-nome">Nome</h3>
        <p class="nome-sugerido" id="nome-atual">${esc(nome)}</p>
        <div class="linha-botoes" id="nome-botoes"><button type="button" class="btn btn-linha" id="usar-nome" aria-pressed="true">Usar este nome</button><button type="button" class="btn btn-texto" id="editar-nome">Editar</button></div>
        <div class="oculto" id="nome-edicao"><label class="legenda" for="nome">Nome do Quick Win</label><input class="entrada" id="nome" maxlength="80" value="${esc(nome)}"></div></section>
      <section class="grupo-form" aria-labelledby="t-desc"><h3 id="t-desc">Descrição</h3>
        <p id="desc-atual">${esc(desc)}</p><button type="button" class="btn btn-texto btn-pequeno" id="editar-desc">Editar</button>
        <div class="oculto" id="desc-edicao"><label class="legenda" for="desc">Descrição (aparece para quem vai usar)</label><textarea class="entrada" id="desc" rows="2" maxlength="200">${esc(desc)}</textarea></div></section>
      <section class="grupo-form" aria-labelledby="t-teste"><h3 id="t-teste">Resultado do teste</h3>${htmlResumoTeste(qw.ultimo_teste)}
        <p><a href="#/qw/${id}/teste">Testar de novo</a></p></section>
      <section class="grupo-form" aria-labelledby="t-regras"><h3 id="t-regras">Regras principais</h3><ul>${(qw.regras_rascunho || []).map(r => `<li>${esc(r)}</li>`).join('')}</ul></section>
      ${areas.length > 1 || E.permQw.todaEmpresa ? `<section class="grupo-form" aria-labelledby="t-quem"><h3 id="t-quem">Quem vai usar</h3><div class="opcoes">
        ${areas.map(a => `<label><input type="checkbox" name="area" value="${a.id}" ${qw.areas.includes(a.id) ? 'checked' : ''}> ${esc(a.nome)}</label>`).join('')}
        ${E.permQw.todaEmpresa ? `<label><input type="checkbox" id="toda" ${qw.toda_empresa ? 'checked' : ''}> Toda a empresa</label>` : ''}</div><p></p></section>` : ''}
      <p class="msg-erro oculto" id="erro-pub" role="alert"></p>
      <div class="linha-botoes"><button type="button" class="btn btn-verde btn-grande" id="publicar">Publicar Quick Win</button><a class="btn btn-texto" href="#/qw/${id}/ajustar">Ajustar Quick Win</a></div>
    </div></div>`;
  ligarCabecalho();
  $('editar-nome').onclick = () => { $('nome-edicao').classList.remove('oculto'); $('nome-botoes').classList.add('oculto'); $('nome-atual').classList.add('oculto'); $('nome').focus(); };
  $('usar-nome').onclick = () => toast('Nome mantido.');
  $('editar-desc').onclick = () => { $('desc-edicao').classList.remove('oculto'); $('desc-atual').classList.add('oculto'); $('editar-desc').classList.add('oculto'); $('desc').focus(); };
  $('publicar').onclick = async () => {
    const corpo = { nome: $('nome').value.trim() || nome, para_que_serve: $('desc').value.trim() || desc };
    if (document.querySelector('input[name=area]') || $('toda')) { corpo.areas = [...document.querySelectorAll('input[name=area]:checked')].map(i => Number(i.value)); corpo.toda_empresa = $('toda')?.checked || false; }
    $('publicar').disabled = true;
    try {
      const q = await api(`/api/quick-wins/${id}/publicar`, { metodo: 'POST', corpo });
      await recarregarLateral();
      toast(`Quick Win publicado. Versão atual: v${q.versao}.`);
      irPara(`#/qw/${id}`);
    } catch (e) { $('publicar').disabled = false; $('erro-pub').textContent = e.message; $('erro-pub').classList.remove('oculto'); }
  };
}

// ---- Versões ------------------------------------------------------------------------------------------------
export async function versoesQw(id) {
  const [qw, { versoes }] = await Promise.all([api(`/api/quick-wins/${id}`), api(`/api/quick-wins/${id}/versoes`)]);
  $('principal').innerHTML = `${cabecalho(`Versões: ${qw.nome}`)}
    <div class="pagina"><div class="pagina-dentro">
      ${qw.rascunho_alterado ? `<div class="aviso-teste" role="status"><span>Há mudanças ainda não publicadas.</span><a class="btn btn-linha btn-pequeno" href="#/qw/${id}/teste">Testar nova versão</a><a class="btn btn-verde btn-pequeno" href="#/qw/${id}/publicar">Publicar</a></div>` : ''}
      <div class="lista">${versoes.map(v => `<div class="lista-item"><span class="principal-texto"><b>v${v.numero}${v.atual ? ' · Versão atual' : ''}</b>
        <span>${dataCurta(v.publicada_em)}${v.publicada_por ? ` · ${esc(v.publicada_por)}` : ''}${v.teste ? ` · teste ${v.teste === 'inconsistente' ? 'com inconsistência' : 'concluído'}` : ''}</span></span>
        ${v.atual ? '' : `<button type="button" class="btn btn-linha btn-pequeno" data-restaurar="${v.numero}">Restaurar versão anterior</button>`}</div>`).join('') || '<div class="lista-item"><span class="dica">Ainda não publicado.</span></div>'}</div>
      <p><a href="#/qw/${id}">Voltar</a></p>
    </div></div>`;
  ligarCabecalho();
  document.querySelectorAll('[data-restaurar]').forEach(b => { b.onclick = async () => {
    if (!confirm(`Voltar para a v${b.dataset.restaurar}? Quem usa passa a receber essa versão agora.`)) return;
    await api(`/api/quick-wins/${id}/versoes/${b.dataset.restaurar}/restaurar`, { metodo: 'POST', corpo: {} });
    toast(`v${b.dataset.restaurar} é a versão atual.`); versoesQw(id);
  }; });
}

// ---- Uso simples: entrada → Executar → resultado ------------------------------------------------------------
export function paginaQw2(qw, lista) {
  const id = qw.id;
  const anexos = [];
  const podeUsar = qw.versao || qw.podeEditar;
  $('principal').innerHTML = `${cabecalho(qw.nome, qw.versao ? `<span class="selo">Versão atual: v${qw.versao}</span>` : '<span class="selo selo-ambar">Ainda não publicado</span>')}
    <div class="pagina"><div class="pagina-dentro">
      <div class="qw-topo"><span class="passo" style="background:${esc(qw.cor)};color:#fff;margin:0">${esc((qw.icone || qw.nome[0] || '').slice(0, 2))}</span>
        <div><h2>${esc(qw.nome)}</h2><p class="lead">${esc(qw.para_que_serve)}</p></div></div>
      ${qw.podeEditar ? `<nav class="linha-botoes gestao-qw" aria-label="Gerenciar este Quick Win">
        <a class="btn btn-linha btn-pequeno" href="#/qw/${id}/ajustar">Ajustar Quick Win</a><a class="btn btn-linha btn-pequeno" href="#/qw/${id}/teste">Testar</a>
        ${qw.rascunho_alterado ? `<a class="btn btn-verde btn-pequeno" href="#/qw/${id}/publicar">Publicar</a>` : ''}
        ${qw.versao ? `<a class="btn btn-texto btn-pequeno" href="#/qw/${id}/versoes">Versões</a>` : ''}<a class="btn btn-texto btn-pequeno" href="#/qw/${id}/editar">Acesso e dados</a></nav>` : ''}
      ${podeUsar ? `<form class="executar" id="executar" novalidate>
        <label class="legenda" for="entrada-qw">O que você quer analisar?</label>
        <textarea class="entrada" id="entrada-qw" rows="5" placeholder="Cole o texto aqui ou anexe o arquivo"></textarea>
        <div class="anexos-pendentes" id="anexos-qw"></div>
        <p class="msg-erro oculto" id="erro-exec" role="alert"></p>
        <div class="linha-botoes"><button type="button" class="btn btn-linha" id="anexar-qw">${ICONE.clipe} Anexar arquivo</button><input type="file" id="arquivo-qw" hidden multiple accept="${ACEITOS}">
          <button type="submit" class="btn btn-verde btn-grande" id="executar-btn">Executar</button></div>
      </form>` : ''}
      <h3>Suas execuções</h3>
      ${lista.conversas.length ? `<div class="lista">${lista.conversas.map(c => `<a class="lista-item" href="#/c/${c.id}"><span class="principal-texto"><b>${esc(c.titulo)}</b>
        <span>${dataCurta(c.atualizado_em)} · ${c.feedback ? FEEDBACK[c.feedback] : c.tem_resposta ? 'sem retorno ainda' : 'sem resposta'}</span></span></a>`).join('')}</div>` : '<p class="dica">Nenhuma execução ainda.</p>'}
    </div></div>`;
  ligarCabecalho();
  if (!podeUsar) return;
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
    if (!texto && !anexos.length) { $('erro-exec').textContent = 'Cole um texto ou anexe um arquivo.'; $('erro-exec').classList.remove('oculto'); $('entrada-qw').focus(); return; }
    // Quem gere e ainda não publicou executa o rascunho em modo de teste.
    const teste = !qw.versao;
    await vistaConversa({ qw, teste, enviarAgora: { texto: texto || 'Faça o trabalho com o arquivo anexado.', anexos: [...anexos] } });
  };
}
