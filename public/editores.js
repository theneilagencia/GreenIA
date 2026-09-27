// Editores de marca e de landing page, usados pelo console da plataforma e pelo admin da empresa.
// A tela chama render*() para montar o formulário e ler*() para montar o corpo da requisição.
import { esc } from '/comum.js';
import { avisoCor, corLegivelOk } from '/cor.js';

export const ROTULOS_MARCA = {
  display_name: 'Nome exibido', logo: 'Logomarca', favicon: 'Favicon', primary_color: 'Cor principal', secondary_color: 'Cor secundária',
  login_title: 'Título da tela de login', login_text: 'Texto da tela de login', privacy_note: 'Aviso de privacidade',
};

// Imagem enviada pelo navegador vira data: URL, conferida no servidor (tipo e tamanho).
// Imagem escolhida pela pessoa é ajustada no navegador antes do envio: redimensiona e comprime até
// caber no limite. Logo grande, foto do celular ou favicon em JPG funcionam sem a pessoa precisar
// editar o arquivo. SVG vai como está (só o tamanho é conferido).
const lerComoDataUrl = f => new Promise((ok, falha) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => falha(new Error('Não foi possível ler o arquivo.')); r.readAsDataURL(f); });
const kbDe = dataUrl => Math.max(1, Math.round((dataUrl.length - dataUrl.indexOf(',') - 1) * 3 / 4 / 1024));
export async function ajustarImagem(f, { maxKb, largura, altura, quadrado = false, formatos = ['image/webp', 'image/png', 'image/jpeg'] }) {
  if (!f) return null;
  if (f.type === 'image/svg+xml' || /\.svg$/i.test(f.name)) {
    if (f.size > maxKb * 1024) throw new Error(`O SVG tem ${Math.round(f.size / 1024)} KB; o máximo é ${maxKb} KB.`);
    return (await lerComoDataUrl(f)).replace(/^data:[^;]*;/, 'data:image/svg+xml;');
  }
  // data: e não blob:, que a política de segurança das páginas não permite em imagens.
  const url = await lerComoDataUrl(f);
  {
    const img = await new Promise((ok, falha) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => falha(new Error('Este arquivo não é uma imagem que o navegador consiga abrir. Use PNG, JPG, WEBP ou SVG.')); i.src = url; });
    for (const escala of [1, 0.75, 0.5, 0.35]) {
      const r = Math.min(1, largura / img.naturalWidth, altura / img.naturalHeight) * escala;
      const w = quadrado ? Math.round(largura * escala) : Math.max(1, Math.round(img.naturalWidth * r)), h = quadrado ? w : Math.max(1, Math.round(img.naturalHeight * r));
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const g = c.getContext('2d');
      if (quadrado) { const lado = Math.min(img.naturalWidth, img.naturalHeight); g.drawImage(img, (img.naturalWidth - lado) / 2, (img.naturalHeight - lado) / 2, lado, lado, 0, 0, w, h); }
      else g.drawImage(img, 0, 0, w, h);
      for (const tipo of formatos) for (const q of [0.9, 0.8, 0.65]) {
        const d = c.toDataURL(tipo, q);
        if (!d.startsWith(`data:${tipo}`)) continue;   // navegador sem esse formato
        if (kbDe(d) <= maxKb) return d;
        if (tipo === 'image/png') break;              // PNG não tem qualidade: tenta o próximo formato
      }
    }
    throw new Error(`Não foi possível deixar a imagem abaixo de ${maxKb} KB. Tente um arquivo mais simples.`);
  }
}
export const AJUSTE_IMAGEM = {
  logo: { maxKb: 200, largura: 600, altura: 240 },
  favicon: { maxKb: 60, largura: 64, altura: 64, quadrado: true, formatos: ['image/png'] },
  imagem: { maxKb: 780, largura: 1600, altura: 1600, formatos: ['image/webp', 'image/jpeg'] },
};

export function lerImagem(input, maxKb) {
  return new Promise((ok, falha) => {
    const f = input.files?.[0];
    if (!f) return ok(null);
    if (f.size > maxKb * 1024) return falha(new Error(`Arquivo acima de ${maxKb} KB.`));
    const r = new FileReader();
    r.onload = () => ok(r.result);
    r.onerror = () => falha(new Error('Não foi possível ler o arquivo.'));
    r.readAsDataURL(f);
  });
}

