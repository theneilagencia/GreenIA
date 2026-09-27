// Editores de marca e de landing page, usados pelo console da plataforma e pelo admin da empresa.
// A tela chama render*() para montar o formulário e ler*() para montar o corpo da requisição.
import { esc } from '/comum.js';

export const ROTULOS_MARCA = {
  display_name: 'Nome exibido', logo: 'Logomarca', favicon: 'Favicon', primary_color: 'Cor principal', secondary_color: 'Cor secundária',
  login_title: 'Título da tela de login', login_text: 'Texto da tela de login', privacy_note: 'Aviso de privacidade',
};

// Imagem enviada pelo navegador vira data: URL, conferida no servidor (tipo e tamanho).
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
    <input class="entrada" id="mk-${k}" value="${esc(m[k] || '')}" placeholder="#1B7950" maxlength="7" style="max-width:140px" ${desab(k, b, modo, pode)}></div>`);
  const img = (k, dica) => campo(k, `<div class="previa-marca" id="mk-${k}-previa">${m[k] ? `<img src="${esc(m[k])}" alt="">` : '<span class="dica">Nenhum arquivo</span>'}</div>
    <div class="linha-botoes"><input type="file" id="mk-${k}" accept="image/png,image/jpeg,image/webp,image/svg+xml${k === 'favicon' ? ',image/x-icon' : ''}" ${desab(k, b, modo, pode)}>
    ${m[k] ? `<button type="button" class="btn-texto" data-remover="${k}" ${desab(k, b, modo, pode)}>Remover</button>` : ''}</div><span class="ajuda">${dica}</span>`);
  return `<form id="form-marca" novalidate>
    ${!pode ? '<div class="faixa-aviso atencao">A identidade visual desta empresa é gerenciada pelo operador da plataforma. Você pode ver, mas não alterar.</div>' : ''}
    <div class="previa-marca" id="mk-previa" aria-label="Prévia"><img src="${esc(m.logo || '/assets/greenia-marca.svg')}" alt=""><b id="mk-previa-nome">${esc(m.display_name)}</b>
      <span class="cor" id="mk-previa-p" style="background:${esc(m.primary_color || '#1B7950')}"></span><span class="cor" id="mk-previa-s" style="background:${esc(m.secondary_color || '#F3F3F1')}"></span></div>
    <div class="grade-2">
      <div>${campo('display_name', `<input class="entrada" id="mk-display_name" value="${esc(m.display_name)}" maxlength="80" ${desab('display_name', b, modo, pode)}>`)}
        ${cor('primary_color')}${cor('secondary_color')}
        <p class="ajuda" style="margin-top:-8px">A cor principal precisa de contraste de 4,5:1 com fundos claros, porque vira fundo de botão com texto branco.</p></div>
      <div>${img('logo', 'PNG, JPG, WEBP ou SVG, até 200 KB.')}${img('favicon', 'Ícone da aba do navegador. PNG, SVG ou ICO, até 80 KB. Sem favicon, usa o logo.')}</div>
    </div>
    ${campo('login_title', `<input class="entrada" id="mk-login_title" value="${esc(m.login_title)}" maxlength="120" placeholder="Entre com o seu email da empresa" ${desab('login_title', b, modo, pode)}>`)}
    ${campo('login_text', `<textarea class="entrada" id="mk-login_text" rows="2" maxlength="400" placeholder="Você recebe um código de acesso de 6 dígitos no seu email." ${desab('login_text', b, modo, pode)}>${esc(m.login_text)}</textarea>`)}
    ${campo('privacy_note', `<textarea class="entrada" id="mk-privacy_note" rows="2" maxlength="400" ${desab('privacy_note', b, modo, pode)}>${esc(m.privacy_note)}</textarea>`)}
    <p class="msg-erro oculto" id="mk-erro" role="alert"></p>
    ${pode ? '<div class="linha-botoes"><button class="btn btn-verde">Salvar identidade visual</button></div>' : ''}
  </form>`;
}

export function ligarMarca(m) {
  const $ = id => document.getElementById(id);
  const removidos = new Set();
  for (const k of ['primary_color', 'secondary_color']) {
    const sel = $(`mk-${k}-sel`), txt = $(`mk-${k}`);
    sel.oninput = () => { txt.value = sel.value.toUpperCase(); $(k === 'primary_color' ? 'mk-previa-p' : 'mk-previa-s').style.background = sel.value; };
    txt.oninput = () => { if (/^#[0-9a-f]{6}$/i.test(txt.value)) { sel.value = txt.value; $(k === 'primary_color' ? 'mk-previa-p' : 'mk-previa-s').style.background = txt.value; } };
  }
  $('mk-display_name').oninput = e => { $('mk-previa-nome').textContent = e.target.value; };
  for (const b of document.querySelectorAll('[data-remover]')) b.onclick = () => { removidos.add(b.dataset.remover); $(`mk-${b.dataset.remover}-previa`).innerHTML = '<span class="dica">Será removido ao salvar</span>'; };
  return async () => {
    const corpo = {};
    for (const k of ['display_name', 'primary_color', 'secondary_color', 'login_title', 'login_text', 'privacy_note']) { const el = $(`mk-${k}`); if (!el.disabled && el.value !== (m[k] || '')) corpo[k] = el.value.trim(); }
    for (const [k, max] of [['logo', 200], ['favicon', 80]]) {
      const el = $(`mk-${k}`);
      if (el.disabled) continue;
      const v = await lerImagem(el, max);
      if (v) corpo[k] = v; else if (removidos.has(k)) corpo[k] = '';
    }
    const bloqueios = [...document.querySelectorAll('[data-bloqueio]')];
    return { corpo, bloqueados: bloqueios.length ? bloqueios.filter(x => x.checked).map(x => x.dataset.bloqueio) : null };
  };
}

// ---------------------------------------------------------------- Landing page
export function renderLanding(l, { pode = true, urlPublica = '' } = {}) {
  const c = l.content, d = pode ? '' : 'disabled';
  const botoes = [...(c.botoes || []), {}, {}, {}].slice(0, 3);
  const chamadas = [...(c.chamadas || []), {}, {}, {}, {}, {}, {}].slice(0, 6);
  const links = [...(c.institucional?.links || []), {}, {}, {}].slice(0, 4);
  return `<form id="form-landing" novalidate>
    ${!pode ? '<div class="faixa-aviso atencao">A landing page desta empresa é gerenciada pelo operador da plataforma. Você pode ver, mas não alterar.</div>' : ''}
    <div class="faixa-aviso ${l.status === 'publicada' ? 'ok' : 'atencao'}">${l.status === 'publicada' ? 'Publicada.' : 'Rascunho: a página pública mostra uma versão simples até a publicação.'} ${urlPublica ? `<a href="${esc(urlPublica)}" target="_blank" rel="noopener">Abrir a página</a>` : ''}</div>
    <h3 style="margin-top:0">Topo</h3>
    <div class="grade-2">
      <div class="campo"><label for="ld-rotulo">Rótulo acima do título</label><input class="entrada" id="ld-rotulo" value="${esc(c.rotulo)}" maxlength="80" ${d}></div>
      <div class="campo"><label for="ld-titulo">Título</label><input class="entrada" id="ld-titulo" value="${esc(c.titulo)}" maxlength="120" ${d}></div>
    </div>
    <div class="campo"><label for="ld-subtitulo">Subtítulo</label><textarea class="entrada" id="ld-subtitulo" rows="2" maxlength="300" ${d}>${esc(c.subtitulo)}</textarea></div>
    <div class="campo"><label for="ld-descricao">Descrição (opcional)</label><textarea class="entrada" id="ld-descricao" rows="3" maxlength="1200" ${d}>${esc(c.descricao)}</textarea></div>
    <div class="campo"><label for="ld-imagem">Imagem do topo (opcional)</label>
      <div class="previa-marca" id="ld-imagem-previa">${c.imagem ? `<img src="${esc(c.imagem)}" alt="" style="max-height:80px">` : '<span class="dica">Sem imagem: aparece uma conversa de exemplo</span>'}</div>
      <div class="linha-botoes"><input type="file" id="ld-imagem" accept="image/png,image/jpeg,image/webp" ${d}>${c.imagem ? `<button type="button" class="btn-texto" id="ld-imagem-remover" ${d}>Remover</button>` : ''}</div><span class="ajuda">PNG, JPG ou WEBP, até 800 KB.</span></div>
    <h3>Botões</h3><div class="repetidor">${botoes.map((b, i) => `<div class="linha"><input class="entrada" data-botao-texto="${i}" value="${esc(b.texto || '')}" placeholder="Texto do botão" maxlength="40" ${d}>
      <input class="entrada" data-botao-link="${i}" value="${esc(b.link || '')}" placeholder="/entrar, #como-usar ou https://" ${d}>
      <select class="entrada" data-botao-estilo="${i}" ${d}><option value="primario" ${b.estilo !== 'secundario' ? 'selected' : ''}>Principal</option><option value="secundario" ${b.estilo === 'secundario' ? 'selected' : ''}>Secundário</option></select></div>`).join('')}</div>
    <div class="campo"><label for="ld-destaques">Destaques (um por linha, até 4)</label><textarea class="entrada" id="ld-destaques" rows="3" ${d}>${esc((c.destaques || []).join('\n'))}</textarea></div>
    <h3>Chamadas</h3><p class="dica">Blocos de "O que você encontra". Deixe em branco para não mostrar.</p>
    <div class="repetidor">${chamadas.map((x, i) => `<div class="linha" style="grid-template-columns:1fr 2fr"><input class="entrada" data-chamada-titulo="${i}" value="${esc(x.titulo || '')}" placeholder="Título" maxlength="60" ${d}>
      <input class="entrada" data-chamada-texto="${i}" value="${esc(x.texto || '')}" placeholder="Texto" maxlength="300" ${d}></div>`).join('')}</div>
    <h3>Seções prontas</h3>
    <div class="checagens">
      <label><input type="checkbox" id="ld-sec-como_usar" ${c.secoes?.como_usar !== false ? 'checked' : ''} ${d}> Como usar (três passos)</label>
      <label><input type="checkbox" id="ld-sec-regras" ${c.secoes?.regras !== false ? 'checked' : ''} ${d}> Regras de dados</label>
      <label><input type="checkbox" id="ld-sec-tarefas" ${c.secoes?.tarefas !== false ? 'checked' : ''} ${d}> Boas tarefas para começar</label>
    </div>
    <h3>Informações institucionais</h3>
    <div class="campo"><label for="ld-inst-titulo">Título</label><input class="entrada" id="ld-inst-titulo" value="${esc(c.institucional?.titulo || '')}" maxlength="80" ${d}></div>
    <div class="campo"><label for="ld-inst-texto">Texto</label><textarea class="entrada" id="ld-inst-texto" rows="3" maxlength="1200" ${d}>${esc(c.institucional?.texto || '')}</textarea></div>
    <div class="repetidor">${links.map((x, i) => `<div class="linha" style="grid-template-columns:1fr 2fr"><input class="entrada" data-link-texto="${i}" value="${esc(x.texto || '')}" placeholder="Texto do link" maxlength="40" ${d}>
      <input class="entrada" data-link-url="${i}" value="${esc(x.link || '')}" placeholder="https://" ${d}></div>`).join('')}</div>
    <h3>SEO</h3>
    <div class="grade-2">
      <div class="campo"><label for="ld-seo-title">Título da página</label><input class="entrada" id="ld-seo-title" value="${esc(l.seo?.title || '')}" maxlength="70" ${d}></div>
      <div class="campo"><label for="ld-seo-description">Descrição</label><input class="entrada" id="ld-seo-description" value="${esc(l.seo?.description || '')}" maxlength="160" ${d}></div>
    </div>
    <p class="msg-erro oculto" id="ld-erro" role="alert"></p>
    ${pode ? `<div class="linha-botoes"><button class="btn btn-verde" data-acao="salvar">Salvar</button>
      ${l.status === 'publicada' ? '<button type="button" class="btn btn-linha" data-acao="despublicar">Voltar para rascunho</button>' : '<button type="button" class="btn btn-linha" data-acao="publicar">Salvar e publicar</button>'}</div>` : ''}
  </form>`;
}

export function ligarLanding() {
  const $ = id => document.getElementById(id);
  let removerImagem = false;
  if ($('ld-imagem-remover')) $('ld-imagem-remover').onclick = () => { removerImagem = true; $('ld-imagem-previa').innerHTML = '<span class="dica">Será removida ao salvar</span>'; };
  const vals = attr => [...document.querySelectorAll(`[${attr}]`)].map(e => e.value.trim());
  return async status => {
    const img = await lerImagem($('ld-imagem'), 800);
    const bt = vals('data-botao-texto'), bl = vals('data-botao-link'), be = vals('data-botao-estilo');
    const ct = vals('data-chamada-titulo'), cx = vals('data-chamada-texto');
    const lt = vals('data-link-texto'), lu = vals('data-link-url');
    const content = {
      rotulo: $('ld-rotulo').value, titulo: $('ld-titulo').value, subtitulo: $('ld-subtitulo').value, descricao: $('ld-descricao').value,
      botoes: bt.map((t, i) => ({ texto: t, link: bl[i], estilo: be[i] })).filter(b => b.texto && b.link),
      destaques: $('ld-destaques').value.split('\n').map(s => s.trim()).filter(Boolean),
      chamadas: ct.map((t, i) => ({ titulo: t, texto: cx[i] })).filter(x => x.titulo),
      secoes: { como_usar: $('ld-sec-como_usar').checked, regras: $('ld-sec-regras').checked, tarefas: $('ld-sec-tarefas').checked },
      institucional: { titulo: $('ld-inst-titulo').value, texto: $('ld-inst-texto').value, links: lt.map((t, i) => ({ texto: t, link: lu[i] })).filter(x => x.texto && x.link) },
    };
    if (img) content.imagem = img; else if (removerImagem) content.imagem = '';
    return { content, seo: { title: $('ld-seo-title').value, description: $('ld-seo-description').value }, ...(status ? { status } : {}) };
  };
}

export function mostrarErro(id, e) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = e.message; el.classList.remove('oculto');
}
