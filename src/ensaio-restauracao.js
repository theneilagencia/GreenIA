// Ensaio de restauração isolado (docs/operacao/backup-e-restauracao.md).
//
// 1. Origem: dados sintéticos multiempresa (plataforma + 2 empresas com marcadores, credencial de conector cifrada)
//    ou, no ensaio real, uma pasta de backups / um prefixo S3 já existente (nunca o disco de produção).
// 2. Backup com o código real (backupDaPlataforma: local + S3 cifrado com expiração conferida).
// 3. Restauração numa pasta NOVA e vazia, com os caminhos dos bancos das empresas remapeados para ela.
// 4. Aplicação no ar sobre a cópia, isolada: 127.0.0.1 em porta aleatória, IA simulada, email só em memória,
//    sem tarefas periódicas (programações, backup, retenção, exclusão), sem provedor de domínios e com toda
//    conexão de rede para fora de 127.0.0.1 bloqueada no processo.
// 5. Validações: integridade SQLite, marcadores por empresa, isolamento entre empresas, credenciais decifradas com
//    a chave recuperada (só impressão digital), login, lista de conversas e abertura de um Quick Win.
// 6. Medidas: RTO (início da restauração até a aplicação pronta) e RPO (idade do backup usado em relação à última
//    escrita). Metas PROPOSTAS: RPO 24 h, RTO 4 h. Não são garantias.
// 7. Descarte: fecha tudo e apaga as cópias do ensaio, conferindo que sumiram.
// Nada aqui imprime chave, segredo ou conteúdo de conversa.
import { request } from 'node:http';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { performance } from 'node:perf_hooks';
import { criarPlataforma } from './plataforma/servidor.js';
import { restaurar, conferir } from './backup.js';
import { configS3, listarS3, maisNovosPorBanco, baixarBackupS3, envelopeMaisNovo, baixarEnvelopeS3 } from './backup-s3.js';
import { abrirEnvelope, impressaoMestra, lerChaveMestraExistente } from './chave-recuperacao.js';
import { decifrar } from './plataforma/segredo.js';
import { guardarSegredo } from './integracoes/segredos.js';
import { backupDaPlataforma } from './iniciar.js';
import { lerAjuste } from './plataforma/db.js';

const sha256 = d => createHash('sha256').update(d).digest('hex');
const ms = (a, b) => Math.round((b - a) * 10) / 10;

export { bloquearRedeExterna } from './rede-isolada.js';
import { bloquearRedeExterna } from './rede-isolada.js';

