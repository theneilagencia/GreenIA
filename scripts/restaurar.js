// Restauração: node scripts/restaurar.js <arquivo.sqlite.gz | s3://bucket/caminho> [--tipo empresa|plataforma] [--banco destino.sqlite]
// Pare o servidor antes. O banco atual fica guardado com o sufixo .antes-da-restauracao.
import { restaurar } from '../src/backup.js';

const origem = process.argv[2];
if (!origem) { console.error('Uso: node scripts/restaurar.js <arquivo.sqlite.gz | s3://bucket/caminho>'); process.exit(1); }
try {
  const op = {};
  for (let i = 3; i < process.argv.length; i += 2) {
    const chave = process.argv[i];
    if (!['--tipo', '--banco'].includes(chave) || !process.argv[i + 1] || process.argv[i + 1].startsWith('--')) throw new Error('Opções válidas: --tipo empresa|plataforma e --banco destino.sqlite, sempre com valor.');
    op[chave.slice(2)] = process.argv[i + 1];
  }
  const tipo = op.tipo || (process.env.MULTIEMPRESA === '1' ? 'plataforma' : 'empresa');
  if (!['empresa', 'plataforma'].includes(tipo)) throw new Error('Tipo de banco inválido: use empresa ou plataforma.');
  const banco = op.banco || (tipo === 'plataforma' ? process.env.BANCO_PLATAFORMA || 'dados/plataforma.sqlite' : process.env.BANCO || 'dados/greenia.sqlite');
  const r = await restaurar(origem, banco, { tipo });
  console.log(tipo === 'plataforma' ? `Plataforma restaurada. Integridade conferida: ${r.empresas} empresas, ${r.usuarios} usuários, ${r.eventos} registros de auditoria.` : `Empresa restaurada. Integridade conferida: ${r.pessoas} pessoas, ${r.eventos} eventos.`);
  if (r.anterior) console.log(`O banco anterior ficou em ${r.anterior}.`);
} catch (e) { console.error('Restauração cancelada: ' + e.message); process.exit(1); }
