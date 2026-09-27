// Ponto de entrada: node src/iniciar.js. Sobe o servidor com a configuração das variáveis de ambiente.
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { criarPlataforma } from './plataforma/servidor.js';
import { criarApp } from './servidor.js';
import { criarIndisponivel, criarOpenRouter, criarSimulada } from './ia.js';
import { atualizarCatalogo } from './modelos.js';
import { apagarVencidas } from './conversas.js';
import { agendarBackup, fazerBackup } from './backup.js';
import { lerOperadores, lerPlano, verificarAvisos } from './plano.js';
import { lerInstancias } from './operador.js';

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
  if (agendarBackup(app, { hora: env.BACKUP_HORA, pasta: env.BACKUP_PASTA || 'dados/backups', destino: env.BACKUP_DESTINO, manter: Number(env.BACKUP_MANTER || 14), env })) app.log(`Backup diário às ${env.BACKUP_HORA}.`);
  const porta = Number(env.PORTA || env.PORT || 8080);   // PORT: definida por plataformas como o Render
  app.servidor.listen(porta, env.HOST || '0.0.0.0', () => app.log(`GreenIA Lite em http://localhost:${porta}`));
  const parar = () => { app.servidor.close(); app.db.close(); process.exit(0); };
  process.on('SIGTERM', parar);
  process.on('SIGINT', parar);
  return app;
}

// Modo multiempresa (MULTIEMPRESA=1): uma plataforma, um banco de controle e um banco por empresa.
export async function iniciarPlataforma(env = process.env) {
  const producao = env.NODE_ENV === 'production';
  const ia = env.OPENROUTER_API_KEY ? criarOpenRouter({ chave: env.OPENROUTER_API_KEY }) : producao ? criarIndisponivel() : criarSimulada();
  const lista = v => String(v || '').split(/[\s,;]+/).map(e => e.trim().toLowerCase()).filter(Boolean);
  const host = (env.PLATAFORMA_HOST || '').toLowerCase();
  const legado = env.BANCO || 'dados/greenia.sqlite';
  const P = criarPlataforma({
    ia, banco: env.BANCO_PLATAFORMA || 'dados/plataforma.sqlite', pastaEmpresas: env.PASTA_EMPRESAS || 'dados/empresas',
    cookieSeguro: env.COOKIE_SEGURO ? env.COOKIE_SEGURO !== '0' : producao,
    hostPlataforma: host, urlBase: env.PLATAFORMA_URL || (host ? `https://${host}` : ''), subdominioBase: env.PLATAFORMA_SUBDOMINIO || '',
    admins: [...lista(env.PLATAFORMA_ADMINS), ...lista(env.OPERADOR_EMAIL)], paginaInicial: env.PAGINA_INICIAL,
    // A instalação única que já existia vira a primeira empresa (uma vez, com a plataforma vazia).
    legado: existsSync(legado) ? { banco: legado, slug: env.EMPRESA_SLUG, plano: lerPlano(env) } : null,
  });
  if (!env.OPENROUTER_API_KEY) P.log(producao ? 'ATENÇÃO: sem OPENROUTER_API_KEY. A IA está desligada até a chave ser configurada.' : 'Sem OPENROUTER_API_KEY: usando a IA simulada.');
  const tarefa = (fn, ms) => { const t = () => Promise.resolve().then(fn).catch(e => P.log('tarefa', e.message)); t(); setInterval(t, ms).unref(); };
  const todas = fn => () => Promise.all([...P.tenants.values()].map(t => Promise.resolve().then(() => fn(t)).catch(e => P.log('tarefa', e.message))));
  tarefa(todas(apagarVencidas), 3600e3);
  tarefa(todas(t => t.plano && verificarAvisos(t)), 3600e3);
  if (env.OPENROUTER_API_KEY) tarefa(async () => { const [primeiro, ...resto] = [...P.tenants.values()]; if (!primeiro) return; await atualizarCatalogo(primeiro); for (const t of resto) { t.catalogo = primeiro.catalogo; await atualizarCatalogo(t).catch(() => {}); } }, 24 * 3600e3);
  // Backup diário: banco da plataforma e o de cada empresa, em pastas separadas.
  if (/^\d{2}:\d{2}$/.test(env.BACKUP_HORA || '')) {
    const pasta = env.BACKUP_PASTA || 'dados/backups';
    let ultimo = '';
    setInterval(async () => {
      const agora = new Date();
      if (agora.toTimeString().slice(0, 5) !== env.BACKUP_HORA || ultimo === agora.toDateString()) return;
      ultimo = agora.toDateString();
      const op = { destino: env.BACKUP_DESTINO, manter: Number(env.BACKUP_MANTER || 14), env };
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
