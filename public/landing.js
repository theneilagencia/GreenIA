// Página inicial da instalação: nome, logo e cor da empresa.
import { preencherMarca } from '/comum.js';
const p = await preencherMarca();
if (p.empresa) document.title = `GreenIA · ${p.empresa}`;
