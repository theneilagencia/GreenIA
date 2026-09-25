// Fase 4, checklist: as correções da plataforma (evidência por item, página por
// página, siglas, sinônimos) medidas no conjunto de desenvolvimento do RH e dos
// casos equivalentes da construtora, no corpus versão 2 (nomes genéricos em
// parte dos casos). O reservado fica para a rodada final.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gerarRh } from '../eval/fase4/gerar-rh.ts';
import { gerarContratacao } from '../eval/fase4/gerar-contratacao.ts';
import { OFICIAL } from '../eval/fase4/congelar.ts';
import { aplicarV2, tipoDeNome } from '../eval/fase4/congelar-v2.ts';
import { avaliarChecklist, resumo } from '../eval/fase4/avaliar-rh-offline.ts';
import { paresChecklist, pontuar } from '../eval/fase4/pontuar.ts';

let dir = '';
before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'fase4-checklist-'));
  await gerarRh(dir, OFICIAL.rh.pastas, OFICIAL.rh.semente);
  await gerarContratacao(dir, OFICIAL.contratacao.pastas, OFICIAL.contratacao.semente);
  aplicarV2(dir);                                                     // corpus versão 2: nomes genéricos em parte dos casos
});
after(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

test('RH, desenvolvimento: nenhum erro grave; acerto item a item de pelo menos 98% e, pela matriz, 58 acertos e 5 em revisão', async () => {
  const rs = await avaliarChecklist(dir, 'rh');
  const s = resumo(rs);
  assert.equal(s.casos, 9);
  assert.deepEqual(s.errosGraves, []);
  assert.ok((s.acerto ?? 0) >= 98, JSON.stringify(s.confusao));
  // O que sobra é o CPF citado em outro documento: fica duvidoso (vai para a revisão), nunca presente.
  assert.equal(s.confusao['ausente→presente'] ?? 0, 0);
  assert.equal(s.confusao['duvidoso→presente'] ?? 0, 0);
  // Pela matriz congelada: acerto, erros graves, erros comuns e revisão.
  const m = pontuar(paresChecklist(rs));
  assert.deepEqual([m.acerto, m.errosGraves, m.errosComuns, m.revisao], [58, 0, 0, 5]);
  // Com nome genérico, a plataforma identifica pelo conteúdo: nenhum erro grave nos dois tipos.
  for (const t of ['generico', 'descritivo']) assert.equal(pontuar(paresChecklist(rs.filter(r => tipoDeNome(r.caso) === t))).errosGraves, 0, t);
  assert.ok(rs.some(r => tipoDeNome(r.caso) === 'generico'));
});

test('construtora, desenvolvimento: ART citada sem anexo fica duvidosa, PDF com dois documentos dá a página de cada um', async () => {
  const rs = await avaliarChecklist(dir, 'contratacao');
  const s = resumo(rs);
  assert.equal(s.casos, 9);
  assert.deepEqual(s.errosGraves, []);
  assert.equal(s.acerto, 100, JSON.stringify(s.confusao));
  assert.deepEqual(s.pagina, { itens: s.pagina!.itens, certas: s.pagina!.itens });
  const art = rs.flatMap(r => r.itens.filter(i => i.item === 'art' && i.esperado === 'duvidoso'));
  assert.ok(art.length >= 1);
  for (const i of art) assert.match(i.motivo!, /^mencionado em [^,]+\.(pdf|docx), documento não encontrado$/);
  const m = pontuar(paresChecklist(rs));
  assert.deepEqual([m.acerto, m.errosGraves, m.errosComuns, m.revisao], [57, 0, 0, 6]);
});
