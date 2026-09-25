// React servido pela própria GreenIA: versão fixa e integridade conferidas na
// subida. Arquivo instalado diferente do fixado derruba a subida do servidor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REACT_VERSION, VENDOR, conferirVendor, vendorUrl } from '../src/web/static.ts';

test('versão fixa e sha384 conferem com os arquivos instalados', () => {
  assert.equal(REACT_VERSION, '18.3.1');
  assert.doesNotThrow(() => conferirVendor());
  assert.equal(vendorUrl('react.production.min.js'), '/vendor/react@18.3.1/react.production.min.js');
});

test('integridade diferente da fixada impede a subida', () => {
  const v = VENDOR['react.production.min.js'];
  const certo = v.sri;
  v.sri = 'sha384-outro';
  try { assert.throws(() => conferirVendor(), /integridade diferente da fixada/); } finally { v.sri = certo; }
});
