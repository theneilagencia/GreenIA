// Ponto de entrada: node src/iniciar.js. Sobe o servidor com a configuração das variáveis de ambiente.
import { CAPACITY_PACK } from './plataforma/catalogo.js';
import { iniciarProgramadas, recuperarProgramadas, rodadaProgramadas } from './qw-programacao.js';
import { conferirSaldo, contaOpenRouter } from './plataforma/consumo.js';
import { conferirChave, impressaoChave } from './plataforma/chave-validade.js';
import { mascarar } from './plataforma/segredo.js';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { criarPlataforma, origemChaveOpenRouter } from './plataforma/servidor.js';
import { criarProvedorRender, pendentes, verificarDominio } from './plataforma/dominio.js';
import { criarApp } from './servidor.js';
import { smtpDeVariaveis } from './email.js';
import { criarIndisponivel, criarOpenRouter, criarSimulada } from './ia.js';
import { atualizarCatalogo } from './modelos.js';
import { apagarVencidas } from './conversas.js';
import { agendarBackup, fazerBackup, carimboDe, limiteS3 } from './backup.js';
import { configS3, enviarEnvelopeS3 } from './backup-s3.js';
import { segredoEnvelopeDe, selarChaveMestra } from './chave-recuperacao.js';
import { avisarBackups, lerEstado, registrarFalha, registrarRodada, registrarSucesso } from './plataforma/backup-estado.js';
import { consolidarWal, todos } from './db.js';
import { registrar } from './eventos.js';
import { auditar } from './plataforma/auditoria.js';
import { prazosDe, rodadaRetencao } from './retencao.js';
import { rodadaExclusoes, rodadaDevolucoes } from './plataforma/encerramento.js';
import { rodadaExportacoes } from './plataforma/exportacoes.js';
import { rodadaContatos } from './plataforma/contatos.js';
import { lerOperadores, lerPlano, verificarAvisos } from './plano.js';
import { lerInstancias } from './operador.js';

// S3 (desligado sem BACKUP_DESTINO). A expiração não é mais aceita por declaração (S3_LIFECYCLE_DIAS): antes do
// primeiro envio de cada rodada, a regra de ciclo de vida e o versionamento do bucket são LIDOS e conferidos
// (src/backup-s3.js); sem expiração em até o prazo da política, nada é enviado e a falha vira alerta.
export function destinoS3(env, log = () => {}) {
  if (!env.BACKUP_DESTINO) return undefined;
  if (env.S3_LIFECYCLE_DIAS) log('S3_LIFECYCLE_DIAS é ignorado: a expiração do bucket é conferida no próprio bucket antes de cada rodada de envio.');
  return env.BACKUP_DESTINO;
}

