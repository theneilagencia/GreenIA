// Créditos da empresa para todas as pessoas: percentual do ciclo e renovação (sem valores), como funcionam e o pedido
// de mais créditos (a pessoa avisa o administrador; o administrador pede um Capacity Pack à equipe da plataforma).
import { api, esc, toast } from '/comum.js';
import { fecharComEscape } from '/acessibilidade.js';
import { E } from '/app.js';

const COMO = [
  'Os créditos são da empresa, não de cada pessoa: o plano tem uma quantidade por mês, usada por toda a equipe. Cada resposta consome créditos conforme o tamanho do pedido e o nível de IA.',
  'Ao passar de 80% do plano aparece um aviso. Se os créditos do plano acabarem, entram os créditos adicionais (Capacity Pack), se a empresa tiver. Eles não vencem.',
  'Sem créditos adicionais, as respostas continuam no nível Rápido, dentro de uma reserva, até a renovação. Quando a reserva acaba, novas mensagens pausam até a renovação; o histórico continua disponível.',
  'Para ampliar a capacidade, consulte Planos e capacidade. A contratação exige permissão financeira; os créditos pagos são liberados após a confirmação do Stripe.',
];
const data = iso => String(iso || '').slice(0, 10).split('-').reverse().join('/');
const FASE = { normal: 'Dentro do plano', aviso: 'Acima de 80% do plano', pacote: 'Usando créditos adicionais', reserva: 'Na reserva: só o nível Rápido', esgotado: 'Pausado até a renovação' };

export const rotuloCreditos = p => (p.ilimitado ? 'Créditos da empresa: sem limite' : `Créditos da empresa · ${p.percentual}%`);

export function abrirCreditos(origem) {
  const host = document.getElementById('modal');
  if (!host || host.querySelector('[role="dialog"]')) return;
  const desenhar = () => {
    const p = E.plano || {}, admin = !!E.eu?.admin;
    const barra = p.ilimitado ? '' : `<div class="creditos-barra" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Number(p.percentual) || 0}" aria-label="Créditos do plano usados"><span style="width:${Math.min(100, Number(p.percentual) || 0)}%"></span></div>`;
    const pedido = p.pedido ? `<p class="dica">Pedido enviado em ${esc(data(p.pedido))}. ${admin ? 'A equipe da plataforma foi avisada.' : 'O administrador foi avisado.'}</p>` : '';
    host.innerHTML = `<div class="modal-fundo"><section class="modal creditos-modal" role="dialog" aria-modal="true" aria-labelledby="creditos-titulo" tabindex="-1">
      <div class="modal-topo"><h2 id="creditos-titulo">Créditos da empresa</h2><button class="icone-btn" id="creditos-fechar" aria-label="Fechar">×</button></div>
      ${p.ilimitado ? '<p>O plano da empresa não tem limite de créditos.</p>' : `<p><b>${Number(p.percentual) || 0}%</b> do plano usado neste ciclo · ${esc(FASE[p.fase] || '')} · renova em ${esc(data(p.renova))}</p>${barra}`}
      <p><a class="btn btn-linha" href="/planos.html">Planos e capacidade</a></p><h3>Como funcionam</h3><ul class="creditos-lista">${COMO.map(t => `<li>${esc(t)}</li>`).join('')}</ul>
      ${p.ilimitado ? '' : `${pedido}<div class="creditos-acoes"><button class="btn btn-verde" id="creditos-pedir"${p.pedido ? ' disabled' : ''}>${admin ? 'Solicitar Capacity Pack' : 'Pedir mais créditos ao administrador'}</button>${admin ? '<a class="btn btn-linha" href="#/uso" id="creditos-uso">Ver o uso</a>' : ''}</div>`}
    </section></div>`;
    const fechar = () => { limpar(); host.innerHTML = ''; origem?.focus?.(); };
    const limpar = fecharComEscape(host.querySelector('.modal'), fechar);
    host.querySelector('#creditos-fechar').onclick = fechar;
    const uso = host.querySelector('#creditos-uso'); if (uso) uso.onclick = fechar;
    const b = host.querySelector('#creditos-pedir');
    if (b) b.onclick = async () => {
      b.disabled = true;
      try { const r = await api('/api/plano/pedido', { metodo: 'POST', corpo: {} }); E.plano = r.plano; toast(admin ? 'Pedido de Capacity Pack enviado à equipe da plataforma.' : 'Pedido enviado ao administrador.'); limpar(); desenhar(); }
      catch (e) { b.disabled = false; toast(`Não foi possível enviar o pedido. ${e.message}`, 6000); }
    };
    host.querySelector('#creditos-fechar').focus();
  };
  desenhar();
}
