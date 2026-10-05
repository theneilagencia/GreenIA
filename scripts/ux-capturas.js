// Capturas e inspeção de layout em ambiente isolado, sem contas nem serviços reais.
import { mkdirSync } from 'node:fs';
import { subirComNavegador } from './navegador.js';
import { cliente } from './cliente.js';
import { exec, um } from '../src/db.js';
import { salvarConfig } from '../src/config.js';
const pasta = process.argv[2] || 'capturas/ux';
mkdirSync(pasta, { recursive: true });
const N = await subirComNavegador();
try {
  salvarConfig(N.app.db, { empresa: 'Empresa Exemplo', dominios: ['empresa-exemplo.com.br'] });
  const admin = await cliente(N.app, N.base).entrar('admin@empresa-exemplo.com.br');
  const area = (await admin.post('/api/admin/areas', { nome: 'Operações' })).dados.id;
  const qw = (await admin.post('/api/quick-wins', { assistente: { descricao: 'Resuma atas de reunião e organize decisões e próximos passos.' }, areas: [area] })).dados;
  const id = um(N.app.db, "select id from pessoas where email = 'admin@empresa-exemplo.com.br'").id;
  for (let i = 1; i <= 100; i++) exec(N.app.db, "insert into conversas (pessoa_id,titulo,criado_em,atualizado_em) values (?, ?, datetime('now'), datetime('now'))", id, `Trabalho de exemplo ${i}`);
  const p = await N.entrar('admin@empresa-exemplo.com.br');
  await p.emulateMedia({ reducedMotion: 'reduce' });
  const erros = []; p.on('pageerror', e => erros.push(e.message));
  for (const [w, h] of [[1280, 820], [390, 844], [320, 568]]) {
    await p.setViewportSize({ width: w, height: h });
    for (const [nome, rota] of [['entrada', '#/nova'], ['quick-wins', '#/quick-wins'], ['wizard', `#/qw/${qw.id}/ajustar`], ['uso', '#/uso'], ['conhecimento', '#/conhecimento']]) {
      await p.goto(`${N.base}/app${rota}`); await p.waitForSelector('#principal .pagina,#principal .coluna'); await p.waitForTimeout(250);
      console.log(JSON.stringify({ tela: nome, largura: w, overflow: await p.evaluate(() => document.documentElement.scrollWidth - innerWidth) }));
      await p.screenshot({ path: `${pasta}/${nome}-${w}.png` });
    }
    await p.goto(`${N.base}/app#/nova`); await p.waitForSelector('#menu', { state: 'attached' });
    if (await p.locator('#menu').isVisible()) {
      await p.click('#menu'); await p.waitForTimeout(250);
      console.log(JSON.stringify({ menu: w, caixas: await p.locator('[data-item],.ver-todas,.recentes-grupo').evaluateAll(es => es.map(e => ({ item: e.dataset.item || e.className, y: e.getBoundingClientRect().y, height: e.getBoundingClientRect().height }))) }));
      await p.screenshot({ path: `${pasta}/menu-${w}.png` });
    }
  }
  console.log(JSON.stringify({ erros }));
} finally { await N.fechar(); }
