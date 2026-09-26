// Ajuda dos testes: sobe a aplicação numa porta livre e fala com ela como um navegador.
import { criarApp } from '../src/servidor.js';
import { cliente } from '../scripts/cliente.js';

export async function subir(op = {}) {
  const app = criarApp({ cookieSeguro: false, log: () => {}, adminEmail: 'admin@exemplo.com.br', ...op });
  await new Promise(r => app.servidor.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${app.servidor.address().port}`;
  return { app, base, fechar: () => new Promise(r => { app.servidor.close(r); app.servidor.closeAllConnections?.(); }), cliente: () => cliente(app, base) };
}

// O cliente fica em scripts/ porque a demonstração também usa.
export { cliente };
