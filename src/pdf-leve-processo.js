// Processo filho da cópia leve do PDF (pdf-leve.js): a redução das fotos grandes usa memória fora do processo
// principal. Se o vigia de memória precisar encerrar este filho, o servidor continua de pé.
import sharp from 'sharp';
import { pdfLeve } from './pdf-leve.js';
sharp.concurrency(1); sharp.cache(false);
process.on('message', async ({ pdf }) => {
  try { const r = await pdfLeve(Buffer.from(pdf)); process.send({ ok: true, pdf: r.pdf, trocas: r.trocas }); }
  catch (e) { process.send({ ok: false, erro: String(e?.message || e) }); }
});
