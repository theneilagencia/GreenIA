import { responderDescobertaPublica, indexacaoAreaInterna } from './seo-publico.js';
import { rotasResultados, iniciarResultados, sincronizarContas } from './resultados.js';
import { memoriaDoConteiner } from './vigia-memoria.js';
import { rotasPaineis } from './paineis.js';
import { rotasAcompanhamento } from './acompanhamento.js';
import { rotasProgramacao } from './qw-programacao.js';
// GreenIA Lite: um processo, um arquivo SQLite, uma empresa por instalação.
import { caminhoChromium } from './visual/chromium.js';
import { tmpdir } from 'node:os';
import { chaveMestra } from './plataforma/segredo.js';
import { configurarOcr } from './ocr.js';
import { erroParaLog } from './registro-seguro.js';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { abrirBanco, exec, um } from './db.js';
import { lerConfig, salvarConfig } from './config.js';
import { criarEmail } from './email.js';
import { rotasPlano, ehOperador, emCreditos, situacaoPlano, MSG as MSG_PLANO, PEDIDO_CREDITOS, pedidosDeCreditos } from './plano.js';
import { semProvedor } from './sem-provedor.js';
import { registrar } from './eventos.js';
import { cabecalhosLpComercial, cabecalhosSeguranca, criarRoteador, enviarJson, ErroHttp, lerBruto, lerCookies, lerCorpo, servirEstatico } from './http.js';
import { checarCsrf, checarOrigem, lerSessao, rotasLogin } from './auth.js';
import { criarSimulada } from './ia.js';
import { rotasAdvanced } from './advanced.js';
import { rotasModelos } from './modelos.js';
import { rotasSugestao } from './sugestao-modelos.js';
import { rotasConversas } from './conversas.js';
import { rotasPessoas } from './pessoas.js';
import { criarContexto, resumoBases, rotasBases } from './bases.js';
import { permissoesQw, rotasQuickWins } from './quickwins.js';
import { extrairTexto, LIMITES_ARQUIVO, paginasDe } from './texto.js';
import { rotasPolitica } from './politica.js';
import { rotasAdmin } from './admin.js';
import { rotasMedicao } from './medicao.js';
import { rotasVisao } from './visao.js';
import { rotasOperador } from './operador.js';
import { rotasVendas } from './vendas.js';
import { rotasArtefatos } from './visual/rotas.js';
import { integracoesLigadas, rotasIntegracoes } from './integracoes/rotas.js';
import { contabilizarIA } from './custo-ia.js';
import { servirSite } from './codigo-operacoes.js';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const PAGINAS = { '/': 'index.html', '/entrar': 'entrar.html', '/app': 'app.html', '/politica': 'politica.html', '/operador': 'operador.html', '/termos': 'termos.html', '/privacidade': 'privacidade.html' };

/**
 * Monta a aplicação. Tudo o que vem de fora (banco, IA, email, relógio) pode ser
 * trocado nos testes.
 * @param {{ banco?: string, ia?: object, email?: object, agora?: () => Date, cookieSeguro?: boolean, adminEmail?: string, log?: Function }} op
 */
// Console do operador (a equipe da plataforma): pode ver o provedor. Todo o resto é ambiente da empresa.
const operador = caminho => caminho.startsWith('/api/operador');

export const VERSAO = (process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || '').slice(0, 7) || null;

