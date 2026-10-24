// Contatos comerciais (modo multiempresa). Uso, na pasta da aplicação:
//   node scripts/contatos.js contar      quantidades: lista antiga (se ainda existir), contatos, interações de formulário
//   node scripts/contatos.js rollback --confirmar
//                                        recria a lista antiga (platform_settings 'leads') a partir das interações, sem
//                                        apagar a tabela; só para voltar a uma versão anterior do código
// Variável: BANCO_PLATAFORMA (padrão dados/plataforma.sqlite). Imprime só contagens, nunca dados de contato.
import { DatabaseSync } from 'node:sqlite';
import { lerAjuste, salvarAjuste } from '../src/plataforma/db.js';
import { listaAntigaDosContatos } from '../src/plataforma/contatos.js';

const [cmd = 'contar', ...resto] = process.argv.slice(2);
const db = new DatabaseSync(process.env.BANCO_PLATAFORMA || 'dados/plataforma.sqlite', { readOnly: cmd !== 'rollback' });
const n = sql => db.prepare(sql).get().n;
try {
  const antiga = lerAjuste(db, 'leads', null);
  const contagem = () => ({ listaAntiga: Array.isArray(antiga) ? antiga.length : null, contatos: n('select count(*) as n from commercial_contacts'),
    interacoesFormulario: n("select count(*) as n from commercial_interactions where tipo = 'formulario'"), emailsDistintos: n('select count(distinct email) as n from commercial_contacts') });
  if (cmd === 'contar') console.log(JSON.stringify(contagem()));
  else if (cmd === 'rollback') {
    if (!resto.includes('--confirmar')) throw new Error('Para recriar a lista antiga, rode com --confirmar.');
    const lista = listaAntigaDosContatos({ db });
    salvarAjuste(db, 'leads', lista);
    console.log(JSON.stringify({ ...contagem(), listaAntigaRecriada: lista.length }));
  } else throw new Error(`Comando desconhecido: ${cmd}`);
} catch (e) { console.error(e.message); process.exitCode = 1; } finally { db.close(); }