export async function iniciar(env = process.env) {
  if (env.MULTIEMPRESA === '1') return iniciarPlataforma(env);
  const producao = env.NODE_ENV === 'production';
  // Em produção sem chave, sobe com a IA desligada (e avisa), para o admin conseguir entrar e ver o que falta.
  const ia = env.OPENROUTER_API_KEY ? criarOpenRouter({ chave: env.OPENROUTER_API_KEY }) : producao ? criarIndisponivel() : criarSimulada();
  const app = criarApp({
    ia,
    banco: env.BANCO || 'dados/greenia.sqlite',
    adminEmail: env.ADMIN_EMAIL,
    plano: lerPlano(env),
    operadores: lerOperadores(env),
    paginaInicial: env.PAGINA_INICIAL,
    operacao: {
      token: env.OPERADOR_TOKEN && env.OPERADOR_TOKEN.length >= 24 ? env.OPERADOR_TOKEN : null,
      instancias: lerInstancias(env.INSTANCIAS),
      custoInfraUsd: Number(env.CUSTO_INFRA_USD) || 0,
      pacote: { creditos: Number(env.PACOTE_CREDITOS) || CAPACITY_PACK.creditos, precoUsd: Number(env.PACOTE_PRECO_USD) || CAPACITY_PACK.preco_usd },   // Capacity Pack
    },
    cookieSeguro: env.COOKIE_SEGURO ? env.COOKIE_SEGURO !== '0' : producao,
  });
  if (!env.OPENROUTER_API_KEY) app.log(producao ? 'ATENÇÃO: sem OPENROUTER_API_KEY. O servidor está no ar, mas a IA está desligada até a chave ser configurada.' : 'Sem OPENROUTER_API_KEY: usando a IA simulada (nada vai para um modelo real).');
  // Tarefas periódicas: retenção de hora em hora, catálogo do OpenRouter uma vez por dia.
  const tarefa = (fn, ms) => { const t = () => Promise.resolve().then(fn).catch(e => app.log('tarefa', e.message)); t(); setInterval(t, ms).unref(); };
  tarefa(() => apagarVencidas(app), 3600e3);
  if (app.plano) { tarefa(() => verificarAvisos(app), 3600e3); app.log(`Plano: ${app.plano.creditos} créditos por mês, reserva de ${app.plano.reserva}.`); }
  if (env.OPERADOR_TOKEN && env.OPERADOR_TOKEN.length < 24) app.log('ATENÇÃO: OPERADOR_TOKEN com menos de 24 caracteres foi ignorado.');
  if (env.OPENROUTER_API_KEY) tarefa(() => atualizarCatalogo(app), 24 * 3600e3);
  // Backup diário opcional (BACKUP_HORA=03:00).
  if (agendarBackup(app, { hora: env.BACKUP_HORA, pasta: env.BACKUP_PASTA || 'dados/backups', destino: destinoS3(env, app.log), manter: Number(env.BACKUP_MANTER || 14), env })) app.log(`Backup diário às ${env.BACKUP_HORA}.`);
  // Retenção das cópias e consolidação do WAL, de hora em hora (docs/politica-retencao.md).
  const banco = env.BANCO || 'dados/greenia.sqlite';
  tarefa(() => rodadaRetencao({ dados: dirname(banco), bancos: { dbs: [app.db], arquivos: [banco] }, prazos: prazosDe(env), aplicar: env.RETENCAO_APLICAR === '1',
    log: app.log, auditar: (acao, dados) => registrar(app, acao, null, dados), consolidar: consolidarWal }), 3600e3);
  const porta = Number(env.PORTA || env.PORT || 8080);   // PORT: definida por plataformas como o Render
  const pararProgramadas = iniciarProgramadas(app);
  app.servidor.once('close', pararProgramadas);
  app.servidor.listen(porta, env.HOST || '0.0.0.0', () => app.log(`GreenIA Lite em http://localhost:${porta}`));
  const parar = () => { app.servidor.close(); app.db.close(); process.exit(0); };
  process.on('SIGTERM', parar);
  process.on('SIGINT', parar);
  return app;
}

