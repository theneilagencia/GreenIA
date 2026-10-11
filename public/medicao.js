import { E } from '/app.js';
// Uso e decisão do Quick Win, vistos por quem gerencia: uso automático por mês, comparação por nível (quem
// administra vê também o modelo), medições de antes e depois e decisões.
import { api, emCreditos, esc, fmtCusto, ICONE, toast } from '/comum.js';
import { confirmarAcao } from '/qw-ui.js';

const $ = id => document.getElementById(id);
const brl = v => fmtCusto(v);
// Exibição em pt-BR (5.000; 0,4). No campo de edição, o valor volta como foi digitado (sem separador de milhar).
const fmt = v => (v === null || v === undefined || v === '' ? '' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 }));
const numEntrada = v => (v === null || v === undefined ? '' : String(v).replace('.', ','));
const mesNome = m => new Date(`${m}-15T12:00:00`).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
const dataBr = d => (d ? new Date(d.length === 10 ? `${d}T12:00:00` : d).toLocaleDateString('pt-BR') : '');
const DECISOES = { manter: 'Manter', ajustar: 'Ajustar', descartar: 'Descartar', ampliar: 'Ampliar' };
const ORIGENS = { medido: 'medido', informado: 'informado' };
const TIPOS = { tempo: 'Tempo', financeiro: 'Financeiro', qualidade: 'Qualidade', volume: 'Volume', outro: 'Outro' };
const NO_TIPO = { tempo: ' no tempo', financeiro: ' no valor', qualidade: ' no indicador de qualidade', volume: ' no volume' };
// Sentido de melhora conhecido: tempo menor e volume maior são melhores. Nos outros tipos, o sentido depende do
// indicador (custo ou receita, erros ou acertos): a variação aparece sem julgamento.
const MELHORA = { tempo: -1, volume: 1 };
function variacao(m) {
  if (m.variacao === null || m.variacao === undefined) return '';
  if (!m.variacao) return '<span class="qw-variacao qw-variacao-neutra">Sem variação</span>';
  const quanto = m.percentual !== null && m.percentual !== undefined ? `${fmt(Math.abs(Math.round(m.percentual)))}%` : `${fmt(Math.abs(+m.variacao.toFixed(2)))}${m.unidade ? ` ${esc(m.unidade)}` : ''}`;
  const sentido = MELHORA[m.tipo], efeito = !sentido ? 'neutra' : Math.sign(m.variacao) === sentido ? 'boa' : 'ruim';
  return `<span class="qw-variacao qw-variacao-${efeito}">${m.variacao > 0 ? 'Aumento' : 'Redução'} de ${quanto}${NO_TIPO[m.tipo] || ''}${efeito === 'boa' ? ' · melhorou' : efeito === 'ruim' ? ' · piorou' : ''}</span>`;
}
// Conversas por mês em barras simples (o número também aparece escrito, e a tabela abaixo traz o detalhe).
function grafico(meses) {
  const max = Math.max(1, ...meses.map(u => u.conversas));
  return `<figure class="qw-grafico"><figcaption class="dica">Conversas por mês</figcaption><ul>${meses.map(u => `<li><span class="qw-grafico-mes">${mesNome(u.mes)}</span><span class="qw-grafico-barra" style="--valor:${Math.round(u.conversas / max * 100)}%" aria-hidden="true"></span><b>${fmt(u.conversas)}</b></li>`).join('')}</ul></figure>`;
}

