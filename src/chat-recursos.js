// Recursos da própria GreenIA que a conversa livre usa no lugar de "código caseiro" (achados da auditoria em
// produção: pedir um agente ou uma automação gerava um sistema em Node.js; pedir novidades recentes respondia que
// não havia acesso à internet).
//  - Agente reutilizável = Quick Win; automação recorrente = Quick Win com programação. A resposta traz o Quick Win
//    sugerido (nome e descrição) e a tela oferece "Criar este Quick Win" com o assistente já preenchido.
//  - Pesquisa na internet: a mesma ferramenta e a mesma liberação dos Quick Wins (Configurações › Políticas), com a
//    mensagem da pessoa como consulta. Desligada ou barrada pela governança, a resposta diz o motivo e não inventa.
import { pedePesquisaWeb, proibePesquisaWeb } from './quickwin-operacao.js';
import { pedidoAfirmativo } from './pedido-afirmativo.js';
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const AGENTE = /\b(agente|agentes|assistente (virtual|automatico|que)|robo que|bot que)\b/;
const AUTOMACAO = /\b(automacao|automacoes|automatize|automatizar|rotina automatica|toda (segunda|terca|quarta|quinta|sexta|sabado|domingo|semana|manha|tarde|noite)|todo (dia|mes|inicio)|todos os dias|diariamente|semanalmente|mensalmente|periodicamente)\b/;
const CRIAR = /\b(cri[ae]\w*|mont\w*|configur\w*|fa[cç]a|fazer|quero|preciso|desenvolv\w*|program\w*|agend\w*|gere|gerar)\b/;
export function pedeAgente(texto) {
  const t = norm(texto);
  if (!CRIAR.test(t)) return null;
  if (AUTOMACAO.test(t) && !/\b(explique|o que e|como funciona)\b/.test(t)) return 'automacao';
  return AGENTE.test(t) ? 'agente' : null;
}
export const NOTA_AGENTE = tipo => `\nNa GreenIA, um agente reutilizável é um Quick Win${tipo === 'automacao' ? ', e uma automação recorrente é um Quick Win publicado com uma programação (por exemplo, toda segunda-feira às 8h), que roda sozinha e entrega o resultado' : ''}. Não escreva código, scripts, integrações nem passos em ferramentas externas para isso. Entregue: (1) um resumo curto do que o agente fará; (2) uma seção "## Quick Win sugerido" com uma linha "Nome: <nome curto>" e uma linha "Descrição: <até 900 caracteres: objetivo, o que recebe, o passo a passo, o formato do resultado e o que perguntar quando faltar informação>"; ${tipo === 'automacao' ? '(3) como programar: no Quick Win publicado, "Programar", com o dia, o horário e quem recebe; ' : ''}e diga que o botão "Criar este Quick Win", logo abaixo da resposta, abre o assistente já preenchido. O Quick Win usa só o que a GreenIA tem: a pesquisa na internet da empresa (quando liberada), os anexos e as bases de conhecimento, o próprio resultado na conversa e o aviso ao responsável. Na descrição, não cite APIs, chaves de acesso, Slack, planilhas externas, RSS ou outras ferramentas de terceiros, a menos que a pessoa tenha pedido, e não invente números, estudos ou benchmarks.`;

// "Quick Win sugerido" da resposta: { nome, descricao } para pré-preencher o assistente.
export function quickWinSugerido(texto) {
  const ls = String(texto || '').replace(/\r/g, '').split('\n');
  const i = ls.findIndex(l => /^\s*#{1,4}\s*\**\s*quick win sugerido/i.test(l));
  if (i < 0) return null;
  const fim = ls.findIndex((l, j) => j > i && /^\s*#{1,2}\s+/.test(l));
  const secao = ls.slice(i + 1, fim < 0 ? undefined : fim).join('\n');
  const nome = /^\s*[-*]?\s*\**nome\**\s*:\s*\**\s*(.+?)\**\s*$/im.exec(secao)?.[1]?.trim();
  const desc = /^\s*[-*]?\s*\**descri[cç][aã]o\**\s*:\s*([\s\S]+)$/im.exec(secao)?.[1]?.replace(/\*\*/g, '').trim();
  if (!nome || !desc) return null;
  return { nome: nome.slice(0, 80), descricao: desc.slice(0, 1000) };
}

// Datas de execução ("escreva um email hoje") não são pedidos de consulta externa.
// Criar uma automação que pesquisará depois também não autoriza pesquisar agora.
const PESQUISA = /\b(busque|buscar na (internet|web)|procure na (internet|web)|ultimas? noticias|novidades (recentes|da semana|do mes)|fontes oficiais|consulte a documentacao|o que (mudou|ha de novo))\b/;
export function pedePesquisa(texto) {
  if (pedeAgente(texto) || proibePesquisaWeb(texto)) return false;
  const t = pedidoAfirmativo(texto);
  const semDatas = t.replace(/\b(?:esta semana|nesta semana|este mes|neste mes|hoje|atualmente)\b/g, ' ');
  return pedePesquisaWeb(semDatas) || PESQUISA.test(t);
}
// Uma menção a "hoje" num e-mail não exige consulta externa. Já um pedido explícito
// de pesquisa não pode ser substituído por conhecimento geral sem escolha da pessoa.
export const exigePesquisa = texto => !pedeAgente(texto) && !proibePesquisaWeb(texto)
  && /\b(pesquise|pesquisar|busque|procure na (internet|web)|consulte (a documentacao|as fontes|fontes oficiais)|confira (as fontes|fontes oficiais))\b/.test(norm(texto));
// Liberação da pesquisa na conversa: as mesmas regras da pesquisa dos Quick Wins.
export function decisaoPesquisa(cfg, { sigilosa, areaReforcada, protegidos, reserva }) {
  if (!cfg.pesquisaWeb?.ativa) return { pode: false, codigo: 'nao_liberada' };
  if (sigilosa) return { pode: false, codigo: 'sigilosa' };
  if (areaReforcada) return { pode: false, codigo: 'area_reforcada' };
  if (protegidos) return { pode: false, codigo: 'dados_protegidos' };
  if (reserva) return { pode: false, codigo: 'reserva_do_plano' };
  return { pode: true };
}
export const NOTA_PESQUISA = (d, motivo) => d.pode
  ? '\nEsta resposta usa pesquisa na internet (os resultados chegam junto). Use só o que as fontes trazem, cite a fonte e a data de cada informação, diferencie anúncio de recurso já disponível e diga com clareza o que não foi encontrado. Não diga que não tem acesso à internet.'
  : `\nA pesquisa na internet não foi usada nesta resposta porque ${motivo}. Diga isso em uma frase no início, sem inventar notícias, datas ou números recentes; entregue o que for possível com o conhecimento geral, deixando claro até quando ele vai${d.codigo === 'nao_liberada' ? ', e diga que o administrador da empresa pode liberar a pesquisa em Configurações › Políticas' : ''}.`;
