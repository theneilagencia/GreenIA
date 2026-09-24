// Entrega do frontend pelo próprio servidor (mesma origem da API: sem CORS).
// Só uma lista fechada de arquivos. O HTML recebe, antes do support.js:
//  - /greenia-config.js, que liga o modo backend (window.__GREENIA__);
//  - o React 18.3.1 do pacote npm (o support.js só busca no unpkg se window.React
//    não existir), então produção não depende de CDN.
import { readFileSync, existsSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance, FastifyReply } from 'fastify';

const require = createRequire(import.meta.url);
// Raiz do frontend: a raiz do repositório (ou FRONTEND_DIR, no contêiner).
const ROOT = process.env.FRONTEND_DIR || fileURLToPath(new URL('../../../', import.meta.url));

const PAGES = new Set(['GreenIA.dc.html', 'Política GreenIA.dc.html']);
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.svg': 'image/svg+xml',
};

const VENDOR: Record<string, string> = {
  'react.production.min.js': join(dirname(require.resolve('react/package.json')), 'umd/react.production.min.js'),
  'react-dom.production.min.js': join(dirname(require.resolve('react-dom/package.json')), 'umd/react-dom.production.min.js'),
};

// O runtime do .dc.html avalia a lógica do componente com `new Function`, por
// isso 'unsafe-eval'; os estilos são inline, por isso 'unsafe-inline' em style-src.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com',
  "img-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const INJECT = '<script src="/greenia-config.js"></script><script src="/vendor/react.production.min.js"></script><script src="/vendor/react-dom.production.min.js"></script><script src="./support.js"></script>';

function secure(reply: FastifyReply, https: boolean) {
  reply.header('x-content-type-options', 'nosniff');
  reply.header('referrer-policy', 'same-origin');
  reply.header('x-frame-options', 'DENY');
  if (https) reply.header('strict-transport-security', 'max-age=31536000; includeSubDomains');
}

export async function staticRoutes(app: FastifyInstance) {
  const https = new URL(app.deps.config.PUBLIC_URL).protocol === 'https:';
  const cache = new Map<string, Buffer>();
  const read = (file: string) => {
    if (app.deps.config.NODE_ENV === 'production' && cache.has(file)) return cache.get(file)!;
    const b = readFileSync(file);
    cache.set(file, b);
    return b;
  };

  app.get('/', async (_req, reply) => reply.redirect('/GreenIA.dc.html', 302));

  app.get('/greenia-config.js', async (_req, reply) => {
    secure(reply, https);
    return reply.type(TYPES['.js']).header('cache-control', 'no-store').send('window.__GREENIA__ = {"backendUrl":"/"};\n');
  });

  app.get('/vendor/:file', async (req, reply) => {
    const f = VENDOR[(req.params as { file: string }).file];
    if (!f) return reply.code(404).send();
    secure(reply, https);
    return reply.type(TYPES['.js']).header('cache-control', 'public, max-age=31536000, immutable').send(read(f));
  });

  app.get('/*', async (req, reply) => {
    const path = normalize(decodeURIComponent((req.params as { '*': string })['*'] || '')).replace(/^([/\\])+/, '');
    const allowed = PAGES.has(path) || path === 'support.js' || /^assets\/[\w.-]+\.svg$/.test(path);
    const file = join(ROOT, path);
    if (!allowed || !file.startsWith(ROOT) || !existsSync(file) || !statSync(file).isFile()) return reply.code(404).send({ error: 'nao_encontrado' });
    secure(reply, https);
    const type = TYPES[extname(file)] || 'application/octet-stream';
    if (type.startsWith('text/html')) {
      const html = read(file).toString('utf8');
      if (!html.includes('<script src="./support.js"></script>')) throw new Error('página sem o script do runtime: ' + path);
      return reply.type(type).header('content-security-policy', CSP).header('cache-control', 'no-cache')
        .send(html.replace('<script src="./support.js"></script>', INJECT));
    }
    return reply.type(type).header('cache-control', 'public, max-age=3600').send(read(file));
  });
}
