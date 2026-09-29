// Processo de OCR (um por arquivo, criado por ocr.js). Decodifica, reduz e lê as imagens fora do processo do
// servidor: quando a leitura termina (ou é interrompida), o processo acaba e o sistema recupera toda a memória
// dele, o que dentro do servidor não acontecia (o RSS ficava retido depois de PDFs longos). Recebe o arquivo pela
// IPC, nunca por disco; não grava nada e não registra conteúdo. Informa só a própria memória, para a vigilância.
import { createRequire } from 'node:module';
import { prepararImagem, lerPaginas, textoDoPdf } from './ocr-paginas.js';

const CONFIANCA_MINIMA = 30;   // abaixo disso, o que foi "lido" é ruído
const rss = () => Math.round(process.memoryUsage().rss / 1048576);
const enviar = m => { try { process.send?.(m); } catch { /* o servidor já encerrou */ } };
const relogio = setInterval(() => enviar({ t: 'rss', rss: rss() }), 50);

// O tesseract sobe na primeira leitura, depois da decodificação e da redução da primeira imagem: a imagem grande
// e o tesseract não ocupam a memória ao mesmo tempo.
let worker = null;
async function reconhecer(img) {
  if (!worker) {
    const { createWorker } = await import('tesseract.js');
    const por = createRequire(import.meta.url)('@tesseract.js-data/por');
    worker = await createWorker('por', 1, { langPath: por.langPath, gzip: por.gzip, cacheMethod: 'none', logger: () => {}, errorHandler: () => {} });
  }
  const { data } = await worker.recognize(img);
  return data.confidence >= CONFIANCA_MINIMA ? data.text.trim() : '';
}

process.on('message', async m => {
  try {
    if (m?.t === 'imagem') {
      let img = await prepararImagem(Buffer.from(m.img), m.pixelsLeitura);
      m.img = null;
      const texto = await reconhecer(img);
      img = null;
      enviar({ t: 'lido', id: m.id, texto });
    } else if (m?.t === 'pdf') {
      const bytes = Buffer.from(m.pdf);
      m.pdf = null;
      const textos = await lerPaginas(bytes, m.indices, m.pixelsLeitura, reconhecer, i => enviar({ t: 'pagina', id: m.id, i }));
      enviar({ t: 'lido', id: m.id, textos });
    } else if (m?.t === 'texto_pdf') {
      const r = await textoDoPdf(Buffer.from(m.pdf));
      m.pdf = null;
      enviar({ t: 'lido', id: m.id, ...r });
    } else if (m?.t === 'fim') encerrar();
  } catch (e) { enviar({ t: 'falha', id: m?.id, motivo: e?.motivo || 'erro' }); }
});
process.on('disconnect', encerrar);
enviar({ t: 'pronto', rss: rss() });

async function encerrar() {
  clearInterval(relogio);
  await worker?.terminate().catch(() => {});
  process.exit(0);
}
