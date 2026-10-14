// Editores de marca e de landing page, usados pelo console da plataforma e pelo admin da empresa.
// A tela chama render*() para montar o formulário e ler*() para montar o corpo da requisição.
import { api, esc, toast, tonsMarca } from '/comum.js';
import { avisoCor, corLegivelOk } from '/cor.js';
import { confirmar, vigiarAlteracoes } from '/admin-ui.js';
import { prepararLanding, desenharLanding } from '/landing-render.js';
import { semMarcaDaPlataforma } from '/marca-branca.js';

// Envio de arquivo com botão próprio em português ("Escolher arquivo"), no lugar do controle do navegador.
// O campo continua no formulário (rótulo, foco e teclado), só fica visualmente escondido atrás do botão.
const campoArquivo = (id, accept, desab = '', rotulo = 'Escolher arquivo') => `<span class="arquivo-campo"><label class="btn btn-linha btn-pequeno${desab ? ' desabilitado' : ''}" for="${id}">${rotulo}</label><input type="file" class="sr" id="${id}" accept="${accept}" ${desab}><span class="dica" data-arquivo-nome="${id}" aria-live="polite">Nenhum arquivo escolhido</span></span>`;
document.addEventListener('change', ev => {
  const el = ev.target;
  if (el?.type !== 'file') return;
  const nome = document.querySelector(`[data-arquivo-nome="${CSS.escape(el.id)}"]`);
  if (nome) nome.textContent = el.files?.[0]?.name || 'Nenhum arquivo escolhido';
});

