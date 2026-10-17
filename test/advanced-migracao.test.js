import {test} from 'node:test';
import assert from 'node:assert/strict';
import {abrirBanco,migrar} from '../src/db.js';
test('banco existente na versão 23 recebe requisitos; migração é reaplicável',()=>{
 const db=abrirBanco();try{
  db.exec("alter table advanced_pedidos drop column requisitos; pragma user_version=23");
  migrar(db);
  assert.ok(db.prepare("select 1 from pragma_table_info('advanced_pedidos') where name='requisitos'").get());
  assert.equal(db.prepare('pragma user_version').get().user_version,25);
  migrar(db);assert.equal(db.prepare('pragma user_version').get().user_version,25);
 }finally{db.close();}
});
