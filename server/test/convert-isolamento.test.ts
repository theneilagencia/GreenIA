// Isolamento das conversões: os arquivos vêm de fora e podem ser maliciosos.
// Cada ferramenta roda sem os segredos do servidor, com limites (prlimit) e sem
// rede (unshare), quando o sistema permite; o ImageMagick só lê os formatos de
// imagem usados; o LibreOffice não busca conteúdo vinculado.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import JSZip from 'jszip';
import { ConversionError, LocalConverter, redefinirSondagem, sondarIsolamento, type ConverterConfig } from '../src/convert/converter.ts';

const dir = await mkdtemp(join(tmpdir(), 'greenia-isolamento-'));
after(() => rm(dir, { recursive: true, force: true }));
const base: ConverterConfig = { OCRMYPDF_CMD: 'ocrmypdf', OCR_LANG: 'por', MAGICK_CMD: 'convert', SOFFICE_CMD: 'soffice', CONVERT_TIMEOUT_S: 60 };
const temTool = (bin: string, args: string[]) => new Promise<boolean>(r => execFile(bin, args, e => r(!e || (e as NodeJS.ErrnoException).code !== 'ENOENT')));
const sistema = await sondarIsolamento();

// "Ferramenta" que grava o que vê (ambiente, limites, interfaces de rede) e falha.
async function inspecionar(cfg: Partial<ConverterConfig>) {
  const saida = join(dir, `visto-${Math.random().toString(36).slice(2)}.txt`);
  const script = join(dir, 'inspecionar.sh');
  await writeFile(script, `#!/bin/sh\n{ echo "== env"; env; echo "== limites"; cat /proc/self/limits; echo "== rede"; cat /proc/net/dev; echo "== cwd"; pwd; } > "${saida}"\nexit 3\n`);
  const conv = new LocalConverter({ ...base, ...cfg, MAGICK_CMD: `sh ${script}` });
  await assert.rejects(conv.imageToJpeg(new Uint8Array([1, 2, 3])), ConversionError);
  const txt = await readFile(saida, 'utf8');
  const parte = (n: string) => txt.split(`== ${n}\n`)[1].split('\n== ')[0];
  return { env: parte('env'), limites: parte('limites'), rede: parte('rede'), cwd: parte('cwd').trim() };
}

test('as ferramentas não recebem os segredos do servidor; HOME e TMPDIR ficam no diretório da chamada', async () => {
  const antes = { ...process.env };
  Object.assign(process.env, { ANTHROPIC_API_KEY: 'sk-ant-segredo-de-teste', DATABASE_URL: 'postgres://dono:senha@banco/greenia', SMTP_URL: 'smtps://u:p@smtp', OIDC_CLIENTE_SECRET: 'segredo-oidc' });
  try {
    const v = await inspecionar({});
    for (const s of ['sk-ant-segredo-de-teste', 'senha@banco', 'smtps://', 'segredo-oidc', 'ANTHROPIC_API_KEY', 'DATABASE_URL']) assert.ok(!v.env.includes(s), `vazou: ${s}`);
    assert.match(v.env, new RegExp(`^HOME=${v.cwd}$`, 'm'));
    assert.match(v.env, /^MAGICK_CONFIGURE_PATH=.*deploy\/imagemagick\/$/m);
    assert.match(v.cwd, /greenia-conv-/);
  } finally { process.env = antes; }
});

test('limites de memória, CPU, tamanho de arquivo e core, quando o sistema tem prlimit', { skip: !sistema.prlimit && 'prlimit ausente' }, async () => {
  const v = await inspecionar({ CONVERT_MEM_MB: 1536, CONVERT_FILE_MB: 256 });
  const lim = (nome: string) => v.limites.split('\n').find(l => l.startsWith(nome))!.slice(26).trim().split(/\s+/)[0];
  assert.equal(lim('Max address space'), String(1536 * 1024 * 1024));
  assert.equal(lim('Max file size'), String(256 * 1024 * 1024));
  assert.equal(lim('Max core file size'), '0');
  assert.equal(lim('Max cpu time'), String(60 + 20));                   // tempo da chamada: CONVERT_TIMEOUT_S + 20 por página
});

