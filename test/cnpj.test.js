// Regra formal CPF x CNPJ: CPF é dado pessoal; CNPJ é identificação de empresa, não herda os controles de dado
// pessoal e não bloqueia. Num documento com CNPJ, os dados de pessoas físicas são classificados pelo conteúdo.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { subir } from './ajuda.js';
import { openRouterFalso, enviarMensagem } from './openrouter-falso.js';
import { arquivo, pdf } from './arquivos.js';
import { salvarConfig, PADRAO } from '../src/config.js';
import { um } from '../src/db.js';
import { detectar, decidir, NIVEL_DO_TIPO, CATEGORIAS } from '../src/filtro.js';

const CNPJ = '11.222.333/0001-81', CPF = '529.982.247-25';
let S, OR, ana;
before(async () => {
  OR = await openRouterFalso();
  S = await subir({ ia: { ...OR.ia, configurada: true, listarModelos: (...a) => OR.ia.listarModelos(...a) } });
  salvarConfig(S.app.db, { dominios: ['exemplo.com.br'] });
  ana = await S.cliente().entrar('ana@exemplo.com.br');
});
after(async () => { await S.fechar(); await OR.fechar(); });

async function enviar(texto, extra = {}) {
  const conv = (await ana.post('/api/conversas', {})).dados.conversa;
  const n = OR.chamadas.length;
  const r = await enviarMensagem(ana, conv.id, { texto, ...extra });
  const rota = um(S.app.db, 'select politicas from roteamento where conversa_id = ? order by id desc limit 1', conv.id);
  return { r, n: OR.chamadas.length - n, politicas: JSON.parse(rota?.politicas || '[]'), sigilosa: um(S.app.db, 'select sigilosa from conversas where id = ?', conv.id).sigilosa };
}

test('classificação: CPF é dado pessoal; CNPJ é identificação de empresa, sem os controles de dado pessoal', () => {
  assert.deepEqual(detectar(`CPF ${CPF}`), ['cpf']);
  assert.equal(NIVEL_DO_TIPO.cpf, 2);
  assert.equal(CATEGORIAS.cpf, 'identificacao');
  assert.deepEqual(detectar(`CNPJ ${CNPJ}`), ['cnpj']);
  assert.equal(NIVEL_DO_TIPO.cnpj, 1, 'nível de conteúdo normal, abaixo do de dado pessoal');
  assert.equal(CATEGORIAS.cnpj, 'identificacao_empresa');
  assert.equal(PADRAO.acoesChat.cnpj, 'permitir');
  assert.deepEqual(decidir(['cnpj'], PADRAO.acoesChat), { bloqueados: [], protegidos: [], normais: ['cnpj'] });
  // Com os dígitos sem pontuação, o mesmo: CNPJ nunca é lido como CPF, e CPF nunca como CNPJ.
  assert.deepEqual(detectar('CNPJ 11222333000181'), ['cnpj']);
  assert.deepEqual(detectar('CPF 52998224725'), ['cpf']);
});

test('documento com CNPJ e dados de pessoas físicas: cada dado pelo próprio conteúdo', () => {
  const contrato = `Contratante: Construções Alfa Ltda, CNPJ ${CNPJ}. Representante: Maria Souza, CPF ${CPF}, maria.souza@hotmail.com.`;
  assert.deepEqual(detectar(contrato).sort(), ['cnpj', 'cpf', 'email']);
  // Só a empresa, com o email corporativo de contato: nenhum dado pessoal detectado.
  assert.deepEqual(detectar(`Fornecedor: Construções Alfa Ltda, CNPJ ${CNPJ}, contato comercial@alfa.com.br, gerente de contas Bruno Alves.`), ['cnpj']);
});

test('uso: CNPJ sozinho processa normalmente, sem controles de dado pessoal; com CPF do representante, os controles valem pelo CPF', async () => {
  const empresa = await enviar(`Resuma o cadastro do fornecedor Construções Alfa Ltda, CNPJ ${CNPJ}.`);
  assert.deepEqual([empresa.r.status, empresa.n, empresa.sigilosa], [200, 1, 0], 'CNPJ não bloqueia nem torna sigiloso');
  assert.ok(!empresa.politicas.includes('dados_pessoais_protegidos'), 'CNPJ não herda os controles de dado pessoal');
  const pessoa = await enviar(`Resuma o cadastro: Construções Alfa Ltda, CNPJ ${CNPJ}; representante Maria Souza, CPF ${CPF}.`);
  assert.deepEqual([pessoa.r.status, pessoa.n, pessoa.sigilosa], [200, 1, 0], 'processa, sem bloqueio');
  assert.ok(pessoa.politicas.includes('dados_pessoais_protegidos'), 'o CPF da pessoa física traz os controles de dado pessoal');
  // Em anexo, a mesma regra.
  const anexo = await enviar('Resuma o anexo.', { anexos: [arquivo('fornecedor.pdf', pdf([`Construcoes Alfa Ltda - CNPJ ${CNPJ}`, 'Prazo de entrega: 10 dias']))] });
  assert.deepEqual([anexo.r.status, anexo.n], [200, 1]);
  assert.ok(!anexo.politicas.includes('dados_pessoais_protegidos'));
});