const trava = (k, bloqueados, modo) => {
  if (modo === 'plataforma') return `<label class="dica" style="display:inline-flex;gap:6px;align-items:center;margin-left:8px"><input type="checkbox" data-bloqueio="${k}" ${bloqueados.includes(k) ? 'checked' : ''}> bloquear para a empresa</label>`;
  return bloqueados.includes(k) ? '<span class="selo selo-cinza" style="margin-left:8px">Definido pelo operador da plataforma</span>' : '';
};
const desab = (k, bloqueados, modo, pode) => (!pode || (modo === 'empresa' && bloqueados.includes(k)) ? 'disabled' : '');

export function renderMarca(m, { modo = 'empresa', pode = true } = {}) {
  const b = m.locked || [];
  const campo = (k, html) => `<div class="campo"><label for="mk-${k}">${ROTULOS_MARCA[k]}${trava(k, b, modo)}</label>${html}</div>`;
  const cor = k => campo(k, `<div style="display:flex;gap:8px;align-items:center"><input type="color" id="mk-${k}-sel" value="${esc(m[k] || '#1B7950')}" ${desab(k, b, modo, pode)} style="width:44px;height:38px;border:1px solid var(--line-strong);border-radius:8px;background:none">
    <input class="entrada" id="mk-${k}" value="${esc(m[k] || '')}" placeholder="#1B7950" maxlength="7" style="max-width:140px" ${desab(k, b, modo, pode)}></div>
    ${k === 'primary_color' ? '<span class="ajuda">Usada nos botões (com texto branco por cima) e nos links. Precisa ser escura o bastante para o texto ser lido.</span><div class="aviso-cor" id="mk-primary_color-aviso" aria-live="polite"></div>' : ''}`);
  const img = (k, dica) => campo(k, `<div class="previa-marca" id="mk-${k}-previa">${m[k] ? `<img src="${esc(m[k])}" alt="">` : '<span class="dica">Nenhum arquivo</span>'}</div>
    <div class="linha-botoes"><input type="file" id="mk-${k}" accept="image/png,image/jpeg,image/webp,image/svg+xml${k === 'favicon' ? ',image/x-icon' : ''}" ${desab(k, b, modo, pode)}>
    ${m[k] ? `<button type="button" class="btn-texto" data-remover="${k}" ${desab(k, b, modo, pode)}>Remover</button>` : ''}</div><span class="ajuda">${dica}</span>`);
  // Textos: já vêm com um exemplo. "Usar o texto de exemplo" devolve o modelo, se a pessoa apagou ou mudou.
  const texto = (k, dica, max, linhas) => campo(k, `${linhas > 1
    ? `<textarea class="entrada" id="mk-${k}" rows="${linhas}" maxlength="${max}" placeholder="${esc(m.modelo?.[k] || '')}" ${desab(k, b, modo, pode)}>${esc(m[k])}</textarea>`
    : `<input class="entrada" id="mk-${k}" value="${esc(m[k])}" maxlength="${max}" placeholder="${esc(m.modelo?.[k] || '')}" ${desab(k, b, modo, pode)}>`}
    <span class="ajuda">${dica}${m.modelo?.[k] && pode && !desab(k, b, modo, pode) ? ` <button type="button" class="btn-texto btn-pequeno" data-exemplo="${k}" ${m[k] === m.modelo[k] ? 'hidden' : ''}>Usar o texto de exemplo</button>` : ''}</span>`);
  return `<form id="form-marca" novalidate>
    ${!pode ? '<div class="faixa-aviso atencao">A identidade visual desta empresa é gerenciada pelo operador da plataforma. Você pode ver, mas não alterar.</div>' : ''}
    <div class="previa-marca" id="mk-previa" aria-label="Prévia"><img src="${esc(m.logo || '/assets/greenia-marca.svg')}" alt=""><b id="mk-previa-nome">${esc(m.display_name)}</b>
      <span class="cor" id="mk-previa-p" style="background:${esc(m.primary_color || '#1B7950')}"></span><span class="cor" id="mk-previa-s" style="background:${esc(m.secondary_color || '#F3F3F1')}"></span></div>
    <div class="grade-2">
      <div>${campo('display_name', `<input class="entrada" id="mk-display_name" value="${esc(m.display_name)}" maxlength="80" ${desab('display_name', b, modo, pode)}>`)}
        ${cor('primary_color')}${cor('secondary_color')}</div>
      <div>${img('logo', 'PNG, JPG, WEBP ou SVG, de qualquer tamanho: a imagem é ajustada sozinha. Prefira fundo transparente.')}${img('favicon', 'Ícone da aba do navegador. Qualquer imagem serve: vira um quadrado de 64×64. Sem favicon, usa o logo.')}</div>
    </div>
    ${texto('login_title', 'O título grande da tela de entrada.', 120, 1)}
    ${texto('login_text', 'A frase logo abaixo do título, explicando como entrar.', 400, 2)}
    ${texto('privacy_note', 'Aparece no login, na página inicial e no chat.', 400, 2)}
    <p class="msg-erro oculto" id="mk-erro" role="alert"></p>
    ${pode ? '<div class="linha-botoes"><button class="btn btn-verde">Salvar identidade visual</button></div>' : ''}
  </form>`;
}

