// Fontes e imagem final (situação atual, antes de qualquer mudança): arquivo do Quick Win como base, anexo na
// execução, link na mensagem, e pedido de imagem final.
const textoDe = r => r.linhas.filter(l => l.t === 'texto').map(l => l.v).join('');
const b64 = s => Buffer.from(s, 'utf8').toString('base64');
export default async function (c) {
  const { criarQw, executar } = await import(`./bateria.mjs?v=${Date.now()}`);
  c.destino ||= c.eu.quickWins?.areas?.length ? { areas: [c.eu.quickWins.areas[0].id] } : { toda_empresa: true };
  const out = {};
  // 1. Arquivo do Quick Win (base de conhecimento).
  const q1 = await criarQw(c, { nome: 'Fontes arquivo', descricao: 'Responda dúvidas da equipe sobre a política de reembolso da empresa, citando a regra.' });
  const up = await c.api('POST', `/api/quick-wins/${q1.qw.id}/arquivos`, { arquivo: { nome: 'politica-reembolso-qa.txt', base64: b64('POLÍTICA DE REEMBOLSO QA (fictícia)\nRegra 4.2: o prazo de reembolso é de 17 dias corridos após a entrega do comprovante.\nRegra 4.3: despesas acima de R$ 640 precisam de aprovação do diretor.') }, titulo: 'Política de reembolso QA' });
  const e1 = await executar(c, q1.qw.id, 'Qual é o prazo de reembolso e quem aprova despesas acima de R$ 640?');
  out.arquivo_qw = { upload: up.status, usou: /17 dias/.test(textoDe(e1.bruto)), q: e1.exec.qualidade?.status, fontes: e1.bruto.linhas.find(l => l.t === 'fim')?.fontes || null };
  // 2. Anexo na execução.
  const q2 = await criarQw(c, { nome: 'Fontes anexo', descricao: 'Analise a planilha anexada e diga o total de cada região.' });
  const conv = (await c.api('POST', '/api/conversas', { quick_win_id: q2.qw.id, teste: true })).dados.conversa.id;
  const r2 = await c.enviar(conv, { executar_quick_win: true, texto: 'Segue a planilha.', anexos: [{ nome: 'vendas-qa.csv', base64: b64('regiao,valor\nNorte,1234\nSul,5678\nNorte,766\n') }] });
  out.anexo_execucao = { status: r2.status, usou: /2\.?000/.test(textoDe(r2)) && /5\.?678/.test(textoDe(r2)), erro: r2.erro || null };
  // 3. Link na mensagem.
  const q3 = await criarQw(c, { nome: 'Fontes link', descricao: 'Leia a página do link enviado e resuma o conteúdo em uma frase.' });
  const e3 = await executar(c, q3.qw.id, 'Link: https://jsonplaceholder.typicode.com/todos/1');
  out.link = { leu_pagina: /delectus aut autem/i.test(textoDe(e3.bruto)), q: e3.exec.qualidade?.status, pergunta: e3.exec.pergunta, trecho: textoDe(e3.bruto).slice(0, 300) };
  // 4. Imagem final.
  const it = await c.api('POST', '/api/quick-wins/assistente/interpretar', { descricao: 'Gere a imagem final de uma peça quadrada anunciando o novo horário de atendimento.' });
  out.imagem_final_interpretacao = (it.dados?.operacao?.entregaveis || []).map(e => ({ tipo: e.tipo, visual: e.visual || null, rotulo: e.rotulo }));
  const cat = (await c.api('GET', '/api/quick-wins/assistente/catalogo').catch(() => ({}))).dados;
  out.catalogo_tipos = cat?.entregaveis ? cat.entregaveis.map(x => x.id || x.tipo) : null;
  c.salvar('12-fontes', out); c.log(JSON.stringify(out).slice(0, 2500));
}
