// Prévia de um PowerPoint gerado pela GreenIA, para ver na conversa antes de baixar (como nos outros assistentes):
// lê o próprio arquivo (slides, posições, textos, fontes, cores, fundos e tabelas) e devolve uma descrição que a
// tela desenha em HTML, na proporção do slide. Lê só os arquivos que a GreenIA gera (escritorio.js).
import { inflateRawSync } from 'node:zlib';

export function lerZipBinario(buf) {
  const fim = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (fim < 0) throw new Error('zip');
  const total = buf.readUInt16LE(fim + 10), out = new Map();
  for (let p = buf.readUInt32LE(fim + 16), k = 0; k < total; k++) {
    const metodo = buf.readUInt16LE(p + 10), comp = buf.readUInt32LE(p + 20), nl = buf.readUInt16LE(p + 28), local = buf.readUInt32LE(p + 42);
    const nome = buf.subarray(p + 46, p + 46 + nl).toString('utf8');
    out.set(nome, () => { const ini = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28), d = buf.subarray(ini, ini + comp); return metodo === 8 ? inflateRawSync(d) : Buffer.from(d); });
    p += 46 + nl + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
  }
  return out;
}

const ent = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const num = (re, s, padrao = 0) => { const m = re.exec(s); return m ? Number(m[1]) : padrao; };
const pos = s => ({ x: num(/<a:off x="(-?\d+)"/, s), y: num(/<a:off x="-?\d+" y="(-?\d+)"/, s), w: num(/<a:ext cx="(\d+)"/, s), h: num(/<a:ext cx="\d+" cy="(\d+)"/, s) });
const cor = s => /<a:srgbClr val="([0-9A-Fa-f]{6})"/.exec(s)?.[1] || null;

function paragrafos(corpo, temaFonte) {
  return [...corpo.matchAll(/<a:p>([\s\S]*?)<\/a:p>/g)].map(([, p]) => {
    const ppr = /<a:pPr[^>]*?(?:\/>|>[\s\S]*?<\/a:pPr>)/.exec(p)?.[0] || '';
    const runs = [...p.matchAll(/<a:r>([\s\S]*?)<\/a:r>/g)].map(([, r]) => {
      const rpr = /<a:rPr[^>]*?(?:\/>|>[\s\S]*?<\/a:rPr>)/.exec(r)?.[0] || '';
      const fonte = /<a:latin typeface="([^"]+)"/.exec(rpr)?.[1];
      return { t: ent(/<a:t>([\s\S]*?)<\/a:t>/.exec(r)?.[1] || ''), sz: num(/ sz="(\d+)"/, rpr, 1800) / 100, b: / b="1"/.test(rpr), i: / i="1"/.test(rpr),
        spc: num(/ spc="(-?\d+)"/, rpr) / 100, cor: cor(rpr) || '000000', fonte: !fonte || fonte.startsWith('+') ? temaFonte : ent(fonte) };
    });
    return { runs, marcador: /<a:buChar char="([^"]+)"/.exec(ppr)?.[1] || null, entrelinha: num(/<a:spcPts val="(\d+)"\/><\/a:lnSpc>/, ppr) / 100 || null,
      antes: num(/<a:spcBef><a:spcPts val="(\d+)"/, ppr) / 100, recuo: num(/ marL="(\d+)"/, ppr), alinhamento: /algn="(\w+)"/.exec(ppr)?.[1] || 'l' };
  });
}

