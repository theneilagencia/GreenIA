// Sobe o servidor com a configuração das variáveis de ambiente.
import { criarApp } from './servidor.js';

export async function iniciar(env = process.env) {
  const producao = env.NODE_ENV === 'production';
  const app = criarApp({
    banco: env.BANCO || 'dados/greenia.sqlite',
    adminEmail: env.ADMIN_EMAIL,
    cookieSeguro: env.COOKIE_SEGURO ? env.COOKIE_SEGURO !== '0' : producao,
  });
  const porta = Number(env.PORTA || 8080);
  app.servidor.listen(porta, env.HOST || '0.0.0.0', () => app.log(`GreenIA Lite em http://localhost:${porta}`));
  const parar = () => { app.servidor.close(); app.db.close(); process.exit(0); };
  process.on('SIGTERM', parar);
  process.on('SIGINT', parar);
  return app;
}
