// Bateria de produção das fontes e da imagem final (10 Quick Wins "QA - ", material fictício, nenhum site privado).
// Uso: rodar fontes2 [lista de casos separados por vírgula]   (padrão: todos)
// Cada caso registra o que foi pedido, o que veio (situação da conferência, fontes usadas, avisos, artefatos) e um
// veredito objetivo. Não muda o caso para fazer passar.
import { readFileSync } from 'node:fs';
import { pdf, xlsx } from '../../test/arquivos.js';

const b64 = b => Buffer.from(b).toString('base64');
const txt = s => b64(Buffer.from(s, 'utf8'));
const textoDe = r => r.linhas.filter(l => l.t === 'texto').map(l => l.v).join('');
const fimDe = r => r.linhas.find(l => l.t === 'fim') || {};
const LINK_KB = 'https://www.rfc-editor.org/rfc/rfc2606.txt';            // página pública e estável (RFC dos domínios reservados)
const LINK_404 = 'https://www.rfc-editor.org/rfc/qa-nao-existe-greenia.txt';
const fixture = n => readFileSync(new URL(`../../test/fixtures/${n}`, import.meta.url));

export default async function (c, quais = '') {
  const { criarQw } = await import(`./bateria.mjs?v=${Date.now()}`);
  const so = String(quais || '').split(',').map(Number).filter(Boolean);
  // Área sem proteção reforçada para a imagem final (a reforçada bloqueia geração de imagem por governança).
  const areas = (await c.api('GET', '/api/admin/areas')).dados;
  const lista = Array.isArray(areas) ? areas : areas?.areas || [];
  const minhas = (c.eu.quickWins?.areas || []).map(a => a.id);
  const livre = lista.find(a => minhas.includes(a.id) && !a.sigilosa && a.ativa !== 0);
  const destinoPadrao = minhas.length ? { areas: [minhas[0]] } : { toda_empresa: true };
  const out = c.estado.fontes2 ||= {};
  const exec = async (qwId, corpo, { teste = true } = {}) => {
    const conv = (await c.api('POST', '/api/conversas', { quick_win_id: qwId, teste })).dados.conversa.id;
    (c.estado.conversas[qwId] ||= []).push(conv);
    const r = await c.enviar(conv, { executar_quick_win: true, ...corpo });
    const f = fimDe(r), q = f.qualidade || {};
    return { conv, status: r.status, ms: r.ms, erro: r.erro || null, q: q.status || null, avisos: q.avisos || [], problemas: q.problemas || [], fontes: q.fontes || null,
      artefatos: (f.artefatos || []).map(a => ({ id: a.id, tipo: a.tipo, status: a.status, formato: a.formato, exportacoes: a.exportacoes, imagem_final: a.imagem_final || null, avisos: a.avisos })),
      texto: textoDe(r) };
  };
  const caso = async (n, nome, fn) => {
    if (so.length && !so.includes(n)) return;
    const t0 = Date.now();
    try { out[n] = { nome: `QA - ${nome}`, ...(await fn()), ms: Date.now() - t0 }; }
    catch (e) { out[n] = { nome: `QA - ${nome}`, erro_script: String(e?.message || e).slice(0, 300), ms: Date.now() - t0 }; }
    const o = out[n];
    c.arquivo(`fontes2-${n}.md`, `# ${o.nome}\n\n${'```json'}\n${JSON.stringify({ ...o, texto: undefined }, null, 2)}\n${'```'}\n\n${o.texto || ''}`);
    c.log(`${n}. ${o.nome}: ${o.veredito || o.erro_script} (${o.q || '-'}) ${o.ms}ms`);
  };
  const novo = async (nome, descricao, destino = destinoPadrao) => {
    c.destino = destino;
    const r = await criarQw(c, { nome, descricao });
    if (!r.qw) throw new Error(`criação falhou: ${JSON.stringify(r.reg).slice(0, 200)}`);
    (c.estado.fontes2Qw ||= {})[nome] = r.qw.id;
    return r.qw;
  };
  const fontesDe = async id => (await c.api('GET', `/api/quick-wins/${id}/fontes`)).dados?.fontes || [];
  const usou = (e, re) => (e.fontes?.usadas || []).some(u => re.test(u.titulo));
  const ok = e => ['aprovado', 'corrigido'].includes(e.q);

  await caso(1, 'Documento com PDF obrigatório', async () => {
    const q = await novo('Documento com PDF obrigatório', 'Responda dúvidas da equipe sobre o regulamento interno de horas extras, citando o item do regulamento.');
    const up = await c.api('POST', `/api/quick-wins/${q.id}/arquivos`, { arquivo: { nome: 'regulamento-horas-extras-qa.pdf', base64: b64(pdf(['REGULAMENTO DE HORAS EXTRAS QA (fictício)', 'Item 3.1: o limite é de 22 horas extras por mês.', 'Item 3.2: horas extras aos domingos exigem autorização do gerente da área.', 'Item 3.3: o banco de horas vence em 90 dias.'])) }, titulo: 'Regulamento de horas extras QA', papel: 'REQUIRED_SOURCE' });
    const e = await exec(q.id, { texto: 'Qual é o limite mensal de horas extras e em quanto tempo vence o banco de horas?' });
    const certo = /(22|vinte e duas) horas/i.test(e.texto) && /(90|noventa) dias/i.test(e.texto);   // número em algarismo ou por extenso
    return { upload: up.status, fontes_qw: (await fontesDe(q.id)).map(f => [f.tipo, f.papel, f.status]), ...e, certo, citou: /Fonte:|Item 3\.[13]/.test(e.texto),
      veredito: up.status === 200 && certo && ok(e) && usou(e, /horas extras/i) ? 'OK' : 'FALHA' };
  });

  await caso(2, 'Planilha como fonte', async () => {
    const q = await novo('Planilha como fonte', 'Responda perguntas sobre a tabela de preços de frete da empresa.');
    const up = await c.api('POST', `/api/quick-wins/${q.id}/arquivos`, { arquivo: { nome: 'tabela-frete-qa.xlsx', base64: b64(xlsx([['Destino', 'Prazo (dias)', 'Preço por kg'], ['Curitiba', 3, 'R$ 4,70'], ['Recife', 7, 'R$ 9,10'], ['Manaus', 12, 'R$ 13,40']])) }, titulo: 'Tabela de frete QA', papel: 'KNOWLEDGE_BASE' });
    const e = await exec(q.id, { texto: 'Qual o prazo e o preço por kg para Recife? E qual destino é o mais caro?' });
    const certo = /7 dias/.test(e.texto) && /9,10/.test(e.texto) && /Manaus/.test(e.texto);
    return { upload: up.status, ...e, certo, veredito: up.status === 200 && certo && ok(e) ? 'OK' : 'FALHA' };
  });

  await caso(3, 'Link como conhecimento', async () => {
    const q = await novo('Link como conhecimento', 'Responda dúvidas técnicas da equipe com base no documento de referência indicado.');
    const l = await c.api('POST', `/api/quick-wins/${q.id}/fontes/link`, { url: LINK_KB, papel: 'KNOWLEDGE_BASE' });
    const e = await exec(q.id, { texto: 'Quais nomes de domínio de topo o documento reserva para testes e exemplos?' });
    const certo = ['test', 'example', 'invalid', 'localhost'].filter(t => new RegExp(`\\.?${t}\\b`, 'i').test(e.texto)).length >= 3;
    return { link: { status: l.status, fonte: l.dados?.fonte ? { status: l.dados.fonte.status, url: l.dados.fonte.url, erro: l.dados.fonte.erro } : l.dados }, ...e, certo,
      veredito: l.dados?.fonte?.status === 'READY' && certo && ok(e) ? 'OK' : 'FALHA' };
  });

  await caso(4, 'Referência visual', async () => {
    const q = await novo('Referência visual', 'Escreva o comunicado mensal de resultados da equipe de manutenção a partir dos números enviados.');
    const ref = await c.api('POST', `/api/quick-wins/${q.id}/arquivos`, { arquivo: { nome: 'modelo-comunicado-qa.txt', base64: txt('MODELO DE COMUNICADO (referência de estilo, fictício)\nTítulo curto em caixa alta. Abertura com uma frase de reconhecimento.\nNo modelo: Cliente Fictício Ômega, 4.321 ordens de serviço, economia de R$ 98.765.\nFechamento com um agradecimento e a próxima meta.') }, titulo: 'Modelo de comunicado QA', papel: 'REFERENCE' });
    const img = await c.api('POST', `/api/quick-wins/${q.id}/arquivos`, { arquivo: { nome: 'referencia-visual-qa.png', base64: b64(fixture('grafico.png')) }, titulo: 'Referência visual QA', papel: 'REFERENCE' });
    const e = await exec(q.id, { texto: 'Números de setembro (fictícios): 312 ordens de serviço concluídas, 96% no prazo, 2 paradas não programadas.' });
    const copiou = /4\.?321|98\.?765|Ômega/.test(e.texto);
    return { upload: [ref.status, img.status], ...e, copiou_da_referencia: copiou, usou_numeros_do_dia: /312/.test(e.texto) && /96\s?%/.test(e.texto),
      veredito: ref.status === 200 && !copiou && /312/.test(e.texto) && ok(e) ? 'OK' : 'FALHA' };
  });

  await caso(5, 'Conhecimento da empresa', async () => {
    const q = await novo('Conhecimento da empresa', 'Responda dúvidas da equipe usando o conhecimento da empresa.');
    const b = await c.api('PUT', `/api/quick-wins/${q.id}/fontes/base`, { papel: 'KNOWLEDGE_BASE' });
    const docs = (await c.api('GET', '/api/conhecimento')).dados?.documentos || [];
    const e = await exec(q.id, { texto: docs.length ? `Resuma em 3 tópicos o que a empresa diz no documento "${docs[0].titulo}".` : 'O que a empresa faz?' });
    return { base: { status: b.status, papel: b.dados?.fontes?.find(f => f.tipo === 'company_knowledge')?.papel || null }, documentos_visiveis: docs.length, ...e,
      veredito: b.status === 200 && e.status === 200 && (docs.length ? ok(e) && (e.fontes?.usadas || []).some(u => u.tipo === 'company_knowledge') : e.q !== null) ? 'OK' : docs.length ? 'FALHA' : 'SEM_BASE' };
  });

  await caso(6, 'Fonte opcional ausente', async () => {
    const q = await novo('Fonte opcional ausente', 'Resuma o pedido de compra recebido em tópicos curtos.');
    const l = await c.api('POST', `/api/quick-wins/${q.id}/fontes/link`, { url: LINK_404, papel: 'SUPPLEMENTARY' });
    const e = await exec(q.id, { texto: 'Pedido de compra 7781 (fictício): 40 luvas nitrílicas, 12 óculos de proteção, entrega em 10 dias.' });
    // Mesma fonte como obrigatória: o resultado não pode sair aprovado.
    const f = (await fontesDe(q.id)).find(x => x.tipo === 'url');
    const p = f ? await c.api('PUT', `/api/quick-wins/${q.id}/fontes/${f.documento_id}`, { papel: 'REQUIRED_SOURCE' }) : null;
    const e2 = await exec(q.id, { texto: 'Pedido de compra 7782 (fictício): 8 capacetes, entrega em 5 dias.' });
    return { link: { status: l.status, situacao: l.dados?.fonte?.status, erro: l.dados?.fonte?.erro }, opcional: { ...e, texto: undefined }, ...e,
      obrigatoria: { papel: p?.status, q: e2.q, avisos: e2.avisos },
      veredito: l.dados?.fonte?.status === 'FAILED' && ok(e) && e2.q === 'parcial' && e2.avisos.some(a => /fonte obrigatória/i.test(a)) ? 'OK' : 'FALHA' };
  });

  await caso(7, 'Imagem final', async () => {
    const destino = livre ? { areas: [livre.id] } : destinoPadrao;
    const q = await novo('Imagem final', 'Gere a imagem final de um post quadrado anunciando o novo horário de atendimento da loja.', destino);
    const espec = (await c.api('GET', `/api/quick-wins/${q.id}`)).dados;
    const e = await exec(q.id, { texto: 'Novo horário (fictício): segunda a sábado, das 8h às 20h, a partir de 1º de novembro.' });
    const a = e.artefatos.find(x => x.tipo === 'image');
    const baixar = {};
    if (a) for (const f of ['png', 'jpg']) { const r = await c.binario(`/api/artefatos/${a.id}/baixar?formato=${f}`); baixar[f] = { status: r.status, tipo: r.tipo, bytes: r.dados?.length || null }; }
    let regen = null;
    if (a?.imagem_final?.gerada) { const g = await c.api('POST', `/api/artefatos/${a.id}/gerar-imagem`, { variacao: true }); regen = { status: g.status, versao: g.dados?.artefato?.versao, gerada: g.dados?.artefato?.imagem_final?.gerada, erro: g.status !== 200 ? g.dados : null }; }
    return { area_sem_reforco: !!livre, entregaveis: (espec.entregaveis || espec.operacao?.entregaveis || []).map?.(x => x.tipo) || null, ...e, artefato: a || null, baixar, regen,
      veredito: a && a.imagem_final?.gerada && baixar.png?.status === 200 && baixar.jpg?.status === 200 ? 'OK' : a && a.imagem_final && !a.imagem_final.gerada && e.q === 'parcial' ? 'PARCIAL_SEM_GERADOR' : 'FALHA' };
  });

  await caso(8, 'Imagem briefing', async () => {
    const q = await novo('Imagem briefing', 'Prepare o briefing da imagem do post de Natal para o designer produzir: direção visual, texto da peça e chamada.');
    const e = await exec(q.id, { texto: 'Campanha de Natal (fictícia): tema "Natal sustentável", tom acolhedor, chamada "Visite nossa loja".' });
    const semImagemGerada = !e.artefatos.some(a => a.tipo === 'image');
    return { ...e, sem_imagem_final: semImagemGerada, tem_briefing: /briefing|dire[cç][aã]o visual/i.test(e.texto), veredito: semImagemGerada && /briefing|dire[cç][aã]o visual/i.test(e.texto) && e.status === 200 ? 'OK' : 'FALHA' };
  });

  await caso(9, 'Fonte alterada após versão', async () => {
    const q = await novo('Fonte alterada após versão', 'Informe à equipe o valor da diária de alimentação conforme a tabela de diárias.');
    await c.api('POST', `/api/quick-wins/${q.id}/arquivos`, { arquivo: { nome: 'diarias-qa.txt', base64: txt('TABELA DE DIÁRIAS QA (fictícia)\nDiária de alimentação: R$ 95 por dia.') }, titulo: 'Tabela de diárias QA', papel: 'REQUIRED_SOURCE' });
    const pub = await c.api('POST', `/api/quick-wins/${q.id}/publicar`, {});
    const e1 = await exec(q.id, { texto: 'Qual a diária de alimentação?' }, { teste: false });
    const f = (await fontesDe(q.id)).find(x => x.tipo === 'file');
    const sub = await c.api('PUT', `/api/quick-wins/${q.id}/fontes/${f.documento_id}`, { arquivo: { nome: 'diarias-qa.txt', base64: txt('TABELA DE DIÁRIAS QA (fictícia, revisada)\nDiária de alimentação: R$ 120 por dia.') } });
    const e2 = await exec(q.id, { texto: 'Qual a diária de alimentação agora?' }, { teste: false });
    const versoes = (await c.api('GET', `/api/quick-wins/${q.id}/versoes`)).dados;
    return { publicar: pub.status, antes: { q: e1.q, valor95: /95/.test(e1.texto) }, substituir: sub.status, versao_fonte: sub.dados?.fontes?.find(x => x.tipo === 'file')?.versao, ...e2, valor120: /120/.test(e2.texto),
      aviso_mudou: e2.avisos.some(a => /fontes mudaram desde a versão/.test(a)), versoes: versoes?.versoes?.length,
      veredito: pub.status === 200 && /95/.test(e1.texto) && /120/.test(e2.texto) && e2.avisos.some(a => /fontes mudaram/.test(a)) ? 'OK' : 'FALHA' };
  });

  await caso(10, 'Quick Win sem fonte', async () => {
    const q = await novo('Quick Win sem fonte', 'Transforme anotações soltas de reunião em uma lista de tarefas com responsável e prazo.');
    const fs = await fontesDe(q.id);
    const e = await exec(q.id, { texto: 'Anotações (fictícias): Ana revisa o contrato até sexta; Bruno liga para o fornecedor amanhã; Carla atualiza a planilha de estoque até dia 15.' });
    return { fontes_qw: fs.map(f => f.tipo), ...e, veredito: ok(e) && /Ana/.test(e.texto) && /Carla/.test(e.texto) ? 'OK' : 'FALHA' };
  });

  // Conversa: link enviado na mensagem, comando de papel e link interno bloqueado (sem criar Quick Win novo).
  if (!so.length || so.includes(11)) {
    // A pergunta é sobre o documento do link: vai para o Quick Win de dúvidas com base em documento (caso 3).
    // (Na 1ª passada ia para o Quick Win de lista de tarefas, que não tem relação com a pergunta: erro do roteiro.)
    const id = c.estado.fontes2Qw?.['Link como conhecimento'] || c.estado.criados.quick_wins.at(-1);
    const conv = (await c.api('POST', '/api/conversas', { quick_win_id: id, teste: true })).dados.conversa.id;
    (c.estado.conversas[id] ||= []).push(conv);
    const r = await c.enviar(conv, { executar_quick_win: true, texto: 'Use o link como fonte principal e diga quais domínios ele reserva.', links: [{ url: LINK_KB, papel: 'REQUIRED_SOURCE' }, 'https://169.254.169.254/latest/meta-data'] });
    const f = fimDe(r);
    const r2 = await c.enviar(conv, { texto: 'considere este link apenas como referência' });
    out[11] = { nome: 'conversa com link (QA - Link como conhecimento)', status: r.status, q: f.qualidade?.status, leu: /\.test|\.example|\.invalid/i.test(textoDe(r)), aviso_bloqueio: (f.qualidade?.avisos || []).filter(a => /não pôde ser lido/.test(a)), comando: r2.status,
      veredito: r.status === 200 && ['aprovado', 'corrigido'].includes(f.qualidade?.status) && /\.test|\.example/i.test(textoDe(r)) && (f.qualidade?.avisos || []).some(a => /169\.254/.test(a)) ? 'OK' : 'FALHA', problemas: f.qualidade?.problemas || [] };
    c.log(`11. conversa com link: ${out[11].veredito} (${out[11].q})`);
  }
  c.salvar('20-fontes2', out);
}
