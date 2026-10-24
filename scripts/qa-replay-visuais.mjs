// Recompõe somente os dados sintéticos preservados, sem IA, rede ou banco real.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { montar } from '../src/visual/motor.js';
import { pngDaPagina } from '../src/visual/raster.js';
import { inspecionarImagem, paraDataUrl } from '../src/visual/assets.js';
const [entrada, saida] = process.argv.slice(2);
if (!entrada || !saida) throw new Error('Informe a pasta rodada preservada e uma nova pasta de saída');
const raiz = resolve(entrada), destino = resolve(saida);
mkdirSync(destino, { recursive: false });
const hash = b => createHash('sha256').update(b).digest('hex');
const relatorioBytes = readFileSync(join(raiz, 'relatorio.json'));
const r = JSON.parse(relatorioBytes), auditoria = [];
for (const grupo of r.artefatosPreservados || []) {
  const ativos = new Map();
  for (const arquivo of grupo.arquivos) {
    if (!/^artefatos\/[a-zA-Z0-9._-]+$/.test(arquivo.arquivo)) throw new Error('Caminho inválido no manifesto');
    const bytes = readFileSync(join(raiz, arquivo.arquivo));
    if (bytes.length !== arquivo.bytes || hash(bytes) !== arquivo.sha256) throw new Error('Arquivo divergente');
    ativos.set(arquivo.id + ':' + arquivo.origem, bytes);
  }
  for (const arquivo of grupo.arquivos.filter(a => a.origem === 'artefatos_visuais')) {
    const a = JSON.parse(ativos.get(arquivo.id + ':' + arquivo.origem));
    const opcoes = JSON.parse(a.opcoes), assets = {};
    for (const [nome, id] of Object.entries(opcoes.assets || {})) {
      const bytes = ativos.get(id + ':visual_assets');
      if (!bytes) throw new Error('Asset ausente');
      const info = inspecionarImagem(bytes);
      assets[nome] = { id, dataUrl: paraDataUrl(info.mime, bytes), w: info.w, h: info.h };
    }
    const x = montar({ plano: JSON.parse(a.plano), conteudo: JSON.parse(a.conteudo), identidade: JSON.parse(a.identidade), opcoes, assets });
    for (const [i, pagina] of x.paginas.entries()) {
      const bytes = pngDaPagina(pagina).bytes;
      const nome = `visual-${a.id}-p${i + 1}.png`;
      writeFileSync(join(destino, nome), bytes);
      auditoria.push({ nome, sha256: hash(bytes), origem: arquivo.sha256, textos: pagina.prims.filter(p => p.t === 'text').flatMap(p => p.linhas) });
    }
  }
}
writeFileSync(join(destino, 'replay.json'), JSON.stringify({ relatorioSha256: hash(relatorioBytes), novasInferencias: 0, arquivos: auditoria, inspecaoVisual: 'pendente', liberacaoProducao: false }, null, 2));
console.log(JSON.stringify({ paginas: auditoria.length, novasInferencias: 0, pasta: destino }));
