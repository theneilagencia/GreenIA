// Página da política: texto da empresa e seção automática sobre dados sigilosos.
import { api, esc, preencherMarca } from '/comum.js';
import { renderizar } from '/md.js';

preencherMarca();
const p = await api('/api/politica');
document.getElementById('versao').textContent = `Versão ${p.versao}, de ${new Date(p.atualizada_em).toLocaleDateString('pt-BR')}.`;
document.getElementById('texto').innerHTML = renderizar(p.texto).html + '<hr style="border:none;border-top:1px solid var(--line);margin:32px 0">' + renderizar(p.secao).html;
document.title = `Política de Uso de IA · ${esc(p.versao)} · GreenIA`;
