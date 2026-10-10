// Fontes do Quick Win (tela de criação e de configuração): arquivos, links e o conhecimento da empresa, cada um com
// um papel (base de conhecimento, referência, fonte obrigatória, material complementar) e a situação da leitura.
// Fica separado dos entregáveis: fonte é o que o trabalho USA; entregável é o que ele ENTREGA.
import { api, esc, toast } from '/comum.js';

export const PAPEIS = [
  ['KNOWLEDGE_BASE', 'Base de conhecimento', 'Fundamento factual do trabalho.'],
  ['REFERENCE', 'Referência', 'Modelo de estilo, estrutura e linguagem; não é fato do novo caso.'],
  ['REQUIRED_SOURCE', 'Fonte obrigatória', 'O resultado precisa usar esta fonte.'],
  ['SUPPLEMENTARY', 'Material complementar', 'Ajuda quando houver; não bloqueia.'],
];
const ACEITOS = '.pdf,.docx,.pptx,.txt,.md,.csv,.xlsx,.png,.jpg,.jpeg,.webp';
const SITUACAO = { READY: ['Pronta', 'ok'], PROCESSING: ['Lendo…', 'atencao'], UPLOADING: ['Enviando…', 'atencao'], FAILED: ['Não foi possível ler', 'erro'], UNSUPPORTED: ['Formato não suportado', 'erro'] };
const TIPO = { file: 'Arquivo', url: 'Link', company_knowledge: 'Conhecimento da empresa', conversation_material: 'Material da conversa' };
const selPapel = (id, atual, rotulo) => `<div class="papel-fonte"><select class="entrada cfg" data-papel="${esc(id)}" aria-label="Como usar ${esc(rotulo)}" aria-describedby="papel-ajuda-${esc(id)}">${PAPEIS.map(([v, r]) => `<option value="${v}" ${v === atual ? 'selected' : ''}>${r}</option>`).join('')}</select><span class="ajuda" id="papel-ajuda-${esc(id)}">${esc(PAPEIS.find(([v]) => v === atual)?.[2] || '')}</span></div>`;
const lerArquivo = f => new Promise((ok, falha) => { const r = new FileReader(); r.onload = () => ok({ nome: f.name, base64: String(r.result).split(',')[1] }); r.onerror = () => falha(new Error('Não foi possível ler o arquivo.')); r.readAsDataURL(f); });

function html(fontes, { carregando = false } = {}) {
  const linhas = fontes.map(f => {
    const [sit, tom] = SITUACAO[f.status] || SITUACAO.READY;
    const chave = f.tipo === 'company_knowledge' ? 'base' : String(f.documento_id);
    return `<li class="fonte-item">
      <span class="principal-texto"><b>${esc(f.titulo)}</b><span class="dica">${TIPO[f.tipo] || 'Fonte'}${f.url ? ` · ${esc(f.url)}` : f.origem && f.tipo === 'file' ? ` · ${esc(f.origem)}` : ''}${f.erro ? ` · ${esc(f.erro)}` : ''}</span></span>
      <span class="artefato-selo ${tom}">${sit}</span>
      ${selPapel(chave, f.papel, f.titulo)}
      ${f.tipo === 'company_knowledge' ? '' : `<button type="button" class="link-sutil" data-tirar-fonte="${chave}" aria-label="Remover ${esc(f.titulo)}">Remover</button>`}</li>`;
  }).join('');
  const temBase = fontes.some(f => f.tipo === 'company_knowledge');
  return `<section class="fontes" aria-labelledby="fontes-titulo">
    <h4 id="fontes-titulo">Materiais que este Quick Win usa</h4>
    <p class="dica">Estes materiais acompanham o Quick Win nos próximos casos. Eles são diferentes dos arquivos enviados só para uma conversa. Fontes adicionais são opcionais; uma fonte marcada como obrigatória precisa estar disponível.</p>
    ${carregando ? '<p class="dica">Carregando…</p>' : linhas ? `<ul class="fontes-lista">${linhas}</ul>` : '<p class="dica">Nenhuma fonte ainda.</p>'}
    <div class="linha-botoes fontes-acoes">
      <button type="button" class="btn btn-linha btn-pequeno" data-fonte-acao="arquivo">Enviar arquivo</button>
      <button type="button" class="btn btn-linha btn-pequeno" data-fonte-acao="link" aria-expanded="false" aria-controls="fonte-link">Adicionar link</button>
      ${temBase ? '' : '<button type="button" class="btn btn-linha btn-pequeno" data-fonte-acao="base">Usar conhecimento da empresa</button>'}
      <button type="button" class="btn btn-linha btn-pequeno" data-fonte-acao="referencia">Adicionar exemplo de estilo</button>
      <label class="dica"><input type="checkbox" data-fonte-sigilosa> arquivo sigiloso</label>
      <input type="file" hidden data-fonte-arquivo accept="${ACEITOS}"></div>
    <div class="fonte-link oculto" id="fonte-link"><label class="legenda" for="fonte-url">Link público (https)</label>
      <input class="entrada" id="fonte-url" type="url" inputmode="url" placeholder="https://..." maxlength="2000">
      ${selPapel('novo-link', 'KNOWLEDGE_BASE', 'novo link')}
      <button type="button" class="btn btn-linha btn-pequeno" data-fonte-acao="ler-link">Adicionar</button>
      <span class="dica">Páginas que exigem login não são lidas: para conteúdo restrito, use uma integração da empresa.</span></div>
    <details class="fontes-guia"><summary>Como escolher o uso de cada material?</summary><dl>${PAPEIS.map(([, r, d]) => `<dt>${r}</dt><dd>${d}</dd>`).join('')}</dl></details>
    <p class="msg-erro oculto" data-fonte-erro role="alert"></p>
  </section>`;
}

