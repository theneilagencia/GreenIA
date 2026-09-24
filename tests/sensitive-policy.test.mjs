import { test } from 'node:test';
import assert from 'node:assert/strict';
import core from '../lib/greenia-core.js';

const { detectSensitive, decideAction, maskSensitive, findSensitive, DATA_POLICY } = core;
const has = (text, type) => detectSensitive(text).includes(type);

// ---- Tipos novos ----------------------------------------------------------------

test('email é detectado', () => {
  assert.ok(has('Mande para ana.ribeiro@grupo.com.br até amanhã', 'email'));
  assert.ok(has('contato: joao_silva+rh@empresa.io', 'email'));
});

test('telefone brasileiro em várias formas é detectado', () => {
  for (const t of [
    '(11) 98765-4321', '11 98765-4321', '11987654321', '+55 11 98765-4321', '+5511987654321',
    '(21)3456-7890', '21 3456-7890', 'celular 98765-4321', 'tel: 3456-7890', 'fone 2345-6789',
  ]) {
    assert.ok(has(t, 'telefone'), t);
  }
});

test('CEP perto de palavras de endereço é detectado', () => {
  assert.ok(has('CEP 01310-100', 'cep'));
  assert.ok(has('Rua Augusta, bairro Consolação, 01305000', 'cep'));
});

test('CEP sem contexto não dispara', () => {
  assert.equal(has('O código do lote é 01310-100', 'cep'), false);
});

test('endereço com logradouro e número é detectado', () => {
  for (const t of ['Rua das Flores, 120', 'Av. Paulista 1000', 'avenida Brasil, nº 45', 'Travessa São José 12', 'Rodovia dos Bandeirantes, 50', 'Praça da Sé, 1', 'Alameda Santos 200']) {
    assert.ok(has(t, 'endereco'), t);
  }
});

test('nome de pessoa depois de marcador é detectado', () => {
  for (const t of [
    'Nome: Maria Souza', 'nome completo: João Pedro da Silva', 'A colaboradora Ana Paula Ribeiro faltou',
    'funcionário Carlos Eduardo pediu férias', 'paciente José Santos', 'candidato Pedro Álvares Cabral', 'Falei com o Sr. Antônio Carlos',
  ]) {
    assert.ok(has(t, 'nome'), t);
  }
});

test('lista colada com dados pessoais é detectada', () => {
  const tabela = 'nome;email;cidade\nMaria;maria@x.com.br;Santos\nJoão;joao@x.com.br;Campinas\nAna;ana@x.com.br;Sorocaba';
  assert.ok(has(tabela, 'lista'));
  const tab = 'Maria Souza\t(11) 98765-4321\nJoão Lima\t(11) 97654-3210\nAna Reis\t(11) 96543-2109';
  assert.ok(has(tab, 'lista'));
});

test('lista sem dado pessoal não é "lista com dados pessoais"', () => {
  const tabela = 'item;qtd;valor\nparafuso;10;R$ 2,00\nporca;20;R$ 1,50\narruela;30;R$ 0,50';
  assert.deepEqual(detectSensitive(tabela), []);
});

// ---- Falsos positivos que não podem disparar -------------------------------------

test('datas, valores, pedidos e empresas não disparam', () => {
  for (const t of [
    'Reunião em 12/05/2026 às 14h30',
    'O total foi R$ 1.234.567,89 no trimestre',
    'Pedido 1234567890 e pedido 12345678901',
    'Nota fiscal 000123456, série 1',
    'o cliente pediu revisão do contrato',
    'O cliente Acme Soluções Ambientais pediu uma proposta',
    'cliente Acme Ltda aprovou',
    'Planejamento 2024-2025 aprovado',
    'Comprei uma tv de 55 polegadas',
    'A rua estava fechada ontem',
    'versão 1.2.3 do sistema',
  ]) {
    assert.deepEqual(detectSensitive(t), [], t);
  }
});

// ---- Política ---------------------------------------------------------------------

test('padrões do DATA_POLICY', () => {
  for (const t of ['cpf', 'cnpj', 'cartao', 'bancario', 'pix', 'rg', 'credencial', 'lista']) assert.equal(DATA_POLICY[t], 'bloquear', t);
  for (const t of ['email', 'telefone', 'cep', 'endereco', 'nome']) assert.equal(DATA_POLICY[t], 'avisar', t);
});

test('avisar não envia sem confirmação: a decisão é avisar', () => {
  const d = decideAction(detectSensitive('Escreva um email para ana@grupo.com.br'));
  assert.equal(d.action, 'avisar');
  assert.deepEqual(d.warn, ['email']);
});

test('bloquear prevalece sobre avisar e não tem opção de envio', () => {
  const d = decideAction(detectSensitive('CPF 529.982.247-25, email ana@grupo.com.br'));
  assert.equal(d.action, 'bloquear');
  assert.deepEqual(d.block, ['cpf']);
});

test('sem nada detectado, permite', () => {
  assert.equal(decideAction([]).action, 'permitir');
});

test('credencial é bloqueada mesmo se a política disser outra coisa', () => {
  const d = decideAction(['credencial', 'email'], { ...DATA_POLICY, credencial: 'permitir', email: 'permitir' });
  assert.equal(d.action, 'bloquear');
  assert.deepEqual(d.block, ['credencial']);
});

test('permitir_com_registro envia e lista os tipos a registrar', () => {
  const d = decideAction(['email', 'telefone'], { ...DATA_POLICY, email: 'permitir_com_registro', telefone: 'permitir' });
  assert.equal(d.action, 'permitir_com_registro');
  assert.deepEqual(d.log, ['email']);
  assert.deepEqual(d.allow, ['telefone']);
});

test('mascarar prevalece sobre permitir_com_registro', () => {
  assert.equal(decideAction(['email', 'nome'], { email: 'mascarar', nome: 'permitir_com_registro' }).action, 'mascarar');
});

test('ação desconhecida na política vira bloquear', () => {
  assert.equal(decideAction(['email'], { email: 'talvez' }).action, 'bloquear');
});

test('mascarar troca o valor pelo tipo e mantém o resto', () => {
  const policy = { ...DATA_POLICY, email: 'mascarar', telefone: 'mascarar' };
  const text = 'Fale com ana@grupo.com.br ou (11) 98765-4321 amanhã.';
  const d = decideAction(detectSensitive(text), policy);
  assert.equal(d.action, 'mascarar');
  assert.equal(maskSensitive(text, d.mask), 'Fale com [EMAIL] ou [TELEFONE] amanhã.');
});

test('posições valem no texto original, mesmo com acentos antes', () => {
  const text = 'Atenção, José: agência 1234 conta 56789-0';
  const f = findSensitive(text).find(x => x.type === 'bancario');
  assert.match(text.slice(f.start, f.end), /^agência 1234/);
});
