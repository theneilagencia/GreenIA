// Gera as imagens de teste do OCR (test/fixtures): texto preto sobre fundo branco, como uma foto ou um scan
// de documento, em PNG e JPEG (o JPEG vira página de PDF escaneado nos testes). Uso: node scripts/fixtures-ocr.js
import { chromium } from 'playwright-core';
import { writeFileSync, mkdirSync } from 'node:fs';

const DOCS = {
  reuniao: ['Reuniao comercial - cliente Grupo Horizonte', 'Carla Mendes, gerente de marketing: campanha ate 15/10',
    'Bruno Alves, diretor comercial: proposta ate 03/10', 'Decisao: lancamento online, orcamento R$ 40.000'],
  cadastro: ['Cadastro do cliente', 'Maria Souza', 'CPF 529.982.247-25'],
  segredo: ['Acesso ao servidor', 'senha: Primavera2026'],
  laudo: ['Laudo medico do colaborador', 'Diagnostico: depressao'],
};
const pasta = new URL('../test/fixtures/', import.meta.url);
mkdirSync(pasta, { recursive: true });
const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' });
const p = await b.newPage({ viewport: { width: 1000, height: 420 }, deviceScaleFactor: 1 });
for (const [nome, linhas] of Object.entries(DOCS)) {
  await p.setContent(`<body style="margin:0;background:#fff"><div style="font:28px/1.5 Arial;color:#000;padding:30px">${linhas.map(l => `<div>${l}</div>`).join('')}</div></body>`);
  writeFileSync(new URL(`${nome}.png`, pasta), await p.screenshot({ type: 'png' }));
  writeFileSync(new URL(`${nome}.jpg`, pasta), await p.screenshot({ type: 'jpeg', quality: 85 }));
}
await p.setContent('<body style="margin:0;background:linear-gradient(90deg,#3a7,#2b6)"></body>');
writeFileSync(new URL('sem-texto.png', pasta), await p.screenshot({ type: 'png' }));
await b.close();
