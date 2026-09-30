// Detecção somente leitura de landings e avisos de privacidade com copy antiga (scripts/landings-antigas.js):
// separa o padrão herdado do texto da própria empresa, informa só ids e não escreve nada. Dados sintéticos.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { subirPlataforma } from './ajuda-plataforma.js';
import * as E from '../src/plataforma/empresas.js';
import { exec, um } from '../src/db.js';
import { detectarLandings } from '../scripts/landings-antigas.js';

const AVISO_ANTIGO = 'Suas conversas ficam salvas só para você e podem ser apagadas quando quiser. As regras de dados da empresa são conferidas antes de cada envio à IA.';
let S, antiga, customizada, nova;
before(async () => {
  S = await subirPlataforma();
  antiga = E.criarEmpresa(S.P, { name: 'Empresa Alfa Exemplo', slug: 'alfa-exemplo' }, null, {});
  customizada = E.criarEmpresa(S.P, { name: 'Empresa Beta Exemplo', slug: 'beta-exemplo' }, null, {});
  nova = E.criarEmpresa(S.P, { name: 'Empresa Gama Exemplo', slug: 'gama-exemplo' }, null, {});
  // Como ficou gravado no cadastro de uma empresa antiga: textos do modelo de 6534041.
  const com = (id, f) => { const c = JSON.parse(um(S.P.db, 'select content from landing_pages where company_id = ?', id).content); f(c); exec(S.P.db, 'update landing_pages set content = ? where company_id = ?', JSON.stringify(c), id); };
  com(antiga.id, c => { c.textos.regras_titulo = 'O que pode, o que pede cuidado e o que nunca sai'; c.textos.tarefas_sub = 'Pedidos que costumam dar bom resultado logo na primeira semana.'; });
  exec(S.P.db, 'update branding set privacy_note = ? where company_id = ?', AVISO_ANTIGO, antiga.id);
  // Texto escrito pela própria empresa, com um claim proibido e o nome dela.
  com(customizada.id, c => { c.subtitulo = 'Na Empresa Beta Exemplo, os dados nunca saem daqui e tudo é 100% privado.'; });
});
after(async () => { await S.fechar(); });

test('landings antigas: separa padrão herdado de texto da empresa, sem imprimir texto e sem escrever no banco', () => {
  const antes = um(S.P.db, 'select total_changes() as n').n;
  const r = detectarLandings(S.P.db);
  assert.equal(um(S.P.db, 'select total_changes() as n').n, antes, 'somente leitura');
  const de = id => r.porEmpresa.find(e => e.empresa === id);
  const a = de(antiga.id);
  assert.ok(a, 'empresa antiga detectada');
  const titulo = a.achados.find(x => x.campo === 'textos.regras_titulo');
  assert.deepEqual([titulo.origem, titulo.claims.includes('OUT-03')], ['padrao_herdado', true]);
  const sub = a.achados.find(x => x.campo === 'textos.tarefas_sub');
  assert.deepEqual([sub.origem, sub.claims.includes('OUT-10'), sub.claims.includes('B17')], ['padrao_herdado', true, true]);
  const aviso = a.achados.find(x => x.campo === 'privacy_note');
  assert.deepEqual([aviso.origem, aviso.claims.includes('B03'), aviso.claims.includes('B20')], ['padrao_herdado', true, true]);
  const c = de(customizada.id).achados.find(x => x.campo === 'subtitulo');
  assert.equal(c.origem, 'texto_da_empresa');
  assert.ok(c.claims.includes('B02') && c.claims.includes('B03'), JSON.stringify(c.claims));
  assert.equal(de(nova.id), undefined, 'empresa criada com o modelo novo não aparece');
  assert.deepEqual([r.comClaimAntigo, r.avisoDesatualizado, r.comTextoDaEmpresa], [2, 1, 1]);
  // Nada de conteúdo: nem nome da empresa, nem trecho da landing ou do aviso.
  const saida = JSON.stringify(r);
  for (const t of ['Alfa', 'Beta', 'Gama', 'nunca sai', 'primeira semana', 'só para você', '100%']) assert.ok(!saida.includes(t), `saída contém "${t}"`);
});
