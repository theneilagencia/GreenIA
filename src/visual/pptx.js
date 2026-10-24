// Usa o PDF renderizado pelo mesmo design aprovado. O leitor recupera formas,
// imagens e caixas de texto nativas; nenhuma IA nem template genérico na exportação.
import { lerModeloPdf } from '../modelo-pdf.js';
import { pptxDeModelo } from '../escritorio.js';
import { previaDoPptx } from '../previa-pptx.js';
import { montar } from './motor.js';
import { pdfDasPaginas } from './pdf.js';

export async function pptxDoDesign(artefato, { titulo = 'Apresentação', agora } = {}) {
  const design = artefato?.plano?.motor === 'design';
  let pdf = design ? artefato.render?.pdf : null;
  if (!design && artefato?.tipo === 'presentation' && ['aprovado', 'corrigido'].includes(artefato.status)) {
    // O motor clássico também tem composição validada. Exportar o mesmo PDF
    // preserva suas páginas; reconverter o Markdown criava outra apresentação.
    const composto = montar({ plano: artefato.plano, conteudo: artefato.conteudo,
      identidade: artefato.identidade, assets: artefato.assets, opcoes: artefato.opcoes });
    if (composto.paginas.length !== artefato.paginas) throw new Error('Composição incompleta.');
    pdf = pdfDasPaginas(composto.paginas);
  }
  if (!pdf) throw new Error('Design validado indisponível.');
  const paginas = await lerModeloPdf(pdf);
  if (paginas.length !== artefato.paginas || !paginas.length) throw new Error('Exportação incompleta.');
  const dados = pptxDeModelo(paginas, { titulo, agora });
  const previa = previaDoPptx(dados);
  if (previa.slides.length !== paginas.length || previa.slides.some(p => !p.formas.length)) throw new Error('PowerPoint incompleto.');
  return { nome: 'apresentacao-design.pptx', dados, detalhes: { tipo: 'design', motor: design ? 'design' : 'classico', slides: paginas.length, formato: 'pptx', origem: 'design_validado' } };
}
