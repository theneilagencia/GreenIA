import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectar, decidir } from '../src/filtro.js';

const casos = {
  cpf: ['CPF 529.982.247-25', 'titular 52998224725 conforme cadastro'],
  cnpj: ['CNPJ 11.222.333/0001-81', 'fornecedor 11222333000181'],
  cartao: ['cartão 4111 1111 1111 1111', 'pagou com cartao de credito 4111111111111111', '5555-5555-5555-4444'],
  banco: ['Agência 1234, conta 56789-0', 'ag: 0001 cc 123456-7', 'conta corrente 12345-6'],
  pix: ['chave pix 123e4567-e89b-42d3-a456-426614174000'],
  credencial: ['senha: Primavera2026', 'token=abc123xyz', 'minha api key: sk-proj-abcdefghijklmnop1234', 'a senha é Casa@123', 'AKIAIOSFODNN7EXAMPLE'],
  rg: ['RG 12.345.678-9', 'rg nº 1234567-X'],
  email: ['fale com maria.souza@empresa.com.br'],
  telefone: ['(11) 98765-4321', '+55 11 98765-4321', 'celular 11987654321', 'tel 21 3456-7890'],
  cep: ['CEP 01310-100', 'cep 01310100'],
  endereco: ['Rua das Flores, 123', 'Av. Paulista 1578', 'mora na Avenida Brasil, nº 500'],
};

for (const [tipo, textos] of Object.entries(casos)) {
  test(`detecta ${tipo}`, () => {
    for (const t of textos) assert.ok(detectar(t).includes(tipo), `${tipo} não detectado em: ${t}`);
  });
}

test('não dispara em datas, valores, números de pedido e textos comuns', () => {
  const limpos = [
    'Reunião em 12/03/2026 às 14:30, prazo 2026-04-15.',
    'Total do pedido: R$ 1.234.567,89 (um milhão...). Desconto de 12,5%.',
    'Pedido 4500123456, nota fiscal 000123456, protocolo 20260312001.',
    'O pedido 11987654321 foi faturado.',
    'Número de série 4111111111111112 do equipamento.',
    'A senha do wifi é trocada toda semana.',
    'Pagar a conta de luz de 2026 até sexta.',
    'CPF inválido 123.456.789-00 não conta.',
    'Versão 1.234.567 lançada; código 12345-678-90.',
    'Revisar o token de acesso do portal.',
    'A rua estava cheia hoje.',
    'Lote 20260926 com 1500 unidades, peso 12.500 kg.',
  ];
  for (const t of limpos) assert.deepEqual(detectar(t), [], `falso positivo em: ${t}`);
});

test('devolve só os tipos, nunca os valores', () => {
  const r = detectar('CPF 529.982.247-25 e email ana@empresa.com.br');
  assert.deepEqual(r, ['cpf', 'email']);
  assert.ok(!JSON.stringify(r).includes('529'));
});

test('decidir: credencial sempre bloqueada, mesmo marcada como permitir', () => {
  assert.deepEqual(decidir(['cpf', 'email', 'credencial'], { cpf: 'bloquear', email: 'permitir', credencial: 'permitir' }),
    { bloqueados: ['cpf', 'credencial'], permitidos: ['email'] });
});
