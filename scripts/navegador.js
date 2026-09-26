// Apoio às capturas de tela e ao e2e: sobe a GreenIA (IA simulada) numa porta
// livre, entra com o código do email simulado e devolve uma página do Chromium.
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
import { criarApp } from '../src/servidor.js';

const CHROMIUM = ['/opt/pw-browsers/chromium', process.env.CHROMIUM].find(p => p && existsSync(p));

export async function subirComNavegador({ adminEmail = 'admin@empresa-exemplo.com.br', largura = 1280, altura = 820 } = {}) {
  const app = criarApp({ cookieSeguro: false, log: () => {}, adminEmail });
  await new Promise(r => app.servidor.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${app.servidor.address().port}`;
  const navegador = await chromium.launch({ executablePath: CHROMIUM });
  const contexto = await navegador.newContext({ viewport: { width: largura, height: altura }, deviceScaleFactor: 1 });
  // Sem acesso ao Google Fonts no teste: a página usa as fontes do sistema.
  await contexto.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  return {
    app, base, navegador, contexto,
    async entrar(email, pagina) {
      const p = pagina || await contexto.newPage();
      await p.goto(base + '/entrar');
      await p.fill('#email', email);
      await p.click('#btn-email');
      await p.waitForSelector('#codigo', { state: 'visible' });
      const codigo = /(\d{6})/.exec(app.email.enviados.filter(m => m.para === email).at(-1).assunto)[1];
      await p.fill('#codigo', codigo);
      await p.click('#btn-codigo');
      await p.waitForURL(/\/app/);
      return p;
    },
    async fechar() { await navegador.close(); app.servidor.close(); app.servidor.closeAllConnections?.(); },
  };
}
