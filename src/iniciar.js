// Ponto de entrada: node src/iniciar.js. Sobe o servidor com a configuração das variáveis de ambiente.
import { fileURLToPath } from 'node:url';
import { criarApp } from './servidor.js';
import { criarOpenRouter, criarSimulada } from './ia.js';
import { atualizarCatalogo } from './modelos.js';
import { apagarVencidas } from './conversas.js';
import { agendarBackup } from './backup.js';

export async function iniciar(env = process.env) {
  const producao = env.NODE_ENV === 'production';
  if (producao && !env.OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY é obrigatória em produção.');
  const ia = env.OPENROUTER_API_KEY ? criarOpenRouter({ chave: env.OPENROUTER_API_KEY }) : criarSimulada();
  const app = criarApp({
    ia,
    banco: env.BANCO || 'dados/greenia.sqlite',
    adminEmail: env.ADMIN_EMAIL,
    cookieSeguro: env.COOKIE_SEGURO ? env.COOKIE_SEGURO !== '0' : producao,
  });
  if (!env.OPENROUTER_API_KEY) app.log('Sem OPENROUTER_API_KEY: usando a IA simulada (nada vai para um modelo real).');
  // Tarefas periódicas: retenção de hora em hora, catálogo do OpenRouter uma vez por dia.
  const tarefa = (fn, ms) => { const t = () => Promise.resolve().then(fn).catch(e => app.log('tarefa', e.message)); t(); setInterval(t, ms).unref(); };
  tarefa(() => apagarVencidas(app), 3600e3);
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
