// Painel: o admin vê todas as abas; responsáveis e pessoas autorizadas veem
// bases de conhecimento e quick wins (o servidor confere cada permissão).
import { api, definirCsrf, esc, ICONE, preencherMarca, toast } from '/comum.js';
import { renderizar } from '/md.js';

const $ = id => document.getElementById(id);
const S = { eu: null, perm: null };
const PERFIS = { rapido: 'Rápido e econômico', equilibrado: 'Equilibrado', avancado: 'Avançado' };
const DADOS = { cpf: 'CPF', cnpj: 'CNPJ', cartao: 'Cartão', banco: 'Dados bancários', pix: 'Chave PIX', rg: 'RG', email: 'Email', telefone: 'Telefone', cep: 'CEP', endereco: 'Endereço' };
const STATUS = { rascunho: 'Rascunho', ativo: 'Ativo', pausado: 'Pausado' };

const us = v => `US$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: Math.abs(v) < 1 ? 4 : 2 })}`;
const porMilhao = p => (p === null || p === undefined ? '—' : `US$ ${(p * 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}`);
const num = v => Number(v || 0).toLocaleString('pt-BR');
const dataHora = iso => (iso ? new Date(iso.replace(' ', 'T') + (iso.length === 19 ? 'Z' : '')).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
const lerBase64 = f => new Promise(ok => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.readAsDataURL(f); });
const lerDataUrl = f => new Promise(ok => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.readAsDataURL(f); });
const falhar = e => toast(e.message || 'Algo deu errado.', 6000);
const caixas = (nome, lista, marcados = []) => `<div class="caixas">${lista.map(i => `<label><input type="checkbox" name="${nome}" value="${i.id}" ${marcados.includes(i.id) ? 'checked' : ''}> ${esc(i.nome || i.email)}</label>`).join('') || '<span class="dica">Nada para escolher ainda.</span>'}</div>`;
const marcados = nome => [...document.querySelectorAll(`input[name="${nome}"]:checked`)].map(i => Number(i.value));
const tabela = (cab, linhas, vazio = 'Nada por aqui ainda.') => `<div class="tabela-rolagem"><table class="tabela"><thead><tr>${cab.map(c => `<th${c.startsWith('#') ? ' class="num"' : ''}>${esc(c.replace(/^#/, ''))}</th>`).join('')}</tr></thead>
  <tbody>${linhas.length ? linhas.join('') : `<tr><td colspan="${cab.length}" class="dica">${vazio}</td></tr>`}</tbody></table></div>`;

// Contraste (mesma conta do servidor), para a checagem da cor de marca.
const lum = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)).reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
const contraste = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

// ---------------------------------------------------------------- Áreas e pessoas
async function abaAreas() {
  const [{ areas }, { pessoas }, { grupos }] = await Promise.all([api('/api/admin/areas'), api('/api/admin/pessoas'), api('/api/admin/grupos')]);
  const nomeArea = id => areas.find(a => a.id === id)?.nome || '?';
  const nomeGrupo = id => grupos.find(g => g.id === id)?.nome || '?';
  const pessoaPorId = new Map(pessoas.map(p => [p.id, p]));
  $('conteudo').innerHTML = `<h2>Áreas e pessoas</h2>
    <p class="lead">Crie as áreas com o nome que a empresa usa. Cada área tem pessoas, responsáveis e uma base de conhecimento.</p>
    <h3>Áreas</h3>
    <form class="filtros" id="nova-area"><div class="campo"><label for="area-nome">Nova área</label><input class="entrada" id="area-nome" maxlength="80" required></div>
      <label class="dica"><input type="checkbox" id="area-sig"> todas as conversas desta área são sigilosas</label><button class="btn btn-verde btn-pequeno">Criar área</button></form>
    ${tabela(['Área', '#Pessoas', 'Responsáveis', 'Conversas sigilosas', 'Ações'], areas.map(a => `<tr>
      <td><b>${esc(a.nome)}</b></td><td class="num">${a.pessoas.length}</td>
      <td><div class="chips">${a.pessoas.filter(m => m.responsavel).map(m => `<span class="chip resp">${esc(pessoaPorId.get(m.pessoa_id)?.nome || '?')}</span>`).join('') || '<span class="dica">nenhum</span>'}</div></td>
      <td><label><input type="checkbox" data-sigilosa="${a.id}" ${a.sigilosa ? 'checked' : ''}> todas</label></td>
      <td><button class="btn-texto btn-pequeno" data-renomear-area="${a.id}">Renomear</button><button class="btn-texto btn-pequeno" data-excluir-area="${a.id}">Excluir</button></td></tr>`), 'Nenhuma área ainda.')}
    <h3>Pessoas</h3>
    <p class="dica">Quem tem email de um domínio permitido também entra sozinho, como usuário sem área.</p>
    <form class="filtros" id="nova-pessoa">
      <div class="campo"><label for="p-email">Email</label><input class="entrada" id="p-email" type="email" required></div>
      <div class="campo"><label for="p-nome">Nome</label><input class="entrada" id="p-nome"></div>
      <div class="campo"><label for="p-papel">Papel</label><select class="entrada" id="p-papel"><option value="usuario">Usuário</option><option value="admin">Admin</option></select></div>
      <button class="btn btn-verde btn-pequeno">Adicionar pessoa</button></form>
    <div class="filtros"><div class="campo"><label for="busca-pessoa">Buscar</label><input class="entrada" id="busca-pessoa" placeholder="nome ou email"></div></div>
    <div id="lista-pessoas"></div>`;

  const desenharPessoas = () => {
    const q = $('busca-pessoa').value.toLowerCase();
    const lista = pessoas.filter(p => !q || p.nome.toLowerCase().includes(q) || p.email.includes(q));
    $('lista-pessoas').innerHTML = tabela(['Nome', 'Email', 'Papel', 'Áreas', 'Grupos', 'Situação', ''], lista.map(p => `<tr>
      <td>${esc(p.nome)}</td><td>${esc(p.email)}</td><td>${p.papel === 'admin' ? 'Admin' : 'Usuário'}</td>
      <td><div class="chips">${p.areas.map(a => `<span class="chip${a.responsavel ? ' resp' : ''}">${esc(nomeArea(a.id))}${a.responsavel ? ' · responsável' : ''}</span>`).join('')}</div></td>
      <td><div class="chips">${p.grupos.map(g => `<span class="chip">${esc(nomeGrupo(g))}</span>`).join('')}</div></td>
      <td>${p.ativo ? 'Ativa' : '<span class="dica">Desativada</span>'}</td>
      <td><button class="btn-texto btn-pequeno" data-editar-pessoa="${p.id}">Editar</button></td></tr>
      <tr class="oculto" id="editor-${p.id}"><td colspan="7"><div class="editor">
        <div class="filtros"><div class="campo"><label>Nome</label><input class="entrada" data-campo="nome" value="${esc(p.nome)}"></div>
          <div class="campo"><label>Papel</label><select class="entrada" data-campo="papel"><option value="usuario" ${p.papel !== 'admin' ? 'selected' : ''}>Usuário</option><option value="admin" ${p.papel === 'admin' ? 'selected' : ''}>Admin</option></select></div>
          <label class="dica"><input type="checkbox" data-campo="ativo" ${p.ativo ? 'checked' : ''}> ativa</label></div>
        <span class="legenda">Áreas</span>
        ${tabela(['Área', 'Faz parte', 'Responsável'], areas.map(a => { const m = p.areas.find(x => x.id === a.id); return `<tr><td>${esc(a.nome)}</td>
          <td><input type="checkbox" data-membro="${a.id}" ${m ? 'checked' : ''} aria-label="${esc(p.nome)} faz parte de ${esc(a.nome)}"></td>
          <td><input type="checkbox" data-resp="${a.id}" ${m?.responsavel ? 'checked' : ''} aria-label="${esc(p.nome)} é responsável de ${esc(a.nome)}"></td></tr>`; }), 'Crie uma área primeiro.')}
        <div class="linha-botoes" style="margin-top:10px"><button class="btn btn-verde btn-pequeno" data-salvar-pessoa="${p.id}">Salvar</button><button class="btn-texto btn-pequeno" data-editar-pessoa="${p.id}">Cancelar</button></div>
      </div></td></tr>`), 'Ninguém encontrado.');
  };
  desenharPessoas();
  $('busca-pessoa').oninput = desenharPessoas;

  $('nova-area').onsubmit = async ev => { ev.preventDefault(); try { await api('/api/admin/areas', { metodo: 'POST', corpo: { nome: $('area-nome').value, sigilosa: $('area-sig').checked } }); toast('Área criada.'); abaAreas(); } catch (e) { falhar(e); } };
  $('nova-pessoa').onsubmit = async ev => {
    ev.preventDefault();
    try { await api('/api/admin/pessoas', { metodo: 'POST', corpo: { email: $('p-email').value, nome: $('p-nome').value, papel: $('p-papel').value } }); toast('Pessoa adicionada. Ajuste as áreas em "Editar".'); abaAreas(); } catch (e) { falhar(e); }
  };
  $('conteudo').onclick = async ev => {
    const t = ev.target.closest('button');
    if (!t) return;
    try {
      if (t.dataset.renomearArea) {
        const a = areas.find(x => x.id === Number(t.dataset.renomearArea));
        const nome = prompt('Novo nome da área:', a.nome);
        if (nome) { await api(`/api/admin/areas/${a.id}`, { metodo: 'PUT', corpo: { nome } }); abaAreas(); }
      } else if (t.dataset.excluirArea) {
        if (!confirm('Excluir esta área? Os documentos da base dela também são apagados.')) return;
        await api(`/api/admin/areas/${t.dataset.excluirArea}`, { metodo: 'DELETE' }); toast('Área excluída.'); abaAreas();
      } else if (t.dataset.editarPessoa) {
        $(`editor-${t.dataset.editarPessoa}`).classList.toggle('oculto');
      } else if (t.dataset.salvarPessoa) {
        const ed = $(`editor-${t.dataset.salvarPessoa}`);
        const campo = n => ed.querySelector(`[data-campo="${n}"]`);
        const areasSel = [...ed.querySelectorAll('[data-membro]')].filter(c => c.checked || ed.querySelector(`[data-resp="${c.dataset.membro}"]`).checked)
          .map(c => ({ id: Number(c.dataset.membro), responsavel: ed.querySelector(`[data-resp="${c.dataset.membro}"]`).checked }));
        await api(`/api/admin/pessoas/${t.dataset.salvarPessoa}`, { metodo: 'PUT', corpo: { nome: campo('nome').value, papel: campo('papel').value, ativo: campo('ativo').checked, areas: areasSel } });
        toast('Pessoa salva.'); abaAreas();
      }
    } catch (e) { falhar(e); }
  };
  $('conteudo').onchange = async ev => {
    const c = ev.target.closest('[data-sigilosa]');
    if (!c) return;
    if (c.checked && !confirm('Todas as conversas das pessoas desta área passam a ser sigilosas e a usar só modelos homologados. Continuar?')) { c.checked = false; return; }
    try { await api(`/api/admin/areas/${c.dataset.sigilosa}`, { metodo: 'PUT', corpo: { sigilosa: c.checked } }); toast('Área atualizada. A política ganhou nova versão.'); } catch (e) { falhar(e); c.checked = !c.checked; }
  };
}

// ---------------------------------------------------------------- Grupos
async function abaGrupos() {
  const [{ grupos }, { pessoas }] = await Promise.all([api('/api/admin/grupos'), api('/api/admin/pessoas')]);
  $('conteudo').innerHTML = `<h2>Grupos</h2>
    <p class="lead">Grupos juntam pessoas de áreas diferentes (por exemplo, "Gestores"). Servem para liberar perfis de modelo e para autorizar quem cria quick wins.</p>
    <form class="filtros" id="novo-grupo"><div class="campo"><label for="g-nome">Novo grupo</label><input class="entrada" id="g-nome" required maxlength="80"></div><button class="btn btn-verde btn-pequeno">Criar grupo</button></form>
    ${tabela(['Grupo', '#Pessoas', 'Pessoas', 'Ações'], grupos.map(g => `<tr><td><b>${esc(g.nome)}</b></td><td class="num">${g.pessoas.length}</td>
      <td><div class="chips">${g.pessoas.slice(0, 8).map(id => `<span class="chip">${esc(pessoas.find(p => p.id === id)?.nome || '?')}</span>`).join('')}${g.pessoas.length > 8 ? `<span class="chip">+${g.pessoas.length - 8}</span>` : ''}</div></td>
      <td><button class="btn-texto btn-pequeno" data-editar="${g.id}">Pessoas</button><button class="btn-texto btn-pequeno" data-renomear="${g.id}">Renomear</button><button class="btn-texto btn-pequeno" data-excluir="${g.id}">Excluir</button></td></tr>
      <tr class="oculto" id="grupo-${g.id}"><td colspan="4"><div class="editor"><span class="legenda">Pessoas do grupo ${esc(g.nome)}</span>${caixas(`g${g.id}`, pessoas, g.pessoas)}
        <button class="btn btn-verde btn-pequeno" data-salvar="${g.id}">Salvar pessoas</button></div></td></tr>`), 'Nenhum grupo ainda.')}`;
  $('novo-grupo').onsubmit = async ev => { ev.preventDefault(); try { await api('/api/admin/grupos', { metodo: 'POST', corpo: { nome: $('g-nome').value } }); abaGrupos(); } catch (e) { falhar(e); } };
  $('conteudo').onclick = async ev => {
    const t = ev.target.closest('button');
    if (!t) return;
    try {
      if (t.dataset.editar) $(`grupo-${t.dataset.editar}`).classList.toggle('oculto');
      if (t.dataset.salvar) { await api(`/api/admin/grupos/${t.dataset.salvar}`, { metodo: 'PUT', corpo: { pessoas: marcados(`g${t.dataset.salvar}`) } }); toast('Grupo salvo.'); abaGrupos(); }
      if (t.dataset.renomear) { const nome = prompt('Novo nome do grupo:', grupos.find(g => g.id === Number(t.dataset.renomear)).nome); if (nome) { await api(`/api/admin/grupos/${t.dataset.renomear}`, { metodo: 'PUT', corpo: { nome } }); abaGrupos(); } }
      if (t.dataset.excluir && confirm('Excluir este grupo? Quem tinha acesso a modelos só por ele perde o acesso.')) { await api(`/api/admin/grupos/${t.dataset.excluir}`, { metodo: 'DELETE' }); abaGrupos(); }
    } catch (e) { falhar(e); }
  };
}

// ---------------------------------------------------------------- Bases de conhecimento
async function abaBases() {
  const { documentos } = await api('/api/bases/documentos');
  const areas = S.eu.admin ? (await api('/api/admin/areas')).areas : S.eu.areas.filter(a => a.responsavel);
  $('conteudo').innerHTML = `<h2>Bases de conhecimento</h2>
    <p class="lead">Documentos que a IA consulta no chat e nos quick wins, citando a fonte. Cada documento é de uma área ou da empresa toda.</p>
    <form class="grupo-form" id="enviar-doc"><h3>Enviar documento</h3>
      <div class="filtros">
        <div class="campo"><label for="doc-arquivo">Arquivo</label><input id="doc-arquivo" type="file" accept=".pdf,.docx,.txt,.md,.csv,.xlsx" required></div>
        <div class="campo"><label for="doc-titulo">Título (opcional)</label><input class="entrada" id="doc-titulo" maxlength="200"></div>
        <div class="campo"><label for="doc-destino">Para</label><select class="entrada" id="doc-destino">${areas.map(a => `<option value="${a.id}">${esc(a.nome)}</option>`).join('')}${S.eu.admin ? '<option value="toda">Toda a empresa</option>' : ''}</select></div>
        <label class="dica"><input type="checkbox" id="doc-sigiloso"> documento sigiloso (a conversa que usar vira sigilosa)</label>
        <button class="btn btn-verde btn-pequeno" id="btn-doc">Enviar</button>
      </div>
      <p class="dica">PDF com texto, DOCX, TXT, MD, CSV ou XLSX, até 20 MB. PDF escaneado e imagem não são aceitos.</p>
    </form>
    ${tabela(['Documento', 'Onde', 'Sigiloso', '#Caracteres', 'Atualizado', 'Ações'], documentos.map(d => `<tr>
      <td><b>${esc(d.titulo)}</b><br><span class="dica">${esc(d.arquivo)}</span></td><td>${d.toda_empresa ? 'Toda a empresa' : esc(d.area || '')}</td>
      <td><input type="checkbox" data-sigiloso="${d.id}" ${d.sigiloso ? 'checked' : ''} aria-label="${esc(d.titulo)} é sigiloso"></td>
      <td class="num">${num(d.caracteres)}</td><td>${dataHora(d.atualizado_em)}</td>
      <td><label class="btn-texto btn-pequeno" style="cursor:pointer">Substituir<input type="file" hidden data-substituir="${d.id}" accept=".pdf,.docx,.txt,.md,.csv,.xlsx"></label>
        <button class="btn-texto btn-pequeno" data-remover="${d.id}">Remover</button></td></tr>`), 'Nenhum documento ainda.')}`;
  $('enviar-doc').onsubmit = async ev => {
    ev.preventDefault();
    const f = $('doc-arquivo').files[0];
    if (!f) return;
    $('btn-doc').disabled = true;
    const destino = $('doc-destino').value;
    try {
      await api('/api/bases/documentos', { metodo: 'POST', corpo: { arquivo: { nome: f.name, base64: await lerBase64(f) }, titulo: $('doc-titulo').value, sigiloso: $('doc-sigiloso').checked,
        ...(destino === 'toda' ? { toda_empresa: true } : { area_id: Number(destino) }) } });
      toast('Documento enviado e indexado.'); abaBases();
    } catch (e) { falhar(e); $('btn-doc').disabled = false; }
  };
  $('conteudo').onchange = async ev => {
    try {
      const s = ev.target.closest('[data-sigiloso]');
      if (s) { await api(`/api/bases/documentos/${s.dataset.sigiloso}`, { metodo: 'PUT', corpo: { sigiloso: s.checked } }); toast('Documento atualizado.'); }
      const sub = ev.target.closest('[data-substituir]');
      if (sub?.files[0]) { const f = sub.files[0]; await api(`/api/bases/documentos/${sub.dataset.substituir}`, { metodo: 'PUT', corpo: { arquivo: { nome: f.name, base64: await lerBase64(f) } } }); toast('Documento substituído.'); abaBases(); }
    } catch (e) { falhar(e); }
  };
  $('conteudo').onclick = async ev => {
    const r = ev.target.closest('[data-remover]');
    if (r && confirm('Remover este documento da base?')) { try { await api(`/api/bases/documentos/${r.dataset.remover}`, { metodo: 'DELETE' }); abaBases(); } catch (e) { falhar(e); } }
  };
}

// ---------------------------------------------------------------- Quick wins
async function abaQuickWins() {
  let lista, perm = null, pessoas = [], grupos = [];
  if (S.eu.admin) {
    [{ quickWins: lista }, perm, { pessoas }, { grupos }] = await Promise.all([api('/api/admin/quick-wins'), api('/api/admin/quick-wins-permissoes'), api('/api/admin/pessoas'), api('/api/admin/grupos')]);
  } else lista = (await api('/api/quick-wins')).quickWins.filter(q => q.podeEditar);
  $('conteudo').innerHTML = `<h2>Quick wins</h2>
    <p class="lead">Espaços para tarefas repetitivas. Quem cria define instruções, arquivos e modelo; o time usa em conversas próprias.</p>
    ${S.perm.criar ? '<div class="linha-botoes" style="margin-bottom:14px"><a class="btn btn-verde" href="/app#/qw/nova">Criar quick win</a></div>' : ''}
    ${tabela(S.eu.admin ? ['Quick win', 'Status', 'Onde', 'Criado por', '#Conversas no mês', '#Custo no mês', ''] : ['Quick win', 'Status', ''], lista.map(q => `<tr>
      <td><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${esc(q.cor)};margin-right:8px"></span><b>${esc(q.nome)}</b>${q.sigiloso ? ' <span class="chip">sigiloso</span>' : ''}</td>
      <td>${STATUS[q.status]}</td>
      ${S.eu.admin ? `<td>${q.toda_empresa ? 'Toda a empresa' : esc(q.areas.join(', '))}</td><td>${esc(q.criado_por || '—')}</td><td class="num">${num(q.conversas)}</td><td class="num">${us(q.custo)}</td>` : ''}
      <td><a class="btn-texto btn-pequeno" href="/app#/qw/${q.id}">Abrir</a><a class="btn-texto btn-pequeno" href="/app#/qw/${q.id}/editar">Configurar</a></td></tr>`), 'Nenhum quick win ainda.')}
    ${perm ? `<form class="grupo-form" id="perm-qw" style="margin-top:24px"><h3>Quem pode criar quick wins</h3>
      <p class="dica">Quem cria configura e acompanha o uso dos próprios quick wins. O responsável da área também configura os da área.</p>
      <label class="opcoes"><span><input type="checkbox" id="perm-resp" ${perm.responsaveis ? 'checked' : ''}> Responsáveis de área, nas áreas em que são responsáveis</span></label>
      <div class="duas-col"><div><span class="legenda">Grupos autorizados (nas áreas de que fazem parte)</span>${caixas('perm-grupos', grupos, perm.grupos)}</div>
        <div><span class="legenda">Pessoas autorizadas</span>${caixas('perm-pessoas', pessoas, perm.pessoas)}</div></div>
      <h3>Quem pode criar quick win para a empresa toda</h3><p class="dica">Além do admin.</p>
      <div class="duas-col"><div><span class="legenda">Grupos</span>${caixas('perm-tg', grupos, perm.todaEmpresa.grupos)}</div><div><span class="legenda">Pessoas</span>${caixas('perm-tp', pessoas, perm.todaEmpresa.pessoas)}</div></div>
      <button class="btn btn-verde btn-pequeno" style="margin:6px 0 14px">Salvar permissões</button></form>` : ''}`;
  if (perm) $('perm-qw').onsubmit = async ev => {
    ev.preventDefault();
    try {
      await api('/api/admin/quick-wins-permissoes', { metodo: 'PUT', corpo: { responsaveis: $('perm-resp').checked, grupos: marcados('perm-grupos'), pessoas: marcados('perm-pessoas'),
        todaEmpresa: { grupos: marcados('perm-tg'), pessoas: marcados('perm-tp') } } });
      toast('Permissões salvas.');
    } catch (e) { falhar(e); }
  };
}

// ---------------------------------------------------------------- Modelos de IA
async function abaModelos() {
  const [m, { grupos }, { areas }] = await Promise.all([api('/api/admin/modelos'), api('/api/admin/grupos'), api('/api/admin/areas')]);
  const cfg = m.config;
  const liberados = m.modelos.filter(x => x.liberado);
  const homologados = liberados.filter(x => x.homologado);
  const opcao = (lista, sel, vazio = '') => `${vazio ? `<option value="">${vazio}</option>` : ''}${lista.map(x => `<option value="${esc(x.id)}" ${x.id === sel ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}`;
  const padrao = m.modelos.find(x => x.id === m.homologadoPadrao);
  const acesso = p => { const a = cfg.acessoPerfis[p] || {}; return `<div class="editor"><b>${PERFIS[p]}</b>
    <label class="opcoes"><span><input type="checkbox" id="todos-${p}" ${a.todos ? 'checked' : ''}> Todas as pessoas</span></label>
    <div class="duas-col"><div><span class="legenda">Grupos</span>${caixas(`ac-g-${p}`, grupos, a.grupos || [])}</div><div><span class="legenda">Áreas</span>${caixas(`ac-a-${p}`, areas, a.areas || [])}</div></div></div>`; };
  $('conteudo').innerHTML = `<h2>Modelos de IA</h2>
    <p class="lead">Todos os modelos passam pelo OpenRouter. Libere os que a empresa pode usar, classifique cada um num perfil e homologue os que podem receber dados sigilosos.</p>
    <div class="faixa-aviso ${padrao ? 'ok' : 'erro'}">${padrao ? `Homologado padrão: <b>${esc(padrao.nome)}</b>, disponível para todas as pessoas. Conversas sigilosas usam este modelo quando a pessoa não escolhe outro homologado.`
      : 'Nenhum modelo homologado disponível para todos. Conversas sigilosas não podem ser enviadas. Homologue um modelo do perfil Rápido (ou de um perfil liberado para todos).'}</div>
    ${m.modelos.filter(x => x.aviso).map(x => `<div class="faixa-aviso atencao">${esc(x.nome)}: ${esc(x.aviso)}</div>`).join('')}
    <h3>Catálogo da empresa</h3>
    ${tabela(['Modelo', 'Perfil', '#Entrada (1M)', '#Saída (1M)', '#Contexto', 'Liberado', 'Reserva', 'Dados sigilosos'], m.modelos.map(x => `<tr>
      <td style="min-width:190px"><b>${esc(x.nome)}</b><br><span class="dica">${esc(x.id)}</span></td>
      <td><select data-perfil="${esc(x.id)}" aria-label="Perfil de ${esc(x.nome)}">${Object.entries(PERFIS).map(([k, v]) => `<option value="${k}" ${x.perfil === k ? 'selected' : ''}>${v}</option>`).join('')}</select></td>
      <td class="num">${porMilhao(x.precoEntrada)}</td><td class="num">${porMilhao(x.precoSaida)}</td><td class="num">${x.contexto ? num(x.contexto) : '—'}</td>
      <td><input type="checkbox" data-liberado="${esc(x.id)}" ${x.liberado ? 'checked' : ''} aria-label="${esc(x.nome)} liberado"></td>
      <td><select data-reserva="${esc(x.id)}" aria-label="Reserva de ${esc(x.nome)}">${opcao(liberados.filter(r => r.id !== x.id && r.perfil === x.perfil), x.reserva, 'sem reserva')}</select></td>
      <td>${x.homologado ? `<span class="selo">${ICONE.escudo} Homologado</span><br><span class="dica">${esc(x.homologacao?.fornecedor || '')} · ${esc(x.homologacao?.quem || '')} · ${dataHora(x.homologacao?.em)}</span><br><button class="btn-texto btn-pequeno" data-retirar="${esc(x.id)}">Retirar</button>`
        : x.liberado ? `<button class="btn btn-linha btn-pequeno" data-homologar="${esc(x.id)}">Homologar</button>` : '<span class="dica">libere antes</span>'}</td></tr>`))}
    <h3>Adicionar do catálogo do OpenRouter</h3>
    <form class="filtros" id="busca-modelo"><div class="campo"><label for="q-modelo">Buscar por nome ou id</label><input class="entrada" id="q-modelo" placeholder="ex.: claude, gemini, gpt"></div><button class="btn btn-linha btn-pequeno">Buscar</button></form>
    <div id="resultado-busca"></div>
    <details><summary class="dica" style="cursor:pointer">Adicionar pelo id, sem o catálogo</summary>
      <form class="filtros" id="add-manual" style="margin-top:10px"><div class="campo"><label for="id-manual">Id no OpenRouter</label><input class="entrada" id="id-manual" placeholder="fornecedor/modelo" pattern="[a-z0-9._~-]+/[a-z0-9._:-]+" required></div>
        <div class="campo"><label for="perfil-manual">Perfil</label><select class="entrada" id="perfil-manual">${Object.entries(PERFIS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
        <button class="btn btn-linha btn-pequeno">Adicionar e liberar</button></form></details>
    <form id="cfg-modelos">
      <h3>Modelos padrão</h3>
      <div class="duas-col">
        <div class="campo"><label for="pd-chat">Chat</label><select class="entrada" id="pd-chat">${opcao(liberados, cfg.padroes.chat)}</select></div>
        <div class="campo"><label for="pd-homologado">Homologado padrão (conversas sigilosas)</label><select class="entrada" id="pd-homologado">${opcao(homologados, cfg.padroes.homologado, 'o primeiro disponível para todos')}</select></div>
        ${Object.entries(PERFIS).map(([k, v]) => `<div class="campo"><label for="pd-${k}">${v}</label><select class="entrada" id="pd-${k}">${opcao(liberados.filter(x => x.perfil === k), cfg.padroes[k], 'nenhum')}</select></div>`).join('')}
      </div>
      <h3>Quem usa cada perfil no dia a dia</h3>
      <p class="dica">${PERFIS.rapido}: todas as pessoas, sempre. No quick win, quem usa pode usar o modelo padrão dele mesmo sem o perfil.</p>
      ${acesso('equilibrado')}${acesso('avancado')}
      <h3>Perfis que podem ser padrão de quick win</h3>
      <div class="opcoes">${Object.entries(PERFIS).map(([k, v]) => `<label><input type="checkbox" name="perfis-qw" value="${k}" ${cfg.perfisQuickWin.includes(k) ? 'checked' : ''}> ${v}</label>`).join('')}</div>
      <h3>Privacidade e roteamento</h3>
      <label class="opcoes"><span><input type="checkbox" id="sem-treino" ${cfg.exigirSemTreino ? 'checked' : ''}> Em conversas normais, usar só fornecedores que não treinam com os dados</span></label>
      <p class="dica">Conversas sigilosas sempre usam fornecedor fixado e retenção zero, com esta opção ligada ou não.</p>
      <label class="opcoes"><span><input type="checkbox" id="automatico" ${cfg.automatico ? 'checked' : ''}> Oferecer "Automático" no seletor (o OpenRouter escolhe o modelo; o modelo usado aparece abaixo de cada resposta)</span></label>
      <div class="linha-botoes" style="margin:18px 0"><button class="btn btn-verde">Salvar configuração de modelos</button></div>
    </form>`;

  const salvarModelo = async (id, corpo, msg) => { try { await api(`/api/admin/modelos/${encodeURIComponent(id)}`, { metodo: 'PUT', corpo }); toast(msg); } catch (e) { falhar(e); } abaModelos(); };
  $('conteudo').onchange = ev => {
    const t = ev.target;
    if (t.dataset.perfil) salvarModelo(t.dataset.perfil, { perfil: t.value }, 'Perfil alterado.');
    if (t.dataset.liberado) salvarModelo(t.dataset.liberado, { liberado: t.checked }, t.checked ? 'Modelo liberado.' : 'Modelo retirado da lista liberada.');
    if (t.dataset.reserva) salvarModelo(t.dataset.reserva, { reserva: t.value || null }, 'Reserva salva.');
    if (t.id === 'sem-treino' && !t.checked && !confirm('Desligar esta opção permite fornecedores que guardam ou treinam com os dados nas conversas normais. A mudança fica no registro de eventos. Continuar?')) t.checked = true;
  };
  $('conteudo').onclick = async ev => {
    const t = ev.target.closest('button');
    if (!t) return;
    if (t.dataset.homologar) homologar(m.modelos.find(x => x.id === t.dataset.homologar));
    if (t.dataset.retirar && confirm('Retirar a homologação? Conversas sigilosas abertas passam para o homologado padrão, com aviso.')) {
      try { await api(`/api/admin/modelos/${encodeURIComponent(t.dataset.retirar)}/homologar`, { metodo: 'DELETE' }); toast('Homologação retirada. A política ganhou nova versão.'); abaModelos(); } catch (e) { falhar(e); }
    }
    if (t.dataset.liberarCatalogo) {
      const perfil = document.querySelector(`[data-perfil-catalogo="${CSS.escape(t.dataset.liberarCatalogo)}"]`).value;
      salvarModelo(t.dataset.liberarCatalogo, { liberado: true, perfil }, 'Modelo liberado.');
    }
  };
  $('busca-modelo').onsubmit = async ev => {
    ev.preventDefault();
    $('resultado-busca').innerHTML = '<p class="dica">Buscando…</p>';
    const { modelos } = await api(`/api/admin/modelos/catalogo?busca=${encodeURIComponent($('q-modelo').value)}`);
    $('resultado-busca').innerHTML = modelos.length ? tabela(['Modelo', '#Entrada (1M)', '#Saída (1M)', '#Contexto', 'Perfil', ''], modelos.map(x => `<tr>
      <td><b>${esc(x.nome)}</b><br><span class="dica">${esc(x.id)}</span></td><td class="num">${porMilhao(x.precoEntrada)}</td><td class="num">${porMilhao(x.precoSaida)}</td><td class="num">${num(x.contexto)}</td>
      <td><select data-perfil-catalogo="${esc(x.id)}">${Object.entries(PERFIS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></td>
      <td><button class="btn btn-linha btn-pequeno" data-liberar-catalogo="${esc(x.id)}">Liberar</button></td></tr>`))
      : '<div class="faixa-aviso atencao">O catálogo do OpenRouter não respondeu ou não achou nada. Confira a chave OPENROUTER_API_KEY e o acesso do servidor à internet. Dá para adicionar pelo id logo abaixo.</div>';
  };
  $('add-manual').onsubmit = ev => { ev.preventDefault(); salvarModelo($('id-manual').value.trim(), { liberado: true, perfil: $('perfil-manual').value }, 'Modelo adicionado e liberado.'); };
  $('cfg-modelos').onsubmit = async ev => {
    ev.preventDefault();
    const ac = p => ({ todos: $(`todos-${p}`).checked, grupos: marcados(`ac-g-${p}`), areas: marcados(`ac-a-${p}`) });
    try {
      await api('/api/admin/modelos-config', { metodo: 'PUT', corpo: {
        padroes: { chat: $('pd-chat').value, homologado: $('pd-homologado').value || null, rapido: $('pd-rapido').value || null, equilibrado: $('pd-equilibrado').value || null, avancado: $('pd-avancado').value || null },
        acessoPerfis: { equilibrado: ac('equilibrado'), avancado: ac('avancado') },
        perfisQuickWin: [...document.querySelectorAll('input[name=perfis-qw]:checked')].map(i => i.value),
        exigirSemTreino: $('sem-treino').checked, automatico: $('automatico').checked } });
      toast('Configuração salva.'); abaModelos();
    } catch (e) { falhar(e); }
  };
}

function homologar(modelo) {
  $('modal').innerHTML = `<div class="modal-fundo" id="fundo-h"><form class="modal" role="dialog" aria-modal="true" aria-labelledby="t-h" id="form-h">
    <div class="modal-topo"><div class="rotulo">Homologar para dados sigilosos</div><button type="button" class="icone-btn" id="fechar-h" aria-label="Fechar">${ICONE.fechar}</button></div>
    <h2 id="t-h">${esc(modelo.nome)}</h2>
    <div class="campo"><label for="h-forn">Fornecedor fixado no OpenRouter</label><input class="entrada" id="h-forn" required placeholder="ex.: google-vertex, amazon-bedrock, azure">
      <span class="ajuda">Use o nome do fornecedor como aparece na aba de fornecedores do modelo no OpenRouter. As chamadas sigilosas vão só para ele, sem cair para outro.</span></div>
    <label class="opcoes"><span><input type="checkbox" id="h-treino" required> Conferi que este fornecedor não treina com os dados</span></label>
    <label class="opcoes"><span><input type="checkbox" id="h-zdr" required> Conferi que este fornecedor tem retenção zero (não guarda os dados)</span></label>
    <div class="campo" style="margin-top:12px"><label for="h-just">Justificativa</label><textarea class="entrada" id="h-just" required minlength="10" placeholder="Onde conferiu, contrato, data da verificação"></textarea></div>
    <p class="msg-erro oculto" id="h-erro" role="alert"></p>
    <div class="linha-botoes"><button class="btn btn-verde">Homologar</button><button type="button" class="btn-texto" id="cancelar-h">Cancelar</button></div>
    <p class="dica">Fica registrado quem homologou, a data, o fornecedor e a justificativa. A política ganha nova versão.</p></form></div>`;
  const fechar = () => { $('modal').innerHTML = ''; };
  $('fechar-h').onclick = fechar; $('cancelar-h').onclick = fechar;
  $('h-forn').focus();
  $('form-h').onsubmit = async ev => {
    ev.preventDefault();
    try {
      await api(`/api/admin/modelos/${encodeURIComponent(modelo.id)}/homologar`, { metodo: 'POST', corpo: { fornecedor: $('h-forn').value.trim(), semTreino: $('h-treino').checked, retencaoZero: $('h-zdr').checked, justificativa: $('h-just').value } });
      fechar(); toast('Modelo homologado. A política ganhou nova versão.'); abaModelos();
    } catch (e) { $('h-erro').textContent = e.message; $('h-erro').classList.remove('oculto'); }
  };
}

// ---------------------------------------------------------------- Política
async function abaPolitica() {
  const [p, v] = await Promise.all([api('/api/politica'), api('/api/admin/politica/versoes')]);
  $('conteudo').innerHTML = `<h2>Política de Uso de IA</h2>
    <p class="lead">O texto é da empresa. A plataforma acrescenta no fim a seção sobre dados sigilosos, gerada da configuração atual. A cada nova versão, as pessoas registram ciência no próximo acesso.</p>
    <div class="faixa-aviso ok">Versão ${p.versao}, de ${dataHora(p.atualizada_em)}. Ciência registrada por ${v.versoes[0]?.ciencias ?? 0} de ${v.pessoas} pessoas ativas.</div>
    <form id="form-pol"><div class="campo"><label for="pol-texto">Texto da empresa (títulos com ##, listas com -)</label><textarea class="entrada" id="pol-texto" rows="16">${esc(p.texto)}</textarea></div>
      <div class="linha-botoes"><button class="btn btn-verde">Publicar nova versão</button><a class="btn-texto" href="/politica" target="_blank">Ver como as pessoas veem</a></div></form>
    <h3>Seção automática (não editável)</h3>
    <div class="bolha-ia">${renderizar(p.secao).html}</div>
    <h3>Versões</h3>
    ${tabela(['Versão', 'Publicada em', 'Por', '#Ciências'], v.versoes.map(x => `<tr><td>${x.versao}</td><td>${dataHora(x.criado_em)}</td><td>${esc(x.por || (x.versao === 1 ? 'instalação (texto padrão)' : 'automática (mudança de configuração)'))}</td><td class="num">${x.ciencias} de ${v.pessoas}</td></tr>`))}`;
  $('form-pol').onsubmit = async ev => {
    ev.preventDefault();
    if (!confirm('Publicar uma nova versão? Todas as pessoas vão registrar ciência de novo no próximo acesso.')) return;
    try { await api('/api/admin/politica', { metodo: 'PUT', corpo: { texto: $('pol-texto').value } }); toast('Nova versão publicada.'); abaPolitica(); } catch (e) { falhar(e); }
  };
}

// ---------------------------------------------------------------- Uso e custo
async function abaUso(mes = new Date().toISOString().slice(0, 7)) {
  const u = await api(`/api/admin/uso?mes=${mes}`);
  const t = u.totais;
  const tipo = k => u.porTipo.find(x => x.tipo === k) || { conversas: 0, custo: 0 };
  const linhas = (lista, rotulo) => lista.map(x => `<tr><td>${rotulo(x)}</td><td class="num">${num(x.conversas)}</td><td class="num">${num(x.respostas)}</td><td class="num">${us(x.custo)}</td></tr>`);
  $('conteudo').innerHTML = `<h2>Uso e custo</h2>
    <p class="lead">Custo real informado pelo OpenRouter em cada resposta. Conversas de teste de quick win não entram.</p>
    <div class="filtros"><div class="campo"><label for="mes">Mês</label><input class="entrada" type="month" id="mes" value="${u.mes}"></div>
      <a class="btn btn-linha btn-pequeno" href="/api/admin/uso?mes=${u.mes}&formato=csv">Baixar CSV</a></div>
    <div class="indicadores">
      <div class="indicador"><span>Custo de IA</span><b>${us(t.custo)}</b></div>
      <div class="indicador"><span>Conversas</span><b>${num(t.conversas)}</b><small>${num(t.respostas)} respostas</small></div>
      <div class="indicador"><span>Pessoas que usaram</span><b>${num(t.pessoas)}</b></div>
      <div class="indicador"><span>Economia com cache</span><b>${us(t.economia)}</b></div>
      <div class="indicador"><span>Tempo médio de resposta</span><b>${(t.ms / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} s</b></div>
      <div class="indicador"><span>Conversas normais</span><b>${num(tipo('normal').conversas)}</b><small>${us(tipo('normal').custo)}</small></div>
      <div class="indicador"><span>Conversas sigilosas</span><b>${num(tipo('sigilosa').conversas)}</b><small>${us(tipo('sigilosa').custo)}</small></div>
    </div>
    <h3>Por área</h3><p class="dica">Quick wins contam nas áreas deles; o chat, nas áreas de quem usou. Quem está em várias áreas conta em cada uma.</p>
    ${tabela(['Área', '#Conversas', '#Respostas', '#Custo'], linhas(u.porArea, x => esc(x.area)))}
    <h3>Por quick win</h3>${tabela(['Quick win', '#Conversas', '#Respostas', '#Custo'], linhas(u.porQuickWin, x => esc(x.quick_win)))}
    <h3>Por pessoa</h3>${tabela(['Pessoa', '#Conversas', '#Respostas', '#Custo'], linhas(u.porPessoa, x => `${esc(x.nome)} <span class="dica">${esc(x.email)}</span>`))}
    <h3>Por modelo</h3>${tabela(['Modelo que respondeu', '#Conversas', '#Respostas', '#Custo'], linhas(u.porModelo, x => `${esc(x.modelo)}${x.fornecedor ? ` <span class="dica">via ${esc(x.fornecedor)}</span>` : ''}`))}`;
  $('mes').onchange = ev => abaUso(ev.target.value);
}

// ---------------------------------------------------------------- Eventos
async function abaEventos(filtro = {}, pagina = 0) {
  const q = new URLSearchParams(Object.entries(filtro).filter(([, v]) => v));
  const [d, { problemas }] = await Promise.all([api(`/api/admin/eventos?${q}&pagina=${pagina}`), api('/api/admin/problemas')]);
  const abertos = problemas.filter(p => !p.resolvido).length;
  $('conteudo').innerHTML = `<h2>Problemas reportados</h2>
    <p class="lead">${abertos ? `${abertos} em aberto.` : 'Nenhum problema em aberto.'} Cada um também chega por email.</p>
    ${tabela(['Quando', 'Pessoa', 'Tipo', 'Descrição', 'Resolvido'], problemas.map(p => `<tr><td style="white-space:nowrap">${dataHora(p.em)}</td><td>${esc(p.nome || '')}<br><span class="dica">${esc(p.email || '')}</span></td><td>${esc(p.tipo)}</td>
      <td style="white-space:pre-wrap;word-break:break-word">${esc(p.descricao)}</td><td><input type="checkbox" data-problema="${p.id}" ${p.resolvido ? 'checked' : ''} aria-label="Resolvido"></td></tr>`), 'Ninguém reportou problema.')}
    <h2 style="margin-top:32px">Eventos</h2>
    <p class="lead">Registro só de inclusão: logins, mudanças de configuração, uso (sem conteúdo), bloqueios, conversas sigilosas, exclusões.</p>
    <form class="filtros" id="filtro-ev">
      <div class="campo"><label for="ev-tipo">Tipo</label><select class="entrada" id="ev-tipo"><option value="">Todos</option>${d.tipos.map(t => `<option ${t === filtro.tipo ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></div>
      <div class="campo"><label for="ev-pessoa">Pessoa (email)</label><input class="entrada" id="ev-pessoa" value="${esc(filtro.pessoa || '')}"></div>
      <div class="campo"><label for="ev-de">De</label><input class="entrada" type="date" id="ev-de" value="${esc(filtro.de || '')}"></div>
      <div class="campo"><label for="ev-ate">Até</label><input class="entrada" type="date" id="ev-ate" value="${esc(filtro.ate || '')}"></div>
      <button class="btn btn-linha btn-pequeno">Filtrar</button>
      <a class="btn btn-linha btn-pequeno" href="/api/admin/eventos?${q}&formato=csv">Baixar CSV</a></form>
    <p class="dica">${num(d.total)} eventos.</p>
    ${tabela(['Quando', 'Tipo', 'Pessoa', 'Detalhes'], d.eventos.map(e => `<tr><td style="white-space:nowrap">${dataHora(e.em)}</td><td>${esc(e.tipo)}</td><td>${esc(e.pessoa || '—')}</td>
      <td><code style="font-size:12.5px;white-space:pre-wrap;word-break:break-word">${esc(e.detalhes)}</code></td></tr>`), 'Nenhum evento com esses filtros.')}
    <div class="linha-botoes" style="margin-top:12px">${pagina > 0 ? '<button class="btn btn-linha btn-pequeno" id="ev-ant">Anteriores</button>' : ''}${(pagina + 1) * 100 < d.total ? '<button class="btn btn-linha btn-pequeno" id="ev-prox">Mais antigos</button>' : ''}</div>`;
  const ler = () => ({ tipo: $('ev-tipo').value, pessoa: $('ev-pessoa').value, de: $('ev-de').value, ate: $('ev-ate').value });
  $('filtro-ev').onsubmit = ev => { ev.preventDefault(); abaEventos(ler()); };
  if ($('ev-ant')) $('ev-ant').onclick = () => abaEventos(filtro, pagina - 1);
  if ($('ev-prox')) $('ev-prox').onclick = () => abaEventos(filtro, pagina + 1);
  document.querySelectorAll('[data-problema]').forEach(c => { c.onchange = () => api(`/api/admin/problemas/${c.dataset.problema}`, { metodo: 'PUT', corpo: { resolvido: c.checked } }).then(() => toast(c.checked ? 'Marcado como resolvido.' : 'Reaberto.')).catch(falhar); });
}

// ---------------------------------------------------------------- Configurações
async function abaConfig() {
  const c = await api('/api/admin/config');
  let logo = c.logo;
  $('conteudo').innerHTML = `<h2>Configurações</h2>
    <form id="form-cfg">
      <div class="grupo-form"><h3>Empresa</h3>
        <div class="campo"><label for="c-empresa">Nome da empresa</label><input class="entrada" id="c-empresa" value="${esc(c.empresa)}" required maxlength="80"></div>
        <div class="campo"><span class="legenda">Logo</span><div class="linha-botoes"><span id="c-logo-prev">${logo ? `<img src="${esc(logo)}" alt="Logo atual" style="max-height:48px">` : '<span class="dica">Sem logo.</span>'}</span>
          <label class="btn btn-linha btn-pequeno" style="cursor:pointer">Escolher arquivo<input type="file" id="c-logo" hidden accept=".png,.jpg,.jpeg,.svg"></label><button type="button" class="btn-texto btn-pequeno" id="c-logo-tirar">Remover</button></div>
          <span class="ajuda">PNG, JPG ou SVG, até 200 KB.</span></div>
        <div class="campo"><label for="c-cor">Cor de marca (botões principais)</label><div class="linha-botoes"><input type="color" id="c-cor" value="${esc(c.corMarca || '#1B7950')}">
          <label class="dica"><input type="checkbox" id="c-cor-usar" ${c.corMarca ? 'checked' : ''}> usar a cor de marca</label><span id="c-contraste" class="dica"></span></div>
          <span class="ajuda">A cor fica atrás de texto claro. O contraste mínimo é 4,5:1.</span></div>
      </div>
      <div class="grupo-form"><h3>Acesso</h3>
        <div class="campo"><label for="c-dominios">Domínios de email permitidos</label><textarea class="entrada" id="c-dominios" rows="2">${esc(c.dominios.join(', '))}</textarea><span class="ajuda">Separe por vírgula. Só entram emails destes domínios.</span></div></div>
      <div class="grupo-form"><h3>Email (SMTP)</h3>
        <div class="duas-col"><div class="campo"><label for="c-smtp">Endereço do servidor</label><input class="entrada" id="c-smtp" value="${esc(c.smtp.url)}" placeholder="smtps://usuario:senha@smtp.exemplo.com:465"></div>
          <div class="campo"><label for="c-rem">Remetente</label><input class="entrada" id="c-rem" value="${esc(c.smtp.remetente)}" placeholder="GreenIA <nao-responda@empresa.com.br>"></div></div>
        <div class="linha-botoes" style="margin-bottom:14px"><button type="button" class="btn btn-linha btn-pequeno" id="c-smtp-teste">Enviar email de teste para mim</button><span class="dica">Salve antes de testar.</span></div></div>
      <div class="grupo-form"><h3>Privacidade</h3>
        <div class="campo"><label for="c-priv">Aviso de privacidade (aparece no login e no chat)</label><textarea class="entrada" id="c-priv" rows="2">${esc(c.privacyNote)}</textarea></div>
        <div class="campo"><label for="c-ret">Conversas são apagadas depois de quantos dias sem uso</label><input class="entrada" type="number" id="c-ret" min="1" max="3650" value="${c.retencaoDias}" style="max-width:160px"></div></div>
      <div class="grupo-form"><h3>Limites de uso</h3><p class="dica">Zero é sem limite. Os tetos valem sobre o custo real informado pelo OpenRouter.</p>
        <div class="duas-col"><div class="campo"><label for="c-teto">Teto de gasto mensal da empresa (US$)</label><input class="entrada" type="number" step="0.01" min="0" id="c-teto" value="${c.tetoMensal}"></div>
          <div class="campo"><label for="c-teto-p">Teto de gasto mensal por pessoa (US$)</label><input class="entrada" type="number" step="0.01" min="0" id="c-teto-p" value="${c.tetoPessoaMensal}"></div>
          <div class="campo"><label for="c-dia">Respostas por pessoa por dia</label><input class="entrada" type="number" min="0" id="c-dia" value="${c.limiteDiarioPessoa}"></div></div></div>
      <div class="grupo-form"><h3>Dados no chat</h3><p class="dica">O que fazer quando o sistema encontra cada tipo de dado numa conversa do chat. É também o padrão dos quick wins novos. Permitir torna a conversa sigilosa.</p>
        ${tabela(['Tipo', 'Bloquear', 'Permitir'], Object.entries(DADOS).map(([k, v]) => `<tr><td>${v}</td><td><input type="radio" name="d-${k}" value="bloquear" ${c.acoesChat[k] !== 'permitir' ? 'checked' : ''} aria-label="${v}: bloquear"></td><td><input type="radio" name="d-${k}" value="permitir" ${c.acoesChat[k] === 'permitir' ? 'checked' : ''} aria-label="${v}: permitir"></td></tr>`).concat('<tr><td>Senhas e credenciais</td><td colspan="2">Sempre bloqueadas</td></tr>'))}<p></p></div>
      <div class="linha-botoes"><button class="btn btn-verde">Salvar configurações</button></div>
    </form>`;
  const mostrarContraste = () => {
    const r = contraste($('c-cor').value, '#FAF7EF');
    $('c-contraste').textContent = `Contraste com o texto claro: ${r.toFixed(2).replace('.', ',')}:1 ${r >= 4.5 ? '(ok)' : '(abaixo do mínimo de 4,5:1)'}`;
    $('c-contraste').style.color = r >= 4.5 ? 'var(--forest-text)' : 'var(--red-text)';
  };
  $('c-cor').oninput = mostrarContraste; mostrarContraste();
  $('c-logo').onchange = async ev => { const f = ev.target.files[0]; if (!f) return; logo = await lerDataUrl(f); $('c-logo-prev').innerHTML = `<img src="${esc(logo)}" alt="Logo novo" style="max-height:48px">`; };
  $('c-logo-tirar').onclick = () => { logo = ''; $('c-logo-prev').innerHTML = '<span class="dica">Sem logo.</span>'; };
  $('c-smtp-teste').onclick = async () => { try { const r = await api('/api/admin/smtp/teste', { metodo: 'POST' }); toast(`Email de teste enviado para ${r.para}.`); } catch (e) { falhar(e); } };
  $('form-cfg').onsubmit = async ev => {
    ev.preventDefault();
    try {
      await api('/api/admin/config', { metodo: 'PUT', corpo: {
        empresa: $('c-empresa').value, logo, corMarca: $('c-cor-usar').checked ? $('c-cor').value : '', dominios: $('c-dominios').value,
        smtp: { url: $('c-smtp').value, remetente: $('c-rem').value }, privacyNote: $('c-priv').value, retencaoDias: Number($('c-ret').value),
        tetoMensal: Number($('c-teto').value), tetoPessoaMensal: Number($('c-teto-p').value), limiteDiarioPessoa: Number($('c-dia').value),
        acoesChat: Object.fromEntries(Object.keys(DADOS).map(k => [k, document.querySelector(`input[name="d-${k}"]:checked`).value])) } });
      toast('Configurações salvas.');
    } catch (e) { falhar(e); }
  };
}

// ---------------------------------------------------------------- abas
const ABAS = [
  { id: 'areas', nome: 'Áreas e pessoas', fn: abaAreas },
  { id: 'grupos', nome: 'Grupos', fn: abaGrupos },
  { id: 'bases', nome: 'Bases de conhecimento', fn: abaBases, tambem: () => S.eu.areas.some(a => a.responsavel) },
  { id: 'quickwins', nome: 'Quick wins', fn: abaQuickWins, tambem: () => S.perm.criar || S.eu.areas.some(a => a.responsavel) },
  { id: 'modelos', nome: 'Modelos de IA', fn: abaModelos },
  { id: 'politica', nome: 'Política', fn: abaPolitica },
  { id: 'uso', nome: 'Uso e custo', fn: abaUso },
  { id: 'eventos', nome: 'Eventos', fn: abaEventos },
  { id: 'config', nome: 'Configurações', fn: abaConfig },
];

async function abrir() {
  const visiveis = ABAS.filter(a => S.eu.admin || a.tambem?.());
  const atual = visiveis.find(a => `#/${a.id}` === location.hash) || visiveis[0];
  $('abas').innerHTML = visiveis.map(a => `<button role="tab" id="aba-${a.id}" aria-selected="${a === atual}" aria-controls="conteudo" data-aba="${a.id}">${a.nome}</button>`).join('');
  $('abas').querySelectorAll('[data-aba]').forEach(b => { b.onclick = () => { location.hash = `#/${b.dataset.aba}`; }; });
  $('conteudo').setAttribute('aria-labelledby', `aba-${atual.id}`);
  $('conteudo').onclick = null; $('conteudo').onchange = null;
  $('conteudo').innerHTML = '<p class="dica">Carregando…</p>';
  try { await atual.fn(); } catch (e) { $('conteudo').innerHTML = `<div class="faixa-aviso erro">${esc(e.message)}</div>`; }
}

async function iniciar() {
  const eu = await api('/api/eu');
  definirCsrf(eu.csrf);
  preencherMarca();
  Object.assign(S, { eu: eu.pessoa, perm: eu.quickWins });
  const pode = S.eu.admin || ABAS.some(a => a.tambem?.());
  if (!pode) { location.href = '/app'; return; }
  $('titulo-painel').textContent = S.eu.admin ? 'Painel do admin' : 'Bases e quick wins';
  window.addEventListener('hashchange', abrir);
  await abrir();
}
iniciar();
