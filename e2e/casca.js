// Apoio dos e2e (não é teste): a conta fica no pé da lateral (padrão assistente). Ajuda, Tema, Política de uso de IA,
// Reportar problema, Administração / Usar a GreenIA e Sair estão no menu dela. No celular, a lateral é o menu (#menu).
export async function abrirLateral(p) {
  if (await p.locator('#menu').isVisible() && !(await p.locator('#lateral.aberta').count())) {
    await p.click('#menu'); await p.waitForSelector('#lateral.aberta'); await p.waitForTimeout(300);
  }
}
export async function abrirConta(p) {
  await abrirLateral(p);
  if (await p.getAttribute('#conta', 'aria-expanded') !== 'true') await p.click('#conta');
  await p.waitForSelector('#menu-conta:not([hidden])');
}
// Abre o menu da conta e escolhe o item (seletor dentro do menu, ex.: '#ajuda-tela', '#sair', '[data-contexto="admin"]').
export async function itemConta(p, sel) {
  await abrirConta(p);
  await p.click(`#menu-conta ${sel}`);
}
export const abrirAjudaTela = async p => { await itemConta(p, '#ajuda-tela'); await p.waitForSelector('#ajuda-titulo'); };
