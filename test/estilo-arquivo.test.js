// Estilo do material enviado (cores de destaque e fontes), lido sem IA: tema do PPTX/DOCX e desenho do PDF.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { estiloDoPdf, estiloDoTema, estiloComoTexto } from '../src/estilo-arquivo.js';
import { pptx, docx } from '../src/escritorio.js';
import { deszipar } from './zip-leitor.js';
import { extrairTexto } from '../src/texto.js';
import { arquivo } from './arquivos.js';

// PDF mínimo com um fluxo de desenho comprimido (faixa vermelha, texto preto, retângulo cinza) e uma fonte embutida.
export function pdfColorido({ cor = '0.784 0.063 0.18', fonte = 'ABCDEF+Montserrat-Bold' } = {}) {
  const desenho = Buffer.from(`q ${cor} rg 0 0 792 60 re f Q q 0.5 0.5 0.5 rg 0 100 50 50 re f Q BT 0 0 0 rg /F1 24 Tf 40 300 Td (Kickoff do projeto) Tj ET q ${cor} rg 0 560 792 52 re f Q`);
  const comp = deflateSync(desenho);
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 792 612] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    Buffer.concat([Buffer.from(`<< /Length ${comp.length} /Filter /FlateDecode >>\nstream\n`), comp, Buffer.from('\nendstream')]),
    `<< /Type /Font /Subtype /Type1 /BaseFont /${fonte} >>`];
  const partes = [Buffer.from('%PDF-1.4\n')], pos = [];
  let tam = partes[0].length;
  objs.forEach((o, i) => { const b = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`), Buffer.isBuffer(o) ? o : Buffer.from(o), Buffer.from('\nendobj\n')]); pos.push(tam); partes.push(b); tam += b.length; });
  partes.push(Buffer.from(`xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${pos.map(p => `${String(p).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${tam}\n%%EOF\n`));
  return Buffer.concat(partes);
}

test('PDF: cor de destaque do desenho (sem preto, cinza nem branco) e fonte sem o prefixo de subconjunto', () => {
  const e = estiloDoPdf(pdfColorido());
  assert.deepEqual(e.cores, ['#C8102E']);
  assert.deepEqual(e.fontes, ['Montserrat']);
  assert.equal(e.serif, false);
  assert.equal(estiloComoTexto(e), '#C8102E');
  assert.equal(estiloDoPdf(pdfColorido({ cor: '0.2 0.2 0.2', fonte: 'Helvetica' })).cores.length, 0);
  assert.equal(estiloDoPdf(pdfColorido({ fonte: 'Georgia-Bold' })).serif, true);
  assert.equal(estiloDoPdf(Buffer.from('%PDF-1.4\n%%EOF')), null);
});

test('PPTX e DOCX: cores de destaque e fontes do tema', () => {
  const t = deszipar(pptx('## A\n- b', { cor: '#C8102E', fonte: 'Georgia' })).get('ppt/theme/theme1.xml');
  const e = estiloDoTema(t);
  assert.equal(e.cores[0], '#C8102E');
  assert.deepEqual(e.fontes, ['Georgia']);
  assert.equal(e.serif, true);
  assert.equal(estiloDoTema(''), null);
});

test('anexo: o estilo vem junto do texto; falha na leitura de estilo não impede o texto', async () => {
  const r = await extrairTexto(arquivo('kickoff.pdf', pdfColorido()));
  assert.match(r.texto, /Kickoff do projeto/);
  assert.deepEqual(r.estilo.cores, ['#C8102E']);
  const p = await extrairTexto(arquivo('deck.pptx', pptx('## Objetivo\n- Reduzir retrabalho', { cor: '#1F4E8C', fonte: 'Montserrat' })));
  assert.equal(p.estilo.cores[0], '#1F4E8C');
  assert.deepEqual(p.estilo.fontes, ['Montserrat']);
  const d = await extrairTexto(arquivo('doc.docx', docx('# Título\n\nTexto.')));
  assert.equal(d.estilo, undefined);   // DOCX sem tema: nada inventado
});
