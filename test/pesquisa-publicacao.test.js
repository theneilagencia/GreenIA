import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publicacaoDaPagina } from '../src/pesquisa-publicacao.js';
import { verificarPublicacoes, notasComPublicacoes } from '../src/pesquisa-fontes.js';
import { lerLink } from '../src/fontes.js';
import { createHash } from 'node:crypto';

test('publicação explícita em meta, JSON-LD de artigo e texto; consulta e atualização não são publicação', () => {
  for (const h of ['<meta content="2026-09-30T08:30:00-03:00" property="article:published_time">', '<script type="application/ld+json">{"@type":"NewsArticle","datePublished":"2026-09-30","dateModified":"2026-10-18"}</script>'])
    assert.equal(publicacaoDaPagina(h).data, '2026-09-30');
  assert.equal(publicacaoDaPagina('', 'Publicado em 26/09/2025 15h35').data, '2025-09-26');
  for (const h of ['<meta property="article:modified_time" content="2026-09-30">', '<script type="application/ld+json">{"@type":"Article","dateModified":"2026-09-30"}</script>', '<p>DOI 2026-4s-54-60. Copyright 2026. Consultado em 18/10/2026</p>']) assert.equal(publicacaoDaPagina(h), null);
});
test('datas inválidas, divergentes e datas de entidades relacionadas não viram publicação', () => {
  for (const data of ['2026-02-30', '2026-13-01', '2026-01-32', 'não informada']) assert.equal(publicacaoDaPagina(`<meta property="article:published_time" content="${data}">`), null);
  assert.equal(publicacaoDaPagina('<meta property="article:published_time" content="2026-09-30"><meta itemprop="datePublished" content="2026-10-01">'), null);
  assert.equal(publicacaoDaPagina('<script type="application/ld+json">{"@type":"Article","comments":[{"@type":"Article","datePublished":"2026-09-30"}]}</script>'), null);
});
test('leitura segura preserva data do cabeçalho HTML e hash dos bytes sem executar scripts', async () => {
  const corpo = Buffer.from('<html><head><meta property="article:published_time" content="2026-09-30"></head><body><p>Artigo sobre governança documental e novas aplicações.</p></body></html>');
  const x = await lerLink('https://fonte.exemplo/artigo', { buscar: async op => {
    assert.equal(op.metodo, 'GET'); assert.equal(op.redePrivada, false);
    assert.equal(op.cabecalhos.authorization, undefined); assert.equal(op.cabecalhos.cookie, undefined);
    return { status: 200, cabecalhos: { 'content-type': 'text/html' }, corpo };
  } });
  assert.equal(x.publicacao.data, '2026-09-30');
  assert.equal(x.sha256, createHash('sha256').update(corpo).digest('hex'));
  assert.doesNotMatch(x.texto, /<meta/);
});
test('verificação é limitada, sem repetição, query ou credenciais; falhas e datas futuras continuam abertas', async () => {
  const chamadas = [];
  const fontes = ['https://a.exemplo/ok', 'https://a.exemplo/ok', 'https://a.exemplo/futura', 'https://a.exemplo/falha', 'https://a.exemplo/?token=privado', 'https://u:s@a.exemplo/privado', 'https://a.exemplo/fora'].map(url => ({ url }));
  const r = await verificarPublicacoes(fontes, { agora: new Date('2026-10-18T00:00:00Z'), ler: async (url, op) => {
    chamadas.push(url); assert.equal(op.tempoMs, 6000); assert.equal(op.maxBytes, 512 * 1024);
    if (url.endsWith('falha')) throw Object.assign(Error('interno não deve vazar'), { codigo: 'exige_autenticacao' });
    return { titulo: 'Artigo', texto: 'Trecho do artigo.', publicacao: { data: url.endsWith('futura') ? '2027-01-01' : '2026-09-30', origem: 'meta', evidencia: 'datePublished' }, sha256: 'a'.repeat(64) };
  } });
  assert.equal(r.length, 5); assert.equal(chamadas.length, 3);
  assert.equal(r[0].estado, 'publicacao_encontrada'); assert.equal(r[1].estado, 'data_futura'); assert.equal(r[1].publicacao, null);
  assert.equal(r[2].motivo, 'exige_autenticacao'); assert.equal(r[3].estado, 'url_nao_apta'); assert.equal(r[4].estado, 'url_nao_apta');
  assert.ok(!chamadas.some(x => x.includes('fora')));
  const notas = notasComPublicacoes('Notas da busca sem datas.', r);
  assert.match(notas, /Publicação declarada na página: 2026-09-30/);
  assert.match(notas, /Publicação não confirmada \(data_futura\)/);
  assert.doesNotMatch(notas, /interno não deve vazar/);
  assert.ok(notasComPublicacoes('x'.repeat(30000), r).length <= 12000);
});
test('a mesma rede segura bloqueia localhost, IP privado, metadados e DNS que resolve para rede interna', async () => {
  const r = await verificarPublicacoes(['https://localhost/x','https://127.0.0.1/x','https://169.254.169.254/latest/meta-data','https://publico.exemplo/x'].map(url => ({url})), {lookup: async () => [{address:'10.0.0.1',family:4}]});
  assert.ok(r.every(x => x.estado === 'leitura_falhou'));
});
