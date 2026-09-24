// Preparação para os documentos reais do PNCP: a planilha de controle vira casos
// com gabarito em rascunho; o congelamento recusa rascunho incompleto ou fora do
// schema; o gabarito congelado não muda; Suprimentos ganha a planilha de
// especificação a partir dos itens do termo; cada procedência é um lote próprio
// na divisão. Arquivos de teste: PDFs fictícios no lugar dos documentos reais.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { congelarPncp, importar, PREENCHER } from '../eval/fase4/importar-pncp.ts';
import { calcular, lerGabaritos } from '../eval/fase4/dividir.ts';
import { pdf, sha256 } from '../eval/fase4/lib.ts';

let tmp = '', origem = '', saida = '', gabs = '';
const CSV = readFileSync(new URL('../eval/fase4/pncp/controle.exemplo.csv', import.meta.url), 'utf8');

before(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'fase4-pncp-'));
  origem = join(tmp, 'baixados'); saida = join(tmp, 'saida'); gabs = join(tmp, 'gabaritos');
  const { mkdirSync } = await import('node:fs');
  mkdirSync(origem);
  for (const n of ['contrato-01.pdf', 'tr-sup-01.pdf', 'ata-sup-01.pdf']) writeFileSync(join(origem, n), await pdf([[{ titulo: n.toUpperCase(), linhas: ['Documento de teste.'] }]]));
  writeFileSync(join(tmp, 'controle.csv'), CSV);
});
after(() => { if (tmp) rmSync(tmp, { recursive: true, force: true }); });

const rascunho = (frente: string, caso: string) => join(saida, 'pncp', frente, caso, 'gabarito.rascunho.json');

test('a planilha de controle vira casos com rascunho "A PREENCHER"; o congelamento recusa rascunho incompleto', async () => {
  assert.deepEqual(importar(origem, join(tmp, 'controle.csv'), saida).sort(), ['pncp-jur-01', 'pncp-sup-01']);
  const j = JSON.parse(readFileSync(rascunho('juridico', 'pncp-jur-01'), 'utf8'));
  assert.equal(j.procedencia, 'pncp');
  assert.equal(j.arquivos[0].sha256, sha256(readFileSync(join(origem, 'contrato-01.pdf'))));
  assert.equal(j.pncp.documentos[0].tipoDocumento, 'contrato');
  assert.equal(j.esperado.campos.vigencia.trecho, PREENCHER);
  await assert.rejects(congelarPncp(saida, gabs, { dividir: false }), /ainda tem "A PREENCHER"/);
  assert.ok(!existsSync(join(gabs, 'juridico')));
  // Linha sem url do PNCP: recusada na importação.
  writeFileSync(join(tmp, 'ruim.csv'), CSV.split('\n').slice(0, 2).join('\n').replace(/https:\/\/[^;]+/, ''));
  assert.throws(() => importar(origem, join(tmp, 'ruim.csv'), saida), /url do PNCP ausente/);
});

test('preenchidos, congelam: gabarito no repositório com sha256, planilha de especificação gerada, lote próprio na divisão', async () => {
  const j = JSON.parse(readFileSync(rascunho('juridico', 'pncp-jur-01'), 'utf8'));
  j.esperado.campos = { partes: { clausula: 'Preâmbulo', trecho: 'CONTRATANTE' }, vigencia: { clausula: 'Cláusula 5ª', trecho: 'vigência de 12 meses' }, reajuste: null, multa: { clausula: 'Cláusula 9ª', trecho: 'multa de 10%' }, rescisao: { clausula: 'Cláusula 10ª', trecho: 'rescisão' }, confidencialidade: null, foro: { clausula: 'Cláusula 12ª', trecho: 'foro da comarca' } };
  j.notas = 'Contrato de teste.';
  writeFileSync(rascunho('juridico', 'pncp-jur-01'), JSON.stringify(j));
  const s = JSON.parse(readFileSync(rascunho('suprimentos', 'pncp-sup-01'), 'utf8'));
  s.esperado.especificacao.itens = [{ codigo: '1', descricao: 'Cimento CP II, saco 50 kg', quantidade: 100, unidade: 'saco', pagina: 3 }, { codigo: '2', descricao: 'Areia média', quantidade: 20, unidade: 'm³', pagina: 3 }];
  s.esperado.cotacao = { arquivo: 'ata-sup-01.pdf', fornecedor: 'Fornecedor de teste', validade: '12 meses', itens: [{ codigo: '1', descricao: 'Cimento CP II, saco 50 kg', quantidade: 100, unidade: 'saco', preco_unitario: 32.5 }] };
  s.esperado.divergencias = [{ codigo: '2', tipo: 'faltante_na_cotacao', especificado: 20, cotado: null }];
  s.notas = 'Par de teste: item 2 deserto.';
  writeFileSync(rascunho('suprimentos', 'pncp-sup-01'), JSON.stringify(s));
  assert.deepEqual((await congelarPncp(saida, gabs, { dividir: false })).sort(), ['pncp-jur-01', 'pncp-sup-01']);
  const man = JSON.parse(readFileSync(join(gabs, 'pncp-manifesto.json'), 'utf8'));
  assert.equal(man['pncp-jur-01'], sha256(readFileSync(join(gabs, 'juridico', 'pncp-jur-01.json'), 'utf8')));
  const sup = JSON.parse(readFileSync(join(gabs, 'suprimentos', 'pncp-sup-01.json'), 'utf8'));
  const planilha = sup.arquivos.find((a: { nome: string }) => a.nome === 'especificacao-pncp-sup-01.xlsx');
  assert.equal(planilha.sha256, sha256(readFileSync(join(saida, 'pncp', 'suprimentos', 'pncp-sup-01', planilha.nome))));
  assert.ok(existsSync(join(saida, 'pncp', 'juridico', 'pncp-jur-01', 'gabarito.json')));
  // Congelado não muda: um novo rascunho do mesmo caso é recusado.
  importar(origem, join(tmp, 'controle.csv'), saida);
  await assert.rejects(congelarPncp(saida, gabs, { dividir: false }), /A PREENCHER|já foi congelado/);
  // Divisão: lotes juridico/pncp e suprimentos/pncp, cada caso uma unidade.
  const lotes = calcular(lerGabaritos(gabs));
  assert.deepEqual(Object.keys(lotes).sort(), ['juridico/pncp', 'suprimentos/pncp']);
  assert.equal(lotes['suprimentos/pncp'].unidades, 1);
});
