// Governança dos textos fora das páginas comerciais (política, admin, mensagens de bloqueio, avisos de
// privacidade): não podem prometer mais do que a página de vendas e o produto sustentam (docs/claims-lp.md).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { subir } from './ajuda.js';
import { salvarConfig } from '../src/config.js';

const raiz = new URL('../', import.meta.url).pathname;
// Só o que chega a alguém: comentários de código ficam de fora.
const semComentarios = t => t.split('\n').filter(l => !/^\s*(?:\/\/|\*|\/\*)/.test(l)).join('\n').replace(/\s+\/\/ [^'"`\n]*$/gm, '');
const ARQUIVOS = ['src/politica.js', 'src/conversas.js', 'src/config.js', 'src/plataforma/empresas.js', 'public/admin.js', 'public/app.js', 'public/index.html', 'public/landing.js', 'public/vendas.html'];

// Formulações retiradas (OUT-27 a OUT-31): absolutas ou mais fortes que o comportamento real.
const PROIBIDO = {
  'OUT-27 salvos só para você': /(?:salv|guardad)[oa]s?\s+só\s+para\s+você/i,
  'OUT-28 ninguém lê o conteúdo': /leem\s+o\s+conteúdo/i,
  'OUT-29 nunca são enviados': /nunca\s+são\s+enviad/i,
  'OUT-30 proteção quando necessária': /aplica\s+a\s+proteção\s+quando\s+ela\s+é\s+necessária/i,
  'OUT-31 garantem não treinar': /garant\w*\s+não\s+usar\s+os\s+dados\s+para\s+trein/i,
  'segredos nunca': /segredos\s+nunca/i,
};

test('textos internos: nenhuma formulação retirada volta à política, ao admin, às mensagens de bloqueio ou aos avisos', () => {
  for (const f of ARQUIVOS) {
    const t = semComentarios(readFileSync(raiz + f, 'utf8'));
    for (const [id, re] of Object.entries(PROIBIDO)) assert.doesNotMatch(t, re, `${f}: ${id}`);
  }
});

let S;
before(async () => { S = await subir(); });
after(async () => { await S.fechar(); S.app.db.close(); });

test('política: diz o escopo real de visibilidade, acesso técnico, backup, credenciais e regras por parte do envio', async () => {
  const secao = (await S.cliente().get('/api/politica')).dados.secao;
  assert.match(secao, /Nenhuma tela da GreenIA mostra o conteúdo das suas conversas a colegas, ao responsável da área ou ao admin/);
  assert.match(secao, /exportar uma cópia do banco da empresa; a entrada no ambiente pela plataforma e a exportação ficam registradas/);
  assert.match(secao, /Cópias de segurança feitas antes da exclusão ainda podem conter a conversa/);
  assert.match(secao, /em formatos que o sistema reconhece bloqueiam o envio[^.]*histórico, instruções, documentos da base e arquivos de quick win/);
  assert.match(secao, /Um segredo num formato que o sistema não reconhece pode passar/);
  assert.match(secao, /Documentos da base e arquivos de quick win:\*\* marcação de sigiloso de cada documento e bloqueio de senhas e chaves de acesso\. As regras por tipo de dado não se aplicam a eles/);
  assert.match(secao, /Histórico da conversa e instruções:\*\* bloqueio de senhas e chaves de acesso/);
  for (const [id, re] of Object.entries(PROIBIDO)) assert.doesNotMatch(secao, re, id);
  assert.doesNotMatch(secao, /\bnunca\b/i, 'política sem absolutos');
  // "Processar sem guardar" só aparece quando a empresa usa a opção.
  assert.doesNotMatch(secao, /processadas sem ficar no histórico/);
  salvarConfig(S.app.db, { naoArmazenar: ['cpf'] });
  assert.match(await import('../src/politica.js').then(m => m.secaoAutomatica(S.app)), /Mensagens com um tipo de dado que a empresa manda não guardar são processadas sem ficar no histórico/);
  salvarConfig(S.app.db, { naoArmazenar: [] });
});

test('admin: a opção de dados pessoais descreve o pedido sem treino como filtro, não como garantia', () => {
  const t = readFileSync(raiz + 'public/admin.js', 'utf8');
  assert.match(t, /é pedido em cada chamada[^<]*é um filtro, não uma garantia contratual/);
  assert.match(t, /com modelo definido \(não gratuito nem automático\)/);
});
