// Quick Wins 2.0: estruturação do objetivo (quais colunas a pessoa pediu), com uma chamada de IA na criação.
// Chamada pequena, pela classe rápida, pelos mesmos mecanismos de governança do envio (sem alterar nenhum deles):
// política de uso, limites e teto, plano, filtro de credenciais e dados, proteção reforçada da área, roteamento,
// conferência final do recurso, defesa final de credenciais, registro da decisão e do consumo.
// Por cautela, conteúdo que a política manda proteger (ou Quick Win sigiloso) NÃO vai para a IA aqui: a pessoa
// define as colunas na tela. Qualquer falha devolve { falhou: true } e nunca bloqueia a criação.
// Uma estrutura já calculada para o mesmo objetivo (chave) é reaproveitada: nenhuma chamada nova.
import { exec, json } from './db.js';
import { lerConfig } from './config.js';
import { registrar } from './eventos.js';
import { contemCredencial, decidir, detectar, detectarReforcado, NIVEL_DO_TIPO } from './filtro.js';
import { acharModelo, AUTO, modeloPermitido } from './modelos.js';
import { checarPlano, verificarAvisos } from './plano.js';
import { cienciaPendente } from './politica.js';
import { avaliarProcessamentoSigiloso } from './sigilo.js';
import { analisarPedido, analiseIndisponivel, rotear, AUTOMATICO, VERSAO_ROTEADOR } from './roteador.js';
import { chaveObjetivo, lerEstrutura, mensagensEstrutura } from './quickwin-construtor.js';
import { erroParaLog } from './registro-seguro.js';

export const ORIGEM_ESTRUTURA = 'quick_win_estrutura';
const textoDe = msgs => msgs.map(x => (typeof x.content === 'string' ? x.content : x.content.map(p => p.text).join('\n'))).join('\n');

export async function estruturarObjetivo(app, pessoa, { descricao, qw = null }) {
  const chave = chaveObjetivo(descricao);
  const falha = motivo => { registrar(app, 'quickwin.structure_skipped', pessoa.id, { quick_win: qw?.id ?? null, motivo }); return { chave, colunas: [], falhou: true }; };
  if (!String(descricao).trim()) return { chave, colunas: [], falhou: false };
  // Mesmo objetivo já estruturado neste Quick Win: reaproveita (0 chamadas).
  const guardada = json(qw?.especificacao, null)?.origem?.estrutura_objetivo;
  if (guardada?.chave === chave) return { chave, colunas: guardada.colunas || [], falhou: !!guardada.falhou, cache: true };

  const r = await chamarGovernado(app, pessoa, { conteudo: descricao, mensagens: mensagensEstrutura(descricao), qw, origem: ORIGEM_ESTRUTURA });
  if (r.recusado) return falha(r.motivo);
  if (r.falhou) return { chave, colunas: [], falhou: true };
  const { texto, rotaId } = r;
  const e = lerEstrutura(texto, descricao);
  registrar(app, 'quickwin.structured', pessoa.id, { quick_win: qw?.id ?? null, roteamento: rotaId, colunas: e?.colunas.length ?? 0, descartadas: e?.descartadas ?? 0, legivel: !!e });
  if (!e) return { chave, colunas: [], falhou: true };
  return { chave, colunas: e.colunas, falhou: false };
}

