// Quick wins no app: página do quick win (conversas retomáveis) e configuração.
import { api, esc, ICONE, toast } from '/comum.js';
import { E, cabecalho, ligarCabecalho, recarregarLateral, irPara } from '/app.js';
import { vistaConversa } from '/conversa.js';

const $ = id => document.getElementById(id);
const FEEDBACK = { serviu: 'Serviu', ajustes: 'Serviu com ajustes', nao_serviu: 'Não serviu' };
const FORMATOS = { texto: 'Texto', lista: 'Lista', tabela: 'Tabela (baixa em CSV)', checklist: 'Checklist' };
const DADOS = { cpf: 'CPF', cnpj: 'CNPJ', cartao: 'Cartão', banco: 'Dados bancários', pix: 'Chave PIX', rg: 'RG', email: 'Email', telefone: 'Telefone', cep: 'CEP', endereco: 'Endereço' };
const CORES = ['#1B7950', '#0F6E8C', '#5B4B8A', '#8C621D', '#7A3E2E', '#2F6B3B', '#3E5C76', '#9B4029'];
const dataCurta = iso => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
const brl = v => (v === null || v === undefined ? 'sem preço' : `US$ ${v < 0.01 ? v.toFixed(4) : v.toFixed(3)}`.replace('.', ','));

