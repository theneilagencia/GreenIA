// Página da política: texto da empresa e seção automática sobre dados sigilosos.
import { api, preencherMarca } from '/comum.js';
import { renderizar } from '/md.js';

const marca = await preencherMarca();
const p = await api('/api/politica');
document.getElementById('versao').textContent = `Versão ${p.versao}, de ${new Date(p.atualizada_em).toLocaleDateString('pt-BR')}.`;
document.getElementById('texto').innerHTML = renderizar(p.texto).html + '<hr style="border:none;border-top:1px solid var(--line);margin:32px 0">' + renderizar(p.secao).html;
// O renderizador do chat transforma "##" em h3 e "###" em h4; na página, abaixo do h1, as seções são h2 e as
// subseções h3 (sem pular nível).
for (const h of document.querySelectorAll('#texto h3, #texto h4')) {
  const novo = document.createElement(h.tagName === 'H3' ? 'h2' : 'h3');
  novo.innerHTML = h.innerHTML;
  h.replaceWith(novo);
}
// Título da aba: documento e marca (a versão já aparece na página; "· 1 ·" no título não dizia nada).
const dono = marca.multiempresa ? marca.empresa : 'GreenIA';
document.title = dono ? `Política de Uso de IA · ${dono}` : 'Política de Uso de IA';
