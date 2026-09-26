// Página de entrada da instalação: nome, logo, cor, aviso de privacidade e retenção da empresa.
import { preencherMarca, logoEmpresa } from '/comum.js';

const topo = document.getElementById('topo');
const marcarTopo = () => topo.classList.toggle('rolou', scrollY > 8);
addEventListener('scroll', marcarTopo, { passive: true });
marcarTopo();

const p = await preencherMarca();
if (p.empresa) document.title = `${p.empresa} · GreenIA`;
// Com logo, o logo substitui o nome no topo.
if (p.logo) {
  document.getElementById('p-logo').innerHTML = logoEmpresa(p);
  document.querySelector('#p-marca .p-nome').classList.add('oculto');
}
const dias = Number(p.retencaoDias);
if (dias > 0) document.getElementById('p-retencao').textContent = `Conversas sem uso são apagadas depois de ${dias.toLocaleString('pt-BR')} ${dias === 1 ? 'dia' : 'dias'}.`;
