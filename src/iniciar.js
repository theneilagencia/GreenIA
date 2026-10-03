// Ponto de entrada: node src/iniciar.js. Sobe o servidor com a configuração das variáveis de ambiente.
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
import { agendarBackup, fazerBackup } from './backup.js';
import { consolidarWal, todos } from './db.js';
import { registrar } from './eventos.js';
import { auditar } from './plataforma/auditoria.js';
import { prazosDe, rodadaRetencao } from './retencao.js';
import { rodadaExclusoes, rodadaDevolucoes } from './plataforma/encerramento.js';
import { rodadaExportacoes } from './plataforma/exportacoes.js';
import { rodadaContatos } from './plataforma/contatos.js';
import { lerOperadores, lerPlano, verificarAvisos } from './plano.js';
import { lerInstancias } from './operador.js';

// S3 só com regra de expiração declarada no bucket (S3_LIFECYCLE_DIAS de 1 a 7), igual ou menor que a retenção
// local: sem isso, as cópias no S3 ficariam sem prazo (docs/politica-retencao.md). A regra é configurada no bucket.
export function destinoS3(env, log = () => {}) {
  if (!env.BACKUP_DESTINO) return undefined;
  const dias = Number(env.S3_LIFECYCLE_DIAS);
  if (Number.isInteger(dias) && dias >= 1 && dias <= 7) return env.BACKUP_DESTINO;
  log('ATENÇÃO: BACKUP_DESTINO ignorado: declare em S3_LIFECYCLE_DIAS (1 a 7) a expiração configurada no bucket. Sem ela, as cópias no S3 não teriam prazo.');
  return undefined;
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
      pacote: { creditos: Number(env.PACOTE_CREDITOS) || 10000, precoUsd: Number(env.PACOTE_PRECO_USD) || 250 },
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
  // Backup diário: banco da plataforma e o de cada empresa, em pastas separadas.
  if (/^\d{2}:\d{2}$/.test(env.BACKUP_HORA || '')) {
    const pasta = env.BACKUP_PASTA || 'dados/backups';
    let ultimo = '';
    setInterval(async () => {
      const agora = new Date();
      if (agora.toTimeString().slice(0, 5) !== env.BACKUP_HORA || ultimo === agora.toDateString()) return;
      ultimo = agora.toDateString();
      const op = { destino: destinoS3(env, P.log), manter: Number(env.BACKUP_MANTER || 14), env };
      try { await fazerBackup(P.db, { ...op, pasta: join(pasta, 'plataforma'), destino: op.destino && `${op.destino.replace(/\/$/, '')}/plataforma` }); } catch (e) { P.log('backup da plataforma falhou', e.message); }
      for (const [id, t] of P.tenants) {
        try { await fazerBackup(t.db, { ...op, pasta: join(pasta, id), destino: op.destino && `${op.destino.replace(/\/$/, '')}/${id}` }); } catch (e) { P.log(`backup da empresa ${id} falhou`, e.message); }
      }
      P.log('backup diário concluído');
    }, 30e3).unref();
    P.log(`Backup diário às ${env.BACKUP_HORA}.`);
  }
  const porta = Number(env.PORTA || env.PORT || 8080);
  P.servidor.listen(porta, env.HOST || '0.0.0.0', () => P.log(`GreenIA multiempresa em http://localhost:${porta} (console em /plataforma)`));
  const parar = () => { P.servidor.close(); for (const t of P.tenants.values()) t.db.close(); P.db.close(); process.exit(0); };
  process.on('SIGTERM', parar);
  process.on('SIGINT', parar);
  return P;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await iniciar();
