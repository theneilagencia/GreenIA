// Leitura do cadastro e pacote privado de evidências sintéticas. Não altera acesso ou bancos.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync, mkdtempSync, lstatSync, readdirSync, chmodSync, realpathSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const sha = b => createHash('sha256').update(b).digest('hex');
function conferir(p, esperado) {
  const b = readFileSync(p);
  if (sha(b) !== esperado) throw new Error('Evidência divergente: ' + p);
  return b;
}
function arvore(p) {
  const st = lstatSync(p);
  if (st.isSymbolicLink()) throw new Error('Link simbólico recusado no pacote');
  if (st.isDirectory()) return readdirSync(p).reduce((s, n) => s + arvore(join(p, n)), 0);
  if (!st.isFile() || !/\.(?:json|md|pdf|pptx|png|zip|txt|csv|xlsx|docx)$/i.test(p) || st.size > 32 * 1024 * 1024) throw new Error('Arquivo fora do escopo do pacote');
  return st.size;
}
export function diagnosticar(db) {
  const empresa = db.prepare('SELECT id,name,slug,status FROM companies WHERE slug=?').get('homologacao-a');
  if (!empresa) throw new Error('Homologação A não encontrada; nenhum acesso alterado');
  const pessoas = db.prepare(`SELECT u.email,u.status AS conta,cu.status AS vinculo,r.key AS perfil
    FROM company_users cu JOIN users u ON u.id=cu.user_id JOIN roles r ON r.id=cu.role_id
    WHERE cu.company_id=? ORDER BY u.email`).all(empresa.id);
  const operadores = db.prepare(`SELECT u.email,u.status AS conta,m.role AS perfil
    FROM platform_members m JOIN users u ON u.id=m.user_id ORDER BY u.email`).all();
  return { empresa, pessoas, operadores, somenteLeitura: true, acessoAlterado: false };
}
export function preparar() {
  const raiz = '/app/dados/qa-preservado-8IqDo0';
  if (realpathSync(raiz) !== raiz) throw new Error('Pasta de evidências divergente');
  const audit = JSON.parse(conferir(join(raiz, 'visuais/reexportacao.json'), '03da9b71e45813c154d9ec03a2847188c335d6b092aeee8617edcbe614417520'));
  if (!Array.isArray(audit.arquivos) || audit.arquivos.length !== 6) throw new Error('Esperados seis arquivos visuais');
  for (const a of audit.arquivos) {
    if (!/^h_(?:12-apresentacao|14-social)-visual-[123]\.(?:pdf|pptx|png|zip)$/.test(a.arquivo)) throw new Error('Arquivo visual inesperado');
    conferir(join(raiz, 'visuais', a.arquivo), a.sha256);
  }
  conferir(join(raiz, 'rodada/relatorio.json'), '669c0c9f9cf9dd0af3a8b6b0a74e2d6c2b7f325c6b40953924b87c868d3f396b');
  conferir(join(raiz, 'historico/inventario.json'), '2f64bafafab45737d1d5ce275dadc14677a0c9433a134be67859fecaa83bd71f');
  let bytes = 0;
  for (const nome of ['visuais', 'rodada', 'historico']) bytes += arvore(join(raiz, nome));
  if (bytes > 150 * 1024 * 1024) throw new Error('Pacote excede limite de 150 MiB');
  const db = new DatabaseSync(resolve(process.env.BANCO_PLATAFORMA || '/app/dados/plataforma.sqlite'), { readOnly: true });
  let diagnostico;
  try { diagnostico = diagnosticar(db); } finally { db.close(); }
  const pasta = mkdtempSync('/tmp/greenia-fechamento-');
  writeFileSync(join(pasta, 'diagnostico.json'), JSON.stringify(diagnostico, null, 2), { mode: 0o600, flag: 'wx' });
  const pacote = join(pasta, 'evidencias.tar.gz');
  execFileSync('tar', ['-czf', pacote, '-C', raiz, 'visuais', 'rodada', 'historico', '-C', pasta, 'diagnostico.json']);
  chmodSync(pacote, 0o600);
  const resultado = { ...diagnostico, pacote, sha256Pacote: sha(readFileSync(pacote)), bancosIncluidos: false, credenciaisIncluidas: false, novasInferencias: 0, liberacaoProducao: false };
  console.log(JSON.stringify(resultado, null, 2));
  return resultado;
}