export function previaDoPptx(buf) {
  const z = lerZipBinario(buf);
  const ler = n => z.get(n)?.().toString('utf8') || '';
  const apr = ler('ppt/presentation.xml');
  const W = num(/<p:sldSz cx="(\d+)"/, apr, 12192000), H = num(/<p:sldSz cx="\d+" cy="(\d+)"/, apr, 6858000);
  const temaFonte = /<a:minorFont><a:latin typeface="([^"]+)"/.exec(ler('ppt/theme/theme1.xml'))?.[1] || 'Calibri';
  const rels = ler('ppt/_rels/presentation.xml.rels');
  const ids = [...apr.matchAll(/<p:sldId [^>]*r:id="(rId\d+)"/g)].map(m => new RegExp(`Id="${m[1]}"[^>]*Target="([^"]+)"`).exec(rels)?.[1] || new RegExp(`Target="([^"]+)"[^>]*Id="${m[1]}"`).exec(rels)?.[1]);
  const slides = ids.map(alvo => {
    const nome = `ppt/${alvo}`, xml = ler(nome);
    const srels = ler(nome.replace(/slides\/(slide\d+\.xml)$/, 'slides/_rels/$1.rels'));
    const formas = [];
    for (const m of xml.matchAll(/<p:(sp|pic|graphicFrame)>([\s\S]*?)<\/p:\1>/g)) {
      const [, tipo, s] = m;
      if (tipo === 'pic') {
        const rid = /r:embed="(rId\d+)"/.exec(s)?.[1], alvoImg = rid && new RegExp(`Id="${rid}"[^>]*Target="\\.\\./([^"]+)"`).exec(srels)?.[1];
        if (alvoImg) formas.push({ tipo: 'imagem', ...pos(s), midia: alvoImg.replace(/^media\//, '') });
      } else if (tipo === 'graphicFrame') {
        const linhas = [...s.matchAll(/<a:tr [^>]*>([\s\S]*?)<\/a:tr>/g)].map(([, tr]) => [...tr.matchAll(/<a:tc>([\s\S]*?)<\/a:tc>/g)].map(([, tc]) => ({
          texto: [...tc.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map(x => ent(x[1])).join(''), b: / b="1"/.test(tc), fundo: /<a:tcPr[\s\S]*<a:solidFill><a:srgbClr val="([0-9A-Fa-f]{6})"/.exec(tc)?.[1] || null, sz: num(/ sz="(\d+)"/, tc, 1400) / 100 })));
        formas.push({ tipo: 'tabela', x: num(/<a:off x="(\d+)"/, s), y: num(/<a:off x="\d+" y="(\d+)"/, s), w: num(/<a:ext cx="(\d+)"/, s), h: num(/<a:ext cx="\d+" cy="(\d+)"/, s), linhas, cor: '1F2A24' });
      } else if (/<p:txBody>/.test(s)) {
        formas.push({ tipo: 'texto', ...pos(s), quebra: !/wrap="none"/.test(s), ancora: /anchor="(\w)"/.exec(s)?.[1] || 't', paragrafos: paragrafos(/<p:txBody>([\s\S]*?)<\/p:txBody>/.exec(s)[1], temaFonte) });
      } else if (/<a:custGeom>/.test(s)) {
        // Forma livre (linha, ícone, faixa com curva): o caminho vira SVG na prévia.
        const caminho = /<a:path w="(\d+)" h="(\d+)"( fill="none")?>([\s\S]*?)<\/a:path>/.exec(s);
        if (caminho) {
          const pts = t => [...t.matchAll(/<a:pt x="(-?\d+)" y="(-?\d+)"\/>/g)].map(m => `${m[1]} ${m[2]}`).join(' ');
          const d = [...caminho[4].matchAll(/<a:(moveTo|lnTo|cubicBezTo|quadBezTo|close)\/?>([\s\S]*?)(?:<\/a:\1>|(?=<a:)|$)/g)].map(([, k, c]) => ({ moveTo: 'M', lnTo: 'L', cubicBezTo: 'C', quadBezTo: 'Q', close: 'Z' }[k] + (k === 'close' ? '' : ` ${pts(c)}`))).join(' ');
          const spPr = /<p:spPr>([\s\S]*?)<\/p:spPr>/.exec(s)?.[1] || '';
          const ln = /<a:ln[^>]*>([\s\S]*?)<\/a:ln>/.exec(spPr);
          const fill = caminho[3] ? null : /^[\s\S]*?<\/a:custGeom><a:solidFill><a:srgbClr val="([0-9A-Fa-f]{6})"/.exec(spPr)?.[1] || null;
          const traco = ln && /<a:solidFill><a:srgbClr val="([0-9A-Fa-f]{6})"/.exec(ln[1])?.[1];
          const alfa = (num(/<a:alpha val="(\d+)"/, spPr, 100000)) / 100000;
          formas.push({ tipo: 'caminho', ...pos(s), vw: Number(caminho[1]), vh: Number(caminho[2]), d, cor: fill, traco: traco || null, alfa });
        }
      } else {
        const fill = /<p:spPr>[\s\S]*?<a:solidFill><a:srgbClr val="([0-9A-Fa-f]{6})"/.exec(s)?.[1];
        if (fill) formas.push({ tipo: 'retangulo', ...pos(s), cor: fill });
      }
    }
    return { fundo: /<p:bg>[\s\S]*?<a:srgbClr val="([0-9A-Fa-f]{6})"/.exec(xml)?.[1] || 'FFFFFF', formas };
  });
  return { w: W, h: H, slides };
}

// Imagem de um slide (fundo) dentro do arquivo, pelo nome em ppt/media.
export function midiaDoPptx(buf, nome) {
  if (!/^[\w.-]+\.(jpg|jpeg|png)$/i.test(nome)) return null;
  const f = lerZipBinario(buf).get(`ppt/media/${nome}`);
  return f ? f() : null;
}
