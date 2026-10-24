// O provedor de infraestrutura de IA é interno: no ambiente da empresa (quem usa E o admin da empresa) o nome
// dele não aparece em nenhuma resposta, erro, evento, exportação, streaming ou código de página. Só o painel
// global da plataforma e o console do operador podem mostrá-lo.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { subir } from './ajuda.js';
import { openRouterFalso, enviarMensagem } from './openrouter-falso.js';
import { salvarConfig } from '../src/config.js';
import { ErroIA } from '../src/ia.js';
import { textoSemProvedor, semProvedor } from '../src/sem-provedor.js';

const PROVEDOR = /open\s*-?\s*router/i;
let S, OR, admin, ana, falhar = false;
before(async () => {
  OR = await openRouterFalso();
  const ia = { ...OR.ia, configurada: true, listarModelos: (...a) => OR.ia.listarModelos(...a),
    async *enviar(m, op) { if (falhar) throw new ErroIA('OpenRouter respondeu 502: upstream error at https://openrouter.ai/api/v1 (OPENROUTER_API_KEY)', 502); yield* OR.ia.enviar(m, op); } };
  S = await subir({ ia });
  salvarConfig(S.app.db, { dominios: ['exemplo.com.br'] });
  admin = await S.cliente().entrar('admin@exemplo.com.br');
  ana = await S.cliente().entrar('ana@exemplo.com.br');
});
after(async () => { await S.fechar(); await OR.fechar(); });

test('filtro de saída: substitui o nome, a URL, a chave e o identificador do provedor', () => {
  assert.equal(textoSemProvedor('openrouter/auto'), 'classe:externo');
  assert.equal(textoSemProvedor('OpenRouter respondeu 502'), 'serviço de IA respondeu 502');
  assert.doesNotMatch(textoSemProvedor('erro em https://openrouter.ai/api/v1/chat, falta OPENROUTER_API_KEY'), PROVEDOR);
  assert.deepEqual(semProvedor({ openrouter: ['Open Router', 1] }), { 'serviço de IA': ['serviço de IA', 1] });
  assert.equal(textoSemProvedor('texto comum'), 'texto comum');
});

test('fontes externas preservam URL exata mesmo quando caminho, consulta ou domínio citam o provedor', () => {
  const urls = ['https://github.com/OpenRouterTeam/docs/blob/main/README.md',
    'https://revista.exemplo/openrouter/auto?tema=OpenRouter#OpenRouter',
    'https://openrouter.ai.exemplo/artigo', 'https://noticias.exemplo/open-router'];
  for (const url of urls) {
    assert.equal(textoSemProvedor(url), url);
    assert.equal(textoSemProvedor(`Fonte: [documentação](${url})`), `Fonte: [documentação](${url})`);
    assert.deepEqual(semProvedor({ fontes: [{ url, titulo: 'OpenRouter em análise' }] }),
      { fontes: [{ url, titulo: 'serviço de IA em análise' }] });
  }
  assert.doesNotMatch(textoSemProvedor('Falha em https://OPENROUTER.ai/api/v1/chat e OpenRouter respondeu 502'), PROVEDOR);
});

test('citação externa conserva o endereço no resultado e ao reabrir o histórico', async () => {
  const url = 'https://github.com/OpenRouterTeam/docs/blob/main/README.md';
  const provedor = await openRouterFalso({ fontes: [{ url, titulo: 'Documentação oficial' }] });
  const s = await subir({ ia: provedor.ia });
  try {
    salvarConfig(s.app.db, { dominios: ['exemplo.com.br'], pesquisaWeb: { ativa: true } });
    const cli = await s.cliente().entrar('admin@exemplo.com.br');
    const conv = (await cli.post('/api/conversas', {})).dados.conversa;
    const r = await enviarMensagem(cli, conv.id, { texto: 'Pesquise as novidades recentes de IA.' });
    assert.equal(r.status, 200, JSON.stringify(r.erro));
    assert.ok(provedor.chamadas.some(b => b.plugins?.some(p => p.id === 'web')));
    assert.ok(r.fim.fontes.some(f => f.url === url), JSON.stringify(r.fim.fontes));
    const historico = (await cli.get(`/api/conversas/${conv.id}`)).dados;
    assert.ok(historico.mensagens.some(m => m.fontes?.some(f => f.url === url)), JSON.stringify(historico.mensagens));
  } finally { await s.fechar(); await provedor.fechar(); }
});

