// A plataforma é genérica: nenhum nome de cliente, área fixa, setor ou ERP no
// código da aplicação. Tudo isso é configuração feita pela tela.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const PROIBIDOS = [
  // clientes e empresas
  'repet', 'theneil', 'bts global',
  // ERPs e sistemas de gestão
  'sygecom', 'totvs', 'protheus', 'datasul', 'sankhya', 'senior sistemas', 'omie', 'bling', 'sap business', 'sap s/4', 'oracle netsuite', 'dynamics 365',
  // áreas e setores fixos
  'fiscal', 'suprimentos', 'recursos humanos', 'departamento pessoal', 'construtora', 'contabilidade',
];
const RAIZ = new URL('..', import.meta.url).pathname;
const ALVOS = ['src', 'public', 'modelos-quick-win.json', 'scripts'];

function arquivos(p) {
  if (!existsSync(p)) return [];
  if (statSync(p).isFile()) return [p];
  return readdirSync(p).flatMap(n => (n === 'assets' ? [] : arquivos(join(p, n))));
}

test('nenhum nome de cliente, área fixa ou ERP no código da aplicação', () => {
  const achados = [];
  for (const f of ALVOS.flatMap(a => arquivos(join(RAIZ, a)))) {
    const texto = readFileSync(f, 'utf8').toLowerCase();
    for (const t of PROIBIDOS) {
      const re = new RegExp(`(^|[^a-zà-ú])${t.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}([^a-zà-ú]|$)`);
      if (re.test(texto)) achados.push(`${f.slice(RAIZ.length)}: ${t}`);
    }
  }
  assert.deepEqual(achados, []);
});