export function criarApp(op = {}) {
  const db = abrirBanco(op.banco ?? ':memory:');
  const app = {
    db, agora: op.agora ?? (() => new Date()), cookieSeguro: op.cookieSeguro ?? true, log: op.log ?? console.log, ocr: op.ocr, limitesOcr: op.limitesOcr,
  };
  // Todo custo cobrado pelo provedor vira crédito, inclusive o de chamadas interrompidas (src/custo-ia.js).
  app.ia = contabilizarIA(app, op.ia ?? criarSimulada());
  app.email = op.email ?? criarEmail({ lerSmtp: () => lerConfig(db).smtp, log: app.log });
  // ADMIN_EMAIL: um ou mais emails (separados por vírgula), sempre admins e ativos.
  for (const e of String(op.adminEmail || '').split(/[\s,;]+/).filter(Boolean)) garantirAdmin(app, e);
  app.plano = op.plano || null;
  app.operadores = (op.operadores || []).map(e => e.toLowerCase());
  // Console do operador: token desta instalação, instalações remotas, custo de servidor e preço do pacote.
  app.operacao = op.operacao || {};
  app.rajada = op.rajada;   // envios por minuto por pessoa (padrão 12)
  // Na instalação do operador, a raiz abre a página de vendas (PAGINA_INICIAL=vendas).
  app.paginaInicial = op.paginaInicial === 'vendas' ? 'vendas' : 'instalacao';
  // Modo multiempresa: esta aplicação é uma empresa (tenant) dentro da plataforma. Login, sessão,
  // pessoas e permissões vêm do banco da plataforma (src/plataforma); aqui ficam os dados do produto.
  app.tenant = op.tenant || null;
  // Integration Builder: identificador da empresa em toda linha (segunda barreira, além do banco por empresa) e a
  // chave-mestra que cifra os segredos dos conectores (a da plataforma, ou a da instalação única).
  app.tenantId = app.tenant?.companyId != null ? String(app.tenant.companyId) : 'local';
  app.mestra = op.mestra || (() => (app._mestra ??= chaveMestra({ pasta: op.banco && op.banco !== ':memory:' ? dirname(op.banco) : join(tmpdir(), `greenia-${process.pid}`) })));
  if (!app.tenant) for (const e of app.operadores) garantirOperador(app, e);

  iniciarResultados(app);
  const r = criarRoteador();
  rotasLogin(app, r);
  r.get('/api/publico', () => {
    const c = lerConfig(db);
    return { empresa: c.empresa, logo: c.logo, corMarca: c.corMarca, privacyNote: c.privacyNote, retencaoDias: c.retencaoDias };
  }, { publica: true });
  // versao: o commit publicado (o Render informa em RENDER_GIT_COMMIT), para conferir qual versão está no ar.
  r.get('/api/saude', () => { um(db, 'select 1'); return { ok: true, ia: app.ia.configurada !== false, versao: VERSAO, design: !!caminhoChromium() }; }, { publica: true });
  // Pedido de mais créditos: a pessoa avisa o administrador; o administrador pede um Capacity Pack à equipe da plataforma.
  r.post('/api/plano/pedido', ({ pessoa }) => {
    if (!app.plano) throw new ErroHttp(400, 'sem_plano', 'Esta empresa não usa créditos de plano.');
    if (!pedidosDeCreditos(app).some(x => x.pessoa === pessoa.id && Date.parse(x.em) > app.agora().getTime() - 864e5)) registrar(app, PEDIDO_CREDITOS, pessoa.id, { admin: !!pessoa.admin });
    return { plano: planoParaTela(app, pessoa) };
  });
  r.get('/api/eu', ({ sessao }) => ({
    pessoa: sessao.pessoa, csrf: sessao.csrf, quickWins: permissoesQw(db, sessao.pessoa), iaConfigurada: app.ia.configurada !== false, iaSimulada: !!app.ia.simulada,
    unidade: 'creditos', operador: ehOperador(app, sessao.pessoa), plano: planoParaTela(app, sessao.pessoa), bases: resumoBases(db, sessao.pessoa),
    ...(integracoesLigadas(app, sessao.pessoa) ? { integracoes: true } : {}),
    ...(app.extraEu?.(sessao) ?? {}),
  }));
  app.contexto = criarContexto(app);
  configurarOcr({ log: app.log });   // métricas técnicas do OCR (tamanho, páginas, memória, tempo, resultado), sem conteúdo
  app.extrairAnexos = async (anexos = [], { sinal, imagemSemTexto = false } = {}) => {
    const L = LIMITES_ARQUIVO;
    if (!Array.isArray(anexos) || anexos.length > L.anexosPorMensagem) throw new ErroHttp(400, 'anexos', `Envie até ${L.anexosPorMensagem} anexos por mensagem.`);
    // A soma é conferida pelo tamanho do base64, antes de abrir qualquer arquivo.
    if (anexos.reduce((t, a) => t + String(a?.base64 || '').length * 0.75, 0) > L.mensagemMb * 1024 * 1024) throw new ErroHttp(413, 'anexos_grandes', `Os anexos desta mensagem somam mais de ${L.mensagemMb} MB. Envie em mais de uma mensagem.`);
    const out = [];
    for (const a of anexos) {
      try { out.push(await extrairTexto(a, { maxCaracteres: L.anexoCaracteres, onde: 'anexo', ocr: app.ocr, sinal, limitesOcr: app.limitesOcr })); }
      catch (e) {
        // Foto ou personagem sem texto escrito, num pedido de edição de imagem: a imagem é a base (não precisa de texto).
        // A IA de texto recebe só o aviso de que não vê o conteúdo visual, para não inventar o que há na imagem.
        const b = Buffer.from(String(a?.base64 || '').slice(0, 32), 'base64');
        const img = (b[0] === 0x89 && b[1] === 0x50) || (b[0] === 0xff && b[1] === 0xd8) || (b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP');
        if (!imagemSemTexto || e?.codigo !== 'sem_texto' || !img) throw e;
        out.push({ nome: String(a.nome || 'imagem').slice(0, 200), texto: '[Imagem sem texto escrito, enviada pela pessoa. Você não vê o conteúdo visual dela: não descreva nem suponha o que há na imagem. Ela pode ser usada como base quando a pessoa pedir para gerar ou editar uma imagem.]', imagem: true });
      }
    }
    const caracteres = out.reduce((t, a) => t + a.texto.length, 0);
    if (caracteres > L.mensagemCaracteres) throw new ErroHttp(413, 'texto_grande', `Os anexos desta mensagem somam cerca de ${paginasDe(caracteres)} páginas de texto; o máximo por mensagem é ${paginasDe(L.mensagemCaracteres)}. Envie menos arquivos ou só as partes necessárias.`);
    return out;
  };
  app.limitesArquivo = LIMITES_ARQUIVO;
  for (const modulo of [rotasResultados, rotasAdvanced, rotasAcompanhamento, rotasSugestao, rotasModelos, rotasPessoas, rotasBases, rotasQuickWins, rotasConversas, rotasPolitica, rotasAdmin, rotasMedicao, rotasPlano, rotasVisao, rotasOperador, rotasVendas, rotasArtefatos, rotasIntegracoes, rotasProgramacao, rotasPaineis]) modulo(app, r);

  app.tratar = (req, res, externo) => tratar(app, r, req, res, externo);
  app.servidor = createServer((req, res) => tratar(app, r, req, res));
  return app;
}

// Página 404 em HTML: idioma, viewport, marca e caminhos de saída. No endereço de uma empresa (white label) leva a
// marca dela (nome e /icone), nunca a da plataforma; sem marca conhecida (marca: null), fica neutra.
const escHtml = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export function paginaNaoEncontrada(res, { marca = 'GreenIA', icone = '/assets/greenia-marca.svg', inicio = '/', saida = { href: '/encontrar', texto: 'Encontrar meu ambiente' } } = {}) {
  const icn = marca && icone ? `<img src="${escHtml(icone)}" width="32" height="32" alt="" aria-hidden="true">` : '';
  res.writeHead(404, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  res.end(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Página não encontrada${marca ? ` · ${escHtml(marca)}` : ''}</title><link rel="stylesheet" href="/fontes/fontes.css"><link rel="stylesheet" href="/estilo.css">${marca && icone ? `<link rel="icon" href="${escHtml(icone)}">` : ''}</head>
<body><main style="min-height:100vh;display:grid;place-items:center;padding:24px 16px"><div style="max-width:440px;text-align:center">
${marca ? `<p class="marca-404" style="display:flex;align-items:center;justify-content:center;gap:10px;margin:0 0 18px;font:600 18px/1.3 var(--sans);color:var(--ink)">${icn}<span>${escHtml(marca)}</span></p>` : ''}
<h1 style="font:600 22px/1.3 var(--sans);margin:0 0 10px;color:var(--ink)">Página não encontrada</h1>
<p style="font:400 15px/1.6 var(--sans);color:var(--muted);margin:0 0 24px">O endereço pode ter mudado ou ter sido digitado de outro jeito. Confira o endereço ou siga por um dos caminhos abaixo.</p>
<p style="display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin:0"><a class="btn btn-verde btn-grande" href="${escHtml(inicio)}">Ir para o início</a>${saida ? `<a class="btn btn-linha btn-grande" href="${escHtml(saida.href)}">${escHtml(saida.texto)}</a>` : ''}</p>
</div></main></body></html>`);
}

// Primeiro admin da instalação (variável ADMIN_EMAIL). O domínio dele entra na
// lista de permitidos se a lista estiver vazia.
// Operador da plataforma: entra mesmo com email de outro domínio, como admin.
function garantirOperador(app, email) {
  if (!um(app.db, 'select 1 from pessoas where email = ?', email)) exec(app.db, "insert into pessoas (email, nome, papel) values (?, 'Operador da plataforma', 'admin')", email);
  else exec(app.db, "update pessoas set papel = 'admin', ativo = 1 where email = ?", email);
}

function garantirAdmin(app, email) {
  email = email.trim().toLowerCase();
  if (!um(app.db, 'select 1 from pessoas where email = ?', email)) exec(app.db, "insert into pessoas (email, nome, papel) values (?, ?, 'admin')", email, email.split('@')[0]);
  else exec(app.db, "update pessoas set papel = 'admin', ativo = 1 where email = ?", email);
  const cfg = lerConfig(app.db);
  if (!cfg.dominios.length) salvarConfig(app.db, { dominios: [email.split('@')[1]] });
}

// Permissão exigida por cada rota administrativa no modo multiempresa (no modo de instalação única, basta ser admin).
export function permissaoAdmin(caminho, metodo) {
  const ler = metodo === 'GET';
  if (/^\/api\/admin\/(pessoas|areas|grupos)/.test(caminho)) return ler ? 'user.read' : 'user.update';
  if (/^\/api\/admin\/(modelos|catalogo)/.test(caminho)) return 'models.manage';
  if (caminho.startsWith('/api/admin/politica')) return 'policy.manage';
  if (/^\/api\/admin\/(uso|visao-geral)/.test(caminho)) return 'usage.read';
  if (/^\/api\/admin\/(eventos|problemas)/.test(caminho)) return ler ? 'audit.read' : 'settings.manage';
  if (/^\/api\/admin\/(config|smtp|codigo)/.test(caminho)) return 'settings.manage';
  if (/^\/api\/admin\/integracoes\/aprovacoes\/[^/]+\/decidir$/.test(caminho)) return 'integrations.approve';
  if (caminho.startsWith('/api/admin/integracoes')) return 'integrations.manage';
  return 'company.manage';
}

const ENVIO_GRANDE = 2 * 1048576, MEMORIA_ENVIO_MB = Number(process.env.MEMORIA_ENVIO_MB || 180);
async function tratar(app, r, req, res, externo) {
  cabecalhosSeguranca(res);
  const url = new URL(req.url, 'http://local');
  if (!app.tenant && app.paginaInicial === 'vendas' && req.method === 'GET' && ['/', '/vendas.html'].includes(url.pathname)) cabecalhosLpComercial(res);
  try {
    indexacaoAreaInterna(res, url.pathname);
    if (await responderDescobertaPublica(req, res, url.pathname, !app.tenant && app.paginaInicial === 'vendas')) return;
    if (!url.pathname.startsWith('/api/')) {
      if (url.pathname === '/admin') { res.writeHead(302, { location: '/app#/visao-geral' }); return res.end(); }   // painel antigo
      if (url.pathname === '/encontrar' && !app.tenant) { res.writeHead(302, { location: '/entrar' }); return res.end(); }   // instalação única: um ambiente só
      // Site publicado pela empresa (página pública, isolada): src/codigo-operacoes.js.
      const site = req.method === 'GET' && /^\/s\/([A-Za-z0-9_-]{20,64})$/.exec(url.pathname);
      if (site) return servirSite(app, site[1], res);
      const pagina = url.pathname === '/' && app.paginaInicial === 'vendas' ? 'vendas.html' : PAGINAS[url.pathname];
      if (url.pathname === '/vendas.html' && app.paginaInicial !== 'vendas') { res.writeHead(302, { location: '/' }); return res.end(); }
      if (req.method === 'GET' && pagina && await servirEstatico(res, join(RAIZ, 'public'), pagina, req)) return;
      if (req.method === 'GET' && await servirEstatico(res, join(RAIZ, 'public'), url.pathname.slice(1), req)) return;
      return paginaNaoEncontrada(res);
    }
    const rota = r.achar(req.method, url.pathname);
    if (!rota) throw new ErroHttp(404, 'nao_encontrado', 'Não encontrado.');
    // Envio grande (anexos) com a memória do servidor apertada: recusa antes de ler, com aviso, em vez de arriscar o
    // servidor de todos. Vale para qualquer rota e qualquer arquivo.
    if (Number(req.headers['content-length'] || 0) > ENVIO_GRANDE && (memoriaDoConteiner()?.livre ?? Infinity) < MEMORIA_ENVIO_MB)
      throw new ErroHttp(503, 'servidor_ocupado', 'O servidor está ocupado agora. Tente de novo em alguns segundos; nada foi enviado.');
    const cookies = lerCookies(req);
    const sessao = externo ? externo.sessao : lerSessao(app, cookies);
    if (req.method !== 'GET') checarOrigem(req);
    if (!rota.op.publica) {
      if (!sessao) throw new ErroHttp(401, 'sem_sessao', 'Entre de novo.');
      if (req.method !== 'GET') checarCsrf(sessao, req);
      if (app.tenant) {
        const perms = sessao.pessoa.permissoes || [];
        if (rota.op.admin && !perms.includes(permissaoAdmin(url.pathname, req.method))) throw new ErroHttp(403, 'sem_permissao', 'Você não tem permissão para isso.');
        if (req.method !== 'GET' && /^\/api\/(conversas|quick-wins|bases|medicoes|artefatos|integracoes|resultados\/trabalhos)/.test(url.pathname) && !perms.includes('chat.use')) throw new ErroHttp(403, 'sem_permissao', 'Seu acesso é só de consulta.');
        app.checarRecurso?.(req.method, url.pathname);
      } else if (rota.op.admin && !sessao.pessoa.admin) throw new ErroHttp(403, 'so_admin', 'Só o admin pode fazer isso.');
    }
    const corpo = req.method === 'GET' ? {} : rota.op.bruto ? await lerBruto(req, rota.op.limiteMb ?? 1) : await lerCorpo(req, rota.op.limiteMb ?? 1);
    if (url.pathname.startsWith('/api/admin/advanced')) {
      for(const k of Object.keys(corpo)) if(/_creditos$/.test(k)||/Creditos$/.test(k)){const usd=k.replace(/_creditos$/,'_usd').replace(/Creditos$/,'Usd');corpo[usd]=Number(corpo[k])*.01;delete corpo[k];}
    }
    const ctx = { app, req, res, cookies, sessao, pessoa: sessao?.pessoa, params: rota.params, query: Object.fromEntries(url.searchParams), corpo };
    ctx.creditos = !rota.op.maquina && !operador(url.pathname);   // rotas com token do operador respondem em dólar
    let out = await rota.h(ctx);
    if(req.method!=='GET'&&(/^\/api\/admin\/pessoas/.test(url.pathname)||url.pathname==='/api/login/entrar'))sincronizarContas(app);
    if (ctx.creditos && out) out = emCreditos(out);   // com plano, só o operador recebe valores em dólar
    if (!operador(url.pathname)) out = semProvedor(out);   // ambiente da empresa: o provedor de IA não aparece
    if (!res.headersSent && !res.writableEnded) enviarJson(res, 200, out ?? { ok: true });
  } catch (e) {
    if (res.headersSent) { res.end(); return; }
    if (e instanceof ErroHttp) { const corpo = { erro: e.codigo, mensagem: e.message, ...e.extra }; return enviarJson(res, e.status, operador(new URL(req.url, 'http://x').pathname) ? corpo : semProvedor(emCreditos(corpo))); }
    app.log('erro', erroParaLog(e));   // sem a mensagem: uma exceção pode repetir o conteúdo do pedido
    enviarJson(res, 500, { erro: 'interno', mensagem: 'Algo deu errado. Tente de novo.' });
  }
}

// O que cada pessoa vê do plano: todos veem a fase e o aviso; o admin vê os números em créditos.
function planoParaTela(app, pessoa) {
  const s = situacaoPlano(app);
  if (!s) return null;
  const mensagem = s.fase === 'reserva' ? MSG_PLANO.reserva(s) : s.fase === 'esgotado' ? MSG_PLANO.esgotado(s) : s.fase === 'aviso' ? `Os créditos da empresa estão em ${s.percentual}% neste ciclo.` : null;
  // Todos veem o percentual e a renovação (não os números nem valores); o admin vê o resto em Uso.
  const pedido = pedidosDeCreditos(app).find(x => x.pessoa === pessoa.id)?.em || null;
  const publico = { fase: s.fase, mensagem, percentual: s.ilimitado ? null : s.percentual, renova: s.renova, ilimitado: !!s.ilimitado, pedido };
  if (!pessoa.admin) return publico;
  return { ...s, ...publico };
}