test('código das páginas da empresa não contém o nome do provedor (só o painel global e o console do operador)', () => {
  const raiz = new URL('../public/', import.meta.url).pathname;
  // Painel global, console do operador e os documentos legais da plataforma (que precisam nomear os fornecedores).
  const doPainelGlobal = f => /^(plataforma|operador|termos|privacidade)\./.test(f);
  for (const f of readdirSync(raiz).filter(f => /\.(js|html|css)$/.test(f) && !doPainelGlobal(f)))
    assert.doesNotMatch(readFileSync(raiz + f, 'utf8'), PROVEDOR, f);
  assert.match(readFileSync(raiz + 'plataforma.js', 'utf8'), /OpenRouter/, 'o painel global continua podendo mostrar o provedor');
});

test('respostas da API da empresa, para quem usa e para o admin da empresa, nunca citam o provedor', async () => {
  await admin.put('/api/admin/modelos-config', { automatico: true });
  const coletado = [];
  const guardar = (onde, dados) => coletado.push([onde, typeof dados === 'string' ? dados : JSON.stringify(dados, (k, v) => (k === 'v' ? undefined : v))]);
  for (const [quem, c] of [['pessoa', ana], ['admin', admin]]) {
    const conv = (await c.post('/api/conversas', {})).dados.conversa;
    guardar(`${quem} automatico`, (await enviarMensagem(c, conv.id, { texto: 'Olá', modelo: 'classe:externo' })).eventos);
    guardar(`${quem} automatico pelo id tecnico`, (await enviarMensagem(c, conv.id, { texto: 'Olá', modelo: 'openrouter/auto' })).eventos);
    falhar = true;
    guardar(`${quem} falha do provedor`, (await enviarMensagem(c, conv.id, { texto: 'Olá' })));
    falhar = false;
    guardar(`${quem} conversa`, (await c.get(`/api/conversas/${conv.id}`)).dados);
    guardar(`${quem} seletor`, (await c.get('/api/modelos')).dados);
  }
  for (const p of ['/api/admin/modelos', '/api/admin/roteamento', '/api/admin/eventos', '/api/admin/eventos?formato=csv', '/api/admin/uso', '/api/admin/uso?formato=csv',
    '/api/admin/visao-geral', '/api/admin/governanca', '/api/admin/sigilo', '/api/eu', '/api/politica'])
    guardar(`admin ${p}`, (await admin.get(p)).dados);
  // Erro de configuração com o nome do provedor na mensagem de origem.
  guardar('admin erro', (await admin.put(`/api/admin/modelos/${encodeURIComponent('x/y')}`, { liberado: true, perfil: 'rapido' })).dados);
  await admin.put('/api/admin/modelos-config', { automatico: false });
  for (const [onde, json] of coletado) assert.doesNotMatch(json, PROVEDOR, `${onde}: ${json.match(/.{0,80}open\s*-?\s*router.{0,80}/i)?.[0]}`);
  // O detalhe técnico continua guardado no servidor, para o painel global e o diagnóstico.
  const ev = S.app.db.prepare("select detalhes from eventos where tipo = 'ai.failed' order by id desc limit 1").get();
  assert.match(ev.detalhes, /OpenRouter respondeu 502/);
});

test('arquivos da interface: revalidação a cada carga (deploy novo aparece na hora) e 304 quando nada mudou', async () => {
  const r1 = await fetch(`${S.base}/estilo.css`);
  assert.equal(r1.status, 200);
  assert.equal(r1.headers.get('cache-control'), 'no-cache');
  const etag = r1.headers.get('etag');
  assert.ok(etag);
  const r2 = await fetch(`${S.base}/estilo.css`, { headers: { 'if-none-match': etag } });
  assert.equal(r2.status, 304);
});
