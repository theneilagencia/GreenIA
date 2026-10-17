// Operações de código protegidas (src/permissoes-codigo.js): executar código ou testes, acessar ou alterar
// repositórios e publicar sites. Cada uma só para quem o admin habilitou no perfil, conferido no servidor a cada uso
// (revogar vale na hora, inclusive para o que já foi publicado) e com a política da empresa por cima.
//  - Executar: numa área isolada no navegador de quem pediu (iframe em sandbox, origem opaca, sem cookies nem rede
//    além do pacote do Python). JavaScript num worker; Python pelo Pyodide (WebAssembly). Nada roda no servidor da
//    GreenIA, que guarda dados de várias empresas. A saída volta para a conversa e serve à resposta seguinte.
//  - Repositórios (GitHub): o admin conecta um token (cifrado) e libera a lista de repositórios. Ler vira material
//    da conversa (com as mesmas regras de segredo dos anexos); alterar sempre abre um branch novo e um Pull Request,
//    nunca grava direto no branch principal.
//  - Publicar: o site gerado ganha um endereço público na GreenIA (cópia do arquivo), servido isolado (sandbox, sem
//    indexação). Sai do ar ao despublicar, quando a empresa proíbe publicar ou quando quem publicou perde a permissão.
import { randomBytes } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { erro } from './http.js';
import { exec, json, todos, um } from './db.js';
import { lerConfig } from './config.js';
import { registrar } from './eventos.js';
import { carregarPessoa } from './auth.js';
import { cifrar, decifrar } from './plataforma/segredo.js';
import { situacaoDaOperacao } from './permissoes-codigo.js';

const AGORA = app => (app.agora ? app.agora() : new Date()).toISOString();
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
export const MSG_SEM_PERMISSAO = {
  executar: 'Executar código depende de o administrador da sua empresa habilitar "Executar código" no seu perfil.',
  repositorio: 'Acessar repositórios depende de o administrador da sua empresa habilitar "Acessar repositórios de código" no seu perfil.',
  publicar: 'Publicar projetos depende de o administrador da sua empresa habilitar "Publicar projetos" no seu perfil.',
};
export function pode(app, pessoa, op) { return situacaoDaOperacao(op, pessoa, lerConfig(app.db)) === 'permitida'; }
export function exigir(app, pessoa, op) {
  const s = situacaoDaOperacao(op, pessoa, lerConfig(app.db));
  if (s === 'permitida') return;
  registrar(app, 'code.blocked', pessoa.id, { operacoes: [{ op, situacao: s }], via: 'rota' });
  throw erro(403, 'sem_permissao_codigo', s === 'proibida_pela_empresa' ? 'A política da sua empresa não permite esta operação de código.' : MSG_SEM_PERMISSAO[op]);
}

// ---------- arquivos de um projeto (.zip gerado) ----------
export function lerZipProjeto(b) {
  const out = [];
  let i = 0, total = 0;
  while (i + 30 <= b.length && b.readUInt32LE(i) === 0x04034b50) {
    const metodo = b.readUInt16LE(i + 8), comp = b.readUInt32LE(i + 18), n = b.readUInt16LE(i + 26), ex = b.readUInt16LE(i + 28);
    const nome = b.toString('utf8', i + 30, i + 30 + n), d = b.subarray(i + 30 + n + ex, i + 30 + n + ex + comp);
    const dados = metodo === 8 ? inflateRawSync(d, { maxOutputLength: 4 * 1024 * 1024 }) : d;
    total += dados.length;
    if (total > 8 * 1024 * 1024) break;
    if (!nome.endsWith('/')) out.push({ nome, dados: dados.toString('utf8') });
    i += 30 + n + ex + comp;
  }
  return out;
}