export const ROTULOS_MARCA = {
  display_name: 'Nome exibido', logo: 'Logomarca', favicon: 'Ícone da aba', primary_color: 'Cor principal', secondary_color: 'Cor secundária',
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

export function renderMarca(m, { modo = 'empresa', pode = true, motivo = '' } = {}) {
  const b = m.locked || [];
  const campo = (k, html) => `<div class="campo"><label for="mk-${k}">${ROTULOS_MARCA[k]}${trava(k, b, modo)}</label>${html}</div>`;
  // Sem cor salva, seletor, campo e prévia mostram o mesmo padrão de cada cor (a secundária não herda a principal).
  const COR_PADRAO = { primary_color: '#1B7950', secondary_color: '#F3F3F1' };
  const cor = k => campo(k, `<div style="display:flex;gap:8px;align-items:center"><input type="color" aria-label="Escolher ${ROTULOS_MARCA[k].toLowerCase()}" id="mk-${k}-sel" value="${esc(m[k] || COR_PADRAO[k])}" ${desab(k, b, modo, pode)} style="width:44px;height:38px;border:1px solid var(--line-strong);border-radius:8px;background:none">
    <input class="entrada" id="mk-${k}" value="${esc(m[k] || '')}" placeholder="${COR_PADRAO[k]}" maxlength="7" style="max-width:140px" ${desab(k, b, modo, pode)}></div>
    ${k === 'primary_color' ? '<span class="ajuda">Usada nos botões (com texto branco por cima) e nos links. Precisa ser escura o bastante para o texto ser lido.</span><div class="aviso-cor" id="mk-primary_color-aviso" aria-live="polite"></div>' : ''}`);
  const img = (k, dica) => campo(k, `<div class="previa-marca" id="mk-${k}-previa">${m[k] ? `<img src="${esc(m[k])}" alt="">` : '<span class="dica">Nenhum arquivo</span>'}</div>
    <div class="linha-botoes">${campoArquivo(`mk-${k}`, `image/png,image/jpeg,image/webp,image/svg+xml${k === 'favicon' ? ',image/x-icon' : ''}`, desab(k, b, modo, pode))}
    ${m[k] ? `<button type="button" class="btn-texto" data-remover="${k}" ${desab(k, b, modo, pode)}>Remover</button>` : ''}</div><span class="ajuda">${dica}</span>`);
  // Textos: já vêm com um exemplo. "Usar o texto de exemplo" devolve o modelo, se a pessoa apagou ou mudou.
  const texto = (k, dica, max, linhas) => campo(k, `${linhas > 1
    ? `<textarea class="entrada" id="mk-${k}" rows="${linhas}" maxlength="${max}" placeholder="${esc(m.modelo?.[k] || '')}" ${desab(k, b, modo, pode)}>${esc(m[k])}</textarea>`
    : `<input class="entrada" id="mk-${k}" value="${esc(m[k])}" maxlength="${max}" placeholder="${esc(m.modelo?.[k] || '')}" ${desab(k, b, modo, pode)}>`}
    <span class="ajuda">${dica}${m.modelo?.[k] && pode && !desab(k, b, modo, pode) ? ` <button type="button" class="btn-texto btn-pequeno" data-exemplo="${k}" ${m[k] === m.modelo[k] ? 'hidden' : ''}>Usar o texto de exemplo</button>` : ''}</span>`);
  return `<form id="form-marca" novalidate>
    ${!pode ? `<div class="faixa-aviso atencao aviso-trava"><b>Edição travada.</b> ${esc(motivo || 'A identidade visual desta empresa é gerenciada pelo operador da plataforma.')} Você pode ver, mas não alterar.</div>` : ''}
    <div class="previa-marca" id="mk-previa" aria-label="Prévia"><img src="${esc(m.logo || '/assets/ia-neutro.svg')}" alt=""><b id="mk-previa-nome">${esc(m.display_name)}</b>
      <span class="cor" id="mk-previa-p" style="background:${esc(m.primary_color || '#1B7950')}"></span><span class="cor" id="mk-previa-s" style="background:${esc(m.secondary_color || '#F3F3F1')}"></span></div>
    <div class="grade-2">
      <div>${campo('display_name', `<input class="entrada" id="mk-display_name" value="${esc(m.display_name)}" maxlength="80" ${desab('display_name', b, modo, pode)}>`)}
        ${cor('primary_color')}${cor('secondary_color')}</div>
      <div>${img('logo', 'PNG, JPG, WEBP ou SVG, de qualquer tamanho: a imagem é ajustada sozinha. Prefira fundo transparente.')}${img('favicon', 'Ícone da aba do navegador. Qualquer imagem serve: vira um quadrado de 64×64. Sem ícone próprio, usa o logo.')}</div>
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

// ---------------------------------------------------------------- Página de apresentação
// Editor no padrão dos construtores do Claude e do ChatGPT: à esquerda as seções da página, fechadas, uma aberta por
// vez, cada uma com o resumo do que tem; à direita (tela larga) a prévia ao vivo, com o que está nos campos, sem
// salvar. Em telas estreitas, "Ver como fica" abre a mesma prévia na tela inteira. A página só muda ao salvar.
// O cabeçalho da tela recebe a situação (estadoLanding) e as ações (acoesLanding); ligarLanding liga tudo.
const TEXTOS_SECAO = {
  como_usar: [['como_usar_rotulo', 'Rótulo'], ['como_usar_titulo', 'Título']],
  chamadas: [['chamadas_rotulo', 'Rótulo'], ['chamadas_titulo', 'Título']],
  regras: [['regras_rotulo', 'Rótulo'], ['regras_titulo', 'Título'], ['regras_sub', 'Texto de apoio']],
  tarefas: [['tarefas_rotulo', 'Rótulo'], ['tarefas_titulo', 'Título'], ['tarefas_sub', 'Texto de apoio']],
  fim: [['fim_titulo', 'Título'], ['fim_texto', 'Texto'], ['fim_botao', 'Texto do botão']],
};
const REGRAS = [['pode', 'Pode usar'], ['sigilo', 'Ligue “Dados sigilosos”'], ['nunca', 'É bloqueado']];
// Onde cada seção do editor fica na página (para a prévia mostrar a parte que está sendo editada).
const ANCORA = { topo: null, como_usar: 'como-usar', chamadas: 'sec-chamadas', regras: 'sec-regras', tarefas: 'sec-tarefas', institucional: 'sec-inst', fim: 'sec-fim' };
const LINK_OK = /^(https?:\/\/[^\s<>"]+|#[\w-]*|\/[\w\-./#?=&]*|mailto:[^\s<>"]+)$/i;   // o mesmo formato que o servidor aceita

const STATUS_AMBIENTE = { em_implantacao: 'em implantação', suspensa: 'suspenso', cancelada: 'encerrado' };
const comPrevia = (u, edicao = false) => { const [base, hash = ''] = u.split('#'); return `${base}${base.includes('?') ? '&' : '?'}previa=1${edicao ? '&edicao=1' : ''}${hash ? `#${hash}` : ''}`; };
const foraDoAr = l => !!l.empresaStatus && l.empresaStatus !== 'ativa';
const ICONE_NOVA_ABA = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>';

// Situação da página num selo só, ao lado do título da tela (a explicação longa fica na ajuda).
export function estadoLanding(l) {
  const [cls, txt, dica] = l.status !== 'publicada' ? ['selo-ambar', 'Rascunho: ainda não aparece', 'Os visitantes veem só a versão simples, com o título e o botão de entrar, até a página ser publicada.']
    : foraDoAr(l) ? ['selo-ambar', 'Publicada, mas fora do ar', `O ambiente está ${STATUS_AMBIENTE[l.empresaStatus] || l.empresaStatus}: os visitantes veem só a versão simples até o ambiente ser ativado.`]
      : ['selo-verde', 'Publicada e no ar', ''];
  return `<span class="selo ${cls} ld-estado"${dica ? ` title="${esc(dica)}"` : ''}>${txt}${dica ? `<span class="sr">. ${esc(dica)}</span>` : ''}</span>`;
}

// Ações do cabeçalho: "Mais ações" e a principal. Publicada: "Salvar e atualizar
// a página", que fica "Sem alterações" (desligado) até algo mudar. Rascunho: "Publicar", e "Salvar rascunho" aparece
// quando há o que salvar. Raras (voltar para rascunho, restaurar o modelo, busca e compartilhamento) no menu.
export function acoesLanding(l, { pode = true, urlPublica = '' } = {}) {
  if (!pode) return '';
  const publicada = l.status === 'publicada';
  const itens = [
    publicada && !foraDoAr(l) && urlPublica ? `<a role="menuitem" href="${esc(urlPublica)}" target="_blank" rel="noopener">Ver a página no ar</a>` : '',
    '<button type="button" role="menuitem" data-acao="seo">Busca e compartilhamento…</button>',
    publicada ? '<button type="button" role="menuitem" data-acao="despublicar">Voltar para rascunho…</button>' : '',
    l.modelo ? '<button type="button" role="menuitem" class="perigo" id="ld-restaurar">Restaurar o modelo…</button>' : '',
  ].join('');
  return `<span class="ld-acoes">
    <span class="ld-menu"><button type="button" class="btn btn-linha btn-pequeno" id="ld-mais" aria-haspopup="menu" aria-expanded="false" aria-controls="ld-mais-lista">Mais ações</button><span class="menu-lista" role="menu" id="ld-mais-lista" aria-labelledby="ld-mais" hidden>${itens}</span></span>
    ${publicada ? '<button type="submit" form="form-landing" class="btn btn-verde btn-pequeno" data-acao="salvar" disabled>Sem alterações</button>'
      : '<button type="submit" form="form-landing" class="btn btn-linha btn-pequeno" data-acao="salvar" disabled hidden>Salvar rascunho</button><button type="button" class="btn btn-verde btn-pequeno" data-acao="publicar">Publicar</button>'}</span>`;
}

// O formulário (seções) e a prévia lado a lado. No pé da tela ficam "Ver como fica" (tela estreita) e, quando o
// salvar do cabeçalho saiu de vista com alterações pendentes, uma cópia dele (nunca os dois à vista ao mesmo tempo). "Ver prévia" em nova aba continua no cabeçalho da prévia: com edição
// liberada, abre o que está nos campos (sem salvar); travada, o que está salvo.
export function renderLanding(l, { pode = true, urlPublica = '', motivo = '', rotaPrevia = '/api/empresa/landing/previa' } = {}) {
  const c = l.content, d = pode ? '' : 'disabled', t = c.textos || {};
  const slots = (lista, n) => [...(lista || []), ...Array(n).fill({})].slice(0, n);
  const inp = (id, v, max, extra = '') => `<input class="entrada" id="${id}" value="${esc(v || '')}" maxlength="${max}" ${d} ${extra}>`;
  const textos = sec => `<div class="grade-2">${TEXTOS_SECAO[sec].map(([k, r]) => `<div class="campo"><label for="lt-${k}">${r}</label>${inp(`lt-${k}`, t[k], k.endsWith('_sub') || k === 'fim_texto' ? 240 : 120, `data-texto="${k}"`)}</div>`).join('')}</div>`;
  const visivel = k => c.secoes?.[k] !== false;
  const APARECE = l.status === 'publicada' ? 'Aparece na página' : 'Aparece ao publicar';
  // Seções opcionais: o interruptor fica no começo do bloco aberto; fechado, o bloco mostra o selo "Oculta".
  const chave = (k, nome) => `<div class="ld-vis" data-vis="${k}"><button type="button" class="switch" role="switch" id="ld-sec-${k}" aria-checked="${visivel(k)}" aria-label="Mostrar a seção ${esc(nome)} na página" ${d}><span></span></button>
    <span class="ld-vis-txt" aria-hidden="true">${visivel(k) ? APARECE : 'Oculta na página'}</span></div>
    <p class="ld-oculta-aviso">Esta seção está oculta: não aparece na página, e os links para ela somem do topo.</p>`;
  const bloco = (k, nome, corpo, secao = false) => `<section class="ld-bloco${secao && !visivel(k) ? ' oculta' : ''}" data-bloco="${k}"${secao ? ` data-secao="${k}"` : ''}>
    <h2 class="ld-bloco-cab"><button type="button" class="ld-bloco-botao" id="ld-cab-${k}" aria-expanded="false" aria-controls="ld-corpo-${k}">
      <span class="ld-bloco-nome">${nome}</span>${secao ? `<span class="selo selo-cinza ld-selo-oculta"${visivel(k) ? ' hidden' : ''}>Oculta</span>` : ''}<span class="ld-resumo" data-resumo="${k}"></span></button></h2>
    <div class="ld-corpo" id="ld-corpo-${k}" role="region" aria-labelledby="ld-cab-${k}" hidden>${secao ? chave(k, nome) : ''}${corpo}</div></section>`;
  const botoes = slots(c.botoes, 3);
  return `<div class="ld-split" id="ld-split">
  <form id="form-landing" novalidate class="ld-editor" data-rota-previa="${esc(rotaPrevia)}">
    ${!pode ? `<div class="faixa-aviso atencao aviso-trava"><b>Edição travada.</b> ${esc(motivo || 'A página de apresentação desta empresa é gerenciada pelo operador da plataforma.')} Você pode ver os textos, mas não alterar.</div>` : ''}
    <datalist id="ld-destinos"><option value="/entrar">Tela de entrada</option><option value="#como-usar">Seção Como usar</option><option value="#sec-chamadas">Seção O que você encontra</option><option value="#sec-regras">Seção Regras de dados</option><option value="#sec-tarefas">Seção Boas tarefas</option><option value="/politica">Política de uso de IA</option></datalist>
    ${bloco('topo', 'Topo', `
      <div class="grade-2"><div class="campo"><label for="ld-rotulo">Rótulo acima do título</label>${inp('ld-rotulo', c.rotulo, 80)}</div>
        <div class="campo"><label for="ld-titulo">Título</label>${inp('ld-titulo', c.titulo, 120)}</div></div>
      <div class="campo"><label for="ld-subtitulo">Subtítulo</label><textarea class="entrada" id="ld-subtitulo" rows="2" maxlength="300" ${d}>${esc(c.subtitulo)}</textarea></div>
      <div class="campo"><label for="ld-descricao">Texto extra (opcional)</label><textarea class="entrada" id="ld-descricao" rows="2" maxlength="1200" ${d}>${esc(c.descricao)}</textarea></div>
      <div class="campo"><label for="ld-imagem">Imagem ao lado do título (opcional)</label>
        <div class="previa-marca" id="ld-imagem-previa">${c.imagem ? `<img src="${esc(c.imagem)}" alt="" style="max-height:80px">` : '<span class="dica">Sem imagem: aparece uma conversa de exemplo.</span>'}</div>
        <div class="linha-botoes">${campoArquivo('ld-imagem', 'image/png,image/jpeg,image/webp', d)}${c.imagem ? `<button type="button" class="btn-texto" id="ld-imagem-remover" ${d}>Remover</button>` : ''}</div><span class="ajuda">PNG, JPG ou WEBP de qualquer tamanho: a imagem é ajustada sozinha.</span></div>
      <div class="ld-botoes-resumo"><span class="legenda" id="ld-botoes-rotulo">Botões</span><span class="ld-botoes-lista" id="ld-botoes-lista"></span>
        <button type="button" class="btn-texto btn-pequeno" id="ld-botoes-abrir" aria-expanded="false" aria-controls="ld-botoes-editar">Editar botões</button></div>
      <div class="repetidor ld-botoes-editar" id="ld-botoes-editar" role="group" aria-labelledby="ld-botoes-rotulo" hidden>${botoes.map((b, i) => `<div class="linha"><label class="campo ld-campo-item">Texto do botão ${i + 1}<input class="entrada" data-botao-texto="${i}" value="${esc(b.texto || '')}" placeholder="Texto do botão" maxlength="40" ${d}></label>
        <label class="campo ld-campo-item">Para onde o botão ${i + 1} leva<input class="entrada" data-botao-link="${i}" value="${esc(b.link || '')}" list="ld-destinos" placeholder="Escolha da lista ou cole um endereço" ${d}></label>
        <label class="campo ld-campo-item">Estilo do botão ${i + 1}<select aria-label="Estilo do botão ${i + 1}" class="entrada" data-botao-estilo="${i}" ${d}><option value="primario" ${b.estilo !== 'secundario' ? 'selected' : ''}>Principal</option><option value="secundario" ${b.estilo === 'secundario' ? 'selected' : ''}>Secundário</option></select></label></div>`).join('')}</div>
      <div class="campo"><label for="ld-destaques">Destaques abaixo dos botões (um por linha, até 4)</label><textarea class="entrada" id="ld-destaques" rows="3" ${d}>${esc((c.destaques || []).join('\n'))}</textarea></div>`)}
    ${bloco('como_usar', 'Como usar', `${textos('como_usar')}
      <div class="repetidor">${slots(c.passos, 4).map((x, i) => `<div class="linha" style="grid-template-columns:1fr 2fr"><label class="campo ld-campo-item">Título do passo ${i + 1}<input class="entrada" data-passo-titulo="${i}" value="${esc(x.titulo || '')}" placeholder="Passo ${i + 1}" maxlength="60" ${d}></label>
        <label class="campo ld-campo-item">Explicação do passo ${i + 1}<input class="entrada" data-passo-texto="${i}" value="${esc(x.texto || '')}" placeholder="Explicação" maxlength="200" ${d}></label></div>`).join('')}</div>`, true)}
    ${bloco('chamadas', 'O que você encontra', `${textos('chamadas')}
      <div class="repetidor">${slots(c.chamadas, 6).map((x, i) => `<div class="linha" style="grid-template-columns:1fr 2fr"><label class="campo ld-campo-item">Título do recurso ${i + 1}<input class="entrada" data-chamada-titulo="${i}" value="${esc(x.titulo || '')}" placeholder="Título" maxlength="60" ${d}></label>
        <label class="campo ld-campo-item">Texto do recurso ${i + 1}<input class="entrada" data-chamada-texto="${i}" value="${esc(x.texto || '')}" placeholder="Texto" maxlength="300" ${d}></label></div>`).join('')}</div><p class="dica">Deixe o título em branco para esconder um bloco.</p>`, true)}
    ${bloco('regras', 'Regras de dados', `${textos('regras')}
      <div class="grade-3">${REGRAS.map(([k, r]) => `<div class="campo"><label for="ld-regra-${k}">${r} <small>(um por linha)</small></label><textarea class="entrada" id="ld-regra-${k}" rows="4" ${d}>${esc((c.regras?.[k] || []).join('\n'))}</textarea></div>`).join('')}</div>`, true)}
    ${bloco('tarefas', 'Boas tarefas', `${textos('tarefas')}
      <div class="repetidor">${slots(c.tarefas, 8).map((x, i) => `<div class="linha" style="grid-template-columns:1fr 3fr"><label class="campo ld-campo-item">Tipo da tarefa ${i + 1}<input class="entrada" data-tarefa-tipo="${i}" value="${esc(x.tipo || '')}" placeholder="Tipo (ex.: Resumir)" maxlength="30" ${d}></label>
        <label class="campo ld-campo-item">Pedido da tarefa ${i + 1}<input class="entrada" data-tarefa-texto="${i}" value="${esc(x.texto || '')}" placeholder="Exemplo de pedido" maxlength="140" ${d}></label></div>`).join('')}</div>`, true)}
    ${bloco('institucional', 'Institucional', `
      <div class="campo"><label for="ld-inst-titulo">Título</label>${inp('ld-inst-titulo', c.institucional?.titulo, 80)}</div>
      <div class="campo"><label for="ld-inst-texto">Texto</label><textarea class="entrada" id="ld-inst-texto" rows="3" maxlength="1200" ${d}>${esc(c.institucional?.texto || '')}</textarea></div>
      <span class="legenda">Links</span><div class="repetidor">${slots(c.institucional?.links, 4).map((x, i) => `<div class="linha" style="grid-template-columns:1fr 2fr"><label class="campo ld-campo-item">Texto do link ${i + 1}<input class="entrada" data-link-texto="${i}" value="${esc(x.texto || '')}" placeholder="Texto do link" maxlength="40" ${d}></label>
        <label class="campo ld-campo-item">Para onde o link ${i + 1} leva<input class="entrada" data-link-url="${i}" value="${esc(x.link || '')}" list="ld-destinos" placeholder="Escolha da lista ou cole um endereço" ${d}></label></div>`).join('')}</div>`, true)}
    ${bloco('fim', 'Fechamento', textos('fim'))}
    <div class="modal-fundo ld-seo" id="ld-seo" hidden><div class="modal" role="dialog" aria-modal="true" aria-labelledby="ld-seo-titulo-h" tabindex="-1">
      <h2 id="ld-seo-titulo-h" tabindex="-1">Busca e compartilhamento</h2><p class="dica">Como a página aparece no Google e quando alguém compartilha o link. Vale ao salvar a página.</p>
      <div class="campo"><label for="ld-seo-title">Título da página</label>${inp('ld-seo-title', l.seo?.title, 70)}</div>
      <div class="campo"><label for="ld-seo-description">Descrição</label>${inp('ld-seo-description', l.seo?.description, 160)}</div>
      <div class="modal-acoes"><button type="button" class="btn btn-linha" data-acao="seo-pronto">Pronto</button></div></div></div>
    <p class="msg-erro oculto" id="ld-erro" role="alert"></p>
    <span class="sr" id="ld-sujo" role="status"></span>
    <div class="ld-ver-barra" id="ld-barra-pe"><button type="button" class="btn btn-linha ld-ver" data-acao="ver-previa" aria-haspopup="dialog" aria-controls="ld-previa">Ver como fica</button>${pode ? `<button type="button" class="btn btn-verde ld-salvar-pe" id="ld-salvar-pe" hidden>${l.status === 'publicada' ? 'Salvar e atualizar a página' : 'Salvar rascunho'}</button>` : ''}</div>
  </form>
  <aside class="ld-previa" id="ld-previa" aria-labelledby="ld-previa-titulo">
    <div class="ld-previa-topo">
      <h2 class="ld-previa-titulo" id="ld-previa-titulo" tabindex="-1">${pode ? 'Prévia — não salva' : 'Prévia do que está salvo'}</h2>
      <span class="ld-previa-estado" id="ld-previa-estado" role="status"></span>
      ${urlPublica ? (pode ? `<button type="button" class="icone-btn ld-nova-aba" data-acao="previa" data-url="${esc(urlPublica)}" data-rota="${esc(rotaPrevia)}" aria-label="Abrir a prévia em nova aba" title="Abrir em nova aba">${ICONE_NOVA_ABA}</button>`
        : `<a class="icone-btn ld-nova-aba" href="${esc(comPrevia(urlPublica))}" target="_blank" rel="noopener" aria-label="Abrir a prévia em nova aba" title="Abrir em nova aba">${ICONE_NOVA_ABA}</a>`) : ''}
      <button type="button" class="btn btn-linha btn-pequeno ld-previa-fechar" data-acao="fechar-previa">Voltar ao editor</button>
    </div>
    <div class="ld-previa-moldura" id="ld-previa-moldura"></div>
  </aside>
</div>`;
}

// Modelo da página pública (index.html sem scripts). Lido a cada prévia montada (o navegador responde do cache,
// conferindo com o servidor), sempre depois de o quadro entrar na página.
const lerModeloPagina = () => fetch('/index.html', { credentials: 'same-origin' }).then(r => (r.ok ? r.text() : Promise.reject(new Error('sem modelo'))))
  .then(html => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('script, link[rel="icon"], meta[name="theme-color"]').forEach(e => e.remove());
    return { cabeca: doc.head.innerHTML, corpo: doc.body.innerHTML };
  });

// pedir: a função de chamada à API da tela (o console tem a sua, com a sessão do operador).
// marca: { empresa, logo, corMarca, privacyNote, retencaoDias } (a mesma forma de /api/publico) para a prévia.
// salvar(status): grava (a tela decide confirmação, aviso e recarga) e chama ler.limpar() quando der certo.
export function ligarLanding(l, { pedir = api, marca = {}, salvar = null } = {}) {
  const $ = id => document.getElementById(id);
  const form = $('form-landing');
  const pode = !form.querySelector('.aviso-trava');
  let removerImagem = false, imagemPronta = null;
  const todos = attr => [...form.querySelectorAll(`[${attr}]`)];
  const vals = attr => todos(attr).map(e => e.value.trim());
  const pares = (a, b, ka, kb) => { const x = vals(a), y = vals(b); return x.map((v, i) => ({ [ka]: v, [kb]: y[i] })); };
  const linhas = id => $(id).value.split('\n').map(s => s.trim()).filter(Boolean);

  // ---- seções: uma aberta por vez, com resumo de uma linha quando fechadas
  const blocos = [...form.querySelectorAll('.ld-bloco')];
  const abrirBloco = (sec, { rolar = true } = {}) => {
    for (const b of blocos) {
      const bt = b.querySelector('.ld-bloco-botao'), abrir = b === sec && bt.getAttribute('aria-expanded') !== 'true';
      bt.setAttribute('aria-expanded', String(abrir)); b.querySelector('.ld-corpo').hidden = !abrir; b.classList.toggle('aberto', abrir);
    }
    if (sec.classList.contains('aberto')) {
      if (rolar) sec.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      mostrarNaPrevia(sec.dataset.bloco);
    }
  };
  for (const b of blocos) b.querySelector('.ld-bloco-botao').addEventListener('click', () => abrirBloco(b));
  // Link direto para um campo (?foco=) ou erro num campo de outra seção: abre a seção dele, fechando as outras.
  const revelarCampo = el => {
    const sec = el?.closest('.ld-bloco');
    if (sec && !sec.classList.contains('aberto')) abrirBloco(sec, { rolar: false });
    if (el?.closest('#ld-botoes-editar')) mostrarBotoes(true);
  };
  form.addEventListener('focusin', ev => { if (ev.target.closest('.ld-corpo[hidden], #ld-botoes-editar[hidden]')) revelarCampo(ev.target); });

  const contar = (n, um, varios) => (n ? `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}` : `Nenhum ${um}`);
  const juntar = (...p) => p.filter(Boolean).join(' · ') || '—';
  const val = id => $(id)?.value.trim() || '';
  const preenchidos = attr => vals(attr).filter(Boolean).length;
  const RESUMOS = {
    topo: () => `Título: ${val('ld-titulo') || '—'}`,
    como_usar: () => juntar(val('lt-como_usar_titulo'), contar(preenchidos('data-passo-titulo'), 'passo', 'passos')),
    chamadas: () => juntar(val('lt-chamadas_titulo'), contar(preenchidos('data-chamada-titulo'), 'recurso', 'recursos')),
    regras: () => `${linhas('ld-regra-pode').length} pode usar · ${linhas('ld-regra-sigilo').length} com sigilo · ${linhas('ld-regra-nunca').length} bloqueados`,
    tarefas: () => juntar(val('lt-tarefas_titulo'), contar(preenchidos('data-tarefa-texto'), 'exemplo', 'exemplos')),
    institucional: () => (val('ld-inst-titulo') || val('ld-inst-texto') ? juntar(val('ld-inst-titulo') && `Título: ${val('ld-inst-titulo')}`, contar(preenchidos('data-link-texto'), 'link', 'links')) : 'Sem conteúdo'),
    fim: () => `Título: ${val('lt-fim_titulo') || '—'}`,
  };
  const listaBotoes = () => { const b = pares('data-botao-texto', 'data-botao-link', 'texto', 'link').filter(x => x.texto && x.link).map(x => x.texto); return b.length ? b.join(' · ') : 'Nenhum botão'; };
  const resumir = () => {
    for (const el of form.querySelectorAll('[data-resumo]')) el.textContent = RESUMOS[el.dataset.resumo]?.() || '';
    $('ld-botoes-lista').textContent = listaBotoes();
  };
  // Botões do topo: a lista compacta; os nove campos só ao pedir.
  const mostrarBotoes = abrir => { $('ld-botoes-editar').hidden = !abrir; $('ld-botoes-abrir').setAttribute('aria-expanded', String(abrir)); $('ld-botoes-abrir').textContent = abrir ? 'Fechar botões' : 'Editar botões'; };
  $('ld-botoes-abrir').addEventListener('click', () => { const abrir = $('ld-botoes-editar').hidden; mostrarBotoes(abrir); if (abrir) form.querySelector('[data-botao-texto="0"]')?.focus(); });

  // ---- interruptor de cada seção opcional (dentro do bloco): marca a seção como oculta na hora
  const mudarSecao = (k, v) => {
    const e = form.querySelector(`[data-vis="${k}"]`), sec = e.closest('.ld-bloco');
    e.querySelector('.switch').setAttribute('aria-checked', v);
    e.querySelector('.ld-vis-txt').textContent = v ? (l?.status === 'publicada' ? 'Aparece na página' : 'Aparece ao publicar') : 'Oculta na página';
    sec.classList.toggle('oculta', !v); sec.querySelector('.ld-selo-oculta').hidden = v;
    e.dispatchEvent(new Event('change', { bubbles: true }));   // conta como alteração do formulário
  };
  for (const e of todos('data-vis')) {
    const b = e.querySelector('.switch');
    e.addEventListener('click', ev => { ev.preventDefault(); if (!b.disabled) mudarSecao(e.dataset.vis, b.getAttribute('aria-checked') !== 'true'); });
    b.addEventListener('keydown', ev => { if (ev.key === ' ' || ev.key === 'Enter') { ev.preventDefault(); ev.stopPropagation(); if (!b.disabled) mudarSecao(e.dataset.vis, b.getAttribute('aria-checked') !== 'true'); } });
  }

  // ---- imagem: ajustada uma vez ao escolher (a prévia e o salvar usam a mesma)
  $('ld-imagem-remover')?.addEventListener('click', () => { removerImagem = true; imagemPronta = null; $('ld-imagem-previa').innerHTML = '<span class="dica">Será removida ao salvar</span>'; form.dispatchEvent(new Event('change')); });
  $('ld-imagem').addEventListener('change', async () => {
    const f = $('ld-imagem').files?.[0];
    imagemPronta = null;
    if (!f) return;
    $('ld-imagem-previa').innerHTML = '<span class="dica">Preparando a imagem…</span>';
    try { imagemPronta = await ajustarImagem(f, AJUSTE_IMAGEM.imagem); removerImagem = false; $('ld-imagem-previa').innerHTML = `<img src="${imagemPronta}" alt="" style="max-height:80px"><span class="dica">Pronta (${kbDe(imagemPronta)} KB). Vale ao salvar.</span>`; agendarPrevia(); }
    catch (e) { $('ld-imagem-previa').innerHTML = `<span class="msg-erro" style="margin:0">${esc(e.message)}</span>`; $('ld-imagem').value = ''; }
  });

  // ---- leitura do formulário (o mesmo corpo para salvar e para a prévia)
  const conteudo = () => {
    const be = vals('data-botao-estilo');
    return {
      rotulo: $('ld-rotulo').value, titulo: $('ld-titulo').value, subtitulo: $('ld-subtitulo').value, descricao: $('ld-descricao').value,
      botoes: pares('data-botao-texto', 'data-botao-link', 'texto', 'link').map((b, i) => ({ ...b, estilo: be[i] })).filter(b => b.texto && b.link),
      destaques: linhas('ld-destaques'),
      textos: Object.fromEntries(todos('data-texto').map(e => [e.dataset.texto, e.value.trim()])),
      passos: pares('data-passo-titulo', 'data-passo-texto', 'titulo', 'texto').filter(x => x.titulo),
      chamadas: pares('data-chamada-titulo', 'data-chamada-texto', 'titulo', 'texto').filter(x => x.titulo),
      regras: Object.fromEntries(REGRAS.map(([k]) => [k, linhas(`ld-regra-${k}`)])),
      tarefas: pares('data-tarefa-tipo', 'data-tarefa-texto', 'tipo', 'texto').filter(x => x.texto),
      secoes: Object.fromEntries(todos('data-vis').map(e => [e.dataset.vis, e.querySelector('.switch').getAttribute('aria-checked') === 'true'])),
      institucional: { titulo: $('ld-inst-titulo').value, texto: $('ld-inst-texto').value, links: pares('data-link-texto', 'data-link-url', 'texto', 'link').filter(x => x.texto && x.link) },
    };
  };
  const seo = () => ({ title: $('ld-seo-title').value, description: $('ld-seo-description').value });
  const ler = async status => {
    const content = conteudo();
    const img = imagemPronta || ($('ld-imagem').files?.[0] ? await ajustarImagem($('ld-imagem').files[0], AJUSTE_IMAGEM.imagem) : null);
    if (img) content.imagem = img; else if (removerImagem) content.imagem = '';
    return { content, seo: seo(), ...(status ? { status } : {}) };
  };

  // ---- alterações: o salvar só liga quando algo mudou; sair sem salvar continua pedindo confirmação
  const vig = vigiarAlteracoes(form, { cliques: '[data-vis], #ld-imagem-remover' });
  const bSalvar = document.querySelector('[data-acao="salvar"][form="form-landing"]');
  const ROTULO_SALVAR = l.status === 'publicada' ? 'Salvar e atualizar a página' : 'Salvar rascunho';
  let sujo = false;
  const marcarSujo = v => {
    sujo = v;
    if (bSalvar) { bSalvar.disabled = !v; bSalvar.textContent = v ? ROTULO_SALVAR : 'Sem alterações'; if (l.status !== 'publicada') bSalvar.hidden = !v; }
    $('ld-sujo').textContent = v ? 'Alterações não salvas' : '';
    atualizarPe();
  };
  const aoMudar = ev => {
    if (ev?.target?.closest?.('[data-sem-alteracao]')) return;
    if (!sujo) marcarSujo(true);
    resumir(); agendarPrevia();
  };
  form.addEventListener('input', aoMudar);
  form.addEventListener('change', aoMudar);
  ler.limpar = () => { vig.limpar(); marcarSujo(false); };

  // ---- prévia ao vivo (iframe sem scripts, com a mesma estrutura e o mesmo desenho da página pública)
  const split = $('ld-split'), painel = $('ld-previa'), estado = $('ld-previa-estado'), bVer = document.querySelector('[data-acao="ver-previa"]');
  // Pé da tela: "Ver como fica" em tela estreita; o salvar, quando o do cabeçalho saiu de vista e há o que salvar.
  const pe = $('ld-barra-pe'), bPe = $('ld-salvar-pe');
  let cabecalhoVisivel = true;
  function atualizarPe() {
    bVer.hidden = split.classList.contains('dividido');
    if (bPe) { bPe.hidden = !(sujo && !cabecalhoVisivel && bSalvar); if (bSalvar) bPe.textContent = bSalvar.textContent; }
    pe.hidden = bVer.hidden && (!bPe || bPe.hidden);
  }
  if (bSalvar && bPe) {
    new IntersectionObserver(es => { cabecalhoVisivel = es.at(-1).isIntersecting || bSalvar.hidden; atualizarPe(); }).observe(bSalvar.closest('.ld-acoes') || bSalvar);
    bPe.addEventListener('click', () => bSalvar.click());
  }
  let ultimo = { content: l.content, seo: l.seo }, pronto = false, seq = 0, timer = 0, secaoAtual = 'topo', quadro = null;
  const visivelPrevia = () => split.classList.contains('dividido') || painel.classList.contains('tela-cheia');
  const cssMarca = () => {
    if (!/^#[0-9a-f]{6}$/i.test(marca.corMarca || '')) return '';
    const { claro, escuro } = tonsMarca(marca.corMarca), decl = o => Object.entries(o).map(([k, v]) => `${k}:${v}`).join(';');
    return `:root{${decl(claro)}}@media (prefers-color-scheme: dark){:root:not([data-tema="claro"]){${decl(escuro)}}}:root[data-tema="escuro"]{${decl(escuro)}}`;
  };
  async function montar() {
    // O quadro só nasce quando a prévia aparece (tela larga ou "Ver como fica"): no celular, nada carrega à toa. Entra
    // na página vazio e depois recebe o documento (srcdoc: sem endereço próprio, herda a origem e as regras de
    // segurança desta tela), numa navegação de verdade, como a de qualquer quadro.
    quadro = Object.assign(document.createElement('iframe'), { className: 'ld-previa-quadro', id: 'ld-previa-quadro', title: 'Prévia da página de apresentação' });
    quadro.setAttribute('sandbox', 'allow-same-origin');
    $('ld-previa-moldura').append(quadro);
    const m = await lerModeloPagina();
    const tema = document.documentElement.dataset.tema ? ` data-tema="${esc(document.documentElement.dataset.tema)}"` : '';
    await new Promise(ok => {
      quadro.addEventListener('load', ok, { once: true });
      quadro.srcdoc = `<!DOCTYPE html><html lang="pt-BR"${tema}><head>${m.cabeca}<style id="cores-marca">${cssMarca()}</style><style>html{scroll-behavior:auto}.l-surge{opacity:1!important;transform:none!important}</style></head><body class="l p">${m.corpo}</body></html>`;
    });
    const doc = quadro.contentDocument;
    // Na prévia nenhum link sai daqui: os da própria página rolam até a seção; os outros não fazem nada.
    doc.addEventListener('click', ev => {
      const a = ev.target.closest?.('a');
      if (!a) return;
      ev.preventDefault();
      const h = a.getAttribute('href') || '';
      if (h.startsWith('#') && h.length > 1) doc.getElementById(h.slice(1))?.scrollIntoView({ block: 'start' });
    });
    doc.addEventListener('submit', ev => ev.preventDefault());
    pronto = { corpo: m.corpo };
  }
  function desenhar() {
    const doc = quadro?.contentDocument;
    if (!pronto || !doc?.body) return;
    const y = quadro.contentWindow.scrollY;
    doc.body.innerHTML = pronto.corpo;
    const p = marca;
    doc.querySelectorAll('[data-plataforma]').forEach(e => e.remove());
    doc.querySelectorAll('[data-empresa]').forEach(e => { e.textContent = p.empresa || 'sua empresa'; });
    doc.querySelectorAll('[data-privacidade]').forEach(e => { e.textContent = p.privacyNote || ''; });
    if (p.logo) { doc.getElementById('p-logo').innerHTML = `<img class="logo-empresa" src="${esc(p.logo)}" alt="${esc(p.empresa || 'Empresa')}">`; doc.querySelector('#p-marca .p-nome')?.classList.add('oculto'); }
    const dias = Number(p.retencaoDias);
    if (dias > 0) { doc.getElementById('p-retencao').textContent = `Conversas sem uso são apagadas depois de ${dias.toLocaleString('pt-BR')} ${dias === 1 ? 'dia' : 'dias'}.`; doc.getElementById('pp-retencao').textContent = `Retenção de ${dias.toLocaleString('pt-BR')} ${dias === 1 ? 'dia' : 'dias'} sem uso`; }
    prepararLanding(doc);
    desenharLanding(doc, ultimo.content, ultimo.seo);
    // Marca branca: o nome da plataforma não aparece na página da empresa.
    const w = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) if (n.data.includes('GreenIA')) n.data = semMarcaDaPlataforma(n.data);
    quadro.contentWindow.scrollTo(0, y);
  }
  function mostrarNaPrevia(k) {
    secaoAtual = k;
    if (!pronto || !visivelPrevia()) return;
    const doc = quadro.contentDocument, id = ANCORA[k];
    const alvo = id && doc.getElementById(id);
    if (alvo && !alvo.classList.contains('oculto')) alvo.scrollIntoView({ block: 'start' });
    else if (!id) quadro.contentWindow.scrollTo(0, 0);
  }
  // O servidor confere o conteúdo com as mesmas regras do salvar (sem gravar); a imagem nova entra só aqui na tela.
  async function atualizar() {
    if (!pode) return;
    const n = ++seq;
    painel.classList.add('atualizando');
    try {
      const r = await pedir(form.dataset.rotaPrevia, { metodo: 'POST', corpo: { content: conteudo(), seo: seo() } });
      if (n !== seq) return;
      const content = { ...r.content };
      if (imagemPronta) content.imagem = imagemPronta; else if (removerImagem) content.imagem = '';
      ultimo = { content, seo: r.seo };
      estado.textContent = ''; painel.classList.remove('atualizando');
      desenhar();
    } catch (e) {
      if (n === seq) { painel.classList.remove('atualizando'); estado.textContent = `Prévia não atualizada: ${e.message}`; }
    }
  }
  function agendarPrevia() {
    clearTimeout(timer);
    if (!pode) return;
    if (!visivelPrevia()) { atualizarAoAbrir = true; return; }
    timer = setTimeout(atualizar, 450);
  }
  let atualizarAoAbrir = false;
  const iniciarPrevia = async () => {
    if (pronto || iniciarPrevia.indo) return;
    iniciarPrevia.indo = true;
    try { await montar(); desenhar(); mostrarNaPrevia(secaoAtual); }
    catch { quadro?.remove(); quadro = null; estado.textContent = 'Não foi possível montar a prévia aqui. Use “Abrir em nova aba”.'; }
    iniciarPrevia.indo = false;
  };
  // Tela larga: editor e prévia lado a lado. Estreita: a prévia abre por "Ver como fica", na tela inteira.
  const medir = () => {
    const dividido = split.clientWidth >= 900;
    split.classList.toggle('dividido', dividido);
    atualizarPe();
    if (dividido && painel.classList.contains('tela-cheia')) fecharTelaCheia(false);
    if (dividido) { iniciarPrevia(); if (atualizarAoAbrir) { atualizarAoAbrir = false; agendarPrevia(); } }
  };
  new ResizeObserver(medir).observe(split);
  medir();
  let origemFoco = null;
  const conterFoco = ev => {
    if (ev.key === 'Escape') { ev.preventDefault(); fecharTelaCheia(); return; }
    if (ev.key !== 'Tab') return;
    const f = [...painel.querySelectorAll('button, a[href], iframe')].filter(e => e.offsetParent !== null);
    if (!f.length) return;
    if (ev.shiftKey && document.activeElement === f[0]) { ev.preventDefault(); f.at(-1).focus(); }
    else if (!ev.shiftKey && document.activeElement === f.at(-1)) { ev.preventDefault(); f[0].focus(); }
  };
  function abrirTelaCheia() {
    origemFoco = document.activeElement;
    painel.classList.add('tela-cheia'); painel.setAttribute('role', 'dialog'); painel.setAttribute('aria-modal', 'true');
    document.documentElement.classList.add('ld-previa-aberta');
    painel.addEventListener('keydown', conterFoco);
    $('ld-previa-titulo').focus();
    iniciarPrevia().then(() => { if (atualizarAoAbrir) { atualizarAoAbrir = false; atualizar(); } else mostrarNaPrevia(secaoAtual); });
  }
  function fecharTelaCheia(devolver = true) {
    painel.classList.remove('tela-cheia'); painel.removeAttribute('role'); painel.removeAttribute('aria-modal');
    document.documentElement.classList.remove('ld-previa-aberta');
    painel.removeEventListener('keydown', conterFoco);
    if (devolver && origemFoco?.isConnected) origemFoco.focus({ preventScroll: true });
  }
  bVer?.addEventListener('click', abrirTelaCheia);
  painel.querySelector('[data-acao="fechar-previa"]').addEventListener('click', () => fecharTelaCheia());

  // ---- "Mais ações": lista de ações raras (teclado: setas, Esc devolve o foco ao botão)
  const bMais = $('ld-mais'), lista = $('ld-mais-lista');
  const fecharMenu = (foco = false) => { if (!lista || lista.hidden) return; lista.hidden = true; bMais.setAttribute('aria-expanded', 'false'); if (foco) bMais.focus(); };
  bMais?.addEventListener('click', () => {
    const abrir = lista.hidden;
    lista.hidden = !abrir; bMais.setAttribute('aria-expanded', String(abrir));
    if (abrir) {
      lista.style.transform = '';
      const r = lista.getBoundingClientRect(), dx = r.left < 8 ? 8 - r.left : r.right > innerWidth - 8 ? innerWidth - 8 - r.right : 0;
      if (dx) lista.style.transform = `translateX(${Math.round(dx)}px)`;
      lista.querySelector('[role=menuitem]')?.focus();
    }
  });
  lista?.addEventListener('keydown', ev => {
    const itens = [...lista.querySelectorAll('[role=menuitem]')], i = itens.indexOf(document.activeElement);
    if (ev.key === 'Escape') { ev.preventDefault(); fecharMenu(true); }
    else if (ev.key === 'Tab') fecharMenu();
    else if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { ev.preventDefault(); itens[(i + (ev.key === 'ArrowDown' ? 1 : -1) + itens.length) % itens.length]?.focus(); }
    else if (ev.key === 'Home' || ev.key === 'End') { ev.preventDefault(); itens[ev.key === 'Home' ? 0 : itens.length - 1]?.focus(); }
  });
  const foraDoMenu = ev => { if (!lista?.isConnected) return document.removeEventListener('click', foraDoMenu, true); if (!ev.target.closest?.('.ld-menu')) fecharMenu(); };
  document.addEventListener('click', foraDoMenu, true);
  lista?.addEventListener('click', ev => { if (ev.target.closest('[role=menuitem]')) fecharMenu(); });

  // Busca e compartilhamento: dois campos raros, num diálogo do próprio formulário.
  const seoCaixa = $('ld-seo');
  const fecharSeo = () => { seoCaixa.hidden = true; document.removeEventListener('keydown', escSeo, true); bMais?.focus(); };
  const escSeo = ev => { if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); fecharSeo(); } };
  document.querySelector('[data-acao="seo"]')?.addEventListener('click', () => { seoCaixa.hidden = false; document.addEventListener('keydown', escSeo, true); $('ld-seo-titulo-h').focus(); });
  seoCaixa.querySelector('[data-acao="seo-pronto"]').addEventListener('click', fecharSeo);
  seoCaixa.addEventListener('click', ev => { if (ev.target === seoCaixa) fecharSeo(); });

  // Restaurar o modelo: devolve os textos originais nos campos (só vale ao salvar).
  $('ld-restaurar')?.addEventListener('click', async () => {
    if (!l?.modelo || !await confirmar({ titulo: 'Restaurar os textos do modelo?', texto: 'Todos os textos da página são trocados pelos do modelo. Nada muda na página até você salvar.', botao: 'Restaurar o modelo', perigo: true })) return;
    const m = l.modelo, set = (id, v) => { if ($(id)) $(id).value = v ?? ''; };
    const lista2 = (attr, arr, k) => todos(attr).forEach((e, i) => { e.value = arr?.[i]?.[k] ?? ''; });
    set('ld-rotulo', m.rotulo); set('ld-titulo', m.titulo); set('ld-subtitulo', m.subtitulo); set('ld-descricao', m.descricao);
    lista2('data-botao-texto', m.botoes, 'texto'); lista2('data-botao-link', m.botoes, 'link'); todos('data-botao-estilo').forEach((e, i) => { e.value = m.botoes?.[i]?.estilo || 'primario'; });
    set('ld-destaques', (m.destaques || []).join('\n'));
    todos('data-texto').forEach(e => { e.value = m.textos?.[e.dataset.texto] ?? ''; });
    lista2('data-passo-titulo', m.passos, 'titulo'); lista2('data-passo-texto', m.passos, 'texto');
    lista2('data-chamada-titulo', m.chamadas, 'titulo'); lista2('data-chamada-texto', m.chamadas, 'texto');
    for (const [k] of REGRAS) set(`ld-regra-${k}`, (m.regras?.[k] || []).join('\n'));
    lista2('data-tarefa-tipo', m.tarefas, 'tipo'); lista2('data-tarefa-texto', m.tarefas, 'texto');
    set('ld-inst-titulo', m.institucional?.titulo); set('ld-inst-texto', m.institucional?.texto);
    lista2('data-link-texto', m.institucional?.links, 'texto'); lista2('data-link-url', m.institucional?.links, 'link');
    for (const e of todos('data-vis')) mudarSecao(e.dataset.vis, true);
    set('ld-seo-title', l.modeloSeo?.title); set('ld-seo-description', l.modeloSeo?.description);
    vig.marcar(); aoMudar();
    toast('Textos do modelo de volta nos campos. Salve para valer na página.');
  });

  // ---- salvar, publicar e voltar para rascunho (a tela decide como gravar)
  if (salvar) {
    form.addEventListener('submit', ev => { ev.preventDefault(); if (sujo || l.status !== 'publicada') salvar(); });
    document.querySelector('[data-acao="publicar"]')?.addEventListener('click', () => salvar('publicada'));
    document.querySelector('[data-acao="despublicar"]')?.addEventListener('click', async () => {
      if (!await confirmar({ titulo: 'Voltar a página para rascunho?', texto: 'Os visitantes passam a ver só a versão simples, com o título e o botão de entrar, até você publicar de novo. Os textos continuam guardados.', botao: 'Voltar para rascunho' })) return;
      salvar('rascunho');
    });
  }

  // ---- "Abrir em nova aba": a página de apresentação, aberta em outra aba, pede o conteúdo a esta janela. A página
  // só aceita o que vem da janela que a abriu e confere de novo no servidor do endereço da empresa antes de mostrar.
  const bPrevia = document.querySelector('[data-acao="previa"]');
  bPrevia?.addEventListener('click', async () => {
    $('ld-erro')?.classList.add('oculto');
    const url = new URL(bPrevia.dataset.url, location.href), origem = url.origin;
    let pronto2;
    const dados = new Promise(ok => { pronto2 = ok; });
    let janela = null;
    const responder = async ev => {
      if (!janela || ev.source !== janela || ev.origin !== origem || ev.data?.tipo !== 'greenia-previa-pronta') return;
      const d = await dados;
      janela.postMessage(d ? { tipo: 'greenia-previa', content: d.content, seo: d.seo } : { tipo: 'greenia-previa-cancelada' }, origem);
    };
    window.addEventListener('message', responder);
    setTimeout(() => window.removeEventListener('message', responder), 120000);
    janela = window.open(comPrevia(url.href, true), '_blank');   // aberta no clique, para o navegador não bloquear
    if (!janela) { window.removeEventListener('message', responder); return mostrarErroLanding(new Error('O navegador bloqueou a nova aba. Permita janelas deste endereço e clique em “Abrir em nova aba” de novo.')); }
    try { pronto2(await pedir(bPrevia.dataset.rota, { metodo: 'POST', corpo: await ler() })); }
    catch (e) {
      pronto2(null); mostrarErroLanding(e);
      // A aba ainda pode estar carregando, e aí o navegador às vezes ignora o close(): tenta de novo e, se ela chegar
      // a pedir o conteúdo, recebe "cancelada" e se fecha (ver landing.js).
      const fechar = () => { try { if (!janela.closed) janela.close(); } catch { /* aba de outra origem já navegou */ } };
      fechar(); setTimeout(fechar, 400); setTimeout(fechar, 1500);
    }
  });

  resumir();
  marcarSujo(false);
  ler.revelarCampo = revelarCampo;
  return ler;
}

// Erro ao salvar ou ao abrir a prévia: a mensagem no fim do formulário e, quando dá para saber o campo (link inválido,
// título obrigatório…), a seção dele abre e o campo ganha o foco.
const CAMPO_DO_ERRO = { rotulo: 'ld-rotulo', titulo: 'ld-titulo', subtitulo: 'ld-subtitulo', descricao: 'ld-descricao', imagem: 'ld-imagem', destaque: 'ld-destaques', seo: 'ld-seo-title', institucional: 'ld-inst-titulo' };
export function mostrarErroLanding(e) {
  const el = document.getElementById('ld-erro');
  if (!el) return;
  el.textContent = e.message; el.classList.remove('oculto');
  const form = document.getElementById('form-landing');
  const cod = e.codigo || e.erro || e.campo;
  const campo = cod === 'link' ? [...form.querySelectorAll('[data-botao-link], [data-link-url]')].find(x => x.value.trim() && !LINK_OK.test(x.value.trim()))
    : cod && document.getElementById(CAMPO_DO_ERRO[cod] || `lt-${cod}`);
  if (!campo || campo.id === 'ld-seo-title') { el.scrollIntoView({ block: 'center' }); return; }
  campo.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
  campo.classList.add('invalida'); campo.setAttribute('aria-invalid', 'true');
  campo.addEventListener('input', () => { campo.classList.remove('invalida'); campo.removeAttribute('aria-invalid'); }, { once: true });
  campo.scrollIntoView({ block: 'center' }); campo.focus({ preventScroll: true });
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
        <div class="url-topo"><span class="url-num">1</span><div><h2>Endereço na plataforma</h2><p class="dica">Já funciona, sem configurar nada. Ao trocar, o endereço antigo continua levando para cá.</p></div></div>
        <div class="campo"><label for="url-slug">Identificador</label>
          <div class="url-prefixo"><span>${esc(base.replace(/^https?:\/\//, ''))}/</span><input class="entrada" id="url-slug" value="${esc(u.slug)}" maxlength="40" autocomplete="off" ${pode.url ? '' : 'disabled'}></div>
          <span class="ajuda">Letras minúsculas, números e hífens (3 a 40).</span></div>
        <div class="url-final"><span class="dica">Endereço completo</span><b id="url-previa">${esc(base)}/${esc(u.slug)}</b>${copiar(`${base}/${u.slug}`)}</div>
        ${pode.url ? '' : '<p class="dica">O endereço desta empresa é gerenciado pela equipe da plataforma.</p>'}
      </section>
      <section class="url-caixa">
        <div class="url-topo"><span class="url-num">2</span><div><h2>Domínio próprio <small>(opcional)</small> ${selo}</h2><p class="dica">Para usar um endereço da própria empresa, como <b>ia.suaempresa.com.br</b>. Use um subdomínio: o domínio principal (suaempresa.com.br) normalmente já é o site.</p></div></div>
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
