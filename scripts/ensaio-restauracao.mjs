// Ensaio de restauração isolado (docs/operacao/backup-e-restauracao.md). Nunca escreve na origem nem em /app/dados.
//
//   node scripts/ensaio-restauracao.mjs
//       Ensaio sintético completo: monta plataforma + 2 empresas sintéticas, faz o backup com o código real
//       (local + S3 FALSO local, com expiração e versionamento), restaura numa pasta nova, sobe a aplicação isolada
//       em 127.0.0.1, valida, mede RTO/RPO e descarta tudo. --volume-mb N acrescenta ~N MB por empresa (medir tempos).
//
//   node scripts/ensaio-restauracao.mjs --s3 s3://bucket/prefixo [--destino /tmp/ensaio] [--manter] [--relatorio r.json]
//       Ensaio real a partir do S3 (S3_ENDPOINT, S3_CHAVE, S3_SEGREDO, S3_REGIAO, BACKUP_CHAVE_CIFRA). Chave-mestra:
//       envelope mais novo do prefixo + BACKUP_ENVELOPE_SEGREDO, ou CHAVE_MESTRA.
//
//   node scripts/ensaio-restauracao.mjs --backups <pasta dados/backups copiada> [--chave-arquivo <.chave-mestra>]
//       [--envelope <envelope.json>] [--destino ...] [--manter] [--relatorio r.json]
//       Ensaio real a partir de uma cópia da pasta de backups (ex.: copiada de um snapshot). Chave-mestra: arquivo,
//       envelope + BACKUP_ENVELOPE_SEGREDO, ou CHAVE_MESTRA.
//
// Saída: verificações, RTO, RPO e tamanhos. Nenhuma chave, segredo ou conteúdo de conversa é impresso.
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DESIGN_IA ??= '0';
const { ensaioSintetico, ensaiar, descartar } = await import('../src/ensaio-restauracao.js');

const args = process.argv.slice(2);
const opcao = n => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const tem = n => args.includes(`--${n}`);
const log = s => console.log(s);
const env = process.env;

function resumo(e) {
  console.log('');
  console.log(`Resultado: ${e.ok ? 'APROVADO' : 'REPROVADO'} (${e.verificacoes.filter(v => v.ok).length}/${e.verificacoes.length} verificações)`);
  if (e.rto_ms != null) console.log(`RTO medido: ${(e.rto_ms / 1000).toFixed(2)} s (listar ${e.etapas.listar_ms} ms, restaurar ${e.etapas.restaurar_ms} ms, subir ${e.etapas.subir_ms} ms). Meta proposta: 4 h.`);
  if (e.rpo) console.log(`RPO medido: ${e.rpo.rpo_s} s (backup mais antigo usado ${e.rpo.backup_mais_antigo_usado}; referência ${e.rpo.referencia}). Meta proposta: 24 h.`);
  if (e.tamanhos) console.log(`Tamanhos dos backups (.gz): ${Object.entries(e.tamanhos).map(([k, v]) => `${k} ${v} B`).join(', ')}`);
  if (e.chave) console.log(`Chave-mestra: ${e.chave.origem || 'não recuperada'}; impressão ${e.chave.impressao || '—'}; registrada ${e.chave.registrada || '—'}`);
  if (e.falhas.length) console.log(`Falhas: ${e.falhas.join('; ')}`);
}

let relatorio;
if (!tem('s3') && !tem('backups')) {
  const F = await import('./ensaio/s3-falso.js');
  log('Ensaio sintético (S3 falso local, nenhuma chamada externa).');
  relatorio = await ensaioSintetico({ ...F, log, manter: tem('manter'), volumeMb: Number(opcao('volume-mb')) || 0 });
  resumo(relatorio.ensaio);
  console.log(`Backup: ${relatorio.backup.concluidos}/${relatorio.backup.total} bancos em ${relatorio.backup.ms} ms; ${relatorio.backup.objetos} objetos cifrados no S3 falso (${relatorio.backup.bytes_s3} B); expiração conferida: ${relatorio.backup.ciclo?.ok ? `${relatorio.backup.ciclo.totalDias} d` : 'não'}`);
  console.log(`Descarte: ${relatorio.descarte.map(d => `${d.pasta} ${d.removida ? 'removida' : 'NÃO REMOVIDA'}`).join('; ') || 'mantido (--manter)'}`);
} else {
  const destino = opcao('destino') || join(mkdtempSync(join(tmpdir(), 'greenia-ensaio-real-')), 'restaurado');
  const fonte = tem('s3') ? { tipo: 's3', destino: opcao('s3'), env: { S3_ENDPOINT: env.S3_ENDPOINT, S3_CHAVE: env.S3_CHAVE, S3_SEGREDO: env.S3_SEGREDO, S3_REGIAO: env.S3_REGIAO, S3_SSE: env.S3_SSE, BACKUP_CHAVE_CIFRA: env.BACKUP_CHAVE_CIFRA } }
    : { tipo: 'local', pasta: opcao('backups'), env: { BACKUP_CHAVE_CIFRA: env.BACKUP_CHAVE_CIFRA } };
  const chave = { envelopeSegredo: env.BACKUP_ENVELOPE_SEGREDO || undefined, envelopeArquivo: opcao('envelope'), arquivo: opcao('chave-arquivo'), env: env.CHAVE_MESTRA ? { CHAVE_MESTRA: env.CHAVE_MESTRA } : {} };
  log(`Ensaio real a partir de ${fonte.tipo === 's3' ? fonte.destino : fonte.pasta} para ${destino} (aplicação isolada em 127.0.0.1).`);
  const e = await ensaiar({ fonte, destino, chave, proibidos: fonte.tipo === 'local' ? [fonte.pasta] : [], log });
  relatorio = { ensaio: e, descarte: tem('manter') ? [] : descartar([destino]) };
  resumo(e);
  console.log(`Descarte: ${relatorio.descarte.map(d => `${d.pasta} ${d.removida ? 'removida' : 'NÃO REMOVIDA'}`).join('; ') || `mantido em ${destino} (--manter): apague depois com rm -rf`}`);
}
if (opcao('relatorio')) { writeFileSync(opcao('relatorio'), JSON.stringify(relatorio, null, 2) + '\n'); console.log(`Relatório: ${opcao('relatorio')}`); }
process.exit(relatorio.ensaio?.ok ? 0 : 1);
