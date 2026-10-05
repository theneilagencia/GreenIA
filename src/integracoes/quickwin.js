// Ponte entre a execução do Quick Win e as integrações. Só entra em ação quando o Quick Win declarou necessidades
// (operacao.integracoes) e o recurso está ligado para a pessoa; sem isso, a execução é exatamente a de sempre.
//  1. antes da IA: plano criado; leituras executadas pelo runtime; o resultado vira ANEXO (material entre marcas,
//     não instrução), que passa pelo mesmo filtro de dados, sigilo e roteamento de qualquer anexo;
//  2. depois da resposta conferida: as escritas executam com os dados que a resposta trouxe num bloco estruturado
//     (```dados_integracao```), sob a política (aprovação quando exigida). O bloco sai do texto mostrado.
import { criarPlano, executarPlano, lerPlano, resumoPlano } from './plano.js';
import { lerCapability } from './conectores.js';
import { redigir } from './segredos.js';
import { integracoesLigadas } from './rotas.js';

const BLOCO = /```dados_integracao\s*\n([\s\S]*?)\n```/i;
const camposDe = e => Object.keys(e?.properties || {}).slice(0, 20);

export const precisaIntegracao = (app, pessoa, qw) => !!qw?.espec?.operacao?.integracoes?.length && integracoesLigadas(app, pessoa);

export async function prepararExecucao(app, pessoa, { qw, conv, lookup } = {}) {
  const plano = criarPlano(app, pessoa, { quickWinId: qw.id, conversaId: conv.id, necessidades: qw.espec.operacao.integracoes });
  const r = await executarPlano(app, pessoa, plano.id, {}, { apenas: 'read', lookup });
  const p = lerPlano(app, plano.id);
  // Lista grande: o material leva o total e diz que só os primeiros itens vieram (contagem nunca pelo recorte).
  const material = v => {
    const total = Array.isArray(v) ? v.length : null;
    const json = JSON.stringify(redigir(v), null, 1);
    const cortado = (total !== null && total > 50) || json.length > 20000;
    return `${total !== null ? `Total de registros retornados pelo sistema: ${total}.${cortado ? ' Abaixo vêm só os primeiros: para contagens e totais, use o total acima; não conte pelo recorte.' : ''}\n` : cortado ? 'Resposta longa: abaixo vem só o começo.\n' : ''}${json.slice(0, 20000)}`;
  };
  const anexos = p.passos.filter(x => x.modo === 'read' && p.estado.saidas?.[x.id] !== undefined).map(x => ({
    nome: `Dados de ${x.sistema}: ${x.acao}`.slice(0, 120), texto: material(p.estado.saidas[x.id]), tipo: 'integracao',
  }));
  const escritas = p.passos.filter(x => x.modo === 'write' && x.capability_id);
  const instrucao = escritas.length ? [
    'Ações em sistemas externos: a GreenIA executa, sob a política da empresa e com aprovação quando exigida. Não diga que registrou, enviou ou alterou algo: isso aparece na tela, com o status de cada etapa.',
    'A aprovação acontece em Administração → Integrações, por uma pessoa autorizada. Depois, use Executar etapas aprovadas na conversa. Nunca peça para aprovar respondendo no chat: uma mensagem não concede aprovação.',
    `Ao final da resposta, inclua um bloco \`\`\`dados_integracao com um JSON de um objeto por etapa, só com dados do material: ${escritas.map(x => `"${x.id}" (${x.acao}): campos ${camposDe(lerCapability(app, x.capability_id)?.inputs).join(', ') || 'livres'}`).join('; ')}.`,
  ].join('\n') : '';
  return { plano: plano.id, anexos, instrucao, leituras: r };
}

export function limparResposta(resposta) {
  const m = BLOCO.exec(String(resposta || ''));
  let dados = {};
  if (m) { try { const d = JSON.parse(m[1]); if (d && typeof d === 'object' && !Array.isArray(d)) dados = d; } catch { /* bloco inválido: as escritas ficam sem dados */ } }
  return { texto: String(resposta || '').replace(BLOCO, '').trim(), dados };
}

export async function concluirExecucao(app, pessoa, { prep, dados, lookup } = {}) {
  const r = await executarPlano(app, pessoa, prep.plano, { dados, resultado: dados }, { lookup });
  return r;
}
export { resumoPlano, lerPlano };
