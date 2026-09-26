// HTTP mínimo: rotas com parâmetros, corpo JSON com limite, cookies,
// arquivos estáticos e cabeçalhos de segurança. Sem framework.
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';

export class ErroHttp extends Error {
  constructor(status, codigo, mensagem, extra = {}) {
    super(mensagem || codigo);
    Object.assign(this, { status, codigo, extra });
  }
}
export const erro = (status, codigo, mensagem, extra) => new ErroHttp(status, codigo, mensagem, extra);

export function criarRoteador() {
  const rotas = [];
  const add = metodo => (caminho, h, op = {}) => rotas.push({
    metodo, h, op, re: new RegExp('^' + caminho.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'),
  });
  return {
    get: add('GET'), post: add('POST'), put: add('PUT'), patch: add('PATCH'), del: add('DELETE'),
    achar(metodo, caminho) {
      for (const r of rotas) {
        const m = r.re.exec(caminho);
        if (m && r.metodo === metodo) return { ...r, params: Object.fromEntries(Object.entries(m.groups || {}).map(([k, v]) => [k, decodeURIComponent(v)])) };
      }
      return null;
    },
  };
}

export function lerCorpo(req, limiteMb = 1) {
  return new Promise((resolve, reject) => {
    const partes = [];
    let total = 0;
    req.on('data', c => {
      total += c.length;
      if (total > limiteMb * 1024 * 1024) { reject(erro(413, 'grande_demais', `Envio acima de ${limiteMb} MB.`)); req.destroy(); return; }
      partes.push(c);
    });
    req.on('end', () => {
      if (!total) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(partes).toString('utf8'))); }
      catch { reject(erro(400, 'json_invalido', 'Corpo inválido.')); }
    });
    req.on('error', reject);
  });
}

export function lerCookies(req) {
  const out = {};
  for (const p of String(req.headers.cookie || '').split(';')) {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  }
  return out;
}

export function enviarJson(res, status, dados, extras = {}) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extras });
  res.end(JSON.stringify(dados));
}

export function enviarCsv(res, nome, linhas) {
  const cel = v => {
    let s = v === null || v === undefined ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;           // evita fórmula ao abrir na planilha
    return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  res.writeHead(200, { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${nome}"`, 'cache-control': 'no-store' });
  res.end('﻿' + linhas.map(l => l.map(cel).join(';')).join('\r\n') + '\r\n');
}

// CSP: só o próprio servidor, mais as fontes do Google (com fonte do sistema de reserva).
export function cabecalhosSeguranca(res) {
  res.setHeader('content-security-policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('referrer-policy', 'same-origin');
  res.setHeader('x-frame-options', 'DENY');
}

const TIPOS = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json; charset=utf-8' };

export async function servirEstatico(res, raiz, caminho) {
  const arquivo = normalize(join(raiz, decodeURIComponent(caminho)));
  if (!arquivo.startsWith(normalize(raiz) + sep) || !TIPOS[extname(arquivo)]) return false;
  try {
    const dados = await readFile(arquivo);
    res.writeHead(200, { 'content-type': TIPOS[extname(arquivo)], 'cache-control': extname(arquivo) === '.html' ? 'no-cache' : 'public, max-age=300' });
    res.end(dados);
    return true;
  } catch { return false; }
}
