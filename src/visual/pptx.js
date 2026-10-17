// Usa o PDF renderizado pelo mesmo design aprovado. O leitor recupera formas,
// imagens e caixas de texto nativas; nenhuma IA nem template genérico na exportação.
import { lerModeloPdf } from '../modelo-pdf.js';
import { pptxDeModelo } from '../escritorio.js';
import { previaDoPptx } from '../previa-pptx.js';

export async function pptxDoDesign(artefato, { titulo = 'Apresentação', agora } = {}) {
  if (artefato?.plano?.motor !== 'design' || !artefato.render?.pdf) throw new Error('Design validado indisponível.');
  const paginas = await lerModeloPdf(artefato.render.pdf);
  if (paginas.length !== artefato.paginas || !paginas.length) throw new Error('Exportação incompleta.');
  const dados = pptxDeModelo(paginas, { titulo, agora });
  const previa = previaDoPptx(dados);
  if (previa.slides.length !== paginas.length || previa.slides.some(p => !p.formas.length)) throw new Error('PowerPoint incompleto.');
  return { nome: 'apresentacao-design.pptx', dados, detalhes: { tipo: 'design', motor: 'design', slides: paginas.length, formato: 'pptx', origem: 'design_validado' } };
}
