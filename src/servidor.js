// GreenIA Lite: um processo, um arquivo SQLite, uma empresa por instalação.
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { abrirBanco, exec, um } from './db.js';
import { lerConfig, salvarConfig } from './config.js';
import { criarEmail } from './email.js';
import { cabecalhosSeguranca, criarRoteador, enviarJson, ErroHttp, lerCookies, lerCorpo, servirEstatico } from './http.js';
import { checarCsrf, checarOrigem, lerSessao, rotasLogin } from './auth.js';
import { criarSimulada } from './ia.js';
import { rotasModelos } from './modelos.js';
import { rotasConversas } from './conversas.js';
import { rotasPessoas } from './pessoas.js';
import { criarContexto, rotasBases } from './bases.js';
import { permissoesQw, rotasQuickWins } from './quickwins.js';
import { extrairTexto } from './texto.js';
import { rotasPolitica } from './politica.js';
import { rotasAdmin } from './admin.js';
import { rotasMedicao } from './medicao.js';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const PAGINAS = { '/': 'index.html', '/entrar': 'entrar.html', '/app': 'app.html', '/politica': 'politica.html', '/admin': 'admin.html' };

/**
 * Monta a aplicação. Tudo o que vem de fora (banco, IA, email, relógio) pode ser
 * trocado nos testes.
 * @param {{ banco?: string, ia?: object, email?: object, agora?: () => Date, cookieSeguro?: boolean, adminEmail?: string, log?: Function }} op
 */
export function criarApp(op = {}) {
  const db = abrirBanco(op.banco ?? ':memory:');
  const app = {
    db, ia: op.ia ?? criarSimulada(), agora: op.agora ?? (() => new Date()), cookieSeguro: op.cookieSeguro ?? true, log: op.log ?? console.log,
  };
  app.email = op.email ?? criarEmail({ lerSmtp: () => lerConfig(db).smtp, log: app.log });
  if (op.adminEmail) garantirAdmin(app, op.adminEmail);

  const r = criarRoteador();
  rotasLogin(app, r);
  r.get('/api/publico', () => {
    const c = lerConfig(db);
    return { empresa: c.empresa, logo: c.logo, corMarca: c.corMarca, privacyNote: c.privacyNote, retencaoDias: c.retencaoDias };
  }, { publica: true });
  r.get('/api/saude', () => { um(db, 'select 1'); return { ok: true }; }, { publica: true });
  r.get('/api/eu', ({ sessao }) => ({ pessoa: sessao.pessoa, csrf: sessao.csrf, quickWins: permissoesQw(db, sessao.pessoa) }));
  app.contexto = criarContexto(app);
  app.extrairAnexos = async (anexos = []) => {
    if (!Array.isArray(anexos) || anexos.length > 10) throw new ErroHttp(400, 'anexos', 'Envie até 10 anexos por mensagem.');
    const out = [];
    for (const a of anexos) out.push(await extrairTexto(a));
    return out;
  };
  for (const modulo of [rotasModelos, rotasPessoas, rotasBases, rotasQuickWins, rotasConversas, rotasPolitica, rotasAdmin, rotasMedicao]) modulo(app, r);

  app.servidor = createServer((req, res) => tratar(app, r, req, res));
  return app;
}

// Primeiro admin da instalação (variável ADMIN_EMAIL). O domínio dele entra na
// lista de permitidos se a lista estiver vazia.
function garantirAdmin(app, email) {
  email = email.trim().toLowerCase();
  if (!um(app.db, 'select 1 from pessoas where email = ?', email)) exec(app.db, "insert into pessoas (email, nome, papel) values (?, ?, 'admin')", email, email.split('@')[0]);
  const cfg = lerConfig(app.db);
  if (!cfg.dominios.length) salvarConfig(app.db, { dominios: [email.split('@')[1]] });
}

async function tratar(app, r, req, res) {
  cabecalhosSeguranca(res);
  const url = new URL(req.url, 'http://local');
  try {
    if (!url.pathname.startsWith('/api/')) {
      if (req.method === 'GET' && PAGINAS[url.pathname] && await servirEstatico(res, join(RAIZ, 'public'), PAGINAS[url.pathname])) return;
      if (req.method === 'GET' && await servirEstatico(res, join(RAIZ, 'public'), url.pathname.slice(1))) return;
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      return res.end('Página não encontrada.');
    }
    const rota = r.achar(req.method, url.pathname);
    if (!rota) throw new ErroHttp(404, 'nao_encontrado', 'Não encontrado.');
    const cookies = lerCookies(req);
    const sessao = lerSessao(app, cookies);
    if (req.method !== 'GET') checarOrigem(req);
    if (!rota.op.publica) {
      if (!sessao) throw new ErroHttp(401, 'sem_sessao', 'Entre de novo.');
      if (req.method !== 'GET') checarCsrf(sessao, req);
      if (rota.op.admin && !sessao.pessoa.admin) throw new ErroHttp(403, 'so_admin', 'Só o admin pode fazer isso.');
    }
    const corpo = req.method === 'GET' ? {} : await lerCorpo(req, rota.op.limiteMb ?? 1);
    const ctx = { app, req, res, cookies, sessao, pessoa: sessao?.pessoa, params: rota.params, query: Object.fromEntries(url.searchParams), corpo };
    const out = await rota.h(ctx);
    if (!res.headersSent && !res.writableEnded) enviarJson(res, 200, out ?? { ok: true });
  } catch (e) {
    if (res.headersSent) { res.end(); return; }
    if (e instanceof ErroHttp) return enviarJson(res, e.status, { erro: e.codigo, mensagem: e.message, ...e.extra });
    app.log('erro', e);
    enviarJson(res, 500, { erro: 'interno', mensagem: 'Algo deu errado. Tente de novo.' });
  }
}

// Execução direta: node src/servidor.js
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { iniciar } = await import('./iniciar.js');
  await iniciar();
}