export function ligarMarca(m) {
  const $ = id => document.getElementById(id);
  const removidos = new Set();
  // A cor principal é conferida enquanto a pessoa escolhe: botão de exemplo e, se clara demais, a sugestão.
  const conferir = () => avisoCor($('mk-primary_color-aviso'), $('mk-primary_color').value || $('mk-primary_color-sel').value, sug => aplicarCor('primary_color', sug));
  const aplicarCor = (k, v) => {
    $(`mk-${k}`).value = v.toUpperCase(); $(`mk-${k}-sel`).value = v;
    $(k === 'primary_color' ? 'mk-previa-p' : 'mk-previa-s').style.background = v;
    if (k === 'primary_color') { $('mk-primary_color').classList.remove('invalida'); $('mk-primary_color').removeAttribute('aria-invalid'); conferir(); }
  };
  for (const k of ['primary_color', 'secondary_color']) {
    const sel = $(`mk-${k}-sel`), txt = $(`mk-${k}`);
    sel.oninput = () => aplicarCor(k, sel.value);
    txt.oninput = () => { if (/^#[0-9a-f]{6}$/i.test(txt.value)) aplicarCor(k, txt.value); };
  }
  conferir();
  $('mk-display_name').oninput = e => { $('mk-previa-nome').textContent = e.target.value; };
  for (const bt of document.querySelectorAll('[data-exemplo]')) {
    const el = $(`mk-${bt.dataset.exemplo}`), modelo = m.modelo[bt.dataset.exemplo];
    bt.onclick = () => { el.value = modelo; bt.hidden = true; el.focus(); };
    el.addEventListener('input', () => { bt.hidden = el.value === modelo; });
  }
  for (const b of document.querySelectorAll('[data-remover]')) b.onclick = () => { removidos.add(b.dataset.remover); delete prontas[b.dataset.remover]; $(`mk-${b.dataset.remover}-previa`).innerHTML = '<span class="dica">Será removido ao salvar</span>'; };
  // Ao escolher o arquivo: ajusta na hora, mostra a prévia e o tamanho final (ou o motivo de não servir).
  const prontas = {};
  for (const k of ['logo', 'favicon']) {
    const el = $(`mk-${k}`);
    el?.addEventListener('change', async () => {
      const f = el.files?.[0], previa = $(`mk-${k}-previa`);
      delete prontas[k];
      if (!f) return;
      previa.innerHTML = '<span class="dica">Preparando a imagem…</span>';
      try {
        const d = await ajustarImagem(f, AJUSTE_IMAGEM[k]);
        prontas[k] = d; removidos.delete(k);
        previa.innerHTML = `<img src="${d}" alt=""><span class="dica">Pronto (${kbDe(d)} KB). Clique em Salvar.</span>`;
        if (k === 'logo') document.querySelector('#mk-previa img').src = d;
      } catch (e) { previa.innerHTML = `<span class="msg-erro" style="margin:0">${esc(e.message)}</span>`; el.value = ''; }
    });
  }
  return async () => {
    const principal = $('mk-primary_color');
    if (!principal.disabled && !corLegivelOk(principal.value.trim())) {
      conferir();
      throw Object.assign(new Error('A cor principal está clara demais: o texto dos botões e dos links fica difícil de ler. Escolha um tom mais escuro ou use a sugestão ao lado do campo.'), { campo: 'primary_color' });
    }
    const corpo = {};
    for (const k of ['display_name', 'primary_color', 'secondary_color', 'login_title', 'login_text', 'privacy_note']) { const el = $(`mk-${k}`); if (!el.disabled && el.value !== (m[k] || '')) corpo[k] = el.value.trim(); }
    for (const k of ['logo', 'favicon']) {
      const el = $(`mk-${k}`);
      if (el.disabled) continue;
      const v = prontas[k] || (el.files?.[0] ? await ajustarImagem(el.files[0], AJUSTE_IMAGEM[k]) : null);
      if (v) corpo[k] = v; else if (removidos.has(k)) corpo[k] = '';
    }
    const bloqueios = [...document.querySelectorAll('[data-bloqueio]')];
    return { corpo, bloqueados: bloqueios.length ? bloqueios.filter(x => x.checked).map(x => x.dataset.bloqueio) : null };
  };
}

// ---------------------------------------------------------------- Landing page
// A página vem inteira escrita pelo modelo (com o nome da empresa). O editor mostra tudo em blocos,
// na ordem em que aparecem na página, e "Restaurar o modelo" devolve os textos originais.
const TEXTOS_SECAO = {
  como_usar: [['como_usar_rotulo', 'Rótulo'], ['como_usar_titulo', 'Título']],
  chamadas: [['chamadas_rotulo', 'Rótulo'], ['chamadas_titulo', 'Título']],
  regras: [['regras_rotulo', 'Rótulo'], ['regras_titulo', 'Título'], ['regras_sub', 'Texto de apoio']],
  tarefas: [['tarefas_rotulo', 'Rótulo'], ['tarefas_titulo', 'Título'], ['tarefas_sub', 'Texto de apoio']],
  fim: [['fim_titulo', 'Título'], ['fim_texto', 'Texto'], ['fim_botao', 'Texto do botão']],
};
const REGRAS = [['pode', 'Pode usar'], ['sigilo', 'Ligue “Dados sigilosos”'], ['nunca', 'Nunca sai']];

export function renderLanding(l, { pode = true, urlPublica = '' } = {}) {
  const c = l.content, d = pode ? '' : 'disabled', t = c.textos || {};
  const slots = (lista, n) => [...(lista || []), ...Array(n).fill({})].slice(0, n);
  const inp = (id, v, max, extra = '') => `<input class="entrada" id="${id}" value="${esc(v || '')}" maxlength="${max}" ${d} ${extra}>`;
  const textos = sec => `<div class="grade-2">${TEXTOS_SECAO[sec].map(([k, r]) => `<div class="campo"><label for="lt-${k}">${r}</label>${inp(`lt-${k}`, t[k], k.endsWith('_sub') || k === 'fim_texto' ? 240 : 120, `data-texto="${k}"`)}</div>`).join('')}</div>`;
  const mostrar = (k, rot) => `<label class="ld-mostrar"><input type="checkbox" id="ld-sec-${k}" ${c.secoes?.[k] !== false ? 'checked' : ''} ${d}> ${rot}</label>`;
  const bloco = (titulo, onde, corpo, aberto = false) => `<details class="ld-bloco" ${aberto ? 'open' : ''}><summary><b>${titulo}</b><span class="dica">${onde}</span></summary><div class="ld-corpo">${corpo}</div></details>`;
  return `<form id="form-landing" novalidate class="ld-editor">
    ${!pode ? '<div class="faixa-aviso atencao">A landing page desta empresa é gerenciada pelo operador da plataforma. Você pode ver, mas não alterar.</div>' : ''}
    <div class="faixa-aviso ${l.status === 'publicada' ? 'ok' : 'atencao'} ld-situacao"><span>${l.status === 'publicada' ? '<b>Publicada.</b> A página já vem pronta com um modelo completo; troque o que quiser.' : '<b>Rascunho.</b> A página pública mostra uma versão simples até a publicação.'}</span>
      <span class="linha-botoes">${urlPublica ? `<a class="btn btn-linha btn-pequeno" href="${esc(urlPublica)}" target="_blank" rel="noopener">Ver a página</a>` : ''}${pode && l.modelo ? '<button type="button" class="btn-texto btn-pequeno" id="ld-restaurar">Restaurar o modelo</button>' : ''}</span></div>
    ${bloco('1. Topo', 'Primeira coisa que as pessoas veem', `
      <div class="grade-2"><div class="campo"><label for="ld-rotulo">Rótulo acima do título</label>${inp('ld-rotulo', c.rotulo, 80)}</div>
        <div class="campo"><label for="ld-titulo">Título</label>${inp('ld-titulo', c.titulo, 120)}</div></div>
      <div class="campo"><label for="ld-subtitulo">Subtítulo</label><textarea class="entrada" id="ld-subtitulo" rows="2" maxlength="300" ${d}>${esc(c.subtitulo)}</textarea></div>
      <div class="campo"><label for="ld-descricao">Texto extra (opcional)</label><textarea class="entrada" id="ld-descricao" rows="2" maxlength="1200" ${d}>${esc(c.descricao)}</textarea></div>
      <div class="campo"><label for="ld-imagem">Imagem ao lado do título (opcional)</label>
        <div class="previa-marca" id="ld-imagem-previa">${c.imagem ? `<img src="${esc(c.imagem)}" alt="" style="max-height:80px">` : '<span class="dica">Sem imagem: aparece uma conversa de exemplo.</span>'}</div>
        <div class="linha-botoes"><input type="file" id="ld-imagem" accept="image/png,image/jpeg,image/webp" ${d}>${c.imagem ? `<button type="button" class="btn-texto" id="ld-imagem-remover" ${d}>Remover</button>` : ''}</div><span class="ajuda">PNG, JPG ou WEBP de qualquer tamanho: a imagem é ajustada sozinha.</span></div>
      <span class="legenda">Botões</span><div class="repetidor">${slots(c.botoes, 3).map((b, i) => `<div class="linha"><input class="entrada" data-botao-texto="${i}" value="${esc(b.texto || '')}" placeholder="Texto do botão" maxlength="40" ${d}>
        <input class="entrada" data-botao-link="${i}" value="${esc(b.link || '')}" placeholder="/entrar, #como-usar ou https://" ${d}>
        <select class="entrada" data-botao-estilo="${i}" ${d}><option value="primario" ${b.estilo !== 'secundario' ? 'selected' : ''}>Principal</option><option value="secundario" ${b.estilo === 'secundario' ? 'selected' : ''}>Secundário</option></select></div>`).join('')}</div>
      <div class="campo"><label for="ld-destaques">Destaques abaixo dos botões (um por linha, até 4)</label><textarea class="entrada" id="ld-destaques" rows="3" ${d}>${esc((c.destaques || []).join('\n'))}</textarea></div>`, true)}
    ${bloco('2. Como usar', 'Passo a passo para começar', `${mostrar('como_usar', 'Mostrar esta seção')}${textos('como_usar')}
      <div class="repetidor">${slots(c.passos, 4).map((x, i) => `<div class="linha" style="grid-template-columns:1fr 2fr"><input class="entrada" data-passo-titulo="${i}" value="${esc(x.titulo || '')}" placeholder="Passo ${i + 1}" maxlength="60" ${d}>
        <input class="entrada" data-passo-texto="${i}" value="${esc(x.texto || '')}" placeholder="Explicação" maxlength="200" ${d}></div>`).join('')}</div>`)}
    ${bloco('3. O que você encontra', 'Recursos disponíveis', `${textos('chamadas')}
      <div class="repetidor">${slots(c.chamadas, 6).map((x, i) => `<div class="linha" style="grid-template-columns:1fr 2fr"><input class="entrada" data-chamada-titulo="${i}" value="${esc(x.titulo || '')}" placeholder="Título" maxlength="60" ${d}>
        <input class="entrada" data-chamada-texto="${i}" value="${esc(x.texto || '')}" placeholder="Texto" maxlength="300" ${d}></div>`).join('')}</div><p class="dica">Deixe o título em branco para esconder um bloco.</p>`)}
    ${bloco('4. Regras de dados', 'O que pode e o que não pode ser enviado', `${mostrar('regras', 'Mostrar esta seção')}${textos('regras')}
      <div class="grade-3">${REGRAS.map(([k, r]) => `<div class="campo"><label for="ld-regra-${k}">${r} <small>(um por linha)</small></label><textarea class="entrada" id="ld-regra-${k}" rows="4" ${d}>${esc((c.regras?.[k] || []).join('\n'))}</textarea></div>`).join('')}</div>`)}
    ${bloco('5. Boas tarefas', 'Exemplos de pedidos para começar', `${mostrar('tarefas', 'Mostrar esta seção')}${textos('tarefas')}
      <div class="repetidor">${slots(c.tarefas, 8).map((x, i) => `<div class="linha" style="grid-template-columns:1fr 3fr"><input class="entrada" data-tarefa-tipo="${i}" value="${esc(x.tipo || '')}" placeholder="Tipo (ex.: Resumir)" maxlength="30" ${d}>
        <input class="entrada" data-tarefa-texto="${i}" value="${esc(x.texto || '')}" placeholder="Exemplo de pedido" maxlength="140" ${d}></div>`).join('')}</div>`)}
    ${bloco('6. Institucional', 'Sobre a IA na empresa e links úteis', `
      <div class="campo"><label for="ld-inst-titulo">Título</label>${inp('ld-inst-titulo', c.institucional?.titulo, 80)}</div>
      <div class="campo"><label for="ld-inst-texto">Texto</label><textarea class="entrada" id="ld-inst-texto" rows="3" maxlength="1200" ${d}>${esc(c.institucional?.texto || '')}</textarea></div>
      <span class="legenda">Links</span><div class="repetidor">${slots(c.institucional?.links, 4).map((x, i) => `<div class="linha" style="grid-template-columns:1fr 2fr"><input class="entrada" data-link-texto="${i}" value="${esc(x.texto || '')}" placeholder="Texto do link" maxlength="40" ${d}>
        <input class="entrada" data-link-url="${i}" value="${esc(x.link || '')}" placeholder="/politica ou https://" ${d}></div>`).join('')}</div>`)}
    ${bloco('7. Fechamento', 'Chamada final antes do rodapé', textos('fim'))}
    ${bloco('8. Busca e compartilhamento', 'Como a página aparece no Google e em links', `<div class="grade-2">
      <div class="campo"><label for="ld-seo-title">Título da página</label>${inp('ld-seo-title', l.seo?.title, 70)}</div>
      <div class="campo"><label for="ld-seo-description">Descrição</label>${inp('ld-seo-description', l.seo?.description, 160)}</div></div>`)}
    <p class="msg-erro oculto" id="ld-erro" role="alert"></p>
    ${pode ? `<div class="linha-botoes"><button class="btn btn-verde" data-acao="salvar">Salvar</button>
      ${l.status === 'publicada' ? '<button type="button" class="btn btn-linha" data-acao="despublicar">Voltar para rascunho</button>' : '<button type="button" class="btn btn-linha" data-acao="publicar">Salvar e publicar</button>'}</div>` : ''}
  </form>`;
}

export function ligarLanding(l) {
  const $ = id => document.getElementById(id);
  let removerImagem = false;
  if ($('ld-imagem-remover')) $('ld-imagem-remover').onclick = () => { removerImagem = true; $('ld-imagem-previa').innerHTML = '<span class="dica">Será removida ao salvar</span>'; };
  const todos = attr => [...document.querySelectorAll(`[${attr}]`)];
  const vals = attr => todos(attr).map(e => e.value.trim());
  const pares = (a, b, ka, kb) => { const x = vals(a), y = vals(b); return x.map((v, i) => ({ [ka]: v, [kb]: y[i] })); };
  const linhas = id => $(id).value.split('\n').map(s => s.trim()).filter(Boolean);
  // Restaurar o modelo: devolve os textos originais nos campos (só vale ao salvar).
  $('ld-restaurar')?.addEventListener('click', () => {
    if (!l?.modelo || !confirm('Trocar todos os textos pelos do modelo? A mudança só vale quando você salvar.')) return;
    const m = l.modelo, set = (id, v) => { if ($(id)) $(id).value = v ?? ''; };
    const lista = (attr, arr, k) => todos(attr).forEach((e, i) => { e.value = arr?.[i]?.[k] ?? ''; });
    set('ld-rotulo', m.rotulo); set('ld-titulo', m.titulo); set('ld-subtitulo', m.subtitulo); set('ld-descricao', m.descricao);
    lista('data-botao-texto', m.botoes, 'texto'); lista('data-botao-link', m.botoes, 'link'); todos('data-botao-estilo').forEach((e, i) => { e.value = m.botoes?.[i]?.estilo || 'primario'; });
    set('ld-destaques', (m.destaques || []).join('\n'));
    todos('data-texto').forEach(e => { e.value = m.textos?.[e.dataset.texto] ?? ''; });
    lista('data-passo-titulo', m.passos, 'titulo'); lista('data-passo-texto', m.passos, 'texto');
    lista('data-chamada-titulo', m.chamadas, 'titulo'); lista('data-chamada-texto', m.chamadas, 'texto');
    for (const [k] of REGRAS) set(`ld-regra-${k}`, (m.regras?.[k] || []).join('\n'));
    lista('data-tarefa-tipo', m.tarefas, 'tipo'); lista('data-tarefa-texto', m.tarefas, 'texto');
    set('ld-inst-titulo', m.institucional?.titulo); set('ld-inst-texto', m.institucional?.texto);
    lista('data-link-texto', m.institucional?.links, 'texto'); lista('data-link-url', m.institucional?.links, 'link');
    for (const k of ['como_usar', 'regras', 'tarefas']) $(`ld-sec-${k}`).checked = true;
    set('ld-seo-title', l.modeloSeo?.title); set('ld-seo-description', l.modeloSeo?.description);
    document.querySelectorAll('.ld-bloco').forEach(b => { b.open = true; });
  });
  return async status => {
    const img = $('ld-imagem').files?.[0] ? await ajustarImagem($('ld-imagem').files[0], AJUSTE_IMAGEM.imagem) : null;
    const be = vals('data-botao-estilo');
    const content = {
      rotulo: $('ld-rotulo').value, titulo: $('ld-titulo').value, subtitulo: $('ld-subtitulo').value, descricao: $('ld-descricao').value,
      botoes: pares('data-botao-texto', 'data-botao-link', 'texto', 'link').map((b, i) => ({ ...b, estilo: be[i] })).filter(b => b.texto && b.link),
      destaques: linhas('ld-destaques'),
      textos: Object.fromEntries(todos('data-texto').map(e => [e.dataset.texto, e.value.trim()])),
      passos: pares('data-passo-titulo', 'data-passo-texto', 'titulo', 'texto').filter(x => x.titulo),
      chamadas: pares('data-chamada-titulo', 'data-chamada-texto', 'titulo', 'texto').filter(x => x.titulo),
      regras: Object.fromEntries(REGRAS.map(([k]) => [k, linhas(`ld-regra-${k}`)])),
      tarefas: pares('data-tarefa-tipo', 'data-tarefa-texto', 'tipo', 'texto').filter(x => x.texto),
      secoes: { como_usar: $('ld-sec-como_usar').checked, regras: $('ld-sec-regras').checked, tarefas: $('ld-sec-tarefas').checked },
      institucional: { titulo: $('ld-inst-titulo').value, texto: $('ld-inst-texto').value, links: pares('data-link-texto', 'data-link-url', 'texto', 'link').filter(x => x.texto && x.link) },
    };
    if (img) content.imagem = img; else if (removerImagem) content.imagem = '';
    return { content, seo: { title: $('ld-seo-title').value, description: $('ld-seo-description').value }, ...(status ? { status } : {}) };
  };
}

// O erro aparece no fim do formulário e, quando é de um campo, o campo fica marcado e ganha o foco.
export function mostrarErro(id, e) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = e.message; el.classList.remove('oculto');
  const campo = document.getElementById(`mk-${e.campo || e.codigo || e.erro}`);
  if (campo?.classList.contains('entrada')) {
    campo.classList.add('invalida'); campo.setAttribute('aria-invalid', 'true');
    campo.scrollIntoView({ behavior: 'smooth', block: 'center' }); campo.focus({ preventScroll: true });
  }
}

// ---------------------------------------------------------------- URL e domínio
// Duas formas de acesso, explicadas em passos: o endereço na plataforma (pronto) e, opcional, um
// domínio próprio da empresa (registro CNAME no DNS dela + verificação). O registro a criar aparece
// montado e muda enquanto a pessoa digita.
// u = { slug, custom_domain, url, dominio: {status, mensagem, verificadoEm}, dns: {alvo, automatico, base} }
// pode = { url, domain }; plataforma = true no console (mostra o que a equipe da plataforma faz)
const dataCurta = iso => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '');
const nomeDoRegistro = d => { const p = String(d || '').split('.'); return p.length > 2 ? p.slice(0, -2 - (/^(com|net|org|gov|edu)$/.test(p.at(-2)) ? 1 : 0)).join('.') || '@' : '@'; };

