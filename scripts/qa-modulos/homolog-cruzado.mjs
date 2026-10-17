// Homologação (Etapa 5): acesso cruzado entre os dois tenants de homologação, a partir da sessão do OUTRO tenant.
// Uso: rodar homolog-cruzado <pasta de saída do tenant alvo> <slug do alvo> <slug próprio>
// Lê do alvo só ids e o marcador sintético (gravados por homolog-preparar/programar/conferir-prog). Esperado:
//   1) no próprio contexto, ids do alvo não abrem nada do alvo (404, ou o recurso homônimo do próprio tenant);
//   2) trocando o contexto para o endereço do alvo, a sessão não vale lá (401) em leitura e escrita;
//   3) o marcador do alvo não aparece em nenhuma resposta. Nada do conteúdo das respostas é salvo, só status.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export default async function (c, pasta, alvo, proprio) {
  const ler = n => JSON.parse(readFileSync(join(pasta, n), 'utf8'));
  const prep = ler(readdirSync(pasta).find(n => n.startsWith('homolog-preparar-')));
  const prog = (() => { try { return ler(readdirSync(pasta).find(n => n.startsWith('homolog-programar-'))); } catch { return {}; } })();
  const conf = (() => { const n = readdirSync(pasta).filter(n => n.startsWith('homolog-conferir-prog-')).sort().pop(); return n ? ler(n) : {}; })();
  const execucao = conf.programacoes?.[0]?.execucoes?.[0] || {};
  const marca = prep.marca, qw = prep.quick_win, p = prog.programacao;
  let vazou = [];
  const testar = async (rotulo, metodo, caminho, corpo) => {
    const r = await c.pedir(metodo, caminho, corpo);
    const t = await r.text();
    if (marca && t.includes(marca)) vazou.push(rotulo);
    return [rotulo, metodo, caminho.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, '<uuid>'), r.status];
  };
  const out = { alvo, marcaDoAlvo: marca ? `${marca.slice(0, 15)}…` : null, proprioContexto: [], contextoDoAlvo: [], semSessao: [] };

  // 1) Contexto próprio, ids do alvo.
  for (const x of [
    ['programacao_do_alvo', 'GET', `/api/quick-wins/${qw}/programacoes/${p}/configuracao`],
    ['alterar_programacao_do_alvo', 'PATCH', `/api/quick-wins/${qw}/programacoes/${p}`, { nome: 'tentativa' }],
    ['executar_programacao_do_alvo', 'POST', `/api/quick-wins/${qw}/programacoes/${p}/executar`, {}],
    ['estado_programacao_do_alvo', 'POST', `/api/quick-wins/${qw}/programacoes/${p}/estado`, { ativa: false }],
    ['conversa_programada_do_alvo', 'GET', `/api/conversas/${execucao.conversa_id || 2}`],
    ['conversa_id_igual', 'GET', `/api/conversas/${prep.conversa}`],
    ['documento_id_igual', 'GET', `/api/bases/documentos/${prep.documento}/conteudo`],
    ['quick_win_id_igual', 'GET', `/api/quick-wins/${qw}`],
    ['versoes_id_igual', 'GET', `/api/quick-wins/${qw}/versoes`],
    ['eventos', 'GET', '/api/admin/eventos?prefixo=quickwin.'],
    ['uso', 'GET', '/api/admin/uso'],
    ['plataforma', 'GET', '/api/plataforma/empresas'],
  ]) out.proprioContexto.push(await testar(...x));

  // 2) Trocar o contexto para o endereço do alvo com a MESMA sessão.
  await c.pedir('GET', `/${alvo}/entrar`, undefined, 'manual');
  for (const x of [
    ['eu', 'GET', '/api/eu'],
    ['conversas', 'GET', '/api/conversas'],
    ['conversa', 'GET', `/api/conversas/${prep.conversa}`],
    ['nova_conversa', 'POST', '/api/conversas', {}],
    ['mensagem', 'POST', `/api/conversas/${prep.conversa}/mensagens`, { texto: 'tentativa' }],
    ['documentos', 'GET', '/api/bases/documentos'],
    ['documento', 'GET', `/api/bases/documentos/${prep.documento}/conteudo`],
    ['quick_wins', 'GET', '/api/quick-wins'],
    ['quick_win', 'GET', `/api/quick-wins/${qw}`],
    ['programacoes', 'GET', `/api/quick-wins/${qw}/programacoes`],
    ['executar', 'POST', `/api/quick-wins/${qw}/programacoes/${p}/executar`, {}],
    ['areas', 'GET', '/api/admin/areas'],
    ['eventos', 'GET', '/api/admin/eventos'],
    ['uso', 'GET', '/api/admin/uso'],
    ['integracoes', 'GET', '/api/admin/integracoes'],
  ]) out.contextoDoAlvo.push(await testar(...x));

  // 3) Sem sessão nenhuma, no contexto do alvo.
  const base = c.BASE;
  const r0 = await fetch(`${base}/${alvo}/entrar`, { redirect: 'manual' });
  const ctx = (r0.headers.getSetCookie?.() || []).map(s => s.split(';')[0]).join('; ');
  for (const [rot, cam] of [['eu', '/api/eu'], ['conversa', `/api/conversas/${prep.conversa}`], ['documento', `/api/bases/documentos/${prep.documento}/conteudo`], ['quick_win', `/api/quick-wins/${qw}`]]) {
    const r = await fetch(base + cam, { headers: { cookie: ctx } }); const t = await r.text();
    if (marca && t.includes(marca)) vazou.push(`sem_sessao_${rot}`);
    out.semSessao.push([rot, cam, r.status]);
  }

  // Volta ao próprio contexto e confere que a sessão própria continua.
  await c.pedir('GET', `/${proprio}/entrar`, undefined, 'manual');
  out.voltaAoProprio = (await c.pedir('GET', '/api/eu')).status;
  out.marcaDoAlvoEncontradaEm = vazou;
  out.resultado = vazou.length ? 'EXPOSICAO' : 'sem_exposicao';
  c.salvar(`homolog-cruzado-${alvo}`, out);
  c.log(JSON.stringify(out));
}
