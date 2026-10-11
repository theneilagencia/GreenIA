// Conhecimento (QA UX M17): quem pode consultar a base de uma área lê o texto extraído do documento.
// Mesma regra da consulta pela IA (basesVisiveis + idsVigentes); fora dela, 404 sem revelar existência.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { subir } from './ajuda.js';
import { openRouterFalso } from './openrouter-falso.js';
import { um } from '../src/db.js';
import { arquivo } from './arquivos.js';
import { LEITURA_CARACTERES } from '../src/bases.js';

let S, OR, admin, ana, bia, A, B, SIG, docA, docB, docSig, docEmpresa, docGrande;

before(async () => {
  OR = await openRouterFalso();
  S = await subir({ ia: OR.ia });
  admin = await S.cliente().entrar('admin@exemplo.com.br');
  A = (await admin.post('/api/admin/areas', { nome: 'Área Alfa' })).dados;
  B = (await admin.post('/api/admin/areas', { nome: 'Área Beta' })).dados;
  SIG = (await admin.post('/api/admin/areas', { nome: 'Jurídico', sigilosa: true })).dados;
  const criar = async (email, nome, areas) => (await admin.post('/api/admin/pessoas', { email, nome, areas })).dados.id;
  await criar('ana@exemplo.com.br', 'Ana Lima', [{ id: A.id }]);
  await criar('bia@exemplo.com.br', 'Bia Souza', [{ id: B.id }, { id: SIG.id }]);
  ana = await S.cliente().entrar('ana@exemplo.com.br');
  bia = await S.cliente().entrar('bia@exemplo.com.br');
  const enviar = async (corpo, nome, texto) => {
    const r = await admin.post('/api/bases/documentos', { ...corpo, arquivo: arquivo(nome, Buffer.from(texto)) });
    assert.equal(r.status, 200, JSON.stringify(r.dados));
    return r.dados.id;
  };
  docA = await enviar({ area_id: A.id, titulo: 'Reembolso' }, 'reembolso.txt', 'Prazo de reembolso: 30 dias corridos.');
  docB = await enviar({ area_id: B.id, titulo: 'Inventário' }, 'inventario.txt', 'Inventário trimestral das ferramentas.');
  docSig = await enviar({ area_id: SIG.id, titulo: 'Contratos', sigiloso: true }, 'contratos.txt', 'Cláusulas sigilosas dos contratos.');
  docEmpresa = await enviar({ toda_empresa: true, titulo: 'Código de conduta' }, 'codigo.txt', 'Atendimento das 8h às 18h.');
  docGrande = await enviar({ area_id: A.id, titulo: 'Manual longo' }, 'manual.txt', 'Á'.repeat(LEITURA_CARACTERES + 5000));
});
after(async () => { await S.fechar(); await OR.fechar(); });

const ler = (c, id, q = '') => c.get(`/api/bases/documentos/${id}/conteudo${q}`);

test('com acesso à área: 200 com o texto extraído, título, área e data (sem o arquivo original)', async () => {
  const r = await ler(ana, docA);
  assert.equal(r.status, 200, JSON.stringify(r.dados));
  assert.equal(r.dados.texto, 'Prazo de reembolso: 30 dias corridos.');
  assert.equal(r.dados.documento.titulo, 'Reembolso');
  assert.equal(r.dados.documento.area, 'Área Alfa');
  assert.ok(r.dados.documento.atualizado_em);
  assert.equal(r.dados.proximo, null);
  assert.ok(!('base64' in r.dados) && !('base64' in r.dados.documento));
  // Documento da empresa toda: todo mundo consulta.
  assert.equal((await ler(ana, docEmpresa)).dados.documento.area, 'Toda a empresa');
  assert.equal((await ler(bia, docEmpresa)).status, 200);
});

