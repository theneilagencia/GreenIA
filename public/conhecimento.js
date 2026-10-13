import { ligarVisao } from '/preferencias.js';
// Biblioteca sobre as APIs existentes: filtros locais nunca ampliam o acesso autorizado pelo servidor.
import { api, esc, toast, ICONE } from '/comum.js';
import { E, recarregarBases } from '/app.js';
import { fecharComEscape } from '/acessibilidade.js';
import { confirmar } from '/admin-ui.js';
import { campoData, lerData } from '/data-br.js';
const ACEITOS = '.pdf,.docx,.pptx,.txt,.md,.csv,.xlsx,.png,.jpg,.jpeg,.webp,.tif,.tiff';
const normalizar = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const baseDe = d => d.toda_empresa ? 'toda' : String(d.area_id);
const data = s => s ? new Date(s.length===10?s+'T12:00:00':s.replace(' ', 'T') + (s.length === 19 ? 'Z' : '')).toLocaleDateString('pt-BR') : '—';
const revisar = d => !d.revisado_em || Date.now() - Date.parse(d.revisado_em.replace(' ', 'T') + (d.revisado_em.length === 19 ? 'Z' : '')) > (E.bases?.diasRevisao || 180) * 864e5;
function arquivoBase64(f) { return new Promise((ok, erro) => { const r = new FileReader(); r.onload = () => ok({ nome: f.name, base64: String(r.result).split(',')[1] }); r.onerror = () => erro(new Error('Não foi possível ler o arquivo. Tente selecioná-lo novamente.')); r.readAsDataURL(f); }); }
// Quick Wins que usam o documento e que a pessoa pode abrir (aparecem na leitura do documento).
const usadoEm = d => (d.quickWins || []).filter(q => E.quickWins.some(v => v.id === q.id));
function conferirArquivo(f) { if (f?.size > 25 * 1024 * 1024) throw new Error('O arquivo passa de 25 MB. Envie uma versão menor.'); }
let estado = null;
let ativa = null;
const envioPendente = () => ativa?.raiz?.isConnected && (ativa.editorSujo || ativa.raiz.querySelector('#doc-arquivo')?.files.length || ativa.raiz.querySelector('#doc-titulo')?.value || ativa.raiz.querySelector('#doc-pasta')?.value);
window.addEventListener('beforeunload', ev => { if (envioPendente() || ativa?.ocupada) { ev.preventDefault(); ev.returnValue = ''; } });
document.addEventListener('greenia:antes-navegar', ev => {
  if (!ativa?.raiz?.isConnected) return;
  if (ativa.ocupada) { ev.preventDefault(); history.replaceState(null, '', ativa.rota); return; }
  if (envioPendente()) {
    // A rota fica onde está enquanto a pessoa decide, no modal da plataforma; confirmando, segue para o destino.
    const destino = location.hash, rota = ativa.rota, a = ativa;
    ev.preventDefault(); history.replaceState(null, '', rota);
    confirmar({ titulo: 'Sair sem salvar?', texto: 'Há um documento ou alterações ainda não salvas. Se sair agora, eles se perdem.', botao: 'Sair sem salvar', cancelar: 'Continuar editando', perigo: true })
      .then(sair => { if (!sair) return; a.dispensarEditor?.(); a.editorSujo = false; a.raiz.querySelector('#doc-form')?.reset?.(); for (const id of ['doc-arquivo', 'doc-titulo', 'doc-pasta']) { const c = a.raiz.querySelector(`#${id}`); if (c) c.value = ''; } location.hash = destino; });
    return;
  }
  ativa.dispensarEditor?.();
});
export async function vistaConhecimento() {
  const raiz = document.getElementById('conteudo');
  // A pessoa já saiu da tela enquanto ela carregava: nada a desenhar (e nada a vigiar na próxima navegação).
  if (!raiz) return;
  const pessoa = `${E.plataforma?.empresa?.id ?? 'local'}:${E.eu.id}`;
  if (estado?.pessoa !== pessoa) estado = { pessoa, vista: 'usar', busca: '', area: '', pasta: '', status: '', ordem: 'titulo', limite: 20, filtrosAbertos: false, envioAberto: false };
  const F = estado;
  ativa = { raiz, rota: location.hash, editorSujo: false, ocupada: false };
  let k, documentos, areas, todaEmpresa;
  const carregar = async () => {
    const dados = await api('/api/conhecimento');
    let gerencia = { documentos: [] }, bases = { areas: [], todaEmpresa: false };
    if (dados.podeGerir) [gerencia, bases] = await Promise.all([api('/api/bases/documentos'), api('/api/bases/areas')]);
    if (!raiz.isConnected) return false;
    k = dados; documentos = gerencia.documentos; areas = bases.areas; todaEmpresa = bases.todaEmpresa;
    if (!k.podeGerir) F.vista = 'usar';
    return true;
  };
  if (!await carregar()) return;
  const basesGeridas = () => [...areas.map(a => ({ ...a, chave: String(a.id) })), ...(todaEmpresa ? [{ chave: 'toda', nome: 'Toda a empresa' }] : [])];
  const lista = () => F.vista === 'gerir' ? documentos : k.documentos;
  const bases = () => F.vista === 'gerir' ? basesGeridas() : [...new Map(k.documentos.map(d => [baseDe(d), { chave: baseDe(d), nome: d.toda_empresa ? 'Toda a empresa' : d.area || 'Área' }])).values()];
  const el = id => raiz.querySelector(`#${id}`);
  const falha = erro => { const a = el('conhecimento-erro'); if (a) { a.textContent = erro.message || erro; a.hidden = false; } };
  const atualizar = async mensagem => { try { if (await carregar()) { montar(); await recarregarBases(); if (mensagem) toast(mensagem); } } catch (e) { falha(e); } };
  function pastas() {
    const nomes = [...new Set(lista().filter(d => !F.area || baseDe(d) === F.area).map(d => d.pasta).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    if (F.pasta !== 'sem-pasta' && F.pasta && !nomes.includes(F.pasta.slice(6))) F.pasta = '';
    el('conhecimento-pasta').innerHTML = `<option value="">Todas</option><option value="sem-pasta">Sem pasta</option>${nomes.map(n => `<option value="pasta:${esc(n)}">${esc(n)}</option>`).join('')}`;
    el('conhecimento-pasta').value = F.pasta;
  }
  // Caminho claro: uma linha de propósito, a ação principal à direita ("Enviar documento", para quem gerencia), a troca
  // de visão discreta, a busca à vista e os demais filtros atrás de "Filtrar". As explicações ficam na Ajuda da tela.
  function montar() {
    if (F.area && !bases().some(b => b.chave === F.area)) F.area = '';
    const ds = lista(), gerir = F.vista === 'gerir', pendentes = gerir ? ds.filter(revisar).length : 0;
    raiz.innerHTML = `<div class="caminho-topo"><p class="caminho-proposito">${gerir ? 'Envie e mantenha os documentos das bases que você administra.' : 'Documentos da empresa que a IA pode consultar para você.'}</p>${k.podeGerir ? `<button type="button" class="btn btn-verde" id="conhecimento-enviar" aria-controls="envio-conhecimento" aria-expanded="false"${F.envioAberto && gerir ? ' hidden' : ''}>${ICONE.mais} Enviar documento</button>` : ''}</div>
      ${k.podeGerir ? `<div class="segmentos conhecimento-vistas" role="group" aria-label="Visão do Conhecimento"><button type="button" class="segmento" data-conhecimento-vista="usar" aria-pressed="${!gerir}">Disponível para mim</button><button type="button" class="segmento" data-conhecimento-vista="gerir" aria-pressed="${gerir}">Gerenciar bases</button></div>` : ''}
      ${pendentes ? `<div class="aviso-linha aviso-atencao caminho-aviso" role="status"><div><b>${pendentes} ${pendentes === 1 ? 'documento pede' : 'documentos pedem'} revisão.</b></div><div class="aviso-acoes"><button type="button" class="btn btn-linha btn-pequeno" data-filtrar-revisao>Ver ${pendentes === 1 ? 'qual' : 'quais'}</button></div></div>` : ''}
      <p class="msg-erro" id="conhecimento-erro" role="alert" hidden></p>
      ${k.podeGerir ? envioHtml() : ''}
      <section class="conhecimento-biblioteca" aria-labelledby="conhecimento-lista-titulo"><h2 class="sr" id="conhecimento-lista-titulo">Documentos</h2>
      ${ds.length ? `<div class="caminho-busca"><label class="caminho-busca-campo">${ICONE.busca}<span class="sr">Buscar documento</span><input type="search" class="entrada" id="conhecimento-busca" value="${esc(F.busca)}" placeholder="Buscar por título, arquivo ou pasta" autocomplete="off"></label>${ds.length > 1 ? `<button type="button" class="btn btn-linha" id="conhecimento-filtrar" aria-expanded="${!!F.filtrosAbertos}" aria-controls="conhecimento-filtros">Filtrar<span class="caminho-contador" id="conhecimento-filtros-ativos"></span></button>` : ''}</div>
      <div class="filtros-biblioteca caminho-filtros" id="conhecimento-filtros"${F.filtrosAbertos && ds.length > 1 ? '' : ' hidden'}>${bases().length > 1 ? `<div class="campo"><label for="conhecimento-base">Base</label><select class="entrada" id="conhecimento-base"></select></div>` : ''}<div class="campo"><label for="conhecimento-pasta">Pasta</label><select class="entrada" id="conhecimento-pasta"></select></div><div class="campo"><label for="conhecimento-status">Mostrar</label><select class="entrada" id="conhecimento-status"><option value="">Todos</option>${k.podeGerir ? '<option value="revisar">Precisam de revisão</option><option value="suspenso">Suspensos</option><option value="vencido">Validade encerrada</option>' : ''}<option value="sigiloso">Sigilosos</option></select></div><div class="campo"><label for="conhecimento-ordem">Ordenar</label><select class="entrada" id="conhecimento-ordem"><option value="titulo">Título de A a Z</option><option value="recente">Atualizados recentemente</option></select></div></div>
      <div class="conhecimento-resultados"><p id="conhecimento-contagem" role="status"></p><span class="linha-botoes"><button type="button" class="btn-texto" data-limpar-conhecimento hidden>Limpar filtros</button><button type="button" class="btn-texto" data-atualizar-conhecimento aria-label="Atualizar a lista de documentos">Atualizar</button></span></div>` : ''}<div id="conhecimento-lista"></div></section>`;
    if (ds.length) {
      pastas(); el('conhecimento-status').value = F.status; el('conhecimento-ordem').value = F.ordem;
      if (el('conhecimento-base')) { el('conhecimento-base').innerHTML = [{ chave: '', nome: 'Todas as bases' }, ...bases()].map(b => `<option value="${esc(b.chave)}">${esc(b.nome)} (${ds.filter(d => !b.chave || baseDe(d) === b.chave).length})</option>`).join(''); el('conhecimento-base').value = F.area; }
    }
    desenharLista(); ligarEnvio();
    if (ds.length > 1) ligarVisao('conhecimento', el('conhecimento-filtros'), () => ({ busca: F.busca, area: F.area, pasta: F.pasta, status: F.status, ordem: F.ordem }), v => {
      for (const key of ['busca', 'area', 'pasta', 'status', 'ordem']) F[key] = String(v[key] || ''); F.limite = 20;
      el('conhecimento-busca').value = F.busca; el('conhecimento-status').value = F.status; el('conhecimento-ordem').value = F.ordem || 'titulo'; if (el('conhecimento-base')) el('conhecimento-base').value = F.area; pastas(); desenharLista();
    });
  }
  // Filtros fechados por padrão; abrem pelo "Filtrar" (ou quando algo pede um filtro, como "Ver quais").
  function abrirFiltros(abrir) {
    F.filtrosAbertos = abrir;
    if (el('conhecimento-filtros')) el('conhecimento-filtros').hidden = !abrir;
    el('conhecimento-filtrar')?.setAttribute('aria-expanded', String(abrir));
  }
  function abrirEnvio(abrir) {
    const painel = el('envio-conhecimento'); if (!painel) return;
    F.envioAberto = abrir; painel.hidden = !abrir;
    const botao = el('conhecimento-enviar'); if (botao) { botao.hidden = abrir; botao.setAttribute('aria-expanded', String(abrir)); }
    if (abrir) el('envio-titulo').focus(); else botao?.focus();
  }
  function desenharLista() {
    // Filtros de gestão (revisão, suspensão, validade) são só de quem gerencia, inclusive vindos de uma visão salva.
    if (!k.podeGerir && !['', 'sigiloso'].includes(F.status)) { F.status = ''; if (el('conhecimento-status')) el('conhecimento-status').value = ''; }
    const ds = lista();
    const gerir = F.vista === 'gerir';
    if (!ds.length) {
      // Estado vazio: uma frase e uma ação (para quem gerencia, a ação principal "Enviar documento" já está no topo).
      el('conhecimento-lista').innerHTML = `<div class="conhecimento-vazio caminho-vazio"><p>${gerir ? 'Nenhum documento nas suas bases ainda. Use “Enviar documento” para começar.' : 'Ainda não há documentos disponíveis para você.'}</p>${gerir ? '' : '<a class="btn btn-linha" href="#/nova">Ir para Nova conversa</a>'}</div>`;
      return;
    }
    const ativos = [F.area, F.pasta, F.status].filter(Boolean).length + (F.ordem === 'recente' ? 1 : 0);
    if (el('conhecimento-filtros-ativos')) el('conhecimento-filtros-ativos').textContent = ativos ? ` (${ativos})` : '';
    raiz.querySelector('[data-limpar-conhecimento]').hidden = !(ativos || F.busca.trim());
    let filtrados = ds.filter(d => (!F.area || baseDe(d) === F.area) && (!F.pasta || (F.pasta === 'sem-pasta' ? !d.pasta : d.pasta === F.pasta.slice(6))) && (!F.status || (F.status === 'revisar' ? revisar(d) : F.status==='sigiloso' ? d.sigiloso : true)) && normalizar(`${d.titulo} ${d.arquivo || ''} ${d.pasta || ''}`).includes(normalizar(F.busca.trim())));
    filtrados = filtrados.filter(d => F.status === 'suspenso' ? d.suspenso : F.status === 'vencido' ? !d.suspenso && d.vigente===false : true);
    filtrados.sort((a, b) => F.ordem === 'recente' ? String(b.atualizado_em).localeCompare(String(a.atualizado_em)) || a.titulo.localeCompare(b.titulo, 'pt-BR') : a.titulo.localeCompare(b.titulo, 'pt-BR'));
    el('conhecimento-contagem').textContent = `${filtrados.length} ${filtrados.length === 1 ? 'documento encontrado' : 'documentos encontrados'}${F.area ? ` · ${bases().find(b => b.chave === F.area)?.nome || ''}` : ''}`;
    const b = gerir && F.area ? areas.find(a => String(a.id) === F.area) : null;
    // Base escolhida (gestão): quem usa e quem administra, numa linha. O "como funciona" fica na Ajuda.
    el('conhecimento-lista').innerHTML = `${b ? `<p class="dica conhecimento-audiencia-linha">${esc(b.nome)}: ${b.membros} ${b.membros === 1 ? 'pessoa' : 'pessoas'} · Administram: ${b.administradores.map(p => esc(p.nome || p.email)).join(', ') || 'admin da empresa'}</p>` : ''}${filtrados.length ? `<ul class="conhecimento-documentos grade-cartoes">${filtrados.slice(0, F.limite).map(d => `<li class="conhecimento-documento cartao" data-documento="${d.id}"><div class="conhecimento-doc-topo"><h3 class="cartao-titulo">${esc(d.titulo)}</h3>${d.sigiloso ? '<span class="selo selo-sigilosa">Sigiloso</span>' : ''}${d.vigente===false?`<span class="selo">${d.suspenso?'Suspenso':'Validade encerrada'}</span>`:''}</div><p class="dica cartao-meta">${esc(d.toda_empresa ? 'Toda a empresa' : d.area || areas.find(a => a.id === d.area_id)?.nome || 'Área')} · ${esc(d.pasta || 'Sem pasta')} · Atualizado em ${data(d.atualizado_em)}</p>${k.podeGerir ? `<p class="dica cartao-meta">${esc(d.arquivo || 'Documento')} · Responsável: ${esc(d.responsavel_nome||'não definido')}${d.validade?' · Válido até '+data(d.validade):''}</p><p class="conhecimento-revisao ${revisar(d) ? 'pendente' : ''}">${revisar(d) ? 'Revisão recomendada' : 'Conteúdo revisado'} · ${d.revisado_em ? data(d.revisado_em) : 'nunca revisado'}</p>` : ''}
      ${gerir ? `<div class="linha-botoes cartao-acoes"><button type="button" class="btn btn-linha btn-pequeno" data-editar-conhecimento="${d.id}">Editar documento</button>${revisar(d) ? `<button type="button" class="btn-texto btn-pequeno" data-revisar-conhecimento="${d.id}">Marcar revisado</button>` : ''}</div>` : d.vigente===false?'':`<div class="linha-botoes cartao-acoes"><button type="button" class="btn btn-linha btn-pequeno conhecimento-abrir" data-abrir-conhecimento="${d.id}" aria-haspopup="dialog">Abrir<span class="sr"> ${esc(d.titulo)}</span></button></div>`}</li>`).join('')}</ul>${filtrados.length > F.limite ? '<button type="button" class="btn btn-linha" data-mais-conhecimento>Mostrar mais documentos</button>' : ''}` : `<div class="conhecimento-vazio caminho-vazio"><p>Nenhum documento corresponde à busca. Tente outra palavra ou limpe os filtros.</p></div>`}`;
  }
  function envioHtml() {
    return `<section id="envio-conhecimento" class="conhecimento-envio" aria-labelledby="envio-titulo"${F.envioAberto && F.vista === 'gerir' ? '' : ' hidden'}><div class="caminho-painel-topo"><h2 id="envio-titulo" tabindex="-1">Enviar documento</h2><button type="button" class="icone-btn" id="doc-fechar" aria-label="Fechar o envio">${ICONE.fechar}</button></div><form id="enviar-doc"><div id="doc-campos"><div class="grade-2"><div class="campo"><label for="doc-destino">Base de destino</label><select class="entrada" id="doc-destino" required>${basesGeridas().map(b => `<option value="${esc(b.chave)}">${esc(b.nome)}</option>`).join('')}</select><p class="ajuda" id="doc-alcance"></p></div><div class="campo"><label for="doc-arquivo">Arquivo</label><input type="file" id="doc-arquivo" required accept="${ACEITOS}" aria-describedby="doc-formatos"><p class="ajuda" id="doc-formatos">PDF, Word, PowerPoint, Excel, texto ou imagem, até 25 MB.</p></div><div class="campo"><label for="doc-titulo">Título (opcional)</label><input class="entrada" id="doc-titulo" maxlength="200" placeholder="Um nome fácil de reconhecer"></div><div class="campo"><label for="doc-pasta">Pasta (opcional)</label><input class="entrada" id="doc-pasta" maxlength="80" list="conhecimento-pastas" placeholder="Ex.: Políticas, Manuais"></div></div><label><input type="checkbox" id="doc-sigiloso"> Conteúdo sigiloso</label></div><div id="doc-confirmacao" hidden></div><p class="msg-erro" id="doc-erro" role="alert" hidden></p><div class="linha-botoes"><button class="btn btn-verde" id="btn-doc" ${basesGeridas().length ? '' : 'disabled'}>Revisar envio</button><button type="button" class="btn btn-linha" id="doc-voltar" hidden>Voltar e ajustar</button></div></form><datalist id="conhecimento-pastas">${[...new Set(documentos.map(d => d.pasta).filter(Boolean))].map(p => `<option value="${esc(p)}">`).join('')}</datalist></section>`;
  }
  function ligarEnvio() {
    const form = el('enviar-doc'); if (!form) return;
    let confirmado = false, ocupado = false;
    const erro = e => { el('doc-erro').textContent = e.message; el('doc-erro').hidden = false; };
    const alcance = () => { el('doc-alcance').textContent = el('doc-destino').value === 'toda' ? 'Disponível para todas as áreas da empresa.' : 'Disponível para as pessoas desta área.'; };
    alcance(); el('doc-destino').onchange = alcance;
    // Fechar o painel com algo começado pede confirmação no modal da plataforma; sem nada, só fecha.
    el('doc-fechar').onclick = async () => {
      if (ocupado) return;
      if (envioPendente() && !await confirmar({ titulo: 'Descartar o envio?', texto: 'O documento ainda não foi enviado.', botao: 'Descartar envio', cancelar: 'Continuar editando', perigo: true })) return;
      form.reset(); confirmado = false; el('doc-campos').hidden = false; el('doc-confirmacao').hidden = true; el('doc-voltar').hidden = true; el('btn-doc').textContent = 'Revisar envio'; el('doc-erro').hidden = true; alcance();
      abrirEnvio(false);
    };
    el('doc-voltar').onclick = () => { confirmado = false; el('doc-campos').hidden = false; el('doc-confirmacao').hidden = true; el('doc-voltar').hidden = true; el('btn-doc').textContent = 'Revisar envio'; el('doc-destino').focus(); };
    form.onsubmit = async ev => {
      ev.preventDefault(); if (ocupado) return;
      const f = el('doc-arquivo').files[0]; if (!f) return;
      try {
        conferirArquivo(f);
        if (!confirmado) {
          const nome = el('doc-destino').selectedOptions[0]?.textContent || '';
          el('doc-confirmacao').innerHTML = `<h3>Confira antes de disponibilizar</h3><p><b>${esc(el('doc-titulo').value.trim() || f.name)}</b></p><p>Destino: <b>${esc(nome)}</b>. ${esc(el('doc-alcance').textContent)}</p><p>Pasta: ${esc(el('doc-pasta').value.trim() || 'Sem pasta')} · ${el('doc-sigiloso').checked ? 'Conteúdo sigiloso' : 'Sigilo não marcado'}</p><p class="dica">Ao confirmar, você declara que conferiu o conteúdo. Ele será indexado para uso pela IA conforme as regras da empresa.</p>`;
          confirmado = true; el('doc-campos').hidden = true; el('doc-confirmacao').hidden = false; el('doc-voltar').hidden = false; el('btn-doc').textContent = 'Confirmar envio'; el('btn-doc').focus(); return;
        }
        ocupado = true; ativa.ocupada = true; el('btn-doc').disabled = true; el('doc-voltar').disabled = true; el('btn-doc').textContent = 'Enviando e lendo…';
        const destino = el('doc-destino').value;
        await api('/api/bases/documentos', { metodo: 'POST', corpo: { arquivo: await arquivoBase64(f), titulo: el('doc-titulo').value, pasta: el('doc-pasta').value, sigiloso: el('doc-sigiloso').checked, ...(destino === 'toda' ? { toda_empresa: true } : { area_id: Number(destino) }) } });
        form.reset(); el('btn-doc').textContent = 'Documento enviado';
        F.envioAberto = false;
        await atualizar('Documento enviado e indexado.');
        el('conhecimento-enviar')?.focus();
      } catch (e) { erro(e); if (el('btn-doc')) { el('btn-doc').disabled = false; el('btn-doc').textContent = confirmado ? 'Confirmar envio' : 'Revisar envio'; el('doc-voltar').disabled = false; } }
      finally { ocupado = false; ativa.ocupada = false; }
    };
  }
  // Leitura do texto extraído (QA UX M17), para quem pode consultar a base: o servidor aplica a mesma regra da
  // consulta pela IA e devolve o texto em páginas. Não há download do arquivo original.
  async function abrir(d, origem) {
    const host = document.getElementById('modal');
    host.innerHTML = `<div class="modal-fundo"><section class="modal conhecimento-leitura" role="dialog" aria-modal="true" aria-labelledby="conhecimento-ler-titulo" aria-describedby="conhecimento-ler-meta" tabindex="-1"><div class="modal-topo"><h2 id="conhecimento-ler-titulo" tabindex="-1">${esc(d.titulo)}</h2><button type="button" class="icone-btn" id="conhecimento-ler-fechar" aria-label="Fechar">×</button></div><p class="dica" id="conhecimento-ler-meta">${esc(d.toda_empresa ? 'Toda a empresa' : d.area || 'Área')} · Atualizado em ${data(d.atualizado_em)}${d.sigiloso ? ' · <span class="selo selo-sigilosa">Sigiloso</span>' : ''}</p><p class="dica">Texto lido do arquivo ${esc(d.arquivo || '')}. Tabelas, imagens e formatação podem aparecer de forma simplificada.</p>${usadoEm(d).length ? `<p class="dica conhecimento-usado-em">Usado em ${usadoEm(d).map(q => `<a href="#/qw/${q.id}">${esc(q.nome)}</a>`).join(', ')}.</p>` : ''}<div class="conhecimento-ler-texto" id="conhecimento-ler-texto" aria-busy="true"><p class="dica">Carregando o texto…</p></div><p class="msg-erro" id="conhecimento-ler-erro" role="alert" hidden></p><p class="dica" id="conhecimento-ler-aviso" role="status"></p><div class="linha-botoes"><button type="button" class="btn btn-linha" id="conhecimento-ler-mais" hidden>Mostrar mais do texto</button><button type="button" class="btn btn-linha" id="conhecimento-ler-ok">Fechar</button></div></section></div>`;
    const $ = id => host.querySelector(`#${id}`);
    const fechar = () => { limpar(); host.innerHTML = ''; origem?.isConnected ? origem.focus() : el('conhecimento-busca')?.focus(); };
    const limpar = fecharComEscape(host.querySelector('.modal'), fechar);
    ativa.dispensarEditor = () => { limpar(); if (host.querySelector('.conhecimento-leitura')) host.innerHTML = ''; };
    $('conhecimento-ler-fechar').onclick = fechar; $('conhecimento-ler-ok').onclick = fechar;
    $('conhecimento-ler-titulo').focus();
    let lido = '';
    const carregarParte = async inicio => {
      const mais = $('conhecimento-ler-mais'); mais.disabled = true;
      try {
        const r = await api(`/api/bases/documentos/${d.id}/conteudo${inicio ? `?inicio=${inicio}` : ''}`);
        if (!host.querySelector('.conhecimento-leitura')) return;
        lido += r.texto;
        const caixa = $('conhecimento-ler-texto');
        caixa.setAttribute('aria-busy', 'false');
        caixa.innerHTML = lido.trim() ? lido.split(/\n{2,}/).map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('') : '<p class="dica">Este documento não tem texto legível.</p>';
        $('conhecimento-ler-aviso').textContent = r.proximo === null ? (inicio ? 'Fim do documento.' : '') : `Mostrando ${r.fim.toLocaleString('pt-BR')} de ${r.total.toLocaleString('pt-BR')} caracteres.`;
        mais.hidden = r.proximo === null; mais.disabled = false;
        mais.onclick = () => carregarParte(r.proximo);
      } catch (e) {
        if (!host.querySelector('.conhecimento-leitura')) return;
        $('conhecimento-ler-texto').setAttribute('aria-busy', 'false');
        if (!lido) $('conhecimento-ler-texto').innerHTML = '';
        $('conhecimento-ler-erro').textContent = e.status === 404 ? 'Este documento não está mais disponível para você. Atualize a biblioteca.' : e.message;
        $('conhecimento-ler-erro').hidden = false; mais.disabled = false;
      }
    };
    await carregarParte(0);
  }
  async function editar(d, origem) {
    let gov;try { gov=await api(`/api/bases/documentos/${d.id}/governanca`); } catch(e) { falha(e);return; }
    if(location.hash.split('?')[0]!=='#/conhecimento')return;
    const host = document.getElementById('modal');
    host.innerHTML = `<div class="modal-fundo"><section class="modal conhecimento-editor" role="dialog" aria-modal="true" aria-labelledby="conhecimento-ed-titulo" tabindex="-1"><div class="modal-topo"><h2 id="conhecimento-ed-titulo">Editar documento</h2><button type="button" class="icone-btn" id="conhecimento-fechar" aria-label="Fechar">×</button></div><p class="dica">${esc(d.toda_empresa ? 'Toda a empresa' : d.area || '')}. Editar a pasta não muda o acesso.</p><form id="conhecimento-ed-form"><div class="campo"><label for="conhecimento-ed-nome">Título</label><input class="entrada" id="conhecimento-ed-nome" required maxlength="200" value="${esc(d.titulo)}"></div><div class="campo"><label for="conhecimento-ed-pasta">Pasta</label><input class="entrada" id="conhecimento-ed-pasta" maxlength="80" value="${esc(d.pasta || '')}" list="conhecimento-pastas"></div><div class="grade-2"><div class="campo"><label for="conhecimento-ed-responsavel">Quem mantém este documento?</label><select class="entrada" id="conhecimento-ed-responsavel"><option value="">Sem responsável</option>${gov.pessoas.map(p=>`<option value="${p.id}" ${p.id===d.responsavel_id?'selected':''}>${esc(p.nome||'Pessoa '+p.id)}</option>`).join('')}</select></div><div class="campo"><label for="conhecimento-ed-validade">Válido até (opcional)</label>${campoData({ id: 'conhecimento-ed-validade', valor: d.validade || '', rotulo: 'a validade' })}<p class="ajuda">Após esta data, deixa de entrar em novas respostas.</p></div></div><label><input type="checkbox" id="conhecimento-ed-suspenso" ${d.suspenso?'checked':''}> Suspender o uso pela IA</label><p class="ajuda">Preserva o documento e seus vínculos. Não remove respostas já geradas.</p><label><input type="checkbox" id="conhecimento-ed-sigilo" ${d.sigiloso ? 'checked' : ''}> Conteúdo sigiloso</label><div class="campo"><label for="conhecimento-ed-arquivo">Substituir arquivo (opcional)</label><input type="file" id="conhecimento-ed-arquivo" accept="${ACEITOS}"><p class="ajuda">O conteúdo atual será substituído e a revisão será registrada. O documento mantém a base e os vínculos existentes.</p></div><p class="msg-erro" id="conhecimento-ed-erro" role="alert" hidden></p><div class="linha-botoes"><button class="btn btn-verde" id="conhecimento-ed-salvar">Salvar alterações</button><button type="button" class="btn btn-linha" id="conhecimento-ed-cancelar">Cancelar</button></div></form><details class="conhecimento-audiencia"><summary>Onde este documento é usado?</summary>${gov.dependencias.length?gov.dependencias.map(q=>`<p><a href="#/qw/${q.id}">${esc(q.nome)}</a></p>`).join(''):'<p>Nenhum Quick Win gerenciado por você está vinculado a esta fonte.</p>'}<p class="dica">Vínculos são configurações de uso, não comprovam consulta em toda execução.</p></details><details class="conhecimento-audiencia"><summary>Histórico de alterações</summary><p class="dica">Registra mudanças de cadastro e substituição do arquivo. Não guarda cópias antigas do conteúdo.</p>${gov.historico.map(h=>{const antes=h.mudanca.antes,depois=h.mudanca.depois;const nomes={titulo:'Título',arquivo:'Arquivo',pasta:'Pasta',sigiloso:'Sigilo',responsavel_id:'Responsável',validade:'Validade',suspenso:'Suspensão',conteudo_hash:'Conteúdo substituído'};return `<p><b>Registro ${h.versao}</b> · ${data(h.em)} · ${esc(h.por||'Pessoa responsável')}<br>${antes?Object.keys(nomes).filter(k=>JSON.stringify(antes[k])!==JSON.stringify(depois[k])).map(k=>esc(nomes[k])).join(', ')||'Revisão registrada':'Documento adicionado'}</p>`;}).join('')||'<p>Documento anterior a este histórico. Novas alterações serão registradas.</p>'}</details><details class="conhecimento-remover"><summary>Remover da base</summary><p>A remoção é permanente e a IA deixa de consultar este conteúdo.</p><button type="button" class="btn btn-linha" id="conhecimento-ed-remover">Remover documento</button></details></section></div>`;
    const $ = id => host.querySelector(`#${id}`); let alterado = false, salvando = false;
    const fechar = async () => { if (salvando || alterado && !await confirmar({ titulo: 'Descartar as alterações?', texto: 'As alterações deste documento ainda não foram salvas.', botao: 'Descartar', cancelar: 'Continuar editando', perigo: true })) return; ativa.editorSujo = false; limpar(); host.innerHTML = ''; origem?.isConnected ? origem.focus() : el('conhecimento-busca')?.focus(); };
    const limpar = fecharComEscape(host.querySelector('.modal'), fechar);
    ativa.dispensarEditor = () => { limpar(); if (host.querySelector('#conhecimento-ed-form')) host.innerHTML = ''; ativa.editorSujo = false; };
    $('conhecimento-ed-form').oninput = () => { alterado = true; ativa.editorSujo = true; };
    $('conhecimento-ed-form').onchange = () => { alterado = true; ativa.editorSujo = true; };
    $('conhecimento-fechar').onclick = fechar; $('conhecimento-ed-cancelar').onclick = fechar;
    const erro = e => { $('conhecimento-ed-erro').textContent = e.message; $('conhecimento-ed-erro').hidden = false; };
    $('conhecimento-ed-form').onsubmit = async ev => {
      ev.preventDefault(); if (salvando) return;
      try {
        if (!$('conhecimento-ed-nome').value.trim()) throw new Error('Informe um título para o documento.');
        if (lerData($('conhecimento-ed-validade')) === null) throw new Error('Use uma validade no formato dd/mm/aaaa.');
        const f = $('conhecimento-ed-arquivo').files[0]; conferirArquivo(f);
        if (!d.suspenso && $('conhecimento-ed-suspenso').checked && !await confirmar({ titulo: `Suspender “${d.titulo}”?`, texto: ['O documento deixa de entrar em novas respostas e nos Quick Wins vinculados.', 'Ele continua guardado na base, com seus vínculos, e pode voltar a ser usado depois.'], botao: 'Suspender documento' })) return;
        if (salvando) return;
        salvando = true; ativa.ocupada = true; $('conhecimento-ed-form').inert = true; $('conhecimento-ed-salvar').disabled = true;
        await api(`/api/bases/documentos/${d.id}`, { metodo: 'PUT', corpo: { titulo: $('conhecimento-ed-nome').value.trim(), pasta: $('conhecimento-ed-pasta').value, sigiloso: $('conhecimento-ed-sigilo').checked, responsavel_id: $('conhecimento-ed-responsavel').value ? Number($('conhecimento-ed-responsavel').value) : null, validade: lerData($('conhecimento-ed-validade')) || null, suspenso: $('conhecimento-ed-suspenso').checked, ...(f ? { arquivo: await arquivoBase64(f) } : {}) } });
        alterado = false; salvando = false; ativa.ocupada = false; fechar(); await atualizar('Documento atualizado.');
      } catch (e) { erro(e); salvando = false; ativa.ocupada = false; $('conhecimento-ed-form').inert = false; $('conhecimento-ed-salvar').disabled = false; }
    };
    $('conhecimento-ed-remover').onclick = async () => {
      if (salvando || !await confirmar({ titulo: `Remover “${d.titulo}” da base?`, texto: ['A remoção é permanente: a IA deixa de consultar este conteúdo e não dá para desfazer.', 'Respostas já geradas não mudam.'], botao: 'Remover documento', perigo: true }) || salvando) return;
      salvando = true; ativa.ocupada = true;
      try { await api(`/api/bases/documentos/${d.id}`, { metodo: 'DELETE' }); alterado = false; salvando = false; ativa.ocupada = false; fechar(); await atualizar('Documento removido.'); }
      catch (e) { salvando = false; ativa.ocupada = false; erro(e); }
    };
    $('conhecimento-ed-nome').focus();
  }
  raiz.oninput = ev => { if (ev.target.id === 'conhecimento-busca') { F.busca = ev.target.value; F.limite = 20; desenharLista(); } };
  raiz.onchange = ev => {
    const campos = { 'conhecimento-base': 'area', 'conhecimento-pasta': 'pasta', 'conhecimento-status': 'status', 'conhecimento-ordem': 'ordem' };
    if (campos[ev.target.id]) { F[campos[ev.target.id]] = ev.target.value; F.limite = 20; if (ev.target.id === 'conhecimento-base') { F.pasta = ''; pastas(); } desenharLista(); }
  };
  raiz.onclick = async ev => {
    const b = ev.target.closest('button'); if (!b) return;
    if (b.hasAttribute('data-atualizar-conhecimento')) { if (ativa.ocupada || envioPendente() && !await confirmar({ titulo: 'Atualizar a biblioteca?', texto: 'As alterações ainda não salvas se perdem.', botao: 'Descartar e atualizar', cancelar: 'Continuar editando', perigo: true })) return; b.disabled = true; await atualizar(); if (b.isConnected) b.disabled = false; }
    else if (b.dataset.conhecimentoVista) { if (b.getAttribute('aria-pressed') === 'true') return; if (ativa.ocupada || envioPendente() && !await confirmar({ titulo: 'Descartar o envio?', texto: 'O documento ainda não foi enviado.', botao: 'Descartar envio', cancelar: 'Continuar editando', perigo: true })) return; F.vista = b.dataset.conhecimentoVista === 'gerir' && k.podeGerir ? 'gerir' : 'usar'; F.area = ''; F.pasta = ''; F.limite = 20; F.envioAberto = false; montar(); raiz.querySelector('.conhecimento-vistas [aria-pressed="true"]')?.focus(); }
    else if (b.id === 'conhecimento-enviar') {
      // A ação principal leva à gestão (se a pessoa estava em "Disponível para mim") e abre o envio.
      if (F.vista !== 'gerir') { F.vista = 'gerir'; F.area = ''; F.pasta = ''; F.limite = 20; F.envioAberto = true; montar(); el('envio-titulo').focus(); }
      else abrirEnvio(true);
    }
    else if (b.id === 'conhecimento-filtrar') abrirFiltros(!F.filtrosAbertos);
    else if (b.hasAttribute('data-filtrar-revisao')) { F.status = 'revisar'; if (el('conhecimento-status')) el('conhecimento-status').value = F.status; F.limite = 20; abrirFiltros(true); desenharLista(); }
    else if (b.hasAttribute('data-limpar-conhecimento')) { Object.assign(F, { busca: '', area: '', pasta: '', status: '', ordem: 'titulo', limite: 20 }); el('conhecimento-busca').value = ''; if (el('conhecimento-status')) { el('conhecimento-status').value = ''; el('conhecimento-ordem').value = 'titulo'; } if (el('conhecimento-base')) el('conhecimento-base').value = ''; pastas(); desenharLista(); el('conhecimento-busca').focus(); }
    else if (b.hasAttribute('data-mais-conhecimento')) { F.limite += 20; desenharLista(); }
    else if (b.dataset.abrirConhecimento) { const d = k.documentos.find(d => String(d.id) === b.dataset.abrirConhecimento); if (d) abrir(d, b); }
    else if (b.dataset.editarConhecimento) { const d = documentos.find(d => String(d.id) === b.dataset.editarConhecimento); if (d && F.vista === 'gerir' && k.podeGerir) editar(d, b); }
    else if (b.dataset.revisarConhecimento && k.podeGerir && F.vista === 'gerir') {
      const d = documentos.find(d => String(d.id) === b.dataset.revisarConhecimento);
      if (!d || !await confirmar({ titulo: `Marcar “${d.titulo}” como revisado?`, texto: 'Confirme só se você conferiu o conteúdo e ele continua correto. A data da revisão fica registrada.', botao: 'Confirmar revisão' })) return;
      b.disabled = true;
      try { await api(`/api/bases/documentos/${d.id}`, { metodo: 'PUT', corpo: { revisado: true } }); await atualizar('Revisão registrada.'); }
      catch (e) { falha(e); b.disabled = false; }
    }
  };
  montar();
}
