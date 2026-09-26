// Console do operador: todas as instalações de clientes numa tela. Valores em dólar
// (o servidor só responde a quem é operador). Separado do painel do cliente.
import { api, definirCsrf, esc, marcaHtml, toast } from '/comum.js';

const $ = id => document.getElementById(id);
const num = v => Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
const usd = v => (v === null || v === undefined ? '–' : `US$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const data = iso => (iso ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('pt-BR') : '–');
const FASE = { normal: ['Normal', 'selo-verde'], aviso: ['Acima de 80%', 'selo-ambar'], pacote: ['Usando pacote', 'selo-cinza'], reserva: ['Na reserva', 'selo-ambar'], esgotado: ['Pausado', 'selo-vermelho'] };
const CLASSE = { rapido: 'Rápido', equilibrado: 'Equilibrado', avancado: 'Avançado' };
const ORIGEM = { painel: 'Painel', console: 'Console', manual: 'Manual' };
const preco = m => (m && m.precoEntrada !== null && m.precoEntrada !== undefined ? `${usd(m.precoEntrada)} / ${usd(m.precoSaida)}` : '–');

let dados;

async function carregar() {
  dados = await api('/api/operador/instancias');
  const ok = dados.instancias.filter(i => i.ok);
  const soma = k => ok.reduce((t, i) => t + (i.resumo.financeiro[k] || 0), 0);
  const receita = soma('receita'), custo = soma('custoComTaxa') + soma('custoInfraUsd');
  const alertas = ok.reduce((t, i) => t + i.resumo.alertas.length, 0) + dados.instancias.filter(i => !i.ok).length;

  $('conteudo').innerHTML = `<h2>Clientes</h2>
    <p class="lead">Cada cliente é uma instalação separada. Os números são do mês corrente, em dólar, pelo custo informado pelo OpenRouter mais a taxa de 5,5%.</p>
    ${dados.instancias.length ? '' : '<div class="faixa-aviso atencao">Nenhuma instalação configurada. Defina INSTANCIAS no servidor (Nome|URL|token, separadas por ponto e vírgula) e OPERADOR_TOKEN em cada instalação de cliente.</div>'}
    <div class="indicadores">
      <div class="indicador"><span>Clientes</span><b>${num(dados.instancias.length)}</b><small>${num(ok.length)} respondendo</small></div>
      <div class="indicador"><span>Receita do mês</span><b>${usd(receita)}</b><small>planos e pacotes</small></div>
      <div class="indicador"><span>Custo do mês</span><b>${usd(custo)}</b><small>IA com taxa e servidor</small></div>
      <div class="indicador"><span>Margem</span><b>${usd(receita - custo)}</b><small>${receita ? `${Math.round((receita - custo) / receita * 100)}%` : ''}</small></div>
      <div class="indicador"><span>Alertas</span><b>${num(alertas)}</b></div>
    </div>
    <div class="tabela-rolagem" style="margin:18px 0 24px"><table class="tabela tabela-empilha"><thead><tr>
      <th>Cliente</th><th>Situação</th><th class="num">Créditos usados</th><th class="num">Reserva</th><th class="num">Pacote disponível</th><th class="num">Custo real</th><th class="num">Receita</th><th class="num">Margem</th></tr></thead><tbody>
      ${dados.instancias.map(i => linha(i)).join('')}</tbody></table></div>
    ${dados.instancias.map(i => detalhe(i)).join('')}`;

  for (const f of document.querySelectorAll('form[data-pacote]')) f.onsubmit = liberar;
}

function linha(i) {
  if (!i.ok) return `<tr><td data-r="Cliente"><b>${esc(i.nome)}</b></td><td data-r="Situação" colspan="7"><span class="selo selo-vermelho">Sem resposta</span> <span class="dica">${esc(i.erro)}</span></td></tr>`;
  const r = i.resumo, s = r.situacao, f = r.financeiro;
  const [fase, cls] = FASE[s?.fase] || ['Sem plano', 'selo-cinza'];
  return `<tr><td data-r="Cliente"><a href="#cliente-${esc(i.id)}"><b>${esc(i.nome)}</b></a><br><span class="dica">${r.plano ? `${num(r.plano.creditos)} créditos · ${usd(r.plano.precoUsd)}/mês` : 'sem plano'}</span></td>
    <td data-r="Situação"><span class="selo ${cls}">${fase}</span>${r.alertas.length ? ` <span class="dica">${r.alertas.length} ${r.alertas.length === 1 ? 'alerta' : 'alertas'}</span>` : ''}</td>
    <td class="num" data-r="Créditos usados">${s ? `${num(s.usados)} <span class="dica">${s.percentual}%</span>` : '–'}</td>
    <td class="num" data-r="Reserva">${s ? `${num(s.naReserva)} de ${num(s.reserva)}` : '–'}</td>
    <td class="num" data-r="Pacote disponível">${s ? num(s.pacoteDisponivel) : '–'}</td>
    <td class="num" data-r="Custo real">${usd(f.custoComTaxa + f.custoInfraUsd)}</td>
    <td class="num" data-r="Receita">${usd(f.receita)}</td>
    <td class="num" data-r="Margem">${usd(f.margem)}${f.margemPct !== null ? ` <span class="dica">${f.margemPct}%</span>` : ''}</td></tr>`;
}

function detalhe(i) {
  if (!i.ok) return '';
  const r = i.resumo, s = r.situacao, f = r.financeiro, pad = dados.pacotePadrao;
  const hoje = new Date().toISOString().slice(0, 10);
  return `<details class="cliente" id="cliente-${esc(i.id)}"><summary><b>${esc(i.nome)}</b>
      ${r.alertas.map(a => `<span class="selo ${a.nivel === 'erro' ? 'selo-vermelho' : 'selo-ambar'}">${esc(a.texto)}</span>`).join('')}
      <span class="dica">${r.status.ia ? 'IA ligada' : 'IA desligada'} · ${num(r.status.usaramNoMes)} de ${num(r.status.pessoasAtivas)} pessoas usaram no mês</span></summary>
    <div class="dentro">
      ${s ? `<div class="barra ${s.percentual >= 100 ? 'erro' : s.percentual >= 80 ? 'atencao' : ''}" role="progressbar" aria-label="Créditos do plano usados" aria-valuenow="${s.percentual}" aria-valuemin="0" aria-valuemax="100"><span style="width:${s.percentual}%"></span></div>
        <p class="dica">Renova em ${data(s.renova)}. ${num(r.status.conversasNoMes)} conversas no mês. Último uso: ${data(r.status.ultimoUso)}.</p>` : ''}
      <h3>Financeiro do mês</h3>
      <div class="indicadores">
        <div class="indicador"><span>Custo de IA</span><b>${usd(f.custoIa)}</b><small>${usd(f.custoComTaxa)} com taxa</small></div>
        <div class="indicador"><span>Servidor</span><b>${usd(f.custoInfraUsd)}</b></div>
        <div class="indicador"><span>Receita</span><b>${usd(f.receita)}</b><small>${f.receitaPacotes ? `${usd(f.receitaPacotes)} de pacotes` : 'plano'}</small></div>
        <div class="indicador"><span>Margem</span><b>${usd(f.margem)}</b><small>${f.margemPct !== null ? `${f.margemPct}%` : ''}</small></div>
      </div>
      <h3>Classes e modelos</h3>
      <div class="tabela-rolagem"><table class="tabela tabela-empilha"><thead><tr><th>Classe</th><th>Modelo</th><th>Preço por milhão (entrada / saída)</th><th>Homologado</th></tr></thead><tbody>
        ${Object.entries(r.classes).map(([k, m]) => `<tr><td data-r="Classe">${CLASSE[k]}</td><td data-r="Modelo">${m ? `${esc(m.nome)} <span class="dica">${esc(m.id)}</span>` : '<span class="dica">sem padrão</span>'}</td>
          <td data-r="Preço">${preco(m)}</td><td data-r="Homologado">${m?.homologado ? 'Sim' : 'Não'}</td></tr>`).join('')}</tbody></table></div>
      <h3>Variações de preço</h3>
      ${r.variacoes.length ? `<div class="tabela-rolagem"><table class="tabela tabela-empilha"><thead><tr><th>Quando</th><th>Modelo</th><th>Entrada</th><th>Saída</th></tr></thead><tbody>
        ${r.variacoes.map(v => `<tr><td data-r="Quando">${data(v.em)}</td><td data-r="Modelo">${esc(v.modelo)} <span class="dica">${CLASSE[v.classe] || ''}</span></td>
          <td data-r="Entrada">${usd(v.entrada?.[0])} → ${usd(v.entrada?.[1])}</td><td data-r="Saída">${usd(v.saida?.[0])} → ${usd(v.saida?.[1])}</td></tr>`).join('')}</tbody></table></div>` : '<p class="dica">Nenhuma variação acima de 20% registrada.</p>'}
      <h3>Pacotes</h3>
      ${r.pacotes.length ? `<div class="tabela-rolagem"><table class="tabela tabela-empilha"><thead><tr><th>Data</th><th class="num">Créditos</th><th>Operador</th><th>Validade</th><th>Origem</th><th>Observação</th></tr></thead><tbody>
        ${r.pacotes.map(p => `<tr><td data-r="Data">${data(p.em)}</td><td class="num" data-r="Créditos">${num(p.creditos)}</td><td data-r="Operador">${esc(p.operador || '–')}</td>
          <td data-r="Validade">${p.validade ? data(p.validade) : 'sem validade'}</td><td data-r="Origem">${ORIGEM[p.origem] || esc(p.origem)}</td><td data-r="Observação">${esc(p.observacao) || '–'}</td></tr>`).join('')}</tbody></table></div>` : '<p class="dica">Nenhum pacote liberado.</p>'}
      ${r.plano ? `<form data-pacote="${esc(i.id)}" class="filtros" style="margin-top:14px;align-items:flex-end">
        <div class="campo"><label for="q-${esc(i.id)}">Créditos</label><input class="entrada" id="q-${esc(i.id)}" name="creditos" type="number" min="1" step="1" required value="${pad?.creditos || 10000}"></div>
        <div class="campo"><label for="v-${esc(i.id)}">Validade (opcional)</label><input class="entrada" id="v-${esc(i.id)}" name="validade" type="date" min="${hoje}"></div>
        <div class="campo" style="flex:1;min-width:200px"><label for="o-${esc(i.id)}">Observação</label><input class="entrada" id="o-${esc(i.id)}" name="observacao" maxlength="300" placeholder="Pedido, número da fatura…"></div>
        <button class="btn btn-verde">Liberar pacote</button></form>
        ${pad ? `<p class="dica">Preço de referência: ${num(pad.creditos)} créditos por ${usd(pad.precoUsd)}.</p>` : ''}` : ''}
    </div></details>`;
}

async function liberar(ev) {
  ev.preventDefault();
  const f = ev.target, id = f.dataset.pacote;
  const inst = dados.instancias.find(i => i.id === id);
  const corpo = { creditos: Number(f.creditos.value), validade: f.validade.value || null, observacao: f.observacao.value };
  if (!confirm(`Liberar ${num(corpo.creditos)} créditos para ${inst.nome}? Os admins do cliente recebem um email.`)) return;
  const botao = f.querySelector('button');
  botao.disabled = true;
  try {
    await api(`/api/operador/instancias/${encodeURIComponent(id)}/pacotes`, { metodo: 'POST', corpo });
    toast(`Pacote liberado para ${inst.nome}.`);
    await carregar();
    document.getElementById(`cliente-${id}`)?.setAttribute('open', '');
  } catch (e) { toast(e.message, 6000); botao.disabled = false; }
}

async function iniciar() {
  $('marca').innerHTML = marcaHtml();
  const eu = await api('/api/eu');
  if (!eu.operador) { $('conteudo').innerHTML = '<div class="faixa-aviso erro">Esta página é só para o operador da plataforma.</div><a class="btn btn-linha" href="/app">Voltar ao app</a>'; return; }
  definirCsrf(eu.csrf);
  try { await carregar(); } catch (e) { $('conteudo').innerHTML = `<div class="faixa-aviso erro">${esc(e.message)}</div>`; }
}
iniciar();