// Monta a seção em `raiz`. obterId(): devolve o id do Quick Win (cria o rascunho se ainda não existe).
export async function montarFontes(raiz, { obterId, idAtual = null }) {
  if (!raiz) return;
  let fontes = [];
  const falha = msg => { const el = raiz.querySelector('[data-fonte-erro]'); if (el) { el.textContent = msg; el.classList.remove('oculto'); } };
  const desenhar = () => { raiz.innerHTML = html(fontes); ligar(); };
  const recarregar = async id => { fontes = (await api(`/api/quick-wins/${id}/fontes`)).fontes; desenhar(); };
  let papelArquivo = 'KNOWLEDGE_BASE';
  const ligar = () => {
    const arq = raiz.querySelector('[data-fonte-arquivo]');
    raiz.querySelectorAll('[data-fonte-acao]').forEach(b => { b.onclick = async () => {
      const acao = b.dataset.fonteAcao;
      if (acao === 'arquivo' || acao === 'referencia') { papelArquivo = acao === 'referencia' ? 'REFERENCE' : 'KNOWLEDGE_BASE'; arq.click(); }
      else if (acao === 'link') { const c = raiz.querySelector('#fonte-link'); c.classList.toggle('oculto'); b.setAttribute('aria-expanded', String(!c.classList.contains('oculto'))); raiz.querySelector('#fonte-url')?.focus(); }
      else if (acao === 'ler-link') {
        const url = raiz.querySelector('#fonte-url').value.trim();
        if (!/^https:\/\//i.test(url)) return falha('Use um link que comece com https://');
        b.disabled = true; b.textContent = 'Lendo…';
        try {
          const id = await obterId();
          const r = await api(`/api/quick-wins/${id}/fontes/link`, { metodo: 'POST', corpo: { url, papel: raiz.querySelector('[data-papel="novo-link"]').value } });
          fontes = r.fontes; desenhar();
          toast(r.fonte?.status === 'READY' ? 'Link lido e adicionado.' : `O link foi registrado, mas não pôde ser lido: ${r.fonte?.erro || 'motivo não informado'}`, 7000);
        } catch (e) { falha(e.message); b.disabled = false; b.textContent = 'Adicionar'; }
      } else if (acao === 'base') {
        try { const id = await obterId(); await api(`/api/quick-wins/${id}`, { metodo: 'PUT', corpo: { bases: { modo: 'area' } } }); await recarregar(id); toast('O conhecimento da empresa permitido para as áreas deste Quick Win entra como fonte.'); }
        catch (e) { falha(e.message); }
      }
    }; });
    arq.onchange = async ev => {
      const f = ev.target.files[0]; ev.target.value = '';
      if (!f) return;
      if (f.size > 25 * 1024 * 1024) return falha('O arquivo passa de 25 MB. Envie uma versão menor.');
      try { const id = await obterId(); await api(`/api/quick-wins/${id}/arquivos`, { metodo: 'POST', corpo: { arquivo: await lerArquivo(f), papel: papelArquivo, sigiloso: !!raiz.querySelector('[data-fonte-sigilosa]')?.checked } }); await recarregar(id); toast('Fonte adicionada.'); }
      catch (e) { falha(e.message); }
    };
    raiz.querySelectorAll('select[data-papel]').forEach(s => { s.onchange = async () => {
      const ajuda = raiz.querySelector(`#papel-ajuda-${CSS.escape(s.dataset.papel)}`);
      if (ajuda) ajuda.textContent = PAPEIS.find(([v]) => v === s.value)?.[2] || '';
      if (s.dataset.papel === 'novo-link') return;
      s.disabled = true;
      try { const id = await obterId(); fontes = (await api(`/api/quick-wins/${id}/fontes/${s.dataset.papel}`, { metodo: 'PUT', corpo: { papel: s.value } })).fontes; desenhar(); toast('Papel da fonte atualizado.'); }
      catch (e) { falha(e.message); s.value = fontes.find(f => String(f.documento_id ?? 'base') === s.dataset.papel)?.papel || 'KNOWLEDGE_BASE'; if (ajuda) ajuda.textContent = PAPEIS.find(([v]) => v === s.value)?.[2] || ''; }
      finally { s.disabled = false; }
    }; });
    raiz.querySelectorAll('[data-tirar-fonte]').forEach(b => { b.onclick = async () => {
      try { const id = await obterId(); fontes = (await api(`/api/quick-wins/${id}/fontes/${b.dataset.tirarFonte}`, { metodo: 'DELETE' })).fontes; desenhar(); }
      catch (e) { falha(e.message); }
    }; });
  };
  raiz.innerHTML = html([], { carregando: !!idAtual });
  ligar();
  if (idAtual) { try { await recarregar(idAtual); } catch { desenhar(); } }
}

// "Fontes usadas" no resultado: o que a execução de fato usou e o que falhou (sem conteúdo).
export function htmlFontesUsadas(q) {
  const f = q?.fontes;
  if (!f || (!f.usadas?.length && !f.obrigatorias_falharam?.length)) return '';
  const rot = Object.fromEntries(PAPEIS.map(([v, r]) => [v, r]));
  return `<div class="fontes-usadas"><b>Fontes usadas</b><ul>${(f.usadas || []).map(u => `<li>${esc(u.titulo)} <span class="dica">· ${esc(u.como === 'estilo' ? 'Referência (só estilo)' : rot[u.papel] || 'Fonte')}</span></li>`).join('')}
    ${(f.obrigatorias_falharam || []).map(u => `<li>${esc(u.titulo)} <span class="dica">· Fonte obrigatória não usada: ${esc(u.motivo)}</span></li>`).join('')}</ul></div>`;
}
