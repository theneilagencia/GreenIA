// Ponto de entrada: node src/iniciar.js. Sobe o servidor com a configuração das variáveis de ambiente.
import { fileURLToPath } from 'node:url';
import { criarApp } from './servidor.js';
import { criarIndisponivel, criarOpenRouter, criarSimulada } from './ia.js';
import { atualizarCatalogo } from './modelos.js';
import { apagarVencidas } from './conversas.js';
import { agendarBackup } from './backup.js';
import { lerOperadores, lerPlano, verificarAvisos } from './plano.js';

export async function iniciar(env = process.env) {
  const producao = env.NODE_ENV === 'production';
  // Em produção sem chave, sobe com a IA desligada (e avisa), para o admin conseguir entrar e ver o que falta.
  const ia = env.OPENROUTER_API_KEY ? criarOpenRouter({ chave: env.OPENROUTER_API_KEY }) : producao ? criarIndisponivel() : criarSimulada();
  const app = criarApp({
    ia,
    banco: env.BANCO || 'dados/greenia.sqlite',
    adminEmail: env.ADMIN_EMAIL,
    plano: lerPlano(env),
    operadores: lerOperadores(env),
    cookieSeguro: env.COOKIE_SEGURO ? env.COOKIE_SEGURO !== '0' : producao,
  });
  if (!env.OPENROUTER_API_KEY) app.log(producao ? 'ATENÇÃO: sem OPENROUTER_API_KEY. O servidor está no ar, mas a IA está desligada até a chave ser configurada.' : 'Sem OPENROUTER_API_KEY: usando a IA simulada (nada vai para um modelo real).');
  // Tarefas periódicas: retenção de hora em hora, catálogo do OpenRouter uma vez por dia.
  const tarefa = (fn, ms) => { const t = () => Promise.resolve().then(fn).catch(e => app.log('tarefa', e.message)); t(); setInterval(t, ms).unref(); };
  tarefa(() => apagarVencidas(app), 3600e3);
  if (app.plano) { tarefa(() => verificarAvisos(app), 3600e3); app.log(`Plano: ${app.plano.creditos} créditos por mês, reserva de ${app.plano.reserva}.`); }
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

if (process.argv[1] === fileURLToPath(import.meta.url)) await iniciar();
