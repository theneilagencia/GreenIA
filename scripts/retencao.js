// Retenção das cópias (docs/politica-retencao.md). Uso, na pasta da aplicação:
//   node scripts/retencao.js plano                         o que seria apagado, mantido e alertado (só leitura)
//   node scripts/retencao.js aplicar --confirmar           apaga o que o plano marcou (refaz o plano antes)
//   node scripts/retencao.js hold <caminho> --motivo "..." --por "..." [--revisar-em 2026-12-31]
//   node scripts/retencao.js liberar <caminho>
//   node scripts/retencao.js classificar <pasta> --criado-em 2026-09-30T16:46:09Z [--tipo pre-deploy] [--motivo "..."]
//   node scripts/retencao.js manual --motivo "..." [--tipo pre-deploy]     backup manual de todos os bancos
// Variáveis: DADOS (padrão dados), RETENCAO_AUTOMATICO_DIAS, RETENCAO_MANUAL_DIAS, RETENCAO_EXCLUIDAS_DIAS.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { planejar, executar, prazosDe, marcarHold, liberarHold, classificarManual, backupManual } from '../src/retencao.js';

const [cmd = 'plano', ...resto] = process.argv.slice(2);
const opcao = n => { const i = resto.indexOf(`--${n}`); return i >= 0 ? resto[i + 1] : undefined; };
const tem = n => resto.includes(`--${n}`);
const alvo = resto.find((x, i) => !x.startsWith('--') && !resto[i - 1]?.startsWith('--'));
const dados = process.env.DADOS || 'dados';
const prazos = prazosDe(process.env);

// Bancos em uso (protegidos): o da plataforma e o de cada empresa, lidos do banco da plataforma (só leitura).
function bancosEmUso() {
  const plataforma = join(dados, 'plataforma.sqlite');
  const lista = { plataforma: existsSync(plataforma) ? plataforma : null };
  if (lista.plataforma) {
    const db = new DatabaseSync(plataforma, { readOnly: true });
    try { for (const c of db.prepare('select id, banco from companies').all()) if (existsSync(c.banco)) lista[c.id] = c.banco; } finally { db.close(); }
  } else if (existsSync(join(dados, 'greenia.sqlite'))) lista.greenia = join(dados, 'greenia.sqlite');
  return Object.fromEntries(Object.entries(lista).filter(([, v]) => v));
}

function mostrar(plano) {
  console.log(`Plano de retenção em ${plano.em} (prazos: automático ${plano.prazos.automaticoDias} d, manual ${plano.prazos.manualDias} d, empresa excluída ${plano.prazos.excluidasDias} d)`);
  for (const i of plano.itens) console.log(`${i.acao.padEnd(7)} ${String(i.camada).padEnd(12)} ${String(i.tamanho).padStart(10)} B  ${i.criado_em || '—'}  ${i.idade_dias ?? '—'} d  ${i.caminho}  (${i.motivo})`);
  console.log(`Resumo: ${plano.resumo.apagar} a apagar (${plano.resumo.bytesApagar} B), ${plano.resumo.manter} mantidos, ${plano.resumo.alertas} alertas.`);
}

try {
  if (cmd === 'plano') mostrar(planejar({ dados, prazos, bancosAtivos: Object.values(bancosEmUso()) }));
  else if (cmd === 'aplicar') {
    if (!tem('confirmar')) throw new Error('Para apagar, rode com --confirmar (veja antes o plano: node scripts/retencao.js plano).');
    const plano = planejar({ dados, prazos, bancosAtivos: Object.values(bancosEmUso()) });
    mostrar(plano);
    const r = executar(plano, { aplicar: true, log: console.log });
    for (const f of r.feitos) console.log(`${f.resultado}: ${f.caminho}`);
  } else if (cmd === 'hold') console.log('Hold gravado:', marcarHold(dados, alvo, { motivo: opcao('motivo'), por: opcao('por'), revisar_em: opcao('revisar-em') || null }));
  else if (cmd === 'liberar') { liberarHold(dados, alvo); console.log('Hold removido. O item volta para a regra de prazo.'); }
  else if (cmd === 'classificar') console.log('Classificado:', classificarManual(dados, alvo, { criado_em: opcao('criado-em'), tipo: opcao('tipo') || 'manual', motivo: opcao('motivo') }));
  else if (cmd === 'manual') { const r = backupManual({ dados, bancos: bancosEmUso(), tipo: opcao('tipo') || 'pre-deploy', motivo: opcao('motivo') }); console.log(`Backup manual em ${r.pasta}: ${r.arquivos.join(', ')}`); }
  else throw new Error(`Comando desconhecido: ${cmd}`);
} catch (e) { console.error(e.message); process.exit(1); }