// ---------------------------------------------------------------- Cliente HTTP (como um navegador)
export function navegador(P, base, host) {
  const jar = new Map();
  let csrf = '';
  const n = {
    host,
    req(metodo, caminho, corpo) {
      const u = new URL(base + caminho);
      const dados = corpo !== undefined ? JSON.stringify(corpo) : null;
      const headers = { host: n.host, ...(jar.size ? { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') } : {}), ...(dados ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(dados) } : {}), ...(metodo !== 'GET' && csrf ? { 'x-csrf': csrf } : {}) };
      return new Promise((ok, falha) => {
        const q = request({ hostname: u.hostname, port: u.port, path: u.pathname + u.search, method: metodo, headers }, r => {
          const partes = [];
          r.on('data', c => partes.push(c));
          r.on('end', () => {
            for (const sc of [].concat(r.headers['set-cookie'] || [])) { const [kv] = sc.split(';'); const i = kv.indexOf('='); const k = kv.slice(0, i), v = kv.slice(i + 1); if (v) jar.set(k, v); else jar.delete(k); }
            const texto = Buffer.concat(partes).toString('utf8');
            let d; try { d = JSON.parse(texto); } catch { d = texto; }
            ok({ status: r.statusCode, dados: d });
          });
        });
        q.on('error', falha);
        if (dados) q.write(dados);
        q.end();
      });
    },
    get: p => n.req('GET', p),
    post: (p, b) => n.req('POST', p, b ?? {}),
    ultimoCodigo: email => /(\d{6})/.exec(P.email.enviados.filter(m => m.para === email).at(-1)?.assunto || '')?.[1],
    async entrarConsole(email) {
      await n.post('/api/plataforma/login/codigo', { email });
      const r = await n.post('/api/plataforma/login/entrar', { email, codigo: n.ultimoCodigo(email) });
      if (r.status !== 200) throw new Error(`login do console falhou (${r.status})`);
      csrf = r.dados.csrf;
      return n;
    },
    async entrarEmpresa(slug, email) {
      await n.get(`/${slug}`);
      const c = await n.post('/api/login/codigo', { email });
      if (c.status !== 200) return c;
      const r = await n.post('/api/login/entrar', { email, codigo: n.ultimoCodigo(email) });
      if (r.status !== 200) return r;
      csrf = r.dados.csrf;
      const pol = await n.get('/api/politica');
      if (pol.status === 200 && pol.dados?.versao) await n.post('/api/politica/ciencia', { versao: pol.dados.versao });
      return r;
    },
    cookies: jar,
  };
  return n;
}

const subir = P => new Promise(r => P.servidor.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${P.servidor.address().port}`)));
const fecharPlataforma = async P => {
  await new Promise(r => { P.servidor.close(() => r()); P.servidor.closeAllConnections?.(); });
  for (const t of P.tenants.values()) { try { t.db.close(); } catch { /* já fechado */ } }
  try { P.db.close(); } catch { /* já fechado */ }
};
const hashArquivos = pasta => {
  const r = {};
  const andar = p => { for (const n of readdirSync(p)) { const c = join(p, n); const s = statSync(c); if (s.isDirectory()) andar(c); else if (/\.sqlite$|\.chave-mestra$/.test(n)) r[relative(pasta, c)] = sha256(readFileSync(c)); } };
  andar(pasta);
  return r;
};

// ---------------------------------------------------------------- 1. Origem sintética
// Monta, numa pasta temporária, uma instalação multiempresa sintética com a aplicação real (pela API), já isolada.
export async function montarOrigemSintetica(pasta, { volumeMb = 0 } = {}) {
  mkdirSync(pasta, { recursive: true });
  const mestra = randomBytes(32);
  writeFileSync(join(pasta, '.chave-mestra'), mestra.toString('base64'), { mode: 0o600 });   // como em produção (sem CHAVE_MESTRA)
  const P = criarPlataforma({ banco: join(pasta, 'plataforma.sqlite'), pastaEmpresas: join(pasta, 'empresas'), isolado: true, chaveMestra: mestra, cookieSeguro: false,
    log: () => {}, admins: ['ops@ensaio.invalid'], hostPlataforma: 'plataforma.ensaio', urlBase: 'http://plataforma.ensaio' });
  const base = await subir(P);
  try {
    const ops = await navegador(P, base, 'plataforma.ensaio').entrarConsole('ops@ensaio.invalid');
    const plano = (await ops.get('/api/plataforma/planos')).dados.planos.find(p => /Company/.test(p.name)) || (await ops.get('/api/plataforma/planos')).dados.planos[0];
    const empresas = [];
    for (const [nome, slug, admin] of [['Alfa Ensaio', 'alfa-ensaio', 'ana@alfa.ensaio.invalid'], ['Beta Ensaio', 'beta-ensaio', 'bia@beta.ensaio.invalid']]) {
      const c = await ops.post('/api/plataforma/empresas', { name: nome, slug, plan_id: plano.id, admin_email: admin, status: 'ativa' });
      if (c.status !== 200) throw new Error(`empresa sintética não criada (${c.status})`);
      if (c.dados.status !== 'ativa') await ops.post(`/api/plataforma/empresas/${c.dados.id}/status`, { status: 'ativa' });
      const marcador = `MARCADOR-${slug}-${randomUUID().slice(0, 8)}`;
      const u = navegador(P, base, 'plataforma.ensaio');
      const login = await u.entrarEmpresa(slug, admin);
      if (login.status !== 200) throw new Error(`login sintético falhou (${login.status})`);
      const area = (await u.post('/api/admin/areas', { nome: `Área ${nome}` })).dados.id;
      const qw = await u.post('/api/quick-wins', { assistente: { descricao: `Conferir pedidos de compra da ${nome} contra notas de entrega` }, areas: [area] });
      if (qw.status !== 200) throw new Error(`Quick Win sintético não criado (${qw.status})`);
      const conv = (await u.post('/api/conversas', {})).dados.conversa;
      const t = P.tenant(c.dados.id);
      t.db.prepare('update conversas set titulo = ? where id = ?').run(`${marcador} conversa`, conv.id);
      t.db.prepare('update quick_wins set nome = ? where id = ?').run(`${marcador} quick win`, qw.dados.id);
      const valor = `credencial-sintetica-${randomBytes(12).toString('hex')}`;
      const ref = guardarSegredo(t, { conectorId: `ensaio-${slug}`, tipo: 'api_key', valor });
      // Volume sintético opcional (mensagens com texto pouco compressível) para medir tempos com bancos maiores.
      if (volumeMb > 0) {
        const ins = t.db.prepare("insert into mensagens (conversa_id, papel, texto, criado_em) values (?, 'user', ?, datetime('now'))");
        t.db.exec('begin');
        for (let i = 0; i < volumeMb * 16; i++) ins.run(conv.id, randomBytes(48 * 1024).toString('base64'));
        t.db.exec('commit');
      }
      empresas.push({ id: c.dados.id, slug, admin, marcador, quickWin: qw.dados.id, conversa: conv.id, segredo: { key_id: ref.key_id, sha256: sha256(valor) } });
    }
    return { P, base, pasta, mestra, impressao: impressaoMestra(mestra), empresas, ultimaEscrita: Date.now() };
  } catch (e) { await fecharPlataforma(P); throw e; }
}

// ---------------------------------------------------------------- 2. Fontes de backup
// Mais novo de cada banco numa pasta local (dados/backups/<banco>/greenia-*.sqlite.gz) ou num prefixo S3.
export async function listarFonte(fonte) {
  if (fonte.tipo === 'local') {
    const r = new Map();
    for (const banco of readdirSync(fonte.pasta)) {
      const p = join(fonte.pasta, banco);
      if (!statSync(p).isDirectory()) continue;
      const f = readdirSync(p).filter(n => /^greenia-\d{8}-\d{6}\.sqlite\.gz$/.test(n)).sort().at(-1);
      if (f) r.set(banco, { banco, arquivo: join(p, f), carimbo: f.slice(8, 23), tamanho: statSync(join(p, f)).size });
    }
    return r;
  }
  const cfg = configS3(fonte.destino, fonte.env);
  const itens = await listarS3(cfg, '', fonte.fetch);
  fonte._envelope = envelopeMaisNovo(itens);
  const r = maisNovosPorBanco(itens);
  for (const v of r.values()) v.arquivo = `s3://${cfg.bucket}/${v.objeto}`;
  return r;
}
const dataDoCarimbo = c => Date.UTC(+c.slice(0, 4), +c.slice(4, 6) - 1, +c.slice(6, 8), +c.slice(9, 11), +c.slice(11, 13), +c.slice(13, 15));

// Destino do ensaio: pasta nova (ou vazia), fora da origem e fora do disco de produção (/app/dados).
export function conferirDestino(destino, { proibidos = [] } = {}) {
  const d = resolve(destino);
  for (const p of ['/app/dados', ...proibidos].filter(Boolean).map(x => resolve(x))) {
    if (d === p || d.startsWith(p + sep) || p.startsWith(d + sep)) throw Object.assign(new Error(`destino do ensaio não pode ficar em ${p} nem conter essa pasta`), { code: 'ENSAIO_DESTINO_PROIBIDO' });
  }
  if (existsSync(d) && readdirSync(d).length) throw Object.assign(new Error('destino do ensaio precisa ser uma pasta nova ou vazia'), { code: 'ENSAIO_DESTINO_OCUPADO' });
  mkdirSync(d, { recursive: true, mode: 0o700 });
  return realpathSync(d);
}

// ---------------------------------------------------------------- 3 a 6. Restaurar, subir isolado e validar
/**
 * @param {object} op
 * @param {{tipo:'local',pasta:string}|{tipo:'s3',destino:string,env:object}} op.fonte
 * @param {string} op.destino pasta nova do ensaio
 * @param {{mestra?:Buffer, envelopeSegredo?:string, env?:object, arquivo?:string}} op.chave como recuperar a chave-mestra
 * @param {object} [op.esperado] marcadores sintéticos (empresas, segredos, marcador pós-backup)
 * @param {number} [op.ultimaEscrita] epoch ms da última escrita conhecida na origem (para o RPO)
 * @param {string[]} [op.proibidos] pastas que o destino não pode tocar (a origem)
 */
export async function ensaiar({ fonte, destino, chave = {}, esperado = null, ultimaEscrita = null, proibidos = [], log = () => {} }) {
  const rel = { inicio: new Date().toISOString(), etapas: {}, bancos: [], verificacoes: [], falhas: [] };
  const ok = (nome, cond, detalhe = '') => { rel.verificacoes.push({ nome, ok: !!cond, detalhe }); if (!cond) rel.falhas.push(nome); log(`${cond ? 'ok   ' : 'FALHA'} ${nome}${detalhe ? ` (${detalhe})` : ''}`); return !!cond; };
  const rede = bloquearRedeExterna();
  const t0 = performance.now();
  let P = null;
  try {
    const raiz = conferirDestino(destino, { proibidos });
    rel.destino = raiz;
    // Lista e escolhe o backup mais novo de cada banco.
    const disponiveis = await listarFonte(fonte);
    const tLista = performance.now();
    const plat = disponiveis.get('plataforma');
    if (!plat) throw Object.assign(new Error('a fonte não tem backup do banco da plataforma'), { code: 'ENSAIO_SEM_PLATAFORMA' });
    const opRest = { env: fonte.env || {}, fetch: fonte.fetch };
    const bancoPlat = join(raiz, 'plataforma.sqlite');
    const rp = await restaurar(plat.arquivo, bancoPlat, { ...opRest, tipo: 'plataforma' });
    rel.bancos.push({ banco: 'plataforma', tipo: 'plataforma', backup: plat.carimbo, tamanho: plat.tamanho, resumo: rp });
    // Empresas: cada banco restaurado em <destino>/empresas/<id>.sqlite; o caminho é remapeado SÓ na cópia.
    const pdb = new DatabaseSync(bancoPlat);
    const empresas = pdb.prepare('select id, slug, banco from companies order by id').all();
    mkdirSync(join(raiz, 'empresas'), { recursive: true, mode: 0o700 });
    for (const c of empresas) {
      const b = disponiveis.get(c.id);
      const alvo = join(raiz, 'empresas', `${c.id}.sqlite`);
      if (!b) { rel.falhas.push(`sem backup: ${c.id}`); rel.bancos.push({ banco: c.id, tipo: 'empresa', backup: null }); pdb.prepare('update companies set banco = ? where id = ?').run(alvo, c.id); continue; }
      const re = await restaurar(b.arquivo, alvo, { ...opRest, tipo: 'empresa' });
      pdb.prepare('update companies set banco = ? where id = ?').run(alvo, c.id);
      rel.bancos.push({ banco: c.id, tipo: 'empresa', backup: b.carimbo, tamanho: b.tamanho, resumo: re });
    }
    const fora = pdb.prepare('select id, banco from companies').all().filter(c => { const r = relative(raiz, resolve(c.banco)); return !r || r.startsWith('..') || isAbsolute(r); });
    const impressaoRegistrada = lerAjuste(pdb, 'chave_mestra_impressao', null)?.impressao || null;
    pdb.close();
    ok('caminhos dos bancos remapeados para a pasta do ensaio', fora.length === 0, `${empresas.length} empresas`);
    const tRestaurado = performance.now();

    // Chave-mestra recuperada (nunca impressa): envelope do S3 + segredo, chave informada, ou CHAVE_MESTRA/arquivo.
    let mestra = chave.mestra || null, origemChave = mestra ? 'informada' : null;
    if (!mestra && chave.envelopeSegredo && fonte.tipo === 's3' && fonte._envelope) {
      mestra = abrirEnvelope(await baixarEnvelopeS3(configS3(fonte.destino, fonte.env), fonte._envelope.objeto, fonte.fetch), chave.envelopeSegredo); origemChave = 'envelope S3';
    } else if (!mestra && chave.envelopeSegredo && chave.envelopeArquivo) { mestra = abrirEnvelope(readFileSync(chave.envelopeArquivo, 'utf8'), chave.envelopeSegredo); origemChave = 'envelope em arquivo'; }
    else if (!mestra && (chave.env?.CHAVE_MESTRA || chave.arquivo)) { mestra = lerChaveMestraExistente({ env: chave.env || {}, arquivo: chave.arquivo }); origemChave = chave.env?.CHAVE_MESTRA ? 'CHAVE_MESTRA' : 'arquivo .chave-mestra'; }
    const impressao = mestra ? impressaoMestra(mestra) : null;
    rel.chave = { origem: origemChave, impressao, registrada: impressaoRegistrada };
    ok('chave-mestra recuperada confere com a impressão digital do banco restaurado', !!mestra && impressao === impressaoRegistrada, `${impressao || 'sem chave'} / ${impressaoRegistrada || 'sem registro'}`);

    // Aplicação no ar sobre a cópia, isolada.
    const logs = [];
    const admins = [];
    P = criarPlataforma({ banco: bancoPlat, pastaEmpresas: join(raiz, 'empresas'), pastaExportacoes: join(raiz, 'exportacoes'), isolado: true, chaveMestra: mestra || randomBytes(32), cookieSeguro: false,
      log: (...a) => logs.push(a.join(' ')), admins, hostPlataforma: 'plataforma.ensaio', urlBase: 'http://plataforma.ensaio' });
    const base = await subir(P);
    const saude = await navegador(P, base, 'plataforma.ensaio').get('/api/saude');
    const tPronto = performance.now();
    ok('aplicação no ar sobre a cópia (/api/saude)', saude.status === 200, base);
    ok('aplicação escuta só em 127.0.0.1', P.servidor.address().address === '127.0.0.1');
    rel.etapas = { listar_ms: ms(t0, tLista), restaurar_ms: ms(tLista, tRestaurado), subir_ms: ms(tRestaurado, tPronto) };
    rel.rto_ms = ms(t0, tPronto);

    // Integridade (PRAGMA integrity_check + foreign_key_check + tabelas esperadas), de novo, nos arquivos restaurados.
    for (const b of rel.bancos.filter(x => x.backup)) {
      const arq = b.tipo === 'plataforma' ? bancoPlat : join(raiz, 'empresas', `${b.banco}.sqlite`);
      let r = null; try { r = conferir(arq, { tipo: b.tipo }); } catch (e) { r = { erro: e.message }; }
      ok(`integridade ${b.banco}`, r && !r.erro, r?.erro || 'integrity_check ok');
    }

    // Credenciais cifradas: todas decifram com a chave recuperada (só contagem e, no sintético, o SHA-256 esperado).
    let total = 0, lidas = 0;
    for (const [id, t] of P.tenants) {
      for (const s of t.db.prepare('select key_id, cifrado from connector_secrets_ref').all()) {
        total++;
        const v = decifrar(P.mestra(), JSON.parse(s.cifrado));
        const esperadoSeg = esperado?.empresas?.find(e => e.id === id)?.segredo;
        if (v != null && (!esperadoSeg || esperadoSeg.key_id !== s.key_id || sha256(v) === esperadoSeg.sha256)) lidas++;
      }
    }
    rel.credenciais = { total, decifradas: lidas };
    ok('credenciais de conectores decifram com a chave recuperada', total === lidas, `${lidas}/${total}`);
    const chaveConsole = lerAjuste(P.db, 'openrouter_chave', null);
    if (chaveConsole?.cifrado) ok('chave do OpenRouter salva no console decifra', decifrar(P.mestra(), chaveConsole.cifrado) != null);

    // Aplicação: login, conversas, Quick Win e isolamento entre empresas.
    const alvos = esperado?.empresas || empresas.slice(0, 2).map(c => ({ id: c.id, slug: c.slug, admin: adminDe(P, c.id) })).filter(x => x.admin);
    const sessoes = [];
    for (const e of alvos) {
      const slug = P.db.prepare('select slug from companies where id = ?').get(e.id)?.slug || e.slug;
      const u = navegador(P, base, 'plataforma.ensaio');
      const login = await u.entrarEmpresa(slug, e.admin);
      ok(`login na empresa ${e.id}`, login.status === 200, `status ${login.status}`);
      const convs = await u.get('/api/conversas?todas=1');
      const titulos = (convs.dados?.conversas || []).map(c => c.titulo);
      ok(`lista de conversas da empresa ${e.id}`, convs.status === 200, `${titulos.length} conversas`);
      const qws = await u.get('/api/quick-wins');
      const qwId = e.quickWin ?? (qws.dados?.quickWins || [])[0]?.id;
      if (qwId != null) {
        const qw = await u.get(`/api/quick-wins/${qwId}`);
        ok(`abre um Quick Win da empresa ${e.id}`, qw.status === 200, `status ${qw.status}`);
        if (e.marcador) ok(`marcador do Quick Win da empresa ${e.id}`, JSON.stringify(qw.dados).includes(e.marcador));
      } else rel.verificacoes.push({ nome: `Quick Win da empresa ${e.id}`, ok: true, detalhe: 'empresa sem Quick Win' });
      if (e.marcador) ok(`marcador da conversa da empresa ${e.id}`, titulos.some(t => t?.includes(e.marcador)));
      sessoes.push({ ...e, slug, u, titulos, qwId });
    }
    if (sessoes.length >= 2) {
      const [a, b] = sessoes;
      if (a.marcador && b.marcador) ok('isolamento: empresa A não vê dados da B (nem B os da A)', !a.titulos.some(t => t?.includes(b.marcador)) && !b.titulos.some(t => t?.includes(a.marcador)));
      // A sessão de A não vale no ambiente de B.
      const cruzada = navegador(P, base, 'plataforma.ensaio');
      for (const [k, v] of a.u.cookies) cruzada.cookies.set(k, v);
      await cruzada.get(`/${b.slug}`);
      const eu = await cruzada.get('/api/eu');
      const qwB = b.qwId != null ? await cruzada.get(`/api/quick-wins/${b.qwId}`) : { status: 401 };
      ok('isolamento: sessão da empresa A não abre o ambiente da B', eu.status !== 200 && qwB.status !== 200, `eu ${eu.status}, quick win ${qwB.status}`);
    }
    if (esperado?.posBackup) {
      const t = P.tenant(esperado.posBackup.empresa);
      const n = t.db.prepare('select count(*) as n from conversas where titulo like ?').get(`%${esperado.posBackup.marcador}%`).n;
      ok('escrita posterior ao backup não está na cópia (janela do RPO)', n === 0);
    }
    ok('nenhum email real: só envios simulados em memória', P.email.enviados.length >= 0 && !logs.some(l => /\[email\] enviado/.test(l)));
    ok('nenhuma conexão externa durante o ensaio', rede.tentativas.length === 0, `${rede.tentativas.length} bloqueadas`);
    rel.rede_bloqueada = rede.tentativas.length;

    // RPO: idade do backup mais novo usado em relação à última escrita (ou ao início do ensaio, no ensaio real).
    const usados = rel.bancos.filter(b => b.backup).map(b => dataDoCarimbo(b.backup));
    const referencia = ultimaEscrita ?? Date.parse(rel.inicio);
    rel.rpo = { referencia: new Date(referencia).toISOString(), backup_mais_antigo_usado: usados.length ? new Date(Math.min(...usados)).toISOString() : null,
      backup_mais_novo_usado: usados.length ? new Date(Math.max(...usados)).toISOString() : null, rpo_s: usados.length ? Math.max(0, Math.round((referencia - Math.min(...usados)) / 1000)) : null };
    rel.tamanhos = Object.fromEntries(rel.bancos.filter(b => b.backup).map(b => [b.banco, b.tamanho]));
  } catch (e) {
    rel.falhas.push(`erro: ${e.code || ''} ${e.message}`.trim());
    log(`FALHA ${e.code || ''} ${e.message}`);
  } finally {
    if (P) await fecharPlataforma(P).catch(() => {});
    rede.desfazer();
  }
  rel.ok = rel.falhas.length === 0;
  return rel;
}

// Admin ativo de uma empresa (para o login do ensaio real; o código vai para o email simulado em memória).
function adminDe(P, companyId) {
  return P.db.prepare(`select u.email from company_users cu join users u on u.id = cu.user_id join role_permissions rp on rp.role_id = cu.role_id and rp.permission_key = 'company.manage'
    where cu.company_id = ? and cu.status = 'ativo' and u.status = 'ativo' order by u.email limit 1`).get(companyId)?.email || null;
}

// ---------------------------------------------------------------- 7. Descarte
export function descartar(pastas) {
  const r = [];
  for (const p of pastas.filter(Boolean)) { rmSync(p, { recursive: true, force: true }); r.push({ pasta: p, removida: !existsSync(p) }); }
  return r;
}

// Ensaio sintético completo (usado pelo teste rápido e por scripts/ensaio-restauracao.mjs sem --backups/--s3).
// O S3 é o falso, local (scripts/ensaio/s3-falso.js), configurado com expiração e versionamento corretos.
export async function ensaioSintetico({ subirS3Falso, lifecycleXml, regraLifecycle, raiz = mkdtempSync(join(tmpdir(), 'greenia-ensaio-')), log = () => {}, manter = false, volumeMb = 0 } = {}) {
  const origem = join(raiz, 'origem'), destino = join(raiz, 'restaurado');
  const s3 = await subirS3Falso({ lifecycle: lifecycleXml(regraLifecycle({ dias: 6, ncDias: 1, prefixo: 'ensaio/' })), versionamento: 'Enabled' });
  const segredoEnvelope = randomBytes(32).toString('base64url');
  const env = { ...s3.env('ensaio'), BACKUP_CHAVE_CIFRA: randomBytes(32).toString('base64'), BACKUP_ENVELOPE_SEGREDO: segredoEnvelope };
  let O = null;
  const rel = { raiz };
  try {
    const t = performance.now();
    O = await montarOrigemSintetica(origem, { volumeMb });
    rel.origem_ms = ms(t, performance.now());
    const tb = performance.now();
    const logsBackup = [];
    O.P.log = s => logsBackup.push(String(s));
    const r = await backupDaPlataforma(O.P, { pasta: join(origem, 'backups'), destino: env.BACKUP_DESTINO, env, manter: 7 });
    rel.backup = { ...r, ms: ms(tb, performance.now()), objetos: s3.objetos.size, bytes_s3: [...s3.objetos.values()].reduce((a, o) => a + o.corpo.length, 0) };
    const ultimaEscritaAntes = Date.now();
    // Escrita depois do backup: precisa faltar na cópia (é o que o RPO mede).
    const pos = `POS-BACKUP-${randomUUID().slice(0, 8)}`;
    const ta = O.P.tenant(O.empresas[0].id);
    ta.db.prepare("insert into conversas (pessoa_id, titulo, criado_em, atualizado_em) select pessoa_id, ?, datetime('now'), datetime('now') from conversas limit 1").run(pos);
    const ultimaEscrita = Date.now();
    await fecharPlataforma(O.P);   // "desastre": a origem não é usada de novo
    const antes = hashArquivos(origem);
    const ensaio = await ensaiar({ fonte: { tipo: 's3', destino: env.BACKUP_DESTINO, env }, destino, chave: { envelopeSegredo: segredoEnvelope },
      esperado: { empresas: O.empresas, posBackup: { empresa: O.empresas[0].id, marcador: pos } }, ultimaEscrita, proibidos: [origem], log });
    const depois = hashArquivos(origem);
    ensaio.verificacoes.push({ nome: 'origem intocada (SHA-256 dos bancos e da chave antes e depois)', ok: JSON.stringify(antes) === JSON.stringify(depois), detalhe: `${Object.keys(antes).length} arquivos` });
    if (JSON.stringify(antes) !== JSON.stringify(depois)) { ensaio.falhas.push('origem alterada'); ensaio.ok = false; }
    ensaio.rpo.ultima_escrita_antes_do_backup = new Date(ultimaEscritaAntes).toISOString();
    Object.assign(rel, { ensaio, impressao: O.impressao, empresas: O.empresas.map(e => e.id), s3: { pedidos: s3.pedidos.length, lifecycle: 'Expiration 6 d + NoncurrentVersionExpiration 1 d, versionamento ligado' } });
    rel.logs_backup = logsBackup;
  } finally {
    await s3.fechar();
    rel.descarte = manter ? [] : descartar([destino, origem, raiz]);
  }
  return rel;
}
