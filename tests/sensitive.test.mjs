import { test } from 'node:test';
import assert from 'node:assert/strict';
import core from '../lib/greenia-core.js';

const { detectSensitive, describeSensitive, isValidCPF, isValidCNPJ, isValidLuhn } = core;
const has = (text, type) => detectSensitive(text).includes(type);

// Números de teste gerados só para validar dígitos verificadores; não são reais.
const CPF = '529.982.247-25';
const CPF_RAW = '52998224725';
const CNPJ = '11.222.333/0001-81';
const CNPJ_RAW = '11222333000181';
const CARD = '4111 1111 1111 1111';

test('CPF válido com máscara é detectado', () => {
  assert.ok(has(`O CPF dele é ${CPF}, pode conferir?`, 'cpf'));
});

test('CPF válido sem máscara é detectado', () => {
  assert.ok(has(`cpf ${CPF_RAW}`, 'cpf'));
  assert.ok(has(CPF_RAW, 'cpf'));
});

test('CPF com dígito verificador errado não é detectado', () => {
  assert.equal(isValidCPF('529.982.247-26'), false);
  assert.deepEqual(detectSensitive('CPF 529.982.247-26'), []);
});

test('sequência de 11 dígitos sem relação com CPF não é detectada', () => {
  assert.equal(isValidCPF('12345678901'), false);
  assert.deepEqual(detectSensitive('Pedido 12345678901 saiu hoje'), []);
  assert.deepEqual(detectSensitive('11111111111'), []);
});

test('CNPJ válido com e sem máscara é detectado', () => {
  assert.ok(has(`Fornecedor ${CNPJ}`, 'cnpj'));
  assert.ok(has(`cnpj ${CNPJ_RAW}`, 'cnpj'));
  assert.equal(isValidCNPJ('11.222.333/0001-82'), false);
});

test('CNPJ sem máscara não é confundido com cartão', () => {
  assert.deepEqual(detectSensitive(CNPJ_RAW), ['cnpj']);
});

test('número de cartão que passa em Luhn é detectado', () => {
  assert.ok(has(`cartão ${CARD}`, 'cartao'));
  assert.ok(has('5555555555554444', 'cartao'));
  assert.ok(has('4111-1111-1111-1111', 'cartao'));
});

test('número de 16 dígitos que falha em Luhn não é detectado como cartão', () => {
  assert.equal(isValidLuhn('4111111111111112'), false);
  assert.equal(has('4111111111111112', 'cartao'), false);
});

test('data e telefone não são detectados', () => {
  for (const text of [
    'Reunião em 12/05/2026 às 14h',
    'A entrega foi em 2026-05-12.',
    'Ligue para (11) 98765-4321',
    'Meu ramal é 4000 e o celular 11 98765-4321',
    '+55 11 3456-7890',
    '+55 21 99876-5432',
    '55 21 99876-5432',
  ]) {
    assert.deepEqual(detectSensitive(text), [], text);
  }
});

test('dados bancários perto de agência e conta são detectados', () => {
  assert.ok(has('Agência 1234 conta 56789-0', 'bancario'));
  assert.ok(has('ag: 0001 cc 123456-7', 'bancario'));
  assert.ok(has('Conta corrente nº 98765-4', 'bancario'));
  assert.ok(has('ag 1234-5', 'bancario'));
});

test('palavras agência e conta sem número não disparam', () => {
  assert.deepEqual(detectSensitive('Preciso abrir conta no portal da agência'), []);
  assert.deepEqual(detectSensitive('Leve em conta 2026 inteiro'), []);
  assert.deepEqual(detectSensitive('A ag 2024 começa em março'), []);
});

test('chave PIX aleatória perto de "pix" é detectada', () => {
  assert.ok(has('Minha chave pix: 123e4567-e89b-12d3-a456-426614174000', 'pix'));
});

test('UUID sem "pix" por perto não dispara', () => {
  assert.deepEqual(detectSensitive('O id do chamado é 123e4567-e89b-12d3-a456-426614174000'), []);
});

test('senhas e credenciais com valor são detectadas', () => {
  assert.ok(has('minha senha: Abc@1234', 'credencial'));
  assert.ok(has('A senha é verao2026', 'credencial'));
  assert.ok(has('password=hunter22', 'credencial'));
  assert.ok(has('api key sk-ant-abc123def456', 'credencial'));
  assert.ok(has('token: ghp_16C7e42F292c6912E7710c838347Ae178B4a', 'credencial'));
});

test('falar de senha sem valor não dispara', () => {
  assert.deepEqual(detectSensitive('Esqueci minha senha do email, como troco?'), []);
  assert.deepEqual(detectSensitive('Como faço o reset de senha no autoatendimento?'), []);
  assert.deepEqual(detectSensitive('A senha foi trocada ontem'), []);
});

test('RG perto da palavra RG é detectado', () => {
  assert.ok(has('RG 12.345.678-9', 'rg'));
  assert.ok(has('rg nº 1234567', 'rg'));
});

test('texto comum não dispara nada', () => {
  assert.deepEqual(detectSensitive('Resumir este texto: a reunião de ontem tratou de três metas para 2026.'), []);
  assert.deepEqual(detectSensitive(''), []);
});

test('vários tipos voltam sem repetir, em ordem fixa', () => {
  assert.deepEqual(detectSensitive(`RG 12.345.678-9 e CPF ${CPF} e outro CPF ${CPF}`), ['cpf', 'rg']);
});

test('describeSensitive monta a lista em português', () => {
  assert.equal(describeSensitive(['cpf']), 'CPF');
  assert.equal(describeSensitive(['cpf', 'rg']), 'CPF e RG');
  assert.equal(describeSensitive(['cpf', 'rg', 'pix']), 'CPF, RG e chave PIX');
});
