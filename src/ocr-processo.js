// Processo de OCR (um por arquivo, criado por ocr.js). Decodifica, reduz e lê as imagens fora do processo do
// servidor: quando a leitura termina (ou é interrompida), o processo acaba e o sistema recupera toda a memória
// dele, o que dentro do servidor não acontecia (o RSS ficava retido depois de PDFs longos). Recebe o arquivo pela
// IPC, nunca por disco; não grava nada e não registra conteúdo. Informa só a própria memória, para a vigilância.
import { createRequire } from 'node:module';
import { prepararComPixels, pixelsParaLeitura, lerPaginas, textoDoPdf } from './ocr-paginas.js';
import { avaliarLeitura, girar, pngDePixels } from './ocr.js';

const NOTA_BOA = 75;   // confiança da página × fração confiável; texto real medido fica entre 84 e 95
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
  const { data } = await worker.recognize(img, {}, { text: true, blocks: true });
  return { texto: data.text.trim(), ...avaliarLeitura(data) };
}

// Uma imagem: a leitura normal; se sair ilegível (ruído, ou texto de lado, como numa foto de celular), a imagem
// girada em 90°, 270° e 180°, dentro do orçamento de tempo, ficando com a leitura mais legível. Nada legível: vazio
// (a pessoa recebe a mensagem técnica e nada vai para a IA). `cinza()` só decodifica quando precisa girar.
async function lerLegivel(png, cinza, orcamentoMs) {
  const inicio = Date.now();
  const primeira = await reconhecer(png);
  if (primeira.legivel) return primeira.texto;
  const pixels = cinza ? await cinza() : null;
  if (!pixels) return '';
  let melhor = null;
  for (const graus of [90, 270, 180]) {
    if (Date.now() - inicio > orcamentoMs) break;
    if (graus === 180 && melhor) break;   // 180° só se 90° e 270° não deram nada legível
    const r = await reconhecer(pngDePixels(girar(pixels, graus)));
    if (r.legivel && (!melhor || r.nota > melhor.nota)) melhor = r;
    if (melhor && melhor.nota >= NOTA_BOA) break;   // leitura boa (texto real fica perto de 90): não tenta as outras
  }
  return melhor ? melhor.texto : '';
}

process.on('message', async m => {
  try {
    const orcamento = Number(m?.orcamentoMs) || 30_000;
    if (m?.t === 'imagem') {
      let original = Buffer.from(m.img);
      m.img = null;
      // Imagem reduzida: os pixels em cinza já existem. Imagem pequena (até a resolução de leitura): decodificada só
      // se precisar girar, e barata. A imagem grande nunca é decodificada duas vezes.
      const { png, cinza } = await prepararComPixels(original, m.pixelsLeitura);
      if (cinza) original = null;
      const texto = await lerLegivel(png, () => cinza || pixelsParaLeitura(original, m.pixelsLeitura), orcamento);
      enviar({ t: 'lido', id: m.id, texto });
    } else if (m?.t === 'pdf') {
      const bytes = Buffer.from(m.pdf);
      m.pdf = null;
      const ler = (png, cinza) => lerLegivel(png, m.girar ? () => cinza : null, orcamento);
      const textos = await lerPaginas(bytes, m.indices, m.pixelsLeitura, ler, i => enviar({ t: 'pagina', id: m.id, i }));
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