test('sem acesso à área: 404 igual ao de um documento que não existe', async () => {
  const fora = await ler(ana, docB), inexistente = await ler(ana, 999999), invalido = await ler(ana, 'abc');
  assert.equal(fora.status, 404);
  assert.deepEqual(fora.dados, inexistente.dados);
  assert.equal(invalido.status, 404);
  // Admin da empresa segue a mesma regra da consulta: sem participar da área, não lê (gestão é outra tela).
  assert.equal((await ler(admin, docB)).status, 404);
});

test('área sigilosa: quem não participa recebe 404; quem participa lê', async () => {
  assert.equal((await ler(ana, docSig)).status, 404);
  const r = await ler(bia, docSig);
  assert.equal(r.status, 200);
  assert.equal(r.dados.documento.sigiloso, true);
});

test('área desativada: fora da consulta, 404', async () => {
  const Z = (await admin.post('/api/admin/areas', { nome: 'Área Zeta' })).dados;
  await admin.put(`/api/admin/areas/${Z.id}`, { pessoas: [{ pessoa_id: ana.pessoa.id }] });
  const doc = (await admin.post('/api/bases/documentos', { area_id: Z.id, titulo: 'Zeta', arquivo: arquivo('z.txt', Buffer.from('Texto da Zeta.')) })).dados.id;
  assert.equal((await ler(ana, doc)).status, 200);
  await admin.put(`/api/admin/areas/${Z.id}`, { ativa: false });
  assert.equal((await ler(ana, doc)).status, 404);
});

test('suspenso ou com validade encerrada: não abre (a IA também não usa), sem mostrar o texto', async () => {
  assert.equal((await admin.put(`/api/bases/documentos/${docA}`, { suspenso: true })).status, 200);
  const r = await ler(ana, docA);
  assert.equal(r.status, 409);
  assert.equal(r.dados.erro, 'documento_fora_de_uso');
  assert.ok(!JSON.stringify(r.dados).includes('reembolso: 30'));
  assert.equal((await admin.put(`/api/bases/documentos/${docA}`, { suspenso: false, validade: '2020-01-01' })).status, 200);
  assert.equal((await ler(ana, docA)).status, 409);
  assert.equal((await admin.put(`/api/bases/documentos/${docA}`, { validade: null })).status, 200);
  assert.equal((await ler(ana, docA)).status, 200);
  // Fora do alcance continua 404, mesmo suspenso (não revela a existência nem o estado).
  await admin.put(`/api/bases/documentos/${docB}`, { suspenso: true });
  assert.equal((await ler(ana, docB)).status, 404);
});

test('tamanho limitado: páginas de até LEITURA_CARACTERES, com a próxima posição', async () => {
  const total = um(S.app.db, 'select length(texto) as n from documentos where id = ?', docGrande).n;
  const p1 = await ler(ana, docGrande);
  assert.equal(p1.status, 200);
  assert.equal([...p1.dados.texto].length, LEITURA_CARACTERES);
  assert.equal(p1.dados.total, total);
  assert.equal(p1.dados.proximo, LEITURA_CARACTERES);
  const p2 = await ler(ana, docGrande, `?inicio=${p1.dados.proximo}`);
  assert.equal([...p2.dados.texto].length, total - LEITURA_CARACTERES);
  assert.equal(p2.dados.proximo, null);
  assert.equal((await ler(ana, docGrande, '?inicio=-50')).dados.inicio, 0);
  assert.equal((await ler(ana, docGrande, '?inicio=99999999')).dados.texto, '');
});

test('leitura não cria evento de auditoria nem consome créditos', async () => {
  const eventos = um(S.app.db, 'select count(*) as n from eventos').n, uso = um(S.app.db, 'select count(*) as n from uso').n;
  await ler(ana, docEmpresa);
  assert.equal(um(S.app.db, 'select count(*) as n from eventos').n, eventos);
  assert.equal(um(S.app.db, 'select count(*) as n from uso').n, uso);
  assert.equal(OR.chamadas.length, 0);
});