test('sem rede, quando o sistema permite unshare: só a interface de loopback, desligada', { skip: !sistema.unshare && 'unshare -rn indisponível' }, async () => {
  const v = await inspecionar({});
  const ifs = v.rede.split('\n').slice(2).filter(Boolean).map(l => l.split(':')[0].trim());
  assert.deepEqual(ifs, ['lo']);
  // Com o isolamento desligado, as interfaces do sistema aparecem (a prova de que o teste mede algo).
  const doSistema = (await readFile('/proc/net/dev', 'utf8')).split('\n').slice(2).filter(Boolean).map(l => l.split(':')[0].trim());
  if (doSistema.some(i => i !== 'lo')) {
    const livre = await inspecionar({ CONVERT_ISOLATION: 'off' });
    assert.ok(livre.rede.split('\n').slice(2).some(l => l.trim() && !l.trim().startsWith('lo:')), 'sem isolamento, a rede do sistema aparece');
  }
});

test('CONVERT_ISOLATION=required recusa converter onde não há isolamento de rede', async () => {
  const path = process.env.PATH;
  redefinirSondagem();
  process.env.PATH = join(dir, 'sem-ferramentas');                      // nem unshare nem prlimit
  try {
    const conv = new LocalConverter({ ...base, CONVERT_ISOLATION: 'required' });
    await assert.rejects(conv.imageToJpeg(new Uint8Array([1])), /isolamento indisponível/);
    assert.deepEqual(await conv.isolamento(), { rede: false, limites: false, ambienteLimpo: true });
  } finally { process.env.PATH = path; redefinirSondagem(); }
});

test('ImageMagick: SVG (que busca endereços externos) é recusado pela política; PNG passa', { skip: !(await temTool('convert', ['-version'])) && 'ImageMagick ausente' }, async () => {
  const conv = new LocalConverter(base);
  const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><image href="http://127.0.0.1:1/x.png" width="10" height="10"/></svg>');
  await assert.rejects(conv.imageToJpeg(svg), /política de segurança/);
  const png = await new Promise<Buffer>((res, rej) => execFile('convert', ['-size', '20x20', 'xc:white', 'png:-'], { encoding: 'buffer' }, (e, out) => (e ? rej(e) : res(out))));
  assert.equal((await conv.imageToJpeg(new Uint8Array(png))).length, 1);
});

test('LibreOffice: imagem vinculada a um endereço interno não é buscada na conversão (mesmo sem isolamento de rede)', { skip: !(await temTool('soffice', ['--version'])) && 'LibreOffice ausente' }, async () => {
  const acessos: string[] = [];
  const srv = createServer((req, res) => { acessos.push(req.url ?? ''); res.statusCode = 404; res.end(); });
  await new Promise<void>(r => srv.listen(0, '127.0.0.1', () => r()));
  const porta = (srv.address() as { port: number }).port;
  try {
    const z = new JSZip();
    z.file('mimetype', 'application/vnd.oasis.opendocument.text', { compression: 'STORE' });
    z.file('META-INF/manifest.xml', '<?xml version="1.0" encoding="UTF-8"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2"><manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/></manifest:manifest>');
    z.file('content.xml', `<?xml version="1.0" encoding="UTF-8"?><office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" office:version="1.2"><office:body><office:text><text:p>Contrato de teste.</text:p><text:p><draw:frame svg:width="2cm" svg:height="2cm"><draw:image xlink:href="http://127.0.0.1:${porta}/interno.png" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/></draw:frame></text:p></office:text></office:body></office:document-content>`);
    const odt = new Uint8Array(await z.generateAsync({ type: 'uint8array', mimeType: 'application/vnd.oasis.opendocument.text' }));
    // Sem isolamento de rede: o que bloqueia é o perfil do LibreOffice.
    const docx = await new LocalConverter({ ...base, CONVERT_ISOLATION: 'off' }).officeToOoxml(odt, 'odt');
    assert.ok(docx.length > 0);
    assert.deepEqual(acessos, []);
  } finally { srv.close(); }
});