// Lista de administradores da plataforma versionada no repositório (um email por linha, # comenta).
export function lerAdminsArquivo(arquivo) {
  if (!arquivo || !existsSync(arquivo)) return [];
  return readFileSync(arquivo, 'utf8').split('\n').map(l => l.replace(/#.*/, '').trim().toLowerCase()).filter(l => /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(l));
}

// Modo multiempresa (MULTIEMPRESA=1): uma plataforma, um banco de controle e um banco por empresa.
// Rodada de backup: o banco da plataforma e o de TODAS as empresas cadastradas (inclusive as que não estão abertas),
// cada um na sua pasta; sucesso e falha por banco ficam na auditoria e no estado (src/plataforma/backup-estado.js).
export async function backupDaPlataforma(P, { pasta, env = process.env, ...op }, copiar = fazerBackup) {
  const real = typeof P.db?.prepare === 'function';
  const abertos = new Set(P.tenants.keys());
  const fechados = real ? todos(P.db, 'select id from companies order by id').map(c => c.id).filter(id => !abertos.has(id)) : [];
  const bancos = [['plataforma', () => P.db], ...[...P.tenants].map(([id, t]) => [id, () => t.db]),
    ...fechados.map(id => [id, () => { const t = P.tenant(id); if (!t) throw Object.assign(new Error('ambiente indisponível'), { code: 'TENANT_INDISPONIVEL' }); return t.db; }])];
  const r = { total: bancos.length, concluidos: 0, falhas: 0, s3: !!op.destino };
  const verificacao = {};
  const agora = op.agora || (P.agora ? P.agora() : new Date());
  let mestra = null;
  try { mestra = P.mestra?.() || null; } catch { /* sem chave-mestra: a cifra do S3 é conferida só contra CHAVE_MESTRA */ }
  for (const [id, abrir] of bancos) {
    try {
      const b = await copiar(abrir(), { ...op, env, agora, banco: id, verificacao, mestra, pasta: join(pasta, id) });
      r.concluidos++;
      P.log(`backup confirmado: ${id}; ${b.tamanho} bytes; sha256 ${b.sha256}${b.s3 ? `; S3 ${b.s3.objeto}${b.s3.sse ? ` (SSE ${b.s3.sse})` : ''}` : ''}`);
      if (real) registrarSucesso(P, id, b);
    } catch (e) {
      r.falhas++;
      const codigo = /^[A-Z0-9_]{1,60}$/.test(String(e.code || '')) ? e.code : 'erro';
      P.log(`backup de ${id} falhou (${codigo}${e.etapa === 's3' ? '; o backup local foi feito' : ''})`);
      if (real) registrarFalha(P, id, e);
    }
  }
  if (verificacao.resultado) { const c = verificacao.resultado; r.ciclo = { ok: c.ok, motivo: c.motivo, totalDias: c.totalDias, versionamento: c.versionamento, limiteDias: c.limiteDias }; }
  // Envelope selado da chave-mestra junto das cópias no S3 (só com BACKUP_ENVELOPE_SEGREDO, separado das outras chaves).
  if (op.destino && real) {
    try {
      const segredo = segredoEnvelopeDe(env);
      if (segredo) {
        const cfg = configS3(op.destino, env, { mestra });
        const x = await enviarEnvelopeS3(cfg, { envelope: selarChaveMestra(mestra, segredo, { agora }), carimbo: carimboDe(agora), limiteDias: limiteS3(env), verificacao });
        r.envelope = x.impressao;
        P.log(`envelope da chave-mestra enviado (${x.impressao})`);
      }
    } catch (e) { r.envelope = false; P.log(`envelope da chave-mestra não enviado (${/^[A-Z0-9_]{1,60}$/.test(String(e.code || '')) ? e.code : 'erro'})`); }
  }
  P.log(`backup diário ${r.falhas ? 'incompleto' : 'concluído'}: ${r.concluidos}/${r.total} bancos; ${r.falhas} falhas`);
  if (real) registrarRodada(P, r);
  return r;
}

// Agenda a rodada diária. A hora (HH:MM, relógio do servidor, UTC no contêiner) e a última rodada gravada no banco
// decidem: depois de um reinício que pulou a hora, a rodada do dia roda assim que o processo volta (não espera 24 h).
export function rodadaDevida(P, hora, agora = P.agora()) {
  const [h, m] = hora.split(':').map(Number);
  const marco = new Date(agora); marco.setHours(h, m, 0, 0);
  if (agora < marco) return false;
  const ultima = Date.parse(lerEstado(P).rodada?.em || '') || 0;
  return ultima < marco.getTime();
}

export async function iniciarPlataforma(env = process.env) {
  const producao = env.NODE_ENV === 'production';
  const ia = env.OPENROUTER_API_KEY ? criarOpenRouter({ chave: env.OPENROUTER_API_KEY }) : producao ? criarIndisponivel() : criarSimulada();
  const lista = v => String(v || '').split(/[\s,;]+/).map(e => e.trim().toLowerCase()).filter(Boolean);
  const host = (env.PLATAFORMA_HOST || '').toLowerCase();
  const legado = env.BANCO || 'dados/greenia.sqlite';
  const P = criarPlataforma({
    ia, chaveVariavel: mascarar(env.OPENROUTER_API_KEY), fuso: env.PLATAFORMA_FUSO || undefined, banco: env.BANCO_PLATAFORMA || 'dados/plataforma.sqlite', pastaEmpresas: env.PASTA_EMPRESAS || 'dados/empresas',
    cookieSeguro: env.COOKIE_SEGURO ? env.COOKIE_SEGURO !== '0' : producao,
    hostPlataforma: host, urlBase: env.PLATAFORMA_URL || (host ? `https://${host}` : ''), subdominioBase: env.PLATAFORMA_SUBDOMINIO || '',
    smtpPadrao: { url: smtpDeVariaveis(env), remetente: env.SMTP_REMETENTE || '' }, avisarSemEmail: producao,
    admins: [...lista(env.PLATAFORMA_ADMINS), ...lista(env.OPERADOR_EMAIL), ...lerAdminsArquivo(env.PLATAFORMA_ADMINS_ARQUIVO || 'deploy/admins-plataforma.txt')], paginaInicial: env.PAGINA_INICIAL,
    // Destinatários comerciais recebem apenas o aviso; esta configuração não concede acesso ao console.
    contatosVendasEmails: lista(env.CONTATO_VENDAS_EMAIL),
    // Domínio próprio das empresas cadastrado sozinho no Render (opcional): chave e serviço só em variáveis do servidor.
    provedorDominios: env.RENDER_API_KEY && env.RENDER_SERVICE_ID ? criarProvedorRender({ chave: env.RENDER_API_KEY, servico: env.RENDER_SERVICE_ID, alvo: env.RENDER_ALVO || '' }) : null,
    // A instalação única que já existia vira a primeira empresa (uma vez, com a plataforma vazia).
    legado: existsSync(legado) ? { banco: legado, slug: env.EMPRESA_SLUG, plano: lerPlano(env) } : null,
    exclusaoAplicar: env.EXCLUSAO_APLICAR === '1',
  });
  // Chave da variável: identificada por impressão digital (HMAC com a chave-mestra), nunca pela chave.
  // Mudar a variável gera outra impressão: o ciclo de troca e os avisos recomeçam para a chave nova.
  if (env.OPENROUTER_API_KEY) P.chaveVariavelId = impressaoChave(P.mestra(), env.OPENROUTER_API_KEY);
  const iaReal = () => P.ia.configurada !== false && !P.ia.simulada;
  if (!iaReal()) P.log(producao ? 'ATENÇÃO: sem chave do OpenRouter. A IA está desligada até a chave ser informada no console (Uso) ou em OPENROUTER_API_KEY.' : 'Sem chave do OpenRouter: usando a IA simulada.');
  const tarefa = (fn, ms) => { const t = () => Promise.resolve().then(fn).catch(e => P.log('tarefa', e.message)); t(); setInterval(t, ms).unref(); };
  const todas = fn => () => Promise.all([...P.tenants.values()].map(t => Promise.resolve().then(() => fn(t)).catch(e => P.log('tarefa', e.message))));
  for (const t of P.tenants.values()) recuperarProgramadas(t);
  // Uma empresa por vez; a fila local guarda o progresso mesmo durante reinícios.
  let programando = false;
  const programadas = setInterval(async () => {
    if (programando) return;
    programando = true;
    try { for (const t of P.tenants.values()) {try{await rodadaProgramadas(t);}catch{P.log('programações','falha na rodada da empresa');}} }
    catch { P.log('programações', 'falha na rodada'); }
    finally { programando = false; }
  }, 30000);
  programadas.unref();
  P.servidor.once('close', () => clearInterval(programadas));
  tarefa(todas(apagarVencidas), 3600e3);
  // Retenção das cópias e consolidação do WAL de todos os bancos, de hora em hora (docs/politica-retencao.md).
  P.retencao = prazosDe(env);
  const dadosRaiz = dirname(env.BANCO_PLATAFORMA || 'dados/plataforma.sqlite');
  tarefa(() => rodadaRetencao({ dados: dadosRaiz, prazos: P.retencao, aplicar: env.RETENCAO_APLICAR === '1', log: P.log, consolidar: consolidarWal,
    bancos: { dbs: [P.db, ...[...P.tenants.values()].map(t => t.db)], arquivos: [env.BANCO_PLATAFORMA || 'dados/plataforma.sqlite', ...todos(P.db, 'select banco from companies').map(x => x.banco)] },
    auditar: (acao, d) => auditar(P, { acao, entidade: 'retention', id: d.caminho || null, depois: d, origem: { painel: 'retencao' } }) }), 3600e3);
  tarefa(todas(t => t.plano && verificarAvisos(t)), 3600e3);
  // Encerramento (src/plataforma/encerramento.js): exclusão definitiva automática 30 dias depois do cancelamento
  // (EXCLUSAO_APLICAR=1; sem ela, dry-run), links de devolução vencidos, cópias de exportação com prazo vencido e
  // contatos comerciais sem interação há 24 meses (estes dois seguem RETENCAO_APLICAR).
  const retencaoAplicar = env.RETENCAO_APLICAR === '1';
  tarefa(() => { rodadaDevolucoes(P); rodadaExclusoes(P, { aplicar: P.exclusaoAplicar, log: P.log }); rodadaExportacoes(P, { aplicar: retencaoAplicar, log: P.log }); rodadaContatos(P, { aplicar: retencaoAplicar, log: P.log }); }, 3600e3);
  // Domínios próprios ainda não confirmados: confere o DNS a cada 30 minutos.
  tarefa(async () => { for (const id of pendentes(P)) await verificarDominio(P, id); }, 1800e3);
  if (P.provedorDominios) P.log('Domínios próprios: cadastro automático no Render ligado.');
  // Saldo de IA no OpenRouter: confere a cada hora e avisa os admins da plataforma quando fica baixo.
  tarefa(() => iaReal() && conferirSaldo(P), 3600e3);
  // Validade e rotação da chave do OpenRouter: confere a cada hora e avisa por email a cada estágio
  // (30, 7 e 1 dia antes, no vencimento, rotação atrasada ou chave recusada).
  const validade = async () => { if (iaReal()) await contaOpenRouter(P, { forcar: true }).catch(() => null); const cfg = origemChaveOpenRouter(P); if (cfg.id) await conferirChave(P, cfg); };
  tarefa(validade, 3600e3);
  const catalogo = async () => { if (!iaReal()) return; const [primeiro, ...resto] = [...P.tenants.values()]; if (!primeiro) return; await atualizarCatalogo(primeiro); for (const t of resto) { t.catalogo = primeiro.catalogo; await atualizarCatalogo(t).catch(() => {}); } };
  tarefa(catalogo, 24 * 3600e3);
  // Chave nova no console: atualiza o catálogo de modelos e o saldo logo, sem esperar o próximo ciclo.
  P.aoTrocarIA = () => { catalogo().catch(e => P.log('catálogo', e.message)); if (iaReal()) conferirSaldo(P).catch(() => {}); validade().catch(() => {}); };
  // Backup diário: banco da plataforma e o de cada empresa, em pastas separadas; conferência do conjunto de hora em
  // hora (banco sem backup há mais de 26 h, falha, S3 recusado) com aviso no console e email aos admins da plataforma.
  P.backup = { hora: /^\d{2}:\d{2}$/.test(env.BACKUP_HORA || '') ? env.BACKUP_HORA : null, pasta: env.BACKUP_PASTA || 'dados/backups', s3: !!destinoS3(env) };
  if (P.backup.hora) {
    let rodando = false;
    setInterval(async () => {
      if (rodando || !rodadaDevida(P, P.backup.hora)) return;
      rodando = true;
      try {
        const op = { destino: destinoS3(env, P.log), manter: Number(env.BACKUP_MANTER || 14), env };
        await backupDaPlataforma(P, { ...op, pasta: P.backup.pasta });
        await avisarBackups(P);
      } catch (e) { P.log('backup diário', e.message); } finally { rodando = false; }
    }, 30e3).unref();
    P.log(`Backup diário às ${env.BACKUP_HORA}${P.backup.s3 ? ', com cópia cifrada no S3 (expiração do bucket conferida antes do envio)' : ''}.`);
  } else if (producao) P.log('ATENÇÃO: sem BACKUP_HORA, o backup automático está desligado.');
  if (P.backup.hora || producao) tarefa(() => avisarBackups(P), 3600e3);
  const porta = Number(env.PORTA || env.PORT || 8080);
  P.servidor.listen(porta, env.HOST || '0.0.0.0', () => P.log(`GreenIA multiempresa em http://localhost:${porta} (console em /plataforma)`));
  const parar = () => { P.servidor.close(); for (const t of P.tenants.values()) t.db.close(); P.db.close(); process.exit(0); };
  process.on('SIGTERM', parar);
  process.on('SIGINT', parar);
  return P;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await iniciar();
