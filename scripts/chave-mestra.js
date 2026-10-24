// Chave-mestra: impressão digital, envelope selado e recuperação (docs/operacao/backup-e-restauracao.md).
// Nenhum comando imprime a chave. Variáveis: DADOS (padrão dados), BANCO_PLATAFORMA, CHAVE_MESTRA, BACKUP_ENVELOPE_SEGREDO.
//
//   node scripts/chave-mestra.js impressao
//       impressão digital da chave em uso (CHAVE_MESTRA ou dados/.chave-mestra) e a registrada no banco da plataforma
//   node scripts/chave-mestra.js selar --saida envelope.json
//       grava o envelope selado (cifrado com BACKUP_ENVELOPE_SEGREDO) para guardar fora do servidor
//   node scripts/chave-mestra.js recuperar --envelope envelope.json --destino <pasta de dados nova>/.chave-mestra [--banco plataforma.sqlite]
//       abre o envelope, confere a impressão (com a do banco restaurado, se informado) e grava o arquivo (0600)
//   node scripts/chave-mestra.js aceitar --confirmar
//       registra a chave em uso como a nova chave da plataforma (só depois de decidir que a anterior está perdida:
//       as credenciais cifradas com ela precisam ser informadas de novo)
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { abrirEnvelope, gravarChaveMestra, impressaoMestra, lerChaveMestraExistente, segredoEnvelopeDe, selarChaveMestra } from '../src/chave-recuperacao.js';

const [cmd, ...resto] = process.argv.slice(2);
const opcao = n => { const i = resto.indexOf(`--${n}`); return i >= 0 ? resto[i + 1] : undefined; };
const env = process.env;
const dados = env.DADOS || 'dados';
const bancoPlataforma = env.BANCO_PLATAFORMA || join(dados, 'plataforma.sqlite');
const registrada = banco => {
  if (!existsSync(banco)) return null;
  const db = new DatabaseSync(banco, { readOnly: true });
  try { const r = db.prepare("select value from platform_settings where key = 'chave_mestra_impressao'").get(); return r ? JSON.parse(r.value).impressao : null; } finally { db.close(); }
};
const emUso = () => {
  const m = lerChaveMestraExistente({ env, arquivo: join(dados, '.chave-mestra') });
  if (!m) throw new Error('Nenhuma chave-mestra encontrada (CHAVE_MESTRA ou dados/.chave-mestra).');
  return m;
};

try {
  if (cmd === 'impressao') {
    const atual = impressaoMestra(emUso()), reg = registrada(bancoPlataforma);
    console.log(`Chave em uso (${env.CHAVE_MESTRA ? 'CHAVE_MESTRA' : 'arquivo .chave-mestra'}): ${atual}`);
    console.log(`Registrada no banco da plataforma: ${reg || '—'}${reg ? (reg === atual ? ' (confere)' : ' (NÃO CONFERE)') : ''}`);
    if (reg && reg !== atual) process.exitCode = 2;
  } else if (cmd === 'selar') {
    const saida = opcao('saida');
    if (!saida) throw new Error('Informe --saida envelope.json');
    const segredo = segredoEnvelopeDe(env);
    if (!segredo) throw new Error('Defina BACKUP_ENVELOPE_SEGREDO (32+ caracteres, guardado no cofre, diferente das outras chaves).');
    writeFileSync(saida, JSON.stringify(selarChaveMestra(emUso(), segredo), null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    console.log(`Envelope gravado em ${saida} (cifrado; impressão ${impressaoMestra(emUso())}).`);
  } else if (cmd === 'recuperar') {
    const arq = opcao('envelope'), destino = opcao('destino');
    if (!arq || !destino) throw new Error('Informe --envelope e --destino');
    const segredo = segredoEnvelopeDe(env);
    if (!segredo) throw new Error('Defina BACKUP_ENVELOPE_SEGREDO.');
    const mestra = abrirEnvelope(readFileSync(arq, 'utf8'), segredo);
    const imp = impressaoMestra(mestra), reg = opcao('banco') ? registrada(opcao('banco')) : null;
    if (opcao('banco') && reg !== imp) throw new Error(`A chave do envelope (${imp}) não é a registrada no banco restaurado (${reg || '—'}). Nada foi gravado.`);
    gravarChaveMestra(destino, mestra);
    console.log(`Chave-mestra recuperada em ${destino} (0600); impressão ${imp}${reg ? ', confere com o banco' : ''}. Não defina CHAVE_MESTRA no serviço que usar este arquivo.`);
  } else if (cmd === 'aceitar') {
    if (!resto.includes('--confirmar')) throw new Error('Rode com --confirmar. As credenciais cifradas com a chave anterior deixam de ser lidas e precisam ser informadas de novo.');
    const atual = impressaoMestra(emUso());
    const db = new DatabaseSync(bancoPlataforma);
    try {
      const antes = registrada(bancoPlataforma);
      db.prepare("insert into platform_settings (key, value) values ('chave_mestra_impressao', ?) on conflict (key) do update set value = excluded.value").run(JSON.stringify({ impressao: atual, desde: new Date().toISOString(), anterior: antes }));
      db.prepare("insert into audit_log (at, action, entity, after, origin) values (?, 'master_key.accepted', 'master_key', ?, ?)").run(new Date().toISOString(), JSON.stringify({ anterior: antes, atual }), JSON.stringify({ painel: 'linha de comando' }));
    } finally { db.close(); }
    console.log(`Chave em uso (${atual}) registrada como a chave da plataforma. Reinicie o serviço.`);
  } else throw new Error('Comandos: impressao | selar | recuperar | aceitar');
} catch (e) { console.error(e.message); process.exit(1); }
