import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resumoConferencia} from '../public/jornadas.js';
test('conferência parcial ou desconhecida nunca sugere ausência de problemas',()=>{
 for(const status of ['parcial','inconsistente','pergunta','desconhecido',undefined]) assert.doesNotMatch(resumoConferencia({status,problemas:[]}),/não encontrou problemas/);
 assert.match(resumoConferencia({status:'aprovado',problemas:[]}),/deve revisar antes de usar/);
});