// ---------- executar ----------
const EH_TESTE_PY = n => /(^|\/)(test_[^/]*|[^/]*_test)\.py$/.test(n);
const EH_TESTE_JS = n => /(\.test|\.spec)\.[cm]?js$|(^|\/)tests?\/[^/]+\.[cm]?js$/.test(n);
const ENTRADAS_PY = ['main.py', 'app.py', '__main__.py', 'run.py'];
const ENTRADAS_JS = ['index.js', 'main.js', 'app.js', 'script.js', 'index.mjs', 'main.mjs', 'server.js'];
/** O que rodar: { linguagem, modo, entrada?, testes[] } ou null (nada executável, ex.: só HTML). */
export function planoDeExecucao(arquivos, modo = 'principal') {
  const nomes = arquivos.map(a => a.nome);
  const py = nomes.filter(n => n.endsWith('.py')), js = nomes.filter(n => /\.[cm]?js$/.test(n));
  if (modo === 'testes') {
    if (py.some(EH_TESTE_PY)) return { linguagem: 'python', modo, testes: py.filter(EH_TESTE_PY) };
    if (js.some(EH_TESTE_JS)) return { linguagem: 'javascript', modo, testes: js.filter(EH_TESTE_JS) };
  }
  const base = n => n.split('/').pop();
  const entradaPy = py.find(n => ENTRADAS_PY.includes(base(n))) || py.find(n => !EH_TESTE_PY(n));
  const entradaJs = js.find(n => ENTRADAS_JS.includes(base(n)) && !/(^|\/)(public|static|www)\//.test(n)) || js.find(n => !EH_TESTE_JS(n) && !/(^|\/)(public|static|www)\//.test(n));
  if (modo === 'testes') return null;
  if (entradaPy && (!entradaJs || py.length >= js.length)) return { linguagem: 'python', modo, entrada: entradaPy, testes: [] };
  if (entradaJs) return { linguagem: 'javascript', modo, entrada: entradaJs, testes: [] };
  return null;
}
export const PYODIDE = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/';
export const CSP_EXECUCAO = "sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob: https://cdn.jsdelivr.net; worker-src blob:; connect-src https://cdn.jsdelivr.net; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'self'";
// Página da área isolada: roda o plano num worker e manda o resultado à tela da GreenIA (postMessage).
export function paginaDeExecucao(arquivos, plano, { limiteMs = 45000 } = {}) {
  const D = { arquivos: arquivos.filter(a => /\.(py|[cm]?js|json|txt|csv|md)$/.test(a.nome)).map(a => ({ nome: a.nome, dados: a.dados })), plano, limiteMs, pyodide: PYODIDE, pyRunner: PY_RUNNER };
  const seguro = s => s.replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return `<!doctype html><meta charset="utf-8"><title>Execução isolada</title><body><script>
const D = ${seguro(JSON.stringify(D))};
const W = ${seguro(JSON.stringify(`(${trabalhador.toString()})();`))};
(${pagina.toString()})(D, W);
</script></body>`;
}
// Dentro da página isolada: inicia o worker, mede o tempo e interrompe no limite.
function pagina(D, W) {
  const enviar = r => parent.postMessage({ greeniaExecucao: true, ...r }, '*');
  const inicio = performance.now();
  let w;
  try { w = new Worker(URL.createObjectURL(new Blob([W], { type: 'text/javascript' }))); }
  catch (e) { return enviar({ status: 'erro', saida: `A área isolada não conseguiu iniciar neste navegador: ${e.message}`, ms: 0 }); }
  const relogio = setTimeout(() => { w.terminate(); enviar({ status: 'tempo_esgotado', saida: `A execução passou de ${Math.round(D.limiteMs / 1000)} s e foi interrompida.`, ms: Math.round(performance.now() - inicio) }); }, D.limiteMs);
  w.onmessage = ev => { clearTimeout(relogio); w.terminate(); enviar({ ...ev.data, ms: Math.round(performance.now() - inicio) }); };
  w.onerror = ev => { clearTimeout(relogio); enviar({ status: 'erro', saida: String(ev.message || 'erro na execução'), ms: Math.round(performance.now() - inicio) }); };
  w.postMessage(D);
}
// Worker: JavaScript (módulos ES ou CommonJS, com node:assert e node:test simplificados) ou Python (Pyodide).
function trabalhador() {
  self.onmessage = async ev => {
    const D = ev.data, saida = [];
    const texto = x => typeof x === 'string' ? x : (() => { try { return JSON.stringify(x); } catch { return String(x); } })();
    const log = (...a) => saida.push(a.map(texto).join(' '));
    const fim = status => postMessage({ status, saida: saida.join('\n').slice(0, 20000), linguagem: D.plano.linguagem, modo: D.plano.modo });
    try {
      if (D.plano.linguagem === 'python') {
        importScripts(`${D.pyodide}pyodide.js`);
        const py = await loadPyodide({ indexURL: D.pyodide, stdout: t => saida.push(t), stderr: t => saida.push(t) });
        for (const a of D.arquivos) {
          let p = '';
          for (const d of a.nome.split('/').slice(0, -1)) { p += (p ? '/' : '') + d; try { py.FS.mkdir(p); } catch { /* já existe */ } }
          py.FS.writeFile(a.nome, a.dados);
        }
        try { await py.loadPackagesFromImports(D.arquivos.filter(a => a.nome.endsWith('.py')).map(a => a.dados).join('\n')); }
        catch (e) { saida.push(`Aviso: pacote não disponível na área isolada: ${e.message}`); }
        py.globals.set('PLANO_JSON', JSON.stringify(D.plano));
        const r = await py.runPythonAsync(D.pyRunner);
        return fim(r === 'ok' ? 'ok' : 'falhou');
      }
      const arquivos = new Map(D.arquivos.map(a => [a.nome, a.dados]));
      const testes = [];
      const msg = (a, b) => `esperado ${texto(b)}, recebido ${texto(a)}`;
      const igual = (a, b) => { try { return JSON.stringify(a) === JSON.stringify(b); } catch { return a === b; } };
      const assert = (v, m) => { if (!v) throw new Error(m || 'Falha na verificação'); };
      Object.assign(assert, {
        ok: assert, equal: (a, b, m) => assert(a == b, m || msg(a, b)), strictEqual: (a, b, m) => assert(a === b, m || msg(a, b)),
        notEqual: (a, b, m) => assert(a != b, m || 'valores iguais'), notStrictEqual: (a, b, m) => assert(a !== b, m || 'valores iguais'),
        deepEqual: (a, b, m) => assert(igual(a, b), m || msg(a, b)), deepStrictEqual: (a, b, m) => assert(igual(a, b), m || msg(a, b)),
        notDeepEqual: (a, b, m) => assert(!igual(a, b), m), notDeepStrictEqual: (a, b, m) => assert(!igual(a, b), m),
        match: (s, re, m) => assert(re.test(s), m || `não corresponde a ${re}`), doesNotMatch: (s, re, m) => assert(!re.test(s), m),
        throws: (fn, _e, m) => { let lancou = false; try { fn(); } catch { lancou = true; } assert(lancou, m || 'esperava um erro'); },
        doesNotThrow: fn => fn(),
        rejects: async (p, _e, m) => { let lancou = false; try { await (typeof p === 'function' ? p() : p); } catch { lancou = true; } assert(lancou, m || 'esperava uma rejeição'); },
        fail: m => { throw new Error(m || 'falhou'); },
      });
      assert.strict = assert;
      const test = (nome, a, b) => { testes.push({ nome: String(nome), fn: typeof a === 'function' ? a : b }); };
      const describe = (nome, fn) => { const antes = testes.length; fn(); for (let i = antes; i < testes.length; i++) testes[i].nome = `${nome} > ${testes[i].nome}`; };
      const nodeTest = { test, it: test, describe, suite: describe, before: f => f(), after: () => {}, beforeEach: () => {}, afterEach: () => {} };
      self.console = { log, info: log, warn: log, error: log, debug: log, table: log };
      self.__greenia = { assert, nodeTest };
      const resolver = (de, esp) => {
        const base = de.split('/').slice(0, -1);
        for (const s of esp.split('/')) { if (s === '..') base.pop(); else if (s !== '.') base.push(s); }
        const p = base.join('/');
        for (const c of [p, `${p}.js`, `${p}.mjs`, `${p}.cjs`, `${p}/index.js`]) if (arquivos.has(c)) return c;
        throw new Error(`arquivo não encontrado: ${esp}`);
      };
      const externo = esp => new Error(`O pacote "${esp}" não está disponível na área isolada (só os arquivos do projeto e node:assert/node:test).`);
      const ehAssert = esp => /^(node:)?assert(\/strict)?$/.test(esp), ehTest = esp => /^(node:)?test$/.test(esp);
      // CommonJS: require com cache.
      const cache = new Map();
      const exigirMod = (de, esp) => {
        if (ehAssert(esp)) return assert;
        if (ehTest(esp)) return nodeTest;
        if (!esp.startsWith('.')) throw externo(esp);
        const n = resolver(de, esp);
        if (cache.has(n)) return cache.get(n).exports;
        const module = { exports: {} };
        cache.set(n, module);
        if (n.endsWith('.json')) { module.exports = JSON.parse(arquivos.get(n)); return module.exports; }
        new Function('require', 'module', 'exports', '__filename', '__dirname', arquivos.get(n))(e => exigirMod(n, e), module, module.exports, n, n.split('/').slice(0, -1).join('/'));
        return module.exports;
      };
      // Módulos ES: cada arquivo vira um blob, com os imports apontando para os blobs dos outros.
      const SHIM = {
        assert: 'const a = self.__greenia.assert; export default a; export const { ok, equal, strictEqual, notEqual, notStrictEqual, deepEqual, deepStrictEqual, notDeepEqual, notDeepStrictEqual, match, doesNotMatch, throws, doesNotThrow, rejects, fail } = a; export const strict = a;',
        test: 'const t = self.__greenia.nodeTest; export default t.test; export const { test, it, describe, suite, before, after, beforeEach, afterEach } = t;',
      };
      const shims = {}, blobs = new Map(), montando = new Set();
      const blob = fonte => URL.createObjectURL(new Blob([fonte], { type: 'text/javascript' }));
      const shim = k => (shims[k] ||= blob(SHIM[k]));
      const urlDe = n => {
        if (blobs.has(n)) return blobs.get(n);
        if (montando.has(n)) throw new Error(`importação circular em ${n}`);
        montando.add(n);
        const fonte = arquivos.get(n).replace(/(\bfrom\s*|\bimport\s*\(?\s*)(['"])([^'"]+)\2/g, (m, a, q, esp) => {
          if (ehAssert(esp)) return a + q + shim('assert') + q;
          if (ehTest(esp)) return a + q + shim('test') + q;
          if (!esp.startsWith('.')) throw externo(esp);
          return a + q + urlDe(resolver(n, esp)) + q;
        });
        const u = blob(fonte);
        blobs.set(n, u); montando.delete(n);
        return u;
      };
      const esm = n => /^\s*(import|export)\s/m.test(arquivos.get(n));
      const carregar = async n => (esm(n) ? import(urlDe(n)) : exigirMod('', `./${n}`));
      if (D.plano.modo === 'testes') {
        for (const n of D.plano.testes) { log(`▶ ${n}`); await carregar(n); }
        let ok = 0, falhas = 0;
        for (const t of testes) {
          try { await t.fn(); ok++; log(`✔ ${t.nome}`); }
          catch (e) { falhas++; log(`✖ ${t.nome}: ${e?.message || e}`); }
        }
        log('');
        log(testes.length ? `${ok} passaram, ${falhas} falharam` : 'Nenhum teste encontrado nos arquivos.');
        return fim(falhas || !testes.length ? 'falhou' : 'ok');
      }
      await carregar(D.plano.entrada);
      await new Promise(r => setTimeout(r, 50));
      return fim('ok');
    } catch (e) {
      saida.push(String(e?.stack || e).split('\n').slice(0, 8).join('\n'));
      return fim('erro');
    }
  };
}
// Python: testes (unittest e funções test_ no estilo pytest) ou o arquivo principal como __main__.
const PY_RUNNER = `
import sys, os, json, runpy, unittest, importlib, traceback
sys.path.insert(0, os.getcwd())
plano = json.loads(PLANO_JSON)
resultado = 'ok'
if plano['modo'] == 'testes':
    total = falhas = 0
    for caminho in plano['testes']:
        print('▶ ' + caminho)
        try:
            mod = importlib.import_module(caminho[:-3].replace('/', '.'))
        except Exception:
            traceback.print_exc(); falhas += 1; total += 1; continue
        suite = unittest.defaultTestLoader.loadTestsFromModule(mod)
        if suite.countTestCases():
            r = unittest.TextTestRunner(stream=sys.stdout, verbosity=2).run(suite)
            total += r.testsRun; falhas += len(r.failures) + len(r.errors)
        for nome in [n for n in dir(mod) if n.startswith('test_') and callable(getattr(mod, n)) and not isinstance(getattr(mod, n), type)]:
            total += 1
            try:
                getattr(mod, nome)(); print('✔ ' + nome)
            except Exception as e:
                falhas += 1; print('✖ ' + nome + ': ' + (str(e) or type(e).__name__))
    print('')
    print(f'{total - falhas} passaram, {falhas} falharam' if total else 'Nenhum teste encontrado nos arquivos.')
    resultado = 'ok' if total and not falhas else 'falhou'
else:
    try:
        runpy.run_path(plano['entrada'], run_name='__main__')
    except SystemExit as e:
        resultado = 'ok' if not e.code else 'falhou'
    except Exception:
        traceback.print_exc(); resultado = 'falhou'
resultado
`;

/** Registra a saída de uma execução (vinda da área isolada) e avisa na conversa. */
export function registrarExecucao(app, pessoa, conv, corpo) {
  exigir(app, pessoa, 'executar');
  const status = ['ok', 'falhou', 'erro', 'tempo_esgotado'].includes(corpo.status) ? corpo.status : 'erro';
  const saida = String(corpo.saida ?? '').slice(0, 20000), modo = corpo.modo === 'testes' ? 'testes' : 'principal';
  const linguagem = ['python', 'javascript'].includes(corpo.linguagem) ? corpo.linguagem : null;
  const arquivo = Number(corpo.arquivo_id) || null;
  if (arquivo && !um(app.db, 'select 1 from arquivos_gerados where id = ? and conversa_id = ?', arquivo, conv.id)) throw erro(404, 'arquivo', 'Arquivo não encontrado.');
  const ms = Math.max(0, Math.min(600000, Number(corpo.ms) || 0));
  const id = Number(exec(app.db, 'insert into execucoes_codigo (conversa_id, arquivo_id, pessoa_id, modo, linguagem, status, saida, ms, criado_em) values (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    conv.id, arquivo, pessoa.id, modo, linguagem, status, saida, ms, AGORA(app)).lastInsertRowid);
  registrar(app, 'code.executed', pessoa.id, { conversa: conv.id, arquivo, modo, linguagem, status, ms });
  // Na conversa, como aviso: a saída real fica visível no histórico (e vai como material na próxima mensagem).
  const rotulo = { ok: 'concluída', falhou: 'com falhas', erro: 'com erro', tempo_esgotado: 'interrompida por tempo' }[status];
  exec(app.db, "insert into mensagens (conversa_id, papel, texto, criado_em) values (?, 'aviso', ?, ?)", conv.id,
    `Execução ${modo === 'testes' ? 'dos testes' : 'do código'}${linguagem ? ` (${linguagem === 'python' ? 'Python' : 'JavaScript'})` : ''} ${rotulo} em ${(ms / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} s, na área isolada do navegador.\n${saida.slice(0, 4000) || '(sem saída)'}`, AGORA(app));
  return { id, status, modo, linguagem, ms };
}
// Saídas ainda não usadas: entram como material na próxima mensagem da pessoa ("corrija o que falhou").
export function execucoesPendentes(app, convId) {
  const lista = todos(app.db, 'select id, modo, linguagem, status, saida, criado_em from execucoes_codigo where conversa_id = ? and usada = 0 order by id', convId);
  return lista.map(e => ({ id: e.id, nome: `Saída da execução ${e.modo === 'testes' ? 'dos testes' : 'do código'} (${e.linguagem || 'código'}, ${({ ok: 'concluída', falhou: 'com falhas', erro: 'com erro', tempo_esgotado: 'interrompida por tempo' })[e.status]})`,
    texto: `Resultado real da execução na área isolada (${e.criado_em}):\n${e.saida || '(sem saída)'}` }));
}
export const marcarExecucoesUsadas = (app, ids) => { for (const id of ids) exec(app.db, 'update execucoes_codigo set usada = 1 where id = ?', id); };

// ---------- publicar ----------
const TOKEN = /^[A-Za-z0-9_-]{20,64}$/;
function urlBase(app) { return (app.identidadeEmail?.()?.url || '').replace(/\/$/, ''); }
export function urlDoSite(app, token) { return `${urlBase(app)}/s/${token}`; }
export function publicarSite(app, pessoa, conv, arquivoId) {
  exigir(app, pessoa, 'publicar');
  const a = um(app.db, "select id, nome, dados from arquivos_gerados where id = ? and conversa_id = ? and mime = 'text/html'", arquivoId, conv.id);
  if (!a) throw erro(404, 'arquivo', 'Site não encontrado nesta conversa.');
  const ja = um(app.db, 'select token from sites_publicados where arquivo_id = ? and removido_em is null', a.id);
  if (ja) return { token: ja.token, url: urlDoSite(app, ja.token), ja: true };
  const token = randomBytes(18).toString('base64url');
  exec(app.db, 'insert into sites_publicados (token, conversa_id, arquivo_id, pessoa_id, nome, dados, criado_em) values (?, ?, ?, ?, ?, ?, ?)', token, conv.id, a.id, pessoa.id, a.nome, a.dados, AGORA(app));
  registrar(app, 'code.published', pessoa.id, { conversa: conv.id, arquivo: a.id, site: token.slice(0, 6) });
  return { token, url: urlDoSite(app, token) };
}
export function despublicar(app, pessoa, token) {
  const s = TOKEN.test(String(token)) && um(app.db, 'select token, pessoa_id, conversa_id from sites_publicados where token = ? and removido_em is null', token);
  if (!s) throw erro(404, 'site', 'Site publicado não encontrado.');
  const gestor = pessoa.admin || pessoa.permissoes?.includes('settings.manage');
  if (s.pessoa_id !== pessoa.id && !gestor) throw erro(403, 'sem_permissao', 'Só quem publicou ou o administrador pode tirar este site do ar.');
  exec(app.db, 'update sites_publicados set removido_em = ?, removido_por = ? where token = ?', AGORA(app), pessoa.id, token);
  registrar(app, 'code.unpublished', pessoa.id, { conversa: s.conversa_id, site: token.slice(0, 6) });
  return { ok: true };
}
// Quem publicou ainda pode publicar? (pessoa ativa, na empresa, com a permissão e sem proibição da empresa)
function publicadorAtivo(app, pessoaId) {
  const p = app.pessoaAtiva ? app.pessoaAtiva(pessoaId) : carregarPessoa(app.db, pessoaId);
  return !!p && pode(app, p, 'publicar');
}
/** Página pública (sem login). true se respondeu. */
export function servirSite(app, token, res) {
  const s = TOKEN.test(String(token)) && um(app.db, 'select dados, pessoa_id from sites_publicados where token = ? and removido_em is null', token);
  if (!s || !publicadorAtivo(app, s.pessoa_id)) {
    res.writeHead(404, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' });
    res.end('<!doctype html><meta charset="utf-8"><title>Página não encontrada</title><p style="font-family:system-ui;margin:3rem">Esta página não está publicada.</p>');
    return true;
  }
  const dados = Buffer.from(s.dados);
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-length': dados.length, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'x-robots-tag': 'noindex, nofollow',
    'content-security-policy': "sandbox allow-scripts allow-forms allow-modals allow-popups; default-src 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com data:; img-src data: blob: https:; script-src 'unsafe-inline'; connect-src 'none'; form-action 'none'; base-uri 'none'" });
  res.end(dados);
  return true;
}
export const publicacoesDaConversa = (app, convId) => todos(app.db, 'select token, arquivo_id, criado_em from sites_publicados where conversa_id = ? and removido_em is null', convId).map(s => ({ ...s, url: urlDoSite(app, s.token) }));

// ---------- repositórios (GitHub) ----------
const REPO = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
const lerRepoCfg = app => um(app.db, 'select * from repositorios_config where id = 1');
export function reposLiberados(app) { return json(lerRepoCfg(app)?.repos, []); }
function tokenGithub(app) { const c = lerRepoCfg(app); return c?.token_cifrado ? decifrar(app.mestra(), json(c.token_cifrado, null)) : null; }
async function gh(app, metodo, caminho, corpo, token = tokenGithub(app)) {
  if (!token) throw erro(409, 'sem_repositorio', 'Nenhum repositório conectado. O administrador conecta em Configurações › Código e sites.');
  const f = app.githubFetch || fetch;
  const r = await f(`${app.githubBase || 'https://api.github.com'}${caminho}`, { method: metodo, signal: AbortSignal.timeout(20000),
    headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'user-agent': 'GreenIA', ...(corpo ? { 'content-type': 'application/json' } : {}) }, body: corpo ? JSON.stringify(corpo) : undefined });
  const t = await r.text();
  let d; try { d = JSON.parse(t); } catch { d = null; }
  if (!r.ok) { const e = erro(r.status === 404 ? 404 : r.status === 401 || r.status === 403 ? 403 : 502, 'github', r.status === 401 ? 'O token do GitHub foi recusado (inválido ou expirado).' : r.status === 403 ? 'O token do GitHub não tem permissão para esta operação.' : r.status === 404 ? 'Repositório ou arquivo não encontrado no GitHub (ou o token não tem acesso a ele).' : r.status === 422 ? `O GitHub recusou a operação: ${String(d?.message || '').slice(0, 160)}` : 'O GitHub não respondeu como esperado.'); e.statusGithub = r.status; throw e; }
  return d;
}
export function estadoRepositorios(app) {
  const c = lerRepoCfg(app);
  return { provedor: 'github', conectado: !!c?.token_cifrado, conta: c?.conta || null, repos: json(c?.repos, []), atualizado_em: c?.atualizado_em || null };
}
export async function salvarRepositorios(app, pessoa, corpo) {
  const atual = lerRepoCfg(app);
  const repos = [...new Set((Array.isArray(corpo.repos) ? corpo.repos : String(corpo.repos || '').split(/[\s,;]+/)).map(s => String(s).trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/, '').replace(/\/$/, '')).filter(Boolean))];
  if (repos.length > 50) throw erro(400, 'repos', 'No máximo 50 repositórios.');
  const ruins = repos.filter(r => !REPO.test(r));
  if (ruins.length) throw erro(400, 'repos', `Use o formato dono/repositório: ${ruins.slice(0, 3).join(', ')}`);
  const token = corpo.token ? String(corpo.token).trim() : null;
  const usar = token || tokenGithub(app);
  if (!usar) throw erro(400, 'token', 'Informe o token do GitHub.');
  const eu = await gh(app, 'GET', '/user', null, usar);
  for (const r of repos) await gh(app, 'GET', `/repos/${r}`, null, usar);   // o token alcança cada repositório liberado
  const cifrado = token ? JSON.stringify(cifrar(app.mestra(), token)) : atual?.token_cifrado;
  exec(app.db, `insert into repositorios_config (id, provedor, token_cifrado, conta, repos, atualizado_em, atualizado_por) values (1, 'github', ?, ?, ?, ?, ?)
    on conflict (id) do update set token_cifrado = excluded.token_cifrado, conta = excluded.conta, repos = excluded.repos, atualizado_em = excluded.atualizado_em, atualizado_por = excluded.atualizado_por`,
  cifrado, String(eu?.login || '').slice(0, 100), JSON.stringify(repos), AGORA(app), pessoa.id);
  registrar(app, 'code.repo_configured', pessoa.id, { repos: repos.length, token_novo: !!token });
  return estadoRepositorios(app);
}
export function desconectarRepositorios(app, pessoa) {
  exec(app.db, 'delete from repositorios_config where id = 1');
  registrar(app, 'code.repo_disconnected', pessoa.id, {});
  return estadoRepositorios(app);
}
// Repositório citado no pedido, entre os liberados pela empresa ("acme/site", "github.com/acme/site" ou só "site").
export function repositorioDoPedido(app, texto) {
  const lib = reposLiberados(app);
  if (!lib.length) return null;
  const t = String(texto || '');
  const url = /github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)/i.exec(t)?.[1]?.replace(/\.git$/, '');
  const cand = url ? [url] : [...t.matchAll(/\b([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\b/g)].map(m => m[1]);
  const achado = cand.map(c => lib.find(r => r.toLowerCase() === c.toLowerCase())).find(Boolean);
  if (achado) return achado;
  if (url || cand.some(c => /^[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+$/.test(c) && !/^\d+\/\d+$/.test(c))) return null;   // citou outro repositório (fora da lista)
  const nomes = lib.filter(r => new RegExp(`\\b${r.split('/')[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(t));
  return nomes.length === 1 ? nomes[0] : (lib.length === 1 && /\b(repositorio|reposit[oó]rio|repo|github)\b/i.test(norm(t)) ? lib[0] : null);
}
export const pedeAlterarRepositorio = texto => /\b(pull request|abr[ae] um pr|abrir um pr|crie um pr|\bpr\b|commit\w*|comit\w*|branch|envie as altera\w*|suba as altera\w*|altere|alterar|corrij\w*|corrigir|implemente|implementar|adicione|adicionar|atualize|atualizar|refator\w*|crie o arquivo|edite)\b/.test(norm(texto));
const CODIGO_REPO = /\.(js|mjs|cjs|jsx|ts|tsx|json|py|java|go|rb|php|cs|c|h|cpp|rs|kt|swift|sql|sh|ya?ml|toml|ini|md|txt|html?|css|scss|vue|svelte|xml|gradle)$|(^|\/)(Dockerfile|Makefile|README[^/]*)$/i;
const FORA_REPO = /(^|\/)(node_modules|\.git|dist|build|vendor|\.venv|venv|__pycache__|\.next|coverage)\/|(^|\/)\.env(\.|$)|package-lock\.json$|yarn\.lock$|pnpm-lock\.yaml$/;
/** Conteúdo do repositório (branch padrão) como material: árvore + arquivos de código, com tetos. */
export async function lerRepositorio(app, repo, { maxArquivos = 80, maxBytes = 250000 } = {}) {
  const info = await gh(app, 'GET', `/repos/${repo}`);
  const ramo = info.default_branch;
  const arvore = await gh(app, 'GET', `/repos/${repo}/git/trees/${encodeURIComponent(ramo)}?recursive=1`);
  const todosArq = (arvore.tree || []).filter(x => x.type === 'blob' && !FORA_REPO.test(x.path));
  const codigo = todosArq.filter(x => CODIGO_REPO.test(x.path) && (x.size || 0) <= 60000).sort((a, b) => a.path.split('/').length - b.path.split('/').length || a.path.localeCompare(b.path));
  const partes = [];
  let bytes = 0;
  for (const x of codigo) {
    if (partes.length >= maxArquivos || bytes + (x.size || 0) > maxBytes) break;
    const b = await gh(app, 'GET', `/repos/${repo}/git/blobs/${x.sha}`);
    const t = Buffer.from(b.content || '', b.encoding === 'base64' ? 'base64' : 'utf8').toString('utf8');
    if (t.includes('\u0000')) continue;
    bytes += t.length;
    partes.push(`### Arquivo: ${x.path}\n\`\`\`\n${t.replace(/\n?$/, '')}\n\`\`\``);
  }
  const fora = codigo.length - partes.length;
  return { repo, ramo, arquivos: partes.length, texto: `Repositório ${repo} (branch ${ramo}): ${todosArq.length} arquivos no total; ${partes.length} arquivos de código abaixo${fora > 0 ? ` (${fora} ficaram de fora pelo limite de tamanho; peça um caminho específico se precisar deles)` : ''}.\nEstrutura:\n${todosArq.slice(0, 300).map(x => `- ${x.path}`).join('\n')}\n\n${partes.join('\n\n')}` };
}
/** Abre um Pull Request com os arquivos (branch novo a partir do principal). Nunca grava no branch principal. */
export async function abrirPullRequest(app, pessoa, repo, { arquivos, titulo, descricao }) {
  exigir(app, pessoa, 'repositorio');
  if (!reposLiberados(app).some(r => r.toLowerCase() === repo.toLowerCase())) throw erro(403, 'repo_nao_liberado', 'Este repositório não está na lista liberada pela empresa.');
  const lista = arquivos.filter(a => a.nome && !FORA_REPO.test(a.nome) && !/(^|\/)\.\.?(\/|$)/.test(a.nome)).slice(0, 60);
  if (!lista.length) throw erro(400, 'sem_arquivos', 'A resposta não trouxe arquivos para gravar no repositório.');
  const info = await gh(app, 'GET', `/repos/${repo}`);
  const base = info.default_branch;
  const ref = await gh(app, 'GET', `/repos/${repo}/git/ref/heads/${encodeURIComponent(base)}`);
  const commitBase = await gh(app, 'GET', `/repos/${repo}/git/commits/${ref.object.sha}`);
  const arvore = await gh(app, 'POST', `/repos/${repo}/git/trees`, { base_tree: commitBase.tree.sha, tree: lista.map(a => ({ path: a.nome, mode: '100644', type: 'blob', content: a.dados })) });
  const msg = String(titulo || 'Alterações propostas pela GreenIA').slice(0, 120);
  const commit = await gh(app, 'POST', `/repos/${repo}/git/commits`, { message: `${msg}\n\nProposto pela GreenIA a pedido de ${pessoa.nome || pessoa.email || 'uma pessoa da empresa'}.`, tree: arvore.sha, parents: [ref.object.sha] });
  const ramo = `greenia/${new Date(AGORA(app)).toISOString().slice(0, 10)}-${randomBytes(3).toString('hex')}`;
  await gh(app, 'POST', `/repos/${repo}/git/refs`, { ref: `refs/heads/${ramo}`, sha: commit.sha });
  const pr = await gh(app, 'POST', `/repos/${repo}/pulls`, { title: msg, head: ramo, base, body: `${String(descricao || '').slice(0, 6000)}\n\n---\nProposto pela GreenIA. Revise antes de aprovar: nada foi gravado no branch \`${base}\`.` });
  registrar(app, 'code.repo_pr', pessoa.id, { repo, pr: pr.number, arquivos: lista.length });
  return { repo, ramo, base, numero: pr.number, url: pr.html_url, arquivos: lista.map(a => a.nome) };
}

// ---------- rotas ----------
export function rotasCodigo(app, r, { minhaConversa }) {
  r.get('/api/conversas/:id/arquivos/:arquivo/executar', ({ pessoa, params, query, res }) => {
    const conv = minhaConversa(app, pessoa, params.id);
    exigir(app, pessoa, 'executar');
    const a = /^[1-9]\d*$/.test(params.arquivo) && um(app.db, "select id, dados from arquivos_gerados where id = ? and conversa_id = ? and mime = 'application/zip'", Number(params.arquivo), conv.id);
    if (!a) throw erro(404, 'arquivo', 'Projeto não encontrado nesta conversa.');
    const arquivos = lerZipProjeto(Buffer.from(a.dados));
    const plano = planoDeExecucao(arquivos, query?.modo === 'testes' ? 'testes' : 'principal');
    // Python inclui o carregamento do Pyodide (alguns segundos, mais numa rede lenta).
    const html = plano ? paginaDeExecucao(arquivos, plano, { limiteMs: plano.linguagem === 'python' ? 90000 : 45000 }) : `<!doctype html><meta charset="utf-8"><script>parent.postMessage({ greeniaExecucao: true, status: 'erro', saida: ${JSON.stringify(query?.modo === 'testes' ? 'Não há arquivos de teste neste projeto (Python: test_*.py; JavaScript: *.test.js).' : 'Não há código Python ou JavaScript para executar neste projeto. Site: use "Ver o site funcionando".')}, ms: 0 }, '*');</script>`;
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'content-security-policy': CSP_EXECUCAO });
    res.end(html);
  });
  r.post('/api/conversas/:id/execucoes', ({ pessoa, params, corpo }) => registrarExecucao(app, pessoa, minhaConversa(app, pessoa, params.id), corpo || {}));
  r.post('/api/conversas/:id/arquivos/:arquivo/publicar', ({ pessoa, params }) => publicarSite(app, pessoa, minhaConversa(app, pessoa, params.id), Number(params.arquivo)));
  r.get('/api/conversas/:id/publicacoes', ({ pessoa, params }) => ({ publicacoes: publicacoesDaConversa(app, minhaConversa(app, pessoa, params.id).id) }));
  r.post('/api/sites/:token/despublicar', ({ pessoa, params }) => despublicar(app, pessoa, params.token));
  r.get('/api/admin/codigo', () => ({ repositorios: estadoRepositorios(app),
    sites: todos(app.db, 'select s.token, s.nome, s.criado_em, s.conversa_id, p.nome as pessoa from sites_publicados s left join pessoas p on p.id = s.pessoa_id where s.removido_em is null order by s.criado_em desc limit 200').map(s => ({ ...s, url: urlDoSite(app, s.token) })) }), { admin: true });
  r.put('/api/admin/codigo/repositorios', async ({ pessoa, corpo }) => salvarRepositorios(app, pessoa, corpo || {}), { admin: true });
  r.del('/api/admin/codigo/repositorios', ({ pessoa }) => desconectarRepositorios(app, pessoa), { admin: true });
}
