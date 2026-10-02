// Navegador de composição (Chromium sem interface) para o design feito pela IA. Isolado de propósito:
//   - JavaScript da página DESLIGADO (o HTML da IA nunca executa nada);
//   - rede BLOQUEADA: só responde a origem virtual da própria GreenIA (fontes empacotadas e assets da peça);
//     qualquer outro pedido (http, https, file, outro host) é abortado;
//   - um trabalho por vez (fila) e o navegador é fechado ao fim de cada trabalho (memória volta ao sistema);
//   - sem memória livre suficiente ou sem Chromium instalado: "indisponível" (a produção usa o motor clássico).
import { existsSync, readFileSync } from 'node:fs';
import { freemem } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FAMILIAS } from './fontes.js';

export const ORIGEM = 'https://design.greenia.local';
const PASTA_FONTES = join(dirname(fileURLToPath(import.meta.url)), 'fontes');
const CAMINHOS = [process.env.CHROMIUM_PATH, '/usr/bin/chromium', '/usr/bin/chromium-browser', '/opt/pw-browsers/chromium'].filter(Boolean);
const MEMORIA_MIN_MB = Number(process.env.DESIGN_MEMORIA_MIN_MB || 160);

// Memória livre de verdade: no contêiner vale o limite do cgroup (o os.freemem() enxerga a máquina inteira).
export function memoriaLivreMb() {
  try {
    const max = readFileSync('/sys/fs/cgroup/memory.max', 'utf8').trim(), atual = Number(readFileSync('/sys/fs/cgroup/memory.current', 'utf8').trim());
    if (max !== 'max' && Number(max) > 0) return (Number(max) - atual) / 1048576;
  } catch { /* sem cgroup v2 */ }
  try {
    const max = Number(readFileSync('/sys/fs/cgroup/memory/memory.limit_in_bytes', 'utf8').trim()), atual = Number(readFileSync('/sys/fs/cgroup/memory/memory.usage_in_bytes', 'utf8').trim());
    if (max > 0 && max < 2 ** 50) return (max - atual) / 1048576;
  } catch { /* sem cgroup v1 */ }
  return freemem() / 1048576;
}
export class Indisponivel extends Error { constructor(motivo) { super(motivo); this.motivo = motivo; } }

let pw = null;
async function playwright() {
  if (pw === null) { try { pw = (await import('playwright-core')).chromium; } catch { pw = false; } }
  return pw || null;
}
export const caminhoChromium = () => CAMINHOS.find(p => existsSync(p)) || null;
export async function chromiumDisponivel() {
  if (process.env.DESIGN_IA === '0') return { ok: false, motivo: 'desligado' };
  if (!await playwright()) return { ok: false, motivo: 'sem_biblioteca' };
  if (!caminhoChromium()) return { ok: false, motivo: 'sem_chromium' };
  return { ok: true };
}

// @font-face das fontes empacotadas (servidas pela origem virtual).
export function cssFontes() {
  return Object.values(FAMILIAS).flatMap(f => Object.entries(f.pesos).map(([peso, arq]) =>
    `@font-face{font-family:'${f.nome}';font-weight:${peso};font-style:normal;src:url('${ORIGEM}/fontes/${arq}') format('truetype');}`)).join('\n');
}
const FONTES_PERMITIDAS = new Set(Object.values(FAMILIAS).flatMap(f => Object.values(f.pesos)));

let fila = Promise.resolve();
// Executa fn(page) num navegador novo e isolado. assets: Map(nome -> { mime, bytes }).
export function comPagina({ largura, altura, escala = 1, documento, assets = new Map() }, fn) {
  const tarefa = fila.then(async () => {
    const chromium = await playwright();
    const exe = caminhoChromium();
    if (!chromium || !exe) throw new Indisponivel('sem_chromium');
    if (memoriaLivreMb() < MEMORIA_MIN_MB) throw new Indisponivel('memoria');
    const nav = await chromium.launch({ executablePath: exe, timeout: 30_000,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-zygote', '--disable-extensions', '--disable-background-networking', '--disable-sync', '--mute-audio',
        '--disable-features=Translate,MediaRouter,OptimizationHints', '--renderer-process-limit=1', '--js-flags=--max-old-space-size=96'] });
    try {
      const ctx = await nav.newContext({ javaScriptEnabled: false, viewport: { width: Math.round(largura), height: Math.round(altura) }, deviceScaleFactor: escala,
        acceptDownloads: false, bypassCSP: false, serviceWorkers: 'block' });
      await ctx.route('**/*', rota => {
        const u = rota.request().url();
        if (u === `${ORIGEM}/doc`) return rota.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: documento,
          headers: { 'content-security-policy': `default-src 'none'; style-src 'unsafe-inline'; font-src ${ORIGEM}; img-src ${ORIGEM} data:` } });
        if (u.startsWith(`${ORIGEM}/fontes/`)) {
          const arq = u.slice(`${ORIGEM}/fontes/`.length);
          if (FONTES_PERMITIDAS.has(arq)) return rota.fulfill({ status: 200, contentType: 'font/ttf', body: readFileSync(join(PASTA_FONTES, arq)) });
        }
        if (u.startsWith(`${ORIGEM}/assets/`)) {
          const a = assets.get(decodeURIComponent(u.slice(`${ORIGEM}/assets/`.length)));
          if (a) return rota.fulfill({ status: 200, contentType: a.mime, body: Buffer.from(a.bytes) });
        }
        return rota.abort('blockedbyclient');
      });
      const page = await ctx.newPage();
      page.setDefaultTimeout(30_000);
      await page.goto(`${ORIGEM}/doc`, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready.then(() => true));
      return await fn(page);
    } finally { await nav.close().catch(() => {}); }
  });
  fila = tarefa.catch(() => {});
  return tarefa;
}