// Chamada curta de IA na criação de um Quick Win, pela governança do envio (ver o comentário do topo). Devolve
// { texto, rotaId }, { recusado, motivo } (não saiu: nada foi enviado) ou { falhou } (o recurso falhou).
export async function chamarGovernado(app, pessoa, { conteudo, mensagens, qw = null, origem }) {
  const recusa = motivo => ({ recusado: true, motivo });
  const cfg = lerConfig(app.db);
  if (cienciaPendente(app, pessoa)) return recusa('ciencia_pendente');
  let plano;
  try { await app.limites?.checar(pessoa, cfg); plano = checarPlano(app); } catch (e) { return recusa(e.codigo || 'limite'); }
  // Na reserva do plano, nada de chamada extra (como no Quality Check).
  if (plano?.fase === 'reserva') return recusa('plano_na_reserva');

  // Filtro de dados, pela política da empresa. Bloqueado ou protegido: não sai.
  const tipos = detectar(conteudo);
  const { bloqueados, protegidos, normais } = decidir(tipos, cfg.acoesChat);
  if (bloqueados.length || protegidos.length) return recusa('dados');
  const areas = qw ? app.db.prepare('select a.sigilosa from quick_win_areas q join areas a on a.id = q.area_id where q.quick_win_id = ?').all(qw.id).map(a => a.sigilosa) : pessoa.areas.map(a => a.sigilosa);
  const reforcada = areas.some(Boolean);
  if (reforcada && detectarReforcado(conteudo).includes('marcacao')) return recusa('dados');
  if (qw?.sigiloso || app.contexto?.arquivosSigilosos?.(qw)) return recusa('sigilo');
  const dadosPessoais = cfg.protecaoDadosPessoais !== false && normais.some(t => NIVEL_DO_TIPO[t] >= 2);

  if (contemCredencial(textoDe(mensagens))) return recusa('credencial');
  const entrada = { texto: conteudo, anexos: [], historicoChars: 0, contextoChars: 0, sistemaChars: String(mensagens[0]?.content || '').length, temResposta: false, anterior: null, feedback: null };
  let analise;
  try { analise = (app.analisarPedido || analisarPedido)(entrada); } catch { analise = analiseIndisponivel(entrada); }
  // Classe rápida, se a pessoa tiver acesso e ela atender à proteção que o conteúdo exige; senão, o roteamento
  // automático escolhe entre os recursos que as regras permitem (como numa escolha substituída no envio).
  let manual = null;
  try {
    manual = modeloPermitido(app.db, cfg, pessoa, 'classe:rapido');
    if ((reforcada || dadosPessoais) && (manual.id === AUTO || (manual.protecao ?? 0) < 2)) manual = null;
  } catch (e) { if (!e.codigo) throw e; manual = null; }
  if (!manual && cfg.roteamento?.ativo === false) return recusa('sem_modelo');
  const rota = rotear({ db: app.db, cfg, pessoa, qw: null, sigilosa: false, reforcada, dadosPessoais, reservaDoPlano: false, pedido: manual ? 'classe:rapido' : AUTOMATICO, analise, modeloManual: manual, origem });
  const m = rota.modelo;
  const agora = () => app.agora().toISOString();
  const rotaId = Number(exec(app.db, `insert into roteamento (em, pessoa_id, quick_win_id, modo, complexidade, pontuacao, tipos, precisao, sinais, classe_necessaria, modelo, classe,
    politicas, candidatos, tokens_entrada, tokens_saida, custo_estimado, custo_referencia, explicacao, versao, origem, classe_pedida, preferencia, requisitos, motivo_escolha, fallback, reserva, resultado)
    values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    agora(), pessoa.id, qw?.id ?? null, rota.modo, rota.requisitos.complexidade, rota.requisitos.nivel, JSON.stringify(analise.tipos), JSON.stringify(analise.precisao), JSON.stringify(analise.sinais),
    rota.requisitos.classe, m?.id || null, m && m.id !== AUTO ? m.perfil || null : null, JSON.stringify(rota.politicas), JSON.stringify(rota.candidatos), analise.tokensEntrada, analise.tokensSaida,
    rota.custoEstimado, rota.custoReferencia, rota.explicacao, VERSAO_ROTEADOR, origem, manual ? 'rapido' : 'auto', rota.preferencia,
    JSON.stringify({ nivel: rota.requisitos.nivel, dimensoes: rota.requisitos.dimensoes, motivos: rota.requisitos.motivos, determinantes: rota.requisitos.determinantes }),
    rota.motivoEscolha, rota.fallback ? JSON.stringify(rota.fallback) : null, rota.reserva || null, m ? 'enviado' : 'bloqueado').lastInsertRowid);
  if (!m) return recusa('sem_modelo');
  // Conferência final do recurso, pela mesma camada central, na hora do envio.
  const cfgAgora = lerConfig(app.db);
  if (!acharModelo(app.db, cfgAgora, m.id)?.liberado || !avaliarProcessamentoSigiloso({ cfg: cfgAgora, sigilosa: false }).permitido) {
    exec(app.db, "update roteamento set resultado = 'bloqueado', motivo_bloqueio = 'guardrail_na_conferencia_final' where id = ?", rotaId);
    return recusa('conferencia_final');
  }
  const inicio = Date.now();
  let texto = '', fim = null;
  try {
    for await (const ev of app.ia.enviar(mensagens, { modelo: m.id, reserva: rota.reserva, sigilosa: false, semTreino: cfg.exigirSemTreino || reforcada || dadosPessoais })) {
      if (ev.tipo === 'texto') texto += ev.texto; else fim = ev;
    }
  } catch (e) {
    exec(app.db, "update roteamento set resultado = 'falha_na_execucao', ms_total = ? where id = ?", Date.now() - inicio, rotaId);
    registrar(app, 'ai.failed', pessoa.id, { origem, quick_win: qw?.id ?? null, modelo: m.id, roteamento: rotaId, erro: erroParaLog(e) });
    return { falhou: true, motivo: 'falha_na_execucao' };
  }
  // Consumo contabilizado como qualquer resposta: registro da decisão, uso e evento de créditos (sem conteúdo).
  const ms = Date.now() - inicio, usado = fim?.modelo || m.id;
  exec(app.db, "update roteamento set modelo_usado = ?, custo_real = ?, resultado = ?, ms_total = ? where id = ?", usado, fim?.custo || 0, usado === m.id ? 'respondido' : 'respondido_pela_reserva', ms, rotaId);
  exec(app.db, 'insert into uso (em, pessoa_id, conversa_id, quick_win_id, modelo_pedido, modelo_usado, fornecedor, custo, economia, ms, sigilosa, teste) values (?, ?, null, ?, ?, ?, ?, ?, ?, ?, 0, 0)',
    agora(), pessoa.id, qw?.id ?? null, m.id, usado, fim?.fornecedor || null, fim?.custo || 0, fim?.economia || 0, ms);
  registrar(app, 'credits.consumed', pessoa.id, { origem, quick_win: qw?.id ?? null, classe: m.perfil, modelo_usado: usado, custo: fim?.custo || 0 });
  verificarAvisos(app).catch(e => app.log?.('avisos do plano', e.message));
  return { texto, rotaId };
}