export function renderUrl(u, { pode = { url: true, domain: true }, plataforma = false } = {}) {
  const base = u.dns?.base || '', alvo = u.dns?.alvo || 'o endereço da plataforma';
  const st = u.custom_domain ? (u.dominio?.status === 'verificado' ? 'verificado' : 'pendente') : 'nenhum';
  const selo = { verificado: '<span class="selo selo-verde">Verificado</span>', pendente: '<span class="selo selo-ambar">Aguardando o DNS</span>', nenhum: '<span class="selo selo-cinza">Não configurado</span>' }[st];
  const copiar = v => `<button type="button" class="btn-texto btn-pequeno" data-copiar="${esc(v)}">Copiar</button>`;
  return `<p class="lead">Como as pessoas da empresa chegam ao ambiente. O ID interno nunca muda: trocar o endereço não perde nada.</p>
    <form id="f-url" novalidate class="url-passos">
      <section class="url-caixa">
        <div class="url-topo"><span class="url-num">1</span><div><h3>Endereço na plataforma</h3><p class="dica">Já funciona, sem configurar nada. Ao trocar, o endereço antigo continua levando para cá.</p></div></div>
        <div class="campo"><label for="url-slug">Identificador</label>
          <div class="url-prefixo"><span>${esc(base.replace(/^https?:\/\//, ''))}/</span><input class="entrada" id="url-slug" value="${esc(u.slug)}" maxlength="40" autocomplete="off" ${pode.url ? '' : 'disabled'}></div>
          <span class="ajuda">Letras minúsculas, números e hífens (3 a 40).</span></div>
        <div class="url-final"><span class="dica">Endereço completo</span><b id="url-previa">${esc(base)}/${esc(u.slug)}</b>${copiar(`${base}/${u.slug}`)}</div>
        ${pode.url ? '' : '<p class="dica">O endereço desta empresa é gerenciado pela equipe da plataforma.</p>'}
      </section>
      <section class="url-caixa">
        <div class="url-topo"><span class="url-num">2</span><div><h3>Domínio próprio <small>(opcional)</small> ${selo}</h3><p class="dica">Para usar um endereço da própria empresa, como <b>ia.suaempresa.com.br</b>. Use um subdomínio: o domínio principal (suaempresa.com.br) normalmente já é o site.</p></div></div>
        ${pode.domain ? `
        <ol class="url-lista">
          <li><b>Escolha o endereço</b>
            <div class="campo"><label for="url-dom" class="sr">Domínio próprio</label><input class="entrada" id="url-dom" value="${esc(u.custom_domain || '')}" placeholder="ia.suaempresa.com.br" autocomplete="off" inputmode="url"></div></li>
          <li><b>Crie este registro no DNS do domínio</b> <span class="dica">(no painel onde o domínio está: Registro.br, KingHost, GoDaddy, Cloudflare…)</span>
            <div class="tabela-rolagem"><table class="tabela tabela-fixa url-dns"><thead><tr><th>Tipo</th><th>Nome</th><th>Valor / destino</th></tr></thead>
              <tbody><tr><td><code>CNAME</code></td><td><code id="dns-nome">${esc(nomeDoRegistro(u.custom_domain) === '@' ? 'ia' : nomeDoRegistro(u.custom_domain))}</code></td><td><code>${esc(alvo)}</code> ${copiar(alvo)}</td></tr></tbody></table></div>
            <p class="dica">Em “Nome”, alguns painéis pedem só a primeira parte (<code>ia</code>), outros o endereço inteiro. Se o Cloudflare estiver no meio, deixe o registro como “somente DNS” (nuvem cinza).</p></li>
          <li><b>Salve aqui e verifique</b> <span class="dica">O DNS pode levar de alguns minutos a algumas horas para valer. A plataforma confere sozinha a cada 30 minutos.</span></li>
          <li><b>HTTPS</b> <span class="dica">${u.dns?.automatico ? 'O certificado é emitido automaticamente depois da verificação.' : plataforma ? `Depois de verificado, cadastre o domínio também na hospedagem (no Render: <b>Settings → Custom Domains → Add</b>) para emitir o certificado HTTPS.` : 'Depois da verificação, a equipe da plataforma ativa o certificado HTTPS. Avise-a se passar de um dia.'}</span></li>
        </ol>
        ${u.custom_domain ? `<div class="faixa-aviso ${st === 'verificado' ? 'ok' : 'atencao'} url-status"><div><b>${esc(u.custom_domain)}</b>: ${st === 'verificado' ? 'o DNS está certo.' : 'ainda não aponta para a plataforma.'} ${esc(u.dominio?.mensagem || '')}${u.dominio?.verificadoEm ? ` <span class="dica">Conferido em ${dataCurta(u.dominio.verificadoEm)}.</span>` : ''}</div><button type="button" class="btn btn-linha btn-pequeno" id="verificar-dominio">Verificar agora</button></div>` : ''}
        ` : '<p class="dica">Domínio próprio não está incluído no plano ou não foi liberado para esta empresa.</p>'}
      </section>
      <p class="msg-erro oculto" id="url-erro" role="alert"></p>
      ${pode.url || pode.domain ? '<div class="linha-botoes"><button class="btn btn-verde">Salvar endereço</button></div>' : ''}
    </form>`;
}

export function ligarUrl(u) {
  const base = u.dns?.base || '';
  const slug = document.getElementById('url-slug'), dom = document.getElementById('url-dom');
  slug?.addEventListener('input', () => { const v = slug.value.trim().toLowerCase(), b = document.querySelector('.url-final [data-copiar]'); document.getElementById('url-previa').textContent = `${base}/${v}`; if (b) b.dataset.copiar = `${base}/${v}`; });
  dom?.addEventListener('input', () => { const n = nomeDoRegistro(dom.value.trim().toLowerCase()); document.getElementById('dns-nome').textContent = n === '@' ? 'ia' : n; });
  for (const b of document.querySelectorAll('[data-copiar]')) b.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(b.dataset.copiar); b.textContent = 'Copiado'; setTimeout(() => { b.textContent = 'Copiar'; }, 1500); } catch {}
  });
}
