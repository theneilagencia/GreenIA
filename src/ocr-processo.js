// Processo de OCR (um por arquivo, criado por ocr.js). Decodifica, reduz e lê as imagens fora do processo do
// servidor: quando a leitura termina (ou é interrompida), o processo acaba e o sistema recupera toda a memória
// dele, o que dentro do servidor não acontecia (o RSS ficava retido depois de PDFs longos). Recebe o arquivo pela
// IPC, nunca por disco; não grava nada e não registra conteúdo. Informa só a própria memória, para a vigilância.
import { createRequire } from 'node:module';
import { prepararComPixels, pixelsParaLeitura, lerPaginas, textoDoPdf } from './ocr-paginas.js';
import { avaliarLeitura, girar, pngDePixels, reduzirParaLeitura } from './ocr.js';

const PIXELS_SONDA = 1_000_000;   // resolução da procura de orientação (acha a orientação certa em todos os casos medidos)
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

// Uma imagem: a leitura normal (a mesma de antes). Se sair ilegível, procura uma leitura legível numa versão reduzida
// da imagem (a sonda, rápida): em cinza sem girar (o tesseract converte mal algumas imagens coloridas, como texto
// claro sobre fundo colorido numa placa) e girada em 90°, 270° e 180° (texto de lado, como numa foto de celular).
// A orientação vencedora é lida de novo em resolução cheia, se couber no orçamento de tempo. Nada legível: vazio (a
// pessoa recebe a mensagem técnica e nada vai para a IA). `cinza()` só decodifica quando precisa. `jaCinza`: a
// primeira leitura já foi da imagem em cinza (imagem reduzida ou página de PDF).
// Medido: uma leitura de ruído (a 0° de uma página de lado) é lenta, a do texto na orientação certa é rápida; na
// sonda, a página A4 de lado leva 3–7 s por orientação, contra 5–20 s em resolução cheia.
async function lerLegivel(png, cinza, orcamentoMs, jaCinza) {
  const inicio = Date.now();
  const primeira = await reconhecer(png);
  if (primeira.legivel) return primeira.texto;
  const pixels = cinza ? await cinza() : null;
  if (!pixels) return '';
  const sonda = pixels.width * pixels.height > PIXELS_SONDA ? reduzirParaLeitura(pixels, PIXELS_SONDA) : pixels;
  const tentativas = jaCinza || pixels.cinzaNaOrigem ? [90, 270, 180] : [0, 90, 270, 180];
  let melhor = null, maisLonga = 0;
  for (const graus of tentativas) {
    if (Date.now() - inicio + maisLonga > orcamentoMs) break;   // só começa se couber no orçamento
    if (graus === 180 && melhor) break;   // 180° só se as anteriores não deram nada legível
    const t0 = Date.now();
    const r = await reconhecer(pngDePixels(girar(sonda, graus)));
    const ms = Date.now() - t0;
    maisLonga = Math.max(maisLonga, ms);
    if (r.legivel && (!melhor || r.nota > melhor.nota)) melhor = { ...r, graus, ms };
    if (melhor && melhor.nota >= NOTA_BOA) break;   // leitura boa (texto real fica perto de 90): não tenta as outras
  }
  if (!melhor) return '';
  if (sonda === pixels) return melhor.texto;   // imagem pequena: a sonda já foi em resolução cheia
  // Resolução cheia na orientação vencedora (leva cerca de 2 vezes a sonda); sem tempo, fica o texto da sonda.
  if (Date.now() - inicio + 3 * melhor.ms > orcamentoMs) return melhor.texto;
  const cheia = await reconhecer(pngDePixels(girar(pixels, melhor.graus)));
  return cheia.legivel ? cheia.texto : melhor.texto;
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
      const texto = await lerLegivel(png, () => cinza || pixelsParaLeitura(original, m.pixelsLeitura), orcamento, !!cinza);
      enviar({ t: 'lido', id: m.id, texto });
    } else if (m?.t === 'pdf') {
      const bytes = Buffer.from(m.pdf);
      m.pdf = null;
      const ler = (png, cinza) => lerLegivel(png, m.girar ? () => cinza : null, orcamento, true);   // a página já é lida em cinza
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