export async function rotaQuickWin(hash) {
  let m;
  if (hash === '#/qw/nova') return novaOrigem();
  if ((m = /^#\/qw\/(\d+)\/editar$/.exec(hash))) return configurar(Number(m[1]));
  if ((m = /^#\/qw\/(\d+)\/teste$/.exec(hash))) return vistaConversa({ qw: await api(`/api/quick-wins/${m[1]}`), teste: true });
  if ((m = /^#\/qw\/(\d+)\/nova$/.exec(hash))) return vistaConversa({ qw: await api(`/api/quick-wins/${m[1]}`) });
  if ((m = /^#\/qw\/(\d+)$/.exec(hash))) return paginaQuickWin(Number(m[1]));
  irPara('#/nova');
}

async function paginaQuickWin(id) {
  const [qw, lista] = await Promise.all([api(`/api/quick-wins/${id}`), api(`/api/conversas?quick_win=${id}`)]);
  const uso = qw.podeEditar ? await api(`/api/quick-wins/${id}/uso`).catch(() => null) : null;
  $('principal').innerHTML = `${cabecalho(qw.nome, qw.status !== 'ativo' ? `<span class="selo selo-cinza">${qw.status === 'rascunho' ? 'Rascunho' : 'Pausado'}</span>` : '')}
    <div class="pagina"><div class="pagina-dentro">
      <div style="display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap">
        <span class="passo" style="background:${esc(qw.cor)};color:#fff;margin:4px 0 0">${esc(qw.icone || qw.nome[0])}</span>
        <div style="flex:1;min-width:240px"><h2>${esc(qw.nome)}</h2><p class="lead">${esc(qw.para_que_serve)}</p></div>
      </div>
      <div class="linha-botoes" style="margin-bottom:18px">
        ${qw.status === 'ativo' || qw.podeEditar ? `<a class="btn btn-verde" href="#/qw/${id}/nova">${ICONE.mais} Nova conversa neste quick win</a>` : ''}
        ${qw.podeEditar ? `<a class="btn btn-linha" href="#/qw/${id}/editar">${ICONE.engrenagem} Configurar</a><a class="btn btn-linha" href="#/qw/${id}/teste">Testar</a>` : ''}
        ${qw.sigiloso ? '<span class="selo selo-sigilosa">Trata dados sigilosos · só modelos homologados</span>' : ''}
      </div>
      ${(qw.sugestoes || []).length ? `<h3>Para começar</h3><div class="sugestoes">${qw.sugestoes.map((s, i) => `<button type="button" data-sug="${i}">${esc(s)}</button>`).join('')}</div>` : ''}
      <h3>Suas conversas neste quick win</h3>
      ${lista.conversas.length ? `<div class="lista">${lista.conversas.map(c => `
        <div class="lista-item">
          <a class="principal-texto" href="#/c/${c.id}" style="text-decoration:none;color:inherit"><b>${esc(c.titulo)}</b>
            <span>${dataCurta(c.atualizado_em)} · ${c.feedback ? FEEDBACK[c.feedback] : c.tem_resposta ? 'sem retorno ainda' : 'sem resposta'}${c.sigilosa ? ' · Sigilosa' : ''}</span></a>
          <button class="icone-btn" data-renomear="${c.id}" aria-label="Renomear ${esc(c.titulo)}" title="Renomear">${ICONE.lapis}</button>
          <button class="icone-btn" data-apagar="${c.id}" aria-label="Apagar ${esc(c.titulo)}" title="Apagar">${ICONE.lixo}</button>
        </div>`).join('')}</div>`
        : '<p class="lead">Você ainda não tem conversas aqui. Comece uma nova ou use uma sugestão.</p>'}
      <p class="dica" style="margin-top:10px">Suas conversas ficam salvas só para você, por até ${E.retencaoDias} dias sem uso. Você pode continuar de onde parou.</p>
      ${uso ? `<h3>Uso neste mês</h3><div class="tabela-rolagem"><table class="tabela"><thead><tr><th>Conversas</th><th>Mensagens</th><th>Pessoas</th><th>Serviu</th><th>Com ajustes</th><th>Não serviu</th><th>Sem retorno</th><th>Custo de IA</th></tr></thead>
        <tbody><tr><td>${uso.conversas}</td><td>${uso.mensagens}</td><td>${uso.pessoas}</td><td>${uso.feedback.serviu}</td><td>${uso.feedback.ajustes}</td><td>${uso.feedback.nao_serviu}</td><td>${uso.feedback.sem}</td><td>${brl(uso.custo)}</td></tr></tbody></table></div>
        <p class="dica">Você vê só os números de uso. O conteúdo das conversas é de cada pessoa.</p>` : ''}
    </div></div>`;
  ligarCabecalho();
  document.querySelectorAll('[data-sug]').forEach(b => { b.onclick = async () => { await vistaConversa({ qw }); const t = $('entrada'); t.value = b.textContent; t.dispatchEvent(new Event('input')); t.focus(); history.replaceState(null, '', `#/qw/${id}/nova`); }; });
  document.querySelectorAll('[data-renomear]').forEach(b => { b.onclick = async () => {
    const atual = lista.conversas.find(c => String(c.id) === b.dataset.renomear);
    const novo = prompt('Novo nome da conversa:', atual.titulo);
    if (novo) { await api(`/api/conversas/${atual.id}`, { metodo: 'PATCH', corpo: { titulo: novo } }); paginaQuickWin(id); }
  }; });
  document.querySelectorAll('[data-apagar]').forEach(b => { b.onclick = async () => {
    if (!confirm('Apagar esta conversa e os anexos? Não dá para desfazer.')) return;
    await api(`/api/conversas/${b.dataset.apagar}`, { metodo: 'DELETE' }); toast('Conversa apagada.'); paginaQuickWin(id);
  }; });
}

// Criar: do zero, de um modelo inicial ou duplicando um existente.
async function novaOrigem() {
  const { modelos } = await api('/api/quick-wins/modelos-iniciais');
  const minhas = E.permQw.areas;
  const existentes = E.quickWins;
  $('principal').innerHTML = `${cabecalho('Criar quick win')}
    <div class="pagina"><div class="pagina-dentro">
      <h2>Criar quick win</h2><p class="lead">Um espaço para uma tarefa que se repete. Você define as instruções e os arquivos uma vez; o time usa em conversas próprias.</p>
      <div class="grupo-form"><h3>Para qual área</h3>
        <div class="opcoes">${minhas.map((a, i) => `<label><input type="checkbox" name="area" value="${a.id}" ${i === 0 ? 'checked' : ''}> ${esc(a.nome)}</label>`).join('') || '<span class="dica">Você não pode criar quick wins em nenhuma área.</span>'}
        ${E.permQw.todaEmpresa ? '<label><input type="checkbox" id="toda"> Toda a empresa</label>' : ''}</div><p></p></div>
      <h3>Começar do zero</h3><div class="linha-botoes"><button class="btn btn-verde" id="do-zero">Quick win em branco</button></div>
      <h3>Começar de um modelo</h3><div class="lista">${modelos.map((m, i) => `<button class="lista-item" data-modelo="${i}"><span class="passo" style="background:${esc(m.cor)};color:#fff;margin:0;width:32px;height:32px;font-size:13px">${esc(m.icone)}</span>
        <span class="principal-texto"><b>${esc(m.nome)}</b><span>${esc(m.para_que_serve)}</span></span></button>`).join('')}</div>
      ${existentes.length ? `<h3>Duplicar um existente</h3><div class="lista">${existentes.map(q => `<button class="lista-item" data-duplicar="${q.id}"><span class="cor" style="width:12px;height:12px;border-radius:3px;background:${esc(q.cor)}"></span>
        <span class="principal-texto"><b>${esc(q.nome)}</b><span>Copia instruções, arquivos e configuração. Nunca as conversas.</span></span></button>`).join('')}</div>` : ''}
    </div></div>`;
  ligarCabecalho();
  const criar = async extra => {
    const toda = $('toda')?.checked || false;
    const areasSel = [...document.querySelectorAll('input[name=area]:checked')].map(i => Number(i.value));
    try {
      const q = await api('/api/quick-wins', { metodo: 'POST', corpo: { ...extra, toda_empresa: toda, areas: areasSel } });
      await recarregarLateral();
      irPara(`#/qw/${q.id}/editar`);
    } catch (e) { toast(e.message); }
  };
  $('do-zero').onclick = () => criar({ nome: 'Novo quick win' });
  document.querySelectorAll('[data-modelo]').forEach(b => { b.onclick = () => criar({ modelo_inicial: Number(b.dataset.modelo) }); });
  document.querySelectorAll('[data-duplicar]').forEach(b => { b.onclick = () => criar({ duplicar_de: Number(b.dataset.duplicar) }); });
}

// Configuração numa tela só, em linguagem simples.
async function configurar(id) {
  const [qw, { areas }, est, bases] = await Promise.all([api(`/api/quick-wins/${id}`), api('/api/areas'), api(`/api/quick-wins/${id}/estimativas`), api('/api/bases/documentos')]);
  if (!qw.podeEditar) return irPara(`#/qw/${id}`);
  // Áreas que a pessoa pode usar, mais as que o quick win já tem.
  const nomes = new Map([...areas, ...E.permQw.areas].map(a => [a.id, a.nome]));
  const minhas = [...new Set([...E.permQw.areas.map(a => a.id), ...qw.areas])].map(id => ({ id, nome: nomes.get(id) || `Área ${id}` }));
  const sug = [...qw.sugestoes, '', '', '', ''].slice(0, 4);
  const radio = (nome, valor, atual, rotulo) => `<label><input type="radio" name="${nome}" value="${valor}" ${atual === valor ? 'checked' : ''}> ${rotulo}</label>`;
  $('principal').innerHTML = `${cabecalho(`Configurar: ${qw.nome}`)}
    <div class="pagina"><form class="pagina-dentro" id="form-qw" novalidate>
      <h2>Configurar quick win</h2><p class="lead">Tudo em uma tela. As mudanças valem para as próximas mensagens de todas as conversas.</p>
      <div class="grupo-form"><h3>Identificação</h3>
        <div class="campo"><label for="nome">Nome</label><input class="entrada" id="nome" value="${esc(qw.nome)}" maxlength="80" required></div>
        <div class="duas-col">
          <div class="campo"><label for="icone">Ícone (até 2 letras)</label><input class="entrada" id="icone" value="${esc(qw.icone)}" maxlength="2"></div>
          <div class="campo"><span class="legenda">Cor</span><div class="opcoes">${CORES.map(c => `<label title="${c}"><input type="radio" name="cor" value="${c}" ${qw.cor.toLowerCase() === c.toLowerCase() ? 'checked' : ''}><span style="display:inline-block;width:20px;height:20px;border-radius:6px;background:${c}"></span></label>`).join('')}</div></div>
        </div>
        <div class="campo"><span class="legenda">Áreas</span><div class="opcoes">${minhas.map(a => `<label><input type="checkbox" name="area" value="${a.id}" ${qw.areas.includes(a.id) ? 'checked' : ''}> ${esc(a.nome)}</label>`).join('')}
          ${E.permQw.todaEmpresa || qw.toda_empresa ? `<label><input type="checkbox" id="toda" ${qw.toda_empresa ? 'checked' : ''}> Toda a empresa</label>` : ''}</div></div>
        <div class="campo"><label for="para">Para que serve</label><input class="entrada" id="para" value="${esc(qw.para_que_serve)}" maxlength="200"><span class="ajuda">Uma frase. Aparece para quem vai usar.</span></div>
      </div>
      <div class="grupo-form"><h3>O que a IA deve fazer</h3>
        <div class="campo"><label for="instrucoes">Instruções</label><textarea class="entrada" id="instrucoes" rows="7">${esc(qw.instrucoes)}</textarea><span class="ajuda">Em português comum. Valem para todas as conversas deste quick win.</span></div>
        <div class="campo"><span class="legenda">Formato preferido da resposta</span><div class="opcoes">${Object.entries(FORMATOS).map(([v, r]) => radio('formato', v, qw.formato, r)).join('')}</div></div>
        <div class="campo"><span class="legenda">Sugestões de início (até 4)</span>${sug.map((s, i) => `<input class="entrada" style="margin-bottom:6px" data-sugestao value="${esc(s)}" placeholder="Ex.: Confira estes dois documentos e liste as diferenças" aria-label="Sugestão ${i + 1}">`).join('')}</div>
        <div class="duas-col">
          <div class="campo"><label for="ex-entrada">Exemplo de entrada (opcional)</label><textarea class="entrada" id="ex-entrada" rows="3">${esc(qw.exemplo_entrada)}</textarea></div>
          <div class="campo"><label for="ex-saida">Exemplo de saída (opcional)</label><textarea class="entrada" id="ex-saida" rows="3">${esc(qw.exemplo_saida)}</textarea></div>
        </div>
      </div>
      <div class="grupo-form"><h3>Arquivos e bases</h3>
        <div class="campo"><span class="legenda">Arquivos deste quick win</span><span class="ajuda">Modelos, checklists, tabelas de regras, exemplos. Entram em todas as conversas.</span>
          <div class="lista" style="margin-top:8px">${qw.arquivos.map(a => `<div class="lista-item"><span class="principal-texto"><b>${esc(a.titulo)}</b><span>${esc(a.arquivo)} · ${a.caracteres.toLocaleString('pt-BR')} caracteres${a.sigiloso ? ' · sigiloso' : ''}</span></span>
            <button type="button" class="icone-btn" data-tirar-arquivo="${a.id}" aria-label="Remover ${esc(a.titulo)}">${ICONE.lixo}</button></div>`).join('') || '<div class="lista-item"><span class="dica">Nenhum arquivo ainda.</span></div>'}</div>
          <div class="linha-botoes" style="margin-top:10px"><button type="button" class="btn btn-linha btn-pequeno" id="add-arquivo">${ICONE.clipe} Adicionar arquivo</button>
            <label class="dica"><input type="checkbox" id="arquivo-sigiloso"> marcar como sigiloso</label>
            <input type="file" id="arquivo-qw" hidden accept=".pdf,.docx,.txt,.md,.csv,.xlsx"></div></div>
        <div class="campo"><span class="legenda">Bases de conhecimento</span><div class="opcoes">
          ${radio('bases', 'nenhuma', qw.bases.modo, 'Nenhuma')}${radio('bases', 'area', qw.bases.modo, 'A da área')}${radio('bases', 'escolhidas', qw.bases.modo, 'Escolher documentos')}</div>
          <div class="opcoes" id="bases-escolhidas" style="margin-top:8px">${bases.documentos.map(d => `<label><input type="checkbox" name="base" value="${d.id}" ${qw.bases.ids.includes(d.id) ? 'checked' : ''}> ${esc(d.titulo)}</label>`).join('') || '<span class="dica">Nenhum documento de base disponível.</span>'}</div></div>
      </div>
      <div class="grupo-form"><h3>Modelo de IA</h3>
        <div class="campo"><label for="modelo">Modelo padrão</label><select class="entrada" id="modelo">${est.modelos.map(m => `<option value="${esc(m.id)}" ${m.id === qw.modelo ? 'selected' : ''}>${esc(m.nome)}${m.homologado ? ' · Homologado' : ''} · ${brl(m.custo)} por conversa típica</option>`).join('')}</select>
          <span class="ajuda">Estimativa com o preço informado pelo OpenRouter, para uma conversa de três perguntas. Quem usa pode usar este modelo mesmo sem ter o perfil liberado no dia a dia.</span></div>
        <label class="opcoes"><span><input type="checkbox" id="pode-trocar" ${qw.pode_trocar ? 'checked' : ''}> Quem usa pode trocar de modelo (dentro dos perfis liberados para a pessoa)</span></label><p></p>
      </div>
      <div class="grupo-form"><h3>Dados e sigilo</h3>
        <div class="campo"><span class="legenda">Classificação</span><div class="opcoes">${radio('sigiloso', '0', qw.sigiloso ? '1' : '0', 'Sem dados sigilosos')}${radio('sigiloso', '1', qw.sigiloso ? '1' : '0', 'Trata dados sigilosos (só modelos homologados; todas as conversas nascem sigilosas)')}</div></div>
        <div class="campo"><span class="legenda">O que fazer quando o sistema encontrar cada tipo de dado</span>
          <div class="tabela-rolagem"><table class="tabela"><thead><tr><th>Tipo</th><th>Bloquear</th><th>Permitir (a conversa vira sigilosa)</th></tr></thead><tbody>
          ${Object.entries(DADOS).map(([t, r]) => `<tr><td>${r}</td><td><input type="radio" name="dado-${t}" value="bloquear" ${qw.dados[t] !== 'permitir' ? 'checked' : ''} aria-label="${r}: bloquear"></td><td><input type="radio" name="dado-${t}" value="permitir" ${qw.dados[t] === 'permitir' ? 'checked' : ''} aria-label="${r}: permitir"></td></tr>`).join('')}
          <tr><td>Senhas e credenciais</td><td colspan="2">Sempre bloqueadas</td></tr></tbody></table></div></div>
      </div>
      <div class="grupo-form"><h3>Status</h3><div class="opcoes">${radio('status', 'rascunho', qw.status, 'Rascunho (só você e o admin usam)')}${radio('status', 'ativo', qw.status, 'Ativo')}${radio('status', 'pausado', qw.status, 'Pausado')}</div><p></p></div>
      <p class="msg-erro oculto" id="erro-qw" role="alert"></p>
      <div class="linha-botoes" style="position:sticky;bottom:0;background:var(--paper);padding:12px 0;border-top:1px solid var(--line)">
        <button class="btn btn-verde" id="salvar">Salvar</button>
        <button type="button" class="btn btn-linha" id="testar">Salvar e testar</button>
        <a class="btn btn-texto" href="#/qw/${id}">Voltar</a>
        <button type="button" class="btn btn-perigo btn-pequeno" id="excluir" style="margin-left:auto">Excluir quick win</button>
      </div>
    </form></div>`;
  ligarCabecalho();
  const mostrarBases = () => { $('bases-escolhidas').classList.toggle('oculto', document.querySelector('input[name=bases]:checked')?.value !== 'escolhidas'); };
  document.querySelectorAll('input[name=bases]').forEach(r => { r.onchange = mostrarBases; });
  mostrarBases();
  const valor = n => document.querySelector(`input[name="${n}"]:checked`)?.value;
  const salvar = async () => {
    const corpo = {
      nome: $('nome').value, icone: $('icone').value, cor: valor('cor') || qw.cor, para_que_serve: $('para').value, instrucoes: $('instrucoes').value,
      formato: valor('formato'), sugestoes: [...document.querySelectorAll('[data-sugestao]')].map(i => i.value), exemplo_entrada: $('ex-entrada').value, exemplo_saida: $('ex-saida').value,
      bases: { modo: valor('bases'), ids: [...document.querySelectorAll('input[name=base]:checked')].map(i => Number(i.value)) },
      modelo: $('modelo').value, pode_trocar: $('pode-trocar').checked, sigiloso: valor('sigiloso') === '1',
      dados: Object.fromEntries(Object.keys(DADOS).map(t => [t, valor(`dado-${t}`)])), status: valor('status'),
      toda_empresa: $('toda')?.checked || false, areas: [...document.querySelectorAll('input[name=area]:checked')].map(i => Number(i.value)),
    };
    try {
      await api(`/api/quick-wins/${id}`, { metodo: 'PUT', corpo });
      $('erro-qw').classList.add('oculto');
      await recarregarLateral();
      return true;
    } catch (e) { $('erro-qw').textContent = e.message; $('erro-qw').classList.remove('oculto'); return false; }
  };
  $('form-qw').onsubmit = async ev => { ev.preventDefault(); if (await salvar()) toast('Quick win salvo.'); };
  $('testar').onclick = async () => { if (await salvar()) irPara(`#/qw/${id}/teste`); };
  $('excluir').onclick = async () => {
    if (!confirm('Excluir este quick win? As conversas das pessoas continuam salvas com elas.')) return;
    await api(`/api/quick-wins/${id}`, { metodo: 'DELETE' }); await recarregarLateral(); irPara('#/nova');
  };
  $('add-arquivo').onclick = () => $('arquivo-qw').click();
  $('arquivo-qw').onchange = async ev => {
    const f = ev.target.files[0];
    if (!f) return;
    const base64 = await new Promise(res => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.readAsDataURL(f); });
    try { await api(`/api/quick-wins/${id}/arquivos`, { metodo: 'POST', corpo: { arquivo: { nome: f.name, base64 }, sigiloso: $('arquivo-sigiloso').checked } }); toast('Arquivo adicionado.'); configurar(id); }
    catch (e) { toast(e.message, 6000); }
  };
  document.querySelectorAll('[data-tirar-arquivo]').forEach(b => { b.onclick = async () => {
    await api(`/api/quick-wins/${id}/arquivos/${b.dataset.tirarArquivo}`, { metodo: 'DELETE' }); configurar(id);
  }; });
}
