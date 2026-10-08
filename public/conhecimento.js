import { ligarVisao } from '/preferencias.js';
// Biblioteca sobre as APIs existentes: filtros locais nunca ampliam o acesso autorizado pelo servidor.
import { api, esc, toast } from '/comum.js';
import { E, recarregarBases } from '/app.js';
import { fecharComEscape } from '/acessibilidade.js';
const ACEITOS = '.pdf,.docx,.pptx,.txt,.md,.csv,.xlsx,.png,.jpg,.jpeg,.webp,.tif,.tiff';
const normalizar = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const baseDe = d => d.toda_empresa ? 'toda' : String(d.area_id);
const data = s => s ? new Date(s.length===10?s+'T12:00:00':s.replace(' ', 'T') + (s.length === 19 ? 'Z' : '')).toLocaleDateString('pt-BR') : '—';
const revisar = d => !d.revisado_em || Date.now() - Date.parse(d.revisado_em.replace(' ', 'T') + (d.revisado_em.length === 19 ? 'Z' : '')) > (E.bases?.diasRevisao || 180) * 864e5;
function arquivoBase64(f) { return new Promise((ok, erro) => { const r = new FileReader(); r.onload = () => ok({ nome: f.name, base64: String(r.result).split(',')[1] }); r.onerror = () => erro(new Error('Não foi possível ler o arquivo. Tente selecioná-lo novamente.')); r.readAsDataURL(f); }); }
function conferirArquivo(f) { if (f?.size > 25 * 1024 * 1024) throw new Error('O arquivo passa de 25 MB. Envie uma versão menor.'); }
let estado = null;
let ativa = null;
const envioPendente = () => ativa?.raiz.isConnected && (ativa.editorSujo || ativa.raiz.querySelector('#doc-arquivo')?.files.length || ativa.raiz.querySelector('#doc-titulo')?.value || ativa.raiz.querySelector('#doc-pasta')?.value);
window.addEventListener('beforeunload', ev => { if (envioPendente() || ativa?.ocupada) { ev.preventDefault(); ev.returnValue = ''; } });
document.addEventListener('greenia:antes-navegar', ev => {
  if (!ativa?.raiz.isConnected) return;
  if (ativa.ocupada || envioPendente() && !confirm('Há um documento ou alterações ainda não salvas. Sair sem salvar?')) { ev.preventDefault(); history.replaceState(null, '', ativa.rota); return; }
  ativa.dispensarEditor?.();
});
export async function vistaConhecimento() {
  const raiz = document.getElementById('conteudo');
  const pessoa = `${E.plataforma?.empresa?.id ?? 'local'}:${E.eu.id}`;
  if (estado?.pessoa !== pessoa) estado = { pessoa, vista: 'usar', busca: '', area: '', pasta: '', status: '', ordem: 'titulo', limite: 20 };
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
    el('conhecimento-pasta').innerHTML = `<option value="">Todas as pastas</option><option value="sem-pasta">Sem pasta</option>${nomes.map(n => `<option value="pasta:${esc(n)}">${esc(n)}</option>`).join('')}`;
    el('conhecimento-pasta').value = F.pasta;
  }
  function montar() {
    if (F.area && !bases().some(b => b.chave === F.area)) F.area = '';
    const ds = lista();
    raiz.innerHTML = `<div class="conhecimento-topo"><div><p class="lead">Encontre os documentos que podem orientar suas tarefas.</p><details class="conhecimento-ajuda"><summary>O que a IA pode consultar?</summary><p class="dica">Só aparecem os conteúdos permitidos para o seu perfil. A IA usa trechos relevantes quando encontra fontes; não consulta necessariamente todos os documentos em cada resposta.</p></details></div><div class="linha-botoes"><a class="btn btn-linha" href="#/primeiros-passos">Como usar</a><button type="button" class="btn btn-linha" data-atualizar-conhecimento aria-label="Atualizar biblioteca de documentos">Atualizar</button></div></div>
      ${k.podeGerir ? `<nav class="conhecimento-vistas" aria-label="Visão do Conhecimento"><button type="button" class="btn ${F.vista === 'usar' ? 'btn-verde' : 'btn-linha'}" data-conhecimento-vista="usar" aria-pressed="${F.vista === 'usar'}">Disponível para mim</button><button type="button" class="btn ${F.vista === 'gerir' ? 'btn-verde' : 'btn-linha'}" data-conhecimento-vista="gerir" aria-pressed="${F.vista === 'gerir'}">Gerenciar bases</button></nav>` : ''}
      <div class="conhecimento-resumo"><span><b>${ds.length}</b> ${ds.length === 1 ? 'documento' : 'documentos'}</span><span><b>${bases().length}</b> ${bases().length === 1 ? 'base' : 'bases'}</span><button type="button" class="btn-texto" data-filtrar-revisao><b>${ds.filter(revisar).length}</b> para revisar</button></div>
      <p class="msg-erro" id="conhecimento-erro" role="alert" hidden></p>
      ${k.podeGerir ? envioHtml() : ''}
      <div class="conhecimento-layout"><aside class="conhecimento-bases" aria-label="Bases de conhecimento"><h2>Bases</h2><div id="conhecimento-colecoes"></div><p class="dica">As pastas organizam os arquivos. Mudar a pasta não muda quem tem acesso.</p></aside><section class="conhecimento-biblioteca" aria-label="Biblioteca de documentos">
      <div class="filtros-biblioteca"><div class="campo"><label for="conhecimento-busca">Buscar documento</label><input type="search" class="entrada" id="conhecimento-busca" value="${esc(F.busca)}" placeholder="Título, arquivo ou pasta"></div><div class="campo"><label for="conhecimento-pasta">Pasta</label><select class="entrada" id="conhecimento-pasta"></select></div><div class="campo"><label for="conhecimento-status">Mostrar</label><select class="entrada" id="conhecimento-status"><option value="">Todos os documentos</option><option value="revisar">Precisam de revisão</option><option value="suspenso">Suspensos</option><option value="vencido">Validade encerrada</option><option value="sigiloso">Sigilosos</option></select></div><div class="campo"><label for="conhecimento-ordem">Ordenar</label><select class="entrada" id="conhecimento-ordem"><option value="titulo">Título de A a Z</option><option value="recente">Atualizados recentemente</option></select></div></div>
      <div class="conhecimento-resultados"><p id="conhecimento-contagem" role="status"></p><button type="button" class="btn-texto" data-limpar-conhecimento>Limpar filtros</button></div><div id="conhecimento-lista"></div></section></div>`;
    pastas(); el('conhecimento-status').value = F.status; el('conhecimento-ordem').value = F.ordem;
    desenharLista(); ligarEnvio();
    ligarVisao('conhecimento',raiz.querySelector('.conhecimento-biblioteca'),()=>({busca:F.busca,area:F.area,pasta:F.pasta,status:F.status,ordem:F.ordem}),v=>{
      for(const key of ['busca','area','pasta','status','ordem']) F[key]=String(v[key]||'');F.limite=20;
      el('conhecimento-busca').value=F.busca;el('conhecimento-status').value=F.status;el('conhecimento-ordem').value=F.ordem||'titulo';pastas();desenharLista();
    });
  }
  function desenharLista() {
    const ds = lista();
    el('conhecimento-colecoes').innerHTML = [{ chave: '', nome: 'Todas as bases' }, ...bases()].map(b => `<button type="button" class="conhecimento-base" data-conhecimento-area="${esc(b.chave)}" aria-pressed="${F.area === b.chave}"><span>${esc(b.nome)}</span><span>${ds.filter(d => !b.chave || baseDe(d) === b.chave).length}</span></button>`).join('');
    let filtrados = ds.filter(d => (!F.area || baseDe(d) === F.area) && (!F.pasta || (F.pasta === 'sem-pasta' ? !d.pasta : d.pasta === F.pasta.slice(6))) && (!F.status || (F.status === 'revisar' ? revisar(d) : F.status==='sigiloso' ? d.sigiloso : true)) && normalizar(`${d.titulo} ${d.arquivo || ''} ${d.pasta || ''}`).includes(normalizar(F.busca.trim())));
    filtrados = filtrados.filter(d => F.status === 'suspenso' ? d.suspenso : F.status === 'vencido' ? !d.suspenso && d.vigente===false : true);
    filtrados.sort((a, b) => F.ordem === 'recente' ? String(b.atualizado_em).localeCompare(String(a.atualizado_em)) || a.titulo.localeCompare(b.titulo, 'pt-BR') : a.titulo.localeCompare(b.titulo, 'pt-BR'));
    el('conhecimento-contagem').textContent = `${filtrados.length} ${filtrados.length === 1 ? 'documento encontrado' : 'documentos encontrados'}${F.area ? ` · ${bases().find(b => b.chave === F.area)?.nome || ''}` : ''}`;
    const gerir = F.vista === 'gerir';
    const b = gerir && F.area ? areas.find(a => String(a.id) === F.area) : null;
    el('conhecimento-lista').innerHTML = `${b ? `<details class="conhecimento-audiencia"><summary>Quem usa e administra ${esc(b.nome)}?</summary><p>${b.membros} pessoas nesta área. Administram: ${b.administradores.map(p => esc(p.nome || p.email)).join(', ') || 'admin da empresa'}.</p><p class="dica">${esc(b.descricao || '')} ${E.eu.admin ? 'Pessoas e permissões são definidas em Pessoas e áreas.' : 'O admin da empresa define quem faz parte desta área.'}</p></details>` : ''}${filtrados.length ? `<ul class="conhecimento-documentos">${filtrados.slice(0, F.limite).map(d => `<li class="conhecimento-documento" data-documento="${d.id}"><div class="conhecimento-doc-topo"><h3>${esc(d.titulo)}</h3>${d.sigiloso ? '<span class="selo selo-sigilosa">Sigiloso</span>' : ''}${d.vigente===false?`<span class="selo">${d.suspenso?'Suspenso':'Validade encerrada'}</span>`:''}</div><p class="dica">${esc(d.toda_empresa ? 'Toda a empresa' : d.area || areas.find(a => a.id === d.area_id)?.nome || 'Área')} · ${esc(d.pasta || 'Sem pasta')}</p><p class="dica">${esc(d.arquivo || 'Documento')} · Atualizado em ${data(d.atualizado_em)}<br>Responsável: ${esc(d.responsavel_nome||'não definido')}${d.validade?' · Válido até '+data(d.validade):''}</p><p class="conhecimento-revisao ${revisar(d) ? 'pendente' : ''}">${revisar(d) ? 'Revisão recomendada' : 'Conteúdo revisado'} · ${d.revisado_em ? data(d.revisado_em) : 'nunca revisado'}</p>
      ${gerir ? `<div class="linha-botoes"><button type="button" class="btn btn-linha btn-pequeno" data-editar-conhecimento="${d.id}">Editar documento</button><button type="button" class="btn-texto btn-pequeno" data-revisar-conhecimento="${d.id}">Marcar revisado</button></div>` : `<details><summary>Como este conteúdo é usado?</summary><p class="dica">${d.vigente===false?'Não entra em novas respostas enquanto estiver suspenso ou vencido.':'Disponível para busca nas conversas.'} ${d.sigiloso ? 'Quando este conteúdo é usado, a conversa é tratada como sigilosa segundo a política.' : ''}</p>${(d.quickWins || []).filter(q => E.quickWins.some(v => v.id === q.id)).map(q => `<a class="btn-texto" href="#/qw/${q.id}">${esc(q.nome)}</a>`).join('')}</details>`}</li>`).join('')}</ul>${filtrados.length > F.limite ? '<button type="button" class="btn btn-linha" data-mais-conhecimento>Mostrar mais documentos</button>' : ''}` : `<div class="conhecimento-vazio"><h3>${ds.length ? 'Nenhum documento corresponde aos filtros' : 'Ainda não há documentos nesta visão'}</h3><p>${ds.length ? 'Tente outra palavra ou limpe os filtros.' : gerir ? 'Adicione um arquivo à base correta para disponibilizar o conhecimento.' : 'O responsável pela base pode disponibilizar os documentos permitidos para a sua área.'}</p></div>`}`;
    el('envio-conhecimento')?.classList.toggle('oculto', !gerir);
  }
  function envioHtml() {
    return `<details id="envio-conhecimento" class="conhecimento-envio ${F.vista === 'gerir' ? '' : 'oculto'}"><summary>Adicionar documento</summary><p class="dica">Confira a base de destino e o conteúdo antes de enviar. Envie apenas o que deve ficar disponível para as pessoas dessa base.</p><form id="enviar-doc"><div id="doc-campos"><div class="grade-2"><div class="campo"><label for="doc-destino">Base de destino</label><select class="entrada" id="doc-destino" required>${basesGeridas().map(b => `<option value="${esc(b.chave)}">${esc(b.nome)}</option>`).join('')}</select><p class="ajuda" id="doc-alcance"></p></div><div class="campo"><label for="doc-arquivo">Arquivo</label><input type="file" id="doc-arquivo" required accept="${ACEITOS}"></div><div class="campo"><label for="doc-titulo">Título (opcional)</label><input class="entrada" id="doc-titulo" maxlength="200" placeholder="Um nome fácil de reconhecer"></div><div class="campo"><label for="doc-pasta">Pasta (opcional)</label><input class="entrada" id="doc-pasta" maxlength="80" list="conhecimento-pastas" placeholder="Ex.: Políticas, Manuais"></div></div><label><input type="checkbox" id="doc-sigiloso"> Conteúdo sigiloso</label><p class="dica">PDF, DOCX, PPTX, XLSX, TXT, MD, CSV ou imagem, até 25 MB. Imagem e PDF escaneado são lidos por OCR. Sigilo não altera quem tem acesso à base.</p></div><div id="doc-confirmacao" hidden></div><p class="msg-erro" id="doc-erro" role="alert" hidden></p><div class="linha-botoes"><button class="btn btn-verde" id="btn-doc" ${basesGeridas().length ? '' : 'disabled'}>Revisar envio</button><button type="button" class="btn btn-linha" id="doc-voltar" hidden>Voltar e ajustar</button></div></form><datalist id="conhecimento-pastas">${[...new Set(documentos.map(d => d.pasta).filter(Boolean))].map(p => `<option value="${esc(p)}">`).join('')}</datalist></details>`;
  }
  function ligarEnvio() {
    const form = el('enviar-doc'); if (!form) return;
    let confirmado = false, ocupado = false;
    const erro = e => { el('doc-erro').textContent = e.message; el('doc-erro').hidden = false; };
    const alcance = () => { el('doc-alcance').textContent = el('doc-destino').value === 'toda' ? 'Disponível para todas as áreas da empresa.' : 'Disponível para as pessoas desta área.'; };
    alcance(); el('doc-destino').onchange = alcance;
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
        await atualizar('Documento enviado e indexado.');
      } catch (e) { erro(e); if (el('btn-doc')) { el('btn-doc').disabled = false; el('btn-doc').textContent = confirmado ? 'Confirmar envio' : 'Revisar envio'; el('doc-voltar').disabled = false; } }
      finally { ocupado = false; ativa.ocupada = false; }
    };
  }
  async function editar(d, origem) {
    let gov;try { gov=await api(`/api/bases/documentos/${d.id}/governanca`); } catch(e) { falha(e);return; }
    if(location.hash.split('?')[0]!=='#/conhecimento')return;
    const host = document.getElementById('modal');
    host.innerHTML = `<div class="modal-fundo"><section class="modal conhecimento-editor" role="dialog" aria-modal="true" aria-labelledby="conhecimento-ed-titulo" tabindex="-1"><div class="modal-topo"><h2 id="conhecimento-ed-titulo">Editar documento</h2><button type="button" class="icone-btn" id="conhecimento-fechar" aria-label="Fechar">×</button></div><p class="dica">${esc(d.toda_empresa ? 'Toda a empresa' : d.area || '')}. Editar a pasta não muda o acesso.</p><form id="conhecimento-ed-form"><div class="campo"><label for="conhecimento-ed-nome">Título</label><input class="entrada" id="conhecimento-ed-nome" required maxlength="200" value="${esc(d.titulo)}"></div><div class="campo"><label for="conhecimento-ed-pasta">Pasta</label><input class="entrada" id="conhecimento-ed-pasta" maxlength="80" value="${esc(d.pasta || '')}" list="conhecimento-pastas"></div><div class="grade-2"><div class="campo"><label for="conhecimento-ed-responsavel">Quem mantém este documento?</label><select class="entrada" id="conhecimento-ed-responsavel"><option value="">Sem responsável</option>${gov.pessoas.map(p=>`<option value="${p.id}" ${p.id===d.responsavel_id?'selected':''}>${esc(p.nome||'Pessoa '+p.id)}</option>`).join('')}</select></div><div class="campo"><label for="conhecimento-ed-validade">Válido até (opcional)</label><input class="entrada" type="date" id="conhecimento-ed-validade" value="${esc(d.validade||'')}"><p class="ajuda">Após esta data, deixa de entrar em novas respostas.</p></div></div><label><input type="checkbox" id="conhecimento-ed-suspenso" ${d.suspenso?'checked':''}> Suspender o uso pela IA</label><p class="ajuda">Preserva o documento e seus vínculos. Não remove respostas já geradas.</p><label><input type="checkbox" id="conhecimento-ed-sigilo" ${d.sigiloso ? 'checked' : ''}> Conteúdo sigiloso</label><div class="campo"><label for="conhecimento-ed-arquivo">Substituir arquivo (opcional)</label><input type="file" id="conhecimento-ed-arquivo" accept="${ACEITOS}"><p class="ajuda">O conteúdo atual será substituído e a revisão será registrada. O documento mantém a base e os vínculos existentes.</p></div><p class="msg-erro" id="conhecimento-ed-erro" role="alert" hidden></p><div class="linha-botoes"><button class="btn btn-verde" id="conhecimento-ed-salvar">Salvar alterações</button><button type="button" class="btn btn-linha" id="conhecimento-ed-cancelar">Cancelar</button></div></form><details class="conhecimento-audiencia"><summary>Onde este documento é usado?</summary>${gov.dependencias.length?gov.dependencias.map(q=>`<p><a href="#/qw/${q.id}">${esc(q.nome)}</a></p>`).join(''):'<p>Nenhum Quick Win gerenciado por você está vinculado a esta fonte.</p>'}<p class="dica">Vínculos são configurações de uso, não comprovam consulta em toda execução.</p></details><details class="conhecimento-audiencia"><summary>Histórico de alterações</summary><p class="dica">Registra mudanças de cadastro e substituição do arquivo. Não guarda cópias antigas do conteúdo.</p>${gov.historico.map(h=>{const antes=h.mudanca.antes,depois=h.mudanca.depois;const nomes={titulo:'Título',arquivo:'Arquivo',pasta:'Pasta',sigiloso:'Sigilo',responsavel_id:'Responsável',validade:'Validade',suspenso:'Suspensão',conteudo_hash:'Conteúdo substituído'};return `<p><b>Registro ${h.versao}</b> · ${data(h.em)} · ${esc(h.por||'Pessoa responsável')}<br>${antes?Object.keys(nomes).filter(k=>JSON.stringify(antes[k])!==JSON.stringify(depois[k])).map(k=>esc(nomes[k])).join(', ')||'Revisão registrada':'Documento adicionado'}</p>`;}).join('')||'<p>Documento anterior a este histórico. Novas alterações serão registradas.</p>'}</details><details class="conhecimento-remover"><summary>Remover da base</summary><p>A remoção é permanente e a IA deixa de consultar este conteúdo.</p><button type="button" class="btn btn-linha" id="conhecimento-ed-remover">Remover documento</button></details></section></div>`;
    const $ = id => host.querySelector(`#${id}`); let alterado = false, salvando = false;
    const fechar = () => { if (salvando || alterado && !confirm('Descartar as alterações deste documento?')) return; ativa.editorSujo = false; limpar(); host.innerHTML = ''; origem?.isConnected ? origem.focus() : el('conhecimento-busca')?.focus(); };
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
        const f = $('conhecimento-ed-arquivo').files[0]; conferirArquivo(f);
        if(!d.suspenso && $('conhecimento-ed-suspenso').checked && !confirm('Suspender este documento? Ele deixará de entrar em novas respostas e Quick Wins vinculados.'))return;
        salvando = true; ativa.ocupada = true; $('conhecimento-ed-form').inert = true; $('conhecimento-ed-salvar').disabled = true;
        await api(`/api/bases/documentos/${d.id}`, { metodo: 'PUT', corpo: { titulo: $('conhecimento-ed-nome').value.trim(), pasta: $('conhecimento-ed-pasta').value, sigiloso: $('conhecimento-ed-sigilo').checked, responsavel_id: $('conhecimento-ed-responsavel').value ? Number($('conhecimento-ed-responsavel').value) : null, validade: $('conhecimento-ed-validade').value || null, suspenso: $('conhecimento-ed-suspenso').checked, ...(f ? { arquivo: await arquivoBase64(f) } : {}) } });
        alterado = false; salvando = false; ativa.ocupada = false; fechar(); await atualizar('Documento atualizado.');
      } catch (e) { erro(e); salvando = false; ativa.ocupada = false; $('conhecimento-ed-form').inert = false; $('conhecimento-ed-salvar').disabled = false; }
    };
    $('conhecimento-ed-remover').onclick = async () => {
      if (salvando || !confirm(`Remover permanentemente “${d.titulo}” da base? O conteúdo deixará de ser consultado pela IA.`)) return;
      salvando = true; ativa.ocupada = true;
      try { await api(`/api/bases/documentos/${d.id}`, { metodo: 'DELETE' }); alterado = false; salvando = false; ativa.ocupada = false; fechar(); await atualizar('Documento removido.'); }
      catch (e) { salvando = false; ativa.ocupada = false; erro(e); }
    };
    $('conhecimento-ed-nome').focus();
  }
  raiz.oninput = ev => { if (ev.target.id === 'conhecimento-busca') { F.busca = ev.target.value; F.limite = 20; desenharLista(); } };
  raiz.onchange = ev => {
    const campos = { 'conhecimento-pasta': 'pasta', 'conhecimento-status': 'status', 'conhecimento-ordem': 'ordem' };
    if (campos[ev.target.id]) { F[campos[ev.target.id]] = ev.target.value; F.limite = 20; desenharLista(); }
  };
  raiz.onclick = async ev => {
    const b = ev.target.closest('button'); if (!b) return;
    if (b.hasAttribute('data-atualizar-conhecimento')) { if (ativa.ocupada || envioPendente() && !confirm('Descartar as alterações ainda não salvas e atualizar a biblioteca?')) return; b.disabled = true; await atualizar(); if (b.isConnected) b.disabled = false; }
    else if (b.dataset.conhecimentoVista) { if (ativa.ocupada || envioPendente() && !confirm('Descartar o envio ainda não confirmado?')) return; F.vista = b.dataset.conhecimentoVista === 'gerir' && k.podeGerir ? 'gerir' : 'usar'; F.area = ''; F.pasta = ''; F.limite = 20; montar(); raiz.querySelector('.conhecimento-vistas [aria-pressed="true"]')?.focus(); }
    else if (b.hasAttribute('data-conhecimento-area')) { F.area = b.dataset.conhecimentoArea; F.pasta = ''; F.limite = 20; pastas(); desenharLista(); raiz.querySelector('.conhecimento-base[aria-pressed="true"]')?.focus(); }
    else if (b.hasAttribute('data-filtrar-revisao')) { F.status = 'revisar'; el('conhecimento-status').value = F.status; F.limite = 20; desenharLista(); }
    else if (b.hasAttribute('data-limpar-conhecimento')) { Object.assign(F, { busca: '', area: '', pasta: '', status: '', limite: 20 }); el('conhecimento-busca').value = ''; el('conhecimento-status').value = ''; pastas(); desenharLista(); el('conhecimento-busca').focus(); }
    else if (b.hasAttribute('data-mais-conhecimento')) { F.limite += 20; desenharLista(); }
    else if (b.dataset.editarConhecimento) { const d = documentos.find(d => String(d.id) === b.dataset.editarConhecimento); if (d && F.vista === 'gerir' && k.podeGerir) editar(d, b); }
    else if (b.dataset.revisarConhecimento && k.podeGerir && F.vista === 'gerir') {
      const d = documentos.find(d => String(d.id) === b.dataset.revisarConhecimento);
      if (!d || !confirm(`Você conferiu o conteúdo de “${d.titulo}” e confirma que continua correto?`)) return;
      b.disabled = true;
      try { await api(`/api/bases/documentos/${d.id}`, { metodo: 'PUT', corpo: { revisado: true } }); await atualizar('Revisão registrada.'); }
      catch (e) { falha(e); b.disabled = false; }
    }
  };
  montar();
}