export async function secaoMedicao(alvo, id) {
  const [d, uso] = await Promise.all([api(`/api/quick-wins/${id}/medicao`), api(`/api/quick-wins/${id}/uso`)]);
  if (!alvo?.isConnected) return;
  const hoje = new Date().toISOString().slice(0, 10);
  // Quem administra compara modelos (com o nível ao lado); quem gerencia compara níveis, sem o nome técnico.
  const linhasModelo = E.eu?.admin && uso.porModelo?.length ? uso.porModelo : uso.porNivel || [];
  const lado = (k, m = {}) => `<fieldset class="lado"><legend>${k === 'antes' ? 'Antes (ponto de partida)' : 'Depois'}</legend>
    <div class="campo"><label for="${k}-valor">Valor</label><input class="entrada" id="${k}-valor" inputmode="decimal" value="${esc(numEntrada(m[`${k}_valor`]))}"></div>
    <div class="campo"><label for="${k}-data">Data</label><input class="entrada" id="${k}-data" type="date" value="${esc(m[`${k}_data`] || hoje)}"></div>
    <div class="campo"><span class="legenda">Origem</span><div class="opcoes qw-opcoes-toque">${Object.keys(ORIGENS).map(o => `<label><input type="radio" name="${k}-origem" value="${o}" ${(m[`${k}_origem`] || 'medido') === o ? 'checked' : ''}> ${o === 'medido' ? 'Medido' : 'Informado por alguém'}</label>`).join('')}</div></div></fieldset>`;

  alvo.innerHTML = `
    <h3>Uso por mês</h3><p class="dica">Medido pela plataforma: registros de uso e consumo. Avaliações são respostas das pessoas, não uma medição automática da qualidade.</p>
    ${d.usoMensal.length ? `${grafico(d.usoMensal)}<div class="tabela-rolagem"><table class="tabela"><thead><tr><th>Mês</th><th class="num">Conversas</th><th class="num">Mensagens</th><th class="num">Pessoas</th><th class="num">Serviu</th><th class="num">Com ajustes</th><th class="num">Não serviu</th><th class="num">Sem retorno</th><th class="num">${emCreditos() ? 'Créditos' : 'Custo de IA'}</th></tr></thead><tbody>
      ${d.usoMensal.map(u => `<tr><td>${mesNome(u.mes)}</td><td class="num">${fmt(u.conversas)}</td><td class="num">${fmt(u.mensagens)}</td><td class="num">${fmt(u.pessoas)}</td><td class="num">${fmt(u.serviu)}</td><td class="num">${fmt(u.ajustes)}</td><td class="num">${fmt(u.nao_serviu)}</td><td class="num">${fmt(u.sem_feedback)}</td><td class="num">${brl(u.custo)}</td></tr>`).join('')}
    </tbody></table></div>` : '<p class="dica">Ainda sem uso. Os números aparecem quando alguém conversar neste Quick Win.</p>'}
    <p class="dica">Cada conversa conta como um uso. Você vê só os números. O conteúdo das conversas é de cada pessoa.</p>

    ${linhasModelo.length > 1 ? `<h3>${E.eu?.admin ? 'Modelos' : 'Níveis'} neste mês</h3><div class="tabela-rolagem"><table class="tabela"><thead><tr>${E.eu?.admin ? '<th>Modelo</th>' : ''}<th>Nível</th><th class="num">Conversas</th><th class="num">Serviu</th><th class="num">Com ajustes</th><th class="num">Não serviu</th><th class="num">${emCreditos() ? 'Créditos por conversa' : 'Custo médio por conversa'}</th><th class="num">Tempo médio</th></tr></thead><tbody>
      ${linhasModelo.map(m => `<tr>${E.eu?.admin ? `<td>${esc(m.modelo || '—')}</td>` : ''}<td>${esc(m.nomeNivel || '—')}</td><td class="num">${fmt(m.conversas)}</td><td class="num">${fmt(m.serviu)}</td><td class="num">${fmt(m.ajustes)}</td><td class="num">${fmt(m.nao_serviu)}</td><td class="num">${brl(m.custoMedio)}</td><td class="num">${fmt(+(m.ms / 1000).toFixed(1))} s</td></tr>`).join('')}
    </tbody></table></div><p class="dica">${E.eu?.admin ? 'Ajuda a decidir se vale trocar o modelo padrão de um nível.' : 'Compara como cada nível respondeu neste Quick Win. O modelo por trás de cada nível é escolha de quem administra a empresa.'}</p>` : ''}

    <h3>Antes e depois</h3>
    <p class="dica">Lance um indicador que a equipe já acompanha. Identifique se foi medido pela equipe ou informado por alguém. A variação é calculada a partir desses valores; não é benefício verificado pela plataforma. Sem o valor de antes, nada é calculado.</p>
    <div class="lista" id="medicoes">${d.medicoes.map(m => `<div class="lista-item">
      <span class="principal-texto"><b>${esc(m.indicador)}${m.unidade ? ` (${esc(m.unidade)})` : ''}</b><span class="chip">${TIPOS[m.tipo] || 'Outro'}</span>
        ${variacao(m)}
        <span>${m.antes_valor !== null ? `Antes: ${fmt(m.antes_valor)} (${dataBr(m.antes_data)}, ${ORIGENS[m.antes_origem]})` : 'Sem ponto de partida'}${m.depois_valor !== null ? ` · Depois: ${fmt(m.depois_valor)} (${dataBr(m.depois_data)}, ${ORIGENS[m.depois_origem]})` : ''}${m.observacao ? `<br>${esc(m.observacao)}` : ''}</span></span>
      ${m.situacao === 'sem ponto de partida' ? '<span class="selo selo-ambar">sem ponto de partida</span>' : ''}
      <button class="icone-btn" data-editar-med="${m.id}" aria-label="Editar ${esc(m.indicador)}" title="Editar">${ICONE.lapis}</button>
      <button class="icone-btn" data-apagar-med="${m.id}" aria-label="Apagar ${esc(m.indicador)}" title="Apagar">${ICONE.lixo}</button></div>`).join('') || '<div class="lista-item"><span class="dica">Nenhuma medição lançada.</span></div>'}</div>
    <div class="linha-botoes" style="margin:10px 0 0"><button type="button" class="btn btn-linha btn-pequeno" id="nova-med">${ICONE.mais} Lançar medição</button></div>
    <form id="form-med" class="grupo-form oculto" novalidate style="margin-top:14px"></form>

    <h3>Decisão</h3>
    <p class="dica">Manter aprova o Quick Win, ajustar volta para teste, descartar tira de circulação e ampliar marca para expansão. O motivo fica registrado.</p>
    <form id="form-dec" novalidate>
      <fieldset class="campo" aria-describedby="erro-decisao"><legend class="legenda">O que fazer com este Quick Win *</legend><div class="opcoes qw-opcoes-toque">${Object.entries(DECISOES).map(([v, r]) => `<label><input type="radio" name="decisao" value="${v}" required${v === 'descartar' ? ' class="perigo"' : ''}> ${r}</label>`).join('')}</div><p class="msg-erro oculto" id="erro-decisao"></p></fieldset>
      <div class="campo"><label for="motivo">Por quê *</label><textarea class="entrada" id="motivo" rows="2" maxlength="1000" required aria-required="true" aria-describedby="erro-motivo"></textarea><p class="msg-erro oculto" id="erro-motivo"></p></div>
      <p class="msg-erro oculto" id="erro-dec" role="alert"></p>
      <div class="linha-botoes"><button class="btn btn-verde btn-pequeno">Registrar decisão</button>
        <a class="btn btn-texto" href="/api/quick-wins/${id}/medicao.csv" download>Baixar tudo em planilha</a></div>
    </form>
    ${d.decisoes.length ? `<div class="lista" style="margin-top:12px">${d.decisoes.map(x => `<div class="lista-item"><span class="principal-texto"><b>${DECISOES[x.decisao]}</b><span>${dataBr(x.em)} · ${esc(x.por || '')}<br>${esc(x.motivo)}</span></span></div>`).join('')}</div>` : ''}`;

  const recarregar = () => secaoMedicao(alvo, id);
  const abrirForm = (m = {}) => {
    const f = $('form-med');
    f.classList.remove('oculto');
    f.innerHTML = `<div class="campo"><label for="indicador">Indicador</label><input class="entrada" id="indicador" maxlength="160" value="${esc(m.indicador || '')}" placeholder="Ex.: minutos por documento conferido"></div>
      <div class="duas-col"><div class="campo"><label for="tipo-med">Tipo</label><select class="entrada" id="tipo-med">${Object.entries(TIPOS).map(([k, v]) => `<option value="${k}" ${(m.tipo || 'tempo') === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
        <div class="campo"><label for="unidade-med">Unidade</label><input class="entrada" id="unidade-med" maxlength="40" value="${esc(m.unidade || '')}" placeholder="Ex.: minutos, R$, erros por mês"></div></div>
      <div class="duas-col">${lado('antes', m)}${lado('depois', m)}</div>
      <div class="campo"><label for="observacao">Observação (opcional)</label><input class="entrada" id="observacao" maxlength="1000" value="${esc(m.observacao || '')}"></div>
      <p class="msg-erro oculto" id="erro-med" role="alert"></p>
      <div class="linha-botoes"><button class="btn btn-verde btn-pequeno">Salvar medição</button><button type="button" class="btn btn-texto" id="cancelar-med">Cancelar</button></div>`;
    $('indicador').focus();
    $('cancelar-med').onclick = () => { f.classList.add('oculto'); f.innerHTML = ''; };
    f.onsubmit = async ev => {
      ev.preventDefault();
      const corpo = { indicador: $('indicador').value, observacao: $('observacao').value, tipo: $('tipo-med').value, unidade: $('unidade-med').value };
      for (const k of ['antes', 'depois']) {
        corpo[`${k}_valor`] = $(`${k}-valor`).value.trim();
        corpo[`${k}_data`] = $(`${k}-data`).value;
        corpo[`${k}_origem`] = f.querySelector(`[name=${k}-origem]:checked`)?.value;
      }
      try {
        await api(m.id ? `/api/quick-wins/${id}/medicoes/${m.id}` : `/api/quick-wins/${id}/medicoes`, { metodo: m.id ? 'PUT' : 'POST', corpo });
        toast('Medição salva.'); recarregar();
      } catch (e) { $('erro-med').textContent = e.message; $('erro-med').classList.remove('oculto'); }
    };
  };
  $('nova-med').onclick = () => abrirForm();
  alvo.querySelectorAll('[data-editar-med]').forEach(b => { b.onclick = () => abrirForm(d.medicoes.find(m => String(m.id) === b.dataset.editarMed)); });
  alvo.querySelectorAll('[data-apagar-med]').forEach(b => { b.onclick = async () => {
    const m = d.medicoes.find(x => String(x.id) === b.dataset.apagarMed);
    if (!await confirmarAcao({ titulo: 'Apagar esta medição?', texto: `“${m?.indicador || 'Medição'}” sai da lista de antes e depois. Não dá para desfazer.`, confirmar: 'Apagar medição', perigo: true })) return;
    await api(`/api/quick-wins/${id}/medicoes/${b.dataset.apagarMed}`, { metodo: 'DELETE' }); recarregar();
  }; });
  // Decisão: nenhuma opção vem marcada, o motivo é obrigatório e descartar pede confirmação.
  const erroDec = (campo, msg, foco) => { $(`erro-${campo}`).textContent = msg; $(`erro-${campo}`).classList.remove('oculto'); foco.setAttribute('aria-invalid', 'true'); foco.focus(); };
  $('form-dec').onsubmit = async ev => {
    ev.preventDefault();
    for (const c of ['decisao', 'motivo', 'dec']) { $(`erro-${c}`).textContent = ''; $(`erro-${c}`).classList.add('oculto'); }
    $('form-dec').querySelectorAll('[aria-invalid]').forEach(el => el.removeAttribute('aria-invalid'));
    const decisao = $('form-dec').querySelector('[name=decisao]:checked')?.value, motivo = $('motivo').value.trim();
    if (!decisao) return erroDec('decisao', 'Escolha o que fazer com este Quick Win.', $('form-dec').querySelector('[name=decisao]'));
    if (!motivo) return erroDec('motivo', 'Explique o motivo. Ele fica registrado com a decisão.', $('motivo'));
    if (decisao === 'descartar' && !await confirmarAcao({ titulo: 'Descartar este Quick Win?', texto: 'Ele sai de circulação: a equipe deixa de ver e usar. O histórico fica guardado e dá para restaurar depois.', confirmar: 'Descartar Quick Win', perigo: true })) return;
    try {
      await api(`/api/quick-wins/${id}/decisoes`, { metodo: 'POST', corpo: { decisao, motivo } });
      toast('Decisão registrada. O estado do Quick Win foi atualizado.'); location.hash === `#/qw/${id}` ? (await import('/quickwin.js')).rotaQuickWin(location.hash) : recarregar();
    } catch (e) { $('erro-dec').textContent = e.message; $('erro-dec').classList.remove('oculto'); }
  };
}
