// Restauração: node scripts/restaurar.js <arquivo.sqlite.gz | s3://bucket/caminho>
// Pare o servidor antes. O banco atual fica guardado com o sufixo .antes-da-restauracao.
import { restaurar } from '../src/backup.js';

const origem = process.argv[2];
if (!origem) { console.error('Uso: node scripts/restaurar.js <arquivo.sqlite.gz | s3://bucket/caminho>'); process.exit(1); }
try {
  const r = await restaurar(origem, process.env.BANCO || 'dados/greenia.sqlite');
  console.log(`Restaurado. Integridade conferida: ${r.pessoas} pessoas, ${r.eventos} eventos.`);
  if (r.anterior) console.log(`O banco anterior ficou em ${r.anterior}.`);
} catch (e) { console.error('Restauração cancelada: ' + e.message); process.exit(1); }
