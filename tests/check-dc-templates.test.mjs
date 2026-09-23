import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkTemplate } from '../scripts/check-dc-templates.mjs';

// Monta um .dc.html mínimo com o template e a classe dados.
const page = (tpl, renderVals, props = '{}') => `<x-dc>${tpl}</x-dc>
<script type="text/x-dc" data-dc-script data-props="${props.replace(/"/g, '&quot;')}">
class Component extends DCLogic {
  renderVals() {
    return {
${renderVals}
    };
  }
}
</script>`;

test('style-hover com {{ }} é erro (o defeito dos hovers)', () => {
  const r = checkTemplate('x', page('<button style-hover="{{ btnHover }}">a</button>', '      btnHover: {},'));
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /style-hover/);
});

test('style-hover literal passa', () => {
  const r = checkTemplate('x', page('<button style="color:red" style-hover="background:blue">a</button>', ''));
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings, []);
});

test('hover que briga com o inline sem !important vira aviso', () => {
  const r = checkTemplate('x', page('<button style="background:red" style-hover="background:blue">a</button>', ''));
  assert.equal(r.warnings.length, 1);
  const ok = checkTemplate('x', page('<button style="background:red" style-hover="background:blue !important">a</button>', ''));
  assert.deepEqual(ok.warnings, []);
});

test('ref usada no template e ausente de renderVals() é erro (o defeito da rolagem)', () => {
  const r = checkTemplate('x', page('<div ref="{{ msgRef }}"></div>', '      other: 1,'));
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /msgRef.*ref/);
});

test('handler ausente é erro; presente passa', () => {
  assert.equal(checkTemplate('x', page('<button onClick="{{ send }}">a</button>', '      x: 1,')).errors.length, 1);
  assert.deepEqual(checkTemplate('x', page('<button onClick="{{ send }}">a</button>', '      send: () => this.send(),')).errors, []);
});

test('props declarados, variáveis de sc-for, negação e literais contam como conhecidos', () => {
  const tpl = '<sc-for list="{{ items }}" as="it"><span>{{ it.name }} {{ $index }}</span></sc-for>'
    + '<sc-if value="{{ !open }}">{{ userName }}</sc-if><sc-if value="{{ true }}"></sc-if>';
  const r = checkTemplate('x', page(tpl, '      items: [],\n      open,', '{"userName":{"default":"a"}}'));
  assert.deepEqual(r.errors, []);
});

test('chaves de objetos aninhados em renderVals() não contam como chaves do topo', () => {
  const r = checkTemplate('x', page('<span>{{ inner }}</span>', '      list: items.map(i => ({\n        inner: 1,\n      })),'));
  assert.equal(r.errors.length, 1);
});
