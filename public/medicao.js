// Medição do quick win, vista por quem gerencia: uso automático por mês,
// comparação entre modelos, medição manual (antes e depois) e decisões.
import { api, emCreditos, esc, fmtCusto, ICONE, toast } from '/comum.js';

const $ = id => document.getElementById(id);
const brl = v => fmtCusto(v);
const num = v => (v === null || v === undefined ? '' : String(v).replace('.', ','));
const mesNome = m => new Date(`${m}-15T12:00:00`).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
const dataBr = d => (d ? new Date(d.length === 10 ? `${d}T12:00:00` : d).toLocaleDateString('pt-BR') : '');
const DECISOES = { manter: 'Manter', ajustar: 'Ajustar', descartar: 'Descartar', ampliar: 'Ampliar' };
const ORIGENS = { medido: 'medido', informado: 'informado' };

export async function secaoMedicao(alvo, id) {
  const [d, uso] = await Promise.all([api(`/api/quick-wins/${id}/medicao`), api(`/api/quick-wins/${id}/uso`)]);
  const hoje = new Date().toISOString().slice(0, 10);
  const lado = (k, m = {}) => `<fieldset class="lado"><legend>${k === 'antes' ? 'Antes (ponto de partida)' : 'Depois'}</legend>
    <div class="campo"><label for="${k}-valor">Valor</label><input class="entrada" id="${k}-valor" inputmode="decimal" value="${esc(num(m[`${k}_valor`]))}"></div>
    <div class="campo"><label for="${k}-data">Data</label><input class="entrada" id="${k}-data" type="date" value="${esc(m[`${k}_data`] || hoje)}"></div>
    <div class="campo"><span class="legenda">Origem</span><div class="opcoes">${Object.keys(ORIGENS).map(o => `<label><input type="radio" name="${k}-origem" value="${o}" ${(m[`${k}_origem`] || 'medido') === o ? 'checked' : ''}> ${o === 'medido' ? 'Medido' : 'Informado por alguém'}</label>`).join('')}</div></div></fieldset>`;

  alvo.innerHTML = `
    <h3>Uso por mês</h3>
    ${d.usoMensal.length ? `<div class="tabela-rolagem"><table class="tabela"><thead><tr><th>Mês</th><th>Conversas</th><th>Mensagens</th><th>Pessoas</th><th>Serviu</th><th>Com ajustes</th><th>Não serviu</th><th>Sem retorno</th><th>${emCreditos() ? 'Créditos' : 'Custo de IA'}</th></tr></thead><tbody>
      ${d.usoMensal.map(u => `<tr><td>${mesNome(u.mes)}</td><td>${u.conversas}</td><td>${u.mensagens}</td><td>${u.pessoas}</td><td>${u.serviu}</td><td>${u.ajustes}</td><td>${u.nao_serviu}</td><td>${u.sem_feedback}</td><td>${brl(u.custo)}</td></tr>`).join('')}
    </tbody></table></div>` : '<p class="dica">Ainda sem uso. Os números aparecem quando alguém conversar neste quick win.</p>'}
    <p class="dica">Cada conversa conta como um uso. Você vê só os números. O conteúdo das conversas é de cada pessoa.</p>

    ${uso.porModelo.length > 1 ? `<h3>Modelos neste mês</h3><div class="tabela-rolagem"><table class="tabela"><thead><tr><th>Modelo</th><th>Conversas</th><th>Serviu</th><th>Com ajustes</th><th>Não serviu</th><th>${emCreditos() ? 'Créditos por conversa' : 'Custo médio por conversa'}</th><th>Tempo médio</th></tr></thead><tbody>
      ${uso.porModelo.map(m => `<tr><td>${esc(m.modelo)}</td><td>${m.conversas}</td><td>${m.serviu}</td><td>${m.ajustes}</td><td>${m.nao_serviu}</td><td>${brl(m.custoMedio)}</td><td>${num((m.ms / 1000).toFixed(1))} s</td></tr>`).join('')}
    </tbody></table></div><p class="dica">Ajuda a decidir se vale trocar o modelo padrão.</p>` : ''}

    <h3>Medição antes e depois</h3>
    <p class="dica">Lance um indicador que a equipe já acompanha. Sem o valor de antes, nada é calculado.</p>
    <div class="lista" id="medicoes">${d.medicoes.map(m => `<div class="lista-item">
      <span class="principal-texto"><b>${esc(m.indicador)}</b>
        <span>${m.antes_valor !== null ? `Antes: ${num(m.antes_valor)} (${dataBr(m.antes_data)}, ${ORIGENS[m.antes_origem]})` : 'Sem ponto de partida'}${m.depois_valor !== null ? ` · Depois: ${num(m.depois_valor)} (${dataBr(m.depois_data)}, ${ORIGENS[m.depois_origem]})` : ''}${m.variacao !== null ? ` · Variação: ${m.variacao > 0 ? '+' : ''}${num(+m.variacao.toFixed(2))}${m.percentual !== null ? ` (${m.percentual > 0 ? '+' : ''}${num(Math.round(m.percentual))}%)` : ''}` : ''}${m.observacao ? `<br>${esc(m.observacao)}` : ''}</span></span>
      ${m.situacao === 'sem ponto de partida' ? '<span class="selo selo-ambar">sem ponto de partida</span>' : ''}
      <button class="icone-btn" data-editar-med="${m.id}" aria-label="Editar ${esc(m.indicador)}" title="Editar">${ICONE.lapis}</button>
      <button class="icone-btn" data-apagar-med="${m.id}" aria-label="Apagar ${esc(m.indicador)}" title="Apagar">${ICONE.lixo}</button></div>`).join('') || '<div class="lista-item"><span class="dica">Nenhuma medição lançada.</span></div>'}</div>
    <div class="linha-botoes" style="margin:10px 0 0"><button type="button" class="btn btn-linha btn-pequeno" id="nova-med">${ICONE.mais} Lançar medição</button></div>
    <form id="form-med" class="grupo-form oculto" novalidate style="margin-top:14px"></form>

    <h3>Decisão</h3>
    <form id="form-dec" novalidate>
      <div class="campo"><span class="legenda">O que fazer com este quick win</span><div class="opcoes">${Object.entries(DECISOES).map(([v, r], i) => `<label><input type="radio" name="decisao" value="${v}" ${i === 0 ? 'checked' : ''}> ${r}</label>`).join('')}</div></div>
      <div class="campo"><label for="motivo">Por quê</label><textarea class="entrada" id="motivo" rows="2" maxlength="1000"></textarea></div>
      <p class="msg-erro oculto" id="erro-dec" role="alert"></p>
      <div class="linha-botoes"><button class="btn btn-verde btn-pequeno">Registrar decisão</button>
        <a class="btn btn-texto" href="/api/quick-wins/${id}/medicao.csv" download>Baixar tudo em CSV</a></div>
    </form>
    ${d.decisoes.length ? `<div class="lista" style="margin-top:12px">${d.decisoes.map(x => `<div class="lista-item"><span class="principal-texto"><b>${DECISOES[x.decisao]}</b><span>${dataBr(x.em)} · ${esc(x.por || '')}<br>${esc(x.motivo)}</span></span></div>`).join('')}</div>` : ''}`;

  const recarregar = () => secaoMedicao(alvo, id);
  const abrirForm = (m = {}) => {
    const f = $('form-med');
    f.classList.remove('oculto');
    f.innerHTML = `<div class="campo"><label for="indicador">Indicador</label><input class="entrada" id="indicador" maxlength="160" value="${esc(m.indicador || '')}" placeholder="Ex.: minutos por documento conferido"></div>
      <div class="duas-col">${lado('antes', m)}${lado('depois', m)}</div>
      <div class="campo"><label for="observacao">Observação (opcional)</label><input class="entrada" id="observacao" maxlength="1000" value="${esc(m.observacao || '')}"></div>
      <p class="msg-erro oculto" id="erro-med" role="alert"></p>
      <div class="linha-botoes"><button class="btn btn-verde btn-pequeno">Salvar medição</button><button type="button" class="btn btn-texto" id="cancelar-med">Cancelar</button></div>`;
    $('indicador').focus();
    $('cancelar-med').onclick = () => { f.classList.add('oculto'); f.innerHTML = ''; };
    f.onsubmit = async ev => {
      ev.preventDefault();
      const corpo = { indicador: $('indicador').value, observacao: $('observacao').value };
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
    if (!confirm('Apagar esta medição?')) return;
    await api(`/api/quick-wins/${id}/medicoes/${b.dataset.apagarMed}`, { metodo: 'DELETE' }); recarregar();
  }; });
  $('form-dec').onsubmit = async ev => {
    ev.preventDefault();
    try {
      await api(`/api/quick-wins/${id}/decisoes`, { metodo: 'POST', corpo: { decisao: $('form-dec').querySelector('[name=decisao]:checked').value, motivo: $('motivo').value } });
      toast('Decisão registrada.'); recarregar();
    } catch (e) { $('erro-dec').textContent = e.message; $('erro-dec').classList.remove('oculto'); }
  };
}
